# BUILD — mortar-82pm37 (82-ПМ-37 / БМ-37, 82 mm battalion mortar)

Voxel modelgen model. Subject: Soviet 82 mm battalion mortar M1937 (Stokes-Brandt: smoothbore
muzzle-loaded tube + two-leg bipod with spring shock-absorbers + round dished baseplate).
Built for the co-op **indirect-fire mortar** mechanic (branch `feat/coop-mortar`): a **4-DOF rig**
so the gunner can elevate/traverse the piece and the screws visibly turn.

## Provenance
`ref/dossier.json` — sourced via a research subagent from ru.wikipedia, the НСД-40 service manual
(fb2.top mirror of the arsenal-info copy), Музей Победы / Парк Патриот, vimpel-v, opoccuu.
Sourced: caliber 82, tube 1220 mm, combat 56 kg, elev +45..+85°, traverse ±3° fine, fixed firing
pin, 2 shock-absorber cylinders, round membrane plate, sight МПМ-44М/МП-82, ball-joint tube seat.
**Authoring dims** (baseplate Ø, tube OD, bipod geometry, screw sizes) are **photo-scaled** against
the sourced 1220 mm tube in ref1/ref2 — recorded in `dossier.derived_dimensions` with method (honest
derivation, not invention); the genuinely-unsourced bits stay in `needs[]`.

## Build
`gen.mjs` is a parametric generator (run `node models/mortar-82pm37/gen.mjs` → `spec.json`). Barrel
parts are placed along the bore axis at the 52° rest elevation via `pt(f)`, each authored `axis:'z'`
+ `rot:[-52,0,0]`. Bipod legs use a closed-form `legGeom(apex,foot)` that maps a vertical cylinder's
+Y onto the apex→foot direction (`rz=atan2(-dx,√(1-dx²))`, `rx=atan2(dz,dy)`). 38 parts, materials
paintOD / steel / bakelite / paintBlack / gunGrey / cream. Coil springs are real helixes swept by the
`tube` op (`helix(R,turns,h)` polyline).

## Rig (4 DOF + muzzle marker)
- `azimuth` — spin Y, pivot at the baseplate ball-socket. Yaws the WHOLE piece to bearing.
- `elevation` — hinge X, pivot ball-socket, parent azimuth. Pitches the **barrel assembly** (tube,
  breech, clamp, shock absorbers, trunnion, sight, traverse screw) about the socket — breech stays
  seated, muzzle elevates. Range ≈ +45..+85° (rotation.x −0.58..+0.13 around the authored 52°).
- `elevScrew` — spin Y, parent azimuth. The exposed elevation lead-screw turns as elevation changes.
- `traverseScrew` — spin X, parent elevation. The traverse handwheel turns as fine azimuth changes.
- `muzzle` — marker (no parts), parent elevation, at the bore mouth `[0,1.166,0.54]` → projectile spawn.
Hollow muzzle: a dark `paintBlack` bore cylinder recessed into the muzzle reads as an open tube.

## Rounds
1. First build: lint clean, scale good vs the 1.75 m ghost, BUT the bipod legs lay flat on the ground
   and the spade feet were detached (compound `rot` angles wrong — `rotated-builder` is Euler XYZ and
   my signs were off). Muzzle/baseplate/tube all good first try.
2. Fix: closed-form `legGeom` → legs now stand as a correct A-frame to the spade feet. Re-rendered the
   canonical sweep (front/q34/side/back34/top/graze) + a **rig articulation test** (elevation→~75°,
   azimuth→+26°, both screws spun): confirmed the barrel pitches about the ball-socket and the whole
   piece yaws correctly. No z-fighting at graze. Footprint tightened to 0.8×1.2×1.15 (fills 99/98/98%).
3. Fine detail (owner request): added the two **shock-absorber coil springs** (real helix via `tube`),
   the **white aiming line** along the tube (gunner side), and the **bipod cross-leveling** box+knob.
   38 parts, lint clean, re-rendered — springs read clearly as coils, no z-fight.

4. Texture + detail polish (owner: "vylepsit trochu model i texturu"). Tube `cylinder` →
   **`texturedCylinder`**: panel rings + lengthwise seams + REPRESENTATIVE Cyrillic stencils
   («82-ПМ-37», «82 мм», «ОТК» acceptance stamp, proof ★ — designation/caliber are sourced, the
   stencil LAYOUT is representative → noted in needs[], no invented serial). Baseplate ribs →
   short **dark-green** hub gussets (paintOD lo, 6×) so the plate reads as a dished membrane, not
   a bright spoked wheel. Added a breech **reinforce band** (torus) + a riveted **data plate** on
   the trunnion cheek. 40 parts, lint clean, re-rendered the full canonical set — designation reads
   on back34, hollow muzzle clean at graze, scale good vs the 1.75 m ghost, no z-fight.

5. Owner fixes + a research-backed kinematics correction (НСД-40 fact-check). REMOVED the exposed coil
   springs and the white aiming line (owner). FIXED the traverse handwheel: it floated off the screw —
   re-seated the handwheel + hub ON the screw axis (y=0.475, z=0.085) at the screw's outboard end, and
   moved the `traverseScrew` pivot onto that axis. Brought the **bipod feet CLOSER** (±0.36→±0.25, z0.50→
   0.40) for a tighter planted stance; tightened footprint to 0.62×1.2×1.15 (92/98/98%). Lengthened the
   elevation lead-screw into a clearer gearbox→swivel bridge. 37 parts, lint clean, re-rendered rest set.
   **Kinematics note (sourced):** the tube pitches about the baseplate BALL-JOINT while the legs stay
   planted and the вертлюг RISES on the lead-screw — a COUPLED motion. A bare hinge rig separates the
   planted legs from the rising mount at high elevation (verified at ≈+80° in the viewer), so the
   apex-rise/screw-telescope must be driven as a RUNTIME animation by the firing mechanic. Rest pose
   (≈52°) is correct and connected. Logged in needs[].

## Definition of done — ✅
lint clean · node tests green (operators untouched) · canonical rest renders + ghost saved in
`renders/`, each Read and defect-free · this BUILD.md.

## Known simplifications / needs[] (v1)
- Control-cluster sides: sight modelled LEFT, traverse handwheel RIGHT (dossier flags real side as
  unsourced; classic layout is both-LEFT — easy to flip if wanted).
- Baseplate = flat dished puck + raised rim + radial ribs (true concave membrane dish approximated).
- Authoring dims photo-derived, not from a ГОСТ table (museum/ТТХ pages omit baseplate Ø + bipod dims).
