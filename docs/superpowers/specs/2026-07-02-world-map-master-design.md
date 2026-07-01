# World Map Master Design — «ЗОНА 704» (central-massif world)

**Date:** 2026-07-02 · **Status:** owner-approved design (brainstorm, sections 1–4 ratified live) · **Branch:** `feat/world-map-master-design`
**Canonical artifact:** [`2026-07-02-world-map-master-plan.html`](2026-07-02-world-map-master-plan.html) — the **single source of truth** for the world layout. Every asset, POI, road and terrain feature is built *to* that plan; changes go into the plan first (bump its version), then into assets.
**Builds on:** `2026-06-25-world-map-vision-design.md` (two-act vision, boss-gate progression) · `2026-06-11-engendros-white-paper.md` · `2026-06-25-terrain-rewrite-design.md` + cave-terrain 3D prototype (engine capabilities) · `docs/design-principles.md`.
**Supersedes:** the biome/district layout of `2026-06-10-world-biome-placement-plan.md` (kept as reference for ecology/ecotone research; its coordinates described the old steppe map).

## 1. What was decided (owner-ratified)

| Decision | Choice |
|---|---|
| Rebuild basis | **From zero** — existing districts (airfield, kolkhoz, bunker, gatehouse, strongpoint) are re-*placed* as building blocks per this plan, not kept at old coordinates |
| World size | **2500×2500 m**, x,z ∈ [−1250,+1250], +X=E +Z=N, 1u≈1m |
| Macro-topology | **«ХРЕБЕТ» — a NATURAL central massif** NW→SE across the middle (axis (−560,+520)→(+660,−480); foot ~420 m wide at +40, rocky crest ~120 m wide at +150; local >35° crags only on the NE face by the portal). Object 704 is a **bunker inside the mountain** (Soviet mountain-complex realism — "nothing unreal", owner correction of the v1.0 raised-scar reading). Perpendicular to the SW→NE diagonal → forces the two-route fork; **crossable on foot** as an unofficial 3rd path (T5: dieback forest, summit toxin, no cover, no vehicles); roads logically go around it. Summit has a real fenced «запретка» compound over the 704 vents — sealed until Act 2 |
| Start / Goal | START = КПП SW (−1080,−1060) · GOAL = mountain saddle NE, bunker «Объект 1180» (+960,+1020) + evac LZ (+1060,+1120) at +200 m |
| Biome logic | **Vertical zonation** in ONE temperate continental zone (Carpathian model): steppe ±0…+30 → mixed forest +20…+80 → spruce "taiga" belt +80…+160 → mountains/alpine +160…+280; swamp −15…0 in the SE basin. "Taiga" exists only as the mountain-slope spruce belt |
| Forests | 27 % of map in **3 density tiers**: open woodland (sightline 60–120 m) · standard forest (25–60 m) · **ЧАЩА** dense cores (3–10 m, thicket traversal, 6 pockets 150–300 m, never block a route) |
| Hydrology | The central massif **closes off the SE basin's drainage** → the swamp collects behind it; contamination from the 704 complex washes down the slopes into it (why the S route is wetter and deadlier — all natural). River «Тихая» N mountains → W side → swamp delta |
| Caves | **Sparingly, where they carry weight** (3 hero spots): Object 704 mouth (+180,+80) · mine gallery P6 (Surface Nets) · quarry overhangs S07. Everything else = portal interiors at y≈−2500 (GTA-SA instancing, already in progress on another branch) |
| Radio | **Signal is a map system**: 3 repairable masts РТ-1/2/3 (r≈500 coverage: contracts, IL-76, voice boost) vs. core jamming r≈450; elevation helps, valleys shadow. Act 2: masts become contested |
| Shilka | **Act-1 crown-jewel find** at the airfield AA revetment (+200,+680); needs battery+filters (МТС kolkhoz ∨ Kombinát depot), 400 l diesel (АЗС ∨ airfield ГСМ), 23 mm belts (airfield magazine) → forces route-crossing; multi-crew |
| Density / length | **~4–6 h Act 1, STALKER density**: 5 boss-gates + ~18 side POIs + 8 edge POIs + ~30 micro; N route ~4.3 km, S route ~2.9 km (shorter, deadlier), finale climb ~1.2 km |
| Gates | All **physical and self-explaining**: G1 airfield steel gate · G2 mine rubble (player detonates; quarry explosives = alt path) · G3 Tolo nest on the dry berm (burn it) · G4 dam sluices (2-player simultaneous crank) · G5 derailed train in the rail cutting (depot crane) |
| Edges | **No dead edges**: honest borders (N/NE/E crest, W river escarpment, S quarantine perimeter fence with watchtowers + marked minefields) + an 8-POI edge ring (Орлёнок camp, triangulation tower, weather station, An-2 wreck, tunnel+handcar, Изолятор hospital, Застава-Юг garrison, Прорыв memorial) that doubles as Act-2 patrol entry points |
| POI detail level | **Blackbox parcels** ("cadastre") — positions + footprints only; interior/building layouts are follow-up per-POI specs. Provisional block sketches from the brainstorm are non-binding appendix |
| Loot | **Deferred** — the scavenge-loot economy isn't in the game yet; the plan records POI *purpose* only, no drop tables |

## 2. Act structure on this map

- **Act 1 «Přechod»:** SW→NE around the scar; radio degrades (certainty → hesitation → jamming near the scar); every dead G-boss visibly "wakes" 704 (glow, siren, thickening «пух»). Finale «Аист» is **played, not watched** on the LZ; the shot-down evac crashes at S18 (+260,+190) by the apron.
- **Act 2 «Покинутые»:** the state actively writes the squad off — hunter patrols enter via edge gates (E07 south, E05 tunnel, P8 saddle), contest the masts, steal the airdrops; world +1 threat tier; the dieback forest creeps outward from the massif slopes (~40 m/cycle, cap +200); opened gates act as fast-travel nodes; the 704 seal (запретка gate/portal) breaks after all five G-bosses → T6 endgame dungeon (own spec).

## 3. Engine fit

Everything the plan asks for maps to validated capabilities: designed landforms as pure `(x,z)→Δh` (ridges, balky, quarry, craters, kurgans, terraces, flatten pads), cliffs >35° as natural walls, triplanar textured ground (owner-locked), 3 Surface-Nets cave spots, chunked LOD at 2500², co-op determinism (pure functions of position + host-auth world state for gates/reinfestation/patrols).

## 4. Open questions (deliberately deferred)

Boss roster assignment (reconcile the 9-boss bible) · per-POI interior specs (buildgen) · Object 704 interior dungeon · loot/scavenge economy · weather system · exact landform authoring parameters (terrain M4) · Act-2 patrol AI design · performance validation gates at real scale.

## 5. Process record

Brainstorm 2026-07-02 with visual companion (macro-topology choice A/B/C → owner picked the elongated-center variant; sections: terrain v3 with density-tiered forests + 12 terrain-diversity features → routes/gates/POI v2 with edge ring → POI blocks (kept provisional/blackbox per owner) → mechanics layers with loot skipped). **v1.1 owner correction:** the center is a *natural* mountain massif (crossable, bunker-in-mountain), not a surreal raised scar — "ne nic unreal". Session sketches live in `.superpowers/brainstorm/` (gitignored); the ratified content is consolidated in the master-plan HTML.
