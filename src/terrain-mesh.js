// terrain-mesh.js — BROWSER-ONLY ground-mesh builder (needs THREE). Phase 3.
//
// Kept OUT of src/terrain.js so the pure height field stays node-testable (importing
// THREE under `node --test` would fail to resolve the bare 'three' specifier). The
// height CONTRACT lives in src/terrain.js; this just displaces a subdivided plane by
// terrainHeightAt and paints it (grass low-slope, dirt/rock on steep faces).
import * as THREE from 'three';

// grass → dirt → rock ramp by slope.
const COL_GRASS = new THREE.Color(0x6b8a3a);
const COL_DIRT  = new THREE.Color(0x7a6244);
const COL_ROCK  = new THREE.Color(0x7d7872);

/**
 * buildGroundMesh(terrain, opts) → THREE.Mesh
 *
 * @param {object} terrain          A makeTerrain() instance (provides terrainHeightAt /
 *                                   terrainSlopeAt).
 * @param {object} [opts]
 * @param {number} [opts.extent=160]      Half-width in metres; plane spans [-extent,+extent].
 * @param {number} [opts.resolution=160]  Segments per axis. (res+1)² verts — 160 ⇒ ~26k
 *                                         verts / ~51k tris, a sane budget for the play area.
 *
 * Vertex-coloured (no texture) MeshLambertMaterial to match the voxel aesthetic, with
 * recomputed normals so engine lighting reads the slopes.
 */
export function buildGroundMesh(terrain, opts = {}) {
  const extent = opts.extent != null ? opts.extent : 160;
  const resolution = opts.resolution != null ? opts.resolution : 160;

  const geo = new THREE.PlaneGeometry(extent * 2, extent * 2, resolution, resolution);
  // PlaneGeometry lies in XY; rotate to the XZ ground plane. After rotateX(-90°):
  //   local (px, py, 0) → world (px, 0, -py)  ⇒ world x = px, world z = -py.
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const tmp = new THREE.Color();

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrain.terrainHeightAt(x, z);
    pos.setY(i, y);

    // colour by slope: grass < ~18° → dirt < ~32° → rock.
    const slope = terrain.terrainSlopeAt(x, z);
    const dirtT = THREE.MathUtils.clamp((slope - 0.18) / (0.34 - 0.18), 0, 1);
    const rockT = THREE.MathUtils.clamp((slope - 0.40) / (0.62 - 0.40), 0, 1);
    tmp.copy(COL_GRASS).lerp(COL_DIRT, dirtT).lerp(COL_ROCK, rockT);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'demoTerrain';
  mesh.receiveShadow = true;
  return mesh;
}

// Build ONE terrain chunk mesh. `chunk` is a descriptor from planChunks() (terrain-layout.js):
// { minX, minZ, sizeX, sizeZ, centerX, centerZ }. The mesh is positioned at the chunk center and
// its local vertices are sampled at WORLD coords, so chunks tile seamlessly. Normals are taken from
// the CONTINUOUS heightfield (terrain.terrainNormalAt) instead of geo.computeVertexNormals(), so
// lighting has no seam at chunk borders.
export function buildChunkMesh(terrain, chunk, resolution = 16) {
  const geo = new THREE.PlaneGeometry(chunk.sizeX, chunk.sizeZ, resolution, resolution);
  geo.rotateX(-Math.PI / 2); // lay it in the XZ plane; getX/getZ are now world-aligned offsets
  const pos = geo.attributes.position;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const wx = pos.getX(i) + chunk.centerX;
    const wz = pos.getZ(i) + chunk.centerZ;
    pos.setY(i, terrain.terrainHeightAt(wx, wz));
    const slope = terrain.terrainSlopeAt(wx, wz);
    const dirtT = THREE.MathUtils.clamp((slope - 0.18) / (0.34 - 0.18), 0, 1);
    const rockT = THREE.MathUtils.clamp((slope - 0.40) / (0.62 - 0.40), 0, 1);
    tmp.copy(COL_GRASS).lerp(COL_DIRT, dirtT).lerp(COL_ROCK, rockT);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    const nrm = terrain.terrainNormalAt(wx, wz); // seamless across chunk borders
    normals[i * 3] = nrm.x; normals[i * 3 + 1] = nrm.y; normals[i * 3 + 2] = nrm.z;
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingSphere(); // used by frustum culling in TerrainChunks
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(chunk.centerX, 0, chunk.centerZ);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // TerrainChunks owns visibility explicitly
  mesh.name = `terrainChunk_${chunk.ix}_${chunk.iz}`;
  mesh.updateMatrixWorld(true); // static chunk → world matrix computed once for culling
  return mesh;
}
