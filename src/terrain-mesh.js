// terrain-mesh.js — BROWSER-ONLY ground-mesh builder (needs THREE). Phase 3a.
//
// The heavy per-vertex computation now lives in the PURE, THREE-free terrain-mesh-arrays.js
// (so the sim Web Worker can run it). This file only wraps the resulting typed arrays in a
// THREE.BufferGeometry / Mesh. `buildChunkMesh` keeps the original synchronous behaviour
// (compute + assemble); the worker path computes in the worker and calls assembleChunkMesh
// with the arrays it ships back. Normals come from the CONTINUOUS heightfield (in the pure
// module) so lighting has no seam at chunk borders.
import * as THREE from 'three';
import { computeChunkArrays, SKIRT_DEPTH } from './terrain-mesh-arrays.js';
import { makeTerrainMaterial } from './terrain-tex.js';

export { SKIRT_DEPTH }; // re-exported for any existing importer

// Wrap the pure per-vertex arrays in a positioned, shadow-receiving terrain mesh.
// `arrays` = { positions, colors, normals, indices } from computeChunkArrays(); `segs` only
// names the mesh. Kept separate from the compute so the worker path can assemble off the
// arrays it transfers back.
export function assembleChunkMesh(arrays, chunk, segs) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(arrays.colors, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(arrays.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(arrays.indices, 1));
  geo.computeBoundingSphere(); // used by frustum culling in TerrainChunks
  // Procedural metric-triplanar splat (grass/dirt/rock by slope) — the legibility material. Shared textures,
  // fresh material per chunk (terrain-chunks disposes per-chunk materials) sharing one compiled program.
  const mat = makeTerrainMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(chunk.centerX, 0, chunk.centerZ);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;                // TerrainChunks owns visibility explicitly
  mesh.name = `terrainChunk_${chunk.ix}_${chunk.iz}_r${segs}`;
  mesh.updateMatrixWorld(true);              // static chunk → world matrix computed once
  return mesh;
}

// Build ONE terrain chunk mesh at `resolution` segments per axis (synchronous). `chunk` is a
// planChunks() descriptor { ix, iz, minX, minZ, maxX, maxZ, sizeX, sizeZ, centerX, centerZ }.
export function buildChunkMesh(terrain, chunk, resolution = 16, skirtDepth = SKIRT_DEPTH) {
  const segs = Math.max(1, Math.floor(resolution));
  const arrays = computeChunkArrays(terrain, chunk, resolution, skirtDepth);
  return assembleChunkMesh(arrays, chunk, segs);
}
