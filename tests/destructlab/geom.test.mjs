import test from 'node:test';
import assert from 'node:assert/strict';
import { rayAABB, rayAABBSpan, distToAABB, pointInAABB } from '../../tools/destructlab/geom.js';

test('rayAABB hits a box in front and returns entry distance', () => {
  const t = rayAABB([0, 1, -5], [0, 0, 1], [-1, 0, -1], [1, 2, 1]);
  assert.ok(Math.abs(t - 4) < 1e-9);
});

test('rayAABB misses a box off to the side', () => {
  assert.equal(rayAABB([5, 1, -5], [0, 0, 1], [-1, 0, -1], [1, 2, 1]), null);
});

test('rayAABB ignores boxes behind the origin', () => {
  assert.equal(rayAABB([0, 1, 5], [0, 0, 1], [-1, 0, -1], [1, 2, 1]), null);
});

test('rayAABB exit point: rayAABBSpan returns far intersection', () => {
  const { tIn, tOut } = rayAABBSpan([0, 1, -5], [0, 0, 1], [-1, 0, -1], [1, 2, 1]);
  assert.ok(Math.abs(tIn - 4) < 1e-9 && Math.abs(tOut - 6) < 1e-9);
});

test('distToAABB is 0 inside, face distance outside', () => {
  assert.equal(distToAABB([0, 1, 0], [-1, 0, -1], [1, 2, 1]), 0);
  assert.ok(Math.abs(distToAABB([3, 1, 0], [-1, 0, -1], [1, 2, 1]) - 2) < 1e-9);
});

test('pointInAABB respects inflate', () => {
  assert.equal(pointInAABB([1.1, 1, 0], [-1, 0, -1], [1, 2, 1]), false);
  assert.equal(pointInAABB([1.1, 1, 0], [-1, 0, -1], [1, 2, 1], 0.2), true);
});
