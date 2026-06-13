# P-37 «Bar Lock» (П-37) — MOUNTING / SUPPORT GEOMETRY

The dish dimensions (9.7 × 3.0 m, f = 2.5 m, identical) are settled (see `dossier.json`,
`arrangement.md`). **This file fixes the part we keep getting wrong: how the two reflectors are
physically held and posed.** Every claim carries a source — a manual line (`p37_manual.txt`), a photo
filename (`ref/wNN.jpg`), or a URL. Estimates from photos are tagged **[ESTIMATED from <photo>]**;
truly unknown things are tagged **[UNSOURCED]**.

We are matching the **museum DISPLAY pose** seen in the walkaround photos (Lešany) and in the clean
net photo `wNet1.jpg` — **not** the operational +3.5° / +10.5° setting angles.

---

## TL;DR (the corrected mental model)

- **Two physically separate reflector antennas**, a LOWER and an UPPER, mounted on **OPPOSITE faces
  of the one rotating cabin** — lower in **FRONT**, upper at the **REAR**, at **different heights**.
  Manual: «спереди и сзади кабины на разной высоте». They are **not** two parallel grids side by side,
  and **not** vertically stacked on the same plane.
- Their reflecting **(concave) faces both point UP and INWARD toward the central feed throat** between
  them, so the whole thing reads as an **open book / butterfly** with the cabin in the spine.
- A **central, slightly rearward-leaning box-lattice tower** rises from the cabin roof; it is the
  rotating spine that the upper reflector hangs off, high and back.
- Each reflector is carried by a **triangulated tubular space-frame (a cradle of round-section pipe
  truss arms)** that cantilevers from the cabin top / the central tower to the **back** of the
  reflector — NOT by one solid arm.
- A **feed boom + feed column** stands at the **focus in front of each concave**, in the throat.
- **Crucial display-pose correction:** the LOWER/front reflector is **near-vertical, only gently
  reclined** (~10–20° back), while the UPPER/rear reflector is **strongly reclined** (~40–50° back).
  The two are NOT tilted by similar amounts — the asymmetry is the signature look.

---

## Q1 — Relative position of the two reflectors vs the cabin (636А)

**One LOWER reflector in FRONT of the cabin, one UPPER reflector at/behind the REAR of the cabin, at
different heights.** This is stated three independent ways:

- **Manual, descriptive:** «Антенное устройство состоит из двух зеркал (отражателей), укреплённых
  **спереди и сзади кабины на разной высоте**.» (= "fixed in FRONT of and BEHIND the cabin, at
  different heights") — quoted via ru.wikipedia / oktmo from the manual; see `arrangement.md`.
- **Manual, engineering:** «Отражатели установлены таким образом, что их **главные оси расположены в
  одной вертикальной плоскости, т.е. они совпадают по азимуту**.» (manual l.1584–1585) — both
  reflectors' main (boresight) axes lie in **one common vertical plane** and point the **same
  azimuth**. So in side view they are coplanar fore/aft; in plan view they overlap. (This is why they
  *look* like one fan from the side but are clearly two separate structures front/back.)
- **Manual, naming:** «В составе РЛС два антенных устройства – **нижнее и верхнее**.» (l.128–129,
  l.191) — explicitly a LOWER and an UPPER antenna device.

**Photo confirmation of the front/rear split:** `wNet1.jpg` (the cleanest complete view) shows the
LOWER reflector clearly **in front of** the cabin box (toward the drawbar end) and the UPPER reflector
**behind/above** it, on the far side of the cabin — they sit on opposite faces and fan apart. Also
`w02.jpg` (hero 3/4), `w03.jpg` (side), `ref1.jpg` (backlit side silhouette).

**Fore/aft offset (front reflector center → rear reflector center), [ESTIMATED from wNet1/w03]:** the
two reflector planes are separated fore/aft by roughly **one cabin-depth, ≈ 3–4 m** at their centers.
No metre figure exists in any text source. **[UNSOURCED exact offset.]**

**Height offset (front reflector center → rear reflector center), [ESTIMATED from w03/wNet1]:** the
upper/rear reflector center sits roughly **1.5–2.5 m higher** than the lower/front one — comparable to
"about half a reflector-height to one reflector-height." **[UNSOURCED exact gap.]** (Each reflector is
3 m tall — manual l.196.)

> Decisive correction to any "stacked dish" reading: they are **fore/aft offset on a common vertical
> azimuth plane**, lower-front + upper-rear — NOT coincident-stacked, NOT side-by-side.

---

## Q2 — Tilt / attitude of EACH reflector (museum DISPLAY pose)

Operational setting angles (focal-axis elevation above horizon): **lower +3.5°, upper +10.5°** — both
beams point slightly UP, the upper steeper (manual l.137–139, l.1586–1588). But **museums park the
antennas at much larger display tilts than operational**, and the photos confirm a strong asymmetry:

- **LOWER / FRONT reflector — NEAR-VERTICAL, gently reclined.** Its face stands up nearly straight,
  reclined only a little so the concave looks **up and slightly back toward the throat**. **~10–20°
  from vertical (top leaning BACK).** [ESTIMATED from `w03.jpg`, `wNet1.jpg`, `w02.jpg`.]
- **UPPER / REAR reflector — STRONGLY reclined backward.** Its top leans well back so the concave
  faces **up and forward toward the throat / sky**. **~40–50° from vertical (top leaning BACK).**
  [ESTIMATED from `w02.jpg`, `w03.jpg`, `wNet1.jpg`, `ref1.jpg`.]
- The two are **NOT tilted by similar amounts** — the lower is much closer to upright, the upper much
  more laid back. That difference (upright-front vs laid-back-rear), combined with the height/Z
  offset, is what makes the open-book fan.

**Which way each concave (reflecting mesh) faces:**

- **LOWER/front:** concave faces **UP and slightly REARWARD** (up-and-inward), i.e. toward the central
  feed throat and the sky ahead. The mesh you see from in front of the trailer is the **convex back**;
  the cup opens up-and-back. [`wNet1.jpg`, `w03.jpg`.]
- **UPPER/rear:** concave faces **UP and FORWARD** (up-and-inward), toward the same central throat and
  the sky. Its cup opens up-and-forward, looking out over the cabin. [`wNet1.jpg`, `w02.jpg`,
  `w18.jpg` shows the concave/underside of the upper trough from below.]
- **Net effect:** **both concaves face up and toward each other / the central feed throat** — the
  classic "two mirrors looking at a shared feed stack between them." This matches the manual's
  "main axes in one vertical plane, same azimuth" (l.1584): the two boresights are nearly parallel in
  plan and diverge only in elevation (one ~+3.5°/display-shallow, the other steeper).

> Concrete correction vs the current model render (`renders/it8-side.jpg`): in the render BOTH
> reflectors lean back at a similar steep angle and sit too close/too symmetric. Reality: front one
> **much more upright**, rear one **much more laid back**, and they are spread further fore/aft.

---

## Q3 — The SUPPORT ARMS / booms (the part we keep getting wrong)

Each reflector is held by a **triangulated tubular space-frame**: a cradle of **round-section steel
pipe truss members** that fan from the cabin top / central tower out to the **back of the reflector's
own backing frame**. It is a 3D truss, not a single arm.

What the photos show, member by member:

- **`w24.jpg` (the key topology photo):** from the **cabin sheet wall**, tubular booms reach OUT to a
  welded **node**, where they meet diagonal truss pipes that run up to the reflector's riveted backing
  gusset. There is a **horizontal tubular outrigger boom** from the cabin wall to that node, and
  **diagonal pipes** triangulating it — a classic A/K truss. A **waveguide pipe runs along the boom**
  out to the feed.
- **`w20.jpg`:** a riveted **gusset plate** on the box structure, with **multiple tubular truss
  members converging on one welded joint** — confirms tube-truss construction (not flat plate arms).
- **`w17.jpg`:** a backing plate on the reflector mesh with **two tubular spars meeting at it** — the
  reflector's own backing space-frame, into which the support arms tie.
- **`w18.jpg`:** a long **tubular spar/boom runs lengthwise underneath the upper trough** — i.e. the
  reflector has a long backbone tube along its 9.7 m span, off which the support arms hang.
- **`w12.jpg` / `w05.jpg` / `ref3_rear.jpg` (rear):** the **central box-lattice tower** with internal
  **X cross-bracing**; from the **base of the tower / cabin top, diagonal tie-rods run DOWN and OUT to
  the trailer/turntable corners** (the big "V"/X you see at the bottom rear) — these stay/brace the
  rotating spine against the cantilevered reflector loads. (These bottom diagonals are stays to the
  turntable, distinct from the upper truss arms that hold the dishes.)

**Topology to model (per reflector):**

- A **pair of main diagonal truss arms** (left + right of centerline) from **high on the central tower
  / cabin roof** out to the **upper-back** of the reflector backbone, PLUS
- a **lower/horizontal boom pair** from the **cabin top edge** out to the **lower-back** of the
  reflector — so the reflector is held at (at least) an upper and a lower attach line, forming a stiff
  triangular cradle. [ESTIMATED member layout from `w24.jpg` + `w20.jpg` + `w02.jpg`; the photos show
  multiple round tubes per side but the exact count/positions are not individually catalogued —
  **[ESTIMATED]**.]
- **Attach points:** arms tie to the reflector's **own backing space-frame** (the backbone tube of
  `w18.jpg` and the gusset plates of `w17.jpg`), not to bare mesh. Their inboard ends gather at the
  **central tower** (upper arms near its apex; lower arms near the cabin roof line). [`w24.jpg`,
  `w12.jpg`.]
- **Arm angle [ESTIMATED from w03/w24]:** the upper arms to the rear reflector rake **up-and-back at
  ~30–45°**; the booms to the front reflector run **up-and-forward at a shallower ~15–30°**. Round
  tube, olive-painted same as the structure (not bare grey like the mesh). [`w24.jpg`, `w02.jpg`.]

> Why the current model looks wrong here: it uses a few thin pipes from a single central point fanning
> symmetrically. Reality is a **deeper, triangulated cradle** that reaches well out to the reflector
> back at TWO height lines (upper + lower), with the **lower-front reflector held nearly upright** and
> the **upper-rear one cantilevered high and laid back**.

---

## Q4 — The central mast / tower

**Yes — a tall central lattice tower / box-mast rises from the cabin roof and is the rotating spine
that carries the upper reflector high and back.**

- **Construction:** a **rectangular riveted box-frame / lattice tower with internal X cross-bracing**,
  rising from the center of the cabin roof. [`w12.jpg`, `w05.jpg`, `ref3_rear.jpg` (rear views show it
  square-on); `w24.jpg`, `w20.jpg` (close detail — riveted panels + tubular braces).]
- **Lean:** **it leans slightly toward the REAR** (back over the cabin), so its apex is offset behind
  the cabin center — which is how the **upper/rear reflector ends up high AND back**. [ESTIMATED from
  `w03.jpg` side view, where the whole spine + upper dish clearly rakes rearward.] The manual does not
  give a mast tilt — **[UNSOURCED exact mast lean]**; the rearward lean is photo-evident.
- **Height:** tall — the upper reflector's lower edge sits roughly at the **top of the tower**, so the
  tower itself stands **on the order of one cabin-height (≈ 2.5–3.5 m) above the cabin roof**, and the
  reflector then rises another ~3 m above that. Total deployed antenna top is **roughly 2.5× a
  standing person ≈ 6–8 m above ground** [ESTIMATED from scale in `w02.jpg`/`wNet1.jpg`;
  **[UNSOURCED]** exact height]. The tower **tapers** toward the top (wider at the cabin roof,
  narrower near the apex). [`w12.jpg`, `w05.jpg`.]
- **Does it carry the feed booms at an apex?** No — the **feed booms belong to each reflector** and
  stand in front of each concave (see Q5). The tower carries the **reflectors** (via the truss arms);
  the feeds are on their own short booms off each reflector, not perched on the tower apex.

---

## Q5 — The feed booms (block of horns) for each reflector

Each reflector has its **own feed block on a short boom in front of its concave, at the focal line** —
«блок облучателей, расположенного в фокусе отражателя» (manual l.192–193, l.196 f = 2.5 m).

- **Position:** a **vertical feed column stands ~2.5 m in front of (and centered on) each reflector's
  concave**, at the focus, carrying the horns. It sits **in the throat between the two reflectors**.
  [`w13.jpg` and `w04.jpg` show the central feed column with stacked round horn cups; `w14.jpg`,
  `w16.jpg` show single feed-horn detail (curved waveguide → square/round horn aperture over the
  mesh).]
- **LOWER/front feed (block ОВН-АМ-1):** **three single-horn feeds** stacked vertically — horn 2 on
  the focal axis, horns 1 & 3 above and below it (±2°). (manual l.199–201, l.1685–1689.)
- **UPPER/rear feed (block ОВВ-АР):** a **two-horn (double) feed on the focal axis** (channel 4),
  **plus, BELOW it, a vertical line array of EIGHT half-wave dipoles** on a waveguide (channel 5,
  cosecant beam). Manual is explicit: «Облучатель пятого канала **расположен ниже** облучателя
  четвёртого канала … линейка из вертикально расположенных полуволновых вибраторов». (l.1843–1854,
  l.204–208.)
- **Feed boom / waveguide routing:** the feed column is fed by **curved rectangular waveguides
  (72×34 mm section)** that run from the cabin up to the feed; the **flexible waveguide joint (СГС) is
  placed so its rotation axis coincides with the reflector tilt axis** — i.e. the feed tilts WITH the
  reflector as the rocking mechanism (МК-I/МК-II) changes its angle. (manual l.1663–1666, l.1983–1987;
  l.1617 for the 72×34 mm waveguide; visual `w33.jpg` waveguide bundle, `w24.jpg` boom waveguide.)
- So: **feed column rigidly attached in front of each reflector (moves with it), at the 2.5 m focus,
  in the central throat** — NOT a single shared feed, NOT on the tower apex.

---

## SIDE-ELEVATION ASCII DIAGRAM (display pose)

Convention: **front = +Z to the RIGHT** (drawbar/tow end), up = +Y. Schematic topology, roughly to
scale. `\\\` = LOWER/front reflector (near-upright). `///` = UPPER/rear reflector (laid back). `=` =
feed column/horns. Pipes `\ /` = support truss arms.

```
   up=+Y
    ^
    |                                  ___
    |                     UPPER/rear  /   \  concave faces UP & FORWARD (toward throat)
    |                     reflector  /  /// \   tilt ~40-50° from vertical (top leans BACK)
    |                     9.7w×3h   /  ///   \
    |                              /  ///     \____ long backbone tube under trough (w18)
    |        LOWER/front          /  ///   __/
    |        reflector           /  /// __/  <- upper truss arms (w24/w20), rake up&back ~30-45°
    |        near-upright       /  =||      to back of upper reflector, gather at tower apex
    |        tilt ~10-20°      /   =||  <- UPPER feed column at 2.5m focus, in the THROAT
    |        concave UP &     /    =||      (2-horn on axis + 8 dipoles BELOW it)
    |        slightly BACK   /  ___||___
    |   ___                 /  | central |   <- central BOX-LATTICE TOWER, leans slightly REAR,
    |  /   \               /   | lattice |      X-braced, tapers up; apex offset behind cabin center
    |  \\\  \   __________/    |  TOWER  |
    |  \\\   \ /  lower    |   |  (X-br) |
    |  \\\    X   truss    |   |_________|
    |  \\\   / \  arms     |   /====\        <- lower truss/boom pair to back of LOWER reflector,
    |  =||  /   \ (shallow |  /      \          run up&forward, shallower ~15-30°
    |  =||_/     \ up&fwd) | /        \
    |  =|| LOWER feed col  |/          \
    |  =|| (3 single horns)|            \
    |  ___________________ |____________ \________________
    | |                                                    |
    | |            636А  ROTATING  CABIN                   |  roof y≈4.2
    | |          (PT/RX gear; spins in azimuth)            |
    | |  front face z≈+2.0                  rear face z≈-2.0|
    | |____________________________________________________|
    |          ===  turntable + azimuth drive motor  ===
    |   ______|________________________________________|______
    |  |          52-У-415М  wheeled platform (2 axles)        |
    |  |  drawbar→ + tow eye + nose jack ;  4 outrigger jacks   |
    |  O==O==============================================O==O
    +----------------------------------------------------------------> +Z (front / drawbar)
   ground y=0
```

Reading it: LOWER/front reflector is **forward and low, nearly upright**, concave up-and-back; its
3-horn feed column stands just in front of it in the throat. UPPER/rear reflector is **back and high,
laid well back**, concave up-and-forward; its (2-horn + 8-dipole) feed column stands in front of it in
the same throat. Both held by tubular truss cradles off the **central rear-leaning lattice tower**,
which rises from the cabin roof. Both feeds sit at the 2.5 m focus and tilt with their reflector.

---

## CROSS-CHECK: external 3D model & drawings

- **Sketchfab P-37 model** (the one the user has been screenshotting): *"Draft | Radar P37"* by
  **Militman**, published 2018, **only 5.2k triangles / 2.9k verts, "No description provided"** —
  https://sketchfab.com/3d-models/radar-p37-3edf825d443c44f3a5897acc82d27e07 (embed:
  https://sketchfab.com/models/3edf825d443c44f3a5897acc82d27e07/embed). It is a **low-detail draft**,
  so it is **not authoritative** for fine mounting geometry — use the manual + walkaround photos as
  primary. (It does show the same general two-reflectors-on-a-cabin layout.)
- Other models exist but add nothing geometric: CGTrader "P-37 Bar Lock radar"
  (https://www.cgtrader.com/3d-models/military/military-vehicle/p-37-bar-lock-radar), TurboSquid
  "radar p-37" (https://www.turbosquid.com/3d-models/radar-p-37-3d-3ds/780745). A **1:87 ZZ-Modell
  P-35 styrene kit** exists (https://military.scale-model-kits.com/products/P-35-Soviet-radar-vehicle-ZZ87027.html)
  but no usable scale plans were found online.
- **No engineering side-elevation / scale drawing** of the P-37/P-35 antenna was found in web search.
  Text sources only repeat the layout: GlobalSecurity "two stacked reflectors … truncated parabolic
  mesh reflectors with clipped corners measuring 10 × 32 feet" (= 3.05 × 9.75 m, cross-checks 3 × 9.7
  m) — https://www.globalsecurity.org/military/world/russia/bar-lock.htm ; P-35 Wikipedia "two open
  frame truncated parabolic antenna … arranged on a trailer so one is higher than the other … stacked
  beam composed of six feed horns" — https://en.wikipedia.org/wiki/P-35_radar ; militaryperiscope
  "two truncated parabolic reflectors with clipped corners … one higher than the other"
  (https://www.militaryperiscope.com/weapons/sensorselectronics/ground-radars/bar-lock/overview/).
  All consistent with front/rear + different-height + concaves-toward-shared-feeds.

---

## WHAT REMAINS UNSOURCED / ESTIMATED

- **[UNSOURCED]** exact fore/aft offset and vertical gap between the two reflector centers in metres
  (photo-estimated ≈ 3–4 m fore/aft, ≈ 1.5–2.5 m vertical).
- **[UNSOURCED]** display-pose tilt angles in degrees (photo-estimated: lower ~10–20°, upper ~40–50°
  from vertical). The *operational* angles (+3.5°/+10.5° of the focal axis above horizon) ARE sourced
  (manual l.1586–1588) but are much shallower than the museum display pose we're matching.
- **[UNSOURCED]** central tower height and exact rearward lean (photo-estimated ≈ one cabin-height
  above roof; leans back a little).
- **[ESTIMATED]** exact count/positions of the truss arm members per reflector — photos show a
  multi-tube triangulated cradle attaching at an upper and a lower line on the reflector back, but no
  source catalogues each member.
- **[UNSOURCED]** cabin 636А box dimensions in metres (none found anywhere).
- Reflector itself: **11 panels (щиты) on a frame**, open metal-mesh working surface (manual
  l.1678–1681) — confirms the open-lattice / mesh look and the panelization, but not the mounting.

## SOURCES
- **Primary — P-37Р technical manual:** `ref/p37_manual.txt` (mirror
  https://ia600604.us.archive.org/13/items/P37TO/P_37_TO.pdf). Key lines: l.128–139 (two
  antennas, tilt), l.191–212 (antenna parameters), l.1577–1588 (main axes in one vertical plane;
  +3.5°/+10.5°), l.1663–1666 + l.1983–1987 (feed tilts with reflector; flex joint on tilt axis),
  l.1674–1691 (identical reflectors, 11 panels, mesh, lower 3-horn feed), l.1843–1871 (upper
  2-horn + 8-dipole feed; MK-I/MK-II rocking mechanisms).
- **Photos (on disk, primary visual):** `ref/wNet1.jpg` (decisive complete 3/4), `ref/w02.jpg`,
  `ref/w03.jpg`, `ref/ref1.jpg` (side/silhouette pose); `ref/w24.jpg`, `ref/w20.jpg`, `ref/w17.jpg`,
  `ref/w18.jpg` (truss/arm topology); `ref/w12.jpg`, `ref/w05.jpg`, `ref/ref3_rear.jpg` (central
  tower + rear tie-rods); `ref/w13.jpg`, `ref/w04.jpg`, `ref/w14.jpg`, `ref/w16.jpg` (feed
  column/horns); `ref/w33.jpg` (turntable/az drive/waveguide bundle).
  NOTE: the large near-flat rectangular mesh wall in the background of `w03/w04/w06/w07` is a
  **separate museum exhibit** (another radar array), NOT this P-37 — do not model it.
- **Web cross-checks:** https://en.wikipedia.org/wiki/P-35_radar ;
  https://www.globalsecurity.org/military/world/russia/bar-lock.htm ;
  https://www.militaryperiscope.com/weapons/sensorselectronics/ground-radars/bar-lock/overview/ ;
  https://ru.wikipedia.org/wiki/П-37 ; https://oktmo.ru/stati/5897-p-37.html .
- **Sketchfab (low-detail draft, reference only):**
  https://sketchfab.com/3d-models/radar-p37-3edf825d443c44f3a5897acc82d27e07 .
</content>
</invoke>
