#!/usr/bin/env node
// lint.mjs — the modelgen pre-flight. Validates a model's spec against its
// dossier (provenance keys must resolve), checks units/footprint/bounds, and
// prints the built size vs the declared footprint. Run it before EVERY viewer
// session and before calling any model done:
//
//   node tools/modelgen/lint.mjs models/dshk-ammo-box
//   node tools/modelgen/lint.mjs --all
//
// Pure node (no three, no deps) — same validators the browser uses.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateSpec } from '../../src/props/spec.js';
import { boundsOf } from '../../src/props/bounds.js';

const args = process.argv.slice(2);
if (args.length === 0) { console.error('usage: node tools/modelgen/lint.mjs <models/<id>|--all>'); process.exit(2); }

const dirs = args[0] === '--all'
  ? readdirSync('models', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join('models', d.name))
  : args;

let failed = 0;
for (const dir of dirs) {
  const specPath = join(dir, 'spec.json');
  if (!existsSync(specPath)) { console.error(`✗ ${dir}: no spec.json`); failed++; continue; }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const isFixture = (spec.id || '').startsWith('_');

  let dossier = null;
  const dossierPath = spec.dossier ?? join(dir, 'ref', 'dossier.json');   // spec.dossier may point at a shared dossier (s75_missile → s75_launcher's)
  if (existsSync(dossierPath)) dossier = JSON.parse(readFileSync(dossierPath, 'utf8'));
  else if (!isFixture) { console.error(`✗ ${dir}: missing ${dossierPath} — research comes BEFORE the spec (no dossier, no dimensions)`); failed++; continue; }

  try {
    validateSpec(spec, dossier ? { dossier } : {});
    const u = boundsOf(spec), f = spec.footprint;
    const fill = (a, b) => `${(100 * a / b).toFixed(0)}%`;
    console.log(`✓ ${spec.id}: built ${u.size.w.toFixed(3)}×${u.size.h.toFixed(3)}×${u.size.d.toFixed(3)} m ` +
      `(footprint ${f.w}×${f.h}×${f.d} → fills ${fill(u.size.w, f.w)}/${fill(u.size.h, f.h)}/${fill(u.size.d, f.d)}), ` +
      `${spec.parts.length} parts`);
    const needs = [...(spec.needs || []), ...((dossier && dossier.needs) || [])];
    if (needs.length) console.log(`  ⚠ needs[] (${needs.length}): ${needs[0]}${needs.length > 1 ? ` (+${needs.length - 1} more)` : ''}`);
  } catch (e) {
    console.error(`✗ ${spec.id || dir}:\n${String(e.message).split('\n').map((l) => '  ' + l).join('\n')}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
