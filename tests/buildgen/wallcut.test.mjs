// wallcut.test.mjs — the wall-segmentation module that makes "openings are real gaps" true.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cutWall } from '../../src/buildings/wallcut.js';

const area = (s) => (s.u1 - s.u0) * (s.v1 - s.v0);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// The three property invariants — any decomposition bug trips at least one.
function invariants(wall, openings, res) {
  const segArea = sum(res.segments.map(area));
  const openArea = sum(openings.map(area).map((a) => a));
  assert.ok(Math.abs(segArea + res.dropped - (wall.L * wall.H - openArea)) < 1e-9,
    `area conservation: segments ${segArea} + dropped ${res.dropped} != wall ${wall.L * wall.H} − openings ${openArea}`);
  for (let i = 0; i < res.segments.length; i++) for (let j = i + 1; j < res.segments.length; j++) {
    const a = res.segments[i], b = res.segments[j];
    const overlap = a.u0 < b.u1 - 1e-9 && b.u0 < a.u1 - 1e-9 && a.v0 < b.v1 - 1e-9 && b.v0 < a.v1 - 1e-9;
    assert.ok(!overlap, `segments ${i} and ${j} overlap`);
  }
  for (const s of res.segments) for (const o of openings) {
    const overlap = s.u0 < o.u1 - 1e-9 && o.u0 < s.u1 - 1e-9 && s.v0 < o.v1 - 1e-9 && o.v0 < s.v1 - 1e-9;
    assert.ok(!overlap, 'a segment intersects an opening');
  }
}

test('no openings → one segment equal to the wall', () => {
  const res = cutWall({ L: 8, H: 3 }, []);
  assert.equal(res.errors.length, 0);
  assert.equal(res.segments.length, 1);
  assert.deepEqual(res.segments[0], { u0: 0, u1: 8, v0: 0, v1: 3 });
});

test('one floor-level door → 3 segments (2 jambs + lintel), world._wall semantics', () => {
  const wall = { L: 8, H: 3 };
  const door = [{ u0: 3.2, u1: 4.8, v0: 0, v1: 2.2, id: 'door' }];
  const res = cutWall(wall, door);
  assert.equal(res.errors.length, 0);
  assert.equal(res.segments.length, 3);
  const jambs = res.segments.filter((s) => s.v0 === 0);
  const lintel = res.segments.filter((s) => s.v0 > 0);
  assert.equal(jambs.length, 2);
  assert.equal(lintel.length, 1);
  assert.ok(Math.abs(jambs[0].u1 - 3.2) < 1e-9 && Math.abs(jambs[1].u0 - 4.8) < 1e-9, 'jambs touch the door edges');
  assert.ok(Math.abs(lintel[0].v0 - 2.2) < 1e-9 && Math.abs(lintel[0].u1 - lintel[0].u0 - 8) < 1e-9, 'lintel spans the full wall above the door');
  invariants(wall, door, res);
});

test('one window → 4 segments (sill band, 2 jambs, lintel band)', () => {
  const wall = { L: 8, H: 3 };
  const win = [{ u0: 3.4, u1: 4.6, v0: 0.9, v1: 2.3, id: 'win' }];
  const res = cutWall(wall, win);
  assert.equal(res.errors.length, 0);
  assert.equal(res.segments.length, 4);
  invariants(wall, win, res);
});

test('k uniform windows → k+3 segments (vertical merge prevents 3k+1 collider blowup)', () => {
  const wall = { L: 12, H: 3 };
  const k = 5;
  const w = 1.2, gap = (wall.L - k * w) / (k + 1);
  const wins = Array.from({ length: k }, (_, i) => ({
    u0: gap * (i + 1) + w * i, u1: gap * (i + 1) + w * i + w, v0: 0.9, v1: 2.3, id: `w${i}`,
  }));
  const res = cutWall(wall, wins);
  assert.equal(res.errors.length, 0);
  assert.equal(res.segments.length, k + 3);
  invariants(wall, wins, res);
});

test('door + window on the same face → correct mixed profile', () => {
  const wall = { L: 10, H: 3.2 };
  const os = [
    { u0: 1.0, u1: 2.6, v0: 0, v1: 2.2, id: 'door' },
    { u0: 6.0, u1: 7.2, v0: 0.9, v1: 2.3, id: 'win' },
  ];
  const res = cutWall(wall, os);
  assert.equal(res.errors.length, 0);
  invariants(wall, os, res);
  // floor band exists only east of the door, broken by nothing below the window sill
  const floorBands = res.segments.filter((s) => s.v0 === 0);
  assert.ok(floorBands.length >= 2, 'jamb strips at floor level on both sides of the door');
});

test('stacked openings sharing a u-range emit the between band', () => {
  const wall = { L: 6, H: 6 };
  const os = [
    { u0: 2, u1: 4, v0: 0.8, v1: 2.0, id: 'lower' },
    { u0: 2, u1: 4, v0: 3.0, v1: 4.2, id: 'upper' },
  ];
  const res = cutWall(wall, os);
  assert.equal(res.errors.length, 0);
  const between = res.segments.find((s) => Math.abs(s.v0 - 2.0) < 1e-9 && Math.abs(s.v1 - 3.0) < 1e-9 && s.u0 < 2.1 && s.u1 > 3.9);
  assert.ok(between, 'band between the stacked openings exists');
  invariants(wall, os, res);
});

test('overlapping openings → error (would compile z-fighting jambs)', () => {
  const res = cutWall({ L: 8, H: 3 }, [
    { u0: 2, u1: 4, v0: 0.5, v1: 2, id: 'a' },
    { u0: 3, u1: 5, v0: 1, v1: 2.5, id: 'b' },
  ]);
  assert.ok(res.errors.some((e) => e.includes('overlaps')));
  assert.equal(res.segments.length, 0);
});

test('opening past the wall edge → error', () => {
  const res = cutWall({ L: 8, H: 3 }, [{ u0: 7.5, u1: 9.0, v0: 0, v1: 2, id: 'off' }]);
  assert.ok(res.errors.some((e) => e.includes('outside the wall')));
});

test('4 cm sliver is dropped and accounted in `dropped`', () => {
  const wall = { L: 8, H: 3 };
  const os = [{ u0: 0.04, u1: 4, v0: 0, v1: 3, id: 'huge' }];   // leaves a 4 cm strip at u<0.04
  const res = cutWall(wall, os);
  assert.equal(res.errors.length, 0);
  assert.ok(res.segments.every((s) => s.u1 - s.u0 >= 0.05 && s.v1 - s.v0 >= 0.05), 'no sliver survives');
  assert.ok(res.dropped > 0, 'dropped area is accounted');
  invariants(wall, os, res);
});
