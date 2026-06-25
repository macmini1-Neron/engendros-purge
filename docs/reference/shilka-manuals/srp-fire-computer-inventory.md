# СРП Б-1 — analog fire-control computer — 1:1 inventory (sim spec for `shilka-srp.js`)

**What this is:** a consolidated 1:1 specification of the **СРП (счётно-решающий прибор)** — the ЗСУ-23-4 «Шилка» analog fire-control computer — extracted to feed the future game logic module `src/shilka-srp.js` (milestone **M4** of the demoshilka plan).

**Sources synthesized:** `gpt-deep-rnd/04_rpk_rls_deep_dive.md`, `…/02_system_architecture.md`, `findings/08-zsu234-tech-description.md`, `findings/01-rls-device-operation.md`, `findings/04-1rl33m-radar.md`, `gpt-deep-rnd/03_interlock_state_machine.md`, `…/07_crew_workflows.md`, plus the source PDFs (08 / 01 / 04). Every non-obvious fact cites source file + section/page inline.

**Status:** extraction-pass digest (2026-06-25). Points marked **NOT FOUND IN SOURCES** are genuine gaps where the published manuals do not contain the spec. The §10 GAPS/CONTRADICTIONS list flags what still needs a source or pinning. Cross-references: subsystem-level framing lives in `subsystem-states.md §4` (СРП) / §5 (stabilizace ГАГ/ВПК/ОПК); the fire-permission AND-chain in `§7`.

---

## 1. IDENTITY & ROLE

**Exact designation:** **СРП Б-1** (счётно-решающий прибор = analog fire-control computer, block designation Б-1) — also referenced as the *counting-solving device* or *analog fire computer*.

**Physical identity:** analog electromechanical resolver — housed in a dedicated cabinet mounted in front of the search operator's station in the rotating turret part. Sits directly above the **ОПК Б-5** (gun-coordinate converter) (findings/08-zsu234-tech-description.md, p.116).

**Subsystem hierarchy:** Core component of the **РПК-2М** (radio-instrument fire-control complex, изделие 1А7М-Сб.00) alongside the radar **1РЛ33М3**, sighting device **Б-7**, commander's cueing device **КПН**, and stabilization systems (ГАГ, ВПК, ОПК) (findings/01-rls-device-operation.md, p.8, 13-22).

**Primary role:** Solves the ballistic meeting problem — takes current target coordinates (range, azimuth, elevation) and their rates from the radar, computes the *future* target position at the moment the projectile arrives, and outputs the full gun-laying angles (full azimuth **Q** and elevation **Ф**) accounting for projectile time-of-flight, ballistic drop, parallax (antenna-to-gun offset), and hull-stabilization corrections. The power laying drives **2Э2** (two electro-hydraulic servos) follow these computed angles (findings/01-rls-device-operation.md, p.8, 39; findings/08-zsu234-tech-description.md, p.123-124).

**Feed/consume relationship:** The СРП receives inputs from:
- Radar **1РЛ33** (via rotating transformers): `β` (azimuth), `ε` (elevation), `D` (slant range), and their rates/smoothed values.
- Stabilization system **ГАГ/ВПК**: attitude corrections (pitch ψ, roll θк, course K).
The СРП outputs **Q, Ф** to the power-drive servo receivers (ПШГ horizontal, ПШВ vertical) which lay the gun at the computed lead point (findings/01-rls-device-operation.md, p.39; findings/08-zsu234-tech-description.md, p.123-124).

---

## 2. INPUTS (every input signal, units/ranges)

### From Radar 1РЛ33М — target position and velocity
All inputs carried on rotating transformers in the antenna column **Т-2М2** (findings/04-1rl33m-radar.md, p.261):
- **`β` (target azimuth):** 6000 d-mil circle (Soviet standard); from antenna azimuth rotating transformer **M2-7**; range **0–6000 d-mil (0°–360°)** (findings/04, p.261).
- **`ε` (target elevation):** **−01-50 to +14-50 d-mil** ≈ **−8.4° to +81.6°**, following antenna elevation hard limit −9°…+87° (findings/04, p.230); from antenna rotating transformer **M2-8**.
- **`D` (slant range):** in **meters**; auto-tracked via the split-gate (полустроб) tracker on range-mechanism **Т-22М1**; auto-range accuracy **±10 m**, resolution **75 m** (findings/04, p.54, 184-186). Envelope: **200 m dead zone → 10,000 m auto-track** (MiG-17 target) (findings/04, p.50; findings/08, p.19).
- **Range rate / radial velocity:** derived internally from successive D samples + filtering; not a separate measured channel (findings/01, p.36).

### From attitude/gyro (ГАГ Б-4, ВПК Б-2М) — hull stabilization
- **`ψ` (pitch / «галопирование»):** fore-aft hull rocking, measured by **ГАГ Б-4** (findings/01, p.35).
- **`θк` (roll / «потаптывание»):** lateral hull tilt (findings/01, p.35).
- **`K` (course / heading):** hull yaw, from the heading system **КЗУ** (гирокурсоуказатель); corrects antenna-measured azimuth to gun-relative coords when moving (findings/01, p.35; findings/10, §4 control 96 ДВИГ.K1).

### Ballistic constants / operator presets
- Ballistic tables are **implicit** in the resolver's analog networks (tuned for the 23×152 mm round, ~950–980 m/s MV); **no operator input** of MV or projectile type documented (findings/03, p.103-104).
- Time-of-flight computed internally from D + known ballistics; not operator-selectable.
- **Air-vs-ground target presets: NOT FOUND** — the СРП solves one ballistic trajectory; ground mode uses optical angular input but the СРП still computes the lead.

### Manual range input (range handwheel)
- **Штурвал дальности** (range operator): **400 m/turn and 2500 m/turn** (push-in/pull-out). Drives phase-shifter **ФВ22-1** (1 rotor turn = 360° = **1000 m** scale). Output feeds **Т-22М1**, setting the strobe delay for manual range. In auto-range, the **автодальномер** servo-tracks the strobe via a time-discriminator + magnetic amplifier (findings/04, p.175-192; findings/10, §4/§5 item 228).

---

## 3. COMPUTATION (what it solves)

### Lead/prediction logic
Given current `(β, ε, D)` + velocity `(Vx, Vy, Vz)`, compute target position at `t = Tγ` (projectile flight time), then the gun angles to point there.
- **Lead time Tγ ≈ D_ballistic / V_projectile** (~950 m/s). A **checked maintenance parameter** §38 «Проверка точности отработки Тγ и α» (findings/03, p.206). Tγ is a displayed СРП output (findings/01, p.27).
- **Extrapolation:** СРП integrates/filters radar over ~5 s (mode 1) → smoothed Cartesian **X,Y,Z** + velocity **Vx,Vy,Vz**. Mode 3 (ЗУ) coasts on these for **8–10 s** assuming constant-velocity straight-line motion; **linear**, no maneuver prediction (findings/01, p.41).
- **Coordinate transform:** antenna-relative `β,ε,D` → hull-stabilized via `ψ,θк,K` → gun-relative firing angles **Q, Ф**.

### Lead angles produced (упреждение)
- **`βу` (lead azimuth):** azimuth lead for target motion + drive lag.
- **`φ` (line-of-fire elevation):** computed elevation; includes ballistic drop + stabilization + vertical lead.
- **`qу` (lead course angle):** azimuth lead vs vehicle course (on-the-move; gated by toggle **96 ДВИГ.K1**) (findings/10, §4; findings/01, p.26-27).
- **`α` (aiming angle):** internal auxiliary lead param, checked §38 (findings/03, p.206); exact formula **NOT FOUND**.
- **`ΔX, ΔY, ΔH`:** horizontal/vertical corrections summed into final angles (findings/01, p.36).

### Ballistic drop / TOF / parallax / attitude
- **Ballistic drop ΔH'** added to `φ` for gravity drop over Tγ; exact tables **NOT FOUND** but confirmed computed (findings/01, p.36).
- **TOF = D / MV** implicit in drop calc; no dynamic MV adjust (findings/03, p.107, 206).
- **Parallax:** antenna ~1–2 m above / ~0.5 m forward of gun bore — significant at 200–500 m. Applied via **ОПК** working with the СРП; offset vectors set at calibration, not combat-adjustable (findings/08, p.123; findings/01, p.25-26). Sight-to-gun parallax handled by boresighting (ТХП-23, ≤22′), not the СРП.
- **Hull attitude:** ψ,θк from ГАГ → **ВПК** produces Δq, Δε → **ОПК** combines with СРП lead → final **Q, Ф** (findings/01, p.23-26). ГАГ needs **≥3 min** spin-up before valid (findings/04, p.68; findings/10, §12 step 3): toggle **35 ГАГ** → lamp **ЗАСТОПОРЕНО** (spinning up) → **ОТСТОПОРЕНО** (ready).

---

## 4. OUTPUTS

- **`Q` (full azimuth):** to horizontal servo receiver **ПШГ** → гидромотор №5 + редуктор ГН. Range **unlimited 360°** (findings/08, p.123-124; findings/03, p.34).
- **`Ф` (full elevation):** to vertical servo receiver **ПШВ** → гидромотор №2.5 + редуктор ВН. Range **−4°…+85°** (rubber buffers + end-stop microswitches; findings/03, p.28-30; findings/04, p.229).
- **Transmission:** СРП outputs synchro (selsyn) voltages (~400 Hz / ~110 V AC) → receivers **ПШГ/ПШВ** produce DC error (actual − commanded) → **Т-39М amplifier** → AC control to **magneto-powder clutches** (магнитопорошковые муфты) → drive speed ∝ error → follow until error→0 (findings/03, p.66).
- **Aux outputs:** `Tγ` displayed (findings/01, p.27); `βу, φ, Vx,Vy,Vz` intermediate displays.
- **СРП drives the GUN ONLY.** The antenna is driven by the separate **СУА** off the radar's **КУА** angle channel, not the СРП — the СРП is a *follower* of the radar (findings/01, p.8, 39-40; findings/04, p.219-227).

---

## 5. THE "DATA READY" GATE — ЕСТЬ ДАННЫЕ

**Signal:** **«ЕСТЬ ДАННЫЕ»** (data present) — group of lamps on three panels: commander's, search-operator's, and the СРП itself (findings/10, §13 item 13.1 "лампы 74 / 20 / 157"; findings/04, p.89). *(⚠️ exact item numbers vary by manual — see subsystem-states & the gunner-panel reconciliation; trust the function name, cite the figure.)*

**EXACT conditions — ALL must hold** (findings/08, p.89, §3-B; findings/10, §13):
1. **Driver's hatch CLOSED.**
2. **Barrel cooling RUNNING** (toggle ОХЛАЖДЕНИЕ on, lamp lit; findings/10 control 123).
3. **Elevation ≥ «ОГРАНИЧЕНИЕ УГЛОВ» floor** (commander-dialed 5–40° in 5° steps); below it, **КОНТРОЛЬ БЛОКИРОВОК** faults and **ЦЕПЬ СТРЕЛЬБЫ** cuts (findings/03, p.35-39; findings/10, §4 item 19, §13).
4. **In radar modes 1–3 only: target inside kill zone (зона поражения)** → ЕСТЬ ДАННЫЕ lights on all 3 panels. No DATA ⇒ **no fire in auto modes** (findings/08, p.89; findings/10, §13).

**Kill-zone envelope (implied):** range **200–2500 m** (air; 2000 m ground), altitude ≤1500 m, target speed ≤450 m/s (findings/08, p.19, 38); antenna tracking in az+el (КУА closed); range-strobe aligned within СТРОБ II (3.9 µs) / УУС (0.25 µs) (findings/04, p.150-152, 193).

**Gates downstream:** ЕСТЬ ДАННЫЕ is a **hard fire-blocker in modes 1–3** (the ЦЕПЬ СТРЕЛЬБЫ logic won't fire the sear if dark). It does **NOT** gate the laying drives (those have their own hatch/stow interlocks); it's the crew's "solution is current & valid" cue (findings/08, p.89; findings/10, §13).

---

## 6. MODES & MEMORY

- **Mode 1 — full radar auto-track:** КУА closed (conical-scan error drives antenna), СИД auto-ranges; СРП gets live `β,ε,D`, computes `Q,Ф` continuously (~50–100 ms). No memory; ЕСТЬ ДАННЫЕ lit while tracked (findings/01, p.39).
- **Mode 2 — semi-auto:** gunner points antenna via **Т-55М1** handles (visual via **Б-7** left head); range manually strobed; СРП gets manual angles + auto range. Drive rate ∝ handle deflection (findings/01, p.40; findings/10, §6).
- **Mode 3 — ЗУ (memory/coast):** after ≥5 s priming in mode 1/2, toggle **84 ЗУ** (commander) or **152 ВКЛ.ЗУ** (gunner) disconnects radar; СРП extrapolates `stored_XYZ + V·t`, valid **8–10 s** only, then error too large (findings/01, p.41; findings/10, §4/§5). Use: ride through jamming on last-known velocity.
- **Ground mode ПАН.НАЗЕМН (toggle 29):** reduces drive rates (az 20±5°/s, el 15±5°/s vs 65-75/55-65; creep 0.35°/s) — a **power-drive rate limiter, NOT a СРП mode change** (findings/03, p.76-77; findings/10, §4 item 29).
- **Coast/hold:** СРП holds last `Q,Ф` if track briefly lost; with ВПК disabled (toggle 93) the gun drifts at residual creep; on regain, drives slew back (findings/03, p.77).

---

## 7. QUANTITIES, DEAD ZONES, LIMITS, ACCURACY

- **Dead zone:** **200 m** — below it no reliable targeting; **D < 200 m ⇒ ЕСТЬ ДАННЫЕ does not light** (findings/04, p.50, 184; findings/08, p.19, 34).
- **Max auto-track:** **≥10,000 m** (MiG-17) (findings/04, p.50; findings/08, p.19).
- **Max effective fire:** **2500 m** air / **2000 m** ground (findings/08, p.19).
- **Range resolution:** **75 m**; **accuracy ±10 m**; auto-range drift tolerance **≤20 m/s** (findings/04, p.54, 190-191).
- **§38** Тγ & α accuracy, **§39** static СРП accuracy, **§41** ГАГ gyro-azimuth drift — all are *checked* parameters but **tolerance figures NOT FOUND in sources** (findings/03, p.206-207).
- **Reaction/settling: NOT explicitly stated.** Implied: antenna track ~100–200 ms; drive creep ≤1.5°/s air / ≤0.35°/s ground; СРП analog lag ~50–100 ms.

---

## 8. POWER / COUPLINGS / FAILURE

- **Primary AC:** **220 V ±2 %, 400 Hz** via panel **РЩ4**; РПК-2М draws **≤10.5 kVA** (findings/04, p.33).
- **Aux AC:** **115 V 400 Hz** (from **Б-6В**) powers the СРП panel + **ОПК** (findings/08, p.30).
- **DC:** secondary blocks (Т-10М…Т-59) make ±75/±120/±150/±250/−370/−2000 V stabilized + unstabilized rails for the solvers (findings/04, p.286-292).
- **AC LOST ⇒ fire solution dies:** synchro transmitters stop → ПШГ/ПШВ de-energize clutches → gun stops (brief creep) → **ЕСТЬ ДАННЫЕ goes out** → crew falls back to mode 4 (backup sight/aspect rings) / mode 5 (ground-panorama manual) / АВАРИЙНАЯ (battery-powered drives) (findings/10, §9, §15).
- **ГАГ spin-up ≥3 min** before stabilization valid (toggle 35; lamp ЗАСТОПОРЕНО→ОТСТОПОРЕНО). Firing during spin-up allowed but less accurate. **ГАГ fail (НЕИСПРАВНО):** stabilization off, СРП still computes lead but without attitude; **fire from halt only**, on-the-move blocked (findings/10, §12 step 3, §14 item 8).
- **canFire coupling:** **ЕСТЬ ДАННЫЕ is a hard AND-term** for normal fire (modes 1–3): hatch closed ∧ cooling running ∧ elev ≥ ОГРАНИЧЕНИЕ УГЛОВ ∧ (modes 1–3) ЕСТЬ ДАННЫЕ. **АВАРИЙНАЯ** bypasses the angle floor (cond. 3) and the data gate (cond. 4) but **still needs hatch closed + cooling** (findings/08, p.89; findings/03, p.38-40).

---

## 9. CONTROLS affecting the СРП (range-operator & others)

- **Штурвал дальности** (range handwheel): primary manual range to СРП via Т-22М1; 400 m/turn fine, 2500 m/turn coarse; end-stop microswitches cut the servo + auto-switch СРП on (findings/04, p.177-182; findings/10, §4/§5 item 228).
- **Strobe СТРОБ I / СТРОБ II / УУС:** width select for the КУА gate (СТРОБ II 3.9 µs standard; УУС 0.25 µs to split a formation) — affects which echo the СРП gets (findings/04, p.150-152, 193).
- **Auto-range АВТ / manual НАВЕДЕНИЕ** (buttons on Т-55М1): engage/disengage автодальномер (findings/04, p.190-191; findings/10, §5).
- **РЕГУЛИР.ТОКА ГЕНЕР. (control 213):** magnetron current (init far-left ~5 mA; working **25–33 mA**) — affects echo strength → range accuracy (findings/04, p.88; findings/10, §4/§12).
- **Toggle 84 ЗУ** (memory mode 3); **toggle 96 ДВИГ.K1** (use vehicle course K when moving); **control 85 φ,βу,Tγ** (apply computed lead to drives; off during search) (findings/10, §4/§5/§12).
- **Toggle 18 ШУНТ–СРП:** СРП (normal) vs ШУНТ (bypass — gun laid by прицел-дублер + ракурсные кольца, semi-auto; modes 4–5) (findings/10, §4 item 18, §7, §8).
- **Toggle 152 ВКЛ.ЗУ–ВЫКЛ.ЗУ** (gunner memory engage; syn. 84) (findings/10, §4).
- **СРП ventilation toggle (control 5, fig.15):** normally auto via thermorelay (lamp 6); force-on toggle 5; vent fail → overheat → error/shutdown (findings/10, §5 item 188-190, §14).
- **Related gates:** toggle **35 ГАГ** (gyro ready needed for valid data), **186 НАКАЛ** (receiver filaments), **224 ВЫСОКОЕ** (HV) — all upstream of "data present" (findings/10, §12).

---

## 10. GAPS / CONTRADICTIONS (needs source / pinning)

**Unspecified / ambiguous:**
1. Exact internal solver mechanism (cams/differentials/synchro chains) — in the СРП's own manual, not the system manuals (findings/01, p.27).
2. Ballistic model specifics (drop formula, TOF tables) — implicit, not tabulated (findings/03, p.103).
3. Accuracy tolerances §38/§39/§41 (Tγ, α, static, ГАГ drift) — checks exist, **no numbers** (findings/03, p.206-207).
4. СРП↔ОПК responsibility boundary for parallax/stabilization — functional only, not mathematical.
5. Synchro voltage/frequency/sign conventions — assumed standard, not given.
6. Drive settling time — implied ~100–300 ms, not quantified.
7. Mode-1 acceptable target-acceleration threshold (maneuver error) — only mode-3's 8–10 s is quantified.
8. Exact "data valid" logic behind ЕСТЬ ДАННЫЕ (signal-strength threshold? update timeout? velocity plausibility?) — not documented.
9. СРП servo-loop stability margins/damping — not given.
10. Thermal stability / temp-compensation — not documented (only that ventilation is critical).

**Contradictions:**
1. Slant range D vs horizontal range d used interchangeably for ballistics; conversion not explicit.
2. Parallax: antenna roughly coaxial with gun (turret center) ⇒ mainly **vertical** parallax, but sources also imply lateral; model ambiguous.
3. Earth-relative vs vehicle-relative coordinate frame when firing on the move — not stated explicitly.
4. ЕСТЬ ДАННЫЕ vs mode 3: it reflects *current radar state*, but mode 3 disconnects the radar — so it can go dark while still firing in memory (clarified: irrelevant once ЗУ on).
5. ОГРАНИЧЕНИЕ УГЛОВ electrical implementation (rotary 8-contact switch vs potentiometer+comparator) — not detailed.

---

*End of digest — extraction pass complete. Built from the priority sources above; feeds milestone M4 (`src/shilka-srp.js`).*
