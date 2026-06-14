import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapTo, clampRaise, presetRaiseTo, presetRaiseToBB } from '../../src/poker/betsizing.js';

// the chip economy's atom is 5 (smallest chip) — all bet inputs snap to it
test('snapTo rounds to the nearest multiple of the step (default 5)', () => {
  assert.equal(snapTo(47), 45);
  assert.equal(snapTo(48), 50);
  assert.equal(snapTo(42), 40);
  assert.equal(snapTo(43), 45);
  assert.equal(snapTo(40), 40);
  assert.equal(snapTo(0), 0);
  assert.equal(snapTo(123, 10), 120);
});

test('clampRaise snaps to 5 then clamps into [minRaiseTo, maxRaiseTo]', () => {
  const L = { minRaiseTo: 40, maxRaiseTo: 1500 };
  assert.equal(clampRaise(10, L), 40);      // below min → min
  assert.equal(clampRaise(2000, L), 1500);  // above max → max
  assert.equal(clampRaise(83, L), 85);      // snapped to 5
  assert.equal(clampRaise(100, L), 100);
});

test('presetRaiseTo — postflop pot-fraction = currentBet + fraction*(pot + callAmount)', () => {
  const ctx = { pot: 100, callAmount: 20, currentBet: 20, minRaiseTo: 40, maxRaiseTo: 1500 };
  assert.equal(presetRaiseTo(1, ctx), 140);     // pot raise: 20 + 1*(100+20)
  assert.equal(presetRaiseTo(0.5, ctx), 80);    // half pot: 20 + 0.5*120
  assert.equal(presetRaiseTo(0.75, ctx), 110);  // 3/4 pot: 20 + 90
});

test('presetRaiseTo clamps to the legal max (short stack)', () => {
  const ctx = { pot: 100, callAmount: 20, currentBet: 20, minRaiseTo: 40, maxRaiseTo: 60 };
  assert.equal(presetRaiseTo(1, ctx), 60);      // 140 → clamped to all-in 60
});

test('presetRaiseToBB — preflop BB multiples, snapped + clamped', () => {
  const ctx = { bb: 20, minRaiseTo: 40, maxRaiseTo: 1500 };
  assert.equal(presetRaiseToBB(3, ctx), 60);
  assert.equal(presetRaiseToBB(2.5, ctx), 50);
});

test('every preset result is in [minRaiseTo, maxRaiseTo]', () => {
  const ctx = { pot: 37, callAmount: 13, currentBet: 13, minRaiseTo: 26, maxRaiseTo: 333, bb: 20 };
  for (const f of [0.5, 0.75, 1]) {
    const r = presetRaiseTo(f, ctx);
    assert.ok(r >= ctx.minRaiseTo && r <= ctx.maxRaiseTo, `pot ${f} → ${r} in range`);
  }
  for (const m of [2, 2.5, 3, 4]) {
    const r = presetRaiseToBB(m, ctx);
    assert.ok(r >= ctx.minRaiseTo && r <= ctx.maxRaiseTo, `${m}bb → ${r} in range`);
  }
});

test('when minRaiseTo == maxRaiseTo (raise-is-all-in only), every input returns that value', () => {
  const ctx = { pot: 200, callAmount: 0, currentBet: 0, minRaiseTo: 80, maxRaiseTo: 80, bb: 20 };
  assert.equal(presetRaiseTo(1, ctx), 80);
  assert.equal(presetRaiseToBB(3, ctx), 80);
  assert.equal(clampRaise(50, ctx), 80);
});
