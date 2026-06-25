# ЗСУ-23-4М — 2А6М Gun Mount — Operation Manual Part II (1980)

**Source:** `03-operation-2a6m-part2-1980.pdf` (152 pp.) — «ИНСТРУКЦИЯ ПО ЭКСПЛУАТАЦИИ 2А6М.00.00 ИЭ1, Часть II», Министерство обороны СССР, Воениздат, Москва 1980. Printed 07.02.80. Figures are in a separate album `2А6М.00.00.Оп`.

> Status: COMPLETE — all 152 pages read in order (1→152). Pages 141-152 are maintenance appendices (sealing list cont., antenna contact-ring cleaning, built-in oscilloscope Т-23А/Т-23М2 procedure + Table 4), the full table of contents (pp.146-149), a blank notes page, and two foldout maintenance network-graph diagrams — no new firing-geometry data.

---

## 1. Scope & identity

- This is **Part II** of the operation manual for the **2А6М** — i.e. the **АЗП-23 «Амур»** quad-23 mm autocannon weapon mount of the **ЗСУ-23-4М** self-propelled AA gun ("Shilka"). (Part I covers operation proper; this Part II is largely the **technical-maintenance / servicing** volume — ТО-1, ТО-2, СО schedules, lubricants, inspection.)
- The ЗСУ-23-4М rides on the **ГМ-575** tracked chassis (Gusenichnaya Mashina 575) with a **ДГ4М-1 ГТД** gas-turbine APU (СЭП power supply unit) and a **тяговый двигатель** (traction/main engine). Turret houses the **РПК** (radar-instrument complex: РЛС radar 1РЛ33М2 + СРП analog fire-computer + ОПК) and the **АЗП-23** gun mount.
- Fire-control / radar designations referenced: **1РЛ33, 1РЛ33М, 1РЛ33М1, 1РЛ33М2** (radar set variants); **РПК-2** instrument part; **СРП** (counting-solving device / analog computer); **ОПК**; **АЗП-23М** gun-mount electrics; power drives «**232**» (силовые приводы наведения — the laying power drives).
- Crew stations named: **Командир** (commander), **Оператор поиска** (search operator), **Оператор дальности** (range operator), **Механик-водитель** (driver-mechanic).

### Crew / station vocabulary (for game gunner model)
- **Оператор дальности** — handles AZP/gun servicing, range channel.
- **Оператор поиска** — handles search/radar, RPK blocks, ventilation filters.
- **Командир** — antenna R-123M comms, sight-line checks.

---

## 2. ⭐ FIRING GEOMETRY & LIMITS

### ⭐⭐⭐ CONFIRMED ANGULAR LIMITS & THE FIRING CUT-OUT (from methodical §20, §32, pp.61-63, 79)

**ELEVATION**
- **Maximum elevation: +85°.** The cradles (люльки) reach the **upper rubber buffers (верхние амортизаторы) at +85°** — the test reads the quadrant difference from upper-buffer contact down to the upper limit-microswitch trip = **5° ± 30′** (so the powered upper limit switch trips ≈ +80°, buffer at +85°).
- **Minimum elevation (depression): cradles bottom out on the LOWER rubber buffers (нижние резиновые амортизаторы станины).** The **lower limit end-switch «ОГН»** trips **30′ ± 10′ above** the lower-buffer contact. (Exact negative degree not numerically stated in this volume; the ЗСУ-23-4 depression is ≈ **−4°.** The lower mechanical stop is the rubber buffer; «ОГН» = нижний концевой выключатель / lower limit switch.)
- **Angle-limiter «ОГ»** (powered-travel limit) trips **5°30′ ± 30′ above** the lower buffer at the bottom, and **5° ± 30′ below** the upper buffer at the top (top buffer = +85°).

**TRAVERSE (azimuth)**
- **Full 360°, unlimited, no sector stop.** Confirmed by the manual-drive check (§32, p.79): *«…вращением маховика повернуть башню вправо и влево на полный оборот (360°). Редуктор должен работать плавно…»* — the turret turns a full 360° in both directions by the GN handwheel, and the powered drive auto-tracks the antenna through any azimuth.

**⭐⭐⭐ THE "FORBIDDEN FIRING ZONE" = a selectable MINIMUM-ELEVATION firing cut-out (NOT an azimuth sector)**
- The mount's firing block is by **elevation angle, not azimuth.** A commander-panel selector **«ОГРАНИЧЕНИЕ УГЛОВ» (ANGLE LIMITATION)** has **8 positions in 5° steps: 5°, 10°, 15°, 20°, 25°, 30°, 35°, 40°** (verified by §32: *«Устанавливая переключатель ОГРАНИЧЕНИЕ УГЛОВ … в положения через 5° в пределах от 40 до 5°…»* and the TO-2 emergency check setting it to «40°»).
- **When the guns are depressed BELOW the selected angle, the firing circuit is automatically cut off** (the **«КОНТРОЛЬ БЛОКИРОВОК»** / blocking-monitor lamp on the commander's panel goes OUT at the cut point). Purpose: stop the guns firing into the ground / own troops / the hull & superstructure when laid low. The gunner/commander dials in the minimum safe firing elevation for the situation.
- **Accuracy of the cut:** quadrant angle at cut-off must match the switch-set value to **±2° over the 10-40° range**; at the **5°** position the tolerance is **+2° / −1°**. Worked example in the manual: switch at 40° → measured actual cut-off ≈ **38°10′** (β−α correction) — i.e. it cuts firing a degree or two around the dialed angle.
- **EMERGENCY-FIRE OVERRIDE: «АВАРИЙНАЯ СТРЕЛЬБА» toggle** on the commander's panel — together with «ЦЕПЬ СТРЕЛЬБЫ» it **bypasses the elevation blocking** so the guns can fire at any angle when the interlocks are faulty or the situation demands (TO-2 §32 test: hatch open, barrels at 0-40°, ОГРАНИЧЕНИЕ УГЛОВ at 40°, with ЦЕПЬ СТРЕЛЬБЫ + АВАРИЙНАЯ СТРЕЛЬБА on → 27 V reaches the electric sear despite the block). The toggle sits **under a sealed cover** on the commander's panel — *«Крышка тумблера АВАРИЙНАЯ СТРЕЛЬБА … снимать в аварийном случае по команде командира ЗСУ»* (sealing list, App.6) — i.e. it's a break-glass override, only opened on the commander's order.
- The gun fire-control unit is designated **«АС-2»** (its «Крышка кнопок» / button cover and «Крышка проверки цепей» / circuit-check cover are sealed). The electric-sear wiring is **cable № 77 — one per gun (4 sealed connectors)**; the pyro-charging cylinders likewise have 4 connectors on the distribution boxes.

**HARD INTERLOCKS THAT KILL THE DRIVE *AND* FIRING (§20, p.62)** — the power motor ДСО-20 and/or the firing circuit will NOT energize if ANY of:
1. **Driver's hatch open** → no power drive, no firing (electric sear gets no 27 V).
2. **AZP oscillating part OR turret travel-locked (на стопоре)** → no power drive.
3. **Link-collector door (дверца звеньесборника) open** → no power drive.
(Plus the «ЛЮК ОТКРЫТ» hatch-open lamp on the commander's panel must be out before «ГИДРОПРИВОД ВКЛ».)

> *(Original component map from the maintenance tables follows.)*

> *The maintenance tables (pp.1-39) NAME every relevant mechanism — listing here so the components are mapped:*

### Mechanisms named in the maintenance tables (the firing-geometry hardware)
- **Ограничитель нижнего [угла наведения] / ограничитель углов** — the **angle limiters**. Maintenance work codes #29 (TO-1) and #38 (TO-2): *«Проверка выставки ограничителя нижнего ОГН и ограничителя углов ОГ»* — "check the SETTING of the lower elevation/depression limiter and the angle limiter." Set/verified with a **quadrant КО-30** + прибор Ц4313 + макетные (dummy) cartridges + ключи s=8,9,10. → This is the adjustable **mechanical depression/elevation stop**.
- **Ограничитель угла поворота люлек** — "limiter of the cradle-rotation angle" (lubrication table #2): the cradle (люлька) elevation travel has a hard limiter. 1 lubrication point.
- **Цепь стрельбы (firing circuit) + its blockings/cut-off** — multiple maintenance items:
  - #54 / #72: *«Проверка точности отключения цепи стрельбы»* — "check the ACCURACY OF THE FIRING-CIRCUIT CUT-OFF." → an electrical **firing cut-out** that disables the trigger in forbidden sectors (the «отсечка»). It is *precision-checked*, i.e. it cuts at exact angles.
  - #46: *«Проверка возможности ведения аварийной стрельбы при неисправных блокировках цепи стрельбы»* — "check the possibility of EMERGENCY FIRING when the firing-circuit interlocks (блокировки) are faulty." → there is an explicit **emergency-fire override** that bypasses the firing interlocks.
- **Прицел-дублер (backup/duplicate optical sight)** linked to the cradle by a **parallelogram linkage (тяга параллелограмма)** and a **reducer #8 (редуктор связи люльки с прицелом-дублером)** — the backup sight tracks the gun elevation mechanically (works #27, lube #9, #10).
- **Контрольный ствол (control/boresight barrel)** — used for alignment of sight-line vs fire-line (works #55, #56, #80: parallelism of optical axes of the sight, the antenna sight, and the control-barrel channel; "согласование линии визирования и линии выстрела").

### Laying drives = ELECTRO-HYDRAULIC (system «232», силовые приводы наведения)
Confirmed hydraulic from the maintenance items:
- **Hydraulic pumps** насосы № 1, № 1,5, № 5; **hydraulic motors** гидромоторы № 2, № 2,5, № 5; **гидроприводы № 5 и № 1,5**; пополнительный бак (make-up reservoir) with МГЕ-10А hydraulic oil; metal-ceramic filters cleaned every 100 h of drive operation.
- Driven by an **electric drive-motor ДСО-20** (приводной электродвигатель) → силовой редуктор (power reducer). So: electric motor → hydraulic pumps → hydraulic motors → ВН/ГН (elevation/traverse) reducers.
- **ВН = вертикальное наведение (elevation)**, **ГН = горизонтальное наведение (traverse)**. Each has its own редуктор (gear reducer) with toothed sectors on the oscillating part (качающаяся часть).
- Servo receivers **ПШВ (vertical) / ПШГ (horizontal)** (принимающие приборы — synchro receivers) take the SRP fire-computer's commanded angles; **БУГ-м** control block.
- Work #75: *«Проверка максимальных скоростей и динамических ошибок автосопровождения системы управления антенной и приводов наведения»* — "check the MAXIMUM SPEEDS and dynamic errors of the antenna-control and laying-drive auto-tracking." → the actual max slew rates are specified in methodical-instruction section 40 (to be extracted).

### Travel-position locks
- **Стопоры походного положения качающейся части АЗП и ГН** — travel locks for the oscillating (elevating) mass and the traverse; 3 lubrication points (lube table #4).

### ⭐⭐ DRIVE SLEW RATES — DEFINITIVE (max-speed check §40, p.114)
These are the **maximum laying-speed acceptance figures** for the powered (electro-hydraulic) drive:
- **MAX TRAVERSE (azimuth): 65-75 °/s** — "= one full turret revolution (360°) in **4.8-5.5 s**." (full grip deflection, normal AA mode)
- **MAX ELEVATION: 55-65 °/s** — "= sweep the AZP from the lower stop to the upper stop in **1.5 ± 0.3 s**." (Confirms total elevation travel ≈ 90°: from ≈ −4° to +85°.)
- **GROUND-PANORAMA mode «ПАН.НАЗЕМН.» (slower, fine mode for ground targets):** max **azimuth 20 ± 5 °/s** (360° in 14.4-24 s), max **elevation 15 ± 5 °/s** (5-00 mils in 1.5-2 s).
- **Residual / creep speed (grip released):** ≤ **1.5 °/s** normal (5-00 in 20 s); ≤ **0.35 °/s** in ground-panorama mode (5-00 in 85 s).
- Traverse is **full 360°, unlimited.** The drives run **semi-automatic** (rate ∝ grip deflection) OR **automatic** (auto-track the antenna/SRP). Manual handwheels (маховики) are the backup; in auto, turret+AZP servo-follow the radar antenna.
- *(The functional-check §17 acceptance — slew 180° az in ≤6 s, 90° el in ≤3.5 s — is just a looser lower bound; the §40 figures above are the real maxima.)*
- ANTENNA (radar) slew, for reference: semi-auto **20 ± 2 °/s** az & el; **accelerated circular search 45-60 °/s**; sector search with adjustable «ШИРИНА СЕКТОРА» (sector width). The antenna has its own **elevation end-stop (упор)** — §42 warns that **crossing rough ground can lose the target because the antenna hits its movement stop.**

### ⭐⭐ ОГРАНИЧЕНИЕ УГЛОВ (ANGLE-LIMITATION) selector — the depression/elevation cut-out
- The **«Проверка АЗП»** functional check (p.56) explicitly sets: *«Нажать кнопку ГИДРОПРИВОД ВЫКЛ. Установить переключатель **ОГРАНИЧЕНИЕ УГЛОВ** в положение **5°**.»* → there is a gunner-selectable **ANGLE-LIMITATION switch with a "5°" position** (limits how low the guns may depress / a safety-angle mode). This is the front-end of the forbidden-zone / cut-off system. (Exact additional positions / the depression & elevation hard limits in degrees are set by the **ограничитель нижнего угла** via quadrant КО-30 — full angular values pending the methodical-limit section.)
- The **«ограничитель углов»** (angle limiter) is a discrete unit on the laying drive, wired by connector cable #55 (ШР ОГ-Ш8) (p.44).

### ⭐⭐ FIRING-CIRCUIT CUT-OFF / interlocks (the "forbidden firing zone" system)
- **«ЦЕПЬ СТРЕЛЬБЫ»** (firing circuit) master toggle on the commander's panel, with a **ЦЕПЬ СТРЕЛЬБЫ indicator lamp** — must be ON to fire.
- **Precision of the firing cut-off is a checked parameter:** maintenance #54/#72 «Проверка точности отключения цепи стрельбы» — the firing circuit is **automatically cut off (отсечка)** at precise angles. (The cut-off zone protects against the guns firing into own structure / blast onto the radar antenna & hull; exact sector degrees are in the methodical-limit section, still to be read.)
- **Emergency-fire override:** maintenance #46 «Проверка возможности ведения аварийной стрельбы при неисправных блокировках цепи стрельбы» — firing is possible bypassing the interlocks in an emergency.
- **Power-drive engage interlocks (Осмотр РПК, p.41):** *«блокировочные устройства, воспрещающие включение силовых приводов наведения при открытом люке механика-водителя и при застопоренных башне и АЗП»* — the power laying drives **CANNOT be engaged while (a) the driver's hatch is open, or (b) the turret/AZP are still travel-locked.** Confirmed in operation by the **«ЛЮК ОТКРЫТ» (HATCH OPEN) lamp** on the commander's panel, which must go out before «ГИДРОПРИВОД ВКЛ».

---

## 3. Gun specifications (the autocannon «автомат» — 2А7 per barrel; mechanism from strip §32, pp.81-97)

- **Quad mount of four identical autocannons (автоматы)** — the 23 mm AZP-23 «Амур». Mounted as an **upper pair and a lower pair** (each люлька/cradle carries the guns; separate «СТРЕЛЬБА ВЕРХНИХ / НИЖНИХ АВТ» fire control). The four barrels are **boresighted parallel** (ТХП-23 check, deviation ≤ **5′**).
- **Operating principle: GAS-OPERATED automatic** — газовый поршень (gas piston), газовая камера (gas chamber/block on the barrel), and an adjustable **газовый регулятор (gas regulator)**: hole **Ø3.4 mm** normally, change to **Ø3.2 mm after 2000 rounds** per barrel (carbon fouling / port wear compensation).
- **Belt-fed, selectable feed side:** *«Порядок разборки и сборки автоматов с правым и левым питанием боеприпасами одинаков»* — guns built for **right OR left ammunition feed**. Belt comes from **patron boxes (патронные коробки)** via flexible chutes (рукава) → feed mechanism (подающий механизм, подающие пальцы / feed pawls).
- **Link & case handling:** звеньеотвод/звеньесборник (link ejector + link collector bin) and гильзоотвод (spent-case ejector chute). Firing dumps links into the **звеньесборник** (whose access door is a firing/drive interlock — §2).
- **Quick-change barrel:** the barrel is locked by a **клин ствола (barrel wedge/locking key)** driven out with a mallet; barrel slides from the receiver. **Barrel life: 4500 rounds/barrel** (incl. blanks) → replace.
- **Liquid-cooled:** each gun's barrel has a **coolant jacket** fed by hoses from a coolant pump + tank («блок охлаждения», редуктор); coolant level kept between marks; the **ОХЛАЖД** toggle on the fire grip runs the pump (ОХЛАЖДЕНИЕ lamp). Minor coolant weep through drain holes is tolerated while the pump runs.
- **Muzzle device:** пламегаситель (flash-hider) with a stowed bore-plug (заглушка пламегасителя). A **«система поджига газов» (muzzle-gas IGNITER)** with a spark gap ignites/deflagrates the propellant gases at the muzzle (checked via spark presence with ОХЛАЖД+ОГОНЬ on).
- *(Cyclic rate-of-fire and muzzle velocity are not numerically tabulated in this exploitation volume — they live in the gun's TTX / Part I. Standard published 2A7 figures for reference: ~**900-1000 rds/min cyclic per barrel**, ~**3400-4000 rds/min for the quad**; **MV ≈ 950-980 m/s**; БЗТ AP-tracer & ОФЗТ HE-frag-tracer 23×152 mm belts, typically a **3:1 ОФЗТ:БЗТ** mix; effective AA slant range ~2500 m / 1500 m altitude.)*

---

## 4. Recoil / firing cycle / barrel change (mechanism from strip §32)

- **Recoil:** each gun has paired **откатники (recoil buffers / hydro-spring recoil dampers)** clamped at the front mounting (хомут переднего крепления) — shock-absorber units with a stock (шток откатника), front/rear washers, spring, and a **противоотскок (anti-rebound) device** on the slide. The barrels recoil within their front clamps; the cradle (люлька) is the recoiling carriage.
- **Cocking / charging:** primary cocking is by a **механизм пирозаряжания (PYROTECHNIC charging unit)** — пиропатроны (pyro cartridges) drive a piston in the цилиндр пирозаряжания to retract the moving parts onto the sear; up to 9 pyro-charging cycles before servicing. There is **also a manual recharge** via a **трос ручной перезарядки** (hand cable) — the gunner pulls the cable to cock a gun (ЗАРЯЖЕНО lamp confirms).
- **Firing:** an **электроспуск (electric sear/trigger)** with a **датчик готовности (readiness sensor)** releases the moving parts; 27 V on the sear fires. Trigger from grip trigger, «О» button, or pedal (§5).
- **Burst / fire-mode:** continuous automatic while the trigger/cooling are held; gunner selects upper pair, lower pair, or all four guns (§5). (No explicit burst-length limiter documented here other than barrel-life and the cooling system; coolant must be on to fire.)
- **Barrel change** at 4500 rds/barrel: drive out the клин ствола, withdraw the barrel; gas regulator re-set to suit the new barrel's round count. Boresight the replacement parallel to the others via ТХП-23 at 2000-2500 m. Bore erosion/chrome-flaking/pitting does NOT justify early replacement before the guaranteed life.

### Component-life intervals (§44, p.117) — game-mappable wear thresholds
- **Prophylactic spring replacement every 3000 rounds** (автошептало spring, main/boevaya spring, return/возвратная spring, sear springs, etc.).
- **Barrel: 4500 rounds.**
- **Gas regulator: Ø3.4 → Ø3.2 mm at 2000 rounds.**
- **Barrel wedge «клин ствола» (part 5-6): replace after 250 pyro-charging cycles** (independent of round count).
- Coolant change (seasonal): drain via the звеньесборник door, flush 30-40 l water, refill antifreeze («65»/«40») below +5 °C or water+3-component additive above +5 °C; **elevate guns to MAX to drain the barrel coolant.** Manual-charge chain length is trimmable in 12.7 mm / 2.6 mm steps.

---

## 5. Gunner controls (laying & firing) — from functional-check §17 (pp.55-57)

### Laying
- **РУЧН.-СИЛ.** (MANUAL–POWERED) handle and **МАХОВИК-СИЛОВАЯ / СИЛОВАЯ-МАХОВИК** (HANDWHEEL–POWERED) handle — switch between manual handwheel laying and powered (hydraulic) laying.
- **Powered control grips: block Т-55М1** (the search-operator/gunner's control handles) drive azimuth + elevation; rate proportional to deflection; auto-track buttons. Also **КПН** (commander's override controller) with **БАШН / ЦЕЛЬ** buttons can slew the turret.
- **ГИДРОПРИВОД ВКЛ / ВЫКЛ** buttons (commander's panel) — engage/disengage the hydraulic laying drive (turret+AZP then snap to the antenna-commanded position).
- **ПОЛУАВТОМАТ–АВТОМАТ ГП** toggle — semi-automatic (manual rate) vs automatic (auto-track) laying.
- Manual handwheels **маховики ручного наведения** (horizontal + vertical) — backup laying.

### Firing controls
- **ЦЕПЬ СТРЕЛЬБЫ** master toggle (commander) + indicator lamp — arms the firing circuit.
- **СТРЕЛЬБА ВЕРХНИХ АВТ / СТРЕЛЬБА НИЖНИХ АВТ** — separate **FIRE-UPPER-GUNS / FIRE-LOWER-GUNS** selector toggles: gunner can fire the **upper pair, the lower pair, or all four** of the quad autocannons.
- **КОМАНДИР–ОПЕРАТОР** toggle — selects whether firing is commanded from the **commander's** or the **operator's (gunner's)** station.
- Trigger options, all checked:
  1. **Спусковой крючок на рукоятке огня** — trigger on the fire grip.
  2. **Кнопка «О» (огонь) на рукоятке блока Т-55М1** — FIRE button "О" on the T-55M1 control grip.
  3. **Foot pedal** — selected by the **КНОПКА–ПЕДАЛЬ** toggle (BUTTON ↔ PEDAL); the pedal has a safety catch («предохранитель педали») pushed aside by the right foot before firing.
- **ОХЛАЖД (cooling) toggle on the fire grip** + **ОХЛАЖДЕНИЕ** lamp — turns on barrel coolant (the gun is liquid-cooled).
- **ЗАРЯЖЕНО (LOADED)** lamp per gun — lit after charging, goes out on release of the moving parts (firing).
- **Электроспуски** (electric sears/triggers) fire the guns; manual recharge by a **трос ручной перезарядки** (hand-recharge cable / механизм ручного заряжания и перезаряжания) — the gunner cocks a gun by pulling its cable, confirmed by the ЗАРЯЖЕНО lamp.

### Gun-mount switch summary (game-mappable)
| Control | Function |
|---|---|
| РУЧН.-СИЛ. / МАХОВИК-СИЛОВАЯ | manual ↔ powered laying |
| ГИДРОПРИВОД ВКЛ/ВЫКЛ | hydraulic drive on/off |
| ПОЛУАВТОМАТ–АВТОМАТ ГП | semi-auto ↔ auto-track |
| ОГРАНИЧЕНИЕ УГЛОВ (has a 5° pos.) | depression/elevation angle limit |
| ЦЕПЬ СТРЕЛЬБЫ (+lamp) | firing circuit arm |
| СТРЕЛЬБА ВЕРХНИХ / НИЖНИХ АВТ | fire upper pair / lower pair |
| КОМАНДИР–ОПЕРАТОР | fire-command station select |
| КНОПКА–ПЕДАЛЬ | trigger-button ↔ foot-pedal |
| ОХЛАЖД (+lamp) | barrel coolant on |
| trigger / «О» button / pedal | fire |

---

## 6. Sights (backup optical — «прицел-дублер» / визирное устройство), p.57

- **ВИЗИР–ДУБЛЕР** selector: **ВИЗИР** (main/computing sight head) vs **ДУБЛЕР** (backup/duplicate sighting).
- **Magnification: 2× and 6×** (selected by the **ВИЗИР** / **ДУБЛЕР** magnification knob set to «2ˣ» or «6ˣ»).
- **Reticle elements** (illuminated): **перекрестие** (central crosshair), **ракурсные кольца** (aspect/lead "course" rings for estimating target speed/lead — illuminated in the 2× ДУБЛЕР mode), **дистанционная сетка** (range grid — in 6× mode).
- **ТЕМНО–СВЕТЛО** knob = reticle-illumination brightness (dark↔light).
- Sight heads sit under **защитные колпаки** (protective caps, opened by pull-straps in the turret); a гермэтизирующая прокладка with a 3-4 mm clearance gap on the rotating sight head.
- The backup sight is **mechanically coupled to gun elevation** via the parallelogram linkage + reducer #8 (the дублер reticle elevates with the barrels) — see §2.
- Boresighting uses a **ТХП-23 cold-bore-sight tube** inserted into the **lower-right barrel** and the **контрольный ствол / control-barrel channel**, aligned to a **координатный щит** (coordinate board) at ≥ 2500 m; sight-line-vs-fire-line error tolerance ≤ **22′ (0-06 mils)**.

---

## 7. Interlocks / travel lock / stabilization

Notes gathered so far (pp.1-20, maintenance context):
- **Stowed/travel locks exist and are checked at контрольный осмотр:** "Проверка стопорения башни и АЗП в походном положении" (lock turret + gun mount in travel position); "Проверка надёжности фиксации заглушек стволов и правильности зачехления пушки" (muzzle plugs / barrel-bore plugs fixed, gun cover correct); antenna stowed & locked on its rear-of-turret bracket ("антенна должна быть опущена на кронштейны в кормовой части башни").
- Before ANY work on the ЗСУ the **АЗП must be discharged ("убедиться, что АЗП разряжена")**.
- Gas regulator (газовый регулятор) on the autocannon: re-set from **Ø3.4 mm to Ø3.2 mm after 2000 rounds per barrel**.
- **Barrel change interval: replace barrel after 4500 rounds per barrel** (including blank rounds) — "Для АЗП через 4500 выстрелов на ствол… производится замена ствола."
- Cooling: the AZP has a **water/coolant cooling system** — "бак охлаждения со шлангами", coolant level checked; the пополнительный бак "232" (laying-drives reservoir) is a separate hydraulic reservoir.
- After every firing: full disassembly/clean/lube of the autocannons; clean гильзоотводы (case ejection chutes); after 9 пирозаряжаний (pyro-charging cycles) per gun, inspect/clean the pyro-charging mechanism.

---

## 8. Game-relevant observations

- **Barrel life 4500 rds/barrel; gas-regulator change at 2000 rds** — usable as a "barrel wear / overheat" mechanic threshold.
- Muzzle plugs (заглушки стволов / пламегасители flash-hiders present) and a gun cover (чехол) are fitted when stowed — visual travel state.
- **Discharge-before-service** and **stow-lock** states are explicit; a "safe/travel" mode that blocks firing fits the real interlock model.

---

## Appendix — table-of-contents page anchors (pp.146-149), for source-checking the key data

| § | Title | Page |
|---|---|---|
| §10 | Осмотр, чистка и смазка АЗП | 43 |
| §20 | Автоматическая зенитная пушка (ТО-1) | 60 |
| §20 | Проверка выставки ограничителя нижнего ОГН и ограничителя углов ОГ | 61 |
| §20 | Проверка работы АЗП при включенной системе электропитания | 62 |
| §28 | Проверка параллельности оптических осей … и канала контрольного ствола | 74 |
| §31 | Проверка точности отключения цепи стрельбы | 78 |
| §32 | Автоматическая зенитная пушка (ТО-2) | 79 |
| §32 | Проверка возможности ведения аварийной стрельбы при неисправных блокировках цепи стрельбы | 79 |
| §32 | Разборка, осмотр, чистка и сборка автоматов | 82 |
| §38 | Проверка точности отработки Тᵧ и α | 108 |
| §39 | Проверка статической точности СРП | 108 |
| **§40** | **Проверка максимальных скоростей и динамических ошибок автосопровождения, системы управления антенной и приводов наведения** | **110** |
| §41 | Проверка величины ухода гироазимута ГАГ | 114 |
| §44 | Автоматическая зенитная пушка — замена деталей (ЗИП); барабан жизни деталей | 117-119 |
| §45 | Силовые приводы наведения — замена | 120 |
| App.6 | Перечень мест пломбирования ЗСУ (АС-2, АВАРИЙНАЯ СТРЕЛЬБА, cable №77…) | 138 |

*(Note: §40 is the definitive source for the maximum slew-rate figures in §2; §31/§32 for the firing cut-out and emergency-fire override; §20 for the ОГН/ОГ limiter setting; §44 for the wear/round-count intervals.)*

---

*End of report — full 152-page pass complete.*
