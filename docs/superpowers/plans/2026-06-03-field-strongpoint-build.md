# Field Strongpoint (Опорный пункт) — Build Plan

**Goal:** an ultra-detailed, real-referenced **WW2 Soviet field strongpoint** as the steppe-map home base,
built per the `voxel-building-modeling` skill (research → spec → build → integrate → verify, one structure
at a time). Built in `src/strongpoint.js`; entry `buildStrongpoint(world, cx, cz)`.

**Research:** 6 dossiers (2026-06-03) — траншея, ДЗОТ, землянка, блиндаж, заграждения, НП/КП-42/колодец.
Sources incl. Osprey *Soviet Field Fortifications 1941–45* (Rottman), US War Dept 1946 Handbook Ch.VI,
ПФ-43, victorymuseum, grozniedni.ru, lonesentry, Wikipedia. All dims below are **real metres (1 u ≈ 1 m)**.

## Placement (world coords, +X east, +Z north)

Anchor **C = (−150, −90)** — open steppe ~**156 m SW** of the kombinát yard centre (0,−46); clear of the
W fence (x=−79) and the W mountains (x=−250). Main approach faces **NE (toward the kombinát)**; second
lane **SW (escape toward the lowland/lake)**. All-round defence (круговая оборона), Ø ~70 m.

| Ring | r (m) | Structures |
|---|---|---|
| Core | 0–10 | **Блиндаж** (command, radio+map, КП+★) @ C; **Землянки** ×3 (dílna/sklad/spaní); **medpunkt** zemlyanka (✚); **КП-42** field kitchen; **колодец-журавль** well; **НП вышка** tower |
| Fire trench | ~24 | bay-and-traverse parapet ring, 360°, **2 gaps** (NE main + SW); 3 communication trenches inward |
| DZOTs | ~24 | **ДЗОТ ×4** on the ring (NE/SE/SW/NW); NE one mounts the **.50cal** |
| Obstacle belt | ~31–36 | wire fences (3-row) + **ежи** (hedgehogs) + **рогатки** + **МИНЫ** signs; 2 lane gaps aligned to the entrances |
| Vehicle | ~SW | **капонир** (dug-in revetment) for the captured tank by the SW lane |

Concrete coords: blindazh (−150,−90) entr→NE · zemlyanka dílna (−162,−82) · sklad (−164,−96) · spaní
(−150,−104) · medpunkt (−138,−98) · kitchen (−140,−82) · well (−158,−100) · tower (−143,−85) · DZOT NE
(−133,−73,.50cal) SE (−133,−107) SW (−167,−107) NW (−167,−73) · revetment (−176,−112).

## Voxel translation (game design)

- **Trench = above-ground breastwork** (AABB can't dig below y=0): walkable lane (y=0, ~1.4 m wide) between
  an **outer parapet** (`_solid`, h≈1.2 m, firing-step notches to ~1.0 m → shoot over while standing, eye≈1.6 m)
  and an **inner parados** (h≈0.85 m); **traverses** (h≈1.5 m earth blocks) alternate sides every ~12 m → the
  lane dog-legs (anti-enfilade). Sod-green cap + earth body, layered shading. 2 gaps = entrances; comm trenches
  branch to the core. Satisfies "multiple covered routes / no dead end".
- **Dugouts (zemlyanka/blindazh) = earth-and-sod mounds** built up from y=0 (not dug): low log walls + накат +
  sod roof; **walkable interior** with a real door GAP; the comm trench is the 2nd exit (survival rule). Blindazh
  mound is the biggest/tallest (heavy 3-накат core).
- **DZOT** = low log-crib earth mound (~4×4×1.2 m) with a dark splayed **embrasure** facing its sector + soot;
  rear entrance gap to the trench.
- **Collision:** parapets/traverses/dugout walls/tower legs/hedgehogs = `_solid`/`collider`; sod caps, roofs above
  reach, wire, signage = visual `b.box`/`b.geo`. Step-up ≤0.62 m respected (no ramps).
- **Cylinders** (`cyl` helper, dispose after): chimneys/stovepipes, well pole, kitchen cauldron+chimney, tower posts.
- **Draw calls:** merge per material bucket (earth, timber, steel) like `industrial.js`. Watch `world.boxes`.

## Palettes (layered shading — Hi/Mid/Lo/Slot, never near-black main)

- EARTH `{hi:0x6b5440, mid:0x54422f, lo:0x3e3122, slot:0x2a2017}` (chernozem parapet/mound body)
- SOD `{hi:0x7c8a4e, mid:0x63713c, lo:0x49542b, slot:0x333b1d}` (turf cap; matches steppe ground)
- LOG `{hi:0x9a7a4e, mid:0x7c6038, lo:0x5a4427, slot:0x3a2c19}` (timber) / fresh-cut end `0xc4a574`
- WHITE `{hi:0xe6e0d2, mid:0xd2ccbc, lo:0xb3ad9c}` (известь whitewash gable/door/stovepipe)
- STEEL rust `{hi:0x8a5a34, mid:0x6e4526, lo:0x4e301a}`; dark steel `0x44464d`; wire `0x9a958b`/rust `0x6e4526`
- PLANK `0x6a5230`/`0x4f4231` (doors, duckboards, benches); KITCHEN green 4БО `0x555c36`

## Cyrillic signage (CanvasTexture planes, opaque pass + alphaTest, proud of surface — `industrial.js` pattern)

`КП` (white/grey board) + **★** red on blindazh lintel; `НП` on the slit; `МИНЫ` (red on white) on belt stakes
@ ~40 m; door labels `ЖИЛАЯ` / `СКЛАД` / `МАСТЕРСКАЯ` / `САНЧАСТЬ` (+✚); `ВХОД`; `ВОДА` at the well; a
`ЗА РОДИНУ!` plank slogan; sector stakes by the DZOTs.

## Build order (each: spec from dossier → builder → integrate → verify)

1. Earthworks: **trench ring + traverses + comm trenches + 2 gaps** (the skeleton).
2. **Блиндаж** (core). 3. **Землянки** ×3 + medpunkt. 4. **ДЗОТ** ×4 (+.50cal NE).
5. **Obstacle belt** (wire/ежи/рогатки/МИНЫ). 6. **НП вышка** + **КП-42** + **колодец** + **капонир**. 7. Signage pass.

## Integration

`world.js _buildSteppe()` → add `buildStrongpoint(this, -150, -90);` (after `buildIndustrial`) + import; add the
base footprint to the boulder-exclusion (`hypot(x+150,z+90) < 48` → skip) so no boulder clips the camp.
Co-op: the base is static geometry (no authoritative logic) — safe. `.50cal` mount + survival stations
(kitchen/well/medpunkt → hunger/water/heal) are a later wiring step (flag, don't block the build).

## Verify (per skill)

Serve `:8140` `?map=steppe&cb=N`; screenshot 3 exterior angles + FPV walk; Read each. Confirm: layered shading
reads, Cyrillic legible, correct mounds/embrasures/roofs, **no z-fight**, tower/blindazh visible at distance,
**0 console errors**; walk colliders (can't clip walls, trench walkable both gaps, dugout interiors enter, step-up
climbs); `GAME.world.boxes.length` sane.
