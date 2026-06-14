// Instanceable dice-chip: ONE low-poly cylinder whose top face (ring + spots / star / dashes) is
// painted into a CanvasTexture (was 8 separate meshes: disc + torus + 6 boxes). One geometry shared by
// all denominations; one texture+material PER (skin, denomination). This is the simplification that lets
// the table render the REAL chip count cheaply — a full tray collapses from hundreds of meshes to ~one
// InstancedMesh per colour. The actual top-face DESIGN comes from the pure CHIP_SKINS registry in
// poker/chipskins.js (drawChip) — this file is just the THREE wrapper, so swapping skins is free.
import * as THREE from 'three';
import { drawChip, getChipSkin } from './poker/chipskins.js';

const R = 0.020, T = 0.0033, SEG = 16;
export const CHIP_GEO_T = T;

let _geo = null;
function chipGeometry() {
  if (!_geo) _geo = new THREE.CylinderGeometry(R, R, T, SEG);   // top/side/bottom in one UV-mapped cylinder
  return _geo;
}
function chipTexture(denom) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  drawChip(cv.getContext('2d'), 128, denom, getChipSkin());     // body fills cap + edge band; pattern per skin
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// cache by (denom, skin) so switching skins builds fresh textures/materials but a re-switch is instant.
const _matCache = {};
export function chipMaterial(denom) {
  const key = denom + '|' + getChipSkin();
  if (!_matCache[key]) _matCache[key] = new THREE.MeshLambertMaterial({ map: chipTexture(denom) });
  return _matCache[key];
}

// One InstancedMesh per denomination, pre-allocated for `capacity` chips. The tray sets
// instance matrices from chiplayout.js placements; unused instances are excluded via count.
export function chipInstanced(denom, capacity) {
  const m = new THREE.InstancedMesh(chipGeometry(), chipMaterial(denom), capacity);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  return m;
}

// A single big chip for the crate showcase (a $20-red chip = the reference look). Bakes an EXPLICIT
// skin's texture off its own canvas — NEVER touches the shared getChipSkin() state, so opening a crate
// can't change the table's selected skin. Returns a Group whose child faces +Z, so the ceremony's
// Y-spin reads as a coin-flip reveal (portrait → edge → portrait).
export function buildShowcaseChip(denom, skinId) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  drawChip(cv.getContext('2d'), 256, denom, skinId);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const chip = new THREE.Mesh(new THREE.CylinderGeometry(R, R, R * 0.32, 40), new THREE.MeshLambertMaterial({ map: tex }));
  chip.rotation.x = Math.PI / 2;                 // cap faces +Z (toward the ceremony camera)
  const g = new THREE.Group(); g.add(chip);
  return g;
}
