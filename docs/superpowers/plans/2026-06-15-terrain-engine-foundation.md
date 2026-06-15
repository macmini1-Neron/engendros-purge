# Terrain Engine Foundation (Phase 1A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make real terrain a first-class engine substrate the whole game runs on — one unified
collision path (flat = a special case of terrain) and a **chunked**, frustum-culled ground mesh built
to scale — proven on the `demo` sandbox, with arena/steppe behavior unchanged.

**Architecture:** `terrain.js` (pure, seeded heightfield — already exists, profile `'flat'` returns 0)
stays the height authority. A new pure `terrain-layout.js` plans the chunk grid; `terrain-mesh.js` gains
a per-chunk geometry builder with **seamless normals sampled from the continuous heightfield**; a new
`terrain-chunks.js` owns the grid of chunk meshes + explicit frustum culling. `world.js` constructs a
terrain for **every** map (flat for arena/steppe) and routes all collision through the terrain-aware
path; every ground-height consumer goes through `world.groundY()`.

**Tech Stack:** vanilla ES modules, Three.js r160 (vendored, `import * as THREE from 'three'`), Node's
built-in `node:test` for pure-logic unit tests. **No build step.** Integration verified in-browser
against `window.GAME`.

**Spec:** `docs/superpowers/specs/2026-06-15-terrain-engine-rebuild-design.md` (§3.1, §3.2, §6 Phase 1).
This plan covers Phase 1A (terrain foundation). Phase 1B (graphics-quality settings, §3.5) is a sibling
plan. Phase 2 (placement API, enemies/props-on-terrain, horde slope-limit) is a later plan.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/terrain.js` | unchanged | Pure seeded heightfield: `terrainHeightAt/SlopeAt/NormalAt`, `isPlaceable`. Already has `'flat'` (returns 0) + `'demo'`. |
| `src/terrain-layout.js` | **new** | **Pure, no THREE.** `planChunks(extent, chunkSize)` → array of chunk descriptors (world-space bounds/centers). Node-testable. |
| `src/terrain-mesh.js` | modify | Add `buildChunkMesh(terrain, chunk, resolution)` (per-tile geometry, slope colors, **seamless** normals from `terrainNormalAt`). Keep existing color constants. (Single-plane `buildGroundMesh` becomes dead after Task 4 — harmless; optional later cleanup.) |
| `src/terrain-chunks.js` | **new** | `TerrainChunks` class: builds chunk meshes from `planChunks` + `buildChunkMesh`, owns a `THREE.Group`, explicit per-chunk frustum culling in `update(camera)`, `dispose()`. |
| `src/world.js` | modify | Construct a terrain for every map (flat/demo); route `collide()` through the terrain path; `groundY()` always valid; wire `TerrainChunks` into `_buildDemo`; expose `this.chunks`. |
| `src/game.js` | modify | Call `world.chunks.update(camera)` once per frame before render. |
| ground-Y consumers | modify | Replace `hasTerrain ? terrainHeightAt : 0` ground-height expressions with `world.groundY()`. Leave `hasTerrain` *gameplay* gates alone. |
| `tests/terrain/layout.test.mjs` | **new** | Node unit tests for `planChunks`. |

**Conventions (match existing code):** world/tank space forward = +Z, up = +Y; `MeshLambertMaterial`
vertex-colored voxel look; unseeded gameplay RNG stays in `util.js`; terrain stays seeded (co-op
determinism). No per-module `?v=` query params on imports (bare paths only).

---

## Task 1: Pure chunk-grid planner (`terrain-layout.js`)

**Files:**
- Create: `src/terrain-layout.js`
- Test: `tests/terrain/layout.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/terrain/layout.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { planChunks } from '../../src/terrain-layout.js';

test('covers the full map with no gaps and no overflow', () => {
  const extent = 128, chunk = 64;          // map spans [-128,128] on each axis = 256 m
  const chunks = planChunks(extent, chunk);
  // 256/64 = 4 chunks per axis = 16 total
  assert.equal(chunks.length, 16);
  // every chunk stays within map bounds
  for (const c of chunks) {
    assert.ok(c.minX >= -extent - 1e-9 && c.maxX <= extent + 1e-9);
    assert.ok(c.minZ >= -extent - 1e-9 && c.maxZ <= extent + 1e-9);
    assert.ok(c.sizeX > 0 && c.sizeZ > 0);
    assert.equal(c.centerX, (c.minX + c.maxX) / 2);
    assert.equal(c.centerZ, (c.minZ + c.maxZ) / 2);
  }
  // union of chunk areas == full map area (no gaps/overlap for an even split)
  const area = chunks.reduce((s, c) => s + c.sizeX * c.sizeZ, 0);
  assert.equal(area, (extent * 2) * (extent * 2));
});

test('clamps the final row/col when span is not divisible by chunkSize', () => {
  const extent = 100, chunk = 64;          // span 200, ceil(200/64) = 4 per axis
  const chunks = planChunks(extent, chunk);
  assert.equal(chunks.length, 16);
  // last column max must clamp to +extent, never overshoot
  const maxX = Math.max(...chunks.map((c) => c.maxX));
  const maxZ = Math.max(...chunks.map((c) => c.maxZ));
  assert.equal(maxX, extent);
  assert.equal(maxZ, extent);
  // a clamped edge chunk is narrower than a full one
  assert.ok(chunks.some((c) => c.sizeX < chunk - 1e-9));
});

test('rejects non-positive inputs', () => {
  assert.throws(() => planChunks(0, 64));
  assert.throws(() => planChunks(128, 0));
  assert.throws(() => planChunks(-5, 64));
});

test('chunk count per axis is ceil(span / chunkSize)', () => {
  assert.equal(planChunks(160, 64).length, Math.ceil(320 / 64) ** 2); // 5*5 = 25
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node "tests/terrain/layout.test.mjs"`
Expected: FAIL — `Cannot find module '.../src/terrain-layout.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/terrain-layout.js`:

```javascript
// Pure chunk-grid planner for the terrain mesh. NO THREE import → node-testable.
// A map spans [-extent, +extent] on both X and Z (so its side is extent*2 metres).
// We tile it into square chunks of `chunkSize` metres; the final row/col is clamped
// to the map edge so chunks never overflow the playable bounds.
export function planChunks(extent, chunkSize) {
  if (!(extent > 0) || !(chunkSize > 0)) {
    throw new Error(`planChunks: extent and chunkSize must be > 0 (got ${extent}, ${chunkSize})`);
  }
  const span = extent * 2;
  const n = Math.ceil(span / chunkSize); // chunks per axis
  const chunks = [];
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const minX = -extent + ix * chunkSize;
      const minZ = -extent + iz * chunkSize;
      const maxX = Math.min(minX + chunkSize, extent);
      const maxZ = Math.min(minZ + chunkSize, extent);
      chunks.push({
        ix, iz,
        minX, minZ, maxX, maxZ,
        sizeX: maxX - minX,
        sizeZ: maxZ - minZ,
        centerX: (minX + maxX) / 2,
        centerZ: (minZ + maxZ) / 2,
      });
    }
  }
  return chunks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node "tests/terrain/layout.test.mjs"`
Expected: PASS — all 4 tests OK.

- [ ] **Step 5: Commit**

```bash
git add "src/terrain-layout.js" "tests/terrain/layout.test.mjs"
git commit -m "feat(terrain): pure chunk-grid planner + node tests"
```

---

## Task 2: Per-chunk geometry builder (`buildChunkMesh` in `terrain-mesh.js`)

**Files:**
- Modify: `src/terrain-mesh.js` (add export `buildChunkMesh`; reuse existing `COL_GRASS/COL_DIRT/COL_ROCK`)

**Why no node test:** this builds a `THREE.Mesh` (needs Three). It is verified in-browser in Task 4.
Its only non-trivial logic is the world-coordinate sampling and **seamless normals**, both exercised
by the demo render.

- [ ] **Step 1: Add `buildChunkMesh` next to `buildGroundMesh`**

In `src/terrain-mesh.js`, add this exported function (it reuses the module-level `COL_GRASS`,
`COL_DIRT`, `COL_ROCK` constants and the same slope→color thresholds as `buildGroundMesh`):

```javascript
// Build ONE terrain chunk mesh. `chunk` is a descriptor from planChunks() (terrain-layout.js):
// { minX, minZ, sizeX, sizeZ, centerX, centerZ }. The mesh is positioned at the chunk center and
// its local vertices are sampled at WORLD coords, so chunks tile seamlessly. Normals are taken from
// the CONTINUOUS heightfield (terrain.terrainNormalAt) instead of geo.computeVertexNormals(), so
// lighting has no seam at chunk borders.
export function buildChunkMesh(terrain, chunk, resolution = 16) {
  const geo = new THREE.PlaneGeometry(chunk.sizeX, chunk.sizeZ, resolution, resolution);
  geo.rotateX(-Math.PI / 2); // lay it in the XZ plane; getX/getZ are now world-aligned offsets
  const pos = geo.attributes.position;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const wx = pos.getX(i) + chunk.centerX;
    const wz = pos.getZ(i) + chunk.centerZ;
    pos.setY(i, terrain.terrainHeightAt(wx, wz));
    const slope = terrain.terrainSlopeAt(wx, wz);
    const dirtT = THREE.MathUtils.clamp((slope - 0.18) / (0.34 - 0.18), 0, 1);
    const rockT = THREE.MathUtils.clamp((slope - 0.40) / (0.62 - 0.40), 0, 1);
    tmp.copy(COL_GRASS).lerp(COL_DIRT, dirtT).lerp(COL_ROCK, rockT);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    const nrm = terrain.terrainNormalAt(wx, wz); // seamless across chunk borders
    normals[i * 3] = nrm.x; normals[i * 3 + 1] = nrm.y; normals[i * 3 + 2] = nrm.z;
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingSphere(); // used by frustum culling in TerrainChunks
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(chunk.centerX, 0, chunk.centerZ);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // TerrainChunks owns visibility explicitly
  mesh.name = `terrainChunk_${chunk.ix}_${chunk.iz}`;
  mesh.updateMatrixWorld(true); // static chunk → world matrix computed once for culling
  return mesh;
}
```

- [ ] **Step 2: Sanity-check the module still imports**

Run: `node --check "src/terrain-mesh.js"`
Expected: no output, exit 0 (syntax OK). (Cannot run it — it imports `three` — but `--check` parses it.)

- [ ] **Step 3: Commit**

```bash
git add "src/terrain-mesh.js"
git commit -m "feat(terrain): per-chunk geometry builder with seamless heightfield normals"
```

---

## Task 3: Chunk manager (`terrain-chunks.js`)

**Files:**
- Create: `src/terrain-chunks.js`

- [ ] **Step 1: Write the module**

Create `src/terrain-chunks.js`:

```javascript
import * as THREE from 'three';
import { planChunks } from './terrain-layout.js';
import { buildChunkMesh } from './terrain-mesh.js';

// Owns the grid of terrain chunk meshes for one map. Builds them once from the (seeded) heightfield
// and culls them per-frame against the camera frustum. Each chunk is an independently-cullable mesh —
// that is the whole point of chunking vs one big plane. Reserved hook for Phase 3 LOD + Phase 1B
// draw-distance: extend update() to swap resolution / hide-by-distance.
export class TerrainChunks {
  constructor(terrain, opts = {}) {
    this.terrain = terrain;
    this.extent = opts.extent != null ? opts.extent : 160;
    this.chunkSize = opts.chunkSize != null ? opts.chunkSize : 64;
    this.resolution = opts.resolution != null ? opts.resolution : 16;
    this.scene = opts.scene || null;
    this.group = new THREE.Group();
    this.group.name = 'terrainChunks';
    this.meshes = [];
    this.visible = 0;
    // scratch objects reused each frame (no per-frame allocation)
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    for (const c of planChunks(this.extent, this.chunkSize)) {
      const mesh = buildChunkMesh(this.terrain, c, this.resolution);
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    this.visible = this.meshes.length;
    if (this.scene) this.scene.add(this.group);
  }

  // Explicit per-chunk frustum culling. Static chunks → world matrices are fixed (set at build),
  // so we only recompute the camera frustum and sphere-test each chunk. Sets this.visible (diagnostic).
  update(camera) {
    if (!camera) return;
    camera.updateMatrixWorld();
    this._inv.copy(camera.matrixWorld).invert();
    this._m.multiplyMatrices(camera.projectionMatrix, this._inv);
    this._frustum.setFromProjectionMatrix(this._m);
    let vis = 0;
    for (const mesh of this.meshes) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      this._sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
      const inView = this._frustum.intersectsSphere(this._sphere);
      mesh.visible = inView;
      if (inView) vis++;
    }
    this.visible = vis;
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.meshes.length = 0;
    if (this.scene) this.scene.remove(this.group);
  }
}
```

- [ ] **Step 2: Sanity-check syntax**

Run: `node --check "src/terrain-chunks.js"`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "src/terrain-chunks.js"
git commit -m "feat(terrain): TerrainChunks manager with explicit frustum culling"
```

---

## Task 4: Wire chunks into the demo sandbox + per-frame culling

**Files:**
- Modify: `src/world.js` — imports + `_buildDemo()` (currently `world.js:291-308`)
- Modify: `src/game.js` — `_frame` (currently `game.js:989-1006`, engine render at `997`)

- [ ] **Step 1: Import the chunk manager in `world.js`**

At the top of `src/world.js`, alongside the existing `import { buildGroundMesh } from './terrain-mesh.js';`
and `import { makeTerrain } from './terrain.js';`, add:

```javascript
import { TerrainChunks } from './terrain-chunks.js';
```

- [ ] **Step 2: Replace the single-plane ground in `_buildDemo()`**

In `src/world.js`, change `_buildDemo()` so the ground is chunked. Replace these two lines
(`world.js:296-297`):

```javascript
    const ground = buildGroundMesh(this.terrain, { extent: 160, resolution: 160 });
    this.scene.add(ground);
```

with:

```javascript
    this.chunks = new TerrainChunks(this.terrain, {
      extent: this.HALF, chunkSize: 64, resolution: 16, scene: this.scene,
    });
```

(`this.HALF` was set to `158` two lines above, at `world.js:293`. Using it keeps the chunk grid and
the movement clamp in sync.)

- [ ] **Step 3: Initialize `this.chunks` to null in the constructor**

In the `World` constructor (`world.js:44-66`), next to `this.terrain = null;` (`world.js:56`), add:

```javascript
    this.chunks = null;
```

- [ ] **Step 4: Drive culling each frame in `game.js`**

In `src/game.js` `_frame`, the render happens at `game.js:997`:
`this.engine.update(dt); this.engine.render();`. Immediately **before** that line, insert:

```javascript
    if (this.world && this.world.chunks) this.world.chunks.update(this.engine.camera);
```

- [ ] **Step 5: Start a fresh local server**

Run (background, fresh port, served from the repo root):

```bash
python3 -m http.server 8123 --directory "/Users/macmini1/game 4.8" >/tmp/eng-8123.log 2>&1 &
```

Confirm the served entry matches disk (avoids the known stale-server trap):

```bash
curl -s "http://localhost:8123/index.html" | grep -o 'game.js?v=[0-9]*'
```
Expected: prints `game.js?v=277` (whatever `index.html` currently holds).

- [ ] **Step 6: In-browser verify — demo renders chunked terrain, walkable, culled**

Use the Playwright MCP browser (do NOT close/kill it — it is shared). Navigate with a cache-buster:

`browser_navigate` → `http://localhost:8123/?map=demo&cb=1`

Then start a run (click "PLAY" / press the start control as the menu requires), and `browser_evaluate`:

```javascript
() => {
  const w = GAME.world, c = w.chunks;
  return {
    map: GAME.mapId,
    chunkCount: c ? c.meshes.length : null,
    visibleNow: c ? c.visible : null,                 // < chunkCount when looking across the map
    playerY: +GAME.player.pos.y.toFixed(2),
    terrainYUnderPlayer: +w.groundY(GAME.player.pos.x, GAME.player.pos.z).toFixed(2),
    grounded: GAME.player.onGround,
  };
}
```
Expected: `map:"demo"`, `chunkCount` ≈ 25 (316 m / 64 ≈ 5×5), `visibleNow < chunkCount` once the
camera faces across the map, and `playerY ≈ terrainYUnderPlayer` (the player stands ON the terrain,
not at 0). `grounded:true` when standing.

- [ ] **Step 7: Screenshot — visual seam check**

`browser_take_screenshot` (fullPage:false). Expected: rolling hills, **no lighting seams** at chunk
borders (normals are continuous), grass→dirt→rock coloring by slope. Save/inspect the image.

- [ ] **Step 8: Commit**

```bash
git add "src/world.js" "src/game.js"
git commit -m "feat(terrain): chunked demo terrain + per-frame frustum culling"
```

---

## Task 5: Unify the collision path — terrain for every map

**Files:**
- Modify: `src/world.js` — constructor (`44-66`), `collide()` (`310-331`), `groundY()` (`422`),
  `_build()` and `_buildSteppe()` (set a flat terrain)

**Why:** today arena/steppe have `terrain=null` and use the flat `collide()`; demo uses
`_collideTerrain()`. After this task every map has a terrain (flat or demo) and **all** collision runs
through ONE method. On a flat profile `terrainHeightAt`→0 and `terrainSlopeAt`→0, so the vertical floor,
the box loop, and `_moveAxisTerrain` (slope test never fires) are identical to the old flat path.

**⚠ One real divergence — the ground-follow block.** `_collideTerrain` ends with a "ground-follow"
re-seat that, while grounded, snaps the player DOWN onto the surface when within
`TERRAIN_GROUND_FOLLOW_STEP` (= **0.6 m**, `world.js:36`). On arena/steppe that would clip the player
off any man-made ledge/curb ≤ 0.6 m tall — the original author deliberately bypassed terrain on flat
maps for exactly this reason (`world.js:21-27`, "the player can clip down small man-made ledges").
So the unification MUST gate the ground-follow block behind `if (this.hasTerrain)` (Step 2b). With that
gate, flat maps are byte-identical to the old `y=0` floor; demo keeps smooth hill-following. Verified in
Steps 4/5 (walk onto an arena crate — must still perch, not snap to ground).

- [ ] **Step 1: Construct a terrain in the constructor for every map**

In the `World` constructor (`world.js:44-66`), the map dispatch currently sets `this.hasTerrain = false;
this.terrain = null;` then calls `_build`/`_buildSteppe`/`_buildDemo`. Change the initialization so a
terrain always exists. Replace (`world.js:55-56`):

```javascript
    this.hasTerrain = false;
    this.terrain = null;
```

with:

```javascript
    // Every map has a terrain. Flat maps use the 'flat' profile (height 0 everywhere) so the unified
    // collision path degenerates to the old y=0 floor. `hasTerrain` now means "non-flat elevation".
    this.terrain = makeTerrain({ profile: this.mapId === 'demo' ? 'demo' : 'flat', seed: 1337 });
    this.hasTerrain = this.terrain.profile === 'demo';
```

(The `this.chunks = null;` line added in Task 4 Step 3 stays directly below this block — do **not**
re-declare it here, or you get a duplicate.)

Then in `_buildDemo()` (`world.js:291-308`), **remove** the now-redundant lines (`world.js:294-295`):

```javascript
    this.hasTerrain = true;
    this.terrain = makeTerrain({ profile: 'demo', seed: 1337 });
```

(`hasTerrain` and `terrain` are now set in the constructor. Leave the rest of `_buildDemo` — `HALF`,
fog, the `TerrainChunks` from Task 4, spawns, loot — intact. Note `HALF=158` is set inside `_buildDemo`
**after** the constructor's terrain line, which is fine: the terrain is profile-only and extent-free.)

- [ ] **Step 2: Route `collide()` through the terrain path**

In `src/world.js`, `collide()` currently dispatches with
`if (this.hasTerrain) return this._collideTerrain(...)` then runs a separate flat body. Replace the
**entire** `collide()` method body so it always delegates to the one terrain-aware method:

```javascript
  collide(pos, vel, r, h, dt) {
    // Single collision path. Flat maps carry a 'flat' terrain (height 0); _collideTerrain's only
    // terrain-specific extra — the ground-follow re-seat — is gated on hasTerrain (see below), so on
    // flat maps this is byte-identical to the old y=0 floor.
    return this._collideTerrain(pos, vel, r, h, dt);
  }
```

(Keep `_moveAxisTerrain`, `_moveAxis`, `_headClear` as they are — on flat ground `_moveAxisTerrain`'s
slope test never fires, so it equals `_moveAxis`.)

- [ ] **Step 2b: Gate the ground-follow block on `hasTerrain` (CRITICAL — prevents the flat-map ledge clip)**

In `src/world.js`, inside `_collideTerrain`, the method ends with this ground-follow block (currently
`world.js:367-375`):

```javascript
    // GROUND-FOLLOW — after moving, re-seat the feet on the (now possibly different)
    // terrain height so ascents/descents are smooth and never fall-through.
    gy = terr.terrainHeightAt(pos.x, pos.z);
    if (pos.y < gy) {                                     // walked into rising ground → push up
      pos.y = gy; if (vel.y < 0) vel.y = 0; onGround = true;
    } else if (onGround && pos.y - gy <= TERRAIN_GROUND_FOLLOW_STEP) { // descend smoothly within a step
      pos.y = gy; if (vel.y < 0) vel.y = 0; onGround = true;
    }
    return onGround;
```

Wrap ONLY the `if/else if` ground-follow in a `this.hasTerrain` guard (leave the `gy = ...` and
`return` as they are), so flat maps skip the down-snap entirely:

```javascript
    // GROUND-FOLLOW — after moving, re-seat the feet on the (now possibly different)
    // terrain height so ascents/descents are smooth and never fall-through.
    // Gated on hasTerrain: on FLAT maps this snap would clip the player off man-made ledges
    // ≤ TERRAIN_GROUND_FOLLOW_STEP (0.6 m), so flat maps keep the old "stay on the box top" behavior.
    gy = terr.terrainHeightAt(pos.x, pos.z);
    if (this.hasTerrain) {
      if (pos.y < gy) {                                     // walked into rising ground → push up
        pos.y = gy; if (vel.y < 0) vel.y = 0; onGround = true;
      } else if (onGround && pos.y - gy <= TERRAIN_GROUND_FOLLOW_STEP) { // descend smoothly within a step
        pos.y = gy; if (vel.y < 0) vel.y = 0; onGround = true;
      }
    }
    return onGround;
```

- [ ] **Step 3: Make `groundY()` unconditional**

In `src/world.js`, `groundY()` (`world.js:422`) is:

```javascript
  groundY(x, z) { return (this.hasTerrain && this.terrain) ? this.terrain.terrainHeightAt(x, z) : 0; }
```

Replace with (terrain now always exists; flat returns 0):

```javascript
  groundY(x, z) { return this.terrain.terrainHeightAt(x, z); }
```

- [ ] **Step 4: In-browser verify — ARENA unchanged (the high-risk check)**

Restart the run on arena. `browser_navigate` → `http://localhost:8123/?map=arena&cb=2`, start a run,
then `browser_evaluate`:

```javascript
() => {
  const p = GAME.player;
  return {
    map: GAME.mapId,
    hasTerrain: GAME.world.hasTerrain,                 // expect false on arena
    terrainProfile: GAME.world.terrain.profile,        // expect "flat"
    groundY00: GAME.world.groundY(0, 0),               // expect 0
    playerY: +p.pos.y.toFixed(3),                      // expect ~0 standing on flat ground
    grounded: p.onGround,
  };
}
```
Expected: `hasTerrain:false`, `terrainProfile:"flat"`, `groundY00:0`, `playerY ≈ 0`, `grounded:true`.
Then move around (WASD), jump (Space), and walk into/onto a crate — step-up onto low boxes must still
work, walls must still block, the world bounds clamp at ±70. Take a `browser_take_screenshot` and
confirm the arena looks identical to before.

- [ ] **Step 5: In-browser verify — STEPPE unchanged**

`browser_navigate` → `http://localhost:8123/?map=steppe&cb=3`, start a run, repeat the Step-4
evaluate (expect `terrainProfile:"flat"`, `playerY≈0`, movement/boulders/district colliders normal).

- [ ] **Step 6: Commit**

```bash
git add "src/world.js"
git commit -m "feat(terrain): unify collision — every map carries a terrain (flat = special case)"
```

---

## Task 6: Ground-Y consumer audit — route through `groundY()`

**Files (each is a small, mechanical edit — verify the expression, then replace):**
- Modify: `src/enemies.js:303`, `src/enemies.js:354`
- Modify: `src/loot.js:604`, `src/loot.js:632`
- Modify: `src/waves.js:127`, `src/waves.js:133`
- Modify: `src/forest.js:169`, `src/forest.js:212`, `src/forest.js:280`
- Modify: `src/demobuilding.js:170`, `src/demobuilding.js:185`

**Rule:** replace **ground-height expressions** of the form
`world.hasTerrain ? world.terrain.terrainHeightAt(x, z) : 0` (or `this.world.…`) with the equivalent
`world.groundY(x, z)`. **DO NOT** touch `hasTerrain` used as a *gameplay gate* (e.g.
`if (world.hasTerrain) { …spawn terrain-only props… }` in `forest.js:109/394`, `enemies` boss logic,
`fire.js:101`, `demobuilding.js:463`) — those legitimately mean "is this a terrain map". The result is
identical math (flat → 0) but DRY and single-sourced.

- [ ] **Step 1: enemies.js**

`src/enemies.js:303` and `src/enemies.js:354` are both:

```javascript
e.pos.y = this.world.hasTerrain ? this.world.terrain.terrainHeightAt(e.pos.x, e.pos.z) : 0;
```

Replace **both** with:

```javascript
e.pos.y = this.world.groundY(e.pos.x, e.pos.z);
```

- [ ] **Step 2: loot.js, waves.js, forest.js, demobuilding.js**

For each listed line, read the line first to confirm it is a ground-height ternary (not a gameplay
gate), then replace the `world.hasTerrain ? ….terrainHeightAt(X, Z) : 0` expression with
`world.groundY(X, Z)` (preserve the exact `X,Z` arguments and the `this.`/local `world` receiver used
on that line). Example — `src/loot.js:604`:

```javascript
// before
const gy = this.game.world.hasTerrain ? this.game.world.terrain.terrainHeightAt(x, z) : 0;
// after
const gy = this.game.world.groundY(x, z);
```

Apply the same transform to `loot.js:632`, `waves.js:127`, `waves.js:133`, `forest.js:169`,
`forest.js:212`, `forest.js:280`, `demobuilding.js:170`, and the `demobuilding.js:185` fallback.

- [ ] **Step 3: Grep to confirm no ground-height ternary remains**

Run:

```bash
grep -rn "hasTerrain ?" "src/" || echo "NONE LEFT"
```
Expected: no lines of the form `hasTerrain ? …terrainHeightAt… : 0` remain. Any surviving `hasTerrain`
hits must be **gameplay gates** (statements/`if`), not ground-height expressions — eyeball each.

- [ ] **Step 4: Syntax check every edited module**

Run:

```bash
for f in src/enemies.js src/loot.js src/waves.js src/forest.js src/demobuilding.js; do node --check "$f" && echo "OK $f"; done
```
Expected: `OK` for all five.

- [ ] **Step 5: In-browser verify — demo still grounds entities**

`browser_navigate` → `http://localhost:8123/?map=demo&cb=4`, start a run, spawn a wave from the console,
and confirm enemies sit ON the hills (not at y=0) and loot settles on the surface:

```javascript
() => {
  GAME.waves.startWave(2);
  const es = GAME.enemies.active.slice(0, 5).map((e) => ({
    y: +e.pos.y.toFixed(2),
    gy: +GAME.world.groundY(e.pos.x, e.pos.z).toFixed(2),
  }));
  return { count: GAME.enemies.active.length, sample: es };
}
```
Expected: for each sampled enemy `y ≈ gy` (they track terrain height). Take a screenshot — enemies
stand on the slopes, none float or sink.

- [ ] **Step 6: Commit**

```bash
git add "src/enemies.js" "src/loot.js" "src/waves.js" "src/forest.js" "src/demobuilding.js"
git commit -m "refactor(terrain): route ground-height consumers through world.groundY()"
```

---

## Task 7: Final smoke across all three maps + diagnostics

**Files:** none (verification only). Cache-bust is done at PR/ship time per CLAUDE.md, not here.

- [ ] **Step 1: Re-run the pure unit tests**

Run:

```bash
node "tests/terrain/layout.test.mjs" && node "tests/terrain/height.test.mjs"
```
Expected: all tests PASS (layout + the existing terrain height suite — confirm the unification didn't
touch `terrain.js`'s contract).

- [ ] **Step 2: Smoke each map in-browser**

For `cb` in {arena, steppe, demo}: `browser_navigate` → `http://localhost:8123/?map=<map>&cb=smoke`,
start a run, walk ~10 s, and confirm via `browser_evaluate`:

```javascript
() => ({
  map: GAME.mapId,
  fps: Math.round(GAME._fps || 0),
  profile: GAME.world.terrain.profile,
  chunks: GAME.world.chunks ? GAME.world.chunks.meshes.length : 0,
  visible: GAME.world.chunks ? GAME.world.chunks.visible : 0,
  consoleErrors: 0,
})
```
Expected: arena/steppe `profile:"flat"`, `chunks:0`; demo `profile:"demo"`, `chunks≈25`,
`visible<chunks` when facing across the map; **0 console errors** on every map (check
`browser_console_messages`); FPS sane (≥ previous baseline — quantified properly in Phase 1B).

- [ ] **Step 3: Stop the local server**

```bash
kill %1 2>/dev/null || pkill -f "http.server 8123" || true
```
(Stop only the server you started on 8123 — do NOT kill the shared Playwright browser.)

- [ ] **Step 4: Final commit (if any verification tweaks were needed)**

```bash
git add -A
git commit -m "test(terrain): smoke all maps on unified terrain foundation" || echo "nothing to commit"
```

---

## Definition of Done (maps to spec §8 success criteria 1–3)

- `demo` renders **chunked** terrain with per-frame frustum culling; raising `extent` adds chunks (no
  rewrite) — §8.1.
- Player walks the demo hills via the **single** unified collision path: gravity onto the surface,
  slope-limited, ground-follow — §8.2.
- **Arena & steppe behavior unchanged** (flat profile → same `y=0` floor, same movement/step-up/
  bounds) — §8.3.
- All ground-height consumers go through `world.groundY()`; `terrain.js` contract untouched; pure unit
  tests green; 0 console errors on all three maps.

**Out of this plan (later):** graphics-quality settings (§3.5 → Phase 1B plan); placement API +
props/enemies authored on terrain + horde slope-limit (Phase 2); LOD + map up-scaling + height-aware
boss pathing (Phase 3).
