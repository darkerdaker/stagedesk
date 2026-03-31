# Vertical Battery Icon + RF/NO DATA Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal battery icon with a vertical one matching the RF dots aesthetic, enlarge RF dots, dim NO DATA label, and confine the filter row to grid view only.

**Architecture:** All changes are in `broadway-audio-app.html` (CSS + HTML + one JS template string). No new files. No logic changes — only visual/structural.

**Tech Stack:** Vanilla HTML/CSS/JS, single file, no build step.

---

## File Map

| File | Lines | Change |
|------|-------|--------|
| `broadway-audio-app.html` | 1344–1358 | `.strip-bat-half` / `.strip-rf-half` CSS — update RF half gap |
| `broadway-audio-app.html` | 1360–1386 | Battery CSS — rename `.strip-batt-icon`→`.strip-batt-wrap`, redesign body/nub |
| `broadway-audio-app.html` | 1387–1393 | Remove `.strip-rf-label` CSS rule |
| `broadway-audio-app.html` | 1394–1406 | RF dots CSS — dot size 6→9px, gap 2→4px |
| `broadway-audio-app.html` | 1515–1525 | `.ssf-nodata` — color red→text3, size 6→8px |
| `broadway-audio-app.html` | 1773 | Remove `#groupFilterRow` from channels-header |
| `broadway-audio-app.html` | 1775–1777 | Add `#groupFilterRow` inside `#channelGridBody` |
| `broadway-audio-app.html` | 2603–2618 | `renderChannelStrips()` battery HTML + remove RF label |

---

## Task 1: CSS changes — battery, RF dots, NO DATA

**Files:**
- Modify: `broadway-audio-app.html` (~lines 1344–1406, 1515–1525)

- [ ] **Step 1: Update .strip-bat-half and .strip-rf-half**

Find (~line 1344):
```css
  .strip-bat-half {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .strip-rf-half {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
```

Replace with:
```css
  .strip-bat-half {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .strip-rf-half {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
```

- [ ] **Step 2: Replace battery icon CSS (rename + redesign)**

Find the three existing battery CSS blocks (~lines 1360–1386):
```css
  .strip-batt-icon {
    display: flex;
    align-items: center;
    width: 100%;
  }
  .strip-batt-body {
    flex: 1;
    min-width: 0;
    height: 12px;
    border: 1px solid var(--border2);
    background: var(--bg1);
    display: flex;
    gap: 1px;
    padding: 2px;
    box-sizing: border-box;
  }
  .strip-batt-nub {
    width: 3px;
    height: 6px;
    background: var(--border2);
    flex-shrink: 0;
  }
  .strip-batt-seg {
    flex: 1;
    background: var(--bg3);
    transition: background 0.2s;
  }
```

Replace with:
```css
  .strip-batt-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }
  .strip-batt-nub {
    width: 6px;
    height: 4px;
    border: 1px solid var(--border2);
    background: transparent;
    flex-shrink: 0;
  }
  .strip-batt-body {
    width: 12px;
    height: 40px;
    border: 1px solid var(--border2);
    background: var(--bg1);
    display: flex;
    flex-direction: column-reverse;
    gap: 2px;
    padding: 2px;
    box-sizing: border-box;
    flex-shrink: 0;
  }
  .strip-batt-seg {
    flex: 1;
    background: var(--bg3);
    transition: background 0.2s;
  }
```

- [ ] **Step 3: Remove .strip-rf-label CSS**

Find and delete the entire rule (~lines 1387–1393):
```css
  .strip-rf-label {
    font-family: var(--mono);
    font-size: 8px;
    color: var(--text3);
    line-height: 1;
    letter-spacing: 0.04em;
  }
```

- [ ] **Step 4: Update RF dot size and gap**

Find (~lines 1394–1406):
```css
  .strip-rf-col {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .strip-rf-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--bg3);
    transition: background 0.2s;
  }
  .strip-rf-dot.lit { background: #e8850a; }
```

Replace with:
```css
  .strip-rf-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .strip-rf-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--bg3);
    transition: background 0.2s;
  }
  .strip-rf-dot.lit { background: #e8850a; }
```

- [ ] **Step 5: Dim NO DATA label**

Find (~line 1515):
```css
  .ssf-nodata {
    position: absolute;
    bottom: 2px;
    left: 0;
    right: 0;
    text-align: center;
    font-family: var(--mono);
    font-size: 6px;
    color: var(--red);
    letter-spacing: 0.04em;
    pointer-events: none;
  }
```

Replace with:
```css
  .ssf-nodata {
    position: absolute;
    bottom: 2px;
    left: 0;
    right: 0;
    text-align: center;
    font-family: var(--mono);
    font-size: 8px;
    color: var(--text3);
    letter-spacing: 0.04em;
    pointer-events: none;
  }
```

- [ ] **Step 6: Verify CSS changes look correct**

Read lines 1344–1410 and 1515–1526 back. Confirm:
- `.strip-batt-wrap` exists, `.strip-batt-icon` is gone
- `.strip-batt-body` has `width: 12px`, `height: 40px`, `flex-direction: column-reverse`
- `.strip-batt-nub` has `width: 6px`, `height: 4px`, `border: 1px solid var(--border2)`, `background: transparent`
- `.strip-rf-label` is gone
- `.strip-rf-dot` is 9×9px
- `.strip-rf-col` gap is 4px
- `.ssf-nodata` has `color: var(--text3)` and `font-size: 8px`

---

## Task 2: HTML — move filter row to grid body

**Files:**
- Modify: `broadway-audio-app.html` (~lines 1773–1777)

- [ ] **Step 1: Remove filter row from channels-header**

Find (~line 1773), the last line inside the channels-header div:
```html
        <div id="groupFilterRow" style="display:none;"></div>
      </div>
      <div class="channels-body" id="channelGridBody">
        <div class="channels-grid" id="channelGrid"></div>
      </div>
```

Replace with:
```html
      </div>
      <div class="channels-body" id="channelGridBody">
        <div id="groupFilterRow" style="display:none;"></div>
        <div class="channels-grid" id="channelGrid"></div>
      </div>
```

- [ ] **Step 2: Verify placement**

Read lines 1770–1782. Confirm:
- `#groupFilterRow` is the first child of `#channelGridBody`
- `#groupFilterRow` is no longer inside the channels-header
- `#channelGrid` follows immediately after `#groupFilterRow`

---

## Task 3: JS — update battery HTML in renderChannelStrips()

**Files:**
- Modify: `broadway-audio-app.html` (~lines 2603–2618)

- [ ] **Step 1: Replace battery + rfBatHtml construction**

Find (~lines 2603–2618):
```js
    // Battery icon — 5 segments left-to-right, classic icon shape
    const battColor = batt === null || batt === 0 ? '' : batt >= 3 ? '#00cc44' : batt === 2 ? '#e8850a' : '#cc2200';
    let battSegs = '';
    for (let seg = 1; seg <= 5; seg++) {
      const lit = batt !== null && batt >= seg;
      battSegs += `<div class="strip-batt-seg"${lit && battColor ? ` style="background:${battColor}"` : ''}></div>`;
    }
    const battHtml = `<div class="strip-batt-icon"><div class="strip-batt-body">${battSegs}</div><div class="strip-batt-nub"></div></div>`;

    // RF dots — 5 stacked circles, all amber when lit, count mapped from dBm
    const rfDots = rf === null ? 0 : rf > -70 ? 5 : rf > -80 ? 4 : rf > -85 ? 3 : rf > -90 ? 2 : 1;
    let rfDotsHtml = '';
    for (let dot = 0; dot < 5; dot++) {
      rfDotsHtml += `<div class="strip-rf-dot${rf !== null && dot < rfDots ? ' lit' : ''}"></div>`;
    }
    const rfBatHtml = `<div class="strip-bat-half">${battHtml}</div><div class="strip-rf-half"><div class="strip-rf-label">RF</div><div class="strip-rf-col">${rfDotsHtml}</div></div>`;
```

Replace with:
```js
    // Battery icon — vertical, 5 segments fill bottom-to-top
    const battColor = batt === null || batt === 0 ? '' : batt >= 3 ? '#00cc44' : batt === 2 ? '#e8850a' : '#cc2200';
    let battSegs = '';
    for (let seg = 1; seg <= 5; seg++) {
      const lit = batt !== null && batt >= seg;
      battSegs += `<div class="strip-batt-seg"${lit && battColor ? ` style="background:${battColor}"` : ''}></div>`;
    }
    const battHtml = `<div class="strip-batt-wrap"><div class="strip-batt-nub"></div><div class="strip-batt-body">${battSegs}</div></div>`;

    // RF dots — 5 stacked circles, all amber when lit, count mapped from dBm
    const rfDots = rf === null ? 0 : rf > -70 ? 5 : rf > -80 ? 4 : rf > -85 ? 3 : rf > -90 ? 2 : 1;
    let rfDotsHtml = '';
    for (let dot = 0; dot < 5; dot++) {
      rfDotsHtml += `<div class="strip-rf-dot${rf !== null && dot < rfDots ? ' lit' : ''}"></div>`;
    }
    const rfBatHtml = `<div class="strip-bat-half">${battHtml}</div><div class="strip-rf-half"><div class="strip-rf-col">${rfDotsHtml}</div></div>`;
```

Key changes:
- `battHtml`: uses `.strip-batt-wrap` (not `.strip-batt-icon`), nub is first child (on top), body is second
- `rfBatHtml`: removed `<div class="strip-rf-label">RF</div>` from rf half

- [ ] **Step 2: Verify JS looks correct**

Read lines 2600–2620. Confirm:
- `battHtml` starts with `<div class="strip-batt-wrap">` (not `strip-batt-icon`)
- Nub (`strip-batt-nub`) comes BEFORE body (`strip-batt-body`) in `battHtml`
- No `strip-rf-label` anywhere in `rfBatHtml`
- No `strip-batt-icon` class reference anywhere in the file: `grep -n "strip-batt-icon" broadway-audio-app.html` should return 0 results
- No `strip-rf-label` class reference anywhere: `grep -n "strip-rf-label" broadway-audio-app.html` should return 0 results

- [ ] **Step 3: Commit and push**

```bash
git add broadway-audio-app.html
git commit -m "vertical battery icon matching RF dots style"
git push origin main
```
