import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, makePart, resolveHit, resolveBlast } from '../../src/destruct.js';

test('stone material exists, tier 4, never ignites', () => {
  const s = MATERIALS.stone;
  assert.ok(s, 'stone material is defined');
  assert.equal(s.tier, 4);
  assert.equal(s.fuel, 0);          // rock never burns
  assert.equal(s.debris, 'rubble');
  assert.equal(s.sound, 'masonry'); // audio bucket for the later audio phase
});

test('a rifle (pen 1) only chips stone — no HP loss', () => {
  const part = makePart('rock1', 'stone', [0, 0, 0], [1, 1, 1]);
  const r = resolveHit(part, { pen: 1, dmg: 15 });
  assert.equal(r.effect, 'cosmetic');
  assert.equal(part.dead, false);
});

test('a .50-cal (pen 2) still only chips stone — strongest small-arm < tier 4', () => {
  const part = makePart('rock1b', 'stone', [0, 0, 0], [1, 1, 1]);
  const r = resolveHit(part, { pen: 2, dmg: 40 });
  assert.equal(r.effect, 'cosmetic');
  assert.equal(part.dead, false);
});

test('AP/HE-grade pen (≥ tier 4) DOES damage stone via direct hit', () => {
  const part = makePart('rock1c', 'stone', [0, 0, 0], [1, 1, 1]);  // hp 600
  const r = resolveHit(part, { pen: 4, dmg: 500 });
  assert.equal(r.effect, 'damage');      // pen 4 ≥ tier 4 ⇒ real HP loss
  assert.equal(r.killed, false);         // 500 < 600 ⇒ survives one hit
  assert.equal(part.dead, false);
  const r2 = resolveHit(part, { pen: 5, dmg: 900 });
  assert.equal(r2.killed, true);         // second hit finishes it
  assert.equal(part.dead, true);
});

test('the default bazooka blast (tier 3) does NOT remove stone', () => {
  const part = makePart('rock2', 'stone', [0, 0, 0], [1, 1, 1]);
  const res = resolveBlast([part], [0.5, 0.5, 0.5], { r1: 3, r2: 6, tier: 3 });
  assert.equal(part.dead, false);              // tier 4 > blast tier 3
  assert.equal(res.killed.length, 0);
});

test('a tier-4 blast DOES crumble stone', () => {
  const part = makePart('rock3', 'stone', [0, 0, 0], [1, 1, 1]);
  const res = resolveBlast([part], [0.5, 0.5, 0.5], { r1: 3, r2: 6, tier: 4 });
  assert.equal(part.dead, true);
  assert.deepEqual(res.killed, ['rock3']);
});
