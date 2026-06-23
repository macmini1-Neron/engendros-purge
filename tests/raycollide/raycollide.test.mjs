import test from 'node:test';
import assert from 'node:assert/strict';
import { raySphere, rayCapsule } from '../../src/raycollide.js';

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

// vertical capsule: A=(0,0,0) B=(0,4,0) r=0.5
test('rayCapsule: side hit on the cylinder body', () => {
  const out = {};
  const t = rayCapsule(-5,2,0, 1,0,0, 0,0,0, 0,4,0, 0.5, out);
  assert.ok(t !== null && Math.abs(t - 4.5) < 1e-6, `t=${t}`);   // hit at x=-0.5
  assert.ok(Math.abs(out.nx + 1) < 1e-6, `n=${out.nx}`);          // points -X
});

test('rayCapsule: grazing miss just outside the radius returns null', () => {
  // aim past the side at y=2, offset z=0.6 (> r=0.5) → miss
  assert.equal(rayCapsule(-5,2,0.6, 1,0,0, 0,0,0, 0,4,0, 0.5, null), null);
});

test('rayCapsule: hemisphere cap hit above the top', () => {
  const t = rayCapsule(0,9,0, 0,-1,0, 0,0,0, 0,4,0, 0.5, null);  // straight down onto B cap
  assert.ok(t !== null && Math.abs(t - 4.5) < 1e-6, `t=${t}`);   // top of cap at y=4.5
});

test('rayCapsule: shot threads PAST a thin trunk that the AABB would have caught', () => {
  // trunk capsule r=0.2 at origin; shot offset z=0.35 → misses the round trunk
  assert.equal(rayCapsule(-5,2,0.35, 1,0,0, 0,0,0, 0,4,0, 0.2, null), null);
});
