// scene.js — the lab world: brick wall (6×2 segments, 4 glass panes), wood fence,
// lazy-split merged rendering (spec §4: intact = 1 merged mesh; rebuild-minus-dead on damage).
import * as THREE from 'three';
import { MeshBuilder, voxelMaterial } from '../../src/util.js';
import { makePart } from './matrix.js';

const BRICK = 0x8a4a32, BRICK_HI = 0xa05a3c, GLASS = 0xbcd8e0, WOOD = 0x8a703f;
const SEG_W = 1.5, SEG_H = 1.25, WALL_T = 0.3;

export function buildLab(scene) {
  const parts = new Map();          // id → part (matrix part + {kind, …})
  const add = (part, extra) => { parts.set(part.id, Object.assign(part, extra)); return part; };

  // --- brick wall: 6 cols × 2 rows at z = 0, centred on x. Upper row cols 1-4 hold glass panes.
  const wallGroup = new THREE.Group();
  scene.add(wallGroup);
  for (let col = 0; col < 6; col++) {
    for (let row = 0; row < 2; row++) {
      const x = (col - 2.5) * SEG_W, y = row * SEG_H;
      const id = `wall_${row ? 'up' : 'lo'}_${col}`;
      const hasPane = row === 1 && col >= 1 && col <= 4;
      add(makePart(id, 'brick',
        [x - SEG_W / 2, y, -WALL_T / 2], [x + SEG_W / 2, y + SEG_H, WALL_T / 2]),
        { kind: 'wall', hasPane, col, row });
      if (hasPane) {
        // z=[0.14, 0.22] — glass sits on the +z face of the wall (front-face-mounted).
        // This ensures the glass AABB front (z=0.22) is hit before the wall face (z=0.15)
        // by rays from the +z camera side, so hitscan correctly targets the glass first.
        add(makePart(`glass_${col}`, 'glass',
          [x - 0.5, y + 0.2, 0.14], [x + 0.5, y + 1.0, 0.22]),
          { kind: 'pane', col });
      }
    }
  }

  // --- wood fence: 4 segments at z = 6
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * SEG_W;
    add(makePart(`fence_${i}`, 'wood',
      [x - SEG_W / 2, 0, 5.95], [x + SEG_W / 2, 1.2, 6.05]),
      { kind: 'fence' });
  }

  // --- spall targets: 3 thin ply boards 3 m behind the wall (z = -3)
  const targets = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.06),
      new THREE.MeshLambertMaterial({ color: 0xc8b88a }));
    mesh.position.set(x, 0.9, -3);
    scene.add(mesh);
    targets.push({ id: `ply_${i}`, mesh, centre: [x, 0.9, -3], hit: false });
  }

  // --- stand-in trees (real generators live on feat/nature-props; physics is what's under test)
  // Each: stump mesh (stays) + upper mesh (falls). Trunk part gates the felling.
  // Sapling (cls 1) uses mat 'wood' (tier 1) so any rifle breaks it per the spec crush table;
  // grown trunks are mat 'trunk' (tier 2) — rifle plinks, hmg/HE fell them.
  const trees = [];
  const treeDefs = [
    { id: 'tree1', cls: 1, mat: 'wood', x: -8, z: 4, trunkH: 2.6, trunkR: 0.09, hpScale: 0.2, crown: 0x6f8f3f },  // sapling
    { id: 'tree2', cls: 2, mat: 'trunk', x: -8, z: -2, trunkH: 7, trunkR: 0.22, hpScale: 1, crown: 0x5f8f4f },    // birch
    { id: 'tree3', cls: 3, mat: 'trunk', x: -8, z: -8, trunkH: 9, trunkR: 0.45, hpScale: 3, crown: 0x4f7f3f },    // oak
  ];
  for (const d of treeDefs) {
    const breakY = d.trunkH * 0.3;
    const mkTrunk = (y0, y1, color) => {
      const mb = new MeshBuilder();
      mb.box(d.trunkR * 2, y1 - y0, d.trunkR * 2, 0, (y0 + y1) / 2, 0, color);
      return mb;
    };
    const stumpMb = mkTrunk(0, breakY, 0x7a6248);
    const stump = new THREE.Mesh(stumpMb.build(), voxelMaterial());
    stump.position.set(d.x, 0, d.z);
    scene.add(stump);

    const upperMb = mkTrunk(0, d.trunkH - breakY, d.cls === 2 ? 0xd8d8cc : 0x7a6248); // birch = white
    const crownR = d.trunkR * 6 + d.cls;
    upperMb.box(crownR, crownR * 0.9, crownR, 0, d.trunkH - breakY, 0, d.crown);
    const upper = new THREE.Mesh(upperMb.build(), voxelMaterial());
    upper.position.set(d.x, breakY, d.z);   // local origin AT the hinge pivot
    scene.add(upper);

    const part = add(makePart(d.id, d.mat,
      [d.x - d.trunkR, 0, d.z - d.trunkR], [d.x + d.trunkR, d.trunkH, d.z + d.trunkR], d.hpScale),
      { kind: 'tree', cls: d.cls });
    trees.push({ def: d, part, stump, upper, breakY, fallen: false, body: null, colliders: [] });
  }

  // --- lazy-split merged rendering. ONE merged mesh for everything alive; rebuild on death.
  let merged = null;
  let lastRebuildMs = 0;
  function rebuild() {
    const t0 = performance.now();
    if (merged) { wallGroup.remove(merged); merged.geometry.dispose(); merged.material.dispose(); }
    const mb = new MeshBuilder();
    for (const p of parts.values()) {
      if (p.dead) continue;
      if (p.kind === 'tree') continue;              // trees own their stump/upper meshes
      const w = p.max[0] - p.min[0], h = p.max[1] - p.min[1], d = p.max[2] - p.min[2];
      const cx = (p.min[0] + p.max[0]) / 2, cy = (p.min[1] + p.max[1]) / 2, cz = (p.min[2] + p.max[2]) / 2;
      const color = p.kind === 'pane' ? GLASS : p.kind === 'fence' ? WOOD :
                    (p.row === 1 ? BRICK_HI : BRICK);
      mb.box(w, h, d, cx, cy, cz, color);
      if (p.kind === 'wall') {                      // proud lintel strip = layered-shading accent
        mb.box(w, 0.08, d + 0.04, cx, p.max[1] - 0.04, cz, 0x6e3a26);
      }
    }
    // rubble stubs at the base of every dead wall segment (breach reads as a hole + debris)
    for (const p of parts.values()) {
      if (p.kind === 'tree') continue;              // a dead tree fells — no wall rubble stubs
      if (!p.dead || p.kind !== 'wall') continue;
      const cx = (p.min[0] + p.max[0]) / 2;
      mb.box(1.1, 0.25, 0.7, cx, 0.125, (p.min[2] + p.max[2]) / 2, 0x6e4334);
      mb.box(0.6, 0.18, 0.5, cx + 0.35, 0.34, (p.min[2] + p.max[2]) / 2 + 0.15, 0x5d3a2c);
    }
    merged = new THREE.Mesh(mb.build(), voxelMaterial());
    wallGroup.add(merged);
    lastRebuildMs = performance.now() - t0;
    return lastRebuildMs;
  }
  rebuild();

  return { parts, targets, trees, rebuild, get lastRebuildMs() { return lastRebuildMs; } };
}
