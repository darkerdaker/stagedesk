# StageDesk OSC Bridge

Node.js server that translates HTTP requests from the StageDesk UI into OSC UDP messages and MIDI to the Yamaha DM7.

---

## Prerequisites

- Node.js 18+
- The stage computer must be on the same network as the DM7
- DM7 → *Setup → Network* → OSC enabled, port **49280**
- DM7 → *Setup → Remote* → allow external OSC control

---

## First-time setup

```bash
cd stagedesk
npm install
```

---

## Configure for your show

Edit `.env` before every run:

```
DM7_IP=192.168.1.100        # DM7's static IP on the show network
DM7_OSC_PORT=49280           # Default DM7 OSC receive port
MIDI_DEVICE_INDEX=0          # See "Finding your MIDI port" below
BRIDGE_PORT=3000             # HTTP port the bridge listens on
```

### Finding your MIDI port index

```bash
node -e "
  const m = require('midi');
  const o = new m.Output();
  for (let i = 0; i < o.getPortCount(); i++)
    console.log(i, o.getPortName(i));
"
```

Set `MIDI_DEVICE_INDEX` to the number next to your DM7 or USB-MIDI interface.

---

## Running the bridge

### Before every show / soundcheck

```bash
npm start
```

Leave this terminal open. You should see:

```
[2026-03-28 20:00:00.000] [SERVER] StageDesk OSC bridge listening on http://localhost:3000
[2026-03-28 20:00:00.001] [SERVER] DM7 target: 192.168.1.100:49280
```

### During development

```bash
npm run dev     # auto-restarts on file changes (Node 18+)
```

---

## Testing connectivity

```bash
curl http://localhost:3000/ping
```

Expected response:
```json
{
  "status": "ok",
  "message": "OSC ping sent to 192.168.1.100:49280",
  "dm7_ip": "192.168.1.100",
  "dm7_osc_port": 49280,
  "midi_enabled": true,
  "timestamp": "..."
}
```

---

## API reference

### `GET /ping`
Sends a `/xinfo` OSC probe to the DM7 and returns bridge status.

### `POST /osc`
Send any OSC message to the DM7.

```json
{
  "path": "/ch/01/mix/fader",
  "args": [{ "type": "f", "value": 0.75 }]
}
```

Arg types: `"f"` (float), `"i"` (int), `"s"` (string)

### `POST /midi`
Send a MIDI message via the configured output port.

```json
{
  "type": "cc",
  "channel": 1,
  "data1": 7,
  "data2": 100
}
```

Types: `noteOn`, `noteOff`, `cc` / `controlChange`, `pc` / `programChange`

### `POST /panic`
Immediately mutes all 32 channels via OSC (`/ch/XX/mix/on 0`).
Use in an emergency or at show end.

```bash
curl -X POST http://localhost:3000/panic
```

---

## DM7 OSC path cheat sheet

| Action | Path | Arg |
|--------|------|-----|
| Channel fader | `/ch/01/mix/fader` | `f` 0.0–1.0 |
| Channel mute on/off | `/ch/01/mix/on` | `i` 1=on, 0=mute |
| Bus send level | `/ch/01/mix/01/level` | `f` 0.0–1.0 |
| DCA fader | `/dca/1/fader` | `f` 0.0–1.0 |
| DCA mute | `/dca/1/on` | `i` 1=on, 0=mute |
| Scene recall | `/scene/recall` | `i` scene-number |

> Pad channel numbers to two digits: ch 1 → `01`, ch 12 → `12`

---

## Show day checklist

- [ ] DM7 IP is static and matches `.env`
- [ ] OSC is enabled on the DM7 (port 49280)
- [ ] `npm install` was run after any dependency changes
- [ ] `npm start` is running and shows the DM7 target IP
- [ ] `/ping` returns `"status": "ok"`
- [ ] StageDesk UI (`broadway-audio-app.html`) is open and bridge URL matches
- [ ] Test a channel mute before cast arrives
