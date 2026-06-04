# Steppe Map → 1000×1000 Enlargement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double the steppe map to 1000×1000 (`HALF=500`), spread the 5 districts apart with new POIs and a couple of dirt roads between them, spawn enemy waves around the player, and add a uniform SpatialGrid so collision/raycast stays O(1).

**Architecture:** `world.HALF` is per-map (steppe only). Districts are self-contained `buildX(world, ox, oz)` calls — spreading them = moving origins + their boulder-exclusions + lootSpots. A new `SpatialGrid` (src/grid.js) indexes `world.boxes` (which stays the source of truth); `world.collide()`, the enemy collision loops, and the weapon hitscan query the grid instead of iterating all boxes. Waves spawn relative to the player, not the map edge.

**Tech Stack:** vanilla JS + Three.js r160, no build/test/lint. **Verification is in-browser** against `window.GAME` (serve a fresh HTTP port, navigate, `eval`, screenshot). Pixelization was removed (full-res), which makes playwright screenshots time out → in the verify `eval`, shrink the framebuffer first: `g.engine.renderer.setPixelRatio(0.8); g.engine.renderer.setSize(900,800,false); g.engine.camera.aspect=900/800; g.engine.camera.updateProjectionMatrix();`. Each task ends with a `?cb=N` (or fresh port) reload, a verify, and a commit. Work in `.claude/worktrees/field-strongpoint` (branch `feat/airfield-district`).

**Standing verify recipe** (used in every task; `EVAL` = the `browser_evaluate` body):
```js
const g = window.GAME; if (!g) return 'NO GAME';
if (g.state !== 'playing') g.startGame('purge');
g.pause = () => {}; const p = document.getElementById('pause'); if (p){ p.classList.remove('show'); p.style.setProperty('display','none','important'); }
try { Object.defineProperty(g,'state',{configurable:true,get(){return 'playing'},set(){}}); } catch(e){}
g.player.update = () => {}; if (g.waves) g.waves.update = () => {}; if (g.enemies) g.enemies.update = () => {};
g.engine.renderer.setPixelRatio(0.8); g.engine.renderer.setSize(900,800,false);
const cam = g.engine.camera; cam.aspect = 900/800; cam.updateProjectionMatrix();
/* …task-specific camera + return checks… */ g.engine.render(); return { boxes: g.world.boxes.length /*, …*/ };
```
Serve fresh per task: `lsof -ti :PORT|xargs -r kill -9; nohup python3 -m http.server PORT >/tmp/m.log 2>&1 &` (use a new PORT each task to dodge the bare-import module cache).

---

## File Structure

- **`src/grid.js`** (NEW) — `SpatialGrid` class: spatial-hash index over AABB boxes; `build/addBox/queryAABB/raycast`. One responsibility: broad-phase spatial queries. No game logic.
- **`src/openworld.js`** (NEW) — open-steppe content: `buildRoads(world)` (1–2 dirt roads + telegraph poles) and the small POI builders (`buildFuelStation`, `buildBusStop`, `buildCheckpoint`, `buildConvoyWreck`, `buildWell`) + an `buildOpenWorld(world)` entry that places them. Mirrors the `airfield.js`/`industrial.js` builder pattern.
- **`src/world.js`** (MODIFY) — `_buildSteppe`: `HALF=500`, scaled boulder/border counts, moved district origins + exclusions + lootSpots, `this.grid = new SpatialGrid(); …grid.build(this.boxes)`; route the runtime collider pushes (wreck `:334`, fortification `:447`) through `grid.addBox`; refactor `collide()`/`_headClear()`/`_moveAxis()` to query the grid.
- **`src/engine.js`** (MODIFY) — camera `far 1000→1200`.
- **`src/waves.js`** (MODIFY) — `_spawnPos()` spawns around the player.
- **`src/enemies.js`** (MODIFY) — the 3 `for (const b of this.world.boxes)` loops (≈ lines 328, 355, 848) query the grid.
- **`src/weapons.js`** (MODIFY) — the `rayAABB` hitscan loop (≈ line 2114) uses `grid.raycast`.
- **`src/player.js`** (MODIFY) — steppe spawn coord (`:34`) to match the moved strongpoint.
- **`interactive-real-v6.html`** (MODIFY) — 1000×1000 scale + new positions + roads + POIs.
- **`index.html` + `src/game.js`** (MODIFY) — cache-bust at the end.

---

## PHASE A — Core enlargement

### Task A1: Double the map + camera far

**Files:** Modify `src/world.js` (`_buildSteppe` `this.HALF = 250`), `src/engine.js` (`far: 1000`).

- [ ] **Step 1 — bump HALF.** In `src/world.js` `_buildSteppe()` change `this.HALF = 250;` → `this.HALF = 500;`.
- [ ] **Step 2 — camera far.** In `src/engine.js` change `new THREE.PerspectiveCamera(80, 1, 0.05, 1000)` → `…, 1200)`.
- [ ] **Step 3 — verify.** Serve port 8170; `EVAL` camera high top-down `cam.position.set(0,700,0); cam.lookAt(0,0,1);` return `{ half: g.world.HALF }`. Screenshot. Expect: ground/mountains span the larger area, `half:500`, districts now clustered in the centre (we spread them next), no console errors.
- [ ] **Step 4 — commit.** `git add src/world.js src/engine.js && git commit -m "feat(map): steppe HALF 250→500 (1000×1000) + camera far 1200"`

### Task A2: Reposition the 5 districts (+ exclusions + lootSpots + player spawn)

**Files:** Modify `src/world.js` (the 5 `buildX` calls, the boulder-exclusion `if` lines, the `lootSpots.push`), `src/player.js:34`.

- [ ] **Step 1 — move the build calls.** In `_buildSteppe()`:
  - `buildStrongpoint(this, -150, -90)` → `buildStrongpoint(this, -330, -300)`
  - `buildAirfield(this, 0, 0)` → `buildAirfield(this, 0, 250)`
  - `buildKolkhoz(this, 0, -165)` → `buildKolkhoz(this, 300, -300)`
  - `buildSecretBunker(this, 170, 15)` → `buildSecretBunker(this, 360, 150)`
  - `buildIndustrial(this, 0, 0)` (kombinát) stays.
- [ ] **Step 2 — move the matching boulder-exclusions.** Update each `if (… ) continue;` to the new origin (shift by the same delta as its district):
  - Strongpoint (delta −180,−210): `if (Math.hypot(x + 150, z + 90) < 48)` → `if (Math.hypot(x + 330, z + 300) < 56)` (widen R a touch).
  - Airfield (delta 0,+250): `if (x > -232 && x < 112 && z > 46 && z < 250)` → `if (x > -232 && x < 112 && z > 296 && z < 500)`.
  - Kolkhoz (delta +300,−135): `if (x > -46 && x < 46 && z > -199 && z < -111)` → `if (x > 254 && x < 346 && z > -334 && z < -246)`.
  - Bunker (delta +190,+135): `if (x > 150 && x < 190 && z > -8 && z < 38)` → `if (x > 340 && x < 380 && z > 127 && z < 173)`.
  - Kombinát exclusion unchanged.
- [ ] **Step 3 — move the kolkhoz lootSpots.** `this.lootSpots.push(new THREE.Vector3(18,0,-175), new THREE.Vector3(0,0,-149))` → `…(318,0,-310), (300,0,-284)` (delta +300,−135).
- [ ] **Step 4 — player spawn.** In `src/player.js` line 34 the steppe spawn `this.pos.set(-150, 0, -72)` is the old strongpoint; change to the new strongpoint so you still start at the fortified home base: `this.pos.set(-330, 0, -282); this.yaw = Math.PI;`.
- [ ] **Step 5 — verify.** Serve 8171; `EVAL` near-top-down `cam.position.set(0,750,80); cam.lookAt(0,0,40);` (lower DPR) + return collider counts near each new origin via a `near(cx,cz,r)` helper (as used before). Screenshot. Expect: 5 distinct districts spread to the quadrants, kombinát central, **wide open steppe between them**, no district overlapping another, no boulders inside districts.
- [ ] **Step 6 — commit.** `git add src/world.js src/player.js && git commit -m "feat(map): spread the 5 steppe districts across the 1000 map (+ exclusions, lootSpots, spawn)"`

### Task A3: Scale the boulder field + mountain peaks for the bigger area

**Files:** Modify `src/world.js` (the three steppe loops).

- [ ] **Step 1 — scale counts.** In `_buildSteppe()`: visual-boulder loop `for (let i = 0; i < 220; i++)` → `… < 880`; collidable open-ground boulder loop `for (let i = 0; i < 24; i++)` → `… < 96`; mountain-peak loop `for (let i = 0; i < 64; i++)` → `… < 128`. (Density preserved across 4× area / 2× perimeter.)
- [ ] **Step 2 — verify.** Serve 8172; `EVAL` an eye-level pan across open steppe `cam.position.set(0,6,0); cam.lookAt(120,4,120);` return `{ boxes: g.world.boxes.length }`. Screenshot. Expect: boulder density looks like the old map (not sparse, not a wall), mountains ring the bigger border, no perf stall on load.
- [ ] **Step 3 — commit.** `git add src/world.js && git commit -m "feat(map): scale boulder + mountain-peak counts to the 1000 map density"`

### Task A4: Spawn waves around the player

**Files:** Modify `src/waves.js` (`_spawnPos`, imports).

- [ ] **Step 1 — confirm imports.** Ensure `src/waves.js` imports `TAU, rr, clamp, pick` from `./util.js` and `THREE`. Add any missing (`rr`, `clamp`, `TAU`, `THREE`).
- [ ] **Step 2 — replace `_spawnPos`.** Replace the existing `_spawnPos()` with:
```js
_spawnPos() {
  const pp = this.game.player.pos, grid = this.game.world.grid, HALF = this.game.world.HALF;
  const yaw = this.game.player.yaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw); // player forward (bias spawns behind/flanks)
  for (let tries = 0; tries < 8; tries++) {
    const ang = rr(0, TAU), R = rr(75, 120), dxn = Math.sin(ang), dzn = Math.cos(ang);
    if (tries < 5 && (dxn * fx + dzn * fz) > 0.3) continue; // skip the front cone on early tries
    const x = clamp(pp.x + dxn * R, -HALF + 6, HALF - 6), z = clamp(pp.z + dzn * R, -HALF + 6, HALF - 6);
    const near = grid ? grid.queryAABB(x - 1.5, z - 1.5, x + 1.5, z + 1.5) : this.game.world.boxes;
    let blocked = false;
    for (const b of near) { if (x > b.min.x - 1 && x < b.max.x + 1 && z > b.min.z - 1 && z < b.max.z + 1 && b.max.y > 1) { blocked = true; break; } }
    if (!blocked) return new THREE.Vector3(x, 0, z);
  }
  const a = rr(0, TAU); // fallback: just offset from the player
  return new THREE.Vector3(clamp(pp.x + Math.sin(a) * 90, -HALF + 6, HALF - 6), 0, clamp(pp.z + Math.cos(a) * 90, -HALF + 6, HALF - 6));
}
```
(NB: `world.grid` does not exist until Phase B — the `grid ? … : this.game.world.boxes` fallback keeps this working now; it auto-upgrades to the grid in Phase B.)
- [ ] **Step 3 — verify.** Serve 8173; in `EVAL` DON'T freeze waves — instead: `g.startGame('purge'); g.player.pos.set(300,0,200); for(let i=0;i<8;i++) g.waves._spawnOne(); const ds = g.enemies.list.filter(e=>e.alive).map(e=>Math.hypot(e.pos.x-300,e.pos.z-200));` return `{ dists: ds }`. Expect: all spawn distances are ~70–125 (around the player at the far-NE), NOT ~500+. Also screenshot a normal play view to confirm enemies appear near you.
- [ ] **Step 4 — commit.** `git add src/waves.js && git commit -m "feat(waves): spawn enemies around the player (75-120m, off-view), not the map edge"`

**Phase A checkpoint:** serve fresh, play a few seconds (unfreeze), walk between two districts, confirm waves engage you anywhere. Note baseline FPS (`g.engine` frame timing or eyeball).

---

## PHASE B — SpatialGrid (O(1) collision/raycast)

### Task B1: Create `src/grid.js`

**Files:** Create `src/grid.js`.

- [ ] **Step 1 — write the class.**
```js
// grid.js — uniform spatial-hash index over world.boxes (AABB colliders) for O(1) broad-phase
// collision queries + ray casts. The grid does NOT own the boxes — world.boxes stays authoritative;
// this is an index that must be kept in sync (build once, addBox on every runtime collider push).
import { rayAABB } from './util.js';

const CELL = 16; // metres per cell — ~ a large structure footprint

export class SpatialGrid {
  constructor(cell = CELL) { this.cell = cell; this.cells = new Map(); this._qid = 0; }
  _k(cx, cz) { return cx * 100003 + cz; }              // pack two smallish ints into one map key
  clear() { this.cells.clear(); }
  build(boxes) { this.clear(); for (const b of boxes) this.addBox(b); return this; }
  addBox(box) {
    const c = this.cell;
    const x0 = Math.floor(box.min.x / c), x1 = Math.floor(box.max.x / c);
    const z0 = Math.floor(box.min.z / c), z1 = Math.floor(box.max.z / c);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = this._k(cx, cz); let a = this.cells.get(k); if (!a) this.cells.set(k, a = []); a.push(box);
    }
    return box;
  }
  // Boxes whose cells overlap the XZ rectangle. De-duped via a per-query stamp (no allocation).
  queryAABB(minx, minz, maxx, maxz, out = []) {
    out.length = 0; const c = this.cell, qid = ++this._qid;
    const x0 = Math.floor(minx / c), x1 = Math.floor(maxx / c), z0 = Math.floor(minz / c), z1 = Math.floor(maxz / c);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const a = this.cells.get(this._k(cx, cz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) { const b = a[i]; if (b._qid !== qid) { b._qid = qid; out.push(b); } }
    }
    return out;
  }
  // Nearest box hit by the ray within maxDist. XZ-DDA cell walk + rayAABB per box, early-out. Returns {box,t} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter) {
    const c = this.cell, qid = ++this._qid;
    let cx = Math.floor(ox / c), cz = Math.floor(oz / c);
    const stepX = dx >= 0 ? 1 : -1, stepZ = dz >= 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(c / dx) : Infinity, tDeltaZ = dz !== 0 ? Math.abs(c / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (cx + 1) * c : cx * c) - ox) / dx : Infinity;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? (cz + 1) * c : cz * c) - oz) / dz : Infinity;
    let best = null, bestT = maxDist;
    for (let guard = 0; guard < 8192; guard++) {
      const a = this.cells.get(this._k(cx, cz));
      if (a) for (let i = 0; i < a.length; i++) { const b = a[i];
        if (b._qid === qid) continue; b._qid = qid; if (filter && !filter(b)) continue;
        const t = rayAABB(ox, oy, oz, dx, dy, dz, b.min, b.max);
        if (t != null && t >= 0 && t < bestT) { bestT = t; best = b; } }
      const exit = Math.min(tMaxX, tMaxZ);
      if (best && bestT <= exit) break;          // nearest hit is within an already-tested cell
      if (exit > maxDist) break;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDeltaX; } else { cz += stepZ; tMaxZ += tDeltaZ; }
    }
    return best ? { box: best, t: bestT } : null;
  }
}
```
- [ ] **Step 2 — verify in isolation.** Serve 8174; `EVAL`: `const {SpatialGrid}=await import('./src/grid.js?v=1'); const g2=new SpatialGrid(16); const A={min:{x:5,y:0,z:5},max:{x:9,y:3,z:9}}; g2.build([A]); const q=g2.queryAABB(6,6,7,7); const rc=g2.raycast(0,1,7,1,0,0,50); return { found:q.length, hitT: rc&&rc.t };` Expect `{found:1, hitT:5}` (ray from x=0 hits A's min.x=5 at t=5). 0 errors.
- [ ] **Step 3 — commit.** `git add src/grid.js && git commit -m "feat(engine): SpatialGrid — spatial-hash index over world.boxes (queryAABB + DDA raycast)"`

### Task B2: Build + maintain the grid in `world.js`

**Files:** Modify `src/world.js` (import, build after world setup, addBox on the 2 runtime pushes; the `_solid` push at `:38` is build-time so the initial `build()` covers it).

- [ ] **Step 1 — import + field.** Add `import { SpatialGrid } from './grid.js';` at the top of `world.js`. In the `World` constructor, `this.grid = new SpatialGrid();`.
- [ ] **Step 2 — build after world geometry.** At the END of the map setup (after `_buildSteppe`/arena have pushed all structure colliders — i.e. wherever the map build finishes), add `this.grid.build(this.boxes);`. (Find the call site that runs `_buildSteppe()` and build the grid right after it.)
- [ ] **Step 3 — runtime adds.** Wreck push (`world.js:334`) and fortification push (`world.js:447`): after each `this.boxes.push(<box>)`, add `this.grid.addBox(<the same box>);`. (Two edits.)
- [ ] **Step 4 — verify.** Serve 8175; `EVAL` return `{ boxes: g.world.boxes.length, cells: g.world.grid.cells.size, sample: g.world.grid.queryAABB(-330-8,-300-8,-330+8,-300+8).length }`. Expect: `cells` > 0, the sample near the strongpoint origin returns several boxes. 0 errors.
- [ ] **Step 5 — commit.** `git add src/world.js && git commit -m "feat(engine): build the SpatialGrid after world gen + addBox on runtime wreck/fortification colliders"`

### Task B3: Route `world.collide()` / `_headClear()` / `_moveAxis()` through the grid

**Files:** Modify `src/world.js` (3 methods). **Read each method first**, then swap only the iteration source.

- [ ] **Step 1 — `collide()` vertical loop.** Replace `for (const b of this.boxes) {` (the vertical-resolution loop) with `for (const b of this.grid.queryAABB(pos.x - r, pos.z - r, pos.x + r, pos.z + r)) {`. Body unchanged.
- [ ] **Step 2 — `_headClear()` loop.** Replace its `for (const b of this.boxes) {` with `for (const b of this.grid.queryAABB(pos.x - r, pos.z - r, pos.x + r, pos.z + r)) {`. Body unchanged (the `b === ignore` skip stays).
- [ ] **Step 3 — `_moveAxis()` loop.** Read `_moveAxis` (just below `_headClear`). It sweeps along one axis by `delta`; replace its `for (const b of this.boxes)` with a query that covers the swept AABB: `for (const b of this.grid.queryAABB(Math.min(pos.x, pos.x+ (ax==='x'?delta:0)) - r, Math.min(pos.z, pos.z + (ax==='z'?delta:0)) - r, Math.max(pos.x, pos.x + (ax==='x'?delta:0)) + r, Math.max(pos.z, pos.z + (ax==='z'?delta:0)) + r))`. Body unchanged. (If `_moveAxis` mutates `pos` mid-loop, snapshot the query BEFORE the move math — query into a local array first.)
- [ ] **Step 4 — verify (collision must be identical).** Serve 8176; play unfrozen: walk into a building wall (can't pass), walk up the КДП tower stair / a shelter lip (step-up climbs), walk off the map edge (clamped), enter a shelter (door gap passes). Screenshot mid-walk inside a structure. Also `EVAL` a scripted check: place the player just outside a known wall and step toward it, assert `pos` didn't penetrate. Expect: collision/step-up behave exactly as before.
- [ ] **Step 5 — commit.** `git add src/world.js && git commit -m "perf(collision): player collide/headClear/moveAxis query the SpatialGrid (O(1))"`

### Task B4: Route the enemy collision loops through the grid

**Files:** Modify `src/enemies.js` (the 3 `for (const b of this.world.boxes)` loops, ≈ 328, 355, 848). **Read each loop's surrounding code first.**

- [ ] **Step 1 — loops 328 + 355 (enemy-vs-world steering/collision).** Each resolves an enemy `e` against world boxes near `e.pos`. Replace `for (const b of this.world.boxes) {` with `for (const b of this.world.grid.queryAABB(e.pos.x - e.radius - 0.5, e.pos.z - e.radius - 0.5, e.pos.x + e.radius + 0.5, e.pos.z + e.radius + 0.5)) {`. Body unchanged.
- [ ] **Step 2 — loop 848.** Read it; if it's also an AABB-vs-point/enemy test, apply the same `queryAABB` around the relevant position (use that loop's center point + radius). If it's a raycast (line-of-sight), use `this.world.grid.raycast(...)` instead — match the existing math.
- [ ] **Step 3 — verify.** Serve 8177; unfreeze, let a wave spawn, watch enemies path around buildings/boulders (they don't walk through walls, don't get stuck en masse on a flat face). Screenshot a group navigating a structure. Expect: identical steering behaviour.
- [ ] **Step 4 — commit.** `git add src/enemies.js && git commit -m "perf(enemies): enemy-vs-world collision queries the SpatialGrid"`

### Task B5: Route the weapon hitscan through the grid

**Files:** Modify `src/weapons.js` (the `rayAABB` loop ≈ 2114). **Read the surrounding hitscan method first.**

- [ ] **Step 1 — replace the box loop.** The current loop iterates `this.game.world.boxes`, computes `rayAABB(...)` per box, and keeps the nearest `t` (for world geometry blocking the shot). Replace that whole loop with one call: `const wc = this.game.world.grid.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist, b => !b.wreck === false ? true : true);` — i.e. `const wc = this.game.world.grid.raycast(origin.x,origin.y,origin.z,dir.x,dir.y,dir.z, range);` and use `wc ? wc.t : Infinity` as the world-hit distance. Keep the existing comparison against enemy-hit distance (world blocks the shot if `wc.t` < enemy distance). Preserve any existing per-box filter (e.g. skipping non-blocking boxes) by passing it as the `filter` arg.
- [ ] **Step 2 — verify.** Serve 8178; unfreeze, shoot at an enemy in the open (registers a hit), shoot a wall between you and an enemy (blocked — no hit), shoot through a shelter door gap (hits). Screenshot the hitmarker on a clean hit. Expect: hitscan identical to before.
- [ ] **Step 3 — commit.** `git add src/weapons.js && git commit -m "perf(weapons): hitscan world-block test uses SpatialGrid.raycast"`

### Task B6: FPS sanity (Phase A baseline vs grid)

- [x] **Step 1 — measure.** Direct grid-vs-brute microbench over the live 952-collider map (per-call cost is the real frame driver, not a noisy 60-frame timer):
  - **Collision query (queryAABB vs full boxes scan):** 60 000 queries → **6.5 ms grid vs 353 ms brute = 54.3× faster** (0.108 µs/query). This is the hot path — every enemy runs 2 box loops/frame, so a 100-mob wave is ~190 k box-tests/frame brute → ~1 k with the grid.
  - **Raycast (rayHit→grid.raycast vs brute rayHit):** 6 000 rays → **4.1 ms grid vs 47.1 ms brute = 11.5× faster** (0.683 µs/ray); hit counts identical (3198 = 3198), a bonus correctness confirmation.
  - Verdict: the grid makes the 4×-area map cheaper to simulate than the old 500² map was, not just break-even. No CELL/bounds tuning needed (16 m cell is well-matched to structure footprints).
- [x] **Step 2 — commit (if any tuning).** No tuning required; CELL=16 left as-is.

---

## PHASE C — Roads + new POIs

### Task C1: `src/openworld.js` — dirt roads + telegraph poles

**Files:** Create `src/openworld.js`; wire `buildOpenWorld(this)` into `world.js _buildSteppe` (after the districts) + add a boulder-exclusion strip along the roads.

- [ ] **Step 1 — roads builder.** Create `src/openworld.js` exporting `buildRoads(world)` that lays flat dirt/gravel strips (thin boxes at y≈0.05, palette `{hi:0x8a7a55,mid:0x6e5f40,lo:0x52462e}`, no collider) following the airfield-taxiway pattern, plus telegraph poles (thin collidable cylinders every ~30 m). Routes: a main **N–S road** from the S border up through (0,0) kombinát to the airfield gate at (0, ~+296); optionally an **E–W spur** linking it toward the bunker (+360,+150). Keep it data-light (a polyline → segment boxes).
- [ ] **Step 2 — entry + wire.** Add `export function buildOpenWorld(world){ buildRoads(world); /* POIs in C2 */ }`. In `world.js`: `import { buildOpenWorld } from './openworld.js';` and call `buildOpenWorld(this);` after the districts (before the final `grid.build`).
- [ ] **Step 3 — verify.** Serve 8180; `EVAL` follow the road `cam.position.set(0,14,-40); cam.lookAt(0,4,120);`. Screenshot. Expect: a believable dirt road runs N toward the airfield with poles; no z-fight with the ground; poles don't block the lane.
- [ ] **Step 4 — commit.** `git add src/openworld.js src/world.js && git commit -m "feat(openworld): main dirt road(s) + telegraph poles across the steppe"`

### Task C2: Small roadside POIs

**Files:** Modify `src/openworld.js` (POI builders + place them in `buildOpenWorld`); add small boulder-exclusions for each in `world.js`.

- [ ] **Step 1 — POI builders.** Add small builders (a handful of boxes each, layered-shading palette, ≤ ~1 collider each): `buildFuelStation` (АЗС: canopy + 2 pumps + booth), `buildBusStop` (автобусная остановка: shelter + sign), `buildCheckpoint` (КПП booth + boom), `buildConvoyWreck` (2–3 burnt truck hulks), `buildWell` (колодец + windpump). Each takes `(world, cx, cz)`.
- [ ] **Step 2 — place along roads/gaps.** In `buildOpenWorld`, place ~5–7 POIs at road-side spots in the open gaps (e.g. fuel station at a road junction, bus stop on the N road, checkpoint where the road nears a district, convoy wreck in an open stretch, well off-road). Add a tiny `if (Math.hypot(x-cx,z-cz) < r) continue;` boulder-exclusion per POI in `world.js`.
- [ ] **Step 3 — verify.** Serve 8181; visit 2–3 POIs (`EVAL` camera to each). Screenshot. Expect: each reads as its thing, sits cleanly on the steppe/road, no boulders inside, no overlap with districts.
- [ ] **Step 4 — commit.** `git add src/openworld.js src/world.js && git commit -m "feat(openworld): roadside POIs (АЗС, bus stop, КПП, convoy wreck, well)"`

---

## PHASE D — HTML map + polish

### Task D1: Update the HTML map

**Files:** Modify `interactive-real-v6.html`.

- [ ] **Step 1 — read it.** Open `interactive-real-v6.html`; find the world-extent constant (the 500/250 scale) + the data arrays that place districts/labels.
- [ ] **Step 2 — rescale + reposition.** Change the world extent to 1000 (HALF 500) and update the district entries to the new origins from Task A2 (strongpoint −330,−300; airfield 0,+250; kolkhoz 300,−300; bunker 360,150; kombinát 0,0). Add entries for the roads + the new POIs from Phase C.
- [ ] **Step 3 — verify.** Open the HTML map in a browser; confirm it visually matches the in-game spread (districts in the right quadrants, roads between, POIs along them).
- [ ] **Step 4 — commit.** `git add interactive-real-v6.html && git commit -m "docs(map): update the interactive HTML map to 1000×1000 + new district/road/POI positions"`

### Task D2: Final pass + cache-bust

- [ ] **Step 1 — full sweep.** Serve a fresh port; spawn, walk the whole map: spawn → kombinát → up the N road → airfield (enter a shelter/hangar/tower) → across to the bunker → SE kolkhoz → SW strongpoint. Confirm: waves engage you everywhere, fog reveals districts as you approach, no collision regressions, FPS holds. Take 3–4 hero screenshots.
- [ ] **Step 2 — cache-bust.** Bump `index.html` `?v=224 → 225` and `src/game.js` `GAME_BUILD` to the current minute.
- [ ] **Step 3 — commit.** `git add index.html src/game.js && git commit -m "chore(map): cache-bust — ship the 1000×1000 steppe enlargement"`
- [ ] **Step 4 — (on user OK) merge to main.** Fetch origin, merge/FF, resolve any cache-bust conflict to the higher `?v=`, push `feat/airfield-district:main` (owner bypass). Verify origin/main + Vercel deploy.

---

## Self-Review

**Spec coverage:** ① scale → A1/A3; ② district reposition → A2; ③ SpatialGrid → B1–B6; ④ spawn-around-player → A4; ⑤ content (boulders/roads/POIs) → A3/C1/C2; ⑥ HTML map → D1; build order A→B→C→D matches. Player-spawn reconciliation (not in the spec) is handled in A2/step4. ✓ all covered.

**Placeholder scan:** the two read-then-refactor tasks (B3 `_moveAxis`, B4 loop 848, B5 filter) intentionally say "read the method first" because the exact surrounding lines must be matched at edit time — but each gives the precise transformation (which loop, what query replaces it, body unchanged). No "add error handling"/"TBD". Grid + spawn code is given in full. ✓

**Type consistency:** `SpatialGrid` API used consistently — `grid.build(boxes)`, `grid.addBox(box)`, `grid.queryAABB(minx,minz,maxx,maxz)`, `grid.raycast(ox,oy,oz,dx,dy,dz,maxDist,filter)→{box,t}|null` (B1 defines, A4/B2/B3/B4/B5 consume with the same signatures). `world.grid` field name consistent. ✓
