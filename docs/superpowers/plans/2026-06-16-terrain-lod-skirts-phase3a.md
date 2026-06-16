# Terrain Phase 3a — Distance LOD + Skirt Seams — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give terrain chunks distance-based LOD (coarser meshes far from the camera) with vertical skirts that hide the cracks where adjacent LODs meet — the scale enabler so Phase 3b can raise map extent without an FPS cliff.

**Architecture:** Each chunk is pre-built at N resolutions (high→low). `TerrainChunks.update(camera)` already runs every frame for frustum + draw-distance culling; we extend it to also pick a LOD per chunk by camera distance (pure `pickLOD` with hysteresis) and show only that one mesh. Cracks between differing LODs are masked by a vertical "skirt" wall built into every chunk mesh (double-sided, ground-coloured). No stitching/geomorph — fits the no-build-step ethos (spec §3.2).

**Tech Stack:** vanilla JS + Three.js r160; pure modules node-tested via `node --test`; browser pieces verified in isolated headless Chrome.

**Scope guard (this plan = Phase 3a ONLY):** LOD + skirts, verified for correctness on the existing 25-chunk demo (you won't see an FPS win at 25 chunks — the payoff lands in 3b when extent scales up). **Out:** raising map extent / final-size decision (Phase 3b, needs owner's map-size call), height-aware boss A* (Phase 3c), geomorph vertex-blending (accepted limitation — LOD pop mitigated by hysteresis + far-from-camera bands, not eliminated).

**Branch:** new `feat/terrain-lod` off `feat/terrain-placement` (top of the stack, `8f767d3d`). Continues the stacked-PR chain #74→#75→#78→(this).

---

## File Structure

- **Create:** `src/terrain-lod.js` — pure LOD policy: `LOD_RESOLUTIONS`, `LOD_BANDS`, `pickLOD(dist, bands, prev, margin)`. No THREE → node-testable.
- **Create:** `tests/terrain/lod.test.mjs` — node test for `pickLOD` (band edges + hysteresis).
- **Modify:** `src/terrain-mesh.js` — `buildChunkMesh` rebuilt from a manual grid (not `PlaneGeometry`) so it can carry a perimeter **skirt**; new exported `SKIRT_DEPTH`. Top surface stays geometrically identical (same sample points, heights, colours, continuous-field normals).
- **Modify:** `src/terrain-chunks.js` — build one mesh **per LOD** per chunk; `update(camera)` selects LOD + composes with existing frustum/draw-distance culling.
- **Modify:** `src/world.js:298` — pass `resolutions`/`lodBands` (or drop `resolution:32` and use defaults). Near LOD stays 32 (demo detail unchanged).
- **Modify:** `src/game.js:1165` `_restoreVisibility()` — reset `chunks.drawDistance = 0` (latent Phase-1B bug: draw-distance stayed applied after the feature was toggled off).

---

## Task 1: Pure LOD policy (`terrain-lod.js`) + node tests

**Files:**
- Create: `src/terrain-lod.js`
- Test: `tests/terrain/lod.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/terrain/lod.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLOD, LOD_BANDS, LOD_RESOLUTIONS } from '../../src/terrain-lod.js';

test('config is consistent: one more resolution than band edge', () => {
  assert.equal(LOD_RESOLUTIONS.length, LOD_BANDS.length + 1);
  // resolutions descend (high detail → low detail)
  for (let i = 1; i < LOD_RESOLUTIONS.length; i++) {
    assert.ok(LOD_RESOLUTIONS[i] < LOD_RESOLUTIONS[i - 1]);
  }
  // bands ascend
  for (let i = 1; i < LOD_BANDS.length; i++) assert.ok(LOD_BANDS[i] > LOD_BANDS[i - 1]);
});

test('no-hysteresis: returns the LOD index for a distance', () => {
  const bands = [100, 200];
  assert.equal(pickLOD(0,   bands), 0);
  assert.equal(pickLOD(99,  bands), 0);
  assert.equal(pickLOD(100, bands), 1);   // at the edge → coarser
  assert.equal(pickLOD(199, bands), 1);
  assert.equal(pickLOD(200, bands), 2);
  assert.equal(pickLOD(9e9, bands), 2);   // clamps at last level
});

test('hysteresis holds the previous level inside the margin band', () => {
  const bands = [100, 200], margin = 20;
  // sitting just past the 100 edge but still within margin → keep finer prev=0
  assert.equal(pickLOD(110, bands, 0, margin), 0);
  // past the edge by more than margin → commit to coarser
  assert.equal(pickLOD(121, bands, 0, margin), 1);
  // coming back finer: must drop below edge-margin (80) before committing to 0
  assert.equal(pickLOD(90, bands, 1, margin), 1);   // 90 > 80 → hold coarser
  assert.equal(pickLOD(79, bands, 1, margin), 0);   // 79 < 80 → commit finer
});

test('hysteresis tolerates multi-level jumps (teleport)', () => {
  const bands = [100, 200], margin = 20;
  assert.equal(pickLOD(500, bands, 0, margin), 2); // far jump from near → coarsest
  assert.equal(pickLOD(5,   bands, 2, margin), 0); // near jump from far → finest
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd /Users/macmini1/eng-terrain && node --test tests/terrain/lod.test.mjs`
Expected: FAIL — `Cannot find module '../../src/terrain-lod.js'`.

- [ ] **Step 3: Write the module**

```js
// src/terrain-lod.js — PURE LOD policy (no THREE → node-testable). Phase 3a.
//
// Distance-based level-of-detail for terrain chunks. index 0 = nearest = highest detail.
// LOD_RESOLUTIONS[i] is the per-chunk segment count at level i; LOD_BANDS[i] is the camera
// distance (metres, chunk-centre → camera) at which we step from level i to level i+1.
// Co-op note: LOD is a LOCAL render choice — never synced; it does NOT touch the heightfield,
// so two clients at different distances still agree on ground height (that comes from terrain.js).

export const LOD_RESOLUTIONS = [32, 16, 8]; // high → low; [0]=32 keeps current demo detail
export const LOD_BANDS = [110, 240];        // step 32→16 at 110 m, 16→8 at 240 m

// Returns the LOD index for `dist`. With `margin > 0`, applies hysteresis around `prev` (the
// chunk's current level) so a chunk hovering on a band edge does not flicker every frame: a
// change only commits once `dist` is past the relevant edge by `margin`. bands ascending;
// result in [0, bands.length].
export function pickLOD(dist, bands = LOD_BANDS, prev = 0, margin = 0) {
  let lvl = 0;
  while (lvl < bands.length && dist >= bands[lvl]) lvl++;
  if (margin > 0 && prev >= 0 && prev <= bands.length) {
    if (lvl > prev) {
      // going coarser: require dist >= (edge leaving prev) + margin, else hold prev
      if (!(prev < bands.length && dist >= bands[prev] + margin)) lvl = prev;
    } else if (lvl < prev) {
      // going finer: require dist < (edge entering prev) - margin, else hold prev
      const edge = bands[prev - 1];
      if (!(dist < edge - margin)) lvl = prev;
    }
  }
  return lvl;
}
```

- [ ] **Step 4: Run the test, confirm pass**

Run: `cd /Users/macmini1/eng-terrain && node --test tests/terrain/lod.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/macmini1/eng-terrain
git add src/terrain-lod.js tests/terrain/lod.test.mjs
git commit -m "feat(terrain): pure LOD policy (pickLOD + bands) with hysteresis + node tests"
```

---

## Task 2: Skirts in `buildChunkMesh` (manual grid, double-sided perimeter wall)

**Files:**
- Modify: `src/terrain-mesh.js` (replace `buildChunkMesh` body; add `SKIRT_DEPTH` export)

**Why a manual grid:** the current `PlaneGeometry`-based builder gives no handle on perimeter vertices. We rebuild the top surface as an explicit grid (vertex index `iz*vpr+ix`) — geometrically identical to before (same sample points/heights/colours, normals still from the continuous field, so same-LOD borders stay seamless) — then append a skirt ring under the perimeter. The skirt is emitted **double-sided** (each quad + its reversed twin) so winding never matters: at a shared edge, the two neighbours' skirts back the crack from any horizontal view angle.

- [ ] **Step 1: Replace the file body**

Replace the whole of `src/terrain-mesh.js` (keep the header comment block at the top) with:

```js
// terrain-mesh.js — BROWSER-ONLY ground-mesh builder (needs THREE). Phase 3a.
//
// Kept OUT of src/terrain.js so the pure height field stays node-testable. The height
// CONTRACT lives in src/terrain.js; this displaces a grid by terrainHeightAt, paints it
// (grass→dirt→rock by slope), and drops a vertical SKIRT around the chunk perimeter to hide
// the cracks where a chunk meets a coarser-LOD neighbour (Phase 3a). Normals come from the
// CONTINUOUS heightfield (terrain.terrainNormalAt), not computeVertexNormals(), so lighting
// has no seam at chunk borders.
import * as THREE from 'three';

const COL_GRASS = new THREE.Color(0x6b8a3a);
const COL_DIRT  = new THREE.Color(0x7a6244);
const COL_ROCK  = new THREE.Color(0x7d7872);

// Metres each chunk edge drops below its surface. Must exceed the worst LOD crack (coarse-vs-fine
// height delta over one coarse cell) on the steepest terrain; 8 m is safe on the demo's gentle hills.
export const SKIRT_DEPTH = 8;

// Build ONE terrain chunk mesh at `resolution` segments per axis. `chunk` is a planChunks()
// descriptor { ix, iz, minX, minZ, maxX, maxZ, sizeX, sizeZ, centerX, centerZ }. Vertices are
// LOCAL (centred on the chunk) and the mesh is positioned at the chunk centre, so chunks tile.
export function buildChunkMesh(terrain, chunk, resolution = 16, skirtDepth = SKIRT_DEPTH) {
  const segs = Math.max(1, Math.floor(resolution));
  const vpr = segs + 1;                       // vertices per row/col
  const halfX = chunk.sizeX / 2, halfZ = chunk.sizeZ / 2;
  const dx = chunk.sizeX / segs, dz = chunk.sizeZ / segs;

  const topCount = vpr * vpr;
  const perim = 4 * segs;                     // perimeter vertices (corners counted once)
  const total = topCount + perim;

  const positions = new Float32Array(total * 3);
  const colors    = new Float32Array(total * 3);
  const normals   = new Float32Array(total * 3);
  const tmp = new THREE.Color();

  // ── top surface vertices ──
  for (let iz = 0; iz <= segs; iz++) {
    for (let ix = 0; ix <= segs; ix++) {
      const i = iz * vpr + ix;
      const lx = -halfX + ix * dx;
      const lz = -halfZ + iz * dz;
      const wx = chunk.centerX + lx;
      const wz = chunk.centerZ + lz;
      const h = terrain.terrainHeightAt(wx, wz);
      positions[i * 3] = lx; positions[i * 3 + 1] = h; positions[i * 3 + 2] = lz;
      const slope = terrain.terrainSlopeAt(wx, wz);
      const dirtT = THREE.MathUtils.clamp((slope - 0.18) / (0.34 - 0.18), 0, 1);
      const rockT = THREE.MathUtils.clamp((slope - 0.40) / (0.62 - 0.40), 0, 1);
      tmp.copy(COL_GRASS).lerp(COL_DIRT, dirtT).lerp(COL_ROCK, rockT);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      const nrm = terrain.terrainNormalAt(wx, wz); // seamless across chunk borders
      normals[i * 3] = nrm.x; normals[i * 3 + 1] = nrm.y; normals[i * 3 + 2] = nrm.z;
    }
  }

  const indices = [];
  // top surface triangles (CCW seen from above)
  for (let iz = 0; iz < segs; iz++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iz * vpr + ix, b = a + 1, c = a + vpr, d = c + 1;
      indices.push(a, c, b,  b, c, d);
    }
  }

  // ── perimeter ring (closed loop of top-vertex indices, grid-adjacent step by step) ──
  const ring = [];
  for (let ix = 0; ix < segs; ix++) ring.push(0 * vpr + ix);     // -Z edge: (0..segs-1, 0)
  for (let iz = 0; iz < segs; iz++) ring.push(iz * vpr + segs);  // +X edge: (segs, 0..segs-1)
  for (let ix = segs; ix > 0; ix--) ring.push(segs * vpr + ix);  // +Z edge: (segs..1, segs)
  for (let iz = segs; iz > 0; iz--) ring.push(iz * vpr + 0);     // -X edge: (0, segs..1)
  // ring.length === perim; consecutive entries (incl. wrap) are always grid-adjacent.

  // skirt vertex directly below each ring vertex
  for (let k = 0; k < ring.length; k++) {
    const t = ring[k], s = topCount + k;
    positions[s * 3] = positions[t * 3];
    positions[s * 3 + 1] = positions[t * 3 + 1] - skirtDepth;
    positions[s * 3 + 2] = positions[t * 3 + 2];
    colors[s * 3] = colors[t * 3]; colors[s * 3 + 1] = colors[t * 3 + 1]; colors[s * 3 + 2] = colors[t * 3 + 2];
    normals[s * 3] = normals[t * 3]; normals[s * 3 + 1] = normals[t * 3 + 1]; normals[s * 3 + 2] = normals[t * 3 + 2];
  }
  // skirt quads — front + reversed back tri so the wall shows from both sides (winding-agnostic)
  for (let k = 0; k < ring.length; k++) {
    const kN = (k + 1) % ring.length;
    const tA = ring[k], tB = ring[kN], sA = topCount + k, sB = topCount + kN;
    indices.push(tA, sA, tB,  tB, sA, sB);   // front
    indices.push(tB, sA, tA,  sB, sA, tB);   // back
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere(); // used by frustum culling in TerrainChunks
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(chunk.centerX, 0, chunk.centerZ);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;                // TerrainChunks owns visibility explicitly
  mesh.name = `terrainChunk_${chunk.ix}_${chunk.iz}_r${segs}`;
  mesh.updateMatrixWorld(true);              // static chunk → world matrix computed once
  return mesh;
}
```

- [ ] **Step 2: Sanity-check the geometry builds (smoke)**

Run (node can import THREE here only if the bare specifier resolves; if it does not, SKIP this node smoke and rely on the Task 4 browser verification instead — do NOT add a node test that imports THREE):

```bash
cd /Users/macmini1/eng-terrain && node --check src/terrain-mesh.js && echo "syntax OK"
```
Expected: `syntax OK` (this only checks parse; visual correctness is verified in Task 4).

- [ ] **Step 3: Commit**

```bash
cd /Users/macmini1/eng-terrain
git add src/terrain-mesh.js
git commit -m "feat(terrain): perimeter skirts on chunk meshes (manual grid, double-sided) to mask LOD cracks"
```

---

## Task 3: Multi-LOD chunks + LOD selection in `TerrainChunks.update`

**Files:**
- Modify: `src/terrain-chunks.js`

- [ ] **Step 1: Replace the class**

Replace the whole of `src/terrain-chunks.js` with:

```js
import * as THREE from 'three';
import { planChunks } from './terrain-layout.js';
import { buildChunkMesh } from './terrain-mesh.js';
import { pickLOD, LOD_RESOLUTIONS, LOD_BANDS } from './terrain-lod.js';

// Owns the grid of terrain chunk meshes for one map. Each chunk is pre-built at every LOD
// resolution (high→low); update() picks ONE per chunk by camera distance and composes that with
// per-chunk frustum culling and the optional draw-distance radius (set by Game._cullByDistance).
// Pre-building all LODs fits the bounded, fully-resident world (no streaming) and the no-build-step
// ethos; Phase 3b will measure load cost when extent scales and add lazy LOD build only if needed.
export class TerrainChunks {
  constructor(terrain, opts = {}) {
    this.terrain = terrain;
    this.extent = opts.extent != null ? opts.extent : 160;
    this.chunkSize = opts.chunkSize != null ? opts.chunkSize : 64;
    this.resolutions = opts.resolutions || LOD_RESOLUTIONS; // [0] = nearest/highest detail
    this.lodBands = opts.lodBands || LOD_BANDS;
    this.lodMargin = opts.lodMargin != null ? opts.lodMargin : 24; // hysteresis metres
    this.scene = opts.scene || null;
    this.group = new THREE.Group();
    this.group.name = 'terrainChunks';
    this.chunks = [];     // { meshes:[perLOD], lod:int, cx, cz }
    this.meshes = [];     // flat list of EVERY mesh (for dispose)
    this.visible = 0;
    this.drawDistance = 0; // 0 = unlimited; set by Game._cullByDistance
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    for (const c of planChunks(this.extent, this.chunkSize)) {
      const meshes = this.resolutions.map((r) => buildChunkMesh(this.terrain, c, r));
      meshes.forEach((mesh, li) => { mesh.visible = (li === 0); this.group.add(mesh); this.meshes.push(mesh); });
      this.chunks.push({ meshes, lod: 0, cx: c.centerX, cz: c.centerZ });
    }
    this.visible = this.chunks.length;
    if (this.scene) this.scene.add(this.group);
  }

  // Per-frame: pick LOD (distance + hysteresis), then frustum + draw-distance cull. Only the chosen
  // LOD mesh of a visible chunk is shown; all others (other LODs, or culled chunks) are hidden.
  update(camera) {
    if (!camera) return;
    camera.updateMatrixWorld();
    this._inv.copy(camera.matrixWorld).invert();
    this._m.multiplyMatrices(camera.projectionMatrix, this._inv);
    this._frustum.setFromProjectionMatrix(this._m);
    const dd = this.drawDistance, dd2 = dd > 0 ? dd * dd : 0;
    const cx = camera.position;
    let vis = 0;
    for (const ch of this.chunks) {
      const dxc = ch.cx - cx.x, dzc = ch.cz - cx.z;
      const dist2 = dxc * dxc + dzc * dzc;
      const dist = Math.sqrt(dist2);
      ch.lod = pickLOD(dist, this.lodBands, ch.lod, this.lodMargin);
      const active = ch.meshes[ch.lod];
      if (!active.geometry.boundingSphere) active.geometry.computeBoundingSphere();
      this._sphere.copy(active.geometry.boundingSphere).applyMatrix4(active.matrixWorld);
      let inView = this._frustum.intersectsSphere(this._sphere);
      if (inView && dd2 > 0 && dist2 > dd2) inView = false; // beyond draw distance
      for (let li = 0; li < ch.meshes.length; li++) ch.meshes[li].visible = inView && (li === ch.lod);
      if (inView) vis++;
    }
    this.visible = vis;
  }

  dispose() {
    for (const mesh of this.meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.meshes.length = 0;
    this.chunks.length = 0;
    if (this.scene) this.scene.remove(this.group);
  }
}
```

- [ ] **Step 2: Syntax check**

Run: `cd /Users/macmini1/eng-terrain && node --check src/terrain-chunks.js && echo "syntax OK"`
Expected: `syntax OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/macmini1/eng-terrain
git add src/terrain-chunks.js
git commit -m "feat(terrain): per-chunk distance LOD selection composed with frustum + draw-distance cull"
```

---

## Task 4: Wire demo + fix draw-distance restore; browser-verify

**Files:**
- Modify: `src/world.js:298-300` (TerrainChunks construction)
- Modify: `src/game.js:1165` (`_restoreVisibility`)

- [ ] **Step 1: Update the demo construction**

In `src/world.js`, change the `_buildDemo` TerrainChunks call (currently passing `resolution: 32`) to drive LODs. Replace:

```js
    this.chunks = new TerrainChunks(this.terrain, {
      extent: this.HALF, chunkSize: 64, resolution: 32, scene: this.scene,
    });
```
with:
```js
    this.chunks = new TerrainChunks(this.terrain, {
      extent: this.HALF, chunkSize: 64,
      resolutions: [32, 16, 8],   // near LOD 32 = unchanged demo detail; 16/8 kick in by distance
      scene: this.scene,
    });
```

- [ ] **Step 2: Fix the draw-distance restore leak**

In `src/game.js`, `_restoreVisibility()` (line ~1165), add the chunk reset so disabling draw-distance actually un-culls chunks. Replace:

```js
  _restoreVisibility() {
    if (this.enemies && this.enemies.active) for (const e of this.enemies.active) { if (e.mesh) e.mesh.visible = !!e.alive; }
    if (this.loot && this.loot.pickups) for (const pu of this.loot.pickups) { if (pu.mesh) pu.mesh.visible = true; }
  }
```
with:
```js
  _restoreVisibility() {
    if (this.enemies && this.enemies.active) for (const e of this.enemies.active) { if (e.mesh) e.mesh.visible = !!e.alive; }
    if (this.loot && this.loot.pickups) for (const pu of this.loot.pickups) { if (pu.mesh) pu.mesh.visible = true; }
    if (this.world && this.world.chunks) this.world.chunks.drawDistance = 0; // clear cull radius (TerrainChunks.update re-shows next frame)
  }
```

- [ ] **Step 3: Run the full terrain test suite (no regression in pure modules)**

Run: `cd /Users/macmini1/eng-terrain && node --test tests/terrain/ tests/graphics/`
Expected: ALL PASS (layout, height, slope-blocks, lod, graphics).

- [ ] **Step 4: Browser verification (isolated headless Chrome — the [[engendros-headless-verify]] recipe)**

Serve the worktree on a fresh port and drive the demo. Verify, via `GAME`:
1. Demo loads with **0 console errors**.
2. `GAME.world.chunks.chunks.length === 25` and each has `meshes.length === 3`.
3. Standing at spawn, `GAME.world.chunks.visible` > 0 and only ONE mesh per visible chunk is `.visible` (assert: for every chunk, `chunk.meshes.filter(m=>m.visible).length <= 1`).
4. Near chunks resolve to LOD 0, far chunks to LOD 1/2 — log the LOD distribution (`chunks.map(c=>c.lod)`); expect a mix, not all-0.
5. **No visible cracks/gaps** between chunks at a LOD boundary — take a screenshot looking across the map at a low camera angle; the skirts should mask any seam (no see-through-to-sky slivers at chunk edges).
6. Player still walks the hills (ground-Y unchanged): `GAME.player` Y tracks terrain (sample a few positions vs `GAME.world.groundY(x,z)`).
7. Arena unchanged: load `?map=arena`, confirm 0 errors and flat floor still at y≈0 (flat profile → no chunks / unchanged behavior).

Record results (counts + screenshot path) in the PR description. If cracks ARE visible, increase `SKIRT_DEPTH` (Task 2) and/or widen `lodMargin`; re-verify.

- [ ] **Step 5: Cache-bust + commit**

Bump `index.html` entry `?v=N` and `GAME_BUILD` in `src/game.js` (see CLAUDE.md ritual; renumber above current main only at rebase time — for the worktree pick the next sequential value above the stack's current v283, i.e. **v284**, and note in the PR it may be re-bumped at rebase).

```bash
cd /Users/macmini1/eng-terrain
git add src/world.js src/game.js index.html
git commit -m "feat(terrain): drive demo chunks via LOD resolutions; fix draw-distance restore leak; cache-bust v284"
```

---

## Task 5: Open the PR (stacked)

- [ ] **Step 1: Push + PR**

```bash
cd /Users/macmini1/eng-terrain
git push -u origin feat/terrain-lod
gh pr create --base feat/terrain-placement --title "feat(terrain): Phase 3a — distance LOD + skirt seams" --body "<summary + browser-verify results + screenshot + the stacked-on-#78 note + accepted LOD-pop limitation>"
```

- [ ] **Step 2: Update the terrain-engine memory** with Phase 3a status (PR #, stacked base, what shipped, the SKIRT_DEPTH/LOD_BANDS tunables, and that the FPS payoff is realized in 3b).

---

## Verification / success criteria (this phase)

1. `pickLOD` node tests green (band edges + hysteresis + teleport).
2. Demo builds 25 chunks × 3 LOD meshes; exactly one LOD visible per visible chunk; near=0, far=1/2.
3. **No visible cracks** at LOD boundaries (skirts work) — screenshot evidence.
4. Ground-Y / walkability unchanged; arena flat profile unchanged; 0 console errors.
5. Draw-distance toggle off now fully un-culls chunks (leak fixed).
6. Full terrain+graphics node suite green; cache-bust ritual respected.

## Known limitations (honest, accepted)

- **LOD pop:** switching a chunk's resolution snaps its silhouette. Mitigated (hysteresis + bands far from camera so pops are small in screen space), NOT eliminated. Geomorph vertex-blend is deferred (complex, no build step).
- **No FPS win on the 25-chunk demo** — LOD is the *scale enabler*; the measurable win lands in Phase 3b when extent rises. This phase proves correctness.
- **Skirt depth is global** (`SKIRT_DEPTH=8`); a deep cliff right at a chunk edge could in theory out-run it. Fine on demo terrain; revisit if 3b terrain gets more violent.
