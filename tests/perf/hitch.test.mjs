import test from 'node:test';
import assert from 'node:assert/strict';
import { hitchStats, HitchLogger } from '../../src/hitch.js';

test('hitchStats counts hitches and worst/p99', () => {
  const s = hitchStats([10, 12, 11, 60, 9, 120, 13]);
  assert.equal(s.count, 7);
  assert.equal(s.worstMs, 120);
  assert.equal(s.hitches50, 2);   // 60 and 120
  assert.equal(s.hitches100, 1);  // 120
  assert.ok(s.p99Ms >= 60 && s.p99Ms <= 120);
});

test('hitchStats handles empty input', () => {
  const s = hitchStats([]);
  assert.equal(s.count, 0);
  assert.equal(s.worstMs, 0);
  assert.equal(s.hitches50, 0);
});

test('HitchLogger tags causes and aggregates', () => {
  const log = new HitchLogger();
  log.sample(10); log.sample(70, 'boss-fire'); log.sample(200, 'drop-build');
  const r = log.report();
  assert.equal(r.worstMs, 200);
  assert.equal(r.hitches50, 2);
  assert.equal(r.causes['drop-build'], 1);
  assert.equal(r.causes['boss-fire'], 1);
});

test('HitchLogger.reset clears samples and causes', () => {
  const log = new HitchLogger();
  log.sample(80, 'x');
  log.reset();
  const r = log.report();
  assert.equal(r.count, 0);
  assert.deepEqual(r.causes, {});
});

test('setCause tags subsequent frames until cleared', () => {
  const log = new HitchLogger();
  log.setCause('spawn');
  log.sample(70);          // inherits 'spawn'
  log.clearCause();
  log.sample(70);          // no cause → not attributed
  const r = log.report();
  assert.equal(r.causes['spawn'], 1);
  assert.equal(r.hitches50, 2);
});
