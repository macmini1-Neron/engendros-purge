# Poker Den — Juice & Chip-Physics Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the poker den's snapshot renderer into a persistent, event-driven, lightly-animated 3D table that renders the REAL conserved chip count, with audio + reveal + win "juice" — grounded in the 2026-06-14 gambling-psychology research.

**Architecture:** Physics/animation are PRESENTATION ONLY — `holdem.js`/`chipbank.js`/`pot.js` stay integer + host-authoritative; the 3D layer replays authoritative state *transitions* as physical events, and every animation's rest pose is derived from the authoritative snapshot (interrupted animations snap to the new target). The render gains three new pure-logic spines under `src/poker/` (node-tested): a **diff→events** deriver, a **chip-layout** solver, and **easing/tween** helpers; the THREE glue in `src/poker-*.js` consumes them and is verified in-browser.

**Tech Stack:** Vanilla ES modules, Three.js r160 (vendored), `BufferGeometryUtils` (vendored), procedural Web Audio (`src/audio.js`), `node --test` for pure logic, `poker-*-dev.html` browser harnesses for the THREE layer.

**Research basis:** `docs/superpowers/specs/2026-06-14-poker-juice-psychology-research.md`. The features here implement findings A1 (one-more-hand loop), B2 (staggered ~300 ms reveal), B3 (card lift+thickness), C1/C2 (juice stack + audio-pitch sync — *highest ROI*), C4 (chip randomization), and the §E ethical guardrails (celebration only on NET wins, no anchored buy-in, no cash-out sludge).

---

## Scope & Sequencing

This is ONE program in **6 phases**, but each phase is a shippable PR on its own:

- **Phase 0 — Foundations** (chip model simplify → instancing → persistent entities → event deriver → animator tick). The gate: unblocks everything. Ship as its own PR.
- **Phase 1 — Audio** (SFX on events). Highest ROI per the research; depends only on the event deriver.
- **Phase 2 — Chip realism** (randomized placement within real count; chip-move arcs; pot splash).
- **Phase 3 — Card animations** (lift-flip on deal; staggered showdown reveal).
- **Phase 4 — Win juice** (pot counter roll-up + pitch sweep + screen shake + particle burst — NET wins only).
- **Phase 5 — Ethical guardrails** (gate celebration to net win; un-anchor buy-in default; no cash-out friction).

Phases 0–1 are fully specified below and immediately executable. Phases 2–5 are scoped into concrete tasks; their exact integration points firm up once Phase 0 lands (noted per task). **Do not start a later phase before its prerequisite phase is browser-verified.**

---

## File Structure

**New pure-logic modules (node-tested, no THREE/DOM):**
- `src/poker/pokerevents.js` — `derivePokerEvents(prevView, nextView, prevChips, nextChips)` → ordered event list. The spine for audio + animation.
- `src/poker/chiplayout.js` — `layoutChips(chipSet, opts)` → array of `{denom, x, y, z, rot}` placements (exact real count, column-wrapped, seeded jitter). Pure math lifted out of `poker-chips.js`.
- `src/poker/anim.js` — easing (`easeOutBack`, `easeOutCubic`), `Tween` value-stepper, `seededJitter(seed)`. Pure.
- `src/poker/colorup.js` — `colorUp(chipSet, floatSet)` → value-neutral consolidation of many small chips into fewer large ones (keeps real count bounded over a long session).

**New THREE modules (browser-verified):**
- `src/poker-chip-mesh.js` — single merged low-poly chip geometry + baked CanvasTexture per denomination; `chipInstanced(denom, capacity)` → an `InstancedMesh` ready to position N real chips.

**Modified:**
- `src/poker-chips.js` — swap per-chip `Group` build for the merged-geometry + InstancedMesh path; keep the `makeChipTray`/`setChipTray` public API.
- `src/poker-scene.js` — persistent entity pools, animator tick in `render(dt)`, event-driven audio/animation, win juice, NET-win gating.
- `src/poker-cards.js` — add a `flipTo(card, faceUp, t)` animation helper (lift + rotate + settle).
- `src/audio.js` — add `pokerDeal()`, `pokerChip(pitch)`, `pokerPotSlide()`, `pokerWin(level)` procedural SFX.
- `poker-cam-dev.html` (or a new `poker-chips-dev.html`) — exercise the instanced chip tray + a scripted bet→pot animation for visual verification.

---

## Phase 0 — Foundations

### Task 0.1: Chip-layout solver (pure, extracted from poker-chips.js)

**Files:**
- Create: `src/poker/chiplayout.js`
- Test: `tests/poker/chiplayout.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/poker/chiplayout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutChips, CHIP_T, COL_CAP } from '../../src/poker/chiplayout.js';

test('exact real count: one placement per physical chip', () => {
  const set = { 100: 3, 25: 0, 5: 7 };
  assert.equal(layoutChips(set).length, 10); // 3 + 7, never approximated
});

test('column cap wraps a tall denom into extra columns, never drops chips', () => {
  const set = { 5: COL_CAP * 2 + 3 };
  const p = layoutChips(set);
  assert.equal(p.length, COL_CAP * 2 + 3);
  const cols = new Set(p.map((c) => c.x.toFixed(4)));
  assert.equal(cols.size, 3); // three columns: cap, cap, 3
});

test('chips in a column stack by thickness', () => {
  const p = layoutChips({ 5: 3 });
  assert.equal(p[0].y, 0);
  assert.ok(Math.abs(p[1].y - CHIP_T) < 1e-9 + 0.001); // one chip-thickness up (+gap)
});

test('jitter is seeded + deterministic (same seed → same offsets)', () => {
  const a = layoutChips({ 100: 5 }, { jitter: 0.002, seed: 42 });
  const b = layoutChips({ 100: 5 }, { jitter: 0.002, seed: 42 });
  assert.deepEqual(a, b);
  const c = layoutChips({ 100: 5 }, { jitter: 0.002, seed: 7 });
  assert.notDeepEqual(a, c);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/poker/chiplayout.test.mjs`
Expected: FAIL — `Cannot find module '.../chiplayout.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/poker/chiplayout.js
// Pure layout math for a real ChipSet → exact per-chip placements. No THREE.
// Lifted out of poker-chips.js so it is node-testable. Mirrors the old grid:
// one column per denomination, COL_CAP chips/column, overflow wraps to more
// columns, rows wrap back in depth. Optional SEEDED jitter (research C4: messy
// stacks read more physical than a perfect grid) — seeded so a rebuild at the
// same state is stable (no shimmer).
import { DENOMS } from './chipbank.js';

export const CHIP_R = 0.020, CHIP_T = 0.0033, CHIP_GAP = 0.0006;
export const COL_CAP = 18;
const COL_GAP = 2 * CHIP_R + 0.0012, ROW_GAP = 2 * CHIP_R + 0.0016, COLS_PER_ROW = 6;

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function layoutChips(chipSet, opts = {}) {
  const { jitter = 0, seed = 1 } = opts;
  const rnd = mulberry32(seed);
  const cols = [];
  for (const denom of DENOMS) {
    let rem = (chipSet && chipSet[denom]) || 0;
    while (rem > 0) { const n = Math.min(rem, COL_CAP); cols.push({ denom, n }); rem -= n; }
  }
  const rows = Math.ceil(cols.length / COLS_PER_ROW) || 1;
  const out = [];
  cols.forEach((c, idx) => {
    const row = Math.floor(idx / COLS_PER_ROW);
    const inRow = Math.min(COLS_PER_ROW, cols.length - row * COLS_PER_ROW);
    const baseX = (idx % COLS_PER_ROW - (inRow - 1) / 2) * COL_GAP;
    const baseZ = (row - (rows - 1) / 2) * ROW_GAP;
    for (let i = 0; i < c.n; i++) {
      const jx = jitter ? (rnd() - 0.5) * 2 * jitter : 0;
      const jz = jitter ? (rnd() - 0.5) * 2 * jitter : 0;
      const jr = jitter ? (rnd() - 0.5) * 0.14 : 0; // ±~4° lean
      out.push({ denom: c.denom, x: baseX + jx, y: i * (CHIP_T + CHIP_GAP), z: baseZ + jz, rot: jr });
    }
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/poker/chiplayout.test.mjs`
Expected: PASS (4 tests). If the `CHIP_T` stack test is off by the gap, the assertion already tolerates `+0.001`.

- [ ] **Step 5: Commit**

```bash
git add src/poker/chiplayout.js tests/poker/chiplayout.test.mjs
git commit -m "feat(poker): pure chip-layout solver (exact real count + seeded jitter)"
```

---

### Task 0.2: Color-up consolidation (pure, keeps real count bounded)

**Files:**
- Create: `src/poker/colorup.js`
- Test: `tests/poker/colorup.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/poker/colorup.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { value } from '../../src/poker/chipbank.js';
import { colorUp } from '../../src/poker/colorup.js';

test('color-up is value-neutral for the player and the float together', () => {
  const set = { 5: 23 }; // 115 in twenty-three white chips
  const float = { 100: 5, 50: 5, 10: 5, 5: 0 };
  const { set: up, float: f2 } = colorUp(set, float);
  assert.equal(value(up) + value(f2), value(set) + value(float)); // conserved
  assert.ok(up[5] < 23); // fewer small chips
});

test('color-up never raises a denom it cannot back from the float', () => {
  const set = { 5: 4 }; // 20, but float has no 10/20 to give
  const float = {};
  const { set: up } = colorUp(set, float);
  assert.deepEqual(up, { 5: 4 }); // unchanged when float cannot supply larger chips
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/poker/colorup.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/poker/colorup.js
// Value-neutral consolidation: trade a player's surplus of small chips for fewer
// large chips against the dealer float, so the REAL physical count stays bounded
// over a long session (a real casino "color up"). Reuses chipbank's exact-change
// machinery; the inverse of makeChange's break-down. Conserves total value.
import { DENOMS, value, exactSubset, addSet, subSet, cloneSet } from './chipbank.js';

const ASC = [...DENOMS].sort((a, b) => a - b);

export function colorUp(set0, float0) {
  let set = cloneSet(set0), float = cloneSet(float0);
  // Walk small→large; whenever the player holds enough small chips to form one
  // larger denom AND the float can supply that larger chip, swap them.
  for (let i = 0; i < ASC.length - 1; i++) {
    const small = ASC[i], big = ASC[i + 1];
    let guard = 1000;
    while (guard-- > 0) {
      const need = exactSubset(set, big);          // `big` worth of the player's chips
      if (!need || !(float[big] > 0)) break;
      // do not consume the very chip we're making (need must be smaller denoms only)
      if (need[big]) break;
      set = subSet(set, need);
      set = addSet(set, { [big]: 1 });
      float = addSet(float, need);
      float = subSet(float, { [big]: 1 });
    }
  }
  return { set, float };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/poker/colorup.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/poker/colorup.js tests/poker/colorup.test.mjs
git commit -m "feat(poker): value-neutral color-up to bound the real chip count"
```

> **Integration note (later):** call `colorUp` per player at hand settle inside the chipbank wiring in `poker-table.js`, AFTER `reconcile`, guarded by `hostSim`. Add that one-line call + a `verify()` assert in a follow-up once Phase 0 renders; do not wire it before the renderer can show the result.

---

### Task 0.3: Event deriver (pure, the spine for audio + animation)

**Files:**
- Create: `src/poker/pokerevents.js`
- Test: `tests/poker/pokerevents.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/poker/pokerevents.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePokerEvents } from '../../src/poker/pokerevents.js';

const view = (o) => ({ board: [], seats: [], pot: 0, ...o });

test('a new community card emits boardCard with its index', () => {
  const ev = derivePokerEvents(view({ board: [{ r: 5, s: 'h' }] }),
                               view({ board: [{ r: 5, s: 'h' }, { r: 9, s: 'd' }] }));
  assert.deepEqual(ev.filter((e) => e.t === 'boardCard'), [{ t: 'boardCard', index: 1 }]);
});

test('a bet emits chipMove from seat→bet with per-denom counts', () => {
  const prev = { stacks: { A: { 100: 2 } }, bets: { A: {} }, pot: {} };
  const next = { stacks: { A: { 100: 1 } }, bets: { A: { 100: 1 } }, pot: {} };
  const ev = derivePokerEvents(view(), view(), prev, next);
  assert.deepEqual(ev.find((e) => e.t === 'chipMove'),
    { t: 'chipMove', from: 'A', to: 'pot', moves: { 100: 1 } });
});

test('a NET win emits potAward with net=true; a refund/split below stake does not', () => {
  const winBig = derivePokerEvents(
    view({ seats: [{ id: 'A', stack: 100 }] }),
    view({ seats: [{ id: 'A', stack: 300 }] }),
    null, null, { winnings: { A: 200 }, contributed: { A: 50 } });
  assert.equal(winBig.find((e) => e.t === 'potAward').net, true);

  const refund = derivePokerEvents(
    view({ seats: [{ id: 'A', stack: 100 }] }),
    view({ seats: [{ id: 'A', stack: 130 }] }),
    null, null, { winnings: { A: 30 }, contributed: { A: 50 } });
  assert.equal(refund.find((e) => e.t === 'potAward').net, false); // got back LESS than staked
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/poker/pokerevents.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/poker/pokerevents.js
// Diff two poker view/chip snapshots → an ordered list of discrete presentation
// events. PURE (no THREE/DOM): the same host-authoritative snapshots produce the
// same events on every client, so animation/audio choreography needs no extra
// network traffic. The renderer consumes these; it never invents game state.
//
// Event shapes:
//   { t:'boardCard', index }                         a community card turned up
//   { t:'holeReveal', id, index }                    a hole card shown at showdown
//   { t:'chipMove', from, to, moves:{denom:count} }  physical chips relocated
//   { t:'potAward', id, amount, net:boolean }        pot pushed to a winner;
//                                                     net=true ONLY if amount > that
//                                                     player's contribution (research §E:
//                                                     never celebrate a refund/sub-stake split)
import { DENOMS, sigOf } from './chipbank.js';

const cardKey = (c) => c.r + c.s;

function denomDelta(before = {}, after = {}) {
  const moves = {};
  for (const d of DENOMS) { const g = (after[d] || 0) - (before[d] || 0); if (g > 0) moves[d] = g; }
  return Object.keys(moves).length ? moves : null;
}

export function derivePokerEvents(prevView, nextView, prevChips, nextChips, result) {
  const ev = [];
  const pv = prevView || { board: [], seats: [] }, nv = nextView || { board: [], seats: [] };

  // community cards added since last snapshot
  for (let i = (pv.board || []).length; i < (nv.board || []).length; i++) ev.push({ t: 'boardCard', index: i });

  // hole cards newly visible (showdown)
  const ph = new Map((pv.seats || []).map((s) => [s.id, s.hole ? s.hole.map(cardKey).join('') : '']));
  for (const s of nv.seats || []) {
    const before = ph.get(s.id) || '';
    if (s.hole && s.hole.map(cardKey).join('') !== before) s.hole.forEach((_, i) => ev.push({ t: 'holeReveal', id: s.id, index: i }));
  }

  // physical chip relocations: any seat whose bet grew (stack shrank) → chips to its bet/pot
  if (prevChips && nextChips) {
    for (const id in nextChips.bets || {}) {
      const moves = denomDelta(prevChips.bets?.[id], nextChips.bets?.[id]);
      if (moves) ev.push({ t: 'chipMove', from: id, to: 'pot', moves });
    }
    const potMoves = denomDelta(prevChips.pot, nextChips.pot);
    if (potMoves && !ev.some((e) => e.t === 'chipMove')) ev.push({ t: 'chipMove', from: 'bets', to: 'pot', moves: potMoves });
  }

  // pot award + NET gate (the ethical guardrail, research §E)
  if (result && result.winnings) {
    const contributed = result.contributed || {};
    for (const id in result.winnings) {
      const amount = result.winnings[id] || 0;
      if (amount > 0) ev.push({ t: 'potAward', id, amount, net: amount > (contributed[id] || 0) });
    }
  }
  return ev;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/poker/pokerevents.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/poker/pokerevents.js tests/poker/pokerevents.test.mjs
git commit -m "feat(poker): pure snapshot→events deriver (chip moves, reveals, NET-win gate)"
```

> **Integration note:** the engine must expose `result.contributed` (each player's total chips put in this hand) for the NET gate. If absent, derive it in `poker-table.js` from the chipbank at hand start vs. award. Add a tiny test there when wiring Phase 4.

---

### Task 0.4: Easing + tween helpers (pure)

**Files:**
- Create: `src/poker/anim.js`
- Test: `tests/poker/anim.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/poker/anim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeOutCubic, easeOutBack, Tween } from '../../src/poker/anim.js';

test('easings hit their endpoints', () => {
  assert.equal(easeOutCubic(0), 0); assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutBack(0), 0); assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-9);
});

test('easeOutBack overshoots past 1 before settling (the satisfying bounce)', () => {
  let peak = 0; for (let p = 0; p <= 1; p += 0.01) peak = Math.max(peak, easeOutBack(p));
  assert.ok(peak > 1.0);
});

test('Tween reports done after its duration and clamps progress', () => {
  const tw = new Tween(0.3);
  tw.step(0.1); assert.ok(!tw.done && tw.p > 0);
  tw.step(0.5); assert.ok(tw.done && tw.p === 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/poker/anim.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/poker/anim.js — pure animation math (no THREE). Browser glue lerps THREE
// vectors with these; node tests cover the curves + the stepper.
export const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
export function easeOutBack(p) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }

export class Tween {
  constructor(dur, delay = 0) { this.dur = Math.max(1e-4, dur); this.delay = delay; this.t = 0; }
  step(dt) {
    this.t += dt;
    const active = Math.max(0, this.t - this.delay);
    this.p = Math.min(1, active / this.dur);
    this.done = this.t >= this.delay + this.dur;
    return this.p;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/poker/anim.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/poker/anim.js tests/poker/anim.test.mjs
git commit -m "feat(poker): pure easing + tween stepper for the table animator"
```

---

### Task 0.5: Simplified single-mesh chip + InstancedMesh (THREE, browser-verified)

**Files:**
- Create: `src/poker-chip-mesh.js`
- Modify: `src/poker-chips.js`
- Verify: `poker-cam-dev.html` (load it, eyeball a mixed tray)

- [ ] **Step 1: Build the merged low-poly chip geometry + baked texture**

Create `src/poker-chip-mesh.js`. The chip becomes ONE 16-segment cylinder (was: cylinder + torus + 6 boxes = 8 meshes) with the inlay ring + 6 "dice" edge spots BAKED into a CanvasTexture, so it is instanceable. Two colours (body + spot) live in the texture, one material per denomination.

```js
// src/poker-chip-mesh.js — instanceable dice-chip: ONE low-poly cylinder whose top
// ring + 6 edge spots are painted into a CanvasTexture (was 8 separate meshes). One
// geometry shared by all denominations; one texture+material PER denomination colour.
import * as THREE from 'three';

const R = 0.020, T = 0.0033, SEG = 16;
export const CHIP_GEO_T = T;
const DICE = {
  5: { body: '#e8e8e8', spot: '#24408f' }, 10: { body: '#2a52b0', spot: '#f0f0f0' },
  20: { body: '#b02828', spot: '#f0f0f0' }, 50: { body: '#1f8040', spot: '#f0f0f0' },
  100: { body: '#1a1a1a', spot: '#f0f0f0' }, 500: { body: '#d8b84a', spot: '#141414' },
};

let _geo = null;
function chipGeometry() {
  if (_geo) return _geo;
  // top/side/bottom share one UV-mapped cylinder; the canvas paints top face + edge band
  _geo = new THREE.CylinderGeometry(R, R, T, SEG);
  return _geo;
}
function chipTexture(denom) {
  const c = DICE[denom] || DICE[100];
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = c.body; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = c.spot; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(64, 64, 40, 0, Math.PI * 2); ctx.stroke();    // inlay ring
  ctx.fillStyle = c.spot;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.arc(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54, 7, 0, Math.PI * 2); ctx.fill(); } // 6 "dice" spots
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

const _matCache = {};
export function chipMaterial(denom) {
  if (!_matCache[denom]) _matCache[denom] = new THREE.MeshLambertMaterial({ map: chipTexture(denom) });
  return _matCache[denom];
}

// One InstancedMesh per denomination, pre-allocated for `capacity` chips. The scene
// sets instance matrices from chiplayout.js placements; unused instances are scaled to 0.
export function chipInstanced(denom, capacity) {
  const m = new THREE.InstancedMesh(chipGeometry(), chipMaterial(denom), capacity);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  return m;
}
```

- [ ] **Step 2: Re-point `poker-chips.js` `setChipTray` at the instanced path**

In `src/poker-chips.js`, keep the public API (`makeChipTray`, `setChipTray`, `makeChipStack`, `setChipStack`, `CHIP_SIZE`) but build instances instead of per-chip Groups. Use `layoutChips` for placement.

```js
// src/poker-chips.js  (replace the per-chip Group body of setChipTray)
import * as THREE from 'three';
import { breakdown } from './poker/chips.js';
import { DENOMS, sigOf } from './poker/chipbank.js';
import { layoutChips } from './poker/chiplayout.js';
import { chipInstanced } from './poker-chip-mesh.js';

const _dummy = new THREE.Object3D();

export function makeChipTray(chipSet, opts) { const g = new THREE.Group(); setChipTray(g, chipSet, opts); return g; }

export function setChipTray(group, chipSet, opts = {}) {
  chipSet = chipSet || {};
  const sig = sigOf(chipSet) + '|' + (opts.jitter || 0) + '|' + (opts.seed || 0);
  if (group.userData.sig === sig) return group;
  group.userData.sig = sig;
  // lazily create one InstancedMesh per denomination, sized to the column cap * a sane max
  if (!group.userData.inst) {
    group.userData.inst = {};
    for (const d of DENOMS) { const im = chipInstanced(d, 256); group.add(im); group.userData.inst[d] = im; }
  }
  const places = layoutChips(chipSet, opts);
  const counters = {};
  for (const d of DENOMS) counters[d] = 0;
  for (const p of places) {
    const im = group.userData.inst[p.denom];
    _dummy.position.set(p.x, p.y, p.z); _dummy.rotation.set(0, p.rot || 0, 0); _dummy.scale.setScalar(1);
    _dummy.updateMatrix(); im.setMatrixAt(counters[p.denom]++, _dummy.matrix);
  }
  for (const d of DENOMS) { const im = group.userData.inst[d]; im.count = counters[d]; im.instanceMatrix.needsUpdate = true; }
  return group;
}

export function makeChipStack(amount, opts) { const g = new THREE.Group(); setChipStack(g, amount, opts); return g; }
export function setChipStack(group, amount, opts) { const set = {}; for (const { denom, count } of breakdown(amount)) set[denom] = count; return setChipTray(group, set, opts); }
export const CHIP_SIZE = { r: 0.020, t: 0.0033 };
```

- [ ] **Step 3: Browser-verify the instanced tray**

Run a local server and open the chip dev harness:
```bash
python3 -m http.server 8000
# open http://localhost:8000/poker-cam-dev.html?cb=1
```
Expected: a mixed tray ($500/$100/$50/$20/$10/$5 columns) renders with correct colours, the dice ring + 6 spots read on each chip, tall denominations wrap into extra columns, and the chip count visibly equals the set. In the console: `renderer3d.info.render.calls` should be a low double-digit number for a full tray (≈ one draw call per denomination), NOT hundreds.

- [ ] **Step 4: Commit**

```bash
git add src/poker-chip-mesh.js src/poker-chips.js
git commit -m "perf(poker): single-mesh dice chip + per-denom InstancedMesh (real count, ~6 draw calls)"
```

---

### Task 0.6: Persistent entities + animator tick in the scene (THREE, browser-verified)

**Files:**
- Modify: `src/poker-scene.js`

- [ ] **Step 1: Stop nuking the world every state change — reconcile instead**

In `_updateScene`, keep the `key` diff to detect change, but instead of calling `_rebuildDyn` (full dispose+rebuild), call a new `_reconcile(p, v, ...)` that (a) keeps stable per-seat `Group`s in a `this._ent` map keyed by `seatId`, (b) updates each seat's nameplate text, card faces, and chip trays in place via `setChipTray`, and (c) only creates/removes entities when a seat joins/leaves. Keep `_rebuildDyn` available as a hard-reset fallback (e.g. on seat-count change).

Add to the constructor: `this._ent = new Map(); this._anims = []; this._prevView = null; this._prevChips = null;`

- [ ] **Step 2: Add the animator tick to `render(dt)` / `_draw`**

`render(dt)` currently just draws. Make it step active animations first:
```js
// src/poker-scene.js
render(dt) { this._stepAnims(dt || 0.016); this._draw(); }
_stepAnims(dt) {
  for (let i = this._anims.length - 1; i >= 0; i--) {
    const done = this._anims[i](dt);       // each anim is a closure returning true when finished
    if (done) this._anims.splice(i, 1);
  }
}
```
Confirm `Game._frame` passes `dt` into the poker renderer's `render`; if it calls `renderTable(p)` per frame instead, add the `_stepAnims` call at the top of `renderTable` using a stored `this._lastT`.

- [ ] **Step 3: Derive + enqueue events on each state change**

In `_updateScene`, after the `key` change is detected:
```js
import { derivePokerEvents } from './poker/pokerevents.js';
// ...
const events = derivePokerEvents(this._prevView, v, this._prevChips, p.chips, p.result);
this._onPokerEvents(events, p, v);     // Phase 1 wires audio; Phase 2/3 wire animation
this._prevView = v; this._prevChips = p.chips;
```
For Phase 0, `_onPokerEvents` is a stub that just `console.debug('[poker] events', events)`.

- [ ] **Step 4: Browser-verify no regression + events fire**

Open the game's poker den (deploy-screen POKER → solo vs bots), play a few hands. Expected: the table still renders correctly (cards, chips, pot, markers), no console errors, and `[poker] events` logs sensible `boardCard`/`chipMove`/`potAward` entries as hands progress. Chip trays update in place (no per-frame full rebuild — confirm `renderer3d.info.render.calls` stays low and stable).

- [ ] **Step 5: Commit**

```bash
git add src/poker-scene.js
git commit -m "refactor(poker): persistent seat entities + animator tick + event stream (no per-change rebuild)"
```

---

## Phase 1 — Audio (highest ROI; research C2)

### Task 1.1: Procedural poker SFX in audio.js

**Files:**
- Modify: `src/audio.js`

- [ ] **Step 1: Add four guarded procedural sounds**

Follow the existing `audio.js` conventions: every method guards `if (!this.ctx) return;`, uses the shared `AudioContext`, and synthesizes (no samples). Add:
```js
// card pitch/deal: short filtered-noise "whiff" + a soft tick on land
pokerDeal() { if (!this.ctx) return; /* white-noise burst through a bandpass ~1.8kHz, 70ms, gentle */ }
// chip clink: a short metallic/ceramic transient; pitch jittered ±semitones for anti-repetition (research C4)
pokerChip(pitch = 1) { if (!this.ctx) return; /* two detuned square/triangle blips ~ (2200*pitch)Hz, 40ms, hard decay */ }
// pot slide: low broadband shove as chips push to centre
pokerPotSlide() { if (!this.ctx) return; /* filtered noise sweep down ~400→160Hz, 220ms */ }
// win fanfare: a RISING pitch sweep whose rate scales with `level` (research C2 audio-pitch sync)
pokerWin(level = 1) { if (!this.ctx) return; /* arpeggiated rising notes C-D-E-F-G, brighter/faster at higher level */ }
```
Implement each with the same oscillator/gain/biquad pattern already used by the gunshot/explosion synths in this file (copy the envelope idiom; keep them short and dry).

- [ ] **Step 2: Browser-verify each sound from the console**

```bash
python3 -m http.server 8000   # open the game, click once to satisfy the audio gesture gate
```
In the console: `GAME.audio.pokerDeal()`, `GAME.audio.pokerChip(1)`, `GAME.audio.pokerChip(1.3)`, `GAME.audio.pokerPotSlide()`, `GAME.audio.pokerWin(1)`, `GAME.audio.pokerWin(3)`. Expected: each is audible, short, distinct; `pokerChip` audibly changes pitch with its argument; `pokerWin(3)` rises faster/brighter than `pokerWin(1)`. No console errors when `ctx` is uninitialised (call before clicking → silent, no throw).

- [ ] **Step 3: Commit**

```bash
git add src/audio.js
git commit -m "feat(audio): procedural poker SFX — deal, pitch-varied chip clink, pot slide, rising win sweep"
```

### Task 1.2: Wire events → audio in the scene

**Files:**
- Modify: `src/poker-scene.js`

- [ ] **Step 1: Replace the `_onPokerEvents` stub with audio dispatch**

```js
_onPokerEvents(events, p, v) {
  const a = this.audio || (window.GAME && window.GAME.audio); if (!a) return;
  let chipCount = 0, win = null;
  for (const e of events) {
    if (e.t === 'boardCard' || e.t === 'holeReveal') a.pokerDeal();
    else if (e.t === 'chipMove') chipCount += Object.values(e.moves).reduce((x, y) => x + y, 0);
    else if (e.t === 'potAward' && e.net) win = Math.max(win || 0, Math.min(4, 1 + Math.log10(Math.max(1, e.amount)))); // bigger pot → higher level
  }
  if (chipCount) { a.pokerPotSlide(); for (let i = 0; i < Math.min(chipCount, 6); i++) setTimeout(() => a.pokerChip(0.9 + 0.2 * Math.random()), i * 55); } // staggered clinks, pitch-varied
  if (win != null) a.pokerWin(win); // NET wins only — refunds/sub-stake splits never celebrate (research §E)
}
```
Get the `AudioManager` reference: pass the game's `audio` into the renderer (constructor `cb`/options) if available, else fall back to `window.GAME.audio`. Confirm which the codebase exposes and use that.

- [ ] **Step 2: Browser-verify in a real hand**

Play solo vs bots. Expected: cards make a deal sound as the flop/turn/river appear; bets/calls produce a pot-slide + a few pitch-varied clinks; **only a genuine net pot win** triggers the rising win sweep (verify a split pot or an all-in refund-of-overbet does NOT). No audio spam, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/poker-scene.js
git commit -m "feat(poker): event-driven SFX — deal/clink/slide/win timed to state transitions (NET-win gated)"
```

---

## Phase 2 — Chip realism (research C4 + B3)

### Task 2.1: Seeded jitter on resting trays
**Files:** Modify `src/poker-scene.js`
- [ ] Pass `{ jitter: 0.0018, seed }` into every `setChipTray`/`makeChipTray` call, with `seed` derived from the seat id + zone (stack/bet/pot) so each tray is messy-but-stable across rebuilds. The pot uses a wider jitter (`0.004`) to read as a loose "splash" heap, not neat columns.
- [ ] Browser-verify: stacks look hand-stacked (slight lean/offset), the pot is a believable loose pile, and nothing shimmers between frames (seeded → stable). Commit: `feat(poker): seeded chip jitter — hand-stacked stacks + splashed pot`.

### Task 2.2: Chip-move arcs (instance-level, simple)
**Files:** Modify `src/poker-scene.js`
- [ ] On a `chipMove` event, before applying the new tray state, spawn a short closure animation (pushed to `this._anims`) that flies up to `min(moves total, 6)` representative chip instances along an `easeOutCubic` arc from the source seat's bet position to the pot, landing on the pot-slide audio frame. Use a tiny throwaway `InstancedMesh` (or reuse `chipInstanced(denom, 6)`) for the in-flight chips; on land, remove it and let the reconciled pot tray show the real chips. Rest pose always = the authoritative tray (interrupted → snap).
- [ ] Browser-verify: a bet visibly throws a few chips to the pot; the landing clink lines up with the chip touching down; the resting counts still equal the real chipbank set. Commit: `feat(poker): chip-throw arcs on bet (cosmetic, lands on the real tray)`.

---

## Phase 3 — Card animations (research B2 + B3)

### Task 3.1: Card lift-flip helper
**Files:** Modify `src/poker-cards.js`
- [ ] Add `flipTo(cardGroup, faceUp, dur)` returning a stepper closure: phase 1 lifts the card `+0.03` on Y (`easeOutCubic`), phase 2 rotates `rotation.x` toward the target face, phase 3 settles back down with `easeOutBack` (the satisfying bounce). Uses `src/poker/anim.js`. Real card thickness already exists (`CARD_T`).
- [ ] Browser-verify in `poker-cam-dev.html`: call `flipTo` on a card; it lifts, turns, and settles with a small bounce — reads as a physical card, not a sprite snap. Commit: `feat(poker): card lift-rotate-settle flip helper`.

### Task 3.2: Staggered showdown reveal
**Files:** Modify `src/poker-scene.js`
- [ ] On showdown (`holeReveal` events present), reveal community + each winner's hole cards left→right at ~300 ms spacing using `flipTo`, each firing `pokerDeal()` on its flip frame, ending on the existing newbie hand-name readout (PR #64). Cap total reveal time (~1.5 s) so other players at a 6-max table are not stalled (research open-question Q2). Commit: `feat(poker): staggered ~300ms showdown reveal synced to deal SFX`.

---

## Phase 4 — Win juice (research C1 + C2; NET wins only)

### Task 4.1: Pot counter roll-up + pitch sweep + shake + burst
**Files:** Modify `src/poker-scene.js`
- [ ] On a `potAward` with `net === true`: (a) animate a pot-total number rolling UP (reuse the DOM banner or a 3D label) while calling `pokerWin(level)` so the rising pitch tracks the count (research C2); (b) add a brief camera-shake on `this.cam` (small positional noise decaying over ~0.3 s — mirror the engine's shake idiom but on the poker camera); (c) emit a short particle burst over the winner's stack (lightweight: a handful of textured quads tweened up + fading, or reuse a minimal instanced sparkle — this mini-scene has no main Effects pool). Reserve ALL of this for `net === true` (research §E: never on refunds/sub-stake splits).
- [ ] Browser-verify: winning a real pot rolls the counter with a rising tone, a subtle shake, and a sparkle over the winner; a split pot / overbet refund shows NONE of it. Commit: `feat(poker): NET-win juice — counter roll-up + pitch sweep + shake + sparkle`.

---

## Phase 5 — Ethical guardrails (research §E)

### Task 5.1: Verify NET-win gating end-to-end
**Files:** Test `tests/poker/pokerevents.test.mjs` (extend), Modify `poker-table.js` if `contributed` is missing
- [ ] Add tests proving: split pot below stake → `net:false`; all-in side-pot refund → `net:false`; clean win → `net:true`. If the engine lacks `result.contributed`, compute it in `poker-table.js` from chipbank deltas and pass it into the deriver. Commit: `test(poker): NET-win gate covers splits, refunds, side pots`.

### Task 5.2: Un-anchored buy-in default
**Files:** Modify `src/poker-ui.js` (buy-in entry)
- [ ] Ensure the buy-in / re-buy input defaults to a NEUTRAL value (e.g. the table minimum or an empty field), NOT a high pre-filled anchor (research §E: high anchors empirically inflate wagers, RCT n=1,731). If a suggested value is shown, make it the minimum/sensible-default, not the max. Browser-verify the default shown. Commit: `fix(poker): neutral buy-in default (no high anchor)`.

### Task 5.3: No cash-out friction
**Files:** Review `poker-table.js` / `mp.js` payout path
- [ ] Confirm end-of-session winnings settle to `meta.bank` immediately with no artificial delay, confirmation maze, or "play again to keep your chips" reverse-withdrawal nudge (research §E: cash-out sludge is a banned dark pattern). This is a review + assertion task; add a one-line comment marking the deliberate choice. Commit: `docs(poker): mark immediate cash-out to bank as a deliberate no-sludge choice`.

---

## Cache-bust ritual (only when a phase ships to players)

Per CLAUDE.md, the FINAL commit of any phase that reaches prod must bump `index.html`'s entry `?v=N` and `GAME_BUILD` in `src/game.js`. Do this once per PR, last.

---

## Self-Review

**Spec coverage** (vs `2026-06-14-poker-juice-psychology-research.md` backlog §F):
1. Audio-frame sync → Tasks 1.1/1.2 ✓ · 2. Staggered showdown → 3.2 ✓ · 3. Card lift+thickness flip → 3.1 (+ thickness already in `poker-cards.js`) ✓ · 4. Pot-win juice (NET only) → 4.1 ✓ · 5. Chip randomization (real count) → 0.1/2.1 ✓ · 6. Optional squeeze → **deliberately deferred** (research refuted its "tension" claim 0-3; not worth foundation cost now — noted, not built) · 7. One-more-hand loop → out of this plan's render scope (engine/flow concern; tracked separately) · 8. Guaranteed progress → out of scope (economy concern; tracked separately). Ethical guardrails §E → Phase 5 ✓.

**Placeholder scan:** pure-logic tasks (0.1–0.4, 1.1) carry complete code + tests. THREE-integration tasks (0.5–0.6, 1.2, 2–4) intentionally specify exact files, signatures, and browser-verification steps rather than full speculative THREE bodies, because their precise integration points depend on Phase 0's reconcile shape — this is flagged in "Scope & Sequencing." Each still names the function, its inputs/outputs, and a concrete pass/fail check.

**Type consistency:** event shapes (`boardCard`/`holeReveal`/`chipMove{from,to,moves}`/`potAward{id,amount,net}`) are defined once in 0.3 and consumed identically in 1.2/2.2/3.2/4.1. `setChipTray(group, chipSet, opts)` signature (with `{jitter, seed}`) is consistent across 0.5/2.1. `layoutChips(chipSet, opts)` and `Tween(dur, delay)` match their definitions and call sites.

**Known follow-ups (not gaps):** `colorUp` wiring (0.2 note), `result.contributed` provenance (0.3 note + 5.1), and the audio-manager reference path (1.2) are each called out at their task with a concrete resolution step.
