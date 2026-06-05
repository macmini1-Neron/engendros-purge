import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec } from '../../src/props/spec.js';

const valid = () => ({
  id: 'demo', category: 'furniture', target: 'voxel',
  parts: [{ op: 'bevelBox', id: 'top', args: { w: 1, h: 0.04, d: 0.6 }, at: [0, 0.7, 0], mat: 'woodMid', src: 'dossier#top' }],
});

test('a well-formed spec validates', () => {
  assert.equal(validateSpec(valid()), true);
});

test('a dimensional part WITHOUT src is rejected (no invented sizes)', () => {
  const s = valid(); delete s.parts[0].src;
  assert.throws(() => validateSpec(s), /provenance|src/i);
});

test('raw hex in mat is rejected — palette names only', () => {
  const s = valid(); s.parts[0].mat = '#ff8800';
  assert.throws(() => validateSpec(s), /raw hex/i);
});

test('unknown operator is rejected', () => {
  const s = valid(); s.parts[0].op = 'teapot';
  assert.throws(() => validateSpec(s), /unknown operator/i);
});

test('unknown material is rejected', () => {
  const s = valid(); s.parts[0].mat = 'plutonium';
  assert.throws(() => validateSpec(s), /unknown material/i);
});

test('missing required arg is rejected', () => {
  const s = valid(); delete s.parts[0].args.h;
  assert.throws(() => validateSpec(s), /missing arg 'h'/);
});

test('missing id and empty parts are rejected', () => {
  assert.throws(() => validateSpec({ parts: [] }), /parts|id/);
});
