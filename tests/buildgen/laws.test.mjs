// laws.test.mjs — every RED fixture trips its law at the expected LEVEL, and the smoke
// fixture sails through. The (fixture → level + message-substring) table IS the contract:
// if a validator message changes, change it here consciously.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validate, validateSpec } from '../../src/buildings/spec.js';

const FIX = new URL('./fixtures/', import.meta.url);
const load = (n) => JSON.parse(readFileSync(new URL(`${n}.spec.json`, FIX), 'utf8'));
const SMOKE = JSON.parse(readFileSync(new URL('../../buildings/_smoke/spec.json', import.meta.url), 'utf8'));

// fixture → { level, includes }
const EXPECT = {
  'red-mm-units':             { level: 'errors', includes: 'MILLIMETRES' },
  'red-over-maxdim':          { level: 'errors', includes: 'exceeds the 60 m building limit' },
  'red-thin-wall':            { level: 'errors', includes: '< 0.2 m' },
  'red-detail-on-shell':      { level: 'errors', includes: 'bypass' },
  'red-missing-floor':        { level: 'errors', includes: 'storey 1 has no covering floorSlab' },
  'red-open-top':             { level: 'errors', includes: 'roof does not close the top' },
  'red-out-of-footprint':     { level: 'errors', includes: 'overflows footprint' },
  'red-no-doorway':           { level: 'errors', includes: 'no walkable entrance' },
  'red-one-exit-interior':    { level: 'errors', includes: '≥ 2 exits' },
  'red-tall-step':            { level: 'errors', includes: '> 0.62 m step-up' },
  'red-tiny-door':            { level: 'errors', includes: 'too small for the player' },
  'red-raw-hex':              { level: 'errors', includes: 'raw hex' },
  'red-no-seed':              { level: 'errors', includes: 'spec.seed' },
  'red-missing-src':          { level: 'errors', includes: 'provenance' },
  'red-low-ceiling-furniture':{ level: 'errors', includes: '< 2.6 m' },
  'red-no-glass-intent':      { level: 'errors', includes: 'glass:true' },
  'red-rot45-collider':       { level: 'errors', includes: 'only [0, k·90, 0]' },
  'red-zfight':               { level: 'errors', includes: 'z-fight' },
  'red-blocked-path':         { level: 'warns',  includes: 'unreachable' },
  'red-collider-budget':      { level: 'warns',  includes: 'colliders > 32 budget' },
};

test('every fixture file has an expectation and vice versa', () => {
  const files = readdirSync(FIX).filter((f) => f.endsWith('.spec.json')).map((f) => f.replace('.spec.json', ''));
  assert.deepEqual(files.sort(), Object.keys(EXPECT).sort());
});

for (const [name, exp] of Object.entries(EXPECT)) {
  test(`${name} → ${exp.level} containing "${exp.includes}"`, () => {
    const res = validate(load(name));
    const hits = res[exp.level].filter((m) => m.includes(exp.includes));
    assert.ok(hits.length, `expected ${exp.level} containing "${exp.includes}" — got errors=${JSON.stringify(res.errors)} warns=${JSON.stringify(res.warns)}`);
    if (exp.level === 'warns') {
      assert.equal(res.errors.length, 0, `WARN-level fixture must not also ERROR: ${JSON.stringify(res.errors)}`);
    }
  });
}

test('the smoke fixture passes clean: 0 errors, 0 warns', () => {
  const res = validate(SMOKE);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.warns, []);
});

test('validateSpec throws a joined message on errors (the interp hard gate)', () => {
  assert.throws(() => validateSpec(load('red-thin-wall')), /single-pixel walls/);
  assert.equal(validateSpec(SMOKE), true);
});
