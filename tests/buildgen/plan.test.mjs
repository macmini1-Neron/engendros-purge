// plan.test.mjs — the compiler: expansion, opening wiring, colliders, rot, budget stats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planBuild } from '../../src/buildings/plan.js';

const SMOKE = JSON.parse(readFileSync(new URL('../../buildings/_smoke/spec.json', import.meta.url), 'utf8'));

test('smoke spec compiles: expected prim/collider counts, zero errors', () => {
  const out = planBuild(SMOKE);
  assert.deepEqual(out.errors, []);
  // shell: N(door→3) + S(2 windows→5) + W(1) + E(1) + base(1) = 11 boxes
  // + threshold 1 + window frames 8 + panes 2 + roof 1 + sign 1 = 24 prims
  assert.equal(out.stats.primCount, 24);
  assert.equal(out.stats.colliderCount, 12, '11 shell + 1 roof slab');
  assert.ok(out.stats.materials.includes('brickRed') && out.stats.materials.includes('glassPane'));
  assert.ok(out.stats.tris > 0 && out.stats.tris < 1000);
});

test('every collider sits inside the footprint AABB (small face-detail tolerance)', () => {
  const out = planBuild(SMOKE);
  const { w, d } = SMOKE.footprint;
  for (const c of out.colliders) {
    assert.ok(c.min[0] >= -w / 2 - 0.01 && c.max[0] <= w / 2 + 0.01, `${c.part} x`);
    assert.ok(c.min[2] >= -d / 2 - 0.01 && c.max[2] <= d / 2 + 0.01, `${c.part} z`);
    assert.ok(c.min[1] >= -0.01, `${c.part} sinks`);
  }
});

test('part-level collide:false strips the colliders', () => {
  const spec = structuredClone(SMOKE);
  spec.parts.find((p) => p.id === 'roof').collide = false;
  const out = planBuild(spec);
  assert.equal(out.stats.colliderCount, 11, 'roof slab no longer collides');
});

test('repeat macro expands into stepped copies', () => {
  const out = planBuild({
    id: '_t', footprint: { w: 10, h: 4, d: 10 }, storeys: [{ y: 0, h: 3 }],
    parts: [{ op: 'repeat', args: { count: 3, step: [2, 0, 0], part: { op: 'column', args: { w: 0.4, d: 0.4, h: 3 }, at: [-2, 0, 0], mat: 'concrete' } } }],
  });
  assert.deepEqual(out.errors, []);
  assert.equal(out.stats.primCount, 3);
  assert.deepEqual(out.prims.map((c) => c.x), [-2, 0, 2]);
});

test('rot: 45° rejected; [0,90,0] swaps box dims exactly and keeps the collider honest', () => {
  const mk = (rot) => planBuild({
    id: '_t', footprint: { w: 10, h: 4, d: 10 }, storeys: [{ y: 0, h: 3 }],
    parts: [{ op: 'interiorWall', args: { len: 4, h: 3, t: 0.2, axis: 'x' }, at: [0, 0, 0], rot, mat: 'concrete' }],
  });
  assert.ok(mk([0, 45, 0]).errors.some((e) => e.includes('only [0, k·90, 0]')));
  const out = mk([0, 90, 0]);
  assert.deepEqual(out.errors, []);
  const c = out.colliders[0];
  assert.ok(Math.abs((c.max[0] - c.min[0]) - 0.2) < 1e-9 && Math.abs((c.max[2] - c.min[2]) - 4) < 1e-9, '90° swap is exact');
});

test('collide on an angled-roof prim is rejected (AABB only)', () => {
  const out = planBuild({
    id: '_t', footprint: { w: 8, h: 5, d: 6 }, storeys: [{ y: 0, h: 3 }],
    parts: [{ op: 'gableRoof', args: { rise: 1.2 }, collide: true, mat: 'corrugatedTin' }],
  });
  assert.ok(out.errors.some((e) => e.includes("collide on a 'prism'")));
});

test('tri estimate arithmetic: box 12, pane 2, cyl 4·seg', () => {
  const out = planBuild({
    id: '_t', footprint: { w: 10, h: 14, d: 10 }, storeys: [{ y: 0, h: 3 }],
    parts: [
      { op: 'column', args: { w: 0.4, d: 0.4, h: 3 }, mat: 'concrete' },
      { op: 'mast', args: { r: 0.1, h: 8 }, mat: 'concrete' },
    ],
  });
  assert.equal(out.stats.tris, 12 + 4 * 8, 'column box + mast cyl(seg 8)');
});
