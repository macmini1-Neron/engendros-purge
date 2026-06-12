# Status-Effects System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One deterministic, data-driven status-effect system that works on the player *and* enemies, where an effect can mean different things per entity kind (radiation hurts the player but heals an Engendros; bleed drains the player but makes an Engendros leak «пух»), surfaced through the dev console `/effect`.

**Architecture:** A new **pure** module `src/effects-status.js` holds a data registry (`EFFECTS`) plus `applyEffect` / `stepEffects` / `clearEffects` / `movementSlow` / `contactWeaken`. It imports nothing browser-only (no THREE/DOM/`tuning.js`, which pulls in `three`), so it is node-testable like `src/console-core.js` and `src/simclock.js`. Game code drives it: `game.js` owns one fixed-step `makeClock` (from `src/simclock.js`, 10 ticks/s — the same primitive `fire.js` uses), advanced once per frame on `hostSim`, stepping the player and every alive enemy through an injected `ctx` of side-effect ops.

**Scope:** This plan delivers **P1 + P2** of the spec (`docs/superpowers/specs/2026-06-12-status-effects-system-design.md`) — the full **solo** system, proven with **radiation** (P1), then **bleed** + **broken_leg** (P2). **Burn migration and full co-op sync are P3** (a separate plan): burn is woven through the co-op netcode (`mp.js` `pstate.burnT`/`_tickBurn`/`burn`+`ignite` msgs/`bf` snapshot flag) and migrating it cleanly means touching co-op. Burn stays on its working legacy path until then; the system is built so burn drops in later with no rework.

**Tech Stack:** Vanilla ES modules + Three.js r160 (no build/bundler). Tests: Node's built-in `node:test` run via `node --test tests/<path>.test.mjs` (the convention the console Phase-0 plan established). In-browser verification against `window.GAME` + the dev console.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/effects-status.js` | **Create** | PURE registry + `applyEffect`/`stepEffects`/`clearEffects`/`movementSlow`/`contactWeaken` + all effect tuning constants. No THREE/DOM/game imports. |
| `tests/effects/status.test.mjs` | **Create** | `node:test` suite for the pure core (built up across Tasks 1–4). |
| `src/enemies.js` | Modify | Add `EnemyManager.heal(e, n)`; give each enemy an `effects` Map on spawn; (P2) read `movementSlow`/`contactWeaken`. |
| `src/game.js` | Modify | Own the effects `makeClock`; build the `ctx`; step player + enemies once per fixed tick on `hostSim`. |
| `src/player.js` | Modify | Give the player an `effects` Map; (P2) route `breakLeg`/`applySplint` through the effect system; per-frame HUD refresh. |
| `src/console.js` | Modify | Extend the `/effect` command: effect keys + `clear`, third arg = seconds. |
| `src/ui.js` | Modify | Render the active-effects strip (icon + countdown) from `player.effects`. |

**Pure-core invariant (do not violate):** `src/effects-status.js` must stay importable from a bare Node process. Never `import` THREE, DOM, `tuning.js`, or any `game`/`player`/`enemies` module into it. All side-effects flow through the injected `ctx`.

---

## Task 1: Pure module — registry + `applyEffect` (TDD)

**Files:**
- Create: `src/effects-status.js`
- Test: `tests/effects/status.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/effects/status.test.mjs`:

```js
// status.test.mjs — node --test suite for the PURE status-effect core (src/effects-status.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEffect, EFFECTS, EFFECT_TPS } from '../../src/effects-status.js';

const ent = () => ({ effects: new Map() });   // minimal mock entity
const noCtx = {};

test('applyEffect: seconds → whole ticks, stacks start at 1', () => {
  const e = ent();
  applyEffect(e, 'radiation', 10, noCtx);
  assert.equal(e.effects.get('radiation').ticksLeft, 10 * EFFECT_TPS);
  assert.equal(e.effects.get('radiation').stacks, 1);
});

test('applyEffect: omitted seconds defaults to the effect\'s secs', () => {
  const e = ent();
  applyEffect(e, 'bleed', null, noCtx);
  assert.equal(e.effects.get('bleed').ticksLeft, EFFECTS.bleed.secs * EFFECT_TPS);
});

test('applyEffect: re-apply refreshes duration to the max', () => {
  const e = ent();
  applyEffect(e, 'radiation', 10, noCtx);
  e.effects.get('radiation').ticksLeft = 5;            // simulate decay
  applyEffect(e, 'radiation', 3, noCtx);               // 3s = 30 ticks > 5 → refresh up
  assert.equal(e.effects.get('radiation').ticksLeft, 3 * EFFECT_TPS);
  applyEffect(e, 'radiation', 0.1, noCtx);             // 1 tick < current → keep current
  assert.equal(e.effects.get('radiation').ticksLeft, 3 * EFFECT_TPS);
});

test('applyEffect: magnitude effects grow stacks to cap', () => {
  const e = ent();
  for (let i = 0; i < 9; i++) applyEffect(e, 'radiation', 10, noCtx);
  assert.equal(e.effects.get('radiation').stacks, EFFECTS.radiation.cap); // 5
});

test('applyEffect: refresh-stack effects never exceed 1 stack', () => {
  const e = ent();
  applyEffect(e, 'broken_leg', Infinity, noCtx);
  applyEffect(e, 'broken_leg', Infinity, noCtx);
  assert.equal(e.effects.get('broken_leg').stacks, 1);
});

test('applyEffect: unknown key → false, no mutation', () => {
  const e = ent();
  assert.equal(applyEffect(e, 'nope', 5, noCtx), false);
  assert.equal(e.effects.size, 0);
});

test('applyEffect: onApply fires once (not on refresh); Infinity stays Infinity', () => {
  let applied = 0;
  const ctx = { setLimp: () => applied++ };
  const e = ent();
  applyEffect(e, 'broken_leg', Infinity, ctx);
  applyEffect(e, 'broken_leg', Infinity, ctx);   // refresh, not a 2nd onApply
  assert.equal(applied, 1);
  assert.equal(e.effects.get('broken_leg').ticksLeft, Infinity);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/effects/status.test.mjs`
Expected: FAIL — `Cannot find module '../../src/effects-status.js'`.

- [ ] **Step 3: Write the module**

Create `src/effects-status.js`:

```js
// effects-status.js — unified, deterministic, data-driven status effects.
//
// PURE: no THREE, no DOM, no game/tuning imports (tuning.js pulls in `three`).
// Importable directly from node tests, like console-core.js and simclock.js.
// All effect tuning lives here. Game code injects side-effects via a `ctx` object.
//
// Headline: an effect means different things per entity KIND. radiation HURTS the
// player but HEALS an Engendros; bleed drains the player but makes an Engendros
// leak «пух» (slow + weaken). The per-kind handlers below encode that.

export const EFFECT_TPS = 10;        // fixed effect ticks per second (matches fire.js)
const PER = 1 / EFFECT_TPS;          // seconds per tick

// player damage-over-time (HP per second)
const BURN_DPS = 9, BLEED_DPS = 6, RAD_DPS = 7;
// enemy heal (HP per second)
const RAD_HEAL = 12;
// enemy movement / contact multipliers (<1 = slower / weaker)
const BURN_SLOW = 0.45, PUKH_SLOW = 0.6, PUKH_WEAKEN = 0.6;

// One entry per effect:
//   secs        default duration when applied without an explicit time
//   stack       'refresh' = duration only (stacks pinned at 1) | 'magnitude' = grow stacks
//   cap         max stacks (magnitude effects)
//   hud         { icon, color } for the HUD strip
//   enemySlow   passive movement multiplier read by movementSlow() (optional)
//   enemyWeaken passive contact-damage multiplier read by contactWeaken() (optional)
//   player/enemy  per-kind per-tick handler (entity, inst, ctx); omit to no-op on that kind
//   onApply/onClear  lifecycle hooks for non-tick state (entity, ctx)
export const EFFECTS = {
  burn: {                            // defined + tested now; wired in-game in P3 (co-op-entangled)
    secs: 3, stack: 'refresh', cap: 1, hud: { icon: '🔥', color: 0xff6a2a },
    enemySlow: BURN_SLOW,
    player: (p, inst, ctx) => ctx.hurtPlayer(p, BURN_DPS * PER),
    enemy:  (e, inst, ctx) => ctx.fireFx(e),
  },
  bleed: {
    secs: 8, stack: 'magnitude', cap: 3, hud: { icon: '🩸', color: 0xcc2030 },
    enemySlow: PUKH_SLOW, enemyWeaken: PUKH_WEAKEN,
    player: (p, inst, ctx) => ctx.hurtPlayer(p, BLEED_DPS * PER * inst.stacks),
    enemy:  (e, inst, ctx) => ctx.drip(e),     // «пух» leak FX; slow+weaken are passive
  },
  radiation: {
    secs: 10, stack: 'magnitude', cap: 5, hud: { icon: '☢', color: 0x9bd64a },
    player: (p, inst, ctx) => ctx.hurtPlayer(p, RAD_DPS * PER * inst.stacks),
    enemy:  (e, inst, ctx) => ctx.healEnemy(e, RAD_HEAL * PER * inst.stacks),  // INVERSION
  },
  broken_leg: {
    secs: Infinity, stack: 'refresh', cap: 1, hud: { icon: '🦵', color: 0xd23a2a },
    onApply: (entity, ctx) => ctx.setLimp(entity, true),
    onClear: (entity, ctx) => ctx.setLimp(entity, false),
  },
};

// seconds → whole ticks (Infinity stays Infinity; any finite effect is at least 1 tick)
function secondsToTicks(seconds) {
  return seconds === Infinity ? Infinity : Math.max(1, Math.round(seconds * EFFECT_TPS));
}

/**
 * applyEffect(entity, key, seconds, ctx) → boolean
 * Add or refresh an effect. Duration ALWAYS refreshes to max(remaining, new).
 * 'magnitude' effects also grow stacks toward cap. onApply fires only on first apply.
 * `seconds == null` → the effect's default `secs`. Unknown key → false (no-op).
 */
export function applyEffect(entity, key, seconds, ctx) {
  const def = EFFECTS[key];
  if (!def) return false;
  if (!entity.effects) entity.effects = new Map();
  const ticks = secondsToTicks(seconds == null ? def.secs : seconds);
  const cur = entity.effects.get(key);
  if (cur) {
    cur.ticksLeft = Math.max(cur.ticksLeft, ticks);
    if (def.stack === 'magnitude') cur.stacks = Math.min(def.cap, cur.stacks + 1);
  } else {
    entity.effects.set(key, { ticksLeft: ticks, stacks: 1 });
    if (def.onApply) def.onApply(entity, ctx);
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/effects/status.test.mjs`
Expected: PASS — 7 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/effects-status.js tests/effects/status.test.mjs
git commit -m "feat(effects): pure status-effect registry + applyEffect (TDD)"
```

---

## Task 2: `stepEffects` — per-kind dispatch + expiry (TDD)

**Files:**
- Modify: `src/effects-status.js`
- Test: `tests/effects/status.test.mjs`

- [ ] **Step 1: Write the failing test** — append to `tests/effects/status.test.mjs`:

```js
import { stepEffects } from '../../src/effects-status.js';

// spy ctx: records every op call so we can assert dispatch without a real game
function spyCtx(isEnemy) {
  const calls = [];
  return {
    isEnemy: () => isEnemy,
    hurtPlayer: (p, d) => calls.push(['hurtPlayer', d]),
    healEnemy: (e, n) => calls.push(['healEnemy', n]),
    fireFx: () => calls.push(['fireFx']),
    drip: () => calls.push(['drip']),
    setLimp: (e, on) => calls.push(['setLimp', on]),
    calls,
  };
}

test('stepEffects: radiation HURTS a player-kind entity', () => {
  const e = ent(); applyEffect(e, 'radiation', 10, {});
  const ctx = spyCtx(false);
  stepEffects(e, ctx);
  assert.equal(ctx.calls[0][0], 'hurtPlayer');
});

test('stepEffects: radiation HEALS an enemy-kind entity (the inversion)', () => {
  const e = ent(); applyEffect(e, 'radiation', 10, {});
  const ctx = spyCtx(true);
  stepEffects(e, ctx);
  assert.equal(ctx.calls[0][0], 'healEnemy');
});

test('stepEffects: bleed on an enemy drips, never hurts', () => {
  const e = ent(); applyEffect(e, 'bleed', 8, {});
  const ctx = spyCtx(true);
  stepEffects(e, ctx);
  assert.deepEqual(ctx.calls.map(c => c[0]), ['drip']);
});

test('stepEffects: decrements ticksLeft and expires, firing onClear', () => {
  const ctx = spyCtx(false);
  const e = ent(); applyEffect(e, 'radiation', 0.2, ctx);  // 2 ticks
  stepEffects(e, ctx); assert.equal(e.effects.get('radiation').ticksLeft, 1);
  stepEffects(e, ctx); assert.equal(e.effects.has('radiation'), false);
});

test('stepEffects: broken_leg (Infinity, no tick handler) never auto-expires', () => {
  const ctx = spyCtx(false);
  const e = ent(); applyEffect(e, 'broken_leg', Infinity, ctx);
  stepEffects(e, ctx); stepEffects(e, ctx);
  assert.equal(e.effects.has('broken_leg'), true);
});

test('stepEffects: empty map is a no-op', () => {
  assert.doesNotThrow(() => stepEffects(ent(), spyCtx(false)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/effects/status.test.mjs`
Expected: FAIL — `stepEffects` is not exported.

- [ ] **Step 3: Implement** — append to `src/effects-status.js`:

```js
/**
 * stepEffects(entity, ctx) — advance the entity's effects by ONE fixed tick.
 * Fires each effect's per-kind handler (kind via ctx.isEnemy), decrements ticksLeft,
 * removes + onClear()s any effect that hits 0. Infinity-duration effects never expire here.
 */
export function stepEffects(entity, ctx) {
  const fx = entity.effects;
  if (!fx || fx.size === 0) return;
  const kind = ctx.isEnemy(entity) ? 'enemy' : 'player';
  for (const [key, inst] of fx) {
    const def = EFFECTS[key];
    const handler = def[kind];
    if (handler) handler(entity, inst, ctx);
    inst.ticksLeft -= 1;
    if (inst.ticksLeft <= 0) {
      if (def.onClear) def.onClear(entity, ctx);
      fx.delete(key);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/effects/status.test.mjs`
Expected: PASS — 13 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/effects-status.js tests/effects/status.test.mjs
git commit -m "feat(effects): stepEffects per-kind dispatch + expiry (TDD)"
```

---

## Task 3: `movementSlow` + `contactWeaken` — stateless modifier scans (TDD)

**Files:**
- Modify: `src/effects-status.js`
- Test: `tests/effects/status.test.mjs`

- [ ] **Step 1: Write the failing test** — append:

```js
import { movementSlow, contactWeaken } from '../../src/effects-status.js';

test('modifiers: 1.0 when no effects', () => {
  const e = ent();
  assert.equal(movementSlow(e), 1);
  assert.equal(contactWeaken(e), 1);
});

test('modifiers: bleed slows AND weakens', () => {
  const e = ent(); applyEffect(e, 'bleed', 8, {});
  assert.ok(movementSlow(e) < 1);
  assert.ok(contactWeaken(e) < 1);
});

test('modifiers: burn + bleed slows compose (multiply)', () => {
  const e = ent(); applyEffect(e, 'burn', 3, {}); applyEffect(e, 'bleed', 8, {});
  const expected = EFFECTS.burn.enemySlow * EFFECTS.bleed.enemySlow;
  assert.ok(Math.abs(movementSlow(e) - expected) < 1e-9);
});

test('modifiers: radiation neither slows nor weakens', () => {
  const e = ent(); applyEffect(e, 'radiation', 10, {});
  assert.equal(movementSlow(e), 1);
  assert.equal(contactWeaken(e), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/effects/status.test.mjs`
Expected: FAIL — `movementSlow` is not exported.

- [ ] **Step 3: Implement** — append to `src/effects-status.js`:

```js
/** Product of every active effect's enemySlow factor (1 = no slow). Stateless — always correct. */
export function movementSlow(entity) {
  const fx = entity.effects;
  if (!fx || fx.size === 0) return 1;
  let m = 1;
  for (const key of fx.keys()) { const s = EFFECTS[key].enemySlow; if (s) m *= s; }
  return m;
}

/** Product of every active effect's enemyWeaken factor (1 = full contact damage). Stateless. */
export function contactWeaken(entity) {
  const fx = entity.effects;
  if (!fx || fx.size === 0) return 1;
  let m = 1;
  for (const key of fx.keys()) { const w = EFFECTS[key].enemyWeaken; if (w) m *= w; }
  return m;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/effects/status.test.mjs`
Expected: PASS — 17 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/effects-status.js tests/effects/status.test.mjs
git commit -m "feat(effects): stateless movementSlow + contactWeaken scans (TDD)"
```

---

## Task 4: `clearEffects` (TDD)

**Files:**
- Modify: `src/effects-status.js`
- Test: `tests/effects/status.test.mjs`

- [ ] **Step 1: Write the failing test** — append:

```js
import { clearEffects } from '../../src/effects-status.js';

test('clearEffects: empties the map and fires each onClear', () => {
  let limp = null;
  const ctx = { setLimp: (e, on) => { limp = on; } };
  const e = ent();
  applyEffect(e, 'broken_leg', Infinity, ctx);
  applyEffect(e, 'radiation', 10, ctx);
  const n = clearEffects(e, ctx);
  assert.equal(n, 2);
  assert.equal(e.effects.size, 0);
  assert.equal(limp, false);              // broken_leg onClear ran (mobility restored)
});

test('clearEffects: 0 on an empty entity', () => {
  assert.equal(clearEffects(ent(), {}), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/effects/status.test.mjs`
Expected: FAIL — `clearEffects` is not exported.

- [ ] **Step 3: Implement** — append to `src/effects-status.js`:

```js
/** Remove ALL effects from the entity, firing each onClear. Returns the count removed. */
export function clearEffects(entity, ctx) {
  const fx = entity.effects;
  if (!fx || fx.size === 0) return 0;
  let n = 0;
  for (const key of fx.keys()) { const def = EFFECTS[key]; if (def && def.onClear) def.onClear(entity, ctx); n++; }
  fx.clear();
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/effects/status.test.mjs`
Expected: PASS — 19 tests total. The pure core is now complete and fully covered.

- [ ] **Step 5: Commit**

```bash
git add src/effects-status.js tests/effects/status.test.mjs
git commit -m "feat(effects): clearEffects (TDD); pure core complete"
```

---

## Task 5: `EnemyManager.heal(e, n)`

**Files:**
- Modify: `src/enemies.js` (insert immediately before `damage(e, amount, ...)` at line ~775)

No node test (touches THREE meshes / HUD); verified in-browser in Task 11. `damage()` is the mirror to copy the MP/elite conventions from.

- [ ] **Step 1: Add the method**

In `src/enemies.js`, immediately **before** the existing `damage(e, amount, source = 'gun', ...) {` method, insert:

```js
  // Heal an enemy (used by the radiation effect — radiation HEALS Engendros). Clamps to maxHp.
  heal(e, amount) {
    if (!e.alive || amount <= 0) return;
    e.hp = Math.min(e.maxHp, e.hp + amount);
    if (e.isElite) this.game.hud.setBoss(e.hp / e.maxHp, e.name);   // refresh the boss/elite bar
  }
```

- [ ] **Step 2: Sanity-check it parses**

Run: `node --check src/enemies.js`
Expected: no output (exit 0). (`node --check` parses without importing `three`, so it is safe here.)

- [ ] **Step 3: Commit**

```bash
git add src/enemies.js
git commit -m "feat(enemies): EnemyManager.heal(e, n) for the radiation effect"
```

---

## Task 6: Wire the effects clock + ctx into the game (radiation live)

**Files:**
- Modify: `src/game.js` (imports; Game constructor; `_updatePlaying`; new `_stepEffectsOnce` method)
- Modify: `src/player.js` (constructor: `effects` Map; `reset()`: clear it)
- Modify: `src/enemies.js` (enemy spawn: give each enemy an `effects` Map)

- [ ] **Step 1: Import the clock + step into `game.js`**

At the top of `src/game.js`, with the other `import` lines, add:

```js
import { makeClock } from './simclock.js';
import { EFFECT_TPS, stepEffects } from './effects-status.js';
```

- [ ] **Step 2: Build the clock + ctx in the Game constructor**

At the **end of the `Game` constructor** (after `this.effects`, `this.enemies`, `this.player`, `this.hud` are constructed — arrow closures defer access, so end-of-constructor is safe), add:

```js
    // --- status effects (src/effects-status.js) ---
    this._fxClock = makeClock({ step: 1 / EFFECT_TPS, maxDt: 0.05 });   // 10 ticks/s, same primitive as fire.js
    this._stepFx = () => this._stepEffectsOnce();                       // stable callback for clock.advance
    this._fxCtx = {                                                     // injected side-effect ops (keeps effects-status.js pure)
      isEnemy: (t) => t !== this.player,                               // only the player + enemies are effect-able
      hurtPlayer: (p, dmg) => p._takeSurvivalDamage(dmg, 1),           // bypass armor; MP-safe (routes claimPlayerHit)
      healEnemy: (e, n) => this.enemies.heal(e, n),
      fireFx: (e) => this.effects.firePool(e.pos, 0.45, 0.4),
      drip: (e) => this.effects.stuffing(e.pos, e.col ? e.col.body : 0xeeeeee, 3, 2),  // «пух» puff
      setLimp: (entity, on) => { if (entity === this.player) { this.player.legBroken = on; this.hud.setSurvival(this.player); } },
    };
```

- [ ] **Step 3: Add the per-tick step method**

Add a new method on the `Game` class (place it just before or after `_updatePlaying`):

```js
  // One fixed effect tick: advance the player + every alive enemy by one step.
  _stepEffectsOnce() {
    const ctx = this._fxCtx, p = this.player;
    if (p.alive && !(this.mp.active && this.mp.frozen)) stepEffects(p, ctx);
    const list = this.enemies.active;
    for (let i = 0; i < list.length; i++) { const e = list[i]; if (e.alive) stepEffects(e, ctx); }
  }
```

- [ ] **Step 4: Advance the clock once per frame in `_updatePlaying`**

In `src/game.js` `_updatePlaying(dt)`, immediately **after** the line `this.loot.update(dt);` (currently line ~846), add:

```js
    if (sim) this._fxClock.advance(dt, this._stepFx); // status effects tick on a fixed 10 Hz clock (host/solo only)
```

(`sim` = `hostSim && !this.freecam` is already in scope from line 810.)

- [ ] **Step 5: Give the player an `effects` Map**

In `src/player.js` **constructor**, next to `this.burnT = 0; this._burnTickT = 0;` (line ~31), add:

```js
    this.effects = new Map();   // status effects (src/effects-status.js): key → { ticksLeft, stacks }
```

And in `src/player.js` `reset()` (line ~42, where it calls `this.resetStats()`), add **before** `this.resetStats();`:

```js
    if (this.effects) this.effects.clear();
```

- [ ] **Step 6: Give each enemy an `effects` Map on spawn**

In `src/enemies.js`, find the spawn line that resets per-spawn state (line ~205, ending `... this.squash = 0; this.burnT = 0;`) and append to it:

```js
 if (this.effects) this.effects.clear(); else this.effects = new Map();
```

So the full line reads: `this.alive = true; this.attackCD = rr(0.3, 0.9); this.growlCD = rr(2, 6); this.squash = 0; this.burnT = 0; if (this.effects) this.effects.clear(); else this.effects = new Map();`

- [ ] **Step 7: Verify it parses**

Run: `node --check src/game.js && node --check src/player.js && node --check src/enemies.js`
Expected: exit 0, no output.

- [ ] **Step 8: Commit**

```bash
git add src/game.js src/player.js src/enemies.js
git commit -m "feat(effects): fixed-tick effects clock + ctx; player/enemy effects maps"
```

---

## Task 7: Extend the `/effect` console command

**Files:**
- Modify: `src/console.js` (imports; the `effect` command registration ~line 106)

- [ ] **Step 1: Import the effect API**

At the top of `src/console.js`, with the other imports, add:

```js
import { EFFECTS, applyEffect, clearEffects } from './effects-status.js';
```

- [ ] **Step 2: Replace the `effect` command registration**

In `src/console.js`, replace the entire existing `this.reg.register('effect', { ... });` block with:

```js
    // P1-P2 wired effects only (burn stays on its legacy/co-op path until P3) + heal/hurt/clear.
    const FX_KEYS = ['radiation', 'bleed', 'broken_leg'];
    this.reg.register('effect', {
      args: [
        { name: 'target', type: 'target' },
        { name: 'kind', type: 'enum', choices: ['heal', 'hurt', 'clear', ...FX_KEYS] },
        { name: 'amount', type: 'int', optional: true },   // heal/hurt = HP; an effect = seconds
      ],
      run: (a) => {
        let n = 0;
        for (const t of (a.target || [])) {
          if (a.kind === 'heal') {
            const amt = a.amount ?? 20;
            if (t === g.player) { t.hp = Math.min(t.maxHp, t.hp + amt); g.hud.setHealth(t.hp, t.maxHp); n++; }
            else if (isEnemy(t)) { g.enemies.heal(t, amt); n++; }
          } else if (a.kind === 'hurt') {
            const amt = a.amount ?? 20;
            if (t === g.player) { t.hurt(amt); n++; }
            else if (isEnemy(t)) { g.enemies.damage(t, amt, 'console'); n++; }
          } else if (a.kind === 'clear') {
            clearEffects(t, g._fxCtx); n++;
          } else {                                          // an effect key from FX_KEYS
            applyEffect(t, a.kind, a.amount ?? EFFECTS[a.kind].secs, g._fxCtx); n++;
          }
        }
        if (a.kind === 'clear') return `cleared effects → ${n} target(s)`;
        if (a.kind === 'heal' || a.kind === 'hurt') return `${a.kind} ${a.amount ?? 20} → ${n} target(s)`;
        return `${a.kind} ${a.amount ?? EFFECTS[a.kind].secs}s → ${n} target(s)`;
      },
    });
```

(This also fixes today's player-only `heal` — it now heals enemies too, via `g.enemies.heal`.)

- [ ] **Step 3: Verify it parses**

Run: `node --check src/console.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/console.js
git commit -m "feat(console): /effect applies timed effects + clear; enemy heal"
```

---

## Task 8: Player HUD active-effects strip

**Files:**
- Modify: `src/ui.js` (imports; `setSurvival`)
- Modify: `src/player.js` (`survivalTick`: refresh the strip each frame)

- [ ] **Step 1: Import the registry into `ui.js`**

At the top of `src/ui.js`, with the other imports, add:

```js
import { EFFECTS, EFFECT_TPS } from './effects-status.js';
```

- [ ] **Step 2: Render effect chips in `setSurvival`**

In `src/ui.js`, replace the existing one-line `setSurvival(p) { ... }` with:

```js
  setSurvival(p) {
    if (!this.el.survival) return;
    let s = '';
    if (p.legBroken) s += `<span class="leg">${icon('leg')} LEG BROKEN — X to splint</span> `;
    if (p.splints > 0) s += `<span class="spl">${icon('splint')} ×${p.splints}</span> `;
    if (p.effects && p.effects.size) {
      for (const [key, inst] of p.effects) {
        if (key === 'broken_leg') continue;            // already shown by the leg line above
        const def = EFFECTS[key];
        const secs = inst.ticksLeft === Infinity ? '' : ' ' + Math.ceil(inst.ticksLeft / EFFECT_TPS) + 's';
        const col = '#' + def.hud.color.toString(16).padStart(6, '0');
        s += `<span class="fxchip" style="color:${col}">${def.hud.icon}${secs}</span> `;
      }
    }
    this.el.survival.innerHTML = s;
  }
```

- [ ] **Step 3: Refresh the strip every frame**

In `src/player.js` `survivalTick(dt)`, add as the **last line of the method** (after `this.game.hud.setBurn(this.burnT);`):

```js
    this.game.hud.setSurvival(this);   // active-effects strip (icons + countdown) refreshed each frame
```

- [ ] **Step 4: Verify it parses**

Run: `node --check src/ui.js && node --check src/player.js`
Expected: exit 0.

- [ ] **Step 5: In-browser smoke (radiation end-to-end)**

Serve the worktree on a fresh port and open the demo map:

```bash
python3 -m http.server 8124 --directory "."   # from the playable-demo worktree root
```

Open `http://localhost:8124/index.html?map=demo&cb=1`, click to start, press `` ` `` to open the console, then:
- `/effect @s radiation 6` → your HP ticks down for ~6 s and a **☢ 6s** chip counts down in the survival strip.
- `/effect @s clear` → the chip disappears immediately.

Expected: both behaviours observed, 0 console errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui.js src/player.js
git commit -m "feat(hud): active-effects strip (icon + countdown) from player.effects"
```

> **P1 checkpoint:** radiation is live end-to-end — applied via console, ticked deterministically, shown in the HUD, and it HURTS the player while HEALING enemies (verified next in Task 11). Pure core fully node-tested.

---

## Task 9: Bleed — enemy «пух» leak wiring (P2)

**Files:**
- Modify: `src/enemies.js` (imports; movement slow at line ~333; contact damage at line ~379)

The bleed handlers (`player` HP DoT, `enemy` drip) are already defined + tested (Tasks 1–2) and live once stepped (Task 6). This task wires the **passive** enemy slow + weaken into gameplay.

- [ ] **Step 1: Import the modifier scans**

At the top of `src/enemies.js`, with the other imports, add:

```js
import { movementSlow, contactWeaken } from './effects-status.js';
```

- [ ] **Step 2: Compose the effect-slow into enemy movement**

In `src/enemies.js` `update(dt)`, find the speed line (~333):

```js
      const spd = (_bossRooted ? 0 : e.speed) * (e.squash > 0 ? 0.3 : (e.burnT > 0 ? ENEMY_BURN_SLOW : 1)) * (_wz ? STRUCT_DEFS.wire.slow : 1);
```

Replace it with (legacy molotov-burn slow stays; effect slow composes on top):

```js
      const spd = (_bossRooted ? 0 : e.speed) * (e.squash > 0 ? 0.3 : (e.burnT > 0 ? ENEMY_BURN_SLOW : 1) * movementSlow(e)) * (_wz ? STRUCT_DEFS.wire.slow : 1);
```

- [ ] **Step 3: Apply contact-weaken to enemy melee**

In `src/enemies.js` `update(dt)`, find the contact-damage line (~379):

```js
        e.attackCD = 1.0; e.squash = 0.18; this.game._hurtTarget(e._tgtId || 'host', e.def.dmg);
```

Replace `e.def.dmg` with the weakened value:

```js
        e.attackCD = 1.0; e.squash = 0.18; this.game._hurtTarget(e._tgtId || 'host', e.def.dmg * contactWeaken(e));
```

- [ ] **Step 4: Verify it parses**

Run: `node --check src/enemies.js`
Expected: exit 0.

- [ ] **Step 5: In-browser smoke (bleed inversion)**

With the server from Task 8 running, in the console:
- `/summon engendro ~ ~ ~5` (spawn one ahead), then `/effect @e bleed 8`.
- Expected: the Engendro visibly **slows**, emits small «пух» puffs, and its melee hits land softer. `GAME.enemies.active[0].effects.get('bleed')` exists. Your HP is unaffected (enemy bleed ≠ player bleed).
- `/effect @s bleed 8` → **your** HP drains + a 🩸 chip shows. (Player bleed works from P1 wiring; this confirms the inversion.)

- [ ] **Step 6: Commit**

```bash
git add src/enemies.js
git commit -m "feat(effects): bleed «пух» leak — enemy movementSlow + contactWeaken"
```

---

## Task 10: Migrate broken_leg into the effect system (P2)

**Files:**
- Modify: `src/player.js` (imports; `breakLeg`; `survivalTick` splint-completion)

broken_leg is player-only with no co-op broadcast, so it migrates safely. Movement keeps reading `this.legBroken` (set/cleared by the effect's onApply/onClear via `ctx.setLimp`). Benefit: the leg shows in the HUD strip and is clearable via `/effect @s clear` / `/effect @s broken_leg`.

- [ ] **Step 1: Import the effect API into `player.js`**

At the top of `src/player.js`, with the other imports, add:

```js
import { applyEffect, EFFECTS } from './effects-status.js';
```

- [ ] **Step 2: Route `breakLeg` through the effect**

In `src/player.js`, replace the existing `breakLeg()` method:

```js
  breakLeg() {
    if (this.legBroken) return;
    this.legBroken = true;
    this.game.audio.playerHurt(); this.game.hud.damageFlash();
    this.game.hud.toast('🦵 LEG BROKEN — find a splint (use it from your inventory)!', 0xd23a2a);
    this.game.hud.setSurvival(this);
  }
```

with:

```js
  breakLeg() {
    if (this.legBroken) return;
    applyEffect(this, 'broken_leg', Infinity, this.game._fxCtx); // onApply → setLimp(true): sets legBroken + HUD
    this.game.audio.playerHurt(); this.game.hud.damageFlash();
    this.game.hud.toast('🦵 LEG BROKEN — find a splint (use it from your inventory)!', 0xd23a2a);
  }
```

- [ ] **Step 3: Clear the effect when the splint finishes**

In `src/player.js` `survivalTick(dt)`, replace the splint-completion block:

```js
    if (this._splintT > 0) {
      this._splintT -= dt;
      if (this._splintT <= 0) { this._splintT = 0; this.legBroken = false; this.game.hud.toast('🦵 Leg splinted — mobility restored', 0x7fd06a); this.game.hud.setSurvival(this); }
    }
```

with (remove the effect → onClear restores mobility + HUD):

```js
    if (this._splintT > 0) {
      this._splintT -= dt;
      if (this._splintT <= 0) {
        this._splintT = 0;
        this.effects.delete('broken_leg'); EFFECTS.broken_leg.onClear(this, this.game._fxCtx); // → setLimp(false)
        this.game.hud.toast('🦵 Leg splinted — mobility restored', 0x7fd06a);
      }
    }
```

- [ ] **Step 4: Verify it parses**

Run: `node --check src/player.js`
Expected: exit 0.

- [ ] **Step 5: In-browser smoke (leg as an effect)**

With the server running, in the console:
- `/effect @s broken_leg` → you limp (no sprint), a 🦵 chip appears in the strip, and `GAME.player.legBroken === true`.
- `/effect @s clear` → mobility restored, chip gone, `GAME.player.legBroken === false`.
- Also confirm a real damaging fall still breaks the leg, and using a splint item still cures it (cycle once).

- [ ] **Step 6: Commit**

```bash
git add src/player.js
git commit -m "feat(effects): migrate broken_leg into the effect system (player-only)"
```

---

## Task 11: Full in-browser acceptance (Definition of Done)

**Files:** none (verification only).

- [ ] **Step 1: Run the full node suite**

Run: `node --test tests/effects/status.test.mjs`
Expected: 19/19 pass. Then `node --test tests/` — the rest of the suite is unaffected (no regressions).

- [ ] **Step 2: Acceptance script in the live game**

Serve the worktree (`python3 -m http.server 8124 --directory "."`) and open `http://localhost:8124/index.html?map=demo&cb=2`. Open the console (`` ` ``) and confirm each:

| Command | Expected |
|---|---|
| `/effect @s radiation 6` | HP ticks down ~6 s; **☢ 6s** chip counts down |
| `/summon engendro ~ ~ ~5` then `/effect @e radiation 6` | enemy HP **rises** (`GAME.enemies.active[0].hp` increases) — the inversion |
| `/effect @e bleed 8` | enemy slows + «пух» puffs + softer melee |
| `/effect @s bleed 8` | **your** HP drains + 🩸 chip |
| `/effect @s broken_leg` | limp + 🦵 chip; `GAME.player.legBroken===true` |
| `/effect @s clear` | all chips gone; leg restored |
| Type `/effect @s ` then Tab | autocomplete lists `radiation bleed broken_leg heal hurt clear` |
| Stutter test: hold the tab hidden ~3 s during a `radiation 10`, refocus | total damage ≈ same as an un-stuttered run (fixed-tick determinism; no catch-up burst) |

Expected: every row passes, **0 console errors**.

- [ ] **Step 3: Final commit (if any verification tweaks were needed)**

```bash
git add -A
git commit -m "test(effects): in-browser acceptance pass for P1+P2"
```

---

## Self-Review (completed)

**Spec coverage:** §1 entity.effects (T6) · §2 registry+ctx purity (T1) · §3 simclock fixed tick (T6) · §4 radiation inversion (T1–2,6) + bleed «пух» leak (T1–3,9) · §5 console /effect+clear (T7) · §6 HUD strip (T8) · catalogue radiation/bleed/broken_leg (T1,9,10) · Decisions 1 (hunger untouched — no task touches it ✓), 2 (simclock 10 Hz — T6), 3 (refresh+magnitude cap — T1), 4 (inversions — T1–2,9), 5 (hostSim gate — T6). Burn (Decision 1 migration / P3) intentionally **not** in this plan — documented in scope + spec Phasing.

**Type/name consistency:** `entity.effects` Map of `{ ticksLeft, stacks }`; functions `applyEffect`/`stepEffects`/`clearEffects`/`movementSlow`/`contactWeaken`; ctx ops `isEnemy`/`hurtPlayer`/`healEnemy`/`fireFx`/`drip`/`setLimp`; `EFFECT_TPS`, `EFFECTS` — all used identically across Tasks 1–10. `g._fxCtx` built in T6 before its first use in T7/T10.

**Placeholders:** none — every code step shows real code; every test step shows runnable assertions.

**Known intentional carry-overs (not gaps):** burn keeps its legacy `burnT` + co-op paths (P3); `movementSlow` composes *alongside* the legacy burn-slow term so there is no double-apply (no burn effect is ever applied in P1–P2). The console enum deliberately excludes `burn` until P3.
