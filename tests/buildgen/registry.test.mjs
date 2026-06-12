// registry.test.mjs — building catalog + the module-purity structural guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerBuilding, getBuildingSpec, hasBuilding, listBuildings, _reset } from '../../src/buildings/registry-core.js';

test('registry-core: register / get / has / list / reset', () => {
  _reset();
  assert.equal(hasBuilding('x'), false);
  registerBuilding('x', { id: 'x' });
  assert.equal(hasBuilding('x'), true);
  assert.deepEqual(getBuildingSpec('x'), { id: 'x' });
  assert.deepEqual(listBuildings(), ['x']);
  assert.equal(getBuildingSpec('nope'), null);
  _reset();
  assert.deepEqual(listBuildings(), []);
});

// PURITY GUARD: the validator/compiler layer must stay node-runnable and decoupled —
// no `three`, no `util.js` (which imports three), and no modelgen internals except the
// two allowed browser-side couplings (which live in interp.js/registry.js only).
test('pure modules import neither three nor util.js nor src/props', () => {
  const root = fileURLToPath(new URL('../../src/buildings/', import.meta.url));
  const browserOnly = new Set(['interp.js', 'registry.js', 'textures.js']);
  const files = [
    ...readdirSync(root).filter((f) => f.endsWith('.js') && !browserOnly.has(f)).map((f) => root + f),
    ...readdirSync(root + 'operators').filter((f) => f.endsWith('.js')).map((f) => root + 'operators/' + f),
  ];
  assert.ok(files.length >= 14, `expected the full pure module set, found ${files.length}`);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/from\s+['"]three['"]/.test(src), `${f} imports three`);
    assert.ok(!/from\s+['"].*util\.js['"]/.test(src), `${f} imports util.js (THREE-coupled)`);
    assert.ok(!/from\s+['"].*\/props\//.test(src), `${f} imports modelgen internals`);
  }
});

// The browser modules may couple ONLY to the two allowed modelgen surfaces.
test('interp.js touches only voxel-interp.buildSpec + registry-core from modelgen', () => {
  const root = fileURLToPath(new URL('../../src/buildings/', import.meta.url));
  const src = readFileSync(root + 'interp.js', 'utf8');
  const propImports = [...src.matchAll(/from\s+['"](\.\.\/props\/[^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(propImports.sort(), ['../props/registry-core.js', '../props/voxel-interp.js']);
});
