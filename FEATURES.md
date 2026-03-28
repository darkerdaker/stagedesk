# StageDesk — Feature & Design Decisions Log

A living document of notable technical decisions, reliability features,
and talking points for the technical team.

## Reliability & show-night safety

- **OSC bridge timeout handling** — all UDP commands wrapped in try/catch,
  fail silently with console.warn so a bad command never crashes the UI
- **ULXD 600ms receiver timeout** — dead or offline receivers time out
  individually without hanging the full status poll
- **Parallel ULXD polling** — all 4 slots per receiver queried simultaneously,
  minimizing round-trip time for battery/RF status
- **30-second bridge polling loop** — frontend continuously monitors bridge
  health, topbar updates to DM7 LIVE / BRIDGE ONLY / NO SIGNAL automatically
- **Single POST /panic** — mutes all 32 channels in one bridge call instead
  of 32 sequential OSC messages, faster and more reliable in an emergency
- **Session-only A2 checklist** — swap checkboxes intentionally not saved
  to localStorage so every show starts with a clean slate
- **localStorage persistence** — all show data (cues, channels, scenes,
  flow) survives browser refresh and tab close with no backend required
- **No internet dependency** — entire app runs on closed show network,
  no cloud services, no auth, no login

## Architecture decisions

- **Single HTML file frontend** — no build tools, no framework, opens
  directly in any browser, zero setup on show night
- **Separate Node.js OSC bridge** — browser can't send UDP natively,
  bridge runs locally and translates HTTP → OSC/MIDI/ULXD
- **OSC primary, MIDI fallback** — DM7 controlled via OSC (X32-compatible
  path format, port 49280), MIDI available as secondary control path
- **ULXD telemetry separate from console control** — Shure UDP command
  protocol (port 2202) queried directly from bridge, independent of
  DM7 OSC path, so receiver data is available even if console OSC is down
- **Dante network** — audio and device management on same closed network,
  ULXD receivers addressable by IP for telemetry without additional hardware
- **.env config** — DM7 IP, OSC port, ULXD IPs all configurable per-venue
  without touching code

## A1 / A2 role separation

- **Role toggle in topbar** — single tap switches between A1 and A2 views
- **A1 cue view** — full script cue stack with all action types
- **A2 cue view** — filtered to swap/mute/unmute cues only, reduces
  cognitive load backstage
- **A2 mic swap checklist** — cues with action=swap pulled automatically
  from script, grouped by scene, tappable checkboxes with progress counter

## Yamaha DM7 integration

- **Scene recall via OSC** — one-tap recall sends OSC command directly
  to DM7 scene memory
- **Panic mute** — single button mutes all wireless channels 1-32
  with confirmation dialog
- **Live connection status** — topbar shows real bridge + console status,
  updated every 30 seconds
- **Pre-show ping** — test connection button in Settings shows round-trip
  time and full JSON response from bridge

## Shure ULXD integration

- **Live battery per pack** — BATT_BARS polled per slot per receiver
- **RF signal level** — RX_RF_LVL per slot, visible on channel cards
- **Frequency confirmation** — FREQUENCY field verifies on-air frequency
  matches plot
- **Channel name sync** — CHAN_NAME pulled from receiver, can cross-check
  against StageDesk channel assignment
- **Transmitter type** — TX_TYPE identifies pack type per slot

## Planned / upcoming

- [ ] Channel cards wired to live ULXD data (battery/RF on each card)
- [ ] ULXD auto-poll loop in frontend (every 30s)
- [ ] Real DM7 + ULXD test at the theatre
- [ ] Channel editor — frequency assignment from ULXD scan
- [ ] Show file import from Yamaha DM7 scene library

---
*Updated as features are added. Commit this file with every significant
feature addition.*
