import test from 'node:test';
import assert from 'node:assert/strict';
import { snapPlan } from '../../src/destruct.js';

test('snapPlan: break fraction = hit height up the trunk', () => {
  const { breakAt } = snapPlan(10, 5, 0);     // hit at mid-height of a 10 m tree based at 0
  assert.ok(Math.abs(breakAt - 0.5) < 1e-9);
});

test('snapPlan: accounts for the tree base Y', () => {
  const { breakAt } = snapPlan(8, 12, 8);     // base at y=8, hit at y=12 → 4/8 = 0.5
  assert.ok(Math.abs(breakAt - 0.5) < 1e-9);
});

test('snapPlan: clamps to [minFrac, maxFrac]', () => {
  assert.equal(snapPlan(10, 0, 0).breakAt, 0.08);     // a base hit → low stub floor, not 0
  assert.equal(snapPlan(10, 100, 0).breakAt, 0.92);   // a sky-high hit → capped below the crown apex
  assert.equal(snapPlan(10, -5, 0).breakAt, 0.08);    // below the base → floor
});

test('snapPlan: monotonic in hit height + remainFrac mirrors breakAt', () => {
  let prev = -1;
  for (let y = 0; y <= 10; y += 1) {
    const r = snapPlan(10, y, 0);
    assert.ok(r.breakAt >= prev, 'higher hit ⇒ higher (or equal) break');
    assert.equal(r.remainFrac, r.breakAt);
    prev = r.breakAt;
  }
});

test('snapPlan: degenerate height → no NaN', () => {
  const r = snapPlan(0, 3, 0);
  assert.ok(Number.isFinite(r.breakAt) && r.breakAt >= 0.08 && r.breakAt <= 0.92);
});
