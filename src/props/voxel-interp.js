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

  // 1) run operators → merged builder + standalone meshes per rig key
  const builders = new Map(), extras = new Map();
  const ensure = (key) => { if (!builders.has(key)) { builders.set(key, new MeshBuilder()); extras.set(key, []); } };
  ensure('__base');
  for (const o of plan.ops) {
    const fn = OPS[o.op];
    if (!fn) throw new Error(`no voxel impl for operator '${o.op}'`);
    const key = o.rig || '__base';
    ensure(key);
    const ret = fn(builders.get(key), o.args, o.tones, o.origin);
    if (ret && ret.isObject3D) extras.get(key).push(ret);   // a textured/standalone-mesh operator
  }

  // 2) a group per rig — ANY rig with a `pivot` gets an outer (named, carries rotation about the
  // pivot) + an inner container offset by −pivot, so an animator can just set outer.rotation[axis]
  // and it pivots correctly. `pose` is the static display angle (default 0 = neutral, ready to
  // animate). Rigs nest: a rig with `parent` hangs under the parent's container (azimuth → elevation
  // → missile), so one parent rotation carries everything below it. userData.rig keeps the contract.
  const rigByName = new Map(plan.rig.map((r) => [r.name, r]));
  for (const r of plan.rig) ensure(r.name);   // a rig may be a pure container (children only)
  const containers = new Map([['__base', root]]), outers = new Map();
  for (const key of builders.keys()) {
    if (key === '__base') continue;
    const rig = rigByName.get(key);
    const outer = new THREE.Group(); outer.name = key;
    if (rig) outer.userData.rig = rig;
    let container = outer;
    if (rig && Array.isArray(rig.pivot)) {
      const [px, py, pz] = rig.pivot;
      outer.position.set(px, py, pz);
      outer.rotation[rig.axis || 'x'] = rig.pose ?? 0;
      container = new THREE.Group(); container.position.set(-px, -py, -pz); outer.add(container);
    }
    outers.set(key, outer); containers.set(key, container);
  }
  for (const key of outers.keys()) {          // wire nesting: child.outer → parent.container (or root)
    const rig = rigByName.get(key);
    (rig && rig.parent && containers.has(rig.parent) ? containers.get(rig.parent) : root).add(outers.get(key));
  }

  // 3) attach each rig's meshes into its container
  for (const [key, b] of builders) {
    const container = containers.get(key);
    if (b.pos.length) {
      const mesh = new THREE.Mesh(b.build(), voxelMaterial());
      mesh.castShadow = true; mesh.receiveShadow = true;
      container.add(mesh);
    }
    for (const ex of extras.get(key)) { ex.castShadow = true; ex.receiveShadow = true; container.add(ex); }
  }
  root.userData.footprint = plan.footprint;
  return root;
}
