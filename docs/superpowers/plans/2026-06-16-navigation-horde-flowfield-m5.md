# M5 Navigation — Horde Flow-Field (part 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this. Steps use `- [ ]` checkboxes.

**Goal:** Give the **horde** (not just the boss) real navigation — so enemies route *around* cliffs/buildings and *through doorways into buildings*, instead of beelining into walls. Engine Hardening Program Mechanic 5, part 1 (spec `docs/superpowers/specs/2026-06-16-engine-hardening-program-design.md` §3.5, Tiers A+B core). Tier C (multi-level bunker portals) deferred.

**Architecture:** A host-computed **flow-field** over a slope-aware occupancy grid. Today the horde is pure steering (`enemies.js:311-312` beeline + separation/avoidance/stuck-buster); only the boss runs A* (`pathing.js`). We add a grid + flow-field and inject its direction into the existing steering **only when the straight line to the target is blocked** — so open-ground behavior is unchanged (still smooth beeline), and nav only kicks in around obstacles. Mirrors the boss override at `enemies.js:317`.

**Tech stack:** vanilla JS + Three.js r160; pure grid/flow-field modules node-tested; browser-verified in isolated headless Chrome.

**Branch:** `feat/engine-nav` (off `feat/engine-prop-lod`). Stacked PR.

**Why one PR covers cliffs AND buildings:** both need the same core (grid + flow-field + steering injection). Routing *around a cliff* and routing *through a doorway* are the same algorithm; the only building-specific bit is a small enough inflate that doorways stay open. So this PR delivers both.

---

## Design

### 1. Parameterize the nav grid — `src/pathing.js`

`buildNavGrid(world)` is boss-tuned (`CELL=2.5`, `INFLATE=1.7` ≈ boss radius — which **closes 2 m doorways**) and ignores terrain slope. Generalize:

- `export function buildNavGrid(world, opts = {})` with `{ cell = CELL, inflate = INFLATE, slopeAware = false }`.
- Keep the existing AABB rasterization (skip `b.max.y < 0.6` and `b.struct`).
- When `slopeAware`, ALSO block cells whose terrain is too steep: for each cell centre `(x,z)`, if `world.hasTerrain && world.terrain.terrainSlopeAt(x,z) > world.terrain.slopeLimit`, set `blocked=1`. (Sample at cell centre; this is the grid-level analogue of the per-step slope backstop at `enemies.js:355-360`.)
- **Backward compatible:** the boss call (`enemies.js:259` → `buildNavGrid(this.world)`) keeps its current behavior (defaults = old constants, `slopeAware:false`).
- Add `export function lineBlocked(g, x0, z0, x1, z1)` — a grid DDA/supercover walk from (x0,z0) to (x1,z1); returns true if any traversed cell `isBlocked`. (Reuse the existing `cellOf`/`isBlocked` helpers.) This gates flow-field use per enemy.

### 2. New flow-field module — `src/flowfield.js` (pure, node-testable)

```
export function buildFlowField(g, goalX, goalZ)
  // Dijkstra (8-dir, sqrt2 diagonals, no corner-cut — same DIRS rule as pathing.js A*)
  // from the goal cell outward over !blocked cells. Stores per cell:
  //   dist : Float32Array(cols*rows)         — cost to goal (Infinity if unreached/blocked)
  //   dirX, dirZ : Float32Array per cell      — UNIT vector toward the lowest-dist neighbour
  // Returns { cols, rows, cell, originX, originZ, dist, dirX, dirZ, goalX, goalZ }.

export function flowDirAt(field, x, z)
  // Look up the cell for (x,z); return { x:dirX, z:dirZ } (unit) or null if the cell is
  // unreached/blocked. Caller falls back to beeline on null.
```

Dijkstra from the goal makes every reachable cell's stored direction point one step "downhill" toward the goal, automatically routing around blocked regions and **funnelling through doorway gaps** (the only walkable cells through a wall). Cost is O(cells) per rebuild; lookups are O(1).

### 3. Wire into the horde — `src/enemies.js`

- **Build a horde grid once per map** (lazily, like the boss grid at `enemies.js:259`): `this._hordeGrid = buildNavGrid(this.world, { cell: 1.5, inflate: 0.7, slopeAware: true })`. Finer cell + small inflate (≈ enemy radius) so **doorways stay passable**. Rebuild if the static set changes materially (out of scope here — static map).
- **Refresh the flow-field toward the host player** periodically: keep `this._flowT` timer; every ~0.3 s (or when the player crosses a cell) `this._hordeFlow = buildFlowField(this._hordeGrid, pp.x, pp.z)`. Host-only (the whole `enemies.update` runs under `sim`, `game.js:1073`).
- **Inject at the steering override (`enemies.js:317`, parallel to the boss):**
  ```js
  else if (this._hordeFlow && this._hordeGrid && lineBlocked(this._hordeGrid, e.pos.x, e.pos.z, tgt.x, tgt.z)) {
    const fd = flowDirAt(this._hordeFlow, e.pos.x, e.pos.z);
    if (fd) { dx = fd.x; dz = fd.z; }   // route around the obstacle; open LoS keeps the beeline above
  }
  ```
  Separation, crate-avoidance, stuck-buster, slope backstop (lines 320-360) all stay on top unchanged.

### 4. Demo test building — `src/world.js` `_buildDemo`

Seat a simple **enclosure with a single doorway** so "into buildings" is testable: 4 wall colliders leaving a ~2 m gap on one side, + a matching voxel mesh, via the placement API (`seatBox`/`seatProp`, `terrain-place.js`). Place it on flat-ish demo ground near spawn. This gives a wall the horde must route around + a doorway to funnel through.

### 5. Co-op / determinism (constraints — hold)

- The grid derives only from static AABBs + the seeded terrain → identical on every peer.
- The flow-field is host-computed; the horde is host-sim (`game.js:1073`) → clients never run it; **no new network-envelope data** (enemy positions already broadcast via `esnap`).
- Pure modules use no `Math.random`. The boss A* path is untouched (backward-compatible `buildNavGrid`).

---

## Tasks

### Task 1: Flow-field module + node tests
- Create `src/flowfield.js` (`buildFlowField`, `flowDirAt`).
- Create `tests/nav/flowfield.test.mjs`: on a tiny hand-built grid (e.g. a 5×5 with a wall row and a 1-cell gap), assert (a) the goal cell `dist=0`; (b) a cell on the far side of the wall has its `dir` pointing toward the **gap**, not into the wall; (c) `flowDirAt` returns a unit vector toward goal in open cells and `null` for a fully-walled-off cell. Run `node --test`.

### Task 2: Parameterize `buildNavGrid` + `lineBlocked` + node tests
- Edit `pathing.js`: opts (`cell`/`inflate`/`slopeAware`), slope blocking, `lineBlocked` DDA.
- Extend `tests/` (e.g. `tests/nav/navgrid.test.mjs`): assert (a) default call unchanged (same cols/rows/blocked for a fixture world); (b) a smaller `inflate` leaves a doorway gap open that the default closes; (c) `lineBlocked` true through a wall, false across open cells. (Use a minimal fake `world` with `boxes` + a stub `terrain`.)
- Confirm the boss still builds its grid with defaults (no behavior change).

### Task 3: Horde grid + flow-field refresh + steering injection
- Edit `enemies.js`: lazy `_hordeGrid`, periodic `_hordeFlow` refresh, the `else if` injection at line 317. Import `buildFlowField`/`flowDirAt`/`lineBlocked`.
- Keep it host-only (already gated) and allocation-light (one field rebuild per refresh tick, not per frame).

### Task 4: Demo test building
- Edit `world.js` `_buildDemo`: seat the doorway enclosure (walls + gap + mesh) via the placement API.

### Task 5: Cache-bust + browser verify + PR
- Bump `?v=` + `GAME_BUILD`.
- **Headless verify (isolated Chrome, demo):**
  1. Place the player just inside/behind the test building's doorway; spawn an enemy on the far side of a wall (not the doorway side). Step the sim; assert the enemy's path **passes through the doorway gap region** and it reaches near the player (distance shrinks below a threshold) instead of stalling against the wall.
  2. Cliff routing: with the demo's hill, spawn an enemy across a too-steep face from the player; assert it makes progress around (net distance to player decreases over N seconds) rather than bunching at the cliff base forever.
  3. Open ground unchanged: with clear LoS, the enemy beelines (its heading ≈ straight at the player; `lineBlocked` false → no flow override).
  4. Boss unchanged: boss still uses its A* grid; 0 console errors; arena/steppe behavior unchanged.
- Open the stacked PR (base `feat/engine-prop-lod`) with plain-language description + verify results + the **feel-tuning-needs-playtest** caveat.

## Verification / success criteria
1. Flow-field + navgrid node tests green.
2. Horde routes through a doorway into a building to reach the player (headless).
3. Horde routes around a too-steep cliff (headless), not stuck at the base.
4. Open-ground beeline unchanged; boss A* unchanged; arena/steppe unchanged; 0 errors.
5. Co-op: host-only, deterministic grid, no new envelope data.

## Known limits / deferred
- **Feel-tuning needs a human playtest** (does the horde *move* naturally?) — headless verifies correctness, not feel.
- **Co-op multi-target:** the flow-field targets the host player; in co-op, enemies route via it only when their path is blocked (open LoS still beelines per-target). Per-target fields = a refinement.
- **Tier C multi-level** (bunker ladders/stairs via portal-linked per-floor grids) — separate follow-up.
- **Dynamic obstacles** (player-built walls) — the static grid doesn't see them; the existing stuck-buster covers that case.
