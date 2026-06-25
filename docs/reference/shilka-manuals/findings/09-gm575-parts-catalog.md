# GM-575 Parts Catalog (1974) — Findings

Source: `09-gm575-parts-catalog-1974.pdf` — 424 pages.
Title: **«Гусеничная машина ГМ-575. Каталог узлов и деталей»** (Министерство обороны СССР, 1974). The exploded parts catalog of the **GM-575 tracked chassis** — the running chassis of the **ZSU-23-4 «Shilka»**.

> NOTE: scanned pages carry a "ПГ Батмастер / www.bmz.ru" repair-shop advertisement watermark inserted by the scanner — ignore it; it is not part of the original document.

This is a **lookup catalog**, not a manual. Every part lives in a **specification table** with columns:
`№ узла/детали (по чертежу, ГОСТ)` · `№ рисунка` (figure #) · `№ позиции на рисунке` (callout # on figure) · `Наименование` (name) · `В какую сборку входит` (parent assembly) · `Материал и марка` · `Количество на машину, шт` (qty per vehicle) · `Масса одной штуки, кг` (unit mass kg) · `Взаимозаменяемость` · `Примечание`.

Part numbers follow **`575-GG.SS.NNN`** = `575`-(group)(subgroup).(item). Figures (`Рис. N`) are **exploded axonometric drawings**, numbered continuously across the whole catalog, and are **grouped into blocks placed AFTER the spec tables of each section** (not inline). To find a part on a drawing: read its `№ рисунка` + `№ позиции` from the table, then go to that figure in the figure block.

PDF page == catalog page (стр.) with **offset 0** at least through the running gear (verified: catalog p.11 = PDF p.11, p.53 = PDF p.53, p.82 = PDF p.82). Verify offset again deeper in the book.

---

## 1. Catalog section map (groups / subgroups → catalog page)

The catalog has **three indexes** (front matter, PDF pp.6-10):
- pp.6-8 `УКАЗАТЕЛЬ ГРУПП И ПОДГРУПП` — **Раздел I** group/subgroup index (the main structure, below).
- p.9 `УКАЗАТЕЛЬ СВОДНЫХ СПЕЦИФИКАЦИЙ` — **Раздел II** summary specs (bearings, connectors, wires, rubber/non-metal parts).
- p.10 `УКАЗАТЕЛЬ НОРМАЛИЗОВАННЫХ ДЕТАЛЕЙ И СПЕЦНОРМАЛЕЙ` — **Раздел III** standard hardware (bolts, nuts, washers, pins…), catalog pp.322-400.

Front matter: cover p.1; foreword p.2; usage instructions pp.3-5.

### Раздел I — Узлы и детали машины ГМ-575 (starts catalog p.11)

| Group | Name | Subgroups (subgrp № — name — catalog pg) |
|---|---|---|
| **10** | **СИЛОВАЯ УСТАНОВКА** (Power plant) | 04 Centrifugal oil cleaner sys p11 · 22 Fuel system p12 · 23 Fuel-tank install p17 · 25 Air-cleaner & auto-cleaning install p19 · 26 Crankcase-gas extraction & drainage p21 · 31 Guard/ejector/radiator install · 33 Ejector guard p23 · 40 Cooling system · 41 Lubrication system p26 · 52 Pre-heater install p30 · 53 Engine electric heating p32 · 54 Air-heating system p33 · 61 External-power socket & starter relay · 63 Engine air-start install p34 · 90 **Engine install (Установка двигателя)** p36 |
| **11** | **ТРАНСМИССИЯ** (Transmission) | 01 **Главный фрикцион** (main clutch) p53 · 10 **Коробка передач** (gearbox) p54 · 11 **Редуктор** (reduction gear) p64 · 15 Редуктор отбора мощности (PTO reducer) p68 · 16 Масляный насос (oil pump) p69 · 31 Полуоси (half-axles) p70 · 42 Отводка фрикциона (clutch release) p71 · 44 **Тормоза** (brakes) p72 · 45 **Планетарный механизм поворота** (planetary steering mech) p76 · 51 **Бортовая передача** (final drive) p77 · 95 Подогрев КП и редуктора p80 |
| **12** | **ХОДОВАЯ ЧАСТЬ** (Running gear) | 10 **Подвеска нижняя** (lower suspension) p102 · 11 **Амортизатор гидравлический** (hydraulic shock absorber) p106 · 20 **Ленивец** (idler) p109 · 40 **Гусеница** (track) p110 |
| **13** | **УПРАВЛЕНИЕ МАШИНОЙ** (Vehicle controls) | 01 Управление фрикционами и тормозами ПМП p116 · 11 Управление главным фрикционом и КОМ p123 · 12 Рычаг переключения КП (gearshift lever) p126 · 21 Установка управления двигателем p129 |
| **14** | **ЭЛЕКТРООБОРУДОВАНИЕ** (Electrical) | 01 Batteries & master switch p142 · 1x cables/wiring p143 · 20 head lighting p147 · 2x rear light p148 · 22 interior light · 31 horn p149 · 36 intercom · 44 RF filter · 56 driving device p150 · 61 ERO special install · 62 TNA-2 kit p151 · 70 instrument panel p152 · 74 speedo & tacho p159 · 75 temp gauge · 76 pressure gauges p160 |
| **16** | **СПЕЦОБОРУДОВАНИЕ** (Special equipment) | 11 driver tools p175 · 12 entrenching tools p178 · 20 accessories · 21 tow cable p179 · 23 utensils · 25 tarp p180 · 26 fire-fighting equip · 28 ZIP boxes · 29 crew stowage p180 · 36 «Роса» system p181 · 71 **driver seat (Сиденье водителя)** p183 |
| **17** | (РВ install) | Установка РВ p184 |
| **18** | **КОРПУС МАШИНЫ** (Hull) | 00 Верхний обвод корпуса (upper hull contour) p201 · 02 Крыша в сборе (roof) · 03 Air intake to radiators p202 · 40 hatch-cover install · 40-2 vision-device install p205 · 41 glass-block stowage p206 · 45/49 instrument-box installs p207 · 51 fenders/mudguards · 67 battery guard p208 · 70/75/76 engine/equipment mount details · 78 ShrA-200 plug & seals · 80 **Люки крыши (roof hatches)** p209 · 81 hatch covers · 82 Крышки люков днища (belly hatch covers) p210 · 92 air ducts · 93 turbine exhaust · 94 ejector seal p213 |
| **19** | СТЕКЛООЧИСТИТЕЛИ И СТЕКЛООБМЫВ (wipers/washers) | 32 wipers p228 · 37 washer install p230 |
| **20** | **СИСТЕМА ПЕРВИЧНОГО ЭЛЕКТРОПИТАНИЯ** (Primary electrical power = the gas-turbine generator set СЭП / ДГ4М-1) | 01 power-unit install (Установка агрегата питания) p240 · 10 power-unit reducer p242 · 15 converter air-outlet damper p250 · 17 electric heater · 18 ДГ4М-1 air filter p251 · 20 power-system schematics · 21 converter-block install p254 · 23 power-system apparatus install p255 · 34 СЭП fuel-system install |

### Раздел II — Сводные спецификации (catalog p.277+)
Electrical equipment & devices p277; lamps; fuses/breakers p278; switches/buttons; meters p279; contactors/relays; signal fittings; **electric motors & mechanisms p280**; special equip; **СЭП units & apparatus p281**; GTU-kit electrical; vision devices p282; **штепсельные разъемы (connectors) p283**; **электропровода (wires) p287**; **ПОДШИПНИКИ, ШАРИКИ И РОЛИКИ (bearings/balls/rollers) p292**; rubber-metal seals p298; non-metallic items p299 (hoses; tubes p301; rubber p303; cord p313; textolite p314; …paronite p316; cardboard p317; felt p318; leather p320; textile).

### Раздел III — Нормализованные детали и спецнормали (catalog p.322-400)
Tags p322; **bolts p324**; bonki p332; rollers p334; **screws p336**; **bushings p340**; **nuts p341**; nails p352; rivets p353; rings p357; clamp tapes p359; oilers; tips p362; nipples p366; plugs p368; gaskets p369; clamp frames p370; clips p371; turning brackets p372; clamps p373; **washers p376**; balls (special) p389; studs p390; cotter pins p392; keys p396; pins p397; unions p399; wood-screws p400.

After Раздел III: a **Дополнение (Supplement)** covers design changes 1 Jul 1970 → 1 May 1973 (the catalog body reflects documentation valid 1 Jul 1970). PDF total 424 pp ⇒ supplement + figure pages fill the tail.

---

## 2. Per-mechanism assembly breakdowns

*(populated incrementally below)*

### 2.0 Figure-block layout (modelling references)
- Figures are **exploded axonometric drawings**, grouped AFTER the spec tables.
- **Group 10+11 figure block = catalog pp.82-101** (verified: p.82 = `Рис.17 Установка двигателя`). Spec tables for groups 10-11 = pp.11-81.

**Figure-block index (verified, catalog page = exploded drawing):**
| Fig | Page | Subject |
|---|---|---|
| 17 | 82 | Установка двигателя (engine install — engine on mounts, flywheel/coupling end) |
| 18 | 83 | Главный фрикцион (main clutch — full exploded) |
| 19 | 84 | Картер коробки передач (gearbox housing, both halves) |
| 20 | 85 | Крышка коробки передач (gearbox cover + gearshift forks/shafts) |
| 21 | 86 | Вал промежуточный КП (layshaft, exploded gear train) |
| 22 | 87 | Вал главный КП (mainshaft, exploded gear train + synchro) |
| 23 | 88 | Кронштейны крепления КП (gearbox mounting brackets L/R) |
| 24 | 89 | Соединение КП с главным фрикционом (gearbox↔main-clutch coupling) |
| 25 | 90 | Редуктор (reduction-gear unit, big housing w/ gear cluster) |
| 26 | 91 | Фрикцион (clutch friction discs/plates + ring gear) |
| 27 | 92 | Редуктор отбора мощности (PTO reducer) |
| 28 | 93 | Соединение КП с правым ПМП (gearbox↔RIGHT planetary steering) |
| 29 | 93 | Соединение КП с левым ПМП (gearbox↔LEFT planetary steering) |
| 30 | 94 | Отводка фрикциона (clutch release/throwout — release bearing + sleeve) |
| 31 | 95 | Кронштейн управления тормозами (brake-control bracket) |
| 32 | 96 | Тормоз (BAND brake — brake band around drum) |
| 33 | 97 | Узлы и детали ПМП, лист 1 (planetary steering mech parts, sheet 1) |
| 34 | 98 | Узлы и детали ПМП, лист 2 (epicyclic ring gear + friction discs) |
| 35 | 99 | Узлы и детали бортовой передачи, лист 1 (final-drive parts) |
| 36 | 100 | Узлы и детали бортовой передачи, лист 2 (**DRIVE SPROCKET** ~16-17 teeth + castle nut) |
| 37 | 101 | Подогрев КП и редуктора (gearbox/reducer heating lines) |
| 38 | 111 | **Подвеска нижняя** (road wheel + cranked swing-arm + torsion bar + hub bearings) |
| 39 | 112 | Амортизатор с фланцем (shock absorber w/ mounting flange) |
| 40 | 113 | Амортизатор в сборе (**lever-vane hydraulic shock absorber** exploded) |
| 41 | 114 | **Установка ленивца** (idler wheel + crank + worm tensioner) |
| 42 | 115 | **Гусеница в сборе** (track — double-pin RMSh links w/ guide horns) |

> Figures 1-16 (power-plant subgroups) sit inside the group-10 spec region (PDF pp.14-52) — not separately mapped (low game value). The group-10/11 figure block = pp.82-101; the group-12 figure block = pp.111-115.

### 2.1 Transmission — gearbox (Коробка передач), subgroup 11.10, catalog p.54
Top assembly **575-11.10.000-В «Коробка перемены передач»**, figures **19-24**, **mass 345 kg**. Mounts into 575-11.00.000-Б. Interchangeable as a set with 575-11.31.051-Б, 575-11.31.043-Б, 575-11.10.171-Б.
Key sub-assemblies (part № — name — fig — mass):
- 575-11.10.010 Крышка КП в сборе (gearbox top cover) — fig 20 — 14.2 kg
- 575-11.10.022 Картер КП (нижняя половина) (housing, lower half) — fig 19 pos 43 — 32.8 kg
- 575-11.10.095-Б Вал промежуточный (layshaft/intermediate shaft) — 65.0 kg
- 575-11.10.100-В Вал главный (main shaft) — fig 22 — 89.0 kg
- 575-11.10.150 Блок шестерен заднего хода (reverse-gear cluster) — 11.26 kg
- 575-11.10.175 Кольцо маслоприемное (oil pickup ring) — fig 22 pos 35 — 0.85 kg
- 575-11.10.195-А / .200 Кронштейн крепления КП правый/левый (gearbox mounting brackets R/L) — fig 23 — 24.1 / 22.0 kg
- 575-11.10.335-В2 Вал промежуточный с втулками — fig 21 pos 6 — 17.45 kg
- 575-11.10.410 Корпус нижний (lower casing) — fig 20 pos 22 — 2.5 kg
Gearbox figures: housing **Рис.19** (p.84), top cover + shift forks **Рис.20** (p.85), layshaft **Рис.21** (p.86), mainshaft **Рис.22** (p.87), mounting brackets **Рис.23** (p.88). Best single modelling refs: Рис.19 (overall) + Рис.21/22 (the geartrains).

### 2.2 Driveline topology (how the chassis transmits power)
Order of power flow (all in the front transmission compartment, transverse layout):
**Engine В-6М-1 (rear-mounted, longitudinal) → Главный фрикцион (main multi-disc clutch, fig 18 p.83) → Коробка передач (5-speed gearbox, 345 kg, figs 19-24) → Редуктор (central cross-drive reducer, 215 kg, fig 25 p.90) → Планетарный механизм поворота ×2 (planetary steering, one per side, figs 33-34) → Бортовая передача ×2 (final drive, 380 kg each incl. ПМП, figs 35-36) → Ведущее колесо / drive sprocket (fig 36 p.100, ~16-17 teeth).**
Couplings between units are shown explicitly: gearbox↔main-clutch **Рис.24** (p.89), gearbox↔right-ПМП **Рис.28** + gearbox↔left-ПМП **Рис.29** (both p.93). Auxiliary: **Редуктор отбора мощности** (PTO reducer, fig 27 p.92) taps power for the radar/cooling; **Масляный насос** (oil pump, subgrp 11.16, p.69); **Отводка фрикциона** (clutch throwout/release bearing, fig 30 p.94).

### 2.3 Main clutch — Главный фрикцион (subgroup 11.01, p.53, **Рис.18 p.83**)
Multi-disc dry/oil main clutch. Exploded fig 18 shows: input drum (toothed) → friction-disc pack → driven flanges/discs → pressure plate → output flange, with two large bolted flange plates (callouts 3/4/5) and a release mechanism. The separate **Рис.26 «Фрикцион» (p.91)** details the friction-disc pack + ring gear; **Рис.30 «Отводка фрикциона» (p.94)** is the release bearing + sliding sleeve + fork ring.

### 2.4 Central reducer — Редуктор (subgroup 11.11, p.64, **Рис.25 p.90**)
- 575-11.11.000-Г Редуктор в сборе — **215.0 kg** (qty 1)
- 575-11.11.005-В Картер редуктора (housing) — 54.0 kg; 575-11.11.007-Б2 Картер редуктора (левая половина) — 21.5 kg (split casing)
- 575-11.11.200 Фрикцион в сборе — 7.71 kg; 575-11.11.330-А2 Диск ведущий с накладкой — 0.45 kg ×3 (drive friction discs)
- 575-11.11.380-А Фланец — 19.5 kg; 575-11.11.415 Вал с зубчатой соединительной муфтой (output shaft w/ toothed coupling) — 11.7 kg
This is the cross-drive box that distributes gearbox output sideways to both steering units.

### 2.5 Planetary steering mechanism — ПМП (subgroup 11.45, p.76, **Рис.33 p.97 + Рис.34 p.98**)
Classic two-side epicyclic steering. **All qty = 2 (one per side).** Per side:
- 575-11.45.010-А Водило с тормозным барабаном (planet **carrier integrated with brake drum**) — 39.0 kg
- 575-11.45.050-В Шестерня коронная с муфтой и подшипниками (**crown/ring gear** w/ coupling+bearings) — 18.5 kg; 575-11.45.060-В Шестерня коронная — 15.5 kg
- 575-11.45.045 / .070 / .110 Барабан фрикциона зубчатый (toothed **clutch drum/basket**, several variants) — 15.5 / 26.5 / 15.5 kg
- 575-11.45.085 Фрикцион в сборе (multi-disc **steering clutch**) — 41.5 kg; 573-11.45.085 Диск трения ведущий (friction disc) — Сталь 30ХГСА — qty 10; 060-14.15.78-Б Пружина фрикциона (clutch spring) — wire 60С2А — qty 24
- 575-11.45.090 Диск нажимной (pressure disc) — 4.3 kg; 575-11.45.017 Водило (carrier) — Сталь 40Х — 21.1 kg
Fig 34 clearly shows the epicyclic ring gear (internal teeth) + the friction-disc pack + the brake-drum face. Steering = release one side's clutch + apply that side's brake (the band brakes, §2.6).

### 2.6 Brakes — Тормоза (subgroup 11.44, p.72, **Рис.31 p.95 + Рис.32 p.96**)
Multi-shoe floating-band brakes acting on the ПМП brake drums. **Two functions per side:**
- 575-11.44.125-А2 Колодки остановочного тормоза (**stopping/parking** brake shoes) — 12.0 kg
- 575-11.44.135-А2 Колодки блокировочного тормоза (**blocking** brake shoes, locks the drum for a pivot-turn) — 12.0 kg
- Shoe set per drum: верхняя/средняя/нижняя колодка (upper 575-11.44.035, middle .025, lower .034) — fig 32 callouts 12/39/32
- 575-11.44.026/.027 Кронштейн управления тормозами левый/правый (brake-control bracket L/R) — 17.3 kg — fig 31
- Levers 575-11.44.075-Б/.080-Б (рычаг левый/правый, ~0.93–1.12 kg)
Note "горный тормоз" (hill/grade brake) referenced in the control linkage (§2.13) — a parking detent for steep slopes.

### 2.7 Final drive — Бортовая передача (subgroup 11.51, p.77, **Рис.35 p.99 + Рис.36 p.100**)
- 575-11.51.000-В Бортовая передача в сборе **с ПМП** — **380.0 kg** (qty 2) — the final-drive + planetary-steering form one bolt-on side pack
- 575-11.51.003-В2 Картер бортовой передачи (housing) — 98.0 kg (qty 2)
- 575-11.51.006-Б Картер с наружной крышкой (housing w/ outer cover) — 56.5 kg (qty 2)
**Drive sprocket (ведущее колесо)** is on fig 36 (p.100): a cast sprocket ~16-17 teeth, two webbed discs bolted together, retained by a castle nut + cotter pin on the final-drive output. Front-drive layout (sprocket at front, idler at rear).

### 2.8 Suspension — Подвеска нижняя (subgroup 12.10, pp.102-105, **Рис.38 p.111**)
**Individual torsion-bar suspension, 6 road wheels per side (12 total).** Fig 38 = one full station exploded: solid-tyre road wheel → hub w/ two taper bearings → cranked swing-arm (балансир) on a splined trunnion → torsion bar running inboard to the opposite-side anchor.
- **Road wheel:** 575-12.10.160 «Каток с массивной шиной **670 × 160**» (solid rubber tyre, **Ø670 mm × 160 mm wide**) — 64.5 kg; full wheel-with-bearings 575-12.10.155 — 63.9 kg. Single dished/spoked disc wheel (NOT doubled) per station. 16 hub bolts (Шайба 10НА qty 16 per wheel, fig 38 pos 2).
- **Road-wheel + swing-arm assemblies** (handed, by station): wheel 1&6 RH .112 / 1&5 LH .113 (**111.0 kg**); wheel 3&4 .116/.117 (98.0 kg); wheel 2 .110-Б/.111 (99.92 kg); wheel 5 .210 / 6 .211 (111.0 kg).
- **Swing-arms (балансиры):** 1&6 / 1&5 (.120/.121, 34.6 kg, pos 15/16); 3&4 (.125/.126, 21.6 kg); 5th/6th (.163/.164, 32.7 kg); 2nd (.475/.476, 23.5 kg).
- **Torsion bars (валы торсионные):** material **Сталь 45ХНМФА** spring steel. Two lengths: wheels 2,3,4 → 575-12.10.070, **19.82 kg** ×6 (pos 31); wheels 1,5,6 → 575-12.10.075, **23.465 kg** ×6 (pos 32). → **12 torsion bars**, **12 torsion-bar covers** (573-12.10.390, qty 12).
- Trunnion bushings: textolite-B front/rear (.102/.103), steel spacer (.104) — qty 6 each.

### 2.9 Hydraulic shock absorbers — Амортизатор гидравлический (subgroup 12.11, pp.106-108, **Рис.39 p.112 + Рис.40 p.113**)
**Lever-vane (rotary) hydraulic dampers, 4 total (2 left + 2 right)** — on the end stations (1st & 6th wheels).
- 575-12.11.001-В/.002-В Амортизатор с фланцем левый/правый — 46.8 kg (qty 2 each)
- 575-12.11.005-Б/.006-Б Амортизатор в сборе левый/правый — 31.6 kg
- 575-12.11.010-Б Корпус амортизатора с боковой крышкой и втулками — 20.48 kg (made in **8 size groups** — body group № must match piston group №)
Fig 40 shows the housing, the vane shaft + lever arm, side cover, piston/valve internals.

### 2.10 Idler & track tensioner — Ленивец (subgroup 12.20, p.109, **Рис.41 p.114**)
**Crank-mounted idler, 1 per side (qty 2), at the rear.**
- 575-12.20.001 Установка ленивца — 61.0 kg (qty 2)
- 575-12.20.005 Каток ленивца с крышкой и валом (idler wheel w/ cover & shaft) — 35.56 kg (pos 9)
- 573-12.20.041-Б / 573-12.20.046-А Кривошип ленивца (idler **crank**, Сталь 40ХН) — ~16.0–16.5 kg — rotates to tension the track via a worm/червяк mechanism (gear sector visible top-right of fig 41).
Idler wheel is a dished disc similar to a road wheel but un-tyred; mounts on a bearing pack on the crank arm.

### 2.11 Track — Гусеница (subgroup 12.40, p.110, **Рис.42 p.115**)
**Double-pin RMSh (rubber-metal-joint) track. Per side (qty 2 tracks, each ≈918 kg):**
- 575-12.40.034-А Трак в сборе (track shoe/link) — **93 links** — 7.92 kg each — cast steel, central guide horns
- 575-12.40.049 Палец (track pin) — Сталь 38ХС — **93 pins** — 1.54 kg
- 575-12.40.077 Кольцо (rubber bush ring 7В-14) — qty 186 (=93×2); 575-12.40.078 Кольцо уплотнительное — qty 372; 575-12.40.141 Кольцо (65Г) — qty 744; 575-12.40.142 Кольцо дистанционное (60С2) — qty 372; 385852-П Заклепка 6×48 — qty 186
Fig 42 shows the double-pin shoe with two transverse pin tubes per link, rubber-bushed, with end connectors and guide horns between the tubes.

### 2.12 Engine install — Установка двигателя (subgroup 10.90, p.36, **Рис.17 p.82**)
Fig 17 shows the engine (the В-6М-1 diesel, drawn as a 6-cyl in-line block w/ valve cover) on its **front trunnion mount** — a clamped saddle bracket (callout 1) around a cylindrical mounting boss, with a U-bolt/stud (3), washers (4) and shimming pack (5,6 / 8,9,10) on a foot plate; the flywheel/coupling flange is at the right. The engine itself (В-6М-1) is a bought-in unit NOT decomposed in this catalog — only its install hardware.

### 2.13 Driver controls — Управление машиной (group 13, pp.116-141)
- **Steering & brakes (subgrp 13.01, p.116, figs 43-46):** twin steering levers driving rods — Тяга ПМП (steering rod, qty 2), Тяга остановочного тормоза (qty 2), Вал/Тяга горного тормоза (hill-brake shaft), Тяга отводки фрикциона (clutch-release rod, qty 2). Brake-control bracket = fig 31 (p.95).
- **Gearshift (subgrp 13.12, p.126, Рис.47):** Рычаг переключения КП — an H-gate selector: Валик (selector rod) + Корпус (Сталь А12) + Сухарь (selector dog) + Опора + Вилки (forks). Matches the «ГМ-575 H-gate gearbox» the game models.
- **Engine throttle (subgrp 13.21, p.129, figs 48-49):** Валик + Тяги + Пружина растяжная (return spring) + Рычаги linkage.

### 2.14 Gas-turbine power unit СЭП / ДГ4М-1 (group 20, pp.240-276)
The **primary electrical-power gas-turbine** that runs the radar/electronics with the main engine off.
- subgrp 20.01 Установка агрегата питания (power-unit install) — **Рис.100 (p.240)**
- subgrp 20.10 Редуктор агрегата питания (turbine reducer) — **Рис.101-102 (p.242)**
- subgrp 20.18 Установка воздушного фильтра ДГ4М-1 (p.251); 20.21 блок преобразователя (converter block, p.254); 20.23 apparatus (p.255). The ДГ4М-1 turbine itself is a bought-in unit (install + reducer shown, not decomposed).

### 2.15 Hull & turret interface — Корпус машины (group 18, pp.201-227, figs ~82-94)
Hull structure, roof, hatches, radiator air paths. Subgroups: 00 Верхний обвод корпуса (upper hull contour incl. the turret-ring opening cut) p.201; 03 Воздухоприток к радиаторам (fig 82-84); 80 Люки крыши (roof hatches, **Рис.91 p.209**); 81 Крышки люков; 82 Крышки люков днища (belly hatches, p.210); 92 Воздуховоды (fig 92); 93 Выхлоп турбины; 94 Уплотнение эжектора (p.213). Driver seat = subgrp 16.71 (p.183).
> ⚠️ The **turret race / погон / traverse bearing & travel-lock are NOT in this catalog** — group 18 covers only the hull's turret-ring *opening*. The slewing ring + traverse drive belong to the **AZP-23 gun-system catalog** (separate document, see file `07-figures-schematics-part1-azp23m-2011.pdf`).

---

## 3. Best exploded-drawing pages to use as modelling references
| Mechanism | Figure(s) | PDF page(s) | Why |
|---|---|---|---|
| **Drive sprocket** | Рис.36 | 100 | sprocket tooth form + web/hub + retainer |
| **Road wheel + swing-arm + torsion bar** | Рис.38 | 111 | one full suspension station, all parts |
| **Lever-vane shock absorber** | Рис.40 | 113 | internal vane + lever arm |
| **Idler + crank tensioner** | Рис.41 | 114 | idler wheel + crank + worm |
| **Track link (double-pin RMSh)** | Рис.42 | 115 | shoe geometry + pins + horns |
| **Gearbox (housing/shafts)** | Рис.19/21/22 | 84/86/87 | casing + both geartrains |
| **Planetary steering ПМП** | Рис.33/34 | 97/98 | carrier+drum, ring gear, clutch pack |
| **Band brake** | Рис.32 | 96 | brake band + shoes around drum |
| **Final drive** | Рис.35/36 | 99/100 | housing + sprocket output |
| **Main clutch** | Рис.18/26/30 | 83/91/94 | disc pack + release bearing |
| **Engine install / front mount** | Рис.17 | 82 | trunnion saddle mount |
Render at ≥300 DPI (`pdftoppm -png -r 300 -f N -l N`) — at 150 DPI the callout numbers blur. To resolve a numbered callout: read the part name from the spec table (figure № + position № columns) on the corresponding group's spec pages.

## 4. What was NOT read (no silent truncation)
Read in full: front matter pp.1-10 (cover, foreword, usage rules, all 3 indexes); offset-calibration pp.11-13; **transmission spec pp.53-54, 64, 72, 76-77, 81** and the **complete group-10/11 figure block pp.82-101**; **running-gear spec pp.102-103, 106, 109-110** and **figure block pp.111-115**; controls pp.116-117, 126, 129; hull pp.201-203, 209; personal-stowage pp.183-184; СЭП pp.240-242; tail pp.277, 322, 400-402, 424.

**Skipped (and why):**
- **Most per-part rows** in every spec table — the tables are an exhaustive bolt-by-bolt lookup; only headline assemblies + game-relevant counts/masses were transcribed.
- **Power-plant detail (group 10, pp.11-52)** beyond the headers — fuel/cooling/lube/air systems + figures 1-16; low visual-model value (internal plumbing). Engine install (fig 17) captured.
- **Electrical (group 14, pp.142-174)**, special equipment / tools / tarp (group 16, pp.175-200), wipers (group 19, pp.228-239) — not load-bearing for the chassis 3D model.
- **Hull interior detail** (group 18 pp.204-227) beyond the hatch/contour headers.
- **Раздел II summary specs (pp.277-321)** and **Раздел III standard hardware (pp.322-400)** — pure bolt/washer/bearing lookup tables; structure noted from their indexes (pp.9-10) but rows not transcribed.
- **Supplement / Дополнение (pp.401-424)** — confirmed as before/after design-change tables (1.07.70→1.05.73) by group + a few schematic figures; individual changes not transcribed. Check here if a specific part number has a `*` in the body.

All page numbers are **PDF pages = catalog pages (стр.)**; offset 0 verified at pp.11, 53, 82, 102, 115, 117, 184, 203, 213, 241, 401.
