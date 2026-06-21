import test from 'node:test';
import assert from 'node:assert/strict';
import { SupportScan } from '../../src/support.js';

// minimal fakes — SupportScan is THREE-free, so we drive it with plain objects.
function treeBox(x, z, baseY = 0, standing = true, id = 1) {
  const tree = { id, standing, pos: { x, y: baseY, z }, part: { min: [x - 0.5, baseY, z - 0.5] } };
  return { tree: true, downer: tree, min: { x: x - 0.5, z: z - 0.5 }, max: { x: x + 0.5, z: z + 0.5 } };
}
function structBox(x, z, baseY = 0, id = 9) {
  const s = { id, pos: { x, y: baseY, z } };
  return { struct: true, _ref: s, min: { x: x - 1, z: z - 1 }, max: { x: x + 1, z: z + 1 } };
}
function propBox(x, z, baseY = 0, dead = false, id = 5) {
  const rec = { id, dead, pos: { x, y: baseY, z }, part: { min: [x - 0.4, baseY, z - 0.4] } };
  return { prop: true, downer: rec, min: { x: x - 0.4, z: z - 0.4 }, max: { x: x + 0.4, z: z + 0.4 } };
}

function makeGame(boxes, heightAt, calls) {
  return {
    world: {
      terrain: { terrainHeightAt: heightAt },
      grid: { queryAABB: () => boxes.slice() },
      demoBuilding: null,
    },
    forest: { fellTree: (t, dir, seed) => calls.push({ k: 'fell', id: t.id, dir, seed }), destroyProp: (r) => calls.push({ k: 'prop', id: r.id }) },
    build: { destroyStructure: (s, cause) => calls.push({ k: 'struct', id: s.id, cause }) },
  };
}

const DUG = () => -3;   // ground dropped 3 m everywhere → undermines anything based at 0
const FLAT = () => 0;   // ground level → supports a base at 0

test('undermined tree is felled', () => {
  const calls = [];
  const g = makeGame([treeBox(10, 10, 0, true, 7)], DUG, calls);
  new SupportScan(g).run({ minx: 5, minz: 5, maxx: 15, maxz: 15 }, { x: 12, z: 10 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].k, 'fell');
  assert.equal(calls[0].id, 7);
});

test('tree on intact ground is NOT felled', () => {
  const calls = [];
  const g = makeGame([treeBox(10, 10, 0)], FLAT, calls);
  new SupportScan(g).run({ minx: 5, minz: 5, maxx: 15, maxz: 15 }, { x: 12, z: 10 });
  assert.equal(calls.length, 0);
});

test('already-felled tree (standing=false) is skipped', () => {
  const calls = [];
  const g = makeGame([treeBox(10, 10, 0, false)], DUG, calls);
  new SupportScan(g).run({ minx: 5, minz: 5, maxx: 15, maxz: 15 }, { x: 12, z: 10 });
  assert.equal(calls.length, 0);
});

test('fall direction points from the tree toward the crater (topples INTO the hole)', () => {
  const calls = [];
  const g = makeGame([treeBox(10, 10, 0, true, 3)], DUG, calls);
  new SupportScan(g).run({ minx: 0, minz: 5, maxx: 20, maxz: 15 }, { x: 16, z: 10 }); // crater to the +X side
  const dir = calls[0].dir;
  assert.ok(dir && dir[0] > 0.9 && Math.abs(dir[1]) < 0.1, `expected +X lean toward crater, got ${dir}`);
});

test('dig right under the tree gives a null dir (random seeded lean)', () => {
  const calls = [];
  const g = makeGame([treeBox(10, 10, 0)], DUG, calls);
  new SupportScan(g).run({ minx: 5, minz: 5, maxx: 15, maxz: 15 }, { x: 10.1, z: 10.05 });
  assert.equal(calls[0].dir, null);
});

test('undermined fortification is destroyed; intact one is not', () => {
  let calls = [];
  new SupportScan(makeGame([structBox(0, 0, 0, 42)], DUG, calls)).run({ minx: -3, minz: -3, maxx: 3, maxz: 3 }, { x: 1, z: 0 });
  assert.deepEqual(calls.map((c) => [c.k, c.id]), [['struct', 42]]);
  calls = [];
  new SupportScan(makeGame([structBox(0, 0, 0, 42)], FLAT, calls)).run({ minx: -3, minz: -3, maxx: 3, maxz: 3 }, { x: 1, z: 0 });
  assert.equal(calls.length, 0);
});

test('undermined prop is destroyed; dead prop is skipped', () => {
  let calls = [];
  new SupportScan(makeGame([propBox(4, 4, 0, false, 11)], DUG, calls)).run({ minx: 0, minz: 0, maxx: 8, maxz: 8 }, { x: 5, z: 4 });
  assert.deepEqual(calls.map((c) => [c.k, c.id]), [['prop', 11]]);
  calls = [];
  new SupportScan(makeGame([propBox(4, 4, 0, true, 11)], DUG, calls)).run({ minx: 0, minz: 0, maxx: 8, maxz: 8 }, { x: 5, z: 4 });
  assert.equal(calls.length, 0);
});
