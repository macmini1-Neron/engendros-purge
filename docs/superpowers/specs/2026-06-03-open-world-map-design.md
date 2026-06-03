# Open-World Survival Map — Design Spec

- **Date:** 2026-06-03
- **Status:** Design approved (macro + base concept). Pending: written-spec review → implementation plan.
- **Authors:** macmini1 (brothers) + Claude
- **Topic:** A second, much larger Soviet open-world survival map for ENGENDROS PURGE.
- **Visual concepts:** `.superpowers/brainstorm/2716-1780447124/content/` (map-layout v1→v5, interactive-base v1→v2). Not committed (gitignored).

---

## 1. Summary / Vision

Add a **second, selectable map** (the existing de_dust2 arena stays as-is) that is a **much larger, asymmetric Soviet/Eastern-bloc open-world survival map** with a **hybrid loop**: free open-world movement + **"hot zones" / events** that concentrate the action. Theme + "crafting death" survival feel, with a believable real-world geography (a Central-Asian intermontane steppe basin).

This is a **large, multi-phase feature** — closer to a new game layer than "a map." It is therefore designed in full here but **built as a vertical slice first** (one district + new foundations), with each later phase becoming its own implementation plan.

## 2. Goals / Non-goals

**Goals**
- A ~**500×500 m** map (vs current 140×140), ~12.7× the area.
- **Asymmetric, POI-dense** layout ("always something within ~50–60 m"), inspired by Erangel/Chernarus/Rust.
- **Believable geography** (hydrology + ecology that hold up to scrutiny).
- **Hybrid open-world + hot zones** loop; keep the existing combat core fun.
- A defensible **home base** authentic to a **Soviet WW2 field strongpoint**.
- Reuse existing systems: BuildManager fortifications, rooftop .50cal, field radio, survival timers (hunger/water/splints), captured tank.
- Coexist with the current arena (player picks the map).

**Non-goals (for now)**
- Full DayZ-style rewrite (persistence, world streaming, AI roaming everywhere).
- Real heightmap terrain / sloped collision (we use **fake voxel terrain**).
- Exact building sizes, street-level micro-layout, voxel art, loot tables, event scripting — **deferred to the micro phase** (separate plans).
- Replacing the dust2 arena.

## 3. Genre / loop decision

**Hybrid: open map + hot zones.** Players roam an open world, loot scattered POIs, retreat to a home base to craft/fortify; **action concentrates in "hot zones" / events** (a horde at the factory, a raid on the airfield, a roaming horde in the steppe). This delivers the open-world/"crafting death" feel **without** discarding the working wave/horde combat. (Full open-world roaming and a pure wave-on-a-big-map were both considered and rejected — see brainstorm.)

> **AI note:** the user intends to eventually add **A\*** pathfinding to **all** mobs (today only Tolo uses A*; regular enemies steer). The map is designed to also work with steering, but A* removes the "keep it steering-friendly" constraint and unlocks tighter corridors/choke design later.

## 4. Map specification (macro)

### 4.1 Scale & coordinates
- Playable square **~500×500 m** → `World.HALF = 250` (today 70). 1 unit ≈ 1 m, +Z forward / +Y up / +X right (unchanged).
- Comparison overlay (140×140) used in the concept art only.

### 4.2 Macro layout — **hub + spokes (open variant)**
- **Central hub = Soviet Industrial** (factory complex on the river) → home base, crafting, **player start**, the dominant landmark.
- Two outer districts as **spokes**; the gaps between them are **open voxel terrain** (steppe + nature), not corridors → open-world feel + a clear orientation anchor.

### 4.3 Geography & terrain (realistic — "fake voxel" relief)
- **Elevation gradient: high NE → low SW.**
- **Mountains = impassable border** (voxel cliffs too tall to step-up): **heavy ranges on N + E** (snow on highest peaks), **lower hills on S + W**, with a **gorge in the SW** as the river's natural outlet (a believable boundary break rather than a wall-around-everything).
- **River:** sources in the NE mountains, takes **2 tributaries**, **meanders** in the lowland, flows into the **SW lake**, then exits via the SW **gorge**. Obeys gravity.
- **Lowland / marsh / lake** at the lowest SW point.
- **Real-world analog:** Central-Asian / post-Soviet **intermontane steppe basin** (Fergana / Aral / Caucasus foothills) — fits the Soviet theme.
- Implemented as **flat ground (y=0) + voxel relief** (cliffs, ridges, berms, terraces, boulders) — no heightmap, no sloped collision.

### 4.4 Districts
1. **Soviet Industrial — HUB** (centre, on the river): factory hall, chimneys, cooling tower (landmark), storage tanks, rail/pipe. The **home base** (field strongpoint, §5) sits a **short distance (~150 m) from the complex** — close enough to anchor the hub, far enough to be its own defensible position (not inside the factory). **Vertical slice #1.**
2. **Military Airfield / Base** (NW, remote, on a flat plateau): runway, hangars, bunkers. **Top-tier loot, highest risk** (remote = DayZ NWAF principle).
3. **City + Ruins** (SE lowland, largest footprint): panel blocks, streets, square, ruined sector. Dense pedestrian-combat district.

### 4.4.1 Industrial hub «Kombinát» — detail (this is the vertical-slice #1 content)
Real reference: Soviet metallurgical **kombinat** (Magnitogorsk / Uralmash) — an *integrated*, rail-served, river-cooled plant with a linear constructivist layout. Elements (each mapped to a gameplay role):

| # | Element (RU) | In-game role |
|---|---|---|
| 1 | Проходная (gatehouse) | Controllable **choke** entrance to the complex |
| 2 | Заводоуправление (admin, ★ + slogan) | Loot building (offices/safe) |
| 3 | Главный цех (main hall, sawtooth roof, gantry crane) | **Interior arena**: catwalks (verticality), machine cover, **roof access → .50cal** |
| 4 | Мартен + домна (open-hearth + blast furnaces) + stacks | Vertical landmark + cover |
| 5 | ТЭЦ (CHP/boiler) + tall chimneys | Map-wide **landmark** |
| 6 | Градирня (cooling tower) | Tallest landmark (navigation across the 500 m map) |
| 7 | Газгольдеры (gasholders) | **Explosive** cover (detonate by fire) |
| 8 | Резервуары (fuel tanks) | **Explosive** cover |
| 9 | Ж/д ветка (rail spur) + loading + armored wagons | Long sightline / horde funnel + wagon cover/loot |
| 10 | Эстакада (pipe racks) | Elevated catwalk routes / cover |
| 11 | Водонапорная башня (water tower) | Landmark / sniper perch |
| 12 | Склады + silos | Storage / loot |
| 13 | Cooling pond (fed from river) | Water source / kiting hazard |
| 14 | Террикон (slag heap) | High-ground overlook + landmark |
| 15 | Подстанция (substation) + столовая (canteen) | Cover / flavour |

- **Home base** = the field strongpoint (§5), **~150 m from the complex** (not inside it).
- **Hot zone:** «Factory siege» — a horde event inside the complex.
- **Economy:** industrial **scrap = crafting material** (ties to the "crafting death" survival loop).

### 4.5 POIs (~14, risk/loot tiers)
Density target: **never >~50–60 m from a POI**. Tier = loot ↔ danger.
- **High (top loot, deadly):** Airfield, City centre, **Secret bunker** (spread out: NW / SE / E — not clustered).
- **Mid:** gas station, motor depot, water tower, **quarry / open-cast**, radio mast, supermarket, checkpoint (bridge).
- **Low:** fishing hamlet (lake), chapel, grain silo (fields), sawmill (forest), Su-24 wreck, watchtower.

### 4.6 Vegetation / ecology
It is a **dry steppe** → trees are the exception, following **water and cool slopes**:
- **Conifer forest (densest):** NE + E mountain slopes (below snow line). → spawn dens + heavy cover.
- **Riparian (gallery) forest:** green ribbon of willows/poplars **along the river + tributaries**. → covered flanking route.
- **Steppe grassland (dominant):** open grass across centre/W; few trees. → open sightlines (broken by ridges + copses).
- **Reed beds / marsh:** around the SW lake. → stealth near water.
- **Shelterbelts:** tree rows along kolkhoz field edges (Soviet steppe-afforestation detail). → linear cover.
- **Copses / lone trees:** scattered in the steppe for kiting cover + landmarks.
- **Voxel impl.:** tree = simple model (trunk + canopy); **collision only on the trunk** (thin AABB), canopy is pass-through; forest = clusters.

### 4.7 Roads, bridges, traversal
- **Closed ring road** following the valley/contours, connecting all districts (vehicles circulate).
- River crossings: **3 bridges + 1 ford** → ≥2 crossings per side (no map-splitting, choke + flank).
- **Traversal:** sprint on foot within a district; **vehicles between districts** (reuse the captured tank; optionally add a light vehicle/UAZ later). Roads exist because vehicles need them.

### 4.8 Hot zones / events & spawning
- **Hot zones (★):** Airfield raid, City-centre horde, Factory siege, plus a **roaming horde** in the steppe.
- **Spawn = zone-based** (replaces the perimeter ring): enemies spawn from **forest/mountain-pass "dens", out of the player's line of sight, never inside the base**; events spawn from the far side of the active hot zone. Host-authoritative.

## 5. Home base spec — Soviet WW2 **field strongpoint** (опорный пункт)

Authentic **all-round defence (круговая оборона)**, not a walled yard. Verified against real sources (§9).

| Real element | In-game role |
|---|---|
| **Траншея** — zigzag fire trench w/ traverses (anti-enfilade), all-round | Cover + firing positions; satisfies "no dead end / multiple covered routes" automatically |
| **Ход сообщения** — communication trenches to the core | Covered movement inward |
| **ДЗОТ (DZOT)** — log MG firepoints (4 sectors) | Mounted **.50cal** / MG nests (move the rooftop gun here), firing arcs outward |
| **Землянка** — recessed log dugouts (sod roof, camo) | **Crafting** stations: workbench, storage, sleeping/spawn |
| **Блиндаж** — reinforced command dugout (core) | Base heart: **radio + map/stash** |
| **Полевая кухня** — field kitchen | Food / hunger station |
| **Medpunkt** (✚ dugout) | Splints / healing |
| **Ammo niches** in trench walls | Ammo resupply / loot |
| **Pozorovatelna (НП)** — observation tower | Overwatch / high ground |
| **Studna** — well | Water (survival) |
| **Kaponiéra** — dug-in, camouflaged revetment | Vehicle parking |
| **Obstacle belt:** barbed wire, Czech hedgehogs, AT ditch, mines | **BuildManager** fortifications + existing barbed-wire hazard |
| **Маскировка** — camouflage netting, everything dug-in | Visual theme; dispersion |

- **Two+ entrances** (S wire lane + W lane) → no trap.
- **Defence logic:** trenches = covered movement; DZOTs + tower = elevation/overwatch covering the gate approaches; courtyard/core = killbox if breached; obstacle belt faces outward (horde from all sides).

## 6. Map-design rules satisfied (audit = green)

Validated against 13 canonical rules (readability, guidance, multiple routes, no dead ends, loops, sightline control, kiting cover, risk/reward, density pacing, POI breadcrumb, choke+flank, fair spawn, metrics). All ✅ at macro; **metrics** (rule 13) and micro dead-end checks happen in the blockout/micro phase. Key fixes baked in: ridges/berms/forest **break long sightlines**; 3 bridges + ford = multiple routes + choke-with-flank; closed ring road = loops; high-tier loot spread; spawn out-of-LOS.

## 7. Technical foundations / engine implications

These are **prerequisites**, not polish:

1. **Spatial partitioning grid** — `World.collide()` and `World.rayHit()` currently iterate **every** box in `this.boxes` each frame / each shot (O(n)). Fine at ~150 boxes; a 500×500 map has thousands. Add a uniform grid (bucket boxes by cell; query only nearby cells). Required before the map is playable at scale. Also benefits `BuildManager.validateAt` and enemy collision.
2. **Zone-based spawn system** — replace `World.spawns` perimeter ring + `WaveManager` arena logic with per-zone spawn points + density driven by active hot zone / player proximity; host-authoritative (`hostSim`).
3. **Map selection / parameterised World** — today `World._build()` is a single hardcoded arena with `HALF=70`. Introduce a map id (e.g. `'arena'` | `'steppe'`), select at `startGame`, and let `World` build the chosen map (different `HALF`, build fn, fog distances, spawns, lootSpots). Persist last choice in `meta`.
4. **Fake voxel terrain** — flat ground + voxel relief (cliffs/ridges/berms/boulders/terraces) via `_solid()` AABBs. Mountains = tall AABBs (> step-up 0.62 m → impassable). Trees = trunk AABB + pass-through canopy.
5. **Traversal** — sprint + vehicles; reuse `CapturedTank` (vehicles.js / bosstank.js); roads are cosmetic + vehicle guidance.
6. **Co-op authority** — every new authoritative system (zone spawns, hot-zone events, loot, day/night) must sit behind `hostSim = !mp.active || mp.isHost`; `pstate` remains life-state truth.
7. **Performance budget** — keep merged-geometry single-draw-call pattern per material (MeshBuilder); watch total box count; add frustum/distance culling for distant district meshes if needed.

## 8. Build order (phasing) — vertical slice first

Each phase is its own implementation plan. **Plan #1 covers only Phase 1.**

1. **Foundations + Industrial hub vertical slice:** spatial grid; parameterised World + map select; zone-based spawn; build the Industrial district + **home base (field strongpoint)** on a bare large ground. *Goal: playable, fun, fps-OK slice.*
2. Surrounding **mini-POIs** near the hub.
3. **Airfield** district.
4. **City + Ruins** district.
5. **Terrain pass:** mountains, river + tributaries + lake + gorge, forest, fields, ridges, roads, bridges/ford.
6. **Vehicles** + road traversal.
7. **Hot zones / events** + roaming hordes.

## 9. References

**Real WW2 Soviet field fortifications:**
- Osprey — *Soviet Field Fortifications 1941–45* (Gordon L. Rottman). https://www.amazon.com/Soviet-Field-Fortifications-1941-45-Fortress/dp/1846031168
- *Handbook on USSR Military Forces, Ch. VI: Fortifications* (US War Dept, 1946). https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1026&context=dodmilintel
- *Zemlyanka* — Wikipedia. https://en.wikipedia.org/wiki/Zemlyanka
- *Soviet Soldiers' Dugouts WW2*. https://sovietuniform.com/soviet-soldiers-dugouts-ww2/

**Map-design inspiration:** PUBG/Erangel (named risk-tier POIs), DayZ/Chernarus (organic landscape, remote NWAF, loot gradient), Rust (monuments as escalating-loot magnets), Tarkov (dense interconnected POIs).

**Internal:** `src/world.js` (World/BuildManager/DayNight), `src/tuning.js` (WAVE_TYPES), `src/enemies.js`, `src/waves.js`, `src/economy.js` (STRUCT_DEFS), `src/vehicles.js` + `src/bosstank.js`.

## 10. Open questions (deferred to micro / later plans)

- Exact building sizes, street-level layout, room interiors, metrics (door widths, cover spacing).
- Voxel models for mountains/trees/trenches/dugouts/DZOTs.
- Loot tables per POI tier; event triggers & pacing; vehicle stats (if a new vehicle is added).
- Whether to add a dedicated **quarry/nature ("open-cast + příroda") district** later (currently nature is ambient, not a district).
- Day/night (longnight) integration on the big map.
