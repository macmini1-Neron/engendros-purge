# Revolving 4-barrel flintlock pistol — gold & ivory (Denix-style) — BUILD LOG

Build script: `C:\Modely\revolving_4barrel_pistol.py`
Outputs: `C:\Modely\revolving_4barrel_pistol.blend` + `.glb`
Dossier: `revolving_4barrel/dossier.json` · Coin provenance: `revolving_4barrel/luka_coin_source.js`

## Brief (owner)
Denix "Revolving 4 barrel flintlock pistol, France 18th. C." reimagined:
- ALL metal = GOLD (no steel anywhere). Only: grip = IVORY, coins = COPPER, flint = grey stone, bores = dark.
- Barrel cluster REVOLVES about the bore axis after each shot.
- "Fires" COPPER COINS taken from the Luka boss (`bosses/luka/coin.js`, variant `copper`, exact palette).
- Presentation: catalog hero at rest + pile of copper coins beside.

## Key facts
- Overall ~305 mm (Denix 4-barrel models 1307/1310), ~1159 g. Barrel cluster 165 mm, barrels Ø13 mm,
  4 in a touching diamond (Rc = 13/√2 = 9.2 mm). Coins ported 1:1 from Luka `coin.js` copper variant
  (metal `0xCB5A1E`, edge `0x863F16`, $ engraving `0x4E2A0C`, 5 Kč-style bumpy rounded rim, $ both faces).

## Rig — the revolving barrels
`BARREL_PIVOT` (empty, parented to `ROOT_Pistol`, origin on the bore axis = X) owns the barrel cluster
+ bores. Rotating `BARREL_PIVOT` about its local **X** indexes the next barrel; the lock (cock/frizzen)
stays fixed. Verified with a 45° demo render (`r3_revolve45.png`). The empty survives the GLB export as a
node, so the cluster is animatable in-engine.

## Rounds
- **R1** — full parametric build. Silhouette right (gold cluster + raked ivory grip + bulbous gold pommel).
  Muzzle clover cap + 4 dark bores in the diamond = excellent (matches ref image 6). Coins on the ground OK.
  DEFECT: lock = separate beveled cubes + subsurf → gaps → cock/frizzen floated as debris.
- **R2** — rewrote lock as single connected swept-ribbon solids (`build_ribbon_xz`) anchored to the breech;
  cock now a coherent S holding the flint, frizzen a connected L, no subsurf. Increased grip rake to the
  plow-handle sweep. Replaced "random crescent" grip volutes with elegant gold edge-lines + filigree S-vines
  + rosette dots + a ferrule ring at the grip/frame junction. Coins moved closer/more prominent.
- **R3** — verified revolve (45° index), final canonical renders. Hero "money shot" (gun + copper coins).

## Renders (final = r3_*)
`r3_hero.png` (gun + copper coins), `r3_side.png` (ortho profile), `r3_muzzle.png`/`r1_muzzle.png` (clover),
`r3_back34.png` (lock side), `r3_revolve45.png` (cluster indexed 45°).

- **R4-R6 (grip research + animation)** — owner: "proporce rukojeti nesedí, uprav podle obrázků + výzkum"
  + chtěl animaci rotace.
  - Re-measured grip off ref image 1 (scale ~0.367 mm/px vs the 165 mm barrel): real grip is a SHORT
    bird's-head scroll-butt, diagonal ~96 mm, raked back ~45° (back-sweep ≥ drop). R1-3 grip was ~166 mm
    (≈2× too long) and too thin/banana. Fixed: `GRIP_DROP` 0.130→0.066, `GRIP_TOP_X` -0.030→-0.068,
    new `grip_curve` (oval section, deeper front-back than side-side, flares down), frame strap bridging
    breech→grip neck, trigger moved to a fixed forward position.
  - Pommel rebuilt from a small sphere into a flared trumpet/mushroom cap (ref image 4): cone flare +
    rounded under-dome + rim bands + radial acanthus petals, oriented along the grip's down-axis. Tuned
    flare width down (1.95→1.62×) so it's a chunky knob, not a flat lamp-base.
  - **Revolve animation**: `build_revolve_animation()` keyframes `BARREL_PIVOT` rot X — 4 shots, snap 90°
    + hold each (BACK/ease-out), frames 1-96 @ 24fps. Baked into .blend AND .glb (glTF bakes the BACK
    easing). Demo: `renders/revolve_anim.gif` (48-frame EEVEE muzzle view, assembled with Pillow) +
    `renders/spin_strip.png` (0/30/60/90° stills). Blender 5.1 needs the slotted-Action fcurve fallback.
  - Final stills (Cycles): `r5_hero.png` (money shot, coins show the $), `r5_side.png`, `r6_muzzle34.png`.

## R7-R14 — REAR REWORK (owner: rebuild everything behind the barrels, keep the 4-barrel module)
The breakthrough: stop guessing numbers — **trace the side silhouette from ref image 1 and extrude it**,
then **overlay** the render over the photo (PIL, mirror as needed, scale 0.80, paste at (-77,-14), 55% alpha)
to verify. Overlay images: `overlay_ref*.png`; side-by-sides: `compare_side*.png`.
- **Grip** is now an extruded TRACED profile (`GRIP_PROFILE`, `extrude_xz`+subsurf), not parametric. Raked
  ~42° back, toe curls forward.
- **Slender ivory WRIST** (research: "flintlock stocks have a slender wrist"): the ivory stock rises to the
  barrel level to form the wrist; the metal between barrels and grip is just a thin standing-breech plate
  (barrels plug in) + a thin barrel tang on top. No thick block (owner: "ta část za hlavní je moc vysoká tlustá").
- **Side plates REMOVED** (owner). Only a small bolster around the cock pivot + pan + light engraving.
  `build_sideplate`/`SP_POLY` remain defined but unused.
- **Flintlock moved to the -Y side** (`LSIDE=-1` in `build_lock`) so the orientation matches the reference;
  render the lock side from a -Y camera.
- **Butt cap** rebuilt as one smooth lathed cap (+ acanthus petals) — not a spool, not a ball.
- **Ferrule removed**, backstrap runs continuously → reads as one piece (owner: "vizuálně z jednoho dílu").
- Massive grip (`GRIP_HW`=0.017), cock got a comb scroll + jaw ring.
- Latest: `r14_side.png` / `r14_hero.png` / `overlay_ref5.png` — overlay sits on the Denix photo well.

OPEN (owner ran low on credits — SAVE state): push the grip a touch more into an S/banana per the photo; the
grip wrist sits a bit close to the barrel end (maybe drop/space it). Then finalize the full render set + GIF.

## Known soft spots / possible next passes
- Lock cock/frizzen are flat ribbon solids — read fine at hero distance, a bit blocky in extreme close-up.
  A sculpted cock (proper goose-neck profile + thumb spur) would lift it.
- Barrels are smooth gold (owner wanted all-gold); the ref's fleur-de-lis barrel engraving is only suggested
  by turned ring bands, not literally engraved.
- Ivory uses the approved `mat_ivory` craquelure (consistent with `ornate_money_grip_v2`).
