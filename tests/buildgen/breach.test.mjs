// breach.test.mjs — wall breach segmentation: piece counts, ~SEG_TARGET sizing, stable unique
// ids, area conservation vs the wall solid, and corner-stub structural tagging.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock, ctx } from './_mock.mjs';
import { planBuild } from '../../src/buildings/plan.js';
import { shellBox, SEG_TARGET } from '../../src/buildings/operators/shell.js';

// boxes belonging to one face's breach pieces (exclude base slab)
const facePieces = (calls, face) => calls.filter((c) => c.pid && c.pid.startsWith(`${face}:`));

test('a solid wall is subdivided into round(L/SEG_TARGET) breach pieces', () => {
  const b = mock();
  shellBox(b, { wall: 0.3 }, ctx());        // 8×6, no openings
  assert.equal(facePieces(b.calls, 'N').length, Math.round(8 / SEG_TARGET));      // 5
  assert.equal(facePieces(b.calls, 'W').length, Math.round((6 - 0.6) / SEG_TARGET)); // 3
});

test('segW arg overrides the breach width', () => {
  const b = mock();
  shellBox(b, { wall: 0.3, segW: 4 }, ctx());     // coarse pieces
  assert.equal(facePieces(b.calls, 'N').length, Math.round(8 / 4));   // 2
});

test('breach pieces tile the wall exactly — Σ piece widths == wall length (area conservation)', () => {
  const b = mock();
  shellBox(b, { wall: 0.3 }, ctx());
  const n = facePieces(b.calls, 'N');
  const sum = n.reduce((s, c) => s + c.w, 0);     // N runs along X ⇒ width is the u-extent
  assert.ok(Math.abs(sum - 8) < 1e-9, `N pieces span ${sum}, expected 8`);
});

test('breach ids are unique and match ${face}:seg${k}', () => {
  const b = mock();
  shellBox(b, { wall: 0.3 }, ctx());
  const ids = b.calls.filter((c) => c.pid && /^[NSWE]:/.test(c.pid)).map((c) => c.pid);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate breach ids');
  assert.ok(ids.every((id) => /^[NSWE]:seg\d+$/.test(id)));
});

test('corner pieces (touching a wall end) are pinned structural; interior pieces inherit', () => {
  const b = mock();
  shellBox(b, { wall: 0.3 }, ctx());
  const n = facePieces(b.calls, 'N');               // seg0..seg4
  assert.equal(n[0].role, 'structural', 'west end');
  assert.equal(n[n.length - 1].role, 'structural', 'east end');
  for (let i = 1; i < n.length - 1; i++) assert.equal(n[i].role, undefined, `interior seg${i} inherits`);
});

test('breach segmentation is deterministic (no RNG → co-op replay safe)', () => {
  const run = () => { const b = mock(); shellBox(b, { wall: 0.3 }, ctx()); return b.calls.map((c) => [c.pid, c.x, c.w, c.role]); };
  assert.deepEqual(run(), run());
});

test('intent.destructible:false skips subdivision (one box per wall segment)', () => {
  const spec = { id: '_t', footprint: { w: 8, h: 3.2, d: 6 }, storeys: [{ y: 0, h: 3 }],
    intent: { destructible: false }, materials: { wall: 'brickRed', floor: 'concrete', roof: 'corrugatedTin' },
    parts: [{ id: 'shell', op: 'shellBox', args: { wall: 0.3 } }, { id: 'roof', op: 'flatRoof', args: { t: 0.2 } }] };
  const out = planBuild(spec);
  const walls = out.prims.filter((p) => p.part.startsWith('shell:') && p.part !== 'shell:base');
  assert.equal(walls.length, 4, 'one box per wall (no breach pieces)');
});
