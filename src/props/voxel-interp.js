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

  const builders = new Map();   // rigKey → MeshBuilder (merged box/cylinder parts)
  const extras = new Map();     // rigKey → [Object3D] (ops that return their OWN mesh, e.g. textured)
  for (const o of plan.ops) {
    const fn = OPS[o.op];
    if (!fn) throw new Error(`no voxel impl for operator '${o.op}'`);
    const key = o.rig || '__base';
    if (!builders.has(key)) { builders.set(key, new MeshBuilder()); extras.set(key, []); }
    const ret = fn(builders.get(key), o.args, o.tones, o.origin);
    if (ret && ret.isObject3D) extras.get(key).push(ret);   // a textured/standalone-mesh operator
  }

  const rigByName = new Map(plan.rig.map((r) => [r.name, r]));
  for (const key of builders.keys()) {
    const rig = key === '__base' ? null : rigByName.get(key);
    const posed = rig && Array.isArray(rig.pivot) && rig.pose != null;
    // `outer` = the named rig group (carries the STATIC pose: rotate `pose` rad about `axis`).
    // `container` = where meshes actually go; for a posed rig it is offset by −pivot so the
    // outer rotation pivots about `pivot` (e.g. erecting a missile on its trunnion). Parts are
    // built at absolute coords; the −pivot container makes the net transform a rotation about pivot.
    let outer = root, container = root;
    if (key !== '__base') {
      outer = new THREE.Group(); outer.name = key;
      if (rig) outer.userData.rig = rig;
      container = outer;
      if (posed) {
        const [px, py, pz] = rig.pivot;
        outer.position.set(px, py, pz);
        outer.rotation[rig.axis || 'x'] = rig.pose;
        container = new THREE.Group(); container.position.set(-px, -py, -pz); outer.add(container);
      }
      root.add(outer);
    }
    const b = builders.get(key);
    if (b.pos.length) {                       // merged vertex-colour mesh (box/cylinder parts)
      const mesh = new THREE.Mesh(b.build(), voxelMaterial());
      mesh.castShadow = true; mesh.receiveShadow = true;
      container.add(mesh);
    }
    for (const ex of extras.get(key)) {       // standalone meshes (own material, e.g. CanvasTexture)
      ex.castShadow = true; ex.receiveShadow = true;
      container.add(ex);
    }
  }
  root.userData.footprint = plan.footprint;
  return root;
}
