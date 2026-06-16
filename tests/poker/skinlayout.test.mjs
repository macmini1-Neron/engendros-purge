import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignSkins } from '../../src/poker/chiplayout.js';
import { HOUSE_SKIN } from '../../src/poker/chipbank.js';

// fake placements (only `.denom` matters to assignSkins)
const places = (spec) => spec.flatMap(([denom, n]) => Array.from({ length: n }, (_, i) => ({ denom, x: i, y: 0, z: 0 })));

test('assignSkins tags every placement with a skin, consuming per-(denom,skin) counts', () => {
  const out = assignSkins(places([[100, 3]]), { marx: { 100: 2 }, lenin: { 100: 1 } });
  const tally = {};
  for (const p of out) { assert.ok(p.skin, 'every placement got a skin'); tally[p.skin] = (tally[p.skin] || 0) + 1; }
  assert.deepEqual(tally, { marx: 2, lenin: 1 }, 'per-skin counts match the map');
});

test('assignSkins is deterministic + skin order is sorted with house last', () => {
  const map = { lenin: { 50: 1 }, marx: { 50: 1 }, [HOUSE_SKIN]: { 50: 1 } };
  const a = assignSkins(places([[50, 3]]), map).map((p) => p.skin);
  const b = assignSkins(places([[50, 3]]), map).map((p) => p.skin);
  assert.deepEqual(a, b, 'deterministic');
  assert.deepEqual(a, ['lenin', 'marx', HOUSE_SKIN], 'alphabetical ids, house last');
});

test('assignSkins preserves placement fields + handles multiple denoms independently', () => {
  const out = assignSkins(places([[100, 1], [50, 2]]), { marx: { 100: 1, 50: 1 }, lenin: { 50: 1 } });
  assert.equal(out.length, 3);
  assert.equal(out[0].denom, 100); assert.equal(out[0].skin, 'marx'); assert.equal(out[0].x, 0);
  const fifties = out.filter((p) => p.denom === 50).map((p) => p.skin).sort();
  assert.deepEqual(fifties, ['lenin', 'marx']);
});

test('assignSkins falls back to house when the queue underflows (defensive)', () => {
  const out = assignSkins(places([[100, 2]]), { marx: { 100: 1 } }); // map short by one
  assert.equal(out[0].skin, 'marx');
  assert.equal(out[1].skin, HOUSE_SKIN);
});
