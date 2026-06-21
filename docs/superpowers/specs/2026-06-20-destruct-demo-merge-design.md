# Destruction R&D demo → live game — integration design

**Date:** 2026-06-20
**Branch:** `feat/destruct-demo-merge` (cut off `feat/dream-engine-demo`)
**Status:** in progress (review branch — not for `main` until inspected)

## Goal

Bring the destruction R&D demo (the *source of truth*) into the **real game**, folding its
improvements into the game's **existing** destruction modules rather than dropping a second
parallel engine into `src/`. The demo lives on branch `feat/forest-destruct-physics`
(PR #101): `src/props/destruct-lab/{matrix,building-destruct,debris,fallphys,geom,combat}.js`
+ `tools/modelgen/forest-destruct-demo.html`. Those files stay there as the R&D reference and
are **never imported** by the running game.

## Why this is a MERGE, not a port

The game already shipped a destruction system (consolidated from an earlier `tools/destructlab/`):
`src/destruct.js` (pure core — `MATERIALS`, `resolveHit/Blast/Penetration` with the refined APFSDS
model, `FallingBody`, `DestructRuntime`), `src/destruct-debris.js`, `src/demobuilding.js`
(destructible building — breach/panes/lazy-split), `src/crate.js`, `src/forest.js`, with node tests
in `tests/destruct/`. The demo is a *later, divergent* iteration of the same lab. So every change
below **extends a file that already exists** and keeps the game's tested API + co-op netcode.

## Decisions (locked with the owner via popups, 2026-06-20)

- **Base branch:** `feat/dream-engine-demo` — the destruction showcase (`?map=demo` walkable slice,
  the destructible building, the climbing horde with vertical locomotion) lives on that stack, so it
  is the only place the headline features can be built *and* verified. Reaches `main` after that
  stack lands (per the existing stack-rebase plan).
- **Scope:** everything in one review branch, including the voxel building model + collapse.
- **Building model:** **extend `demobuilding.js` in place** — fold the demo's voxel dicing + collapse
  INTO it, keeping its `world.boxes`/`world.grid` collision, `bdestroy` MP sync, and map placement.
- **NPC actors:** the game's own `enemies.js` NPCs. The demo's `combat.js` "soldiers" are **dropped
  entirely** — never copied into `src/`.
- **FPS mechanics:** port the engine-level survivors onto game enemies — **#1** pierce-march
  (bullets through soft cover into enemy bodies), **#3** breach-opens-LoS (free via mesh rebuild),
  **#6** structural collapse, **and #5** environmental crush-kills. Defer the AI-coupled **#2**
  cover-seek and **#4** smoke-blocks-LoS to a later enemy-AI branch.
- **Vehicle crush:** port `applyCrush` as a **dormant, tested capability** (no driver wiring — tanks
  and cars are on other branches); breach dust reuses the existing `effects.js` pool.
- **Co-op authority:** falling rubble is **visual-only**, spawned deterministically from the already
  synced `bdestroy`/destroy event — no new netcode. The **crush-KILL decision (#5)** runs
  host-authoritatively inside `EnemyManager` (enemy damage is already host-only), against hazard AABBs
  derived host-side from the destruction event — so no per-faller transforms need syncing.

## Staged plan (each stage = its own commit(s), verified before the next)

- **A — materials + directional debris.** `destruct.js`: add `reinforcedConcrete` (tier 6) +
  `he152` data rows (the game's existing tier rules give the indestructible-bunker behaviour for
  free). `destruct-debris.js`: extend `burst(kind,at,seed,floorY,opts={count,dir})` with the demo's
  directional bias + count cap (no-dir path keeps the exact legacy RNG draw order). Additive tests.
- **B — fall physics + dust + rebar.** `destruct.js` `makeTumble({…,g,spin})` (optional, old
  defaults). Breach dust via `effects.js`. Rebar stubs on concrete death in `demobuilding.js`.
- **C — unified pierce-march #1 + enemy hooks (#5).** `weapons.js` hitscan becomes one
  distance-sorted march: soft cover penetrated with energy falloff, hard surfaces + **enemy bodies**
  stop it. `enemies.js` exposes a body AABB + a host-side hazard/crush-kill check (#5). #3 stays free.
- **D — voxel building model + collapse #6.** `demobuilding.js`: opt-in lazy voxel dicing
  (`CELL=0.45`, bucket rebuild, `INF=0.006` ray-slip fix) rendered with `voxelMaterial`+palette (no
  triplanar); orphan-gravity collapse + support-detach + fallers (Stage B physics), visual-only from
  the synced event. Heavy perf gating (touched-bucket rebuild, faller cap, headless no-lag check).
- **E — dormant vehicle-crush.** Replace the inert `applyCrush` stub in `destruct.js`/`demobuilding.js`
  with the real tier-gated impl (`{blocked,drag,crushed}`). No driver wiring; demo `VEHICLES`/
  `driveVehicle` are NOT ported.

## Verification

`node --test tests/destruct/*.test.mjs` after every stage (additive cases only — keep the existing
grass/stone/fuel/sound coverage), plus isolated headless Chrome on `?map=demo` (no-store server) and
a perf/no-lag sanity check (`F3` stat overlay / draw calls) for the building/collapse stages.

## Status — as built (2026-06-20)

Built + verified on `feat/destruct-demo-merge` (node `tests/destruct/*` 43 → 64 green;
isolated headless Chrome on `?map=demo`, 0 console errors). Stages were reordered
**A → B → D → C → E** because the pierce-march (#1) needs per-cell material metadata and
the crush-kills (#5) need the collapse fallers — so the building model (D) landed before C.

- **A** — `reinforcedConcrete` (tier 6) + `he152` data; directional `burst()` (`opts={count,dir}`).
- **B** — `makeTumble` `g`/`spin` (+ `floorY`, so rubble rests on a raised base).
- **D1** — brick walls diced into ~0.5 m cells (16 → 124 parts; draw calls flat, one merged mesh).
  *(The demo's INF=0.006 ray-slip fix is NOT needed: the game hit-tests AABB boxes, not the mesh.)*
- **D2** — pure `orphanedCells()` support flood + slow tumbling fallers (one InstancedMesh, cap 64).
- **C** — pierce-march `_marchPellet` (#1: through glass/wood/foliage into the body behind; brick stops
  it); `EnemyManager.crushZone()` (#5: cave-in / tank / tree buries non-boss mobs, host-auth).
- **E** — dormant `resolveCrush` + `DemoBuilding.applyCrush` (tank crushTier 4 ⊃ brick ⊅ железобетон;
  car crushTier 1 ⊅ brick). No driver wiring.
- **D3** — masonry dust puffs on every breach via `effects.js` (no second particle system).

### Deferred (noted, not built)
- **Roof/pier full-building collapse** — the per-wall cave-in delivers visible collapse; making the
  corner piers destructible + tying the roof to support (so "knock the supports → the slab caves") is
  a riskier follow-up (touches the nav stairs + the "roof always supported" assumption).
- **Rebar** — needs *destructible* concrete to spawn from; the building's concrete is all static. Pairs
  with the destructible-pier work above.
- **Tree-fall + tank-overrun crush wiring** — `crushZone()` is reusable; only the building wires it now.
- **FPS #2 (cover-seek) and #4 (smoke-blocks-LoS)** — AI features for a dedicated enemy-AI branch.
- **Live vehicle wiring** — waits on the tank/car branches; `applyCrush` is ready for them.

## Out of scope (deferred)

FPS mechanics #2 (cover-seek) and #4 (smoke-blocks-LoS); live vehicle wiring; porting `combat.js`;
the `main` merge itself (gated on the dream-engine stack landing first).
