// registry.js — browser-facing facade (THREE boundary). Re-exports the pure
// registry core + adds placeProp(), which builds a registered spec and adds it
// to a scene. Never silently swallows an unknown id.
import * as THREE from 'three';
import { buildSpec } from './voxel-interp.js';
export { registerModel, getSpec, hasModel, listModels } from './registry-core.js';
import { getSpec } from './registry-core.js';

export function placeProp(scene, id, x, z, yaw = 0, opts = {}) {
  const spec = getSpec(id);
  if (!spec) { console.warn(`[modelgen] placeProp: unknown model '${id}'`); return null; }
  const obj = buildSpec(spec);
  obj.position.set(x, opts.y ?? 0, z);
  obj.rotation.y = yaw;
  if (opts.scale) obj.scale.setScalar(opts.scale);
  scene.add(obj);
  return obj;
}
