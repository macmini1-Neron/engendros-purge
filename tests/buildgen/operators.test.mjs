// operators.test.mjs — shell/massing operators emit the right prims in the right places.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock, ctx } from './_mock.mjs';
import { shellBox, floorSlab, interiorWall, column, stairs, BASE_SLAB_T } from '../../src/buildings/operators/shell.js';
import { faceFrame, faceToWorld, rotYSteps, assertYaw, specTopY } from '../../src/buildings/operators/_math.js';

const volOverlap = (a, b) => {
  const amin = [a.x - a.w / 2, a.y - a.h / 2, a.z - a.d / 2], amax = [a.x + a.w / 2, a.y + a.h / 2, a.z + a.d / 2];
  const bmin = [b.x - b.w / 2, b.y - b.h / 2, b.z - b.d / 2], bmax = [b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2];
  return [0, 1, 2].every((i) => amin[i] < bmax[i] - 1e-9 && bmin[i] < amax[i] - 1e-9);
};

test('faceFrame: contract is +Z=north, +X=east; corner policy N/S full w, E/W d−2t', () => {
  const fp = { w: 8, h: 4, d: 6 };
  const N = faceFrame('N', fp, 0.3);
  assert.equal(N.axis, 'x'); assert.equal(N.L, 8); assert.ok(N.fixed > 0, 'N wall on +Z side');
  const S = faceFrame('S', fp, 0.3);
  assert.ok(S.fixed < 0, 'S wall on −Z side');
  const E = faceFrame('E', fp, 0.3);
  assert.equal(E.axis, 'z'); assert.ok(Math.abs(E.L - 5.4) < 1e-9, 'E wall length d − 2t'); assert.ok(E.fixed > 0, 'E wall on +X side');
  // u=0 mapping: N/S start west (−x), E/W start south (−z)
  assert.deepEqual(faceToWorld(N, 0, 1).map((v) => Math.round(v * 10) / 10), [-4, 1, 2.9]);
  assert.deepEqual(faceToWorld(E, 0, 1).map((v) => Math.round(v * 10) / 10), [3.9, 1, -2.7]);
});

test('shellBox, doorless → 4 wall boxes + base slab = 5 prims, all collidable, no volume overlap', () => {
  const b = mock();
  shellBox(b, { wall: 0.3 }, ctx());
  assert.equal(b.errors.length, 0);
  assert.equal(b.calls.length, 5);
  assert.ok(b.calls.every((c) => c.kind === 'box' && c.collide === true));
  const walls = b.calls.slice(0, 4);
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
    assert.ok(!volOverlap(walls[i], walls[j]), `walls ${i} and ${j} overlap in volume (corner policy broken)`);
  }
  // base slab is INNER (w−2t × d−2t) and floor-anchored at y=0
  const slab = b.calls[4];
  assert.ok(Math.abs(slab.w - 7.4) < 1e-9 && Math.abs(slab.d - 5.4) < 1e-9);
  assert.ok(Math.abs(slab.y - BASE_SLAB_T / 2) < 1e-9, 'slab bottom touches y=0');
});

test('shellBox + N door → N wall in 3 segments (7 prims total); gap is where the door is', () => {
  const b = mock();
  const door = { u0: 3.2, u1: 4.8, v0: 0, v1: 2.2, id: 'door' };
  shellBox(b, { wall: 0.3 }, ctx({ openings: (face) => (face === 'N' ? [door] : []) }));
  assert.equal(b.errors.length, 0);
  assert.equal(b.calls.length, 7);
  // nothing solid occupies the door volume (centre of the gap, at the N wall plane)
  const f = faceFrame('N', { w: 8, d: 6 }, 0.3);
  const [gx, gy, gz] = faceToWorld(f, 4.0, 1.0);
  for (const c of b.calls) {
    const inX = Math.abs(gx - c.x) < c.w / 2, inY = Math.abs(gy - c.y) < c.h / 2, inZ = Math.abs(gz - c.z) < c.d / 2;
    assert.ok(!(inX && inY && inZ), 'a wall segment fills the doorway — the gap is not real');
  }
});

test('shellBox surfaces cutWall errors through the recorder', () => {
  const b = mock();
  shellBox(b, { wall: 0.3 }, ctx({ openings: (face) => (face === 'N' ? [{ u0: 7, u1: 9, v0: 0, v1: 2, id: 'off' }] : []) }));
  assert.ok(b.errors.some((e) => e.includes('outside the wall')));
});

test('floorSlab storey 1 → one slab whose TOP sits at the storey base elevation', () => {
  const b = mock();
  floorSlab(b, { storey: 1 }, ctx({ storeys: [{ y: 0, h: 3 }, { y: 3, h: 3 }], topY: 6 }));
  assert.equal(b.calls.length, 1);
  const s = b.calls[0];
  assert.ok(Math.abs((s.y + s.h / 2) - 3) < 1e-9, 'slab top at y=3');
  assert.ok(Math.abs(s.w - 7.4) < 1e-9, 'inner width (w − 2·wallT)');
});

test('floorSlab with stairwell hole → 4-piece split, hole stays open', () => {
  const b = mock();
  floorSlab(b, { storey: 1, hole: { x: 2, z: 1, w: 1.4, d: 2.6 } }, ctx({ storeys: [{ y: 0, h: 3 }, { y: 3, h: 3 }], topY: 6 }));
  assert.equal(b.calls.length, 4);
  for (const c of b.calls) {
    const inX = Math.abs(2 - c.x) < c.w / 2, inZ = Math.abs(1 - c.z) < c.d / 2;
    assert.ok(!(inX && inZ), 'a slab piece covers the stairwell hole');
  }
});

test('floorSlab storey 0 → recorder error (storey 0 is the shellBox base)', () => {
  const b = mock();
  floorSlab(b, { storey: 0 }, ctx());
  assert.equal(b.calls.length, 0);
  assert.ok(b.errors[0].includes('storey 0'));
});

test('stairs → N stacked full-height boxes, top = steps·rise, marching the dir', () => {
  const b = mock();
  stairs(b, { steps: 5, rise: 0.3, run: 0.3, width: 1.2, dir: 'N' }, ctx());
  assert.equal(b.calls.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(b.calls[i].h - (i + 1) * 0.3) < 1e-9, `step ${i} is full height from the base`);
    assert.ok(Math.abs((b.calls[i].y + b.calls[i].h / 2) - (i + 1) * 0.3) < 1e-9, 'step top at (i+1)·rise');
  }
  assert.ok(b.calls[4].z > b.calls[0].z, 'marches north (+Z)');
  assert.ok(b.calls.every((c) => c.collide === true));
});

test('column + interiorWall counts and anchoring', () => {
  const b = mock();
  column(b, { w: 0.4, d: 0.4, h: 3 }, ctx({ origin: { x: 1, y: 0, z: -2 } }));
  interiorWall(b, { len: 4, h: 3, t: 0.2, axis: 'x' }, ctx({ origin: { x: 0, y: 0, z: 0 } }));
  assert.equal(b.calls.length, 2);
  assert.ok(Math.abs(b.calls[0].y - 1.5) < 1e-9, 'column floor-anchored');
  assert.ok(Math.abs(b.calls[1].w - 4) < 1e-9 && Math.abs(b.calls[1].d - 0.2) < 1e-9, 'interior wall axis x');
});

test('yaw helpers: 45 throws; 90 swaps extents exactly; 270 = 90 applied three times', () => {
  assert.throws(() => assertYaw(45), /multiple of 90/);
  assert.equal(assertYaw(90), 1);
  assert.equal(assertYaw(-90), 3);
  const min = [-1, 0, -2], max = [3, 2, 4];
  const r90 = rotYSteps(1, min, max);
  assert.deepEqual(r90, { min: [-2, 0, -3], max: [4, 2, 1] });
  let r = { min, max };
  for (let i = 0; i < 3; i++) r = rotYSteps(1, r.min, r.max);
  assert.deepEqual(rotYSteps(3, min, max), r, '270° equals three 90° steps');
  assert.deepEqual(rotYSteps(0, min, max), { min, max }, '0° is identity');
});

test('specTopY: last storey y+h; defaults to 3 m', () => {
  assert.equal(specTopY({ storeys: [{ y: 0, h: 3.2 }, { y: 3.2, h: 3.0 }] }), 6.2);
  assert.equal(specTopY({}), 3.0);
});
