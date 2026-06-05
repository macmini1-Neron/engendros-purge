// palette.js — semantic material table. Specs reference materials BY NAME only
// (a spec lint rejects raw hex). Each entry defines both backends:
//   voxel: a 5-tone layered-shading palette {hi,mid,lo,slot,bright}
//   glb:   a PBR material {rgb:[r,g,b], rough, metal}
// Pure module — no THREE — so it is unit-testable under `node --test`.

export const PALETTE = {
  woodMid:   { voxel: { hi: '#9a7242', mid: '#6a4a2a', lo: '#543a20', slot: '#3e2c18', bright: '#b08652' },
               glb: { rgb: [0.42, 0.29, 0.16], rough: 0.7, metal: 0.0 } },
  woodDark:  { voxel: { hi: '#5a4026', mid: '#41301c', lo: '#2f2214', slot: '#21170d', bright: '#6e5232' },
               glb: { rgb: [0.26, 0.19, 0.11], rough: 0.72, metal: 0.0 } },
  steel:     { voxel: { hi: '#c2c8ce', mid: '#7d838a', lo: '#5f656b', slot: '#4a4f55', bright: '#d8dde2' },
               glb: { rgb: [0.20, 0.21, 0.23], rough: 0.55, metal: 0.2 } },
  linoleum:  { voxel: { hi: '#5a8f78', mid: '#345f4c', lo: '#284a3b', slot: '#1d3a2d', bright: '#6fa78d' },
               glb: { rgb: [0.18, 0.32, 0.26], rough: 0.6, metal: 0.0 } },
  bakelite:  { voxel: { hi: '#52483f', mid: '#2c2723', lo: '#1f1b18', slot: '#15120f', bright: '#665a4e' },
               glb: { rgb: [0.10, 0.09, 0.08], rough: 0.5, metal: 0.0 } },
  brass:     { voxel: { hi: '#d8b15a', mid: '#a8842f', lo: '#856722', slot: '#5f4a18', bright: '#ecc873' },
               glb: { rgb: [0.55, 0.41, 0.14], rough: 0.4, metal: 0.6 } },
};

export function resolveMaterial(name, target = 'voxel') {
  const m = PALETTE[name];
  if (!m) throw new Error(`unknown material '${name}' — add it to src/props/palette.js`);
  const t = m[target];
  if (!t) throw new Error(`material '${name}' has no '${target}' backend`);
  return t;
}

export const materialNames = () => Object.keys(PALETTE);
