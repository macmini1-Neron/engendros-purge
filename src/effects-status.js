// effects-status.js — unified, deterministic, data-driven status effects.
//
// PURE: no THREE, no DOM, no game/tuning imports (tuning.js pulls in `three`).
// Importable directly from node tests, like console-core.js and simclock.js.
// All status-effect tuning lives here — EXCEPT burn, which also keeps legacy constants in
// tuning.js (PLAYER_BURN_DPS/ENEMY_BURN_SLOW/…) to reconcile when P3 wires burn through this
// system. Game code injects side-effects via a `ctx` object.
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
//   cap         max stacks — only read for 'magnitude' effects ('refresh' always pins at 1)
//   hud         { icon, color } for the HUD strip
//   enemySlow   passive movement multiplier read by movementSlow() (optional)
//   enemyWeaken passive contact-damage multiplier read by contactWeaken() (optional)
//   targets     optional 'player' — effect is player-only; the console refuses it on enemies
//   player/enemy  per-kind per-tick handler (entity, inst, ctx); omit to no-op on that kind
//   onApply/onClear  lifecycle hooks for non-tick state (entity, ctx)
export const EFFECTS = {
  burn: {                            // defined + tested; NOT wired in-game (legacy burnT path retired in P3)
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
    secs: Infinity, stack: 'refresh', cap: 1, targets: 'player', hud: { icon: '🦵', color: 0xd23a2a },
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
  // null / NaN / non-positive seconds → the effect's default (guards console typos like `/effect @s radiation abc`)
  const sec = (seconds == null || (seconds !== Infinity && !(seconds > 0))) ? def.secs : seconds;
  const ticks = secondsToTicks(sec);
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
    if (!def) { fx.delete(key); continue; }   // orphaned key (never written by applyEffect) — evict, don't crash the frame
    const handler = def[kind];
    if (handler) handler(entity, inst, ctx);
    inst.ticksLeft -= 1;
    if (inst.ticksLeft <= 0) {
      if (def.onClear) def.onClear(entity, ctx);
      fx.delete(key);
    }
  }
}

/** Product of every active effect's enemySlow factor (1 = no slow). Stateless — always correct. */
export function movementSlow(entity) {
  const fx = entity.effects;
  if (!fx || fx.size === 0) return 1;
  let m = 1;
  for (const key of fx.keys()) { const s = EFFECTS[key]?.enemySlow; if (s) m *= s; }
  return m;
}

/** Product of every active effect's enemyWeaken factor (1 = full contact damage). Stateless. */
export function contactWeaken(entity) {
  const fx = entity.effects;
  if (!fx || fx.size === 0) return 1;
  let m = 1;
  for (const key of fx.keys()) { const w = EFFECTS[key]?.enemyWeaken; if (w) m *= w; }
  return m;
}

/** Remove ALL effects from the entity, firing each onClear. Returns the count removed. */
export function clearEffects(entity, ctx) {
  const fx = entity.effects;
  if (!fx || fx.size === 0) return 0;
  let n = 0;
  for (const key of fx.keys()) { const def = EFFECTS[key]; if (def && def.onClear) def.onClear(entity, ctx); n++; }
  fx.clear();
  return n;
}

/** Remove a SINGLE named effect, firing its onClear. Returns true if it was present. */
export function removeEffect(entity, key, ctx) {
  const fx = entity.effects;
  if (!fx || !fx.has(key)) return false;
  const def = EFFECTS[key];
  if (def && def.onClear) def.onClear(entity, ctx);
  fx.delete(key);
  return true;
}
