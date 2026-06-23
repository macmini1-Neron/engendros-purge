import test from 'node:test';
import assert from 'node:assert/strict';
import { raySphere } from '../../src/raycollide.js';

test('raySphere: head-on hit returns near-surface t + outward normal', () => {
  const out = {};
  // ray from x=-5 along +X at a unit sphere centred at origin → first hit at x=-1, t=4
  const t = raySphere(-5,0,0, 1,0,0, 0,0,0, 1, out);
  assert.ok(t !== null && Math.abs(t - 4) < 1e-6, `t=${t}`);
  assert.ok(Math.abs(out.nx + 1) < 1e-6 && Math.abs(out.ny) < 1e-6, `n=${out.nx},${out.ny},${out.nz}`);
});

test('raySphere: clean miss returns null', () => {
  assert.equal(raySphere(-5,3,0, 1,0,0, 0,0,0, 1, null), null);
});

test('raySphere: pointing away returns null', () => {
  assert.equal(raySphere(-5,0,0, -1,0,0, 0,0,0, 1, null), null);
});

test('raySphere: origin inside returns the forward exit hit', () => {
  const t = raySphere(0,0,0, 1,0,0, 0,0,0, 2, null);
  assert.ok(t !== null && Math.abs(t - 2) < 1e-6, `t=${t}`);
});
