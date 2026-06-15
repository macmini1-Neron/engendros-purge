import * as THREE from 'three';

// Seat an AABB collider on the terrain surface: footprint w×d, height h, centered at (x,z), with its
// BASE at the ground height. Pushes to world.boxes and returns the box. `extra` merges extra fields
// (e.g. { dmat }). Grid note: when called during map build (before world.grid.build at the end of the
// World constructor) the box is indexed automatically; if you ever seat at RUNTIME, also call
// world.grid.addBox(box).
export function seatBox(world, x, z, w, d, h, extra = {}) {
  const y = world.groundY(x, z);
  const box = {
    min: new THREE.Vector3(x - w / 2, y, z - d / 2),
    max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    ...extra,
  };
  world.boxes.push(box);
  return box;
}

// Build a prop mesh (buildFn() → THREE.Object3D), plant it on the terrain at (x,z) (optional yaw), add it
// to the scene, and — when opts.w/d/h are given — seat a matching AABB collider. Returns the mesh.
// The mesh sits upright on the surface (no slope-normal tilt; that's a later polish).
export function placeProp(world, x, z, buildFn, opts = {}) {
  const y = world.groundY(x, z);
  const mesh = buildFn();
  mesh.position.set(x, y, z);
  if (opts.yaw) mesh.rotation.y = opts.yaw;
  world.scene.add(mesh);
  if (opts.w && opts.d && opts.h) seatBox(world, x, z, opts.w, opts.d, opts.h, opts.collider || {});
  return mesh;
}
