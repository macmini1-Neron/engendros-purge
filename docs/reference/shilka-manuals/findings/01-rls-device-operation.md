# Extract — «Устройство и эксплуатация ЗСУ-23-4М РПК-2М. Часть 1. Устройство РЛС 1РЛ33М3»

> Source PDF: `01-rls-device-operation-part1-text.pdf` (149 pp). Authors: Моторин А.Н., Целебровский А.И., Зарывалов Д.В., Ленский В.Н., Калмыков Ю.А. — Tomsk Polytechnic University, 2005, 150 pp. Teaching manual for military specialty 042100.
> This is **Part 1 — construction of the radar set 1РЛ33М3** (the "Тобол" / РПК-2М radar instrument complex aboard the ЗСУ-23-4М «Shilka»). Diagrams live in a separate "Альбом рисунков" (figure album).
> NOTE: numbers below are read directly off the rendered scanned pages (OCR layer is garbled). Page numbers cited are the manual's printed page numbers.

---

## 1. SCOPE & IDENTITY

- **Object:** ЗСУ-23-4М «Shilka» self-propelled AA gun. The **РПК-2М** ("радиолокационный приборный комплекс" / radar instrument complex) is the fire-control suite; its sensor is the **РЛС 1РЛ33М3** (radar station). The complex is informally «Тобол».
- **РПК-2М purpose (p.8):** controls fire when the ZSU works in its **first three modes** — search, detection and tracking of a target by angular coordinates and range, and output of control signals proportional to the **full laying angles** to the power drives, to lay the gun at the **lead (predicted) point** of the target.
- **РПК-2М composition (Fig.2, p.8):**
  1. radar station **1РЛ33М3**
  2. sighting device **Б-7** (визирное устройство, panoramic, two optical heads)
  3. commander's aiming device **КПН** (командирский прибор наведения)
  4. counting/solving device (analog fire-control computer) **СРП Б-1** (счётно-решающий прибор)
  5. line-of-sight & line-of-fire **stabilization systems**
  6. ventilation system **1А7М-С6.2005**
  7. transformer block **Б-6В**
  8. IFF apparatus **1РЛ251** (аппаратура опознавания, "СВОЙ-ЧУЖОЙ")
- **СРП Б-1 (analog computer):** solves the shell-meets-target problem and produces the lead coordinates of the target.
- **Stabilization (p.8–9):**
  - **Line-of-sight stabilization** keeps the **electric axis of the radar antenna** pointed at the target during ZSU motion. Contains: gyro-azimuth-horizon **ГАГ Б-4** with fuse block **Б-9** (shared by ВПК and ОПК); sight coordinate converter **ВПК Б-2М**; reduction gear обкатки **Б-3**.
  - **Line-of-fire stabilization** keeps the **gun-barrel axes** fixed. Contains: gun coordinate converter **ОПК** with converter block **Б-5**.
  - **ГАГ** measures current longitudinal **ψ** and lateral **θк** rocking (tilt) angles and the course angle **K** of the vehicle. **ВПК** produces correction **Δq** (course angle of target) and **Δε** (elevation). **ОПК** produces the **full horizontal Q** and **full vertical Ф** gun-laying angles.
- **Sighting device Б-7 (panoramic, p.9):** two independent optical systems.
  - **Main sight = LEFT head:** observation of target during radar work; measures angular coordinates of the target if the radar's angular auto-track fails (mode 2). Its **optical axis is matched (boresighted) to the antenna's electric axis** — so a radar-tracked target is visible through the left head, and centering the left-head reticle on a target means the antenna electric axis is also on the target.
  - **Backup sight (прицел-дублер) = RIGHT head:** lays the gun for air targets without РПК (mode 4) and for ground targets (mode 5).
- **Power into the РПК:** transformer block **Б-6В** (rear of turret) converts **220 V → 110 V and 115 V** AC. The **115 V** also feeds the power laying drives. Components mount in separate cabinets/cases on metal-rubber shock absorbers in the turret, interconnected by a cable system.

### Coordinate-system & angle notation (p.9–11)
- `D, Dу, Dф` = current / lead / fictitious slant range; `d, dу, dф` = same horizontal ranges.
- `β` azimuth of target; `ε` elevation of target; `q` course angle; `K` vehicle course angle (rysканье = yaw); `βу` lead azimuth; `φ` elevation (угол возвышения) of line of fire; `qу` lead course angle.
- Non-stabilized: `qнс`, `εнс`; `ψ` "галопирование" (pitch); `θк` "потаптывание" (roll/lateral tilt); `Q` full horizontal laying angle; `Ф` full vertical laying angle.
- `ΔX, ΔY, ΔH` lead corrections; `ΔH'` ballistic-drop correction; `Vц, Vx, Vy, Vz` target velocity vector & projections; `Tу` lead time; `α` aiming angle.

### The five combat-work modes (p.11–14) — central to gameplay
1. **First (main) mode — full radar auto-track.** SID generates launch pulses → transmitter, search system, MTI. Transmitter radiates a narrow beam; the search operator drives the antenna in azimuth/elevation via the СУА. Reflected video → SID → search system in **amplitude** mode or via **СДЦ (MTI)**. Angular-automation channel (КУА) is **closed**. Search operator manually points antenna on the target on the search indicator; range operator aligns electric markers on the fine-range scope; then the search operator presses **«Автомат»** → КУА **opens** and the СУА auto-tracks angularly; SID auto-tracks in range. Current `β, ε, D` → СРП → solves meeting problem → `φ` & lead azimuth `βу` → ОПК → full `Q, Ф` → gun power drives (ГПГН horizontal, ГПВН vertical).
2. **Second (auxiliary) mode — optical angles + radar range.** Used when the СУА is unserviceable or jammed. Angular coordinates from the **left optical head**; range still from the radar. Operator continuously points the antenna with the sight handles; radar keeps measuring slant range.
3. **Third mode — «по запомненным установкам» (ЗУ / memorized settings).** Used under threat of losing the target during auto-track (jamming, high angular rate, malfunction). Radar **disconnected from СРП**; lead coords computed from memorized current-coord values & their rates. **Pre-condition: РПК must have run ≥5 s in mode 1 or 2** so smoothed `X,Y,Z` and `Vx,Vy,Vz` exist; **work time in mode 3 limited to 8–10 s** (after which lead-point error grows and fire is ineffective).
4. **Fourth mode — air target on backup sight (прицел-дублер).** Used when РЛС / СРП / stabilization fail. **Fire only from a halt, vehicle tilt ≤ 3–5°.** Detect & track via backup sight; lay by power drives in **semi-automatic** mode; leads entered via **ракурсные кольца** (aspect rings) of the backup sight; semi-auto hydro-drive control by the antenna-control block handles.
5. **Fifth mode — ground target on backup sight, from a halt.** Lay the gun via the **dist. (range) grid** of the backup sight, by power drives (semi-auto) or **manual-laying drives**.

### Safety (p.14)
- **Lethal HV** in HV-rectifier blocks **Т-54М, Т-52М1, Т-29М, Т-59**, transmitter **Т-3М1**, CRT blocks **Т-19М, Т-23М2, Т-2М**, blocks **Т-7М3, Т-48**.
- Do **not** turn on the РПК with ventilation faulty (overheat). Never substitute fuses with higher-rated ones. One-hand rule with energized blocks. Goggles when changing CRTs.
- **Radiation hazard with transmitter on:** no personnel in the **main-beam direction within 80 m** of the ZSU; only brief presence (≤20 min/day) in a **±45° sector** at **>25 m**; use protective means when working in the beam sector or near the antenna; crew medicals ≥2×/yr.

---

## 2. ⭐ RADAR 1РЛ33М3 — OPERATING ENVELOPE & DEPTH

### 2.1 Top-level RLS tactical-technical characteristics (p.15–16)
| Parameter | Value |
|---|---|
| Purpose | detect high-speed low-flying targets, fix coords of a chosen target, feed СРП |
| Detection range, MiG-17, automatic sector search | **≥ 12 000 m** |
| Auto-track range, MiG-17 (dead zone 200 m) | **≥ 10 000 m** |
| Accuracy at auto-track — range | **10 m** |
| Accuracy at auto-track — angular | **0-00.6** (≈0.6 d-mil ≈ 0.036°) |
| Range resolution at auto-track | **75 m** |
| Carrier-frequency band | **15 000 MHz** (≈2 cm / Ku-band) |
| Intermediate frequency | **60 MHz** |
| PRF — constant (штатный) mode | **4750 Hz** |
| PRF — variable «Вобуляция» mode | **4750 ↔ 3650 Hz** |
| Transmitter pulse power | **≥ 90 kW** |
| Scanning frequency | **63 Hz** |
| Supply / consumed power | AC **220 V, 400 Hz**, **≤ 10.5 kW** |
| Continuous-work time | **8 h** |

### 2.1.1 RLS systems (9) (p.16)
1. Transmitting system (ПРДС) · 2. Antenna-waveguide system (АВС) · 3. Receiving system (ПРС) · 4. Search system (СП) · 5. Range-measuring system (СИД) · 6. Antenna-control system (СУА) · 7. MTI system (ССДЦ) · 8. Secondary power-supply system (СВИП) · 9. Ventilation system (СВ).

- Boot order (p.16–17): on first+secondary power → **СДЦ generates primary sync pulses = launch pulses И1 (ИЗИ)** → **СИД** makes a family of timing pulses syncing all systems. SID pulses launch the **transmitter** and the sweeps on the **range indicator (Т-23М2)**, **search indicator (Т-28М)**, and the **MTI potentialoscopes (Т-19М)**.

### 2.2 Transmitting system (ПРДС) (p.18–22)
- Pulse duration **~0.2 µs**; carrier **fн = 15 000 MHz**; PRF штат **4750 Hz** / вобуляция **3650–4750 Hz**; pulse power **Pи = 90–120 kW**.
- Blocks: transmitter **Т-3М1** (in cabinet Т-44М), HV rectifier **Т-29М** (cabinet Т-43М), tuning mechanism **Т-4М2**.
- Functional chain: **ignition generator** (amp L3-1 + blocking-gen + cathode follower L3-2) → **modulator** [forming line U3-1; thyratron **L3-3 type ТГИ2-260/12**; charging choke Др3-1; 6× protective diodes Д1006; 6× charging diodes Д1006] → **magnetron L3-4 type МИ-514М1** → tuning mechanism Т-4М2; HV rectifier **4.5 kV** (Т-29М).
- Starts on **«НАКАЛ, АНОДНОЕ» toggles + «ВЫСОКОЕ» button** at the **range operator's panel**. Supplies: −150 V, +250 V, +400 V, +1200 V (blocks Т-24М, Т-20М, Т-59); 220 V 400 Hz; launch pulses **ИЗП** from range block Т-21М1.
- Forming line charges to **~9 kV (= 2·E₀)** at instant t1 (t1 set = min PRF period). **Ignition pulse:** front steepness **>600 V/µs**, duration **2–8 µs**, amplitude **~400 V**. **Magnetron cathode pulse:** negative rectangular, **0.2 µs**, amplitude **13.5–15.5 kV**.
- Magnetron oscillates on **two fixed frequencies**, set by the Т-4М2 tuning mechanism (anti-jam frequency hop). Magnetron current readable on **ИП37-1 «ТОК ГЕНЕРАТОРА»** (in the 4th-stage charge circuit). Protective diodes prevent line over-voltage if the magnetron breaks down.

### 2.2.2 Transmitter controls / monitors / protections (p.21–23)
- **ИП37-1 «ТОК ГЕНЕРАТОРА–ТОК ВЫПРЯМИТЕЛЯ»** — milliammeter, magnetron (generator) current or HV-rectifier current; scale in generator-current divisions.
- **Toggle В37-14 «ТОК ГЕНЕРАТОРА–ТОК ВЫПРЯМИТЕЛЯ»** — selects which current ИП37-1 reads. Initial = «ТОК ГЕНЕРАТОРА».
- **Potentiometer R37-18 «РЕГУЛИРОВКА ТОКА ГЕНЕРАТОРА»** — sets magnetron current via HV-rectifier output (changes bias on choke Др29-1 ⇒ changes modulator pulse amplitude ⇒ magnetron current). **Initial = full left = 5 mA.** Normal working current **25–33 mA** (exact value per station formular).
- **Toggle В44-1 «РАБОТА I – РАБОТА II – ТРЕНИРОВКА»** — switches magnetron-cathode heating to prevent cathode overheating from electron back-bombardment. Heating: **РАБОТА I = 0 V**, **РАБОТА II = 2 V**, **ТРЕНИРОВКА = 6.3 V** added (initial cathode heating 6.3 V). Relay Р3-1 opens when set current reached. Use **РАБОТА I** for generator currents **>30 mA**, **РАБОТА II** for **≤30 mA**, **ТРЕНИРОВКА** for magnetron training.
- **Tuning mechanism Т-4М2** — manual magnetron frequency retune; switch to the other working frequency when the enemy sets frequency-aimed active noise jamming. Fixed frequencies set by sleeves + clamp.
- **Control sockets:** Г3-1 «ЗАПУСК», Г3-2 «ИМПУЛЬС ПОДЖИГА», Г3-3 «НАКАЛ ТГИ».
- **Interlock В44-2** — kills HV-rectifier power when the **right cover of cabinet Т-44М1 is open** (+27 V relay Р44-1 drops, breaking 220 V/400 Hz to Т-29М). **Safety interlock.**

### 2.3 ⭐ Antenna-waveguide system (АВС) — antenna geometry, scan, beam (p.23–29)
| АВС parameter | Value |
|---|---|
| Traveling-wave coefficient (КБВ) | **0.8** |
| Antenna beamwidth (ДНА) | **1.5°** |
| Antenna gain | **9000** |
| Side-lobe level | **4–7 %** |
| Elevation sector at raster scan of beam | **15°** |
| Beam-swing frequency at raster scan | **23 Hz** |
| Conical-scan frequency | **63 Hz** |
| **Antenna elevation rotation limits** | **−9° … +87°** |

- **Antenna = two-mirror lattice (reflector) system** (parts 14,15) with **TWO illuminators (feeds):**
  - **Search illuminator (13):** beam **raster-scans in elevation over a 15° sector at 23 Hz** (swung by rotating the search feed horn). Used to **find** the target.
  - **Peleng/bearing illuminator (12):** **conical scan at 63 Hz** (spun by dedicated electric motors). Used for **angular tracking** — when the target is off the equal-signal (boresight) direction, the echo envelope is modulated at **63 Hz**; its **phase = direction of offset**, **amplitude = magnitude of offset**. (Exception: a hovering helicopter adds Doppler from rotor/turbine.)
  - Feed selection by waveguide switch **«ПОИСК-ПЕЛЕНГ» (10)**.
- **Waveguide device:** waveguide w/ pumping, **АПЧ responder**, **ferrite antenna switch (3)** (T/R duplexer, isolation **≥10 dB**, loss ≤0.3 dB per plate; backed by **discharger РР-187** protecting the receiver), **«АНТЕННА-НАГРУЗКА» switch (4)**, **waveguide measuring section (5)**, **flexible waveguide (6)** (protects tract during ZSU motion), **azimuth (7)** & **elevation (9) rotating transitions**, **rotary joint (8)** (походное↔боевое stow/deploy).
- **Covert-tuning device (устройство скрытой настройки):** responder (17), antenna equivalent (18), volume resonator (16), detector section (22), absorber (21). Air pump keeps **0.6–1.1 atm** excess pressure in the waveguide tract (manometer-monitored) to keep dust/moisture off the magnetron.
- **Echo-signal:** delayed by t_z ∝ range; amplitude falls with range; carrier shifted by Doppler **F_dn** (+ approaching / − receding; zero if stationary).

#### Covert-tuning mode (скрытая настройка, p.28)
- Switch **«АНТЕННА-НАГРУЗКА» → «Н»**: magnetron energy goes to the equivalent (dissipated as heat) and to the resonator; the resonator's response — **"звон" (ringing)** — returns to the receiver. **Correct tuning = maximum "звон" length** on the indicator screens. Used to tune & measure transmitter frequency **without radiating** (using device M2-3/1).

#### АВС controls (p.28–29)
1. **«АНТЕННА-НАГРУЗКА»** switch (90° rotation), initial **«А»** (antenna); **«Н»** = load/covert-tune.
2. Measuring-section socket — connect **M2-3/1** to read passing power.
3. **«ГДР»** socket — connect M2-3/1 to read average rectified-oscillation current in the resonator.
4. **Resonator limb (лимб)** — tune resonator to station working frequency (calibration graph in the ЗСУ-23-4М3 docs).
5. Responder of block **Т-81М3** — connect SHF generator to measure receiver sensitivity.
6. **Manometer** — waveguide-tract excess pressure.

#### АВС/transmitter functional check (p.29)
1. Power on, **«НАКАЛ»**. 2. Check tightness/pressure: manometer **14–15 divisions**, pump cycles **no oftener than every 5 min**. 3. **«АНОДНОЕ»** + **«ВЫСОКОЕ»** → initial magnetron current **~5 mA**. 4. **«РЕГУЛИРОВКА ВЫСОКОГО»** → set generator current per formular; HV-rectifier current must be **100–170 mA**. 5. Rotate antenna with **Т-55 handles** (az & el) — no breakdowns/discharges in the tract. 6. Confirm reflected signals / "звон" on range & search indicators.

### 2.4 Receiving system (ПРС) (p.30–48)
| ПРС parameter | Value |
|---|---|
| Sensitivity P_пр.min | **−78 dB** rel. 200 µW |
| Gain Ky | **10⁶–10⁷** |
| Bandwidth MF_пр | **6 MHz** |
| Intermediate frequency f_пр | **60 MHz** |
| Dynamic range | **≥100** |

- Blocks: HF block **Т-7М3** (discharger РР-187; balanced signal mixer; balanced АПЧ & phasing-pulse mixer; **klystron heterodyne К-705Р** w/ tuning mech **Т-4РМ**), preliminary IF amp **ПУПЧ Т-34М**, main amp **Т-9М**, АПЧ block **Т-35М1**, filter block **Т-48**.
- **Klystron heterodyne К-705Р** generates CW **≈15 060 MHz** (= 15000 + 60 IF). Stabilized by: high-stability supply voltages; ferrite valve (one-way isolation from load reflections); high-Q cylindrical resonator; shock-mounted base. Tuning by contactless resonator piston via **Т-4РМ**.
- **Balanced signal mixer:** waveguide ring, 4 ports, detector diodes **Д406А**; **f_пр = f_кл − f_м (60 MHz)**.
- **ПУПЧ Т-34М:** brass chassis, silver plate; first two stages "grounded-cathode–grounded-grid" (ТЗК-ТЗС) low-noise triodes L1,L2; 5 stages; AРУ/РРУ negative bias on grids L1,L3,L4. T-48 filters smooth klystron cathode/reflector supplies (+6.3 V, −370 V, −750 V from Т-52М1). Anode +120 V from Т-10М.
- Mixer-diode currents read on **ИП37-2**, selected by **switch В37-1 «СМ1-СМ2-СМ3-СМ4»**; signal-mixer attenuator sets diode current **0.1–0.3 mA**. Control sockets Г48-1 (+6.3 V), Г48-2 (−6.3 V; −350 V), measured with Ц4313 (set by controls in Т-52М1).

#### 2.4.3 Range channel (КД) (p.35–39) — feeds СИД, СП, СДЦ; block Т-9К
- 5-stage UPCH (4 contours pairwise-detuned, 5th tuned to IF), phase detector, coherent-voltage amp, amplitude-mode video amp, cathode follower, SDC-mode video amp. Supplies −150 V, +120 V.
- Two modes via **toggle В37-3 «АМПЛ.-СДЦ»** (relays Р9-1/Р9-2):
  - **Amplitude:** phase detector acts as amplitude detector (no coherent voltage); video (neg) → LF amp → cathode follower → positive video by cable to **Т-21М1**.
  - **СДЦ (MTI):** +27 V to relays; R9-5 «УСИЛ.КД СДЦ» to 1st UPCH; 5th UPCH limits at **1 V**; video amp L8 powered, L9/L10 off; coherent voltage from Т-8М through amp → phase detector; **R27-16 «ЧАСТОТА КОМПЕНСАЦИИ»** sets coherent-voltage phase (clutter cancel); R9-33 «УРОВЕНЬ СИГН СДЦ» → SDC video amp → cable to **Т-19М** → ЧПК (cancellation) channel.
- **КД controls:** **R9-4 «УСИЛ.КД АМПЛ.»** — set indicator noise level **3±1 mm** (press **«НАВЕДЕНИЕ»** on Т-55М1 to drop АРУ, R36-1 «УСИЛЕНИЕ ПРИЕМНИКА» full right). Sockets Г1 «ВЫХ.ДЕТ.КД», Г2 «ВЫХ.КД АМПЛ.». **R9-5 «УСИЛ.КД СДЦ»**, **R9-28 «УРОВЕНЬ КОГ. НАПР.»**, **R9-33 «УРОВЕНЬ СИГН. СДЦ»**.

#### 2.4.4 Angular-automation channel (КУА) (p.39–43) — block Т-9М
- Extracts the **envelope of the auto-tracked target's echo** & produces the **АРУ** voltage.
- 6-stage UPCH (first 4 polarly detuned, last 2 at IF). **6th stage normally closed; opened (strobed) by a pulse from СИД** — **СТРОБ II (3.9 µs)** or **УУС ultra-narrow strobe (0.3 µs)**; toggle **«СТРОБ-УУС»** picks УУС for a **group target** (lock the head aircraft). The strobe is **rigidly time-tied to the hole-marker (дырочный визир) on the range indicator** — so КУА opens only for the echo whose mark coincides with the hole-marker (range gate = angle gate selector).
- Detected → LF amp → **envelope detector ДОГ** (stretches video ~one PRF period; reset by reset-pulses from СИД) → negative pulsating envelope → **СУА block Т-13М2 АРУ circuit**. Gain set by АРУ (first 2 stages) + **«УСИЛ.КУА»** (3rd stage).

### 2.4.4 (cont.) КУА АРУ (AGC) loop & controls (p.41–43)
- АРУ delivers constant negative bias to ПУПЧ stages **1,3,4** and КУА UPCH stages **1,2**. At auto-track, gain is held so the **DC component of the ДОГ output = 10–12 V**.
- In **search**, relay **Р1** de-energized grounds the АРУ input ⇒ gain is **manual** via **R36-1 «УСИЛЕНИЕ ПРИЕМНИКА»** (search operator).
- ДОГ envelope AC component frequency at auto-track = **63 Hz** (conical scan); amplitude ∝ target offset from equal-signal axis; phase = direction of offset.
- **КУА controls:** Р9-1 (search/auto АРУ switch); **R36-1 «УСИЛЕНИЕ ПРИЕМНИКА»** (manual gain, initial full-right); **R9-10 «УСИЛ КУА»** (3rd-stage gain; set so unstrobed mark gives ДОГ output **0.3–5 V**, checked with Ц4313 at socket **Г13-3 «ВХОД АВТОМАТ»**); **R9-52 «УСТАН. 0 АРУ»** (zero АРУ output, at socket Г9-1); **R9-42 «ЗАДЕРЖКА АРУ»** (delayed-AGC: sets ДОГ DC component **10–12 V**, AGC reacts only to large signals). Sockets Г9-1..Г9-4 = АРУ / amplitude-detector / УНЧ / ДОГ outputs.

### 2.4.5 Frequency tune/retune channel (АПЧ) (p.43–48)
- Keeps **magnetron − klystron = 60 MHz** (IF). Components: АПЧ & phasing-pulse mixer; 4-stage wideband IF amp; balanced frequency discriminator (detuned about 60 MHz); LF amp; bipolar peak detector; servo amplifier (balanced modulator + amp); actuator motor + gear + R4M-1, R37-11. In blocks Т-7М3, Т-35М1, magnetron tuning mech Т-4М2, cabinet Т-3М1.
- Power: +120 V, −150 V (Т-10М); actuator-motor excitation **36 V 400 Hz**; balanced modulator **12 V 400 Hz**.
- **AUTO mode (toggle В37-6 «ПОДСТРОЙКА ЧАСТОТЫ» → «АВТОМАТ»):** 1st-order astatic servo; discriminator drives motor → changes magnetron resonator volume until Mf = 60 MHz − f_p = 0. Tacho (rate) feedback at 400 Hz limits hunting to **2–3 oscillations**.
- **MANUAL mode (→ «РУЧН.», initial):** bridge of R35-1, R35-2, R4M-1, R37-11; tune by **R37-11 «ПОДСТРОЙКА ЧАСТОТЫ»**.
- Controls: В35-1 «ВКЛ.-ВЫКЛ.» (36 V 400 Hz to motor M4-1); **R37-11**; R35-1/R35-4 «УСИЛ-I»/«УСИЛ-II» (transfer coeff at 1st/2nd fixed freq); **R35-6 «БАЛАНС»** (residual at «УПР.НАПР.» sockets ≤2 V); signal-mixer attenuator (ИП37-2 «ТОК СМЕСИТЕЛЯ» at СМ3/СМ4 = **0.1–0.3 mA**); sockets Г35-1/2/3.

### 2.4.6 Receiving-system functional check (p.48)
RLS on without HV / motors. (1) mixer currents 0.1–0.3 mA via «ТОК СМЕСИТЕЛЯ» (attenuator Т-7М3). (2) КД noise track **3±1 mm** via «УСИЛ.КД АМПЛ». (3) АРУ: press «АВТОМАТ» — indicator noise must not change (else check «0 АРУ» & АРУ delay). (4) КУА: press «АВТ» on antenna handle, set «УСИЛЕНИЕ КУА» so noise at socket «ВХОД. АВТ.» Т-13М2 = **0.3–5.0 V** in both «УУС-СТРОБ» positions. (5) Freq channel: max local-object mark via «ПОДСТРОЙКА ЧАСТОТЫ», verify auto-tune holds it, ±2-division manual offsets recover. Then off.

### 2.5 Search system (СП) — the SEARCH-operator scope (p.49–60)
- **Purpose:** target detection & enabling transition to angular auto-track. Blocks: search indicator **Т-28М**, azimuth-sweep block **Т-53М**, azimuth sensor **M2-42**, elevation sensor **У81-1/1**.
- **Display = rotating rectangular RASTER on a long-persistence CRT (type 23ЛМ34В, electromagnetic):**
  - **Long side = range sweep**, length **0–15 km** OR **5–20 km** (toggle **В28-1 «МАСШТАБ»**). At 15-km scale, screen-centre = 0 km; at 20-km scale, centre = 5 km.
  - **Short side = elevation beam-swing**, the **15° sector top→down** (40 ms sweep).
  - **4 scale (range) marks at 5-km interval** → become **concentric circles** as the antenna rotates.
  - **2 movable strobe marks at 1-km interval**, positioned by the **range-mechanism handwheel of block Т-22М1**. To pass to auto-track the operator drives the strobes so the **target mark sits between them**; the central **visir line** (along the long side) gives the elevation aim. If the target mark is inside the raster ⇒ antenna already on it in azimuth. **Raster rotates synchronously with the antenna in azimuth.**
- Control-voltage channel: 8-kHz oscillator (У53-3), azimuth rotating-transformer **M2-42** (kinematically tied to antenna azimuth axis), 4 phase detectors; «АМПЛИТУДА РАЗВЕРТКИ», «АМПЛИТУДА» pots.
- Radial-circular range sweep: 100-µs sawtooth, 15/20 km via В28-1; 20-km scale delayed 33.3 µs (5 km).
- Marks channel pots: **R28-47 «ЯРКОСТЬ ВИЗИРА»**, **R28-44 «ЯРКОСТЬ МАСШ. МЕТОК»**, **R28-43 «ЯРКОСТЬ СТРОБНЫХ МЕТОК»**; toggle **«КРУГОВОЙ–УСКОР.КРУГОВОЙ»** (relay Р28-2; in accelerated-circular the visir pulses are cut → only the circular range sweep shows). Also displays IFF (опознавание) marks via block Т-70.
- CRT supplies: ~6.3 V heater; +250 V 1st anode; +250 V & +150 V focus coil; **+6.5 kV aquadag**; «ФОКУС» rheostat. Pots «ФОКУС», «ЯРКОСТЬ», «ЦЕНТРОВКА» (2), «АМПЛИТУДА РАЗВЕРТКИ».

### 2.6 Range-measuring system (СИД) — the RANGE-operator scope (p.60–82)
- **Purpose:** measure range, output it to the СРП, and **time-synchronize all RLS systems**. **Phase-metric** range method: reference voltage **150 kHz**; a one-period delay of «строб I» = **6.7 µs = 1000 m**. Blocks: range **Т-21М1**, range-mechanism **Т-22М1/М2**, range-indicator **Т-23М2**, oscilloscope add-on **Т-23А**.
- **Range indicator = dual-beam CRT type 10ЛО43И**, two sweeps: **coarse range (РГД) 15–16 km** (90.5–107.2 µs) and **fine range (РТД) 1 km**. Mode switch **В23-1**: I «РАБОТА» / II «КАЛИБРОВКА» (600-kHz calibrator) / III «ОСЦИЛЛОГРАФ».
- **Range procedure:** operator turns the **range handwheel (штурвал дальности)** to delay «строб I» (a 1-km «pedestal» on РГД); coarse-aligns the pedestal on the target blip; the target then appears on the РТД where it is fine-aligned to the **hole-marker (дырочный визир)**. Range output as a voltage to **block Т-2М3 (СРП coordinate converter)**.
- **Range handwheel has two turn-values: 400 m and 2500 m** — **pushed in (утоплен) = 2500 m/turn**; pull toward self to get **400 m/turn**.
- Strobe set: **строб I** 6.7 µs ~100 V (range gate / РТД / autorange / search strobe marks); **строб II** ≤3.9 µs and **УУС** ≤0.3 µs (КУА gating: УУС for a group target — see §2.4.4); **импульс сброса** resets ДОГ. **«запуска II» PRF can shift ±6.7 µs vs «запуска I»** (range-gate phase / вобуляция).
- **Block Т-71** forms **blanking pulses for the R-123M radio** (negative 2–8 µs, 40–50 V «БЛАНКИР. Р-123М») — closes radio RX during the RLS sounding pulse.
- **Autodalnomer (auto-ranger) (p.72–77):** inductive phase-shifter **ФВ22-1** (one rotor turn = 360° = **1000 m**); two **half-strobes (полустроб I/II)** 0.25 µs each, joined at 0.5–0.7 level; time discriminator У21-14; balanced amp; UPT; magnetic amp; 400-Hz feedback demodulator; motor (excitation 110 V 400 Hz) + range mechanism. **Auto-range engage:** align the РТД hole-marker on the blip and press **«АВТОМ»** on the **Т-55М1** handle; auto-track range with **dead zone 200 m**, resolution **75 m**, accuracy **10 m**. Manual range: press **«НАВЕДЕНИЕ»** (relay Р22-2). In auto-track, range-scale drift **≤20 m/s** is tolerated.
- Autoranger controls: В22-2 «РАБОТА-БАЛАНС ДМ-БАЛАНС УПТ»; «СИММЕТРИЯ ТОЧНО/ГРУБО»; «БАЛАНС I/II»; «УРОВЕНЬ ОТСЕЧКИ» (0.5 V); «УСИЛЕНИЕ»/«ОБРАТНАЯ СВЯЗЬ»; «ФАЗА»; «БАЛАНС МУ»; «УРОВЕНЬ тока МУ»; «УСТАНОВКА НУЛЯ»; «СРЕДНЯЯ ТОЧКА»; «НАЧАЛО»/«КОНЕЦ» (strobe-travel linearity).
- **Oscilloscope add-on Т-23А (p.79–82):** pulses 0.5–200 V, 0.2–500 µs; sine >2 mV @ 50–500 Hz; ±20 % amplitude; attenuator 1:1/1:10/1:100; sensitivity calib K = 0.2 / 2 / 20 V/mm.

---

## 3. ⭐ ANTENNA-CONTROL SYSTEM (СУА) — LAYING LIMITS, RATES, MODES (p.82–100)
> This is the heart of "what the radar can/can't point at" and the laying-rate envelope.

- **Drive principle:** **constant-speed AC motors** drive the antenna through **magneto-powder clutches (магнито-порошковые муфты)** in each axis. Pointing = differentially biasing the two clutch windings; equal voltages ⇒ no drive. The mechanical **обкатка (counter-roll) gear** keeps antenna azimuth fixed while the turret rotates (turns antenna+ГАГ the opposite way by the same angle).

### 3.1 ⭐ The eight СУА modes and their exact rates/limits (p.83)
| # | Mode | Coverage / rate |
|---|---|---|
| 1 | **Manual** (az & el) | handles ±18°, antenna angle ∝ handle angle |
| 2 | **Semi-automatic** | **azimuth unlimited**; **elevation −9° … +87°** (text: −01-10/−01-50 … +14-30/+14-50 mils); constant **20 °/s**, or variable **0–45…60 °/s azimuth** and **0–32 °/s elevation** |
| 3 | **Circular search** | azimuth **20 °/s** (CW seen from above), elevation set by handles |
| 4 | **Accelerated circular search** | azimuth **45–60 °/s** |
| 5 | **Sector search** | azimuth oscillation, sector width **30–100°** (smoothly variable via «ШИРИНА СЕКТОРА»), speed **20 °/s** at any width |
| 6 | **Automatic target tracking** | conical-scan error-driven (see §3.4) |
| 7 | **Semi-automatic tracking via sight (Б-7 left head)** | mode-2 of the ZSU |
| 8 | **Control from the commander (КПН)** | force-aim **elevation −5° … +30°, azimuth ±20°**; can also slew the turret |

- **Antenna mechanical elevation travel limit: −9° … +87°** (consistent with §2.3). **End-stop interlock:** approaching the lower/upper stop trips microswitches that inject **+27 V or −27 V** to the elevation-channel UPT, **bouncing the antenna off the stop**, then the 27 V is removed.

### 3.2 СУА blocks & controls (manual mode) (p.83–88)
- Blocks: **Т-13М2** (angular-coord tracking: error-signal extraction + az/el amplify/convert; subblocks У-1, У3, У4; **БАРУ** fast-AGC on L1); **Т-55М2** (antenna-control block — produces the error signal in all modes except auto-track and КПН; carries the operator handles + buttons); **Т-2М3** (antenna-column drives, coordinate conversion to СРП, sельsin-indicator scale on the search panel); **Г-81М3** antenna; rectifier.
- Manual: press **«НАВЕДЕНИЕ»** on Т-55М2; turn handles within **±18°**. Error from a sельsin-датчик/sельsin-transformer pair (M2-33 ↔ M55-1) → «АЗИМУТ УСИЛ. РУЧН.» → amp → **ФЧВ** (reference **110 V 400 Hz** from Tr44-1) → DC control → push-pull power amp → clutches **ЭМ2-11/ЭМ2-12**. Тахо-dynamo **M2-24** gives negative speed feedback.
- Controls: milliammeter **ИП13-1** with switch **В13-1 «РАБОТА–БАЛАНС УПТ–НАЧ.ТОКИ–КОНТРОЛЬ»** (НАЧ.ТОКИ clutch currents **0.45–0.7 mA** via «НАЧ.ТОКИ АЗ/УМ»); «АЗИМУТ УСИЛ.РУЧН.»/«УГОЛ МЕСТА УСИЛ.РУЧН.»; toggle **«ПИТАНИЕ ДВИГАТЕЛЕЙ»** (220 V 400 Hz to drive motors **M2-21, M2-19**).

### 3.3 КПН (commander) override (p.94–95)
- The commander acquires an air target through the КПН and **hands off a cue (целеуказание, «ЦУ»)** by semi-auto-slewing the antenna for the search operator. Engage: toggle **«РАБОТА»→«ВКЛ»** + press **«БАШНЯ»** and **«ЦЕЛЬ»** together → +27 V to relay Р36-3 and lamp **ЛН36-5 «ЦУ»**. Error from sельsins M1-КПН↔M2-37 (az), M2-КПН↔M2-36 (el). **Force-aim limits: elevation −5°…+30°, azimuth ±20°**; the commander can also **slew the turret** (handles to extreme + «БАШНЯ»+«ЦЕЛЬ»). Speed via «УСИЛ.АЗ.КПН»/«УСИЛ.УМ.КПН» (under the left panel of cabinet Т-36).

### 3.4 ⭐ Auto-track operation (p.96–100)
- **Conical scan:** the antenna pattern axis is offset **0.5°** from the electric axis and the **search illuminator is offset 3.7°** in the horizontal plane from the bearing illuminator & reflector centre — so **engaging auto-track first slews the antenna 3.7°** (counter-clockwise viewed from above) so as not to lose the target.
- **Engage:** with the target mark strobed in range, press **«АВТОМАТ»**. Relays Р2-2 (swaps in the dovorot sельsin M2-43, stator turned 3.7°), Р55-15 (swaps «АЗИМУТ УСИЛ.РУЧНОЕ»→«УСИЛ.ДОВОРОТА»). **0.5 s later** (time to switch the waveguide to the bearing illuminator) relays Р55-1 (sельsin подслеживание), Р13-4 (drop search error-signal & 110 V reference; connect az/el error amps and ГОН reference voltages to the ФЧВ).
- Error signal: КУА ДОГ → **БАРУ** (compensates RCS fluctuation) → resonant amp tuned to **63 Hz** («ЧАСТОТА» pot) → «УСИЛ I/II» → «УСИЛ.АВТ.АЗ»/«УСИЛ.АВТ.УМ» → ФЧВ (split into az & el by ГОН references 90° apart) → clutches. **R2-4** (coupled to the elevation axis) raises the azimuth-channel gain with elevation (azimuth rate balloons at high elevation) to **prevent track break**.
- The antenna then holds the target on the **equal-signal direction**; current `β, ε, D` flow to the СРП. Setup controls: «УСИЛ.АВТ.АЗ/УМ», «УСИЛ I/II», socket Г13-1.

### 3.5 ⭐ LAYING / FIRING LIMITS & INTERLOCKS tied to the radar (consolidated)
- **Antenna elevation hard limit −9° … +87°**, enforced by **microswitch end-stops** that inject ±27 V to bounce the antenna off the stop (§3.1).
- **Azimuth: unbounded** (continuous 360°), decoupled from turret rotation by the **обкатка** counter-roll gear.
- **Search/track rates:** circular 20 °/s, accelerated-circular 45–60 °/s, sector 20 °/s over a 30–100° sector; semi-auto up to 45–60 °/s az, 32 °/s el; manual ±18° proportional.
- **Auto-track entry forces a 3.7° antenna dovorot** and requires a **range-strobed target** (the КУА is gated by the range strobe — you cannot angle-track a target you have not first range-gated). The angle gate **(СТРОБ II / УУС)** is **rigidly tied to the range hole-marker** — only the echo whose blip is in the gate drives the angle servos.
- **КПН override limits: el −5°…+30°, az ±20°** (commander hand-off envelope).
- **Mode-3 (ЗУ / memorized) pre-arm:** needs ≥5 s of prior mode-1/2 tracking; **valid only 8–10 s**.
- **Mode-4 backup-sight air fire only at halt, vehicle tilt ≤3–5°.**
- **Transmitter HV is gated** by «НАКАЛ/АНОДНОЕ» + «ВЫСОКОЕ»; **cabinet-cover interlock В44-2** cuts HV if Т-44М1's right cover opens; **ventilation must be healthy or do not power the РПК**.
- **Radiation keep-out:** 80 m in the main beam; ±45° sector keep-out at >25 m (§Safety).

### 3.6 СУА functional check (search-operator's verification, p.101–102)
- **«РОД РАБОТЫ» → НАЧ.ТОКИ АЗ I/II, НАЧ.ТОКИ УМ I/II:** clutch initial currents on **ИП13-1** must be **0.45–0.7 mA** in each position (trim with «НАЧ.ТОКИ АЗ»/«НАЧ.ТОКИ УМ»).
- **«РОД РАБОТЫ» → РАБОТА, press «НАВЕДЕНИЕ», «ПИТАНИЕ ДВИГАТЕЛЕЙ» on,** then verify each mode:
  - Handle rotation drives antenna az & el; press **«АВТОМАТ»** → antenna does the dovorot and stops (trim with **«УСИЛЕНИЕ ДОВОРОТА»** so it stops dead).
  - Handles full **right/left** → az **20 °/s** (set by **«ПОЛУАВТ.ПОСТ.СКОР.АЗ»**).
  - Handles full **up/down** → el **20 °/s** (set by **«ПОЛУАВТОМАТ.ПОСТ.СКОР.УМ»**); antenna **bounces off the upper/lower stops**.
  - Pull **«ПОЛУАВТ.АЗ»/«ПОЛУАВТ.УМ»** handles toward self → antenna must not move; confirm speed ∝ handle angle.
  - **«КРУГОВОЙ»** → 20 °/s; toggle to **«УСКОР.КРУГОВОЙ»** → 45–60 °/s; **«СЕКТОРНЫЙ»** → sector oscillation, width via **«ШИРИНА СЕКТОРА»**.
- HV on, set generator current, aim at a single local object, strobe it, press **«АВТОМАТ»** → the local object is pelengated.
- Auto-track check: **«ПОИСК-ПЕЛЕНГ»→«ПЕЛЕНГ»**, press «НАВЕДЕНИЕ», СРП toggles on; deflect handles **±0-10…0-15** on the СРП scales, press «АВТОМАТ» → antenna nulls the error in **2–3 oscillations**.

---

## 4. MTI / MOVING-TARGET SELECTION (ССДЦ) — clutter rejection (p.102–118)
- **Purpose:** protect the range channel from **passive (clutter) jamming**, and **generate the launch pulses И1 (ИЗ-1)**.
- **TTX:** uncompensated clutter residue **≤15 %**; target-speed selection band **0–450 m/s**; PRF-vobulation limits **4750–3650 Hz**.
- **Blocks:** elements of main amp **Т-9М** (КД), coherent heterodyne **Т-8М**, video-amp & launch **Т-17М**, potentialoscope-sweep **Т-18М**, cross-period-cancel (ЧПК) **Т-19М**.

### 4.1 Launch-pulse forming channel (ИЗ-1) (p.103–105)
- Generator of launch pulses **У17-2** + control-voltage generator **У17-1** (in Т-17М). Powered by «НАКАЛ»+«АНОДНОЕ»; supplies +120/+250/−150 V (Т-20М, Т-24М).
- **Constant-PRF mode** (toggle **В37-10 «ВОБУЛЯЦИЯ-ВЫКЛЮЧЕНО» → «ВЫКЛЮЧЕНО»**, relay Р17-1 off): blocking-gen only; video pulses **+30 V, 2 µs**; PRF set by **R17-5 «ШТАТНЫЙ»** (held **4500–4750 Hz**), ceiling by **R17-9 «УСТАНОВКА ЧАСТОТЫ»** (≤4750 Hz).
- **Variable-PRF (vobulation) mode** (→ «ВОБУЛЯЦИЯ», Р17-1 on, +27 V): control-voltage gen (multivibrator) makes a **30 V, 250 Hz sawtooth** that modulates the pulse gen; mean PRF set by **R17-2 «ВЧП»**, swing set by **R5 «ВЧП-1»** → PRF varies **3650–4750 Hz**. Socket Г17-5 «ИМП.ЗАП.I».

### 4.2 Coherent-heterodyne channel (Т-8М) (p.105–107)
- Generates CW IF whose **initial phase is rigidly tied to the sounding pulse's phase**. Components (L1–L10): IF amp; 1st quartz gen **13 MHz ±2 kHz**; mixer→**47 MHz**; phasing-pulse amp 47 MHz; coherent heterodyne; 2nd quartz gen 13 MHz; mixer→**60 MHz**; coherent-voltage amp; control phase detector.
- Active **only in «СДЦ»** (relay Р8-1 gates +120 V). Output `U = Uкг·sin(Wпрt + Г + n·Тп·ΔW)` where ΔW = detuning of the 1st quartz gen vs 13 MHz.
- **Cancellation tuning:** stationary local objects → ΔW = 0; wind-drifting clutter → the coherent-voltage phase is stepped period-to-period by `ΔW·Тп` ∝ clutter speed, chosen by the **«ЧАСТОТА КОМПЕНСАЦИИ»** knob.

### 4.3 Potentialoscope sweep & control-signal channels (Т-18М) (p.108–114)
- Spiral scan written on the potentialoscope targets. Controls: **R7 «ДЛИТЕЛЬНОСТЬ»** (gen pulse **125 µs** → **3.5–4 spiral turns**); **R1 «ОБРАТНАЯ СВЯЗЬ»** (spiral pitch **2 mm** at outer turn); **R18-5/R18-2 «АМПЛ.РАЗВ.I/II»** (outer-turn diameter **30±6 mm**); phase-splitter «АМПЛ ПО ГОРИЗОНТАЛИ»/«ФАЗА +90°»/«ФАЗА −90°»; «ГОРИЗ/ВЕРТИК.СМЕЩЕНИЕ».
- Control-signal channel (test): toggle **В18-1 «ПАЧКИ-НЕПРЕРЫВ»**; **R8 «ЧАСТОТА ПОВТОРЕНИЯ»** (division coeff **10–20**); **R18-23 «АМПЛ.КОНТР.СИГН.»** (≥1.5 V). Quality = перезаряд / подавление coeffs + dynamic range.

### 4.4 Cross-period-cancellation channel (ЧПК, Т-19М) (p.114–117)
- Two **potentialoscopes** (У19-1/У19-4) memorize echo amplitude and **subtract successive periods**; equal (stationary-clutter) echoes cancel, moving-target residues pass. Modulating-voltage gen **33 MHz** (50–60 V to control electrodes; 2 V to HF-amp 2nd stages); residue → resonant amps **У19-2/У19-5** (33 MHz) + phase detector → forming video amp **У19-6** → СИД. Supplies +120/+250/−150/**−2000** V, 220 V 400 Hz.
- Controls: **В19-1 «РАБОТА-КОНТРОЛЬ»**; **В19-2 «РАБОТА-ПОТЕНЦИАЛОСКОП I-II»** (both = double subtraction; one = single, lower clutter suppression — used when a potentialoscope fails); «УСИЛЕНИЕ I/II» (15 V in → 40 V out); «ТОК ЛУЧА»/«ФОКУС»/«АНОДНОЕ»/«СЕТОЧНОЕ»/«ТОК МАГНИТА»; «АМПЛИТУДА ОПОРНОГО НАПРЯЖЕНИЯ»; «УСИЛЕНИЕ В.Ч.» (≥200); «АМПЛ.МОДУЛ.НАПР I/II»; «УСИЛЕНИЕ» (≥4); «ТОК КОЛЛЕКТОРА» (**2–10 µA**).

### 4.5 СДЦ functional check (p.117–118)
On; drive antenna to get local-object marks; toggle **«АМПЛ-СДЦ»→«СДЦ»**; rotate **«ЧАСТОТА КОМПЕНСАЦИИ»** to cancel them — uncompensated residue **≤15 %** of signal; if SDC local-object signal **<10 mm**, check Т-17М/Т-18М/Т-19М per the **КРАС instruction**; return to «АМПЛ».

---

## 5. SECONDARY POWER-SUPPLY SYSTEM (СВИП) — voltages & interlocks (p.118–126)
- **Blocks:** Т-10М, Т-20М, Т-24М, Т-27М1, Т-29М, Т-52М1, Т-54М, Т-59. Feeds the RLS with stabilized & unstabilized DC and a stabilized **220 V 400 Hz** AC.
- **Stabilized rails:** +75, −75, +120, +150, −150, +250, −250, +350, −370, −2000 V. **Unstabilized:** ±6.3, +400, −700, +1200, +4500, +6500 V.
- **Output / ripple (regulation bands):** ±75 (71–79; 10 mV), +120 (114–126; 15 mV), ±150 (142–158; 15 mV), ±250 (237–263; 25 mV), +350 (332–368; 35 mV), −370 (350–390; **2.5 mV**), −2000 (1900–2100; **4–5 mV**). For ±5 % mains change, output drifts ≤0.15–10 V depending on rail.
- **Stabilized 220 V 400 Hz source:** regulated **210–230 V**, accuracy **±1 %** for ±5 % mains; redundant (toggle **«СТАБ-НЕСТАБ»** on Т-59).
- **Built-in monitors:** **ИП52-1** (Т-52М1) reads Т-10М via **В52-1**; **ИП54-1** (Т-54М) reads Т-20М/Т-24М/Т-27М1/Т-54М via **В54-1/В54-2** (2 rows). 220 V 400 Hz + +400 V via portable meter on Т-59 sockets.
- **Per-block highlights:**
  - **Т-10М:** +120(I) 400 mA, +120(II) 400 mA, **−150** 100 mA. **Relay Р10-1 = key interlock** — if the **−150 V** rectifier fails, +27 V is NOT passed to the «АНОДНОЕ» switch → anode rectifiers stay locked out.
  - **Т-20М:** +250(I/II/III) 380/280/420 mA, +150 200, +120 300, −75 100 mA.
  - **Т-24М:** +350 80, +250(I/II) 110/530, +150 110, +120 330, −150 250 mA.
  - **Т-27М1:** +150/+75/−150 180 mA, −75/−250 80 mA. **Electromechanical time-relay ЭМРВ-27Б** blocks anode-voltage turn-on (warm-up delay).
  - **Т-29М:** unstabilized **+4500 V, 190 mA** HV for the transmitter modulator (Т-3М1). Saturation choke Др29-2 regulates **+2200…+4700 V**; control winding fed +27 V via **«РЕГУЛИР. ТОКА ГЕНЕР.»** (range-operator panel) — *this is the knob that sets magnetron current*. Mechanical discharger **РИ29-1** for safety.
  - **Т-52М1:** −370 V 55 mA stab; ±6.3, **−700 V** unstab (= −370 + volt-add); klystron-reflector voltage from a −700 V divider, monitored at «НАПР.ОТР» («НАПР.ОТР.I/II» pots).
  - **Т-54М:** **+6500 V** unstab; **−2000 V** 15 mA stab (slow soft-start via С54-6/R54-3); monitors Т-20М/Т-24М/Т-27М1 + own −2000 V.
  - **Т-59:** ±1200 V (±100) 10 mA with +400 V divider; **220 V 400 Hz** stab source 0.5 A; +1200 monitored indirectly via +400.
- **Construction:** each block keyed so it can't go in the wrong slot; front-panel fuses + neon fuse-fail lamps.

---

## 6. POWER, START-UP SEQUENCE & INTERLOCKS (control system 2.10, p.126–141; checklists p.142–149)
> The RLS draws power from the **ЗСУ electrical system (СЭП)** — the gas-turbine APU + DC generator on the **GM-575 chassis** (detailed in the chassis manual, not here). The distribution board (распределительный щит ЗСУ) feeds **220 V 400 Hz 3-phase + +27 V** into cabinet **Т-44М1**. RLS consumes **≤10.5 kW** on the AC line and **≤1 kW** on the +27 V line.

### 6.1 Two operator panels
- **Range-operator panel** — fold-down face of cabinet **Т-37М2** (Fig.65): RLS on/off, magnetron-current set/monitor, mixer-current monitor, signal lamps.
- **Search-operator-gunner panel** — cabinet **Т-36М1** + handles of block **Т-55М2** (Fig.66): search-mode switching, RLS control during search & auto-track, receiver control, range-auto (АО) modes, power-drive modes, reference-voltage gen, fire modes.

### 6.2 Power-on chain & timing (p.127–129)
- **В37-2 → НАКАЛ:** +27 V → lamp ЛН37-5 + contactor Р44-4 → ~220 V to RLS blocks + fans; time-counter ИП44-1 starts. Negative **−150 V** appears in Т-10М → relay Р10-1 picks up → +27 V to time relay **Р27-2**, which closes after **3 min ± 20 s** (power-tube self-warm-up) → enables the «АНОДНОЕ» switch + its signal lamp. **Emergency bypass:** button **«ГОТОВНОСТЬ АВАРИЙНО»** on Т-27М1 skips the 3-min delay.
- **«АНОДНОЕ» → ON:** contactor Т-44М1 feeds anode rectifiers (and Т-29М on «ВЫСОКОЕ»).
- **В37-9 «ВЫСОКОЕ НАПРЯЖЕНИЕ ВКЛ»:** +27 V → relay **Р44-1** *only if interlock **В44-2** is closed* (Т-44М1 right cover shut) → ~220 V to HV rectifier Т-29М; self-locks. **В37-8** = «ВЫСОКОЕ ВЫКЛ». **Max-current relay Р37-2** drops Р44-1 on overload (protects Т-3М1/Т-29М).
- **Frequency hop** by the **f1/f2 handle** on Т-4М2, shown by lamps ЛН37-1/ЛН37-2 («ЧАСТОТА I/II»); **В37-6 «РУЧН.-АВТОМ»** = magnetron auto/manual freq tune; **В37-3 «АМПЛ-СДЦ»** (lamps ЛН37-3/ЛН37-4); **В37-10 «ВОБУЛЯЦИЯ»**; **В37-5 «УУС-СТРОБ»** (УУС→relay Р21-2 swaps the angle-gate strobe); mixer currents on **ИП37-2** via **В37-1 «СМ1-СМ4»**.

### 6.3 Search-operator power-drive wiring (p.130–137)
- **Circular search:** toggle **В55-14** + button **В55-5** → relay Р55-6КП → motor **М55-4** via «АЗИМУТ ПОЛУАВТ.ПОСТ.СКОР.» → az **20 °/s**. Engaging circular **drops any other mode**.
- **Accelerated circular:** В55-5 + В55-14→«УСКОР.» → **45–60 °/s** (also sets Т-28М search-indicator «ЛИНИЯ» mode).
- **Sector search:** В55-14 + button **В55-4** → relays Р55-5/9/16/18СП + clutch ЭМ55-1СП; **R55-17 «ШИРИНА СЕКТОРА»** sets width; antenna oscillates, reversing at each edge.
- **«НАВЕДЕНИЕ» (В55-9)** drops any mode.
- **Semi-auto constant speed:** handle to stop trips microswitch **В55-10** (az) / **В55-11** (el) → 20 °/s; antenna **bounces off the mechanical stops** via Т-2М3 microswitches **У2-1В2/У2-1В3**.
- **Semi-auto variable speed:** pull «ПОЛУАВТ.АЗ» (В55-12, R55-13) / «ПОЛУАВТ.УМ» (В55-13, R55-10) → speed ∝ handle angle.
- **Auto-track:** button **«АВТ»** on the handle → relays Р55-8 + Р55-15 (ДОВОРОТ): dovorot, illuminator swap (Р2-7 → ЭМ2 «ПОИСК-ПЕЛЕНГ»), mode swap (В55-7 «РЕЖИМ I/II»), подслеживание (Р55-1/Р55-17).
- **Auto-range + АРУ engage:** +27 V from Р55-8 via **В37-5** in «УУС» → Р21-2, Р22-2, autodalnomer clutch **Э22-1**, and АРУ relay У9-1Р1.
- **Auto СРП-output engage:** via В22-3 (closed **within 0–8 km**) + Р36-1 (closed in «АВТОМАТ»); also toggle В36-4.
- **«ПОИСК-ПЕЛЕНГ» (В55-6):** «ПЕЛЕНГ» = bearing head to waveguide, «ПОИСК» = search head.
- **Fire-mode switch В36-1 «КНОПКА-ПЕДАЛЬ»**; **ЗУ-memory toggle В36-2** (ЗУ command timed **8 s** by relay Р19, cuttable early via В12).
- **The turret/antenna control when working from the КПН is described in the «Техническое описание АЗП-23»** (gun-mount manual).

### 6.4 Antenna stow/deploy (Т-2М3, p.138–141)
- **Magnetron-mode В44-1 «ТРЕНИРОВКА-РАБОТА I-РАБОТА II»:** ТРЕНИРОВКА = full heat, РАБОТА II = reduced ~2 V, РАБОТА I = no heat.
- **Drive-motor power:** switches **У5-В4 «ПИТАНИЕ ДВИГАТ. β,ε,Δε»** + **У5-В2 «ПИТАНИЕ ДВИГАТ. Δq»** on Т-2М3; ВПК power «У5-В3 ПИТАНИЕ ВПК».
- **Raise:** unstop antenna (general stopper, handles→«ОТКР», lamp Л2-4 «АНТЕННА ЗАСТОПОРЕНА» goes out) → press **«ПОДЪЕМ» (У4-КН1)** → motor У2-М1 raises → У2-В4 → stop-motor У2-М2 locks → lamp **«АНТЕННА ПОДНЯТА»**.
- **Lower:** rotate to **«НОЛЬ ε»**, stop by azimuth → press **«ОПУСКАНИЕ» (У4-КН2)** → У2-М1 lowers → У2-В2 → lamp **«АНТЕННА ОПУЩЕНА»**; handles→«ЗАКР» (походное / travel-lock).

### 6.5 Appendix 1 — initial control positions before switch-on (p.142–146, selected)
- **Commander panel:** «27.5В-55В»→**55В**; «КОМАНДИР-ОПЕРАТОР»→**КОМАНДИР**; «ЦЕПЬ СТРЕЛЬБЫ»→**ВЫКЛ**; «ГАГ»→**ВЫКЛ**; «СТРЕЛЬБА ВЕРХНИХ/НИЖНИХ АВТ.»→**ВЫКЛ**; «АВАРИЙНАЯ СТРЕЛЬБА»→**Выключен и опломбирован**; «ШУНТ-СРП»→**СРП**; **«ОГРАНИЧЕНИЕ УГЛОВ»→30**; «ПАН.НАЗЕМН.»→ВЫКЛ; «ПИРОЗАРЯЖАНИЕ»→0.
- **СРП:** correction handles→0; «УПР»→ВКЛ; «ΔVц%»→0; «ВИЗИР-ДУБЛЕР»→**ВИЗИР**.
- **Rotating part:** «СИЛОВАЯ-МАХОВИК»→**МАХОВИК**; «СТОПОР-НАВОДКА»→**СТОПОР**.
- **Cabinet Т-37М1 (range):** «РОД РАБОТЫ ИНДИКАТОРА»→РАБОТА; «ВОБУЛЯЦИЯ»→ВЫКЛ; «ТОК ГЕНЕР-ТОК ВЫПР x5»→ТОК ГЕНЕРАТОРА; «АМПЛ-СДЦ»→АМПЛ; «УУС-СТРОБ»→СТРОБ; «РЕГУЛИР.ТОКА ГЕНЕРАТ.»→full left; «ПОДСТРОЙКА ЧАСТОТЫ»→mid; «ЧАСТОТА КОМПЕНСАЦИИ»→mid; «НАКАЛ-ВЫКЛ-РАБОТА БЕЗ ВЫСОКОГО»→ВЫКЛ; «АНОДНОЕ»→ВЫКЛ; **«Шкала Д»→2400 m**.
- **Cabinet Т-44М1:** «РАБ.I-РАБ.II-ТРЕН»→**РАБ.II**; «f1-f2»→f1; «Н-А»→**А**; klystron «f1-f2»→f1.
- **Turret stopper:** «Стопор башни по горизонту»→tightened fully right; **Насосы приводов «РУЧН.-СИЛ.»→РУЧН.**; antenna stoppers all →**РАССТОП**.
- **Block Т-2М2:** «ПИТАНИЕ ВПК / ДВИГАТ. Δq / ДВИГАТ. β,ε,Δε»→**ВЫКЛ**.

### 6.6 ⭐ Appendix 2 — РПК-2М power-ON / power-OFF, by crew station (p.147–149)
**Power-ON:**
1. Turn on **СЭП** (the chassis power plant — APU/generator).
2. **Commander:** check source voltages on the voltmeters.
3. **Range operator:** «НАКАЛ» → signal lamp + scale lights + ventilation runs.
4. **Commander:** «ГАГ» → lamp «ЗАСТОПОРЕНО» (off after 3 min, then «ОТСТОПОРЕНО»); press «КОНТРОЛЬ» — if «НЕИСПРАВНО» lights, turn ГАГ off (no stabilization). Cycle ГАГ at a **halt** to spare the gyros.
5. **Search-operator-gunner:** «ПИТАНИЕ ВПК» on Т-2М3.
6. **Range operator:** after the lamp, «АНОДНОЕ» → sweeps appear on the range indicator; «ТОК СМЕСИТЕЛЯ» **0.1–0.3 mA**.
7. **Search-operator-gunner:** set search-indicator sweep — «ФОКУС»/«ЯРКОСТЬ»/«АМПЛ.РАЗВ.»/«ЦЕНТРОВКА» (Т-26М), and «ЯРК.ВИЗИРА»/«ЯРК.МАСШ.МЕТОК»/«ЯРК.СТРОБ.МЕТОК».
8. **Range operator:** check СМ1–СМ4 mixer currents 0.1–0.3 mA; set «ФОКУС»/«ЯРКОСТЬ»/«ВЕРТИК.СМЕЩ»/«ГОРИЗ.СМЕЩ» (Т-23М2).
9. **Search-operator-gunner:** «ПИТАНИЕ ДВИГАТ. Δq» + «ПИТАНИЕ ДВИГАТ. β,ε,Δε».
10. **Range operator:** press **«ВЫСОКОЕ НАПРЯЖЕНИЕ ВКЛ»** → lamp «ВКЛЮЧЕНИЕ ПЕРЕДАТЧИКА» + magnetron **~5 mA**; raise current to the formular value via «РЕГУЛИР.ТОКА ГЕНЕР.»; at **≥30 mA** set Т-44М1 to «РАБ.I»; verify rectifier current («ТОК ВЫПР. ×5»); set 2nd frequency «f2» if needed.
11. **Search-operator-gunner:** unstop the Т-55М1 handles (pull fixator up, rotate 90°); aim antenna at a local object.
12. **Range operator:** peak the signal with «ПОДСТРОЙКА ЧАСТОТЫ», then set it to «АВТОМ».
13. **Commander:** «ПИТАНИЕ =27В ~115В».

**Power-OFF** (reverse): search-gunner presses «НАВЕДЕНИЕ» → commander «ГАГ» off + «ПИТАНИЕ =27В ~115В» off → range op «ПОДСТРОЙКА ЧАСТОТЫ»→«РУЧН», magnetron current to min, «ВЫСОКОЕ ВЫКЛ» → search-gunner kills the three drive-power toggles → range op «АНОДНОЕ» + «НАКАЛ» off → crew returns controls to initial.

---

## 7. CROSS-REFERENCES TO OTHER MANUALS
- **Gun AЗП-23 «Амур» (4× 23 mm 2А7 autocannons) + turret/КПН control loop:** the **commander-device (КПН) cueing, turret slew, and fire-circuit logic** are documented in the **«Техническое описание АЗП-23»** (this RLS manual only covers how the radar hands off `β, ε, D` and the lead `Q, Ф` to the gun power drives ГПГН/ГПВН). The «ОГРАНИЧЕНИЕ УГЛОВ» (angle-limit) selector and «ЦЕПЬ СТРЕЛЬБЫ», «СТРЕЛЬБА ВЕРХНИХ/НИЖНИХ АВТ.», «АВАРИЙНАЯ СТРЕЛЬБА» switches live on the **commander's panel** (Appendix 1).
- **Chassis GM-575:** the **СЭП power plant** (gas-turbine APU **ДГ4М-1** + DC generator) and the **220 V 400 Hz / +27 V distribution board** that feed cabinet Т-44М1 are in the **chassis manual** — this manual only states the RLS load (≤10.5 kW AC, ≤1 kW DC) and the warm-up interlock timing.
- **СРП Б-1 analog computer:** internal lead-angle solution is referenced (`X,Y,Z` smoothing, `Vx,Vy,Vz`, lead time `Tу`) but its block-level build is in a separate SRP description; here it appears only as the consumer of `β, ε, D` and the producer of `Q, Ф`.
- **КРАС instruction:** the alignment/regulation procedure for Т-17М/Т-18М/Т-19М (MTI tuning) is delegated to the **КРАС** document.
- **Figure album:** all schematics/figures (Fig.2, 24, 48–66, вклейки 1–4) are in the separate **«Альбом рисунков»** companion volume.
- **Part 2** of this teaching course (separate volume) covers exploitation/operation in depth.

---

## 8. ⭐ GAME-RELEVANT OPERABLE MECHANICS — per crew station
> Synthesis for a 4-seat «Shilka» crew-station sim. The ЗСУ-23-4М is a **3-man fighting compartment**: **commander**, **range operator (оператор дальности)**, **search-operator/gunner (оператор поиска-наводчик)** — plus the **driver** in the hull (GM-575 manual). Each radar station is a distinct interactive panel with a real procedure.

### 8.1 Search-operator / gunner (the "antenna driver" — most game-juicy)
- **Two-axis handle controller** with a thumb **«АВТОМАТ»/«АВТ»** button. Drives the antenna in **8 selectable modes** (manual ±18° proportional · semi-auto const 20 °/s · semi-auto variable 0–60 °/s · circular 20 °/s · accelerated circular 45–60 °/s · sector 30–100° at 20 °/s · auto-track · sight-track). Mode buttons: «КРУГОВОЙ», «УСКОР.КРУГОВОЙ», «СЕКТОРНЫЙ», «НАВЕДЕНИЕ», «АВТОМАТ».
- **Search scope (Т-28М):** a **rotating rectangular raster** that **spins with the antenna in azimuth**; long axis = range (switch **0–15 km / 5–20 km**), short axis = the 15° elevation beam-swing; **4 range rings @5 km** + **2 movable strobe marks @1 km** driven by a **range handwheel**. Gameplay loop: spin/sector-scan → a blip appears → bracket it between the strobes → press «АВТОМАТ».
- **Receiver gain knob «УСИЛЕНИЕ ПРИЕМНИКА»** (manual gain in search; auto-AGC after lock); set noise grass to ~3 mm.
- **Sector-width knob «ШИРИНА СЕКТОРА»**, **«ШИРИНА»/brightness** knobs.
- **Auto-track feel:** pressing «АВТОМАТ» first **jerks the antenna 3.7°** (the dovorot), then the dish **locks and conically scans at 63 Hz**, holding the target on boresight; az-gain auto-rises with elevation to keep lock. **You must range-gate first** — no lock without the blip inside the range strobe.
- **«ПОИСК-ПЕЛЕНГ»** waveguide switch, **antenna stow/deploy** («ПОДЪЕМ»/«ОПУСКАНИЕ» with «АНТЕННА ПОДНЯТА/ОПУЩЕНА/ЗАСТОПОРЕНА» lamps).

### 8.2 Range operator (the "transmitter & range" station)
- **Power sequence as a mini-game:** «НАКАЛ» → wait **3 min** warm-up lamp → «АНОДНОЕ» → «ВЫСОКОЕ НАПРЯЖЕНИЕ ВКЛ» (lamp «ВКЛЮЧЕНИЕ ПЕРЕДАТЧИКА»). **«РЕГУЛИР.ТОКА ГЕНЕР.»** dial sets magnetron current **5 → 25–33 mA** watched on **ИП37-1**.
- **Dual-beam range scope (Т-23М2):** coarse 15-km sweep + fine 1-km sweep; a **range handwheel** delays a 1-km pedestal onto the blip (coarse), then a **hole-marker (дырочный визир)** fine-aligns it; handwheel has **two gears (push = 2500 m/turn, pull = 400 m/turn)**. Aligning the marker and pressing auto-range gives **10 m accuracy, 200 m dead zone, 75 m resolution**.
- **Mode toggles:** **«АМПЛ-СДЦ»** (clutter-reject MTI), **«ВОБУЛЯЦИЯ»** (anti-jam PRF jitter), **«ЧАСТОТА КОМПЕНСАЦИИ»** (tune out ground clutter), **«УУС-СТРОБ»** (narrow gate to pick the lead aircraft out of a group/formation), **«f1/f2»** frequency hop + «ПОДСТРОЙКА ЧАСТОТЫ РУЧН/АВТОМ», mixer-current check «ТОК СМЕСИТЕЛЯ СМ1–СМ4».

### 8.3 Commander (the "cue & stabilization" station)
- **КПН cueing:** acquire an air target optically through the commander's sight and **slew the antenna (and turret) to hand it off** to the search operator — force-aim envelope **el −5°…+30°, az ±20°**; «БАШНЯ»+«ЦЕЛЬ» buttons, «ЦУ» lamp.
- **Stabilization toggle «ГАГ»** (gyro-azimuth-horizon): «ЗАСТОПОРЕНО»→3 min→«ОТСТОПОРЕНО»; «КОНТРОЛЬ» button, «НЕИСПРАВНО» fault lamp. With ГАГ off there is **no fire-on-the-move stabilization**.
- **Fire-control switches:** «ЦЕПЬ СТРЕЛЬБЫ», «СТРЕЛЬБА ВЕРХНИХ/НИЖНИХ АВТ.» (fire upper/lower autocannon pair), **«ОГРАНИЧЕНИЕ УГЛОВ» (30…)** elevation-limit selector, «АВАРИЙНАЯ СТРЕЛЬБА» (sealed emergency), «ШУНТ-СРП», «КОМАНДИР-ОПЕРАТОР» authority toggle, «ПИТАНИЕ =27В ~115В».

### 8.4 Cross-station gameplay limits / interlocks worth modeling
- **Antenna el hard-limited −9°…+87°** with a **spring-bounce off the stops**; **azimuth is unlimited/continuous** (counter-rolled from the turret).
- **Lock requires range-gate** (КУА is strobe-gated by the range hole-marker) → search-gunner and range operator must **cooperate** to achieve auto-track.
- **Auto СРП fire-solution only feeds the guns within 0–8 km** range gate (В22-3) once in «АВТОМАТ».
- **Mode-3 «ЗУ»** (fire on memorized track) needs ≥5 s of prior lock and is **valid only 8–10 s** — a tense "blind-fire" window.
- **Backup-sight air mode only at a halt, tilt ≤3–5°.**
- **Warm-up gate (3 min)** before HV; **cover interlock В44-2** and **−150 V health (Р10-1)** must be satisfied or HV won't come up; **radiation keep-out 80 m / ±45° at >25 m** with the transmitter live.
- **5 combat modes** give a natural degradation ladder for damage states: full radar → optical-angles+radar-range → memorized-track → backup-sight air → backup-sight ground.
