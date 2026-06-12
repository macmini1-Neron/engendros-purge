// displays.test.mjs — the analog/digital displays contract: handAngles().
// Run: node --test tests/worldclock/displays.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { handAngles, parseHHMM } from '../../src/worldclock.js';

const TAU = Math.PI * 2;
const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

// at("HH:MM") → angles for that wall-clock time
const at = (hhmm) => handAngles(parseHHMM(hhmm));

test('handAngles: cardinal anchors', () => {
  // 12 o'clock (midnight + noon) → both hands straight up
  approx(at('00:00').hourRad, 0); approx(at('00:00').minuteRad, 0);
  approx(at('12:00').hourRad, 0); approx(at('12:00').minuteRad, 0);
  // 06:00 / 18:00 → hour hand straight down, minute up
  approx(at('06:00').hourRad, Math.PI); approx(at('06:00').minuteRad, 0);
  approx(at('18:00').hourRad, Math.PI); approx(at('18:00').minuteRad, 0);
  // 15:00 → hour hand at 3 (quarter turn), 21:00 → at 9 (three-quarter turn)
  approx(at('15:00').hourRad, TAU / 4);
  approx(at('21:00').hourRad, (3 * TAU) / 4);
  // quarter past → minute hand at 3
  approx(at('00:15').minuteRad, TAU / 4);
  approx(at('00:30').minuteRad, TAU / 2);
  approx(at('00:45').minuteRad, (3 * TAU) / 4);
});

test('handAngles: hour hand advances continuously with minutes', () => {
  // 12:30 → hour hand halfway between 12 and 1 (TAU/24)
  approx(at('12:30').hourRad, TAU / 24);
  // 10:09 — the «Стрела» reference-photo pose: hour just past 10, minute just shy of 2
  const r = at('10:09');
  approx(r.hourRad, ((10 * 60 + 9) % 720) / 720 * TAU);
  approx(r.minuteRad, (9 / 60) * TAU);
  assert.ok(r.hourRad > (10 / 12) * TAU && r.hourRad < (11 / 12) * TAU);
});

test('handAngles: sub-minute floats interpolate smoothly (alpha use)', () => {
  const a = handAngles(390);        // 06:30 exact
  const b = handAngles(390.5);      // half an in-game minute later
  const c = handAngles(391);
  assert.ok(a.minuteRad < b.minuteRad && b.minuteRad < c.minuteRad);
  approx(b.minuteRad - a.minuteRad, c.minuteRad - b.minuteRad); // linear between minutes
  assert.ok(b.hourRad > a.hourRad && b.hourRad < c.hourRad);
});

test('handAngles: wraps any input into one day (negative + multi-day)', () => {
  const ref = at('01:30');
  const wrapped = handAngles(1440 + 90);    // +1 day
  const negative = handAngles(90 - 1440);   // −1 day
  approx(wrapped.hourRad, ref.hourRad); approx(wrapped.minuteRad, ref.minuteRad);
  approx(negative.hourRad, ref.hourRad); approx(negative.minuteRad, ref.minuteRad);
});

test('handAngles: range stays in [0, TAU)', () => {
  for (let m = 0; m < 1440; m += 7.3) {
    const { hourRad, minuteRad } = handAngles(m);
    assert.ok(hourRad >= 0 && hourRad < TAU, `hourRad out of range at ${m}`);
    assert.ok(minuteRad >= 0 && minuteRad < TAU, `minuteRad out of range at ${m}`);
  }
});
