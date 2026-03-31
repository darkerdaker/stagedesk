# Grid Group Filters + Strip Battery Icon + RF Dots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select group filter buttons to the channel grid page, replace DCA/MUT badges in strips with a classic battery icon and RF dot indicator, and fix rf_level to use actual dBm values.

**Architecture:** All changes are in `broadway-audio-app.html` (single-file vanilla JS/CSS frontend) plus a comment fix in `osc-bridge.js`. No new files. Filter state lives in a module-level `Set` (not persisted). Battery icon and RF dots are pure CSS+HTML replacing the existing horizontal-bar segments.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step. Open the file directly in a browser to test.

---

## File Map

| File | Lines affected | Change |
|------|---------------|--------|
| `osc-bridge.js` | ~3940 | Update rf_level comment to reflect dBm |
| `broadway-audio-app.html` | ~1290–1365 | Update `.strip-info` height, replace BAT/RF CSS, add battery icon + RF dot CSS, remove badge CSS |
| `broadway-audio-app.html` | ~1704–1725 | Add `#groupFilterRow` div in channels-header HTML |
| `broadway-audio-app.html` | ~2080–2090 | Add `let gridGroupFilter = new Set()` module variable |
| `broadway-audio-app.html` | ~2119–2122 | Clear gridGroupFilter when leaving channels page |
| `broadway-audio-app.html` | ~2328–2365 | Add `renderGroupFilters()` call + filter logic in `renderChannels()` |
| `broadway-audio-app.html` | ~2485–2548 | Rewrite battery/RF section in `renderChannelStrips()`, remove DCA/MUT badges |
| `broadway-audio-app.html` | ~3938–3948 | Update `cardTelemetry()` RF thresholds from 0–100 to dBm |

---

## Task 1: Fix rf_level comment and cardTelemetry RF thresholds

`rf_level` comes from Shure's `RX_RF_LVL` command which returns dBm as a signed integer (e.g. `-070` → parsed as `-70`). The existing `parseInt` already handles this correctly. Only the comment and the frontend thresholds need updating.

**Files:**
- Modify: `osc-bridge.js` (~line 412)
- Modify: `broadway-audio-app.html` (~line 3940–3942)

- [ ] **Step 1: Update osc-bridge.js comment**

Find in `osc-bridge.js` (~line 412):
```js
      rf_level:  rfR   ? parseULXDReply(rfR)   : null,
```

The `getReceiverTelemetry` function already parses it correctly. The frontend `ulxdData` assignment at ~line 3728 does `parseInt(slot.rf_level, 10)`. No code change needed — but find the comment at ~line 3940 in the HTML:

```js
    // RX_RF_LVL: Shure returns 0–100 integer
    const rf     = t.rf_level;
    const level  = rf > 60 ? 3 : rf > 30 ? 2 : 1;
```

Replace with:
```js
    // RX_RF_LVL: Shure returns dBm as signed integer (e.g. -70 = -70 dBm)
    const rf     = t.rf_level;
    const level  = rf > -70 ? 3 : rf > -80 ? 2 : 1;
```

- [ ] **Step 2: Verify the change looks right**

Open `broadway-audio-app.html` in a browser (or just read it). The `cardTelemetry()` function (grid view RF bars) now uses dBm thresholds. With no live ULXD data the rf bars won't show — this is expected.

- [ ] **Step 3: Commit**

```bash
git add broadway-audio-app.html osc-bridge.js
git commit -m "fix rf_level thresholds to use dBm (was 0-100 assumption)"
```

---

## Task 2: Add filter row HTML and CSS to channels page

Add a `#groupFilterRow` div inside `.channels-header` (the CH page header). It wraps to its own line via `flex-basis: 100%`. Hidden by default. CSS for the filter buttons goes in the same task.

**Files:**
- Modify: `broadway-audio-app.html` (~line 1704 HTML, ~line 527 CSS)

- [ ] **Step 1: Add filter row CSS**

Find in the CSS block (~line 536):
```css
  .channels-header {
    padding: 7px 12px;
    background: var(--bg1);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
```

Add these new rules immediately after that block (before `.page-title`):
```css
  #groupFilterRow {
    flex-basis: 100%;
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  #groupFilterRow::-webkit-scrollbar { display: none; }
  .group-filter-btn {
    height: 28px;
    padding: 0 10px;
    border-radius: 2px;
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text2);
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.1s, color 0.1s;
  }
  .group-filter-btn.active-dca {
    background: var(--cyan);
    color: #000;
    border-color: var(--cyan);
  }
  .group-filter-btn.active-mut {
    background: var(--red);
    color: #fff;
    border-color: var(--red);
  }
```

- [ ] **Step 2: Add filter row div in channels-header HTML**

Find the channels-header HTML (~line 1704):
```html
      <div class="channels-header">
        <div class="page-title">Channel layout</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
```

Add `#groupFilterRow` as the last child inside `.channels-header`, before the closing `</div>`:

The full channels-header block (lines 1704–1720) ends with `</div>` before `<div class="channels-body"`. Add the filter row div just before that closing `</div>`:
```html
        <div id="groupFilterRow" style="display:none;"></div>
```

So the full updated channels-header block becomes:
```html
      <div class="channels-header">
        <div class="page-title">Channel layout</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span style="display:flex;align-items:center;gap:5px;font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:0.08em;">
            <span style="padding:1px 4px;border:1px solid var(--green);color:var(--green);background:var(--green-bg);">LIVE</span>
            <span style="padding:1px 4px;border:1px solid var(--amber);color:var(--amber);background:var(--amber-bg);">SWAP</span>
            <span style="padding:1px 4px;border:1px solid var(--red);color:var(--red);background:var(--red-bg);">RF!</span>
            <span style="padding:1px 4px;border:1px solid var(--border);color:var(--text3);background:var(--bg3);">OFF</span>
          </span>
          <span class="ulxd-badge offline" id="ulxdBadge">ULXD OFFLINE</span>
          <div style="display:flex;gap:0;">
            <button class="view-toggle-btn active" id="viewBtnGrid" onclick="setChannelView('grid')">GRID</button>
            <button class="view-toggle-btn" id="viewBtnStrips" onclick="setChannelView('strips')">STRIPS</button>
          </div>
          <button class="btn sm" id="addChannelBtn" onclick="addChannel()">+ Add channel</button>
        </div>
        <div id="groupFilterRow" style="display:none;"></div>
      </div>
```

- [ ] **Step 3: Commit**

```bash
git add broadway-audio-app.html
git commit -m "add group filter row HTML and CSS to channels header"
```

---

## Task 3: Add filter state, renderGroupFilters(), and clear-on-nav

Add the module-level `gridGroupFilter` Set, the `renderGroupFilters()` function, and clear the filter when navigating away from the CH page.

**Files:**
- Modify: `broadway-audio-app.html` (~line 2085, ~2119, ~2328)

- [ ] **Step 1: Add gridGroupFilter module variable**

Find the state declaration area (~line 2085 where `state` is defined). Just after the `let state = { ... }` block, add:

```js
let gridGroupFilter = new Set();   // active group filter keys for channel grid
```

- [ ] **Step 2: Clear filter when leaving channels page**

Find `showPage()` (~line 2119):
```js
  const leaving = currentPage;
  currentPage = p;
  if (p === 'channels') { startULXDPoll(); renderChannels(); if ((state.channelView || 'grid') === 'strips') { startFaderPoll(); startMeterPoll(); } }
  else if (leaving === 'channels') { stopULXDPoll(); stopFaderPoll(); stopMeterPoll(); }
```

Replace `else if (leaving === 'channels') { stopULXDPoll(); stopFaderPoll(); stopMeterPoll(); }` with:
```js
  else if (leaving === 'channels') { stopULXDPoll(); stopFaderPoll(); stopMeterPoll(); gridGroupFilter.clear(); }
```

- [ ] **Step 3: Add renderGroupFilters() function**

Add this function near `renderChannels()` (~line 2328):

```js
function renderGroupFilters() {
  const row = document.getElementById('groupFilterRow');
  if (!row) return;
  const dcaGroups  = new Set();
  const muteGroups = new Set();
  state.channels.forEach(ch => {
    (ch.dcaGroups  || []).forEach(g => dcaGroups.add(String(g)));
    (ch.muteGroups || []).forEach(g => muteGroups.add(String(g)));
  });
  if (dcaGroups.size === 0 && muteGroups.size === 0) {
    row.style.display = 'none';
    row.innerHTML = '';
    return;
  }
  row.style.display = 'flex';
  const btns = [];
  [...dcaGroups].sort().forEach(g => {
    const key = 'dca:' + g;
    const active = gridGroupFilter.has(key);
    btns.push(`<button class="group-filter-btn${active ? ' active-dca' : ''}" onclick="toggleGroupFilter('dca','${esc(g)}')" data-key="${key}">DCA ${esc(g)}</button>`);
  });
  [...muteGroups].sort().forEach(g => {
    const key = 'mut:' + g;
    const active = gridGroupFilter.has(key);
    btns.push(`<button class="group-filter-btn${active ? ' active-mut' : ''}" onclick="toggleGroupFilter('mut','${esc(g)}')" data-key="${key}">MUT ${esc(g)}</button>`);
  });
  row.innerHTML = btns.join('');
}

function toggleGroupFilter(type, group) {
  const key = type + ':' + group;
  if (gridGroupFilter.has(key)) gridGroupFilter.delete(key);
  else gridGroupFilter.add(key);
  renderChannels();
}
```

- [ ] **Step 4: Call renderGroupFilters() from renderChannels()**

At the top of `renderChannels()` (the function that starts ~line 2328), add a call to `renderGroupFilters()` and apply the filter. The function currently starts:

```js
  renderStrip();
  const view = state.channelView || 'grid';
  document.getElementById('channelGridBody').style.display  = view === 'grid'   ? '' : 'none';
  document.getElementById('channelStrips').style.display    = view === 'strips' ? 'flex' : 'none';
  document.getElementById('viewBtnGrid').classList.toggle('active', view === 'grid');
  document.getElementById('viewBtnStrips').classList.toggle('active', view === 'strips');

  if (view === 'strips') { renderChannelStrips(); return; }

  const grid = document.getElementById('channelGrid');
  if (state.channels.length === 0) {
    grid.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px;grid-column:1/-1;">No channels. Add channels or load demo show from Settings.</div>';
    return;
  }
  grid.innerHTML = state.channels.map((ch, i) => {
```

Replace the last three lines with:
```js
  renderGroupFilters();
  const grid = document.getElementById('channelGrid');
  const filteredChannels = gridGroupFilter.size === 0
    ? state.channels
    : state.channels.filter(ch =>
        (ch.dcaGroups  || []).some(g => gridGroupFilter.has('dca:' + g)) ||
        (ch.muteGroups || []).some(g => gridGroupFilter.has('mut:' + g))
      );
  if (filteredChannels.length === 0) {
    grid.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px;grid-column:1/-1;">No channels match the selected filters.</div>';
    return;
  }
  grid.innerHTML = filteredChannels.map((ch, i) => {
    const i_orig = state.channels.indexOf(ch);
```

Then update the `onclick="editChannel(${i})"` call inside the `.map()` to use `i_orig` instead of `i`:
```js
    return `<div class="channel-card ${statusClass}" onclick="editChannel(${i_orig})">
```

The full updated renderChannels grid section:
```js
  renderGroupFilters();
  const grid = document.getElementById('channelGrid');
  if (state.channels.length === 0) {
    grid.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px;grid-column:1/-1;">No channels. Add channels or load demo show from Settings.</div>';
    return;
  }
  const filteredChannels = gridGroupFilter.size === 0
    ? state.channels
    : state.channels.filter(ch =>
        (ch.dcaGroups  || []).some(g => gridGroupFilter.has('dca:' + g)) ||
        (ch.muteGroups || []).some(g => gridGroupFilter.has('mut:' + g))
      );
  if (filteredChannels.length === 0) {
    grid.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px;grid-column:1/-1;">No channels match the selected filters.</div>';
    return;
  }
  grid.innerHTML = filteredChannels.map((ch) => {
    const i_orig = state.channels.indexOf(ch);
    const statusClass = ch.status || 'active';
    const dca  = ch.dcaGroups  || [];
    const mute = ch.muteGroups || [];
    let groupsHtml = '';
    if (dca.length > 0 || mute.length > 0) {
      groupsHtml = '<div class="ch-groups">';
      dca.forEach(g  => { groupsHtml += `<span class="ch-group-badge ch-dca-badge">DCA ${esc(g)}</span>`; });
      mute.forEach(g => { groupsHtml += `<span class="ch-group-badge ch-mut-badge">MUT ${esc(g)}</span>`; });
      groupsHtml += '</div>';
    }
    return `<div class="channel-card ${statusClass}" onclick="editChannel(${i_orig})">
      <div class="ch-row">
        <div class="ch-num">CH${ch.num || (i_orig+1)}</div>
        <div class="ch-status ${statusClass}"></div>
      </div>
      <div class="ch-actor">${esc(ch.actor || 'Unassigned')}</div>
      <div class="ch-char">${esc(ch.character || '—')}</div>
      <div class="ch-freq">${esc(ch.freq || '')}</div>
      ${groupsHtml}
      ${cardTelemetry(ch.num || (i_orig+1), ch.freq)}
    </div>`;
  }).join('');
```

- [ ] **Step 5: Manual verification**

Open `broadway-audio-app.html` in a browser. Load demo show from Settings. Navigate to CH page (grid view).

Expected: filter row hidden (demo show likely has no groups).

Edit a channel → add `1` to DCA groups field → save. Expected: DCA 1 button appears. Click it — only that channel shows. Click again — all channels show. Add MUT group to another channel → MUT 1 button appears. With both active → both channels show (OR logic).

Navigate away to Scenes, back to CH. Expected: filter buttons reset (none active, all channels visible).

- [ ] **Step 6: Commit**

```bash
git add broadway-audio-app.html
git commit -m "add multi-select group filter buttons to channel grid"
```

---

## Task 4: Remove DCA/MUT badges from strips and reduce strip-info height

Remove the badge row from `renderChannelStrips()` and clean up the now-dead CSS.

**Files:**
- Modify: `broadway-audio-app.html` (~line 1290–1365 CSS, ~line 2518–2544 JS)

- [ ] **Step 1: Remove badge HTML from renderChannelStrips()**

In `renderChannelStrips()` (~line 2518–2544), find and remove the entire badge construction block:

```js
    // Group badges — cap at 2 each, show +N for overflow
    const dca  = ch.dcaGroups  || [];
    const mute = ch.muteGroups || [];
    const dcaBadges = dca.slice(0,2).map(g=>`<span class="strip-group-badge strip-dca-badge">${esc(g)}</span>`).join('');
    const dcaMore   = dca.length > 2 ? `<span style="font-family:var(--mono);font-size:7px;color:var(--text3)">+${dca.length-2}</span>` : '';
    const mutBadges = mute.slice(0,2).map(g=>`<span class="strip-group-badge strip-mut-badge">${esc(g)}</span>`).join('');
    const mutMore   = mute.length > 2 ? `<span style="font-family:var(--mono);font-size:7px;color:var(--text3)">+${mute.length-2}</span>` : '';
    let badgesHtml = '';
    if (dca.length > 0)  badgesHtml += `<span class="strip-group-label strip-dca-label">DCA</span>${dcaBadges}${dcaMore}`;
    if (mute.length > 0) badgesHtml += `<span class="strip-group-label strip-mut-label">MUT</span>${mutBadges}${mutMore}`;
```

Delete all of the above.

Also remove the `<div class="strip-info-badges">${badgesHtml}</div>` line from the template literal in the return statement.

- [ ] **Step 2: Update .strip-info height**

Find in CSS (~line 1291):
```css
  .strip-info {
    height: 96px;
```

Change to:
```css
  .strip-info {
    height: 80px;
```

- [ ] **Step 3: Remove dead CSS rules**

Remove these CSS blocks entirely:

```css
  .strip-info-badges {
    display: flex;
    gap: 2px;
    align-items: center;
    height: 20px;
    flex-shrink: 0;
    overflow: hidden;
  }
```

```css
  .strip-group-label { font-family: var(--mono); font-size: 7px; font-weight: 700; letter-spacing: 0.04em; margin-right: 1px; }
  .strip-group-badge { font-family: var(--mono); font-size: 7px; font-weight: 700; padding: 0px 2px; border: 1px solid; }
  .strip-dca-label  { color: var(--amber); }
  .strip-dca-badge  { color: var(--amber); border-color: var(--amber); }
  .strip-mut-label  { color: var(--red); }
  .strip-mut-badge  { color: var(--red); border-color: var(--red); }
```

Also remove the old horizontal-bar CSS (strips only — do NOT remove the grid card badge CSS which uses `.ch-dca-badge` / `.ch-mut-badge`):

```css
  .strip-hbar-label {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--text3);
    line-height: 1;
    margin-bottom: 2px;
    letter-spacing: 0.04em;
  }
  .strip-hbar-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .strip-hbar-seg {
    height: 7px;
    width: 100%;
    background: var(--bg3);
    flex-shrink: 0;
    transition: background 0.2s;
  }
  .strip-hbar-seg.lit-green { background: var(--green); }
  .strip-hbar-seg.lit-amber { background: var(--amber); }
  .strip-hbar-seg.lit-red   { background: var(--red); }
```

- [ ] **Step 4: Manual verification**

Open in browser, go to STRIPS view. Expected: strips render without DCA/MUT badges, info section is slightly shorter. No JS errors in console.

- [ ] **Step 5: Commit**

```bash
git add broadway-audio-app.html
git commit -m "remove DCA/MUT badges from strips, reduce strip-info height to 80px"
```

---

## Task 5: Add battery icon and RF dots to strips

Replace the old BAT/RF horizontal bars with a classic battery icon (left half) and 5 RF dots (right half).

**Files:**
- Modify: `broadway-audio-app.html` (~line 1303–1315 CSS, ~line 2499–2516 JS)

- [ ] **Step 1: Update .strip-info-rf-bat and .strip-bat-half/.strip-rf-half CSS**

Find (~line 1303):
```css
  .strip-info-rf-bat {
    display: flex;
    gap: 4px;
    align-items: flex-start;
    height: 54px;
    flex-shrink: 0;
  }
  .strip-bat-half, .strip-rf-half {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
```

Replace with:
```css
  .strip-info-rf-bat {
    display: flex;
    gap: 4px;
    align-items: center;
    flex: 1;
    flex-shrink: 0;
    min-height: 0;
  }
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

- [ ] **Step 2: Add battery icon CSS**

After the rules above, add:
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

- [ ] **Step 3: Add RF dot CSS**

After the battery CSS, add:
```css
  .strip-rf-label {
    font-family: var(--mono);
    font-size: 8px;
    color: var(--text3);
    line-height: 1;
    letter-spacing: 0.04em;
  }
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

- [ ] **Step 4: Replace BAT/RF HTML in renderChannelStrips()**

Find the current BAT/RF construction block (~line 2499–2516):
```js
    // RF indicator — 3 horizontal segs, fill from bottom
    const rfLevel = rf !== null ? (rf > 60 ? 3 : rf > 30 ? 2 : 1) : 0;
    const rfCls   = rfLevel === 3 ? 'lit-green' : rfLevel === 2 ? 'lit-amber' : 'lit-red';
    let rfSegs = '';
    for (let i = 1; i <= 3; i++) {
      const lit = rfLevel > 0 && rfLevel >= (4 - i);
      rfSegs += `<div class="strip-hbar-seg${lit ? ' '+rfCls : ''}"></div>`;
    }

    // Battery indicator — 5 horizontal segs, fill from bottom
    const battCls = batt !== null ? (batt >= 3 ? 'lit-green' : batt === 2 ? 'lit-amber' : 'lit-red') : '';
    let battSegs = '';
    for (let i = 1; i <= 5; i++) {
      const lit = batt !== null && batt >= (6 - i);
      battSegs += `<div class="strip-hbar-seg${lit ? ' '+battCls : ''}"></div>`;
    }
    const rfBatHtml = `<div class="strip-bat-half"><div class="strip-hbar-label">BAT</div><div class="strip-hbar-row">${battSegs}</div></div><div class="strip-rf-half"><div class="strip-hbar-label">RF</div><div class="strip-hbar-row">${rfSegs}</div></div>`;
```

Replace with:
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

- [ ] **Step 5: Manual verification**

Open in browser, go to STRIPS view.

Expected without ULXD data:
- Left half: empty battery icon (rectangle outline + nub, 5 grey segments)
- Right half: "RF" label above 5 grey circles
- No DCA/MUT badges
- Frequency text below

To test with data, add to browser console:
```js
ulxdData[1] = { batt_bars: 4, rf_level: -75, frequency: null, chan_name: null };
renderChannelStrips();
```
Expected: 4 green battery segments, 4 amber RF dots.

```js
ulxdData[1] = { batt_bars: 2, rf_level: -88, frequency: null, chan_name: null };
renderChannelStrips();
```
Expected: 2 amber battery segments, 2 amber RF dots.

```js
ulxdData[1] = { batt_bars: 1, rf_level: -95, frequency: null, chan_name: null };
renderChannelStrips();
```
Expected: 1 red battery segment, 1 amber RF dot.

- [ ] **Step 6: Commit**

```bash
git add broadway-audio-app.html
git commit -m "add battery icon + RF dots to strips, remove old horizontal bars"
```

---

## Task 6: Final verification and push

- [ ] **Step 1: Full end-to-end check**

Open `broadway-audio-app.html`. Run through the complete testing checklist:

1. **Grid filters:** Load demo show → CH page. No filter row (no groups). Edit a channel, add `1` to DCA groups. Save. DCA 1 button appears. Click → only that channel shows. Click again → all show. Add `2` to MUT groups on another channel. Both DCA 1 and MUT 1 appear. Click both → union shows. Navigate away → navigate back → filter reset.

2. **Strips battery:** STRIPS view. Console `ulxdData[1] = { batt_bars: 5, rf_level: -65, frequency: null, chan_name: null }; renderChannelStrips()` → 5 green battery segments.

3. **Strips RF dots:** Same console test → 5 amber RF dots (rf > -70 → 5 dots).

4. **No DCA/MUT badges in strips:** Confirm no group labels visible in strips.

5. **Frequency still shows:** Confirm freq text below battery/RF section.

6. **Alignment:** All strips same height, no overflow, no clipping.

- [ ] **Step 2: Push**

```bash
git push origin main
```
