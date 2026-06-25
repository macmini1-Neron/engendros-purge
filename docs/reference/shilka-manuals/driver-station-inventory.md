# ЗСУ-23-4 «Шилка» — DRIVER'S STATION INVENTORY (mechanik-vodítel «kapota»)

## ✅ KANONICKÝ LEGEND — РИС.4-18 «ЩИТОК ПРИБОРОВ МЕХАНИКА-ВОДИТЕЛЯ» (ГМ-575 album, str. 130)

> **Source-of-truth.** Ověřeno přímo proti scanu str. 130 (poskytnut majitelem 2026-06-22: číslovaná tabulka z ИЭ 1970 + popiska РИС.4-18). Tohle je závazný číslovaný seznam panelu; sekce níže (A–H) je tematické rozšíření. Položky 1,2,3,6,9,12,13,15,20,22,23,25,26,30,32,52,53,61,63,64,69,71,73,75,76,78,79 v popisce nejsou číslovány samostatně nebo jsou konstrukční (šrouby/krytky/«фальшкарказ» 82, dělicí linie «а»).

**Napájení / voltmetr:** 4 кнопка **ЦЕПЬ −27В** (přepne voltmetr na −27 V) · 5 кнопка **ЦЕПЬ +27В** (na +27 V) · 7 кнопка **ПИТАНИЕ ВКЛ.** (zapne palubní síť) · 8 кнопка **ПИТАНИЕ ОТКЛ.** (vypne) · 35 автомат защиты сети **ПИТАНИЕ ПРИБОРОВ** (jistič přístrojů) · 62 **ВОЛЬТМЕТР** DC.
→ ⭐ jen ±27 V; **žádný «27В-55В» bojový přepínač ani zapnutí převodníku — to je velitelovo.**

**GTD / turbína:** 10 кнопка **ПУСК ГТД** (pod krytkou) · 11 кнопка **СТОП ГТД** · 14 кнопка **ХОЛОДНАЯ ПРОКРУТКА** · 16 кнопка **ЗАКРЫТИЕ ЗАСЛОНОК** · 20 лампа **ОТКР. ЗАСЛ.** (klapky otevřeny) · 17 лампа **ГТД** · 18 лампа **ГЕНЕРАТОР** · 21 лампа **ПРЕОБРАЗОВАТЕЛЬ ГТД** · 19 lampa žlutá **ПРЕОБРАЗОВАТЕЛЬ ДИЗ.** · 55 термометр **МАСЛО ГТД** · 56 термометр **ГАЗЫ** (výfuk) · 57 тахометр **ГТД** (%) · 58 счётчик моточасов **ГТД**.

**V-6 diesel:** 47 кнопка **СТАРТЕР** · 43 lampa červená «startér sepnut» · 46 кнопка **НАСОС МАСЛА** (МЗН) · 27 кнопка **НАСОС ТОПЛИВА** · 24 переключатель **ЖАЛЮЗИ ДИЗЕЛЯ** · 37 термометр **ВОДА** (ТУЭ-48) · 38/49 термометр **МАСЛО** (smaz. диз.) · 48 тахометр **ТЭ-3В** · 39 спидометр **СП-106** · 36 указатель **уровня топлива** zadní nádrž · 50 счётчик моточасов диз. · 54 манометр **ТОПЛИВО** gidroakum.

**Předehřev / zima:** 28 выключатель **КЛАПАН ПОДОГРЕВА** · 29 переключатель **СВЕЧА–ФОРСУНКА** · 31 выключатель **ВЕНТ. ПОМПА** · 33 выключатель **ПОДОГРЕВ ЧАСОВ/ПРИБОРЫ** (АЭС-2) · 34 переключатель **ПОВ** (vytápění odd. řízení) · 60 выключатель **КЛАПАН ПРОКАЧКА** (odvzdušnění).

**Poklop / ventilace / ПАЗ (zelené lampy):** 65 **ЛЮК ВОДИТ.** · 66 **ПРИТОЧ. ВЕНТИЛ.** · 68 **ВЫТЯЖ. ВЕНТИЛ.** · 67 **КОНТАКТ ПАЗ** · 70 lampa červená **СИГНАЛ ПАЗ**.

**Světla / stěrače / výhled:** 42 переключатель **ФАРЫ** · 41 lampa **ФАРЫ ТВНО** · 72 переключатель **ФАРЫ ТВН-СМУ** (ИК/maskovací) · 44 резистор **ПОДСВЕТКА** (stmívač panelu) · 45 потолочный **осветитель** · 77 переключатель **СТЕКЛООЧ. ЛЮКА** · 80 выключатель **СТЕКЛООЧИСТИТЕЛИ КОЛПАКА** (СЗ-215) · 81 автомат защиты сети sklobloků · 40 кнопка **СИГНАЛ** (klakson) · 51 **ЧАСЫ** · 74 счётчик моточасов **ПРЕОБРАЗ.**

**Konstrukční:** 82 фальшкарказ · «а» dělicí linie.

## ✅ START / SHUTDOWN PROCEDURE — SOURCE OF TRUTH (řidič)

> Kauzálně správná kaskáda (majitelova ověřená korekce 2026-06-22). **3 tvrdé zámky — porušení = zničený motor/turbína:**
> 1. **Houkačka 40 první** — ГТД naskočí s okamžitým jekotem (~30 000 ot/min), posádka venku musí být varována.
> 2. **GTD: klapky před startem** — 14 ХОЛОДНАЯ ПРОКРУТКА otevře výfukové klapky → čekej na lampu **20 ОТКР. ЗАСЛ.** → teprve pak 10 ПУСК ГТД. Bez klapek se turbína udusí vlastními plyny → poškození/požár.
> 3. **Diesel: tlak oleje před startérem** — drž **46 НАСОС МАСЛА**, dokud manometr neukáže tlak → teprve pak 47 СТАРТЕР. Bez tlaku oleje = zadření V-6.

| Krok | Číslo | Tlačítko / Akce | Co dělat / Kontrolovat | Poznámka |
|---|---|---|---|---|
| 1 | **7** | ПИТАНИЕ ВКЛ. | Stiskni 7 | Zapne palubní napájení (DC 27,5 V) |
| 2 | **40** | СИГНАЛ | Krátce stiskni houkačku | Varování posádky před hlukem/rotací |
| 3 | **14** | ХОЛОДНАЯ ПРОКР. | Stiskni 1–2 s, **sleduj lampu 20 ОТКР.ЗАСЛ.** | ⚠️ Otevírá výfukové klapky — nepokračuj, dokud nesvítí! |
| 4 | **14** | ХОЛОДНАЯ ПРОКР. | Znovu stiskni a drž max 10 s | Protočení + natlakování oleje turbíny |
| 5 | **10** | ПУСК ГТД | Zvedni krytku, stiskni 10 | Ostrý start turbíny |
| 6 | **17, 18** | lampy ГТД / ГЕНЕРАТОР | Zkontroluj, že svítí zelené | (21 ПРЕОБРАЗ. ГТД rozsvítí až velitel ze svého pultu) |
| 7 | **27** | НАСОС ТОПЛИВА | Dle potřeby | Palivové čerpadlo dieselu |
| 8 | **46** | НАСОС МАСЛА | **Stiskni a drž**, sleduj budík tlaku oleje | ⚠️ Bez tlaku oleje NESTARTUJ diesel! |
| 9 | **47** | СТАРТЕР | Zatímco držíš 46, stiskni 47 | Start dieselu (jízda) |
| 10 | **65** | lampa ЛЮК ВОДИТ. | Zkontroluj, že **nesvítí** (poklop zavřen+zajištěn) | Bezpečnostní kontrola před palbou věže |

**Paměťový postup:** 7 (proud) → 40 (varování) → 14 (klapky, čekej 20) → 10 (start GTD) → 17+18 → diesel: drž 46 (olej) → 47 (startér).

**Vypnutí:** 11 СТОП ГТД → 16 ЗАКР. ЗАСЛ. (zavři klapky, chrání před vlhkostí) → 8 ПИТАНИЕ ОТКЛ.

---

**What this is.** A complete enumerated inventory of every control, gauge, lamp, switch, lever and pedal physically present at the driver's (механик-водитель) control compartment of the ГМ-575 chassis of the ЗСУ-23-4(М) «Shilka». This is the canonical driver reference for modelling the cockpit. It does **not** cover damage/repair mechanics.

**Sourcing & the scan-access caveat.** The 9 driver scan PNGs (`refs/visual_checks/driver/*.png`) and the deep panel scan (`refs/visual_checks/deep/driver_panel-096.png`) live under `~/Documents/`, which is **blocked by macOS TCC** in this environment — they could not be opened directly. However, **every one of those scans is itemised/transcribed in the text findings already in this repo**, so the inventory below is built from those transcriptions and is faithful to the printed labels. Scan → transcription map:

| Scan file | What it is | Transcribed in |
|---|---|---|
| `gm_album_driver_panel-130.png` | THE driver instrument panel (ЩИТОК ПРИБОРОВ М-В) | `findings/05-gm575-figures.md` RIS 4-18; `findings/10-operation-1970.md` fig.3 |
| `gm_album_hatch_block-158/159.png` | driver hatch flap (заслонка) + ПС-3 interlock switch | `05-gm575-figures.md` Прил.1 РИС.1 / РИС.4 |
| `gm_album_driver_vision-163/164.png` | side periscope + forward periscope install (wiper/washer) | `05-gm575-figures.md` Прил.1 РИС.10 / РИС.11 |
| `gm_album_fuel_control-023/024.png` | throttle (accelerator) linkage + hand-throttle | `05-gm575-figures.md` RIS 1-22/1-23 / RIS 1-24 |
| `gm_album_oil_system-030.png` | lubrication schematic | `05-gm575-figures.md` RIS 1-30; `06-…part2` pg21 |
| `gm_album_cooling_system-036.png` | cooling schematic + louvers | `05-gm575-figures.md` RIS 1-37/1-48; `06-…part2` pg25/28 |

**Item-number conventions used in the Source column.** `fig.3 #N` = the 1970 ЗСУ-23-4 operation-manual driver-panel figure 3 callout N (`findings/10-operation-1970.md`). `RIS 4-18 #1-NN` = the GM-575 album panel-drawing callout (`findings/05-gm575-figures.md`). `alb #N` = the same album's panel-front numbering (the second numbering scheme it prints). `D-0xx` = `gpt-deep-rnd/driver/01_driver_evidence_matrix.md`. The 1970-manual figure-3 numbers and the album RIS-4-18 numbers are **two different callout schemes for the same physical panel** — both are cited where known.

**Designation reconciliation (read before trusting a model name).**
- **Traction engine:** older ЗСУ-23-4 (1970) prints **В-6Р**; the modernized ЗСУ-23-4М / ГМ-575 albums print **В-6М / В-6М-1**. Same diesel, different manual editions. Treated as one engine below ("V-6 diesel").
- **Primary DC generator:** 1970 = **ПГС2-14А**; modernized = **ГИСВ2-14/3000**. Same primary generator; the emergency-disconnect target the driver controls is this machine.
- **Hatch interlock switch:** evidence matrix says **ПС-3**; the album figure prints the assembled block as **ПС-35 / РП-1** with **ПС-3** the roller microswitch. Below: ПС-3 = the contact, ПС-35/РП-1 = the block.
- **Bus voltages:** DC system is **±27.5 V** (two channels; the older 24 V battery nominal). The combat AC is **220 V 400 Hz** from the converter (БПС / ПС-14А); **115 V** for the laying drives is derived (Б-6В) in the turret — the driver's panel itself is essentially a **27.5 V DC** surface; its voltmeter reads the DC bus on a 0–75 V scale (so it can also show 54 V).

---

## A. POWER & VOLTMETER (ПИТАНИЕ / ЦЕПЬ ±27В / voltmeter / external power)

| Russian label | EN / CZ meaning | Type | Reads / does | Subsystem & bus | Authority | Source |
|---|---|---|---|---|---|---|
| **ВКЛЮЧЕНИЕ ПИТАНИЯ** (ПИТАНИЕ ВКЛ.) | Board-net ON / Zapnout palubní síť | button | Connects batteries/generator to the on-board net (energizes the whole rig) | 27.5 V DC master | driver-only | fig.3 #7; RIS 4-18 #7 (alb); D-027 |
| **ОТКЛЮЧЕНИЕ ПИТАНИЯ** (ПИТАНИЕ ОТКЛ.) | Board-net OFF / Vypnout síť | button | Disconnects batteries from the net (also one of the 3 emergency power cut-offs) | 27.5 V DC master | shared — duplicate ОТКЛ.ПИТАНИЯ button (#4) exists on commander's panel | fig.3 #8; RIS 4-18 #8 (alb); D-027 |
| **ЦЕПЬ +27В** | DC circuit +27 V (voltmeter selector) | button (momentary, voltmeter mode) | Switches voltmeter to read the **+27.5 V** DC channel (used to check battery sag during cold-crank) | +27.5 V DC channel | driver-only | fig.3 #5; RIS 4-18 #1-56 / #5 |
| **ЦЕПЬ −27В** | DC circuit −27 V (voltmeter selector) | button (momentary, voltmeter mode) | Switches voltmeter to read the **−27.5 V** DC channel | −27.5 V DC channel | driver-only | RIS 4-18 #1-55 / #4; D-027 |
| **ВОЛЬТМЕТР М1200 (0–75 В)** | Voltmeter / Voltmetr | gauge | Reads selected DC bus channel; **must not drop below 18 V** while the GTD starter cranks | DC bus (battery / generator) | driver-only | fig.3 #62; RIS 4-18 #1-38 / #62; D-009, D-022 |
| **АВАРИЙНОЕ ПИТАНИЕ** (АЗС) | Emergency-power breaker | circuit-breaker (АЗС) | Protects/arms the emergency-supply branch | 27.5 V DC | driver-only | RIS 4-18 #1-45 (АЗС bank) |
| **РОЗЕТКА внешнего питания** «ВНЕШНЕЕ ПИТАНИЕ +27» / «ЗАПУСК» | External-power & slave-start socket | socket (hull) | Lets ground power feed +27.5 V (and 220 V 400 Hz via ВИН) and slave-start the engine without the APU | external DC / 220 V 400 Hz AC | driver-operated (hull-mounted between hatches) | RIS 4-21; 06-part2 pg42; D-027 |
| **РОЗЕТКА ШР-51** | Portable-lamp socket | socket | Powers the ПЛТ-50 hand-lamp / aux | 27.5 V DC | driver-only | RIS 4-18 #45 |
| **ВКЛЮЧЕНИЕ ПИТАНИЯ** (АЗС, right column) | Power-enable breaker | circuit-breaker | Master AЗС for the panel power | 27.5 V DC | driver-only | RIS 4-18 right column |

> Note: the converter (БПС/ПС-14А, the 220 V 400 Hz source) is **started from the commander's panel** (ПУСК БПС #36 / СТОП БПС #1), not the driver's — see Section B for the driver-side converter lamps.

---

## B. GTD / GAS-TURBINE APU (ДГ4М-1) CONTROLS & INSTRUMENTS

| Russian label | EN / CZ meaning | Type | Reads / does | Subsystem & bus | Authority | Source |
|---|---|---|---|---|---|---|
| **ПУСК ГТД** | Start gas-turbine / Spustit GТD | button (under guard) | Hot-start of the ДГ4М-1 turbine (press 1–2 s after cold-crank) | GTD start, 27.5 V DC (battery-cranked) | driver-only | fig.3 #10; RIS 4-18 #10/#1-68; D-008 |
| **СТОП ГТД** | Stop gas-turbine / Zastavit GТD | button | Shuts the turbine down | GTD, 27.5 V DC | driver-only | fig.3 #11; RIS 4-18 #11/#1-69; D-017 |
| **ХОЛОДНАЯ ПРОКРУТКА** | Cold crank / Studené protočení | button (press-and-hold) | Motors the GTD to 15–20 % rpm (≤10 s) to pre-lube before hot start; also opens the flaps when tapped 1–2 s | GTD starter, battery DC | driver-only | fig.3 #14; RIS 4-18 #14/#1-73; D-010 |
| **ЗАКРЫТИЕ ЗАСЛОНОК** | Close GTD flaps / Zavřít záslonky | button | Closes the turbine intake/exhaust flaps after shutdown | GTD air path, 27.5 V DC | driver-only | fig.3 #16; RIS 4-18 #16/#1-72; D-027 |
| **АВТОМАТ. ЗАП. ГТД** | Auto-start GTD enable (guarded) | toggle (under flap 22, normally ON/up) | Arms/disarms commander's remote auto-start of the GTD; driver switches OFF during checks/training to prevent surprise starts | GTD start interlock, 27.5 V DC | **shared/contested** — driver gates it; commander can force-start via ПУСК БПС when armed | fig.3 (flap 22, right toggle); RIS 4-18 #1-67; D-018, D-021 |
| **ГЕНЕРАТ. / ОТКЛЮЧ.ГЕНЕРАТ.** | Generator disconnect (guarded) | toggle (under flap 22, left, normally ON/up) | Emergency-disconnects the primary DC generator (ПГС2-14А/ГИСВ); used on DC over-voltage (>57 V) or АВАРИЙНЫЙ РЕЖИМ | СЭП generator, 27.5/55 V DC | driver-only (emergency authority) | fig.3 (flap 22, left); RIS 4-18 #1-66; D-023 |
| **СТАРТЕР ГТД** (lamp) | GTD starter ON (blue) | lamp | Lit while the turbine starter is engaged; **if it fails to go out at 44 % rpm → stop the GTD** | GTD start, 27.5 V DC | driver-only (read) | fig.3 #15; RIS 4-18 #1-64/#15; D-013 |
| **ГТД** (lamp) | GTD running (green) | lamp | Turbine lit / running | GTD, 27.5 V DC | driver-only (read) | fig.3 #17; RIS 4-18 #1-59/#17; D-008 |
| **ОТКРЫТ. ЗАСЛ. / ОТКР.ЗАСЛ.** (lamp) | Flaps open | lamp | Confirms GTD intake/exhaust flaps opened (also a "still-open" reminder before close) | GTD air path, 27.5 V DC | driver-only (read) | fig.3 #20; RIS 4-18 #19/#1-71; D-008 |
| **ГЕНЕРАТОР** (lamp) | Generator on-net (green) | lamp | Lights when the DC generator's V exceeds battery V and it connects → readiness signal to report to commander | СЭП generator, 27.5 V DC | driver-only (read) | fig.3 #18; RIS 4-18 #1-65/#18; D-014 |
| **ПРЕОБРАЗОВАТЕЛЬ ГТД** (lamp) | Converter fed from GTD (green) | lamp | Converter (220 V 400 Hz) is being driven via the GTD source | СЭП converter, 220 V 400 Hz AC | driver-only (read) | RIS 4-18 #1-57/#21; D-020 |
| **ПРЕОБРАЗОВАТЕЛЬ ДИЗ** (lamp) | Converter fed from diesel (yellow) | lamp | Converter is being driven from the V-6 diesel generator | СЭП converter, 220 V 400 Hz AC | driver-only (read) | RIS 4-18 #1-58/#20; D-020 |
| **указатель оборотов ГТД (тахометр ТЭ-1) %** | GTD rpm % tachometer | gauge | Idle/ready **98.5–103.5 %**; loaded **98.5–101.5 %**; starter auto-cuts at 44 % | GTD, 27.5 V DC instrument | driver-only | fig.3 #57; RIS 4-18 #1-35/#58; D-016 |
| **манометр МАСЛО ГТД (ЭДМУ-3)** | GTD oil-pressure gauge | gauge | Running band **0.5–2.5 kg/cm²**; cold-crank look for **0.15–0.2 kg/cm²** (no pressure → max 3 cranks) | GTD lube, 27.5 V DC instrument | driver-only | fig.3 #59; RIS 4-18 #1-36/#59; D-010, D-016 |
| **термометр МАСЛО ГТД** | GTD oil-temp gauge | gauge | Limit **≤110 °C** | GTD lube | driver-only | fig.3 #55; RIS 4-18 #1-37/#55; D-016 |
| **термометр ГАЗЫ ГТД (ТСТ-2, 0–900 °C)** | GTD exhaust-gas temp | gauge | Limit **≤650 °C** | GTD exhaust | driver-only | fig.3 #56; RIS 4-18 #1-39/#56; D-016 |
| **счётчик моточасов ГТД** | GTD hour-meter | gauge (counter) | Turbine running hours (continuous run ≤8 h) | GTD service | driver-only | RIS 4-18 #1-40/#57/#74 |
| **АЗС ГТД-1 / ГТД-2** | GTD circuit-breakers 1 & 2 | circuit-breakers | Protect the two GTD start/ignition circuits | GTD start, 27.5 V DC | driver-only | fig.3 #12/#6; RIS 4-18 right column #1-49/#1-50 |
| **АЗС ПОДГОТ.ЗАПУСКА** | Start-prep breaker | circuit-breaker | Arms the start-preparation circuit | GTD start | driver-only | fig.3 #71; RIS 4-18 #1-33 |

---

## C. V-6 DIESEL (traction engine) CONTROLS & INSTRUMENTS

| Russian label | EN / CZ meaning | Type | Reads / does | Subsystem & bus | Authority | Source |
|---|---|---|---|---|---|---|
| **СТАРТЕР** | Diesel electric start | button | Energizes СТ-721 starter (via КМ-50Д→КМ-600Д contactors) to crank the diesel | engine start, 24 V DC | driver-only | fig.3 (#1 ПИТАНИЕ СТАРТЕРА breaker); RIS 4-18 #1-6/#47; D-007 |
| **АЗС-50 СТАРТЕР** | Starter breaker (50 A) | circuit-breaker | Protects the starter circuit | engine start, 24 V DC | driver-only | RIS 4-18 #1-46 |
| **НАСОС ТОПЛИВА** | Fuel-prime pump / Palivová pumpa | button | Runs the МЗН-2 fuel-priming pump before start | fuel, 27.5 V DC | driver-only | RIS 4-18 #1-19/#27; alb RIS 1-55 #1-19; D-027 |
| **МАСЛО** (НАСОС МАСЛА) | Oil-prime pump / Olejová pumpa | button | Runs the МЗН-2 oil-priming pump (pre-lube) before start | lube, 27.5 V DC | driver-only | fig.3 #46; RIS 4-18 #1-2/#46 *(printed «МАСЛО»; = oil prime)* |
| **ЖАЛЮЗИ ДИЗЕЛЯ** | Radiator louvers / Žaluzie | switch | Drives the МПК-5А electromechanism that opens/closes the cooling-deck louvers | cooling, 27.5 V DC | driver-only | RIS 4-18 #1-84/#24; 06-part2 pg28; D-027 |
| **ЖАЛЮЗИ ЗАКР.** (lamp) | Louvers closed | lamp | Indicates louvers fully closed | cooling | driver-only (read) | RIS 4-18 #1-83 |
| **термометр ВОДА (ТУЭ-48)** | Coolant-temp gauge | gauge | Diesel coolant temperature | cooling | driver-only | RIS 4-18 #1-23/#37 |
| **манометр МАСЛО (ТЭМ-15)** | Diesel oil-pressure gauge | gauge | Diesel oil pressure (before/after start) | lube | driver-only | RIS 4-18 #1-24/#48 |
| **термометр МАСЛО (ТУЭ-48)** | Diesel oil-temp gauge | gauge | Diesel oil temperature | lube | driver-only | RIS 4-18 #1-25/#49 |
| **манометр ТОПЛИВО (ТЭМ-15)** | Fuel-pressure gauge | gauge | Diesel fuel-line pressure | fuel | driver-only | RIS 4-18 #1-34/#54 |
| **тахометр ДИЗ. (ТЭ-4В / ТЭ-48)** | Diesel tachometer | gauge | Engine rpm — hold **≥1550 rpm** for СЭП generator; **never <1250 rpm** moving | engine | driver-only | fig.3 #48; RIS 4-18 #1-21; D-019 |
| **спидометр СП-106 (0–80)** | Speedometer | gauge | Road speed (driven off gearbox main shaft) | drivetrain (mechanical sender + meter) | driver-only | RIS 4-18 #1-22/#39; alb RIS 4-31 |
| **указатель уровня ТОПЛИВО (УБ-125)** | Fuel-level gauge | gauge | Rear-tank fuel level (front tank read by neck dipstick); needs ПИТАНИЕ ПРИБОРОВ on | fuel, 27.5 V DC instrument | driver-only | RIS 4-18 #1-29/#35; D-027 |
| **счётчик моточасов (дизель)** | Diesel hour-meter | gauge (counter) | Engine running hours | engine service | driver-only | RIS 4-18 #1-27/#50 |
| **часы 123ЧС** | Clock / Hodiny | clock | Time of day | 27.5 V DC | driver-only | RIS 4-18 #1-28/#51 |
| **АЗС ПИТАНИЕ ПРИБОРОВ** | Instruments-power breaker | circuit-breaker | Powers the gauge cluster (fuel gauge, etc.) | 27.5 V DC | driver-only | RIS 4-18 #1-11; alb RIS 1-55 #1-11 |
| **манометр воздушного запуска** | Air-start pressure gauge | gauge | Compressed-air start-bottle pressure (full 150, min 100 kg/cm²) | pneumatic | driver-only | 10-operation-1970 §3; alb RIS 1-56 |

> Engine-stop and the fuel-cock / hand-throttle / air-start valves are **mechanical** controls — see Section G.

---

## D. PRE-HEAT / WINTER (cold-start heater)

| Russian label | EN / CZ meaning | Type | Reads / does | Subsystem & bus | Authority | Source |
|---|---|---|---|---|---|---|
| **КЛАПАН ПОДОГРЕВА** | Pre-heater valve / Klapka předehřevu | toggle | Opens the pre-heater fuel/coolant valve to fire the boiler | pre-heat, 27.5 V DC | driver-only | RIS 4-18 #1-81/#28; alb RIS 1-55 #1-81; D-027 |
| **СВЕЧА-ФОРСУНКА** | Glow-plug / heater-nozzle igniter | switch | Energizes the heater-nozzle glow-plug (КП-4716 coil) to light the boiler | pre-heat ignition, 27.5 V DC | driver-only | RIS 4-18 #1-17/#29; alb RIS 1-55 #1-17 |
| **ВЕНТ. ПОМПА** (ПИТАНИЕ ВЕНТ.ПОМПЫ) | Heater blower / water-pump power | switch + АЗС | Powers the нагнетатель (combined air-blower + water-pump) that forces hot gas/coolant through the powerpack | pre-heat circulation, 27.5 V DC | driver-only | RIS 4-18 #1-15/#31; alb RIS 1-55 #1-15 |
| **КЛАПАН ПРОКАЧКИ** | Priming valve | toggle | Opens the fuel-priming/bleed valve | fuel/pre-heat, 27.5 V DC | driver-only | RIS 4-18 #1-96/#60 |
| **термометр КОТЁЛ (ТУЭ-48)** | Heater-boiler temp gauge | gauge | Pre-heater boiler coolant temperature | pre-heat | driver-only | RIS 4-18 #1-108/#9; alb RIS 1-55 #1-108 |
| **ПОДОГРЕВ ЧАСОВ** | Clock heating | switch | Heats the clock/instruments in the cold | 27.5 V DC | driver-only | RIS 4-18 #1-13/#33 |
| **I РЕЖИМ / II РЕЖИМ** | Compartment-heater mode I / II | rotary/toggle | Selects the control-compartment electric heater power level | crew heating, 27.5 V DC | driver-only | RIS 4-18 #34; fig.3 #34 |
| **АЗС ПОДГОТ.ЗАПУСКА** | Start-prep breaker | circuit-breaker | Arms the pre-heat/start-prep branch (also Section B) | 27.5 V DC | driver-only | RIS 4-18 #1-33; fig.3 #71 |
| **АЗС ОБОГРЕВ** | Heating breaker | circuit-breaker | Protects the compartment-heating circuit | crew heating | driver-only | RIS 4-18 #1-48 (right column) |
| **ОВС** | Hull/compartment ventilation-heat (uncertain — needs review) | switch | Likely compartment-heat/vent function (label «ОВС») | crew heating/vent | driver-only | RIS 4-18 #1-100 *(uncertain — label only)* |

---

## E. HATCH / VENTILATION / ПАЗ (NBC)

| Russian label | EN / CZ meaning | Type | Reads / does | Subsystem & bus | Authority | Source |
|---|---|---|---|---|---|---|
| **ЛЮК ВОДИТ.** (lamp, green «ЗАКРЫТО» strip) | Driver hatch (closed) | lamp | Lit when the driver hatch is closed; closing it also drops the commander's red ЛЮК ОТКРЫТ and **arms the fire/power-drive circuits** | hatch interlock, 27.5 V DC | driver reads; **state is a hard fire/drive interlock shared with commander** | fig.3 #68; RIS 4-18 #1-92/#68; D-025, D-028, D-029 |
| **выключатель блокировки люка ПС-3** | Hatch-block roller microswitch | switch (contact, roller-tripped) | The physical contact, mounted on the upper front glacis plate, tripped by a roller as the hatch cover closes — the real sensor behind ЛЮК ВОДИТ. and the fire/drive arming relay | hatch interlock, 27.5 V DC | mechanism (driver's hatch drives it) | `hatch_block-159` Прил.1 РИС.4; RIS 4-18 #79/#236; D-026 |
| **блок ПС-35 / РП-1 (заслонка)** | Hatch flap + interlock/NBC-slam block | mechanism | The driver hatch flap (заслонка 5) assembled with ПС-35 + РП-1 (interlock + NBC slam relay) | hatch / ПАЗ | mechanism | `hatch_block-158` Прил.1 РИС.1; D-026 |
| **ПРИТОЧ. ВЕНТИЛ.** (lamp, green) | Intake ventilation (closed/state) | lamp | Control-compartment intake-vent flap state | ventilation, 27.5 V DC | driver reads | fig.3 #65; RIS 4-18 #1-97/#65; D-028 |
| **ВЫТЯЖН. ВЕНТИЛ.** (lamp, green) | Exhaust ventilation (closed/state) | lamp | Control-compartment exhaust-vent flap state | ventilation, 27.5 V DC | driver reads | fig.3 #66; RIS 4-18 #1-98/#66; D-028 |
| **СИГНАЛ ПАЗ** (lamp, red) | NBC (anti-nuclear) alarm | lamp | Red alarm: ПАЗ triggered — driver must verify hatch + vent flaps sealed | ПАЗ, 27.5 V DC | driver reads (crew-wide event) | fig.3 #73; RIS 4-18 #1-111/#73; D-028, D-029 |
| **ВКЛ.ВЕНТИЛ. – ОТКЛ.** (ПАЗ panel) | Ventilation/blower ON–OFF | toggle | Runs the ПАЗ supercharger/vent blower | ПАЗ, 27.5 V DC | driver-accessible (control-compartment ПАЗ panel) | fig.17 #1; 10-operation-1970 §4 |
| **ВКЛ.ПАЗ – ОТКЛ.** (ПАЗ panel) | NBC system ON–OFF | toggle | Enables the ПАЗ protection circuit | ПАЗ, 27.5 V DC | driver-accessible | fig.17 #4 |
| **АВТОМАТ – РУЧНОЕ** (ПАЗ panel) | ПАЗ auto / manual | switch | Auto-trigger vs manual ПАЗ actuation | ПАЗ, 27.5 V DC | driver-accessible | fig.17 #5 |
| **ПАЗ СИГНАЛ** (lamp, ПАЗ panel) | ПАЗ alarm lamp (on the ПАЗ sub-panel) | lamp | Duplicate ПАЗ alarm on the ПАЗ control panel | ПАЗ | driver reads | fig.17 #3 |
| **АЗС-50 ПАЗ** / **ДП-12** | ПАЗ breaker / ДП-3Б remote switch | circuit-breaker / switch | Protects ПАЗ; ДП-12 remote for the ДП-3Б roentgenometer | ПАЗ, 27.5 V DC | driver-accessible | fig.17 #8 / #9 |
| **заслонка приточной вентиляции (пиропатрон)** | Intake-vent flap w/ pyro slam | mechanism (squib) | Pyro-slams the intake vent shut on ПАЗ alarm (torsion-assisted, set 29°) | ПАЗ, pyro | mechanism | Прил.1 РИС.2 |
| **АЗС ВЕНТИЛЯТОР** | Vent-fan breaker | circuit-breaker | Protects the ventilation fan circuit | ventilation | driver-only | RIS 4-18 #1-74 |

---

## F. LIGHTS / WIPERS / VISION

| Russian label | EN / CZ meaning | Type | Reads / does | Subsystem & bus | Authority | Source |
|---|---|---|---|---|---|---|
| **ФАРА (переключатель П-305)** | Headlight selector | rotary switch | Selects driving headlights (ФГ-127 white) on/off/modes | lighting, 27.5 V DC | driver-only | fig.3 #42; RIS 4-18 #1-4/#42; D-027 |
| **ФАРЫ ТВН** | IR (night-vision) headlights | switch | Switches the ФГ-125 IR-filtered lamps for ТВНО-2 night driving | lighting, 27.5 V DC | driver-only | RIS 4-18 #1-5/#1-8 |
| **ФАРЫ ТВН-СМУ** | IR / black-out (foul-weather) headlight mode | selector | Selects ТВН vs СМУ (blackout / bad-weather) lighting mode | lighting, 27.5 V DC | driver-only | RIS 4-18 #1-8; D-027 |
| **СИГНАЛ** | Horn (С-58) / Houkačka | button | Sounds the С-58 horn — used as the mandatory **audible warning before start/move** | signal, 27.5 V DC | driver-only | fig.3 #40; RIS 4-18 #1-3/#40 |
| **СТЕКЛООЧ. ЛЮКА** | Hatch-windscreen wiper | switch | Wiper on the openable glazed hatch windscreen | wiper, 27.5 V DC | driver-only | RIS 4-18 #1-12; D-034 |
| **СТЕКЛООЧИСТИТЕЛИ КОЛПАКА** | Periscope-cap wipers | switch | Wiper on the forward periscope cap glass (БМО-190Б) | wiper, 27.5 V DC | driver-only | RIS 4-18 #1-118; D-034 |
| **СТЕКЛООЧИСТИТЕЛИ БОКОВЫЕ** | Side-periscope wipers | switch | Wiper on the side observation device (Б-1) | wiper, 27.5 V DC | driver-only | RIS 4-18 #1-116; D-034 |
| **ОБОГРЕВ СТЕКЛА** | Glass heating | switch | Heats periscope/windscreen glass (de-mist/de-ice) | de-ice, 27.5 V DC | driver-only | RIS 4-18 #1-44; D-034 |
| **ПОДСВЕТКА** | Panel backlight dimmer | potentiometer/knob | Dims the instrument-panel backlight | lighting, 27.5 V DC | driver-only | RIS 4-18 #44/#1-88 |
| **РТС-27-2А/3А (ВЕРХНЕЕ / НИЖНЕЕ / ОБА СТЕКЛА)** | Vision-glass heat regulator | selector | Selects which periscope glasses are heated (top / bottom / both) | de-ice, 27.5 V DC | driver-only | alb RIS 4-39/4-39a; #223 |
| **смотровой прибор БМО-190Б** | Forward day periscope | optic (vision device) | Driver's main forward heads-down view (≈20°×75° fixed periscope); upper+lower prisms, heated | observation | driver-only | `driver_vision-164` Прил.1 РИС.11; alb RIS 5-4; #217; D-034 |
| **боковой смотровой прибор (стеклоблок Б-1)** | Side observation device | optic + washer/wiper | Driver's side view with protective glass + washer jet + wiper | observation | driver-only | `driver_vision-163` Прил.1 РИС.10; D-034 |
| **прибор наблюдения ТВНО-2** | Night-vision periscope | optic (IR) | Driver's night driving sight (works with ФГ-125 IR lamps) | observation, 27.5 V DC | driver-only | 06-part2 pg51; #74; D-027 |
| **трубка стеклообмыва + кран (СЛ-215)** | Washer jet + cock + wiper motor | washer/wiper | Sprays washer water on periscope/windscreen glass from the tank | washer, 27.5 V DC + mechanical | driver-only | alb RIS 5-8; Прил.1 РИС.11 #3; D-034 |
| **ветровое стекло на крышке люка + стеклоочиститель** | Hatch windscreen + wiper | glazing + wiper | The openable glazed driver hatch for heads-out driving (windscreen + wiper #28) | observation | driver-only | alb RIS 5-3; D-034 |
| **АЗС СТЕКЛООЧ. / ФАРЫ / ОБОГРЕВ СТЕКЛА / РОЗЕТКА** | Wiper / headlight / glass-heat / socket breakers | circuit-breakers | Protect the wiper, headlight, glass-heat and socket circuits | 27.5 V DC | driver-only | RIS 4-18 right column |

---

## G. DRIVETRAIN CONTROLS (mechanical / pneumatic)

| Russian label | EN / CZ meaning | Type | Reads / does | Subsystem & bus | Authority | Source |
|---|---|---|---|---|---|---|
| **рычаг управления (левый)** | Left steering tiller | lever | Pull part-way (pos. I) = soft left turn (left planetary to reduced ratio); pull + grip-twist (pos. II) = brake/pivot left. Detent positions Н/У/В | ПМП steering, mechanical | driver-only | `fuel`-adjacent dr. figs; alb RIS 2-29/2-31/2-33; D-035 |
| **рычаг управления (правый)** | Right steering tiller | lever | Same for the right track | ПМП steering, mechanical | driver-only | alb RIS 2-29/2-33; D-035 |
| **кнопка насоса стеклообмыва (на рукоятке левого рычага)** | Washer-pump button on left tiller grip | button | Runs the windscreen-wash pump (built into the left tiller grip, item 16) | washer, 27.5 V DC | driver-only | alb RIS 2-29 #16 |
| **педаль главного фрикциона** | Main-clutch pedal | pedal | Disengages the main multi-disc dry clutch; full travel ≈220 mm, free play 30–60 mm, servo-spring assisted | clutch, mechanical | driver-only | `fuel`-set; alb RIS 2-6; D-036 |
| **педаль топливного насоса (акселератор)** | Accelerator pedal | pedal | Throttle — drives the HP-pump delivery lever (idle / max / zero positions) | fuel/engine, mechanical | driver-only | `fuel_control-023` alb RIS 1-22/1-23; D-038 |
| **рукоятка ручной подачи топлива** | Hand throttle | lever (toothed sector + detent) | Manual fuel-feed (hand-throttle); set rearward at start-up | fuel/engine, mechanical | driver-only | `fuel_control-024` alb RIS 1-24; D-007, D-038 |
| **механизм остановки двигателя** | Engine-stop control | pull control + electromagnet | Pulls the HP-pump rack to zero to kill the diesel | engine stop, mechanical/27.5 V DC | driver-only | alb RIS 1-25 |
| **педаль горного тормоза** | Mountain / parking-brake pedal | pedal (with ratchet hold) | Applies both stopping brakes; гребёнка + planka-tooth ratchet holds it (parking); set to initial pre-start | brakes, mechanical | driver-only | alb RIS 2-31 #4; D-035, D-036 |
| **рычаг переключения передач (+ H-кулиса)** | Gear lever + H-gate | lever | Selects gears via the H-gate **top: V · III · ЗХ (reverse); bottom: IV · II · I**, neutral centre; must be in neutral to start; 1st & reverse unsynchronized (grind) | gearbox (5 fwd + R), mechanical | driver-only | alb RIS 2-19/2-21; D-037 |
| **рукоятка включения отбора мощности СЭП (Выкл./Вкл.)** | СЭП power-take-off engage lever | lever (ON/OFF gate) | Engages the PTO that drives the СЭП generator (radar/turret power); set ENGAGED (rear) for combat — behind/right of the driver's seat | СЭП drive, mechanical | driver-only | alb RIS 2-7; 10-operation-1970 §4; D-007 |
| **топливораспределительный кран (4 положения)** | Fuel distribution cock / tank selector | handwheel/lever (4-pos) | Selects feed: **ОТКРЫТЫ ОБА БАКА / передний бак / ЗАДНИЙ бак / ЗАКРЫТЫ ОБА БАКА**; set to front tank at start | fuel, mechanical | driver-only | alb RIS 1-15; 06-part2 pg16; D-007 |
| **запорный вентиль воздушного баллона** | Air-start bottle shut-off valve | valve (handwheel) | Opens the compressed-air start bottle (150 kg/cm² full, 100 min); set CW to stop | pneumatic start | driver-only | alb RIS 1-56; 10-operation-1970 §4; D-007 |
| **перепускной кран (рукоятка) воздушного запуска** | Air-start bypass cock | lever | Routes high-pressure air through the air distributor to crank the diesel pneumatically | pneumatic start | driver-only | alb RIS 1-56/1-57 |
| **КОМПРЕССОР** (pneumo, if reachable) | Compressor switch (gun pneumo-recharge) | switch | Charges the AZP recharge cylinders (30–35→56–65 kg/cm²) | pneumatic, 27.5 V DC | typically commander/crew; driver may set | 10-operation-1970 §3 *(borderline — gun system)* |

---

## H. FIRE SUPPRESSION accessible to the driver (УА ППО «Роса» + hand CO₂)

| Russian label | EN / CZ meaning | Type | Reads / does | Subsystem & bus | Authority | Source |
|---|---|---|---|---|---|---|
| **АВТОМАТ АС-2** «ПРИ ПОЖАРЕ ОТКРОЙ КРЫШКУ И НАЖМИ КНОПКУ» | Fire-signalling automaton AS-2 | panel (under hinged cover) | The driver's fire-control box: open the cover and press a zone button | УА ППО, 27.5 V DC | driver (manual fire authority) | 06-part2 pg47/48; alb RIS 9-6; D-030 |
| **АВТ. – РУЧН.** (на АС-2) | Auto / Manual mode | switch | Selects automatic (thermal-sensor) vs manual discharge | УА ППО, 27.5 V DC | driver-only | 06-part2 pg48; D-030 |
| **ПЕРЕДН.** (кнопка) | Front-zone discharge button | button | Manually fires the front-zone extinguisher bottle | УА ППО, 27.5 V DC | driver-only | 06-part2 pg48; alb RIS 9-6; D-030 |
| **ЗАДН.** (кнопка) | Rear-zone discharge button | button | Manually fires the rear-zone extinguisher bottle | УА ППО, 27.5 V DC | driver-only | 06-part2 pg48; D-030 |
| **Сигнальная лампа ПЕРЕДН. / ЗАДН.** | Front / rear fire-warning lamps | lamps | Indicate which zone has a detected fire | УА ППО, 27.5 V DC | driver reads | 06-part2 pg47 |
| **Окно остатка баллонов / ПЕРЕВОД ДИСКА** | Bottles-remaining counter window + disc | indicator + rotary | Shows extinguisher bottles remaining; ПЕРЕВОД ДИСКА advances the squib disc | УА ППО | driver-only | 06-part2 pg47; alb RIS 9-6 |
| **ПРОВЕРКА ЦЕПЕЙ** | Circuit-test position | selector position | Tests the fire-system circuits | УА ППО, 27.5 V DC | driver-only | 06-part2 pg47 |
| **АЗС ППО и ПАЗ** | Fire/ПАЗ breaker | circuit-breaker | Protects the fire-suppression + ПАЗ circuits | УА ППО / ПАЗ, 27.5 V DC | driver-only | RIS 4-18 #1-47 |
| **Огнетушитель ОУ-2 (ручной CO₂)** | Hand CO₂ extinguisher | hand bottle | Driver-reachable CO₂ extinguisher for control-compartment / under-turret fires (after stopping ZSU + СЭП off) | fire, manual | driver-only | alb Прил.1 РИС.9; 06-part2 pg45; D-031 |

---

## Commander-side controls the DRIVER does NOT have (so the authority split is explicit)

These appear in the workflows but live on the **commander's** panel, not the driver's:
- **ОТКЛЮЧЕНИЕ ДИЗЕЛЯ** — commander's diesel kill-switch (stops the V-6 if the driver is incapacitated). *(D-042, D-043)*
- **ПУСК БПС / СТОП БПС** — start/stop the 220 V 400 Hz converter (an accidental ПУСК БПС can auto-start the GTD). *(10-operation-1970 §5–6)*
- **ОТКЛЮЧЕНИЕ ПИТАНИЯ (button 4)** — commander's duplicate master power-off (the driver's is button 8).
- **ОГРАНИЧЕНИЕ УГЛОВ / АВАРИЙНАЯ СТРЕЛЬБА / ЛЮК ОТКРЫТ lamp** — commander reads the driver's hatch state via his own red ЛЮК ОТКРЫТ lamp.

---

## P0 — the ~8 most important driver items (flagship slice)

1. **ВКЛЮЧЕНИЕ ПИТАНИЯ** (board-net ON) — gateway to everything.
2. **ВОЛЬТМЕТР** + **ЦЕПЬ +27В** — battery check; the **<18 V** start gate.
3. **ХОЛОДНАЯ ПРОКРУТКА** (cold crank) — mandatory pre-lube; ties to GTD oil-pressure.
4. **ПУСК ГТД / СТОП ГТД** (under guard) — the turbine start/stop.
5. **СТАРТЕР ГТД / ГТД / ГЕНЕРАТОР lamps** — the start-success readout (starter must cut at 44 %; ГЕНЕРАТОР green = report ready).
6. **тахометр ГТД % + манометр МАСЛО ГТД + термометр ГАЗЫ ГТД** — the continuous GTD scan band (98.5–101.5 % / 0.5–2.5 kg/cm² / ≤650 °C).
7. **ЛЮК ВОДИТ. lamp + ПС-3 contact** — the hard fire/drive interlock (the flagship driver↔combat link).
8. **АВТОМАТ. ЗАП. ГТД guarded toggle** — the safety switch the driver throws to stop surprise commander auto-starts.

(Honourable mentions for a full slice: the steering tillers + clutch pedal + gear H-gate for movement, and the periscope wiper for rain.)

---

## Notable discoveries & contradictions vs the text sources

- **Two callout numbering schemes for one panel.** The 1970 operation manual (`fig.3 #N`) and the GM-575 album (`RIS 4-18 #1-NN` / `#N`) number the *same* driver panel differently. Cross-walked above; e.g. cold-crank = fig.3 #14 = RIS 4-18 #1-73 = alb #14.
- **The driver panel is a DOUBLE instrument cluster** — a full diesel set *and* a full gas-turbine set side by side (the `03_driver_panel_controls.md` design doc under-counts this; the album confirms separate tach/oil-press/oil-temp/gas-temp/hour-meter for the GTD).
- **«ОТКРЫТ. ЗАСЛ.» vs «ОТКР.ЗАСЛ.»** — same lamp (GTD flaps open); spelling differs between the design doc and the manual.
- **«НАСОС МАСЛА» is printed «МАСЛО».** The evidence-matrix/design list calls it «НАСОС МАСЛА»; the panel actually prints the oil-prime button as **«МАСЛО»** (button 46 / #1-2). Same function (МЗН-2 oil prime).
- **Converter START is the commander's, not the driver's.** The driver only has the *source* lamps **ПРЕОБРАЗОВАТЕЛЬ ГТД / ПРЕОБРАЗОВАТЕЛЬ ДИЗ**; ПУСК/СТОП БПС are on the commander panel — a genuine authority split, easy to mis-model.
- **The guarded flap 22 holds TWO toggles** (left **ОТКЛЮЧ.ГЕНЕРАТ.**, right **АВТОМАТ.ЗАП.ГТД**) — not one. D-021/D-023 each describe one; both live under the same cover.
- **Hatch-switch designation drift.** Evidence matrix = **ПС-3**; album figure = **ПС-35 / РП-1** block with **ПС-3** the roller contact. Treated as: ПС-3 contact inside the ПС-35/РП-1 block.
- **Engine + generator names differ by edition** (В-6Р/ПГС2-14А in 1970 vs В-6М-1/ГИСВ2-14/3000 modernized) — same hardware.
- **Uncertain item:** RIS 4-18 #1-100 **«ОВС»** — label captured but function not spelled out in the transcriptions (marked uncertain).
- **Scans not directly viewable** — all sourcing is from the in-repo transcriptions of those scans (TCC blocked `~/Documents`); flagged at top.
