// registry.js — browser facade: place a registered building into the world.
// The ONE law enforced here at runtime: yaw must be a multiple of 90° — world.boxes are
// axis-aligned AABBs; at right angles rotYSteps swaps extents EXACTLY (no trig), any other
// angle would silently ship wrong colliders (law 12).
import * as THREE from 'three';
import { buildBuilding } from './interp.js';
import { getBuildingSpec } from './registry-core.js';
import { assertYaw, rotYSteps } from './operators/_math.js';

const D2R = Math.PI / 180;

// world: needs .boxes (AABB list) and optionally .grid (SpatialGrid — addBox per box).
// Returns { group, boxes } or null when the id is unknown (warn, don't crash the world build).
export function placeBuilding(world, scene, id, x, z, yaw = 0, opts = {}) {
  const spec = getBuildingSpec(id);
  if (!spec) { console.warn(`[buildgen] placeBuilding: unknown building '${id}'`); return null; }
  const k = assertYaw(yaw);                                  // throws on non-90° — by design

  const { group, colliders } = buildBuilding(spec, opts);
  group.position.set(x, opts.y ?? 0, z);
  group.rotation.y = yaw * D2R;
  scene.add(group);

  const boxes = [];
  for (const c of colliders) {
    const r = rotYSteps(k, c.min, c.max);
    const box = {
      min: new THREE.Vector3(r.min[0] + x, r.min[1] + (opts.y ?? 0), r.min[2] + z),
      max: new THREE.Vector3(r.max[0] + x, r.max[1] + (opts.y ?? 0), r.max[2] + z),
      building: id,
    };
    world.boxes.push(box);
    world.grid?.addBox(box);
    boxes.push(box);
  }
  return { group, boxes };
}

export { registerBuilding, getBuildingSpec, hasBuilding, listBuildings } from './registry-core.js';
