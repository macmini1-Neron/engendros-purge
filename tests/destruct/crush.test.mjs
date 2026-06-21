import test from 'node:test';
import assert from 'node:assert/strict';
import { makePart, resolveCrush, aabbOverlap } from '../../src/destruct.js';

test('aabbOverlap: overlapping vs disjoint boxes', () => {
  assert.equal(aabbOverlap([0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5], [2, 2, 2]), true);
  assert.equal(aabbOverlap([0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3]), false);
  assert.equal(aabbOverlap([0, 0, 0], [1, 1, 1], [1, 1, 1], [2, 2, 2]), true);   // touching counts
});

test('resolveCrush: a tank (crushTier 4) shoves THROUGH brick but is BLOCKED by reinforcedConcrete', () => {
  const brick = makePart('b1', 'brick', [0, 0, 0], [1, 2, 0.4]);
  const r1 = resolveCrush([brick], { min: [-0.5, 0, -0.3], max: [1.5, 2, 0.5] }, 4);
  assert.equal(r1.blocked, false);
  assert.deepEqual(r1.crushed, ['b1']);
  assert.ok(r1.drag > 0);

  const reb = makePart('r1', 'reinforcedConcrete', [2, 0, 0], [3, 2, 0.4]);
  const r2 = resolveCrush([reb], { min: [1.5, 0, -0.3], max: [3.5, 2, 0.5] }, 4);
  assert.equal(r2.blocked, true);
  assert.deepEqual(r2.hard, ['r1']);
  assert.equal(r2.crushed.length, 0);
  assert.equal(r2.drag, 1);
});

test('resolveCrush: a car (crushTier 1) is BLOCKED by brick (tier 3) — cannot crush a wall', () => {
  const brick = makePart('b1', 'brick', [0, 0, 0], [1, 2, 0.4]);
  const r = resolveCrush([brick], { min: [-0.5, 0, -0.3], max: [1.5, 2, 0.5] }, 1);
  assert.equal(r.blocked, true);
  assert.equal(r.crushed.length, 0);
});

test('resolveCrush: a car DOES flatten a wood fence (tier 1 ≤ crushTier 1)', () => {
  const fence = makePart('f1', 'wood', [0, 0, 0], [1.5, 1.2, 0.1]);
  const r = resolveCrush([fence], { min: [-0.5, 0, -0.3], max: [2, 1.5, 0.3] }, 1);
  assert.equal(r.blocked, false);
  assert.deepEqual(r.crushed, ['f1']);
});

test('resolveCrush: glass always shatters and never blocks (even crushTier 0)', () => {
  const g = makePart('g1', 'glass', [0, 1, 0], [1, 2, 0.05]);
  const r = resolveCrush([g], { min: [-1, 0, -1], max: [2, 3, 1] }, 0);
  assert.deepEqual(r.crushed, ['g1']);
  assert.equal(r.blocked, false);
});

test('resolveCrush: ignores parts outside the AABB and already-dead parts', () => {
  const near = makePart('n', 'wood', [0, 0, 0], [1, 2, 0.2]);
  const far = makePart('f', 'wood', [20, 0, 0], [21, 2, 0.2]);
  const dead = makePart('d', 'wood', [0, 0, 0], [1, 2, 0.2]); dead.dead = true;
  const r = resolveCrush([near, far, dead], { min: [-0.5, 0, -0.5], max: [1.5, 2, 0.5] }, 2);
  assert.deepEqual(r.crushed, ['n']);
});
