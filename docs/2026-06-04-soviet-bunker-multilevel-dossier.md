# Soviet MULTI-LEVEL Command Bunker — Deep Research Dossier (Phase-2, expansion)

**Purpose:** feed an ultra-detailed, historically accurate **multi-LEVEL** voxel command bunker («ОБЪЕКТ 1180» ЗКП archetype) for ENGENDROS PURGE (Three.js, layered-shading voxel art). This **expands** the existing single-level dossier — it does NOT repeat it. Read both together.
**Date:** 2026-06-04. **Companion to:** `docs/2026-06-03-soviet-bunker-reference.md` (typology, palette §4, single-level layout, base reference images) and the current build `src/bunker.js`.
**Engine constraint baked into the design:** hard floor at y=0 — "deep underground" is delivered by burying a 3-level interior in a tall earth **kurgan/курган**; the player enters at a crown blockhouse and **descends ~3 stacked interior levels**, with a base portal also connecting at grade straight to the deepest level. Surface **observation/firing tower** uses armored **embrasures (бойницы), NO glass**.
**Sourcing rule:** real and sourced only. Where a real per-floor function list is undocumented (e.g. Object 1180 was abandoned at 95% and its floor plan was never published), I say so and base the recommendation on the **documented** analogues (РВСН УКП 15В155 has a published 12-level function stack; СНиП II-11-77 / СН 405-70 publish the убежище room program). Image URLs in §G were HTTP-200 + `image/*` verified; the caption-critical embrasure + console shots were **visually inspected** (not guessed).

---

## A. MULTI-LEVEL VERTICAL ORGANIZATION

### A.1 How real deep multi-level Soviet bunkers stack functions (the documented evidence)

**The governing logic** (consistent across every documented example): the **most protected core is the deepest / most central**; **entry, decontamination and air-handling sit nearest the surface** (they're the dirty/contaminated interface and need the shortest duct run to the intakes); **life-support and command are buried deep**; **utility/cable decks and ventilation plenums are interleaved** between occupied levels.

**Object 1180 ЗКП (Moldova) — the bones, but floor plan unpublished.** Twin cylinders **Ø36 m, ~60 m deep, divided into 10–13 levels**, capped with **~2–3 m reinforced concrete (granite aggregate)**, the cylinders **hydraulically shock-isolated** at the base, **floor-to-floor connections run on the outer cylinder wall** (so any floor can be sealed off), **stairs between floors** (the metal staircase was scrapped). **Unit A = command, Unit B = support/technical** (life-support, power), the two joined by a **20 m tunnel**. Documented facilities (level assignment NOT published): command & control + comms, living quarters, infirmary + pharmacy, power generation, food & water reserves, ventilation & filtration, decontamination, kitchen/dining, **morgue**. Unit A is flooded below the 6th floor today. → We borrow the **massing + the "command block vs. technical block," outer-wall stair, shock-isolation, granite-flecked 2–3 m cap**, NOT a literal floor list (there isn't one).
*(Sources: 28dayslater, oneman-onemap, urbextour, defensionem, visit.md — all secondary urbex/press; the bunker has no published primary plan.)*

**РВСН УКП 15В155 (Pervomaisk/Pobuzke) — the one with a PUBLISHED level-by-level function stack.** A **Ø3.3 m, 33 m, 125-ton** steel capsule, **12 circular levels**, dropped into a silo on **shock-isolation springs/hydraulics**, autonomous ~45 days. Published level functions (top→bottom):
- **"Zero" section** (on the capsule top, outside): power-supply intake.
- **Levels 1–2:** **diesel generators** (power, near the top — closest to exhaust/air).
- **Level 3:** **communications equipment.**
- **Level 4:** **automatic control & monitoring (АСУ / КИП).**
- **Level 5:** **communications apparatus** (radio/cipher).
- **Levels 6–8:** **power supply / batteries / converters.**
- **Levels 9–10:** **missile-launch operations equipment.**
- **Level 11:** **the command post** — battle stations, remote-control panels, comms (the most protected occupied deck, near the bottom).
- **Level 12 (bottom):** **rest room for the duty shift** (deepest = quietest = most protected).
→ The transferable principle: **power/diesel high (exhaust + intake), comms in the upper-middle, command near the bottom, crew rest at the very bottom.**
*(Source: РВСН 15В155 level breakdown, frantsouzov/komariv/unexploredworld LiveJournals — secondary but detailed & mutually consistent; Wikipedia RVSN museum corroborates capsule dims.)*

**Tagansky / Bunker-42 (ГО-42).** **65 m deep (~18 floors of descent)**, **7,000 m²**, **four 150 m tunnels (block-style sections)**, **~600 staff / 30 days**. Sections are **functionally zoned by block** (command, **communications**, **storage**, **ventilation**), with **two deep artesian wells + diesel gensets + air recycling**. Surface portal disguised as a townhouse; a separate **оголовок (exit head) with its own ventilator + door into the "filter floor" (фильтровой этаж)** — i.e. **a dedicated filtration LEVEL near the surface exit**. → Confirms **filtration as its own near-surface level** and **block-zoned functions**.
*(Sources: Wikipedia Tagansky PCP; Commons "Таганский ЗКП оголовок/фильтровой этаж" photos.)*

**Убежище ГО (civil-defence shelter), СНиП II-11-77 / СН 405-70 — the canonical room PROGRAM** (this is the authoritative, published primary-standard source for what rooms exist and how big):
- **Main / occupied:** помещения для укрываемых (shelter rooms), **пункт управления (command post)**, **медпункт (medical)**.
- **Support (вспомогательные):** **ФВП фильтровентиляционное помещение**, **санузлы (latrines)**, **защищённая ДЭС (protected diesel station)**, **электрощитовая (switchroom)**, **склад продовольствия (food store)**, **станция перекачки (pump station)**, **баллонная (gas-cylinder room)**, **тамбур-шлюз (airlock)** + **тамбуры**.
- Hard rule: **the ДЭС must adjoin an external wall** and is **entered through a tambour with TWO hermetic doors opening toward the shelter** (blast + fume isolation). → diesel = on the **outer wall**, double-door isolated.
*(Source: СНиП II-11-77 / СН 405-70, vashdom.ru + meganorm.ru — primary Soviet design code.)*

### A.2 RECOMMENDED 3-LEVEL STACK for our bunker (with rationale + real precedent)

Player descends crown blockhouse → **UPPER** → **MIDDLE** → **DEEPEST** (the deepest also has the base portal at grade). Each level is a ring corridor around a core, ≥2 stairs/ladders between levels so no single choke; functions follow the documented "dirty/air near surface, command + crew deep" logic.

| Level | Functions | Why here (real precedent) |
|---|---|---|
| **UPPER (entry / NBC interface)** — crown blockhouse, just inside the kurgan crown | **Тамбур-шлюз airlock + decon**, **ФВУ filtration room**, **guard/КПП post**, the **diesel-generator room** (against the outer earth wall, double-door isolated, short exhaust run up the kurgan), **gas-cylinder/баллонная** niche | Filtration/decon are the contaminated air interface → shortest duct to surface грибок (Tagansky's фильтровой этаж is at the оголовок). Diesel near the top = short exhaust + intake (РВСН levels 1–2). ДЭС on outer wall + double doors per СНиП. |
| **MIDDLE (living / sustain / signals)** | **Кубрик barracks**, **mess/кают-компания**, **санчасть medical + pharmacy**, **узел связи / radio room**, **оружейная armory**, **provisions + water cistern store**, **санузел latrine** | Crew & sustainment buffered between the dirty top and the command core; comms in the upper-middle (РВСН level 3–5). СНиП groups living + medical + stores together. |
| **DEEPEST (command core / objective)** — base portal connects here at grade | **Оперативный зал / ШТАБ command-operations room (the centerpiece + top loot + 1v1 objective)**, **map/мнемощит panel wall**, **ЗАС cipher room**, **central plotting table**, **document safe**, the **main power switchgear/РУ**, the **duty-shift rest nook** | Command at the most protected core, deepest (РВСН level 11 command, level 12 rest). Object 1180 "Unit A = command." Base portal at grade = the "straight-in to the command block" tunnel (Object 1180 inter-block tunnel idea). |

**Observation/firing TOWER:** rises from the **kurgan crown** above the UPPER level — a stubby armored **НП/firing cupola** with **embrasures only (§C)**, reached by a ladder from the UPPER level. It is the surface high-ground eyes + guns, NOT a glazed lookout.

---

## B. EXHAUSTIVE PER-ROOM EQUIPMENT & FURNITURE INVENTORY

Sizes are **buildable metres** (1 voxel ≈ 1 m). Colors reference the existing palette (`src/bunker.js` consts: `OLIVE`, `EQGRY`, `PIPEG`, `CONCW`, `DADO`, `CREAM`, `LINO`, `RUSTP`, `CD_RED`, `HAZ_Y/HAZ_K`, `AMBER`). "★ MISSING" = not currently in `src/bunker.js`.

### B.1 Тамбур / airlock + decontamination lock (Тамбур-шлюз)
Real chamber per СН 405-70: **8 m² at 0.8 m door, 10 m² at 1.2 m door, min width 2.2 m, double hermetic doors** (one swings outward, one inward).
- **Two гермодвери** (one each end) — see §B.full door spec; handwheel + wedge dogs. *(have)*
- ★ **Gas-mask peg rail (ГП-5):** wall rail at **y≈1.6 m**, 6–10 masks hung — each mask = grey-green ovoid **0.18 × 0.22 × 0.12 m** (round eyepieces) + a **corrugated hose** to a **cylindrical filter can Ø0.11 × 0.10 m** (olive). Color mask `0x4d5a3a`/grey `0x707b78`.
- ★ **ОЗК / Л-1 protective suits on hooks:** tan rubberized ОЗК (`0x8a6a3a`) and olive Л-1 (`0x3f4a2a`) hanging bundles **0.4 × 1.2 × 0.15 m**, + rubber boots below.
- ★ **Dosimeter / radiation board:** a wall instrument panel **0.6 × 0.5 × 0.1 m** (ДП-5 dosimeter = khaki box with a round dial + a wand on a coil cord), beige `EQGRY`.
- ★ **Foot-bath / decon sump:** the **round floor hatch** *(have — keep)* + a shallow **rectangular dezbar foot-bath 0.9 × 0.5 × 0.12 m** recessed in the floor, dark water `0x2a3036`.
- ★ **Boot/equipment rack:** open steel shelving **1.2 × 1.6 × 0.4 m**, `EQGRY.lo`.
- ★ **ДУ pressure/equalization valves (КИДы):** 2–3 red butterfly valves **Ø0.18 m** on a galvanized pipe stub through the wall, `CD_RED` wheels on `PIPEG`.
- **Round floor sump hatch** Ø0.5 m *(have)*.

### B.2 ФВУ filtration room (Фильтровентиляционная)
Real kit (verified dims): **ФПУ-200 filter-absorber = Ø0.445 m × h0.407 m, ~30 kg, protective-green steel, 0.10 m duct stub** (stacked in banks of 3). **ПФП-1000 pre-filter = a large drum**. **ЭРВ-600/300 electric fan** (intake + overpressure). СНиП ФВП room **7–10 m²**.
- **Bank of ФПУ-200 filter-absorber columns** — **3+ green cylinders Ø0.45 × 0.4 m**, stacked 2–3 high into a column **~1.2 m**, on a steel frame, each with a **0.1 m duct** elbow. *(have filterCol — refine to the real squat Ø0.45 proportion + bank them)*
- ★ **ПФП-1000 pre-filter drum:** big olive cylinder **Ø0.8–1.0 m × h1.6 m** on a base, top inlet flange. *(have a prefilter drum — keep, label it)*
- ★ **ЭРВ-600/300 electric fan:** a **squat scroll/volute housing 0.7 × 0.7 × 0.6 m** (olive) with a **motor barrel Ø0.3 × 0.4 m** on the side and a **belt guard**, on a plinth, ducts in/out. *(have a fan box — upgrade to a scroll shape)*
- ★ **Hand-crank backup blower (РН/ЭРВ manual drive):** a wheel-crank **Ø0.5 m** on a frame beside the fan (the "5 kg lever" manual mode) — `RUSTP` wheel.
- ★ **Manometer / pressure-gauge КИП board:** wall panel **1.4 × 1.0 m** with a **row of 4–6 round white gauges Ø0.13 m** (подпор / overpressure gauges) + a U-tube **water manometer** (a clear bent tube on a scale). *(have a manometer board — keep, add the U-tube)*
- ★ **Regeneration cartridges РП-100 (or РУ regenerative drums):** stacked small olive cans **Ø0.2 × 0.25 m** on a shelf (CO2/O2 regeneration for closed-cycle mode).
- ★ **Galvanized ducting:** **square or round galvanized ducts Ø0.3–0.5 m** running wall→ceiling→the surface грибок, with **flanged joints every ~1.2 m** and **damper valves** (red handwheels). *(have a vertical duct — extend the run + flanges)*
- ★ **КИП control panel:** small beige cabinet **0.6 × 1.2 × 0.3 m**, toggles + 2–3 indicator lamps (`AMBER`/`CD_RED`).

### B.3 Diesel generator room (ДЭС)
On the **outer wall**, entered through a **double-door tambour** (СНиП). РВСН placed diesels on the top levels (short exhaust).
- **Engine-generator set (АД/ДГ unit)** on a concrete plinth — big dark-olive block **2.4 × 1.6 × 1.4 m** (engine) + a **cylinder-bank** + a **generator drum** at one end (grey). *(have genset — keep, add radiator)*
- ★ **Radiator / heat exchanger:** a **finned slab 1.0 × 1.2 × 0.3 m** at the engine front (dark grey, fine vertical fin lines) + a small header tank.
- **Exhaust pipe + silencer up to ceiling** — Ø0.13 m rust pipe with a **fat silencer can Ø0.3 × 0.8 m** inline, lagged. *(have exhaust — add the silencer can)*
- ★ **Day fuel tank:** a **cylindrical or rectangular tank 0.8 × 1.0 × 1.4 m** on a stand (`RUSTP`/olive) with a **sight-glass** stripe and a tap. *(have a fuel tank — keep)*
- **Switchgear / распределительный щит (РУ):** a **wall of grey steel cabinets** ~**0.6 deep × 2.0 high**, with **rows of breaker toggles, round red indicator lamps, a yellow-black ⚡ hazard triangle, white КИП boxes** (exactly the verified RVSN-panel look). *(have switchgear cabinet — upgrade to the multi-cabinet + ⚡ triangle)*
- ★ **Control panel with gauges:** a sloped desk **1.2 × 0.2 × 0.5 m** with **engine gauges** (oil pressure, temp, RPM, voltage/frequency — round dials), a few toggles.
- ★ **Battery bank (стартерные АКБ):** a low rack of **6–8 black battery boxes 0.25 × 0.2 × 0.18 m** with red/black terminals, on a 2-tier steel shelf.
- ★ **Oil drums:** 2–3 **steel drums Ø0.58 × 0.88 m** (the real 200 L barrel), olive/rust, one on its side on a cradle with a tap.
- ★ **Fire point:** a **sand box 0.6 × 0.4 × 0.4 m** + a **conical fire bucket** (red, hung point-down) + a wall **огнетушитель** (red ОУ/ОП extinguisher Ø0.15 × 0.5 m). *(verified in the RVSN photo — a red extinguisher stands by the switchgear)*

### B.4 Command / operations room (CENTERPIECE — DEEPEST level)
СНиП пункт управления: **20–40 m², 6 workstations**. This is the largest, tallest space.
- ★ **Wall map boards (theatre maps):** the big **map wall 3–4 × 2 m** — a framed board with a **plexi overlay**, faint map lines, grease-pencil marks, hung **grease pencils on strings**. *(have a green plexi map board — keep, add the overlay + pencils)*
- ★ **Status / mnemonic panel (мнемощит):** a **large illuminated schematic board 2.5 × 1.5 m** — a network of painted lines with **dozens of small indicator lamps** at the nodes (red/amber/green), a Soviet-grid one-line diagram.
- **Operator consoles (П-style):** rows of grey-steel consoles **1.4 × 1.5 × 0.7 m** with **dark sloped panels of toggles + indicator lamps + round gauges** + a **switch desk**. *(have console_ ×3 — keep, this matches the verified RVSN panel: grey cabinet, rows of red round lamps, breaker toggles, ⚡ triangle, white КИП boxes)*
- **Central plotting table** — a low table **2.2 × 0.9 × 1.2 m** with a **map-glass top** (`0x243018`) and a rim lip; chairs around. *(have — keep)*
- **Field telephones:** **ТА-57 (olive-green bakelite box 0.22 × 0.16 × 0.10 m with a black handset on top + a side hand-crank)** — place 2 green + 1 **red** (the red "ВЧ" hotline). *(have 2 phone boxes — refine to ТА-57 shape w/ handset + crank)*
- ★ **ЗАС cipher / secure-comms gear:** a **locked grey cabinet 0.6 × 1.8 × 0.5 m** with a small panel + a teleprinter-like slot, a **red "ЗАС" plate**, often in a **caged sub-room** corner.
- ★ **Clocks row (Moscow + time zones):** 3 wall clocks *(have)* — keep, **label them** МОСКВА / and 2 others under each.
- **Lenin / GenSec portrait** *(have)* + **red banner with gold star** *(have)* — keep.
- ★ **Planning desks + chairs:** 2 plain desks **1.2 × 0.75 × 0.6 m** + 4 steel **stools/chairs** (0.4 × 0.45 × 0.45 seat + back).
- ★ **Document safe (сейф):** a heavy grey **steel safe 0.6 × 0.9 × 0.5 m** with a round combination dial + lever handle.
- ★ **КП journal / log on a lectern:** a sloped wooden lectern **0.5 × 1.1 × 0.4 m** with an open ledger.
- ★ **Green banker's plotting lamp** *(have)* — keep.

### B.5 Communications / radio room (Узел связи)
- ★ **Р-140 «Высота» valve radio sets in racks:** tall khaki-green **equipment cabinets 0.6 × 1.6 × 0.6 m**, **front panels crowded with round meters, illuminated dials, knobs and toggle rows**; 2–3 cabinets side by side (transmitter + Р-155П receiver + Р-311 receiver). *(have a valve-radio stack — upgrade to tall racks w/ meters)*
- ★ **Р-105М man-pack set** on the bench: a small khaki box **0.2 × 0.3 × 0.12 m** with a telescoping whip antenna and a frequency dial.
- ★ **П-193М switchboard (коммутатор, 10 lines):** a sloped-front box **0.4 × 0.3 × 0.3 m** with **a grid of jacks + cord plugs + line lamps + drop-flags**, a hand-crank on the side.
- ★ **Telegraph / Morse key:** a small **brass key on a black base 0.12 × 0.06 m** on the desk.
- ★ **Teletype СТ-2М:** a **typewriter-like teleprinter 0.5 × 0.3 × 0.4 m** on its own stand, with a paper roll + tape spool, grey.
- ★ **Patch / cross-connect panels:** a wall **patch field 0.8 × 1.0 m** of jack rows + looped patch cords.
- ★ **Headphones** hung on a hook + an **operator desk + gooseneck lamp** *(partly have a desk + dials — keep, add headphones/teletype)*.
- ★ **Antenna lead-in / tuning unit (АНСУ):** a small grey box where a **thick feeder cable** drops from the ceiling to the wall, near a ceramic stand-off insulator.
- ★ **Cipher machine (Фиалка-class):** a typewriter-sized grey machine with a keyboard + rotor lid (can be the ЗАС item shared with the command room).

### B.6 Medical / санчасть
СНиП медпункт **10–12 m²**.
- ★ **Exam couch / кушетка:** padded couch **1.9 × 0.6 × 0.6 m** (dark leatherette `0x5a3a2a` top, steel legs).
- ★ **Instrument cabinet (glass-front):** white-enamel **0.8 × 1.7 × 0.4 m** with a **glass upper door** (a lighter inset face) showing trays of instruments.
- ★ **Medicine shelves:** open white shelving **1.2 × 1.6 × 0.3 m** lined with small **bottles/tins** (rows of tiny boxes, varied muted colors).
- ★ **Stretcher / носилки:** a canvas-and-pole stretcher **2.0 × 0.5 m** leaning on the wall or on trestles.
- ★ **Oxygen bottle:** a tall **blue gas cylinder Ø0.2 × 1.4 m** (medical O2 = blue `0x2a5a9a`) in a wall clamp + a regulator.
- ★ **Sink / basin:** a white wall basin **0.5 × 0.4 × 0.3 m** with a tap + a small mirror.
- ★ **First-aid АИ kits:** a couple of **АИ-2 orange first-aid boxes 0.2 × 0.15 × 0.05 m** + a wall **red-cross board 0.4 × 0.4 m** (white field, red cross).
- ★ **Gurney / wheeled trolley:** a steel instrument trolley **0.6 × 0.85 × 0.4 m** on casters with a tray.

### B.7 Barracks / кубрик
СНиП: **2-tier nары = 0.55 × 1.8 m per person; 3-tier adds ~0.45 m between tiers.** Floor norm 0.4–0.5 m²/person.
- **Steel double/triple bunks + thin mattresses** *(have bunk ×N)* — keep; consider **triple-tier** versions (3 × 0.55 m wide × 1.8 m long, 0.45 m clearance) to read "max autonomy."
- ★ **Lockers / тумбочки:** small bedside cabinets **0.4 × 0.6 × 0.4 m** (one per bunk pair), painted `EQGRY` or wood.
- **Mess table + stools** *(have)* — keep; mess table **1.4 × 0.75 × 0.8 m** + 4 stools.
- ★ **Samovar / water urn:** a metal **urn Ø0.4 × 0.6 m** (steel/brass) on a side table — the кипяток point.
- ★ **Coat hooks + boot rack:** a wall hook rail at y≈1.7 m with hung greatcoats (olive) + a low **boot rack 1.0 × 0.2 × 0.3 m**.
- ★ **Political-info / library corner (ленинский уголок):** a small **bookshelf 0.8 × 1.2 × 0.3 m** + a **red felt board 0.8 × 0.6 m** with a gold star + a slogan strip, and a portrait.
- **Small stove w/ flue** *(have)* — keep.

### B.8 Armory / оружейная
Behind a **caged steel door**.
- **Rifle racks (АК/СКС/РПК silhouettes):** a back cabinet **1.6 × 1.9 × 0.3 m** with **vertical rifle slots + barrel clamps** *(have rifleRack — keep, vary silhouettes: AK vs RPK long-mag vs SKS)*.
- ★ **Pistol cabinet:** a small wall **steel cabinet 0.5 × 0.7 × 0.25 m** with pegged pistol outlines + a hasp lock.
- **Ammo crates (wooden, stencilled):** **0.5 × 0.35 × 0.3 m** wooden boxes with rope handles + white stencil (e.g. «7,62×39» / a lot number) *(have ammo crates — keep, add stencils + rope handles)*.
- ★ **Grenade boxes:** flat wooden **0.4 × 0.3 × 0.2 m** boxes stencilled «Ф-1» / «РГД-5» *(have generic boxes — relabel)*.
- ★ **Cleaning bench with rods/oil:** a workbench **2.0 × 0.9 × 0.7 m** *(have)* — add **cleaning rods in a rack**, an **oil can (масленка)**, rag, a small vise.
- ★ **Scales (весы):** a small balance-scale **0.3 × 0.3 × 0.3 m** for powder/issue.
- ★ **Issue ledger (книга выдачи):** an open ledger on the bench + a stamp.
- **Caged steel door** — a grille door instead of a solid leaf (vertical bars on a steel frame).

### B.9 Provisions / storeroom & water
СНиП: food **2 m²/100 people**; water cistern + **станция перекачки** + баллонная.
- ★ **Ration crates:** stacked wooden + cardboard boxes **0.5 × 0.4 × 0.3 m**, stencilled (е.г. «СУХОЙ ПАЁК», «КОНСЕРВЫ»).
- ★ **Water cistern / tank:** a big **steel tank Ø1.4 × 1.8 m** or a rectangular **2.0 × 1.2 × 1.8 m** cistern on a plinth, with a level-glass stripe, a tap, and a «ВОДА ПИТЬЕВАЯ» stencil. *(this is the water store referenced — currently missing)*
- ★ **Jerry cans (канистры):** a row of **olive 20 L cans 0.18 × 0.45 × 0.35 m** with the X-rib face.
- ★ **Shelving with tins:** open steel racks **1.2 × 1.8 × 0.4 m** lined with rows of small cans.

### B.10 Latrine / санузел
СНиП санузел **16–20 m²**.
- ★ **Toilet stalls:** 2–3 low partitioned stalls **0.9 × 1.2 m** each (concrete/painted partitions to y≈1.5 m), a simple pan/чаша.
- ★ **Washbasins:** a **trough or row of 2–3 basins** on a wall ledge **1.6 × 0.4 × 0.3 m** + taps + a long mirror strip.
- ★ **Water tank:** a small overhead **cistern 0.6 × 0.4 × 0.4 m** with a pull-chain.

### B.11 Observation / firing post (НП) tower
See §C for embrasure geometry. Equipment inside the cupola:
- ★ **Periscope (ПИР / ТР / перископ разведчика):** a vertical **tube Ø0.1 × 1.0–1.4 m** rising through the roof, with an eyepiece head + a swivel handle at sitting height. *(have a periscope stub on the surface cupola — extend it down into the post)*
- ★ **Observation slit bench / firing step:** a concrete step **at sill y≈1.2–1.4 m** to stand on / lean against the embrasure (a horizontal ledge 0.4 m deep).
- ★ **Range cards / карточка огня:** a small board **0.4 × 0.3 m** by the embrasure with sectors + ranges sketched.
- ★ **Field phone:** a ТА-57 on a wall bracket (links to the command room).
- ★ **Ammo ready-boxes at the embrasures:** an open **0.5 × 0.35 × 0.3 m** crate at each firing slit with belted/boxed ammo at the ready.
- ★ **Embrasure shutter (заслонка):** the armored steel plate over the slit (see §C) — a movable plate the player conceptually "opens."

### B.12 Corridors / ring (each level)
- **Overhead pipe runs** (galvanized) *(have pipeRun)* — keep; add **red fire-line + yellow gas-line** accent pipes alongside (palette has both).
- ★ **Cable trays:** a **dark ladder-tray 0.3 × 0.06 m** along the wall at y≈2.2 m **stuffed with thick black cable bundles** (the verified RVSN look — fat black looms strapped to the wall in trays) + a **Hi strip** so it's not a blob.
- **Caged bulkhead lamps + red emergency lights** *(have lamp())* — keep.
- ★ **Fire points:** a recurring **fire board (пожарный щит)** — red board **1.2 × 1.0 m** with a hung **axe, crowbar/лом, conical bucket**, + a **sand box** + an **огнетушитель** beneath. (Verified: extinguishers + red-painted safety rails recur in these bunkers.)
- ★ **КИП niches:** small wall recesses **0.5 × 0.6 × 0.25 m** with a gauge cluster.
- **Signage** *(have room signs)* — expand per §E.
- **Narrow-gauge rail + flatbed trolley** *(have)* — keep (great for the supply/ammo theme).
- ★ **Red/yellow safety hand-rails** around floor hatches + level openings (verified RVSN detail) — tube rails `CD_RED` + `HAZ_Y`.

---

## C. OBSERVATION & FIRING POSITIONS — EMBRASURES / БОЙНИЦЫ

**Visually verified from two Commons photos (KaUR ДОТ embrasures), which I inspected:**
- *Interior view (Дот №555):* the embrasure is a **deeply splayed concrete throat lined with riveted/bolted STEEL armor plates** (visible bolt-head rows on the splay walls), the throat **narrowing to a small bright slit at the exterior** — i.e. the **funnel is WIDE inside, NARROW outside** (the gunner has a wide traverse arc; the enemy sees a tiny hole). A wooden/steel frame edges the outer slit.
- *Exterior view (ДОТ 481):* a **wide, low horizontal slit** set in a thick concrete wall, a **heavy concrete lintel above**, a **firing-step sill below**, the jambs flaring back into the dark splayed interior. Pinkish steel edge at the jambs.

### C.1 Embrasure (амбразура / бойница) — buildable geometry

**Verified dimensions** (DZOT engineering text + ЖБОТ armored cupola spec):
- **Exterior slit opening:** **~0.18 m high × 0.40 m wide** (DZOT standard «18×40 см»). For the ЖБОТ armored cupola, **0.37–0.40 m high × 0.40–0.50 m wide**. → **Use ~0.20 × 0.45 m** for a clear gameable slit that still reads "armored loophole."
- **Funnel/раструб:** a **conical/box splay WIDENING from the narrow exterior slit to a wide interior mouth** (so the weapon traverses). Interior mouth ≈ **0.9–1.1 m wide × 0.5–0.6 m high**. The splay sets the **firing sector**.
- **Firing sectors (the раструб geometry encodes these):** **horizontal ≈ 45°** total (≈22.5° left/right of the axis); **vertical ≈ 13°** total = **5° up, 8° down** from horizontal. Build the splay walls at ~22° off-axis each side; tilt the splay so the down-look is a bit more than the up-look.
- **Sill (firing-line) height:** **~1.2–1.4 m** above the interior floor (a standing/leaning shooter). DZOT firing line = **140 cm**. → **sill at y≈1.3 m.**
- **Wall thickness around the embrasure:** DZOT front wall ≥**0.7 m** (optimal ~1.0 m); ЖБОТ cupola wall **0.13 m steel-reinforced concrete**. → make the embrasure block **~0.6–0.9 m deep** (reads massive).
- **Armored embrasure box / заслонка (shutter):** a **steel plate several cm thick** that normally **covers the slit from the inside** and **tilts inward to open**; it usually has a **tiny gun-port + observation slit** in it. Build a **0.5 × 0.3 × 0.04 m steel plate** hinged at the top inside the splay, shown swung up/open; closed = a riveted steel plate flush over the slit. Color steel `STEELB`, bolt rows `RUSTP`.
- **Steel-plate splay lining:** line the splay walls + soffit + sill with **riveted steel plates** (the verified look) — boxes `STEELB.mid` with **dot rows** of `RUSTP.lo` bolt heads every ~0.15 m.
- **Dead zone:** ~5–10 m of unreachable ground directly in front (the ~1 m elevation) — gameplay-relevant: a flanker hugging the base wall is safe from that slit.

### C.2 Observation post (НП) cupola / periscope — how it differs from a firing slit
An **НП** uses **observation** not firing: a **броневой колпак (armored cupola)** — verified **Ø1.7 m, height 0.9 m, wall 0.13 m, ~1.3–2.0 t** — with a **roof hole for a trench periscope closed by a 30 mm-thick slide-шторка (задвижка)**, and/or **narrow observation slits with a бронезаслонка** (armored shutter). The difference: an НП slit is **smaller, often round/slit + has a periscope through the roof**; a firing embrasure is the **wide splayed slit at sill height with traverse**. → On our tower: **mix one periscope cupola (observation) + 2–3 firing embrasures (engagement)**, NO glass anywhere.

### C.3 Recommended tower build
A squat **armored blockhouse 3 × 3 × 2.2 m** on the kurgan crown (concrete + steel-edge), with **3 firing embrasures** (one per exposed face) at sill y≈1.3 m (slit 0.20 × 0.45 m, splayed inside, steel-lined, hinged заслонка), a **periscope cupola** (Ø1.7 hemisphere + a 30 mm slit-shutter) on the roof, a **firing step** ledge inside, **ammo ready-boxes** at each slit, and a **ladder down** to the UPPER level. Lit by one dim amber lamp; flashlight-motivating.

---

## D. VERTICAL CIRCULATION — LADDERS, STAIRS, ESCAPE HATCHES

**Stairs (between levels):** ГОСТ/СНиП — **step rise 0.15–0.18 m (max 0.20), going ≥0.25 m**, flight width **≥1.2 m** (СН 405-70: stair width = 1.5× door width, so ~1.2 m for a 0.8 m door). Engine note: keep each step **≤0.18 m** (the ≤0.62 m step-up rule is satisfied trivially); a flight of **12–16 steps** drops one level. A **half-landing** dog-leg every flight (saves footprint, breaks sightlines).

**Steel rung ladder / скоб-трап (vertical shaft):** ГОСТ — **rung spacing 0.15–0.20 m** (industrial vertical: **0.225–0.30 m**), rung **depth/standoff ≥0.25 m from wall**, ladder **width ~0.52 m** (rails 60×25 mm). A **safety hoop cage (ограждение)** of Ø0.7 m hoops every ~0.8 m for shafts deeper than ~2 m. Build: two vertical rails + horizontal rungs every 0.28 m + hoop rings — `RUSTP`/`EQGRY`. *(the existing escape-ladder concept — upgrade to a real caged скоб-трап)*

**Escape / emergency-exit shaft (СН 405-70, verified):**
- The escape tunnel/gallery clear cross-section: **0.9 × 1.3 m** (or round **≥0.5 m** min for the tiniest); for our build use **Ø ~0.8–1.0 m** round shaft (a skob-trap inside).
- **Exit head (оголовок):** stands **1.2 m above grade** (or **0.5 m** min if far from rubble), with a **0.6 × 0.8 m louvred proem** (internal-opening louvers) for the 1.2 m head, or a **0.6 × 0.6 m roof hatch** for a low head. *(have escapeHatch lid — keep, add the оголовок box + louvre)*
- The shaft connects the **DEEPEST level up to a surface hatch** (a fast flank/escape, one-way down in gameplay), independent of the main descent.

**Surface escape hatch:** round armored lid **Ø0.8–1.0 m**, dogged with 6 bolts, a latch handle *(have escapeHatch — keep)*; sits on the оголовок.

---

## E. PER-ROOM CYRILLIC SIGNAGE & WALL MARKINGS

Render as the existing `signPlane(...)` textured planes, offset ~0.005 off the wall, **OPAQUE pass** (matches the T-90M poster pattern). Stencil color = faded cream `#c0b48a`/`#9a948a` on concrete; hazard = `#d9b43a`/black; ГО emblem = blue `#1f5fa8` triangle on orange `#e07b1e`. Place door labels **above the door lintel, y≈2.3–2.6 m**, facing the corridor; hazards at eye height (y≈1.6 m).

**Room labels (above each door, facing the ring):**
- ШТАБ • ОПЕРАТИВНЫЙ ЗАЛ (command) — *(have ШТАБ)*
- УЗЕЛ СВЯЗИ • СВЯЗЬ • АППАРАТНАЯ (comms)
- ДИЗЕЛЬНАЯ • ДЭС (diesel) — *(have ДИЗЕЛЬНАЯ)*
- ФВУ • ФИЛЬТРОВЕНТИЛЯЦИЯ • ФВП (filtration) — *(have ФВУ)*
- ОРУЖЕЙНАЯ (armory) — *(have)*
- КУБРИК • КАЗАРМА (barracks) — *(have КУБРИК)*
- САНЧАСТЬ • МЕДПУНКТ (medical)
- САНУЗЕЛ (latrine)
- ТАМБУР • ШЛЮЗ • ТАМБУР-ШЛЮЗ (airlock)
- НАБЛЮДАТЕЛЬНЫЙ ПУНКТ • НП (observation tower)
- СКЛАД • ПРОДОВОЛЬСТВИЕ (store)
- ЭЛЕКТРОЩИТОВАЯ (switchroom)
- БАЛЛОННАЯ (cylinder room)
- ЗАС (cipher — on the secure cabinet/sub-room)

**Wayfinding / level:**
- ЗАПАСНЫЙ ВЫХОД (emergency exit — at the escape shaft) — *(have)*
- ВХОД (entrance) — *(have)*; ВЫХОД (exit)
- УБЕЖИЩЕ (shelter — on the portal fascia) — *(have)*
- УРОВЕНЬ 1 / УРОВЕНЬ 2 / УРОВЕНЬ 3 (level numbers, at each stair head); or ЭТАЖ −1/−2/−3
- К КОМАНДНОМУ ПУНКТУ → (directional arrow to command)
- ОБЪЕКТ 1180 (object number, on a pier) — *(have)*

**Hazard / instruction (eye height):**
- НЕ КУРИТЬ (no smoking — esp. diesel/fuel)
- ОПАСНО (danger) + a yellow-black **⚡ lightning triangle** on switchgear (verified in the RVSN photo)
- ГЕРМОДВЕРЬ ЗАКРОЙ ЗА СОБОЙ (close the hermetic door behind you — on/beside each гермодверь)
- ГРАЖДАНСКАЯ ОБОРОНА + the **ГО blue-triangle-on-orange emblem** — *(have ГО)*
- ВЫСОКОЕ НАПРЯЖЕНИЕ (high voltage — switchroom)
- hazard **chevrons** (yellow-black diagonals) on door edges + steps + the genset *(have chevron())*
- РАДИАЦИОННАЯ ОПАСНОСТЬ (radiation hazard — decon/airlock) + the trefoil
- ПОЖАРНЫЙ ЩИТ (fire board label)

---

## F. MATERIALS & WEATHERING REFINEMENTS (beyond existing §4)

Keep the §4 palette. Add these **weathering passes** (thin overlay boxes / vertex tints, ~0.004 proud):
- **Rust streaks under form-ties:** short **vertical streaks `0x8a5a3c`** dripping below each form-tie dot on concrete (you already place tie dots — add a 0.02 × 0.4 m streak under each).
- **Soot/oil over the genset + exhaust:** a **dark wash `0x2a2620`** smudge on the ceiling above the genset and a vertical soot column behind the exhaust; oily-dark floor `0x3a342c` *(have the dark floor — extend the ceiling soot)*.
- **Lime-wash flaking:** on the airlock/corridor whitewash, **patchy `CREAM.lo` over `CONCW`** with irregular bare-concrete patches (a few `CONCW.mid` rectangles breaking the cream).
- **Cable-tray dark + Hi strip:** trays `0x3d3a36` body with a thin **`0x4d4a44` top strip** so they read (never a flat black blob).
- **Lino wear paths:** along the ring corridor centre-line, a **worn lighter `LINO.hi` strip** (foot traffic) and **darker `LINO.slot`** at the room thresholds.
- **Condensation / water stains:** pale **`0x6f7a74` blooms** low on the deepest-level walls + the round sump; a **dripping `0x35414a` damp patch** under pipe joints.
- **Salt/efflorescence:** faint **`0xcfc8b8` chalky streaks** on the buried concrete (groundwater leaching).
- **Verdigris/moss at the embrasures (exterior):** green `0x5e6a32` algae stain below each surface slit (verified — the embrasure photos are green-stained).
- **Steel embrasure plates:** `STEELB.mid` body, **bolt-head dot rows `RUSTP.lo`**, edge rust `RUSTP.mid` (verified riveted-plate look).
- **Beige genset/switchroom walls:** the verified RVSN room is **warm beige `0xcabf9e`-ish**, not teal — use a beige dado in the technical rooms for variety vs. the command room's teal.

---

## G. REFERENCE IMAGES (HTTP-200 + image/* verified; ★ = visually inspected by me)

**New (this dossier) — all 960px Wikimedia thumbs, verified `200 image/jpeg`:**

1. ★ **DZOT/ДОТ embrasure — INTERIOR view (Дот №555, KaUR):** deeply splayed concrete throat **lined with riveted steel armor plates** (bolt-head rows), narrowing to a small exterior slit — *the* reference for the embrasure funnel + steel lining + §C geometry.
   `https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/%D0%94%D0%BE%D1%82_%E2%84%96_555_%D0%90%D0%BC%D0%B1%D1%80%D0%B0%D0%B7%D1%83%D1%80%D0%B0_DSC_0994.jpg/960px-%D0%94%D0%BE%D1%82_%E2%84%96_555_%D0%90%D0%BC%D0%B1%D1%80%D0%B0%D0%B7%D1%83%D1%80%D0%B0_DSC_0994.jpg`
2. ★ **DOT/ДОТ embrasure — EXTERIOR view (ДОТ 481):** wide low horizontal slit, heavy concrete lintel, firing-step sill, splayed dark interior — the outer embrasure proportions + lintel/sill.
   `https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/%D0%94%D0%9E%D0%A2_481_%D0%B0%D0%BC%D0%B1%D1%80%D0%B0%D0%B7%D1%83%D1%80%D0%B0.jpg/960px-%D0%94%D0%9E%D0%A2_481_%D0%B0%D0%BC%D0%B1%D1%80%D0%B0%D0%B7%D1%83%D1%80%D0%B0.jpg`
3. **DOT embrasure (Дот №561 central, KaUR):** another splayed embrasure for cross-checking splay angle.
   `https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/%D0%94%D0%BE%D1%82_%E2%84%96_561_%D0%A6%D0%B5%D0%BD%D1%82%D1%80%D0%B0%D0%BB%D1%8C%D0%BD%D0%B0_%D0%B0%D0%BC%D0%B1%D1%80%D0%B0%D0%B7%D1%83%D1%80%D0%B0_DSC_0953.jpg/960px-%D0%94%D0%BE%D1%82_%E2%84%96_561_%D0%A6%D0%B5%D0%BD%D1%82%D1%80%D0%B0%D0%BB%D1%8C%D0%BD%D0%B0_%D0%B0%D0%BC%D0%B1%D1%80%D0%B0%D0%B7%D1%83%D1%80%D0%B0_DSC_0953.jpg`
4. **DOT embrasure (Дот №118, KaUR):** embrasure in a fortified wall, context.
   `https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/118_%D0%B4%D0%BE%D1%82_%D0%B0%D0%BC%D0%B1%D1%80%D0%B0%D0%B7%D1%83%D1%80%D0%B0.jpg/960px-118_%D0%B4%D0%BE%D1%82_%D0%B0%D0%BC%D0%B1%D1%80%D0%B0%D0%B7%D1%83%D1%80%D0%B0.jpg`
5. ★ **RVSN command-post control panel / switchgear (Strategic Missile Forces Museum):** grey-steel cabinet, **rows of round red indicator lamps + breaker toggles, a yellow-black ⚡ hazard triangle, white КИП boxes**, beige walls with **fat black cable looms in trays**, red+yellow safety rails, a red fire-extinguisher, a floor hatch with grating — *the* reference for the command consoles, switchgear, cable trays, safety rails, fire point.
   `https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Strategic_Missile_Forces_Museum_in_Ukraine_-_control_panel.jpg/960px-Strategic_Missile_Forces_Museum_in_Ukraine_-_control_panel.jpg`
6. **RVSN — passage "to the command post":** the capsule access gallery (corridor + door + cable runs).
   `https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Strategic_Missile_Forces_Museum_-_to_the_command_post.JPG/960px-Strategic_Missile_Forces_Museum_-_to_the_command_post.JPG`
7. **RVSN — underground postern to the UCP:** underground gallery to the command capsule (vertical-circulation + tunnel feel).
   `https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Underground_postern_to_the_UCP.JPG/960px-Underground_postern_to_the_UCP.JPG`
8. **RVSN — ground antennas:** lattice antenna field on the steppe (surface antenna mast ref).
   `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Ground_antennas%2C_Strategic_Missile_Forces_Museum.JPG/960px-Ground_antennas%2C_Strategic_Missile_Forces_Museum.JPG`
9. **Bunker-42 interior (Cold War Museum BUNKER 42):** Tagansky underground space — command/comms fit-out, lighting.
   `https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Cold_War_Museum_BUNKER_42.jpg/960px-Cold_War_Museum_BUNKER_42.jpg`
10. **Bunker-42 interior (Bunker 42 5):** another Tagansky interior view.
    `https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Bunker_42_5.jpg/960px-Bunker_42_5.jpg`
11. **Tagansky ЗКП — 2nd corridor (Таганский ЗКП второй коридор):** authentic ЗКП corridor — pipes, lighting, door reveals (corridor dressing ref).
    `https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/%D0%A2%D0%B0%D0%B3%D0%B0%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%97%D0%9A%D0%9F_%D0%B2%D1%82%D0%BE%D1%80%D0%BE%D0%B9_%D0%BA%D0%BE%D1%80%D0%B8%D0%B4%D0%BE%D1%80.JPG/960px-%D0%A2%D0%B0%D0%B3%D0%B0%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%97%D0%9A%D0%9F_%D0%B2%D1%82%D0%BE%D1%80%D0%BE%D0%B9_%D0%BA%D0%BE%D1%80%D0%B8%D0%B4%D0%BE%D1%80.JPG`
12. **Tagansky ЗКП — emergency-exit shaft (шахта запасной выход):** the vertical escape shaft with a caged ladder — *the* ref for §D escape shaft + скоб-трап.
    `https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/%D0%A2%D0%B0%D0%B3%D0%B0%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%97%D0%9A%D0%9F_%D1%88%D0%B0%D1%85%D1%82%D0%B0_%D0%B7%D0%B0%D0%BF%D0%B0%D1%81%D0%BD%D0%BE%D0%B9_%D0%B2%D1%8B%D1%85%D0%BE%D0%B4.JPG/960px-%D0%A2%D0%B0%D0%B3%D0%B0%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%97%D0%9A%D0%9F_%D1%88%D0%B0%D1%85%D1%82%D0%B0_%D0%B7%D0%B0%D0%BF%D0%B0%D1%81%D0%BD%D0%BE%D0%B9_%D0%B2%D1%8B%D1%85%D0%BE%D0%B4.JPG`
13. **Tagansky ЗКП — оголовок ventilator (оголовок вентилятор):** the exit-head structure with a ventilator — §D оголовок + surface vent ref.
    `https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/%D0%A2%D0%B0%D0%B3%D0%B0%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%97%D0%9A%D0%9F_%D0%BE%D0%B3%D0%BE%D0%BB%D0%BE%D0%B2%D0%BE%D0%BA_%D0%B2%D0%B5%D0%BD%D1%82%D0%B8%D0%BB%D1%8F%D1%82%D0%BE%D1%80.JPG/960px-%D0%A2%D0%B0%D0%B3%D0%B0%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%97%D0%9A%D0%9F_%D0%BE%D0%B3%D0%BE%D0%BB%D0%BE%D0%B2%D0%BE%D0%BA_%D0%B2%D0%B5%D0%BD%D1%82%D0%B8%D0%BB%D1%8F%D1%82%D0%BE%D1%80.JPG`
14. **Tagansky ЗКП — door into the filter floor (оголовок дверь в фильтровой этаж):** a hermetic door into the filtration level — §A.1 (filtration as a near-surface level) + door ref. (non-thumb original — verified 200.)
    `https://upload.wikimedia.org/wikipedia/commons/4/48/%D0%A2%D0%B0%D0%B3%D0%B0%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%97%D0%9A%D0%9F_%D0%BE%D0%B3%D0%BE%D0%BB%D0%BE%D0%B2%D0%BE%D0%BA_%D0%B4%D0%B2%D0%B5%D1%80%D1%8C_%D0%B2_%D1%84%D0%B8%D0%BB%D1%8C%D1%82%D1%80%D0%BE%D0%B2%D0%BE%D0%B9_%D1%8D%D1%82%D0%B0%D0%B6.jpg`
15. **GP-5 gas mask (full):** the grey rubber mask + round eyepieces + corrugated hose + filter can — §B.1 gas-mask pegs ref.
    `https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/GP-5_Gasmaske.jpg/960px-GP-5_Gasmaske.jpg`
16. **GP-5 filter can:** the cylindrical filter canister — §B.1 detail.
    `https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/GP-5_Gasmaskenfilter.jpg/960px-GP-5_Gasmaskenfilter.jpg`

**Plus all 17 images in the existing dossier §6** (Balaklava portal/airlock/gallery/genset-hazard-door, Stalin's-bunker brown гермодвери + office + hall, Bunker-42 disguised entrance + buried model) remain valid — re-use them for the portal, тамбур, corridors, diesel, command office, and blast doors. Do not re-fetch; they're already verified there.

---

## H. SOURCES (all consulted for this dossier)

**Multi-level organization / examples**
- Object 1180 — https://www.28dayslater.co.uk/threads/object-1180-soviet-command-bunker-soldanesti-moldova-october-2022.133944/ ; https://www.oneman-onemap.com/en/2018/07/01/moldova-nuclear-bunker/ ; https://www.urbextour.com/en/urbex-travel/object-1180-an-underground-monster-from-moldova/ ; https://defensionem.com/object-1180-secret-warsaw-pact-nuclear-bunker/ ; https://www.visit.md/en/tour/soldanesti-bunker/ *(all secondary urbex/press; no published primary floor plan exists)*
- РВСН УКП 15В155 published level stack — https://frantsouzov.livejournal.com/31501.html ; https://komariv.livejournal.com/82200.html ; http://www.unexploredworld.ru/en/blog/274 *(secondary, mutually consistent)*; Wikipedia RVSN museum — https://en.wikipedia.org/wiki/Strategic_missile_forces_museum_in_Ukraine
- Tagansky / Bunker-42 — https://en.wikipedia.org/wiki/Tagansky_Protected_Command_Point ; https://www.atlasobscura.com/places/bunker-42

**Primary Soviet design standards (room program, dimensions, doors, exits)**
- СНиП II-11-77 «Защитные сооружения гражданской обороны» — https://www.vashdom.ru/snip/II-11-77/
- СН 405-70 «Указания по проектированию убежищ ГО» — https://meganorm.ru/Data2/1/4293780/4293780325.htm
- ЗСГО room program / equipping — https://www.omchs-rezerv.ru/vse-o-zashchitnykh-sooruzheniyakh-go/83-rezhimy-rabot-zsgo-i-ikh-osnashchenie

**Equipment (filtration / doors / comms)**
- ФВУ / ФПУ-200 (Ø445×407 mm, ~30 kg, protective-green, 100 mm duct) — https://www.zavod-vto.ru/fvu/ ; https://spiopro.ru/kollektivnaya-zashchita/filtry/filtr-poglotitel-fpu-200/ ; https://protivogaz.com/pages/fvu-200_100.html ; ПФП-1000/ЭРВ-600 context — https://xn--b1ae4ad.xn--p1ai/enc/filtroventilyatsionnaya-ustanovka
- Гермодвери ДУ (opening sizes 600×1600 … 1800×2400 mm; ДУ-III-5 = 1200×2000, 620 kg, штурвал + клиновой затвор 85 mm) — https://specoborona.ru/catalog/dveri/ ; https://protivogaz.com/pages/dveri.html
- Comms (Р-140 «Высота», Р-105М, П-193М 10-line switchboard, ТА-57, СТ-2М) — https://ru.wikipedia.org/wiki/Р-140 ; https://www.rusarmy.com/svyaz.html

**Embrasures / firing positions / observation cupola**
- DZOT embrasure (18×40 cm slit, 140 cm firing line, раструб widening, заслонка several cm w/ gun-port, 45° horiz / 13° vert [5° up 8° down]) — https://fb.ru/article/599852/2024-ambrazura-dzota-osobennosti-konstruktsii-zaschitnyie-svoystva-i-taktika-primeneniya
- ДОТ / fortification overview — https://ru.wikipedia.org/wiki/Долговременная_огневая_точка ; ДЗОТ — https://ru.wikipedia.org/wiki/Деревоземляная_огневая_точка
- ЖБОТ / пулемётный колпак (Ø1700 mm, h900 mm, wall 130 mm, embrasure 370–400×400–500 mm, periscope hole w/ 30 mm shutter, 1.3–2.0 t) — https://ru.wikipedia.org/wiki/Пулемётный_колпак ; https://victorymuseum.ru/encyclopedia/technic/voenno-fortifikatsionnye-sooruzheniya/zhelezobetonnaya-ognevaya-tochka-pulemetnyy-kolpak-sssr/

**Vertical circulation**
- Ladder/stair нормы (rise 0.15–0.20 m, going ≥0.25 m; vertical скоб-трап rung 0.15–0.30 m, width ~0.52 m) — ГОСТ summaries via nova-st.ru / weeco.ru ; ISO 14122-4 — http://docs.cntd.ru/document/gost-r-iso-14122-4-2009
- Escape shaft / оголовок (shaft 0.9×1.3 m, оголовок 1.2 m proud, 0.6×0.8 m louvre / 0.6×0.6 m hatch) — СН 405-70 (above)

*(End — feeds Phase-3 spec-unification for the multi-level `buildSecretBunker(...)` rebuild.)*
