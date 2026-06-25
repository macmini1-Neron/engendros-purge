# 1РЛ33М (1РЛ33М2) Radar Instrument Complex — Technical Description (1980)

Source: `04-1rl33m-radar-tech-desc-1980.pdf` — «ЗСУ-23-4М, Изделие 1РЛ33М2, Техническое описание, ЦА2.076.013 ТО» (Воениздат, Москва 1980, 181 pp). The gun-laying radar station (РЛС орудийной наводки) of the ЗСУ-23-4М radar-instrument complex (РПК).
Status: **COMPLETE** — all 181 pages read page-by-page from rendered images (OCR garbled); numbers transcribed visually from the Cyrillic.

---

## 1. SCOPE & IDENTITY

- **Designation:** Изделие 1РЛ33М2 = the gun-laying radar (РЛС орудийной наводки) inside the radar-instrument complex (РПК) of the **ЗСУ-23-4М «Shilka»**. Drawing index ЦА2.076.013 ТО.
- **Purpose (Назначение):** detect **low-flying high-speed targets**, determine the coordinates of a selected target, and feed those data to the **СРП** (счетно-решающий прибор = analog fire-control computer) while working as part of the ЗСУ-23-4М РПК.
- The РЛС *measures* (range + 2 angles + their rates); the **СРП** computes the lead/laying solution; the **antenna-control / drive** systems lay the guns. The radar itself is a tracker + data source, not the lead computer.

### 1.1 Block / sub-unit structure (Состав РЛС)
The РЛС is a set of blocks/units grouped into **systems**, housed in **cabinets (шкафы)** + the **antenna column (антенная колонка Т-2М2)**, all on rubber-metal shock mounts in the **rotating (turret) part** of the ЗСУ; the column projects out through a hatch in the turret roof.

| System | Role | Key blocks |
|---|---|---|
| Передающая система (Transmitter) | forms the HF probing pulses | Передатчик **Т-3М1** (magnetron МИ-514М1 + modulator), HV rectifier **Т-29М**, tuning mechanism **Т-4М2** |
| Антенно-волноводная система (АВС) | routes HF to feeds, antenna, switches | antenna, waveguide switch, **АНТЕННА-ЭКВИВАЛЕНТ** switch, **ПОИСК-ПЕЛЕНГ** switch, ferrite circulator/switch, control resonator, antenna equivalent (dummy load) |
| Приемная система (Receiver) | amplify + convert echoes | mixer, local oscillator (гетеродин), АПЧ mixer+ФИ, **Т-35М1** (АПЧ), coherent LO **Т-8М**, IF preamp **Т-34М** (ПУПЧ), main IF amp **Т-9М** (channels КД + КУА) |
| Система поиска (Search) | search-scope display | sweep block **Т-53М**, search indicator **Т-28М** |
| Система измерения дальности (Range) | auto range-tracking + range readout | range block **Т-21М1**, range-mechanism block **Т-22М1**, range indicator **Т-23М2**, **range handwheel (штурвал дальности)** |
| Система управления антенной (СУА, Antenna control) | converts error → drive, holds angles | angular-coordinate tracking block **Т-13М2**, column-control block **Т-55М3**, column-mechanisms block, ГОН (reference-voltage gen), elevation sensor (угломестный датчик) |
| Система СДЦ / ЧПК (MTI) | reject clutter, keep movers | sweep **Т-18М**, ЧПК canceller **Т-19М**, video-amp **Т-13М** (note: shares index family) |
| Система вторичных источников питания (Secondary power) | DC/AC rails | Т-10М, Т-20М, Т-24М, Т-27М1, Т-54М, Т-59 |
| Осциллографическая приставка | service scope | block **Т-23А** |
| Бланкирование радиостанции | blank radio during TX | block **Т-71** |
| Cabinets (шкафы) | mechanical housings | **Т-36М, Т-37М1, Т-40М1, Т-42М, Т-43М, Т-44М1, Т-46М1** |
| Система вентиляции | forced-air cooling | 16 fans + dust separators |

- ЗИП: each unit gets individual **ЗИП-1**; every four units share group **ЗИП-2**.
- Power enters RLS at connector **Ш8 of cabinet Т-44М1** via panel **РЩ4** of product **2А10М**.

### 1.2 Crew stations in the rotating part (Fig. 1-1)
Three seats in the turret basket:
- **Место командира** (commander) — left.
- **Место оператора поиска** (search operator) — centre, at search indicator **Т-28М** + **рукоятки управления** (control handles/joysticks).
- **Место оператора дальности** (range operator) — right, at range indicator **Т-23М2** + **штурвал дальности** (range handwheel).
Cabinet **Т-36М** (front panel: T-5M, T-28M search indicator, T-55M3) carries the search scope; cabinet **Т-37М1** the range/ЧПК blocks (Т-59, Т-17М, Т-13М2, Т-19М, Т-18М, Т-71).

---

## 2. ⭐ RADAR OPERATING ENVELOPE (EXACT NUMBERS)

From Ch.1 §2 "Тактико-технические данные":

| Parameter | Value |
|---|---|
| **Detection range**, MiG-17-type target, automatic **sector** search | **≥ 12 000 m** |
| **Auto-tracking range**, MiG-17-type (dead zone 200 m) | **≥ 10 000 m** |
| Coordinate accuracy (auto-track, mean of RMS errors) — range | **10 m** |
| Coordinate accuracy — angular | **0-06** (6 mils ≈ 0.34°) |
| **Range resolution** (auto-track) | **75 m** |
| **Carrier frequency** | f = f_nom **± 1.8 %**, f_nom = **15 000 ± 50 MHz** (~14.73–15.27 GHz, ~2 cm, J/Ku-band) |
| Two fixed carrier channels | **ЧАСТОТА I / ЧАСТОТА II** |
| **Intermediate frequency** f_пр | **60 MHz** |
| **PRF** (standard) | **4750 ₋₂₅₀ Hz** |
| **PRF** (ВОБУЛЯЦИЯ / jitter mode) | **4750 ₋₂₅₀ … 3650 ₊₂₅₀ Hz** (swept) |
| **Scan frequency F** (raster scan rate) | **63 Hz** |
| Dead zone (min track range) | **200 m** |
| Power: AC 220 V / 400 Hz | **≤ 10.5 kW** |
| Power: DC ±27.5 V | **≤ 1 kW** |
| **Continuous run time** | **8 h** |
| Magnetron МИ-514М1 anode current (pulse) | **36–40 A** at cathode **13.5–15.5 kV** |
| Trigger pulse to TX (from Т-21М1) | amplitude **≥ 90 V**, **τ ≤ 1.5 µs** |
| HV rectifier (Т-29М) | **+4.5 kV** (→ ×4 in modulator → 13.5–15.5 kV pulse) |
| Magnetron filament preheat time | **≥ 3 min** (time relay Р27-2 in block Т-27М1) |

### 2.1 Operating modes (Режимы работы)
- **Antenna/search modes:** ручной (manual) · **СЕКТОРНЫЙ ПОИСК** (sector search) · **КРУГОВОЙ ПОИСК** (circular/360° search) · **НАВЕДЕНИЕ** (manual antenna pointing on target) · **АВТОМАТ** (automatic tracking).
- **Echo-processing modes:** **АМПЛИТУДНЫЙ** (amplitude) and **СДЦ** (MTI — moving-target selection via ЧПК canceller, uses coherent LO).
- **PRF modes:** constant PRF or **ВОБУЛЯЦИЯ** (PRF jitter — anti-blind-speed / anti-jam).
- **Frequency channels:** **ЧАСТОТА I** / **ЧАСТОТА II** (two fixed magnetron frequencies, anti-jam frequency agility).

### 2.2 Signal/data flow (from Fig. 1-3 + Ch.1 principle)
1. Range block Т-21М1 trigger → transmitter Т-3М1 fires magnetron pulse.
2. HF energy → ferrite switch → waveguide switches **АНТЕННА-ЭКВИВАЛЕНТ** (in ANTENNA) and **ПОИСК-ПЕЛЕНГ** → one of two antenna feeds:
   - **растровая головка** (raster head) = ПОИСК (search) feed;
   - **рупор** (horn) = ПЕЛЕНГ (bearing/tracking) feed.
3. Echo → mixer (+LO) → IF 60 MHz → ПУПЧ (Т-34М) → main amp Т-9М split into **КД** (range channel) + **КУА** (angle channel).
4. КД: in АМПЛИТУДНЫЙ → range block + search indicator; in СДЦ → ЧПК canceller (Т-19М).
5. КУА: in АВТОМАТ → error signal → angular tracking block (СУА).
6. Range channel autodальномер: auto range-track, sends **current range to СРП**, and drives a **two-beam indicator** (coarse + fine range sweeps) with strobe (rectangular pedestal) + visor (two dark marks).
7. АПЧ keeps IF constant by retuning the magnetron via mechanism Т-4М2.
8. In СУА the error signal × ГОН reference splits into **elevation + azimuth** error components → drive the antenna; rotating transformers in the column report **current angular coordinates to СРП**.

### 2.3 Search-indicator picture (Т-28М)
- Sweep = **rectangular raster** with **three scale range lines** + an **angular-position visor** down the middle.
- Echo radius from raster start = **range**; deviation from visor (in НАВЕДЕНИЕ) = target offset from antenna electrical axis in **elevation**.
- Echo appears as: dot or line-segment (length ∝ target size) in НАВЕДЕНИЕ; **solid line across full raster width** in АВТОМАТ.
- **НАВЕДЕНИЕ → АВТОМАТ handoff:** operator first aligns the angular visor with the target mark + coarse-sweep strobe, then aligns the fine-sweep visor with the echo on the range indicator, then engages АВТОМАТ.

---

## 3. TRANSMITTER DETAIL (Ch.2) — for completeness
- **Генератор поджига** (trigger gen, tubes Л3-1/Л3-2): turns the ≥90 V / ≤1.5 µs trigger from Т-21М1 into a clean rectangular gate. Blocking-gen output ~400 V, 2–8 µs, front slope >600 V/µs. Monitor jacks Г3-1 (ЗАПУСК), Г3-2 (ИМПУЛЬС ПОДЖИГА), Г3-3 (НАКАЛ ТГ).
- **Modulator:** 4-stage forming line У3-1, thyratron Л3-3, charging choke Др3-1, charging diodes У3-4 (Д1006 ×6), protective diode У3-3. Resonant charge from +4.5 kV (Т-29М) → output pulse 13.5–15.5 kV (×4). Discharge gap fired by ~650–750 V from C3-14/15/16 divider via Ф3-1.
- **Magnetron МИ-514М1:** anode grounded; cathode pulsed negative. Pulse current 36–40 A. Two fixed frequencies set by **Т-4М2** moving a shток that changes resonator volume. Current read on **ИП37-1 (ТОК ГЕНЕРАТОРА)**. Filament: full V at ≤11 mA / training; reduced to 2 V at ≤30 mA; off at 30–33 mA — relay Р3-1 cuts filament once magnetron current ≥11 mA. **Preheat ≥3 min** before HV (time relay Р27-2). Cooled by fan М3-2 (ribbed anode); modulator cooled by М3-1.

---

## 4. ⭐ ANTENNA / SCAN ENVELOPE (Ch.3, АВС) — HARD LIMITS

- **Search-mode coverage:** **UNLIMITED 360° rotation in azimuth** + beam **scanned in a 15° sector in elevation** (raster head sweeps the beam up/down).
- **Antenna elevation travel:** **−9° to +87°** (mechanical/electrical envelope of the dish).
- **Auto-track mode:** beam does **conical scan** (the bearing/ПЕЛЕНГ feed spins, radiation centre offset **5.4 mm** off-axis, rotating at **3780 rpm**).
- **Beam width (half-power):** **1.5°**.
- **Squint:** axis of the directional pattern is **0.5°** off the antenna electrical axis (conical-scan squint).
- **Search→track turn correction:** because the search raster head is **not** on the antenna axis, when handing off search→auto-track the antenna is **turned ≈ 3.5°** to avoid losing the target.
- Antenna = two-mirror lattice (Cassegrain-type) with **polarization-plane rotation**; spherical mirror + inclined wire grid (λ/4 spacing, wires at 45°) + polarization-filter contrreflector. Block index **Т-81М3**.
- **Two feeds:** search raster head (29 waveguide sections, fed by a spinning horn covering 4 sections at a time, **search motor M1 → 1385 rpm**) = ПОИСК; conical-scan horn (wave H11) = ПЕЛЕНГ. Waveguide switch (electromagnet-driven, remote) selects which feed gets TX power.
- Feed motors both **ДАК8-50/400**.

### 4.1 Waveguide / protection chain (TX↔RX isolation, masking)
- **Ferrite switch (duplexer):** TX→RX isolation ≥ **10 dB**, reverse isolation magnetron↔antenna ≥ **16 dB**, insertion loss ≤ **0.7 dB**, output VSWR (КБВ) ≥ 0.8. Backed by gas discharger **РР-187** to protect RX from the TX pulse.
- **АНТЕННА–ЭКВИВАЛЕНТ switch (rotor pos A = antenna, Н = dummy load):** in position Н, energy leaking to the antenna is **40 dB down** → hidden tuning without radiating. Even so, an ESM receiver of sensitivity 10⁻⁹ W could detect leakage at **≤ 2000 m** — i.e. emission-masking is good but not perfect.
- **ПОИСК–ПЕЛЕНГ switch:** routes TX to search vs bearing feed.
- **УНВТ (hidden-tuning device):** resonator "звон" (ring-down) lets crew tune the HF tract + measure transmitter frequency (via М2-3/1) **without radiating** — covert pre-combat checkout. Max ring-down = correct tuning.
- **Waveguide pressurization ("подкачка"):** flexible waveguide to the column kept at **0.6–1.1 atm** overpressure (auto-maintained by a pump in the rear turret compartment); **manometer is above cabinet Т-44М1, behind the search operator** — a readable gauge the crew watches.

---

## 5. RECEIVER + COHERENT/MTI CHAIN (Ch.4) — game-relevant knobs
- Superheterodyne. **Klystron LO type К-705Р** (reflex), high-Q H011 resonator, tuned by Т-4РМ. IF **60 MHz**.
- ПУПЧ **Т-34М** feeds main amp **Т-9М**: range channel **Т-9/4** (КД) + angle channel **Т-9/3М** (КУА).
- **АРУ/РРУ (AGC/MGC):** auto gain in АВТОМАТ off the selected target's mean level (controls ПУПЧ stages 1/3/4 + first two КУА stages); **manual gain in search via potentiometer R36-1 «УСИЛЕНИЕ ПРИЕМНИКА»** (relay P1 swaps manual↔auto at track handoff). Separate range-channel gains R4 «УСИЛ.КД АМПЛ.» / R5 «УСИЛ.КД СДЦ».
- **КУА tracking strobe:** the final КУА tube is gated open by an **ultra-narrow strobe 0.25 µs** (or a **3.9 µs** strobe) coincident with the selected echo — this is the range gate that picks one target out for angle tracking.
- **СДЦ / coherent channel:** coherent LO (Т-8/2М, phased each pulse) → phase detector → video → ЧПК canceller (Т-19М) rejects fixed clutter, keeps movers. **Clutter-motion compensation** for own-vehicle movement via dual crystal generators; phase rate set by **potentiometer R37-16 «ЧАСТОТА КОМПЕНСАЦИИ»**.
- **АПЧ:** auto-holds IF by retuning the magnetron (mechanism Т-4М2). **Manual override: potentiometer R37-11 «ПОДСТРОЙКА ЧАСТОТЫ»**.

---

## 6. SEARCH SYSTEM + SEARCH SCOPE Т-28М (Ch.5) — operator-rich

The search system **detects targets, gives coarse range, and points the antenna in az/el**. Blocks: search indicator **Т-28М**, azimuth-sweep **Т-53М**, + azimuth & elevation sensors in the antenna column Т-2М2.

### 6.1 Scope picture
- **СЕКТОРНЫЙ ПОИСК / НАВЕДЕНИЕ:** a **rectangular raster** — the long axis = **range sweep**, the short axis = the **elevation beam-nod** (15° elevation scan). Range marks every **5 km**; an **electronic elevation visor** line down the middle; echoes = bright blobs (dot/segment ∝ size).
- **КРУГОВОЙ ПОИСК (accelerated circular search):** relay P28-2 cuts the elevation-deflection currents → the display becomes a **radial-circular (PPI-like) range sweep** rotating synchronously with the spinning antenna (azimuth sensor M2-42 drives sweep rotation).
- **Range scales: 15 km and 20 km**, selected by switch **B28-1 «МАСШТАБ»**. 15 km scale launched directly by the TX trigger; 20 km scale uses a **33.3 µs delay** (= 5 km offset) in U28-10. Range-pulse generator U28-1 width ≈ 100 µs (15 km).
- Strobe marks (U28-11) bracket the fine-range strobe segment that the **range** operator is examining on Т-23М2 — i.e. the two scopes cross-reference.

### 6.2 ⭐ Т-28М front-panel controls (game console parts)
| Control | Function |
|---|---|
| **МАСШТАБ (B28-1)** | range scale **15 km / 20 km** |
| **ЯРКОСТЬ (R28-3)** | CRT brightness |
| **ФОКУС (R28-39)** | beam focus |
| **ЦЕНТРОВКА (R28-22, R28-32)** | sweep centering (X/Y) |
| **AMPL. РАЗВ.** | sweep amplitude (azimuth raster size) |
| **ДЛИТЕЛЬНОСТЬ (R5)** | sync/pulse-length trim |

### 6.3 ⭐ Operator-panel pots (search + range stations)
- **УСИЛЕНИЕ ПРИЕМНИКА (R36-1)** — manual receiver gain, on the **search operator's panel** (used in search; auto-AGC takes over in АВТОМАТ).
- **ЧАСТОТА КОМПЕНСАЦИИ (R37-16)** — MTI clutter-compensation rate (own-vehicle motion), operator panel.
- **ПОДСТРОЙКА ЧАСТОТЫ (R37-11)** — manual magnetron freq tune.
- **УРОВЕНЬ КОГ. НАПР. (R28)** / **УРОВЕНЬ СИГН. СДЦ (R33)** — coherent-voltage & MTI signal levels (in Т-9М).
- Mixer/IF currents read on **ИП37-2** (range operator's panel) and **ИП37-1 «ТОК ГЕНЕРАТОРА»** (magnetron current).

### 6.4 ⭐ Range gate / target-selection mechanic
The КУА angle channel's last tube is gated open by a **0.25 µs ultra-narrow strobe (УУС)** or a **3.9 µs strobe** coincident with the chosen echo — this is the **range gate** that isolates ONE target for angle-tracking; without a strobe the tube is held off (−10 V). So: operator slides the range strobe onto the target, then the radar locks angle to whatever is in that gate.

### 6.5 АПЧ / anti-jam frequency agility
- **Anti-jam:** against active noise jamming, the crew can **manually retune** both the magnetron AND the klystron resonator (ЧАСТОТА I / ЧАСТОТА II via Т-4РМ handle, positions f1/f2).
- АПЧ is search-free electromechanical, holds lock for frequency drift ≤ **±17 MHz** of nominal; visual drift read on the Т-4М2 scale.

---

## 7. ⭐ RANGE SYSTEM + GUNNER/RANGE STATION (Ch.6) — the heart of the gun-laying loop

Range system measures **slant range to target**, feeds it continuously to the **СРП**, and time-synchronizes everything (TX, RX, ЧПК, search). Blocks: range **Т-21М1**, range-mechanism **Т-22М1**, range indicator **Т-23М2** (+ service scope Т-23А).

It generates: TX trigger; КУА gating strobes (**СТРОБ II** and **УУС**); envelope-detector reset; search-system trigger; movable **СТРОБ I**; movable range pulse for ЧПК; ЧПК trigger; training (ТРУ) trigger; T-71 trigger.

### 7.1 ⭐ Range tracking = split-gate (полустроб) tracker
- The crew slews a **movable strobe** in range; its time position vs the TX pulse = measured range. The **range handwheel (штурвал дальности) → range potentiometer (Т-22М1) → coarse-delay generator U21-5** sets the strobe time.
- Fine tracking uses **two half-strobes ПОЛУСТРОБ I / ПОЛУСТРОБ II**; their junction (rear edge of #1 / front edge of #2) is centred on the echo by a temporal discriminator U21-14 → error → servo. Classic early/late split-gate.
- **Autodальномер modes: manual or automatic**, selected by **buttons on the Т-55М1 control handles** (press **АВТ.** + align the fine visor on the target → auto range-lock). Even in auto-track, the operator can **aid** the gate with the handwheel against jamming/weak signals without dropping to manual.
- **Range handwheel: two rates — 400 m/turn and 2500 m/turn** (2500 for fast slewing). Friction brake; microswitches at the scale ends cut the 400 Hz drive and **auto-engage the СРП systems**.
- **Inductive phase-shifter ФВ22-1:** 1 rotor turn = 360° phase = **1000 m** of range-scale movement; rotor axis tied to the range pot.
- Range data crosses to the СРП continuously; a microswitch in Т-22М1 **auto-switches on the СРП systems** at handwheel limits.

### 7.2 ⭐ Range indicator Т-23М2 (two-beam scope, type 10ЛО43И)
- **Two stacked sweeps:** upper = **coarse range sweep** (target blips + coarse visor); lower = **fine range sweep** with a **fine visor = two dark marks 0.4 µs apart (an "A"/notch)** that the operator centres on the echo.
- Mode switch **B23-1: РАБОТА (I, combat) / КАЛИБРОВКА (II) / ОСЦИЛЛОГРАФ (III)**. In КАЛИБРОВКА a 600 kHz sine (3.5–4 periods) is shown to calibrate the phase-shifter bridge. In ОСЦИЛЛОГРАФ it pairs with service scope Т-23А.
- **Т-23М2 front-panel controls:** B23-1 (РОД РАБОТЫ), **ВЕРТИК.СМЕЩ. I/II**, **ГОРИЗ.СМЕЩ. I/II**, **ЯРКОСТЬ I/II**, **ФОКУС I/II**, **АСТИГМАТИЗМ** (one set per beam). Two big side handles.

### 7.3 ⭐ Range-mechanism Т-22М1 controls
- Switch **РАБОТА – БАЛАНС ДМ – БАЛАНС УПТ**; **range handwheel**; **УСТАНОВКА НУЛЯ** (phase-shifter zero worm); trims **НАЧАЛО, КОНЕЦ, УСИЛЕНИЕ, ОБР.СВЯЗЬ, СИММЕТР. ТОЧНО, СИММЕТР. ГРУБО, БАЛАНС ДМ, БАЛАНС УПТ**; range scales (coarse + fine read-out windows); jacks ВХОД СО / УПР.ОБМОТКА / КОРПУС.

### 7.4 ⭐ Operator picks the angle-gate width
The operator selects **СТРОБ II (3.9 µs)** or **УУС (0.25 µs ultra-narrow)** to strobe the receiver's КУА (angle) channel — a precision/robustness trade the gunner controls.

### 7.5 Range-channel timing facts
- Master timing from a **150 kHz quartz oscillator (U23-7)**; calibrator 600 kHz (4th harmonic).
- In amplitude mode (non-synchronous trigger I from Т-17М vs quartz) there is a residual PRF jitter of **±6.7 µs**.
- Trigger II delayed **13.5 µs**; transmitter trigger pulse derived after a 28–31 µs select.
- Range scales **15 km / 20 km** (switch B28-1 МАСШТАБ); 20 km uses a 33.3 µs (5 km) added delay.

### 7.6 Service scope Т-23А (admin/diagnostics)
For fault-finding all РПК systems on the Т-23М2 screen. Sees pulses 0.5–200 V, 0.2–500 µs; sine ≥2 mV at 50–500 Hz; amplitude measure ±20%; vertical bandwidth ≥2 MHz (1:1); min sync 4 V. Controls: РОД РАБОТЫ (amplitude ranges 5/15/30/50/150/500 V), РЕЖИМ УСИЛ. (1:1 / 1:10 / 1:100), КАЛИБРОВКА, АМПЛ.РАЗВ., СИНХР., УСИЛЕНИЕ, ВХОД УСИЛ., АНОД., СЕТЬ. — a believable "admin viewer" console.

---

## 8. ⭐⭐ ANTENNA-CONTROL SYSTEM (СУА, Ch.7) — data path, drives, LIMITS & INTERLOCKS

This is the radar→laying loop. Blocks: angular-tracking **Т-13М2**, control unit **Т-55М1** (the joystick console), antenna column **Т-2М2** + a scale sельсин-indicator on the search operator's panel.

### 8.1 СУА operating modes (7 of them)
1. **Ручное управление** (manual)
2. **Полуавтоматическое управление** (semi-auto)
3. **Круговой поиск** (circular search)
4. **Ускоренный круговой поиск** (accelerated circular search)
5. **Секторный поиск** (sector search)
6. **Автоматическое сопровождение** (auto-tracking)
7. **Полуавтоматическое сопровождение по визирному устройству** (semi-auto track on optical sight)

### 8.2 ⭐ Drive train & data path (radar → turret/gun motion)
- In **every** mode the antenna is driven in az + el by **two magnetic-powder-clutch (магнитопорошковая муфта) drives** (3-phase async motor + reducer + clutch). Clutches are **non-reversible**, so each axis has **TWO clutches** (CW + CCW) — direction = which clutch is energised.
- **Т-13М2** outputs DC to the clutch windings; **magnitude = antenna slew speed, polarity = direction**, derived from error-signal amplitude + its phase vs reference.
- Auto-track error comes from **conical scan**: beam axis is squinted **30′ (0.5°)** off the electrical axis; an off-axis target amplitude-modulates the echo at the scan rate; envelope amplitude = angular miss, envelope phase = az/el direction. БАРУ (fast AGC) normalises it, a resonant amp pulls the **first harmonic at the scan frequency**, and az/el phase-sensitive rectifiers (ФЧВ, referenced to ГОН) split it into az + el error → clutches → antenna chases the target until error = 0.
- Current az/el angles are taken off **rotating transformers in Т-2М2** and sent to the **СРП** (M2-7 az, M2-8 el) and to the visir-coordinate converter **ВПК** — the СРП then computes the gun lead. (The radar/СУА lays the *antenna*; the СРП/gun-drive lays the *guns* off these synchro angles — see cross-refs.)
- Tachogenerators (M24 az, M23/M29 el) give velocity feedback to damp the loop.

### 8.3 ⭐⭐ LAYING / SCAN LIMITS (exact)
| Limit | Value |
|---|---|
| **Antenna elevation (mechanical)** | **−9° … +87°** |
| **Semi-auto elevation travel** | **−1-50 … +14-50 д.у. (mils)** ≈ **−8.4° … +81.6°** |
| **Azimuth** | **unlimited 360°** (semi-auto / circular) |
| **Manual mode azimuth swing** (handle centre→extreme) | only **≥18°** — bigger moves require semi-auto |
| **Sector search width** | **30° … 100°** (knob ШИРИНА СЕКТОРА), constant **20°/s** at any width |
| **Accelerated circular search rate** | **≈ 45–60°/s** |
| **Circular search rate** (normal) | semi-auto constant speed (pot АЗИМУТ ПОЛУАВТ.ПОСТ.СКОР., R24) |
| **Conical-scan squint** | **30′ (0.5°)** |
| **Search→auto-track antenna pre-turn (доворот)** | **3.7°** (sельсин M2-43 stator offset; Ch.3 quoted ≈3.5°) |
| **Handle mechanical travel** | azimuth handles **±40°**, elevation handles **±47°** |

### 8.4 ⭐⭐ ELECTRONIC INTERLOCKS / FORBIDDEN STATES
1. **FIRE↔COOLING INTERLOCK:** the **fire button "0" (огонь)** and barrel-**cooling button ОХЛАЖДЕНИЕ** are on the control handles; the firing circuit is wired through the cooling circuit — **you cannot open fire until barrel cooling is switched on.**
2. **DRIVE-ENABLE INTERLOCK:** the antenna drive motors (M18/M21/M19, fed 220 V 400 Hz via toggles ПИТАНИЕ ДВИГАТ. Δq / β,ε,Δε) **energise only when the antenna is fully RAISED and the stopper (стопор 5) is at РАССТОП.** Antenna down/stowed = no radar slew.
3. **ELEVATION LIMITER:** a mechanical **ограничитель по углу места reverses the antenna** at the elevation extreme (hard stop at the −9/+87 envelope).
4. **STOW SEQUENCE / TRAVEL LOCK:** to stow, drive elevation to **lamp НОЛЬ ε (L1)** lit + align index marks, then azimuth to **30-00**, stopper 5 → ЗАСТОП, locks engage (lamp АНТЕННА ЗАСТОПОРЕНА). Travel position is azimuth 30-00, antenna locked.
5. **RANGE-HANDWHEEL END INTERLOCK:** at the range-scale ends a microswitch cuts the 400 Hz drive; a second microswitch **auto-switches the СРП systems on**.
6. **AZIMUTH ROLLBACK (механическая обкатка):** the antenna can be **counter-rotated against turret rotation by the same angle** to hold a fixed azimuth in space independent of the hull/turret — a space-stabilisation feature.

### 8.5 ⭐ Т-55М1 control console (the gunner's joystick unit) — every control
- **Control handles** with thumb/finger buttons: **"0" (FIRE)**, **ОХЛАЖДЕНИЕ (barrel cooling)**, **АВТ. (engage auto-track)**, **НАВЕДЕНИЕ (drop auto/search → manual)**.
- Two pull-toward levers for variable-speed semi-auto: **ПОЛУАВТ.АЗ** (left, azimuth), **ПОЛУАВТ.УМ** (right, elevation).
- Knob **ШИРИНА СЕКТОРА** (sector width 30–100°).
- Push-buttons **ПОИСК-КРУГОВОЙ**, **ПОИСК-СЕКТОРНЫЙ**.
- Toggles: **I РЕЖИМ – II РЕЖИМ** (freq channel I/II), **ПЕЛЕНГ – ПОИСК** (track-feed vs search-feed), **ПОЛУАВТОМАТ – АВТОМАТ.Г.П.**, **КРУГОВОЙ – УСКОР.КРУГ**.
- Handle latch/lever to secure handles in combat vs travel position.
- Manual-gain pot **АЗИМУТ УСИЛЕНИЕ РУЧНОЕ (R6)**, semi-auto-speed pot **АЗИМУТ ПОЛУАВТ.ПОСТ.СКОР. (R24)**.

### 8.6 ⭐ Т-13М2 front panel (angle-tracking block)
Mode switch **РАБОТА / А3 / БАЛАНС УПТ / УМ / АЗ-УМ / НАЧ.ТОКИ I / НАЧ.ТОКИ II**; meter **ИП1**; pots **АЗИМУТ БАЛАНС УПТ (R12)**, **АЗИМУТ НАЧ.ТОКИ (R13)** (set 4.5–7 mA), **АЗИМУТ/УГОЛ МЕСТА УСИЛ.АВТ. (R5/R6)**, **ОБР.СВЯЗЬ**, **ЧАСТОТА (R5, scan-freq tune)**; jacks АЗИМУТ ВХОД РУ, УГОЛ МЕСТА ВХОД РУ, АЗИМУТ ГОН, +150/-250/+250 monitor.

### 8.7 Т-2М2 antenna column — auxiliary synchros / lamps
Toggles **ПИТАНИЕ ДВИГАТ. Δq (B2)**, **ПИТАНИЕ ДВИГАТ. β,ε,Δε (B4)**; toggle ВКЛ.ВПК; stopper 5 (ЗАСТОП/РАССТОП); lift-reducer control panel; lamps **АНТЕННА ЗАСТОПОРЕНА (L4)**, **АНТЕННА ОПУЩЕНА (L3)**, **НОЛЬ ε (L1)**, **АНТЕННА ПОДНЯТА (L2)**. Many rotating transformers: M2-7/M2-8 (coords→СРП), M2-3/M2-4 (error→ТРУ trainer), M2-32/M2-33 (synchro-датчики), M2-35 (target-designation), M2-36/M2-37 (→КПН commander's sight), M2-42 (search-display sync), M2-43 (search→track доворот), M2-9/M2-10/M2-14/M2-15 (→ВПК).

---

## 9. ⭐ MTI / СДЦ / ЧПК + JAMMING MODES (Ch.8) — clutter & ECCM

- **СДЦ (moving-target selection)** protects the range channel from **passive (clutter) jamming**. Uses the КД phase detector (Т-9/4), coherent LO (Т-8/2М, own-motion compensated), and the **ЧПК (period-to-period cancellation)** chain: blocks **Т-17М, Т-18М, Т-19М** (Т-19М = the canceller).
- ЧПК does **double period-to-period subtraction** using **потенциалоскопы** (storage CRTs). Fixed echoes (constant amplitude per period) cancel; movers (Doppler-modulated) survive. T-19M switches: **B19-1 РАБОТА/КОНТРОЛЬ**, **B19-2 РАБОТА / ПОТЕНЦИАЛОСКОПЫ I / II**.
- **BLIND SPEEDS («слепые» скорости):** at certain target radial speeds the MTI cancels the target too → defeated by **ВОБУЛЯЦИЯ (PRF jitter)**.
- **ВОБУЛЯЦИЯ (PRF wobbulation):** in mode ВЧП the PRF sweeps **3650 → 4750 Hz on a 250 Hz, 30 V sawtooth law** (block Т-17М gen U17-1/U17-2). Enabled by **toggle ВОБУЛЯЦИЯ on the flip-panel of cabinet Т-37М2** (relay P17-1).
  - **Anti-repeater-jam:** with PRF jitter, false blips from a multiple/anticipating **repeater jammer are SMEARED/blurred on both scopes** (Т-23М2 range + Т-28М search) — real targets stay sharp. Big game tell.
- **Frequency agility ЧАСТОТА I / II** (Т-55М1 I/II РЕЖИМ toggle) + manual magnetron+klystron retune = anti-noise-jam.

### 9.1 Extra laying/stow facts (Ch.7 kinematics)
- 1 full antenna turn = **6000 д.у. (mils)** — standard Soviet 6000-mil circle (az/el read in mils on coarse+fine scales).
- Antenna stopper positions: azimuth **00-00 and 30-00**; **lowering is blocked except at 30-00** (microswitch behind the stopper handle) — stow only pointing aft.
- Indirect stabilisation: the **electrical axis** is stabilised (not the platform); косвенная stabilisation off hull roll/pitch via the differentials and ВПК.
- Mirror-firing toggle **ЗЕРК.СТРЕЛЬБА (toggle 10, normally ВЫКЛ, sealed)** on the column connector panel — tied to the azimuth-rollback/space-stabilise mode.
- Elevation travel hard-limited by stops (упоры 4) + microswitches 15 (down) / 17 (up); microswitch 16 enables lowering only at the right elevation.
- Lamp **АНТЕННА ПОДНЯТА** on the lift-control panel when raised/stowed-locked.

---

## 10. ⭐ POWER, WARM-UP & TURN-ON SEQUENCE (Ch.9-10) — interlocks

### 10.1 Supply rails (secondary-power blocks Т-10М/Т-20М/Т-24М/Т-27М1/Т-29М/Т-52М1/Т-54М/Т-59)
- Fed from the ЗСУ: **3-phase 220 V / 400 Hz + ±27 V** via the distribution panel → cabinet **Т-44М1**.
- Generates stabilised **+75/−75/+120/+150/−150/+250/−250/+350/−370/−2000 V**, unstabilised **±6.3/+400/−700/+1200/+4500/+6500 V**, + stabilised AC 220 V 400 Hz.
- Total draw: **≤ 10.5 kVA AC, ≤ 1 kW at 27 V DC**.
- **Т-29М** = the **+4500 V** (190 mA) modulator HV (adjustable +2200…+4700 V); **range operator sets it via pot «РЕГУЛИР. ТОКА ГЕНЕР.»** → controls magnetron current. Has a mechanical discharger РИ29-1 (lethal HV).
- **Т-59** has a **СТАБ.–НЕСТАБ.** toggle = redundant 220 V 400 Hz source.

### 10.2 ⭐ Turn-on sequence (the crew ritual)
1. **НАКАЛ (filament)** — switch B37-2 (Т-37М1 range-op panel) → lamp ЛН37-5, contactor Р44-4 closes → 220 V(II/III) + 27 V to all RLS blocks + fans; the **RLS run-time counter ИП44-1** starts.
2. **Magnetron warm-up: a time relay (Р27-2, ЭМРВ-27Б, in Т-27М1) trips after 3 min ± 20 s** → lights the "ready for anode" lamp (ЛН37-6) at the range-op panel.
   - **Bypass: button «ГОТОВНОСТЬ АВАРИЙНО» on Т-27М1** skips the 3-min wait (emergency).
3. **АНОДНОЕ (anode)** — switch → contactor in Т-44М1 → anode rectifiers on.
4. **ВЫСОКОЕ (high voltage)** — button → HV to Т-29М (magnetron live).
   - **Power-down is the reverse order.**
- **Interlock:** if the −150 V rail is bad, relay Р10-1 (Т-10М) keeps +27 V off the АНОДНОЕ switch → anode circuit stays open (won't power up on a fault).

### 10.3 Operator stations (Ch.10)
- Two main consoles: **search-operator panel** (flip-panel of cabinet **Т-36М**) and **range-operator panel** (flip-panel of cabinet **Т-37М1**). Plus the controls on Т-2М2, Т-13М2, Т-27М1, Т-28М, Т-35М1, Т-44М1, Т-52М1, Т-54М, Т-55М1.
- **Range-op panel** carries: RLS on/off, magnetron-current set+monitor (ИП37-1 ТОК ГЕНЕРАТОРА), mixer-current monitor (ИП37-2), РЕГУЛИР. ТОКА ГЕНЕР., ready/anode lamps, НАКАЛ/АНОДНОЕ/ВЫСОКОЕ switches, range handwheel (Т-23М2/Т-22М1 sit here too).
- **Search-op panel** carries: receiver-gain (R36-1 УСИЛЕНИЕ ПРИЕМНИКА), search-scope Т-28М controls, antenna joystick console Т-55М1 (handles), waveguide-pressure manometer above Т-44М1.

### 10.4 ЧПК block Т-19М front panel (potentiometer/MTI tuning, viewer windows)
Two **потенциалоскоп window-scopes** + B19-1 РАБОТА/КОНТРОЛЬ, B19-2 РАБОТА/ПОТЕНЦИАЛОСКОПЫ I/II, pots **ТОК ЛУЧА I/II, ФОКУС I/II, АНОДН./СЕТОЧНОЕ НАПР. I/II, УСИЛЕНИЕ ВЧ I/II, АМПЛ.ОПОРН.НАПР. I/II**; jacks ТОК КОЛ. I/II (2–10 µA), ВХОД/ВЫХОД СИГН. (Т-18М sweep block: B18-1 НЕПРЕР./ПАЧКИ, АМПЛ.РАЗВ I/II, ГОРИЗ/ВЕРТ.СМЕЩ I/II).

---

(continuing through remaining pages…)
