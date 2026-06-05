import test from 'node:test';
import assert from 'node:assert/strict';
import { planBuild } from '../../src/props/plan.js';

const spec = {
  id: 'demo', footprint: { w: 1, h: 0.7, d: 0.6 },
  parts: [
    { op: 'bevelBox', id: 'top', args: { w: 1, h: 0.04, d: 0.6 }, at: [0, 0.7, 0], mat: 'woodMid', src: 'd#1' },
    { op: 'drawerStack', id: 'p', args: { w: 0.42, h: 0.7, d: 0.66, count: 3 }, at: [-0.42, 0, 0], mat: 'woodMid', rig: 'drawer1', src: 'd#2' },
  ],
  rig: [{ name: 'drawer1', pivot: [-0.42, 0.4, 0], axis: 'z', type: 'slide' }],
};

test('planBuild resolves tones, maps at→origin, passes rig + footprint', () => {
  const plan = planBuild(spec);
  assert.equal(plan.id, 'demo');
  assert.equal(plan.ops.length, 2);
  assert.deepEqual(plan.ops[0].origin, { x: 0, y: 0.7, z: 0 });
  assert.equal(plan.ops[0].rig, null);
  assert.equal(plan.ops[1].rig, 'drawer1');
  assert.match(plan.ops[0].tones.mid, /^#[0-9a-fA-F]{6}$/);
  assert.equal(plan.rig[0].name, 'drawer1');
  assert.deepEqual(plan.footprint, { w: 1, h: 0.7, d: 0.6 });
});

test('a missing at defaults to origin 0,0,0', () => {
  const plan = planBuild({ id: 'x', parts: [{ op: 'plate', args: { w: 1, d: 1 }, mat: 'steel', src: 'd#1' }] });
  assert.deepEqual(plan.ops[0].origin, { x: 0, y: 0, z: 0 });
});
