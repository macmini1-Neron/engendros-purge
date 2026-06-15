import test from 'node:test';
import assert from 'node:assert/strict';
import { GFX_PRESETS, presetConfig, adaptiveStep } from '../../src/graphics.js';

test('presets define all four levers, ordered cheapest→richest', () => {
  for (const name of ['Low', 'Medium', 'High']) {
    const c = presetConfig(name);
    assert.equal(typeof c.renderScale, 'number');
    assert.ok(c.renderScale > 0 && c.renderScale <= 1);
    assert.ok([0, 1024, 2048, 4096].includes(c.shadowQ));
    assert.ok(c.drawDist >= 0);
    assert.ok(c.aa === 0 || c.aa === 1);
  }
  assert.ok(presetConfig('High').renderScale >= presetConfig('Low').renderScale);
  assert.ok(presetConfig('High').shadowQ >= presetConfig('Low').shadowQ);
});

test('presetConfig falls back to High for an unknown name', () => {
  assert.deepEqual(presetConfig('nonsense'), GFX_PRESETS.High);
});

test('adaptiveStep lowers scale when frames are too slow', () => {
  const next = adaptiveStep(1.0, 40, { targetMs: 16.7 });
  assert.ok(next < 1.0);
  assert.ok(next >= 0.5);
});

test('adaptiveStep raises scale when there is headroom', () => {
  const next = adaptiveStep(0.7, 8, { targetMs: 16.7 });
  assert.ok(next > 0.7);
  assert.ok(next <= 1.0);
});

test('adaptiveStep holds steady inside the dead-band (no thrash)', () => {
  const next = adaptiveStep(0.85, 17, { targetMs: 16.7 });
  assert.equal(next, 0.85);
});

test('adaptiveStep clamps to [min,max]', () => {
  assert.equal(adaptiveStep(0.5, 100, { targetMs: 16.7 }), 0.5);
  assert.equal(adaptiveStep(1.0, 1, { targetMs: 16.7 }), 1.0);
});
