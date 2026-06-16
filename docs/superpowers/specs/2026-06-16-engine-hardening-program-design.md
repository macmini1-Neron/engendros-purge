# Engine Hardening Program — Design

- **Date:** 2026-06-16
- **Status:** design / spec (pre-plan) — approved-in-brainstorm (structure + ordering + shadow-progression + fixed-timestep-last + enemy-into-buildings nav)
- **Owner intent:** before scaling the map (terrain Phase 3b), make the engine *ready* — close the best-practice gaps a bigger world will expose. Build it **gradually, one mechanic per PR**, and explain each mechanic in plain terms so both brothers learn what we're adding and why.
- **Relation to other work:** sits **on top of the terrain engine** ([[engendros-terrain-engine]] — chunked terrain + LOD, PRs #74→#75→#78→#81). This program is the "is the engine ready?" answer that precedes Phase 3b map up-scaling. Serves the survival-horror pivot ([[engendros-white-paper-vision]]).

## 0. Where this sits — current engine state (2026-06-16 code audit)

Verified against the live code (worktree `feat/terrain-lod`):

**What the engine already does well — keep:**
- **Render:** ACES tone-mapping; **render-scale (×DPR) + adaptive resolution** (auto-targets 16.7 ms / 60 fps, clamps 0.5–1.0); AA toggle; shadow-quality knob. (`engine.js`)
- **Terrain:** chunked mesh + explicit per-chunk frustum culling + **distance LOD with skirts** (just shipped, Phase 3a) + draw-distance cull.
- **Collision:** unified heightfield + AABB; `SpatialGrid` broad-phase (`grid.js`, 16 m cells, **no-alloc** stamped queries).
- **Perf primitives:** object pooling (enemies, the 800-particle pool), `InstancedMesh` for the high-count stuff (particles, forest groundcover, debris, fire).
- **Determinism:** seeded terrain + gameplay RNG split → co-op safe.

**The gaps a bigger map will expose (this program closes them):**
1. **No render stats** beyond a smoothed FPS — we'd scale the map *blind*. (`game.js` F3 shows only `_fps`.)
2. **Single 2048² directional shadow** with a **fixed ortho frustum** — cannot be both crisp-near and wide-coverage on a large map; no CSM. (`engine.js:59-67`)
3. **No mesh/prop LOD** (`THREE.LOD` appears nowhere) and **district props aren't instanced** — distant props pay full vertex + draw-call cost.
4. **Pure variable timestep** — `dt` clamped to 50 ms but physics is frame-rate-dependent (tunneling risk at low FPS, feel drift 30↔144 Hz, weaker co-op determinism). (`game.js:_frame`)
5. **Navigation is a stub:** `pathing.js` is a **boss-only**, **arena-only**, 2-D occupancy-grid A* at **CELL=2.5 m**. At that resolution a 1–2 m **doorway is swallowed by the inflated wall block** → nothing can path *into* a building. The horde doesn't path at all (pure steering). Terrain slope is ignored by the grid.

## 1. Scope

**In — five independent mechanics, each its own plan + PR:**
1. **Render stat overlay** — draw-calls / triangles / visible-chunks / frame-ms in the F3 panel.
2. **Shadows that scale** — (a) player-following shadow frustum, then (b) cascaded shadow maps (CSM).
3. **Mesh/prop LOD + re-instancing** — distance LOD for props/models; instance repeated district props.
4. **Fixed-timestep simulation** — fixed physics tick + render interpolation (last, most invasive).
5. **Navigation overhaul** — slope-aware terrain nav **+ enemies that path into buildings** (doorways/interiors), generalized from boss-only to the horde; multi-level as a flagged stretch.
6. **Tactical AI** *(gameplay layer, not engine plumbing — gets its own spec)* — smart movement *decisions* on top of navigation: flank, use cover, ambush, coordinate. Named + sequenced here as the capstone; **full design deferred to a separate gameplay/AI spec** when we reach it.

**Out (non-goals — YAGNI):**
- **Streaming / load-unload** — bounded resident maps only (revisit beyond ~1 km).
- **ECS rewrite** — the OOP class-per-subsystem layout stays; a data-oriented rewrite is not worth it at our scale.
- **Occlusion culling** — low ROI in WebGL for this scene; frustum + draw-distance is enough.
- **Custom terrain shader / texture splatting** — keep the voxel `MeshLambertMaterial` vertex-colored look.
- **WebGPU migration** — stays WebGL r160 (documented ceiling-raise, not now).
- **Navmesh authoring tools** — navigation stays grid-derived from existing colliders (no hand-authored navmeshes).

## 2. Design principles

- **One mechanic, one PR.** Each section below ships independently and leaves the game playable. No big-bang.
- **Data-driven order.** Stats first, so every later "did this help?" is a measured number, not a vibe.
- **Preserve identity.** Voxel/horror look + procedural-everything + co-op determinism are non-negotiable; every change is gated to stay local-cosmetic or deterministic (see §4).
- **Teach while building.** Each PR description and commit explains the mechanic in plain terms (the brothers are learning the engine).
- **Cheap before risky.** Visual/measurement wins precede the invasive fixed-timestep rework.

## 3. The mechanics

### 3.1 Render stat overlay — *the engine's dashboard*

**Plain terms:** today F3 shows only FPS. A frame's real cost is **draw-calls** (how many times we tell the GPU "draw this" — each one has overhead) and **triangles**. We add those, plus visible-chunk count and frame-ms, so when we make the map bigger we can *see* what got expensive.

**Approach:** Three.js already tracks this in `renderer.info.render` (`calls`, `triangles`) — zero new bookkeeping, just read it after `render()`. Surface in the existing F3 block (`game.js` + `ui.js`): `FPS · ms · draws · tris · chunks`. Reset-per-frame semantics are automatic. Optional: a tiny rolling min/avg/max on frame-ms.

**Scope:** read-only diagnostics; no gameplay effect. **Risk:** ~none. **Order:** §5 step 1 (first).

### 3.2 Shadows that scale — *one sun, but coverage that follows you*

**Plain terms:** the sun casts shadows by rendering the scene from the sun's POV into one **shadow texture (2048²)**, then projecting it. That texture covers a **fixed box** in the world. On a small arena, fine. On a big map one texture can't be both sharp up-close and cover everything — its pixels get spread too thin. Two fixes, shipped in order:
- **(a) Player-following frustum:** move the sun's shadow box to **stay centered on the player** every frame. You always have crisp shadows around you; the far map (hidden in fog anyway) simply has none. Cheap, immediate.
- **(b) CSM (cascaded shadow maps):** split the view distance into bands (near/mid/far) and give **each its own shadow texture** — near band high-res, far band low-res. Standard big-world technique; looks right at every distance.

**Approach:** (a) per-frame update of `sun.shadow.camera` position + `sun.target` to track `player.pos`, re-`updateProjectionMatrix`; keep the existing `setShadowQuality` size knob. (b) implement cascades — evaluate `three/examples` CSM vs a hand-rolled 2–3-cascade split (we avoid heavy addons; a manual cascade fits "no build step"). Both honor the Low/Med/High preset (CSM cascade count / resolution scales with preset; Low can fall back to (a) or shadows-off).

**Scope:** local cosmetic only (never synced). **Risk:** (a) low; (b) medium (cascade seams, peter-panning, shadow-acne re-tuning of `bias`/`normalBias`). **Order:** §5 step 2 (2a) and step 4 (2b).

### 3.3 Mesh/prop LOD + re-instancing — *spend GPU where the player is looking*

**Plain terms:** the terrain already swaps to coarser meshes far away. Buildings, trees, and props don't — a distant barn is drawn with every plank. Two tools: **LOD** (swap a far object for a simpler mesh, or hide tiny detail) and **instancing** (100 identical crates drawn in **one** GPU call instead of 100). Together they keep the draw-call/triangle budget flat as the map fills up.

**Approach:**
- **Prop LOD:** a lightweight distance-swap (our own, or `THREE.LOD`) for the expensive builders (buildings, the bigger props). Tier 0 = full, Tier 1 = merged/simplified, Tier 2 = hidden (beyond draw-distance, already culled). Reuse the `MeshBuilder` to bake a cheap variant, or just toggle child detail by distance.
- **Re-instancing:** convert *repeated* district props (fences, lamp posts, identical crates) to `InstancedMesh` — the pattern already exists for particles/forest. Decide per-builder (`industrial.js`, `airfield.js`, `strongpoint.js`, `openworld.js`).

**Scope:** visual + perf; deterministic (no RNG change). **Risk:** medium (instanced shadows/culling correctness; per-builder churn). **Order:** §5 step 3.

### 3.4 Fixed-timestep simulation — *physics that doesn't care about your frame-rate*

**Plain terms:** right now we advance the game by "however long the last frame took." So at a stutter, a fast object can **skip through** a wall, and the game *feels* different at 30 vs 144 FPS. The textbook fix ("Fix Your Timestep"): run the **simulation in fixed steps** (e.g. 60×/second) regardless of render rate — if a frame was long, run several sim steps; if short, maybe none — and **interpolate** the visuals between the last two sim states so motion stays smooth. Bonus: identical step size on host and client tightens **co-op determinism**.

**Approach:** an **accumulator** in `game.js:_frame`: add real `dt` to an accumulator, run `while (acc >= STEP) { _updatePlaying(STEP); acc -= STEP; }` with a max-steps spiral-of-death guard, then render with `alpha = acc/STEP` for interpolation. Subsystems keep their `update(dt)` signature but are now always called with the **fixed** `STEP`. Camera/viewmodel and remote-player ghosts get render-time interpolation so smoothness survives. Co-op `mp.js` snapshot cadence is decoupled from the sim tick (already time-based).

**Scope:** touches **every** `update(dt)` path — the highest-blast-radius change. **Risk:** high (input timing, animation, co-op snapshot interplay, the `Player.update-runs-every-frame-when-mounted` rule). Mitigate: land it **last**, behind heavy in-browser playtesting, with a feature flag to A/B against the current variable loop. **Order:** §5 step 5 (last of the perf/robustness set).

### 3.5 Navigation overhaul — *AI that walks slopes and goes through doors*

**Plain terms:** the boss currently finds its way around the **flat arena** using a grid where each cell is either "blocked" or "free." Two problems for our future map: (1) the grid ignores **terrain height**, so steep cliffs aren't obstacles to it; (2) its cells are **2.5 m** — bigger than a **doorway**, so a door gets rounded off into a solid wall and **nothing can walk inside a building**. And only the boss uses it — the horde just walks straight at you. The overhaul, in tiers:

- **Tier A — slope-aware terrain nav.** When building the grid, sample `terrainSlopeAt` per cell; cells steeper than the walk limit become **blocked / high-cost**, so paths go *around* cliffs and *up* gentle ramps. (This is the original Phase-3c "height-aware boss A*", folded in.)
- **Tier B — building entry (the owner's ask).** Resolve **doorways** so enemies can path indoors:
  - **Finer occupancy** near structures — either a globally finer `CELL` (cost: memory/CPU) or **local high-res nav patches** around buildings so a 1–2 m door survives as passable cells. Doorways are *gaps* in the wall colliders, so a fine-enough grid already sees them — the work is choosing resolution + confirming interiors are **floored and reachable** (no stray collider sealing the inside).
  - **Generalize beyond the boss:** make navigation available to the **horde**, not just Tolo. Because per-enemy A* for a whole wave is too costly, use a **hybrid**: cheap steering on open ground (as today) + a **shared/coarse path or flow-field** toward the objective that *all* enemies sample, with A* only invoked to resolve around/through structures near them. Keeps cost bounded while letting the swarm pour through doors.
- **Tier C — multi-level (stretch, flagged).** Buildings like the **3-level bunker** (`bunker.js`, ladders/stairs) break a single 2-D grid. Model each floor as its own grid linked by **portal edges** at ladders/stairs; traverse between grids along those links. **Out of the first nav PR** — designed-for, not built yet.

**Approach:** generalize `pathing.js` (`buildNavGrid`/`findPath`) from arena-only/boss-only to **per-map, terrain-and-structure aware**, driven off `world.boxes` + `terrain`. Keep it deterministic (grid derived from static geometry + seed) so co-op stays in sync. The flow-field/shared-path layer is new and must be host-authoritative (enemies are host-sim).

**Scope:** AI behavior + perf; must stay deterministic and host-authoritative. **Risk:** medium-high (resolution vs cost trade, horde path cost, co-op authority). **Order:** §5 step 6 — Tier A+B together (with or just after terrain Phase 3b, which creates the slopes/structures that make it matter); Tier C later.

### 3.6 Tactical AI — *smart decisions on top of movement* (gameplay layer — its own spec)

**Plain terms:** navigation (3.5) lets enemies *get* anywhere; tactical AI makes them *choose* well. Instead of every enemy beelining: some **flank** to hit from the side/back, some break line-of-sight behind **cover** and close in bounds, some **lurk / ambush** in buildings and around corners, and the wave **coordinates** (push + flank + cut off retreat) — reacting to player position, line-of-sight, and noise.

**Why it's separate from the engine (the owner's instinct, confirmed):** this is gameplay/design logic, not engine plumbing. It *consumes* the navigation substrate (3.5) and the existing enemy steering; it does **not** change how the world renders or simulates. It lives in `enemies.js` behavior (+ maybe a small `src/ai-tactics.js`), not the engine modules. **It therefore gets its OWN design spec (a gameplay/AI pass) when we reach it** — this entry only names, sequences, and bounds it.

**Constraints to carry forward:** host-authoritative (enemies are host-sim — no double-run on clients, no new envelope data); must serve **horror pacing** (`docs/design-principles.md` + the survival-horror pivot) — "smart" = stalking / surrounding / tension, not merely "harder"; difficulty stays fair-brutal and readable.

**Scope:** gameplay AI on top of nav. **Depends on:** §3.5 navigation (Tier A+B). **Order:** §5 step 7 (last; full design in its own spec).

## 4. Co-op determinism & authority constraints (hold across all five)

- **Local-cosmetic-only:** stats overlay (3.1), shadows (3.2), prop-LOD (3.3) are **never synced** — pure client-side render choices, like graphics quality.
- **Deterministic:** fixed-timestep (3.4) must use the **same STEP** on host and clients and must not introduce per-client divergence; navigation grids (3.5) derive only from static geometry + seed, identical on every peer.
- **Host-authoritative:** all AI/pathing (3.5) runs under `hostSim = !mp.active || mp.isHost`; the flow-field/shared path is computed by the host and reflected via the existing enemy snapshots (`esnap`) — **no new per-enemy path data in the network envelope** beyond positions already sent.

## 5. Phasing & order (gradual)

1. **Stat overlay** (3.1) — cheap, unblocks data-driven decisions.
2. **Shadows 2a** — player-following frustum (quick visual win).
3. **Prop LOD + re-instancing** (3.3) — draw-call budget before adding cascades.
4. **Shadows 2b** — CSM (the proper version).
5. **Fixed-timestep** (3.4) — most invasive, do when everything else is stable.
6. **Navigation overhaul** (3.5, Tier A+B) — with/after terrain Phase 3b; Tier C (multi-level) later.
7. **Tactical AI** (3.6) — gameplay capstone on top of navigation; **full design in its own gameplay/AI spec** before any code.

Each step is a **separate plan + PR**, reviewed and merged before the next starts. The list is re-orderable, but stats stay first and fixed-timestep stays before nav only if nav doesn't block on it (it doesn't).

## 6. Risks

- **R1 — Fixed-timestep blast radius.** Every subsystem's `update` changes meaning. Mitigation: feature-flag + A/B, land last, heavy playtest.
- **R2 — CSM tuning.** Cascade seams / acne / peter-panning. Mitigation: ship player-following frustum first (covers most of the value), tune CSM bias per cascade.
- **R3 — Horde path cost.** Per-enemy A* doesn't scale to a wave. Mitigation: flow-field / shared-path hybrid; A* only locally near structures.
- **R4 — Doorway resolution vs memory.** A globally fine nav grid is expensive on a big map. Mitigation: local high-res patches around structures, coarse grid elsewhere.
- **R5 — Co-op authority creep.** New AI must not double-run on clients. Mitigation: `hostSim` gate, no new envelope fields.

## 7. Success criteria

1. F3 shows draws/tris/visible-chunks/ms; numbers visibly move when quality knobs change.
2. On a large map, shadows stay crisp around the player at every view distance (CSM) — no "shadows only in a fixed box".
3. Draw-calls/triangles stay roughly flat as prop count rises (LOD + instancing working), measured via 3.1.
4. Sim behaves identically at 30 / 60 / 144 FPS; no wall-tunneling at low FPS; co-op shows no new desync. Smooth motion (interpolation).
5. Enemies **path up gentle slopes, around cliffs, and through doorways into building interiors**; a wave can flood a structure. Boss + horde both navigate. Co-op: identical paths, host-authoritative.
6. No build step introduced; cache-bust ritual respected; each mechanic shipped as its own reviewed PR.

## 8. Files touched (orientation, not a plan)

- **3.1 stats:** `engine.js` (expose `renderer.info`), `game.js` (F3 readout), `ui.js`/`index.html` (F3 markup).
- **3.2 shadows:** `engine.js` (shadow camera follow + CSM), `world.js`/`tuning.js` (preset wiring).
- **3.3 LOD/instancing:** new small `src/lod.js` or `engine.js` helper; district builders (`industrial.js`, `airfield.js`, `strongpoint.js`, `openworld.js`, `props.js`).
- **3.4 fixed-timestep:** `game.js` (`_frame` accumulator + interpolation), light touches across subsystems' `update`, `mp.js` (snapshot decoupling), `engine.js` (render-alpha).
- **3.5 navigation:** `pathing.js` (generalize: terrain+structure aware, per-map), `enemies.js` (horde nav hybrid / flow-field), `bunker.js` (portal links — Tier C), terrain hooks.
- **3.6 tactical AI:** gameplay-side — `enemies.js` (behaviors) + possibly a new `src/ai-tactics.js`; **separate gameplay/AI spec, not this engine program.**

## 9. Open questions

- **Q1 — CSM implementation:** three.js example CSM (heavier, proven) vs a hand-rolled 2–3 cascade split (lighter, our style)? Decide at 2b plan time.
- **Q2 — Nav resolution strategy:** one finer global `CELL` vs local high-res patches around structures? Decide at 3.5 plan time against measured cost (using 3.1).
- **Q3 — Fixed STEP rate:** 50 Hz vs 60 Hz sim tick? Pick at 3.4 plan time (trade CPU vs precision).
- **Q4 — Horde nav breadth:** every enemy navigates, or only when near a structure (open-ground stays pure steering)? Lean: hybrid (steering + shared field), A* only near structures.
