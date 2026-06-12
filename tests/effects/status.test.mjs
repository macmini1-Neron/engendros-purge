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
