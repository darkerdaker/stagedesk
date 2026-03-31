# Design: Grid Group Filters + Strip Battery Icon + RF Dots

**Date:** 2026-03-30
**Status:** Approved

---

## Overview

Three changes to `broadway-audio-app.html`:

1. Grid page — multi-select group filter buttons
2. Strips view — replace DCA/MUT badges with battery icon + RF dots
3. Strips view — remove DCA/MUT badge row entirely

One change to `osc-bridge.js`:

4. Store `rf_level` as actual dBm integer (fix 0–100 assumption)

---

## 1. Grid Group Filter Buttons

### Placement
A `#groupFilterRow` div is injected inside `.channels-header` on the CH page, below the LIVE/SWAP/RF!/OFF legend badges, before the view toggle buttons. The row is hidden (`display:none`) when no groups exist in channel data.

### Button generation
`renderGroupFilters()` scans `state.channels` for all unique values across all `ch.dcaGroups` and `ch.muteGroups` arrays. Buttons are generated in sorted order: DCA groups first, then MUT groups.

Button labels: `DCA 1`, `DCA 2`, etc. and `MUT 1`, `MUT 2`, etc.

### Styling
- Height: 28px, padding: 0 10px, border-radius: 2px
- Off state: `1px solid var(--border)`, background `var(--bg2)`, text `var(--text2)`
- On state (DCA): background `var(--cyan)`, text `#000`
- On state (MUT): background `var(--red)`, text `#fff`
- Row: `display:flex`, `gap:4px`, `overflow-x:auto`, scrollable, no scrollbar shown

### Filter state
`state.gridGroupFilter` is a `Set` of active group keys (e.g. `"dca:1"`, `"mut:2"`).

Each button toggles its key in/out of the set independently (no radio behavior).

Filter is cleared when navigating away from the CH page (in the `showPage()` nav function).

### Filter logic (OR)
- Empty set → show all channels
- Non-empty set → show channels where at least one `dcaGroups` or `muteGroups` value matches an active group key

Applied inside `renderChannels()` before building grid HTML.

---

## 2. Strip Info Section — Battery Icon

### Layout change
`.strip-info` height reduces from 96px to 80px (DCA/MUT badge row removed).

The `.strip-info-rf-bat` area becomes a two-halves side-by-side layout:
- Left 50%: battery icon, centered vertically
- Right 50%: RF dots + label, centered vertically
- Gap: 4px between halves

### Battery icon (left half)
Classic battery shape built from CSS:
- Outer rectangle: full width of left half, 12px tall, `1px solid var(--border2)`, background `var(--bg1)`
- Nub: 3px wide, 6px tall, positioned flush against the right edge of the rectangle (outside or as a sibling element using absolute/flex positioning)
- Inside rectangle: 5 fill segments, left-to-right, with 1px gaps between segments

Fill color logic (all lit segments share one color based on bar count):
- 5 bars: `#00cc44`
- 4 bars: `#00cc44`
- 3 bars: `#00cc44`
- 2 bars: `#e8850a`
- 1 bar: `#cc2200`
- 0 bars: all segments `var(--bg3)` (empty)
- null: all segments `var(--bg3)`

---

## 3. Strip Info Section — RF Dots

### RF dots (right half)
- "RF" label: 8px, `var(--text3)`, above dots
- 5 stacked circles, each 6px diameter (`border-radius: 50%`)
- Gap between dots: 2px
- Lit dots (up to dot count): `#e8850a` amber
- Unlit dots: `var(--bg3)`
- null data: all dots `var(--bg3)`

### Dot count mapping (dBm thresholds)
| Condition | Dots lit |
|-----------|----------|
| rf > -70  | 5 |
| rf > -80  | 4 |
| rf > -85  | 3 |
| rf > -90  | 2 |
| rf ≤ -90  | 1 |
| null      | 0 |

### DCA/MUT badges removed
- Delete `badgesHtml` construction and `.strip-info-badges` div from `renderChannelStrips()`
- Delete `.strip-info-badges` CSS rule
- Delete `.strip-group-label`, `.strip-group-badge`, `.strip-dca-*`, `.strip-mut-*` CSS rules from the strips section (grid card badge rules are separate — keep those)

---

## 4. osc-bridge.js — rf_level as dBm

The Shure ULXD `RX_RF_LVL` reply format is `< REP slot RX_RF_LVL -070 >`, which `parseInt` already handles correctly as `-70`.

**Change:** Update comment at the `rf_level` parse site in `osc-bridge.js` to reflect that this is a dBm value (typically -120 to -20). No logic change needed — `parseInt` already produces the correct negative integer.

**Frontend change:** Update `cardTelemetry()` (grid view RF bars) to also use dBm thresholds for consistency: `rf > -70 ? 3 : rf > -80 ? 2 : 1`.

---

## Files Changed

| File | Change |
|------|--------|
| `broadway-audio-app.html` | Grid filter buttons, strip battery icon, strip RF dots, remove DCA/MUT from strips, update cardTelemetry RF thresholds |
| `osc-bridge.js` | Update rf_level comment to reflect dBm |

---

## Testing Checklist

- Load demo show → CH page (grid view)
- Add DCA groups to a few channels via edit modal
- Verify filter buttons appear for each unique group
- Verify multi-select (DCA1 + MUT1 simultaneously) shows union
- Verify deselecting all shows full channel list
- Verify filter row hidden when no groups configured
- Verify filter resets on nav away and back
- Switch to STRIPS view
- Verify battery icon renders (rectangle + nub + 5 segments)
- Verify RF dots render (5 amber circles + "RF" label)
- Verify no DCA/MUT badges in strips
- Verify frequency text still appears below battery/RF
- Verify all strips still aligned and strip height unchanged
