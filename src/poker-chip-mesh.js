// Instanceable dice-chip: ONE low-poly cylinder whose top ring + 6 edge spots are
// painted into a CanvasTexture (was 8 separate meshes: disc + torus + 6 boxes). One
// geometry shared by all denominations; one texture+material PER denomination colour.
// This is the simplification that lets the table render the REAL chip count cheaply —
// a full tray collapses from hundreds of meshes to ~one InstancedMesh per colour.
import * as THREE from 'three';

const R = 0.020, T = 0.0033, SEG = 16;
export const CHIP_GEO_T = T;
const DICE = {
  5: { body: '#e8e8e8', spot: '#24408f' }, 10: { body: '#2a52b0', spot: '#f0f0f0' },
  20: { body: '#b02828', spot: '#f0f0f0' }, 50: { body: '#1f8040', spot: '#f0f0f0' },
  100: { body: '#1a1a1a', spot: '#f0f0f0' }, 500: { body: '#d8b84a', spot: '#141414' },
};

let _geo = null;
function chipGeometry() {
  if (!_geo) _geo = new THREE.CylinderGeometry(R, R, T, SEG);   // top/side/bottom in one UV-mapped cylinder
  return _geo;
}
function chipTexture(denom) {
  const c = DICE[denom] || DICE[100];
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = c.body; ctx.fillRect(0, 0, 128, 128);                       // body colour fills cap + edge band
  ctx.strokeStyle = c.spot; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(64, 64, 40, 0, Math.PI * 2); ctx.stroke();         // inlay ring on the top face
  ctx.fillStyle = c.spot;
  for (let i = 0; i < 6; i++) {                                               // 6 "dice" spots near the rim
    const a = i * Math.PI / 3;
    ctx.beginPath(); ctx.arc(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54, 7, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

const _matCache = {};
export function chipMaterial(denom) {
  if (!_matCache[denom]) _matCache[denom] = new THREE.MeshLambertMaterial({ map: chipTexture(denom) });
  return _matCache[denom];
}

// One InstancedMesh per denomination, pre-allocated for `capacity` chips. The tray sets
// instance matrices from chiplayout.js placements; unused instances are excluded via count.
export function chipInstanced(denom, capacity) {
  const m = new THREE.InstancedMesh(chipGeometry(), chipMaterial(denom), capacity);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  return m;
}

// A single chip Mesh (shared geometry + cached per-denom material) — for transient FX like a thrown
// chip that arcs to the pot. Caller positions/rotates/removes it; never dispose the shared geo/material.
export function makeChip(denom) {
  return new THREE.Mesh(chipGeometry(), chipMaterial(denom));
}
