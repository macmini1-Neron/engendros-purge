import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutChips, pileLayout, CHIP_T, COL_CAP } from '../../src/poker/chiplayout.js';

test('pileLayout: one placement per chip, chips land ON each other (a tossed mound) with tilt, seeded-deterministic', () => {
  const set = { 20: 5, 10: 3, 5: 2 };
  const p = pileLayout(set, { seed: 7 });
  assert.equal(p.length, 10);                                  // exact count, 1:1 with the real chips
  assert.ok(p.some((c) => c.y > 0), 'some chips rest ON others → a real stacked heap, not a flat row');
  assert.ok(new Set(p.map((c) => c.y.toFixed(4))).size >= 2, 'multiple stacking heights (chips piled on chips)');
  // a stacked chip sits a clean WHOLE chip-thickness up (rests on the one below) — never interpenetrating
  const RISE = 0.0033 + 0.0006;
  for (const c of p) assert.ok(Math.abs(c.y / RISE - Math.round(c.y / RISE)) < 1e-3, 'rest height is a whole chip-thickness');
  assert.ok(p.every((c) => 'tiltX' in c && 'tiltZ' in c), 'pile chips carry a tilt (tossed, not a tidy tray)');
  assert.deepEqual(pileLayout(set, { seed: 7 }), p);           // deterministic for a seed
  assert.notDeepEqual(pileLayout(set, { seed: 9 }), p);
});

test('pileLayout: a bigger bet mounds TALLER, with a COMPACT, capped footprint', () => {
  const maxY = (a) => Math.max(...a.map((c) => c.y));
  const span = (a) => Math.max(...a.map((c) => Math.hypot(c.x, c.z)));
  const small = pileLayout({ 20: 3 }, { seed: 1 }), big = pileLayout({ 20: 50 }, { seed: 1 });
  assert.ok(maxY(big) > maxY(small) * 1.5, 'more chips → a taller mound');
  assert.ok(span(big) < CHIP_T * 30, 'footprint stays compact (radius is capped, never sprawls)'); // ≈0.099 m
});

test('exact real count: one placement per physical chip', () => {
  const set = { 100: 3, 25: 0, 5: 7 };
  assert.equal(layoutChips(set).length, 10); // 3 + 7, never approximated
});

test('column cap wraps a tall denom into extra columns, never drops chips', () => {
  const set = { 5: COL_CAP * 2 + 3 };
  const p = layoutChips(set);
  assert.equal(p.length, COL_CAP * 2 + 3);
  const cols = new Set(p.map((c) => c.x.toFixed(4)));
  assert.equal(cols.size, 3); // three columns: cap, cap, 3
});

test('chips in a column stack by thickness', () => {
  const p = layoutChips({ 5: 3 });
  assert.equal(p[0].y, 0);
  assert.ok(Math.abs(p[1].y - CHIP_T) < 1e-9 + 0.001); // one chip-thickness up (+gap)
});

test('jitter is seeded + deterministic (same seed → same offsets)', () => {
  const a = layoutChips({ 100: 5 }, { jitter: 0.002, seed: 42 });
  const b = layoutChips({ 100: 5 }, { jitter: 0.002, seed: 42 });
  assert.deepEqual(a, b);
  const c = layoutChips({ 100: 5 }, { jitter: 0.002, seed: 7 });
  assert.notDeepEqual(a, c);
});

test('layoutRef pins column positions: draining a denom does NOT shift the survivors (kills the jitter)', () => {
  const full = { 100: 3, 20: 4, 5: 6 };                          // 3 denoms → 3 columns
  const x100 = (s, opts) => layoutChips(s, opts).filter((c) => c.denom === 100).map((c) => c.x.toFixed(4));
  const fullX = x100(full, { layoutRef: full });
  // after the $5 column fully drains, the $100 column stays put when positions are pinned to `full`
  assert.deepEqual(x100({ 100: 3, 20: 4, 5: 0 }, { layoutRef: full }), fullX, '$100 column does not move when $5 drains');
  // control: WITHOUT layoutRef the survivor re-centres on the present columns → the old jitter
  assert.notDeepEqual(x100({ 100: 3, 20: 4 }, {}), fullX, 'naive layout shifts $100 (the bug being fixed)');
  // never renders MORE chips than chipSet, regardless of the (larger) ref
  assert.equal(layoutChips({ 100: 1, 20: 4, 5: 0 }, { layoutRef: full }).length, 5); // 1 + 4 + 0
});

test('layoutRef omitted ⇒ identical to ref===chipSet (backward compatible)', () => {
  const s = { 100: 3, 20: 4, 5: 6 };
  assert.deepEqual(layoutChips(s, { layoutRef: s }), layoutChips(s));
});
