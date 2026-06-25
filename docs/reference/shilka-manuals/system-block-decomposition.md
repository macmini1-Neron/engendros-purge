# ЗСУ-23-4(М) «Шилка» — System Block Decomposition

**Purpose.** Decompose the whole machine into its functional blocks / modules and map how they interact, so a game/sim design can be scoped. This is a *systems* map (power, data, control, interlocks) — **damage/repair mechanics are deliberately out of scope.**

**Sourcing.** Built entirely from the already-extracted manual findings — no raw PDFs re-read. Citations point at the finding file + its section, abbreviated:
- **[08]** = `findings/08-zsu234-tech-description.md` (whole-system Техническое описание, 2А6М, 1980 — the top-level overview; its pp.3-4 list of ~16 companion manuals IS the block taxonomy used below, and it carries the power-flow + interlock logic).
- **[01]** = `findings/01-rls-device-operation.md` (РПК-2М / РЛС 1РЛ33М3 construction, ТПУ 2005).
- **[04]** = `findings/04-1rl33m-radar.md` (1РЛ33М2 radar technical description, 1980).
- **[06]** = `findings/06-gm575-schematics.md` (ГМ-575 chassis + СЭП power graph + 2Э2 hydraulics, ТПУ 2012).
- **[10]** = `findings/10-operation-1970.md` (operation manual Part 1 — combat work, interlocks, modes, crew, 1970; note the base ЗСУ-23-4 uses an earlier СЭП generation — see §3 below).
- **[03]** = `findings/03-gun-2a6m.md` (АЗП-23 / 2А6М gun-mount operation manual Part II, 1980).
- **[arch]** = `gpt-deep-rnd/02_system_architecture.md` (the sim-layering design — subsystem list, contact/interlock layering).

> **Note on the two electrical generations.** The base **ЗСУ-23-4** (1970 manual) uses generator **ПГС2-14А** + converter **БП-111/БПС**; the modernized **ЗСУ-23-4М** (1980/2012) uses generator **ГИСВ-2-14/3000** + converter **ПС-14А (block БП-112)** + transformer **Б-6В**. The *topology is identical* (mechanical drive → DC generator → rotary converter → 220 V 400 Hz → distribution); only block part-numbers differ. This document uses the **М** names and flags the base names where relevant.

**The crew (4 men)** [08 §4][10 §12]: **К** = командир / commander; **ОП** = оператор поиска-наводчик / search-gunner operator; **ОД** = оператор дальности / range operator; **МВ** = механик-водитель / driver. The fighting compartment holds К/ОП/ОД; the driver sits in the hull control compartment.

**The power buses** (referenced per block below):
- **27.5 V DC** (and **55 V DC**) — primary low-voltage DC from the generator/batteries [08 §2].
- **220 V / 400 Hz, 3-phase AC** — from the rotary converter; the main "combat" bus [06 pg38][08 §2].
- **110 V & 115 V / 400 Hz AC** — derived in the turret by transformer block **Б-6В**; the **115 V** also feeds the power-laying drives [01 §1][08 §2].
- **battery-only** — buffered DC reserve (4× 12СТ-70М); also the *emergency-fire* drive supply [08 §2][10 §12].
- **mechanical / hydraulic / pneumatic** — non-electrical motive paths (manual handwheels, 2Э2 hydrostatics, recharge air).

---

## Block index

1. **ГМ-575** — mobility / drivetrain (В-6М diesel, transmission, steering, suspension, tracks)
2. **ДГ4М-1** — gas-turbine APU (ГТД)
3. **СЭП** — primary electrical system (generator, converter, transformer, batteries, ВКУ slip-ring)
4. **2Э2** — electro-hydraulic power-laying drives (turret traverse + gun elevation)
5. **АЗП-23М** — quad 23 mm autocannon (4 guns, ammo feed/links, electric sear, pyro/manual recharge)
6. **1РЛ33М / РЛС** — radar set (transmitter, receiver/MTI, search + range systems, СУА antenna control)
7. **СРП Б-1** — analog fire-control computer (lead solver)
8. **Стабилизация + ГАГ + ОПК/ВПК** — line-of-sight & line-of-fire stabilization, gyro, coordinate converters
9. **Оптика / визир** — optical / vision / night sights (визир Б-7 + прицел-дублер, КПН, commander & driver periscopes, night sights)
10. **ПАЗ** — NBC protection (supercharger, dampers, overpressure, ДП-3Б)
11. **УА ППО «Роса»** — fire suppression
12. **Связь** — comms (Р-123М radio, Р-124 intercom)
13. **Навигация** — course/heading & land-nav system (1Т34 / ТНА-2 / «Тигель»)

**Support blocks (S):**
- **S1. Баррель cooling** — АЗП liquid barrel-cooling loop (85 L) — a hard fire-interlock
- **S2. Пневмоперезарядка** — pneumatic recharge + air store (also raises the radar antenna)
- **S3. Fuel system** — shared diesel/turbine fuel (front 411 L + rear 110 L)
- **S4. Engine cooling + preheat + air-start** — В-6М support
- **S5. Ventilation** — three separate loops (control compartment / crew compartment / RPK electronics)
- **S6. Heating** — crew foot/hand heaters (27.5 V)
- **(in 6) IFF «Свой-Чужой»** — 1РЛ251 identification, folded into the radar block

---

## 1. ГМ-575 — mobility / drivetrain
*Гусеничная машина 575 — tracked carrier chassis.* Moves and carries the whole system; armored hull with 3 compartments (control / fighting / power) [06 pg6][08 §1].

- **Crew:** МВ (driver) drives; everything is on the commander's command [10 §2].
- **Power dependency:** **В-6М(-1)** 4-stroke diesel, **280 hp @ 2000 rpm** — a *mechanical* prime mover. Self-contained: needs only fuel (S3), engine cooling/preheat/air-start (S4) and **27.5 V DC** (battery) for the electric starter/instruments. **Does NOT die when the APU/generator is off** — it is itself a generator prime mover when moving. Drivetrain is purely **mechanical**: engine → reducer + main dry clutch → gearbox → planetary steering (per side) → final drives → rear drive sprockets; torsion-bar suspension, 6 road wheels/side, **no return rollers** (top run rests on wheels 3-4) [06 pg34-37].
- **Data in:** driver levers/pedals; commander's **ОТКЛЮЧЕНИЕ ДИЗЕЛЯ** kill button [10 §2]. Heading from Navigation (13) when firing on the move.
- **Data out / influence:** **vehicle attitude & motion** (pitch ψ, roll θк, course K, speed) is consumed by the stabilization block (8) and СРП (7) so the gun can fire on the move (≤40 km/h cross-country, ≤20-25 km/h in radar modes, ≤10° tilt) [08 §3][10 §13]. Hull-tilt toward a ground target gives extra depression [10 §12]. Mechanically *spins the СЭП generator* (alternative to the APU) [06 pg38].

## 2. ДГ4М-1 — gas-turbine APU (ГТД)
*Газотурбинный двигатель ДГ4М-1 — auxiliary gas turbine that powers the electrics at a halt.* Lets the radar + powered turret run with the main diesel **off** [08 §5][06 pg39-41].

- **Crew:** МВ starts/stops it (cold-crank → hot-start ritual); any crewman can start it [10 §5][10 §12]. К has a **ПУСК БПС** combat shortcut that auto-starts the GTE [10 §5].
- **Power dependency:** **mechanical** turbine; **electrically** it needs **27.5 V DC / battery** to crank (starter Ст + Пусковая коробка Сб65 + ignition СКИД 11-1А) [06 pg38,43]. Fuel from S3 (shared tanks). Self-monitored: RPM 98.5-101.5 %, exhaust ≤650 °C, oil ≤110 °C [10 §5]. Sized for **1.5-2 h** of run at a halt [08 §2].
- **Data in:** start/stop buttons, cold-crank, air-duct damper open [10 §5].
- **Data out / influence:** spins **Редуктор СЭП → the generator** — i.e. it is the **stationary power source for the entire combat suite** (3). Turned **OFF** in ПАЗ mode (NBC) [08 §6]. Its exhaust jet is a hazard (keep-out 4 m / 20 m flammables) [10 §2].

## 3. СЭП — primary electrical system
*Система электропитания — generates and distributes all on-board electrical power.* The keystone block; see the POWER SPINE graph below [06 pg38][08 §5][01 §6].

- **Components:** generator **ГИСВ-2-14/3000** (base: ПГС2-14А) driven via **Редуктор СЭП** by the diesel **or** the APU; voltage regulator **РН-23**; rotary converter **ПС-14А** (block **БП-112**, base БП-111) makes **220 V 400 Hz** from 27.5 V DC; **four 12СТ-70М batteries** buffer the DC bus; transformer block **Б-6В** (in the turret) makes **110 V & 115 V**; **ВКУ** slip-ring (ВКУ-632М) carries power/signals across the turret race; external-power socket (3-phase 220 V 400 Hz) can substitute for the generator [06 pg38,42][01 §1].
- **Crew:** МВ runs the generator/converter and monitors voltage/frequency; К switches the converter on (**ПУСК БПС**) and has emergency power-off [10 §5].
- **Power dependency:** needs the APU **or** diesel **or** external power to make AC; batteries alone hold the **27.5 V DC** bus but **cannot make 220 V 400 Hz**. So: **APU/generator off ⇒ no AC ⇒ radar, СРП and powered laying are dead**; only battery DC (lamps, comms, sears, instruments) and manual handwheel laying survive [06 §SYNTH][08 §7].
- **Data in:** mechanical shaft power; РН-23 regulation; source-select (generator vs external ВИН) [06 pg38].
- **Data out / influence:** **27.5 V DC + 220 V 400 Hz** to the turret via the ВКУ → feeds radar (6), СРП (7), 2Э2 drives (4), Б-6В transformer, comms (12), nav (13), heating (S6), lights. **Every powered block depends on this one.** Hull loads: driver panel, headlamps ФГ-125/127, fuel/oil solenoids, fire system, starters.

## 4. 2Э2 — electro-hydraulic power-laying drives
*Силовые приводы наведения 2Э2 — power turret-traverse (ГН) + gun-elevation (ВН) servos.* Aim the whole turret and the gun cradle, in auto (radar) or semi-auto (operator) [06 pg53][08 §5][03 §2].

- **Crew:** ОП lays in semi-auto via the **Т-55М1** handles (rate ∝ deflection); К engages/disengages the hydraulics (**ГИДРОПРИВОД ВКЛ/ВЫКЛ**) and the auto-lead toggle (**φ,βу,Tу**) [10 §10][03 §5]. К's **КПН** can also slew the turret [04 §3.3].
- **Power dependency:** **115 V & 220 V 400 Hz** for the **Т-39М** amplifiers, the traverse control-motor **АДП-1121**, the elevation control-electromagnet, and the **ДСО-20** electric motor that spins the hydraulic pumps; plus **27.5 V** control power [06 §SYNTH]. **Dies when AC is lost** → falls back to **manual handwheels (mechanical)**. The **emergency mode** runs the drives on **battery power** (mode 4/5, over-discharge risk) [10 §12].
- **Architecture:** position+velocity electro-hydraulic servo — resolver pair **10ВТМ-В-53** (commanded vs actual angle) → Т-39М → control element → tilts a **variable-displacement axial-piston pump** (swashplate 0-30°) → closed hydrostatic loop spins a **fixed hydraulic motor** → reducer → load. Traverse: Насос №5 → Гидромотор №5 → редуктор ГН → **башня/turret**. Elevation: Насос №1.5 → Гидромотор №2.5 → редуктор ВН → **АЗП-23М gun**. Tachogenerators (ТД-102В, ТГ-2М2) close the velocity loop [06 pg53-57].
- **Slew rates (definitive, 03 §2):** traverse **65-75 °/s** (360° in 4.8-5.5 s); elevation **55-65 °/s** (full sweep 1.5±0.3 s). Ground-panorama mode **ПАН.НАЗЕМН.** slows to az 20±5 / el 15±5 °/s. Residual creep ≤1.5 °/s (≤0.35 °/s ground). Hydraulic oil МГЕ-10А, 40 L [08 §2].
- **Data in:** commanded full-laying angles **Q (az), Ф (el)** from the **ОПК** (8) in auto; handle deflection in semi-auto [06 pg53][08 §6].
- **Data out / influence:** physically **aims turret + gun**. Drive-enable is **interlocked** (see graph): turret + AZP un-stowed, driver hatch closed, link-collector hatch closed [03 §2][08 §3]. With ДСО-20 running, the crew must not open the hatch, switch modes, or stow [10 §2]. Continuous-run ≤2 h, then ≥1 h cool [10 §14].

## 5. АЗП-23М — quad 23 mm autocannon
*Автоматическая зенитная пушка АЗП-23 «Амур» (изделие 2А10М) — four gas-operated 23 mm autocannons (2А7), upper pair + lower pair.* The weapon [08 §5][03 §3][10 §3].

- **Crew:** ОП loads/recharges and fires; К has fire authority, sets the firing switches, and does pneumo-recharge; either station can fire (selectable) [10 §12][03 §5].
- **Power dependency:** firing is **27.5 V DC** to the **electric sears (электроспуски)** — works on battery, so the gun can fire even with the AC dead (emergency mode). Primary cocking is **pyrotechnic (pyro cartridges)** with a **manual cable** backup; pneumo-recharge needs the **air store (S2)**. Barrel cooling pump (S1) must run to fire [03 §3,4].
- **Specs:** **3400 rd/min** (all four); **2000 rounds** (lower 480×2 + upper 520×2; the 1970 manual gives 520 lower / 480 upper — the per-tube split is documented both ways, total ~2000); barrel life 4500 rds, gas-regulator Ø3.4→3.2 mm at 2000 rds [08 §2][03 §3,4]. **−4° to +85°** elevation, **360° unlimited** traverse [08 §3][03 §2]. Belt-fed from 4 cartridge boxes via chutes; spent **links → звеньесборник** bin, cases → гильзоотвод [03 §3].
- **Data in:** elevation drive (4) positions the cradle; ammo from boxes; coolant from S1; recharge air from S2; fire command (electric sear). Fire-permit interlocks (see graph).
- **Data out / influence:** projectiles; **ЗАРЯЖЕНО** lamps (per gun) and cartridge counters to the commander panel; recoil/heat. Fire selection: **СТРЕЛЬБА ВЕРХНИХ / НИЖНИХ АВТ.** lets the crew fire the upper pair, lower pair, or all four (ground-target ammo economy) [03 §5][10 §13].

## 6. 1РЛ33М / РЛС — radar set (sensor of the РПК)
*Радиолокационная станция орудийной наводки 1РЛ33М(2/3) — detects, range/angle-tracks one target, feeds the СРП.* The "Тобол" gun-laying radar; it *measures*, it does not compute the lead [04 §1][01 §1].

- **Internal subsystems** [01 §2.1.1][04 §1.1]: transmitter (magnetron МИ-514М1, ~90-120 kW, 15 GHz); receiver + АПЧ + coherent **MTI/СДЦ** (ЧПК clutter-canceller); **search system** (Т-28М raster scope); **range system / СИД** (Т-23М2 dual-beam scope + range handwheel, split-gate auto-ranger); **antenna-control system СУА** (the antenna's own drives); secondary power (СВИП); ventilation; **IFF 1РЛ251**. Antenna: two-mirror lattice, two feeds — **search (raster, 15° elevation sweep)** + **peleng (conical scan 63 Hz)** for angle-track.
- **Crew:** **ОД** runs the transmitter + range channel (НАКАЛ → АНОДНОЕ → ВЫСОКОЕ power-up; sets magnetron current; strobes the target in range). **ОП** runs the search/antenna (search modes, manual point, presses **АВТОМАТ** to lock angle) [10 §9][04 §6,7]. К cues targets via КПН (9).
- **Power dependency:** **220 V 400 Hz, ≤10.5 kW** AC + **≤1 kW at 27.5 V DC** [04 §2]. **Dies when AC is lost.** Has a **3-min magnetron warm-up** gate before HV; cover interlock В44-2 and −150 V health (relay Р10-1) gate the HV [01 §6][04 §10].
- **Envelope:** detection ≥12 km, auto-track ≥10 km, **200 m dead zone**, range accuracy 10 m, angular 0-06 mils [04 §2]. **Antenna elevation −9°…+87°, azimuth unlimited** (counter-rolled against turret rotation by the **обкатка** gear so it holds a fixed azimuth in space) [04 §8.3].
- **Data in:** echo (RF); commanded scan mode; range-gate position from ОД; **ГАГ stabilization** holds the electric axis on target during vehicle motion (8); turret azimuth (for обкатка).
- **Data out / influence:** **current β (azimuth), ε (elevation), D (range)** of the tracked target → **СРП (7)** [04 §2.2][01 §1]. Two hard rules: (a) angle-track is **range-gated** — the КУA angle channel opens only for the echo inside the range strobe, so **ОД and ОП must cooperate** to lock; (b) engaging auto-track first **slews the antenna ~3.7° (доворот)** [04 §6.4,8.4][01 §3.4]. Transmitter radiation keep-out 80 m [04 §safety].

## 7. СРП Б-1 — analog fire-control computer
*Счётно-решающий прибор Б-1 — the analog computer that solves the meeting problem and produces the lead/laying angles.* The "brain" between sensor and drives [04 §1][10 §1][03 §appendix].

- **Crew:** К/ОП set the СРП switches (УПР lead-enable, ΔV₀ ballistic trim, φ/βу/Tу output enable, ШУНТ-СРП, ground-mode) [10 §4,12]. К arms the lead output (**φ,βу,Tу** toggle) before firing [10 §12].
- **Power dependency:** **115 V 400 Hz** (enabled by К's **ПИТАНИЕ ~115в** toggle) + 27.5 V [10 §9]. **Dies when AC is lost** → fall back to backup-sight aspect-ring/range-grid laying (modes 4/5).
- **Data in:** from radar (6): current **β, ε, D** and their rates; from stabilization (8): vehicle **ψ (pitch), θк (roll), K (course)** via ГАГ→ВПК; ballistic constants + manual lead/ammo trims [01 §1][10 §1].
- **Data out / influence:** the **lead solution** — smoothed target position/velocity (X,Y,Z; Vx,Vy,Vz), **lead azimuth βу, elevation φ, lead time Tу**, aiming angle α — handed to the **ОПК (8)**, which converts them into the **full gun-laying angles Q & Ф** for the drives (4). Also drives the **«ЕСТЬ ДАННЫЕ» (DATA-PRESENT)** lamps that *permit fire* in the radar modes (target inside the kill zone) [08 §3][10 §13]. **Mode 3 «ЗУ»** lets it extrapolate a memorized track for 8-10 s when the radar drops the target [10 §12].

## 8. Stabilization + ГАГ + ОПК/ВПК
*Системы стабилизации линии визирования и линии огня — keep the radar axis and the gun axes pointed at the target while the vehicle pitches/rolls.* What makes firing-on-the-move possible [01 §1][08 §5].

- **Components** [01 §1]: **ГАГ Б-4** (гироазимут-горизонт) measures the vehicle's instantaneous **pitch ψ, roll θк, course K**; **ВПК Б-2М** (визирный преобразователь координат / *sight* coordinate converter) produces target-course/elevation corrections Δq, Δε to stabilize the **line of sight** (radar axis); **ОПК Б-5** (*gun* coordinate converter / object converter) produces the **full horizontal Q and vertical Ф gun-laying angles** to stabilize the **line of fire**; reduction gear обкатки Б-3; fuse block Б-9.
- **Crew:** К switches **ГАГ** on (3-min spin-up: ЗАСТОПОРЕНО → ОТСТОПОРЕНО; **КОНТРОЛЬ** self-test; **НЕИСПРАВНО** = no stabilization) [10 §9]. ОП switches **ПИТАНИЕ ВПК** on [10 §9].
- **Power dependency:** **27.5 V / 115 V 400 Hz** (gyro + converters). **Dies when AC is lost** and degrades the system to "from a halt only" (mode 4 requires tilt ≤3-5°). The **ОТСТОПОРЕНО** lamp is the driver's on-the-move fire-permit indicator — not lit ⇒ fire only from short halts [10 §14].
- **Data in:** vehicle attitude (from the hull/gyro); target coords from radar; lead from СРП.
- **Data out / influence:** **ВПК → radar/СУА** (holds the antenna electric axis on target during motion) and **→ СРП** (feeds ψ,θк,K so the lead solution is attitude-corrected); **ОПК → 2Э2 drives** (the Q,Ф commanded angles). This block sits *between* СРП and the drives — it is the coordinate-frame translator from "computer space" to "stabilized gun space."

## 9. Optical / vision / night sights
*Визирное устройство Б-7, прицел-дублер, КПН, командирские и водительские приборы наблюдения.* The optical chain — primary boresight reference and the all-optical fallback when the radar/computer fail [01 §1][08 §4][03 §6][06 pg51].

- **Components:**
  - **Визир Б-7** (panoramic, two heads): **left head** = main sight, optical axis **boresighted to the antenna electric axis** (so the radar-tracked target is centered in it; used for **mode 2** optical angle-tracking); **right head = прицел-дублер** (backup sight), mechanically linked to the **gun bore axes** via a parallelogram linkage, with **aspect rings** (mode 4, air) and a **range grid** (mode 5, ground), 2× / 6× [01 §1][03 §6].
  - **КПН** (командирский прибор наведения) — the commander's target-designation pointer; slews antenna (and turret) to hand a target to ОП; envelope **el −5°…+30°, az ±20°** [04 §3.3][08 §4].
  - **Commander cupola:** ТПКУ-2 (day), **ТКН-1ТС** (night), БМО-190Б (range scale 800-3000 m) [08 §4].
  - **Driver:** БМО-190В (day periscope), **ТВНО-2** (night) [06 pg51][08 §4].
- **Crew:** К (cupola + КПН), ОП (Б-7 visir + дублер), МВ (driver periscopes).
- **Power dependency:** the **optics themselves are mechanical/optical** (the дублер tracks gun elevation by linkage, no power) — so they are the **all-power-off fallback**. Night sights (ТКН-1ТС, ТВНО-2) and prism heaters need **27.5 V DC** (battery OK); the OU-3 IR illuminator likewise [10 §16].
- **Data in:** light; gun elevation (mechanical, to the дублер); antenna axis (boresight, to the left head).
- **Data out / influence:** human-read angles → ОП hand-tracks in mode 2 (feeds the СУА), or lays the gun directly via the дубл er in modes 4/5; К's КPN feeds a cue into the СУА. Boresight (ТХП-23 control barrel) keeps sight-line ≈ fire-line (≤0-06 mils) [03 §6].

## 10. ПАЗ — NBC protection
*Противоатомная защита — overpressure + filtered air + sealing against nuclear/CBR contamination.* [08 §5][10 §16].

- **Components:** supercharger/нагнетатель, **11 заслонки + 2 крышки** (dampers/covers), **погон race seal**, ДП-3Б roentgenometer, filter-ventilation, overpressure sealing [08 §5].
- **Crew:** К reads ДП-3Б and commands ПАЗ; ОП sets **АВТОМАТ** + **ВКЛ.ПАЗ**; МВ closes hull hatch + GTE flaps [10 §16].
- **Power dependency:** **27.5 V DC** for the blower/dampers (pyro-fired заслонки). In ПАЗ mode the **ГТД (APU), СЭП converter and battery-gas extractor are switched OFF** and the driver compartment is sealed into the crew compartment under overpressure [08 §6].
- **Data in:** radiation dose (ДП-3Б), PAZ-ON command.
- **Data out / influence:** ⭐ **mechanical interlock with the turret:** tightening the **погон race seal** physically **locks turret rotation** (стопор 16 interlocked with the seal tightener) — buttoned-up NBC mode ⇒ no traverse [08 §3,6]. Combat under ПАЗ is possible only in the **emergency / manual** modes (diesel-powered СЭП or manual laying) [10 §16].

## 11. УА ППО «Роса» — fire suppression
*Установка автоматического противопожарного оборудования — automatic engine/fuel-bay fire detection + extinguishing.* [06 pg45-48][10 §16].

- **Components:** 3× 2-L "3,5"-agent cylinders + check-valve manifold; thermal sensors (термодатчики) + spray nozzles in **two protected zones (front / rear)**; control automaton **АС-2** with AUTO/MANUAL mode + per-zone buttons + bottles-remaining counter; 3 hand ОУ-2 extinguishers [06 pg45-48][08 §5].
- **Crew:** МВ (АС-2 manual trigger, hull); К has a front-compartment РОСА button [10 §16].
- **Power dependency:** **27.5 V DC** (detection + solenoid discharge) — battery OK.
- **Data in:** bay temperature (thermal sensors); manual trigger.
- **Data out / influence:** discharges extinguishant; lights the front/rear fire-warning lamps. Crew procedure: gas masks (the "3,5" vapor is toxic), open hatches [10 §2,16]. *(Damage/repair effects are out of scope here — listed only as a functional block.)*

## 12. Связь — communications
*Средства связи — external radio + internal intercom.* [06 pg49-50][08 §5][10 §7].

- **Components:** **Р-123М** VHF-FM radio (single external link; with БЛАНКИР socket + **Т-71** blanking block that mutes the radio RX during each radar sounding pulse to stop self-interference); **Р-124** intercom (all 4 crew, helmets + chest PTT) [08 §5][01 §2.6].
- **Crew:** all crew on Р-124; К works the external Р-123М (target designation in); ОП can also go external [10 §7].
- **Power dependency:** **27.5 V DC** (battery OK) — comms survive an AC loss.
- **Data in:** external traffic / target designation; crew voice.
- **Data out / influence:** К relays an external target's **azimuth + elevation** cue to ОП, who steers the antenna to it (target-designation, block 6/9) [10 §12]. The **Т-71 blanking** cross-couples the radar timing into the radio (data dependency radar→comms) [01 §2.6].

## 13. Навигация — course / heading & land-nav
*Аппаратура ориентирования — gyro heading reference so the system can fire on the move and accept target designation in a map frame.* [08 §5][06 pg52][10 §1].

- **Components (vary by era):** **1Т34** (КЗУ гирокурсоуказатель + panel + current converter) on the М [08 §5]; **ТНА-2** on the 1970 base [10 §1]; **«Тигель»** set in the 2012 album (преобразователь ПТ-У4 + курсоуказатели У2/У3 + пульт У5) [06 pg52].
- **Crew:** МВ runs it (toggles ПРЕОБР. / СИСТЕМА); К uses heading for fire-on-the-move setup [10 §4,12].
- **Power dependency:** **27.5 V DC** (pg52 panel marked "27 V 5 A") + AC for the rotary converter — heading is largely available on battery, but full accuracy needs the system spun up [06 pg52].
- **Data in:** initial orientation; gyro drift.
- **Data out / influence:** vehicle **course/heading** → the fire-control solution (the **ДВИГ. K1** toggle brings heading into the СРП; turned OFF when defending a stationary point, ON when firing on the move) [10 §12]. Required before the radar modes when moving [08 §6].

---

## Support blocks

- **S1. Barrel cooling (АЗП).** Closed liquid loop, **85 L**, pump + tank, fed by hoses to each barrel jacket; toggle **ОХЛАЖД** on the fire grip, **ОХЛАЖДЕНИЕ** lamp [03 §3][08 §2]. **27.5 V** pump. ⭐ **Hard fire-interlock:** the firing circuit is wired *through* the cooling circuit — **you cannot open fire unless barrel cooling is running** [04 §8.4][08 §3]. Pump-dead ⇒ emergency mode, ≤50 rds/barrel [10 §14].
- **S2. Pneumatic recharge.** Two **3 L** air cylinders charged to 56-65 kg/cm² by the АЗП compressor **КПВ-1Б**; **27.5 V** [10 §3]. Cocks the guns (pneumo-recharge) and — via a separate pneumatic valve — **raises/lowers the radar antenna** (needs ≥20 kg/cm²) [10 §6]. **Recharge impossible below 35-40 atm** — ties gun availability to air pressure [10 §14].
- **S3. Fuel.** Shared by diesel + turbine: front **411 L** + rear **110 L**; 4-position distribution cock (both / front / rear / closed); coarse→transfer-pump→fine→HP-pump→injectors; priming accumulator + pre-heater branch [06 pg8-16]. Feeds blocks 1 & 2.
- **S4. Engine cooling / preheat / air-start (В-6М).** 72 L coolant, thermostat box (small↔large circuit), the loop also cools the **gearbox + reducer**; a fuel-burning **preheater** warms the powerpack for cold start; compressed-air start backs up the electric starter (150 kg/cm² bottle) [06 pg25-33][10 §3]. Supports block 1.
- **S5. Ventilation.** Three separate loops [08 §5][10 §5]: control-compartment vent (only with diesel running), crew-compartment vent (ПАЗ blower, ≤4 h), and **dedicated RPK-electronics vent** (auto via thermorelay; **do not power the radar with ventilation faulty** — overheat). **27.5 V / 220 V.**
- **S6. Heating.** 6 foot pads + 4 hand rails, **−27.5 V**; battery OK [08 §5].
- **IFF.** **1РЛ251** "Свой-Чужой" — interrogates tracked targets; its marks show on the search scope (Т-70 block) [01 §1, §2.5]. Folded into block 6.

---

## INTERACTION GRAPH (1) — POWER SPINE

What dies when power is lost is the single most consequential design fact, so trace it source→consumer.

```
PRIME MOVERS (mechanical)
  В-6М diesel (moving) ─┐
                        ├──► Редуктор СЭП ──► spins the generator
  ДГ4М-1 APU (parked) ──┘     (battery 27.5V cranks the APU: Ст + Сб65 + СКИД-11-1А)
  External 220V/400Hz socket ──────────────► can substitute for the generator

PRIMARY GENERATION (СЭП)
  Generator ГИСВ-2-14/3000  ──►  ±27.5V DC (and 55V DC)   [РН-23 regulates]
        │                          ▲
        │                     4× 12СТ-70М batteries buffer the DC bus
        ▼
  Rotary converter ПС-14А / БП-112 :  27.5V DC ──► 220V 400Hz 3-phase AC
        ▼
  Transformer block Б-6В (turret) :  220V ──► 110V & 115V 400Hz

DISTRIBUTION
  ВКУ slip-ring (hull→turret) carries  27.5V DC  +  220V/400Hz  into the turret
        ├─► RADAR 1РЛ33М (6)         [220V 400Hz, ≤10.5kW + ≤1kW DC]
        ├─► СРП Б-1 (7)              [115V 400Hz + 27.5V]
        ├─► Stabilization ГАГ/ВПК/ОПК (8)  [27.5V / 115V]
        ├─► 2Э2 drives (4)           [115V & 220V for Т-39М, АДП-1121, ДСО-20 pump motor]
        ├─► Comms (12), Nav (13), heating (S6), lights, ventilation (S5)
        └─► (hull) driver panel, headlamps, fuel/oil solenoids, fire system (11)

  Gun electric sears (5): 27.5V DC   |   Pneumatic store (S2)/cooling pump (S1): 27.5V

──────────────────────────────────────────────────────────────────────────
WHAT DIES WHEN THE APU/GENERATOR IS OFF (and no external power):
  ✗ Radar (6), ✗ СРП (7), ✗ stabilization (8), ✗ powered laying (4),
    ✗ antenna scan motor — ALL need 220/115V 400Hz, which only exists while a
    prime mover spins the generator.
  ✓ Surviving on battery 27.5V DC: comms (12), lamps/instruments, fire system (11),
    NBC blower (10), heaters (S6), electric gun sears (5), night sights (9).
  ✓ EMERGENCY: the 2Э2 drives can run on BATTERY (mode 4/5) at over-discharge risk;
    otherwise laying = MANUAL handwheels (mechanical) + the optical дублер sight (9).
  ⇒ Power loss collapses the whole AUTOMATIC fire-control chain to a
     manual-optical, hand-cranked gun.
```

## INTERACTION GRAPH (2) — FIRE-CONTROL / DATA SPINE

Detection → tracking → range → СРП → lead → ОПК → stabilized drives → fire-permission → guns.

```
DETECTION (ОП, search)
  Search feed raster-scans 15° in elevation; antenna spins/sectors in azimuth.
  Echo ─► search system ─► Т-28М raster scope (blip).  ОП points antenna at it.
        │  (clutter? ОД: СДЦ/MTI + ВОБУЛЯЦИЯ.  jamming? frequency hop f1/f2.)
        ▼
RANGE GATE (ОД)  ────────────────────────────────────────────────────────────┐
  ОД turns the range handwheel ─► strobe (split-gate) onto the blip on Т-23М2. │ cooperation
  The range strobe also GATES the angle channel (КУА) — no lock without it.    │ required
        ▼                                                                       │
ANGLE LOCK (ОП presses «АВТОМАТ»)  ◄───────────────────────────────────────────┘
  Antenna jerks ~3.7° (доворот) ─► conical-scan auto-track (СУА) holds the
  electric axis on target.  Auto-ranger (СИД) locks range.
        ▼
RADAR OUTPUT:  current  β (azimuth), ε (elevation), D (range)  + their rates
        │
        ├──◄ STABILIZATION (8): ГАГ feeds vehicle pitch ψ, roll θк, course K;
        │                        ВПК holds the radar axis on target during motion.
        ▼
СРП Б-1 ANALOG COMPUTER (7)  — solves the meeting problem
  inputs: β,ε,D (+rates), ψ,θк,K (attitude/heading via ВПК), ballistic constants
  outputs: smoothed X,Y,Z & Vx,Vy,Vz ; lead azimuth βу, elevation φ, lead time Tу, α
        │                                    │
        │                                    └─► «ЕСТЬ ДАННЫЕ» (DATA-PRESENT) lamp
        ▼                                         when target is inside the kill zone
ОПК Б-5 (8) — coordinate converter
  βу,φ (+ ψ,θк,K)  ─►  FULL gun-laying angles  Q (horizontal), Ф (vertical)
        ▼
2Э2 POWER DRIVES (4) — electro-hydraulic position servo
  resolver error ─► Т-39М amp ─► tilt pump swashplate ─► hydraulic motor ─► reducer
        ├─► traverse Q ─► TURRET (башня)
        └─► elevation Ф ─► GUN cradle (АЗП-23М)        guns now point at the LEAD point
        ▼
FIRE-PERMISSION INTERLOCKS  (ALL must pass — else no 27.5V to the sears)
  • Driver hatch CLOSED        (lamp ЛЮК ОТКРЫТ out)        [drive-enable + fire-enable]
  • Turret & AZP UN-stowed     (travel locks off)           [drive-enable]
  • Link-collector hatch CLOSED                              [drive-enable]
  • Barrel cooling RUNNING     (S1 wired in series)          [fire-enable]
  • Elevation ABOVE the «ОГРАНИЧЕНИЕ УГЛОВ» floor (К-set 5–40°) [fire-enable]
  • Radar modes only: «ЕСТЬ ДАННЫЕ» lit (target in kill zone) [fire-enable]
  • «ЦЕПЬ СТРЕЛЬБЫ» armed; fire-station = КОМАНДИР or ОПЕРАТОР
  ── override: «АВАРИЙНАЯ СТРЕЛЬБА» (sealed) bypasses the elevation/interlock block ──
        ▼
FIRE (5)  — К trigger on the laying handle, OR ОП «О» button / foot pedal
  electric sears release ─► quad АЗП fires (upper pair / lower pair / all four)

DEGRADATION LADDER (as blocks fail, the spine shortens):
  mode 1 full radar  →  mode 2 optical angle (visir) + radar range
  →  mode 3 «ЗУ» memorized track (8–10 s)  →  mode 4 backup-sight aspect rings (air, halt)
  →  mode 5 backup-sight range grid (ground)  →  manual handwheel + foot-pedal fire.
```

---

## The single most important cross-block dependency

**The 220 V / 400 Hz AC bus (СЭП block 3), which exists only while a prime mover — the ДГ4М-1 APU at a halt, or the В-6М diesel on the move — spins the ГИСВ generator.** Every block that makes the Shilka a *radar-directed automatic* AA gun — the radar (6), the СРП computer (7), the stabilization/ОПК (8) and the powered laying drives (4) — hangs off this one bus (the drives and СРП specifically off the **115 V** that Б-6В derives from it). Lose it and the entire automatic fire-control spine collapses in one step to a manually-cranked, optically-aimed gun firing on battery-fed sears. For scoping a sim, this is the master gate: "is the turbine spun up and the converter on?" decides whether the machine is a fire-control system or a hand-laid cannon.
