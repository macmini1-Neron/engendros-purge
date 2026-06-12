// worldclock.test.mjs — pure-function tests for the deterministic world clock.
// Mirrors tests/simclock/. Run: node --test tests/worldclock/worldclock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeWorldClock, parseHHMM, formatHHMM, keywordMinute, skyPhase, isNight,
  MINUTES_PER_DAY, DAY_START_MIN, DAY_END_MIN,
} from '../../src/worldclock.js';

const PI = Math.PI;
const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

// ─── parseHHMM ──────────────────────────────────────────────────────────────
test('parseHHMM: valid clock strings → minute-of-day', () => {
  assert.equal(parseHHMM('00:00'), 0);
  assert.equal(parseHHMM('20:18'), 1218);
  assert.equal(parseHHMM('23:59'), 1439);
  assert.equal(parseHHMM('06:30'), 390);
  assert.equal(parseHHMM('6:30'), 390);     // 1-digit hour ok
  assert.equal(parseHHMM('  12:00 '), 720); // trims
});

test('parseHHMM: invalid strings → null', () => {
  assert.equal(parseHHMM('24:00'), null);   // hour > 23
  assert.equal(parseHHMM('12:60'), null);   // minute > 59
  assert.equal(parseHHMM('12'), null);      // no colon
  assert.equal(parseHHMM('12:5'), null);    // minute must be 2 digits
  assert.equal(parseHHMM('-1:00'), null);
  assert.equal(parseHHMM('abc'), null);
  assert.equal(parseHHMM(''), null);
  assert.equal(parseHHMM(null), null);
});

// ─── formatHHMM ─────────────────────────────────────────────────────────────
test('formatHHMM: minute-of-day → zero-padded HH:MM', () => {
  assert.equal(formatHHMM(0), '00:00');
  assert.equal(formatHHMM(1218), '20:18');
  assert.equal(formatHHMM(390), '06:30');
  assert.equal(formatHHMM(1439), '23:59');
});

test('formatHHMM: wraps out-of-range minutes', () => {
  assert.equal(formatHHMM(1440), '00:00');  // next midnight
  assert.equal(formatHHMM(-1), '23:59');    // before midnight
  assert.equal(formatHHMM(1440 * 3 + 720), '12:00'); // many days later
});

test('parseHHMM ∘ formatHHMM round-trips every minute of the day', () => {
  for (let m = 0; m < MINUTES_PER_DAY; m++) {
    assert.equal(parseHHMM(formatHHMM(m)), m, `round-trip failed at ${m}`);
  }
});

// ─── keywordMinute ──────────────────────────────────────────────────────────
test('keywordMinute: named phases map to distinct clock times', () => {
  assert.equal(keywordMinute('dawn'), 360);      // 06:00
  assert.equal(keywordMinute('noon'), 720);      // 12:00
  assert.equal(keywordMinute('dusk'), 1080);     // 18:00
  assert.equal(keywordMinute('midnight'), 0);    // 00:00
  assert.equal(keywordMinute('day'), 720);       // alias of noon
  assert.equal(keywordMinute('night'), 0);       // alias of midnight
  assert.equal(keywordMinute('nope'), null);
});

test('keywordMinute: the four anchors are mutually distinct (fixes day==noon legacy bug)', () => {
  const anchors = ['dawn', 'noon', 'dusk', 'midnight'].map(keywordMinute);
  assert.equal(new Set(anchors).size, 4);
});

// ─── isNight ────────────────────────────────────────────────────────────────
test('isNight: day window is [06:00, 18:00)', () => {
  assert.equal(isNight(DAY_START_MIN), false);   // 06:00 exactly = day begins
  assert.equal(isNight(720), false);             // noon
  assert.equal(isNight(DAY_END_MIN - 1), false); // 17:59 still day
  assert.equal(isNight(DAY_END_MIN), true);      // 18:00 exactly = night begins
  assert.equal(isNight(0), true);                // midnight
  assert.equal(isNight(300), true);              // 05:00 pre-dawn
  assert.equal(isNight(1200), true);             // 20:00
});

// ─── skyPhase ───────────────────────────────────────────────────────────────
test('skyPhase: dawn 06:00 → day just starting, L=0, sun at east horizon', () => {
  const p = skyPhase(360);
  assert.equal(p.day, true);
  approx(p.L, 0);
  approx(p.ang, 0);
});

test('skyPhase: noon 12:00 → peak light, sun at zenith', () => {
  const p = skyPhase(720);
  assert.equal(p.day, true);
  approx(p.L, 1);
  approx(p.ang, PI / 2);
});

test('skyPhase: dusk 18:00 → flips to night, L=0, moon at east horizon', () => {
  const p = skyPhase(1080);
  assert.equal(p.day, false);
  approx(p.L, 0);
  approx(p.ang, 0);
});

test('skyPhase: midnight 00:00 → night, L=0, moon at zenith', () => {
  const p = skyPhase(0);
  assert.equal(p.day, false);
  approx(p.L, 0);
  approx(p.ang, PI / 2);
});

test('skyPhase: brightness is continuous (→0) across both day/night boundaries', () => {
  approx(skyPhase(360 - 1e-6).L, 0, 1e-4);   // just before dawn (night side)
  approx(skyPhase(360 + 1e-6).L, 0, 1e-4);   // just after dawn (day side)
  approx(skyPhase(1080 - 1e-6).L, 0, 1e-4);  // just before dusk (day side)
  approx(skyPhase(1080 + 1e-6).L, 0, 1e-4);  // just after dusk (night side)
});

test('skyPhase: L always within [0,1]', () => {
  for (let m = 0; m < MINUTES_PER_DAY; m += 7) {
    const { L } = skyPhase(m);
    assert.ok(L >= 0 && L <= 1, `L out of range at ${m}: ${L}`);
  }
});

// ─── makeWorldClock ─────────────────────────────────────────────────────────
test('makeWorldClock: starts at startMinute', () => {
  const wc = makeWorldClock({ stepSec: 1, startMinute: 480 });
  assert.equal(wc.total, 480);
  assert.equal(wc.minuteOfDay(), 480); // 08:00
  assert.equal(wc.day(), 0);
  assert.equal(wc.alpha, 0);
});

test('makeWorldClock: advance fires onMinute once per whole in-game minute', () => {
  const wc = makeWorldClock({ stepSec: 1, startMinute: 0, maxDt: 2 });
  const seen = [];
  for (let i = 0; i < 5; i++) wc.advance(1, (t) => seen.push(t));
  assert.equal(wc.total, 5);
  assert.deepEqual(seen, [1, 2, 3, 4, 5]); // each tick reports the new monotonic total
});

test('makeWorldClock: determinism — identical dt sequence → identical total', () => {
  const dt = [0.016, 0.033, 0.05, 0.008, 0.05, 0.02, 0.05, 0.016, 0.04, 0.05];
  const a = makeWorldClock({ stepSec: 0.1, startMinute: 0 });
  const b = makeWorldClock({ stepSec: 0.1, startMinute: 0 });
  for (const d of dt) { a.advance(d); b.advance(d); }
  assert.equal(a.total, b.total);
});

test('makeWorldClock: minuteOfDay wraps and day() increments at the 1440 rollover', () => {
  const wc = makeWorldClock({ stepSec: 1, startMinute: 1439, maxDt: 2 });
  wc.advance(1); // → total 1440
  assert.equal(wc.total, 1440);
  assert.equal(wc.minuteOfDay(), 0);
  assert.equal(wc.day(), 1);
});

test('makeWorldClock: setTotal hard-sets time and resets the sub-minute accumulator', () => {
  const wc = makeWorldClock({ stepSec: 1, startMinute: 0, maxDt: 2 });
  wc.advance(0.6); // partial minute → alpha > 0, no tick yet
  assert.ok(wc.alpha > 0);
  wc.setTotal(1218); // /time set 20:18
  assert.equal(wc.total, 1218);
  assert.equal(wc.minuteOfDay(), 1218);
  assert.equal(wc.alpha, 0);
});

test('makeWorldClock: alpha stays in [0,1)', () => {
  const wc = makeWorldClock({ stepSec: 1, startMinute: 0 });
  for (let i = 0; i < 40; i++) { wc.advance(0.05); assert.ok(wc.alpha >= 0 && wc.alpha < 1, `alpha=${wc.alpha}`); }
});

test('makeWorldClock: a long stall frame cannot fast-forward time (dt clamped by maxDt)', () => {
  const wc = makeWorldClock({ stepSec: 0.8333, startMinute: 0 }); // default maxDt 0.05
  wc.advance(10); // 10s stall (tab hidden) — must NOT jump ~12 minutes
  assert.equal(wc.total, 0); // 0.05 < step → no tick
});
