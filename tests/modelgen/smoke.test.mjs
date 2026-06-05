import test from 'node:test';
import assert from 'node:assert/strict';

test('node --test runs ESM .mjs', () => {
  assert.equal(1 + 1, 2);
});
