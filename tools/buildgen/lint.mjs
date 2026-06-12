#!/usr/bin/env node
// lint.mjs — the buildgen pre-flight. Runs the 14 laws over a building spec with its
// dossier and the modelgen prop registry (fs-based), and prints built size vs footprint
// + budget stats with diagnostic LEVELS:
//   ✗ ERROR → exit 1 (cannot be approved)
//   ⚠ WARN  → exit 0, but each warn needs a one-line justification in BUILD.md
//   ℹ INFO  → advisory
//
//   node tools/buildgen/lint.mjs buildings/_smoke
//   node tools/buildgen/lint.mjs --all
//
// Pure node (no three, no deps) — the same validator the browser uses.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from '../../src/buildings/spec.js';
import { boundsOf } from '../../src/buildings/bounds.js';
import { planBuild } from '../../src/buildings/plan.js';

const args = process.argv.slice(2);
if (args.length === 0) { console.error('usage: node tools/buildgen/lint.mjs <buildings/<id>|--all>'); process.exit(2); }

// law 12 resolver: modelgen props looked up straight from the models/ tree
const props = {
  hasModel: (id) => existsSync(join('models', id, 'spec.json')),
  getSpec: (id) => JSON.parse(readFileSync(join('models', id, 'spec.json'), 'utf8')),
};

const dirs = args[0] === '--all'
  ? readdirSync('buildings', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join('buildings', d.name))
  : args;

let failed = 0;
for (const dir of dirs) {
  const specPath = join(dir, 'spec.json');
  if (!existsSync(specPath)) { console.error(`✗ ${dir}: no spec.json`); failed++; continue; }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const isFixture = (spec.id || '').startsWith('_');

  let dossier = null;
  const dossierPath = spec.dossier ?? join(dir, 'ref', 'dossier.json');
  if (existsSync(dossierPath)) dossier = JSON.parse(readFileSync(dossierPath, 'utf8'));
  else if (!isFixture) { console.error(`✗ ${dir}: missing ${dossierPath} — research comes BEFORE the spec (no dossier, no dimensions)`); failed++; continue; }

  const res = validate(spec, { dossier: dossier ?? undefined, props });
  if (res.errors.length) {
    console.error(`✗ ${spec.id || dir}:\n${res.errors.map((l) => '  - ' + l).join('\n')}`);
    failed++;
  } else {
    const u = boundsOf(spec), f = spec.footprint;
    const stats = planBuild(spec).stats;
    const fill = (a, b) => `${(100 * a / b).toFixed(0)}%`;
    console.log(`✓ ${spec.id}: built ${u.size.w.toFixed(2)}×${u.size.h.toFixed(2)}×${u.size.d.toFixed(2)} m ` +
      `(footprint ${f.w}×${f.h}×${f.d} → fills ${fill(u.size.w, f.w)}/${fill(u.size.h, f.h)}/${fill(u.size.d, f.d)}), ` +
      `${spec.parts.length} parts, ${stats.colliderCount} colliders, ~${stats.tris} tris, ${stats.materials.length} materials`);
  }
  for (const w of res.warns) console.log(`  ⚠ ${w}  → justify in BUILD.md or fix`);
  for (const i of res.infos) console.log(`  ℹ ${i}`);
  const needs = [...(spec.needs || []), ...((dossier && dossier.needs) || [])];
  if (needs.length) console.log(`  ℹ needs[] (${needs.length}): ${needs[0]}${needs.length > 1 ? ` (+${needs.length - 1} more)` : ''}`);
}
process.exit(failed ? 1 : 0);
