# Soviet "Secret Bunker" — Visual + Architectural Reference Dossier

**Purpose:** guide an ultra-precise, procedurally-built **voxel POI** ("the secret bunker the player discovers in the steppe") for ENGENDROS PURGE (Three.js, layered-shading voxel art). This is the **research dossier** (Phase 2 of the `voxel-building-modeling` pipeline) — the next phase unifies it into an exact build spec.
**Date:** 2026-06-03. **Map context:** the 500×500 Soviet steppe map (`docs/superpowers/specs/2026-06-03-open-world-map-design.md`), companion to the kombinát hub and the WW2 field-strongpoint base (`src/strongpoint.js`).
**Sourcing:** Wikipedia / Wikimedia Commons / museum + mil-history sites. All image URLs in §6 were HTTP-verified (200 + `image/jpeg`) and the caption-critical ones were visually inspected, not guessed.

---

## 0. TL;DR — what to actually build

A **compact buried R/C command bunker** with:
- A **half-buried concrete entrance blockhouse** (portal) set into an **earth berm / курган**, plus a separate **emergency escape hatch** ~20–30 m away (the 2nd entrance).
- A **steel гермодверь blast door** (brown or grey-blue, red handwheel + lever bars) → a **тамбур airlock** → **stairs down a shaft** to **one underground level**.
- Underground: a **central command/operations room** (the contested objective) ringed by a **loop of reinforced corridors** lined with pipes & cable trays under **red emergency light**, off which hang: **diesel-generator room**, **ФВУ air-filtration room**, **radio room**, **bunk room**, **armory**.
- Surface "tells": **ventilation mushroom intakes (грибок)**, a couple of **antenna masts**, a low **observation/periscope cupola**, faded **Cyrillic + civil-defence stencils** («УБЕЖИЩЕ», «ШТАБ», «ВХОД», ГО triangle, hazard chevrons).

Palette anchor (full table in §4): concrete `0x9a9486`, weathered concrete `0x7d776a`, steel blast-door grey-blue `0x5a6b73`, army-equipment green `0x4d5a3a`, hazard yellow `0xd9b43a`, CD/warning red `0xb23a2e`, emergency-light red glow `0xff2a1f`.

---

## 1. TYPOLOGY — real Soviet / Cold-War bunker archetypes

| Archetype | Real example(s) | Key facts | Gameable? |
|---|---|---|---|
| **ЗКП — защищённый командный пункт** (protected/reserve command post) | **Object 1180** (Moldova), Object 1181 (Belarus) | Twin **cylindrical blocks Ø36 m, ~60 m deep, 12 floors**, capped with **3 m of reinforced concrete with granite aggregate**; rooms split by steel walls filled with R/C; **a hangar/structure stood over the buried bunker**; two tunnels link the blocks. Built 1985–91. | ★★★ — the canonical "command bunker under a berm/hangar on open ground." Best skeleton for our POI. |
| **Tagansky / Bunker-42 (ГО-42)** | Moscow, Tagansky district | **65 m deep, 7,000 m², ~600 staff for 30 days**; artesian wells, diesel gensets, air recycling; reached via two metro-style tunnels; **surface entrance disguised as an ordinary neoclassical townhouse** with an olive steel gate (red star). | ★★★ — gives us the **disguised surface portal** trick + interior fit-out (command rooms, life support) and museum imagery. |
| **РВСН Unified Command Post (УКП 15В155 / "ОС")** | **Pobuzke / Pervomaisk** Strategic Rocket Forces museum (Ukraine) | A **33 m-long, Ø3.3 m, 125-ton steel tube**, **12 compartments**, dropped **~3 m below grade into a silo**, suspended on **hydraulic shock-isolators**; autonomous **45 days**; **155 m of underground galleries** link it to surface buildings; surface ringed by **P-100 electric fence, watchtowers, seismic + radiation sensors**. | ★★ — the **vertical capsule + shock isolation + compartment stack** is iconic, but a 3.3 m tube is too cramped to fight in. Borrow the *aesthetic* (compartment doors, panel walls), not the literal geometry. |
| **Убежище ГО** (civil-defence shelter) | Thousands across the USSR; standardised | R/C, **filtered air (ФВУ)**, blast doors, bunk/water/toilet, **30-day** stay; hardness classes; often basement or detached "buried box." | ★★ — the **standardised kit** (ФВУ filters, гермодвери, ГО stencils, bunk rooms) is the detail library; layout is too mundane to be the whole POI but perfect for *dressing* it. |
| **Object 825 ГТС** (Balaklava sub base) | Crimea, in Mt Tavros | **602 m canal, 12–22 m wide, ≤8 m deep**; **category-I nuke-proof (direct 100 kt hit)**; **South batoport gate 18 m wide × 14 m high × 11 m thick**; ~120 kt of rock removed. | ★ (scale reference only) — far too big to replicate, but its **tunnel-mouth-in-a-hillside portal, arched rock/concrete galleries, overhead pipe runs and golden emergency lighting** are the best *visual* reference for our corridors & portal. |
| Hardened pillbox / ДОТ surface cap; "Granit/Гранит" hardened CP modules | Warsaw-Pact forward sites (e.g. Poland) | Prefab massive steel+concrete boxes, big truck ramps, self-sufficient (gensets, water plant, air filters). | ★ — donor of the **squat surface concrete cap** silhouette + access ramp idea. |

**Verdict — the 2 archetypes we build from:**
1. **Object 1180 ЗКП** = the **bones** (buried R/C command bunker, earth berm, surface cap/portal, command room + technical rooms, 3 m concrete cap). It's literally "a Cold-War reserve command post sitting under earth on open terrain" — exactly the steppe fantasy.
2. **Tagansky Bunker-42** = the **fit-out + the disguised/blockhouse portal + museum interior look** (command consoles, map boards, gensets, air recycling, гермодвери, ГО stencils).
3. **Object 825 (Balaklava)** = the **texture/lighting/portal mood board** for the underground (arched galleries, pipes, emergency amber/red light, concrete-into-rock portal).

This trio reads instantly as "Soviet secret bunker" while staying small enough for an FPS arena.

---

## 2. EXTERIOR SIGNATURE FEATURES (what the player sees on the surface)

What betrays a buried bunker, top to bottom:

1. **Earth berm / курган (the mound).** The bunker is under a man-made grass/earth mound; Object 1180's blocks were under **3 m of reinforced concrete** then earth, with a hangar on top. Read = a too-regular grassy hummock on flat steppe, sometimes with a blown-out concrete edge poking through. *(See §6 cwm_model — diorama of the structure buried in a hill.)*
2. **Entrance blockhouse / portal (concrete).** Either (a) a **squat angular reinforced-concrete cap/headhouse** with a recessed doorway and a short ramp, half-swallowed by the berm; or (b) **Tagansky-style disguise** — a mundane building facade (or a green steel vehicle gate with a red star + a red/white striped barrier «ГРАНИЦА ПОСТА») hiding the stair down. *(§6 cwm_entrance, entrance825.)*
3. **гермодверь blast door (steel).** Heavy steel slab in a thick concrete reveal: **massive offset hinges**, a **central handwheel** (often **red**) and **horizontal lever/dog bars** that drive **wedge bolts** into the frame; rubber gasket seat. Brown or grey-blue paint, rust streaks. **~1000 kg+.** *(§6 stalin0048 — two brown lever-bar doors in an arched corridor.)*
4. **Ventilation shafts + "mushroom" armored air intakes (грибок).** Short concrete or steel stacks rising ~0.8–2 m from the berm, capped with a **mushroom/umbrella cowl** (blast-and-rain hood) — usually a **pair** (intake + exhaust) set apart. Sometimes a louvred armored box instead. The classic visual giveaway of a buried shelter.
5. **Antenna masts.** One or two **lattice/whip masts** (and guy-wires) for the radio room — RVSN/ЗКП sites bristled with comms antennas. A leaning, half-rusted mast sells "abandoned."
6. **Periscope / observation cupola.** A low **armored dome or short cylindrical cupola head** flush-ish with the berm (a few view slits or a periscope stub) — the buried CP's eyes.
7. **Emergency escape hatch.** A separate **round armored hatch** (manhole-style, hinged, dogged) or a small concrete headhouse some distance from the main portal — the bunker's back door (and our 2nd FPS entrance). *(§6 airlock shows a round floor hatch cover.)*
8. **Hardened reinforced concrete surfaces.** Board-formed concrete with **form-tie holes**, faint **rebar rust bleed**, chamfered edges, spalled corners showing aggregate (Object 1180 used **granite coarse aggregate** — visible chunky grey speckle).
9. **Civil-defence / hazard stenciling & Cyrillic signage:**
   - **ГО civil-defence sign:** the international **equilateral blue triangle on an orange ground** (used USSR-wide), often with «ГО» / «ГРАЖДАНСКАЯ ОБОРОНА».
   - **Стенцилed labels:** «**УБЕЖИЩЕ**» (shelter), «**ШТАБ**» (HQ/staff), «**ВХОД**» (entrance), «**ЗАПАСНЫЙ ВЫХОД**» (emergency exit), «**ОПАСНО**» (danger), «**НЕ КУРИТЬ**» (no smoking), unit/object numbers («ОБЪЕКТ №…»).
   - **Hazard chevrons:** **yellow-and-black diagonal stripes** on door edges & steps. *(§6 balak092.)*
   - **Red Soviet star** on the gate / over the portal; faded **hammer-and-sickle** on concrete. *(§6 cwm_entrance, entrance825.)*
   - Red/white striped **sentry/barrier post** at the approach. *(§6 cwm_entrance.)*

---

## 3. INTERIOR SIGNATURE SPACES (the underground level)

A walkthrough, in order, with what each looks like:

1. **Blast-door airlock / тамбур (decontamination lock).** A **double-door** lock: outer гермодверь → small bare-concrete/whitewashed chamber → inner гермодверь. Walls rough whitewashed or grey concrete; a **round floor hatch/sump cover**; pegs/lockers with **gas masks (ГП-5), ОЗК/Л-1 protective suits**, a dosimeter. *(§6 airlock.)*
2. **Long reinforced corridors.** **Arched or rectangular** R/C galleries; one wall **lined with painted pipe runs and cable conduits/trays**; **caged bulkhead lights**; **red emergency lights**; floor is bare concrete or worn red/grey lino, sometimes **narrow-gauge rail / a flatbed trolley**. Doors set in thick reveals. *(§6 tunnel, balak092, stalin0036.)*
3. **Command / operations room (the centerpiece).** The largest space: **wall map boards** (USSR / theatre maps, plexi overlays), **status panels & consoles** (grey/olive metal cabinets, rows of toggle switches, gauges, indicator lamps), a central plotting table, telephones (field-green & red), clocks in a row (Moscow time), portrait of Lenin/the GenSec, a red banner. Lower walls often **pale green/teal**, upper walls cream. This is where the panels "light up."
4. **Diesel generator room.** One or two **big dark engine-generator sets** on plinths, **exhaust pipes** running up into the ceiling, fuel-day-tank, switchgear, **yellow-black hazard striping** around it, oily concrete floor, a "engine-room" foley. *(§6 balak092 has the genset + exhaust look.)*
5. **Air-filtration room (ФВУ — фильтровентиляционная установка).** The detail set-piece: stacks of **cylindrical filter-absorber columns (ФПУ-200)**, a big **pre-filter ПФП-1000** drum, an **electric fan ЭРВ-600/300**, pressure gauges & a **manometer board**, hand-crank backup blower, big galvanized **ducts** to the surface mushrooms. Often **olive-green** equipment, red valves. (Kit references: ФВК-1 serves ~150 people; military ФВА-100/50.)
6. **Radio / communications room.** A wall of **valve radio sets & switchboards** (R-/Р-series), patch panels, a Morse key, headphones, dim desk lamp; cable bundles to the antenna lead-in. *(Tagansky-style comms fit-out.)*
7. **Bunk / rest room (кубрик / спальня).** **Steel double-bunks**, thin mattresses, lockers, a small table — autonomy for 30–45 days.
8. **Armory (оружейная).** Small caged/steel-door room: **rifle racks (АК/СКС), ammo crates, grenade boxes**, a stencilled «ОРУЖЕЙНАЯ» / «ОПАСНО». (Great loot room for the FPS.)
9. **Bulkhead doors throughout.** Between every space: **thick round or rectangular steel bulkhead doors** with wheel/lever dogs (lighter than the entrance гермодверь but same family).
10. **Emergency lighting (red).** The default lit state is **dim red** with a few amber caged bulbs — both for mood and to motivate the flashlight.

---

## 4. MATERIALS & COLOR PALETTE (HEX — usable in code)

Layered-shading note (per `voxel-weapon-modeling/SKILL.md`): give **each material a 5-tone ramp** (Hi / Mid / Lo / Slot / Bright). The "Mid" is listed as the base; derive Hi ≈ +12% L, Lo ≈ −18% L, Slot ≈ −32% L (recess), Bright = the accent. **Never use near-black as a main color** — concrete shadow bottoms should be the "Lo/Slot" greys, not `0x000000`.

| Material / surface | Base (Mid) HEX | Hi (lit top) | Lo (shadow) | Notes |
|---|---|---|---|---|
| **Concrete (fresh, surface cap)** | `0x9a9486` | `0xb0aa9c` | `0x7d776a` | Warm grey; the main exterior. |
| **Concrete (weathered/interior)** | `0x837d70` | `0x968f80` | `0x645f54` | Stained, soot-streaked. |
| **Concrete (dark/wet underground)** | `0x6f6a60` | `0x827c70` | `0x534f47` | Corridor walls in shadow. |
| **Concrete with granite aggregate fleck** | base `0x8f897b` + sparse `0x6c6a66` / `0xa9a59c` specks | — | — | Object-1180 spalled-edge look. |
| **Rebar rust bleed / stain** | `0x8a5a3c` (streak over concrete) | — | — | Thin vertical streaks under form-ties. |
| **Steel blast door (grey-blue)** | `0x5a6b73` | `0x6f808a` | `0x3f4c52` | Cold institutional steel. |
| **Steel blast door (alt, brown-painted)** | `0x7a5a3a` | `0x8f6c47` | `0x5a4329` | The Stalin-bunker brown door look. |
| **Door handwheel / valves (red)** | `0xb23a2e` | `0xc94d3e` | `0x822317` | Handwheel, valve wheels. |
| **Army / equipment olive-green** | `0x4d5a3a` | `0x5e6c46` | `0x36402a` | Gensets, ФВУ, cabinets, gas suits. |
| **Equipment grey (consoles/cabinets)** | `0x707b78` | `0x848e8a` | `0x515a57` | Command-room metal furniture. |
| **Pipes — steam/utility (galvanized)** | `0x9fa4a6` | `0xb6bbbd` | `0x767b7d` | Big overhead runs. |
| **Pipes — red (fire/valve line)** | `0xa83228` | `0xc24234` | `0x781f16` | Accent pipes/valves. |
| **Pipes — yellow (gas line)** | `0xc8a73a` | — | — | Occasional. |
| **Cable conduit / tray** | `0x3d3a36` | `0x4d4a44` | `0x2a2825` | Dark — but pair with a Hi strip so it's not a blob. |
| **Hazard stripe — yellow** | `0xd9b43a` | `0xeccb55` | `0xa9892a` | Paired with near-black `0x26241f` for the diagonal. |
| **Civil-defence sign — orange ground** | `0xe07b1e` | — | — | ГО triangle background. |
| **Civil-defence sign — blue triangle** | `0x1f5fa8` | — | — | The CD emblem triangle. |
| **Soviet star / banner red** | `0xc01a1a` | `0xd83030` | `0x8a1010` | Star on gate, red banners. |
| **Wall paint — pale green/teal (dado)** | `0x8fa890` | `0xa3bba3` | `0x6f846f` | Lower-wall institutional green. |
| **Wall paint — cream/off-white (upper)** | `0xd8d2c0` | `0xe6e1d2` | `0xb3ad9c` | Upper walls / ceilings. |
| **Floor lino — oxblood red** | `0x7a3b30` | `0x8e4a3d` | `0x582820` | Worn corridor floor. |
| **Rust (heavy)** | `0x7c4a2c` | `0x95603a` | `0x5a3420` | Edges, hinges, abandoned mast. |
| **Emergency-light red (emissive glow)** | `0xff2a1f` (emissive) | — | — | Use as a light tint / unlit emissive, not surface paint. |
| **Amber caged bulb (emissive)** | `0xffb24a` (emissive) | — | — | The few working lights. |
| **Earth berm / grass** | grass `0x5e6a32`, dirt `0x6e5c3c` | — | — | Match the steppe ground palette already in `world.js`. |

---

## 5. SCALE / PROPORTIONS (meters — 1 voxel unit ≈ 1 m)

Real numbers so the voxel build is proportioned right. Where a real figure is huge (Balaklava, Object 1180 depth), I give a **gameplay-scaled** value in brackets — keep the *look* of the big one, the *size* of the playable one.

**Blast door (гермодверь):**
- Personnel door opening: **~0.9–1.1 m wide × ~1.9–2.1 m high** (civil-defence standard single-leaf; e.g. УЗС / ДУ-type ~80–100 cm). **Door slab thickness ~0.15–0.30 m**; concrete reveal/frame **~0.4–0.6 m** deep.
- Make the *gameplay* doorway gap a touch generous: **1.1–1.3 m wide × 2.1 m high** so the player and steering enemies pass cleanly (real gaps, per the skill).
- Handwheel **Ø ~0.35–0.45 m**; lever bars span the leaf.
- Vehicle/blast gate (if used as a 2nd "big" portal): scale Balaklava's batoport *down* drastically — a **3 m wide × 3 m high** steel gate reads "huge blast door" without the real 18×14 m.

**Corridors:**
- Width **2.0–2.4 m** (clear), height **2.3–2.6 m**. (Real CP corridors ~2 m; give FPS a hair more for strafing.) Arched-ceiling variant: spring the arch at ~2.0 m, crown ~2.6 m.
- Pipe runs hang at **~2.0–2.3 m** off the floor along one wall; cable trays at **~2.2 m**.

**Rooms:**
- **Command/operations room (objective):** **9 × 7 m**, height **3.0–3.2 m** (the one tall, open space — deliberate sightline contrast to corridors). Map-board wall ~3 m wide.
- **Generator room:** **6 × 5 m**, height **3.0 m** (genset ~2.5 × 1.5 × 1.8 m on a plinth).
- **ФВУ filtration room:** **5 × 4 m**, height **2.6 m**; filter columns ~**Ø0.4 × 1.2 m** stacked; ducts **Ø0.3–0.5 m**.
- **Radio room / armory / bunk room:** **4 × 3.5 m** each, height **2.5 m**.
- **Airlock / тамбур:** **2.5 × 2.5 m**, height **2.4 m** (just big enough for the double-door lock + a hatch).

**Vertical:**
- Buried level floor sits **~6–9 m below grade** for the FPS (real ЗКП is 40–65 m — far too deep to traverse on foot; **compress to one level a single stair-flight down**, optionally hint at "more below" with a sealed shaft).
- **Stair shaft:** flight of **~12–16 steps**, step rise **≤0.18 m** (and any in-level walkable rise **≤0.62 m** per the engine step-up rule — taller = wall). Stair run width **~1.2 m**.
- **Ladder escape shaft:** **Ø ~0.8–1.0 m**, vertical, from the level up to the escape hatch (a fast 2nd route / vent-drop).

**Berm / курган (the mound over it):**
- Footprint **~24 × 18 m** (covers the buried box), **height ~3–4 m** above grade, sloped ~25–35°. (Object 1180 cap = 3 m R/C + earth.)
- Surface **concrete cap / blockhouse**: footprint **~6 × 5 m**, standing **~2.5–3.5 m** proud of the berm, walls **~0.5–0.8 m** thick (read).

**Ventilation & observation (surface):**
- **Mushroom intakes (грибок):** stack **0.8–2.0 m** tall, **Ø0.4–0.6 m**, cowl **Ø0.7–0.9 m**. Place a **pair** ~3–5 m apart.
- **Periscope/observation cupola:** dome/cylinder **Ø ~1.2–1.8 m**, standing **~0.6–1.0 m** proud.
- **Antenna mast:** **6–12 m** tall lattice/whip (visual only, above reach — make it non-collidable above ~0.62 m so it doesn't wall the player; or a thin pole the player walks past).
- **Emergency escape hatch:** round armored hatch **Ø ~0.8–1.0 m**, or a tiny headhouse **~1.5 × 1.5 × 1.5 m**.

---

## 6. REFERENCE IMAGE URLS (all HTTP-200 verified, direct Wikimedia)

All are real `upload.wikimedia.org/.../thumb/.../960px-…` direct-image URLs (the API canonicalised these to 960 px — they return `200 image/jpeg`). Caption-critical images were visually inspected. Format: **what it shows** — direct URL — source File page.

### Exterior / portal / berm
1. **Balaklava sea-portal: a massive concrete tunnel mouth cut into a rocky hillside, opening on a quay; faded Soviet star + hammer-and-sickle on weathered concrete at right.** *(best "portal-in-hillside / concrete cap + berm + Soviet markings" ref)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/%D0%92%D1%85%D0%BE%D0%B4_%D0%BD%D0%B0_%D0%9E%D0%B1%D1%8A%D0%B5%D0%BA%D1%82_825_%D0%93%D0%A2%D0%A1.JPG/960px-%D0%92%D1%85%D0%BE%D0%B4_%D0%BD%D0%B0_%D0%9E%D0%B1%D1%8A%D0%B5%D0%BA%D1%82_825_%D0%93%D0%A2%D0%A1.JPG`
   src: https://commons.wikimedia.org/wiki/File:%D0%92%D1%85%D0%BE%D0%B4_%D0%BD%D0%B0_%D0%9E%D0%B1%D1%8A%D0%B5%D0%BA%D1%82_825_%D0%93%D0%A2%D0%A1.JPG

2. **Bunker-42 disguised street entrance: a mundane cream neoclassical facade hiding the bunker, an olive-green steel gate with a red Soviet star, and a red/white striped "ГРАНИЦА ПОСТА / NO TRESPASSING" barrier + sentry post.** *(the "hidden surface portal" trick + red-star gate + striped barrier)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Cold_War_Museum%2C_Moscow%2C_entrance.JPG/960px-Cold_War_Museum%2C_Moscow%2C_entrance.JPG`
   src: https://commons.wikimedia.org/wiki/File:Cold_War_Museum,_Moscow,_entrance.JPG

3. **Cutaway diorama of Bunker-42: the tube-block structure buried inside a hill beneath a church/buildings, with the metro tunnel exposed in cross-section.** *(berm / "buried under terrain" massing + depth relationship)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Cold_War_Museum%2C_Moscow%2C_model.JPG/960px-Cold_War_Museum%2C_Moscow%2C_model.JPG`
   src: https://commons.wikimedia.org/wiki/File:Cold_War_Museum,_Moscow,_model.JPG

4. **SS-24 missile transporter (MAZ-547) on bare foggy steppe at the Pobuzke Strategic Rocket Forces site.** *(steppe-site atmosphere + RVSN olive/silver equipment palette — context, not the bunker itself)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Ukraine_Strategic_Missile_Forces_Museum_03_%2813503834443%29.jpg/960px-Ukraine_Strategic_Missile_Forces_Museum_03_%2813503834443%29.jpg`
   src: https://commons.wikimedia.org/wiki/File:Ukraine_Strategic_Missile_Forces_Museum_03_(13503834443).jpg

5. **Pobuzke RVSN museum — surface/equipment view (command-post complex grounds).** *(surface buildings + masts context for a command bunker)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Ukraine_Strategic_Missile_Forces_Museum_08_%2813503845243%29.jpg/960px-Ukraine_Strategic_Missile_Forces_Museum_08_%2813503845243%29.jpg`
   src: https://commons.wikimedia.org/wiki/File:Ukraine_Strategic_Missile_Forces_Museum_08_(13503845243).jpg

### Blast doors / airlock
6. **Two brown-painted steel hermetic blast doors (гермодвери) with horizontal lever/dog bars, set into a pale-green arched corridor with a bare bulb.** *(the single best blast-door + corridor ref — copy hinges/lever bars/reveal)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Stalin%27s_Bunker_0048.JPG/960px-Stalin%27s_Bunker_0048.JPG`
   src: https://commons.wikimedia.org/wiki/File:Stalin%27s_Bunker_0048.JPG

7. **CD decontamination/airlock scene: rough whitewashed concrete chamber, two mannequins in gas masks + protective suits (tan ОЗК / green Л-1), a round floor hatch cover, a small radio.** *(тамбур airlock + gas-mask/suit dressing + round floor hatch)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Crimea._Naval_museum_complex_Balaklava._Airlock_chamber_P9151118_2925.jpg/960px-Crimea._Naval_museum_complex_Balaklava._Airlock_chamber_P9151118_2925.jpg`
   src: https://commons.wikimedia.org/wiki/File:Crimea._Naval_museum_complex_Balaklava._Airlock_chamber_P9151118_2925.jpg

8. **Lower bunker corridor (Stalin's bunker) — arched ceiling, painted walls, period light fittings.** *(reinforced corridor proportions + arch)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Stalin%27s_Bunker_0036.JPG/960px-Stalin%27s_Bunker_0036.JPG`
   src: https://commons.wikimedia.org/wiki/File:Stalin%27s_Bunker_0036.JPG

### Interior corridors / pipes / emergency light / hazard striping
9. **Underground canal gallery (Balaklava): long curved rock/concrete tunnel, golden emergency lighting reflecting on black water, big overhead ventilation/utility pipe runs, tire fenders.** *(corridor scale + overhead pipes + warm emergency-light mood)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Submarine_tunnel.jpg/960px-Submarine_tunnel.jpg`
   src: https://commons.wikimedia.org/wiki/File:Submarine_tunnel.jpg

10. **Balaklava interior hall: corrugated-metal arched ceiling, big overhead galvanized pipes, pale-green/teal dado walls, a heavy door framed with YELLOW-AND-BLACK diagonal hazard striping, machinery + a flatbed rail trolley.** *(hazard-chevron door + genset/equipment + pipe runs + lino/rail floor)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/%D0%92%D0%BE%D0%B5%D0%BD%D0%BD%D0%BE-%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BC%D1%83%D0%B7%D0%B5%D0%B9_%D0%B2_%D0%91%D0%B0%D0%BB%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B5_092.jpg/960px-%D0%92%D0%BE%D0%B5%D0%BD%D0%BD%D0%BE-%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BC%D1%83%D0%B7%D0%B5%D0%B9_%D0%B2_%D0%91%D0%B0%D0%BB%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B5_092.jpg`
   src: https://commons.wikimedia.org/wiki/File:%D0%92%D0%BE%D0%B5%D0%BD%D0%BD%D0%BE-%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BC%D1%83%D0%B7%D0%B5%D0%B9_%D0%B2_%D0%91%D0%B0%D0%BB%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B5_092.jpg

11. **Balaklava underground — concrete vault / equipment space (RTB weapons-handling area), institutional teal + concrete.** *(technical-room walls + machinery dressing)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/%D0%92%D0%BE%D0%B5%D0%BD%D0%BD%D0%BE-%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BC%D1%83%D0%B7%D0%B5%D0%B9_%D0%B2_%D0%91%D0%B0%D0%BB%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B5_048.jpg/960px-%D0%92%D0%BE%D0%B5%D0%BD%D0%BD%D0%BE-%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BC%D1%83%D0%B7%D0%B5%D0%B9_%D0%B2_%D0%91%D0%B0%D0%BB%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B5_048.jpg`
   src: https://commons.wikimedia.org/wiki/File:%D0%92%D0%BE%D0%B5%D0%BD%D0%BD%D0%BE-%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BC%D1%83%D0%B7%D0%B5%D0%B9_%D0%B2_%D0%91%D0%B0%D0%BB%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B5_048.jpg

12. **Balaklava underground — gallery + door + equipment (institutional green/concrete).** *(corridor-to-room transition + door reveal)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/%D0%92%D0%BE%D0%B5%D0%BD%D0%BD%D0%BE-%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BC%D1%83%D0%B7%D0%B5%D0%B9_%D0%B2_%D0%91%D0%B0%D0%BB%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B5_049.jpg/960px-%D0%92%D0%BE%D0%B5%D0%BD%D0%BD%D0%BE-%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BC%D1%83%D0%B7%D0%B5%D0%B9_%D0%B2_%D0%91%D0%B0%D0%BB%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B5_049.jpg`
   src: https://commons.wikimedia.org/wiki/File:%D0%92%D0%BE%D0%B5%D0%BD%D0%BD%D0%BE-%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%BC%D1%83%D0%B7%D0%B5%D0%B9_%D0%B2_%D0%91%D0%B0%D0%BB%D0%B0%D0%BA%D0%BB%D0%B0%D0%B2%D0%B5_049.jpg

### Interior command / generic Soviet bunker space
13. **Sealed steel door in a Soviet bomb shelter (Naval Museum Balaklava) — heavy slab + frame.** *(secondary blast/bulkhead-door ref)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Naval_Museum_Balaklava_01.jpg/960px-Naval_Museum_Balaklava_01.jpg`
   src: https://commons.wikimedia.org/wiki/File:Naval_Museum_Balaklava_01.jpg

14. **Balaklava interior — corridor / equipment bay (museum lighting on concrete + steel).** *(general underground texture/lighting)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Naval_Museum_Balaklava_10.jpg/960px-Naval_Museum_Balaklava_10.jpg`
   src: https://commons.wikimedia.org/wiki/File:Naval_Museum_Balaklava_10.jpg

15. **"Inside Soviet submarine shelter" — long underground gallery, concrete + overhead services.** *(corridor depth + service runs)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Inside_Soviet_submarines_shelter_-_panoramio.jpg/960px-Inside_Soviet_submarines_shelter_-_panoramio.jpg`
   src: https://commons.wikimedia.org/wiki/File:Inside_Soviet_submarines_shelter_-_panoramio.jpg

16. **Stalin's bunker — office/working room (period furniture, panelled wall, portrait).** *(command/office room dressing: desk, panels, portrait, banner)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Stalin%27s_Bunker_0020.JPG/960px-Stalin%27s_Bunker_0020.JPG`
   src: https://commons.wikimedia.org/wiki/File:Stalin%27s_Bunker_0020.JPG

17. **Stalin's bunker — convention/meeting hall (columns, formal Soviet interior).** *(the larger "command room" volume + columns)*
   `https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Stalin%27s_Bunker_0009.JPG/960px-Stalin%27s_Bunker_0009.JPG`
   src: https://commons.wikimedia.org/wiki/File:Stalin%27s_Bunker_0009.JPG

> **URL note:** the Wikimedia API rejects *arbitrary* thumb widths for some originals (400/640 → HTTP 400/404). The **960px** widths above are the API-blessed valid bucket and were verified 200. If you re-resolve, hit `https://commons.wikimedia.org/w/api.php?action=query&titles=File:NAME&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json` with a real `User-Agent` and use the returned `thumburl` verbatim (don't hand-build the path). `englishrussia.com` and `28dayslater.co.uk` have rich extra photo sets (Object 1180, Object 825) if more refs are wanted — but they aren't Wikimedia/curl-clean.

---

## 7. GAME DESIGN — compact surface+underground bunker as a 1v1-viable FPS arena

**Design goal:** a **two-storey "monument"** (surface ring + one underground level) that plays like Rust's Launch-Site bunker / a Tarkov underground / a PUBG Erangel bunker: a **high-risk, high-loot magnet** with **multiple routes, a contested center, loops (no dead-ends), and deliberate sightline contrast** (tight corridors vs. one open command room).

### Core rules (from the skill + FPS sanity)
- **≥2 entrances, no single choke trap.** Three ways between surface and underground:
  1. **Main stair** (from the portal blockhouse) — the "front door," widest, most exposed.
  2. **Ladder escape shaft** (from the emergency hatch ~25 m away on the berm) — fast flank / escape, drops you near the back of the loop.
  3. **Vent drop** (a wide ventilation shaft from a surface mushroom) — a one-way *down* shortcut into a corridor (risky landing, can't climb back) — the classic "third way in" that breaks camping.
- **Verticality:** surface ↔ underground via **stairs + ladder + vent drop**; on the surface, the **berm top** is a low high-ground (sniping the approaches) reachable by the slope.
- **No dead-ends — everything loops.** The underground is a **ring corridor** around the central command room, with rooms hanging off the ring. Every room has **≥2 exits** (or an exit + a vent/duct crawl) so a player is never trapped in a kill-box. (Hard engine rule: walkable interiors need ≥2 exits.)
- **Sightline control:** corridors are **2–2.4 m wide** with pillars/pipe-stub cover and **dog-leg bends** (no 30 m straight sightline) — close-quarters. The **command room is the one open 9×7 m space** — long sightlines, but flanked by **3 doors** + a vent, with crate/console **cover** mid-room, so it's contestable not a deathtrap.
- **Central contested room / objective:** the **command/operations room** is the loot/objective heart (the "MITRI-tier" loot magnet — supply crate, weapon, the room's panels are the set-piece). It's **deepest + most central**, so reaching it means committing through the loop — and it has multiple approaches so no one holds it free.
- **Cover placement:** surface — the **concrete cap, berm folds, the gate/barrier, the mushroom stacks, a wrecked truck**; underground — **pillars, pipe stubs, generator plinths, filter columns, crates, half-open blast doors** (a half-open гермодверь = chest-high cover in a doorway).
- **Loot gradient (Rust/Tarkov idiom):** trash loot on the **surface + airlock**, mid loot in the **side rooms** (armory = guns/ammo, ФВУ/genset = parts), **top loot in the command room** + a chance behind a **second sealed blast door** that's slow to open (commits you, draws fights) — directly mirrors how PUBG/Rust/Tarkov use bunker "monuments" as high-risk/high-reward draws.

### Monument-design references (how the genre does it)
- **PUBG (Erangel/Sosnovka bunkers):** small concrete entrance shed → stairs → an underground loop with a couple of rooms; few entrances make it a tense fight magnet — we improve on it by adding the **3rd (vent) route** so it isn't a single choke.
- **Rust (Launch Site / military tunnels):** a **central high-tier loot room** guarded by a maze of corridors + multiple entrances + verticality; high-risk because everyone wants it. Our command room = that magnet.
- **Tarkov (Reserve "RB-" bunker network / Lighthouse):** **underground bunker doors (the hermetic-door motif!), looping tunnels, multiple extracts**, generator/vent rooms as landmarks; rewards map knowledge of the loops. Our ring + named rooms (ФВУ, genset, radio) give the same legibility.

### Room-adjacency sketch (ASCII)

```
                              S U R F A C E   (steppe + berm/курган)
   antenna mast ✚            ┌────────────────┐        грибок (vent intakes)  ◍ ◍
        │          berm top ▲│  CONCRETE CAP  │▲ berm top        │  │
        │  (low high-ground) │  / BLOCKHOUSE  │                  │  │  cupola ◓
   [escape hatch ◉]          │   ▣ гермодверь │            [vent shaft head]
        ┆ ladder             └───────┬────────┘                  ┆ vent
        ┆ shaft                      │ stairs down               ┆ DROP (one-way)
        ┆                            │                           ┆
   ═════╪════════════════════════════╪═══════════════════════════╪═════  (grade)
        ▼                            ▼                            ▼
   ╔════[L]════════════════════╗  [A: AIRLOCK/тамбур]   ╔═════════[V]═══════╗
   ║                           ║   double гермодверь    ║                   ║
   ║  ┌──────────┐        ┌────╨─────┐          ┌───────╨──┐    ┌─────────┐  ║
   ║  │  BUNKS   │══door══│          │═══door═══│  RADIO   │    │ ARMORY  │  ║
   ║  └────┬─────┘        │          │          └────┬─────┘    └────┬────┘  ║
   ║       ║              │  COMMAND │                ║               ║      ║
   ║   (RING CORRIDOR) ═══│  / OPS   │═══(RING CORRIDOR)══════════════╝      ║
   ║       ║              │  ROOM ★  │  ← objective / top loot / panels      ║
   ║  ┌────┴─────┐        │ (9×7m,   │          ┌───────────┐                ║
   ║  │ ФВУ AIR- │══door══│  open,   │═══door═══│  DIESEL    │                ║
   ║  │ FILTER   │        │  3 doors │          │  GENERATOR │                ║
   ║  └──────────┘        └──────────┘          └────────────┘                ║
   ╚═══════════════════════════════════════════════════════════════════════╝
   Legend: [L]=ladder-shaft landing  [V]=vent-drop landing  [A]=stair landing/airlock
           ★=central contested room   ══=ring corridor (loops, no dead-ends)
           every room: ≥2 exits (door + ring, or door + vent/duct crawl)
```

- **Three independent surface→underground entries** ([A] stair via airlock, [L] ladder from escape hatch, [V] one-way vent drop) feed **opposite sides** of the ring → no single hold.
- **Ring corridor** means you can always loop around an opponent — no dead-ends.
- **Command room ★** is central, deepest, open, with **3 doors + a vent**, mid-room cover — the contest.
- **Side rooms** (bunks, ФВУ, genset, radio, armory) are short cul-de-sacs but each opens onto the ring **plus** has a **vent/duct crawl** as a 2nd exit, so none is a trap.

### Build / engine notes for this POI (carry into Phase 4–6)
- All collidable mass via `_solid`; **doorways = real gaps** (`_wall` door param, ~1.2 m × 2.1 m), never thin "door" boxes; visual-only detail (pipes overhead, mushroom cowls, antenna above ~0.62 m) via plain `mb.box` / `b.geo` so they don't wall the player.
- **Curved bits** (mushroom cowls, periscope dome, round hatch, arched-corridor ceiling segments, filter columns) → `b.geo(new THREE.CylinderGeometry(...), …)` (+Y axis) — **dispose geometry after**.
- **Step-up ≤0.62 m:** stair flights as ≤0.18 m steps; the berm slope is *not* walkable as a ramp (AABB has no slopes) — either make the berm-top reachable by a hidden stepped path or treat the berm as impassable cover and reach the top only via the cap.
- **Emergency-light red:** use a tinted/`emissive` material + a couple of red point lights, not red *paint*, so the unlit-look reads.
- **Cyrillic signage / ГО triangle / hazard chevrons:** textured `PlaneGeometry` + `MeshLambertMaterial({ map, alphaTest:0.5 })` in the OPAQUE pass, offset a hair off the wall (copy the T-90M weak-point poster pattern in `world.js`) — avoids z-fighting.
- **Z-fighting:** recess/detail boxes proud ~0.003–0.008; never coplanar same-depth faces of different colour; the berm/ground/floor slabs offset by a sliver.
- **Co-op:** any loot spawn / sealed-door event / objective tied to the bunker sits behind `hostSim = !mp.active || mp.isHost`.
- **Perf:** merge per-material into single meshes (concrete / steel / pipes / paint / signage); watch `world.boxes` count — an underground loop adds a lot of colliders on the 500 m map (flag for the spatial grid).

---

## 8. Sources

- Tagansky Protected Command Point (Bunker-42) — https://en.wikipedia.org/wiki/Tagansky_Protected_Command_Point
- Object 825 GTS (Balaklava) — https://en.wikipedia.org/wiki/Object_825_GTS ; Naval museum complex Balaklava — https://en.wikipedia.org/wiki/Naval_museum_complex_Balaklava
- Object 1180 (ЗКП, Moldova) — https://www.28dayslater.co.uk/threads/object-1180-soviet-command-bunker-soldanesti-moldova-october-2022.133944/
- Strategic Missile Forces Museum (Pobuzke, РВСН УКП) — https://en.wikipedia.org/wiki/Strategic_missile_forces_museum_in_Ukraine ; https://www.showcaves.com/english/ua/subterranea/Pobuzke.html ; https://www.oneman-onemap.com/en/2019/01/29/museum-strategic-rocket-forces-pobuzke/
- RVSN / Strategic Rocket Forces — https://en.wikipedia.org/wiki/Strategic_Rocket_Forces ; https://nuke.fas.org/guide/russia/agency/rvsn.htm ; abandoned УКП — http://www.unexploredworld.ru/en/blog/274
- Stalin's bunker, Samara — https://en.wikipedia.org/wiki/Stalin%27s_bunker,_Samara
- Soviet civil-defence shelters / war-survival strategy — https://apps.dtic.mil/sti/tr/pdf/ADA053250.pdf ; CIA reading-room "Construction of Soviet underground bunkers" — https://www.cia.gov/readingroom/docs/CIA-RDP80T00246A044400140001-3.pdf
- ФВУ / ФВК-1 filter-ventilation kit — http://npp-cso.ru/filtroventilyacionnyj-komplekt-fvk-1 ; https://www.zavod-vto.ru/fvu-01-filtroventilyacionnaya-ustanovka.html
- Hermetic / blast doors (гермодвери) — https://griffonsafes.com.ua/en/hermetic-and-protective-doors-for-shelters-en ; Tarkov "bunker hermetic door" (genre reference) — https://tarkov.help/en/locations/reserve/bunker-hermetic-door/
- Civil-defence emblem (blue triangle on orange) — https://en.wikipedia.org/wiki/Protective_sign ; https://icdo.org/about-icdo/symbols-icdo/emblem-of-civil-defence.html

*(End of dossier — feeds Phase 3 spec-unification, then the `buildSecretBunker(...)` builder.)*
