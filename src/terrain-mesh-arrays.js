// terrain-mesh-arrays.js — PURE (THREE-free) per-vertex chunk computation, split out of
// terrain-mesh.js so it can run in the sim Web Worker (import maps aren't inherited by
// workers, so nothing here may import 'three'). terrain-mesh.js wraps the returned typed
// arrays in a THREE.BufferGeometry; the worker ships them back as transferables. Sharing
// this one module keeps the main-thread and worker builds bit-identical.
//
// Colours match `new THREE.Color(hex)` exactly: three.js converts an sРГБ hex to the
// linear working space, so we pre-convert here (sRGBToLinear) and lerp in linear — feed the
// raw bytes and the terrain would read visibly brighter/wrong.

const sRGBToLinear = (c) => (c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linRGB = (hex) => [sRGBToLinear(((hex >> 16) & 255) / 255), sRGBToLinear(((hex >> 8) & 255) / 255), sRGBToLinear((hex & 255) / 255)];
const COL_GRASS = linRGB(0x6b8a3a);
const COL_DIRT  = linRGB(0x7a6244);
const COL_ROCK  = linRGB(0x7d7872);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Metres each chunk edge drops below its surface (skirt) to hide LOD cracks — see terrain-mesh.js.
export const SKIRT_DEPTH = 8;

// Compute the raw geometry arrays for ONE terrain chunk at `resolution` segments per axis.
// `terrain` is a makeTerrain() contract object; `chunk` is a planChunks() descriptor.
// Returns { positions:Float32Array, colors:Float32Array, normals:Float32Array, indices:Uint32Array }
// — all transferable. LOCAL vertices (centred on the chunk); the caller positions the mesh.
export function computeChunkArrays(terrain, chunk, resolution = 16, skirtDepth = SKIRT_DEPTH) {
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
      const dirtT = clamp01((slope - 0.18) / (0.34 - 0.18));
      const rockT = clamp01((slope - 0.40) / (0.62 - 0.40));
      // grass → dirt → rock, lerped in linear space (matches THREE.Color.lerp chain)
      let cr = COL_GRASS[0] + (COL_DIRT[0] - COL_GRASS[0]) * dirtT; cr += (COL_ROCK[0] - cr) * rockT;
      let cg = COL_GRASS[1] + (COL_DIRT[1] - COL_GRASS[1]) * dirtT; cg += (COL_ROCK[1] - cg) * rockT;
      let cb = COL_GRASS[2] + (COL_DIRT[2] - COL_GRASS[2]) * dirtT; cb += (COL_ROCK[2] - cb) * rockT;
      colors[i * 3] = cr; colors[i * 3 + 1] = cg; colors[i * 3 + 2] = cb;
      const nrm = terrain.terrainNormalAt(wx, wz); // seamless across chunk borders
      normals[i * 3] = nrm.x; normals[i * 3 + 1] = nrm.y; normals[i * 3 + 2] = nrm.z;
    }
  }

  const idx = [];
  // top surface triangles (CCW seen from above)
  for (let iz = 0; iz < segs; iz++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iz * vpr + ix, b = a + 1, c = a + vpr, d = c + 1;
      idx.push(a, c, b,  b, c, d);
    }
  }

  // ── perimeter ring (closed loop of top-vertex indices, grid-adjacent step by step) ──
  const ring = [];
  for (let ix = 0; ix < segs; ix++) ring.push(0 * vpr + ix);     // -Z edge
  for (let iz = 0; iz < segs; iz++) ring.push(iz * vpr + segs);  // +X edge
  for (let ix = segs; ix > 0; ix--) ring.push(segs * vpr + ix);  // +Z edge
  for (let iz = segs; iz > 0; iz--) ring.push(iz * vpr + 0);     // -X edge

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
    idx.push(tA, sA, tB,  tB, sA, sB);   // front
    idx.push(tB, sA, tA,  sB, sA, tB);   // back
  }

  return { positions, colors, normals, indices: new Uint32Array(idx) };
}
