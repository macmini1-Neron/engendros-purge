# Precise Hitboxes — M0 (foundation) + M1 (trees & logs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give bullets/rockets/grenades round, mesh-accurate hits on tree trunks and fallen logs by adding a capsule narrowphase behind the existing AABB broadphase — shooting only, nothing else touched.

**Architecture:** A new THREE-free math module `src/raycollide.js` provides `raySphere` / `rayCapsule` and a `refineBoxHit` dispatcher. `grid.raycast` gains an optional `refine(box,…,aabbT)` callback; `world.rayHit` supplies a closure that calls `refineBoxHit` (capsule when `box.cap` is present, else the AABB `t`). Trees attach a per-band `box.cap` capsule; fallen-log segments attach a per-segment `box.cap`. Foliage / buildings / terrain have no `box.cap` → unchanged AABB behaviour.

**Tech Stack:** vanilla ES modules, Three.js r160 (via import map: `import * as THREE from 'three'`), `node:test` for pure math, isolated headless/desktop **Chrome** + a no-store static server for integration verification. No build step, no package.json.

## Global Constraints

- No build step; native ES modules parsed by the browser. All internal imports are **bare, unversioned** paths (e.g. `import { rayCapsule } from './raycollide.js'`). Do **not** add `?v=`/query params to internal imports.
- `three` is resolved by the import map only (`import * as THREE from 'three'`). A module that must be **node-testable** therefore **must not import `three`** (no import map in node). `src/raycollide.js` stays THREE-free.
- **Zero allocation in the raycast hot path** — reuse module/instance scratch objects; never `new` inside the per-candidate loop. One `THREE.Vector3` per *resolved* hit in `world.rayHit` only (as today).
- Co-op authority unchanged: this plan adds **no** authoritative logic and **no** network message. Capsules are deterministic (built from the already-seeded geometry), so host & client agree for free.
- In-browser verification is always in **Chrome** (Safari is frame-locked and unreliable), against a **no-store** server so module edits aren't served stale.
- **Do not touch:** `demobuilding.js`, `destruct.js` hit routing, `player.js`, `pathing.js`, `flowfield.js`, `navgraph.js`, `fire.js`, `dig.js`, `mp.js`. Buildings/terrain/foliage keep AABB by getting no `box.cap`.
- Cache-bust ritual (`?v=N` on `index.html` + `GAME_BUILD` in `src/game.js`) is done **once at the end**, before opening the PR — not per commit.

**Branch:** `feat/precise-hitboxes-bvh` (already created, off `feat/forest-sectional-destruction`).

---

## File structure

- `src/raycollide.js` — **new.** THREE-free: `raySphere`, `rayCapsule`, internal `_capN`, and `refineBoxHit`. Single responsibility: pure ray↔shape math + the box dispatcher.
- `tests/raycollide/raycollide.test.mjs` — **new.** Node unit tests for the above.
- `src/grid.js` — **modify.** `raycast()` gains an optional `refine` param.
- `src/world.js` — **modify.** `rayHit()` builds the `refine` closure + recomputes the capsule normal on the winning hit.
- `src/forestdemo.js` — **modify.** `_buildTrunkBands()` attaches `box.cap` per band; `_registerFallenLog()`'s `collide()` attaches `box.cap` per non-foliage segment box.
- `src/debughitbox.js` — **modify.** F3+B overlay draws capsule rings for boxes carrying `box.cap`.

---

## Interfaces (locked — used across tasks)

- `raySphere(ox,oy,oz, dx,dy,dz, cx,cy,cz, r, out) → number|null` — ray (dir **must be unit**) vs sphere; returns nearest `t ≥ 0` or `null`; if `out` given, writes unit surface normal `out.nx/ny/nz`.
- `rayCapsule(ox,oy,oz, dx,dy,dz, ax,ay,az, bx,by,bz, r, out) → number|null` — ray vs capsule (segment A→B, radius r); same return/normal contract.
- `refineBoxHit(box, ox,oy,oz, dx,dy,dz, aabbT, out) → number|null` — if `box.cap` present → `rayCapsule` with `box.cap.{ax,ay,az,bx,by,bz,r}`; else returns `aabbT` unchanged (and does not write `out`).
- `box.cap = { ax,ay,az, bx,by,bz, r }` — world-space capsule on a collision box (plain numbers).
- `grid.raycast(ox,oy,oz, dx,dy,dz, maxDist, filter, refine)` — `refine(box, ox,oy,oz, dx,dy,dz, aabbT) → number|null`; `null` ⇒ skip this box (ray continues).

---

## M0 — Foundation

### Task 1: `raySphere` + module skeleton

**Files:**
- Create: `src/raycollide.js`
- Test: `tests/raycollide/raycollide.test.mjs`

**Interfaces:**
- Produces: `raySphere(ox,oy,oz, dx,dy,dz, cx,cy,cz, r, out) → number|null`.

- [ ] **Step 1: Write the failing test**

Create `tests/raycollide/raycollide.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { raySphere } from '../../src/raycollide.js';

test('raySphere: head-on hit returns near-surface t + outward normal', () => {
  const out = {};
  // ray from x=-5 along +X at a unit sphere centred at origin → first hit at x=-1, t=4
  const t = raySphere(-5,0,0, 1,0,0, 0,0,0, 1, out);
  assert.ok(t !== null && Math.abs(t - 4) < 1e-6, `t=${t}`);
  assert.ok(Math.abs(out.nx + 1) < 1e-6 && Math.abs(out.ny) < 1e-6, `n=${out.nx},${out.ny},${out.nz}`);
});

test('raySphere: clean miss returns null', () => {
  assert.equal(raySphere(-5,3,0, 1,0,0, 0,0,0, 1, null), null);
});

test('raySphere: pointing away returns null', () => {
  assert.equal(raySphere(-5,0,0, -1,0,0, 0,0,0, 1, null), null);
});

test('raySphere: origin inside returns the forward exit hit', () => {
  const t = raySphere(0,0,0, 1,0,0, 0,0,0, 2, null);
  assert.ok(t !== null && Math.abs(t - 2) < 1e-6, `t=${t}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/raycollide/raycollide.test.mjs`
Expected: FAIL — `Cannot find module '.../src/raycollide.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/raycollide.js`:

```js
// raycollide.js — THREE-free ray↔shape narrowphase math for the shooting hitscan path.
// Pure numbers in/out (no THREE) so it is node-testable AND worker-safe. Directions are
// assumed UNIT length. Functions return the nearest t >= 0 along the ray, or null. When an
// `out` object is passed, the unit surface normal is written to out.nx/out.ny/out.nz.

// Ray vs sphere (centre c, radius r). Reduced quadratic (dir is unit).
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, out) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return null;            // outside and pointing away
  const disc = b * b - c;
  if (disc < 0) return null;                  // misses
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;                     // origin inside → far root
  if (t < 0) return null;
  if (out) {
    const inv = 1 / (r || 1e-6);
    out.nx = (mx + dx * t) * inv; out.ny = (my + dy * t) * inv; out.nz = (mz + dz * t) * inv;
  }
  return t;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/raycollide/raycollide.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/raycollide.js tests/raycollide/raycollide.test.mjs
git commit -m "feat(hitbox): raycollide.js — ray↔sphere narrowphase primitive + tests"
```

---

### Task 2: `rayCapsule` (+ internal `_capN`)

**Files:**
- Modify: `src/raycollide.js`
- Test: `tests/raycollide/raycollide.test.mjs`

**Interfaces:**
- Consumes: `raySphere` (Task 1) for the parallel-ray cap fallback.
- Produces: `rayCapsule(ox,oy,oz, dx,dy,dz, ax,ay,az, bx,by,bz, r, out) → number|null`.

- [ ] **Step 1: Write the failing test**

Append to `tests/raycollide/raycollide.test.mjs`:

```js
import { rayCapsule } from '../../src/raycollide.js';

// vertical capsule: A=(0,0,0) B=(0,4,0) r=0.5
test('rayCapsule: side hit on the cylinder body', () => {
  const out = {};
  const t = rayCapsule(-5,2,0, 1,0,0, 0,0,0, 0,4,0, 0.5, out);
  assert.ok(t !== null && Math.abs(t - 4.5) < 1e-6, `t=${t}`);   // hit at x=-0.5
  assert.ok(Math.abs(out.nx + 1) < 1e-6, `n=${out.nx}`);          // points -X
});

test('rayCapsule: grazing miss just outside the radius returns null', () => {
  // aim past the side at y=2, offset z=0.6 (> r=0.5) → miss
  assert.equal(rayCapsule(-5,2,0.6, 1,0,0, 0,0,0, 0,4,0, 0.5, null), null);
});

test('rayCapsule: hemisphere cap hit above the top', () => {
  const t = rayCapsule(0,9,0, 0,-1,0, 0,0,0, 0,4,0, 0.5, null);  // straight down onto B cap
  assert.ok(t !== null && Math.abs(t - 4.5) < 1e-6, `t=${t}`);   // top of cap at y=4.5
});

test('rayCapsule: shot threads PAST a thin trunk that the AABB would have caught', () => {
  // trunk capsule r=0.2 at origin; shot offset z=0.35 → misses the round trunk
  assert.equal(rayCapsule(-5,2,0.35, 1,0,0, 0,0,0, 0,4,0, 0.2, null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/raycollide/raycollide.test.mjs`
Expected: FAIL — `rayCapsule` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/raycollide.js`:

```js
// Capsule surface normal at a hit point (perpendicular to the segment, normalised).
function _capN(px, py, pz, ax, ay, az, bax, bay, baz, baba, out) {
  if (!out) return;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  let h = (pax * bax + pay * bay + paz * baz) / (baba || 1e-9);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const nx = pax - h * bax, ny = pay - h * bay, nz = paz - h * baz;
  const inv = 1 / (Math.hypot(nx, ny, nz) || 1e-6);
  out.nx = nx * inv; out.ny = ny * inv; out.nz = nz * inv;
}

// Ray vs capsule (segment A→B, radius r). Port of iq's capIntersect with a parallel-ray
// guard. Returns nearest t >= 0 or null.
export function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r, out) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const oax = ox - ax, oay = oy - ay, oaz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * dx + bay * dy + baz * dz;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard;
  if (a > 1e-12) {                                  // not parallel to the axis → cylinder body root
    let b = baba * rdoa - baoa * bard;
    let c = baba * oaoa - baoa * baoa - r * r * baba;
    let h = b * b - a * c;
    if (h >= 0) {
      const t = (-b - Math.sqrt(h)) / a;
      const y = baoa + t * bard;
      if (y > 0 && y < baba) {                      // hit on the cylindrical body
        if (t < 0) return null;
        _capN(ox + dx * t, oy + dy * t, oz + dz * t, ax, ay, az, bax, bay, baz, baba, out);
        return t;
      }
      // body root falls beyond an end → test the nearer hemisphere cap
      const cx = y <= 0 ? ax : bx, cy = y <= 0 ? ay : by, cz = y <= 0 ? az : bz;
      const ocx = ox - cx, ocy = oy - cy, ocz = oz - cz;
      b = dx * ocx + dy * ocy + dz * ocz;
      c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
      h = b * b - c;
      if (h > 0) {
        const t2 = -b - Math.sqrt(h);
        if (t2 < 0) return null;
        _capN(ox + dx * t2, oy + dy * t2, oz + dz * t2, ax, ay, az, bax, bay, baz, baba, out);
        return t2;
      }
      return null;
    }
    return null;
  }
  // ray ~parallel to the capsule axis → nearest of the two end spheres
  const tA = raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r, null);
  const tB = raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, r, null);
  let t = tA;
  if (tB !== null && (t === null || tB < t)) t = tB;
  if (t === null) return null;
  _capN(ox + dx * t, oy + dy * t, oz + dz * t, ax, ay, az, bax, bay, baz, baba, out);
  return t;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/raycollide/raycollide.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/raycollide.js tests/raycollide/raycollide.test.mjs
git commit -m "feat(hitbox): ray↔capsule narrowphase primitive + tests"
```

---

### Task 3: `refineBoxHit` dispatcher

**Files:**
- Modify: `src/raycollide.js`
- Test: `tests/raycollide/raycollide.test.mjs`

**Interfaces:**
- Consumes: `rayCapsule` (Task 2).
- Produces: `refineBoxHit(box, ox,oy,oz, dx,dy,dz, aabbT, out) → number|null` and the `box.cap` shape `{ ax,ay,az, bx,by,bz, r }`.

- [ ] **Step 1: Write the failing test**

Append to `tests/raycollide/raycollide.test.mjs`:

```js
import { refineBoxHit } from '../../src/raycollide.js';

test('refineBoxHit: no cap → returns the AABB t unchanged (building/foliage path)', () => {
  assert.equal(refineBoxHit({}, -5,0,0, 1,0,0, 3.2, null), 3.2);
});

test('refineBoxHit: cap present, ray hits the capsule → refined t', () => {
  const box = { cap: { ax:0,ay:0,az:0, bx:0,by:4,bz:0, r:0.5 } };
  const t = refineBoxHit(box, -5,2,0, 1,0,0, 4.0, null);  // aabbT 4.0 is the box face; capsule at 4.5
  assert.ok(t !== null && Math.abs(t - 4.5) < 1e-6, `t=${t}`);
});

test('refineBoxHit: cap present, ray clips AABB but MISSES the capsule → null (continues)', () => {
  const box = { cap: { ax:0,ay:0,az:0, bx:0,by:4,bz:0, r:0.2 } };
  assert.equal(refineBoxHit(box, -5,2,0.35, 1,0,0, 3.9, null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/raycollide/raycollide.test.mjs`
Expected: FAIL — `refineBoxHit` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/raycollide.js`:

```js
// Narrowphase dispatcher for a world collision box. If the box carries an exact shape
// (box.cap = capsule), test it and return its refined t (or null = the ray missed the real
// shape and should continue past this box). Boxes with no exact shape (buildings, foliage,
// terrain, fortifications) return the broadphase AABB t unchanged → today's behaviour.
export function refineBoxHit(box, ox, oy, oz, dx, dy, dz, aabbT, out) {
  const cap = box.cap;
  if (cap) return rayCapsule(ox, oy, oz, dx, dy, dz, cap.ax, cap.ay, cap.az, cap.bx, cap.by, cap.bz, cap.r, out);
  return aabbT;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/raycollide/raycollide.test.mjs`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/raycollide.js tests/raycollide/raycollide.test.mjs
git commit -m "feat(hitbox): refineBoxHit dispatcher (capsule narrowphase, AABB fallback)"
```

---

### Task 4: wire optional `refine` into `grid.raycast`

**Files:**
- Modify: `src/grid.js:47-67`

**Interfaces:**
- Produces: `grid.raycast(ox,oy,oz, dx,dy,dz, maxDist, filter, refine)`. `refine(box, ox,oy,oz, dx,dy,dz, aabbT) → number|null`; `null` skips the box. Backward compatible — every existing caller omits `refine`.

This change is on a THREE-coupled module (not node-testable); it is verified by Task 5's in-browser run. The change is mechanical and preserves the early-out invariant (a refined `t` is always ≥ the AABB entry `t`, since the exact shape lives inside its AABB).

- [ ] **Step 1: Edit `raycast` to apply `refine` per candidate**

In `src/grid.js`, change the signature and the per-box test block.

Replace the signature line:

```js
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter) {
```
with:
```js
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter, refine) {
```

Replace the per-candidate test block:

```js
      if (a) for (let i = 0; i < a.length; i++) { const b = a[i];
        if (b._qid === qid) continue; b._qid = qid; if (filter && !filter(b)) continue;
        const t = rayAABB(ox, oy, oz, dx, dy, dz, b.min, b.max);
        if (t != null && t >= 0 && t < bestT) { bestT = t; best = b; } }
```
with:
```js
      if (a) for (let i = 0; i < a.length; i++) { const b = a[i];
        if (b._qid === qid) continue; b._qid = qid; if (filter && !filter(b)) continue;
        let t = rayAABB(ox, oy, oz, dx, dy, dz, b.min, b.max);
        if (t == null || t < 0) continue;
        if (refine) { t = refine(b, ox, oy, oz, dx, dy, dz, t); if (t == null) continue; } // exact narrowphase: null = ray missed the real shape → skip this box
        if (t < bestT) { bestT = t; best = b; } }
```

- [ ] **Step 2: Sanity-check no caller breaks**

Run: `grep -rn "\.raycast(" src/ | grep -v "raycollide\|//"`
Expected: every hit is `grid.raycast(...)` / `this.grid.raycast(...)` with **7 args** (the new `refine` is optional; existing callers are unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/grid.js
git commit -m "feat(hitbox): grid.raycast accepts optional refine() narrowphase callback"
```

---

### Task 5: wire the `refine` closure into `world.rayHit`

**Files:**
- Modify: `src/world.js:529-554`

**Interfaces:**
- Consumes: `refineBoxHit` (Task 3), `grid.raycast(...,refine)` (Task 4).
- Produces: unchanged public return `{ dist, point, normal, box }` — but `point`/`normal` are now on the capsule surface when the winning box has a `box.cap`.

- [ ] **Step 1: Import `refineBoxHit` and add reusable scratch**

At the top of `src/world.js`, add to the existing imports (find the line importing from `./util.js` and add a new import line after it):

```js
import { refineBoxHit } from './raycollide.js';
```

In the `World` constructor (find `constructor` in the `World` class), add the scratch + bound closure near where other per-instance scratch is set up:

```js
    this._exN = { nx: 0, ny: 0, nz: 0 };                                   // capsule-normal scratch (zero-alloc hot path)
    this._refine = (b, ox, oy, oz, dx, dy, dz, t) => refineBoxHit(b, ox, oy, oz, dx, dy, dz, t, null); // narrowphase during the walk (no normal needed yet)
```

- [ ] **Step 2: Pass the closure into the raycast and recompute the capsule normal on the winner**

In `rayHit` (`src/world.js:533`), change the grid call to pass the refine closure:

```js
    const gh = this.grid.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist, filter, this._refine);
```

Then replace the AABB-face normal block (`src/world.js:545-552`) so a capsule winner uses its true surface normal:

```js
    if (hitBox && hitBox !== 'ground') {
      if (hitBox.cap && refineBoxHit(hitBox, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, best, this._exN) != null) {
        normal.set(this._exN.nx, this._exN.ny, this._exN.nz);              // exact capsule surface normal
      } else {
        const ex = Math.min(Math.abs(point.x - hitBox.min.x), Math.abs(point.x - hitBox.max.x));
        const ey = Math.min(Math.abs(point.y - hitBox.min.y), Math.abs(point.y - hitBox.max.y));
        const ez = Math.min(Math.abs(point.z - hitBox.min.z), Math.abs(point.z - hitBox.max.z));
        if (ex <= ey && ex <= ez) normal.set(point.x < (hitBox.min.x + hitBox.max.x) / 2 ? -1 : 1, 0, 0);
        else if (ey <= ez) normal.set(0, point.y < (hitBox.min.y + hitBox.max.y) / 2 ? -1 : 1, 0);
        else normal.set(0, 0, point.z < (hitBox.min.z + hitBox.max.z) / 2 ? -1 : 1);
      }
    }
```

- [ ] **Step 3: Verify nothing regressed in-browser (foundation is inert until caps exist)**

At this point no box has a `box.cap` yet, so behaviour must be **identical** to before. Start a no-store server and load the forest in Chrome:

Run a no-store static server on a fresh port (edits aren't served stale), e.g.:
```bash
python3 -c "import http.server,functools;h=http.server.SimpleHTTPRequestHandler;
import http.server as s
class N(h):
  def end_headers(self):
    self.send_header('Cache-Control','no-store'); super().end_headers()
s.test(HandlerClass=N,port=8011)"
```
Then open `http://localhost:8011/?map=demo&cb=1` in Chrome (the `&cb=N` also busts `index.html`).
Verify: shoot trees / a building — hit markers, tree felling, and building breach behave exactly as on `main`. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/world.js
git commit -m "feat(hitbox): world.rayHit drives the refine narrowphase + capsule normals"
```

---

## M1 — Trees & fallen logs

### Task 6: standing-trunk per-band capsules

**Files:**
- Modify: `src/forestdemo.js:158-182` (`_buildTrunkBands`)

**Interfaces:**
- Consumes: `box.cap` shape; `refineBoxHit`/`world.rayHit` from M0.
- Produces: every standing trunk band box carries a `box.cap` capsule along the leaning spine.

- [ ] **Step 1: Attach `box.cap` to each trunk band**

In `src/forestdemo.js`, change the `push` helper inside `_buildTrunkBands` to accept an optional capsule:

Replace:
```js
    const push = (mn, mx) => { const b = { min: new THREE.Vector3(...mn), max: new THREE.Vector3(...mx), downer: rec, tree: true, dmat: mat, dpart: id, felTier }; rec.boxes.push(b); this.world.boxes.push(b); this.world.grid.addBox(b); };
```
with:
```js
    const push = (mn, mx, cap) => { const b = { min: new THREE.Vector3(...mn), max: new THREE.Vector3(...mx), downer: rec, tree: true, dmat: mat, dpart: id, felTier }; if (cap) b.cap = cap; rec.boxes.push(b); this.world.boxes.push(b); this.world.grid.addBox(b); };
```

Replace the spine-band `push` call:
```js
        const rad = trunkR * (1 - 0.6 * (y0 / fullH)) + 0.1;
        push([x + mnx - rad, y + y0, z + mnz - rad], [x + mxx + rad, y + y1, z + mxz + rad]);
```
with:
```js
        const rad = trunkR * (1 - 0.6 * (y0 / fullH)) + 0.1;
        // capsule along the leaning centreline for this band (world space) → round trunk hit
        const cax = x + (e0[0] * cos + e0[1] * sin), caz = z + (-e0[0] * sin + e0[1] * cos);
        const cbx = x + (e1[0] * cos + e1[1] * sin), cbz = z + (-e1[0] * sin + e1[1] * cos);
        push([x + mnx - rad, y + y0, z + mnz - rad], [x + mxx + rad, y + y1, z + mxz + rad],
             { ax: cax, ay: y + y0, az: caz, bx: cbx, by: y + y1, bz: cbz, r: rad });
```

Replace the no-spine fallback `push` call:
```js
      const half = trunkR + 0.12;
      push([x - half, y, z - half], [x + half, y + yHi, z + half]);
```
with:
```js
      const half = trunkR + 0.12;
      push([x - half, y, z - half], [x + half, y + yHi, z + half],
           { ax: x, ay: y, az: z, bx: x, by: y + yHi, bz: z, r: trunkR + 0.05 });
```

(The root-collar `push` keeps no capsule — a flared base reads fine as AABB.)

- [ ] **Step 2: Verify round trunks in-browser**

Run the no-store server (Task 5) and open `http://localhost:8011/?map=demo&cb=2` in Chrome.
Verify:
1. Aim at a thin trunk and fire slightly to the side of its centre (within the old square box, outside the round trunk): the round **passes through** and hits whatever is behind — it no longer "hits air at the box corner".
2. A centre hit still hits, still fells the trunk (shoot the base repeatedly).
3. Impact sparks sit on the round bark surface (normal looks radial), no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/forestdemo.js
git commit -m "feat(hitbox): round standing-trunk hits via per-band capsules"
```

---

### Task 7: fallen-log per-segment capsules

**Files:**
- Modify: `src/forestdemo.js:321-407` (`_registerFallenLog`, the `collide` helper)

**Interfaces:**
- Consumes: `box.cap` shape.
- Produces: every non-foliage fallen-log collision box carries a `box.cap` capsule along the log's 3-D heading. Foliage (fallen crown) boxes stay AABB.

- [ ] **Step 1: Compute the log's 3-D axis and attach `box.cap` per wood box**

In `src/forestdemo.js`, inside `_registerFallenLog`, just before the `collide` helper is defined (right after `const axis2 = [b.dirXZ[0], b.dirXZ[1]], org2 = [ax, az];`), add the 3-D unit axis (already unit: `dirXZ` is unit and `sin²+cos²=1`):

```js
    const a3x = s * b.dirXZ[0], a3y = c, a3z = s * b.dirXZ[1];   // log's 3-D heading (unit): butt→tip
```

Then, inside the `collide` helper, after the box object is created and before it is pushed, attach a capsule for solid (non-foliage) boxes. Replace:

```js
        const box = { min: new THREE.Vector3(bb.min[0] - 0.06, bb.min[1] - 0.06, bb.min[2] - 0.06),
                      max: new THREE.Vector3(bb.max[0] + 0.06, bb.max[1] + 0.06, bb.max[2] + 0.06),
                      downer: log, tree: true, dmat: matName, dpart: opts.dpart, felTier: logFelTier };
        if (opts.foliage) box.foliage = true; if (opts.thicket) box.thicket = true; if (opts.seg) box.seg = opts.seg;
```
with:
```js
        const box = { min: new THREE.Vector3(bb.min[0] - 0.06, bb.min[1] - 0.06, bb.min[2] - 0.06),
                      max: new THREE.Vector3(bb.max[0] + 0.06, bb.max[1] + 0.06, bb.max[2] + 0.06),
                      downer: log, tree: true, dmat: matName, dpart: opts.dpart, felTier: logFelTier };
        if (opts.foliage) box.foliage = true; if (opts.thicket) box.thicket = true; if (opts.seg) box.seg = opts.seg;
        if (!opts.foliage) {                                   // round log chunk: capsule along the log heading, inside this bin AABB
          const cX = (box.min.x + box.max.x) / 2, cY = (box.min.y + box.max.y) / 2, cZ = (box.min.z + box.max.z) / 2;
          const sX = box.max.x - box.min.x, sY = box.max.y - box.min.y, sZ = box.max.z - box.min.z;
          const half = 0.5 * (sX * Math.abs(a3x) + sY * Math.abs(a3y) + sZ * Math.abs(a3z));  // bin extent along the log
          const rad = Math.max(0.12, 0.5 * Math.min(sX, sY, sZ));                              // tight cross radius
          const hl = Math.max(0, half - rad);                                                  // shrink so caps fit inside the bin
          box.cap = { ax: cX - a3x * hl, ay: cY - a3y * hl, az: cZ - a3z * hl, bx: cX + a3x * hl, by: cY + a3y * hl, bz: cZ + a3z * hl, r: rad };
        }
```

- [ ] **Step 2: Verify round logs in-browser**

Run the no-store server and open `http://localhost:8011/?map=demo&cb=3` in Chrome.
Verify:
1. Fell a tree so it lies down. Aim at the round log and fire **just past its top/side** (inside the old square slice, outside the round bole): the round passes through — no more square-edge hits.
2. A direct hit still damages **only the chunk you hit** (sectional destruction intact — shoot one chunk out, the rest stays).
3. The fallen crown (leaves) still lets bullets pass (foliage unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/forestdemo.js
git commit -m "feat(hitbox): round fallen-log chunks via per-segment capsules"
```

---

### Task 8: F3+B debug overlay draws capsules

**Files:**
- Modify: `src/debughitbox.js`

**Interfaces:**
- Consumes: `box.cap`.
- Produces: capsule wireframes (two end rings + axis lines) for boxes carrying `box.cap`, in a distinct colour, alongside the existing AABB boxes.

- [ ] **Step 1: Read the current overlay build**

Run: `sed -n '1,120p' src/debughitbox.js`
Note how it accumulates line vertices (the `LineSegments` positions array) and how it iterates `world.grid.queryAABB(...)` near line 64-74, plus the colour constants (`C_TREE`/`C_FOLIAGE`/...).

- [ ] **Step 2: Add a capsule colour and a ring emitter, draw caps for boxes that have one**

In `src/debughitbox.js`, add a colour constant next to the existing ones (e.g. after `C_WORLD`):

```js
const C_CAP = [0.25, 0.95, 1.00];   // cyan — exact capsule narrowphase (round hitbox)
```

In the per-box loop where each `box` is turned into line vertices, after the existing AABB edges are emitted for that box, add (using the same `positions`/`colors` arrays and `seen` set the file already uses — match the existing push pattern and variable names found in Step 1):

```js
      if (box.cap) this._emitCapsule(box.cap, C_CAP, positions, colors);
```

Add the emitter method to the class (perpendicular-frame ring at each end + 4 connecting lines):

```js
  _emitCapsule(cap, col, positions, colors) {
    const ax = cap.bx - cap.ax, ay = cap.by - cap.ay, az = cap.bz - cap.az;
    const al = Math.hypot(ax, ay, az) || 1e-6;
    const ux = ax / al, uy = ay / al, uz = az / al;
    // build a perpendicular basis (e1, e2) to the axis
    let e1x = -uy, e1y = ux, e1z = 0; if (Math.abs(ux) < 1e-3 && Math.abs(uy) < 1e-3) { e1x = 1; e1y = 0; e1z = 0; }
    let l1 = Math.hypot(e1x, e1y, e1z) || 1e-6; e1x /= l1; e1y /= l1; e1z /= l1;
    const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
    const SEG = 10, r = cap.r;
    const ring = (cx, cy, cz) => {
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
        const p0x = cx + r * (Math.cos(a0) * e1x + Math.sin(a0) * e2x), p0y = cy + r * (Math.cos(a0) * e1y + Math.sin(a0) * e2y), p0z = cz + r * (Math.cos(a0) * e1z + Math.sin(a0) * e2z);
        const p1x = cx + r * (Math.cos(a1) * e1x + Math.sin(a1) * e2x), p1y = cy + r * (Math.cos(a1) * e1y + Math.sin(a1) * e2y), p1z = cz + r * (Math.cos(a1) * e1z + Math.sin(a1) * e2z);
        positions.push(p0x, p0y, p0z, p1x, p1y, p1z); colors.push(...col, ...col);
      }
    };
    ring(cap.ax, cap.ay, cap.az); ring(cap.bx, cap.by, cap.bz);
    // 4 axis-parallel connectors at ±e1, ±e2
    for (const [sx, sy, sz] of [[e1x, e1y, e1z], [-e1x, -e1y, -e1z], [e2x, e2y, e2z], [-e2x, -e2y, -e2z]]) {
      positions.push(cap.ax + r * sx, cap.ay + r * sy, cap.az + r * sz, cap.bx + r * sx, cap.by + r * sy, cap.bz + r * sz);
      colors.push(...col, ...col);
    }
  }
```

> If the existing overlay uses a single interleaved array or a fixed-size buffer rather than `positions`/`colors` arrays, adapt these pushes to that structure (same vertices, same colour) — keep the emitter signature and ring math identical.

- [ ] **Step 3: Verify the overlay in-browser**

Run the no-store server and open `http://localhost:8011/?map=demo&cb=4` in Chrome. Press **F3 then B** to toggle the overlay.
Verify: standing trunks and fallen logs show **cyan capsule rings** that hug the round wood (tight to the bark), while foliage stays a green box and buildings stay box outlines. The cyan capsule visibly sits inside / matches the orange trunk AABB.

- [ ] **Step 4: Commit**

```bash
git add src/debughitbox.js
git commit -m "feat(hitbox): F3+B overlay draws exact capsule shapes (cyan)"
```

---

## Finishing (after all tasks verified)

- [ ] **Run the full node test suite:** `node --test` — expect all green (existing suite + new `raycollide` tests).
- [ ] **Regression sweep in Chrome** (no-store, `?map=demo`): tree fell + snap-where-hit, fallen-log sectional break, foliage shoot-through, building breach/collapse, molotov/rocket flight (they share `world.rayHit` — confirm they still detonate on trunks and don't tunnel). No console errors.
- [ ] **Cache-bust ritual:** bump `?v=N` on `index.html`'s entry script and `GAME_BUILD` in `src/game.js` to the current minute; commit `chore(hitbox): cache-bust vNNN`.
- [ ] **Open the PR** (`gh pr create`) targeting `feat/forest-sectional-destruction` (or `main` if that has merged by then); request the other brother's review.

---

## Self-review (against the M0/M1 portion of the spec)

- **Spec §3 hook** → Tasks 4 (grid param) + 5 (world closure) + 3 (`refineBoxHit`). ✓ The spec's `box.downer.rayExact` method is implemented more simply as **shape-data-on-the-box** (`box.cap`) dispatched by `refineBoxHit` — same goal (object carries its own exact shape, foliage/buildings fall back to AABB), fewer moving parts. Noted intentional refinement.
- **Spec §3.3 raycollide.js** → Tasks 1–3 (sphere, capsule, dispatcher). `rayConeSegment` is **not** needed: the trunk uses a per-band capsule chain (constant radius per band captures taper), so M0 ships only `raySphere`+`rayCapsule`. OBB/cylinder/`RayBVH` belong to the M3 props plan. ✓
- **Spec §4 trees** → Task 6 (standing per-band capsules), Task 7 (fallen-log per-segment capsules). AABB bands kept as broadphase; foliage box stays AABB; destruction routing (`downer`/`dpart`/`seg`/`felTier`) untouched. ✓ The "capsule chain + per-query memo" idea is realised as **per-band capsules** (each band box owns its capsule) — simpler, exact box↔region match, no memo. Noted.
- **Spec §6 co-op** → no network message, deterministic capsules, no authority change. ✓ (nothing to implement; constraint honoured.)
- **Spec §7 untouched** → buildings/terrain/foliage get no `box.cap` → `refineBoxHit` returns AABB t. ✓
- **Spec §9 perf** → zero-alloc (`this._exN`/`this._refine` scratch; numbers in/out), broadphase unchanged, normal recomputed once on the winner only. ✓
- **Spec §11 debug** → Task 8. ✓
- **Spec §5 enemies / §8 props / §14 dismemberment** → **out of scope for this plan** (own plans: M2 enemies, M3 props; dismemberment is a later PR). ✓
- **Placeholder scan:** all code blocks are complete; the two "adapt to the existing structure" notes (Task 8 buffer shape, world.js constructor/import locations) point at concrete, readable code, not invented APIs. ✓
- **Type consistency:** `box.cap = {ax,ay,az,bx,by,bz,r}`, `raySphere`/`rayCapsule`/`refineBoxHit` signatures, and `grid.raycast(...,refine)` match across Tasks 1–8. ✓
