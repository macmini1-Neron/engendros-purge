import test from 'node:test';
import assert from 'node:assert/strict';
import { segDist2 } from '../../src/geom.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('a point ON the segment has distance 0', () => {
  assert.ok(near(segDist2(2, 0, 0, 0, 4, 0), 0));   // midpoint of a horizontal segment
  assert.ok(near(segDist2(0, 0, 0, 0, 4, 0), 0));   // endpoint A
  assert.ok(near(segDist2(4, 0, 0, 0, 4, 0), 0));   // endpoint B
});

test('perpendicular distance to the segment interior is the foot-of-perpendicular distance²', () => {
  assert.ok(near(segDist2(2, 3, 0, 0, 4, 0), 9));   // 3 units above the midpoint → 3² = 9
});

test('beyond an endpoint clamps to that endpoint (not the infinite line)', () => {
  // point at (-3,0): nearest point on the segment is endpoint A (0,0), dist 3 → 9 (NOT 0 on the line)
  assert.ok(near(segDist2(-3, 0, 0, 0, 4, 0), 9));
  assert.ok(near(segDist2(7, 0, 0, 0, 4, 0), 9));   // beyond B (4,0): nearest is B, (7-4)²=9
});

test('a degenerate segment (A==B) is the point-to-point distance²', () => {
  assert.ok(near(segDist2(3, 4, 1, 1, 1, 1), 13));  // (3-1,4-1)=(2,3) → 4+9 = 13
});

test('diagonal segment, off to the side', () => {
  // segment (0,0)→(2,2); point (2,0): nearest point is (1,1); dist² = 1+1 = 2
  assert.ok(near(segDist2(2, 0, 0, 0, 2, 2), 2));
});
