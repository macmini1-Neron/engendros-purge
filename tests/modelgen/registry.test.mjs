import test from 'node:test';
import assert from 'node:assert/strict';
import { registerModel, getSpec, hasModel, listModels, _reset } from '../../src/props/registry-core.js';

test('register/get/has/list round-trip', () => {
  _reset();
  const spec = { id: 'desk_soviet', parts: [] };
  registerModel('desk_soviet', spec);
  assert.equal(hasModel('desk_soviet'), true);
  assert.equal(getSpec('desk_soviet'), spec);
  assert.deepEqual(listModels(), ['desk_soviet']);
});

test('getSpec returns null for an unknown id', () => {
  _reset();
  assert.equal(getSpec('nope'), null);
  assert.equal(hasModel('nope'), false);
});
