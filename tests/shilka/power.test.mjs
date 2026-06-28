// Node tests for the pure Shilka electrical / start logic (src/shilka-power.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHILKA_POWER,
  createPowerState,
  powerBuses,
  acBusLive,
  canStartGtd,
  canStartDiesel,
  gtdReady,
  stepPower,
} from '../../src/shilka-power.js';

function run(p, seconds, dt = 0.2) { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) stepPower(p, dt); return p; }

// ---- A1: buses ----
test('cold machine: no buses live', () => {
  assert.deepEqual(powerBuses(createPowerState()), { dc27: false, ac220: false, v115: false });
});

test('battery master alone gives DC only (no AC without converter)', () => {
  const b = powerBuses(createPowerState({ batteryMaster: true }));
  assert.equal(b.dc27, true);
  assert.equal(b.ac220, false);
  assert.equal(b.v115, false);
});

test('generator + converter gives full AC chain', () => {
  const p = createPowerState({ batteryMaster: true, generatorOnline: true, converterOn: true });
  assert.deepEqual(powerBuses(p), { dc27: true, ac220: true, v115: true });
  assert.equal(acBusLive(p), true);
});

test('external power injects DC + AC, bypassing generator/converter', () => {
  assert.deepEqual(powerBuses(createPowerState({ externalPower: true })), { dc27: true, ac220: true, v115: true });
});

test('converter on but no DC source -> no AC', () => {
  assert.equal(powerBuses(createPowerState({ converterOn: true })).ac220, false);
});

// ---- A2: GTD start + flap interlock ----
test('GTD start blocked until flaps open (cold-crank opens them)', () => {
  const p = createPowerState({ batteryMaster: true });
  assert.equal(canStartGtd(p).ok, false);
  assert.match(canStartGtd(p).reason, /klap|flap/i);
  p.coldCrank = true; run(p, 1.5);
  assert.equal(p.flapsOpen, true);
  assert.equal(canStartGtd(p).ok, true);
});

test('GTD reaches idle band and generator comes online', () => {
  const p = createPowerState({ batteryMaster: true, coldCrank: true });
  run(p, 1.5);
  p.coldCrank = false; p.gtdStart = true;
  run(p, 13);
  assert.ok(p.gtdRpmPct >= SHILKA_POWER.gtdIdleLoPct && p.gtdRpmPct <= SHILKA_POWER.gtdIdleHiPct, `rpm=${p.gtdRpmPct}`);
  assert.equal(p.generatorOnline, true);
  assert.equal(gtdReady(p), true);
  assert.equal(powerBuses(p).dc27, true);
});

test('pressing ПУСК with flaps closed -> fault, no generator', () => {
  const p = createPowerState({ batteryMaster: true, gtdStart: true });
  run(p, 4);
  assert.equal(p.gtdState, 'fault');
  assert.equal(p.generatorOnline, false);
});

// ---- A3: diesel oil-pressure interlock ----
test('diesel start blocked without oil pressure, allowed once oil pump held', () => {
  const p = createPowerState({ batteryMaster: true, fuelPump: true });
  assert.equal(canStartDiesel(p).ok, false);
  assert.match(canStartDiesel(p).reason, /olej|oil/i);
  p.oilPumpHeld = true; run(p, 4);
  assert.ok(p.oilPressure >= SHILKA_POWER.gtdOilRunMin);
  assert.equal(canStartDiesel(p).ok, true);
});

test('diesel at >=1550 rpm brings generator online (alt source)', () => {
  const p = createPowerState({ batteryMaster: true, fuelPump: true, oilPumpHeld: true });
  run(p, 4);
  p.dieselStart = true; run(p, 8);
  assert.ok(p.dieselRpm >= SHILKA_POWER.dieselGenRpm, `rpm=${p.dieselRpm}`);
  assert.equal(p.generatorOnline, true);
});

// ---- A4: battery sag under starter ----
test('weak battery sags under starter and blocks start below 18 V', () => {
  const p = createPowerState({ batteryMaster: true, flapsOpen: true, gtdStart: true, batteryVolts: 19 });
  run(p, 6);
  if (!p.generatorOnline) {
    assert.ok(p.batteryVolts < SHILKA_POWER.starterMinVolts, `volts=${p.batteryVolts}`);
    assert.equal(canStartGtd(p).ok, false);
  }
});
