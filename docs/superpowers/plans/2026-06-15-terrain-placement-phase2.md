# Terrain Placement + Horde Slope-Limit (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the terrain *hold content* — a placement API that seats props/buildings/AABB-colliders on
the terrain surface, a horde slope-limit so enemies can't scale cliffs, and a handful of test structures
seated on the `?map=demo` terrain proving the engine→content bridge.

**Architecture:** A new `src/terrain-place.js` (THREE) seats colliders + props at `world.groundY(x,z)`. A
new pure `slopeBlocks()` in `terrain.js` (node-tested) is the shared "this move climbed into a cliff" gate,
used by the enemy steering loop. `_buildDemo` places a few real props via the API. Placement is
deterministic (fixed positions + seeded terrain) → co-op-safe with no new net message.

**Tech Stack:** vanilla ES modules, Three.js r160, Node `node:test` for the one pure unit; everything else
verified in-browser against `window.GAME` (per CLAUDE.md). **No build step.**

**Scope:** Owner chose the **integration-proof** (spec §3.3/§3.4/§6 Phase 2): prove the terrain holds
colliders/props/enemies. NOT a designed level. **Depends on Phase 1A** (terrain). Branch
`feat/terrain-placement` (stacked on the terrain+graphics work).

**Out of scope (later):** tilting props to the slope normal; authoring a real terrain level; per-axis
enemy slope resolution (Phase 2 reverts the whole step — fine for "don't climb cliffs"); re-seating the
flat-map district/arena builders; height-aware boss A* (Phase 3).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/terrain.js` | modify | Add pure `slopeBlocks(gBefore, gAfter, slopeAtTarget, slopeLimit, eps)` → bool. Node-testable. |
| `src/terrain-place.js` | **new** | THREE: `seatBox(world,x,z,w,d,h,extra)` (terrain-seated AABB collider) + `placeProp(world,x,z,buildFn,opts)` (mesh on terrain + collider). |
| `src/enemies.js` | modify | After the horizontal move integration, a `hasTerrain`-gated slope-limit using `slopeBlocks`. |
| `src/world.js` | modify | `_buildDemo`: import + place ~5 test structures via `placeProp`. |
| `tests/terrain/slope-blocks.test.mjs` | **new** | Node tests for `slopeBlocks`. |

**Conventions:** boxes are `{ min: THREE.Vector3, max: THREE.Vector3 }` pushed to `world.boxes`; the grid
(`world.grid.build(world.boxes)`) is rebuilt at the END of the `World` constructor (`world.js:68`), AFTER
`_buildDemo` runs — so boxes pushed in `_buildDemo` are indexed automatically (no manual `grid.addBox`).
Terrain stays seeded → deterministic placement (co-op-safe).

---

## Task 1: Pure slope-gate helper (`slopeBlocks` in `terrain.js`)

**Files:** Modify `src/terrain.js`; Test `tests/terrain/slope-blocks.test.mjs`

- [ ] **Step 1: Write the failing test** — `tests/terrain/slope-blocks.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { slopeBlocks } from '../../src/terrain.js';

const LIMIT = (Math.PI * 35) / 180; // 35°

test('blocks an uphill step into terrain steeper than the limit', () => {
  // climbed (gAfter > gBefore) AND target slope (45°) > limit (35°)
  assert.equal(slopeBlocks(2.0, 2.5, (Math.PI * 45) / 180, LIMIT), true);
});

test('allows an uphill step onto a gentle slope', () => {
  assert.equal(slopeBlocks(2.0, 2.2, (Math.PI * 20) / 180, LIMIT), false);
});

test('allows moving downhill even on a steep face (slide off, do not scale)', () => {
  // gAfter < gBefore → not climbing → allowed regardless of slope
  assert.equal(slopeBlocks(3.0, 2.0, (Math.PI * 60) / 180, LIMIT), false);
});

test('allows flat ground (no climb)', () => {
  assert.equal(slopeBlocks(0, 0, 0, LIMIT), false);
});

test('the eps guard ignores a negligible rise', () => {
  // a 1e-5 rise is below the default eps (1e-4) → treated as not climbing
  assert.equal(slopeBlocks(2.0, 2.00001, (Math.PI * 80) / 180, LIMIT), false);
});
```

- [ ] **Step 2: Run test to verify it fails** — `node "tests/terrain/slope-blocks.test.mjs"` → FAIL (`slopeBlocks` is not exported).

- [ ] **Step 3: Add `slopeBlocks` to `src/terrain.js`.** Read `src/terrain.js` and add this exported pure
function at module scope (top-level, NOT inside `makeTerrain` — it must be importable directly):

```javascript
// True when a horizontal move that raised the ground from gBefore→gAfter climbed INTO terrain steeper
// than slopeLimit (radians). Shared "can't scale cliffs" gate for the player + the horde. Pure (no THREE).
export function slopeBlocks(gBefore, gAfter, slopeAtTarget, slopeLimit, eps = 1e-4) {
  return gAfter > gBefore + eps && slopeAtTarget > slopeLimit;
}
```

- [ ] **Step 4: Run test to verify it passes** — `node "tests/terrain/slope-blocks.test.mjs"` → 5 pass.

- [ ] **Step 5: Commit**

```bash
git add "src/terrain.js" "tests/terrain/slope-blocks.test.mjs"
git commit -m "feat(terrain): pure slopeBlocks() cliff-gate helper + node tests"
```

---

## Task 2: Placement API (`src/terrain-place.js`)

**Files:** Create `src/terrain-place.js`

**Why no node test:** it touches `THREE.Vector3` + `world` — verified in-browser in Task 4.

- [ ] **Step 1: Write the module** — Create `src/terrain-place.js`:

```javascript
import * as THREE from 'three';

// Seat an AABB collider on the terrain surface: footprint w×d, height h, centered at (x,z), with its
// BASE at the ground height. Pushes to world.boxes and returns the box. `extra` merges extra fields
// (e.g. { dmat }). Grid note: when called during map build (before world.grid.build at the end of the
// World constructor) the box is indexed automatically; if you ever seat at RUNTIME, also call
// world.grid.addBox(box).
export function seatBox(world, x, z, w, d, h, extra = {}) {
  const y = world.groundY(x, z);
  const box = {
    min: new THREE.Vector3(x - w / 2, y, z - d / 2),
    max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    ...extra,
  };
  world.boxes.push(box);
  return box;
}

// Build a prop mesh (buildFn() → THREE.Object3D), plant it on the terrain at (x,z) (optional yaw), add it
// to the scene, and — when opts.w/d/h are given — seat a matching AABB collider. Returns the mesh.
// The mesh sits upright on the surface (no slope-normal tilt; that's a later polish).
export function placeProp(world, x, z, buildFn, opts = {}) {
  const y = world.groundY(x, z);
  const mesh = buildFn();
  mesh.position.set(x, y, z);
  if (opts.yaw) mesh.rotation.y = opts.yaw;
  world.scene.add(mesh);
  if (opts.w && opts.d && opts.h) seatBox(world, x, z, opts.w, opts.d, opts.h, opts.collider || {});
  return mesh;
}
```

- [ ] **Step 2: Sanity-check** — `node --check "src/terrain-place.js"` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add "src/terrain-place.js"
git commit -m "feat(terrain): placement API — seatBox + placeProp seat colliders/props on terrain"
```

---

## Task 3: Horde slope-limit (`enemies.js`)

**Files:** Modify `src/enemies.js`

**Behavior:** after an enemy integrates its horizontal move, if that move climbed INTO terrain steeper
than `terrain.slopeLimit`, revert the move (the enemy stops at the cliff base and re-steers next frame).
Gated on `hasTerrain` so flat maps are unaffected.

- [ ] **Step 1: Import the gate.** At the top of `src/enemies.js`, add to the import from `./terrain.js`
(or a new import if none exists): `import { slopeBlocks } from './terrain.js';`

- [ ] **Step 2: Insert the slope-limit gate.** In `update(dt)`, find the horizontal integration
(`enemies.js:350-351`):

```javascript
    e.vel.x = (wx / wl) * spd; e.vel.z = (wz / wl) * spd;
    e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
```

Immediately AFTER those two lines (and BEFORE the `e.pos.y = this.world.groundY(...)` grounding at
`enemies.js:354`), insert:

```javascript
    // Horde slope-limit: don't let mobs scale cliffs (terrain steeper than slopeLimit). Revert the whole
    // step — they bunch at the cliff base and re-steer. Gated on hasTerrain so flat maps are untouched.
    if (this.world.hasTerrain) {
      const bx = e.pos.x - e.vel.x * dt, bz = e.pos.z - e.vel.z * dt, terr = this.world.terrain;
      if (slopeBlocks(terr.terrainHeightAt(bx, bz), terr.terrainHeightAt(e.pos.x, e.pos.z), terr.terrainSlopeAt(e.pos.x, e.pos.z), terr.slopeLimit)) {
        e.pos.x = bx; e.pos.z = bz; e.vel.x = 0; e.vel.z = 0;
      }
    }
```

- [ ] **Step 3: Syntax check** — `node --check "src/enemies.js"` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add "src/enemies.js"
git commit -m "feat(terrain): horde slope-limit — enemies can't scale cliffs (hasTerrain-gated)"
```

---

## Task 4: Seat test structures on the demo + in-browser verify

**Files:** Modify `src/world.js` (`_buildDemo`)

- [ ] **Step 1: Import the API + prop builders in `world.js`.** Near the top of `src/world.js`, add:

```javascript
import { placeProp } from './terrain-place.js';
import { buildSandbags, buildBarricade, buildFieldRadio } from './props.js';
```
(Read `src/props.js` first to confirm those three are exported with NO required args — the scan shows
`buildSandbags()`, `buildBarricade(...)`, `buildFieldRadio(...)`; if `buildBarricade`/`buildFieldRadio`
require args, wrap them in a zero-arg arrow, e.g. `() => buildBarricade()`, and adjust the collider dims.)

- [ ] **Step 2: Place ~5 test structures in `_buildDemo`.** In `src/world.js` `_buildDemo()`, after the
loot-spots block (the last statement before the method's closing `}`), add:

```javascript
    // Phase 2 — a few test structures seated on the terrain (proves colliders + props sit on hills).
    placeProp(this, 0, -18, buildSandbags, { w: 2.0, d: 0.8, h: 1.0 });
    placeProp(this, 18, 10, () => buildBarricade(), { w: 2.4, d: 1.2, h: 1.4, yaw: 0.4 });
    placeProp(this, -16, 12, buildSandbags, { w: 2.0, d: 0.8, h: 1.0, yaw: 1.2 });
    placeProp(this, 46, -31, () => buildBarricade(), { w: 2.4, d: 1.2, h: 1.4, yaw: -0.5 }); // on the big-hill flank (a slope)
    placeProp(this, -10, -24, () => buildFieldRadio(), { w: 0.8, d: 0.8, h: 1.0 });
```
(If a builder is zero-arg, you can pass it bare like `buildSandbags`. Tune the `w/d/h` to roughly match
each prop's footprint after you see it in-browser.)

- [ ] **Step 3: Syntax check** — `node --check "src/world.js"` → exit 0.

- [ ] **Step 4: Start a fresh server** — (controller will run the in-browser checks; if you can drive an
isolated headless Chrome, do so — otherwise report DONE and the controller verifies). Recipe:
`python3 -m http.server 8123 --bind 127.0.0.1` from the repo root; confirm `curl …/index.html` shows the
current `?v=`.

- [ ] **Step 5: In-browser verify (controller-run).** Load `?map=demo`, start a run, and check via
`evaluate`:

```javascript
() => {
  const w = GAME.world;
  // the 5 seated colliders exist and sit ON the terrain (min.y == groundY at their xz), not at 0
  const seated = w.boxes.filter((b) => Math.abs(b.min.y - w.groundY((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2)) < 0.01 && b.max.y - b.min.y > 0.5);
  // a structure on the hill flank should have min.y clearly > 0 (it's up the slope)
  const onSlope = w.boxes.find((b) => (b.min.x + b.max.x) / 2 > 40 && (b.min.z + b.max.z) / 2 < -25);
  // the grid actually indexes a seated box (collision will work)
  const near = w.grid.queryAABB(-1, -19, 1, -17).length;
  return { seatedCount: seated.length, onSlopeMinY: onSlope ? +onSlope.min.y.toFixed(2) : null, gridFindsSandbag: near > 0 };
}
```
Expected: `seatedCount >= 5`, `onSlopeMinY > 0` (the hill-flank structure is up the slope), `gridFindsSandbag: true`.

- [ ] **Step 6: Slope-limit check (controller-run).** Confirm an enemy can't climb the steep knoll
(`terrain.js` DEMO_TUNING `steepKnoll` at x=8,z=-34, height 10, sigma 4 → very steep):

```javascript
() => {
  GAME.waves.startWave(2);
  const e = GAME.enemies.active[0]; if (!e) return { noEnemy: true };
  // place it at the foot of the steep knoll, aim the player at the top, run steering for ~1.5 s of frames
  e.pos.set(8, GAME.world.groundY(8, -29), -29);
  const knollTop = GAME.world.groundY(8, -34);
  for (let i = 0; i < 90; i++) GAME.enemies.update(1 / 60);
  return { knollTop: +knollTop.toFixed(1), enemyYReached: +e.pos.y.toFixed(1), stayedBelow: e.pos.y < knollTop - 1 };
}
```
Expected: `stayedBelow: true` (the enemy never reaches the knoll top — the slope-limit holds).

- [ ] **Step 7: Screenshot** — structures visibly planted on the terrain (one on the hill flank), 0
console errors. Save/inspect.

- [ ] **Step 8: Commit**

```bash
git add "src/world.js"
git commit -m "feat(terrain): seat test structures on the demo terrain via placement API"
```

---

## Task 5: Final smoke + cache-bust + PR

- [ ] **Step 1: Node tests** — `node tests/terrain/slope-blocks.test.mjs && node tests/terrain/layout.test.mjs && node tests/terrain/height.test.mjs && node tests/graphics/graphics.test.mjs` → all green.

- [ ] **Step 2: Smoke all 3 maps (controller-run)** — arena/steppe/demo load, start a run, **0 console
errors**; arena/steppe behavior unchanged (no terrain, slope-limit gate dormant, no seated props); demo
shows the seated structures.

- [ ] **Step 3: Cache-bust** — bump `index.html` `?v=` to the next free version (above the highest open
PR) and `GAME_BUILD` in `game.js` to the current minute. Commit:
```bash
git add index.html src/game.js
git commit -m "chore(terrain): cache-bust vNNN (Phase 2 terrain placement)"
```

- [ ] **Step 4: Push + PR (stacked).** Base the PR on the branch this stacks on (`feat/graphics-quality`
unless 1B has merged), so the diff is Phase-2-only:
```bash
git push -u origin feat/terrain-placement
gh pr create --base feat/graphics-quality --title "feat(terrain): Phase 2 — placement API + horde slope-limit" --body "..."
```

---

## Definition of Done (spec §3.3 / §3.4 / §6 Phase 2)

- `seatBox`/`placeProp` seat colliders + props on the terrain surface; ~5 test structures live on the
  demo (incl. one on a slope), the player collides with them, the grid indexes them.
- Enemies can't scale cliffs (steep-knoll climb blocked) via the shared `slopeBlocks` gate; flat maps
  unaffected (`hasTerrain`-gated).
- Placement is deterministic (fixed positions + seeded terrain) → co-op-safe, no new net message (a 2-tab
  co-op determinism playtest stays deferred, per the project pattern).
- Node tests green (incl. new `slopeBlocks`); 0 console errors on all three maps.

**Co-op note:** seated props rebuild identically on host + clients from `mapId`+seed (like spawns), so no
`mp.js` change is needed — confirm no graphics/placement field enters the net envelope.
