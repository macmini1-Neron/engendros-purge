# P-37 «Bar Lock» (П-37) — TRUE two-reflector antenna arrangement

**Purpose:** correct the modeller's error. The model built the two reflectors as *two near-parallel
grids stacked close together on one frame* (essentially side-by-side). **That is wrong.** The two
reflectors are **two physically separate antennas, mounted on OPPOSITE faces of the rotating cabin
(one at the front, one at the rear), at different heights, each on its own elevation/tilt mechanism,
fanning apart** — not two parallel grids sitting next to each other.

Every claim below is cited. Items with no usable source are flagged **[UNSOURCED]**.

---

## PRIMARY SOURCE FOUND (the decider)

**The genuine P-37Р technical manual** («П-37 учебник / Техническое описание», 214 pp, Acrobat
Distiller 2007 scan-to-text) was downloaded to `p37_manual.pdf` and text-extracted to
`p37_manual.txt`. It is the authoritative engineering description and resolves the geometry.
Mirrors: `https://ia600604.us.archive.org/13/items/P37TO/P_37_TO.pdf` and
`https://rtv-pvo-gsvg.narod.ru/doc/P_37_TO.pdf`.

Key verbatim passages (manual §2.1 “Принцип построения …” and §2.2.2 “Параметры антенной системы”):

- **Two separate antennas:** «В составе РЛС **два антенных устройства – нижнее и верхнее**. Каждое
  антенное устройство состоит из отражателя и блока облучателей (рис.2.2).» → *the radar has TWO
  antenna devices — a LOWER and an UPPER one; each = one reflector + one feed block.* (manual l.128–129)
- **Identical reflectors, 9.7 × 3 m EACH:** «**Отражатели обеих антенн одинаковы** и представляют
  собой несимметричную относительно фокальной оси вырезку из параболоида вращения. **Размеры их
  9,7х3 м, фокусное расстояние 2,5 м.**» → *the reflectors of BOTH antennas are IDENTICAL; an
  asymmetric (offset-fed) cut from a paraboloid of revolution; their size is 9.7 × 3 m, focal length
  2.5 m.* (manual l.194–196)
- **Tilt (setting) angles, both tilt UP:** «**Нижняя антенна наклонена вверх на установочный угол
  3,5°, а верхняя – на 10,5°.** В результате создается общая косекансная зона обнаружения по углу
  места …» → *LOWER antenna tilted UP by a setting angle of 3.5°, UPPER by 10.5°, giving a combined
  cosecant-squared elevation coverage.* (manual l.137–139; restated l.9259–9262)
- **Separate, independent tilt mechanisms:** «Механизм качания нижней антенны **МК-I** изменяет угол
  наклона в пределах от –4,6° до +4,6°, верхней антенны **МК-II** – в пределах от –7,9° до +4,6° …
  Механизмы качания состоят из электродвигателя и редуктора (червячная пара … шток механизма
  качания).» → *the LOWER antenna’s rocking mechanism (MK-I) and the UPPER antenna’s (MK-II) each
  has its own motor + worm reducer driving a tilt screw; they tilt INDEPENDENTLY and remotely.*
  (manual l.1856–1862; §12.2.8 l.9255–9270)

**The physical mounting (front + rear of cabin)** — from the P-37/П-37М descriptive sources
(ru.wikipedia-derived text, mirrored at oktmo.ru / docplayer.ru / techshape.ru, all quoting the same
manual passage), verbatim:

> «Антенное устройство состоит из **двух зеркал (отражателей), укреплённых спереди и сзади кабины
> на разной высоте**.»
> *(“The antenna device consists of two mirrors (reflectors), fixed in FRONT of and BEHIND the cabin,
> at different heights.”)*
> — confirmed via WebSearch of `"спереди и сзади кабины" "на разной высоте"`; also
> `https://ru.wikipedia.org/wiki/П-37`, `https://oktmo.ru/stati/5897-p-37.html` («На кабине
> смонтированы две антенны – нижняя и верхняя»).

This is corroborated by the museum walkaround photos (below) and by the manual’s separate MK-I/MK-II
mechanisms.

---

## ANSWERS

### 1. One antenna or two?
**ONE radar system carrying TWO physically separate reflector antennas** — a *нижняя* (lower) and a
*верхняя* (upper) “antenna device”, each a complete reflector + feed unit, working together as a
stacked-/cosecant-beam set (5 channels: 3 lower + 2 upper). They are **two separate structures**, not
one frame holding two grids, and not two trailers. Both ride on the **one** rotating cabin (636А).
*Src: manual l.128–129, l.194; ru.wikipedia/oktmo «нижняя и верхняя».*

### 2. Exact spatial arrangement of the two reflectors
- **Offset front/back, NOT stacked vertically-coincident.** The lower reflector is on **one face of
  the cabin (front)** and the upper on the **opposite face (rear)**, at **different heights**
  («спереди и сзади кабины на разной высоте»). So in side view they sit on opposite sides of the
  cabin’s rotation axis and fan apart like an open book / butterfly — the feed booms standing in the
  “throat” between them. *Src: ru.wikipedia/oktmo wording; photos wNet1, w02, w13.*
- **Mounted on ONE common rotating cabin, but on TWO separate elevation mechanisms.** The whole
  cabin rotates in azimuth (carrying both reflectors); each reflector additionally tilts on its **own**
  rocking mechanism — **MK-I (lower)** and **MK-II (upper)** — independently and remotely. So: common
  azimuth frame, separate elevation arms/trunnions. *Src: manual l.1856–1862, §12.2.8.*
- **Tilt senses & angles:** **BOTH tilt UP**, by *different* amounts — lower **+3.5°**, upper
  **+10.5°** (setting angles), adjustable lower −4.6…+4.6°, upper −7.9…+4.6°. (They do **not** tilt in
  strictly opposite senses; the earlier dossier guess “upper up / lower down” is **refuted** — both
  point up, the upper steeper, to stack the elevation beams. Museum exhibits are often parked at
  larger display angles than the operational +3.5/+10.5°.) *Src: manual l.137–139, l.9259–9262.*
- **Vertical gap vs reflector height:** each reflector is **3 m tall**; the gap between the upper and
  lower troughs is comparable to (≈ one) reflector-height, set by the front-high / back-low offset and
  the long feed booms — **[UNSOURCED exact gap]** (no metre figure for the inter-reflector spacing or
  the boom length in any text source; visible in wNet1/w02 as roughly one reflector-height).

### 3. Relative size of upper vs lower
**IDENTICAL.** «Отражатели обеих антенн одинаковы … Размеры их **9,7 × 3 м**, фокусное расстояние
**2,5 м**.» The **9.7 m × 3.0 m, f = 2.5 m** figure is **PER reflector**, not the stacked pair.
(So the dossier’s prior “upper larger / lower smaller” and “3 m = total pair height” are both
**refuted** by the manual. The 9.7 m is the long aperture, 3 m the short aperture of *each* trough;
GlobalSecurity’s “10 × 32 ft” = 3.05 × 9.75 m cross-checks this per-reflector.)
*Src: manual l.194–196; cross-check https://www.globalsecurity.org/military/world/russia/bar-lock.htm.*
Note a conflicting figure: modernforces.ru lists antenna “**11 × 3,5 м**” — likely the outer frame
envelope or a later/other variant; **the manual’s 9.7 × 3 m (reflector aperture) is authoritative.**
*(https://modernforces.ru/rls-p-37/.)*

### 4. Feed / illuminator arrangement (per reflector)
A **block of feed horns at the focus, on a boom in front of each reflector** («блок облучателей,
расположенного в фокусе отражателя»). Total = **6 horns / 5 channels**, split **3 lower + (2-horn +
8-dipole) upper**:
- **LOWER antenna:** **THREE single-horn feeds** («три однорупорных облучателя»), forming 3 narrow
  elevation beams ≈ 2.5° wide, offset 2° apart (block ОВН-АМ-1). *Src: manual l.130–132, l.199–203.*
- **UPPER antenna:** a **two-horn feed** («двухрупорный облучатель», forms beam 4 ≈ 5° wide) **plus a
  vertical line array of EIGHT half-wave dipoles** («вертикальную линейку из восьми дипольных
  излучателей», forms the cosecant beam 5, 16–18° wide) — block ОВВ-АР. *Src: manual l.133–136,
  l.204–208.*
- Feeds are **waveguide-fed horns** (curved waveguide → square horn aperture on a plate over the
  mesh); see photos w14, w16. *(Visual.)*
- **Source conflict on the lower split (noted, not fatal):** manual = **3 + (2+8 dipoles)**;
  militaryperiscope says “each reflector has three feeds” (3+3); GlobalSecurity says “four beams from
  the lower, two from the upper” (4+2). **Trust the manual (3 single-horn lower; 2-horn + 8-dipole
  upper).** *Srcs: https://www.militaryperiscope.com/weapons/sensorselectronics/ground-radars/bar-lock/overview/ ;
  https://www.globalsecurity.org/military/world/russia/bar-lock.htm .*

### 5. Rotating cabin & how the antenna mounts on it
**The WHOLE equipment cabin rotates**, carrying both antennas. «Машина N1 (ППК) – платформа
**52-У-415М** с **вращающейся кабиной 636А**, в которой размещается приёмо-передающая аппаратура и
антенные устройства.» The two reflectors are fixed to the front and rear of this cabin (different
heights) on their MK-I/MK-II tilt mechanisms; azimuth = 3 or 6 rpm. The cabin sits on the 52-У-415М
wheeled platform (2-axle bogie, A-frame drawbar, 4 outrigger jacks — photos w12/w29/w33). Erection of
the antennas uses the separate Machine N5 (АТС-668С tractor with a boom/crane). *Src: manual l.51–58,
l.213; photos.* **[UNSOURCED]** exact cabin 636А box dimensions (L×W×H) — no metric figure found.

---

## ASCII side-elevation sketch (schematic — topology only, not to scale)

```
   operational setting angles: lower +3.5°, upper +10.5° (both tilt UP)

                                    UPPER reflector (rear, higher)
                                    9.7 m wide × 3 m tall, tilt +10.5°
                                  \  (concave face up & back)
                                   \____________________
                                   /====================|
                                  /  ^ upper feed boom (2-horn + 8 dipoles)
        LOWER reflector (front,  /  /  in the "throat"
        lower) 9.7×3 m,         /  /
        tilt +3.5°            \/  /
   ____________________      /\  /
   |====================\   /  \/   <- feeds at focus of each reflector
   |  ^ lower feed boom  \ /  /
   |    (3 single horns)  X  /
        (concave face      \/
         up & forward)   __||__________________
                        |   636А ROTATING CABIN |   <- whole cabin spins in azimuth
                        |  (PT/RX gear inside)   |      (3 or 6 rpm)
                        |________________________|
                       ===  turntable / az drive  ===
                    ____|________________________|____
                   |   52-У-415М wheeled platform     |
                   |   2 axles, drawbar, 4 jacks       |
                   O===O======================O===O
```

The two reflectors sit on **opposite faces** of the cabin (front & rear) at **different heights**,
each on its **own tilt mechanism**, both tilting **up** (upper steeper). The feed booms stand at each
reflector’s focus, in the gap between them. This is the “fan / open-book / butterfly” silhouette seen
in the photos — emphatically **not** two parallel grids packed side-by-side.

---

## PHOTO EVIDENCE (on-disk walkaround; primary visual)

- **wNet1.jpg** — *the single clearest view* (a German/other museum, olive cabin with side ladder,
  2-axle trailer): upper reflector high on one cabin face tilted up/back; lower reflector on the
  OPPOSITE face, lower, tilted up at a shallower attitude; feed booms in front of each; both troughs
  fan apart with the cabin between them. Decisive for the front/rear separate-structure topology.
- **w02.jpg** (Lešany hero 3/4) — upper trough high+back tilted hard up; lower trough low+forward,
  gentler; feed column in the throat; multi-axle trailer; person for scale.
- **w13.jpg** — the feed column with stacked round illuminator horns in the throat, both reflectors
  fanning off it. (The large flat mesh wall at right is a SEPARATE museum exhibit/another array.)
- **w12.jpg / w05.jpg** (rear) — central riveted box-mast rising from the cabin roof carrying the big
  curved upper trough; X-braced; trailer + 4 jacks + drawbar.
- **w06.jpg / w07.jpg** — one reflector close: **top-clipped “pentagon” outline** (bottom full width,
  top two corners cut ~45° to a narrow top edge), curved parabolic trough, fine square open mesh.
- **w14.jpg / w16.jpg** — feed detail: curved waveguide → square horn aperture plate over the mesh,
  bolt bumps at lattice crossings.
- **w33.jpg** — drawbar / tow lunette / azimuth drive / tail lights / turntable.
- Ignore w08 (Ural truck), w10 (S-75 missiles), w11 (R-17) — other exhibits.

## What remains UNSOURCED (flag)
- Exact **vertical gap** and **fore/aft offset** between the two reflectors in metres (photo-estimated
  ≈ one reflector-height; no text figure).
- **Cabin 636А box dimensions** (L×W×H) — none found.
- **Total deployed antenna height** above ground & **system weight** — none found.
- The **feed-split conflict** (manual 3 + [2-horn+8-dipole] upper vs militaryperiscope 3+3 vs
  GlobalSecurity 4+2) — manual taken as authoritative, but the discrepancy is unresolved at source.
- modernforces.ru’s **“11 × 3.5 m”** antenna size vs the manual’s **9.7 × 3 m** — treated as
  envelope/variant difference; not reconciled by a single source.
- Whether museum exhibits are parked at operational tilt (+3.5° / +10.5°) or larger display angles —
  the manual angles are operational; the photos confirm topology, not the exact parked angle.

## SOURCES
- P-37Р technical manual (primary): https://ia600604.us.archive.org/13/items/P37TO/P_37_TO.pdf
  (mirror https://rtv-pvo-gsvg.narod.ru/doc/P_37_TO.pdf) — saved as `p37_manual.pdf` / `p37_manual.txt`.
- https://ru.wikipedia.org/wiki/П-37 ; https://oktmo.ru/stati/5897-p-37.html ;
  https://docplayer.ru/26031824 ; http://www.techshape.ru/sheoms-595-1.html (“спереди и сзади кабины
  на разной высоте”; “нижняя и верхняя”; 3 + 2 channels).
- https://www.globalsecurity.org/military/world/russia/bar-lock.htm (10×32 ft; 4+2 beams; stacked).
- https://www.militaryperiscope.com/weapons/sensorselectronics/ground-radars/bar-lock/overview/
  (two truncated parabolic reflectors, one higher than the other; “each reflector has three feeds”).
- https://en.wikipedia.org/wiki/P-35_radar (two open-frame truncated parabolic antennas, one higher
  than the other; stacked beam of six feed horns).
- https://modernforces.ru/rls-p-37/ (antenna “11×3.5 м” — conflicting envelope figure).
- Walkaround photos on disk: `models/p37_radar/ref/w01.jpg … w36.jpg`, `wNet1.jpg`.
</content>
</invoke>
