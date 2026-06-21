import test from 'node:test';
import assert from 'node:assert/strict';
import { inThicket, foliageFade } from '../../src/foliage.js';

// box helper: an AABB flagged thicket (ground foliage that slows) or not
const box = (minx, minz, miny, maxx, maxz, maxy, thicket = true) =>
  ({ min: { x: minx, z: minz, y: miny }, max: { x: maxx, z: maxz, y: maxy }, thicket });

test('inThicket: a body standing inside a low bush is in thicket', () => {
  const bush = box(-1, -1, 0, 1, 1, 1.4);                  // ~1.4 m bush at the origin
  // player feet 0 → head 1.7 overlaps the bush in Y, and (0,0) is inside the footprint
  assert.equal(inThicket([bush], 0, 0, 0, 1.7), true);
});

test('inThicket: ★ a HIGH canopy box does NOT slow a ground body (the Y-gate)', () => {
  // a sapling/low thicket that floats overhead (8–30 m). A ground body must NOT register.
  const high = box(-6, -6, 8, 6, 6, 30);
  assert.equal(inThicket([high], 0, 0, 0, 1.7), false);    // feet 0..head 1.7 never reaches y=8
  // but a body whose head pokes into it (e.g. on a ledge at y=7.5) does count
  assert.equal(inThicket([high], 0, 0, 7.5, 9.2), true);
});

test('inThicket: ★ a tall tree CROWN (foliage but not thicket) never slows', () => {
  // a grown crown is foliage (shoot/conceal) but NOT thicket — its wide low-dipping AABB must not slow.
  const crown = { min: { x: -11, z: -11, y: 0.5 }, max: { x: 11, z: 11, y: 19 }, foliage: true }; // no thicket flag
  assert.equal(inThicket([crown], 8, 0, 1.6, 3.3), false); // standing 8 m from a willow trunk → NOT slowed
});

test('inThicket: outside the XZ footprint = not in thicket', () => {
  const bush = box(-1, -1, 0, 1, 1, 1.4);
  assert.equal(inThicket([bush], 5, 0, 0, 1.7), false);
  assert.equal(inThicket([bush], 0, 5, 0, 1.7), false);
});

test('inThicket: a SOLID (non-thicket) box is ignored', () => {
  const wall = box(-1, -1, 0, 1, 1, 3, false);             // thicket:false → wood/wall
  assert.equal(inThicket([wall], 0, 0, 0, 1.7), false);
});

test('inThicket: first matching thicket box wins among many', () => {
  const boxes = [box(-1, -1, 0, 1, 1, 3, false), box(10, 10, 0, 12, 12, 2), box(-2, -2, 0, 2, 2, 2)];
  assert.equal(inThicket(boxes, 0, 0, 0, 1.7), true);      // the third box covers the origin
});

test('foliageFade: 0 at/below near, 1 at/above far, monotone smoothstep between', () => {
  assert.equal(foliageFade(0.2, 0.4, 2.2), 0);             // at the lens → dissolved
  assert.equal(foliageFade(0.4, 0.4, 2.2), 0);             // exactly near
  assert.equal(foliageFade(2.2, 0.4, 2.2), 1);             // exactly far → solid
  assert.equal(foliageFade(5.0, 0.4, 2.2), 1);             // far away → solid
  const mid = foliageFade(1.3, 0.4, 2.2);
  assert.ok(mid > 0 && mid < 1);
  // monotone increasing
  let prev = -1;
  for (let d = 0.4; d <= 2.2; d += 0.2) { const a = foliageFade(d, 0.4, 2.2); assert.ok(a >= prev); prev = a; }
});
