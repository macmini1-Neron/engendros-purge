// tests/console/core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/console-core.js';

test('tokenize: strips one leading slash and splits on whitespace', () => {
  assert.deepEqual(tokenize('/summon grunt 1 2 3'), ['summon', 'grunt', '1', '2', '3']);
});
test('tokenize: works without a leading slash', () => {
  assert.deepEqual(tokenize('tp ~ ~ ~'), ['tp', '~', '~', '~']);
});
test('tokenize: collapses runs of spaces and trims', () => {
  assert.deepEqual(tokenize('   give   money   500  '), ['give', 'money', '500']);
});
test('tokenize: empty / slash-only line ⇒ []', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('/'), []);
});
