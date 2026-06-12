# ENGENDROS PURGE — Game-Design Principles (senior reference)

> **Audience:** any agent or dev *designing, reviewing, or scoping* a gameplay feature for ENGENDROS
> PURGE. Read this **before** brainstorming or building gameplay, and run your idea through the
> **checklist at the bottom**.
> **Provenance:** distilled from owner design debates (first captured 2026-06-12) through a
> senior-games-designer lens. Evergreen — extend it as the game's identity sharpens.
> **Language:** English (docs/spec convention). Conversational replies to the owner are Czech.

---

## North Star

> ENGENDROS PURGE is a **voxel-cute Soviet *systemic* survival-horror roguelite, built by two people.**
> Three disciplines follow from that, and they rank every design decision:
>
> 1. **Moments must carry weight** — game feel / juice.
> 2. **Dread is a rhythm, not a constant** — horror pacing.
> 3. **Win on systems, not content** — two devs can never out-author the audience; emergence is the
>    only sustainable content engine.

Three **pillars** to test every feature against: **Soviet dread · systemic destruction · co-op
survival.** A feature that serves none of them is a candidate to cut, however cool in isolation.

---

## 1. Make moments carry weight (juice / game feel)

- **Hitstop (frame-freeze).** On a heavy hit (headshot, breach, boss strike) freeze the sim 2–5
  frames. The brain reads it as impact weight. Cheapest high-impact trick that exists; trivial on a
  variable-dt loop. *Failure mode it fixes:* voxel hits that feel papery.
- **Dynamic range of juice.** Keep a calm **floor** of feedback on common actions and **reserve the
  ceiling** (screen shake, hitstop, bass hit) for big moments. If everything screams, nothing does.
- **Layered feedback < 100 ms.** Every important action hits 4–5 channels *simultaneously*: visual
  (flash+particle+decal), audio transient, camera kick, kinesthetic recoil/knockback, UI. It's the
  **simultaneity and low latency** that sell it, not any single effect.
- **Destruction must change the playspace, not just look good.** A breach is only "great" if it
  alters play — opens a flank, removes cover, and (horror) **lets the threat *and the light* in.**
  Cosmetic-only destruction is wasted budget. See `docs/superpowers/specs/2026-06-10-destruction-overhaul-design.md` §2.6.

## 2. Dread is a rhythm, not a constant (survival horror)

- **The exhale.** Horror is the *rhythm* of safety and threat. 100%-threat habituates and stops being
  scary. Design **safe pockets** (bunker, lobby, lit room) deliberately as silence, so leaving them
  costs something. Day/night + reinfestation are the natural cadence engine here.
- **The dread tax — anticipation beats the reveal.** The scariest beat is the *wait*. Telegraph with
  a cue before the encounter. The **diegetic radio + jukebox** is a near-unique weapon: cut music to
  static before a boss = free dread. The audio-duck system is a horror tool, not just a mixer.
- **Scarcity *is* the horror.** Survival horror is an inventory/economy genre in a monster costume
  (Resident Evil is a logistics puzzle). The fear is "do I have enough," not gore. The held-gun-only
  ammo refill already carries this DNA — lean into scarcity over splatter (cheaper *and* scarier).
- **Legible depth.** Depth the player can't *see* reads as a bug or unfairness, not sophistication.
  Every deep system needs a **surface tell** (e.g. radiation-heals-Engendros must show a clear aura).
  Invisible depth = confusion.

## 3. Win on systems, not content (the two-person law)

- **Invest in system *intersections*, not more isolated systems.** The magic is where fire ×
  destruction × status-effects × AI-pathing *collide* (fire spreads through a wooden village → burns
  cover → reroutes enemies → a radiation pool heals them but flame doesn't). That's an infinite
  co-op-story generator. Before adding a system, ask **"how many existing systems does it touch?"**
  Zero → it's bloat.
- **Verbs > features.** Think in **verbs** (shoot, breach, burn, hide, revive, drive, loot). Adding
  *one verb* (HIDE / DISTRACT / manage LIGHT) usually adds more than ten items. Horror's missing
  verbs are often hide, distract, barricade, manage-light.
- **Lean into the cute × brutal dissonance — it's the USP, not a bug.** Plush-zombie cuteness makes
  brutality land *harder* (Don't Starve, Lethal Company, Inscryption). Sharpen *both* edges; never
  sand one to "match" the other.
- **Pillars + kill your darlings.** Test every feature against the three pillars; cut what serves
  none. Vertical slice before breadth (the MVP = 1 biome + 1 boss complex is exactly this discipline).

## 4. Co-op & difficulty

- **Forced interdependence creates the stories.** Build **two-person locks** — one drives / one
  gunners (already in the tank), one holds the door / one flips the switch, one lights / one shoots.
  Asymmetric tasks = vivid memories.
- **Competence gradient.** Let the weaker player still contribute (carry ammo, revive, spot, hold the
  light) so a skill mismatch doesn't ruin co-op. (Directly relevant: the two brothers play together.)
- **Brutal must be fair *and* readable — every death teaches.** Fixed solo-brutal is a respectable
  Souls-like choice, but "I died and know exactly why and how to do better" is good brutal; "died to
  something I couldn't see" is cheap. Telegraphing (§2 legibility) is what makes brutal feel fair.
  Brutal also needs a release valve — persistent **bank + rank surviving the WIPE** must read as
  forward motion, or brutality becomes despair.

## 5. Senior process notes

- **Worship the playtest.** The only truth is watching *someone else* play and **not helping**. Note
  where they're confused / bored / frustrated — those map to legibility / pacing / fairness. Where
  the hand hesitates matters more than what the mouth says.
- **Content is a treadmill; systems are an engine.** A two-person team cannot win the treadmill.
  Every hour spent on emergent-system depth pays compounding interest; every hour on one-shot scripted
  content is consumed once.

---

## Feature checklist — run any new gameplay idea through this

- [ ] **Pillar:** which of *Soviet dread / systemic destruction / co-op survival* does it serve? (None → cut.)
- [ ] **Verb or number?** Does it add a verb/playstyle, or just a stat/skin? Verbs win.
- [ ] **Intersections:** how many existing systems does it touch? Zero = bloat.
- [ ] **Legible depth:** is its depth visible as a surface tell, or invisible (reads as a bug)?
- [ ] **Juice range:** is big-moment feedback *reserved*, or does this flatten the dynamic range?
- [ ] **Co-op:** does it create interdependence and let the weaker player contribute?
- [ ] **Fair-brutal:** if it can kill the player, is the death readable and teaching?
- [ ] **Content vs system:** hand-authored one-shot (treadmill) or emergent (engine)?
- [ ] **Horror rhythm:** does it respect the exhale (safe pockets) and use anticipation over reveal?
