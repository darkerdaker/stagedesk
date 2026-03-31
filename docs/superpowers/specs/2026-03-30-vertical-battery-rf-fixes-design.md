# Design: Vertical Battery Icon, RF Dots, NO DATA Dim, Filter Grid-Only

**Date:** 2026-03-30
**Status:** Approved

---

## Overview

Four targeted fixes to `broadway-audio-app.html`. No other files changed.

---

## 1. Battery Icon — Vertical Redesign

Remove the existing horizontal battery icon CSS/HTML and replace with a vertical orientation matching the RF dots aesthetic.

### Structure (top to bottom)
```
[nub: 6×4px, --border2 border, transparent fill]
[body: 12×40px, 1px --border2, --bg1 background]
  [5 segments filling bottom-to-top]
```
No label.

### CSS
- `.strip-batt-wrap`: flex-direction column, align-items center (replaces `.strip-batt-icon`)
- `.strip-batt-nub`: width 6px, height 4px, border 1px solid var(--border2), background transparent
- `.strip-batt-body`: width 12px, height 40px, border 1px solid var(--border2), bg var(--bg1), display flex, flex-direction column-reverse, gap 2px, padding 2px, box-sizing border-box
- `.strip-batt-seg`: flex 1, background var(--bg3), transition background 0.2s

### Fill logic (JS)
- `batt >= 3` → battColor `#00cc44`
- `batt === 2` → battColor `#e8850a`
- `batt === 1` → battColor `#cc2200`
- `batt === 0 || batt === null` → battColor `''` (all segments --bg3)
- Segment `seg` (1–5) is lit when `batt !== null && batt >= seg`
- Lit segments get `style="background:${battColor}"` inline

### HTML
```html
<div class="strip-batt-wrap">
  <div class="strip-batt-nub"></div>
  <div class="strip-batt-body">${battSegs}</div>
</div>
```

---

## 2. RF Dots — Remove Label, Verify Size

Remove `.strip-rf-label` div from template HTML and `.strip-rf-label` CSS rule.
Keep: 5 dots, 9px diameter, 4px gap, amber `#e8850a` when lit, `--bg3` unlit.

### HTML (after change)
```html
<div class="strip-rf-half">
  <div class="strip-rf-col">${rfDotsHtml}</div>
</div>
```

---

## 3. NO DATA Label — Dim

`.ssf-nodata` CSS:
- `color`: `var(--red)` → `var(--text3)`
- `font-size`: `6px` → `8px`

---

## 4. Filter Buttons — Grid View Only

Move `#groupFilterRow` div from `.channels-header` HTML into `#channelGridBody` (above `#channelGrid`).

When strips view is active, `channelGridBody` is `display:none`, which hides the filter row automatically. No JS changes needed — `renderGroupFilters()` finds the div by ID regardless of DOM position.

### HTML change
Remove from channels-header:
```html
<div id="groupFilterRow" style="display:none;"></div>
```
Add to channelGridBody (before channelGrid):
```html
<div class="channels-body" id="channelGridBody">
  <div id="groupFilterRow" style="display:none;"></div>
  <div class="channels-grid" id="channelGrid"></div>
</div>
```

---

## CSS Classes to Remove
- `.strip-batt-icon` (replaced by `.strip-batt-wrap`)
- `.strip-batt-body` old definition (width/height change)
- `.strip-batt-nub` old definition (size change)
- `.strip-rf-label`

## Files Changed
- `broadway-audio-app.html` only

## Commit Message
`"vertical battery icon matching RF dots style"`
