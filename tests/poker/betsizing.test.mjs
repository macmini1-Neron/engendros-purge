import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapTo, clampRaise, presetRaiseTo, presetRaiseToBB, raiseBreakdown } from '../../src/poker/betsizing.js';

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

// raiseBreakdown — the "bet $X · leaves $Y" readout, anchored to the header stack (the reported bug:
// the old readout used maxRaiseTo as its baseline, so it never matched the "YOU $" number).
test('raiseBreakdown — the screenshot case: SB posted 10, header $1390, raise to 1160', () => {
  // committed=10 (your SB), behind=1390 (header). cost = 1160-10 = 1150; leaves = 1390-1150 = 240.
  const { cost, leaves } = raiseBreakdown(1160, 10, 1390);
  assert.equal(cost, 1150);
  assert.equal(leaves, 240);
  assert.equal(1390 - cost, leaves, 'leaves reconciles with the header: header - cost');
});

test('raiseBreakdown — leaves always equals the old maxRaiseTo-raiseTo, but reconciles with the header', () => {
  // maxRaiseTo = committed + behind. In a re-raised pot the committed (roundBet) is large — exactly the
  // case the player saw as "wrong" (header 1090, you re-raised 300 this street, now raise to 1160).
  const committed = 300, behind = 1090, raiseTo = 1160;
  const maxRaiseTo = committed + behind;            // 1390
  const { cost, leaves } = raiseBreakdown(raiseTo, committed, behind);
  assert.equal(cost, 860);                          // 1160 - 300
  assert.equal(leaves, 230);                        // 1090 - 860
  assert.equal(leaves, maxRaiseTo - raiseTo, 'same value as the old formula');
  assert.equal(behind - cost, leaves, 'but now header - cost == leaves (the naive 1090-1160 = -70 is gone)');
});

test('raiseBreakdown — all-in (raise to the max) leaves $0, and is clamped to [0, behind]', () => {
  assert.deepEqual(raiseBreakdown(1400, 10, 1390), { cost: 1390, leaves: 0 }); // raise to maxRaiseTo
  assert.deepEqual(raiseBreakdown(99999, 10, 1390), { cost: 1390, leaves: 0 }); // over-max never goes negative
  assert.deepEqual(raiseBreakdown(0, 0, 1390), { cost: 0, leaves: 1390 });      // degenerate
});
