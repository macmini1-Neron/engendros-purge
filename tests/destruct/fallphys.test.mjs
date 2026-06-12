import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHinge, makeTumble, stepBody, hingePoint } from '../../src/destruct.js';

const groundHinge = (seed = 7, obstacles = []) =>
  makeHinge({ pivot: [0, 2, 0], dirXZ: [0, 1], length: 5, radius: 0.2, seed, obstacles });

test('hinge: same seed ⇒ bit-identical trajectory (determinism for MP replay)', () => {
  const a = groundHinge(42), b = groundHinge(42);
  for (let i = 0; i < 200; i++) { stepBody(a, 1 / 60); stepBody(b, 1 / 60); }
  assert.equal(a.angle, b.angle);
  assert.equal(a.settled, b.settled);
});

test('hinge: variable-dt slicing converges with uniform dt (substep accumulator)', () => {
  const a = groundHinge(1), b = groundHinge(1);
  for (let i = 0; i < 150; i++) stepBody(a, 0.016);
  for (let i = 0; i < 48; i++)  stepBody(b, 0.05);
  assert.ok(Math.abs(a.angle - b.angle) < 1e-6);
});

test('hinge: falls past horizontal and settles with tip on the ground within 8 s', () => {
  const h = groundHinge(3);
  for (let i = 0; i < 480 && !h.settled; i++) stepBody(h, 1 / 60);
  assert.equal(h.settled, true);
  assert.ok(h.angle > Math.PI / 2, 'rests past horizontal (tip down to ground)');
  const tip = hingePoint(h, 1.0);
  assert.ok(tip[1] <= 0.25, `tip near ground, got y=${tip[1]}`);
});

test('hinge: rests against an obstacle instead of clipping through', () => {
  const wall = { min: [-2, 0, 1.9], max: [2, 3, 2.2] };
  const h = groundHinge(5, [wall]);
  for (let i = 0; i < 600 && !h.settled; i++) stepBody(h, 1 / 60);
  assert.equal(h.settled, true);
  assert.ok(h.angle < Math.PI / 2, `leans on wall well before horizontal, got ${h.angle}`);
  assert.ok(h.angle > 0.2, 'actually fell some way first');
});

test('hingePoint maps rod fraction to world space', () => {
  const h = groundHinge(1);
  const base = hingePoint(h, 0);
  assert.deepEqual(base, [0, 2, 0]);
});

test('tumble: ballistic chunk lands and settles on the ground', () => {
  const t = makeTumble({ pos: [0, 3, 0], vel: [2, 1, 0], seed: 9 });
  for (let i = 0; i < 600 && !t.settled; i++) stepBody(t, 1 / 60);
  assert.equal(t.settled, true);
  assert.ok(t.pos[1] <= 0.3);
});

test('hinge: angle frozen after settle (stepBody is a no-op on settled bodies)', () => {
  const h = groundHinge(3);
  for (let i = 0; i < 480; i++) stepBody(h, 1 / 60);
  assert.equal(h.settled, true);
  const frozenAngle = h.angle, frozenAcc = h.acc;
  stepBody(h, 1 / 60);
  stepBody(h, 1 / 60);
  assert.equal(h.angle, frozenAngle, 'angle must not change after settled');
  assert.equal(h.acc, frozenAcc, 'accumulator must not grow after settled');
});
