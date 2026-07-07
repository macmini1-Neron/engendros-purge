# World Map Vision — «Зона 704 / Рана» (working title)

**Status:** Vision / macro-level design. NOT an implementation spec — this captures *what goes where and why*, not how to build it.
**Date:** 2026-06-25
**Author of record:** Tomáš (owner), captured via brainstorm.
**Builds on:** `2026-06-11-engendros-white-paper.md` (vision), `2026-06-10-world-biome-placement-plan.md` (biome/district layout), `2026-06-25-terrain-rewrite-design.md` (terrain engine capabilities). **Revises** the white paper's "player starts at the center (0,0)" assumption — see §3.

**Legend:** ✅ LOCKED (owner-decided this session) · 🟡 PROPOSED (suggested default, not yet ratified) · ❓ OPEN (deferred to a later session).

---

## 1. Identity

A single large open-world map (≈2500×2500 m target, revealed incrementally) for ENGENDROS PURGE. Temperate Eastern-European / late-Soviet collapse. The signature dissonance holds: cute plush-zombie "Engendros" against a dead, quarantined landscape. The whole world **wraps around a sealed secret at its heart** — you spend the game going *around* it, and only break in at the very end.

✅ Temperate realism only — **no desert, no volcano, nothing exotic.** Variants of: steppe/plains, forest, taiga, mountains, swamp.

---

## 2. The two-act story

✅ The map is structured as two acts that reuse the same geography.

### Act 1 — «Přechod» (The Crossing) · the story / `purge` mode
You start in one corner and must cross the whole world to the opposite corner, where the Russian government/army has promised to evacuate your squad. The radio keeps the hope alive the whole way ("hold on, we're coming"). You occasionally glimpse the aircraft circling in the distance.

**The gut-punch — beat «Аист» (Stork; the evac that never comes):** You reach the extraction point, signal, and the evac aircraft **actually flies in for you** (scripted cinematic) — and is **shot down over the Zone.** They never come. The state has written your squad off (this is the white paper's "abandoned your squad," delivered as a *felt* moment, not codex text).

### Act 2 — «Покинутые» (The Abandoned) · open-world freeplay / endless
After the betrayal the funnel drops away and the world is a free-roam survival sandbox: revisit any location, blood-moon escalation, **boosted XP for ranks** (persistent across wipes per the white paper's rank/bank persistence). With nowhere left to be rescued *to*, you survive for its own sake — and you can finally break the seal at the center (§7).

> Note: the world is **open in BOTH acts** (§5) — Act 1 is not a hard corridor. The difference is *purpose and pressure*, not freedom of movement.

---

## 3. The spine — corner-to-corner around a sealed center

✅ **Start = SW corner. Goal = NE corner.** The diagonal traverse (~1.4 km) makes the player cross the whole world.

✅ **The center is impassable and sealed** (the dead toxic massif over Object 704 — §7). You cannot go through it. You go **around** it, which immediately creates **two routes**:

- ✅ **Northern route** — long, dry, high: climbs over the **mountains**. The cold, dramatic way.
- ✅ **Southern route** — shorter, low, wet: wades through the **swamp**. The poisoned way.

✅ **Risk/reward routing:** hugging the center is shorter but deadlier; arcing wide is longer but safer. 🟡 The two routes diverge after the start and **reconverge** near the inner industrial ring before the goal (classic fork-and-merge — squad chooses "north or south?").

🟡 The exact center is **offset** from geometric center (irregular radii) so the world never reads as a clean bullseye.

---

## 4. Biomes (temperate palette)

✅ Biomes are a **natural patchwork** (Minecraft-style climate blend — already how the terrain engine works: moisture×temperature → biome weights with smooth ecotone transitions), not concentric rings.

Palette: **steppe/plains · forest (+ forest-steppe) · taiga · mountains · swamp/marsh** — plus the **dead toxic center** (not a livable biome; the wound).

🟡 **Elevation + drainage give the two routes their character and justify the layout ecologically:**
- Mountains (N, highest) → steppe plateau (the rim/start) → forested slopes → **toxic basin (center, low)** → swamp (S, low).
- **The poison drains downhill, south, into the swamp** — which is *why* the southern route is wet and deadlier and the northern route is dry and high. The arrangement isn't arbitrary; the disaster + terrain drainage shaped it.

🟡 The radial dieback (steppe healthy at the rim → forest stressed → dead Red Forest at the core) reads as an ecological dose-gradient from ground zero (Chernobyl Red Forest reference), not as gamey "zones in rings."

---

## 5. Progression model — open world + biome-boss gates

✅ The world is **freely walkable in both acts.** Progress toward the goal is gated by **bosses**, not by walls:

- ✅ **Each biome has ONE main POI with a boss = a hard gate.** Killing that boss **opens a previously blocked passage** (a collapsed underpass, a canyon choke, a flooded causeway, a blast door) that lets you push deeper. *"You can continue without the optional stuff, but not without the biome's main POI."*
- ✅ **Other POIs are optional — "worth to visit" only:** loot, XP, lore, mini-bosses. They never block you. Not every POI is a gate — only the biome's main one.
- 🟡 **Synergy with terrain:** the blocked passages ARE the canyon/slot-gorge chokepoints the heightfield can make (steep cliff walls, open top). Boss dies → rubble/toxic gas/floodwater clears → the gorge opens. No real carved caves needed (§9).
- 🟡 **Start (steppe) is ungated** — a safe rally/foothold with no boss, so newcomers don't trip at the door. The first real gate is the first biome out (forest/airfield N, or swamp/kolkhoz S).

---

## 6. The map — what goes where

Compass layout (✅ positions from the white paper's districts; 🟡 route/boss assignments are proposed defaults):

- 🟢 **SW — START · «КПП» gatehouse + Field Strongpoint** · *steppe*
  Safe foothold: bright, open, rally/respawn, build & loot tutorial space. Ungated.

- ❄️ **NORTH ROUTE** (long, dry, high): steppe → forest → taiga → **mountains**
  - Main POI: 🟡 **Airfield (Аэродром)** — wide-open kite arena, hangars as fallback holds; 🟡 the **T-90M «MITRI» tank boss** arena (open ground suits it). Boss down → opens the pass north/inward.
  - 🟡 Side ("worth to visit"): watchtower, downed convoy, forester's lodge.

- ☠️ **SOUTH ROUTE** (short, wet, deadlier — toxin drains here): steppe → **swamp**
  - Main POI: 🟡 **Kolkhoz «Rudá step»** — barns, thickets, ambush/soft cover; 🟡 boss = a swamp horror (candidate: **Tolo**, whose charge-and-belly-bullseye suits tight barn terrain) ❓. Boss down → drains the flooded causeway / lowers the dam to cross.
  - 🟡 Side: reed-marsh poacher camp, sunken church.

- 🏭 **INNER RING — «Kombinát»** (both routes reconverge): *industrial + Zone edge*
  Soviet industrial complex ringing the sealed center. Long-sightline factory holdout. 🟡 Boss = a Zone heavy ❓. Boss down → **opens the underpass east** toward the evac LZ (the literal "kill boss → opens the blocked podchod").
  - 🟡 Side: ТЭЦ power plant, rail yard.

- 🔒 **CENTER — «Рана» / Object 704** (impassable & sealed in Act 1): *dead toxic massif*
  Dead Red Forest, toxic haze, anomalies, the ruined reactor. A **cave portal → the secret research complex** (§7). You go *around* it in Act 1.

- 🎯 **NE — GOAL · Evac LZ + «Объект 1180» bunker**
  The extraction point and the staging of beat «Аист» (§2). Multi-level command bunker. The Act 1 climax. In Act 2 this + the **downed-evac wreck** become free-roam holdout/loot sites.

**Orientation beacons (skyline, for navigation + co-op callouts):** ruined Object 704 reactor + toxic haze (center, the master landmark) · ТЭЦ chimney (Kombinát) · airfield control tower (N) · water tower (Kolkhoz, S) · bunker antenna (NE goal). You should always be able to triangulate from at least two.

---

## 7. The sealed heart — Object 704

✅ The center is **a cave portal leading into a built secret research complex** — Object 704, the cradle of the PLUSHTAL program and the Engendros. Pure STALKER X-Lab DNA (secret underground labs under the Zone).

- ✅ **Act 1: sealed.** You pass it by — see the cave mouth from afar, hear it foreshadowed on the radio. No entry.
- ✅ **Act 2: the seal can be broken.** Descending into Object 704 is the **endgame dungeon** — deepest level, source of the infestation, the lore truth, the **final boss**, and the highest XP/loot in the game. The carrot that justifies grinding ranks.

🟡 Engine reality (and why this works): a real cave can't be carved into the heightfield, but a **cave-mouth prop + an authored multi-level interior** is exactly what the engine already does (the bunker). So Object 704 is a built interior dungeon entered through a portal, not a hole in the terrain. ❓ The complex's internal design is its own future spec.

---

## 8. Design principles applied (genre research)

The macro shape above is built on holdout/wave-shooter level-design lessons (L4D, Killing Floor, COD Zombies, de_dust2, STALKER, DRG/Helldivers):

- **"Wide × narrow" rhythm** — open kite spaces (steppe, airfield) alternating with tight chokes (canyon gates, swamp causeways, factory interiors).
- 🟡 **Every holdout = one kite loop + two escape routes + 2–3 attack fronts**, ringed by a **no-spawn bubble** so enemies must travel to you, never spawn inside the wire. (Per-node detail is ❓ deferred.)
- **AI Director pacing** — build-up → peak → relax → rest; spawn out of the player's sightline. Especially Act 2 / blood-moon escalation.
- **Skyline landmarks + named zones + Soviet stencil signage** (Цех, ТЭЦ, КПП, arrows) as the callout vocabulary.
- **Replayability** — route choice (N/S), which POIs you tackle, director-varied objective/boss/supply placement; same geography plays differently each run.
- **Destructible battlefield** — felling, digging, fortifying rework the terrain; bosses/heavies can breach player walls so digging-in is a delay, not a win condition.
- **Biome = signature silhouette + signature hazard** (airfield tower / tank · swamp water + toxin · factory gantries · mountain cliffs · the dead core).

---

## 9. Engine constraints honored

From the terrain rewrite (`2026-06-25-terrain-rewrite-design.md`):

- **Heightfield is 2.5D** — no carved caves/tunnels/overhangs. → "Cave" feeling delivered two ways: **slot canyons/gorges** (steep cliff walls, open top — fully heightfield-legal, and they double as the boss-gates) and **authored interior structures** (the bunker, Object 704 complex). ✅ Honored throughout (§5, §7).
- **Cliffs >35° are natural walls** — used as the central seal and the canyon gates (free chokepoints).
- **Co-op deterministic** — terrain + placement are pure functions of (x,z)+seed; no extra sync.
- **144 fps target** even at 2500² via chunked LOD + culling + textureless in-shader biome look.
- **Reveal incrementally** — the forest slice ships first (~256 m); the playable bounds grow outward as POIs come online. Map scale stays a tunable dial, not a commitment (owner is sensitive to map-size/perf).

---

## 10. Design review — risks & what not to forget

A game-design pass on the vision above, benchmarked against how shipped games handle these exact structures. Findings are recommendations (🟡) unless they reinforce an already-locked decision. The structure is sound — these protect its *execution*.

**What we already got right (validated by precedent):**
- Sealed center as orientation-beacon-of-dread = the "weenie" technique (BotW Hyrule Castle, Elden Ring Erdtree, Subnautica Aurora).
- Boss-death-opens-passage = the Zelda dungeon→region pattern; "toxic gas vents when its source-boss dies" is the strongest gate type because it is **self-explaining** (no tooltip).
- Two-act campaign→endless = Borderlands Mayhem / Deep Rock Galactic / Helldivers 2 structure.
- World-gate state being host-authoritative fits the existing `hostSim` model exactly.

### The five risks that decide quality

**① "Open the world" must not mean "empty the world." (Top risk.)**
Far Cry 5's post-credits map "noticeably dies off" — when the story's reason-to-be-there ends, the world hollows out. **Fix: the betrayal BECOMES the threat engine.** The state doesn't abandon you passively — it *actively writes you off*: army hunter-patrols, cut supply lines, escalating infestation. Act 2 gets *worse*, not quieter. This triple-fits the north-star — it is the most "Soviet dread" beat possible (the state declaring you dead), it converts a one-time narrative beat into a recurring SYSTEM (systems-over-content), and it gives endless play a direction (Helldivers' living frontline). **Single highest-value idea in the review.**

**② The shoot-down must be PLAYED, not watched.**
CoD4's nuke ("Aftermath" makes you crawl) and Halo: Reach's final "Survive" objective land because the player *acts through* the moment. Keep the squad playing — sprinting to the LZ, laying covering fire — when the evac is hit, then hand them an *immediate shared survival task*. No passive cutscene. Trigger host-authoritatively so all 6 witness it together. Veterans replay the *fight*, not the reveal → vary the post-betrayal horde (AI Director).

**③ Foreshadow the betrayal or it reads as cheap.**
Spec Ops: The Line earns its twist via foreshadowing + complicity; BioShock's "would you kindly" fixes the outcome but *comments* on it. Across Act 1, **degrade the radio promises** (vaguer reassurances, "the corridor is contested," a dispatcher who hesitates). Fix the *outcome* (the Stork always dies) but keep the *approach* emergent, so it feels like *the player's* run ended in betrayal, not a rail.

**④ Object 704 must feel alive, not sit inert for hours.**
- Unique tall silhouette + sickly glow legible from BOTH routes (a weenie — BotW/Elden Ring).
- **Escalate it as biome bosses die** (glow intensifies, a siren, gas thickens) — the center "wakes up" as you close in.
- **Seed the interior before the breach** (recovered logs, a corpse dragged toward the seal, gas venting outward) so the Act 2 descent *confirms* a place players have imagined for hours (S.T.A.L.K.E.R. X-Labs, Subnautica Aurora).
- The breach must be a **categorical shift** — its own lighting, music, enemy roster, loot — not "more arena."

**⑤ Co-op rules (map cleanly onto `hostSim`):**
- World-gate state (open passages, dead bosses) = host-authoritative; loot/cash/meta = per-player; **credit each boss kill to all participants' meta** (Remnant 2 model).
- **Never lock a player out** of a boss arena or biome transition — warp laggards; make evac and the 704 descent rally points for the whole squad (DRG/Helldivers "no one left behind").
- **Scale boss HP/spawn pressure to live headcount** (cap 6) so a full stack doesn't faceroll a solo-tuned gate.

### Smaller but important
- Each boss that opens a passage should also drop a **fast-travel / extraction node** there — kills backtracking (Metroidvania/Souls shortcut lesson).
- **Optional POIs must genuinely pay** (loot/lore/shortcut) or the open world collapses into a corridor (Far Cry side-content lesson).
- Make **rank persistence a visible, tiered ladder** (Borderlands Mayhem) — finishing Act 1 should feel like *unlocking the real game*, not a faster trickle.
- **Rotating events + day-night + weather** so one map re-reads endlessly (DRG randomization); ship Act 2 with depth, not as a stub (No Man's Sky launch lesson).
- **No unexplained invisible walls** — every gate is rubble/gas/water/door; soft danger-gates must be telegraphed (corpses, visibly scaled enemies), never silent lethality.

### How this updates the open questions (§11)
- *"How the seal breaks in Act 2"* → tie to killing the biome bosses, and stage 704's escalation to those kills (risk ④).
- *"NE evac staging"* → design it as a *played* survival beat, not a cutscene (risk ②), with degraded-radio foreshadowing seeded back through Act 1 (risk ③).
- *"Boss roster assignment"* → add the co-op scaling + all-participants-credit rule (risk ⑤).
- **New, now load-bearing:** *what is Act 2's escalating threat system* (hunter-patrols / cut-supply / spreading infestation) — risk ①.

---

## 11. Open questions (deferred to later sessions)

- ❓ **Boss roster assignment** — which boss anchors each biome, and the Object 704 final boss. Reconcile with the canonical 9-boss Engendros bible (the live `enemies.js` roster is known-stale vs the bible). Confirm tank=airfield, Tolo=swamp or reassign.
- ❓ **Per-node holdout design** — the kite loop / exits / attack fronts for each main POI.
- ❓ **Side "worth to visit" POIs** — concrete identities and rewards, so the space between nodes isn't empty.
- ❓ **NE evac staging** — exact LZ geometry, the «Аист» cinematic shot-down choreography, and how the wreck becomes an Act 2 site.
- ❓ **Object 704 complex** — internal multi-level dungeon design (its own spec).
- ❓ **Gate-opening flavor per biome** — rubble cleared / toxin clears / dam drains / blast door, etc.
- ❓ **Map scale / exact dimensions** — owner's perf-gated call.
- ❓ **How the seal breaks** in Act 2 (clear all biome bosses? a final key? infestation recedes?).
- ❓ **Act 2's escalating threat system** (load-bearing, §10 ①) — the army hunter-patrols / cut-supply / spreading-infestation that *replaces* Act 1's pressure so the open world doesn't go hollow.

---

## 12. References

- `docs/superpowers/specs/2026-06-11-engendros-white-paper.md` — vision (Soviet open-world roguelite, reinfestation, rank persistence).
- `docs/superpowers/specs/2026-06-10-world-biome-placement-plan.md` — districts + biome elevation/moisture model.
- `docs/superpowers/specs/2026-06-25-terrain-rewrite-design.md` — terrain engine capabilities & constraints.
- `docs/2026-06-04-bunker-multilevel-build-spec.md` — the multi-level interior pattern (template for Object 704).
- `docs/design-principles.md` — Soviet dread · systemic destruction · co-op survival.
- Genre level-design sources: Left 4 Dead Design Theory (Valve) · KF2 Holdout Map Guide · COD Zombies survival design · de_dust2 / CS LD · S.T.A.L.K.E.R. · Deep Rock Galactic · Helldivers 2 POIs.
- Design-review precedents (§10): Far Cry 5 post-story emptiness · Borderlands 3 Mayhem (endless-after-story) · Deep Rock Galactic / Helldivers 2 (endless loop, co-op host-progression) · No Man's Sky (ship-with-depth) · Spec Ops: The Line & BioShock (earned/scripted twist) · CoD4 "Shock and Awe" & Halo: Reach (played-not-watched climax) · Left 4 Dead finale (co-op crescendo) · BotW Hyrule Castle / Elden Ring Erdtree / Subnautica Aurora (the "weenie" beacon) · Zelda & Souls fog-gates (diegetic gating) · Remnant 2 (co-op host-world / personal-loot).
