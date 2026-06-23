import test from 'node:test';
import assert from 'node:assert/strict';
import { flatFalls } from '../../src/destruct.js';

test('flatFalls: deterministic — same (seed, breakFrac) → same decision', () => {
  for (let s = 1; s <= 200; s++) {
    assert.equal(flatFalls(s, 0.2), flatFalls(s, 0.2));
    assert.equal(flatFalls(s, 0.6), flatFalls(s, 0.6));
  }
});

test('flatFalls: low break ≈ 70% flat (30% stay propped)', () => {
  let flat = 0; const N = 4000;
  for (let s = 1; s <= N; s++) if (flatFalls(s, 0.2)) flat++;
  const ratio = flat / N;
  assert.ok(ratio > 0.66 && ratio < 0.74, `low-break flat ratio ${ratio} outside ~0.70`);
});

test('flatFalls: high break ≈ 90% flat (10% stay propped)', () => {
  let flat = 0; const N = 4000;
  for (let s = 1; s <= N; s++) if (flatFalls(s, 0.6)) flat++;
  const ratio = flat / N;
  assert.ok(ratio > 0.86 && ratio < 0.94, `high-break flat ratio ${ratio} outside ~0.90`);
});

test('flatFalls: a high/precarious break stays propped strictly less often than a low one', () => {
  let low = 0, high = 0; const N = 4000;
  for (let s = 1; s <= N; s++) { if (!flatFalls(s, 0.2)) low++; if (!flatFalls(s, 0.6)) high++; }
  assert.ok(high < low, `high-break propped count ${high} should be < low-break ${low}`);
});

test('flatFalls: the 0.38 threshold flips the propped chance', () => {
  // just below the threshold → low-break regime; just above → high-break regime
  let pLo = 0, pHi = 0; const N = 4000;
  for (let s = 1; s <= N; s++) { if (!flatFalls(s, 0.37)) pLo++; if (!flatFalls(s, 0.39)) pHi++; }
  assert.ok(pLo > pHi, 'crossing 0.38 must reduce the propped probability');
});
