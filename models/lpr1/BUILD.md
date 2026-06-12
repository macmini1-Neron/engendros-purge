# lpr1 — build log

ЛПР-1 «Каралон-М» (1Д13) hand-held laser rangefinder. Spec authored from
`ref/dossier.json` (PAR.pdf ch.5 + ru.wikipedia dims 221×226×116 + training-deck
slide photos, local copies `ref/slide-*.jpg`). 41 parts, 10 materials
(new palette entries: `paintOchre` housing, `lensGlass` coated optics).

Axes: +Z = front (objectives), −Z = rear (eyepieces/controls), X across, floor-anchored.
Operator looks along +Z → operator's LEFT eye = indicator eyepiece = **+X**.

## Verify rounds (isolated headless chromium driver — shared MCP browser was busy;
driver at /tmp/lpr1-driver/{shoot,closeups}.mjs, server :8463)

**R1** — lint green first try (39 parts). Defects from renders:
- rear panel MIRRORED (battery/visor/plates swapped vs slide-18) → negated X of all rear features
- СТРОБИРОВАНИЕ scale: cream disc covered the whole drum face (read as white drum) → thin cream torus ring on the black drum face
- label plates rendered as floating black stripes (stencil has no backing) → black `panel` + cream `stencil` lines stack
- battery cap+handle oversized → shrunk r/h
- ИЗМЕРЕНИЕ buttons sat mid-body and collided with the carry handle posts → moved row to the rear edge (z −0.045), handle to z −0.015

**R2** — layout now matches slide-18 1:1 (battery far left, ВКЛ top-left, drum top-centre
between eyecups, blue visor glass, ПОДСВ + warn plate right, brass разъём bottom).
Remaining: plate text bars too thick, strobe ring half-shadowed, button fins too subtle.

**R3** — thinner stencil text (name 0.018×0.009/3, warn 0.028×0.012/4), torus tone bright,
fins h 0.015. Final sweep front/q34/side/back34/top/graze + ghost + bbox all Read clean:
no z-shimmer at graze, ghost scale correct (~23 cm box vs 1.75 m figure).

Built bounds 235×140×235 mm vs footprint 226×116×221 — overage = carry-handle arch (Y)
and strap proud (X/Z); core body is at dossier dims. Lint green, 67/67 node tests.

## In-game round (headless, ?map=steppe — logic + overlay verified)
`/tmp/lpr1-driver/verify-game.mjs`: spec registers at boot · grant+inventory+select →
`lprRaised` true, FOV eases 80→6.7 · stubbed 437 m ray → display `00437`, `lprCD` 5 s ·
second pulse during cooldown swallowed · 80 m (< 145 m strobe floor) → `00000` ·
готовность lamp dark during cycle, relights after · `#lprview` overlay + digits + lamps
painted (renders/lpr-ingame-*.png) · 0 real console errors (one headless pointer-lock quirk).
Viewmodel fix found here: the vm is authored z-flipped vs the spec (rear at +Z), so all
asymmetric feature X had to be negated — a z-flip without an x-flip is a mirror.

## R4 — owner pass 2: "zaoblené, ne krabice; custom meshe; jemnější žebra"
New marketplace photo set (olive unit, all faces) added to ref/ knowledge. Changes:
- new THREE-bound op **`loaf`** (rounded stadium-profile extrusion) → spec body + rear
  panel are now true rounded castings; ribs subtler/shorter (0.006×0.004×0.095)
- laser window re-coloured per the photos: new palette `lensLaser` (yellow-green 1.06 µm
  coating); objective stays deep blue
- **viewmodel fully resculpted** as custom meshes (binoculars-grade): extruded capsule
  body + sculpted panel casting, lathe eyecups/knobs/battery cap, knurled СТРОБ drum +
  cream ring + slot screw, half-moon button guards (extruded semicircles), dome rubber
  buttons, strap lugs + slim handle, brass knurled разъём, slotted screws, T-slot bracket
- objective cover deliberately OFF (owner: "chceme jak to máme — otevřené")
Verified: lint green, 67/67 tests (loaf covered), headless in-game logic re-run all green,
front/rear vm screenshots renders/lpr-vm-front.png + lpr-ingame-hip.png.

## Deliberate omissions (see dossier needs[])
objective cover (modeled OFF / in-use), bottom data plate, exact aperture diameters
(ДСП-classified; photo ratios + 44.8 mm derivation used), reticle span numbering.
