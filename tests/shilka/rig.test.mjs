import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyShilkaPart, SHILKA_RIG_GROUPS } from '../../src/shilka-rig.js';

// (cx,cy,cz, sx,sy,sz) — centre + size in the model's loaded Y-up space
test('a low compact disc near the ground is a road wheel', () => {
  assert.equal(classifyShilkaPart(1.2, 0.45, -1.0, 0.22, 0.6, 0.6), 'wheel');
});
test('a long thin Z-axis tube at turret height is a gun barrel', () => {
  assert.equal(classifyShilkaPart(0.2, 1.3, -2.0, 0.18, 0.18, 1.8), 'gun');
});
test('a tall super-thin vertical is an antenna whip', () => {
  assert.equal(classifyShilkaPart(0.8, 1.4, 0.2, 0.08, 1.2, 0.08), 'antenna');
});
test('the rear-top drum is the radar dish', () => {
  assert.equal(classifyShilkaPart(-0.2, 1.9, 0.9, 0.9, 0.5, 0.7), 'radar');
});
test('a central compact mass above deck height is turret', () => {
  assert.equal(classifyShilkaPart(-0.22, 1.2, -0.1, 0.8, 0.6, 0.8), 'turret');
});
test('a big low body box is hull', () => {
  assert.equal(classifyShilkaPart(0, 0.5, 0, 2.4, 0.9, 4.0), 'hull');
});
test('every returned group is a known rig group', () => {
  for (const g of [classifyShilkaPart(0, 0.5, 0, 2, 1, 4), classifyShilkaPart(1.2, 0.45, -1, 0.22, 0.6, 0.6)]) {
    assert.ok(SHILKA_RIG_GROUPS.includes(g));
  }
});
