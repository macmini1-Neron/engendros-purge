import test from 'node:test';
import assert from 'node:assert/strict';
import { bevelBox, panel, plate, finSet, latticeBeam } from '../../src/props/operators/structural.js';
import { drawerStack, legs } from '../../src/props/operators/furniture.js';

// mock builder — records every box() call as [w,h,d,x,y,z,color,opts]
function mock() {
  const calls = [];
  return { calls, box: (...a) => calls.push(a), colorsUsed: () => calls.map((c) => c[6]) };
}
const T = { hi: '#1', mid: '#2', lo: '#3', slot: '#4', bright: '#5' };
const O = { x: 0, y: 0, z: 0 };

test('bevelBox emits body + lit top + shadow bottom (3 boxes)', () => {
  const b = mock();
  bevelBox(b, { w: 1, h: 0.5, d: 0.6 }, T, O);
  assert.equal(b.calls.length, 3);
  assert.ok(b.colorsUsed().includes(T.mid));
  assert.ok(b.colorsUsed().includes(T.bright));
  assert.ok(b.colorsUsed().includes(T.lo));
});

test('plate emits a single thin slab', () => {
  const b = mock();
  plate(b, { w: 1.2, d: 0.6 }, T, O);
  assert.equal(b.calls.length, 1);
});

test('panel emits body + top lip (2 boxes)', () => {
  const b = mock();
  panel(b, { w: 0.7, h: 0.4 }, T, O);
  assert.equal(b.calls.length, 2);
});

test('drawerStack emits carcass + count*(front+handle) = 1+2n', () => {
  const b = mock();
  drawerStack(b, { w: 0.42, h: 0.7, d: 0.66, count: 3 }, T, O);
  assert.equal(b.calls.length, 1 + 2 * 3);
});

test('legs emits 4 posts each with a lit cap (8 boxes)', () => {
  const b = mock();
  legs(b, { w: 1, d: 0.6, h: 0.7 }, T, O);
  assert.equal(b.calls.length, 8);
});

test('latticeBeam emits 4 chords + (bays+1)*4 + bays*2 members', () => {
  const b = mock();
  latticeBeam(b, { len: 8, w: 0.5, h: 0.5, bays: 4 }, T, O);
  assert.equal(b.calls.length, 4 + 5 * 4 + 4 * 2);   // 32
  assert.ok(b.calls.some((c) => c[7] && typeof c[7].rx === 'number'));  // diagonals are tilted
});

test('finSet emits count*steps rotated plates; outer plate is lit', () => {
  const b = mock();
  finSet(b, { count: 4, root: 1.2, span: 0.8, steps: 3, r0: 0.3 }, T, O);
  assert.equal(b.calls.length, 4 * 3);
  // every plate carries an rz rotation opt (cruciform placement)
  assert.ok(b.calls.every((c) => c[7] && typeof c[7].rz === 'number'));
  // the outermost plate of each fin uses the bright tone
  assert.ok(b.colorsUsed().includes(T.bright));
});
