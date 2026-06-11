// spec.test.mjs — validator plumbing: dossier resolution, law 9 fixtures-skip, law 12 propRef.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, resolveDossierKey } from '../../src/buildings/spec.js';

const SMOKE = JSON.parse(readFileSync(new URL('../../buildings/_smoke/spec.json', import.meta.url), 'utf8'));

test('resolveDossierKey: exact dotted path + deep search for the final segment', () => {
  const d = { specifications: { walls: { thickness_mm: 510, src: 'x' } }, era: '1950s' };
  assert.equal(resolveDossierKey(d, 'dossier#specifications.walls.thickness_mm'), true);
  assert.equal(resolveDossierKey(d, 'dossier#thickness_mm'), true, 'deep search finds the leaf key');
  assert.equal(resolveDossierKey(d, 'dossier#nonexistent_key'), false);
});

test('law 9: a sourced spec resolves against its dossier; junk keys fail', () => {
  const spec = structuredClone(SMOKE);
  spec.id = 'real-house';
  for (const p of spec.parts) p.src = 'dossier#walls.thickness_mm';
  const dossier = { walls: { thickness_mm: 300 } };
  assert.deepEqual(validate(spec, { dossier }).errors, []);
  for (const p of spec.parts) p.src = 'dossier#invented_number';
  const res = validate(spec, { dossier });
  assert.ok(res.errors.some((e) => e.includes('does not resolve')));
});

test('law 9: a sourced spec without any dossier is rejected', () => {
  const spec = structuredClone(SMOKE);
  spec.id = 'real-house';
  for (const p of spec.parts) p.src = 'dossier#walls.thickness_mm';
  assert.ok(validate(spec).errors.some((e) => e.includes('no dossier')));
});

const PROPS = {
  hasModel: (id) => id === 'desk-soviet',
  getSpec: () => ({ footprint: { w: 1.4, h: 0.78, d: 0.7 } }),
};

test('law 12: unknown prop, scale fudge, missing anchor zone, doorway blockage', () => {
  const base = structuredClone(SMOKE);
  base.anchorZones = [{ x: -2, z: -1.5, w: 2.2, d: 1.6 }];
  base.parts.push({ id: 'desk', op: 'propRef', args: { model: 'desk-soviet' }, at: [-2, 0, -1.5] });

  assert.deepEqual(validate(base, { props: PROPS }).errors, [], 'a well-placed prop passes');

  const unknown = structuredClone(base);
  unknown.parts.at(-1).args.model = 'ghost-prop';
  assert.ok(validate(unknown, { props: PROPS }).errors.some((e) => e.includes('not a registered modelgen model')));

  const scaled = structuredClone(base);
  scaled.parts.at(-1).args.scale = 0.4;
  assert.ok(validate(scaled, { props: PROPS }).errors.some((e) => e.includes('scale fudge')));

  const outside = structuredClone(base);
  outside.parts.at(-1).at = [2.5, 0, 1.5];
  assert.ok(validate(outside, { props: PROPS }).errors.some((e) => e.includes('does not fit any anchorZone')));

  const blocking = structuredClone(base);
  blocking.anchorZones = [{ x: 0, z: 2.0, w: 3, d: 2 }];
  blocking.parts.at(-1).at = [0, 0, 2.0];                       // square in front of the N door
  assert.ok(validate(blocking, { props: PROPS }).errors.some((e) => e.includes('blocks the')));
});

test('law 12: without an injected resolver, props are an INFO, not silently ignored', () => {
  const spec = structuredClone(SMOKE);
  spec.parts.push({ id: 'desk', op: 'propRef', args: { model: 'desk-soviet' }, at: [0, 0, 0] });
  const res = validate(spec);
  assert.equal(res.errors.length, 0);
  assert.ok(res.infos.some((m) => m.includes('unchecked')));
});
