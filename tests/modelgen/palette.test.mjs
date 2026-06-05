import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMaterial, materialNames, PALETTE } from '../../src/props/palette.js';

test('resolveMaterial returns 5 voxel tones for a known material', () => {
  const t = resolveMaterial('woodMid');
  assert.deepEqual(Object.keys(t).sort(), ['bright', 'hi', 'lo', 'mid', 'slot']);
  for (const k of ['hi', 'mid', 'lo', 'slot', 'bright']) assert.match(t[k], /^#[0-9a-fA-F]{6}$/);
});

test('resolveMaterial returns the glb backend on request', () => {
  const g = resolveMaterial('steel', 'glb');
  assert.equal(g.rgb.length, 3);
  assert.equal(typeof g.rough, 'number');
});

test('resolveMaterial throws on unknown material', () => {
  assert.throws(() => resolveMaterial('unobtainium'), /unknown material/);
});

test('every palette entry has both voxel (5 tones) and glb backends', () => {
  for (const name of materialNames()) {
    const m = PALETTE[name];
    assert.deepEqual(Object.keys(m.voxel).sort(), ['bright', 'hi', 'lo', 'mid', 'slot'], name);
    assert.ok(Array.isArray(m.glb.rgb) && m.glb.rgb.length === 3, name);
  }
});
