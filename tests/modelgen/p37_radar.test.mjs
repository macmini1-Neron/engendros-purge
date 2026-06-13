import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSpec } from '../../src/props/spec.js';
import { planBuild } from '../../src/props/plan.js';
import { P37_RADAR_SPEC } from '../../src/props/models/p37_radar.js';

// The shipped P-37 «Bar Lock» radar — a complex, pivot-rigged, 5-new-op artifact players actually load.
// Its bounds checks are skipped at validate time (rigged spec), and it lives in two places (the canonical
// models/p37_radar/spec.json + the game-bundled embedded copy in p37_radar.js, "keep in sync"). These
// tests make a spec regression a loud node-test failure instead of a silent warn-and-disappear in game.
const spec = JSON.parse(readFileSync(new URL('../../models/p37_radar/spec.json', import.meta.url)));
const dossier = JSON.parse(readFileSync(new URL('../../models/p37_radar/ref/dossier.json', import.meta.url)));

test('the P-37 radar spec is valid (schema + every src resolves in the dossier + palette)', () => {
  assert.equal(validateSpec(spec, { dossier }), true);
});

test('every dimensioned P-37 part cites a provenance src', () => {
  for (const p of spec.parts) assert.ok(p.op, `part ${p.id} missing op`);
  // dimensioned parts must carry a src — validateSpec above enforces this, but assert the spec is non-trivial
  assert.ok(spec.parts.length >= 60, `expected the full ~72-part radar, got ${spec.parts.length}`);
});

test('the P-37 radar plans without error and resolves tones', () => {
  const plan = planBuild(spec);
  assert.equal(plan.ops.length, spec.parts.length);
  for (const o of plan.ops) assert.match(o.tones.mid, /^#[0-9a-fA-F]{6}$/);
});

test('the game-embedded P37_RADAR_SPEC stays in sync with models/p37_radar/spec.json', () => {
  // compare only the runtime-relevant fields (the embedded copy intentionally drops needs[]/dossier)
  assert.equal(P37_RADAR_SPEC.id, spec.id);
  assert.deepEqual(P37_RADAR_SPEC.footprint, spec.footprint);
  assert.deepEqual(P37_RADAR_SPEC.rig, spec.rig);
  assert.deepEqual(P37_RADAR_SPEC.parts, spec.parts);
});
