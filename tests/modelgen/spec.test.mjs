import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec, resolveDossierKey } from '../../src/props/spec.js';

const valid = () => ({
  id: 'demo', category: 'furniture', target: 'voxel',
  footprint: { w: 1, h: 0.74, d: 0.6 },
  parts: [{ op: 'bevelBox', id: 'top', args: { w: 1, h: 0.74, d: 0.6 }, at: [0, 0.37, 0], mat: 'woodMid', src: 'dossier#top' }],
});

test('a well-formed spec validates', () => {
  assert.equal(validateSpec(valid()), true);
});

test('a dimensional part WITHOUT src is rejected (no invented sizes)', () => {
  const s = valid(); delete s.parts[0].src;
  assert.throws(() => validateSpec(s), /provenance|src/i);
});

test('prose src is rejected — provenance must cite a dossier key', () => {
  const s = valid(); s.parts[0].src = 'TA072 scale model kit (Tank Model)';
  assert.throws(() => validateSpec(s), /not a dossier citation/);
});

test('a spec without footprint is rejected', () => {
  const s = valid(); delete s.footprint;
  assert.throws(() => validateSpec(s), /footprint/);
});

test('millimetre-scale dimensions are rejected with a units hint', () => {
  const s = valid(); s.footprint = { w: 280, h: 140, d: 140 };
  s.parts[0].args = { w: 280, h: 140, d: 140 }; s.parts[0].at = [0, 70, 0];
  assert.throws(() => validateSpec(s), /MILLIMETRES/);
});

test('oversized (but sub-mm-scale) dimensions hit the prop limit', () => {
  const s = valid(); s.footprint.w = 14; s.parts[0].args.w = 14;
  assert.throws(() => validateSpec(s), /exceeds the 12 m prop limit/);
});

test('spec.maxDim lifts the limit for genuinely oversized props', () => {
  const s = valid(); s.maxDim = 16; s.footprint.w = 14; s.parts[0].args.w = 14;
  assert.equal(validateSpec(s), true);
});

test('pivot-rigged specs skip the static bounds check (pose moves the geometry)', () => {
  const s = valid();
  s.rig = [{ name: 'arm', pivot: [0, 0.5, 0], axis: 'x', pose: -0.9, type: 'hinge' }];
  s.parts[0].rig = 'arm';
  s.parts[0].at = [0, 0.37, 3];          // would fail off-origin/overflow if bounds ran
  assert.equal(validateSpec(s), true);
});

test('malformed rot is rejected (degrees triple)', () => {
  const s = valid(); s.parts[0].rot = [0, 'ninety', 0];
  assert.throws(() => validateSpec(s), /DEGREES/);
});

test('non-integer count is rejected', () => {
  const s = valid();
  s.parts.push({ op: 'drawerStack', id: 'p', args: { w: 0.4, h: 0.7, d: 0.55, count: 2.5 }, at: [0, 0, 0], mat: 'woodMid', src: 'dossier#p' });
  assert.throws(() => validateSpec(s), /count must be an integer/);
});

test('with a dossier provided, src keys must resolve into it', () => {
  const s = valid();
  const dossier = { facts: { top: { w_mm: 1000, src: 'somewhere real' } } };
  assert.equal(validateSpec(s, { dossier }), true);            // dossier#top deep-resolves to facts.top
  s.parts[0].src = 'dossier#imaginary_fact';
  assert.throws(() => validateSpec(s, { dossier }), /does not resolve/);
});

test('resolveDossierKey: exact dotted paths and deep key search', () => {
  const d = { specifications: { box: { length_mm: 280 } } };
  assert.equal(resolveDossierKey(d, 'dossier#specifications.box'), true);
  assert.equal(resolveDossierKey(d, 'dossier#box'), true);     // deep search
  assert.equal(resolveDossierKey(d, 'dossier#width'), false);
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
