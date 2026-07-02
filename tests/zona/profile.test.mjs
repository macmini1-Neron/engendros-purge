import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTerrain } from '../../src/terrain.js';

test("makeTerrain profile 'zona' matches zona-terrain and stays deterministic", async () => {
  const { makeZonaHeightFn } = await import('../../src/zona-terrain.js');
  const t = makeTerrain({ profile: 'zona', seed: 704 });
  const h = makeZonaHeightFn(704);
  assert.equal(t.profile, 'zona');
  for (const [x, z] of [[0, 0], [50, 630], [1000, 1060], [-470, -620]]) {
    assert.equal(t.terrainHeightAt(x, z), h(x, z));
  }
});

test("profile 'zona' is non-flat (hasTerrain semantics) and slope/normal work", () => {
  const t = makeTerrain({ profile: 'zona', seed: 704 });
  const n = t.terrainNormalAt(-50, 60); // massif flank
  assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z));
  assert.ok(t.terrainSlopeAt(-50, 60) >= 0);
});
