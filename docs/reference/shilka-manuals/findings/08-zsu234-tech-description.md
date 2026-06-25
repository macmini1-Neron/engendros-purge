# ЗСУ-23-4(М) «Шилка» — Техническое описание (2А6М.00.00 ТО) — Findings

**Source:** `08-zsu234-tech-description-text.pdf`, 40 pages. Воениздат, Москва, signed to print 07.02.1980. Изд. № 6/5934(б), Зак. 6202.
**Read:** all 40 pages visually from the rendered scans (OCR layer garbled). Pages 37→39 are blank/ДЛЯ ЗАМЕТОК; p.38 is the Оглавление (table of contents). NOTE: the scan binds printed page 32 (ПАЗ electrical schema) physically between p.16 and p.17 — content is intact, just out of order.

---

## 1. Scope & Identity

This is the **whole-system Техническое описание (Technical Description)** — the top-level overview document of the **ЗСУ-23-4М (изделие 2А6М)**, the *modernized* 23-mm quad self-propelled AA gun («Шилка»). Its stated purpose: teach the **general construction and operating principle** of the ЗСУ-23-4М; detailed descriptions of each subsystem live in 16 *separate* companion documents (listed pp.3–4: ГМ-575 chassis, СЭП primary power, ДГ4М-1 gas-turbine, АЗП-23М gun, 2Э2 power drives, 1РЛ33М3 radar, СРП computer, line-of-sight stabilization, ОПК, ГАГ, визирное устройство, ТВНО-2/ТКН-1ТС night sights, Р-123М radio, Р-124 intercom, ДП-3Б, ТДП degas kit). The description also covers the ЗСУ-23-4М-3 variant (with 1РЛ25Г apparatus). It is an *overview*, so it gives system-level specs and the **firing/movement interlock logic**, but NOT ballistics (no muzzle velocity), NOT armor thickness, NOT detailed gun internals.

The system performs: rapid detection of high-speed targets, automatic tracking, computation of the lead/aim point accounting for target motion + projectile ballistics, fast laying and effective fire — **from a halt OR on the move.** Five combat work modes (see §3). Base = ГМ-575 tracked vehicle, armored hull, 3 compartments (control / fighting / power).

---

## 2. Exact Specifications (every number stated)

### Role / engagement envelope (p.5–6)
- Engages air targets at **height up to 1500 m**, **slant range 200–2500 m**, **target speed up to 450 m/s**.
- Ground targets (moving & static): **range up to 2000 m**.
- Operating climate: ambient **−40 °C to +50 °C**; humidity **95–98 %** at +20±5 °C; altitude **up to 1000 m** ASL.

### Crew (p.5)
- **4 men:** командир установки (commander), оператор поиска-наводчик (search-gunner operator), оператор дальности (range operator), механик-водитель (driver).

### Armament / fire (p.7)
- Gun: **АЗП-23М** = automatic **quad (счетверённая) 23-mm** AA gun, изделие **2А10М**; the 4 barrels are the «автоматы» (2 lower + 2 upper).
- **Rate of fire (all 4 autocannons), not less than: 3400 rounds/min.**
- Burst doctrine: fast targets (jets, rockets) **3–5 rds/barrel**; slow targets (aircraft, helicopters, paratroops) **5–10 rds/barrel**; ground targets **50 rds/barrel**; **pause between bursts 2–3 s**.
- **Ammunition load: 2000 rounds** = lower autocannons **480 × 2** + upper autocannons **520 × 2** (= 960 + 1040). Belt-fed, stored in 4 cartridge boxes in the two fighting bays.

### Radar / fire-control performance (p.7)
- **Detection range** (MiG-17-type target, automatic sector azimuth search in a **5-00** sector ≈ 30°): **≥ 12 000 m**.
- **Automatic tracking range** (MiG-17-type, dead zone 200 m): **≥ 10 000 m**.
- Tracking coordinate accuracy (mean RMS): **range 10 m**, **angular 0-06** (mils).
- Time travel→combat position (without orientation gear): **5 min**.

### Mobility (p.7–8)
- Traction engine: **В-6М-1**, 4-stroke compressorless multi-fuel diesel; **max power 280 hp at 2000 rpm**.
- Speed: **road up to 50 km/h**; dry dirt road **up to 30 km/h**.
- Firing-on-the-move speeds (first 3 modes): cross-country **up to 40 km/h**, typical tank track **up to 20 km/h**, hull tilt during fire **up to 10°**.
- Obstacles: **ford 1 m**, **trench 2.5 m wide**, **side slope/tilt 20°**.
- Cruising range (incl. fuel reserve for 1.5–2 h of gas-turbine APU): **road 450 km**, dirt **300 km**. Fuel use: road **0.8 L/km**, dirt **1.3 L/km**.

### Electrical (p.8)
- AC: **220 V ±2 %, 400 Hz** (+2 %/−4 %). DC: **27.5 ±1 V and 55 ±2 V**. Primary generator ГИСВ-2-14/3000. Four **12СТ-70М** batteries. Б-6В transformer block makes **110 V & 115 V** from 220 V (115 V also feeds the power drives).

### Weight & dimensions (p.8)
- **Combat weight: 21 t (+2 %).**
- **Length ≤ 6495 mm; width ≤ 3075 mm.**
- **Height travel ≤ 2644 mm; height combat ≤ 3765 mm.**
- Track gauge (centre-to-centre) **2500 mm**; ground-contact length **3828 mm**; **ground clearance 400 +30/−20 mm**.
- **Gun sweep radius (barrel sweep at 0° elevation): 2920 mm.**
- **Line-of-fire height (lower barrels above horizon line): 2020 mm.**

### Capacities (p.8–9)
- Engine coolant 72 L; **АЗП barrel-cooling liquid 85 L**; engine oil 63 L; gas-turbine oil 2.8 L; diesel fuel **411 L front tank + 110 L rear tank (= 521 L)**; power-drive hydraulic oil (МГЕ-10А) **40 L**.

### Stowed crew weapons (p.15)
- 2× АКМ + ammo, 12× F-1 grenades, 10 signal cartridges.

**NOT given in this manual:** muzzle velocity, armor thickness/protection level, projectile types.

---

## 3. ⭐ FIRING & MOVEMENT LIMITS (highest priority)

### Elevation / depression limits (p.7) — CONFIRMED
> «Угол наведения автоматов: по вертикали — **от минус (4°-30') до +(85°+30')**; по горизонтали — **не ограничен**.»

- **Elevation: −4° to +85°** (each limit carries a **±30 arcminute** tolerance band, written as −4°−30′ / +85°+30′). So the nominal usable arc is **−4° (depression) to +85° (elevation)**, manufacturing tolerance 30′.
- **Traverse: 360°, NOT limited (unlimited continuous rotation).**

### Mechanical / electrical elevation limiter (p.11)
- The left fighting bay contains a **«ограничитель углов нижний» (lower angle limiter)** plus a receiving device for angles, kinematically tied through the vertical-laying reducer to the lower cradle's gear sectors. This is the hardware that enforces the elevation floor.

### ⭐ FIRING CUT-OUT / INTERLOCKS that BLOCK fire & drive power (p.16–17, p.32) — the key passage
The text: «В ЗСУ имеется ряд блокировок, срабатывание которых исключает возможность включения силовых приводов наведения и ведения огня… для безопасности экипажа и своих войск.» Two gated capabilities:

**(A) Turning ON the power drives (силовые приводы наведения) is possible ONLY when ALL of:**
1. **Turret AND the oscillating part of the АЗП are UN-stowed** (released from their travel stops — «при отстопоренных башне и качающейся части АЗП»).
2. **Driver's hatch is CLOSED** («закрытом люке механика-водителя»).
3. **Link-collector hatch cover is CLOSED** («закрытой крышке люка звеньесборника»).

**(B) Opening FIRE is possible ONLY when ALL of:**
1. **Driver's hatch is CLOSED** (repeated — hard gate).
2. **Barrel cooling system is RUNNING** («работающей системе охлаждения стволов»).
3. **Elevation is NOT below the floor set by the «ОГРАНИЧЕНИЕ УГЛОВ» (ANGLE-LIMIT) switch on the commander's panel** — i.e. a **commander-settable minimum-elevation firing cutout** that prevents depressing-and-firing into own troops/terrain.
4. In the **first three (radar/auto) modes only:** the **target must be inside the kill zone (зона поражения)** — when it is, the **«ЕСТЬ ДАННЫЕ» (DATA PRESENT)** lamps light on the commander panel, the search-gunner panel, and the СРП. No "DATA PRESENT" ⇒ no fire in auto modes.

**Who pulls the trigger (p.17):** depending on mode — the **commander** via the firing handle (рукоятка огня), OR the **search-gunner operator** via the Т-55М1 handle, OR via the **trigger pedal (опусковая педаль)**.

### Travel lock / по-походному (p.12)
- The **oscillating АЗП part and the turret each have mechanical «стопоры походного положения» (travel stops)** plus manual↔powered laying-mode switches.
- **Turret stop (стопор башни 16)** is **interlocked with the погон (race) seal-tightening device** — *the turret cannot rotate while the seal is tightened* («исключающим возможность вращения башни при затянутом уплотнении»). Tightened ПАЗ seal ⇒ turret physically blocked.
- KPN (commander's pointing device) handle has a dedicated **travel position** (rotated 90° right) vs **working position** (±20°) — p.23.

### Driver-hatch interlock electrical detail (p.32)
- A hatch-block switch on the glacis: closing the driver hatch lights **ЛЮК.ВОДИТ**, drops the **ЛЮК.ОТКРЫТ (HATCH OPEN)** warning on the commander panel, and energizes a relay that **arms the power-drive + fire circuits.** Hatch open ⇒ drives/fire dead.
- In the **fifth (ground) mode**, the commander's **«ПАН НАЗЕМН»** toggle *reduces* the semiautomatic laying speeds of the power drives.

### KPN (commander pointing device) angular limits (p.22)
- **Viewing angles: vertical −5° to +30°; horizontal ±20°.** Handle working travel ±20° from zero.

---

## 4. The 4 Crew Stations (p.13, p.5, p.15)

| Station | Seat | Operates |
|---|---|---|
| **Командир (commander)** | left (seat 22, height-adjustable), under командирская башенка | Cupola sights (ТПКУ-2 day / ТКН-1ТС night, БМО-190Б), **КПН** target-designation pointer, **пульт командира 29** controlling АЗП / power-drives / СЭП / ГАГ; the **ОГРАНИЧЕНИЕ УГЛОВ** angle-limit switch, **ПАН НАЗЕМН** ground-mode switch, firing handle; Р-123М radio. Can open fire; can slew turret/antenna via КПН to hand a target to the gunner. |
| **Оператор поиска-наводчик (search-gunner)** | middle (seat 20) | **Визирное устройство Б-7** (left optical head slaved to radar antenna axes, right head = прицел-дублер slaved to the gun bore axes); **Т-55М1** antenna/turret control handles (semiautomatic laying); **ПОЛУАВТОМАТ-АВТОМАТ ГН** mode toggle; Т-36М cabinet & search indicator. Manually tracks target in modes 2/4. Can open fire (Т-55М1 handle). |
| **Оператор дальности (range operator)** | right (seat 14) | **Т-37М cabinet** — range штурвал (handwheel), range scales, indicator; runs the radar range channel / manual range tracking; НАКАЛ toggle (radar power). |
| **Механик-водитель (driver)** | control compartment (front of hull) | Drives ГМ-575: levers, pedals, ГМ+СЭП instrument panel; АС-2 fire panel; his **hatch closure is a hard interlock** for the gun. |

ГАГ Б-4 + ВПК block Б-2М sit under the operators' seats; СРП Б-1 in front of the gunner, ОПК Б-5 below it.

---

## 5. Subsystems Named & Their Relations

- **АЗП-23М gun (изделие 2А10М):** 4 autocannons on upper+lower cradles (люльки) in the станина at the front of the turret; pyro-charging & manual loading per barrel; liquid barrel-cooling (85 L). Quad, 3400 rd/min, 2000 rds.
- **РПК-2М radio-instrument fire-control complex (1А7М-Сб.00):** the brain for modes 1–3. Contains: **1РЛ33М3 radar (РЛС)**, **визирное устройство Б-7**, **КПН (1А7М-04.00.000)**, **СРП Б-1** computer, line-of-sight & line-of-fire **stabilization systems** (ГАГ Б-4, ВПК, ОПК Б-5, редуктор обкатки Б-3), ventilation 1А7М-Сб.2005, transformer block **Б-6В**. RPK outputs full laying angles **Q (azimuth) & Ф (elevation)** to the power drives to aim the gun at the computed lead point.
- **2Э2 power drives (силовые приводы наведения, ПБ1.452.010):** hydraulic. Horizontal: гидромотор №5 + редуктор ГН drives the turret race. Vertical: гидромотор №2.5 + редуктор ВН drives the lower cradle. Pumps №5 and №1.5, drive motor **ДСО-20**, Т-39М amplifier block. Modes: **AUTOMAT** (input from ОПК) / **ПОЛУАВТОМАТ** (input from Т-55М1 potentiometer) / **manual** (маховики). Run on 115 V from Б-6В.
- **ГМ-575 chassis:** armored tracked hull, 3 compartments. Power compartment (rear): **В-6М-1 diesel**, transmission (reducer 24, gearbox 27, L/R planetary steering, final drives + drive wheels at rear), and the СЭП power unit + gas-turbine.
- **Power: СЭП (primary electric system)** = ГИСВ-2-14/3000 generator + reducer **driven by the ДГ4М-1 gas-turbine engine (APU)**, converter НТ-112, contactor ЕКП-111, four 12СТ-70М batteries, external-power plug. The **gas-turbine APU supplies combat electrical power at a halt** (fuel reserve sized for 1.5–2 h of GTD running); the **V-6М-1 diesel is the traction engine** (and also drives air for control-compartment ventilation).
- **Orientation: изделие 1Т34** (КЗУ/heading system — гирокурсоуказатель + panel + current converter) feeds heading so the system can fire on the move and accept target designation.
- **Comms:** Р-124 intercom (internal, all crew), external only via the single Р-123М radio (with БЛАНКИР HF socket + Т-71 blanking block to protect it from РЛС interference).
- **Protection:** **ПАЗ** anti-nuclear (рентгенометр ДП-3Б, supercharger/нагнетатель, 11 заслонки + 2 крышки, погон seal, overpressure + filtered air); fire-fighting **УА ППО** (3× 2-L "3.5" cylinders + АС-2) + 3 hand ОУ-2; **crew heating** (6 foot pads + 4 hand rails, −27.5 V); ventilation (separate for control compartment & turret crew compartment) + dedicated RPK electronics ventilation.
- **Observation:** commander day ТПКУ-2 + БМО-190Б (range scale 800–3000 m, for 2.7 m-tall targets, angle reticle 0-05), night ТКН-1ТС; driver БМО-190В + ТВНО-2 (night).
- **Training:** ТРУ (КЗУ + Т-56М echo-signal imitator) — train operators without radio-transmit/aircraft; «зеркальный отворот» mirror-deflection live-training fire; blank-cartridge fitting (upper autocannons only).

---

## 6. Interlocks / Interconnections (what powers/blocks/depends on what)

- **Power flow:** ДГ4М-1 gas-turbine → ГИСВ generator → 27.5/55 V DC + 220 V/400 Hz AC → Б-6В makes 110 V & 115 V → 115 V drives the hydraulic laying drives; ВКУ (rotating contact ВКУ-632М) carries power/signals across the turret race to the turret.
- **Drive-power enable gate:** turret un-stowed AND gun un-stowed AND driver hatch closed AND link-collector hatch closed (§3-A).
- **Fire enable gate:** driver hatch closed AND barrel-cooling running AND elevation ≥ commander's ОГРАНИЧЕНИЕ УГЛОВ floor AND (auto modes) target in kill-zone / ЕСТЬ ДАННЫЕ lit (§3-B).
- **Turret-rotation block:** tightening the погон ПАЗ seal mechanically locks the turret (stop 16 interlocked with the seal tightener).
- **Driver hatch ↔ commander panel:** hatch state drives ЛЮК.ОТКРЫТ/ЛЮК.ВОДИТ lamps and the arming relay.
- **Mode chain:** orientation (1Т34) must run before modes 1–3; РЛС auto-tracks β, ε, D → СРП solves the meet problem → outputs Q, Ф → ГАГ stabilization compensates pitch/yaw (Ψ, θк, K) → power drives lay the gun. Visir heads are mechanically slaved (left↔antenna, right↔gun bores) so optics and weapon stay aligned.
- **ПАЗ ↔ engine:** in ПАЗ mode the supercharger runs and the **ГТД, СЭП converter, and battery-gas extractor are switched OFF**, the driver's rear hatch opens, and control compartment joins the turret crew compartment (overpressure sealing).

---

## 7. Game-Relevant Observations (mechanics this implies)

- **Elevation arc −4° → +85°, traverse 360° unlimited** — model the gun mantlet able to point nearly straight up; turret free-spins. Enforce a **minimum-elevation firing cutout** the commander can set (ОГРАНИЧЕНИЕ УГЛОВ) — a great "won't shoot below this angle / safe-arc" mechanic to avoid friendly fire.
- **Hard interlocks = ready-to-fire checklist:** can't power the turret/aim unless turret+gun are **un-stowed (travel-lock off)**, **driver hatch shut**, **ammo-link hatch shut**; can't fire unless **hatch shut + barrel coolant running + above the angle floor + (radar modes) a valid lock** ("ЕСТЬ ДАННЫЕ"). These map cleanly to game states: stowed/travel → deploy (5 min) → tracking → DATA PRESENT → fire.
- **Tightened NBC seal locks the turret** — a believable "buttoned-up vs combat-ready" toggle.
- **Quad 23 mm at 3400 rd/min, only 2000 rounds (~35 s of continuous fire) split 960 lower / 1040 upper** — extremely high DPS but very short burn-down; doctrine is short bursts (3–5 / 5–10 rds per barrel, 2–3 s gaps) for AA, long 50-rd bursts for ground. Strong ammo-economy pressure.
- **Engagement envelope:** air ≤1500 m altitude, 200–2500 m slant, target ≤450 m/s; radar sees ≥12 km, auto-tracks ≥10 km with a **200 m dead zone** (no fire at very close range). Ground targets ≤2000 m. Good ranges for kill-zone gating.
- **Fires on the move:** up to 40 km/h cross-country / 20 km/h on track / 10° hull tilt, thanks to ГАГ stabilization — supports a "shoot-while-driving" feel; side-slope limit 20°, ford 1 m, trench 2.5 m.
- **Stats for a vehicle entity:** 21 t, 6.50 × 3.08 × 3.77 m (combat) / 2.64 m (stowed), 0.40 m clearance, **280 hp**, 50 km/h road, 450 km range, 4 crew. Gun barrels sweep a **2.92 m radius** at 0° (collision/clearance), muzzle/line-of-fire **2.02 m** above ground.
- **Two engines:** diesel for driving, **gas-turbine APU** for electrical/combat power at a halt — a nice "spool up the turbine to power the radar/turret" mechanic distinct from driving.
- **Manual fallback:** if power drives fail or residual speeds are too high, crew hand-cranks with маховики — degraded-but-functional state.

**Numbers NOT in this document (look elsewhere):** muzzle velocity, projectile types, armor thickness, exact slew rates (deg/s) of the power drives.
