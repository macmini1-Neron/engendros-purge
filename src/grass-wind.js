// grass-wind.js — a WIND-SWAY material for the forest groundcover (the world-space surface-tell for the
// global wind: grass/flowers/reeds bend DOWNWIND, gusting). Dedicated material (NOT the shared voxelMaterial,
// so nothing else sways). Per-instance: the world wind is rotated into the tuft's local frame by its own yaw
// (read off instanceMatrix — no transpose(), robust on GLSL1/3), so after instancing every tuft leans the SAME
// world direction. Height-weighted (the top sways, the base is anchored). Uniforms tick from the WIND singleton.
import * as THREE from 'three';
import { voxelMaterial } from './util.js';
import { WIND } from './wind.js';

let _uniforms = null, _t = 0;

export function grassWindMaterial() {
  const m = voxelMaterial();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWindDir = { value: new THREE.Vector2(1, 0) };
    sh.uniforms.uWindSpeed = { value: 0.5 };
    sh.uniforms.uTime = { value: 0 };
    _uniforms = sh.uniforms;                       // capture for the per-frame tick (one shared material)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uWindDir;\nuniform float uWindSpeed;\nuniform float uTime;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  vec3 _iw = instanceMatrix[3].xyz;',                                  // tuft world position → gust phase
        '  float _gust = sin(uTime * 1.7 + _iw.x * 0.6 + _iw.z * 0.5) * 0.5 + 0.5;',
        '  float _amp = (0.07 + 0.20 * uWindSpeed) * (_gust * 0.7 + 0.3);',
        '  float _hw = max(transformed.y, 0.0);',                              // top sways, base anchored
        '  float _c = instanceMatrix[0][0], _s = -instanceMatrix[0][2];',      // cos·scale, sin·scale of the instance yaw
        '  float _inv = inversesqrt(_c * _c + _s * _s + 1e-6); float _cy = _c * _inv, _sy = _s * _inv;',
        '  vec2 _lw = vec2(uWindDir.x * _cy + uWindDir.y * _sy, -uWindDir.x * _sy + uWindDir.y * _cy);', // world wind → instance-local
        '  transformed.xz += _lw * _hw * _amp;',                               // instancing rotates it back → all lean DOWNWIND
        '#endif',
      ].join('\n'));
  };
  m.customProgramCacheKey = () => 'grassWindSway';
  return m;
}

// call once per frame (game loop). Cheap: 3 uniform writes on one material.
export function updateGrassWind(dt) {
  _t += (dt || 0);
  if (!_uniforms) return;
  _uniforms.uTime.value = _t;
  _uniforms.uWindDir.value.set(WIND.vx, WIND.vz);
  _uniforms.uWindSpeed.value = WIND.speed;
}
