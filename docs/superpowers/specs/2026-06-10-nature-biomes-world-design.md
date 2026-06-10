# Nature, Biomes & Terrain-Ready World — Design Spec

**Date:** 2026-06-10 · **Branch:** `feat/nature-props` · **Status:** design approved, autonomous asset+plan run launched

## Vision

Turn the 1000×1000 steppe open-world into a believable **Ukrainian/Russian regional
landscape** — two faces of the same land: **war-torn** (water-filled craters, burnt &
blown-down forests, shattered shelterbelts) and **untouched nature** (flower meadows,
clear streams & rivers, dense forest interiors, reed marshes). Mini-biomes that read like
Minecraft variety but **grade into each other logically — no visual shock at a seam**.

Forward-looking constraint (the owner's explicit ask): **the engine will later gain real
elevation — hills, mountains, LOD — not just a flat plane.** Everything here is designed
**terrain-aware from day one** so placement is done ONCE, on the real terrain, not redone.

## Reference set (owner-supplied)

War: crater + water + red earth + broken treeline; aerial fields pocked with craters +
shelterbelt + dirt road; blow-down pine forest; burnt hillside forest; misty cut bor with
stumps. Nature: Carpathian rhododendron alpine meadow + boulders + ridges; mossy-boulder
forest stream + ferns; park pond + rock grotto; reed marsh shore; river bend with bor +
green banks.

## Architecture decision — what depends on the engine, what doesn't

| Layer | Engine-dependent? | Built when |
|---|---|---|
| **Nature MODELS** (trees, rocks, logs, stumps, bushes, grass, reeds, flowers, debris) | **No** — reusable on flat or mountainous terrain | **Now (autonomous run)** |
| **Procedural generators** (trunk/leaf, seeded variants) | No (isolated module, not wired in) | Now (autonomous run) |
| **World / biome PLAN** (biome map, transitions, placement contract, terrain blueprint) | No (a document) | Now (autonomous run) |
| **Terrain ENGINE** (heightfield, height-sampling, slope collision, LOD, pathing) | **Yes — high blast radius, no test harness** | **Interactive, with owner (morning)** |
| **Final placement** (scatter onto real terrain, biome-driven) | Yes (needs terrain) | Interactive (after engine) |

**Why this split:** full terrain + mountains + LOD touches `World`, `Player` (ground
height / step-up on slopes), collision (the AABB `boxes` + SpatialGrid assume flat ground +
box colliders), enemy pathing (steering assumes flat), and rendering. There is **no
automated gameplay test suite**, so building it blind risks a non-booting game. Models and
the plan are objectively verifiable and additive → safe to produce unattended; the engine
is not → human-in-loop.

## Quality bar

- **Variety, not copy-paste.** One tree species = 2–3 silhouettes; randomized trunk lean /
  twist + leaf-cluster distribution via a **seeded generator**. A copy-pasted tree is a fail.
- **Layered voxel shading** per the modelgen / voxel skills (5-tone bark / foliage / granite
  / dry-grass palettes — added to `palette.js`).
- **Provenance-grounded** even for organics: species heights / trunk diameters / boulder
  sizes / reed heights sourced into dossiers (metres). Trees > 8 m carry an explicit
  `spec.maxDim`.
- **No props inside buildings / on roads / in POIs / at spawn** — keep-out is a first-class
  rule in the placement contract, not an afterthought.

## Biome palette (target)

`steppe-grass` · `forest-steppe` (shelterbelt лесополоса) · `dense-bor` (pine forest
interior, hard to see through) · `riparian` (river/stream banks, willows, reeds) ·
`marsh` (reed + open water + bog) · `alpine-meadow` (flowers + boulders + scrub — needs
elevation) · **war overlay** (craters, burnt patches, blow-down) applied across any biome.
Transitions graded through **ecotones** (e.g. steppe → scattered scrub → forest-steppe →
forest) so seams never read as a hard cut.

## Terrain-aware placement contract (what the future engine must expose)

- `terrainHeightAt(x, z) → y` (props sit on sampled ground; no floaters / no buried bases).
- `terrainNormalAt(x, z)` (align trunks/rocks to slope; flowers/grass follow ground).
- Water surfaces at basin elevations (streams downhill; craters/marsh in depressions).
- Biome lookup `biomeAt(x, z)` driven by **elevation + moisture** fields → drives which
  asset set scatters where, with density falloff across ecotones.
- Keep-out mask from `world.boxes` + road strips + POI footprints + player spawn radius.

## Autonomous run — phases (multi-agent workflow, ~98% session, self-managed model tiers)

1. **Research** (parallel, Opus/Fable): regional biome ecology, species + sourced dims,
   war-damage morphology, ecotone/transition rules.
2. **Architecture + generator design** (Opus/Fable): per-asset-class decision
   *spec vs generator*; design + write the isolated seeded trunk/leaf generator module.
3. **Build library** (pipeline, Sonnet churn): spec-based props → dossier + spec →
   `lint` + `node --test` hard gate; generator-based organics → code + per-species configs
   (NOT wired into the game; flagged "needs visual review").
4. **World / biome PLAN** (Opus/Fable): the full placement plan + terrain-engine blueprint
   document that morning's interactive work consumes.

**Commits:** orchestrator commits in logical chunks AFTER the run (parallel git = index
contention). Nothing wired into the running game. Owner reviews models + generator output
visually, then we build the terrain engine + final placement together.

## Out of scope for the autonomous run

Terrain engine, LOD, slope collision, pathing changes, final in-world placement, wiring
generators into `game.js`. All interactive, post-siesta.
