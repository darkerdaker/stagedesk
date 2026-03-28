require('dotenv').config();
const express = require('express');
const cors = require('cors');
const osc = require('osc');
const midi = require('midi');
const dgram = require('dgram');

// ── Config ────────────────────────────────────────────────────────────────────
const DM7_IP         = process.env.DM7_IP          || '192.168.1.100';
const DM7_OSC_PORT   = parseInt(process.env.DM7_OSC_PORT, 10) || 49280;
const MIDI_DEV_INDEX = parseInt(process.env.MIDI_DEVICE_INDEX, 10) || 0;
const BRIDGE_PORT    = parseInt(process.env.BRIDGE_PORT, 10) || 3000;

// ── Logging ───────────────────────────────────────────────────────────────────
function log(tag, msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

// ── OSC UDP client ────────────────────────────────────────────────────────────
const udpClient = dgram.createSocket('udp4');

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
    timestamp: new Date().toISOString()
  };
  res.json(status);
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

// ── Start ─────────────────────────────────────────────────────────────────────
initMidi();

app.listen(BRIDGE_PORT, () => {
  log('SERVER', `StageDesk OSC bridge listening on http://localhost:${BRIDGE_PORT}`);
  log('SERVER', `DM7 target: ${DM7_IP}:${DM7_OSC_PORT}`);
  log('SERVER', 'Endpoints: GET /ping  GET /status  POST /osc  POST /midi  POST /panic');
});

process.on('exit', () => {
  if (midiOut) midiOut.closePort();
  udpClient.close();
});
