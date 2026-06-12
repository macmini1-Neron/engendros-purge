# Co-op Mechanics — Design

- **Date:** 2026-06-12
- **Status:** design / spec (pre-plan) — distilled from an owner design debate
- **Branch:** `docs/coop-mechanics-design`
- **Owner intent:** "Indirectly *encourage* co-op (don't force it) — everything is a bit better with a buddy. The peak co-op feature is a properly **crewed tank**. Plus an ultra-emotional signature: an infected player can turn into an Engendros mini-boss for one last doomed rampage."
- **Reads on top of:** `docs/design-principles.md` (north-star + checklist), `2026-06-10-destruction-overhaul-design.md` §2.6 (the cosmetic-vs-authoritative split, reused everywhere here), the status-effects system (`src/effects-status.js`), and the white-paper vision (Soviet open-world survival-horror roguelite).

## 0. Summary of locked decisions (from the debate)

| Decision | Choice |
|---|---|
| Co-op posture | **Soft nudges, not hard locks** — solo is always *possible*, co-op is *better*. The only hard two-person gates are thematic (doors / launch rituals). |
| Detection economy | **Light + diegetic sound raise enemy detection range.** Flashlight battery drains → **real-time battery-swap minigame** (a buddy can swap yours, faster). |
| Care economy | **Self vs ally asymmetry.** Heal: **self 50% / ally 75%** effect, ally application **much faster**. Bandage: **self greatly slows bleed but does NOT stop it; ally fully stops it.** Deterministic (no RNG-botch). |
| Peak mechanic | **Crewed tank (T-62)** — driver / gunner / loader / commander. Soloable but **serialized & slow**; a full crew runs in **parallel = fast**. |
| Two-player gates | **Simultaneous-interaction rituals** (doors, rocket launch, two-key) on the existing host-auth console system. "We mostly have it." |
| Death = piloted Engendros | **No human resurrection** — the dead become monsters (genre-honest). Two presets: infected death → buffed **«обращение» mini-boss** (the team kills it) → then anonymous **infinite-respawn grunt**; else straight to grunt. Spectate is the alternative. **Co-op only — solo death just ends the run** (a deliberate co-op nudge). |
| Bleed | **Lethal, flat per-hit.** A hit taken while *already* below 100% HP rolls **~1%** to start a bleed DoT (the hit that first drops you below 100% never does; at 100% you're immune); enemies roll **~10%** while below 20%. Bleed → **DOWN** (bleed-out = **shorter** revive bar); **revive clears it**; bandage counters (self slows, ally stops). Extends the existing `bleed` effect. |
| Future | Spotter + gunner on a **mortar** (indirect fire). |

**Three co-op pillars** emerged; everything below hangs off them:

- **A — Detection economy:** *visibility is a cost.* (The stealth-horror core.)
- **B — Care economy:** *support is better together.* (Heal / bandage / revive.)
- **C — Crew economy:** *power scales with the number of players.* (Tank, crewed weapons, two-key rituals.)
- **+ Signature:** the infection turn — the emotional peak that ties the run's stakes together.

## 1. Philosophy — soft nudges over hard locks

The default lever is **incentive, not gate**: you *can* do the thing alone, it is just *better* with a buddy. This keeps the fixed solo-brutal mode playable while making co-op the path of least resistance. Reserve **hard** two-player locks for moments where the *theme* demands it (a blast door, a launch ritual) — never for survival basics (healing, light, movement).

**Owner tuning note (care economy):** even ally-care is sub-100% (heal 75%, never full). That is deliberate — **all** healing is a *partial measure*, which keeps consumables scarce and tense (survival-horror DNA); co-op just buys the *better* partial. Consequence to balance for: heal-item drop rates must be tuned against sub-100% efficiency, and **solo is meaningfully harder** (intended, consistent with solo-brutal). This is the owner's call over the alternative "self = 100% baseline, ally = bonus" framing.

## 2. Pillar A — Detection economy (visibility is a cost)

Turns light and sound from pure tools into a **liability** — the stealth-horror core.

- **Light raises detection.** Holding/shining a light enlarges the radius at which Engendros notice you (moth-to-flame). Darkness = safer but blind. This is the constant negotiation.
- **Diegetic sound raises detection.** Only **in-world** audio sources count — a carried boombox, a switched-on radio, the bunker gramophone — **never the non-diegetic HUD soundtrack** (that would be unfair). So turning on the gramophone for a morale/comfort beat is a **noise risk** (a real intersection with the music systems + a future morale system).
- **Battery drain + swap minigame.** The flashlight battery depletes; swapping is a **real-time fumble under threat** (not a safe pause) — shaking-hands minigame, do it clean = fast, fumble = slower / dropped cell. **Co-op:** a teammate can swap *your* battery (faster, or while you keep shooting). One holds light / one swaps, or one lights / one shoots.
- **Legibility (mandatory):** the player must *see* "I'm lit → I'm louder to them" — a visibility/noise tell (aura, meter, or enemies visibly orienting to light). Hidden penalty reads as a bug (design-principles §legible-depth).

**Netcode:** detection radius + AI aggro are **host-authoritative** (enemies are host-sim). The light cone, battery UI, and minigame animation are **client-cosmetic**; only the *resulting* "this player is detectable at radius R / made a noise event at P" feeds the host AI. Consistent with destruction §2.6.

## 3. Pillar B — Care economy (better together)

Self-care is degraded & fumbly; ally-care is full(er) & clean. Apply this **one language** consistently across all support actions.

| Action | Self | Ally |
|---|---|---|
| **Heal (medkit)** | **50%** effect, slower | **75%** effect, **much faster** |
| **Bandage (bleed)** | greatly **slows** bleed, does **not stop** it | **fully stops** the bleed, fast |
| **Revive (down)** | impossible (you can't self-revive) | click-CPR (already shipped, `mp.js`) |

- **Severity gradient.** The gap **grows with severity** — a scratch you self-treat fine; heavy wounds / heavy bleed / **down** strongly favor or require a buddy. The existing **down + CPR** is this gradient at its extreme (you can't lift yourself); the heal/bandage asymmetry is the same rule extended to lighter wounds. Realistic (a plaster on yourself, yes; surgery on yourself, no) and coherent.
- **Why it's strategically good.** Support is the classic way a *less-skilled* player contributes (be the medic) → directly feeds the **competence-gradient** pillar (the weaker brother has a clear, valuable role). Ally-care is also more resource-efficient → co-op stretches loot further → another quiet incentive.
- **Guardrails:** (1) ally-care must be **fast enough & safe-ish** to actually get used, or the nudge fails — balance the vulnerability window; (2) don't **stack** too many self-penalties across the game (this + battery-fumble + any future "can't see own vitals") or "co-op is nice" tips into "solo is misery" — *budget* the interdependence; (3) legibility — show *why* self did less ("self-applied — reduced").
- **Bleed — lethal, flat per-hit (extends the existing effect).** A hit only rolls for bleed if your **pre-hit HP is already below 100%** (so the hit that first wounds you never bleeds, and at full HP you are immune); the chance is a small **flat ~1%** — **NOT** scaled by HP (scaling would make you bleed constantly when hurt = annoying). Enemies use the same flat model at **~10% while below 20% HP** (so a near-dead plushie likely bleeds out — you need not always land the finisher). Bleed drains HP → at 0 you go **DOWN** (§5), it does **not** instakill. **Bandage is the counter:** self-bandage slows it, ally-bandage stops it; **revive clears it.** *Implementation:* extend the existing `bleed` effect in `src/effects-status.js` (currently slow+weaken / non-lethal per PR #42) with the lethal HP-drain + the per-hit trigger — reuse, don't fork. «Пух» is *only* this effect (no harvest / drop / transfusion).

**Netcode:** all HP/armor/bleed changes are **host-authoritative `pstate`** (the single life-state truth — never the visual `xf` flags). `Player.hurt()` already routes to `mp.claimPlayerHit`; healing/bandage claims route the same way. The heal swirl, bandage animation, and minigame are **client-cosmetic**.

## 4. Pillar C — Crew economy (power scales with players)

The **peak** co-op feature. The tank returns **deliberately as the crewed T-62** you are building part-by-part in Blender — *not* the old auto-rigged T-90M placeholder that was stripped from `main`.

### 4.1 Stations & the competence gradient

T-62 historically = **4 crew, manual loader** (T-72+ autoloaders dropped to 3 — so the loader bottleneck is *authentic* here):

| Station | Job | Decision loop (so nobody just watches) |
|---|---|---|
| **Driver** | move, position | terrain, hull-down, ramming, retreat lines |
| **Gunner** | aim main gun + coax | lead, range, call the shot |
| **Loader** | reload main gun | **choose AP vs HE per shot** → directly drives the destruction caliber matrix (APFSDS = through-hole + spall; HE = breach). The gunner calls "HE on that wall!", the loader feeds it. |
| **Commander** | spot / designate, hull MG, hatch | spotting (the spotter pattern), pop-hatch risk/reward, MG suppression |

- **Soloable but serialized.** Empty stations are **not** AI-filled — the lone player **switches seats** (drive → stop → switch to gun → fire → switch to load), so solo is slow & vulnerable. **2 players** = one drives+commands, one guns+self-loads (slower reload). **4** = parallel = full speed. *Reload time can literally scale*: dedicated loader = X s; self-load = 2X+ (climb to the breach). The owner's "2 can do it but everything takes longer, like real life" is exactly this.
- **No passenger boredom** (the known crew-vehicle failure): every station has a real decision loop (above). The **loader ↔ destruction-caliber** coupling is the key win — the loader is *choosing ammunition for the situation*, not pressing R.

### 4.2 The tank as a tactical object

- A mobile two-person-lock **fortress**, but it **concentrates the squad** (eggs in one basket) and can be **crew-killed** (exposed commander hatch → capture/kill, reusing the old MITRI capture logic).
- **Netcode — new pattern:** the tank is **one host-authoritative entity with multiple controllers** — several players feed inputs to one host-sim object, which broadcasts the unified state. This is *new* vs the current "one player = one controller" assumption; flag it for the netcode work. Seat occupancy, turret/hull state, and shots are host-auth; cosmetic recoil/dust/seat-cam are client-side.

### 4.3 Two-player rituals (the hard-lock exceptions)

The thematic hard gates, built on the **existing host-auth console system** (gatehouse gate, bunker гермодвери, radio — all `E`-button, host-authoritative):

- **Simultaneous interaction** — a blast door / rocket launch / boss-arena seal needs **two consoles held within a ~1–2 s window**, the panels placed **far apart** so the squad must split under pressure.
- **Soviet two-key launch (PAL)** — the canonical two-operators-two-keys ritual for a heavy payoff (artillery, the Su-24 flyby, a generator overload): both players pinned at consoles while the horde closes. Pure flavor + a genuine two-person lock.
- Implementation is a **small extension**: add a simultaneity check + spatial separation to the console primitive that already exists. "We mostly have it."

## 5. Death, the player-piloted Engendros & continuity

One system unifies the infection turn, the "become a zombie" option, and the bleed-out path: **a dead player piloting an Engendros body**, in two presets. **No human resurrection** — the dead become monsters (genre-honest; this is what dissolves the "revive isn't realistic, least of all in the USSR" problem). The only true revive is Tier-1 field medicine on the *dying* (§3), never on the dead.

### 5.1 The ladder (state machine)

```
ALIVE
 ├─ a hit taken while ALREADY below 100% HP → flat ~1% to start a BLEED DoT (§3)
 │     (the hit that first drops you below 100% never bleeds; at 100% you're immune)
 ├─ bleed, if un-bandaged, drains HP → at 0 → DOWN
 └─ DOWN (a knockdown OR a bleed-out) → host-ticked revive bar → teammate CPR, or it empties → TRUE DEATH
       · a BLEED-OUT down gets a SHORTER bar than a normal knockdown (more critical)
       · CPR / revive CLEARS the bleed (you don't pop back up still leaking)
TRUE DEATH  — co-op only (see 5.4):
 ├─ INFECTED (meter high) → «ОБРАЩЕНИЕ» mini-boss preset (forced) → the team kills it →
 └─ not infected → straight to the menu
DEATH MENU (choose):
 ├─ Spectate (passive; may gain light "helpful-ghost" assist verbs later)
 └─ Engendros GRUNT preset — average plushie, anonymous, INFINITE respawn for the rest of the run
RUN ENDS (wipe / success) → all to lobby; meta (bank/rank) banked at human death survives.
```

### 5.2 Two presets of one "player-piloted Engendros"

| | **«Обращение» mini-boss** | **Grunt** |
|---|---|---|
| Trigger | infected terminal death (forced) | post-mini-boss, or any non-infected death (chosen) |
| Allegiance | **hostile** — the dead player pilots it *against* the team, who hunt and kill it | hostile (joins the horde) |
| Lives | one — ends when killed, or a **~45 s max-duration safety** (so a fleeing boss can't stall the run) | **infinite respawn** for the rest of the run |
| Stats | buffed (high HP, heavy melee) | **average plushie** |
| Ability | **one** telegraphed signature — a weaker / distinct Tolo-laser-like power (may vary by loadout / infection); never stronger than a real boss | none |
| Identity | **visible spectacle** — identifiable as your turned teammate | **anonymous** — normal plushie anim; only an F3 id tag reveals it (survivors don't see it casually — the real "tell" is human behaviour) |
| Pressure | raw power | persistence + a soft **horde influence** (nearby AI loosely follow), so it accelerates the run without standing out |
| Loot on death | **drops a reward** (closure + a reason to hunt it) | **nothing** (infinite respawn would otherwise be a farm) |
| Boss interiors | n/a | **locked out** — protects the designed boss encounter; the grunt waits in the overworld while the team is inside |

The mini-boss dramatizes the **fall from named survivor → boss → anonymous fodder** (ПЛЮШТАЛЬ: the individual dissolved into the plush mass). As more teammates fall, the horde swells with *intelligent* plushies — a thematic death-spiral.

### 5.3 Knobs (v0 defaults)

- **Grunt respawn:** infinite *for the run*, on a **cooldown + spawn at the horde edge** (never on the survivors) — pressure is persistence, not spawn-camping.
- **Meta-knowledge / grief** (the dead player knows the team's plans): fine for the two brothers; flag for any future public play.
- **Kill attribution:** an Engendros that bleeds out *on its own* credits the **last damager** (host-auth) so cash/score isn't lost.

### 5.4 Solo — death just ends the run (push co-op)

**The whole afterlife is co-op-only.** In **solo**, death = **end of run** → lobby. No spectate, no mini-boss, no grunt — there is no team to pilot against, and keeping solo death plain & final is a deliberate **nudge toward co-op.**

**Netcode:** the piloted body (mini-boss or grunt) is a **host-authoritative** Engendros fed by the dead player's inputs; its HP, respawn/cooldown, and every death→menu / `pstate` transition are host-owned. Rampage VFX/roar and the F3 tag are client-cosmetic. Bleed HP-drain is host-auth `pstate`; the bleed swirl is cosmetic. Same `hostSim = !mp.active || mp.isHost` gate as all authoritative logic.

## 6. Future / parked candidates (not locked)

Kept for later; clearly *not* committed:

- **Spotter + gunner on a mortar** (owner: future) — indirect fire *needs* a spotter who sees the impact and calls corrections ("left 10, add 50"). Extends the tank-thermal spotter pattern.
- **Helpful ghost** — *active* assist verbs for the **spectate** option in §5 (flicker lights to warn, ping enemies, charge a one-time revive beacon) so spectating isn't passive watching. Soviet-призрак flavor.
- ~~«Пух» transfusion / loot drop~~ — **dropped** (owner, 2026-06-12): «пух» stays *purely* the bleed effect — no harvest, no drop, no transfusion economy. See §3.
- **Shared morale / sanity** — a squad meter drained by dark/death/gore, restored by *diegetic social* acts (gramophone, a hot meal, a campfire) → makes the bunker "exhale" mechanical and folds music+food+light into one horror-pacing resource.
- **Hand-cranked dynamo light** (two-person power loop) — superseded for now by the simpler §2 battery model; revisit if a deeper light economy is wanted.
- **Vitals offloaded to your partner (spicy)** — you can't read your *own* health clearly, only your teammate's → forces comms + dread. Flagged as *possibly too punishing*; prototype carefully before committing (risk of stacking self-penalties, see §3 guardrail 2).

## 7. Netcode summary (host-auth vs client-cosmetic)

Apply the destruction §2.6 split **everywhere**: the **gameplay truth** is host-authoritative and synced; the **flourish** is client-local and never sent.

| Mechanic | Host-authoritative (synced) | Client-cosmetic (local) |
|---|---|---|
| Detection | detection radius, aggro, noise events | light cone, battery UI, minigame anim |
| Care | `pstate` HP/armor/bleed, effect clear | heal swirl, bandage anim, fumble anim |
| Tank | seat occupancy, turret/hull state, shots, ammo type | recoil, dust, seat-cam |
| Rituals | door/launch state, simultaneity result | button glow, key-turn anim |
| Piloted Engendros | turn/spawn event, mini-boss & grunt HP, respawn/cooldown, death→menu / `pstate` | rampage VFX, roar, F3 tag |
| Bleed | HP-drain (`pstate`), bleed apply/clear | bleed swirl, deflate FX |

New pattern to flag for netcode work: **one host entity, multiple controllers** (the tank). Everything still gated on `hostSim = !mp.active || mp.isHost`.

## 8. Open questions

1. **Bleed rate tuning:** the flat ~1% (player, sub-100%) / ~10% (enemy, sub-20%) per-hit chances are v0 — validate the "occasional, not constant" feel in the lab.
2. **Care numbers** are v0 (self 50 / ally 75); validate against heal-item drop rates and solo survivability in playtest.
3. **Detection legibility:** which tell (aura vs meter vs enemy-orientation) reads best without HUD clutter?
4. **Tank solo viability:** is seat-switching *fun-slow* or *frustrating-slow*? Lab it before committing to no-AI-crew.
5. **Interdependence budget:** how many self-penalty mechanics ship at once (care + battery + …) before solo feels miserable?

## 9. Out of scope (explicit)

- PvP / versus modes (white-paper: PvP deferred).
- NPC allies / AI crew filling tank seats (deliberately omitted so the crew gradient bites).
- Hard-locking survival basics behind co-op (philosophy §1).
- The parked candidates in §6 until individually promoted.
