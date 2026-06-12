// tests/fire/spread.test.mjs — pure spread-target selection (src/fire-spread.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestIgnitable } from '../../src/fire-spread.js';

const C = (cx, cz, extra = {}) => ({ cx, cz, taken: false, ...extra });

test('picks the nearest in-range candidate (horizontal distance only)', () => {
  const cands = [C(10, 0, { id: 'far' }), C(3, 0, { id: 'near' }), C(5, 0, { id: 'mid' })];
  const r = nearestIgnitable([0, 0, 0], cands, 6, null);
  assert.equal(r.id, 'near');
});

test('ignores height (y) — fire creeps along the ground', () => {
  // candidate 2 m away horizontally but high up still wins over a 5 m one at ground level.
  const cands = [C(2, 0, { id: 'tall' }), C(5, 0, { id: 'low' })];
  const r = nearestIgnitable([0, 99, 0], cands, 6, null);
  assert.equal(r.id, 'tall');
});

test('returns null when nothing is within radius', () => {
  assert.equal(nearestIgnitable([0, 0, 0], [C(20, 0)], 6, null), null);
});

test('skips already-taken (burning/burned) candidates', () => {
  const cands = [C(1, 0, { id: 'a', taken: true }), C(4, 0, { id: 'b' })];
  const r = nearestIgnitable([0, 0, 0], cands, 6, null);
  assert.equal(r.id, 'b');
});

test('a wall-blocked NEAR candidate does not hide a reachable FAR one', () => {
  const cands = [C(2, 0, { id: 'blocked' }), C(4, 0, { id: 'open' })];
  const isBlocked = (c) => c.id === 'blocked';
  const r = nearestIgnitable([0, 0, 0], cands, 6, isBlocked);
  assert.equal(r.id, 'open');
});

test('returns null if every in-range candidate is wall-occluded (fire dies at the wall)', () => {
  const cands = [C(2, 0, { id: 'a' }), C(3, 0, { id: 'b' })];
  assert.equal(nearestIgnitable([0, 0, 0], cands, 6, () => true), null);
});

test('respects the radius boundary exactly', () => {
  // candidate at exactly radius is included; just beyond is not.
  assert.ok(nearestIgnitable([0, 0, 0], [C(5, 0, { id: 'on' })], 5, null));
  assert.equal(nearestIgnitable([0, 0, 0], [C(5.001, 0)], 5, null), null);
});
