// Node tests for the pure Shilka gameplay state machine.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHILKA_PHASES,
  SHILKA_SEARCH_MODES,
  SHILKA_TUNING,
  computeShilkaKinematics,
  createShilkaState,
  fireShilkaBurst,
  grantRoundDir,
  makeShilkaBurstGrant,
  makeShilkaDrone,
  radarReady,
  segmentSphereHit,
  setShilkaContact,
  setShilkaRangeGate,
  setShilkaSwitch,
  shilkaPhase,
  shilkaFireControl,
  shilkaRadarSignal,
  shilkaSolutionReady,
  simulateShilkaProjectile,
  startShilkaSearch,
  stepShilkaDrone,
  stepShilka,
  tryShilkaAngleLock,
  updateShilkaTrack,
} from '../../src/shilka-mechanics.js';
import { dirToMils } from '../../src/bearing.js';

function poweredState() {
  let s = createShilkaState();
  for (const name of [
    'power54v',
    'gyroUnlocked',
    'hydroDrive',
    'radarFilament',
    'radarAnode',
    'radarHighVoltage',
    'radarOnAir',
  ]) {
    s = setShilkaSwitch(s, name, true);
  }
  return s;
}

test('startup chain gates the radar: 54V, unlocked gyro, hydro drive, and radar power are all required', () => {
  let s = createShilkaState();
  assert.equal(shilkaPhase(s), SHILKA_PHASES.POWER_OFF);

  s = setShilkaSwitch(s, 'power54v', true);
  assert.equal(shilkaPhase(s), SHILKA_PHASES.GYRO_LOCKED);

  s = setShilkaSwitch(s, 'gyroUnlocked', true);
  assert.equal(shilkaPhase(s), SHILKA_PHASES.DRIVE_OFF);

  s = setShilkaSwitch(s, 'hydroDrive', true);
  s = setShilkaSwitch(s, 'radarFilament', true);
  s = setShilkaSwitch(s, 'radarAnode', true);
  s = setShilkaSwitch(s, 'radarHighVoltage', true);
  s = setShilkaSwitch(s, 'radarOnAir', true);
  assert.equal(shilkaPhase(s), SHILKA_PHASES.RADAR_WARMING);

  s = stepShilka(s, SHILKA_TUNING.warmupSeconds);
  assert.equal(radarReady(s), true);
});

test('search cannot start before radar warmup, then sector mode becomes active', () => {
  let s = poweredState();
  s = startShilkaSearch(s, SHILKA_SEARCH_MODES.SECTOR);
  assert.equal(s.searchMode, null);

  s = stepShilka(s, SHILKA_TUNING.warmupSeconds);
  s = startShilkaSearch(s, SHILKA_SEARCH_MODES.SECTOR);
  assert.equal(s.searchMode, SHILKA_SEARCH_MODES.SECTOR);
  assert.equal(shilkaPhase(s), SHILKA_PHASES.SEARCHING);
});

test('contact and right-click style angle lock require centered target error', () => {
  let s = stepShilka(poweredState(), SHILKA_TUNING.warmupSeconds);
  s = startShilkaSearch(s, SHILKA_SEARCH_MODES.CIRCULAR);
  s = setShilkaContact(s, true);
  assert.equal(shilkaPhase(s), SHILKA_PHASES.CONTACT);

  const miss = tryShilkaAngleLock(s, SHILKA_TUNING.lockBreakErrorDeg + 0.1);
  assert.equal(miss.angleLocked, false);

  const lock = tryShilkaAngleLock(s, 1);
  assert.equal(lock.angleLocked, true);
  assert.ok(lock.lockQuality > 0);
  assert.equal(shilkaPhase(lock), SHILKA_PHASES.ANGLE_LOCK);
});

test('range solution builds only after angle lock and becomes ready after the solve time', () => {
  let s = stepShilka(poweredState(), SHILKA_TUNING.warmupSeconds);
  s = startShilkaSearch(s);
  s = setShilkaContact(s, true);
  s = tryShilkaAngleLock(s, 0);

  s = stepShilka(s, SHILKA_TUNING.rangeSolveSeconds / 2, 0);
  assert.equal(shilkaSolutionReady(s), false);
  assert.equal(shilkaPhase(s), SHILKA_PHASES.RANGE_SOLVING);

  s = stepShilka(s, SHILKA_TUNING.rangeSolveSeconds, 0);
  assert.equal(shilkaSolutionReady(s), true);
  assert.equal(shilkaPhase(s), SHILKA_PHASES.SOLUTION_READY);
});

test('bad aim breaks lock and clears the range solution', () => {
  let s = stepShilka(poweredState(), SHILKA_TUNING.warmupSeconds);
  s = startShilkaSearch(s);
  s = setShilkaContact(s, true);
  s = tryShilkaAngleLock(s, 0);
  s = stepShilka(s, SHILKA_TUNING.rangeSolveSeconds, 0);
  assert.equal(shilkaSolutionReady(s), true);

  s = stepShilka(s, 0.1, SHILKA_TUNING.lockBreakErrorDeg + 1);
  assert.equal(s.angleLocked, false);
  assert.equal(s.rangeSolution, 0);
  assert.equal(shilkaSolutionReady(s), false);
});

test('burst fire consumes ammo, raises heat, and refuses fire without a solution', () => {
  let s = stepShilka(poweredState(), SHILKA_TUNING.warmupSeconds);
  const refused = fireShilkaBurst(s, 0.5);
  assert.equal(refused.firing, false);
  assert.equal(refused.ammo, SHILKA_TUNING.ammoMax);

  s = startShilkaSearch(s);
  s = setShilkaContact(s, true);
  s = tryShilkaAngleLock(s, 0);
  s = stepShilka(s, SHILKA_TUNING.rangeSolveSeconds, 0);
  s = fireShilkaBurst(s, 0.5);

  assert.equal(s.firing, true);
  assert.ok(s.lastBurstRounds > 0);
  assert.equal(s.ammo, SHILKA_TUNING.ammoMax - s.lastBurstRounds);
  assert.ok(s.heat > 0);
  assert.equal(shilkaPhase(s), SHILKA_PHASES.FIRING);
});

test('long fire is clipped by burst limit, heat, and available ammo', () => {
  let s = stepShilka(poweredState(), SHILKA_TUNING.warmupSeconds);
  s = startShilkaSearch(s);
  s = setShilkaContact(s, true);
  s = tryShilkaAngleLock(s, 0);
  s = stepShilka(s, SHILKA_TUNING.rangeSolveSeconds, 0);

  s = { ...s, ammo: 10 };
  s = fireShilkaBurst(s, 5);
  assert.equal(s.lastBurstRounds, 10);
  assert.equal(s.ammo, 0);
  assert.equal(shilkaPhase(s), SHILKA_PHASES.EMPTY);

  s = { ...s, ammo: 100, heat: SHILKA_TUNING.firingHeatLimit };
  const hot = fireShilkaBurst(s, 0.5);
  assert.equal(hot.firing, false);
});

test('turning off a required switch drops search, contact, lock, and solution', () => {
  let s = stepShilka(poweredState(), SHILKA_TUNING.warmupSeconds);
  s = startShilkaSearch(s);
  s = setShilkaContact(s, true);
  s = tryShilkaAngleLock(s, 0);
  s = stepShilka(s, SHILKA_TUNING.rangeSolveSeconds, 0);
  assert.equal(shilkaSolutionReady(s), true);

  s = setShilkaSwitch(s, 'hydroDrive', false);
  assert.equal(s.searchMode, null);
  assert.equal(s.contact, false);
  assert.equal(s.angleLocked, false);
  assert.equal(s.rangeSolution, 0);
  assert.equal(shilkaPhase(s), SHILKA_PHASES.DRIVE_OFF);
});

test('computeShilkaKinematics: 3D range, azimuth datum, elevation, closure, and lead', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const target = { id: 'd1', pos: { x: 300, y: 400, z: 400 }, vel: { x: 40, y: 0, z: 0 } };
  const kin = computeShilkaKinematics(origin, target);
  assert.ok(Math.abs(kin.groundRangeM - 500) < 1e-9);
  assert.ok(Math.abs(kin.rangeM - Math.hypot(500, 400)) < 1e-9);
  assert.ok(Math.abs(kin.azimuthMils - dirToMils(300, 400)) < 1e-9);
  assert.ok(kin.elevationDeg > 38 && kin.elevationDeg < 39);
  assert.ok(Number.isFinite(kin.closureMps));
  assert.ok(Math.abs(kin.leadAzMils) > 0);
});

test('radar signal rejects out-of-envelope targets and accepts a drone in range', () => {
  let s = stepShilka(poweredState(), SHILKA_TUNING.warmupSeconds);
  s = startShilkaSearch(s, SHILKA_SEARCH_MODES.CIRCULAR);
  const origin = { x: 0, y: 0, z: 0 };
  const ok = { id: 'ok', pos: { x: 500, y: 240, z: 500 }, vel: { x: 35, y: 0, z: -10 }, rcs: 1 };
  const low = { id: 'low', pos: { x: 500, y: 3, z: 500 }, vel: { x: 0, y: 0, z: 0 }, rcs: 1 };
  assert.ok(shilkaRadarSignal(s, computeShilkaKinematics(origin, ok), ok) >= SHILKA_TUNING.minTrackSignal);
  assert.equal(shilkaRadarSignal(s, computeShilkaKinematics(origin, low), low), 0);
});

test('updateShilkaTrack picks a valid target and exposes fire-control values', () => {
  let s = stepShilka(poweredState(), SHILKA_TUNING.warmupSeconds);
  s = startShilkaSearch(s);
  const origin = { x: 0, y: 0, z: 0 };
  s = updateShilkaTrack(s, origin, [
    { id: 'bad', pos: { x: 0, y: 5, z: 600 }, vel: { x: 0, y: 0, z: 0 }, rcs: 1 },
    { id: 'good', pos: { x: 600, y: 250, z: 600 }, vel: { x: -30, y: 0, z: 0 }, rcs: 1.1 },
  ]);
  assert.equal(s.contact, true);
  assert.equal(s.selectedTargetId, 'good');
  s = tryShilkaAngleLock(s, 0);
  s = setShilkaRangeGate(s, s.targetKinematics.rangeM);
  s = stepShilka(s, SHILKA_TUNING.rangeSolveSeconds, 0);
  const fc = shilkaFireControl(s);
  assert.equal(fc.targetId, 'good');
  assert.ok(fc.rangeM > 800);
  assert.ok(Math.abs(fc.leadAzMils) > 0);
});

test('range gate must be close to the target before range solution grows', () => {
  let s = stepShilka(poweredState(), SHILKA_TUNING.warmupSeconds);
  s = startShilkaSearch(s);
  const origin = { x: 0, y: 0, z: 0 };
  const target = { id: 'gate', pos: { x: 700, y: 200, z: 700 }, vel: { x: 0, y: 0, z: -20 }, rcs: 1 };
  s = updateShilkaTrack(s, origin, [target]);
  s = tryShilkaAngleLock(s, 0);
  const exactRange = s.targetKinematics.rangeM;
  const wrong = stepShilka(setShilkaRangeGate(s, exactRange + SHILKA_TUNING.rangeGateCaptureM + 20), SHILKA_TUNING.rangeSolveSeconds, 0);
  assert.equal(wrong.rangeSolution, 0);
  const right = stepShilka(setShilkaRangeGate(s, exactRange), SHILKA_TUNING.rangeSolveSeconds, 0);
  assert.ok(right.rangeSolution > 0.9);
  assert.ok(right.rangeGateLocked);
});

test('burst grant is deterministic in seed and feeds physical projectile simulation', () => {
  let s = stepShilka(poweredState(), SHILKA_TUNING.warmupSeconds);
  s = startShilkaSearch(s);
  const origin = { x: 0, y: 0, z: 0 };
  const target = { id: 'hit', pos: { x: 0, y: 220, z: 950 }, vel: { x: 0, y: 0, z: 0 }, rcs: 1 };
  s = updateShilkaTrack(s, origin, [target]);
  s = tryShilkaAngleLock(s, 0);
  s = setShilkaRangeGate(s, s.targetKinematics.rangeM);
  s = stepShilka(s, SHILKA_TUNING.rangeSolveSeconds, 0);
  assert.equal(shilkaSolutionReady(s), true);

  const grantA = makeShilkaBurstGrant(s, 'shilka-1', origin, 1234, 0.25);
  const grantB = makeShilkaBurstGrant(s, 'shilka-1', origin, 1234, 0.25);
  assert.deepEqual(grantA, grantB);
  assert.ok(grantA.roundCount > 0);
  const dir = grantRoundDir(grantA, 0);
  const shot = simulateShilkaProjectile({ origin, dir, targetStart: target.pos, targetVel: target.vel, targetRadius: SHILKA_TUNING.droneHitRadiusM });
  assert.equal(shot.hit, true);
});

test('segmentSphereHit catches fast rounds crossing a small target between ticks', () => {
  const hit = segmentSphereHit({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 50 }, 1);
  assert.equal(hit.hit, true);
  const miss = segmentSphereHit({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }, { x: 5, y: 0, z: 50 }, 1);
  assert.equal(miss.hit, false);
});

test('deterministic drone route repeats with same seed and advances smoothly', () => {
  const a = makeShilkaDrone('d', 42);
  const b = makeShilkaDrone('d', 42);
  assert.deepEqual(a.pos, b.pos);
  const a2 = stepShilkaDrone(a, 10);
  const b2 = stepShilkaDrone(b, 10);
  assert.deepEqual(a2.pos, b2.pos);
  assert.notDeepEqual(a.pos, a2.pos);
});
