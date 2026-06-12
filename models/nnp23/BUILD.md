# nnp23 — ННП-23 «Резчик» (1ПН54) build log

Soviet day/night artillery observation device on tripod. Spec authored in metres from
`ref/dossier.json` (authoritative TTX = archived official НПЗ product page; masses + kit
verified off a military-academy slide read directly; tripod geometry photo-derived and
flagged in `derivation`).

## Round 1 (initial 29-part spec)
- Lint clean first pass: built 0.907×1.701×0.902 m vs footprint 0.92×1.70×0.92 (fills 98–100%).
- `VIEWER.load` dims 907×1701×902 mm — total height 1.70 m matches derivation target; min_y −9 mm
  (rotated leg corners, acceptable).
- Canonical sweep findings: silhouette + drum/bezel/lens + stencil blocks + knobs + tripod tilts
  all read correctly; ghost (1.75 m) confirms device tops out ~head height like the academy photo.
- Defects: binocular eyepiece assembly too faint (thin tubes only, no bridge housing — photos show
  a prominent black block); eyecups slightly small (Ø60 vs ~Ø66 with rubber bell); objective drum
  missing its clamp band.

## Round 2 (final, 31 parts)
- Added `eyeBridge` (black 115×70×55 housing), enlarged eyecups to r 0.033/h 0.07 (pushed back to
  z −0.375), added `objBand` clamp ring on the drum; footprint d 0.92 → 0.94.
- Dossier `derivation` extended to cover the bridge + band (photo-scaled vs sourced 245 mm width).
- Re-lint clean (fills 99/100/99%), 63/63 node tests green, full canonical set + ghost re-shot at
  the final spec — back34 now clearly reads the binocular assembly; graze shows no shimmer.

## Rig
`azimuth` (Y spin at limb, full 60-00) → `elevation` (X hinge at trunnion, ±3-00 = ±0.3142 rad),
ranges straight from the НПЗ table — the in-game observation-post mount drives these nodes.

## In-game integration (same session)
- `src/nightpost.js` — `NightPost`: world prop (steppe, beside the strongpoint НП tower at
  (−321.5, −296.5), laid ~N) + E-mount scope view. Sourced behaviour: fixed magnification
  (no zoom), night 5×/FOV 5.3° vs day 5.5×/6° on **T** branch toggle, elevation clamp ±3-00,
  full 60-00 azimuth, damped handwheel slew (SHIFT = coarse), wheel = ЯРКОСТЬ СЕТКИ, угломер
  mils readout. Camera sits at the OBJECTIVE face (periscopicity: +350 mm over the cups) —
  at the eyepieces it would stare into the device's own drum (verified bug, round 1 in-game).
- NV look = `#game.nvgreen` CSS filter + per-frame light boost in `lateLight()` AFTER DayNight
  (amb 2.9 / hemi 1.8 / sun 0.95 / exposure 2.18 / fog→2000 m). ⚠ ACES shoulder is a CLIFF:
  exposure ~2.1 reads dim, ~2.4 whites out — tune in small steps against a FROZEN clock
  (`dayNight.active=false`), the live cycle moves the baseline mid-comparison.
- Overlay `#nvview` (index.html): mask + phosphor base-glow + representative ПСО-style reticle
  SVG + animated grain + У/В mils readout. Admin viewer entry in admin.js.

## Reticle calibration (owner-requested, verified)
The graticule is now METRICALLY TRUE, not decorative. Landscape math (1vmin = 1vh): night FOV
5.3° = 88.34 д.у. over 100vh; the 76vmin SVG → 1 д.у. = 14.895 SVG units. Ticks small = 0-05,
tall = 0-10 (so Д = В×1000/У works); stadia = 1.5 m Soviet-standard base, gap(R) = 21340/R units
(2→106.7 … 10→21.3); chevron tip = optical axis. Day branch (FOV 6°) shrinks the SVG ×0.8833 in
CSS to stay true. **Proof:** projected a 1.5 m target at 400 m through the live camera — screen
gap 33.7 px vs stadia gap 33.7 px, ratio 1.000 on both branches. NOTE: an Engendros grunt is
~2.2 m tall, ~1.5× the stadia base — gauge accordingly. Controls hint now sits BELOW the optic
circle (#interact.nvlow) and fades out after ~6 s (resurfaces 3 s on branch toggle).

## Round-3 polish (owner feedback, verified)
- **Zoom split kept** — day 5.5×/6° vs night 5×/5.3° is the sourced НПЗ spec, not a bug; left as-is.
- **Stadia + baseline moved fully LEFT of the centre post** (2,4,6,8,10 + the «1,5» baseline all
  at x<500). Calibration is the VERTICAL gap only (gap=21340/R units), so x-relayout is free —
  re-verified live: 1.5 m @ 400 m projects 33.7 px == stadia gap, ratio 1.000 on both branches.
- **Controls hint was invisible** — `#interact` lives inside `#hud`, whose stacking context trapped
  it BELOW the `#nvview` optic overlay (z-index 11), so only a clipped sliver showed over the black
  surround. Fix: a dedicated `#nvhint` div INSIDE `#nvview` (sibling of `#nvreadout`), driven
  straight from `nightpost.js` (`_showHint` + the `_hintT` timer in controlUpdate). Now paints
  above the mask, sits below the circle / above the readout, Russian labels («E отойти · T день/ночь
  · SHIFT грубо · колесо ЯРКОСТЬ СЕТКИ»), fades out when the timer hits 0 (traced 0.2→0.1→0→hidden),
  resurfaces 3 s on a branch toggle, cleared on exit. game.js no longer routes the hint through the
  shared prompt while mounted.
- ⚠ Verify trap: bare ES-module imports ignore the page `?cb=`, so Chrome serves the cached
  `src/*.js` — confirm with `curl …/src/nightpost.js` then load from a FRESH PORT to force a refetch.
  Also headless Playwright pauses rAF when the tab is hidden (timer freezes); drive `controlUpdate(dt)`
  directly to test frame logic.

## Lifecycle / exit-path cleanup (mini-fixes, verified)
`NightPost.forceReset()` (→ exit, restores FOV/lights/exposure, drops the `.nvgreen` filter +
`#nvview` overlay + `#interact.nvlow`) is now called from EVERY way you can leave a run while at
the eyepieces: `onPlayerDead`, `toMenu`, `_mpReturnToLobby`, `reset` — and `toggleFreecam` now
`exit()`s the optic before flying (was: green view stuck + camera fight). Browser-verified:
enter→freecam ejects clean; enter→death leaves the death screen un-tinted, no lingering nvlow.

## Open needs
See spec/dossier `needs[]`: transport case + tripod cover unmodeled, буссоль fitting + leg straps
simplified, warning-plate text abstract, true 1ПН54 reticle drawing unverified (game reticle is
representative ПСО-style per owner reference image).
