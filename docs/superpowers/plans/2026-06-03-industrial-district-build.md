# Industrial District «Kombinát» — Build Plan (object-by-object)

Executed via the **voxel-building-modeling** skill: research-first, one object at a time, custom mesh,
layered shading, no z-fight, correct AABB colliders, per spec. Built in worktree `feat/steppe-map-scaffold`.

Source of truth: `docs/superpowers/specs/2026-06-03-open-world-map-design.md` §4.4.1 (the 15-element kombinat)
+ brainstorm mockup `interactive-hub-v3` (top-down arrangement).

## Placement (world coords on the 500×500 steppe)

- Kombinát **yard centre = world (0, −40)** → `buildIndustrial(world, ox=0, oz=−40)`.
- Fenced yard footprint **150 m (X) × 110 m (Z)** → local x∈[−75,75], z∈[−55,55] (world z∈[−95,15]).
- Everything below is in **LOCAL** metres (origin = yard centre, +X east, +Z north); the builder adds (ox,oz).
- `_buildSteppe` boulder loop must **skip the yard rect** (+5 m margin) so rocks don't clip buildings.

## Architecture

- New module **`src/industrial.js`**: `export function buildIndustrial(world, ox, oz)`.
  - One focused builder per object: `buildFuelDrums`, `buildStorageTanks`, `buildGasholders`,
    `buildMainHall`, `buildFurnaceHall`, `buildPowerhouse` (ТЭЦ+chimneys+cooling tower), `buildAdmin`,
    `buildGatehouse`, `buildWarehouses`, `buildWaterTower`, `buildRailSpur`, `buildPipeRacks`,
    `buildSubstation`, `buildTerrikon`, `buildCoolingPond`, `buildFence`, `buildSignage`, `buildMisc`.
  - Each takes a shared `MeshBuilder` per material bucket + the `world` (for `world._solid` colliders /
    `world.boxes.push`), appends geometry, and the top fn builds a few merged meshes (one draw call per
    material) and `scene.add`s them. Collidable mass → collider; visual detail / above-reach → no collider.
- Wire one call `buildIndustrial(this, 0, -40)` at the end of `World._buildSteppe()`.

## Layout table (LOCAL m) — what / where / size / material / collide / Cyrillic

| Object | local (x,z) | footprint W×D | H | material | collide | signage |
|---|---|---|---|---|---|---|
| Main hall (главный цех) | (−28, 8) | 48×28 | 14 | corrugated steel + concrete plinth + steel frame | walls yes, sawtooth roof no | ЦЕХ №1 (gable), СЛАВА ТРУДУ band |
| Furnace hall (мартен) | (−30, −22) | 36×20 | 12 | brick + steel | walls yes | ЦЕХ №2 |
| Blast furnaces (домна) ×2 | (−12,−22),(−12,−14) | Ø9 | 18 | rusted steel cyl | yes (base) | — |
| Powerhouse ТЭЦ | (20, 12) | 26×16 | 12 | brick | yes | ТЭЦ |
| Chimneys ×3 | (34,16)(38,12)(42,8) | Ø3 | 30 | brick+red bands | yes (base) | — |
| Cooling tower (градирня) | (46, 6) | Ø24 | 28 | concrete (hyperbolic) | yes (ring) | — |
| Gasholders ×3 | (40,−18)(50,−16)(45,−26) | Ø14 | 16 | painted steel | yes | ОГНЕОПАСНО |
| Fuel tanks (резервуары) ×3 | (58,−32)(66,−28)(60,−40) | Ø10 | 8 | steel | yes | hazard ▲ |
| Fuel drums (barrels) | clusters near tanks/loading | Ø0.6 | 0.9 | green/rust steel | small/skip | ОГНЕОПАСНО stencil |
| Admin (заводоуправление) | (−22, −44) | 16×9 | 7 (2fl) | render+brick | yes | ★ + СЛАВА ТРУДУ |
| Gatehouse (проходная) | (0, −55) | 8×5 | 4 | brick | yes (sides) | ПРОХОДНАЯ |
| Canteen (столовая) | (6, −46) | 9×6 | 4 | render | yes | СТОЛОВАЯ |
| Warehouses ×2 | (−58,−30)(−58,−16) | 18×10 | 6 | corrugated | yes | СКЛАД |
| Silos ×3 | (−48,−40)(−44,−44)(−52,−44) | Ø6 | 12 | concrete | yes | — |
| Water tower (башня) | (−60, 38) | legs 8×8 | 22 | steel legs + tank | yes (legs+tank) | — |
| Rail spur + 2 wagons | east gate (75,−2)→(5,−2) | 2-rail | — | steel/wood | wagons yes | — |
| Pipe racks (эстакада) | hall→ТЭЦ→gasholders | on stilts | ~4 up | steel pipe | no (above reach) | — |
| Substation | (12, −40) | 12×8 | 4 | transformers+pylon | yes | ⚡ ОПАСНО |
| Terrikon (slag heap) | (60, 44) | Ø36 cone | 16 | dark slag | yes (cone) | — |
| Cooling pond | (48, −46) | 24×16 | water | water box | no | — |
| Perimeter fence | yard edge | — | 3 | concrete posts + panels | yes (panels) | gate marks |
| Misc | scattered | — | — | pallets/pipes/crates/lamps/scrap | small | — |

Gates in fence: **main gate S (x≈0, z=−55)**, **rail gate E (x=75, z≈−2)**, **side door W (x=−75, z≈10)**
→ ≥2 ways in (no trap), per map-design rules.

## Palettes (layered shading — Hi/Mid/Lo/Slot/Bright; never near-black main)

- Concrete `0x9a958b / 0x7c776d / 0x5c584f / 0x39362f / 0xb0a89c`
- Brick `0x8c4a36 / 0x743a2a / 0x542a1e / 0x331a12 / 0x9c5a44`
- Corrugated steel `0x8a9098 / 0x6c727a / 0x4c5158 / 0x2e3136 / 0xa0a6ad`
- Steel/gunmetal `0x888f99 / 0x636a74 / 0x474d56 / 0x2b2f35 / 0xa0a7af`
- Soviet green (drums/tanks) `0x5a7a3a / 0x46602e / 0x33471f / 0x202d12 / 0x6e8e44`
- Rust `0x7a4a2c`, hazard yellow `0xc9a23a`, Soviet red `0x9a2b22`, slag `0x3a342b`

## Build order (user's: barrels → tanks → buildings → complex → fence → signs → misc)

1. **Barrels** (fuel drums) — props, light research.
2. **Tanks + gasholders** — cylinders.
3. **Buildings** — main hall (FULL pipeline), furnace, ТЭЦ+chimneys+cooling tower, admin, gatehouse, warehouses, water tower, canteen.
4. **Complex infra** — rail+wagons, pipe racks, substation, terrikon, cooling pond, silos.
5. **Fence** + gates.
6. **Signage** (Cyrillic) — slogans, shop numbers, hazards.
7. **Misc** — pallets, pipe heaps, light poles, crates, scrap, oil decals.

Each object: skill pipeline (read our design → research [proportional] → ultra-spec → game design →
build separately → integrate + verify). Props get light research; buildings get a research subagent.

## Hard rules (every object)

- Collidable mass via `world._solid(...)` (pushes AABB). Above-reach detail via plain `mb.box`. Cylinders
  via `b.geo(CylinderGeometry)` (dispose after).
- Doorways/gates = **gaps**, not thin boxes. Interiors ≥2 exits. Walkable rises ≤0.62 m else it's a wall.
- **No z-fight**: detail boxes proud ~0.004; no coplanar same-depth different-colour faces; signage planes
  via alphaTest opaque pass + slight offset.
- Merge per material (few draw calls). Watch `world.boxes` count (O(n) until spatial grid).
- Verify each object in-browser (3 angles + walk), console errors 0, before moving on.
