# Vertical-slice nav/AI testbed on `?map=demo` — design

**Date:** 2026-06-19
**Status:** approved (owner: "jo sedí")
**Context:** Step 2 of the agreed engine plan (perf de-risk → real-map slice → tune AI). The horde-nav
anti-stutter pass (`perf/horde-anti-stutter-3`) made nav rebuilds map-size-independent. The deferred
"stupid mob" behaviours — **E** (horde must route UP stairs/ladders to an elevated player), **F/G/H**
(8-dir flow jitter / flow↔beeline flicker / stuck-buster wedging at walls) — were intentionally held
back to be tuned against REAL geometry, not the placeholder arena. This slice builds that geometry.

## Goal

Turn `?map=demo` (which already has chunk terrain + a single-storey demo building) into a compact
testbed that exercises every deferred nav behaviour at once, so the AI tuning that follows has a stable,
representative environment.

## What exists already (do not rebuild)

- `?map=demo` (`world.js _buildDemo`, HALF=158): walkable chunk terrain (hills + LOD), a spawn ring at
  r≈28, loot spots. Real `terrain.terrainHeightAt` / `slopeLimit`.
- `demobuilding.js` (`installDemoBuilding`): 4 walls with one **door** (a choke), corner piers, an
  interior **floor** slab, a **roof** slab (~3.4 m up), plinth/skirt. The roof is currently NOT reachable
  by any registered nav link → it is a graph island (the literal precondition of bug E).

## Additions (geometry only — NO nav-algorithm changes)

1. **External staircase to the roof** — a flight of steppable steps (rise ≤ `STEP_UP`) up one outside
   face from the terrain to the roof slab, built with `world._stairs(...)` so it auto-registers a
   foot→top entry in `world._navLinks`. Exercises **E** via stairs + the windowed surface nav.
2. **Ladder, second route up** — a `world._ladders` zone (terrain→roof) on a different face. Exercises
   the ladder-climb path and gives the horde a route CHOICE between two ways up.
3. **Door choke + walls** — already present; exercises **F/G/H** (route through the door / around the
   walls; jitter at corners; stuck-buster behaviour).
4. **Terrain cliff** — ensure one hill face beside the building is steeper than `terrain.slopeLimit`
   (use an existing steep face if present, else sculpt one in `_buildDemo`) so the horde must route
   AROUND it rather than scale it. Exercises the slope-limit backstop + 2D flow routing.

**Out of scope (YAGNI):** a mezzanine / 2nd interior floor. Terrain + roof + stairs + ladder already give
a 2-level surface graph with links; deeper multi-level is already covered by airfield/bunker. Add later
only if the tuning needs a 3rd surface.

## Files

- `src/demobuilding.js` — add the staircase (`world._stairs`), the ladder zone (`world._ladders`), and
  wire them so the links register. (Match the existing `_static`/builder conventions in that file.)
- `src/world.js` `_buildDemo` — only if a steep-enough cliff face must be sculpted near the building.

No changes to `flowfield.js` / `navgraph.js` / `pathing.js` / the `enemies.js` steering — the slice is
pure content; the algorithms it tests are already in place.

## Verification = the tuning loop

Headless Chrome (no-store server + isolated Chrome, the standard recipe): load `?map=demo`, put the
player on the roof, spawn a ground horde, and confirm:
- (E) mobs route to the stair foot / ladder and CLIMB to the roof (y rises to the roof height, reach the
  player) — both routes used.
- (F/G/H) mobs route through the door / around the walls without visible jitter or wall-wedging.
- (slope) mobs route AROUND the steep face, not up it.

This same harness is then reused to tune E/F/G/H. Acceptance for THIS slice: the geometry is in place,
links register, and the horde demonstrably reaches an elevated player via both routes with no console
errors. (The behavioural *quality* tuning of F/G/H is the next, separate piece of work.)
