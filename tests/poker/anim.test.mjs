import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeOutCubic, easeOutBack, Tween } from '../../src/poker/anim.js';

test('easings hit their endpoints', () => {
  assert.equal(easeOutCubic(0), 0); assert.equal(easeOutCubic(1), 1);
  assert.ok(Math.abs(easeOutBack(0)) < 1e-9); assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-9);
});

test('easeOutBack overshoots past 1 before settling (the satisfying bounce)', () => {
  let peak = 0; for (let p = 0; p <= 1; p += 0.01) peak = Math.max(peak, easeOutBack(p));
  assert.ok(peak > 1.0);
});

test('Tween reports done after its duration and clamps progress', () => {
  const tw = new Tween(0.3);
  tw.step(0.1); assert.ok(!tw.done && tw.p > 0);
  tw.step(0.5); assert.ok(tw.done && tw.p === 1);
});
