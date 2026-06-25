import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStabState, stepStab, gagReady, fireOnMoveOk, SHILKA_STAB } from '../../src/shilka-stab.js';

const PWR = { dc27: true, v115: true };

test('gag off → stays off, no spin', () => {
  const s = createStabState();
  stepStab(s, PWR, 10);
  assert.equal(s.phase, 'off');
  assert.equal(s.spinT, 0);
});

test('gag on → spinup immediately', () => {
  const s = createStabState({ gagOn: true });
  stepStab(s, PWR, 1);
  assert.equal(s.phase, 'spinup');
  assert.ok(s.spinT > 0 && s.spinT < SHILKA_STAB.spinSeconds);
});

test('gag on → ready after spinSeconds', () => {
  const s = createStabState({ gagOn: true });
  stepStab(s, PWR, SHILKA_STAB.spinSeconds);
  assert.equal(s.phase, 'ready');
  assert.ok(gagReady(s));
});

test('spinT clamps at spinSeconds', () => {
  const s = createStabState({ gagOn: true });
  stepStab(s, PWR, SHILKA_STAB.spinSeconds * 5);
  assert.equal(s.spinT, SHILKA_STAB.spinSeconds);
});

test('no DC power → cannot reach ready', () => {
  const s = createStabState({ gagOn: true });
  stepStab(s, { dc27: false, v115: false }, 200);
  assert.notEqual(s.phase, 'ready');
  assert.equal(s.phase, 'off');
});

test('no 115V → cannot reach ready', () => {
  const s = createStabState({ gagOn: true });
  stepStab(s, { dc27: true, v115: false }, 200);
  assert.notEqual(s.phase, 'ready');
});

test('fire-on-move needs ready', () => {
  const s = createStabState({ gagOn: true });
  assert.equal(fireOnMoveOk(s), false);
  stepStab(s, PWR, SHILKA_STAB.spinSeconds);
  assert.equal(fireOnMoveOk(s), true);
});

test('controlFault blocks ready/gagReady', () => {
  const s = createStabState({ gagOn: true, controlFault: true });
  stepStab(s, PWR, SHILKA_STAB.spinSeconds);
  assert.equal(gagReady(s), false);
});

test('gag off after spinning resets spinT and phase', () => {
  const s = createStabState({ gagOn: true });
  stepStab(s, PWR, 100);
  assert.equal(s.phase, 'spinup');
  s.gagOn = false;
  stepStab(s, PWR, 1);
  assert.equal(s.spinT, 0);
  assert.equal(s.phase, 'off');
});

test('losing power mid-spin drops back to off', () => {
  const s = createStabState({ gagOn: true });
  stepStab(s, PWR, 100);
  stepStab(s, { dc27: false, v115: true }, 1);
  assert.equal(s.phase, 'off');
  assert.equal(s.spinT, 0);
});
