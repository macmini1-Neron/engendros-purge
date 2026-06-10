import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partBounds, boundsOf, boundsErrors } from '../../src/props/bounds.js';
import { validateSpec } from '../../src/props/spec.js';

const slab = (over = {}) => ({
  id: 'b', footprint: { w: 1, h: 0.5, d: 0.6 },
  parts: [{ op: 'bevelBox', id: 's', args: { w: 1, h: 0.5, d: 0.6 }, at: [0, 0.25, 0], mat: 'steel', src: 'dossier#s' }],
  ...over,
});

test('partBounds: centre-anchored box at `at`', () => {
  const b = partBounds({ op: 'bevelBox', args: { w: 1, h: 0.5, d: 0.6 }, at: [0, 0.25, 0] });
  assert.deepEqual(b.min, [-0.5, 0, -0.3]);
  assert.deepEqual(b.max, [0.5, 0.5, 0.3]);
});

test('partBounds: floor-anchored drawerStack spans y 0..h and includes the proud handles', () => {
  const b = partBounds({ op: 'drawerStack', args: { w: 0.4, h: 0.7, d: 0.6, count: 3 }, at: [0, 0, 0] });
  assert.equal(b.min[1], 0);
  assert.equal(b.max[1], 0.7);
  assert.ok(b.max[2] > 0.3, 'handles stand proud of the front face');
});

test('partBounds: 90° Y rotation swaps the w/d extents', () => {
  const b = partBounds({ op: 'bevelBox', args: { w: 1, h: 0.2, d: 0.4 }, at: [0, 0, 0], rot: [0, 90, 0] });
  assert.ok(Math.abs(b.max[0] - 0.2) < 1e-9, `x extent becomes d/2 (got ${b.max[0]})`);
  assert.ok(Math.abs(b.max[2] - 0.5) < 1e-9, `z extent becomes w/2 (got ${b.max[2]})`);
});

test('boundsOf unions all parts', () => {
  const u = boundsOf({ parts: [
    { op: 'bevelBox', args: { w: 0.2, h: 0.2, d: 0.2 }, at: [-0.4, 0.1, 0] },
    { op: 'bevelBox', args: { w: 0.2, h: 0.2, d: 0.2 }, at: [0.4, 0.1, 0] },
  ] });
  assert.equal(u.size.w, 1.0);
  assert.equal(u.size.h, 0.2);
});

test('a part overflowing the footprint is reported', () => {
  const s = slab(); s.parts[0].args.w = 1.5;
  assert.deepEqual(boundsErrors(s).length, 1);
  assert.match(boundsErrors(s)[0], /overflows footprint\.w/);
});

test('a footprint much larger than the build is reported (footprint overstates)', () => {
  const s = slab(); s.parts[0].args.w = 0.3;
  assert.match(boundsErrors(s).join('\n'), /under 55%/);
});

test('a floor-anchored model floating above y=0 is reported', () => {
  const s = slab(); s.parts[0].at = [0, 0.6, 0];
  assert.match(boundsErrors(s).join('\n'), /floats .* above the floor/);
});

test('a model sinking below the floor is reported', () => {
  const s = slab(); s.parts[0].at = [0, 0.15, 0];
  assert.match(boundsErrors(s).join('\n'), /below the floor/);
});

test('an off-origin model is reported', () => {
  const s = slab(); s.parts[0].at = [0.4, 0.25, 0];
  assert.match(boundsErrors(s).join('\n'), /off-origin/);
});

test('anchor:center skips the floor rule', () => {
  const s = slab({ anchor: 'center' }); s.parts[0].at = [0, 0.6, 0];
  assert.equal(boundsErrors(s).filter((e) => /floor/.test(e)).length, 0);
});

test('anchor:free skips the origin-centering rules (manually-placed sub-assembly)', () => {
  const s = slab({ anchor: 'free', footprint: { w: 1, h: 0.5, d: 4 } });
  s.parts[0].args = { w: 1, h: 0.5, d: 3.8 }; s.parts[0].at = [0, 0.25, 1.9];   // lies along +Z like the s75 missile
  assert.deepEqual(boundsErrors(s), []);
});

// ── THE regression lock ─────────────────────────────────────────────────────
// The first unsupervised use of the harness authored this spec in MILLIMETRES
// (280 = 280 m wide), it built a box the size of a city block, the verify
// screenshot was pure white (the camera was inside it), and it still shipped
// behind a hand-tuned scale fudge in loot.js. The validator must never let a
// spec like this through again.
test('RED fixture: the original mm-unit DShK spec is rejected with a units error', () => {
  const broken = JSON.parse(readFileSync(new URL('./fixtures/dshk-mm-broken.spec.json', import.meta.url)));
  assert.throws(() => validateSpec(broken), (err) => {
    assert.match(err.message, /MILLIMETRES/);
    assert.match(err.message, /footprint/);          // it also never declared one
    assert.match(err.message, /not a dossier citation/); // and cited prose, not dossier keys
    return true;
  });
});
