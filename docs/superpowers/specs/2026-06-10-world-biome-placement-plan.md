# World / Biome Placement Plan — 1000×1000 Steppe Open-World

**Date:** 2026-06-10 · **Branch:** `feat/nature-props` · **Status:** plan (terrain-aware, pre-engine)
**Consumes:** `docs/superpowers/specs/2026-06-10-nature-biomes-world-design.md` (design) ·
`docs/2026-06-10-nature-research-biomes.md` + `-trees.md` (sourced field reference) ·
`src/openworld.js` + `src/world.js` `_buildSteppe()` (existing roads / POIs / district anchors).

This is the **terrain-ready placement plan**: a biome map of the plane, the war overlay, the
placement contract the future terrain engine must satisfy, the staged engine blueprint we build
**next, together** (not now), and the asset→biome scatter table. Everything is anchored to the
**existing** districts, roads and POIs so placement is done **once**, on the real terrain.

---

## 0. The board — what is already on the plane (authoritative coordinates)

World space: `+X` = east, `+Z` = north, `+Y` = up, 1 unit ≈ 1 m. The plane is **1000×1000**,
`world.HALF = 500`, so all coordinates live in `x,z ∈ [−500, +500]`. Player **spawns at the
centre `(0,0)`**; the engine spawn ring for enemies is at radius ≈ 488. The map is fringed by an
impassable voxel **mountain border** (height `MH = 26`) at the four edges. Fog far = 900.

### Districts (keep-out footprints, from `world.js _buildSteppe()`)

| District | Anchor `(x,z)` | Keep-out footprint (world coords) |
|---|---|---|
| Kombinát (industrial hub) | `(0, 0)` | yard box `x∈[−84,84] z∈[−104,12]` + slag-heap circle centre `(96,18)` r22 |
| Field strongpoint (SW) | `(−330, −300)` | circle r56 |
| Airfield (N) | `(0, 250)` | box `x∈[−232,112] z∈[290,500]` (incl. its N SAM site) |
| Kolkhoz «Красный степной» (SE) | `(300, −300)` | box `x∈[254,346] z∈[−334,−246]` |
| Secret bunker «Объект 1180» (E/NE) | `(360, 150)` | berm box `x∈[340,380] z∈[127,173]` |

### Roads (flat strips, NO collider — walkable/drivable; treat as keep-out for props)

| Road | Geometry | Keep-out test |
|---|---|---|
| N–S spine | `x=150`, `z∈[−440,+215]`, w 7.5 | `|x−150|<6 ∧ z∈[−445,218]` |
| E–W south road | `z=−300`, `x∈[−287,+258]`, w 7.5 | `|z+300|<6 ∧ x∈[−290,261]` |
| Airfield approach spur | `z=210`, `x∈[10,160]`, w 6 | `|z−210|<6 ∧ x∈[8,162]` |
| Bunker approach spur | `z=150`, `x∈[142,342]`, w 6 | `|z−150|<6 ∧ x∈[140,344]` |
| Kombinát access spur | `z=−40`, `x∈[84,156]`, w 6 | `|z+40|<6 ∧ x∈[82,158]` |

### ЛЭП pole lines (thin colliders; keep trees ≥ 4 m off)

- Beside the spine: `x=155.2`, poles at `z = −430…+206` step 36.
- Along the south road: `z=−305.2`, poles at `x = −270…+250` step 38.

### Roadside POIs (keep-out circles, from `openworld.js buildOpenWorld()`)

| POI | Centre | Keep-out r |
|---|---|---|
| АЗС fuel station | `(170, 96)` | 14 |
| Bus stop | `(159, −188)` | 6 |
| КПП checkpoint | `(150, −388)` | 9 |
| Burnt convoy wreck | `(−95, −296)` | 17 (war anchor — see §2) |
| Well + windpump | `(206, −212)` | 9 |

### Spawn / loot

- **Player spawn bubble:** circle centre `(0,0)` **r40** — hard no-prop (visibility + the 25 m
  boulder-clear already in `world.js`, widened for foliage).
- Existing open loot spots: `(0,40) (90,−40) (−90,−40) (40,70) (−50,30) (318,−310) (300,−284)`.
  Keep a **r6** no-tall-prop bubble on each so pickups stay visible.

---

## 1. Biome map of the plane

Six biomes over the dry-steppe matrix. The organising idea is **moisture + (future) elevation**:
a **river** drains the high NE/E toward the low SW; **sand terrace** in the NW carries the pine
bor; **loess fields** rise into forest-steppe in the N; the dry plain is everywhere else; and the
**E/NE edge is the future massif** that will carry the alpine meadow once elevation exists.

ASCII schematic (north = up, `+Z` up, `+X` right; each cell ≈ 100 m):

```
 z=+500 ┌─────────────────────────────────────────────────────────┐
        │ BOR  BOR  ░░░  FOREST-STEPPE (loess fields + лесополоса)  │
        │ BOR  BOR  ░░[ AIRFIELD ]░░  F-STEPPE        F-STEPPE  ▲A │
 z=+250 │ BOR  ░≈≈  F-STEPPE   spur→  ░░  F-STEPPE   [BUNKER]  ▲A▲ │
        │ ░≈≈  F-STEPPE ecotone ─────────────  АЗС    F-STEPPE ▲A▲ │
 z=+120 │ ░≈≈   · · · ecotone band · · · · · · · · · · · ·     ▲A▲ │
        │  ≈≈   STEPPE      [ KOMBINÁT ]    STEPPE    STEPPE   ▲A  │
 z=0    │  ≈R≈  STEPPE        (0,0)         STEPPE    STEPPE   ▲A  │
        │  ≈R≈  STEPPE                      STEPPE   STEPPE     ░  │
 z=−120 │  ≈R≈  STEPPE                 STEPPE      well·       ░  │
        │  ≈R≈   STEPPE      STEPPE          bus·   STEPPE        │
 z=−250 │ ≈R≈  STEPPE  conv✶  STEPPE        [ KOLKHOZ ]  STEPPE   │
        │ ░≈≈ ══ford══════ south road ════════════════ КПП·      │
 z=−360 │ MARSH≈≈  [STRONGPOINT]   STEPPE      STEPPE    STEPPE   │
        │ MARSH≈≈≈                  STEPPE       STEPPE          │
 z=−500 └─────────────────────────────────────────────────────────┘
        x=−500        x=−250        x=0        x=+250       x=+500
  ≈R≈ = river  ░≈≈ = riparian gallery  ▲A = alpine (needs elevation)  ✶ = war anchor
```

### 1a. STEPPE — the matrix (default, ~45% of the plane)

The existing dry-grass ground (`0x8a9152`). Owns the **central and southern-eastern plain**:
roughly `z < +120` for `x ∈ [−120, +380]`, wrapping the kombinát, kolkhoz, the spine + south
road, and POIs. Character (research): **Stipa feather-grass + Festuca tussock sward, 0.6–0.9 m,
cover capped ~75% — open clumps with bare interspaces, NOT a closed lawn**; subordinate dull
forbs; silvery awns rippling; **long open sightlines** over flat–undulating relief. This is the
combat-readable biome — keep it open. Scatter: tussock grass + occasional forb + the existing
boulders; **no trees** except rare lone oaks near the forest-steppe ecotone.

### 1b. FOREST-STEPPE + shelterbelts (~18%)

The **northern loess band**: `z ∈ [+120, +500]` for `x ∈ [−250, +500]`, **minus** the airfield
box and the bunker berm. A mosaic ecotone, **10–70 % woody cover** (research), with oak/lime in
the wetter draws and a **rectilinear man-made grid of field shelterbelts (полезащитные
лесополосы)** over pale fields — exactly the "aerial fields + shelterbelt + dirt road" reference.

Shelterbelt grid (sourced dims): **longitudinal belts 12–15 m wide, transverse 9–12 m**, wider
belts **30–60 m** spaced **300–400 m** apart; 3–5 tree rows (birch / Lombardy + black poplar).
Lay belts **parallel/perpendicular to the existing roads** so they read as deliberate field
divisions, not random forest:

- Longitudinal belts along `x = −180, +60, +300` (running N–S, z from +130 to the airfield/N
  edge), **width 13 m**, broken where they would cross a road/POI.
- Transverse belts along `z = +160, +320`, **width 10 m**, broken at the airfield box and at
  the spurs (`z=150` bunker spur, `z=210` airfield spur).
- The airfield's own treelines (its E/W flanks) are shelterbelts too — and a **war target** (§2).

### 1c. DENSE BOR — Scots-pine forest (~12%)

The **NW sand terrace**: `x ∈ [−500, −250], z ∈ [+120, +500]`, minus the river corridor on its E
margin. Substrate-defined (research: bor↔steppe boundary is **substrate-controlled** — pine on
sand). Character: **Pinus sylvestris 25–35 m, bare orange-brown columnar trunks**, high open
canopy, sparse dwarf-shrub layer, floor = **pale Cladonia reindeer-lichen mat (беломошник)** in
the dry core grading to **green Pleurozium moss + cowberry (зеленомошник)** toward the river. The
paradox to honour: **open eye-level sightlines between trunks, but dense overhead canopy** — the
"hard to see through" reading comes from trunk *count*, not undergrowth. Densest core at
`(−380, +330)`; thins to scattered pines at the S and E edges (ecotones).

The river's **upper run grazes the bor's E edge** → this is the "river bend with bor + green
banks" reference; a **mossy-boulder forest stream + ferns** (reference) threads the bor interior
(see 1d).

### 1d. RIPARIAN — river + streams (~6%, narrow but long)

A **N→S river** draining the (future) high NW/N toward the low SW, threading every district gap.
Polyline (river centreline, width given per segment):

| Pt | `(x,z)` | Note |
|---|---|---|
| P0 | `(−300, +500)` | source at N border (bor / future high ground) |
| P1 | `(−280, +320)` | runs along the **W edge of the airfield** (willow screen) |
| P2 | `(−250, +200)` | bor↔river bend |
| P3 | `(−210, +60)`  | |
| P4 | `(−180, −80)`  | W of kombinát (≥96 m clear) |
| P5 | `(−170, −220)` | |
| P6 | `(−200, −360)` | **crosses the south road `z=−300` at x≈−188 → FORD/bridge** |
| P7 | `(−230, −500)` | exits to S border, **broadens into marsh** (1e) |

Width: **40 m** gallery in the open reaches, narrowing to **20–26 m** through the bor, widening
to **70 m** + braided channels near the marsh mouth. Conflict check (all clear): strongpoint
`(−330,−300)` r56 → nearest river pt 143 m; convoy wreck `(−95,−296)` → 93 m; kombinát yard →
>96 m; airfield box → river stays at `x≤−250` north of z=290 (W of the −232 edge). The road
crossing at P6 is **intentional** — a ford with a timber/concrete crossing reads as real.

Cross-section (handles its own ecotone — **no hard seam**): open water → **reed/sedge waterline
fringe** (Phragmites) → **willow/alder gallery** (Salix alba bright silver-green, fast dense
regrowth 2–3 m/yr) → **wet meadow** → upland biome. Plus a **forest stream** branch inside the
bor: a 6–10 m mossy-boulder brook from `(−330,+280)` to the river at P2, with ferns + boulders.

### 1e. MARSH — плавні (~3%)

Where the river pools in the **low SW depression**: a basin roughly `x ∈ [−280, −150], z ∈
[−380, −500]` (river mouth P6→P7) + a small backwater pond. Character: **Phragmites australis
1–3.5 m dense reed stands in shallow water, sightlines fully blocked, waterlogged ground,
navigable only by channels** (reference: "reed marsh shore"). A second small **park-pond + rock
grotto** feature (owner reference) can sit as a tiny isolated marsh/pond at `(−120, +180)` in the
forest-steppe draw — a calm contrast to the war zones.

### 1f. ALPINE-MEADOW — polonyna (**NEEDS ELEVATION — dormant until terrain engine**)

The **E / NE edge is the future massif**: `x ∈ [+380, +500], z ∈ [−100, +300]`, the slopes E of
the bunker rising into the existing mountain border. Narratively perfect — the bunker «Объект
1180» is a buried kurgan **dug into the foot of the hillside**. Until the terrain engine raises
this corner, the biome is **flagged dormant** (scrub placeholder only). Once elevation exists it
stacks **vertically** (research): Norway spruce forest below → **Pinus mugo krummholz** treeline
ecotone (≈1430–1510 m band, here = the mid-slope) → **alpine meadow ≥1700 m** (here = the ridge
top), with the spring **lilac/yellow crocus carpet**, June–July **bright-pink rhododendron**
islands + Vaccinium, edelweiss/gentian, granite boulders + scree ridges. Sightlines: open
panoramic, broken by **impenetrable mugo thickets**.

### 1g. Ecotone rules (so seams never read as a hard cut)

| Seam | Width | Rule (density falloff) |
|---|---|---|
| steppe ↔ forest-steppe | **80–120 m** band, ~`z=+80…+160` | diffuse (loess): scattered scrub + lone oaks increase northward; grass shifts dry→mesic; woody cover ramps 0→40 % via a smoothstep on `z` |
| bor ↔ steppe | **40–70 m**, the bor S/E edge | substrate edge: pine density ramps down, sandy-steppe grasses (Festuca vaginata / Stipa borysthenica) ramp up — a dune/terrace mosaic |
| bor ↔ forest-steppe | **50 m**, bor E edge | pines thin, birch + shelterbelt rows begin |
| riparian (self) | the cross-section above | water → reed → willow → wet meadow → upland; density keyed to distance-from-centreline |
| marsh ↔ riparian/steppe | **30 m** | reed height tapers 3.5→1 m; ground dries; sedge tussocks → grass |
| spruce → mugo → meadow (alpine) | vertical | keyed to `terrainHeightAt` elevation bands once the massif exists |

Ecotone mechanic for the scatterer: never switch asset sets at a polygon edge — **blend by a
per-point weight** `w_biome(x,z) ∈ [0,1]` (sum to 1 across the local pair), then scatter each
asset set at `density · w`. A pine at the bor edge with `w=0.2` simply means 1-in-5 of the bor
density there.

---

## 2. War overlay — craters / burnt / blow-down

The map's two faces. The war overlay is applied **across any biome**, clustered on **military
logic: targets and supply routes**, tapering to near-zero in deep nature.

### 2a. Clusters (anchor, radius, contents, density)

| # | Anchor `(x,z)` | Radius | Why | Contents | Density |
|---|---|---|---|---|---|
| W1 | airfield S/W treelines, along `z≈290, x∈[−232,112]` | 0–120 m off the box | high-value target | shattered shelterbelt (snapped/charred trunks "black sticks"), blow-down logs, **water-filled craters** in the loess, burnt grass | **heavy** |
| W2 | strongpoint `(−330,−300)` | 56–160 m ring | front line | "field of stumps", crater field, red-earth rims, charcoal, defoliated snags | **heavy** |
| W3 | N–S spine `x=150`, `z∈[−440,+215]` | ≤40 m off the strip | shelled supply route | crater string (artillery walks the road), burnt verge grass, 1–2 toppled ЛЭП poles | **medium**, beaded along the road |
| W4 | south road `z=−300`, `x∈[−287,258]` | ≤40 m off the strip | shelled route | as W3 + the existing convoy wreck `(−95,−296)` as the set-piece | **medium** |
| W5 | bor SE edge facing the airfield, `x∈[−250,−180], z∈[+200,+300]` | patch | shelled treeline | blow-down pine (aligned fall direction = blast vector pointing **away from the airfield**), charred columnar snags, "moonscape" | **medium** |
| W6 | kombinát fringe (outside the yard box) | 30–80 m ring | industrial target | rubble-edged craters, scorched ground, blast-felled lone trees | **light–medium** |

### 2b. Relation to roads & rules

- **Craters never block a road centreline** — they bite the verge (≤40 m off), leaving the strip
  drivable. A crater that overlaps a road keep-out is clipped to the verge or dropped.
- **Water-filled craters** require a basin in the terrain (`waterAt` / depression) — they are a
  **terrain-engine product** (a crater carves a real dip that the water table fills). Until then,
  place them as dry crater rims + a flat dark water disc (the current flat-plane fallback).
- **Blow-down directionality:** logs in a blast patch share a fall azimuth radiating from the
  blast origin (the target), per the reference photos — set per-cluster, not random.
- **Density gradient:** war props fall off as `falloff = clamp(1 − d/R, 0, 1)` from each anchor;
  **deep-nature mask** zeroes the overlay in the bor interior core (`hypot(x+380,z−330)<90`), the
  marsh, and the alpine ridge — those stay pristine for contrast.
- War overlay **respects every keep-out** in §3 exactly as nature props do.

---

## 3. Terrain-aware placement contract

The exact API the future terrain engine MUST expose for placement to run **once** on real
terrain. (Mirrors the design spec's contract, made concrete.)

### 3a. Sampling API

```
terrainHeightAt(x, z) → y          // ground elevation in metres; props sit on it (no floaters/buried)
terrainNormalAt(x, z) → Vec3       // unit surface normal; align trunks/rocks, lay grass to slope
terrainSlopeAt(x, z) → radians     // = acos(normal.y); convenience for slope gates
biomeAt(x, z) → { id, weights }    // dominant biome id + the ecotone blend weights w_biome (§1g)
moistureAt(x, z) → 0..1            // drives biomeAt + riparian/marsh; high near river/marsh
waterAt(x, z) → y | null           // water-surface elevation if this column is a basin/channel, else null
```

Contract guarantees:
- `terrainHeightAt` is **C0-continuous** (no cliffsteps that would float a tree row); deterministic.
- `biomeAt` is derived from **(elevation, moisture)** fields + the §1 region masks, returning
  **blend weights** at ecotones — never a hard polygon switch.
- `waterAt` defines river channels (downhill), the marsh basin, the pond, and crater pools.

### 3b. Keep-out mask (a first-class rule, not an afterthought)

`isPlaceable(x, z, propRadius, kind)` returns false if **any**:

1. Inside any **district footprint** (§0 table) inflated by `propRadius + 3`.
2. Inside any **road keep-out** (§0) inflated by `propRadius + 1.5` — props never on the drivable
   strip; tall props (trees) keep a further **road-clearance 4 m**.
3. Inside any **POI keep-out circle** (§0), or within **4 m of a ЛЭП pole** (the `world.boxes`
   pole colliders).
4. Inside the **spawn bubble** r40 at `(0,0)`, or any **loot-spot bubble** r6.
5. Overlapping any existing collider: query the **`SpatialGrid`** (`world.grid`) at `(x,z)`; reject
   if an AABB overlaps the prop footprint.
6. **Slope gate** (once elevation exists): reject trees where `terrainSlopeAt > kindMaxSlope`
   (pines/oaks ≤ ~30°, mugo any slope, grass/flowers any slope, boulders prefer steep).
7. **Water gate:** reject land props where `waterAt ≠ null` unless the prop is aquatic
   (reed/willow-on-bank), and reject the inverse.

The mask is the **union of `world.boxes` + road strips + POI footprints + spawn/loot bubbles +
slope/water gates**. The scatterer Poisson-samples each biome, runs `isPlaceable`, then snaps the
survivor to `terrainHeightAt` / `terrainNormalAt`.

---

## 4. Terrain-engine blueprint (what we build NEXT, together — NOT now)

Staged, **human-in-loop**, because elevation has a **high blast radius and there is no automated
gameplay test suite**. Touch points flagged per stage. Each stage ends at a **playable checkpoint**
the owner verifies in-browser before we proceed; nothing merges that fails to boot.

> Risk frame: `World` (flat `PlaneGeometry` + AABB `boxes`), `Player` (ground height is currently
> `y=0`; step-up 0.62 m assumes flat), `SpatialGrid` (indexes box colliders, assumes flat),
> enemy steering (flat, no navmesh — `pathing.js` A* on a flat grid). Every stage must keep solo
> **and** co-op booting (`hostSim` authority unchanged — terrain is host-authoritative data).

### Stage T0 — Heightfield data model (no visual change)
Add a deterministic, seeded **heightfield** sampler: `terrainHeightAt(x,z)` over the 1000×1000
plane, default **flat (y=0)** everywhere so the game is byte-for-byte unchanged at boot.
Implement the full §3a API against this flat field first. **Checkpoint:** game identical;
`window.GAME.world.terrainHeightAt(0,0) === 0`. Risk: low (pure addition). Touch: `world.js`.

### Stage T1 — Gentle relief on the steppe
Replace the flat `PlaneGeometry` with a **subdivided displaced mesh** driven by low-amplitude
fBm (±2–4 m rolling undulation) — keep the centre, roads and district footprints **clamped flat**
(blend the heightfield to 0 inside their inflated footprints) so nothing built on `y=0` floats.
**Checkpoint:** walk the steppe, no z-fighting, districts sit flush. Risk: **medium** — `Player`
must now read ground from `terrainHeightAt` instead of 0. Touch: `world.js`, `player.js`.

### Stage T2 — Player on slopes (ground-follow + step-up)
`Player.update` samples `terrainHeightAt` for ground height and `terrainNormalAt` for the
slope gate; re-tune step-up (0.62 m) vs. walkable slope; camera follows ground. **Checkpoint:**
no falling-through, no stair-stutter on slopes, mounted .50-cal/tank still works (Player is the
fallback camera). Risk: **high** — this is the gameplay-feel stage. Touch: `player.js`,
`vehicles.js` (drive-over-terrain), `game.js` (mount fallback).

### Stage T3 — Mountains (NE/E massif) + LOD
Raise the §1f corner into a real massif (and optionally a NW ridge for the bor) using a separate
high-amplitude mask blended into the heightfield; build **distance LOD** on the terrain mesh
(coarse far tiles) so the 1000×1000 displaced mesh stays cheap. The existing border wall becomes
the massif skirt. **Checkpoint:** framerate held at the open horizon (fog far 900); massif
silhouette reads. Risk: **medium-high** (perf + the engine two-pass render). Touch: `world.js`,
`engine.js`.

### Stage T4 — Slope collision + water basins
Derive collision from the heightfield: either a **heightfield collider** for the player/enemies
on open ground (replacing the implicit flat floor) while keeping box colliders for structures, or
a coarse triangle floor. Carve **water basins** (`waterAt`): river channel, marsh, pond, crater
pools, with a water plane at basin elevation. **Checkpoint:** can't walk through a steep face;
water reads as water; SpatialGrid still resolves structure hits. Risk: **high** —
collision/`SpatialGrid` is load-bearing for all hit detection. Touch: `world.js`, `grid.js`,
`player.js`, `enemies.js`.

### Stage T5 — Enemy pathing on terrain
Teach steering/`pathing.js` about slope (avoid cliffs, prefer ≤ walkable grade, treat water +
mugo + dense bor as high-cost), regenerate the A* grid with terrain cost. **Checkpoint:** enemies
path up a hill to the player without bunching at a slope, don't swim, don't clip the massif. Risk:
**high** (AI feel; host-authoritative — must match on clients via existing `esnap`). Touch:
`pathing.js`, `enemies.js`, `waves.js` (spawn-ring height).

### Stage T6 — Final placement
Run the §5 scatterer against the live §3 API: Poisson-disc per biome, `isPlaceable` mask, snap to
`terrainHeightAt`/`Normal`, instance via `InstancedMesh` per asset for draw-call sanity. Bake war
overlay last. **Checkpoint:** the §1 map reads on the real terrain; perf holds; co-op sees the
same world (static, seeded — no per-client divergence). Risk: medium (perf/instancing). Touch:
new `nature.js` placement module + `world.js` wiring.

**Build order rationale:** data (T0) → look (T1) → feel (T2) → scale (T3) → physics (T4) → AI
(T5) → dress (T6). Each adds one failure surface at a time so a non-boot is bisectable by hand.

---

## 5. Asset → biome mapping table

Heights are **sourced** (research briefs) where cited; **spacing / stems-per-area are flagged
DESIGN values** — the briefs explicitly do NOT source steppe tussock spacing, bor stems/ha, or
Nardus polonyna metrics. Trees > 8 m carry `spec.maxDim`. Density is given as a target
**Poisson-disc min-spacing** (smaller = denser) plus a relative tag.

| Biome | Trees / large | Shrubs / ground | Grass / flowers | Rock / debris | Density (min-spacing, DESIGN) |
|---|---|---|---|---|---|
| **Steppe** | rare lone oak only at the N ecotone | none (open) | **Stipa feather-grass tussock 0.6–0.9 m** (2–3 silhouettes), Festuca; dull forbs: Salvia nutans (violet), Potentilla incana, Fragaria viridis | scattered granite boulders 2.5–5.5 m (existing) | grass clumps ~2–3 m → ~65–75 % cover; boulders ~60 m; trees ~0 |
| **Forest-steppe** | **Quercus robur 20–40 m** (maxDim), Tilia, **Betula pendula 15–20 m**; shelterbelt rows: **Lombardy poplar ≤30 m columnar** + black poplar 20–30 m + birch | hazel/scrub clumps in the ecotone | taller mesic grass + meadow forbs between belts | field stones | belt trees ~3–4 m **in-row**, rows 2.5 m apart (3–5 rows); free oaks ~40 m; **10–70 % woody cover** ramp |
| **Dense bor** | **Pinus sylvestris 25–35 m** (maxDim; two-tone bark — grey-brown scaly base + **orange-copper upper**), bare columnar boles | sparse Vaccinium vitis-idaea (cowberry), Calluna, juniper | floor mat: **Cladonia reindeer-lichen (pale grey-white, беломошник)** dry core → **Pleurozium green moss + cowberry** toward water | glacial granite boulders, fallen logs | pines **~6–9 m** spacing in the core (DESIGN — unsourced), thinning at edges; high canopy, open eye level |
| **Riparian** | **Salix alba 10–30 m** (maxDim; silver shimmering canopy, leaning), black poplar, alder (Alnus) | dense willow regrowth thicket (fast 2–3 m/yr), bramble | **reed/sedge waterline fringe**, ferns, wet-meadow grass, mud | **mossy boulders** in the stream, silt/gravel bars | gallery trees ~4–6 m (dense), reed fringe continuous; thicket near water |
| **Marsh** | none (or dead snags) | — | **Phragmites australis reed 1–3.5 m dense** (taller than a figure), sedge tussocks, bog | mud, half-sunk logs, the pond's rock grotto | reed ~1–1.5 m (a wall), open-water channels |
| **Alpine** *(dormant)* | Picea abies (lower slope), **Pinus mugo krummholz** dense impenetrable thickets (treeline) | Vaccinium, **rhododendron pink islands (R. myrtifolium, Jun–Jul)** | **crocus lilac/yellow carpet (spring)**, edelweiss, gentian, alpine poppy, Nardus sward (DESIGN metrics) | **granite boulders + scree, ridge slabs** | spruce ~5 m; mugo thickets ~2 m (impassable); meadow flowers dense in season |
| **War overlay** | shattered **snapped/charred trunks** "black sticks", **blow-down logs** (shared fall azimuth) | defoliated snags, burnt stubble | scorched/burnt grass patches | **crater rims (red earth) + charcoal piles + rubble**, water-filled crater pools (basin) | per §2 falloff `clamp(1−d/R,0,1)` from each anchor; zeroed in deep-nature mask |

**Variety rule (from the design spec):** every tree species ships **2–3 silhouettes** with
seeded trunk lean/twist + leaf-cluster variation; a copy-pasted tree is a fail. Boulders, reeds
and grass tussocks likewise rotate/scale-jitter so no repeat reads as tiled.

---

## 6. Open questions for the interactive (post-engine) session

1. **River as channel vs. flat ribbon** before T4 — ship a flat dark-water ribbon now, or wait
   for real basins? (Plan assumes flat fallback, real basins at T4.)
2. **Massif scale** — how high does the NE/E ridge go (visual only vs. climbable for the alpine
   meadow)? Affects T3 LOD budget.
3. **Crater water** — global water table (one elevation) vs. per-crater pools? (Plan: per-basin
   via `waterAt`.)
4. **Instancing budget** — max instanced trees at once for the open horizon (fog far 900); may
   need per-biome culling distance.
5. Whether the **ford at P6** gets a built crossing prop (timber/concrete) or just a shallow
   gravel bar.

---

*Coordinates in this plan are authoritative against `src/openworld.js` and `src/world.js`
`_buildSteppe()` as of 2026-06-10. Nothing here is wired into the running game; it is the input
to the interactive terrain-engine + placement session.*
