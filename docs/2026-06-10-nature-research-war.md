# War-Damage Morphology — Ukrainian/Russian Steppe & Forest Landscape

Research date: 2026-06-10. For voxel model dossiers + world plan (ENGENDROS PURGE).
**Rule followed: dimensions in METRES, each fact carries a source tag. Where a number could not be sourced, it is marked `[UNSOURCED]` — not invented.**

---

## 1. Artillery crater morphology (diameter / depth, metres)

| Munition | Apparent crater Ø | Depth | Source tag |
|---|---|---|---|
| WWI 70 mm shell (smallest) | < 1 m | shallow | Hupy & Schaetzl, "Bombturbation," *Soil Science* 171(11):823–836 (2006) |
| 120 mm mortar HE | lethal radius ~24 m (NOT crater Ø) | — | М95 Long Range Mortar spec (Wikipedia) — crater Ø itself not in fetched table |
| 152 mm HE (D-1 howitzer) | ~3.5 m | ~1.2 m | 152 mm howitzer M1943 (D-1), Wikipedia |
| 155 mm HE (typical field) | 4–5 m | 1.2–1.5 m | field-engineering summary (justiceformyanmarpeople 155mm.pdf, secondary) |
| WWI 420 mm super-heavy | > 10 m | "often several metres" | Hupy & Schaetzl (2006) |
| Underground mine (Lochnagar, Somme) | 100 m | 21 m | Lochnagar mine, Wikipedia |
| Underground mine complexes (Verdun) | > 50 m | > 20 m | Hupy & Schaetzl (2006) |

- **Depth into substrate:** at Verdun the cross-section shows craters cutting roughly to **2.0 m** into limestone bedrock. Source tag: Hupy & Schaetzl (2006), Fig. 3.
- **Depth-to-diameter ratio (155 mm):** averaged ratios of **0.945 (depth)** and **0.85 (diameter)** are cited in DTIC ADA111994 ("An Analysis of Craters Produced by Artillery Munitions") — `[PARTIALLY SOURCED]`, exact absolute dimensions not recoverable from the fetched excerpt (PDF 403).
- **Crater profile / rim:** a bowl with a raised **rim of mixed ejecta**; "rubble on rim decreases in size with increasing distance" from the lip; the crater later becomes a sink for leaf litter + blast rubble (partial infill). Source: Hupy & Schaetzl (2006), Fig. 3.
- **Useful build constant:** for the common 152/155 mm round, model a **~4 m wide × ~1.2–1.5 m deep** bowl with a low debris rim — the dominant feature for this conflict.

## 2. Water-filled craters

- Craters fill with **rain + groundwater**; where the blast breaches an impermeable layer it can expose the shallow water table, turning the pit into a standing pond. Source: Hupy & Schaetzl (2006).
- Persisting WWI/WWII crater ponds are a documented permanent landscape feature (Verdun, Walthamstow "Bomb Crater Pond"). Source: Bomb Crater Pond (Walthamstow), Wikipedia.
- **No specific water-filled-crater diameter/depth for the current Ukraine front was sourced.** `[UNSOURCED]` — for modelling, reuse the §1 artillery-crater bowl dimensions and add a flat water plane partway up.

## 3. Crater scatter across fields (density / pattern, from aerial/satellite imagery)

- **Individual crater footprint (Ukraine VHR satellite):** **10–30 m² up to > 500 m²**; detection model worked best on craters **≥ 60 m²**, which were **68%** of all craters. (60 m² ≈ a ~9 m apparent disturbance ring incl. ejecta, larger than the §1 true crater because it includes the discoloured ejecta blanket.) Source: NASA Harvest, "Locating Unexploded Ordnance in Ukraine Using Satellite Imagery."
- **Count in one study zone:** ~**22,000 craters** detected in a single eastern-Ukraine study zone. Source: NASA Harvest.
- **Pattern — clustered, not uniform:** craters appear in **concentrated landing zones** (bursts fired from one location, Soviet/Russian fire doctrine), NOT evenly spread. Density is **lower near Russian positions than near Ukrainian positions**. Source: NASA Harvest.
- **Agricultural damage extent:** **1,544,952 ha = 5.72%** of Ukraine's farmland damaged 2022–2023. Source: NASA Harvest / agricultural-damage assessment.
- **Historical density anchors (for "saturated" look):**
  - WWI Verdun: **> 20 million craters** over a few-hundred-hectare area; in the ~200 km² battle area 34 M (German) + 26 M (French) rounds fired. Source: Hupy & Schaetzl (2006).
  - On the most-shelled ground (Thiaumont), craters **overlap continuously**; on the fringes they are **small and widely spaced**; intervening ground becomes **hummocks** between rims. Source: Hupy & Schaetzl (2006), Fig. 4.
  - B-52 carpet bombing (Vietnam, for the linear-stripe pattern): crater swaths **~500 m wide × > 1 km long**, in **linear bands tracing bomber paths**; ~26 M craters total. Source: Hupy & Schaetzl (2006); Westing (1976).
- **Modelling takeaway:** scatter craters in **tight clusters along firing axes / target lines** with overlapping rims in hotspots and sparse isolated pits at the edges — avoid a uniform random sprinkle.

## 4. Blow-down forest (snapped trunks, leaning tangles)

- **Failure modes:** *windsnap* = trunk breaks mid-bole; *windthrow* = uprooted with root plate; *blowdown* = both. War shelling produces the same two signatures plus splintering. Source: "Windthrow," Wikipedia.
- **Root plate (uprooted tree):** mean root-wad surface area **~3 m²**, volume **~2 m³** (severe blowdown study). Source: Northern Wilds / Boundary Waters blowdown ecology.
- **Tangle height:** in severe blowdown, jack-strawed fallen timber can pile into a near-impenetrable wall up to **~6 m (20 ft)** high. Source: High Country News, "Freak wind storm flattens 6 million trees." (Natural windstorm analogue — `[ANALOGUE, not war-specific]`.)
- **Mid-trunk snap height under shelling:** **`[UNSOURCED]`** — no metre figure found for the height at which shells snap pine/oak trunks. Front-line photo evidence (below) shows trunks reduced to standing splintered stumps roughly **2–5 m** tall, but this is `[PHOTO-ESTIMATE, not a sourced measurement]`.

## 5. Burnt forest (charring height, ash ground)

- **Ukraine forest fire loss from combat:** **1,047 km²** of forest burned by military action (Feb 2022–Feb 2024); **8,096 km²** of total territory fire-affected inside combat zones; **22,000 ha** burned in the Chornobyl Exclusion Zone. Source: UWEC Work Group, "Flames of War: How Ukraine lost over 1,000 km² of forest." Worst fire season on record **2024 = 965,000 ha burned**. Source: European Correspondent / satellite data.
- **Post-burn pine morphology:** charred trunks remain standing then **fall over time**; the shrub + grass layer is destroyed; superficial root systems are exposed to sun; bare topsoil opens to erosion. Source: UWEC Work Group.
- **Serebryansky / Kreminna "forest front":** described as "mostly charred and partially felled tree trunks" remaining from heavy artillery + bomb shelling; scorched-earth/incendiary tactics. Sources: Meduza (2023-07-25); SOFREP "A Living Hell: Ukraine's Serebriansky Forest"; Serebryansky Forest, Wikipedia.
- **Charring height up the trunk (metres):** **`[UNSOURCED]`** — no quantitative char-height figure was found in available references. For modelling, char the lower trunk and read photo evidence rather than cite a number.

## 6. Shattered shelterbelts (полезахисні лісосмуги — field windbreaks)

- **Species & geometry:** engineered rows of **oak, poplar and acacia**, planted perpendicular to prevailing wind. Source: European Correspondent; Encyclopedia of Ukraine, "Shelterbelt."
- **Mature height:** **19–23 m**. Source: European Correspondent.
- **Spacing between belts:** **800 m to 1.6 km** apart across the steppe. Source: European Correspondent.
- **Coverage & loss:** **446,000 ha** of belts protected **13 million ha** of chernozem pre-2022; **18%** of protective plantations damaged by 2023. Sources: European Correspondent; ScienceDirect S037811272400673X ("War threatens 18% of protective plantations").
- **Function lost when shattered:** intact belts cut ground wind speed **40–60%** and raise yields **10–30%**; losing them raises potential wind erosion from **0.5–1.0** to **4.0–4.5 t/ha/yr**. Source: Tandfonline 10.1080/00207233.2025.2518036, "Demise of forest-belts in war zones of Ukraine."
- **Modelling takeaway:** a shelterbelt is a **thin linear strip** (a few tree-rows wide) of **~20 m** trees running straight across open field; war damage = gaps of snapped/charred trunks punched through the line, leaving a broken ragged hedge rather than a solid wall.

---

## Source list (tags used above)

- Hupy, J.P. & Schaetzl, R.J. (2006), "Introducing 'Bombturbation,'" *Soil Science* 171(11):823–836 (Verdun/WWI/Vietnam crater morphology, densities, mine craters).
- NASA Harvest, "Locating Unexploded Ordnance in Ukraine Using Satellite Imagery" (crater size, count, clustering, ag damage).
- DTIC ADA111994, "An Analysis of Craters Produced by Artillery Munitions" (155 mm depth/diameter ratios — partial).
- 152 mm howitzer M1943 (D-1), Wikipedia; Lochnagar mine, Wikipedia; Windthrow, Wikipedia; Serebryansky Forest, Wikipedia; Bomb Crater Pond (Walthamstow), Wikipedia.
- UWEC Work Group, "Flames of War" (Ukraine forest fire loss, post-burn morphology).
- Meduza (2023-07-25); SOFREP; IWPR — Serebryansky/Kreminna forest condition.
- European Correspondent, "Why Europe should care about Ukraine's burning windbreak forests"; Encyclopedia of Ukraine "Shelterbelt"; ScienceDirect S037811272400673X; Tandfonline 10.1080/00207233.2025.2518036 (shelterbelt geometry, loss, erosion).
- Northern Wilds; High Country News (natural blowdown analogues — flagged).

### Unsourced gaps (explicitly NOT invented)
- Water-filled crater dimensions specific to Ukraine front.
- Mid-trunk snap height under shelling (metres).
- Charring height up the trunk (metres).
- 120 mm mortar exact crater diameter/depth (only lethal radius found).
