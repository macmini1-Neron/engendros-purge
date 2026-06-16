// terrain-mesh.js — BROWSER-ONLY ground-mesh builder (needs THREE). Phase 3a.
//
// Kept OUT of src/terrain.js so the pure height field stays node-testable. The height
// CONTRACT lives in src/terrain.js; this displaces a grid by terrainHeightAt, paints it
// (grass→dirt→rock by slope), and drops a vertical SKIRT around the chunk perimeter to hide
// the cracks where a chunk meets a coarser-LOD neighbour (Phase 3a). Normals come from the
// CONTINUOUS heightfield (terrain.terrainNormalAt), not computeVertexNormals(), so lighting
// has no seam at chunk borders.
import * as THREE from 'three';

const COL_GRASS = new THREE.Color(0x6b8a3a);
const COL_DIRT  = new THREE.Color(0x7a6244);
const COL_ROCK  = new THREE.Color(0x7d7872);

// Metres each chunk edge drops below its surface. Must exceed the worst LOD crack (coarse-vs-fine
// height delta over one coarse cell) on the steepest terrain; 8 m is safe on the demo's gentle hills.
export const SKIRT_DEPTH = 8;

// Build ONE terrain chunk mesh at `resolution` segments per axis. `chunk` is a planChunks()
// descriptor { ix, iz, minX, minZ, maxX, maxZ, sizeX, sizeZ, centerX, centerZ }. Vertices are
// LOCAL (centred on the chunk) and the mesh is positioned at the chunk centre, so chunks tile.
export function buildChunkMesh(terrain, chunk, resolution = 16, skirtDepth = SKIRT_DEPTH) {
  const segs = Math.max(1, Math.floor(resolution));
  const vpr = segs + 1;                       // vertices per row/col
  const halfX = chunk.sizeX / 2, halfZ = chunk.sizeZ / 2;
  const dx = chunk.sizeX / segs, dz = chunk.sizeZ / segs;

  const topCount = vpr * vpr;
  const perim = 4 * segs;                     // perimeter vertices (corners counted once)
  const total = topCount + perim;

  const positions = new Float32Array(total * 3);
  const colors    = new Float32Array(total * 3);
  const normals   = new Float32Array(total * 3);
  const tmp = new THREE.Color();

  // ── top surface vertices ──
  for (let iz = 0; iz <= segs; iz++) {
    for (let ix = 0; ix <= segs; ix++) {
      const i = iz * vpr + ix;
      const lx = -halfX + ix * dx;
      const lz = -halfZ + iz * dz;
      const wx = chunk.centerX + lx;
      const wz = chunk.centerZ + lz;
      const h = terrain.terrainHeightAt(wx, wz);
      positions[i * 3] = lx; positions[i * 3 + 1] = h; positions[i * 3 + 2] = lz;
      const slope = terrain.terrainSlopeAt(wx, wz);
      const dirtT = THREE.MathUtils.clamp((slope - 0.18) / (0.34 - 0.18), 0, 1);
      const rockT = THREE.MathUtils.clamp((slope - 0.40) / (0.62 - 0.40), 0, 1);
      tmp.copy(COL_GRASS).lerp(COL_DIRT, dirtT).lerp(COL_ROCK, rockT);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      const nrm = terrain.terrainNormalAt(wx, wz); // seamless across chunk borders
      normals[i * 3] = nrm.x; normals[i * 3 + 1] = nrm.y; normals[i * 3 + 2] = nrm.z;
    }
  }

  const indices = [];
  // top surface triangles (CCW seen from above)
  for (let iz = 0; iz < segs; iz++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iz * vpr + ix, b = a + 1, c = a + vpr, d = c + 1;
      indices.push(a, c, b,  b, c, d);
    }
  }

  // ── perimeter ring (closed loop of top-vertex indices, grid-adjacent step by step) ──
  const ring = [];
  for (let ix = 0; ix < segs; ix++) ring.push(0 * vpr + ix);     // -Z edge: (0..segs-1, 0)
  for (let iz = 0; iz < segs; iz++) ring.push(iz * vpr + segs);  // +X edge: (segs, 0..segs-1)
  for (let ix = segs; ix > 0; ix--) ring.push(segs * vpr + ix);  // +Z edge: (segs..1, segs)
  for (let iz = segs; iz > 0; iz--) ring.push(iz * vpr + 0);     // -X edge: (0, segs..1)
  // ring.length === perim; consecutive entries (incl. wrap) are always grid-adjacent.

  // skirt vertex directly below each ring vertex
  for (let k = 0; k < ring.length; k++) {
    const t = ring[k], s = topCount + k;
    positions[s * 3] = positions[t * 3];
    positions[s * 3 + 1] = positions[t * 3 + 1] - skirtDepth;
    positions[s * 3 + 2] = positions[t * 3 + 2];
    colors[s * 3] = colors[t * 3]; colors[s * 3 + 1] = colors[t * 3 + 1]; colors[s * 3 + 2] = colors[t * 3 + 2];
    normals[s * 3] = normals[t * 3]; normals[s * 3 + 1] = normals[t * 3 + 1]; normals[s * 3 + 2] = normals[t * 3 + 2];
  }
  // skirt quads — front + reversed back tri so the wall shows from both sides (winding-agnostic)
  for (let k = 0; k < ring.length; k++) {
    const kN = (k + 1) % ring.length;
    const tA = ring[k], tB = ring[kN], sA = topCount + k, sB = topCount + kN;
    indices.push(tA, sA, tB,  tB, sA, sB);   // front
    indices.push(tB, sA, tA,  sB, sA, tB);   // back
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere(); // used by frustum culling in TerrainChunks
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(chunk.centerX, 0, chunk.centerZ);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;                // TerrainChunks owns visibility explicitly
  mesh.name = `terrainChunk_${chunk.ix}_${chunk.iz}_r${segs}`;
  mesh.updateMatrixWorld(true);              // static chunk → world matrix computed once
  return mesh;
}
