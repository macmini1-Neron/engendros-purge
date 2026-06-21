// phys-bridge.test.mjs — the buildgen visual→physics material bridge (materials.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_PALETTE } from '../../src/buildings/palette.js';
import { MATERIALS } from '../../src/destruct.js';
import { physKeyOf, physSpecOf, isDestructible } from '../../src/buildings/materials.js';

test('every palette material declares a phys field (null or a real MATERIALS key)', () => {
  for (const [name, entry] of Object.entries(BUILDING_PALETTE)) {
    assert.ok('phys' in entry, `palette '${name}' is missing a phys field`);
    if (entry.phys != null) {
      assert.ok(MATERIALS[entry.phys], `palette '${name}' bridges to '${entry.phys}' absent from MATERIALS`);
    }
  }
});

test('signage is the only non-destructible material', () => {
  assert.equal(physKeyOf('signage'), null);
  assert.equal(isDestructible('signage'), false);
  assert.equal(physSpecOf('signage'), null);
  for (const name of Object.keys(BUILDING_PALETTE)) {
    if (name === 'signage') continue;
    assert.ok(isDestructible(name), `expected '${name}' to be destructible`);
  }
});

test('phys bridge maps to the expected hardness', () => {
  assert.equal(physKeyOf('brickRed'), 'brick');
  assert.equal(physKeyOf('brickGrey'), 'brick');
  assert.equal(physKeyOf('concretePanel'), 'concrete');
  assert.equal(physKeyOf('corrugatedTin'), 'sheetmetal');
  assert.equal(physKeyOf('plaster'), 'plaster');
  assert.equal(physKeyOf('wood'), 'wood');
  assert.equal(physKeyOf('glassPane'), 'glass');
  assert.equal(physSpecOf('brickRed').tier, 3);
  assert.equal(physSpecOf('plaster').hp, 40);
  assert.equal(physSpecOf('glassPane').tier, 0);
});

test('an unknown palette name throws (a typo cannot become silently indestructible)', () => {
  assert.throws(() => physKeyOf('brik'), /unknown palette material/);
  assert.throws(() => physSpecOf('nope'), /unknown palette material/);
  assert.throws(() => isDestructible('xyz'), /unknown palette material/);
});
