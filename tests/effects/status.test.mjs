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
  const e = ent();                       // burn = a 'refresh' effect with no onApply, safe with noCtx
  applyEffect(e, 'burn', 3, noCtx);
  applyEffect(e, 'burn', 3, noCtx);
  assert.equal(e.effects.get('burn').stacks, 1);
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

test('stepEffects: decrements ticksLeft and expires (radiation has no onClear)', () => {
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

import { removeEffect } from '../../src/effects-status.js';

// --- hardening-pass coverage (PR #42 review) ---

test('stepEffects: finite-duration effect fires onClear on natural expiry', () => {
  // broken_leg with a finite duration (1 tick) expires via stepEffects → exercises the onClear branch
  let limp = null;
  const ctx = { isEnemy: () => false, setLimp: (e, on) => { limp = on; } };
  const e = ent();
  applyEffect(e, 'broken_leg', 0.1, ctx);   // 0.1s → 1 tick
  assert.equal(limp, true);                 // onApply fired
  stepEffects(e, ctx);
  assert.equal(e.effects.has('broken_leg'), false); // removed on expiry
  assert.equal(limp, false);                // onClear fired on natural expiry
});

test('stepEffects: bleed HURTS a player-kind entity, scaled by stacks', () => {
  const c1 = spyCtx(false);
  const e1 = ent(); applyEffect(e1, 'bleed', 8, {});                                 // 1 stack
  stepEffects(e1, c1);
  assert.equal(c1.calls[0][0], 'hurtPlayer');
  const dmg1 = c1.calls[0][1];
  const c2 = spyCtx(false);
  const e2 = ent(); applyEffect(e2, 'bleed', 8, {}); applyEffect(e2, 'bleed', 8, {}); // 2 stacks
  stepEffects(e2, c2);
  assert.ok(Math.abs(c2.calls[0][1] - dmg1 * 2) < 1e-9, '2-stack bleed deals double the per-tick damage');
});

test('stepEffects: burn dispatch — player HP DoT, enemy fire FX only', () => {
  const ep = ent(); applyEffect(ep, 'burn', 3, {});
  const cp = spyCtx(false); stepEffects(ep, cp);
  assert.equal(cp.calls[0][0], 'hurtPlayer');
  assert.ok(cp.calls[0][1] > 0);
  const ee = ent(); applyEffect(ee, 'burn', 3, {});
  const ce = spyCtx(true); stepEffects(ee, ce);
  assert.deepEqual(ce.calls.map(c => c[0]), ['fireFx']);   // enemy burn = FX only, no HP change
});

test('stepEffects: radiation magnitudes scale with stacks (player hurt / enemy heal)', () => {
  const h1 = spyCtx(true); const e1 = ent(); applyEffect(e1, 'radiation', 10, {}); stepEffects(e1, h1);
  const h2 = spyCtx(true); const e2 = ent(); applyEffect(e2, 'radiation', 10, {}); applyEffect(e2, 'radiation', 10, {}); stepEffects(e2, h2);
  assert.equal(h1.calls[0][0], 'healEnemy');
  assert.ok(h1.calls[0][1] > 0, 'a radiation tick heals an enemy');
  assert.ok(Math.abs(h2.calls[0][1] - h1.calls[0][1] * 2) < 1e-9, '2-stack radiation heals double');
  const p = spyCtx(false); const ep = ent(); applyEffect(ep, 'radiation', 10, {}); stepEffects(ep, p);
  assert.equal(p.calls[0][0], 'hurtPlayer');
  assert.ok(p.calls[0][1] > 0 && p.calls[0][1] < 5, 'one player radiation tick is a small per-tick amount');
});

test('stepEffects: two effects on one entity both dispatch in one step', () => {
  const e = ent(); applyEffect(e, 'radiation', 10, {}); applyEffect(e, 'bleed', 8, {});
  const ctx = spyCtx(false);
  stepEffects(e, ctx);
  assert.deepEqual(ctx.calls.map(c => c[0]).sort(), ['hurtPlayer', 'hurtPlayer']); // radiation + bleed both hit the player
});

test('applyEffect: NaN / zero / negative seconds fall back to the effect default', () => {
  for (const bad of [NaN, 0, -4]) {
    const e = ent();
    applyEffect(e, 'bleed', bad, noCtx);
    assert.equal(e.effects.get('bleed').ticksLeft, EFFECTS.bleed.secs * EFFECT_TPS, `seconds=${bad} → default`);
  }
});

test('removeEffect: removes one named effect, fires its onClear, leaves others', () => {
  let limp = null;
  const ctx = { setLimp: (e, on) => { limp = on; } };
  const e = ent();
  applyEffect(e, 'broken_leg', Infinity, ctx);
  applyEffect(e, 'radiation', 10, ctx);
  assert.equal(removeEffect(e, 'broken_leg', ctx), true);
  assert.equal(limp, false);                       // onClear fired
  assert.equal(e.effects.has('broken_leg'), false);
  assert.equal(e.effects.has('radiation'), true);  // untouched
});

test('removeEffect: false when the effect is absent', () => {
  assert.equal(removeEffect(ent(), 'radiation', {}), false);
});

test('broken_leg is flagged player-only via targets; others are unrestricted', () => {
  assert.equal(EFFECTS.broken_leg.targets, 'player');
  assert.equal(EFFECTS.radiation.targets, undefined);
  assert.equal(EFFECTS.bleed.targets, undefined);
});
