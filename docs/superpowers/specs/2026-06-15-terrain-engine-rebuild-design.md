# Terrain Engine Rebuild — Design

- **Date:** 2026-06-15
- **Status:** design / spec (pre-plan) — approved in brainstorm session
- **Branch:** `feat/terrain-engine-rebuild`
- **Owner intent:** rebuild the whole map "with the terrain", and **focus on the game engine first**.
  Not a content task — a *foundation* task. Make real elevation (hills, valleys) a first-class engine
  capability the whole game lives on, built so it **scales up later without a rewrite**. The `demo`
  map is the **sandbox test-bed**: it may be freely remade (or replaced with a fresh map module and
  swapped into the map picker) — the only hard requirement is that a `demo`/sandbox map exists where
  the terrain engine is exercised.

## 0. Where this sits — current state (from the 2026-06-15 architecture scan)

A working terrain system **already exists**, but it is a deliberately gated, isolated stub:

- **`src/terrain.js`** (187 lines) — *pure*, seeded, deterministic heightfield. No THREE, node-testable.
  Contract: `terrainHeightAt(x,z)→y`, `terrainSlopeAt(x,z)→angle`, `terrainNormalAt(x,z)→vec`. Profile
  `'flat'` returns 0 everywhere; profile `'demo'` is 4-octave fBm + two Gaussian bumps. Seeded at
  construction (`Math.random` never called) → co-op safe. **This is the strongest piece; we keep it.**
- **`src/terrain-mesh.js`** (65 lines) — `buildGroundMesh(terrain, {extent, resolution})`: **one** large
  subdivided `PlaneGeometry` displaced per-vertex, vertex-colored by slope. Works, but is naive: **no
  chunking, no LOD, no culling.** A single high-density plane at 1000 m would tank FPS. **This is the
  piece we replace with a chunk system.**
- **`src/world.js`** (876 lines) — has **two** collision paths: `collide()` (flat, hard `y=0` floor,
  `world.js:310-331`) and `_collideTerrain()` (gravity onto heightfield, slope-limit, ground-follow,
  `world.js:337-373`). The terrain path is gated behind `world.hasTerrain`, which is **true only on
  `?map=demo`**. Maps: `arena` (flat, dust2), `steppe` (flat, 1000×1000), `demo` (terrain stub: terrain
  + ground mesh + spawns only — **no enemies, no buildings, no AABB colliders placed on it**).

**The gap, restated:** the terrain exists, but **the game does not live on it.** The hard, not-yet-done
part is *integration* — placing colliders/props/enemies on the heightfield and unifying the dual code
paths — plus making the mesh **scale**.

Related prior art: the Environmental Destruction Overhaul spec already reserved "terrain craters" for a
"future terrain engine" (`2026-06-12-prop-destruction-design.md` §1, line 42). This spec **is** that
engine's foundation; craters/deformation remain out of scope here (see §1 Out).

## 1. Scope

**In:**
1. **Promote terrain to an always-on, first-class engine capability** — every map has a `terrain`;
   flat maps use profile `'flat'`. Collapse the dual collision path into one.
2. **Chunked terrain mesh** with frustum culling, authored so **distance LOD is an additive step**
   (chunk boundary baked in from day 1).
3. **A placement API** so props, buildings, and AABB colliders **seat on the terrain surface**.
4. **AI + co-op terrain-tolerance** — slope-limited horde movement; co-op stays desync-free.
5. A **rebuildable `demo`/sandbox map** that puts a few props + enemies on real terrain, reachable
   from the menu (not URL-only), as the test-bed.
6. A **performance / graphics-quality scaffold** — knobs that maximize FPS while preserving texture
   detail (render scale + adaptive resolution, draw-distance cull, shadow quality, AA), exposed as
   Low/Med/High presets in the existing Settings (see §3.5).

**Out (explicit — YAGNI):**
- **Caves / overhangs / tunnels** — a heightfield is 2.5D (one `y` per `x,z`). True 3D terrain needs
  voxels or separate meshes. **Hard limit, acknowledged now.**
- **Streaming / infinite world** — bounded, chunked, fully-resident maps only. No load/unload-as-you-move.
- **Destructible / deformable terrain** (craters, digging) — deferred to the destruction program.
- **Texture splatting / custom terrain shader** — keep the voxel/`MeshLambertMaterial` vertex-colored
  look first; splatting is a later nice-to-have.
- **WebGPU migration** — stays on WebGL r160. (Documented as the eventual ceiling-raise, not now.)
- **Re-terraining arena/steppe gameplay** — they switch to the unified path but keep `'flat'` profile,
  so their behavior is **unchanged**. Giving *them* real elevation is a future content decision.

## 2. Owner-approved decisions (from the brainstorm)

1. **Demo is the sandbox, and it is not precious.** Rebuild it freely. **If a fresh map module is
   cheaper than retrofitting the stub, build the new one and swap it into the map picker.** Requirement:
   a `demo`/sandbox map exists and is where the terrain engine is tried out.
2. **Design-for-scale from day 1 — the one hard condition.** The small demo must be built on the
   **chunked** architecture, *not* the single-plane mesh. Otherwise "scale it later" becomes "rewrite
   it later". The chunk boundary exists from the first commit; scaling = *more chunks + LOD*, additive.
3. **Terrain is the universal substrate; flat is a special case.** One collision code path. Arena/steppe
   keep current behavior via the `'flat'` profile.
4. **Stay in the browser.** The terrain ambition (even a large open-world) is achievable in WebGL with
   chunking/LOD; going native is a full rewrite with no real ceiling gain for this game. Not pursued.
5. **Phased: engine → game-lives-on-terrain → scale.** Final map *size* is decided in Phase 3, with the
   engine already in hand — not now.

## 3. Architecture — the four pillars

### 3.1 Terrain as the universal substrate (unify the collision path)

- **Every `World` gets a `terrain`** (`makeTerrain({profile, seed})`). Flat maps pass `profile:'flat'`
  → `terrainHeightAt` returns 0 → behavior identical to today's hard floor.
- **Delete the dual path.** `collide()` and `_collideTerrain()` collapse into **one** terrain-aware
  resolver (gravity onto `terrainHeightAt`, slope-limit on horizontal move, ground-follow re-seat). The
  flat profile makes it degenerate to the old `y=0` floor for arena/steppe — same result, one code path.
- **`world.hasTerrain` is retired** (or becomes always-true). No consumer ever again branches on "does
  this map have terrain?".
- **Ground-Y audit.** Make `world.groundY(x,z)` the single ground-height accessor and route **all** the
  ~20–30 current consumers (player, enemies, flares, loot, weapons/decals, mortar, nightpost, vehicles)
  through it. Replace direct `pos.y<=0` / literal `y=0` checks. Mechanical but pervasive — it is the
  bulk of Phase 1's risk and must be done before scaling.

**Unit:** `terrain.js` is the heightfield authority — *what does it do?* returns ground height/slope/
normal at any `x,z`; *how used?* `terrain.terrainHeightAt(x,z)`; *depends on?* nothing (pure, no THREE).

### 3.2 Chunked terrain mesh (new — the scale enabler)

Replace the single-plane `buildGroundMesh` with a **chunk manager** that owns a grid of per-tile meshes.

- **New module `src/terrain-chunks.js`** — `TerrainChunks(terrain, {origin, size, chunk, resolution})`:
  - Divides the playable extent into `chunk`×`chunk`-metre tiles, each a separate displaced, vertex-
    colored mesh generated from `terrain` (reusing the displacement logic now in `terrain-mesh.js`).
  - `update(camera)` each frame: **frustum-cull** per chunk; (Phase 3) pick a **LOD** resolution per
    chunk by camera distance.
  - Exposes the chunk grid so the placement API and any future deformation can find a tile from `x,z`.
- **Starting numbers (all tunable):** chunk = **64 m**, near resolution = **32×32 verts** (~2 m grid,
  ~2k tris/chunk). Demo at 256×256 m = 16 chunks ≈ 32k tris. A 1024² world = 256 chunks, made tractable
  by culling + LOD.
- **LOD seams = skirts, not stitching.** Each chunk mesh drops a thin vertical "skirt" at its edges to
  hide cracks between differing LODs. Cheap, robust, no geomorph/stitch bookkeeping — fits "no build step".
- **`terrain-mesh.js`** is folded into / consumed by the chunk builder (its displacement + slope-coloring
  is reused as the per-chunk geometry function); the standalone single-plane path is removed.

**Unit:** `TerrainChunks` owns *rendering* of the ground — *what?* turns the heightfield into culled,
LOD-ready meshes; *how used?* `chunks.update(camera)` per frame; *depends on?* `terrain.js` + THREE.
It knows nothing about physics or gameplay (those read `terrain.js` directly).

### 3.3 Placement API (props/buildings/colliders seat on terrain)

- **Helper `seatOnTerrain` / `terrainBox`** (small `src/terrain-place.js`, or `World` methods):
  - `groundY` sampling under a footprint → place an object so its base rests on the surface (foundations
    sunk slightly so they never float on a slope).
  - `terrainBox(x,z,w,d,h)` → an AABB collider whose `min.y` is seated on the terrain, pushed into
    `world.boxes`. This is what lets buildings/crates exist on hills.
- District/POI builders (`industrial.js`, `airfield.js`, `strongpoint.js`, `bunker.js`, `kolkhoz.js`,
  `forest.js`, `openworld.js`) are **not** reworked in this spec — but the API is designed so that, when
  a map later wants them on terrain, they call `seatOnTerrain` instead of assuming `y=0`. For the demo
  sandbox we place a **handful of test props + spawns** via this API to prove integration.

### 3.4 AI + co-op terrain-tolerance

- **Horde (steering):** enemies already sample `terrainHeightAt` every frame (`enemies.js:352-354`) →
  they follow hills for free. **Add a slope-limit** so they cannot walk up near-vertical faces (mirror
  the player's `slopeLimit`); steer along instead.
- **Boss A\* (`pathing.js`):** the 2-D XZ occupancy grid is **left as-is** for the demo's gentle hills
  (no impassable terrain walls yet, so it still works). Height-aware / 3-D-tolerant pathing is **deferred
  to Phase 3**, when terrain introduces real obstacles. Flagged honestly as a known limit, not hidden.
- **Co-op:** unchanged authority model. Terrain is a pure function of `(mapId→seed, profile)`, so host and
  clients build **identical** heightfields and chunk meshes; ground-Y is recomputed locally on each side.
  **No terrain data is added to the network envelope.** Constraint to hold: **never** introduce per-run
  random elevation or client-only deformation — both would desync.

### 3.5 Performance & graphics-quality settings (FPS without losing textures)

The terrain engine raises the perf stakes (R3), and the owner wants to **maximize FPS while keeping
texture/material detail**. Key insight: **texture quality and pixel count are independent** — FPS is
mostly the latter. The levers, ordered by impact, **all of which preserve textures**:

1. **Render scale (internal resolution / DPR) — the single biggest GPU lever.** Fragment cost is
   *quadratic* in pixels. Render at 0.5–1.0× and upscale: you lose *sharpness*, never *textures*.
   Wire a `renderScale` knob **plus an adaptive mode** (watch frame time, auto-lower/raise DPR to hold
   a target FPS). `engine.js` already caps DPR at 2 — this generalizes that single clamp.
2. **Draw-distance / fog-cull ("remove objects smartly").** Nothing past the fog is visible; toggle
   `visible=false` on props/enemies/chunks beyond a `drawDistance` radius, keyed off the spatial grid.
   This is the owner's "odebírat objekty", done safely.
3. **Shadow quality** — the 2048² directional sun shadow is often the top single GPU cost. Knob:
   off / 1024 / 2048, plus shadow distance.
4. **Fewer draw calls** — terrain chunks are each ONE merged mesh; repeated props use `InstancedMesh`
   (the engine already instances the 800-particle pool + groundcover). Re-instancing existing district
   props is a Phase 2/3 follow-up, **not** Phase 1.
5. **Antialiasing toggle** — MSAA on/off.
6. **Texture knobs** — keep mipmaps (they help both perf and looks), expose anisotropy as a quality
   step. Textures themselves are never dropped.

**Delivery:** plug a **Graphics-quality** block into the existing `Settings` (ui.js, persisted) with
**Low / Medium / High** presets driving knobs 1–3 + 5, an **Auto / adaptive-resolution** toggle, and a
live FPS readout. Optional startup heuristic (`WEBGL_debug_renderer_info` GPU string) just picks a
default preset; the user can always override. Co-op note: graphics quality is **purely local cosmetic**
— never synced.

**Phase 1 scope:** render scale (+ adaptive), draw-distance cull, shadow-quality, AA toggle, presets,
FPS readout. **Deferred:** per-prop `THREE.LOD`, re-instancing existing districts, texture streaming.

## 4. The sandbox demo map

- Owner-approved: rebuild freely, or replace with a fresh module and swap in the picker.
- **Recommended:** keep `mapId === 'demo'` as the identifier (consumers/tests already reference it) but
  let its content be rebuilt on the new chunked engine. If a clean-room module reads better than editing
  `world.js`'s `_buildDemo`, create e.g. `src/sandbox.js` and have `World` delegate to it for `demo`.
- **Reachable from the menu**, not just `?map=demo` — add/confirm the entry in the map-selection UI so
  testing doesn't require hand-editing the URL. (Map selection lives at `game.js:85-90` + the menu.)
- **Demo content (Phase 2):** chunked rolling terrain + a few `terrainBox` test props + several enemy
  spawns seated on the surface — enough to *feel* the engine, not a designed level.

## 5. Co-op determinism (constraint, not new work)

Already satisfied by seeding; this spec must **preserve** it: terrain/chunks derive only from
`(seed, profile)`; `mp.js` keeps sending only `mapId` (host's map wins); no `y` is synced beyond the
existing host→client enemy-snapshot `pos.y` (which both sides could recompute anyway). Verification:
2-tab WebRTC playtest on the demo map — host and client must show identical terrain and no positional
desync on slopes.

## 6. Phasing

- **Phase 1 — Engine foundation** *(this is the "focus on the engine first" milestone)*
  - `terrain.js` always-on; unify the collision path; ground-Y audit of all consumers.
  - `TerrainChunks` skeleton: chunking + frustum culling (no LOD yet) on the demo.
  - **Graphics-quality scaffold** (§3.5): render scale + adaptive resolution, draw-distance cull,
    shadow-quality, AA toggle, Low/Med/High presets, FPS readout — in the existing `Settings`.
  - Verify arena + steppe are behavior-unchanged (flat profile → same `y=0` floor).
- **Phase 2 — The game lives on terrain**
  - `seatOnTerrain` / `terrainBox`; rebuild the demo sandbox with test props + enemy spawns on terrain.
  - Horde slope-limit. 2-tab co-op determinism check.
- **Phase 3 — Scale (decided then, not now)**
  - Distance LOD + skirt seams; raise chunk count / map extent; height-aware boss pathing.
  - Decide final map size with the engine in hand.

## 7. Risks & open questions

- **R1 — Ground-Y audit reach.** ~20–30 call sites; missing one = an entity floating or falling through.
  Mitigation: funnel everything through `world.groundY`, grep for `\.y\s*<=\s*0` / `y: 0` / `groundY`.
- **R2 — Chunk seams / normals at borders.** Central-difference normals differ across chunk edges →
  visible lighting seam. Mitigation: sample normals from the *continuous* heightfield (not per-mesh),
  and skirts for LOD cracks.
- **R3 — Perf budget.** The game already runs particles + enemies. Need a per-frame cost ceiling for
  `chunks.update`. Mitigation: cull aggressively; cap visible chunks; LOD in Phase 3.
- **Q1 — Final map size?** Deliberately deferred to Phase 3.
- **Q2 — Do arena/steppe ever get real elevation,** or stay flat forever? Out of scope here; the unified
  path makes it a later content toggle, not an engine change.
- **Q3 — Chunk size 64 m vs 32 m vs 128 m?** Start 64 m; tune against R3 once the skeleton renders.

## 8. Success criteria

1. `demo` renders **chunked** terrain with frustum culling; raising extent adds chunks, no rewrite.
2. Player walks hills: gravity onto surface, slope-limited, ground-follows — via the **single** path.
3. **Arena & steppe behave exactly as before** (flat profile, same `y=0` feel).
4. Enemies + a few props **seated on terrain** in the demo; hordes don't climb cliffs.
5. 2-tab co-op on demo: identical terrain, no slope desync.
6. No build step introduced; cache-bust ritual (`?v=`/`GAME_BUILD`) respected on any ship.
7. Graphics-quality presets work: render scale (+ adaptive) visibly trades sharpness for FPS **without
   dropping textures**; draw-distance + shadow knobs move FPS; settings persist; quality stays local
   (un-synced) in co-op.

## 9. Files touched (orientation, not a plan)

- **Keep/extend:** `src/terrain.js` (profiles).
- **Replace/fold:** `src/terrain-mesh.js` → consumed by new chunk builder.
- **New:** `src/terrain-chunks.js` (chunk manager), `src/terrain-place.js` (seat API), optionally
  `src/sandbox.js` (demo content). Graphics-quality may warrant `src/graphics.js` (quality presets /
  adaptive-resolution controller) if it doesn't fit cleanly in `engine.js`.
- **Edit:** `src/world.js` (unify collision, retire `hasTerrain`, demo build), `src/player.js`
  (gravity/step-up via unified path), `src/enemies.js` (slope-limit), `src/game.js` (map routing/menu),
  `src/engine.js` (render scale + adaptive DPR, shadow/AA knobs), `src/ui.js` (Settings: graphics-quality
  block + FPS readout), ground-Y consumers across the codebase.
- **Defer:** `src/pathing.js` (height-aware A\*, Phase 3).
