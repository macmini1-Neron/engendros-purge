import { test } from 'node:test';
import assert from 'node:assert/strict';
import { value } from '../../src/poker/chipbank.js';
import { colorUp } from '../../src/poker/colorup.js';

test('color-up is value-neutral for the player and the float together', () => {
  const set = { 5: 23 }; // 115 in twenty-three white chips
  const float = { 100: 5, 50: 5, 10: 5, 5: 0 };
  const { set: up, float: f2 } = colorUp(set, float);
  assert.equal(value(up) + value(f2), value(set) + value(float)); // conserved
  assert.ok(up[5] < 23); // fewer small chips
});

test('color-up never raises a denom it cannot back from the float', () => {
  const set = { 5: 4 }; // 20, but float has no 10/20 to give
  const float = {};
  const { set: up } = colorUp(set, float);
  assert.deepEqual(up, { 5: 4 }); // unchanged when float cannot supply larger chips
});
