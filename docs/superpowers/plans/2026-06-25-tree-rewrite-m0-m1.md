# Tree Rewrite — M0 + M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the unified "voxel-cylinder" trunk core (M0: data + render + carve, shoot-through holes) and the support-based detachment (M1: anything that loses support detaches and falls — big top hinges, small chunk tumbles — nothing stays stuck or floats), on a single `/testtree`.

**Architecture:** A new THREE-free, node-tested module `src/treecore.js` holds all the pure logic — the cell grid, carve, support flood, orphan grouping, and piece classification. `src/forestdemo.js` wires that grid to THREE meshes + `world.boxes` colliders and drives carve-on-shot, detach, fall (reusing `makeHinge`/`makeTumble`/`stepBody` from `destruct.js`), and per-piece grounding. Verified in-browser via the existing `/testtree` colored harness.

**Tech Stack:** vanilla JS, ES modules, Three.js r160 (only in `forestdemo.js`), `node --test` for `treecore.js`.

## Global Constraints

- **Scope:** ONLY a single standing test tree spawned by `/testtree`. Do NOT touch the forest-wide spawn, the stopgap fell path for normal forest trees, buildings, foliage, movement, or co-op netcode. Forest rollout is a later milestone.
- **INVARIANTS (from the design spec — every task must preserve these):**
  - INV-1 nothing stays stuck: any alive cell with no connected-alive path to band 0 (rooted base) detaches.
  - INV-2 nothing floats: every detached/settled piece rests on the terrain.
  - INV-3 size-scaled: large piece → `makeHinge`; small piece → `makeTumble`. NEVER hinge a small piece.
  - INV-4 carved damage permanent; collision = live cells (shoot-through holes are real).
  - INV-5 deterministic (seed/terrain only); no `Math.random` in `treecore.js` (node-determinism). (Co-op wiring deferred to a later milestone, but keep all treecore logic pure/deterministic now.)
- **`treecore.js` is THREE-free** (no `import 'three'`) so it stays node-testable. Pure functions, no DOM, no globals.
- **Cell index convention (used everywhere):** `i = (b*sectors + s)*rings + r`, with band `b` (0 = rooted base, up), sector `s` (angular, wraps mod `sectors`), ring `r` (0 = OUTER bark shell, `rings-1` = core). Caliber penetration removes outer rings inward (r = 0,1,…).
- **Verification:** `treecore.js` tasks end with `node --test`. `forestdemo.js` wiring tasks end with an **in-browser Playwright check on `http://localhost:8012/?map=forest` using `/testtree`** (no-store server already running; hard-reload or `&cb=N` for fresh modules). There is no node test for THREE code.
- **Commits:** one per task, conventional `feat(forest): …` / `test(forest): …`. No cache-bust ritual (not shipping to players until forest rollout).

## File Structure

- **Create** `src/treecore.js` — pure voxel-cylinder logic (M0: `makeTrunk`, `cellIndex`, `cellAABB`, `carve`; M1: `supportFlood`, `orphanGroups`, `classifyPiece`). One responsibility: the trunk cell model + its queries. No THREE.
- **Create** `tests/treecore/grid.test.mjs`, `tests/treecore/carve.test.mjs`, `tests/treecore/support.test.mjs` — node tests.
- **Modify** `src/forestdemo.js` — wire treecore into `/testtree`: build/render/collide the cell trunk, carve on shot, detach+fall+drape. Touch only the test-tree path (gate on `rec._test`).

---

## TASK 1 — treecore: cell grid + index (M0)

**Files:** Create `src/treecore.js`; Create `tests/treecore/grid.test.mjs`

**Produces:** `makeTrunk({height,radius,bands,sectors,rings,hp})→trunk`; `cellIndex(t,b,s,r)→i`; `decodeCell(t,i)→[b,s,r]`; `cellAABB(t,b,s,r)→{min,max,c}`.

- [ ] **Step 1: failing test**

```js
// tests/treecore/grid.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTrunk, cellIndex, decodeCell, cellAABB } from '../../src/treecore.js';

test('makeTrunk: sizes + all cells alive', () => {
  const t = makeTrunk({ height: 12, radius: 0.6, bands: 6, sectors: 8, rings: 2, hp: 10 });
  assert.equal(t.alive.length, 6 * 8 * 2);
  assert.equal(t.alive.reduce((a, b) => a + b, 0), 6 * 8 * 2);   // all alive
  assert.ok(Math.abs(t.bandH - 2) < 1e-9);
});

test('cellIndex ↔ decodeCell roundtrip', () => {
  const t = makeTrunk({ height: 6, radius: 0.5, bands: 3, sectors: 6, rings: 2 });
  for (let b = 0; b < t.bands; b++) for (let s = 0; s < t.sectors; s++) for (let r = 0; r < t.rings; r++) {
    const i = cellIndex(t, b, s, r);
    assert.deepEqual(decodeCell(t, i), [b, s, r]);
  }
});

test('cellAABB: outer ring sits farther out than core, base band lowest', () => {
  const t = makeTrunk({ height: 6, radius: 0.6, bands: 3, sectors: 8, rings: 2 });
  const outer = cellAABB(t, 0, 0, 0).c;   // r=0 outer
  const core = cellAABB(t, 0, 0, 1).c;    // r=1 core
  assert.ok(Math.hypot(outer[0], outer[2]) > Math.hypot(core[0], core[2]));
  assert.ok(cellAABB(t, 0, 0, 0).c[1] < cellAABB(t, 2, 0, 0).c[1]);   // band 0 below band 2
});
```

- [ ] **Step 2: run, verify fail** — `node --test tests/treecore/grid.test.mjs` → FAIL (module missing).

- [ ] **Step 3: implement**

```js
// src/treecore.js
// THREE-free voxel-cylinder trunk: bands up the height × a ring of `sectors` angular wedges × `rings`
// radial shells (r=0 OUTER bark, r=rings-1 core). Cell index i = (b*sectors + s)*rings + r.
// Pure + deterministic (no Math.random) → node-testable + co-op-safe.

export function makeTrunk({ height, radius, bands = 6, sectors = 8, rings = 2, hp = 10 }) {
  const n = bands * sectors * rings;
  return {
    height, radius, bands, sectors, rings, bandH: height / bands,
    alive: new Uint8Array(n).fill(1),
    hp: new Float32Array(n).fill(hp),
  };
}

export function cellIndex(t, b, s, r) { return (b * t.sectors + s) * t.rings + r; }

export function decodeCell(t, i) {
  const r = i % t.rings;
  const tmp = (i - r) / t.rings;
  const s = tmp % t.sectors;
  const b = (tmp - s) / t.sectors;
  return [b, s, r];
}

// Local-space (origin = base centre, +Y up) axis-aligned box approximating a wedge cell — used for the
// collision box and for mapping a world hit to a cell. Slightly isotropic in XZ (good enough; cells overlap
// a touch to form a solid trunk, and removing a cell leaves a real gap).
export function cellAABB(t, b, s, r) {
  const a = (s + 0.5) / t.sectors * Math.PI * 2;
  const rOuter = t.radius * (t.rings - r) / t.rings;
  const rInner = t.radius * (t.rings - r - 1) / t.rings;
  const rMid = (rOuter + rInner) / 2;
  const cx = Math.cos(a) * rMid, cz = Math.sin(a) * rMid, cy = (b + 0.5) * t.bandH;
  const hr = (rOuter - rInner) / 2;                 // radial half-thickness
  const ha = Math.PI / t.sectors * Math.max(rMid, 1e-3);   // approx arc half-width
  const ex = Math.max(hr, ha);
  return { min: [cx - ex, cy - t.bandH / 2, cz - ex], max: [cx + ex, cy + t.bandH / 2, cz + ex], c: [cx, cy, cz] };
}
```

- [ ] **Step 4: run, verify pass** — `node --test tests/treecore/grid.test.mjs` → PASS.

- [ ] **Step 5: commit** — `git add src/treecore.js tests/treecore/grid.test.mjs && git commit -m "feat(forest): treecore voxel-cylinder grid + cell geometry"`

---

## TASK 2 — treecore: carve (M0)

**Files:** Modify `src/treecore.js`; Create `tests/treecore/carve.test.mjs`

**Consumes:** `makeTrunk`, `cellIndex`. **Produces:** `carve(t, y, ang, {pen,dmg,spreadS,spreadB})→deadIds[]`; `worldHitToLocal(t, originXf, hitWorld)` is wired in forestdemo, NOT here (treecore takes local y+angle).

- [ ] **Step 1: failing test**

```js
// tests/treecore/carve.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTrunk, cellIndex, carve } from '../../src/treecore.js';

test('carve pen=1 kills only the OUTER ring at the hit sector; core survives', () => {
  const t = makeTrunk({ height: 6, radius: 0.6, bands: 3, sectors: 8, rings: 2, hp: 5 });
  const yMid = 1 * t.bandH + t.bandH / 2;      // band 1
  const dead = carve(t, yMid, 0, { pen: 1, dmg: 1000 });   // angle 0 → sector 0
  assert.ok(dead.includes(cellIndex(t, 1, 0, 0)));         // outer ring dead
  assert.equal(t.alive[cellIndex(t, 1, 0, 1)], 1);         // core still alive (pen can't reach)
});

test('carve accumulates damage; cell dies only when hp ≤ 0', () => {
  const t = makeTrunk({ height: 4, radius: 0.5, bands: 2, sectors: 4, rings: 1, hp: 10 });
  assert.equal(carve(t, 0.5, 0, { pen: 1, dmg: 4 }).length, 0);   // 10-4=6, alive
  assert.equal(carve(t, 0.5, 0, { pen: 1, dmg: 4 }).length, 0);   // 6-4=2, alive
  assert.equal(carve(t, 0.5, 0, { pen: 1, dmg: 4 }).length, 1);   // 2-4<0, dies
});

test('carve spread removes a footprint of neighbouring sectors/bands', () => {
  const t = makeTrunk({ height: 9, radius: 0.6, bands: 3, sectors: 8, rings: 1, hp: 1 });
  const dead = carve(t, 1.5 * t.bandH, 0, { pen: 1, dmg: 1000, spreadS: 1, spreadB: 1 });
  // 3 bands (0,1,2 clamped) × 3 sectors (7,0,1) = up to 9 cells
  assert.ok(dead.length >= 6);
});
```

- [ ] **Step 2: run, verify fail.**

- [ ] **Step 3: implement (append to `src/treecore.js`)**

```js
// Apply a hit at LOCAL height `y` (metres up from base) and `ang` (radians around +X→+Z). `pen` = how many
// OUTER rings the caliber reaches (1..rings). `dmg` is subtracted from each cell's hp; cells at hp≤0 die.
// `spreadS`/`spreadB` = footprint radius in sectors/bands (0 = single column). Returns the ids that DIED.
export function carve(t, y, ang, { pen = 1, dmg = 1e9, spreadS = 0, spreadB = 0 } = {}) {
  const b0 = Math.max(0, Math.min(t.bands - 1, Math.floor(y / t.bandH)));
  const TAU = Math.PI * 2;
  const s0 = Math.floor((((ang % TAU) + TAU) % TAU) / TAU * t.sectors) % t.sectors;
  const dead = [];
  for (let db = -spreadB; db <= spreadB; db++) {
    const b = b0 + db; if (b < 0 || b >= t.bands) continue;
    for (let ds = -spreadS; ds <= spreadS; ds++) {
      const s = (((s0 + ds) % t.sectors) + t.sectors) % t.sectors;
      for (let r = 0; r < Math.min(pen, t.rings); r++) {
        const i = cellIndex(t, b, s, r);
        if (!t.alive[i]) continue;
        t.hp[i] -= dmg;
        if (t.hp[i] <= 0) { t.alive[i] = 0; dead.push(i); }
      }
    }
  }
  return dead;
}
```

- [ ] **Step 4: run, verify pass.**

- [ ] **Step 5: commit** — `git commit -am "feat(forest): treecore carve (caliber=radial penetration, footprint, hp)"`

---

## TASK 3 — forestdemo: render + collide + carve the test-tree cell trunk (M0 wiring)

**Files:** Modify `src/forestdemo.js`

**Consumes:** `treecore` (`makeTrunk`, `cellAABB`, `carve`, `cellIndex`). **Produces:** a `/testtree` standing tree built as a cell trunk: `rec._cells` (the trunk), a rebuildable wood mesh from alive cells, per-alive-cell collision boxes, and carve-on-shot. **Verified in-browser, not node.**

Implementation notes (read these forestdemo internals first: `spawnTestTree`, `_addTree`, `_buildTrunkBands`, the `collide`/box pattern at `_registerFallenLog`, `world.boxes`/`world.grid.addBox`, `_dbgMat`, how a bullet hit routes to a tree — `world.rayHit`/`_destructHit`/`fellTree`).

- [ ] **Step 1:** In `spawnTestTree`, after the tree record is created, build a cell trunk for it and stash on the rec:
```js
import { makeTrunk, cellIndex, cellAABB, carve } from './treecore.js';   // top of forestdemo.js
// … in spawnTestTree, for the spawned rec:
const TH = rec.fullH || rec.height, TR = (rec.trunkR || 0.3);
rec._cells = makeTrunk({ height: TH, radius: TR, bands: Math.max(4, Math.round(TH / 1.5)), sectors: 8, rings: 2, hp: 6 });
rec._cellBoxes = [];           // parallel: world collider per alive cell
this._buildCellTrunk(rec);     // builds mesh + boxes (Step 2)
```

- [ ] **Step 2:** Add `_buildCellTrunk(rec)` — (re)build ONE merged wood mesh from alive cells + a collision box per alive cell. Remove any prior mesh/boxes first (called again after each carve).
```js
_buildCellTrunk(rec) {
  const t = rec._cells, y0 = rec.baseY;
  // clear old boxes
  for (const b of rec._cellBoxes) { this.world.grid.removeBox(b); const i = this.world.boxes.indexOf(b); if (i >= 0) this.world.boxes.splice(i, 1); }
  rec._cellBoxes.length = 0;
  // clear old mesh
  if (rec._cellMesh && rec._cellMesh.parent) rec._cellMesh.parent.remove(rec._cellMesh);
  // build merged geometry of alive cells (a small box per cell) — reuse MeshBuilder if present, else BoxGeometry merge.
  const mb = new MeshBuilder();   // (forestdemo already imports MeshBuilder/voxelMaterial)
  for (let b = 0; b < t.bands; b++) for (let s = 0; s < t.sectors; s++) for (let r = 0; r < t.rings; r++) {
    const i = cellIndex(t, b, s, r); if (!t.alive[i]) continue;
    const a = cellAABB(t, b, s, r);
    const w = a.max[0]-a.min[0], h = a.max[1]-a.min[1], d = a.max[2]-a.min[2];
    mb.box(w, h, d, a.c[0], a.c[1], a.c[2], 0x6b5135);     // wood colour
    // world collider for this cell (tree + downer=rec so existing hit routing fells/ carves it)
    const box = { min: new THREE.Vector3(rec.x + a.min[0], y0 + a.min[1], rec.z + a.min[2]),
                  max: new THREE.Vector3(rec.x + a.max[0], y0 + a.max[1], rec.z + a.max[2]),
                  tree: true, downer: rec, cell: i, dmat: 'trunk' };
    rec._cellBoxes.push(box); this.world.boxes.push(box); this.world.grid.addBox(box);
  }
  const mesh = new THREE.Mesh(mb.build(), rec._test ? this._dbgMat() : voxelMaterial({}));
  mesh.position.set(rec.x, y0, rec.z); mesh.castShadow = true; this.scene.add(mesh);
  rec._cellMesh = mesh;
}
```

- [ ] **Step 3:** Route a hit on a cell box to a carve. Find where a tree bullet hit is handled (grep `downer` / `fellTree` / `_destructHit` in forestdemo + weapons). For a box with `.cell != null` on a `rec._cells` tree, call a new `carveTreeHit(rec, box, point, w)`:
```js
carveTreeHit(rec, box, point, w) {
  const t = rec._cells;
  const yLocal = point.y - rec.baseY;
  const ang = Math.atan2(point.z - rec.z, point.x - rec.x);
  const pen = Math.max(1, Math.min(t.rings, (w && w.pen != null) ? Math.ceil(w.pen / 2) : 1));   // caliber → radial depth (tune)
  const dmg = (w && w.dmg) ? w.dmg : 50;
  carve(t, yLocal, ang, { pen, dmg, spreadS: 0, spreadB: 0 });
  this._buildCellTrunk(rec);   // rebuild mesh + boxes (holes now real)
  // M1 (Task 6) will run support flood + detach here.
}
```
Wire the existing tree-hit path so that when `box.cell != null` it calls `carveTreeHit` instead of the old `fellTree`. Keep the old path for non-cell (normal forest) trees.

- [ ] **Step 4: in-browser verify** (Playwright on `?map=forest`): `/testtree`, freeze camera, shoot the trunk repeatedly at one spot → a hole/notch appears and PERSISTS; shoot all the way through a thin spot → you can see/shoot THROUGH the gap (a round fired into the hole hits what's behind, not the tree). Screenshot before/after. Confirm 0 console errors. (INV-4.)

- [ ] **Step 5: commit** — `git commit -am "feat(forest): /testtree built as carveable voxel-cylinder (M0 wiring)"`

---

## TASK 4 — treecore: support flood (M1)

**Files:** Modify `src/treecore.js`; Create `tests/treecore/support.test.mjs`

**Consumes:** grid + carve. **Produces:** `supportFlood(t)→Uint8Array supported`.

- [ ] **Step 1: failing test**

```js
// tests/treecore/support.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTrunk, cellIndex, carve, supportFlood } from '../../src/treecore.js';

const aliveSupported = (t, sup) => { let n = 0; for (let i = 0; i < t.alive.length; i++) if (t.alive[i] && sup[i]) n++; return n; };

test('intact trunk: every alive cell is supported', () => {
  const t = makeTrunk({ height: 6, radius: 0.5, bands: 3, sectors: 6, rings: 2 });
  const sup = supportFlood(t);
  assert.equal(aliveSupported(t, sup), t.alive.length);
});

test('severing a whole middle band orphans everything above it', () => {
  const t = makeTrunk({ height: 9, radius: 0.5, bands: 3, sectors: 6, rings: 1, hp: 1 });
  // kill all of band 1
  for (let s = 0; s < t.sectors; s++) carve(t, 1.5 * t.bandH, s / t.sectors * Math.PI * 2, { pen: 1, dmg: 1000 });
  const sup = supportFlood(t);
  for (let s = 0; s < t.sectors; s++) assert.equal(sup[cellIndex(t, 2, s, 0)], 0);   // band 2 unsupported
  for (let s = 0; s < t.sectors; s++) assert.equal(sup[cellIndex(t, 0, s, 0)], 1);   // band 0 still supported
});
```

- [ ] **Step 2: run, verify fail.**

- [ ] **Step 3: implement (append)**

```js
// Flood "supported" out from the rooted base (band 0) through ALIVE face-adjacent neighbours. Returns a
// Uint8Array (1=supported). Any alive cell with sup=0 has lost its path to the ground → it will detach.
export function supportFlood(t) {
  const n = t.bands * t.sectors * t.rings;
  const sup = new Uint8Array(n);
  const stack = [];
  for (let s = 0; s < t.sectors; s++) for (let r = 0; r < t.rings; r++) {
    const i = cellIndex(t, 0, s, r);
    if (t.alive[i]) { sup[i] = 1; stack.push([0, s, r]); }
  }
  const tryPush = (b, s, r) => {
    if (b < 0 || b >= t.bands || r < 0 || r >= t.rings) return;
    s = ((s % t.sectors) + t.sectors) % t.sectors;
    const i = cellIndex(t, b, s, r);
    if (t.alive[i] && !sup[i]) { sup[i] = 1; stack.push([b, s, r]); }
  };
  while (stack.length) {
    const [b, s, r] = stack.pop();
    tryPush(b + 1, s, r); tryPush(b - 1, s, r);
    tryPush(b, s + 1, r); tryPush(b, s - 1, r);
    tryPush(b, s, r + 1); tryPush(b, s, r - 1);
  }
  return sup;
}
```

- [ ] **Step 4: run, verify pass.**
- [ ] **Step 5: commit** — `git commit -am "feat(forest): treecore supportFlood (rooted-base connectivity)"`

---

## TASK 5 — treecore: orphan grouping + piece classification (M1)

**Files:** Modify `src/treecore.js`; add tests to `tests/treecore/support.test.mjs`

**Consumes:** `supportFlood`, `decodeCell`, `cellAABB`. **Produces:** `orphanGroups(t, sup)→[{cells,minB,maxB,count,centroid}]`; `classifyPiece(group,t,opts)→'hinge'|'tumble'`.

- [ ] **Step 1: failing test (append to support.test.mjs)**

```js
import { orphanGroups, classifyPiece } from '../../src/treecore.js';

test('orphanGroups: severed top is ONE group spanning the upper bands → classified hinge', () => {
  const t = makeTrunk({ height: 12, radius: 0.5, bands: 4, sectors: 6, rings: 1, hp: 1 });
  for (let s = 0; s < t.sectors; s++) carve(t, 1.5 * t.bandH, s / t.sectors * Math.PI * 2, { pen: 1, dmg: 1000 }); // sever band 1
  const groups = orphanGroups(t, supportFlood(t));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].minB, 2);   // bands 2..3 above the cut
  assert.equal(classifyPiece(groups[0], t), 'hinge');
});

test('orphanGroups: a small disconnected clump → classified tumble', () => {
  // make a 1-cell island: kill its only downward + lateral links so it floats free
  const t = makeTrunk({ height: 9, radius: 0.5, bands: 3, sectors: 4, rings: 1, hp: 1 });
  // kill all of band 1 EXCEPT keep none → then band 2 fully orphan; but we want a SMALL group:
  // kill band1 sector0..3 and band2 sector1..3, leaving only band2 sector0 alive & orphaned (1 cell)
  for (let s = 0; s < 4; s++) carve(t, 1.5 * t.bandH, s / 4 * Math.PI * 2, { pen: 1, dmg: 1000 });
  for (let s = 1; s < 4; s++) carve(t, 2.5 * t.bandH, s / 4 * Math.PI * 2, { pen: 1, dmg: 1000 });
  const groups = orphanGroups(t, supportFlood(t));
  const small = groups.find(g => g.count === 1);
  assert.ok(small, 'expected a 1-cell orphan');
  assert.equal(classifyPiece(small, t), 'tumble');
});
```

- [ ] **Step 2: run, verify fail.**

- [ ] **Step 3: implement (append)**

```js
// Alive + unsupported cells, grouped into connected components (face-adjacency). Each group = one piece
// that detaches together. Carries band span, cell count, and local-space centroid (for hinge/tumble spawn).
export function orphanGroups(t, sup) {
  const n = t.bands * t.sectors * t.rings;
  const seen = new Uint8Array(n);
  const groups = [];
  for (let start = 0; start < n; start++) {
    if (!t.alive[start] || sup[start] || seen[start]) continue;
    const cells = [], stack = [start]; seen[start] = 1;
    let minB = Infinity, maxB = -Infinity, cx = 0, cy = 0, cz = 0;
    while (stack.length) {
      const j = stack.pop(); cells.push(j);
      const [b, s, r] = decodeCell(t, j);
      minB = Math.min(minB, b); maxB = Math.max(maxB, b);
      const a = cellAABB(t, b, s, r); cx += a.c[0]; cy += a.c[1]; cz += a.c[2];
      const nb = [[b + 1, s, r], [b - 1, s, r], [b, s + 1, r], [b, s - 1, r], [b, s, r + 1], [b, s, r - 1]];
      for (let [bb, ss, rr] of nb) {
        if (bb < 0 || bb >= t.bands || rr < 0 || rr >= t.rings) continue;
        ss = ((ss % t.sectors) + t.sectors) % t.sectors;
        const k = cellIndex(t, bb, ss, rr);
        if (t.alive[k] && !sup[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    const c = cells.length;
    groups.push({ cells, minB, maxB, count: c, centroid: [cx / c, cy / c, cz / c] });
  }
  return groups;
}

// A tall, sizeable piece (the felled top) HINGES; anything smaller TUMBLES. (INV-3 — never hinge a small
// piece, that was the old "stuck" bug.) bandCut/countCut tunable in the wiring layer.
export function classifyPiece(group, t, { bandCut = 2, countCut = null } = {}) {
  const span = group.maxB - group.minB + 1;
  const cc = countCut == null ? Math.max(4, t.sectors * t.rings) : countCut;   // ≈ one full band
  return (span >= bandCut && group.count >= cc) ? 'hinge' : 'tumble';
}
```

- [ ] **Step 4: run, verify pass.**
- [ ] **Step 5: commit** — `git commit -am "feat(forest): treecore orphanGroups + classifyPiece (hinge vs tumble)"`

---

## TASK 6 — forestdemo: detach + fall + drape on carve (M1 wiring — the no-stuck fix)

**Files:** Modify `src/forestdemo.js`

**Consumes:** `supportFlood`, `orphanGroups`, `classifyPiece` + `makeHinge`/`makeTumble`/`stepBody` (`destruct.js`). **Produces:** after a carve, every orphan group detaches: large → hinge fall toward its centroid; small → tumble drop; each lands and rests on terrain (drape). The standing trunk loses those cells. **Verified in-browser.**

- [ ] **Step 1:** In `carveTreeHit` (Task 3), after `carve(...)` and BEFORE `_buildCellTrunk`, run detachment:
```js
import { supportFlood, orphanGroups, classifyPiece } from './treecore.js';
import { makeTumble } from './destruct.js';   // makeHinge/stepBody already imported
// … inside carveTreeHit, replacing the lone _buildCellTrunk call:
this._detachOrphans(rec);     // spawns falling pieces for unsupported groups, marks their cells dead
this._buildCellTrunk(rec);    // rebuild the (now smaller) standing trunk + its boxes
```

- [ ] **Step 2:** Add `_detachOrphans(rec)`:
```js
_detachOrphans(rec) {
  const t = rec._cells, y0 = rec.baseY;
  const groups = orphanGroups(t, supportFlood(t));
  for (const g of groups) {
    const kind = classifyPiece(g, t);
    // build a mesh for this group's cells (local space), parented to a group node at the trunk base
    const mb = new MeshBuilder();
    let lowY = Infinity;
    for (const i of g.cells) {
      const [b, s, r] = decodeCellPub(t, i);            // (export decodeCell or use treecore.decodeCell)
      const a = cellAABB(t, b, s, r);
      mb.box(a.max[0]-a.min[0], a.max[1]-a.min[1], a.max[2]-a.min[2], a.c[0], a.c[1], a.c[2], 0x6b5135);
      lowY = Math.min(lowY, a.min[1]);
      t.alive[i] = 0;                                    // remove from the standing trunk (INV-1)
    }
    const node = new THREE.Group(); node.position.set(rec.x, y0, rec.z);
    const mesh = new THREE.Mesh(mb.build(), rec._test ? this._dbgMat() : voxelMaterial({}));
    node.add(mesh); this.scene.add(node);
    const groundAt = this.world.terrain ? (gx, gz) => this.world.terrain.terrainHeightAt(gx, gz) : null;
    if (kind === 'hinge') {
      const pivotY = y0 + g.minB * t.bandH;
      const dir = [Math.cos(Math.atan2(g.centroid[2], g.centroid[0])), Math.sin(Math.atan2(g.centroid[2], g.centroid[0]))]; // toward removed-material side
      const body = makeHinge({ pivot: [rec.x, pivotY, rec.z], dirXZ: dir, length: (g.maxB - g.minB + 1) * t.bandH, radius: t.radius, seed: (rec.id ^ g.cells[0]) >>> 0 || 1, obstacles: this._fallObstacles(rec, dir[0], dir[1], (g.maxB-g.minB+1)*t.bandH), groundAt });
      this._falling2.push({ kind: 'hinge', body, node, rec, cellsLow: lowY });   // _falling2 = new M1 list (Step 3)
    } else {
      const c = g.centroid;
      const vel = [c[0] * 1.5, 1.0, c[2] * 1.5];          // small outward+up pop so it clears the trunk
      const body = makeTumble({ pos: [rec.x + c[0], y0 + c[1], rec.z + c[2]], vel, seed: (rec.id ^ g.cells[0]) >>> 0 || 1, radius: 0.2, floorY: (this.world.terrain ? this.world.terrain.terrainHeightAt(rec.x + c[0], rec.z + c[2]) : 0) });
      // reparent the tumble mesh to world centroid so its node follows body.pos
      node.position.set(0, 0, 0); mesh.position.set(-c[0], -c[1], 0); // keep verts around node origin; simplest: rebuild mesh centred — see note
      this._falling2.push({ kind: 'tumble', body, node, mesh, rec, off: c });
    }
  }
}
```
> Note for implementer: the cleanest is to build the group mesh **centred on its centroid** (subtract `c` from each box centre) and move the `node` to the world centroid, so a `tumble` body's `pos` drives `node.position` directly. Adjust the box centres in the `mb.box(...)` call by `-c[0],-c[1],-c[2]` for tumble pieces; hinge pieces keep base-relative coords and rotate about the pivot. Pick ONE convention and keep render + body in sync.

- [ ] **Step 3:** Add `_falling2 = []` in the constructor, and integrate into `update(dt)`:
```js
for (let i = this._falling2.length - 1; i >= 0; i--) {
  const f = this._falling2[i];
  stepBody(f.body, dt);
  if (f.kind === 'hinge') {
    _axis.set(f.body.dirXZ[1], 0, -f.body.dirXZ[0]).normalize();
    f.node.quaternion.setFromAxisAngle(_axis, f.body.angle);
  } else {
    f.node.position.set(f.body.pos[0], f.body.pos[1], f.body.pos[2]);
    f.node.rotation.set(f.body.rotAxis[0]*f.body.rotAngle, f.body.rotAxis[1]*f.body.rotAngle, f.body.rotAxis[2]*f.body.rotAngle);
  }
  if (f.body.settled) { this._drapePiece(f); this._falling2.splice(i, 1); }
}
```

- [ ] **Step 4:** Add `_drapePiece(f)` — once a piece settles, drop it so its lowest point rests on the terrain (INV-2) and give it ground collision boxes so it's a solid fallen chunk (reuse the per-chunk grounding idea from the stopgap `_groundChunks`). Minimal: lower `f.node` until its mesh bbox min.y ≈ terrain, then add a few `tree:true, downer:<a fallen-log record>` boxes. (For M1 the landed piece may stay collision-light; full fallen-log roles come in M3. At minimum it must rest on the ground, not float.)

- [ ] **Step 5: in-browser verify (THE milestone gate, INV-1/2/3):**
  - `/testtree`, freeze camera. **Shoot a SMALL chunk off the side of the standing trunk** → it detaches and TUMBLES to the ground; it does NOT stay embedded in the trunk and does NOT float. (Owner's #1 requirement.)
  - **Sever the trunk** (carve >½ a band) → the whole top above detaches and HINGES down toward the notch, then rests on the ground.
  - Carve repeatedly / from different angles → no piece ever sticks mid-air, no infinite spin. Screenshot each. 0 console errors.
  - Re-confirm INV-4 from Task 3 still holds (holes persist, shoot-through).

- [ ] **Step 6: commit** — `git commit -am "feat(forest): carve→support-flood→detach (hinge/tumble)→drape — no stuck pieces (M1)"`

---

## Self-Review (done at plan-author time)

- **Spec coverage (M0/M1 slice):** voxel-cylinder data ✓ (T1), carve by caliber depth ✓ (T2), render+collide+shoot-through ✓ (T3, INV-4), support flood ✓ (T4, INV-1), orphan grouping + hinge/tumble classify ✓ (T5, INV-3), detach+fall+drape ✓ (T6, INV-1/2/3). Directional fall toward notch ✓ (T6 dir from centroid). Phases 2–6 are explicitly OUT of this plan (later milestones) — noted in Global Constraints.
- **Placeholder scan:** the pure-logic tasks (T1,T2,T4,T5) carry complete code + tests. The 3 wiring tasks (T3,T6) carry concrete code against named forestdemo/destruct APIs; T6 Step 4 `_drapePiece` is described not fully coded because it depends on the exact stopgap `_groundChunks` internals the implementer will read — flag: implementer reads `_groundChunks` and mirrors it. Acceptable (THREE wiring, browser-verified, no node test).
- **Type consistency:** cell index formula identical in `cellIndex`/`decodeCell`/all consumers; `carve`/`supportFlood`/`orphanGroups` share the `t` shape from `makeTrunk`; `classifyPiece` returns the `'hinge'|'tumble'` the wiring switches on. `decodeCell` must be EXPORTED (used by `_detachOrphans` as `decodeCellPub`) — implementer imports it.
- **Open follow-up:** T6 tumble mesh-centring convention (centroid-centred mesh + node-at-centroid) — pick one and keep render/body in sync (noted inline).

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-06-25-tree-rewrite-m0-m1.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh implementer per task + task review between tasks; the controller runs the in-browser checks (T3/T6) via Playwright. Best for keeping context lean across the build.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
