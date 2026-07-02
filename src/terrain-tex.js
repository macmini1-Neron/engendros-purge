// terrain-tex.js — procedural metric-TRIPLANAR splat material for the heightfield ground (no image files).
// Same tech as the buildgen bricks (CanvasTexture + world-space tiling, MeshLambert), but splat-blended by
// SLOPE+height: grass on gentle ground, dirt/scree on the shoulders, bare ROCK on the steep faces. This is
// the LEGIBILITY material — it reads the same steepness the collider uses, so a face that LOOKS like a wall
// IS a wall (BotW/Horizon rule). Textures are shared singletons (uploaded once); a fresh MeshLambert per
// chunk (terrain-chunks disposes per-chunk materials) shares one compiled program via customProgramCacheKey.
import * as THREE from 'three';

// tiny deterministic LCG so the textures are identical every run (visual only — gameplay stays on the seeded gameplay RNG)
function lcg(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function canvas(S) { const c = document.createElement('canvas'); c.width = c.height = S; return c; }
function speckle(x, rnd, S, color, n, sz = 1) { x.fillStyle = color; for (let i = 0; i < n; i++) x.fillRect((rnd() * S) | 0, (rnd() * S) | 0, sz, sz + (rnd() < 0.3 ? 1 : 0)); }

// lush grass sward — base green + darker blades + lighter tips + a few dry flecks
function grassCanvas(S = 256) {
  const c = canvas(S), x = c.getContext('2d'), rnd = lcg(0x6a5d1);
  x.fillStyle = '#4f6c2f'; x.fillRect(0, 0, S, S);
  speckle(x, rnd, S, '#3b5322', 1400, 2);
  speckle(x, rnd, S, '#5f8540', 1200, 2);
  speckle(x, rnd, S, '#6f9a4a', 600, 1);
  speckle(x, rnd, S, '#8a8a4d', 180, 1);                       // dry flecks
  for (let i = 0; i < 40; i++) { x.strokeStyle = rnd() < 0.5 ? '#3b5322' : '#638a44'; x.globalAlpha = 0.5; x.beginPath(); const bx = rnd() * S, by = rnd() * S; x.moveTo(bx, by); x.lineTo(bx + (rnd() - 0.5) * 6, by - 4 - rnd() * 5); x.stroke(); }
  x.globalAlpha = 1; return c;
}
// loose dirt / scree shoulder — brown earth + pebbles + grey grit
function dirtCanvas(S = 256) {
  const c = canvas(S), x = c.getContext('2d'), rnd = lcg(0x1d27a);
  x.fillStyle = '#6d5838'; x.fillRect(0, 0, S, S);
  speckle(x, rnd, S, '#5a4830', 1100, 2);
  speckle(x, rnd, S, '#86714f', 900, 2);
  for (let i = 0; i < 260; i++) { x.fillStyle = rnd() < 0.5 ? '#7d756a' : '#4a4036'; x.globalAlpha = 0.7 + rnd() * 0.3; const r = 1 + rnd() * 3; x.beginPath(); x.arc(rnd() * S, rnd() * S, r, 0, 6.283); x.fill(); }
  x.globalAlpha = 1; return c;
}
// bare cool-granite rock — LOW-freq blotches (large patches) + strata + angular fracture streaks + a little
// fine grain. Two scales so it reads as STONE, not the old high-freq "TV static" speckle.
function rockCanvas(S = 256) {
  const c = canvas(S), x = c.getContext('2d'), rnd = lcg(0x9b1c7);
  x.fillStyle = '#67655f'; x.fillRect(0, 0, S, S);            // cooler base grey
  // large soft blotches (the load-bearing variation — reads as weathered stone faces)
  for (let i = 0; i < 26; i++) { x.fillStyle = rnd() < 0.5 ? '#56544e' : '#76746c'; x.globalAlpha = 0.10 + rnd() * 0.14; const r = S * (0.08 + rnd() * 0.18); x.beginPath(); x.arc(rnd() * S, rnd() * S, r, 0, 6.283); x.fill(); }
  for (let y = 0; y < S; y += 11 + (rnd() * 18 | 0)) { x.fillStyle = rnd() < 0.5 ? '#5a584f' : '#74726a'; x.globalAlpha = 0.06 + rnd() * 0.07; x.fillRect(0, y, S, 2 + rnd() * 3); } // faint strata (low-contrast → no ruler-lines)
  x.globalAlpha = 1;
  speckle(x, rnd, S, '#7c7a72', 240, 1);                      // sparse fine grain (low contrast → no static)
  speckle(x, rnd, S, '#54514b', 240, 1);
  x.strokeStyle = '#3a3833'; x.lineWidth = 1.4;               // angular fracture streaks
  for (let i = 0; i < 12; i++) { let cx = rnd() * S, cy = rnd() * S; x.globalAlpha = 0.35; x.beginPath(); x.moveTo(cx, cy); for (let k = 0; k < 6; k++) { cx += (rnd() - 0.5) * S * 0.28; cy += (rnd() - 0.35) * S * 0.16; x.lineTo(cx, cy); } x.stroke(); }
  x.globalAlpha = 1; return c;
}

// forest floor — dark humus + rusty needle litter + leaf flecks + twigs (reads as "under trees")
function forestFloorCanvas(S = 256) {
  const c = canvas(S), x = c.getContext('2d'), rnd = lcg(0x4f3a2);
  x.fillStyle = '#3d3226'; x.fillRect(0, 0, S, S);
  speckle(x, rnd, S, '#2e2419', 1500, 2);
  speckle(x, rnd, S, '#4d4030', 1100, 2);
  speckle(x, rnd, S, '#6b4f2a', 700, 1);                       // needle litter (rusty)
  speckle(x, rnd, S, '#7d6a3c', 260, 1);                       // dry leaf flecks
  speckle(x, rnd, S, '#54683a', 220, 1);                       // moss dots
  x.strokeStyle = '#2a2015'; x.lineWidth = 1.2;                 // twigs
  for (let i = 0; i < 26; i++) { x.globalAlpha = 0.5; x.beginPath(); const bx = rnd() * S, by = rnd() * S, a = rnd() * 6.28; x.moveTo(bx, by); x.lineTo(bx + Math.cos(a) * (4 + rnd() * 8), by + Math.sin(a) * (4 + rnd() * 8)); x.stroke(); }
  x.globalAlpha = 1; return c;
}
// swamp peat — near-black wet earth + sedge-green wisps + oily sheen blotches
function peatCanvas(S = 256) {
  const c = canvas(S), x = c.getContext('2d'), rnd = lcg(0x77e21);
  x.fillStyle = '#2c2b20'; x.fillRect(0, 0, S, S);
  speckle(x, rnd, S, '#211f16', 1400, 2);
  speckle(x, rnd, S, '#3a3a26', 1000, 2);
  speckle(x, rnd, S, '#4c5a30', 520, 1);                       // sedge / algae green
  for (let i = 0; i < 30; i++) { x.fillStyle = rnd() < 0.5 ? '#1c1b13' : '#3f4434'; x.globalAlpha = 0.18 + rnd() * 0.2; const r = S * (0.04 + rnd() * 0.1); x.beginPath(); x.arc(rnd() * S, rnd() * S, r, 0, 6.283); x.fill(); } // wet blotches
  x.globalAlpha = 1; return c;
}
// worn dry ground — pale straw/sand hardpan + fine grit + pebbles (yards, aprons, traffic strips)
function sandCanvas(S = 256) {
  const c = canvas(S), x = c.getContext('2d'), rnd = lcg(0xc4d13);
  x.fillStyle = '#9a8d68'; x.fillRect(0, 0, S, S);
  speckle(x, rnd, S, '#8a7d5a', 1300, 2);
  speckle(x, rnd, S, '#ab9f7c', 1000, 2);
  speckle(x, rnd, S, '#7a6e50', 500, 1);
  for (let i = 0; i < 160; i++) { x.fillStyle = rnd() < 0.5 ? '#847a66' : '#6d6450'; x.globalAlpha = 0.6 + rnd() * 0.4; const r = 1 + rnd() * 2; x.beginPath(); x.arc(rnd() * S, rnd() * S, r, 0, 6.283); x.fill(); }
  x.globalAlpha = 1; return c;
}

// road surfaces — same procedural-canvas language as the ground, so ribbons share the terrain's vibe
function asphaltCanvas(S = 256) {
  const c = canvas(S), x = c.getContext('2d'), rnd = lcg(0xa5f17);
  x.fillStyle = '#7e7e84'; x.fillRect(0, 0, S, S);                 // mid grey (vertex colors carry the tone)
  speckle(x, rnd, S, '#6a6a70', 1600, 2);                          // aggregate
  speckle(x, rnd, S, '#93939a', 1200, 1);
  speckle(x, rnd, S, '#5c5c62', 500, 1);
  for (let i = 0; i < 9; i++) {                                    // faint cracks + tar lines
    let cx2 = rnd() * S, cy = rnd() * S; x.strokeStyle = rnd() < 0.5 ? '#5a5a60' : '#96969c'; x.globalAlpha = 0.35; x.lineWidth = 1.1;
    x.beginPath(); x.moveTo(cx2, cy); for (let k = 0; k < 5; k++) { cx2 += (rnd() - 0.5) * S * 0.2; cy += (rnd() - 0.3) * S * 0.14; x.lineTo(cx2, cy); } x.stroke();
  }
  x.globalAlpha = 1; return c;
}
function concreteCanvas(S = 256) {
  const c = canvas(S), x = c.getContext('2d'), rnd = lcg(0xc0dc7);
  x.fillStyle = '#8a8a84'; x.fillRect(0, 0, S, S);
  speckle(x, rnd, S, '#7a7a74', 1300, 2);
  speckle(x, rnd, S, '#9a9a93', 1000, 1);
  for (let i = 0; i < 14; i++) { x.strokeStyle = '#71716b'; x.globalAlpha = 0.3; x.lineWidth = 1; const bx = rnd() * S, by = rnd() * S, a = rnd() * 6.28; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(a) * 22, by + Math.sin(a) * 22); x.stroke(); } // hairline cracks
  x.globalAlpha = 1; return c;
}

let _tex = null;
export function terrainTextures() {
  if (_tex) return _tex;
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  _tex = { grass: mk(grassCanvas()), dirt: mk(dirtCanvas()), rock: mk(rockCanvas()),
           forest: mk(forestFloorCanvas()), peat: mk(peatCanvas()), sand: mk(sandCanvas()),
           asphalt: mk(asphaltCanvas()), concrete: mk(concreteCanvas()) };
  return _tex;
}

// ── road-ribbon material — vertex colors carry the tone/ruts, a triplanar GRAIN layer gives the same
// procedural-texture vibe as the ground (grayscale modulation so hues stay authored). One shared
// instance per surface class; zona ribbons are never disposed before map teardown.
const _ribbonMats = new Map();
export function ribbonMaterial(kind) {
  if (_ribbonMats.has(kind)) return _ribbonMats.get(kind);
  const tex = terrainTextures();
  const map = kind === 'asphalt' ? tex.asphalt : kind === 'panels' ? tex.concrete : tex.dirt;
  const scale = kind === 'asphalt' ? 0.30 : kind === 'panels' ? 0.34 : 0.42;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRib = { value: map };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\n vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>', 'varying vec3 vWPos;', 'varying vec3 vWNrm;', 'uniform sampler2D uRib;',
        'vec3 triColR(sampler2D t, vec3 wp, vec3 bw, float s){ vec3 cx=texture2D(t, wp.zy*s).rgb; vec3 cy=texture2D(t, wp.xz*s).rgb; vec3 cz=texture2D(t, wp.xy*s).rgb; return cx*bw.x+cy*bw.y+cz*bw.z; }',
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '{ vec3 n=normalize(vWNrm); vec3 bw=pow(abs(n), vec3(4.0)); bw/=(bw.x+bw.y+bw.z+1e-4);',
        `  float dl=dot(triColR(uRib, vWPos, bw, ${scale.toFixed(2)}), vec3(0.333));`,
        '  diffuseColor.rgb *= (0.42 + dl*1.18); }', // grayscale grain around 1.0 (canvas mid ≈ 0.5)
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'engendrosRibbon_' + kind;
  _ribbonMats.set(kind, mat);
  return mat;
}

// ── optional biome splat layer (zona map) — a world-XZ biome-weight texture (R=forest, G=swamp,
// B=dry, A=deadwood) switches the ground SUBSTRATE per region. Configured ONCE before the map's
// chunks build (world._buildZona → setBiomeSplat); maps that never set it get the exact original
// material (separate program cache key), so arena/steppe/demo/forest stay byte-identical.
let _biome = null;
export function setBiomeSplat(mapTexture, extent, map2 = null) { _biome = mapTexture ? { map: mapTexture, extent, map2 } : null; }

// A fresh MeshLambert per chunk (so per-chunk dispose is safe) that shares the texture singletons and one
// compiled program. World-space triplanar so it drops onto any heightfield/isosurface with NO UVs.
export function makeTerrainMaterial() {
  const tex = terrainTextures();
  const biome = _biome; // captured at material creation (chunks build after setBiomeSplat)
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrass = { value: tex.grass };
    shader.uniforms.uDirt = { value: tex.dirt };
    shader.uniforms.uRock = { value: tex.rock };
    if (biome) {
      shader.uniforms.uForestF = { value: tex.forest };
      shader.uniforms.uPeat = { value: tex.peat };
      shader.uniforms.uSand = { value: tex.sand };
      shader.uniforms.uBiome = { value: biome.map };
      shader.uniforms.uBiome2 = { value: biome.map2 || biome.map };
      shader.uniforms.uBExtent = { value: biome.extent };
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\n vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'varying vec3 vWPos;', 'varying vec3 vWNrm;',
        'uniform sampler2D uGrass;', 'uniform sampler2D uDirt;', 'uniform sampler2D uRock;',
        ...(biome ? ['uniform sampler2D uForestF;', 'uniform sampler2D uPeat;', 'uniform sampler2D uSand;', 'uniform sampler2D uBiome;', 'uniform sampler2D uBiome2;', 'uniform float uBExtent;'] : []),
        'vec3 triCol(sampler2D t, vec3 wp, vec3 bw, float s){ vec3 cx=texture2D(t, wp.zy*s).rgb; vec3 cy=texture2D(t, wp.xz*s).rgb; vec3 cz=texture2D(t, wp.xy*s).rgb; return cx*bw.x+cy*bw.y+cz*bw.z; }',
        // cheap value-noise for MACRO tonal variation (breaks the flat uniform green into drier/greener patches)
        'float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
        'float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1)); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }',
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '{ vec3 n=normalize(vWNrm); vec3 bw=pow(abs(n), vec3(4.0)); bw/=(bw.x+bw.y+bw.z+1e-4);',
        '  float slope=1.0-clamp(n.y,0.0,1.0);',                       // 0 flat → 1 vertical
        '  float gW=1.0-smoothstep(0.08,0.22,slope);',                 // grass <~25°
        '  float rW=smoothstep(0.26,0.40,slope);',                     // rock  >~42°
        biome
          ? '  float alt=smoothstep(60.0,95.0,vWPos.y);'               // zona: rock-line rides the massif scale (the forest tune bares 16 m knolls)
          : '  float alt=smoothstep(16.0,26.0,vWPos.y);',              // ALTITUDE → rock: the massif top is bare rock + lichen, not a grass cap
        '  gW*=(1.0-alt*0.80); rW=max(rW, alt*0.72);',
        '  float dW=clamp(1.0-gW-rW,0.0,1.0);',                        // dirt/scree shoulder
        // MACRO variation: two-octave low-freq noise → drier/greener patches (kills the flat uniform green)
        '  float macro=vnoise(vWPos.xz*0.028)*0.62 + vnoise(vWPos.xz*0.085)*0.38;',
        '  float dry=smoothstep(0.52,0.86,macro);',                    // patches that go dry/olive
        '  vec3 g=triCol(uGrass,vWPos,bw,0.22);',
        '  float gl=dot(g,vec3(0.30,0.60,0.10)); g=mix(g, vec3(gl), 0.22);', // desaturate (kills candy-green) but keep life
        '  g*=vec3(0.90,0.98,0.78);',                                  // mute toward a raw Soviet OLIVE/khaki (lifted a touch)
        '  vec3 d=triCol(uDirt,vWPos,bw,0.20)*vec3(0.96,0.92,0.84);',
        '  g=mix(g, d*0.95, smoothstep(0.28,0.06,macro)*0.40);',       // dirt bleeds into worn patches (lighter touch → not muddy)
        '  g=mix(g, g*vec3(0.92,0.94,0.70), dry);',                    // dry/dead-grass patches (muted olive, NOT orange)
        '  g*=(0.96+0.26*macro);',                                     // large-scale light/dark mottling (lifted floor → cold MEADOW, not dark mud)
        ...(biome ? [
          // ── biome SUBSTRATE splat (zona): the region map switches what "gentle ground" is made of.
          '  vec2 bUV=(vWPos.xz+vec2(uBExtent))/(2.0*uBExtent);',
          '  vec4 bio=texture2D(uBiome,bUV);',
          '  vec4 bio2=texture2D(uBiome2,bUV);',                       // R=sandy shore, G=underwater/wet
          '  vec3 ff=triCol(uForestF,vWPos,bw,0.24);',                 // dark humus + needle litter
          '  vec3 pt=triCol(uPeat,vWPos,bw,0.20);',                    // wet peat/marsh floor
          '  vec3 sd=triCol(uSand,vWPos,bw,0.22);',                    // worn hardpan/sand
          '  g=mix(g, ff*(0.92+0.16*macro), bio.r);',                  // forest floor under the woods
          '  g=mix(g, pt*(0.88+0.14*macro), bio.g);',                  // peat in the swamp basin
          '  g=mix(g, sd*(0.94+0.12*macro), bio.b*0.9);',              // traffic-worn aprons/strips
          '  g=mix(g, sd*vec3(1.04,1.0,0.88)*(0.95+0.12*macro), bio2.r);', // sandy shore strips along water
          '  float ash=bio.a;',                                        // massif dieback: ashen dead ground
          '  g=mix(g, vec3(dot(g,vec3(0.333)))*vec3(0.88,0.86,0.80), ash*0.75);',
          '  d=mix(d, vec3(dot(d,vec3(0.333)))*vec3(0.92,0.90,0.86), ash*0.55);',
        ] : []),
        '  vec3 rk=triCol(uRock,vWPos,bw,0.13);',
        '  rk*=0.92+0.08*sin(vWPos.y*0.8 + vnoise(vWPos.xz*0.06)*5.0);', // SUBTLE wavy strata (noise-broken, not ruler-straight contour lines across the mountain)
        '  rk*=(0.88+0.14*vnoise(vWPos.xz*0.12+vWPos.y*0.1));',        // rock blotching = the main variation now
        '  vec3 terr=g*gW+d*dW+rk*rW;',
        ...(biome ? [
          // underwater/wet ground: darken + cool the WHOLE substrate below the waterline (bed reads
          // as a different, submerged material through the translucent water sheet)
          '  terr=mix(terr, terr*vec3(0.40,0.46,0.50)+vec3(0.015,0.03,0.04), bio2.g*0.85);',
        ] : []),
        // FRESNEL rim-light on steep faces → cliff silhouette pops against the sky (BotW/Horizon legibility)
        '  vec3 V=normalize(cameraPosition-vWPos); float fres=pow(1.0-clamp(dot(V,n),0.0,1.0),3.2);',
        '  terr += rW*fres*vec3(0.10,0.105,0.12);',
        '  terr=mix(terr, vec3(0.40,0.43,0.33), smoothstep(20.0,30.0,vWPos.y)*gW*smoothstep(0.42,0.74,macro)*0.6);', // grey-green LICHEN scattered on high ledges by noise (not a solid orange toupee cap)
        '  terr=(terr-0.5)*1.07+0.5;',                                 // a touch more contrast (less washed-out / "thought-through")
        '  diffuseColor.rgb*=terr*1.10; }',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => (biome ? 'engendrosTerrainTriplanarBiome' : 'engendrosTerrainTriplanar');
  return mat;
}
