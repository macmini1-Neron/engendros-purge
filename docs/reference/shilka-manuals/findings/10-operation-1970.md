# ЗСУ-23-4 «Шилка» — Operation Manual Part 1 (Combat Work), 1970 — Findings

**Source:** `10-zsu23-operation-manual-part1-1970.pdf` (127 scanned pages).
Title: *«23-мм счетверённая зенитная самоходная установка ЗСУ-23-4. Инструкция по эксплуатации. Часть первая — БОЕВАЯ РАБОТА.»* Военное издательство МО СССР, Москва, 1970. (124 numbered pages + 2 foldout inserts/вклейки between pp. 8-9.)

> NOTE: The actual subject is the **ЗСУ-23-4** (quad self-propelled) — the "23-4" four-barrel Shilka, not a single-barrel ЗСУ-23.

---

## 1. SCOPE & IDENTITY

The manual covers operation of these subsystems:
- **АЗП-23** — 23-mm automatic AA gun (autocannons designated **2А7**).
- **2Э2** — power laying drives (силовые приводы наведения).
- **РПК-2** — radar-instrument complex (radar **1РЛ33** + analog fire-control computer **СРП Б-1**).
- **СЭП** — primary electric power system, fed by gas-turbine engine **ДГ4М-1 (ГТД)**.
- **ПАЗ** — anti-nuclear/NBC protection.
- Comms (**Р-123** radio, **Р-124** intercom/ТПУ), night vision (**ТВН-2** driver, **ТКН-1Т** commander + **ОУ-3** IR illuminator), navigation **ТНА-2**, fire suppression **УА ППО**, roentgenometer **ДП-3Б**.

The instruction is in two parts: **Part 1 = preparing the ZSU + combat work** (this file); Part 2 = technical servicing & storage.

### Key abbreviations / block map
- **ГМ-575** — tracked carrier vehicle; engine **В-6Р** (diesel).
- **ТЗМ** — transport-loading vehicle; **ТХП** — cold-bore-sighting tube.
- **СЭП blocks:** ПГС2-14А (DC generator), БП-111 (converter БПС), БК-111 (contactors), БР-211 (regulator), БД-211, БС-211 (resistors), БИРН-211 (measuring).
- **ВКУ** — rotating contact device (slip-ring, turret↔hull power/signal).
- **РПК-2 / Б-1 (СРП, analog computer):** tracking servo systems H, X, Y (coords); Vн, Vx, Vy (coord rates); βу & K1 (lead azimuth & course); φ (elevation); Tу (lead time). **Б-2** visual coord converter (ВПК), **Б-4** gyro-azimuth-horizon (ГАГ), **Б-5** gun coord converter (ОПК), **ТРУ** trainer, **Т-56** echo simulator, **КЗУ** course-setter.
- **РЛС 1РЛ33** main blocks: Т-3 transmitter, Т-2 antenna column / Т-81 antenna, Т-28 **search indicator**, Т-23 **range indicator**, Т-13 angular-coordinate tracking, Т-55 antenna control, Т-21 range block, Т-22 range mechanism, Т-19 inter-period compensation (MTI), Т-35М AFC (АПЧ), Т-4М/Т-4Р magnetron/resonator tuning, plus power blocks (Т-10М/20М/24М/27М/29/52/54М) and cabinets Т-36/37/40/42/43/44/46.

---

## 2. CHAPTER 1 — SAFETY / OPERATIONAL LIMITS (Глава 1)

These are stated operationally and double as **firing/movement limits & interlocks**.

### General
- Crew at workstations during movement, **helmets + intercom connected**; nobody rides on turret or hull roof.
- **No personnel within 30 m of ZSU during firing** (ejected/reflected cases hazard).
- Coolant (engine V-6R & gun cooling, low-freeze 3-component + water) is **deadly poison** — never drink/wash with tank water.
- Whole crew acts **only on the ZSU commander's command/signal.**
- Starting V-6R or GTD, moving off, or **slewing the turret** is allowed **only on the commander's command**; the driver first gives a **preliminary audible signal**.
- If the driver is incapacitated while moving, the commander stops the V-6R via **ОТКЛЮЧЕНИЕ ДИЗЕЛЯ** (disconnect-diesel) button on the commander's panel.

### Gas-turbine engine (ГТД ДГ4М-1)
- GTD start/run **only with the engine-bay cover fitted and the access hatch (right upper hull plate) closed & locked.**
- **Do not cross the exhaust jet within 4 m**; no flammable material within **20 m** of the exhaust direction.
- Don't stand within **50 m** of the GTD side service hatch while it runs.
- Never run GTD or V-6R with a fuel/oil leak; no servicing while running.
- **«Помпаж» (compressor surge):** black smoke at exhaust + sharp RPM swings → can wreck the engine.

### Emergency power cut-offs (3 routes)
- **Button 8 (fig.3) ОТКЛЮЧЕНИЕ ПИТАНИЯ** on driver's panel.
- **Left switch ГЕНЕРАТ.** under flap 22 on driver's panel (cuts only the DC generator).
- **Button 4 (fig.1) ОТКЛЮЧЕНИЕ ПИТАНИЯ** on the commander's panel in the turret.
- **Do not press button 36 ПУСК БПС** (start converter) on the commander's panel without need — an accidental press can **unexpectedly start the GTD**.
- Converter (БПС) is a **220 V** source — dangerous to life.

### Gun & ammunition
- All gun work (incl. jam clearing) **only on the commander's command.**
- **Unload-check before any inspection:** remove safety shield over the receiver boxes; open right & left turret compartment covers; remove upper trays & small belt sleeves; cock moving parts (handles 2=upper, 1=lower of the manual-recharge mechanism, fig.4) starting from the top; with handle held, open the receiver cover; confirm no round on the chambering line / in the receiver; close & lock the cover; then **smooth-release the moving parts via the ОДИНОЧНЫЙ СПУСК АВТОМАТОВ button** on the commander's panel.
- **During loading/unloading: ZSU power OFF, and the РУЧН.–СИЛОВАЯ handle on the horizontal-laying reductor in РУЧН. (manual).**
- **During firing, all compartment hatches must be closed.**
- With a loaded gun (and during load/unload) **do not move beyond the front part of the turret.**
- Commander, **before opening fire, confirms the ОГРАНИЧЕНИЕ УГЛОВ (angle-limit) switch is set to the ordered value** (firing-sector limiter).
- With **АВАРИЙНАЯ СТРЕЛЬБА (emergency-fire)** toggle ON, the driver is warned and may open his hatch only with commander's permission.
- **Never fire with the ОДИНОЧНЫЙ СПУСК АВТОМАТОВ buttons** — they bypass the electric-trigger blocking; firing then occurs regardless of the ЦЕПЬ СТРЕЛЬБЫ toggle. Those buttons are for **idle release of moving parts only.**
- After ammo expended or on a jam → **pneumo-recharge** (crew inside, hatches closed); manual recharge only **2–3 min after** the jam.
- Turret & rocking part **must be locked** when laying drives are off; **never use manual laying drives while the ZSU is moving.**

### Power laying drives 2Э2
- With drive motor **ДСО-20** ON (and until it fully stops): do **not** open driver's hatch, switch turret/gun mode handles, put turret/gun on lock, enter/leave crew stations, pull block Т-39М, or kill the converter.
- **Do not be in the «зона обметания» (barrel-sweep circle)** described by the flash-hiders at 0° elevation while slewing.
- Turn on the **ДСО-20 only after** power block **Т-39М** is on.

### RPK-2 radar
- Lethal voltages in Т-54М/Т-52/Т-29/Т-3, CRT blocks Т-19/Т-23/Т-28, and Т-7М/Т-47 — two-man rule on extension cables, insulated tools.
- **Transmitter ON:** no personnel within **80 m** in the main-beam direction; only brief presence (≤20 min/day) allowed in a **±45° sector at 25 m**; RLS crew get medical exams ≥2×/year.

### Fire / NBC
- On UA PPO trigger inside the hull: hold breath, don gas masks, open hatches; the "3,5" extinguishing-agent vapors + CO2 are poisonous (3,5 can bio-accumulate to a lethal dose).

---

## 3. CHAPTER 2 — LOADING & FUELING (Глава 2)

### Ammunition loading (Система питания автоматов)
- **Pre-position:** set the gun's rocking part to **~45–50° elevation**; slew the turret with the autocannons **toward the ТЗМ** (transport-loading vehicle), rear of ТЗМ **1–1.5 m** from the turret.
- Load each compartment's cartridge boxes **starting from the LOWER autocannons**, worked by **two crew**.
- Belt feed via ТЗМ winch over roller; count rounds during belt-laying per the diagram on the inside of the compartment cover.
- **Ammo count per autocannon: lower = 520 rounds, upper = 480 rounds.** Two compartments (left/right) → **520+480 = 1000 per side × 2 = ~2000 rounds total** combat load.
- After loading, **set the cartridge counters on the commander's panel** to the number loaded.
- Coupling/uncoupling the belt uses the dedicated link tool (fig.8).

### Barrel cooling fill (Система охлаждения стволов)
- Summer (>+5 °C): clean soft water + 3-component additive. Winter (<+5 °C): low-freeze "65" (ГОСТ 159-52).
- Open **left front turret compartment** cover, remove tank plug, insert mesh funnel, fill to **between the two marks** on the level gauge. Run 1–3 min, check tightness.

### Pneumo-recharge air system (Система пневмоперезарядки)
- Two **3-liter** cylinders charged by the **АЗП-23 compressor КПВ-1Б**.
- Fill sequence: close condensate-drain valves → board net ON via **button 7 ВКЛЮЧЕНИЕ ПИТАНИЯ** (driver panel) → start V-6R or GTD → **КОМПРЕССОР** switch ON → pump to **30–35 kg/cm²**, switch off **15 min to cool** → switch on again; at **27.5 ±1 V** it brings cylinders **30–35 → 56–65 kg/cm² in ~30 min**, then auto-stops.
- Sensors: high-pressure ЭДП-300, low-pressure ЭДУ-150, dual signaler 2С35А; air reducer ИЛ-611-150-70.
- Allowable leak **0.5 kg/cm²/hr**. Since 1967: backup cylinder 11 (reserve air if compressor fails), kept at **110–120 kg/cm² winter / 140–150 kg/cm² summer**.

### Engine fueling/fluids (reference)
- V-6R diesel + GTD share **common fuel tanks** (diesel ГОСТ 4749-49: ДЛ summer / ДЗ winter / ДА arctic). V-6R oil МТ-16п; GTD oil МК-8 (below -30 °C: 75% МК-8 + 25% ДА).
- **Air-start cylinder** for V-6R along left hull in control compartment: full **150 kg/cm²**, min **100 kg/cm²**.

### Crew stations & personal kit (figs 12–14) — who sits where
- **Range operator (оператор дальности):** inside turret — helmet+goggles, grenades, raincoat, 10 signal cartridges, 9 grenade fuzes, 1РЛ33 ZIP.
- **Search operator / gunner (оператор поиска–наводчик):** helmet+goggles, gas mask, AKM mags, AДК kit. AKM mounts on the operators' hatch cover.
- **Commander:** loaded AKM mags, gas mask, helmet+goggles, drawing-compass-ruler, drinking water, 1РЛ33 ZIP-1.
- **Driver (механик-водитель):** 4 grenades, helmet+goggles, gas mask, protective kit, first-aid kit, AKM, drinking water, ТВН-2, ДП-3Б roentgenometer ZIP, ТКН-1Т + ТПКУ-2 night devices.
- Crew personal weapons = **AKM** rifles.

---

## 4. ⭐ CHAPTER 3 — PREP FOR USE (Глава 3) — exact control settings

> *"Скоротечность современного боя"* — modern combat's transience demands the crew bring the ZSU to fire-readiness **fast**, possible only with materiel knowledge + tight crew coordination.

### Convention
**A toggle with no nameplate: handle UP = ON, handle DOWN = OFF.**

### Uncovering (Расчехление)
Unfasten latches/hooks → remove gun cover (fold onto rear hull) → remove RLS antenna cover → remove R-123 + ТНА-2 covers (stow behind commander's seat). (Covering = reverse; flash-hider caps fitted, rocking part locked.)

### Pre-combat checks (Проверка снаряжения и заправки) — 11 items
1. **Ammo** by cartridge counter on commander's panel.
2. **Coolant** by gauge on commander's panel; if **250–300 mm below mark, lamp УРОВЕНЬ ОЖ lights** → top up.
3. **Front fuel tank** by neck level gauge (marks to **П=full**).
4. **Rear fuel tank** by electric gauge on driver panel (toggle **ПИТАНИЕ ПРИБОРОВ** on; П=full).
5. **V-6R oil** dipstick (marks 10/15/20Н/25/30/40В; **40В=full, 20Н=min**).
6. **GTD DG4M-1 oil** (marks **МНОГО=full / МАЛО=min**).
7. **SEP reductor oil** (marks **В=full / Н=min**).
8. **Vehicle coolant** expansion tank (90–100 mm below flange).
9. **Washer water** via sight tube.
10. **Air-start pressure**: open valve, read manometer (full **150**, min **100 kg/cm²**).
11. **ZIP-1 / weapons / kit** present & secured.

### ⭐ Section 4 — Initial control positions (per station)

**COMMANDER'S PANEL (Пульт командира):**
| Ctrl | Set to |
|---|---|
| 19 **ОГРАНИЧЕНИЕ УГЛОВ** (angle limit) | **30°** |
| 18 **ШУНТ–СРП** | СРП |
| 17 **АВАРИЙНАЯ СТРЕЛЬБА** (under sealed flap) | OFF |
| 15 / 14 **СТРЕЛЬБА ВЕРХНИХ / НИЖНИХ АВТ.** (fire upper/lower) | OFF |
| 11 **ЦЕПЬ СТРЕЛЬБЫ** (firing circuit) | OFF |
| 9 **КОМАНДИР–ОПЕРАТОР** | КОМАНДИР |
| 7 **27в–54в** | 54в |
| 29 **ПАН НАЗЕМН.** (ground mode) | OFF (left) |
| 28 **ГП АВАР.** | OFF |
| 35 **ГАГ** | OFF |
| 34 **НАПРЯЖ. ФАЗ** | any |

**SRP / Б-1 fire-control computer:**
- 5 SRP-ventilation toggle → OFF; correctors **47, 71 → "0"**; 77 **УПР** (lead) → **ON**; 79 **ΔV₀%** → "0"; 82 **СКОРОСТЬ** → ON; 83 **ПИТАНИЕ ~115в** → OFF; 84 **ЗУ** → OFF; 85 **φ,βу,Tу** → OFF; 86 **α** → ON; 87 **УСТАНОВКА ЦЕЛЕУКАЗ** → any; 51 **ДВИГ. βу** → ON; 96 **ДВИГ. K1** → ON.
- **⚠ For work involving ONLY the 1РЛ33 radar, switch 96 OFF.**

**Blocks Т-28/Т-55/Т-36, visor & laying reductors (gunner station):**
- 136 → **ВИЗИР**; 158 **КНОПКА–ПЕДАЛЬ** → КНОПКА; 156 **ГОН–ВЫКЛ.** → ГОН; 165 **ПОДСВЕТ** → ON; 177 **ФОКУС** → middle; 152 **ВКЛ.ЗУ–ВЫКЛ.ЗУ** → ВЫКЛ.ЗУ; 175 **МАСШТАБ** → **15**; 173 **ЯРКОСТЬ** → far left; 168 **ПОЛУАВТ.–АВТ.ГП** → АВТ.ГП; 169 **УСИЛЕНИЕ ПРИЕМНИКА** → far right; 148 **ШИРИНА СЕКТОРА** → pressed in.
- T-55 handles **142 & 147 locked raised** on fixator 176 (pull knobs **174 ПОЛУАВТ.УМ / 178 ПОЛУАВТ.АЗ** out before raising, recess after).
- Vertical-laying mode handle → **МАХОВИК** (handwheel); gun-lock handle → **СТОПОР**.

**Pneumo panel:** 3 **КОМПРЕССОР** → ON; **МАНОМЕТРЫ** (since 1967) → ON; compressor blow-fan (since 1969) → OFF winter / ON summer (cover wired).

**Range-operator blocks:** 204 **ПЕЛЕНГ** → I; 198 **ВОБУЛЯЦИЯ** → OFF (sealed); 212 **ТОК ГЕНЕР.–ТОК ВЫПР.** → ТОК ГЕНЕР.; 195 **ШТ–СЦ** → ШТ; 194 **УУС–СТРОБ** → СТРОБ; 213 **РЕГУЛИР.ТОКА ГЕНЕР.** → far left; 192 **СМ1-СМ2-СМ3** → any.

**Blocks behind/right of range op, behind gunner, behind commander (RLS/computer):**
- 219 **РУЧН.–АВТОМ.** → РУЧН.; 191 **ПЕЛЕНГ–ПОИСК** → ПОИСК; 190 **I РЕЖИМ–II РЕЖИМ** → I РЕЖИМ; 189 **ЧАСТОТА КОМПЕНСАЦИИ** → middle; 186 **НАКАЛ–ВЫКЛ.** → ВЫКЛ.; 185 **АНОДНОЕ–ВЫКЛ.** → ВЫКЛ.; **Т-22 range scale → 2400 m**; 182 **РАБОТА–БАЛАНС ДМ–БАЛАНС УПТ** → РАБОТА; control switch on Б-2 (under range-op seat) → off; 225 **УСИЛЕНИЕ** & 229 **ОБР.СВЯЗЬ** → per ZSU formulary.
- 241 → РАБОТА; 239 **РАБОТА–КОНТРОЛЬ I** → РАБОТА; 6 (fig.2) → ВКЛ.; 4 on Т-52 → ВЫКЛ.; 4 (fig.17) **ВКЛ.ПАЗ–ОТКЛ.** → ОТКЛ.; 1 **ВКЛ.ВЕНТИЛ–ОТКЛ.** → ОТКЛ.; 5 → АВТОМАТ; net-breakers 10/11/8 → ON; 12 (fig.18) → a ПРОВЕРКА ЛАМП position; 16/15/14 (fig.2) **ПИТАНИЕ ВПК / ДВИГАТ.K,Δq / ДВИГАТ.β,ε,Δε** → off; stopper 23 **СТОПОРЕНИЕ АНТЕННЫ** → РАССТОП.; system stoppers 13/11/26/27/29 → РАССТОП.; 33 **РАБОТА I–РАБОТА II–ТРЕНИРОВКА** → **РАБОТА II**; Н–А on Т-7М → А; **turret-horizontal-lock handwheel** → turned right to stop; race-seal handle → toward range-op, locked; 43 (Т-39М) → ВКЛЮЧЕНО; 41 **I РЯД–II РЯД** → any; 42 → ВЫКЛ.; handle 7 (fig.16) horizontal-laying mode → **РУЧН.**

**DRIVER STATION (control compartment, fig.3 + PAZ panel fig.17):**
- Net breakers 63 **ПИТАНИЕ ПОДОГРЕВАТ.**, 64 **ОБЩЕЕ ПИТАНИЕ МАШИНЫ**, 78 **ПИТАНИЕ СТЕКЛООЧ.**, 73 **ПИТАНИЕ СПИДОМЕТРА**, and (under flap 22) **ОТКЛЮЧ.ГЕНЕРАТ.** + **ОТКЛЮЧ.АВТОМАТ ЗАП.ГТД** → ON (up).
- 26 pyro-check → 0; 34 heater → I РЕЖИМ; 44 headlamp-blackout → middle; 72 ТВН-2 + toggles 77/81/80 → toward driver, rest down; button 42 **ФАРА** → pressed, turned CW to stop.
- Net-breaker buttons 12 **ГТД-1**, 6 **ГТД-2**, 3 **ПИТАНИЕ ПОТРЕБИТЕЛЯ**, 71 **ПОДГОТОВКА ЗАПУСКА**, 1 **ПИТАНИЕ СТАРТЕРА**, 61 **ЦЕПЬ ТНА-2**, 2 **АВАРИЙНОЕ ОСВЕЩЕНИЕ** → pressed to stop.
- ТВН-2 power toggle 7 (fig.33) → ВЫКЛ.; ТНА-2 toggles 1 **ПРЕОБР.** & 2 **СИСТЕМА** → off.
- **SEP reductor engage handle** (right behind driver seat) → ENGAGED (rear); manual fuel-feed drive → rear; gear lever → neutral; V-6R fuel cock → "front tank"; air-cylinder valve → CW to stop; air-start reducer handle → CW to stop; mountain-brake pedal → initial.
- **PAZ panel (fig.17):** 1 ВКЛ.ВЕНТИЛ.–ОТКЛ., 4 ВКЛ.ПАЗ–ОТКЛ., 5 **АВТОМАТ–РУЧНОЕ**; breakers 8 (АЗС-50 ПАЗ), 10 (АЗС-5 ТКН-1Т), 11 (АЗС-5 АВАР.ОСВЕЩ.); lamp 3 ПАЗ СИГНАЛ; remote switch 9 ДП-12.

---

## 5. ⭐ STARTUP SEQUENCE (Chapter 3 §5–§7)

### Ventilation prep & switch-on (§5)
Open all intake/outlet flaps (12-mm wrench): 3 crew-compartment intakes (under visors, turret sides), 3 RLS outlets (turret roof), intake valve under turret, SRP/Т-37/Т-40 outlets. SRP outlet via handle 7 (fig.15).
- **Crew compartment vent:** with generator ПГС2-14А running, PAZ blower ON via toggle 1 (fig.17). After 4 h run, break ≥30 min.
- **Control compartment vent:** manual covers; only with V-6R running.
- **Equipment vent:** SEP on → SRP vent auto via thermorelay (lamp 6 lights; force via toggle 5); RLS vent via toggle 186 НАКАЛ; ОПК vent via toggle 83 ПИТАНИЕ ~115в; 2Э2/ВПК/Т-2 vent via toggle 16 (fig.2) ПИТАНИЕ ВПК. SRP vent auto-off below +30 °C.

### ⭐ SEP power-up (§6) — source selection
- **Parked → always use GTD** (continuous run **≤8 h**). V-6R for SEP on parking only briefly (≤10 min), or in rain/heavy snow when GTD can't run.
- **SEP from V-6R:** start V-6R (GM-575 manual) → switch on converter. Maintain **1550–1700 rpm**; if green lamp 18 ГЕНЕРАТОР not lit, sharply raise to 1700–1900 until it lights, then hold 1550–1700.
- **Moving:** SEP from V-6R, never below **1250 rpm** (tach 48). Exception: on 1st gear with full RPK load, may start GTD (no/low dust) at 2000–2100 rpm V-6R, ~2 min.

### ⭐ GTD start sequence (driver, on commander's command)
1. Board net ON: button **ВКЛЮЧЕНИЕ ПИТАНИЯ** (driver panel).
2. Open GTD flaps: press **ХОЛОДНАЯ ПРОКРУТКА** 1–2 s, confirm lamp **ОТКР.ЗАСЛ.**
3. Warning audible signal: button 40.
4. **COLD CRANK:** press & hold button **14 ХОЛОДНАЯ ПРОКРУТКА** until **15–20 % RPM** (tach 57), **≤10 s**, release. Lamps **20 ОТКР.ЗАСЛ., 15 СТАРТЕР ГТД, 17 ГТД** light. Check battery voltage (voltmeter 62) via button **5 ЦЕПЬ +27в** — **must not drop below 18 V**. Watch oil pressure **0.15–0.2 kg/cm²**; **no oil pressure → max 3 cold cranks.** *(If ОТКР.ЗАСЛ. lights but СТАРТЕР ГТД doesn't after 3–5 s, abort — check exhaust flap really opened / clear icing.)*
   - ⚠ **Skipping cold crank before hot start runs bearings dry → failure. Start only with oil pressure shown.** Never crank/start with empty fuel tank.
5. **HOT START:** after RPM drops to 0 % (tach 57), press button **10 ПУСК ГТД** 1–2 s (under guard). Lamps 17 ГТД + 15 СТАРТЕР ГТД light. **At 44 % RPM starter auto-disconnects**, lamps 20 + 15 go out. Stop = button **11 СТОП ГТД**.
6. DC generator auto-connects when its V > battery V → **green lamp 18 ГЕНЕРАТОР** lights.
7. Start complete at idle **98.5–103.5 % RPM** → driver **reports "GTD started"** to commander.

### GTD running limits (driver monitors continuously)
- RPM (tach 57): **98.5–101.5 %**; exhaust temp (therm 56): **≤650 °C**; oil temp (therm 55): **≤110 °C**; oil pressure (man 59): **0.5–2.5 kg/cm²**. Even high-tone noise; light exhaust smoke OK. Transient (≤3 s) RPM 106.5 %↑ / 92.5 %↓ allowed on load change. **On surge/over-limit: immediately start V-6R (1550–1700 rpm), STOP GTD (button 11), report.**

### ⭐ Converter switch-on (commander, after driver's readiness report)
- Press button **36 ПУСК БПС** (fig.1) → lamp **21 ПРЕОБРАЗ.** + voltmeter 32 reads **220 V**.
- **Combat shortcut:** pressing ПУСК БПС before GTD start **auto-starts the GTD** and switches the converter when it spins up — allowed only in combat (commander has no GTD instruments). Same auto-start if pressed with V-6R at low RPM (generator off-net) — so keep V-6R ≥1550 rpm when switching converter.
- To pre-empt accidental auto-start during checks/training: driver switches **right toggle АВТОМАТ.ЗАП.ГТД** (under flap 22) OFF; otherwise it stays ON.

### SEP monitoring & ⚠ emergency
- Commander: voltmeters 30 & 32 (in colored arc), hertzmeter **386–416 Hz**. Driver: panel voltmeter. DC overvoltage → driver emergency-disconnects ПГС2-14А. Verify battery-compartment fan running.
- ⚠ **Lamp 18 ГЕНЕРАТОР lit after V-6R stop (GTD running) OR after GTD stop (V-6R off) = АВАРИЙНЫЙ РЕЖИМ** → immediately switch OFF left toggle **ОТКЛЮЧ.ГЕНЕРАТ.** under flap 22.

### SEP shutdown
1. Converter off: button **1 СТОП БПС** (commander).
2. GTD stop (driver): run **3 min idle** after load removed → button **11 СТОП ГТД** → after full stop do **1–2 cold cranks of 8–10 s** (2–3 min apart) → button **16 ЗАКР.ЗАСЛ.** (lamp 20 ОТКР.ЗАСЛ. reminds) → fuel cock **ЗАКРЫТЫ ОБА БАКА**.
3. Full power-off: button **8 ОТКЛЮЧЕНИЕ ПИТАНИЯ** (driver) + button **4** (commander) → batteries off board net.

---

## 6. ⭐ RADAR ANTENNA RAISE / LOWER (1РЛ33, §7)
- Precondition: clear the swing zone; open right-compartment cover + cylinder valve 3 (fig.10) + valve on right race beam. **Raise only with pneumo pressure ≥20 kg/cm²** (man 4, fig.15).
- **Auto-raise:** SEP on (yellow lamp 18 **НОЛЬ ε** lights) → stopper 23 **СТОПОРЕНИЕ АНТЕННЫ** to ЗАСТОП. while holding toggle 17 **ПНЕВМОКЛАПАН** ON (lamp 21 **АНТЕННА ОПУЩЕНА** on) → press & hold button **19 ПОДЪЕМ** until lamp 20 **АНТЕННА ПОДНЯТА** → release; stopper 23 → РАССТОП.
- **Auto-lower:** check pressure ≥20; power via button 6; turn mirror to rear → hold toggle 17 ПНЕВМОКЛАПАН, press button **22 ОПУСКАНИЕ** until lamp 21 АНТЕННА ОПУЩЕНА → release; stopper 23 → РАССТОП.; close race-beam & cylinder valves.
- Manual raise/lower via torque-key 2 on Т-2 reductor (fig.19) provided as fallback.

---

## 7. COMMS (§8) — Р-124 intercom + Р-123 radio
- **Each crewman:** plug headset fishka 7 into chest-box 5; set A-1/A-2 switches 4 & 15 to **ВС** (internal); power button 6; trim gain knob 3. All hear each other regardless of tangenta.
- **External:** commander sets A-1 selector to **Р-123** (leaves internal net, receives target designation). Gunner can also go external (A-2→Р-123). Press chest tangenta to **ВЫЗ** for urgent internal call.

---

## 8. ⭐ GUN LOAD / UNLOAD (AZP-23, §9)
### Chamber first rounds onto feed fingers
Lock turret → handle 2 (fig.15) gun-stopper to **НАВОДКА** → manual-lay to **0–7°** elevation, caps off → open & fix both front-compartment covers → toggles ЦЕПЬ СТРЕЛЬБЫ / СТРЕЛЬБА НИЖНИХ / ВЕРХНИХ АВТ. OFF → with rammer levers 2 (fig.9) chamber first rounds on **3 autocannons (all but LEFT-UPPER)** to a click → manual-lay to **~30°** → chamber the **left-upper** autocannon → close covers.

### Load (cock)
Elevation **30–35°** → toggle **11 ЦЕПЬ СТРЕЛЬБЫ** ON → press buttons **16 ПЕРЕЗАРЯДКА** in turn → lamps **ЗАРЯЖЕНО** light on commander panel.
- ⚠ **Pneumo-recharge categorically forbidden below 40 atm.** Manual fallback: pull recharge handles up to the sear; lamps 23 ЗАРЯЖЕНО light.

### Unload (after ammo expended / cease-fire / travel / uncleared jam)
Elev 30–35° → power button 6 → toggle 11 ЦЕПЬ СТРЕЛЬБЫ ON → pneumo-recharge all → toggle **18 ШУНТ–СРП → ШУНТ** → control release: toggle **123 ОХЛАЖДЕНИЕ** ON + press button **121 ОГОНЬ** → confirm all 23 ЗАРЯЖЕНО out → controls to initial, button 1 СТОП БПС, SEP off → remove receiver-box shield → open & fix both front covers → elev **10–15°** → cock upper autocannons (manual recharge), hold cable taut, open receiver covers, confirm empty, drop links to collector, close covers, smooth-release via buttons **21 ОДИНОЧНЫЙ СПУСК АВТОМАТОВ** → remove upper sleeves 4 + sector trays → repeat for lower autocannons → reinstall trays/sleeves.

### Turret/gun unlock & lock + flash-hider caps (§10–§11)
- **Unlock:** race-seal bar 3 (fig.23) vertical, swing seal handle 4 toward gunner → bar 3 horizontal → flip fixer latch 2 to handwheel center, rotate handwheel 1 CCW to stop while rocking turret → stopper 23 (Т-2) → РАССТОП. → verify free turret rotation (handwheel 5) → pull handle 2 (fig.15) to **НАВОДКА** → verify free rocking (handwheel 10).
- **Lock turret:** handle 7 → РУЧН., set gun on ZSU axis (zero coarse-readout) → fixer latch 2 to center, handwheel 1 CW to stop → latch to outer edge (recess fixer) → seal bar 3 vertical→horizontal → verify.
- **Lock rocking part:** handle 1 (fig.15) → **МАХОВИК**, elevation 5–7°, pull gun-stopper handle 2 forward to **СТОПОР**, rock via handwheel until stopper 1 (fig.24) seats.
- **Flash-hider caps auto-drop when barrels deviate ±5–7° from the locked position** (raise via handwheel 10). To refit: lock rocking part, pull cable 10 (fig.5) forward, fit caps.

---

## 9. ⭐ RPK SWITCH-ON — distributed across 3 crew (§12)
SEP on first. Then, in strict order:
1. **Commander:** check source V (voltmeters 30 & 32).
2. **Range op:** toggle **186 НАКАЛ** ON → backlights + RLS vent start.
3. **Commander:** toggle **35 ГАГ** ON → lamp 3 ЗАСТОПОРЕНО goes out, lamp 5 ОТСТОПОРЕНО lights → press **31 КОНТРОЛЬ**, lamp **33 НЕИСПРАВНО must NOT light** (if it does → ГАГ off, no stabilization). *⚠ Until lamp 3 out (≤3 min) never toggle 35 off or press 31.*
4. **Gunner:** toggle **16 ПИТАНИЕ ВПК** ON.
5. **Range op:** after lamp 187, toggle **185 АНОДНОЕ** ON → lamp 222; device 199 **ТОК СМЕСИТЕЛЯ 0.4–0.8 ma**. *(Combat fast-anode: press ГОТОВНОСТЬ АВАРИЙНО on Т-27М.)*
6. **Gunner:** set search-indicator brightness/focus (ФОКУС/ЯРКОСТЬ on Т-28), sweep length/centering (АМПЛИТУДА РАЗВЕРТКИ/ЦЕНТРОВКА), mark brightness (ЯРК.ВИЗИРА/МАСШ.МЕТОК/СТРОБ.МЕТОК).
7. **Range op:** check mixer currents (192 → СМ-1/2/3, each 0.4–0.8 ma); set range-indicator focus/brightness/shift (Т-23 knobs 202/210 ФОКУС, 200/211 ЯРКОСТЬ, 206/208 ВЕРТИК.СМЕЩ., 203/209 ГОРИЗ.СМЕЩ.).
8. **Gunner:** toggles **15 ПИТАНИЕ ДВИГ.K,Δq** + **14 ПИТАНИЕ ДВИГАТ.β,ε,Δε** ON.
9. **Range op:** press **224 ВЫСОКОЕ НАПРЯЖЕНИЕ ВКЛ.** → lamp 221, device 218 magnetron current ~5 ma → set magnetron current to formulary via **213 РЕГУЛИР.ТОКА ГЕНЕР.** → toggle 212 → ТОК ВЫПР. (device 216 = 100–170 ma) → toggle 212 → ТОК ГЕНЕР.
10. **Gunner:** select search — **171 СЕКТОРНЫЙ** (width via 148 ШИРИНА СЕКТОРА) / **170 КРУГОВОЙ**; manual antenna = unlock Т-55 handles 142/147 (fixer 176 up+90°), press **145 НАВЕДЕНИЕ**; semi-auto = pull knobs **178 ПОЛУАВТ.АЗ** + **174 ПОЛУАВТ.УМ**; null antenna drift via **БАЛАНС МОСТА**; aim antenna at a local object.
11. **Range op:** **220 ПОДСТРОЙКА ЧАСТОТЫ** → max signal; toggle **219 РУЧН.–АВТОМ.** → АВТОМ.
12. **Gunner:** auto-track = press **146 АВТ.**; bearing search via **191 ПЕЛЕНГ**; sweep scale **175 МАСШТАБ 10/15/20**.
13. **Commander:** toggle **83 ПИТАНИЕ ~115в** ON.
**Switch-off = reverse**, by station (commander ГАГ+115в off, range op magnetron down + 223 ВЫСОКОЕ НАПРЯЖЕНИЕ ВЫКЛ. + АНОДНОЕ + НАКАЛ off, gunner 16/15/14 off), then all controls to initial.

---

## 10. ⭐ LAYING DRIVES 2Э2 SWITCH-ON (§13)
**Prep:** unlock gun+turret; clear az/el path; close driver hatch (lamp 8 ЛЮК ОТКРЫТ out); handle 7 (fig.16) → **СИЛ.**; handle 1 (fig.15) → **СИЛОВАЯ**.
**Auto mode:** RPK on → press **25 ГИДРОПРИВОД ВКЛ.** 1.5–2.5 s → lamp 26 → check no abnormal noise/vibration (else **27 ГИДРОПРИВОД ВЫКЛ.** at once) → antenna toward likely target via Т-55 → toggle **85 φ,βу,Tу** ON → let drives settle → toggle 85 OFF.
**Semi-auto:** toggles 15 + 14 OFF → pull knobs 178/174 → toggle **168 → ПОЛУАВТ.** → press 25 ГИДРОПРИВОД ВКЛ. → drive via Т-55 handles (residual rate ≤1.5°/s with handles released; trim via БАЛАНС on Т-39М).
**Off:** press **27 ГИДРОПРИВОД ВЫКЛ.** → toggle 168 → АВТ.ГП.
**Visor prep (§14):** uncap heads, clean ocular/glass, focus via ring 135.

---

## 11. READINESS CHECK (§16) — short functional test
Set controls initial → SEP on, raise antenna, RPK on (check source V on voltmeters 30/32 + 3/38) → aim antenna at local object → check АПЧ (220 max signal, 219→АВТОМ., amplitude steady) → aim at single object ≤8 km → strobe it on precise range sweep → press **146 АВТ.** (antenna locks) → laying drives on → toggle **85 φ,βу,Tу** ON. RLS must hold object steady; allowed turret wobble **≤0-04 at ≤2.5 km, ≤0-20 at ≤5 km**. Angular-auto test: ПОЛУАВТ.–АВТ.ГП → ПОЛУАВТ., slew turret **28-00** off object via Т-55, then → АВТ.ГП → turret returns to antenna agreement. Then drives/RPK/SEP off.

---

## 12. ⭐ CHAPTER 4 — COMBAT WORK (Глава 4)

### Crew duties (4 stations)
**КОМАНДИР (commander):** knows materiel; responsible for ZSU prep; directs crew & gives combat commands; works external radio + controls crew via TPU; observes via cupola sights on parking; **performs pneumo-recharge of the autocannons**; selects the combat mode, sets toggles/handles on SRP, Т-39М, commander panel, ТНА-2, ДП-3Б; switches laying drives on/off; **OPENS FIRE via the trigger (спусковой крючок) on the laying handle (рукоятка огня)**; runs servicing; keeps the formulary.
**ОПЕРАТОР ПОИСКА–НАВОДЧИК (search operator / gunner):** controls **RPK + gun in all modes**; on command **loads the gun & does manual recharge**; **fires** at air & ground targets; services apparatus/armament.
**ОПЕРАТОР ДАЛЬНОСТИ (range operator):** controls the **RLS in all modes** (range channel, strobe, magnetron); services apparatus.
**МЕХАНИК-ВОДИТЕЛЬ (driver):** knows/operates GM-575, GTD, SEP, fire kit, night-vision, navigation in all modes; fixes faults; **starts/stops movement on command**; drives smoothly (rough driving fails the electronics); in narrow gaps accounts for the **~6 m circle** swept by the barrels when the turret turns.
*Universal:* every crewman can work intercom/radio/sights, do other stations' combat tasks, and start/stop the GTD. Commander+operators load the belts (mind ОФЗТ/БЗТ shell ratio, link seating, range-markers) and unload.
**Mount order:** commander via turret hatch; gunner+range-op via roof hatch (range-op first); driver via bow hatch. **Dismount: gunner first.**

### Travel position & 3 readiness degrees (§2)
**Походное (travel):** filled; turret fore-aft; antenna down+locked; visor capped; apparatus off; gun unloaded; turret+gun locked; race seal tight; flash-caps on; pneumo valves closed; gun covered; flaps closed; V-6R ready/running.
**Готовность №3:** uncover gun+antenna; check load/fuel; feed belts to feed fingers; prep vent; crew in, helmets on radio set; controls→initial; SEP on; raise antenna; **RPK on WITHOUT transmitter**; orient ZSU; readiness check; apparatus off if no further order.
**Готовность №2 (from №3):** ram first rounds to feed fingers; crew in; release race seal; **unlock gun+turret**; drop flash-caps; prep laying drives; orient ZSU; hold at stations.
**Готовность №1 (from №2):** **load autocannons; switch on RLS transmitter; laying drives → auto; toggle φ,βу,Tу → ВЫКЛ.; toggle ДВИГ.K1 OFF if defending a stationary object.**

### Firing from place vs on the move (§3)
- **From place:** occupy position → bring to **№1**; toggle **96 ДВИГ.K1 OFF**.
- **On the move:** bring to **№2** with toggle **96 ДВИГ.K1 ON**, switch **19 ОГРАНИЧЕНИЕ УГЛОВ at 0**, turret+gun locked, caps on. On command/target-designation: **stop → unlock → drop caps → prep drives → go to №1 → resume movement & fire.**
- ⚠ Switching drives on while moving: turret/handwheel can swing under dynamic load — minimize the unlock→drive-on gap and **DON'T press the horizontal-reductor handwheel button** during it.

### ⭐ The 5 combat modes (§4)
| Mode | Angular source | Range source | Lay | Fire signal / use |
|---|---|---|---|---|
| **1 (main)** | RLS auto-track | RLS | auto (RPK computes full lead incl. pitch/yaw) | **ЕСТЬ ДАННЫЕ** from SRP |
| **2** | **visor** (gunner via Т-55) | RLS auto | auto | **ЕСТЬ ДАННЫЕ**; backup vs jamming / angular-track fault; **main mode vs GROUND targets** (range set by range-op on command) |
| **3 (ЗУ)** | memorized X/Y/H + Vx/Vy/Vн (uniform straight-line extrapolation) | memorized | auto | when RLS may lose target; **duration 8–10 s** |
| **4** | pricel-dubler (backup sight, linked to gun) | aspect ring (ракурсное кольцо) | semi-auto drives | on SRP/RLS/stabilization failure (air) |
| **5** | pricel-dubler **remote grid** | — | semi-auto or manual | **ground targets from place** |
| **Emergency** | mode 4 or 5 | — | drives on **battery power** | SEP failure / only ПГС2-14 alive |

### ⭐ Mode-1 detection → track → lay → fire (§5)
1. Point gun into search sector: gunner **145 НАВЕДЕНИЕ** + Т-55 to sector; range-op set range **5000–7000 m**; commander toggle **φ,βу,Tу** + drives ON; after gun↔antenna agree, toggle φ,βу,Tу OFF.
2. Search: **171 СЕКТОРНЫЙ** (width via 148) or **170 КРУГОВОЙ** (recon/no designation); sector **<30°** → manual (НАВЕДЕНИЕ + Т-55).
3. Target appears as a **brightness mark** on search indicator / narrow pip on coarse + wide on precise range sweep.
4. Lock: gunner **145 НАВЕДЕНИЕ** + Т-55 bring mark to visor line; range-op handwheel **228** aligns strobe on coarse then precise sweep, calls **"застробирована"**; gunner presses **146 АВТ.** → RLS auto-tracks. For fast targets range-op sets **194 СТРОБ–УУС → СТРОБ** and calls range every **500 m**.
5. Fire: commander at range **9–10 km** switches **φ,βу,Tу** ON → drives aim gun at lead point; **open fire on ЕСТЬ ДАННЫЕ**. Re-tasking to new target → toggle φ,βу,Tу OFF first.

### Mode-2 detail (§6) — visor-angular + RLS range
Range-op toggle **190 → II РЕЖИМ**. Gunner: visor knob **130 ВИЗИР → 2×**, knob **134 СЕТКИ** insert crosshair grid; pull knobs 178/174; press **145 НАВЕДЕНИЕ**; hunt via visor (steer Т-55); on detection bring crosshair on target, knob **130 → 6×**, track. Range-op strobes (handwheel 228) → "застробирована"; gunner presses **146 АВТ.** and tracks by visor. Range-op calls range every 500 m. Commander at **<9–10 km** toggles **φ,βу,Tу** ON.

### Mode-4 detail (§7) — aspect-ring (ракурсное кольцо), from place
Commander: toggle **9 КОМАНДИР–ОПЕРАТОР → ОПЕРАТОР**, **18 ШУНТ–СРП → ШУНТ**. Gunner: **158 КНОПКА–ПЕДАЛЬ → КНОПКА**; knob **136 → ДУБЛЕР**; **137 ДУБЛЕР → 2×**; light filter via 131; focus via 135; select aspect grid by target speed (**60 / 120 / 220 / 300 m/s** via knob 134; 300 only at aspects 0,¼,2/4,¾); grid brightness via **138 СВЕТЛО–ТЕМНО**; estimate speed by aircraft type; toggle **АВТ–ПОЛУАВТ.ГП → ПОЛУАВТ.ГП** (trim residual via БАЛАНС on Т-39М); pick aspect ring (4/4·3/4·2/4·1/4) by observed aspect, place ring on aircraft nose so flight path passes through crosshair → **open fire via buttons 144 + 143 on the LEFT control handle 142.**

### Ground-target firing (§8)
- **Main = mode 2 via RPK.** Tilt ZSU toward target for more depression. Commander ranges visually via **ТПКУ**, sets switch **19 ОГРАНИЧЕНИЕ УГЛОВ → 0**, toggle 9 → ОПЕРАТОР. Range-op sets commanded range on Т-22. Gunner crosshairs target via Т-55. Commander toggles **φ,βу,Tу** ON + **18 → ШУНТ**. Gunner **158 → КНОПКА** → fire via **144 ОХЛАЖДЕНИЕ + 143 ОГОНЬ** on handle 142.
- **Mode 5 (RPK out) via pricel-dubler remote grid:** commander 18→ШУНТ, 9→ОПЕРАТОР, **29 ПАН.НАЗЕМН.** ON, 19→0, range in hectometers. Gunner: drives → semi-auto; **136 → ДУБЛЕР**; **137 → 6×**; grid 6× via 134; via Т-55 align vertical grid line on aim point + horizontal range-mark on target center (**bring mark up from below only**) → fire **144+143**; **short bursts 3–5/barrel**, re-aim each burst. If hard: **158 → ПЕДАЛЬ**, manual handwheels, fire by foot-pedal.

### Emergency mode (§9)
Commander toggle **28 ГП АВАР.** ON, 9→ОПЕРАТОР, 18→ШУНТ. Gunner aims+fires as mode 4. ⚠ Drives run on **batteries** — over-discharge kills them (no risk if ПГС2-14А alive).

### Target designation (§11)
Commander relays **azimuth + elevation** to gunner. Gunner in **НАВЕДЕНИЕ** steers antenna to commanded az/el by indicator + ЦЕЛЕУКАЗАНИЕ ε scales (no ε → set antenna elev **1-00**); finds target; proceeds per chosen mode.

### Jamming & low-flyers (§12)
- **Passive (chaff):** range-op **195 ШТ–СЦ → СЦ** (moving-target selection), tune **189 ЧАСТОТА КОМПЕНСАЦИИ**, toggle **198 ВОБУЛЯЦИЯ** ON.
- **Active noise:** switch RLS to a different frequency.
- **Impulse/spiral jamming:** ВОБУЛЯЦИЯ ON.
- Anti-jam insufficient → **mode 4**. Risk of losing target in auto-track at **≤2500–3000 m → mode 3 (ЗУ)** (toggle **84 ЗУ** by commander, or **152** by gunner).
- **Low-flyers (50–200 m):** toggle **29 ПАН НАЗЕМН.** ON + RLS **СЦ** mode + search → on capture go to **mode 2** (range from RLS in СЦ). Minor reflections → main mode.

---

## 13. ⭐⭐ OPENING & CONDUCTING FIRE (§13)
- **Modes 1 & 2: open fire only after lamps 74 / 20 / 157 ЕСТЬ ДАННЫЕ light.**
- **Vs air = ALL 4 autocannons together** (switches 14 & 15 UP). Before firing, toggle **11 ЦЕПЬ СТРЕЛЬБЫ** ON → lamp 10. Vs ground (shell economy) = **2 autocannons** (kill upper or lower pair via 14/15).
- **Commander fires:** toggle **123 ОХЛАЖД.** + pull trigger **121** on the laying handle (**рукоятка огня 122**).
- **Gunner fires:** buttons **144 + 143** on control handle 142 (toggle **9 → ОПЕРАТОР**, red lamp **159 ВНИМАНИЕ** lit, **158 → КНОПКА**). Manual-handwheel laying → **158 → ПЕДАЛЬ**, fire by foot-pedal (fig.30) — also recommended in mode 2.
- **Emergency fire** (all blocking bypassed): commander sets toggle **17 АВАРИЙНАЯ СТРЕЛЬБА** (warn driver).

### Cease fire
Commander release trigger 121 → release toggle 123 (gunner: release pedal or button 143 + 144). Then commander turns off toggle **11 ЦЕПЬ СТРЕЛЬБЫ**. ⚠ If fire continues after releasing trigger AND turning off ЦЕПЬ СТРЕЛЬБЫ → wait it out, stop laying, do **not** reload that autocannon until fixed.

### ⭐ Burst regime (rate)
- Slow targets (planes/helos/gliders/paradrops): **3–5 or 5–10 rounds/barrel**.
- Fast targets (jets/rockets): **3–5 or 5–10/barrel**; with commander's OK **long bursts up to 50/barrel, 2–3 s between bursts**.
- Ground: **3–5 or 5–10/barrel**.
- **In all cases: after 120–150 rounds/barrel → 10–15 s break.**
- Self-destruct hazard: firing over own troops at elevation **<9°** is unsafe (rounds self-destruct low/on ground).
- **Pitch limit ±10°** for normal operation; on >10° slope fire only short bursts on level spots.
- **Fire on the move:** RLS-mode ≤**20–25 km/h**; broken road ≤**5–10 km/h**.
- Misfire: manual recharge → **wait 1–2 min (hangfire risk)** then recharge; pneumo-recharge immediately, hatches closed.

---

## 14. OBSERVATION DURING COMBAT (§14)
1. Watch red **23 ЗАРЯЖЕНО** lamps — one out + counter shows rounds → that autocannon needs recharge (do it between bursts).
2. Watch pneumo manometer — **<35 kg/cm² recharge impossible (circuit opens).**
3. Watch cooling via lamp **13 ОХЛАЖДЕНИЕ** + **12 УРОВЕНЬ ОЖ** (low coolant).
4. Driver watches GTD: tach **98.5–101.5 %**, oil temp ≤110 °C, oil pressure 0.5–2.5 kg/cm², exhaust ≤650 °C.
5. Out-of-limits → kill converter + stop GTD.
6. Ambient >+10 °C → crew-vent ON (toggle 1, fig.17).
8. On the move: **commander watches lamp 5 ОТСТОПОРЕНО — not lit = can't fire moving, fire from short halts.**
9. **Continuous-run limits: RPK ≤8 h, laying drives ≤2 h, PAZ blower ≤4 h, GTD ≤8 h; then cool ≥1 h (drives).**

### ⭐ Jam / fault → emergency remedy table (§15)
| Fault | Remedy |
|---|---|
| Moving parts off sear, not returned (a 23 ЗАРЯЖЕНО out) | Pneumo-recharge; if still dark after 2 tries, stop & fire other autocannons |
| Pump motor dead (13 ОХЛАЖДЕНИЕ out) | **Emergency mode** — fire ≤50/barrel then full cooling |
| Gun not laid by drive | Manual laying (ground targets) |
| Anode voltage off (187 out) | **Mode 4** (aspect ring) |
| RLS not tracking angularly | **Mode 2** (visor angular, RLS range) |
| RLS not tracking range | Manual range track (handwheel 228) + auto angular (146 АВТ.) |
| Circular search won't engage | 145 НАВЕДЕНИЕ + manual circular via 142/147 |
| Sector search won't engage | 145 НАВЕДЕНИЕ + manual sector via 142/147 |
| SRP / gun-coord converter failed | **Mode 4** (aspect ring) |
| GTD of SEP failed | Start V-6R, 1550–1700 rpm, GTD off |
| Lamp 5 ОТСТОПОРЕНО not lit | GAG faulty → fire from place / short halts |
| SRP auto-vent failed | Toggle 5 (fig.15) ON |

---

## 15. READINESS STAND-DOWN & AMMO HANDLING (§16–§18)
- **№1→№2:** drives off (27 ГИДРОПРИВОД ВЫКЛ.) → turret+gun to manual → RPK+SEP off → **unload autocannons** → RPK on (no HV) → mode handles → СИЛОВОЕ.
- **№2→№3:** RPK off → turret fore-aft, barrels forward → flash-caps on → lock turret+gun → clear rounds from feed fingers → controls initial → after lamp 5 ОТСТОПОРЕНО out, SEP off.
- **№3→travel:** SEP on (if antenna auto-lowers) → lower antenna → SEP off → cap visor heads → close vent flaps → cover gun+antenna.
- **After fire:** clean/inspect/lube gun, check coolant/oil levels, inspect GTD/RPK/antenna.
- **Ammo unload:** belts → cartridge boxes on ТЗМ; **links removed via the hull-bottom hatch (driver side)** with a hook from bag #1 — GTD/engine OFF, turret locked behind driver; misfires → destruction; then drive ZSU forward 5–6 m to clear the link box.

---

## 16. SPECIAL CONDITIONS, NIGHT, NBC, FIRE (Ch.4 §19–§25)

### Training use (§19)
Bring ZSU to combat position; only clean training cartridges (live forbidden in training). Don't run barrel cooling without confirming coolant (red lamp 12 УРОВЕНЬ ОЖ off). Laying-drive training ≤1 h continuous then ≥2 h break. Crew-train the RPK with the **КЗУ course-setter + Т-56 echo-simulator trainer**, no high voltage. Creating artificial faults/de-tuning forbidden.

### Weather (§20)
- **Rain:** all hatches + visor caps closed, open only when needed.
- **Cold/dust:** keep turret hatches shut. **Warm RLS 10–15 min via toggle 186 НАКАЛ** before use in winter/humidity. At **−30…−40 °C**, before AUTO drive mode, run drives **3–5 min in ПОЛУАВТОМАТ** at varied residual speeds.
- **GTD winter:** no water in fuel; no oil pressure → 2–3 cold cranks, start only with pressure shown.
- **<0 °C:** after antenna raise, check left visor head not iced; thaw with hot-water rag (no chipping); then coat heads with **ЦИАТИМ-201**.
- **Hot:** avoid unnecessary apparatus power-on.

### Night vision switch-on (§21–§22) — ТВН-2 (driver) + ТКН-1Т (commander)
Press button 7 ВКЛЮЧЕНИЕ ПИТАНИЯ (driver) + button 6 (commander); ТКН-1Т power via lever 10 on PAZ panel → ВКЛЮЧЕНО. Set power-block switches ТКН-1Т 21 + ТВН-2 7 to ВКЛ. (lamps glow, vibrator hums, greenish image). Switch on filtered **headlamps** (ТВН-2) + **OU-3 IR illuminator** (ТКН-1Т): toggle 72 + button ФАРА (driver), lever 25 right (cupola). Open shutter (handle 20 / 10) to ОТКРЫТО. Keep interior light minimal; don't illuminate near objects (damages ТВН-2); use IR headlamps only when needed (demasking). *Since 1968: ТКН-1Т→ТКН-1ТС + OU-3ГА2; 2× ГСТ-64К marker lamps added on rear turret (breaker ГАБАР.ФОНАРИ).*

### ⭐ NBC / radioactive contamination (§24)
**Commander:** ДП-3Б roentgenometer knob 6 → **ПР** (subrange 1); needle 0.4–0.8, lamp flashes 3–4/s = normal; knob → **X1** if off-scale (step subranges); on dangerous dose → command **PAZ ON**, close cupola hatch, confirm driver hatch closed (lamp ЛЮК ОТКРЫТ out).
**Gunner:** toggle **5 → АВТОМАТ**; toggle **4 ВКЛ.ПАЗ** ON (PAZ breaker on) → red **ПАЗ СИГНАЛ** + all flap lamps light; report; close compartment hatch with range-op.
**Driver:** close control-compartment hatch; confirm flap lamps **66/68/69 ПРИТОЧН.ВЕНТИЛ./ВЫТЯЖ.ВЕНТИЛ./ЗАСЛ.ОПОРЫ**; close GTD flaps via button **16 ЗАКР.ЗАСЛ.**
- **May open fire under PAZ in emergency mode** (SEP from V-6R) or via manual laying.
- After clearing the zone: toggle 4 → ОТКЛ., toggle 5 → РУЧНОЕ, manually open flaps, fit new pyro-cartridges in all flap mechanisms. PAZ can run with manual flap closing (toggle 5 at РУЧНОЕ, no pyro fired).

### ⭐ Fire (§25)
- **Power compartment fire → bright red lamp 4; front fuel tank fire → lamp 5.** УА ППО auto-extinguishes; crew exit + close hatches if possible.
- **Manual UA PPO (driver):** rip seal, open АС-2 cover, switch **11 → РУЧН.**, press **10 ПЕРЕДН.** or **9 ЗАДН.** per fire location; each press = next cylinder.
- **Commander front-compartment trigger:** rip РОСА seal, press button **2 РОСА** (fig.1).
- **"3,5" agent vapors poisonous** → on trigger, crew don gas masks (driver call **ПОЖАР**), open hatches, stick out mask boxes; ventilate after.
- **Turret fire:** kill power of the burning block, pull it; if uncontained, commander cuts power via button **4 ОТКЛЮЧЕНИЕ ПИТАНИЯ**, open hatches, use CO2 extinguisher (diesel/oil/petrol: from fire edge, blanket surface, don't jet directly — splashing).

### March & transport (Ch.5)
March in travel position; speed chosen to avoid RPK damage; crew at stations, helmets on; hatches closed in rain/dust/snow; driver moves on commander command + audible signal; ford/ice recon; bridge cap 20 t; rail transport on 4-axle platform (chock blocks under tracks, gear neutral, mountain-brake engaged).

- **Winter rail transport:** if water-filled engine cooling, drain it and "purge" the system with low-freeze until it runs clear; drain the washer tank; hang the **«Вода слита» (water drained)** plate on the driver panel; move batteries + drinking-water cans into a heated car.
- Pages 119–124: change-registration appendix + full table of contents (used to confirm complete read) + print imprint (set 1.4.70, signed 20.5.70).

> **FULL DOCUMENT READ — all 127 PDF pages (124 numbered + 2 foldout inserts + covers). TOC verified.**

---

## 17. ⭐ GAME-MECHANICS DIGEST — operable procedures per crew station

A player "crewing" the Shilka has **4 distinct stations**, each with a real button-sequence the manual prescribes. Most game-worthy loops:

**КОМАНДИР (commander) — fire authority + power:**
- Press **ПУСК БПС** → (combat shortcut) auto-starts GTD + converter → 220 V live.
- Selects firing mode (toggles 9 КОМАНДИР↔ОПЕРАТОР, 18 ШУНТ↔СРП, 35 ГАГ, 83 ПИТАНИЕ ~115в, 84 ЗУ, 28 ГП АВАР., 17 АВАРИЙНАЯ СТРЕЛЬБА).
- Sets **ОГРАНИЧЕНИЕ УГЛОВ** (firing-sector limiter: 30° air / 0° ground) — a hard gate before opening fire.
- **Opens fire**: toggle 11 ЦЕПЬ СТРЕЛЬБЫ ON, wait **ЕСТЬ ДАННЫЕ** lamp, then toggle 123 ОХЛАЖД. + squeeze trigger 121 on the laying handle. **Cease**: release trigger → release 123 → toggle 11 OFF.
- Does the **pneumo-recharge** (cock guns) via 16 ПЕРЕЗАРЯДКА; fire-fight via РОСА button.

**ОПЕРАТОР ПОИСКА–НАВОДЧИК (gunner) — search + track + fire:**
- Search: **171 СЕКТОРНЫЙ** (width via 148) / **170 КРУГОВОЙ** / manual **145 НАВЕДЕНИЕ** + Т-55 handles.
- Lock: bring target mark to visor line, press **146 АВТ.** → RLS auto-tracks.
- Degraded ladder the player walks down as systems fail: mode 1 → **mode 2** (visor 130 2×→6×) → **mode 4** (aspect ring, pick 60/120/220/300 m/s grid + 4/4…1/4 ring on nose) → **mode 5/manual** (foot-pedal fire). Each is a concrete fallback UI.
- Fires via buttons 144+143 on the left handle, or foot-pedal when 158→ПЕДАЛЬ.

**ОПЕРАТОР ДАЛЬНОСТИ (range operator) — RLS range channel:**
- Powers radar up the chain: **186 НАКАЛ → 185 АНОДНОЕ → 224 ВЫСОКОЕ НАПРЯЖЕНИЕ**, sets magnetron current (213), mixer currents (192 СМ-1/2/3).
- **Strobes** the target (handwheel 228) on coarse then precise sweep, calls **"застробирована"**, then calls range every **500 m** (194 СТРОБ for fast targets).
- Anti-jam: **195 СЦ** (moving-target select) + **189 ЧАСТОТА КОМПЕНСАЦИИ** + **198 ВОБУЛЯЦИЯ**; frequency-hop vs noise.

**МЕХАНИК-ВОДИТЕЛЬ (driver) — power plant + mobility:**
- **GTD start loop** (great minigame): board net → ХОЛОДНАЯ ПРОКРУТКА (cold crank, watch oil 0.15–0.2, batt ≥18 V, ≤10 s) → ПУСК ГТД → starter auto-cuts at 44 % → green ГЕНЕРАТОР lamp at 98.5–103.5 % → report "started". Skipping cold crank = bearing damage (failure event).
- Monitors GTD gauges (RPM 98.5–101.5 %, exhaust ≤650 °C, oil ≤110 °C / 0.5–2.5 kg/cm²); on **помпаж** → start V-6R + STOP ГТД.
- Drives smoothly (rough driving = electronics fail); **fire-on-move ≤20–25 km/h** (≤5–10 broken road); watches lamp 5 ОТСТОПОРЕНО (not lit = can't fire moving).
- Runs PAZ/NBC close-up (DP-3B subranges, close flaps) and manual UA PPO fire suppression.

**Cross-station interlocks worth modeling:**
- **Pneumo-recharge dead below 35–40 atm** (circuit opens) — ties gun availability to the compressor/air-cylinder state.
- **Antenna raise requires ≥20 kg/cm² air.**
- **ЦЕПЬ СТРЕЛЬБЫ + ЕСТЬ ДАННЫЕ** gate firing; ОГРАНИЧЕНИЕ УГЛОВ gates the sector.
- **Continuous-run timers:** RPK ≤8 h, drives ≤2 h (then ≥1 h cool), PAZ blower ≤4 h, GTD ≤8 h — natural overheat mechanics.
- **Burst discipline:** 3–5 / 5–10 rounds per barrel; up to 50 on fast targets; **mandatory 10–15 s break per 120–150 rounds/barrel** (barrel-heat model). 4 barrels × (520 lower / 480 upper) ≈ **2000-round** load.
- **Self-destruct floor:** firing <9° elevation over own troops is unsafe (tracer/round self-destruct range).
- **Readiness ladder №3→№2→№1** is a staged "spool-up": uncover→power→raise antenna (№3); unlock turret+gun, drop flash-caps, ram rounds (№2); load guns + transmitter on + drives auto (№1). On-the-move firing prep = stop, unlock, drop caps, go №1.
