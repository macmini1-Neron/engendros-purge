// datum.test.mjs — node --test suite for src/bearing.js (the world AZIMUTH datum).
//
// Locks the one canonical convention the whole game shares: azimuth 0 = grid-NORTH = +Z,
// increasing CLOCKWISE toward +X (east), in Soviet угломер mils (6000/circle, "NN-NN").
// If any of these change, the F3 readout, the буссоль ПАБ-2А, the ННП-23 nightpost and the
// future mortar fire-mission all drift apart — so these are regression guards on the datum.

import test from 'node:test';
import assert from 'node:assert/strict';
import { wrap6000, yawToMils, dirToMils, bearingMils, rangeMeters, formatUglomer } from '../../src/bearing.js';

const TAU = Math.PI * 2;

// ─── cardinal axes from player/camera yaw (player spawns at yaw=π facing +Z) ──
test('yawToMils: cardinal axes', () => {
  assert.equal(Math.round(yawToMils(Math.PI)), 0);      // +Z north  → 00-00
  assert.equal(Math.round(yawToMils(-Math.PI / 2)), 1500); // +X east → 15-00
  assert.equal(Math.round(yawToMils(0)), 3000);         // −Z south  → 30-00
  assert.equal(Math.round(yawToMils(Math.PI / 2)), 4500);  // −X west → 45-00
});

// ─── direction-vector form must agree with the yaw form for the same heading ──
test('dirToMils: cardinal directions', () => {
  assert.equal(Math.round(dirToMils(0, 1)), 0);     // +Z north
  assert.equal(Math.round(dirToMils(1, 0)), 1500);  // +X east
  assert.equal(Math.round(dirToMils(0, -1)), 3000); // −Z south
  assert.equal(Math.round(dirToMils(-1, 0)), 4500); // −X west
});

test('yawToMils and dirToMils describe the same quantity', () => {
  // forward = (-sin yaw, -cos yaw); both must yield the same mils for any yaw.
  for (let y = -Math.PI; y < Math.PI; y += 0.137) {
    const a = yawToMils(y);
    const b = dirToMils(-Math.sin(y), -Math.cos(y));
    assert.ok(Math.abs(((a - b + 3000) % 6000) - 3000) < 1e-6, `yaw ${y}: ${a} vs ${b}`);
  }
});

// ─── clockwise sense: turning toward east must INCREASE mils ──────────────────
test('clockwise: small turn from north toward east increases mils', () => {
  const north = yawToMils(Math.PI);            // 00-00
  const slightEast = yawToMils(Math.PI + 0.2); // forward = (-sin, -cos) tilts toward +X (east)
  assert.equal(north, 0);
  assert.ok(slightEast > 0 && slightEast < 1500); // climbs 00-00 → toward 15-00 (east), clockwise
});

// ─── point-to-point bearing + range (the mortar-spotting primitives) ─────────
test('bearingMils / rangeMeters: NE target', () => {
  const from = { x: 0, z: 0 }, to = { x: 10, z: 10 };
  assert.equal(Math.round(bearingMils(from, to)), 750); // exactly NE = 07-50
  assert.ok(Math.abs(rangeMeters(from, to) - Math.hypot(10, 10)) < 1e-9);
});

test('bearingMils: due east / due south', () => {
  assert.equal(Math.round(bearingMils({ x: 0, z: 0 }, { x: 5, z: 0 })), 1500);
  assert.equal(Math.round(bearingMils({ x: 0, z: 0 }, { x: 0, z: -5 })), 3000);
});

// ─── wrap + format ───────────────────────────────────────────────────────────
test('wrap6000 normalises into [0,6000)', () => {
  assert.equal(wrap6000(-50), 5950);
  assert.equal(wrap6000(6000), 0);
  assert.equal(wrap6000(6050), 50);
  assert.equal(wrap6000(15000), 3000);
});

test('formatUglomer: "NN-NN" big-small divisions', () => {
  assert.equal(formatUglomer(3250), '32-50');
  assert.equal(formatUglomer(0), '00-00');
  assert.equal(formatUglomer(5), '00-05');
  assert.equal(formatUglomer(6000), '00-00'); // full circle wraps
  assert.equal(formatUglomer(-50), '59-50');  // negative wraps before formatting
});

// ─── determinism: pure function, identical output for identical input ────────
test('determinism: same yaw → same mils', () => {
  for (const y of [0, 1, 2.5, -1.3, TAU * 3]) assert.equal(yawToMils(y), yawToMils(y));
});
