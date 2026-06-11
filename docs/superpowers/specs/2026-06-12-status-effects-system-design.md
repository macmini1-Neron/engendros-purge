# Status-effects system — design

**Date:** 2026-06-12
**Branch:** `feat/playable-demo`
**Status:** design — decisions resolved 2026-06-12; awaiting user spec review → implementation plan
**Relates to:** [[deterministic-daynight-rework]] (shares the fixed-tick idea), the dev console (`/effect`, `src/console.js`), the [[engendros-white-paper-vision]] survival pillar ("ultra-deep mechanics via code, not graphics").

## Goal

Unify the game's scattered, ad-hoc status mechanics into **one deterministic, data-driven status-effect system** that works on **any entity (player + enemies)**, surfaced through the dev console: `/effect <target> <effect> [seconds]` to apply and `/effect <target> clear` to wipe.

The headline property — and the reason this is worth a system, not four more fields — is that **an effect means different things per entity kind**: *radiation* damages the player but **heals** an Engendros; *bleed* drains the player's HP but makes an Engendros **leak «пух»** (slow + weaken). That cross-kind inversion is the centerpiece, not a side feature.

## Current state (what we're unifying)

Today these live as bespoke fields + timers, hand-ticked in two update loops:

| Mechanic | Where | Notes |
|---|---|---|
| **Burn** (fire) | `player.burnT`/`_burnTickT` (player.js) · `enemy.burnT` + `ENEMY_BURN_SLOW` (enemies.js) · **co-op:** `mp.js` `pstate.burnT`/`_tickBurn` + `burn`/`ignite` msgs + the `bf` snapshot flag | already on **both** kinds, but across **three** hand-written paths incl. co-op netcode → its migration is deferred to **P3**; **radiation** is the cleaner P1 proof (no legacy/co-op path) |
| **Broken leg** | `player.legBroken` + `_splintT` + `splints` (player.js) | player-only; cured by a splint item |
| **Hunger / starve** | `player.hunger` + `_starveT` (player.js) | a **meter**, not a transient status — **stays as-is, out of scope** (Decision 1) |
| **Radiation, Bleed** | — | **do not exist yet**; added as first-class effects here |

Problems with today's approach: per-mechanic fields, variable-`dt` ticking (frame-rate-dependent totals), no shared apply/clear, player-only except burn, no console control beyond instant heal/hurt, no HUD list.

The dev console already ships `/effect <target> heal|hurt [amount]` (instant, player-only today — `src/console.js`) plus a `target` selector type (`@s/@p/@a/@e[type=…]`) and enum-arg Tab-complete. The console file even anticipates this work — its "Extending" footer uses `register('bleed', …)` as its worked example.

## Design

### 1. Effect model (per entity)
Every effect-able entity (the player and each pooled `Enemy`) gets `entity.effects` — a `Map<effectKey, Instance>` where `Instance = { ticksLeft, stacks }` (`ticksLeft` counts whole effect-ticks; per-tick magnitude is derived from `stacks`). No effect = empty map (cheap). Pooled enemies clear the map on spawn and on death so reuse never leaks state. There is **no per-entity accumulator** — sub-stepping is the shared clock's job (§3).

### 2. Effect registry (`src/effects-status.js`)
A pure-ish data registry, one entry per effect. Each entry is the **single source of truth** for that effect — duration, stacking rule, HUD icon/colour, and the **per-kind behaviour**:
```
EFFECTS = {
  burn:       { secs: 4,  stack: 'refresh',   hud:{icon:'🔥',color:0xff6a2a},
                player: tickBurnPlayer, enemy: tickBurnEnemy },
  bleed:      { secs: 8,  stack: 'magnitude', cap: 3, hud:{icon:'🩸',color:0xcc2030},
                player: tickBleedPlayer, enemy: tickPukhLeak },   // enemy = «пух» leak (Decision 4)
  radiation:  { secs: 10, stack: 'magnitude', cap: 5, hud:{icon:'☢',color:0x9bd64a},
                player: (p,i) => p.hurt(rate(RAD_DPS, i), 1),
                enemy:  (e,i) => game.enemies.heal(e, rate(RAD_HEAL, i)) },  // radiation HEALS Engendros
  broken_leg: { secs: Infinity, stack: 'refresh', hud:{icon:'🦵',color:0xd23a2a},
                onApply: setLimp, onClear: restoreMobility /* no enemy handler */ },
}
```
`onApply`/`onClear` handle non-tick state (broken_leg toggles mobility on apply, restores on clear; effects with no enemy handler simply no-op on enemies). Nothing outside this registry hard-codes effect behaviour. Handlers receive `(entity, inst, ctx)` and act through **injected ops** on `ctx` (`hurtPlayer`, `healEnemy`, `fireFx`, …), so `src/effects-status.js` stays **pure** — no THREE/DOM/game imports — and is node-testable like `src/console-core.js` and `src/simclock.js`.

### 3. Deterministic ticking — reuse `src/simclock.js`
The deterministic fixed-step primitive **already exists and is tested**: `makeClock({ step, maxDt })` in `src/simclock.js` (the same clock `fire.js` runs at `step: 1/10`). Don't hand-roll an accumulator — build on it.

Effect rates are authored **per second**; the clock fires at `EFFECT_TPS = 10` ticks/s and each tick applies `rate / EFFECT_TPS` (scaled by `stacks`), so 10 s of radiation deals the same total regardless of FPS or stutter (Decision 2). **One shared effects clock** (`makeClock({ step: 1/EFFECT_TPS, maxDt: 0.05 })`), advanced once per frame **only on `hostSim`** — exactly how `fire.js:209` gates its clock. Each fixed tick runs a `stepEffects` pass over the player **and** every alive enemy: fire the per-kind handler, decrement `ticksLeft`, delete expired effects (firing `onClear`). This becomes the home for all per-tick effect logic; burn's own migration off `burnT` (including its co-op paths) is deferred to **P3** (§Phasing). The parked [[deterministic-daynight-rework]] can adopt the same primitive later — no dependency now.

### 4. Per-entity-type behaviour (the key idea)
A handler is chosen by the target's kind: `isEnemy(t) ? def.enemy : def.player`. The two showcase inversions:

- **radiation** — player: `hurt(RAD_DPS)`; enemy: `game.enemies.heal(e, RAD_HEAL)`. Needs a small new `EnemyManager.heal(e, n)` helper (clamps to the enemy's max HP, refreshes its health bar).
- **bleed** — player: HP drain (`BLEED_DPS`), cleared by a future bandage/medkit (survival-medicine sub-spec) or `/effect clear`. Enemy: **«пух» leak** — *no* HP drain; instead a movement **slow** **+ weaken** (reduced contact damage), read **passively** by stateless helpers `movementSlow(e)` / `contactWeaken(e)` that scan `e.effects` each frame (so multiple slows compose and nothing goes stale), plus a «пух» particle drip emitted by the per-tick handler. Magnitude stacks deepen the leak up to its cap.

burn keeps its current dual behaviour (player HP DoT; enemy **slow + fire FX, no HP loss** — matching today's code), now expressed as two handlers on one registry entry instead of two divergent code paths. The enemy slow it contributes flows through the same `movementSlow(e)` scan.

### 5. Console (`/effect`) — extend, don't replace
Extend the existing command's `kind` enum (today `['heal','hurt']`) to also carry the effect keys + `clear`:
- `/effect <target> heal|hurt [amount]` — keep the current **instant** ops, now routed through the per-kind dispatch so they work on enemies too (today's heal/hurt is player-only).
- `/effect <target> <effectKey> [seconds]` — **apply** a timed status (default = the effect's `secs`).
- `/effect <target> clear` — **remove all** effects from the target(s) (fires each `onClear`).
- `target` uses the existing selector type; autocomplete reads the enum `choices`, so adding the keys lights up Tab-complete for free.

### 6. HUD + FX
- **Player:** a small **active-effects strip** (icon + shrinking timer bar per effect) read from `entity.effects`, mirroring how `setSurvival` shows leg/hunger today (`ui.js` / `index.html`). `secs: Infinity` effects (broken_leg) show the icon with no countdown.
- **Enemies:** reuse particle/tint FX — burn already tints + fire-pools; radiation = a faint green glow; bleed = a «пух» drip. Enemy FX is **P3 polish**, not required for the mechanic.

## Effect catalogue (implementation reference)

| Key | Player | Enemy (Engendros) | Default secs | Stacking | HUD |
|---|---|---|---|---|---|
| `burn` | HP DoT (`PLAYER_BURN_DPS`) | slow (`ENEMY_BURN_SLOW`) + fire FX | 4 | refresh | 🔥 |
| `bleed` | HP DoT (`BLEED_DPS`) | «пух» leak: slow + weaken + drip FX | 8 | magnitude → cap 3 | 🩸 |
| `radiation` | HP DoT (`RAD_DPS`) | **heal** (`RAD_HEAL`) | 10 | magnitude → cap 5 | ☢ |
| `broken_leg` | limp, no sprint, until splinted | — (no handler) | ∞ | refresh | 🦵 |

(`heal` / `hurt` stay **instant** — they are not stored in `entity.effects`.)

## Decisions (resolved 2026-06-12)
1. **Migration set:** burn + broken_leg + new radiation + new bleed move to effects. **Hunger stays a meter, untouched** (a resource, not a transient status); its removal/rework is a separate survival-medicine sub-spec, per the white paper.
2. **Tick rate:** fixed **10 ticks/s** via the existing tested `makeClock` in `src/simclock.js` (the same fixed-step primitive `fire.js` already runs at `1/10`) — **not** a bespoke accumulator. One shared effects clock, advanced once per frame on `hostSim` (mirrors `fire.js`). The parked [[deterministic-daynight-rework]] can adopt the same primitive later.
3. **Stacking:** re-applying an effect **always refreshes duration** (`ticksLeft = max(remaining, new)`). The `stack` field then governs magnitude: `'refresh'` pins magnitude at 1 (burn, broken_leg — just re-arm the timer); `'magnitude'` grows `stacks` toward a per-effect `cap` (bleed, radiation), and the per-tick rate scales with `stacks`.
4. **Per-kind inversions:** radiation heals Engendros (locked); **bleed on Engendros = «пух» leak** (slow + weaken) — a second inversion. broken_leg stays player-only.
5. **Co-op:** effects are **host-authoritative** (the host owns all damage and `pstate`), deferred to **P3**. Solo / ПОЛИГОН (P1–P2) applies and ticks locally.

## Phasing
> **Re-sequenced during planning:** burn is **woven through the co-op netcode** (`mp.js` owns host-side `pstate.burnT` + `_tickBurn`, broadcasts `burn`/`ignite`, ships enemy burn via the `bf` snapshot flag). Migrating it cleanly means touching co-op — so **burn moves to P3**, and **radiation** (brand-new, no legacy/co-op path) becomes the P1 proof. Both headline inversions still land in P1–P2.

- **P1 — system + clean proof (radiation):** pure `src/effects-status.js` (registry for all four effects + `applyEffect`/`stepEffects`/`clearEffects`/`movementSlow`/`contactWeaken`, node-tested) + one shared `makeClock` advanced on `hostSim` in `game.js` + `entity.effects` maps (player + enemies) + `EnemyManager.heal`. Wire **radiation** end-to-end (`/effect @s radiation` hurts you; `/effect @e radiation` **heals** Engendros — the inversion, on screen). Extend the console `/effect` enum + `clear`. Player HUD effect strip.
- **P2 — bleed + broken_leg:** wire **bleed** (player HP DoT; enemy «пух» leak — `movementSlow`/`contactWeaken` composed alongside the still-legacy burn-slow term, + drip FX). Migrate **broken_leg** into the effect system (player-only, no co-op risk: `breakLeg`/`applySplint` route through `applyEffect`/effect-removal; the leg shows in the HUD strip).
- **P3 — burn migration + co-op + FX polish (separate plan):** migrate **burn** into effects including its `mp.js` co-op paths (retire `pstate.burnT`/`_tickBurn`/`bf`); host-authoritative effect apply/tick + broadcast; enemy effect FX polish (radiation glow, richer «пух»).

## Out of scope
- The deterministic day/night rework itself ([[deterministic-daynight-rework]]) — effect ticking lands first; day/night adopts the shared pattern later.
- **No new survival meters.** Hunger stays as-is; removing it is the survival-medicine sub-spec's call.
- **Effect *sources*** beyond what already exists (molotov → burn, fall → broken_leg). Contamination-zone → radiation, enemy-claw → bleed, and the bandage/medkit cure are hooks for the arsenal/medicine sub-specs; this spec delivers the *system* + console control those will feed.
