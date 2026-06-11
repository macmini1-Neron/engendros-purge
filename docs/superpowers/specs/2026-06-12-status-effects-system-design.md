# Status-effects system — design

**Date:** 2026-06-12
**Branch:** `feat/playable-demo`
**Status:** design draft — for review, then → implementation plan
**Relates to:** [[deterministic-daynight-rework]] (shared deterministic-tick foundation), the dev console (`/effect`), the white-paper "ultra-deep mechanics" vision.

## Goal

Unify the game's scattered, ad-hoc status mechanics into **one deterministic, data-driven status-effect system** that works on **any entity (player + enemies)**, and surface it through the console: `/effect <target> <effect> [seconds]` to apply and `/effect <target> clear` to wipe all effects. An effect can mean **different things per entity type** — e.g. *radiation* damages the player but **heals an Engendros**.

## Current state (what we're unifying)

Today these live as bespoke fields + timers, hand-ticked in two update loops:

| Mechanic | Where | Notes |
|---|---|---|
| **Burn** (fire) | `player.burnT`/`_burnTickT` (player.js) · `enemy.burnT` (enemies.js, `ENEMY_BURN_SLOW`) | already on **both** entity kinds, but two separate code paths |
| **Broken leg** | `player.legBroken` + `_splintT` + `splints` (player.js) | cured by a splint item |
| **Hunger / starve** | `player.hunger` + `_starveT` (player.js) | a **meter**, not a transient status |
| Radiation, Bleeding | — | **do not exist yet**; to be added as first-class effects |

Problems: per-mechanic fields, variable-`dt` ticking (non-deterministic), no shared apply/clear, player-only (except burn), no console control, no HUD list.

## Design

### 1. Effect model (per entity)
Every effect-able entity (the player and each `Enemy`) gets `entity.effects` — a `Map<effectKey, Instance>` where `Instance = { ticksLeft, magnitude, stacks, _accum }`. No effect = empty map (cheap).

### 2. Effect registry (`src/effects-status.js`, pure-ish)
A data registry, one entry per effect:
```
EFFECTS = {
  burn:       { ticks, stackable, onTick(entity, inst, ctx), onApply, onClear, hud: {icon, color} },
  bleed:      { … },
  radiation:  { … },   // per-kind behaviour (see §4)
  broken_leg: { ticks: Infinity-ish, onApply: sets mobility, onClear: restores },
  …
}
```
`onTick` is the only place an effect mutates the world. Definitions carry **duration, stacking rule, HUD icon/colour**, and the per-tick behaviour.

### 3. Deterministic ticking
Effects tick on a **fixed accumulator** (e.g. `EFFECT_TPS` ticks/sec), NOT raw frame `dt` — so 30 s of radiation always deals the same total regardless of FPS/stutter. This shares the foundation of [[deterministic-daynight-rework]] (one fixed-tick clock the sim reads). A single `tickEffects(entity, dt)` advances the accumulator and fires `onTick` per whole tick. Hooked once for the player (replaces the bespoke survival timers it owns) and once per alive enemy (replaces `enemy.burnT`).

### 4. Per-entity-type behaviour (the key idea)
An effect resolves its action from the target's kind. Cleanest: each effect exposes handlers keyed by kind, e.g.
```
radiation: { player: (p, i) => p.hurt(RAD_DPS_TICK, 1),
             enemy:  (e, i) => game.enemies.heal(e, RAD_HEAL_TICK) }  // radiation HEALS Engendros
```
`onTick` dispatches `isEnemy(t) ? def.enemy : def.player`. Effects with no handler for a kind simply do nothing on it. (Needs a small `EnemyManager.heal(e, n)` helper — clamps to maxHp.)

### 5. Console (`/effect`) — extend, don't replace
- `/effect <target?> heal|hurt <amount>` — keep the current **instant** ops (already shipped).
- `/effect <target?> <effectKey> [seconds]` — **apply** a timed status (default duration per effect).
- `/effect <target?> clear` — **remove all** effects from the target(s).
- `target` uses the existing selector system (`@s/@p/@a/@e/@e[type=]/tag/nick`). Autocomplete: the `kind`/effect arg is an enum/word with the effect keys + `heal|hurt|clear` (works with the Tab-walk we just built).

### 6. HUD
Player: a small **active-effects strip** (icon + shrinking timer) from `entity.effects` (mirrors how `setSurvival` shows leg/hunger today). Enemies: reuse particle/tint FX (burn already tints); radiation = a faint glow, bleed = drips — optional polish.

## Decisions to confirm (please react)
1. **Which mechanics migrate now:** burn + broken_leg + **new** radiation + bleed → effects. **Hunger stays a meter** (it's a resource, not a transient status) — agree?
2. **Tick rate:** propose a fixed `EFFECT_TPS` (e.g. 5–20/s); should it be the *same* clock the day/night rework will use? (Recommend: yes — one deterministic tick source.)
3. **Stacking:** refresh-duration vs add-stacks vs independent instances. Recommend **refresh duration, magnitude can stack to a cap** (simple + predictable).
4. **Radiation-heals-enemies:** confirm the headline example (radiation: −HP player, +HP Engendros). Any other inversions (e.g. bleed does nothing to undead plush)?
5. **Co-op:** effects on remote players = host-authoritative (Phase 2, like the selector apply), or player-effects local-only for now?

## Phasing
- **P1:** the registry + deterministic tick + `entity.effects`; migrate **burn** (both kinds) as the proof; wire `/effect <effect>` + `/effect clear`; player HUD strip.
- **P2:** add **radiation** (with the enemy-heal inversion) + **bleed**; migrate **broken_leg**.
- **P3:** enemy effect FX polish; co-op host-auth apply.

## Out of scope
The deterministic day/night rework itself ([[deterministic-daynight-rework]]) — the effect tick can land first and the day/night clock adopt the same source later. No new survival *meters* (hunger stays as-is).
