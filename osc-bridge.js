require('dotenv').config();
const express = require('express');
const cors = require('cors');
const osc = require('osc');
const midi = require('midi');
const dgram = require('dgram');
const https = require('https');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const { fromBuffer } = require('pdf2pic');
const Anthropic = require('@anthropic-ai/sdk');

// ── Config ────────────────────────────────────────────────────────────────────
const DM7_IP         = process.env.DM7_IP          || '192.168.1.100';
const DM7_OSC_PORT   = parseInt(process.env.DM7_OSC_PORT, 10) || 49280;
const MIDI_DEV_INDEX = parseInt(process.env.MIDI_DEVICE_INDEX, 10) || 0;
const BRIDGE_PORT    = parseInt(process.env.BRIDGE_PORT, 10) || 3000;
const ULXD_PORT           = parseInt(process.env.ULXD_PORT, 10) || 2202;
const ULXD_IPS            = (process.env.ULXD_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
const PUSHOVER_TOKEN      = process.env.PUSHOVER_TOKEN  || '';
const PUSHOVER_GROUP      = process.env.PUSHOVER_GROUP  || '';
const BATTERY_WARN_BARS     = parseInt(process.env.BATTERY_WARN_BARS,     10) || 2;
const BATTERY_CRITICAL_BARS = parseInt(process.env.BATTERY_CRITICAL_BARS, 10) || 1;
const ANTHROPIC_API_KEY     = process.env.ANTHROPIC_API_KEY || '';
const OSC_LISTEN_PORT       = parseInt(process.env.OSC_LISTEN_PORT, 10) || 3001;

// ── Multer (PDF uploads, memory storage) ─────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

// ── AI Script Analysis — system prompt ───────────────────────────────────────
const SCRIPT_SYSTEM_PROMPT = `You are an expert theatrical sound engineer and production assistant. You are analyzing a Broadway/musical theatre script to build a complete show file for StageDesk, a professional audio production tool used by A1 and A2 engineers.

Analyze the script and return ONLY valid JSON with this exact structure — no markdown, no explanation, just the JSON object:

{
  "show": {
    "title": "show title from script",
    "totalActs": 2
  },
  "characters": [
    {
      "name": "CHARACTER NAME",
      "lineCount": 47,
      "sceneCount": 8,
      "songCount": 3,
      "micRecommendation": "lead|supporting|ensemble|none",
      "suggestedChannel": 1,
      "reason": "47 lines across 8 scenes including 3 songs — principal role"
    }
  ],
  "scenes": [
    {
      "name": "Act 1 Opening",
      "act": "Act 1",
      "sceneNumber": 1,
      "type": "scene|song|transition",
      "songTitle": "Into the Woods",
      "characters": ["BAKER", "CINDERELLA"],
      "dmScene": 1,
      "notes": "Full company opening number"
    }
  ],
  "cues": [
    {
      "scene": "Act 1 · Sc1",
      "character": "Baker",
      "line": "We need to find the items...",
      "action": "unmute|mute|scene|fader|swap|note",
      "actionVal": "1",
      "urgency": "normal|warn|critical",
      "cueReason": "Baker first entry Act 1"
    }
  ],
  "swapWindows": [
    {
      "character": "Rapunzel",
      "actor": "",
      "fromScene": "Act 1 Finale",
      "toScene": "Act 2 Opening",
      "scenesOffstage": 2,
      "recommendation": "Battery swap window — 2 scenes offstage"
    }
  ],
  "flow": [
    {
      "name": "Prologue",
      "act": "Act 1",
      "type": "scene|song|intermission",
      "estTime": "2:30",
      "notes": ""
    }
  ]
}

Rules for analysis:
CHARACTERS:
- Count every spoken line per character
- Count scene appearances
- Count songs (ALL CAPS dialogue blocks = songs)
- micRecommendation logic:
  lead = top 25% by line count AND appears in 3+ scenes
  supporting = moderate lines OR key plot scenes
  ensemble = group numbers, few individual lines
  none = stage directions only, non-speaking
- Assign suggestedChannel in order of prominence (lead characters get lowest channel numbers)
- Provide a specific reason for every recommendation

SCENES:
- Extract every scene heading and act break
- Identify songs by ALL CAPS dialogue blocks
- Note which characters appear in each scene
- Assign sequential dmScene numbers starting at 1
- Add intermission as its own scene entry

CUES (generate ALL of these):
- Scene recall cue at the START of every scene (critical urgency)
- Unmute cue for EVERY character on their FIRST line in each scene
- Mute cue when a character has no more lines in a scene and stage directions indicate exit (warn urgency)
- For songs: unmute all singing characters before the first lyric (critical urgency — early warning)
- Fader cue suggestions for solos within ensemble numbers
- A2 NOTE cues for mic swaps during swap windows
- Intermission: mute all active channels (critical)
- Act 2 opening: unmute based on who opens Act 2 (critical)

SWAP WINDOWS:
- Identify every character who exits and does not return for 2+ scenes
- Flag battery swap opportunities
- Note if it's a quick change (1 scene offstage = warn)

FLOW:
- Every scene and song in order
- Estimate scene time: dialogue scenes 2-4 min, songs 2-5 min, finales 5-8 min
- Intermission always 15:00
- Include act totals

Be thorough. A real show has 50-150 cues. Generate all of them.`;

// ── In-memory rolling log (last 50 entries) ───────────────────────────────────
const _logBuffer = [];
const LOG_MAX = 50;

function _levelFromTag(tag) {
  const t = tag.toUpperCase();
  if (t === 'HTTP')  return 'HTTP';
  if (t === 'OSC')   return 'OSC';
  if (t === 'AI')    return 'AI';
  if (t === 'MIDI')  return 'MIDI';
  if (t === 'ERROR') return 'ERROR';
  return 'normal';
}

// ── Logging ───────────────────────────────────────────────────────────────────
function log(tag, msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
  console.log(`[${ts}] [${tag}] ${msg}`);
  _logBuffer.push({ timestamp: ts, level: _levelFromTag(tag), tag, message: msg });
  if (_logBuffer.length > LOG_MAX) _logBuffer.shift();
}

// ── Pushover push notifications ───────────────────────────────────────────────
// Fails silently when token/group not configured — safe to leave unset.
// Priority: 0 = normal, 1 = high (bypasses quiet hours), 2 = emergency (repeats until ack'd).

function sendPushover(title, message, priority = 0) {
  if (!PUSHOVER_TOKEN || !PUSHOVER_GROUP) {
    log('PUSH', `Skipped (not configured) — "${title}"`);
    return;
  }
  const params = { token: PUSHOVER_TOKEN, user: PUSHOVER_GROUP, title, message, priority };
  if (priority === 2) { params.retry = 60; params.expire = 3600; }

  const body    = new URLSearchParams(params).toString();
  const options = {
    hostname: 'api.pushover.net',
    path:     '/1/messages.json',
    method:   'POST',
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
  };
  const req = https.request(options, r => log('PUSH', `HTTP ${r.statusCode} — "${title}"`));
  req.on('error', err => log('PUSH', `Error: ${err.message}`));
  req.write(body);
  req.end();
  log('PUSH', `→ priority=${priority}  "${title}"  ${message}`);
}

// Per-channel debounce — don't re-notify the same channel within 5 minutes.
// Key format: "<ip>:<slot>:<tier>"  tier = 'warn' | 'critical'
const _batteryNotifyTimes = new Map();
const NOTIFY_DEBOUNCE_MS  = 5 * 60 * 1000;

function _shouldNotify(key) {
  const last = _batteryNotifyTimes.get(key);
  return !last || (Date.now() - last) >= NOTIFY_DEBOUNCE_MS;
}

function checkBatteryAndNotify(receivers) {
  receivers.forEach(receiver => {
    receiver.channels.forEach(ch => {
      if (ch.batt_bars === null) return;
      const bars = parseInt(ch.batt_bars, 10);
      const base = `${receiver.ip}:${ch.slot}`;
      const name = (ch.chan_name && ch.chan_name !== 'EMPTY') ? ch.chan_name : `slot ${ch.slot}`;

      if (bars <= BATTERY_CRITICAL_BARS) {
        const key = `${base}:critical`;
        if (_shouldNotify(key)) {
          _batteryNotifyTimes.set(key, Date.now());
          sendPushover('⚠ Dead Battery', `${name} — ${receiver.ip} slot ${ch.slot} — Replace immediately`, 2);
        }
      } else if (bars <= BATTERY_WARN_BARS) {
        const key = `${base}:warn`;
        if (_shouldNotify(key)) {
          _batteryNotifyTimes.set(key, Date.now());
          sendPushover('⚠ Low Battery', `${name} — ${receiver.ip} slot ${ch.slot} — ${bars} bars remaining`, 1);
        }
      }
    });
  });
}

// ── OSC UDP client ────────────────────────────────────────────────────────────
const udpClient = dgram.createSocket({ type: 'udp4', reuseAddr: true });

// Pending OSC get requests — keyed by OSC path, resolved when DM7 replies
const _pendingOSCGets = new Map();

udpClient.on('message', (msg) => {
  try {
    const packet = osc.readPacket(msg, {});
    if (!packet?.address) return;
    const pending = _pendingOSCGets.get(packet.address);
    if (pending) {
      clearTimeout(pending.timer);
      _pendingOSCGets.delete(packet.address);
      pending.resolve(packet.args || []);
    }
  } catch (_) {}
});

function sendOSC(path, args) {
  // args should be an array of { type, value } objects
  // Supported types: 'f' (float), 'i' (int), 's' (string)
  const oscMsg = osc.writePacket({
    address: path,
    args: args
  });
  const buf = Buffer.from(oscMsg);
  udpClient.send(buf, 0, buf.length, DM7_OSC_PORT, DM7_IP, (err) => {
    if (err) log('OSC', `Send error: ${err.message}`);
  });
  const argsStr = args.map(a => `${a.type}:${a.value}`).join(', ');
  log('OSC', `→ ${DM7_IP}:${DM7_OSC_PORT}  ${path}  [${argsStr}]`);
}

// getOSC — X32-compatible get request: send path with no args, await DM7 reply.
// Returns args array on success, null on timeout (DM7 offline).
// Sends directly without logging to avoid 64 log lines per fader poll.
function getOSC(path, timeoutMs = 300) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      _pendingOSCGets.delete(path);
      resolve(null);
    }, timeoutMs);
    _pendingOSCGets.set(path, { resolve, timer });
    const oscMsg = osc.writePacket({ address: path, args: [] });
    const buf = Buffer.from(oscMsg);
    udpClient.send(buf, 0, buf.length, DM7_OSC_PORT, DM7_IP, (err) => {
      if (err) log('OSC', `Get send error: ${err.message}`);
    });
  });
}

// ── MIDI output ───────────────────────────────────────────────────────────────
let midiOut = null;

function initMidi() {
  try {
    midiOut = new midi.Output();
    const portCount = midiOut.getPortCount();
    if (portCount === 0) {
      log('MIDI', 'No MIDI output ports found — MIDI disabled');
      midiOut = null;
      return;
    }
    log('MIDI', `Available ports (${portCount}):`);
    for (let i = 0; i < portCount; i++) {
      log('MIDI', `  [${i}] ${midiOut.getPortName(i)}`);
    }
    if (MIDI_DEV_INDEX >= portCount) {
      log('MIDI', `MIDI_DEVICE_INDEX ${MIDI_DEV_INDEX} out of range — using port 0`);
      midiOut.openPort(0);
      log('MIDI', `Opened port 0: ${midiOut.getPortName(0)}`);
    } else {
      midiOut.openPort(MIDI_DEV_INDEX);
      log('MIDI', `Opened port ${MIDI_DEV_INDEX}: ${midiOut.getPortName(MIDI_DEV_INDEX)}`);
    }
  } catch (err) {
    log('MIDI', `Init error: ${err.message} — MIDI disabled`);
    midiOut = null;
  }
}

function sendMidi(type, channel, data1, data2) {
  if (!midiOut) {
    log('MIDI', 'No MIDI device — message dropped');
    return false;
  }
  // channel is 1-indexed; MIDI status bytes are 0-indexed
  const ch = Math.max(0, Math.min(15, (channel - 1)));
  let statusByte;
  switch (type.toLowerCase()) {
    case 'noteon':       statusByte = 0x90 | ch; break;
    case 'noteoff':      statusByte = 0x80 | ch; break;
    case 'controlchange':
    case 'cc':           statusByte = 0xB0 | ch; break;
    case 'programchange':
    case 'pc':           statusByte = 0xC0 | ch; break;
    default:
      log('MIDI', `Unknown type "${type}"`);
      return false;
  }
  const msg = data2 !== undefined ? [statusByte, data1, data2] : [statusByte, data1];
  midiOut.sendMessage(msg);
  log('MIDI', `→ type=${type} ch=${channel} data=[${msg.join(', ')}]`);
  return true;
}

// ── ULXD receiver telemetry ───────────────────────────────────────────────────
// Shure ULXD protocol: UDP port 2202, ASCII commands < GET slot CMD >
// Response format: < REP slot CMD {value} >

function queryULXD(ip, slot, command, timeoutMs = 600) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const msg  = Buffer.from(`< GET ${slot} ${command} >\r\n`);
    let done   = false;

    const finish = (fn) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock.close(); } catch (_) {}
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new Error('timeout'))), timeoutMs);

    sock.on('message', buf => finish(() => resolve(buf.toString().trim())));
    sock.on('error',   err => finish(() => reject(err)));

    sock.send(msg, 0, msg.length, ULXD_PORT, ip, err => {
      if (err) finish(() => reject(err));
    });
  });
}

function parseULXDReply(reply) {
  // < REP slot CMD {value} >  or  < REP slot CMD value >
  const m = reply.match(/< REP\s+\d+\s+\w+\s+\{?([^}>]+?)\}?\s*>/);
  return m ? m[1].trim() : null;
}

async function getReceiverTelemetry(ip) {
  const slots   = [1, 2, 3, 4];
  const channels = [];
  for (const slot of slots) {
    const [battR, rfR, nameR, freqR, txR] = await Promise.all([
      queryULXD(ip, slot, 'BATT_BARS').catch(() => null),
      queryULXD(ip, slot, 'RX_RF_LVL').catch(() => null),
      queryULXD(ip, slot, 'CHAN_NAME').catch(() => null),
      queryULXD(ip, slot, 'FREQUENCY').catch(() => null),
      queryULXD(ip, slot, 'TX_TYPE').catch(() => null),
    ]);
    channels.push({
      slot,
      batt_bars: battR ? parseULXDReply(battR) : null,
      rf_level:  rfR   ? parseULXDReply(rfR)   : null,
      chan_name:  nameR ? parseULXDReply(nameR)  : null,
      frequency:  freqR ? parseULXDReply(freqR)  : null,
      tx_type:    txR   ? parseULXDReply(txR)    : null,
    });
  }
  return { ip, channels };
}

// ── Express server ────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// GET /ping — test DM7 reachability by sending a no-op OSC query
app.get('/ping', (req, res) => {
  log('HTTP', 'GET /ping');
  // DM7 responds to /xinfo (X32/DM7-compatible status query)
  // We send it and rely on the UDP fire-and-forget; we can't wait for a reply
  // without a full OSC server, so we report the send attempt as the health check.
  try {
    sendOSC('/xinfo', []);
    res.json({
      status: 'ok',
      message: `OSC ping sent to ${DM7_IP}:${DM7_OSC_PORT}`,
      dm7_ip: DM7_IP,
      dm7_osc_port: DM7_OSC_PORT,
      midi_enabled: midiOut !== null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /osc — send a single OSC message
// Body: { path: string, args: [{type, value}] }
app.post('/osc', (req, res) => {
  const { path, args } = req.body;
  log('HTTP', `POST /osc  path=${path}`);

  if (!path || typeof path !== 'string' || !path.startsWith('/')) {
    return res.status(400).json({ status: 'error', message: 'path must be a string starting with /' });
  }

  const safeArgs = Array.isArray(args) ? args : [];

  try {
    sendOSC(path, safeArgs);
    res.json({ status: 'ok', path, args: safeArgs });
  } catch (err) {
    log('OSC', `Error: ${err.message}`);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /midi — send a MIDI message
// Body: { type: 'noteOn'|'noteOff'|'cc'|'pc', channel: 1-16, data1: 0-127, data2?: 0-127 }
app.post('/midi', (req, res) => {
  const { type, channel, data1, data2 } = req.body;
  log('HTTP', `POST /midi  type=${type} ch=${channel} d1=${data1} d2=${data2}`);

  if (!type || channel === undefined || data1 === undefined) {
    return res.status(400).json({ status: 'error', message: 'Required: type, channel, data1' });
  }

  const ok = sendMidi(type, channel, data1, data2);
  if (ok) {
    res.json({ status: 'ok', type, channel, data1, data2 });
  } else {
    res.status(500).json({ status: 'error', message: 'MIDI send failed — check device index' });
  }
});

// GET /status — return current config (never expose raw .env values)
app.get('/status', (req, res) => {
  log('HTTP', 'GET /status');
  const status = {
    bridge_port: BRIDGE_PORT,
    dm7_ip: DM7_IP,
    dm7_osc_port: DM7_OSC_PORT,
    midi_enabled: midiOut !== null,
    midi_device_name: midiOut ? midiOut.getPortName(MIDI_DEV_INDEX) : null,
    ulxd_port: ULXD_PORT,
    ulxd_receiver_count: ULXD_IPS.length,
    pushover_enabled: !!(PUSHOVER_TOKEN && PUSHOVER_GROUP),
    battery_warn_bars: BATTERY_WARN_BARS,
    battery_critical_bars: BATTERY_CRITICAL_BARS,
    timestamp: new Date().toISOString()
  };
  res.json(status);
});

// GET /ulxd — query all configured ULXD receivers and return telemetry
// Receivers are configured via ULXD_IPS in .env (comma-separated IPs).
// Optional ?ips=x.x.x.x,y.y.y.y query param overrides the env list for one-off queries.
app.get('/ulxd', async (req, res) => {
  const ips = req.query.ips
    ? req.query.ips.split(',').map(s => s.trim()).filter(Boolean)
    : ULXD_IPS;

  log('HTTP', `GET /ulxd — querying ${ips.length} receiver(s): ${ips.join(', ') || 'none'}`);

  if (ips.length === 0) {
    return res.json({ status: 'ok', message: 'No receivers configured. Set ULXD_IPS in .env or pass ?ips=', receivers: [], timestamp: new Date().toISOString() });
  }

  try {
    const receivers = await Promise.all(ips.map(ip => getReceiverTelemetry(ip)));
    log('HTTP', `ULXD telemetry returned for ${receivers.length} receiver(s)`);
    checkBatteryAndNotify(receivers);
    res.json({ status: 'ok', receivers, timestamp: new Date().toISOString() });
  } catch (err) {
    log('ULXD', `Error: ${err.message}`);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /pushover/test — send a test notification to verify setup before show night
app.get('/pushover/test', (req, res) => {
  log('HTTP', 'GET /pushover/test');
  if (!PUSHOVER_TOKEN || !PUSHOVER_GROUP) {
    return res.status(400).json({ status: 'error', message: 'PUSHOVER_TOKEN or PUSHOVER_GROUP not set in .env' });
  }
  sendPushover('StageDesk Test', 'Pushover notifications are working. Show night ready.', 0);
  res.json({ status: 'ok', message: 'Test notification sent' });
});

// POST /panic — mute all channels 1-32 simultaneously
// Sends OSC fader-to-zero on every input channel. Uses DM7 OSC path format.
app.post('/panic', (req, res) => {
  log('HTTP', 'POST /panic — muting all channels 1-32');
  const TOTAL_CHANNELS = 32;
  const errors = [];

  for (let ch = 1; ch <= TOTAL_CHANNELS; ch++) {
    // DM7 / X32 OSC path for channel on/off: /ch/XX/mix/on  value 0 = muted
    const chStr = String(ch).padStart(2, '0');
    try {
      sendOSC(`/ch/${chStr}/mix/on`, [{ type: 'i', value: 0 }]);
    } catch (err) {
      errors.push(`ch${ch}: ${err.message}`);
    }
  }

  if (errors.length === 0) {
    log('HTTP', 'PANIC complete — all 32 channels muted');
    res.json({ status: 'ok', message: 'All 32 channels muted', channels_muted: TOTAL_CHANNELS });
  } else {
    res.status(500).json({ status: 'partial', errors });
  }
});

// GET /dm7/faders — read fader position and mute state for all 32 channels.
// Queries DM7 via OSC get requests (X32 protocol: send path with no args, read reply).
// All 32 channels queried in parallel; 300ms timeout per channel.
// Returns { channels: [{ch, fader, on}...], timestamp } — fader/on are null if no reply.
app.get('/dm7/faders', async (req, res) => {
  const t0 = Date.now();
  log('HTTP', 'GET /dm7/faders');

  const channels = await Promise.all(
    Array.from({ length: 32 }, (_, i) => i + 1).map(async (ch) => {
      const chStr = String(ch).padStart(2, '0');
      const [faderArgs, onArgs] = await Promise.all([
        getOSC(`/ch/${chStr}/mix/fader`),
        getOSC(`/ch/${chStr}/mix/on`),
      ]);
      return {
        ch,
        fader: faderArgs !== null ? (faderArgs[0]?.value ?? null) : null,
        on:    onArgs   !== null ? (onArgs[0]?.value === 1)       : null,
      };
    })
  );

  log('DM7', `Fader poll — 32 channels in ${Date.now() - t0}ms`);
  res.json({ channels, timestamp: new Date().toISOString() });
});

// POST /ai/parse-script — upload a PDF script, get back a structured show JSON
// Hybrid approach: text extraction for digital PDFs (fast/cheap),
// Claude Vision for scanned PDFs (up to 40 pages at 150 DPI).
app.post('/ai/parse-script', upload.single('script'), async (req, res) => {
  log('HTTP', 'POST /ai/parse-script');

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send a PDF as multipart field "script".' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env — add your key to enable AI import.' });
  }

  const MAX_VISION_PAGES = 40;
  const TEXT_MIN_CHARS   = 500;

  // ── Step 1: attempt text extraction ──────────────────────────────────────
  let rawText   = '';
  let pageCount = 0;
  try {
    const parser = new PDFParse({ data: req.file.buffer });
    const data   = await parser.getText();
    rawText    = data.text || '';
    pageCount  = data.total || 0;
    await parser.destroy();
    log('AI', `PDF text extracted: ${rawText.length} chars, ${pageCount} page(s)`);
  } catch (err) {
    log('AI', `pdf-parse error (will try vision): ${err.message}`);
  }

  const useVision = rawText.trim().length < TEXT_MIN_CHARS;
  log('AI', `Strategy: ${useVision ? 'vision (scanned PDF)' : 'text (digital PDF)'}`);

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  let showData;

  if (!useVision) {
    // ── Text path — fast, digital PDF ──────────────────────────────────────
    try {
      log('AI', 'Sending text to Claude...');
      const message = await client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 8000,
        system:     SCRIPT_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: rawText.slice(0, 100000) }],
      });
      showData = parseClaudeJSON(message.content[0].text);
    } catch (err) {
      log('AI', `Claude text API error: ${err.message}`);
      return res.status(500).json({ error: `Claude API error: ${err.message}`, rawText: rawText.slice(0, 2000) });
    }
  } else {
    // ── Vision path — scanned PDF ───────────────────────────────────────────
    // Verify GraphicsMagick is available before attempting conversion
    const { execSync } = require('child_process');
    try {
      execSync('which gm', { stdio: 'ignore' });
    } catch (_) {
      return res.status(500).json({
        error: 'GraphicsMagick not found. Install it to support scanned PDFs:\n  brew install graphicsmagick ghostscript',
      });
    }

    // Convert PDF pages to PNG images
    let pageImages;
    try {
      const convert = fromBuffer(req.file.buffer, {
        density:     150,
        format:      'png',
        width:       1275,  // ~8.5in at 150 DPI
        height:      1650,  // ~11in at 150 DPI
        preserveAspectRatio: true,
        saveFilename: 'page',
        savePath:    '/tmp',
      });

      // Determine how many pages to process
      let totalPages = pageCount;
      if (!totalPages) {
        // Try to get page count via pdf-parse info (lighter than full text)
        try {
          const infoParser = new PDFParse({ data: req.file.buffer });
          const info = await infoParser.getInfo();
          totalPages = info.total || 0;
          await infoParser.destroy();
        } catch (_) {}
      }
      const pagesToProcess = Math.min(totalPages || MAX_VISION_PAGES, MAX_VISION_PAGES);
      if (totalPages > MAX_VISION_PAGES) {
        log('AI', `Script is ${totalPages} pages — processing first ${MAX_VISION_PAGES}`);
      }

      log('AI', `Converting ${pagesToProcess} page(s) to images at 150 DPI...`);
      const pageNums = Array.from({ length: pagesToProcess }, (_, i) => i + 1);
      pageImages = await Promise.all(pageNums.map(n => convert(n, { responseType: 'base64' })));
      log('AI', `Conversion complete — ${pageImages.length} image(s)`);
    } catch (err) {
      log('AI', `PDF→image conversion error: ${err.message}`);
      return res.status(500).json({
        error: `PDF conversion error: ${err.message}\n\nMake sure GraphicsMagick and Ghostscript are installed:\n  brew install graphicsmagick ghostscript`,
      });
    }

    // Build Claude vision message content
    const imageBlocks = pageImages.map(img => ({
      type:   'image',
      source: { type: 'base64', media_type: 'image/png', data: img.base64 },
    }));
    imageBlocks.push({
      type: 'text',
      text: 'Analyze all pages of this theatrical script and return the complete show file JSON.',
    });

    try {
      log('AI', `Sending ${pageImages.length} page image(s) to Claude Vision... (30-60s)`);
      const message = await client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 8000,
        system:     SCRIPT_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: imageBlocks }],
      }, { timeout: 120_000 });
      showData = parseClaudeJSON(message.content[0].text);
    } catch (err) {
      log('AI', `Claude vision API error: ${err.message}`);
      return res.status(500).json({ error: `Claude Vision API error: ${err.message}` });
    }
  }

  const chars  = (showData.characters || []).length;
  const scenes = (showData.scenes     || []).length;
  const cues   = (showData.cues       || []).length;
  log('AI', `Parse complete (${useVision ? 'vision' : 'text'}) — ${chars} characters, ${scenes} scenes, ${cues} cues`);
  res.json({ status: 'ok', showData, mode: useVision ? 'vision' : 'text' });
});

// GET /logs — return rolling in-memory log (last 50 entries, newest last)
app.get('/logs', (req, res) => {
  res.json({ status: 'ok', logs: _logBuffer.slice() });
});

// GET /restart — gracefully exit so a process manager restarts the bridge
// Requires running the bridge with: npm run bridge:watch (nodemon)
app.get('/restart', (req, res) => {
  log('SERVER', 'Restart requested via /restart — exiting in 1s');
  res.json({
    status: 'restarting',
    message: 'Bridge restarting in 1s. Run bridge with: npm run bridge:watch for auto-restart.',
  });
  setTimeout(() => process.kill(process.pid, 'SIGUSR2'), 1000);
});

// Shared helper — extract JSON from Claude response text
function parseClaudeJSON(text) {
  const s = text.trim();
  try {
    return JSON.parse(s);
  } catch (_) {
    const m = s.match(/\{[\s\S]+\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Claude response did not contain valid JSON');
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
initMidi();

// Bind UDP socket to a fixed local port so DM7 OSC responses return here.
// Must be done before first send so all outgoing packets carry this source port.
udpClient.bind(OSC_LISTEN_PORT, () => {
  log('OSC', `UDP socket bound on :${OSC_LISTEN_PORT} (DM7 response listener ready)`);
});

app.listen(BRIDGE_PORT, () => {
  log('SERVER', `StageDesk OSC bridge listening on http://localhost:${BRIDGE_PORT}`);
  log('SERVER', `DM7 target: ${DM7_IP}:${DM7_OSC_PORT}  OSC listen port: ${OSC_LISTEN_PORT}`);
  log('SERVER', 'Endpoints: GET /ping  GET /status  GET /ulxd  GET /dm7/faders  GET /pushover/test  GET /logs  GET /restart  POST /osc  POST /midi  POST /panic  POST /ai/parse-script');
  log('SERVER', `AI script import: ${ANTHROPIC_API_KEY ? 'enabled (vision+text)' : 'disabled (set ANTHROPIC_API_KEY in .env)'}`);
  log('SERVER', `Pushover: ${(PUSHOVER_TOKEN && PUSHOVER_GROUP) ? `enabled (warn≤${BATTERY_WARN_BARS} critical≤${BATTERY_CRITICAL_BARS})` : 'disabled (set PUSHOVER_TOKEN + PUSHOVER_GROUP in .env)'}`);
  if (ULXD_IPS.length > 0) {
    log('SERVER', `ULXD receivers (port ${ULXD_PORT}): ${ULXD_IPS.join(', ')}`);
  } else {
    log('SERVER', 'ULXD: no receivers configured (set ULXD_IPS in .env)');
  }
});

process.on('exit', () => {
  if (midiOut) midiOut.closePort();
  udpClient.close();
});
