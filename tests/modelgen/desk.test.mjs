import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSpec } from '../../src/props/spec.js';
import { planBuild } from '../../src/props/plan.js';

const spec = JSON.parse(readFileSync(new URL('../../models/desk_soviet/spec.json', import.meta.url)));

test('the desk spec is valid (schema + provenance + palette)', () => {
  assert.equal(validateSpec(spec), true);
});

test('every part of the desk cites a provenance src', () => {
  for (const p of spec.parts) assert.ok(p.src, `part ${p.id} missing src`);
});

test('the desk plans without error and resolves tones', () => {
  const plan = planBuild(spec);
  assert.equal(plan.ops.length, spec.parts.length);
  for (const o of plan.ops) assert.match(o.tones.mid, /^#[0-9a-fA-F]{6}$/);
});
