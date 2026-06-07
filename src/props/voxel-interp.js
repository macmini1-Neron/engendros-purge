// voxel-interp.js — executes a build plan into a THREE.Group (THREE boundary).
// Parts sharing a `rig` name are merged into one mesh under a named pivot Group,
// matching the game's userData rig contract. Static parts (rig:null) merge into
// the base mesh. Verified in-browser (the pure layers it sits on are unit-tested).
import * as THREE from 'three';
import { MeshBuilder, voxelMaterial } from '../util.js';
import { validateSpec } from './spec.js';
import { planBuild } from './plan.js';
import * as OPS from './operators/index.js';

export function buildSpec(spec) {
  validateSpec(spec);                       // hard-fail on any invented dimension
  const plan = planBuild(spec, 'voxel');
  const root = new THREE.Group();
  root.name = plan.id;

  const builders = new Map();                // rigKey → MeshBuilder
  for (const o of plan.ops) {
    const fn = OPS[o.op];
    if (!fn) throw new Error(`no voxel impl for operator '${o.op}'`);
    const key = o.rig || '__base';
    if (!builders.has(key)) builders.set(key, new MeshBuilder());
    fn(builders.get(key), o.args, o.tones, o.origin);
  }

  for (const [key, b] of builders) {
    const mesh = new THREE.Mesh(b.build(), voxelMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (key === '__base') { root.add(mesh); }
    else { const g = new THREE.Group(); g.name = key; g.add(mesh); root.add(g); }
  }

  for (const r of plan.rig) {
    const g = root.getObjectByName(r.name);
    if (g) g.userData.rig = r;
  }
  root.userData.footprint = plan.footprint;
  return root;
}
