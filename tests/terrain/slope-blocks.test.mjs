import test from 'node:test';
import assert from 'node:assert/strict';
import { slopeBlocks } from '../../src/terrain.js';

const LIMIT = (Math.PI * 35) / 180; // 35°

test('blocks an uphill step into terrain steeper than the limit', () => {
  assert.equal(slopeBlocks(2.0, 2.5, (Math.PI * 45) / 180, LIMIT), true);
});

test('allows an uphill step onto a gentle slope', () => {
  assert.equal(slopeBlocks(2.0, 2.2, (Math.PI * 20) / 180, LIMIT), false);
});

test('allows moving downhill even on a steep face (slide off, do not scale)', () => {
  assert.equal(slopeBlocks(3.0, 2.0, (Math.PI * 60) / 180, LIMIT), false);
});

test('allows flat ground (no climb)', () => {
  assert.equal(slopeBlocks(0, 0, 0, LIMIT), false);
});

test('the eps guard ignores a negligible rise', () => {
  assert.equal(slopeBlocks(2.0, 2.00001, (Math.PI * 80) / 180, LIMIT), false);
});
