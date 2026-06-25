# ЗСУ-23-4(М) «Шилка» — Crew Authority Map (1:1 from the manuals)

**Question being resolved (owner):** *"Does the driver change/control the voltage, or does the commander?"*
**Short answer:** **Neither dials a voltage.** The driver owns the **electrical source** (starts the gas-turbine APU, governs engine RPM, watches his own voltmeter, and does the **emergency generator cut-off at 57 V**). The commander owns **combat distribution** (switches the 220 V converter on/off and reads the combat voltmeters). The **bus voltage itself is held automatically by the SEP voltage regulator** — see §1.3. Full reasoning + citations below.

**Sources cited:** `findings/08-zsu234-tech-description.md` (TO 2А6М, 1980), `findings/10-operation-1970.md` (ИЭ Часть 1, 1970), `findings/07-azp23m-schematics.md` (АЗП-23М album 2011, incl. the commander-panel legend p.35), `gpt-deep-rnd/driver/01_driver_evidence_matrix.md` (D-ids), `gpt-deep-rnd/01_evidence_matrix.md` (E-ids).

> **Provenance note on the panel scan.** I was unable to open `refs/visual_checks/azp_commander_panel-35.png` directly this session — it lives under `~/Documents`, which macOS TCC blocks for tool processes (`Read`, `cp`, and even `sips` pixel read all returned "operation not permitted" / `pixelWidth: <nil>`). The commander-panel item list in §3 is therefore taken from the **already-verified transcription of that exact page** in `findings/07-azp23m-schematics.md` (p.35 legend), which evidence row **E-002** records as "vizuálně ověřeno v refs/visual_checks/azp_commander_panel-35.png." Items the source did not individually enumerate are flagged.

---

## 1. THE POWER / ENERGY CHAIN — step by step (who, on which panel)

Physical chain (TO 2А6М p.8, p.126; 10-operation §6):
**ДГ4М-1 gas-turbine (APU) → ГИСВ/ПГС2-14А generator → DC 27.5 V & 55 V + AC 220 V/400 Hz → БПС converter (220 V combat bus) → Б-6В transformer block → 110 V & 115 V (115 V drives the hydraulic laying drives) → ВКУ slip-ring across the turret race.**
The **V-6М-1 / В-6Р diesel is the traction (driving) engine**; it can also drive the SEP generator when parked briefly or in rain/snow when the GTD can't run.

### 1.1 Who starts the ДГ4М-1 GTD — the **DRIVER**, on the driver's panel, on the commander's command
Sequence (10-operation §6 "GTD start sequence (driver, on commander's command)"; driver matrix **D-008**):
1. Board net ON — button **ВКЛЮЧЕНИЕ ПИТАНИЯ** (driver panel).
2. Open GTD flaps — **ХОЛОДНАЯ ПРОКРУТКА** 1-2 s, confirm lamp **ОТКР.ЗАСЛ.**
3. Audible warning signal (button 40).
4. **COLD CRANK** — hold **ХОЛОДНАЯ ПРОКРУТКА** to 15-20 % RPM, ≤10 s. Watch battery voltage on voltmeter 62 (button ЦЕПЬ +27в) — **must not drop below 18 V** (**D-009**); watch oil pressure 0.15-0.2 kg/cm², **no pressure → max 3 cold cranks** (**D-010**). Skipping the cold crank runs the bearings dry → failure (**D-011**).
5. **HOT START** — button **ПУСК ГТД** 1-2 s; **starter auto-disconnects at 44 % RPM** (**D-013**).
6. DC generator auto-connects when its V exceeds battery V → **green lamp ГЕНЕРАТОР** lights (**D-014**).
7. At idle 98.5-103.5 % RPM the driver **reports "GTD started"** to the commander (**D-015**), who then proceeds.

### 1.2 Commander can **auto-start the GTD from his console** — and why it's flagged risky
- **Combat shortcut (commander, his panel):** pressing **ПУСК БПС** (start converter) *before* the GTD is running **auto-starts the GTD** and switches the converter once it spins up — "**allowed only in combat, because the commander has no GTD instruments**" (10-operation §converter; **D-018**).
- **Why risky:** the commander has no oil-pressure / RPM / exhaust-temp gauges, so an auto-start **bypasses the driver-supervised cold-crank lubrication step** → bearing-damage risk; it can also fire with the V-6R below 1550 rpm and drop the generator off-net. The 1970 safety chapter warns: *"Do not press button ПУСК БПС without need — an accidental press can unexpectedly start the GTD."*
- **Driver's safeguard:** during checks/training the driver switches the right toggle **АВТОМАТ.ЗАП.ГТД** (under flap 22) **OFF** to disarm this auto-start (**D-021**).

### 1.3 Who switches the **БПС / converter** (220 V combat power) on — the **COMMANDER**, on the commander's panel
- After the driver's readiness report, the commander presses **ПУСК БПС** (panel item 36/37 СТОП/ПУСК БПС) → lamp **ПРЕОБРАЗ.** lights and **voltmeter 32 reads 220 V** (10-operation §converter).
- The **БПС is a 220 V source — "dangerous to life"** (10-operation §safety). It is the gateway to the **combat distribution**: 220 V/400 Hz feeds the RPK/radar, and via the Б-6В block 115 V feeds the hydraulic laying drives. So **combat power is switched by the commander**; the **generated power behind it is owned by the driver**.

### 1.4 Who **regulates the actual voltage** — **automatic, neither crewman dials it**
- The SEP carries a dedicated **voltage-regulator block, БР-211 («регулятор»)** in the 1970 ИЭ block list (10-operation §abbreviations) — i.e. the bus voltages (27.5 ±1 V, 55 ±2 V, 220 V ±2 %, and the Б-6В-derived 110/115 V) are **held automatically by the regulator + transformer block**, not by a manual setpoint.
- The DC generator **auto-connects** when its output exceeds battery voltage (green ГЕНЕРАТОР lamp) (**D-014**) — automatic, not a manual closure.
- The **only "voltage lever" a crewman touches is engine RPM**, and it is the **driver's**: hold V-6R **≥1550 rpm** (1550-1700 for SEP, never below 1250 moving) or the **generator drops off-net and the converter discharges the batteries** (**D-019**); the GTD idle (98.5-101.5 %) is governed automatically.
- **Confirmed: neither the driver nor the commander dials a voltage value.** The driver controls the *source* (start, RPM, on-net), the regulator controls the *value*, the commander controls *who gets the combat bus*.
  - ⚠ **Designation caveat re «РН-23»:** these four sources name the regulator **БР-211** (1970 ИЭ); the modernized TO 2А6М names a converter **НТ-112**. The specific tag **«РН-23» does not appear in any of the four cited documents** — but the *principle the owner stated* (automatic regulation, no manual voltage knob) is exactly correct; only the block designation differs by document.

### 1.5 Who **monitors the voltmeters** — **both**, split by domain
- **Driver — the source side:** watches the **voltmeter on his own panel** (10-operation §SEP monitoring: "Driver: panel voltmeter"; **D-022** "řidič sleduje voltmetr na svém štítku"), plus battery voltage during cranking (voltmeter 62, ≥18 V).
- **Commander — the combat-distribution side:** reads **voltmeters 30 & 32** (DC + the 220 V AC) in their coloured arcs, the **hertzmeter 386-416 Hz**, and the **«27В-55В» selector** (panel item 13). Panel legend lists "8/9 AC/DC voltmeters" + "13 «27В-55В»".

### 1.6 Who does the **emergency generator disconnect at 57 V** — the **DRIVER**
- **DC overvoltage > 57 V → the mechanic-driver does the emergency disconnect of the ПГС2-14А generator** (**D-023**; 10-operation §SEP emergency).
- Mechanism: **left toggle ОТКЛЮЧ.ГЕНЕРАТ. under flap 22** on the driver's panel (also the auto-trip for the АВАРИЙНЫЙ РЕЖИМ case: ГЕНЕРАТОР lamp lit after V-6R/GTD stop → switch ОТКЛЮЧ.ГЕНЕРАТ. OFF). The driver also holds the master **ОТКЛЮЧЕНИЕ ПИТАНИЯ** (button 8) that drops the whole board net.

### 1.7 The **«ОТКЛЮЧЕНИЕ ДИЗЕЛЯ»** commander diesel kill-switch
- Commander-panel button (AZP album p.35 **item 38 «ОТКЛЮЧЕНИЕ ДИЗЕЛЯ»**). The commander can **stop the V-6R diesel** with it:
  - during **driver-training**, to halt the engine on bad driving (**D-042**);
  - if the **driver is incapacitated while moving**, the commander stops the V-6R and ends movement with this button (**D-043**; TO 2А6М §safety).
- This is the commander's **safety override on the traction engine** — distinct from the converter/combat-power controls above.

### 1.8 ⭐ Crisp 1:1 answer — driver vs commander, voltage / power
- **DRIVER = electrical SOURCE + own voltmeter + emergency cut-off.** Starts/stops the ДГ4М-1 GTD (the APU that spins the generator) and the V-6R; governs engine RPM that keeps the generator on-net and in spec; watches his own panel voltmeter + battery voltage; performs the **emergency generator disconnect at 57 V** (ОТКЛЮЧ.ГЕНЕРАТ. under flap 22) and the master ОТКЛЮЧЕНИЕ ПИТАНИЯ; arms/disarms АВТОМАТ.ЗАП.ГТД.
- **COMMANDER = combat DISTRIBUTION + override.** Switches the **БПС converter** (220 V/400 Hz combat bus → radar/RPK + 115 V drives) ON/OFF (ПУСК/СТОП БПС); reads the combat voltmeters (DC, 220 V AC, 27В/55В, Hz); can **force a GTD auto-start** in combat (risky — no GTD gauges); holds the **ОТКЛЮЧЕНИЕ ДИЗЕЛЯ** diesel kill + a redundant master ОТКЛЮЧЕНИЕ ПИТАНИЯ.
- **VOLTAGE VALUE = automatic.** Held by the SEP regulator (**БР-211** in the 1970 ИЭ; the "РН-type" auto-regulator) + Б-6В transformer block. **Neither crewman dials a voltage.** The driver's only indirect lever is engine RPM.
- **Verdict:** the owner's framing is **correct as stated**, with one factual correction — the regulator block in these manuals is **БР-211**, not «РН-23» (no source here uses the «РН-23» tag).

---

## 2. WHO-CONTROLS-WHAT TABLE (all 4 crew)

| System | **Командир (Commander)** | **Оператор поиска-наводчик (Search/guidance — gunner)** | **Оператор дальности (Range operator)** | **Механик-водитель (Driver)** |
|---|---|---|---|---|
| **Power / energy** | Switches **БПС converter** ON/OFF (ПУСК/СТОП БПС → 220 V combat bus); reads combat voltmeters 30/32, 27В-55В, Hz; switches ГАГ + ПИТАНИЕ ~115в; can auto-start GTD (risky); master ОТКЛЮЧЕНИЕ ПИТАНИЯ. | Powers his own electronics only: ПИТАНИЕ ВПК, ДВИГ.K,Δq, ДВИГАТ.β,ε,Δε. | Powers radar chain: НАКАЛ → АНОДНОЕ → ВЫСОКОЕ НАПРЯЖЕНИЕ (station-level, not the SEP source). | **OWNS the source:** starts/stops GTD + V-6R, governs RPM, generator on-net, own voltmeter + battery, **emergency gen-disconnect >57 V**, АВТОМАТ.ЗАП.ГТД guard. |
| **Radar modes** | **Selects combat mode 1-5;** commands search sector + target designation; toggles ШУНТ-СРП, ЗУ, КОМАНДИР-ОПЕРАТОР. | **Controls RPK/search in all modes:** СЕКТОРНЫЙ/КРУГОВОЙ, НАВЕДЕНИЕ + Т-55 antenna, **АВТ. (146)** to lock auto-track, visor 2×/6×. | **Controls the RLS in all modes:** АПЧ (РУЧН-АВТОМ), magnetron tuning, anti-jam СЦ/ВОБУЛЯЦИЯ/ЧАСТОТА КОМПЕНСАЦИИ, frequency-hop. | — (but smooth driving protects the RLS; rough driving damages it — D-005, D-044). |
| **Range / data** | Receives **ЕСТЬ ДАННЫЕ**; relays target az/el to gunner; judges kill-zone. | Tracks **angular** coords (in mode 2 by visor). | **OWNS the range channel:** strobes target (handwheel 228), calls *"застробирована"*, calls range every 500 m, sets Т-22 range for ground. | — |
| **Gun & fire-permission** | **Grants fire permission;** arms ЦЕПЬ СТРЕЛЬБЫ; selects gun banks (СТРЕЛЬБА ВЕРХНИХ/НИЖНИХ); КОНТРОЛЬ БЛОКИРОВОК; opens fire via trigger 121 on рукоятка огня (in commander mode); does pneumo-recharge; АВАРИЙНАЯ СТРЕЛЬБА. | **Loads gun + manual recharge; fires** at air & ground via buttons 144+143 / foot-pedal (when КОМАНДИР-ОПЕРАТОР→ОПЕРАТОР). | — | **Hatch-closed is the hard fire interlock** (provides the enable contact; ЛЮК ОТКРЫТ lamp on commander panel). |
| **Drives / aiming (traverse + elevation)** | Switches **hydraulic power drives ON/OFF** (ГИДРОПРИВОД ВКЛ/ВЫКЛ); slews antenna/turret via **КПН** for hand-off; toggles φ,βу,Tу. | **Primary fine-aimer:** semi-auto via Т-55 handles, manual handwheels, ПОЛУАВТ./АВТ.ГП select. | — | **Hatch + link-collector closed gate the drives** (DSO-20 won't start with hatch open — D-025); never use manual drives while moving. |
| **Movement / driving** | **Gives the move/slew command;** ОТКЛЮЧЕНИЕ ДИЗЕЛЯ override. | — | — | **OWNS driving:** GM-575 levers/gears/clutch/mountain-brake, **starts/stops movement only on command** (D-004); manages the ~6 m gun-sweep clearance (D-006). |
| **NBC (ПАЗ)** | **Decides/commands PAZ ON** (DP-3B dosimeter reading); confirms driver hatch shut via **ЛЮК ОТКРЫТ** lamp. | Toggle 5→АВТОМАТ + ВКЛ.ПАЗ; closes compartment hatch with range-op. | Closes compartment hatch with gunner. | Closes control-compartment hatch + GTD flaps (ЗАКР.ЗАСЛ.); operates the **PAZ panel** (ВКЛ.ПАЗ / ВЕНТИЛ / АВТОМАТ-РУЧНОЕ) — part of the NBC seal (D-029). |
| **Fire (ППО)** | **РОСА** button (front-compartment trigger); cuts power via ОТКЛЮЧЕНИЕ ПИТАНИЯ on a turret fire. | — | — | **First emergency technician:** manual UA PPO (switch→РУЧН., press ПЕРЕДН./ЗАДН.); stops vehicle + cuts SEP; CO2 extinguisher (D-030, D-031). |
| **Angle-limiter «ОГРАНИЧЕНИЕ УГЛОВ»** | **SETS it** (panel item 17, AZP album / item 19, 1970 fig.1): **30° air / 0° ground**, and **confirms the value before opening fire** — a commander-only firing-sector / depression cutout. | — (cannot depress/fire below the commander's floor). | — | — (on-the-move prep, the commander pre-sets it to 0). |

---

## 3. Commander panel «пульт командира 29» — labelled controls (AZP album 2011, p.35 legend)

> Transcription of the **page-35 legend** (38 numbered items) as recorded in `findings/07-azp23m-schematics.md`, the verified analysis of this exact scan (E-002). **I could not re-open the PNG this session (TCC-locked), so I cannot independently flag pixel-level legibility;** items the source did not enumerate individually are listed at the end as not-captured. Numbering here is the **AZP-album-2011** scheme; the **1970 ИЭ fig.1** numbers differ and are cross-referenced for the power-relevant controls.

| # (album) | RU label | Meaning / function |
|---|---|---|
| 2 | **РОСА** | Front-compartment fire-suppression trigger button (УА ППО). |
| 3 / 4 / 22 | **пирозаряжание** | Pyro-charging (cock-the-guns) controls. |
| 5 | **стрельбы автоматов** (net breakers) | Gun-firing power breakers. |
| 6 | **заряжено** — lamps ЛСГ1-4 | **LOADED** lamps, one per autocannon (1-4). |
| 7 | round counters **СП1-СП4** | Per-gun cartridge counters (set after loading). |
| 8 / 9 | AC / DC **voltmeters** | Combat-bus voltmeters (≈ items 30/32 in 1970 fig.1). |
| 11 | **ШУНТ СРП** | Fire-control computer enable / shunt (mode dependent). |
| 13 | **27В-55В** | DC voltmeter range/scale selector (≈ item 7 «27в-54в», 1970 fig.1). |
| 14 / 15 / 16 | **гидропривод выкл / лампа / вкл** (СГП/ЛГП/ПГП) | Hydraulic power-drive **OFF / status-lamp / ON**. |
| 17 | **ОГРАНИЧЕНИЕ УГЛОВ** (ПОУ) | **Angle-limit selector** — depression/firing-sector cutout (= item 19, 1970 fig.1). |
| 18 | **пан. наземн.** | Ground-mode panel (reduces semi-auto laying speed; ground targets). |
| 19 | **люк открыт** (ЛСР) | **HATCH-OPEN** warning lamp (driver hatch interlock state). |
| 20 | **командир-оператор** | Fire-authority **transfer** commander ↔ operator. |
| 21 | **контроль пиропатронов** | Pyro-cartridge check. |
| 23 | **уровень ОЖ** | Coolant-**level** lamp. |
| 24 | **охлаждение** | Barrel-**cooling-running** lamp. |
| 25 / 26 | **цепь стрельбы** (lamp / toggle) | **Firing-circuit** status lamp / arm toggle. |
| 28 | **ОТСТОПОРЕНО** (ЛН1) | **UNLOCKED** lamp (stops released — can lay/fire). |
| 30 | **ЗАСТОПОРЕНО** (ЛН2) | **LOCKED** lamp (travel stops engaged). |
| 31 | **АВАРИЙНАЯ СТРЕЛЬБА** | **Emergency fire** — bypasses (soft) interlocks (under a sealed flap). |
| 32 / 34 | power OFF / ON | Panel power off / on. |
| 33 | **КОНТРОЛЬ БЛОКИРОВОК** | **Interlock-check** — confirms all blocking contacts satisfied. |
| 36 / 37 | **СТОП / ПУСК БПС** | Converter **STOP / START** (220 V combat bus; = item 36 ПУСК БПС, 1970 fig.1). |
| 38 | **ОТКЛЮЧЕНИЕ ДИЗЕЛЯ** | **Diesel kill-switch** (commander stops the V-6R). |

**Not individually captured in the source transcription (item numbers 1, 10, 12, 27, 29, 35):** the page-35 legend has 38 entries; the findings file enumerated the firing/laying/power-relevant ones above but did not separately transcribe these six (likely indicator lamps / minor breakers). Treat them as **present-but-unread** rather than absent. Because I could not open the pixels myself, I cannot positively flag any entry as illegible — that judgment would need a direct view of the scan (e.g. the file dragged into chat or copied to `/Users/Shared`).

---

### Appendix — quick cross-reference of the two numbering schemes (power-relevant controls)
| Control | AZP album 2011 (p.35) | 1970 ИЭ fig.1 |
|---|---|---|
| Angle-limit «ОГРАНИЧЕНИЕ УГЛОВ» | item 17 | item 19 |
| Converter start «ПУСК БПС» | item 37 | button 36 |
| Converter stop «СТОП БПС» | item 36 | button 1 (СТОП БПС) |
| DC voltmeter selector «27В/55В» | item 13 | item 7 («27в-54в») |
| Combat voltmeters | items 8/9 | items 30 & 32 |
| Master power-off «ОТКЛЮЧЕНИЕ ПИТАНИЯ» | item 32 | button 4 |
| Diesel kill «ОТКЛЮЧЕНИЕ ДИЗЕЛЯ» | item 38 | (commander panel, named in text) |

*(Driver-side power controls live on the driver's panel, not the commander's: ВКЛЮЧЕНИЕ/ОТКЛЮЧЕНИЕ ПИТАНИЯ, ХОЛОДНАЯ ПРОКРУТКА, ПУСК/СТОП ГТД, ОТКЛЮЧ.ГЕНЕРАТ. + АВТОМАТ.ЗАП.ГТД under flap 22 — D-027.)*
