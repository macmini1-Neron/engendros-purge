import test from 'node:test';
import assert from 'node:assert/strict';
import { binFallenAABBs } from '../../src/destruct.js';

const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];   // identity matrixWorld (column-major)

// build a thin "log": points along a heading from the butt, tiny radius jitter around the centreline
function log(axis, len, r = 0.25, steps = 40, y = 0.3) {
  const p = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * len, cx = axis[0] * t, cz = axis[1] * t;
    // a square ring of 4 surface points per slice (so each slice has real cross-extent r)
    p.push(cx + r, y + r, cz, cx - r, y - r, cz, cx, y, cz + r, cx, y, cz - r);
  }
  return p;
}

test('binFallenAABBs: axis-aligned log → tight per-slice boxes, union spans the length', () => {
  const boxes = binFallenAABBs(log([0,1], 6), I, [0,1], [0,0], 1.0, 8);
  assert.ok(boxes.length >= 4 && boxes.length <= 8, `got ${boxes.length} bins`);
  // every slice hugs the log cross-section (x extent ≈ 2r = 0.5, never the whole length)
  for (const b of boxes) assert.ok((b.max[0]-b.min[0]) < 0.8, `slice too wide in x: ${b.max[0]-b.min[0]}`);
  // union covers the full 0..6 m run
  const zmin = Math.min(...boxes.map(b=>b.min[2])), zmax = Math.max(...boxes.map(b=>b.max[2]));
  assert.ok(zmin <= 0.01 && zmax >= 5.99, `union z ${zmin}..${zmax}`);
});

test('binFallenAABBs: DIAGONAL log hugs its heading (not one fat square)', () => {
  const d = Math.SQRT1_2, len = 6;
  const boxes = binFallenAABBs(log([d,d], len), I, [d,d], [0,0], 1.0, 8);
  // the naive single-AABB footprint of a 45° 6 m log is ~ (6d)² ≈ 18 m²; the binned slices must
  // sum to a small fraction of that — each slice is a short tight box following the diagonal.
  const naive = (len*d)*(len*d);
  const sum = boxes.reduce((s,b)=> s + (b.max[0]-b.min[0])*(b.max[2]-b.min[2]), 0);
  assert.ok(sum < naive*0.35, `binned footprint ${sum.toFixed(2)} should be ≪ naive ${naive.toFixed(2)}`);
});

test('binFallenAABBs: a side branch widens ONLY its own slice', () => {
  const p = log([0,1], 6);                       // straight log along +Z
  // a branch sticking out +X at z≈3 (one slice)
  for (let k=0;k<6;k++) p.push(0.4+k*0.3, 0.3, 3.0);
  const boxes = binFallenAABBs(p, I, [0,1], [0,0], 1.0, 8);
  const wide = boxes.filter(b => (b.max[0]-b.min[0]) > 1.0);
  assert.equal(wide.length, 1, 'exactly one slice widened by the branch');
  assert.ok(wide[0].min[2] <= 3.0 && wide[0].max[2] >= 3.0, 'the widened slice contains the branch z');
});

test('binFallenAABBs: deterministic (MP replay) + respects maxBins cap', () => {
  const p = log([0.3,0.95], 8);
  const a = binFallenAABBs(p, I, [0.3,0.95], [0,0], 0.5, 5);
  const b = binFallenAABBs(p, I, [0.3,0.95], [0,0], 0.5, 5);
  assert.deepEqual(a, b);
  assert.ok(a.length <= 5, `cap respected, got ${a.length}`);
});

test('binFallenAABBs: applies the matrix (translation offsets the boxes)', () => {
  const M = I.slice(); M[12] = 10; M[13] = 2; M[14] = -5;   // translate (+10,+2,-5)
  const boxes = binFallenAABBs(log([0,1], 4), M, [0,1], [10,-5], 1.0, 8);
  for (const b of boxes) {
    assert.ok(b.min[0] > 9 && b.max[0] < 11, 'x near 10');
    assert.ok(b.min[1] > 1.9, 'y lifted by +2');
    assert.ok(b.min[2] >= -5.3 && b.max[2] <= -0.7, 'z shifted by -5');
  }
});

test('binFallenAABBs: 2-D (crossBins>1) SPLITS a side-branch off the trunk (real gap)', () => {
  const p = log([0,1], 6);                       // straight bole along +Z, centred at x≈0
  for (let k=0;k<8;k++) p.push(1.2+k*0.2, 0.3, 3.0);   // a branch reaching out to x≈2.6 at z≈3
  const oneD = binFallenAABBs(p, I, [0,1], [0,0], 1.0, 8, 1);          // old behaviour: branch merges into its slice
  const twoD = binFallenAABBs(p, I, [0,1], [0,0], 1.0, 8, 3, 0.7);     // 2-D: branch becomes its own cell
  // 1-D merges trunk+branch → at least one box spans the full x reach (~ -0.25..2.85)
  assert.ok(oneD.some(b => (b.max[0]-b.min[0]) > 2.0), '1-D has a box bridging trunk→branch');
  // 2-D keeps the bole cells narrow (trunk hugged) — no box bridges the whole trunk→branch span
  assert.ok(twoD.every(b => (b.max[0]-b.min[0]) < 2.0), '2-D never bridges trunk→branch in one box');
  assert.ok(twoD.length > oneD.length, '2-D yields more, tighter cells');
  // and there IS a dedicated branch box out at x>1 with air between it and the trunk centre
  assert.ok(twoD.some(b => b.min[0] > 0.8), '2-D has a separate branch box offset from the trunk');
});

test('binFallenAABBs: crossBins=1 ≡ the 1-D default (back-compat)', () => {
  const p = log([0.2,0.97], 7);
  assert.deepEqual(binFallenAABBs(p, I, [0.2,0.97], [0,0], 1.0, 8),
                   binFallenAABBs(p, I, [0.2,0.97], [0,0], 1.0, 8, 1));
});

test('binFallenAABBs: degenerate input → empty', () => {
  assert.deepEqual(binFallenAABBs([], I, [0,1], [0,0]), []);
  assert.deepEqual(binFallenAABBs([1,2,3], I, [0,1], [0,0]), []);
});
