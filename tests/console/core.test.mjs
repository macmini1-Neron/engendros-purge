// tests/console/core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/console-core.js';
import { parseNum, parseInt_, parseCoord } from '../../src/console-core.js';

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

test('parseNum: parses floats, throws on garbage', () => {
  assert.equal(parseNum('3.5'), 3.5);
  assert.equal(parseNum('-12'), -12);
  assert.throws(() => parseNum('abc'), /Expected number/);
});
test('parseInt_: integers only', () => {
  assert.equal(parseInt_('7'), 7);
  assert.throws(() => parseInt_('7.5'), /Expected integer/);
});
test('parseCoord: Minecraft tilde is relative to base; bare number is absolute', () => {
  assert.equal(parseCoord('~', 100), 100);     // ~ = base
  assert.equal(parseCoord('~5', 100), 105);    // ~5 = base+5
  assert.equal(parseCoord('~-3', 100), 97);    // ~-3 = base-3
  assert.equal(parseCoord('42', 100), 42);     // absolute
});
