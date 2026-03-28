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
| `.env` | `DM7_IP`, `DM7_OSC_PORT`, `MIDI_DEVICE_INDEX`, `BRIDGE_PORT` |
| `package.json` | Node dependencies |

## Bridge API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ping` | GET | Health check — fires `/xinfo` OSC probe, returns bridge status JSON |
| `/osc` | POST | Send arbitrary OSC: `{ path, args: [{type, value}] }` |
| `/midi` | POST | Send MIDI: `{ type, channel, data1, data2? }` |
| `/panic` | POST | Mute all 32 channels simultaneously via OSC |

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

## What NOT to do
- Do not add a frontend framework (React, Vue, etc.) — the single-file constraint is intentional
- Do not commit `.env` — it contains show-specific IP addresses
- Do not add authentication — this runs on a closed show network only
- Do not change the OSC path format without verifying against the DM7 OSC spec
