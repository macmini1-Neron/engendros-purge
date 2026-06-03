# Soviet Military Airfield (военный аэродром) — Build Plan

**Goal:** the NW **airfield district** of the steppe map — an ultra-detailed, real-referenced **Soviet Cold-War
(1960s–80s) frontal-aviation fighter base**, built per the `voxel-building-modeling` skill (research → spec →
build → integrate → **critically review + incrementally improve each** → verify). Top-tier loot + highest-risk
hot-zone ("Airfield raid"). Built in `src/airfield.js`; entry `buildAirfield(world, ox, oz)`.

**Research:** 7 dossiers (2026-06-03) — surface/markings/lighting; arch shelters (АУ/ЗС); КДП tower; ТЭЧ hangar;
jets (MiG-21/23, Su-25); ПВО (С-75, Шилка, П-18, ЗУ-23-2); support+perimeter. Real metres throughout.

**Verify note:** the engine's pixelation (`engine.pixelScale`, default 2) blurs detail — for model verification
**`GAME.engine.setPixelScale(1)`** (crisp / full internal res) before screenshots, per the user.

## Placement (world coords, +X east, +Z north) — NW quadrant, remote plateau

Region ≈ **x[−235,−35], z[+85,+195]**. Perimeter PO-2 fence around it; КПП gate on the **S** side (toward the
map interior) at ~(−135,+85). Scaled to fit the 500 m map (a forward dispersal strip, not a full 3 km base).

| Element | World coords | From research |
|---|---|---|
| **Runway ВПП** | centreline z=+160, x[−220,−40] (**180×40 m**, slightly raised slab) | Class А=3200×60 scaled to a short strip; PAG-14 slab grid (6×2 m), black mastic joints, markings white |
| **Parallel taxiway РД** | z=+128, x[−200,−60] (16 m wide) + 2 connectors at the ends | магистральная РД |
| **Apron / hardstands** | z[+100,+120], x[−190,−70] | стоянка МС |
| **Arch shelters ЗС (АУ-13)** ×4–5 | row at z≈+108, x −185…−85, ~45 m spacing, entrances→N (to apron) | 12.9×28 m, semicircular arch crown ~6.45 m, 0.6 m concrete, **earth+grass berm**, 2-leaf olive blast doors, rear 3×3 m gas duct, white shelter № on door |
| **Caponiers (обвалование)** ×2 | flanks, e.g. (−210,+108),(−60,+108) | open U earth/concrete revetment, walls 3–4 m, U-opening ~14 m, depth ~28 m |
| **КДП control tower** | (−128,+114) — midfield S, the **landmark** | ~20 m, 5-floor concrete base + glazed cab w/ **15° outward-tilted glazing**, balcony, **red/white 3 m horizontal bands**, beacon+whip antennas, «КДП»+red star |
| **Hangar ТЭЧ ангар** | (−180,+98) | 30×60 m, eave 9 / ridge 11 m, low roof, 2-leaf sliding steel doors ~20×8 m, concrete-panel base + sage-green corrugated steel + rust, ribbon windows, «СЛАВА КПСС» facade, «АНГАР №1»/«ТЭЧ АП» |
| **Aircraft (custom voxel)** | MiG-21bis + MiG-23MLD on apron/in shelters; Su-25 on apron | MiG-21: 14×7.15×4.1, nose shock-cone, delta, camo green/blue; MiG-23: 16.7 m swing-wing(45°), side intakes, single tall fin, light grey; Su-25: 14.36 span, twin side nacelles, straight wing, camo. Red stars (wings under/fuselage/fin) + red bort № |
| **С-75 SAM site («цветок»)** | centre (−80,+205), 6 launchers in hexagon r≈55 m + central Fan-Song | launcher SM-63-1 = 10 m I-beam rail @60°; missile V-750 10.6 m (booster Ø0.65 + sustainer Ø0.5 + 2.6 m delta fins); earth revetment ring per launcher; 4БО green |
| **ЗСУ-23-4 Шилка** ×2 | perimeter corners (−225,+190),(−45,+190) | 6.54×3.13×2.58 hull, box turret (ring 1.84), 4×23 mm barrels (water jackets), Gun-Dish radar, tracks, 4БО |
| **ЗУ-23-2** ×2 | gate + fuel flanks | 4.57×2.88, twin 23 mm, folded-wheel platform, 4БО |
| **П-18 radar** | (−105,+150) | rotating 16-Yagi billboard 14×6 m on a mast/truck, 4БО |
| **Fuel farm ГСМ** | (−215,+105) | 4–6 РВС tanks (Ø6.6–10 m, **silver**, yellow band), earth bund berm, pump house; **ТЗ-22** bowser (KrAZ tractor + 13 m Ø2.4 cylindrical tank) |
| **Ammo depot** ×3 | (−60,+100) dispersed | earth-covered concrete bunker 30×8 m, blast doors, vent stacks, «ОПАСНО»/«ВЗРЫВООПАСНО» |
| **КПП gate** | (−135,+85) | guard house 6×3 m, red/white шлагбаум barrier, «СТОЙ! ПРЕДЪЯВИ ПРОПУСК», red star, «В/Ч 32156» board |
| **Barracks/штаб** | (−205,+92) | 2–3 storey ochre-yellow render, window rhythm, porch, **«СЛАВА СОВЕТСКОЙ АРМИИ!»** slogan board, red star, 10 m flagpole + Soviet flag |
| **Windsock + fire station + watchtowers + floodlight masts** | thresholds / corners | windsock orange/white cone 3.6 m on 6 m mast; fire station red + АЦ-40 (ZIL-131) truck; PO-2 fence (2 m diamond panels); вышки охраны 4–6 m; прожекторные мачты 8–12 m |

## Voxel / engine notes
- Surface = flat slabs at **y≈0.05** (above the steppe ground plane → no z-fight), markings = thin proud boxes
  (+0.02) white; runway number via CanvasTexture plane. Runway/taxiway need **no colliders** (flat, step-up).
- Arch shelter = `b.geo(CylinderGeometry, rx:PI/2)` half-arch + earth berm + `_solid` side walls (collidable);
  walkable interior (door gap), the comm/taxi spur is the 2nd exit. Berm grass cap (SOD palette).
- КДП glazing: thin glass boxes tilted **rx/rz** outward 15°; tower body `_solid`; cab above reach + collider.
- Aircraft = custom merged meshes (fuselage cyl/boxes + delta/swing wings + fins + cone + canopy); parked on
  apron — collidable AABB so the player can't walk through; landmark-readable silhouettes.
- Palettes (layered shading): CONCRETE `{hi:0xc8c4ba,mid:0xa8a49a,lo:0x86837a,slot:0x5c594f}`; MASTIC `0x2a2520`;
  STEEL/CORRUG sage `{hi:0x8a9082,mid:0x6c7266,lo:0x4c5148}`; OLIVE-DOOR `0x3a4a2a`; 4БО green
  `{hi:0x6a7a42,mid:0x55632e,lo:0x3e4a1f}`; SILVER tank `0xb8bcc0`; OCHRE render `{hi:0xe6d2a0,mid:0xd2bd82,lo:0xb89e60}`;
  RED-WHITE bands `0xc1272d`/`0xece8dd`; EARTH/SOD reuse strongpoint.js values.
- Cyrillic via the `signPlane` CanvasTexture pattern (industrial.js/strongpoint.js).
- Co-op: static geometry (no authoritative logic) — safe. Loot/AA-as-cover/hot-zone wiring = later, behind `hostSim`.
- Perf: one merged mesh per material bucket; flag if `world.boxes` jumps a lot (arch shelters + aircraft + buildings).

## Build order (each: research dossier → builder → **critical review + improve** → verify crisp)
1. **Surface** (runway + taxiway + apron + markings + perimeter fence + КПП). ← FOUNDATION (this commit)
2. **Arch shelter ЗС (АУ-13)** + caponier (reused). 3. **КДП tower** (landmark).
4. **ТЭЧ hangar**. 5. **Aircraft** (MiG-21, MiG-23, Su-25 — showpiece). 6. **ПВО + radar** (С-75, Шилка, П-18, ЗУ-23-2).
7. **Support** (fuel+ТЗ, ammo bunkers, barracks/штаб, windsock, fire station, watchtowers, floodlights). 8. Signage+lighting pass.

## Integration
`world.js _buildSteppe()` → `buildAirfield(this, 0, 0)` (world coords) + import; boulder-exclusion for the airfield
footprint. Cache-bust on each deploy.

## Verify (per skill, pixelation OFF)
Serve fresh port; `GAME.engine.setPixelScale(1)`; screenshot 3 exterior angles + FPV walk + a top-down; Read each.
Confirm layered shading, Cyrillic legible, correct shapes (arch/glazing/jet silhouettes), **no z-fight**, КДП+tower
visible at distance, **0 console errors**; walk colliders (runway flat-walkable, shelter interiors enter, can't clip
aircraft, step-up); `GAME.world.boxes.length` sane. **Not every first model is good — review critically + iterate.**
