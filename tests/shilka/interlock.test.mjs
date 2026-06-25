import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFireState, canFire } from '../../src/shilka-interlock.js';

// A fully-permitting state: every condition satisfied.
const base = () => createFireState({
  hatchClosed: true, cooling: true,
  elevationDeg: 20, angleLimit: 5,
  dataPresent: true, radarMode: 1,
  tsepFire: true, bankUpper: true, bankLower: true,
  station: 'cmd', avariynaya: false, gagReady: true, onMove: false,
});

test('all conditions met → fire permitted', () => {
  const r = canFire(base());
  assert.equal(r.ok, true);
  assert.deepEqual(r.blockedBy, []);
});

test('hatch open blocks — АВАРИЙНАЯ does NOT bypass', () => {
  const s = base(); s.hatchClosed = false; s.avariynaya = true;
  const r = canFire(s);
  assert.equal(r.ok, false);
  assert.ok(r.blockedBy.some(x => x.includes('ЛЮК')));
});

test('no cooling blocks — АВАРИЙНАЯ does NOT bypass', () => {
  const s = base(); s.cooling = false; s.avariynaya = true;
  const r = canFire(s);
  assert.equal(r.ok, false);
  assert.ok(r.blockedBy.some(x => x.includes('ОХЛАЖД')));
});

test('ЦЕПЬ СТРЕЛЬБЫ off blocks', () => {
  const s = base(); s.tsepFire = false;
  assert.equal(canFire(s).ok, false);
});

test('no bank enabled blocks', () => {
  const s = base(); s.bankUpper = false; s.bankLower = false;
  assert.equal(canFire(s).ok, false);
});

test('one bank enabled is enough', () => {
  const s = base(); s.bankUpper = false; s.bankLower = true;
  assert.equal(canFire(s).ok, true);
});

test('no station selected blocks', () => {
  const s = base(); s.station = null;
  assert.equal(canFire(s).ok, false);
});

test('below angle limit blocks; АВАРИЙНАЯ bypasses', () => {
  const s = base(); s.elevationDeg = 2; s.angleLimit = 30;
  const r = canFire(s);
  assert.equal(r.ok, false);
  assert.ok(r.blockedBy.some(x => x.includes('ОГРАНИЧЕНИЕ')));
  s.avariynaya = true;
  assert.equal(canFire(s).ok, true);
});

test('mode 1 needs ЕСТЬ ДАННЫЕ; АВАРИЙНАЯ bypasses', () => {
  const s = base(); s.dataPresent = false;
  assert.equal(canFire(s).ok, false);
  s.avariynaya = true;
  assert.equal(canFire(s).ok, true);
});

test('modes 2 and 3 also need ЕСТЬ ДАННЫЕ', () => {
  for (const m of [2, 3]) {
    const s = base(); s.radarMode = m; s.dataPresent = false;
    assert.equal(canFire(s).ok, false, `mode ${m} should require data`);
  }
});

test('modes 4 and 5 (optical/manual) do NOT need ЕСТЬ ДАННЫЕ', () => {
  for (const m of [4, 5]) {
    const s = base(); s.radarMode = m; s.dataPresent = false;
    assert.equal(canFire(s).ok, true, `mode ${m} should not require data`);
  }
});

test('on the move without gag ready blocks', () => {
  const s = base(); s.onMove = true; s.gagReady = false;
  const r = canFire(s);
  assert.equal(r.ok, false);
  assert.ok(r.blockedBy.some(x => x.includes('ГАГ')));
});

test('on the move with gag ready is fine', () => {
  const s = base(); s.onMove = true; s.gagReady = true;
  assert.equal(canFire(s).ok, true);
});

test('multiple failures all reported in blockedBy', () => {
  const s = base(); s.hatchClosed = false; s.cooling = false; s.tsepFire = false;
  const r = canFire(s);
  assert.equal(r.ok, false);
  assert.ok(r.blockedBy.length >= 3);
});
