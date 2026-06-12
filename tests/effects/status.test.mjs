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
