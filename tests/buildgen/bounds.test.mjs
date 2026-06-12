// bounds.test.mjs — footprint discipline (law 5): containment, fill, anchoring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partBounds, boundsOf, boundsErrors } from '../../src/buildings/bounds.js';

const SMOKE = JSON.parse(readFileSync(new URL('../../buildings/_smoke/spec.json', import.meta.url), 'utf8'));

test('smoke spec: bounds match the footprint, no errors', () => {
  const u = boundsOf(SMOKE);
  assert.ok(Math.abs(u.size.w - 8) < 0.15 && Math.abs(u.size.d - 6) < 0.15);
  assert.ok(Math.abs(u.size.h - 3.2) < 0.05, 'walls 3.0 + roof 0.2');
  assert.deepEqual(boundsErrors(SMOKE), []);
});

test('a far-flung landmark overflows the footprint → error', () => {
  const spec = structuredClone(SMOKE);
  spec.parts.push({ op: 'chimney', args: { rBase: 0.8, rTop: 0.5, h: 12 }, at: [9, 0, 0], mat: 'brickRed' });
  const errs = boundsErrors(spec);
  assert.ok(errs.some((e) => e.includes('overflows footprint')));
});

test('a footprint that vastly overstates the build → underfill error', () => {
  // No shellBox here on purpose — a shell always fills the footprint by construction
  // (its walls sit AT the footprint edges). Underfill catches lone-part specs.
  const errs = boundsErrors({
    id: '_t', footprint: { w: 30, h: 3, d: 30 },
    parts: [{ op: 'column', args: { w: 3, d: 3, h: 2.9 }, at: [0, 0, 0] }],
  });
  assert.ok(errs.some((e) => e.includes('under 55%')));
});

test('a building floating above y=0 → error', () => {
  const errs = boundsErrors({
    id: '_t', footprint: { w: 4, h: 3, d: 4 },
    parts: [{ op: 'column', args: { w: 3, d: 3, h: 2.8 }, at: [0, 0.5, 0] }],
  });
  assert.ok(errs.some((e) => e.includes('floats')));
});

test('partBounds applies 90° rot about the part origin (corner rotation)', () => {
  const p = { op: 'interiorWall', args: { len: 4, h: 3, t: 0.2, axis: 'x' }, at: [1, 0, 0], rot: [0, 90, 0] };
  const b = partBounds(p, { footprint: { w: 10, h: 4, d: 10 } });
  assert.ok(Math.abs((b.max[2] - b.min[2]) - 4) < 1e-9, 'length now runs along z');
  assert.ok(Math.abs((b.max[0] - b.min[0]) - 0.2) < 1e-9);
  assert.ok(Math.abs((b.min[0] + b.max[0]) / 2 - 1) < 1e-9, 'still centred on its at');
});

test('propRef does not drag the union (law 12 owns prop bounds)', () => {
  const spec = structuredClone(SMOKE);
  spec.parts.push({ op: 'propRef', args: { model: 'desk' }, at: [40, 0, 0] });
  assert.deepEqual(boundsErrors(spec), []);
});
