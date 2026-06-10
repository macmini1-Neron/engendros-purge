# gramophone — BUILD log

Subject: H.K.M. Ленинградский граммофонный завод portable wind-up патефон (78 rpm suitcase
phonograph). Procedural modelgen V2 spec (curve ops). Source: owner's 14 in-hand reference
photos + ПТ-3 catalog class + ГОСТ 5289 record. See `ref/dossier.json`.

Harness extension for this model (modelgen V2 curve ops, all THREE-bound/browser-verified):
`torus`, `tube` (CatmullRom swept bar — the S-tonearm), `texturedDisc` (swappable canvas record
label — `makeRecordLabelTexture` exported for runtime per-song reskin), `decal` (lid maker logo +
engraved control plates). New palette materials: chrome, granitol, shellac, feltTeal, cream.
`node --test` 63/63 green; `lint.mjs` clean.

## Round 1
Built 0.38×0.40×0.45 m (lid posed open at -1.9 rad). q34/front/side/top/ghost captured + Read.
Reads instantly as a Soviet suitcase patefon. Defects:
- lid maker logo barely visible — lining+logo authored at y0.112-0.116, INSIDE the lidShell box
  (0.11-0.16) -> occluded by the shell.
- crank knob dipped below the floor (min_y -0.02).
- record label a touch small.

## Round 2
- moved lidLining->y0.106 + lidLogo->y0.102 (proud of the shell underside); enlarged logo 0.15x0.19.
- raised crankDrop/crankKnob -> min_y 0 (clears floor).
- recordLabel r 0.045->0.05.
Logo now renders but dim on the shadowed angled lid lining.

## Round 3 (final)
- bolder lidLogo canvas (bigger cream diamond, red СССР flag, gold caption) + a faint emissiveMap
  on the lidLogo decal so the printed mark self-lights and reads at any lid angle.
Final renders q34/front/side/top/ghost saved in `renders/`. Ghost (1.75 m human) confirms scale
(a small case on a surface). Lint clean, 32 parts, 4 honest needs[] (all "estimated-from-photo,
not a measured spec sheet" — acceptable; recorded, not invented).

## Definition of done
lint clean / node --test 63/63 / canonical render set + ghost saved / every view Read, defects
fixed / BUILD.md. Animation rig contract (userData by rig name): lid (hinge x), turntable (spin y),
tonearm (swing y), crank (spin x) — driven at runtime by fonoteka.js.

## Revision 2026-06-10 (fonoteka polish)
- Lid maker's logo: was a vertical plane (normal ±Z, invisible edge-on); now `axis:y` + `rot[180,0,0]`
  so it lies flat on the lining and faces the viewer when the lid is open (the "reversed sticker" fix).
- Speed/auto control plates: `axis:y` so they lie flat on the deck (were standing 90° vertical).
- Black record vinyl: `cylinder` → new standalone `disc` operator, so the WHOLE record (vinyl + label)
  lifts off the platter as one piece during the runtime record-swap animation (fonoteka.js groups them
  into a `disc` node under the turntable). 67/67 tests, lint clean.
