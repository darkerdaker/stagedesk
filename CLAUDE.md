# StageDesk — Claude Code Context

## What this project is
StageDesk is a professional audio production assistant for Broadway shows at a university theatre. It provides a browser-based UI for both A1 (front of house) and A2 (backstage) roles, controlling a **Yamaha DM7** mixing console (with Broadcast and Theatre Package) via OSC and MIDI.

Show scale: 17–32 wireless mic channels per production.

## Architecture

```
broadway-audio-app.html     ← single-file frontend UI (no build step)
osc-bridge.js               ← Node.js Express server, translates HTTP → OSC/MIDI
.env                        ← show-specific config (not committed)
```

The HTML file makes fetch() calls to the local Express server on port 3000.
The bridge sends UDP OSC packets to the DM7 on port 49280 and optionally sends MIDI via node-midi.

## Tech stack
- **Frontend:** Vanilla HTML/CSS/JS, single file, no framework, no build step
- **Backend:** Node.js, Express 4, `osc` (npm), `midi` (node-midi), `dotenv`
- **Console protocol:** OSC over UDP (primary), MIDI (secondary/fallback)
- **DM7 OSC format:** X32-compatible — channel paths like `/ch/01/mix/fader`, `/ch/01/mix/on`

## Key files

| File | Role |
|------|------|
| `broadway-audio-app.html` | Full UI — tabs for A1 console, A2 mic tracker, RF scan, scene recall |
| `osc-bridge.js` | Express server: `/ping`, `/osc`, `/midi`, `/panic` endpoints |
| `.env` | `DM7_IP`, `DM7_OSC_PORT`, `MIDI_DEVICE_INDEX`, `BRIDGE_PORT`, `ULXD_IPS`, `PUSHOVER_TOKEN`, `PUSHOVER_GROUP`, `BATTERY_WARN_BARS`, `BATTERY_CRITICAL_BARS` |
| `.env.example` | Committed template — copy to `.env` and fill in per-venue values |
| `package.json` | Node dependencies |

## Bridge API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ping` | GET | Health check — fires `/xinfo` OSC probe, returns bridge status JSON |
| `/osc` | POST | Send arbitrary OSC: `{ path, args: [{type, value}] }` |
| `/midi` | POST | Send MIDI: `{ type, channel, data1, data2? }` |
| `/panic` | POST | Mute all 32 channels simultaneously via OSC |
| `/ulxd` | GET | Poll all ULXD receivers, returns telemetry + fires battery alerts |
| `/pushover/test` | GET | Send a test Pushover notification to verify setup |

OSC arg types: `"f"` (float 0.0–1.0), `"i"` (integer), `"s"` (string)

## DM7 OSC path conventions
- Channel fader: `/ch/01/mix/fader` — float 0.0–1.0
- Channel mute: `/ch/01/mix/on` — int 1=unmuted, 0=muted
- Channel numbers are always zero-padded to 2 digits
- DCA fader: `/dca/1/fader`, DCA mute: `/dca/1/on`
- Scene recall: `/scene/recall` — int scene number

## Running locally
```bash
npm install       # first time only
npm start         # production
npm run dev       # auto-restart on file change (Node 18+)
```

Edit `.env` with the DM7's actual IP before each show. Default: `192.168.1.100:49280`.

## Code conventions
- No TypeScript, no transpilation — plain Node.js and vanilla JS only
- Keep the frontend as a single HTML file — no bundler, no npm deps in the browser
- All OSC sends are fire-and-forget UDP — do not add response-waiting logic unless a full OSC listener is also added
- Log every command with the `log(tag, msg)` helper in osc-bridge.js — timestamps are required
- Channel numbers in the UI are 1-indexed; OSC paths use zero-padded 2-digit strings

## Hardware
- Wireless: Shure ULXD quad receivers, networked via Dante
- ULXD units accessible via Shure UDP command protocol (port 2202)
- Dante network carries both audio and device management
- OSC handles console control, ULXD protocol handles receiver telemetry

## Session rules
- At the end of every session, stage all changed files, commit with a
  descriptive message, and push to origin
- Never leave modified files uncommitted at session end

## Push notifications
- Pushover token/group live in `.env` only — never commit
- `sendPushover()` fails silently when keys not set — do not add fallback logic
- Priority 2 (emergency) requires `retry` + `expire` params — always include them
- Debounce key format: `"<ip>:<slot>:<tier>"` where tier is `warn` or `critical`

## AI Script Import
- `POST /ai/parse-script` — multipart PDF upload, field name `script`
- Hybrid strategy: `pdf-parse` text extraction for digital PDFs (≥500 chars), `pdf2pic` + Claude Vision for scanned PDFs
- `fromBuffer` (pdf2pic) converts PDF buffer to PNG images — up to 40 pages, 150 DPI, `/tmp` output
- Requires GraphicsMagick + Ghostscript: `brew install graphicsmagick ghostscript`
- Vision: image blocks sent to `claude-sonnet-4-6`, max_tokens 8000, 120s timeout
- Text path: same model, max_tokens 8000, text content up to 100k chars
- Returns `{ status: 'ok', showData, mode: 'text'|'vision' }` with full structured show JSON
- `ANTHROPIC_API_KEY` in `.env` — required; 500 returned if not set
- Claude API error → 500 with `rawText` snippet so TD can use manual import as fallback
- Frontend preview panel opens before committing — TD can edit mic recommendations inline

## What NOT to do
- Do not add a frontend framework (React, Vue, etc.) — the single-file constraint is intentional
- Do not commit `.env` — it contains show-specific IP addresses
- Do not add authentication — this runs on a closed show network only
- Do not change the OSC path format without verifying against the DM7 OSC spec
