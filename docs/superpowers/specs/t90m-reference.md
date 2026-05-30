# T-90M «Proryv» — visual/technical reference (for Task 22 model + Task 28 poster)

> **Orthographic blueprint (best modeling reference):** `assets/ref-t90m-blueprint.png` — clean 4-view line drawing (side, front, top, rear). Use it to get proportions right: 6 evenly-spaced road wheels, the long gun with thermal sleeve + bore-evacuator bulge, the angular welded turret with ERA chevrons on the cheeks, side-skirt panel rows, rear slat cage, RWS + sights + antenna on the roof. The top view shows the distinctive ERA chevron layout on the turret roof and the bustle.

User-supplied accurate reference (2026-05-29) to keep the voxel model recognizable. Source notes: T-90M is a modernization of the T-90/T-72 line — new **welded turret**, 125 mm gun, **Relikt ERA**, V-92S2F diesel (~1130 hp), ~48 t.

## Silhouette priorities (must read as a T-90M, not a generic/Western tank)
- **Low, wide, squat, heavy, compact.** Width dominates height. NOT tall like Abrams/Leopard.
- Approx dimensions for proportion: **~9.5 m gun-forward**, hull **~6.86 m**, width **~3.5–3.78 m**, height **~2.2–2.3 m**.
- **6 large road wheels per side** (critical recognizer — not 7, not 5), front idler, rear drive sprocket, continuous metal tracks, top run hidden by side skirts.
- Hull: sharply **sloped glacis** with modular **Relikt ERA** tiles (not a smooth plate); headlights low; tow hooks; front mudguards. Long flat technical rear deck.
- Turret: **new welded ANGULAR shape** (not the old rounded cast dome); ERA blocks on front + cheeks; **rear bustle/box**; busy roof.
- Gun: long straight **125 mm smoothbore (2A46-series)** — segmented **thermal sleeve**, a **bore-evacuator bulge** mid-barrel, **NO muzzle brake**, dark metal rings.
- **Smoke-grenade launchers** (tube clusters) on the turret sides. («ДЫМОВЫЕ ГРАНАТОМЕТЫ»)
- **Slat/cage ("mangal") armor** mainly rear/rear-sides — a rigid metal grid, not flimsy wire.
- Busy **turret roof**: commander cupola, panoramic sight (small rotating optic head w/ dark lenses), hatches, sensors, RWS/MG, antennas, small boxes, weld lines.
- Rear: vertical engine-deck **grilles**, tool boxes, mudguards, lights, tow points; "packed/utilitarian, not elegant."
- Materials: matte olive/khaki/sand 3-tone; black rubber + dark metal tracks; dusty lower hull; subtle weathering; dark seams between modules. No gloss.

## Copy-paste prompt — accurate 3D/voxel model
> Accurate detailed 3D model of a Russian T-90M "Proryv" main battle tank, low compact wide silhouette, modernized T-72/T-90 family proportions, long 125 mm smoothbore gun with thermal sleeve and bore evacuator, no muzzle brake, low angular welded turret, heavy modular Relikt ERA blocks on turret front, turret cheeks and glacis, side armor skirts, six large road wheels per side, continuous metal tracks, low sloped front hull, wide squat stance, detailed commander cupola, panoramic sight, optics, hatches, antennas, smoke grenade launchers, rear turret bustle, storage boxes, rear engine deck grilles, optional rear slat cage armor, matte olive drab and khaki military paint, black rubber and dark metal tracks, dusty lower hull, subtle weathering, panel seams, bolts, weld lines, handles, tow hooks, headlights, mudguards, realistic hard-surface geometry, game-ready clean topology, separate turret, gun, tracks, wheels, hatches, antennas and side skirts, recognizable from front, side, rear and top view.

## Copy-paste prompt — NEUTRAL educational poster (no weak-points / no attack guidance)
> Vintage 1980s Soviet technical classroom wall poster showing a T-90M "Proryv" main battle tank as a neutral educational vehicle diagram, DOSAAF / civil-defense "plakat" style, aged cream paper, foxing, fold creases, off-register CMYK misprint, halftone dots, risograph grain, bold Constructivist layout, portrait 2:3 format. Large clean side-profile technical illustration of a T-90M tank: long 125 mm smoothbore gun with thermal sleeve and bore evacuator, angular welded turret, Relikt ERA blocks on turret cheeks and glacis, side skirts, six road wheels, metal tracks, rear engine deck, storage boxes, antennas, smoke grenade launchers, optional rear slat armor. Add smaller front view, top view and rear view diagrams below. Add numbered technical callouts for components only: gun, turret, ERA, optics, commander cupola, hull, running gear, tracks, engine-transmission compartment, smoke grenade launchers. Palette limited to Soviet red, olive drab, khaki sand, black ink on aged off-white paper. Flat 2D screenprint illustration, sharp linework, authoritative technical museum-poster mood, no combat instructions, no target reticles, no weak-point markings, no attack arrows, no soldier, no weapon guidance, not photorealistic, no 3D render.

## Cyrillic (verified strings for the poster / sight HUD)
Headlines: **«ОСНОВНОЙ БОЕВОЙ ТАНК»** (main battle tank) · **«УСТРОЙСТВО ТАНКА»** (construction of the tank) · **«Т-90М „ПРОРЫВ"»**
Legend: **ПУШКА 125 ММ** (125mm gun) · **БАШНЯ** (turret) · **ДИНАМИЧЕСКАЯ ЗАЩИТА** (ERA) · **ПРИЦЕЛ** (sight) · **КОМАНДИРСКАЯ БАШЕНКА** (commander cupola) · **КОРПУС** (hull) · **ХОДОВАЯ ЧАСТЬ** (running gear) · **ГУСЕНИЦЫ** (tracks) · **ДВИГАТЕЛЬНО-ТРАНСМИССИОННОЕ ОТДЕЛЕНИЕ** (engine-transmission compartment) · **ДЫМОВЫЕ ГРАНАТОМЕТЫ** (smoke grenade launchers)
Gunner-sight HUD (from earlier ref img19): **ТЕПЛО** (thermal) · **ДЕНЬ** (day) · **ДАЛЬНОСТЬ** (range) · **ОГОНЬ** (fire) · **ЗАРЯД** (loading) · `ОЧ`

## Negative prompt
> No Abrams, no Leopard 2, no Challenger, no Merkava, no World War II tank, no fantasy tank, no overly tall turret, no seven road wheels, no smooth rounded toy shape unless stylized, no photorealism for poster, no glossy render, no neon colors, no modern UI, no anime, no inaccurate twin cannon, no giant sci-fi weapons, no target reticles, no attack arrows, no weak point labels, no tactical destruction guide, no soldier aiming weapon.

## Poster decision (in-game) — RESOLVED
The user generated and chose the **(B) weak-points teaching** poster: **«СЛАБЫЕ МЕСТА Т-90М»**, 1980s Soviet plakat style, side-profile T-90M with red marks — ① КОМАНДИР (commander, target reticle = capture path), ② КРЫША/МОТОРНАЯ ПАЛУБА (roof/engine deck), ③ КОРМА (rear), ГУСЕНИЦЫ И ХОДОВАЯ ЧАСТЬ (tracks/running gear), КОРМА БАШНИ (turret rear), and «ДИНАМИЧЕСКАЯ ЗАЩИТА — БРОНЯ НЕ ПРОБИВАЕТСЯ» (ERA front = no penetration). Red star bottom-left.
**Saved to `assets/poster-t90m-weakpoints.png`** (687×1024 RGBA). This is the in-game onboarding wall poster for Task 28 — it teaches the two paths diegetically (so Task 27 banners can be lighter; the poster carries the weak-points lesson visually).
