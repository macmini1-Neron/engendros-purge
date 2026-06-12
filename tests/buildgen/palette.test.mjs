// palette.test.mjs — material table discipline (law 8 + law 14 texture caps).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_PALETTE, resolveMaterial, materialNames } from '../../src/buildings/palette.js';

test('every material has a kind and the full 5-tone set', () => {
  for (const [name, m] of Object.entries(BUILDING_PALETTE)) {
    assert.ok(['tiled', 'flat', 'glass', 'sign'].includes(m.kind), `${name}.kind`);
    for (const t of ['hi', 'mid', 'lo', 'slot', 'bright']) {
      assert.match(m.tones?.[t] ?? '', /^#[0-9a-f]{6}$/i, `${name}.tones.${t}`);
    }
  }
});

test('tiled materials carry a sane tile (0 < w,h < 5 m) and canvas ≤ 512', () => {
  for (const [name, m] of Object.entries(BUILDING_PALETTE)) {
    if (m.kind !== 'tiled') continue;
    assert.ok(m.tile.w > 0 && m.tile.w < 5 && m.tile.h > 0 && m.tile.h < 5, `${name}.tile`);
    assert.ok(m.canvas <= 512, `${name}.canvas exceeds the law-14 cap`);
    assert.equal(typeof m.tex, 'string', `${name}.tex names a generator`);
  }
});

test('raw hex and unknown names are rejected; known names resolve', () => {
  assert.throws(() => resolveMaterial('#ff0000'), /raw hex/);
  assert.throws(() => resolveMaterial('ff0000'), /raw hex/);
  assert.throws(() => resolveMaterial('marble'), /unknown material/);
  assert.equal(resolveMaterial('brickRed').kind, 'tiled');
  assert.ok(materialNames().includes('glassPane'));
});
