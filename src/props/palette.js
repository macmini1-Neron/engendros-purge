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
  galvanized: { voxel: { hi: '#e5e8eb', mid: '#a0a8b0', lo: '#6a7278', slot: '#505860', bright: '#f0f2f5' },
                glb: { rgb: [0.33, 0.34, 0.36], rough: 0.5, metal: 0.3 } },
  leather:   { voxel: { hi: '#5a4428', mid: '#3a2c18', lo: '#28200e', slot: '#1a1608', bright: '#6d5535' },
               glb: { rgb: [0.22, 0.17, 0.09], rough: 0.65, metal: 0.0 } },
  paintOD:   { voxel: { hi: '#6b6e42', mid: '#4a4d28', lo: '#37391f', slot: '#282a16', bright: '#7f8352' },
               glb: { rgb: [0.30, 0.30, 0.16], rough: 0.4, metal: 0.0 } },
  paintRed:  { voxel: { hi: '#d63030', mid: '#a02020', lo: '#701515', slot: '#500f0f', bright: '#e84242' },
               glb: { rgb: [0.66, 0.12, 0.12], rough: 0.35, metal: 0.0 } },
  paintBlack: { voxel: { hi: '#222222', mid: '#0f0f0f', lo: '#080808', slot: '#030303', bright: '#333333' },
                glb: { rgb: [0.05, 0.05, 0.05], rough: 0.3, metal: 0.0 } },
  pine:      { voxel: { hi: '#d8c49a', mid: '#b89e6e', lo: '#97805a', slot: '#6e5c40', bright: '#e8d6ac' },
               glb: { rgb: [0.62, 0.53, 0.38], rough: 0.75, metal: 0.0 } },
  oliveDrab: { voxel: { hi: '#7e8c60', mid: '#52603a', lo: '#3e4a2c', slot: '#2d361f', bright: '#94a274' },
               glb: { rgb: [0.32, 0.37, 0.22], rough: 0.8, metal: 0.0 } },
  paintKhaki: { voxel: { hi: '#b5a26c', mid: '#8c7c50', lo: '#6c5f3c', slot: '#4e442a', bright: '#cbba80' },
                glb: { rgb: [0.55, 0.49, 0.31], rough: 0.55, metal: 0.0 } },
  missileGrey:{ voxel: { hi: '#c4c8c6', mid: '#9aa09d', lo: '#787e7b', slot: '#5e6360', bright: '#d8dcd9' },
               glb: { rgb: [0.55, 0.57, 0.55], rough: 0.6, metal: 0.1 } },
  gunGrey:   { voxel: { hi: '#4a4e52', mid: '#34383c', lo: '#23262a', slot: '#16181b', bright: '#5e636a' },
               glb: { rgb: [0.10, 0.11, 0.12], rough: 0.5, metal: 0.3 } },
  // --- H.K.M. gramophone palette ---
  chrome:    { voxel: { hi: '#e9edf2', mid: '#b9c1c9', lo: '#7b848d', slot: '#4a5158', bright: '#ffffff' },
               glb: { rgb: [0.70, 0.72, 0.75], rough: 0.16, metal: 0.95 } },
  granitol:  { voxel: { hi: '#5a4636', mid: '#3f2e22', lo: '#281b13', slot: '#170f0a', bright: '#6e573f' },
               glb: { rgb: [0.16, 0.11, 0.08], rough: 0.82, metal: 0.0 } },
  shellac:   { voxel: { hi: '#2a2a2a', mid: '#121212', lo: '#070707', slot: '#000000', bright: '#4a4a4a' },
               glb: { rgb: [0.02, 0.02, 0.02], rough: 0.26, metal: 0.0 } },
  feltTeal:  { voxel: { hi: '#2e5048', mid: '#1f3a34', lo: '#142621', slot: '#0b1714', bright: '#3f6a5e' },
               glb: { rgb: [0.10, 0.20, 0.17], rough: 0.92, metal: 0.0 } },
  cream:     { voxel: { hi: '#e6dcc2', mid: '#cabf9a', lo: '#9d9270', slot: '#6c6147', bright: '#f4ecd6' },
               glb: { rgb: [0.74, 0.69, 0.55], rough: 0.6, metal: 0.0 } },
  // --- NATURE / FOREST palette (ported from feat/nature-props for the forest kit) ---
  barkBirch:  { voxel: { hi: '#f0eeea', mid: '#d4cfc8', lo: '#b0a99e', slot: '#6a6058', bright: '#f8f6f3' },
                glb: { rgb: [0.88, 0.84, 0.80], rough: 0.85, metal: 0.0 } },
  barkPine:   { voxel: { hi: '#8a5a38', mid: '#6a4028', lo: '#4e2e1a', slot: '#341e10', bright: '#a46e48' },
                glb: { rgb: [0.37, 0.23, 0.13], rough: 0.9, metal: 0.0 } },
  barkDark:   { voxel: { hi: '#4a3828', mid: '#302418', lo: '#201810', slot: '#120e08', bright: '#5e4a36' },
                glb: { rgb: [0.17, 0.12, 0.08], rough: 0.88, metal: 0.0 } },
  foliageBirch: { voxel: { hi: '#a8c848', mid: '#7a9830', lo: '#5e7822', slot: '#425818', bright: '#c0dc5a' },
                  glb: { rgb: [0.48, 0.62, 0.17], rough: 0.75, metal: 0.0 } },
  foliagePine: { voxel: { hi: '#2a5c2a', mid: '#1e4220', lo: '#163018', slot: '#0e2010', bright: '#367036' },
                 glb: { rgb: [0.10, 0.25, 0.10], rough: 0.8, metal: 0.0 } },
  foliageOak: { voxel: { hi: '#4a7c30', mid: '#305820', lo: '#224018', slot: '#162c0e', bright: '#5e9040' },
                glb: { rgb: [0.21, 0.37, 0.12], rough: 0.78, metal: 0.0 } },
  foliageDry: { voxel: { hi: '#c8882a', mid: '#a06018', lo: '#784810', slot: '#543208', bright: '#dea040' },
                glb: { rgb: [0.58, 0.34, 0.08], rough: 0.82, metal: 0.0 } },
  foliageWillow: { voxel: { hi: '#9fb78a', mid: '#7a946a', lo: '#5e7450', slot: '#44563a', bright: '#b6c89e' },
                glb: { rgb: [0.48, 0.55, 0.40], rough: 0.78, metal: 0.0 } },
  grassGreen: { voxel: { hi: '#6ab040', mid: '#4a8028', lo: '#38601e', slot: '#284414', bright: '#82c850' },
                glb: { rgb: [0.27, 0.50, 0.14], rough: 0.85, metal: 0.0 } },
  grassDry:   { voxel: { hi: '#c8a84a', mid: '#a08030', lo: '#785e18', slot: '#504010', bright: '#dcc060' },
                glb: { rgb: [0.57, 0.43, 0.14], rough: 0.87, metal: 0.0 } },
  reedGreen:  { voxel: { hi: '#6a9848', mid: '#4a7030', lo: '#365421', slot: '#243814', bright: '#80b05a' },
                glb: { rgb: [0.26, 0.43, 0.17], rough: 0.8, metal: 0.0 } },
  flowerPink: { voxel: { hi: '#e87898', mid: '#c04870', lo: '#903458', slot: '#682040', bright: '#f090aa' },
                glb: { rgb: [0.78, 0.22, 0.40], rough: 0.6, metal: 0.0 } },
  granite:    { voxel: { hi: '#a8a8a4', mid: '#787874', lo: '#585854', slot: '#3c3c38', bright: '#c0c0bc' },
                glb: { rgb: [0.43, 0.43, 0.42], rough: 0.7, metal: 0.0 } },
  graniteMoss: { voxel: { hi: '#788c58', mid: '#506040', lo: '#3c4a2e', slot: '#2a341e', bright: '#8ea46a' },
                 glb: { rgb: [0.28, 0.36, 0.18], rough: 0.82, metal: 0.0 } },
  sandSoil:   { voxel: { hi: '#c8a870', mid: '#a07e4a', lo: '#785c34', slot: '#503e22', bright: '#dcc088' },
                glb: { rgb: [0.58, 0.42, 0.22], rough: 0.92, metal: 0.0 } },
  charBlack:  { voxel: { hi: '#2a2624', mid: '#181614', lo: '#0e0c0a', slot: '#060504', bright: '#3a3430' },
                glb: { rgb: [0.04, 0.04, 0.03], rough: 0.95, metal: 0.0 } },
};

export function resolveMaterial(name, target = 'voxel') {
  const m = PALETTE[name];
  if (!m) throw new Error(`unknown material '${name}' — add it to src/props/palette.js`);
  const t = m[target];
  if (!t) throw new Error(`material '${name}' has no '${target}' backend`);
  return t;
}

export const materialNames = () => Object.keys(PALETTE);
