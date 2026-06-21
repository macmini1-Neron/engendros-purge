// laws-destruct.test.mjs — destruction validator laws 15–18 (RED trips, GREEN passes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../src/buildings/spec.js';

// a minimal destructible shell+roof+door (passes the base laws); override parts/materials per test.
const base = (over = {}) => ({
  id: '_t', seed: 7, footprint: { w: 8, h: 3.2, d: 6 }, storeys: [{ y: 0, h: 3 }],
  intent: { enterable: true, role: 'cover', entrances: ['N'] },
  materials: { wall: 'brickRed', roof: 'corrugatedTin', trim: 'concrete', glass: 'glassPane', floor: 'concrete' },
  parts: [
    { id: 'shell', op: 'shellBox', args: { wall: 0.3 } },
    { id: 'door', op: 'doorway', args: { face: 'N', width: 1.6, height: 2.2 } },
    { id: 'roof', op: 'flatRoof', args: { t: 0.2 } },
  ],
  ...over,
});

const has = (arr, s) => arr.some((m) => m.includes(s));

test('law 15: a cladding wall with a no-phys material (signage) ERRORs', () => {
  const res = validate(base({ materials: { wall: 'signage', roof: 'corrugatedTin', trim: 'concrete', glass: 'glassPane', floor: 'concrete' } }));
  assert.ok(has(res.errors, 'no phys bridge'), JSON.stringify(res.errors));
});

test('law 15: brick walls pass (brick has a phys bridge)', () => {
  const res = validate(base());
  assert.ok(!has(res.errors, 'no phys bridge'));
});

test('law 16: corners:cladding with no columns ⇒ roof floats (ERROR at every corner)', () => {
  const res = validate(base({ parts: [
    { id: 'shell', op: 'shellBox', args: { wall: 0.3, corners: 'cladding' } },
    { id: 'door', op: 'doorway', args: { face: 'N', width: 1.6, height: 2.2 } },
    { id: 'roof', op: 'flatRoof', args: { t: 0.2 } },
  ] }));
  assert.ok(has(res.errors, 'no structural support to the roof'), JSON.stringify(res.errors));
});

test('law 16 GREEN: default corners:structural holds the roof', () => {
  const res = validate(base());
  assert.ok(!has(res.errors, 'no structural support'));
});

test('law 16 GREEN: corners:cladding + four corner columns holds the roof', () => {
  const C = (x, z, id) => ({ id, op: 'column', args: { w: 0.4, d: 0.4, h: 3 }, at: [x, 0, z], mat: 'concrete' });
  const res = validate(base({ parts: [
    { id: 'shell', op: 'shellBox', args: { wall: 0.3, corners: 'cladding' } },
    { id: 'door', op: 'doorway', args: { face: 'N', width: 1.6, height: 2.2 } },
    { id: 'roof', op: 'flatRoof', args: { t: 0.2 } },
    C(-3.6, -2.6, 'c0'), C(-3.6, 2.6, 'c1'), C(3.6, -2.6, 'c2'), C(3.6, 2.6, 'c3'),
  ] }));
  assert.ok(!has(res.errors, 'no structural support'), JSON.stringify(res.errors));
});

test('law 17 GREEN: a normal spec mints unique, well-formed destructible ids', () => {
  const res = validate(base());
  assert.ok(!has(res.errors, 'not unique') && !has(res.errors, 'malformed'));
});

test('law 18: an all-structural shell (no breakable part) WARNs inert', () => {
  const res = validate(base({ parts: [
    { id: 'shell', op: 'shellBox', args: { wall: 0.3 }, role: 'structural' },   // whole wall field structural
    { id: 'door', op: 'doorway', args: { face: 'N', width: 1.6, height: 2.2 } },
    { id: 'roof', op: 'flatRoof', args: { t: 0.2 } },
  ] }));
  assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
  assert.ok(has(res.warns, 'inert'), JSON.stringify(res.warns));
});

test('intent.destructible:false skips laws 15–18 entirely', () => {
  const res = validate(base({ intent: { enterable: true, role: 'cover', entrances: ['N'], destructible: false },
    materials: { wall: 'signage', roof: 'corrugatedTin', trim: 'concrete', glass: 'glassPane', floor: 'concrete' },
    parts: [
      { id: 'shell', op: 'shellBox', args: { wall: 0.3, corners: 'cladding' } },
      { id: 'door', op: 'doorway', args: { face: 'N', width: 1.6, height: 2.2 } },
      { id: 'roof', op: 'flatRoof', args: { t: 0.2 } },
    ] }));
  assert.ok(!has(res.errors, 'no phys bridge') && !has(res.errors, 'no structural support'), JSON.stringify(res.errors));
});
