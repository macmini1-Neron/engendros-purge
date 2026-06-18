import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { buildSu24 } from './props.js';

const IL76_ASSET_URL = './assets/aircraft/low_poly_il-76.glb';
const IL76_TARGET_LENGTH = 46.6; // 1:1 — real Il-76 fuselage is 46.59 m and the game runs ~1 unit ≈ 1 m
// Auto-rigged GLB bone names of the landing gear — hidden so the IL-76 flies gear-up.
const IL76_HIDDEN_GEAR = new Set(['bone4_77', 'bone18_76', 'bone19_84', 'bone20_97', 'bone21_110']);

let _gltfLoader = null;
let _il76Promise = null;
let _il76Source = null;
let _il76Failed = false;
let _il76Runtime = null; // the ONE reused runtime instance — airdrops are never concurrent (callSupplyDrop
                         // tears down any airborne plane first), so cloning the multi-mesh GLB per drop
                         // (clone(true) + per-mesh geo/material clone) was a pure waste + a frame stall.

function loadGltf(url) {
  _gltfLoader = _gltfLoader || new GLTFLoader();
  return new Promise((resolve, reject) => _gltfLoader.load(url, resolve, undefined, reject));
}

function cloneForRuntime(root) {
  const clone = root.clone(true);
  clone.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry) o.geometry = o.geometry.clone();
    if (Array.isArray(o.material)) o.material = o.material.map((m) => (m ? m.clone() : m));
    else if (o.material) o.material = o.material.clone();
  });
  return clone;
}

function prepAircraftTree(root) {
  root.traverse((o) => {
    o.frustumCulled = false;
    if (IL76_HIDDEN_GEAR.has(o.name)) o.visible = false;
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
    }
  });
}

function fitIl76(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const rawLength = Math.max(0.001, size.z);
  const scale = IL76_TARGET_LENGTH / rawLength;
  root.scale.setScalar(scale);
  root.position.addScaledVector(center, -scale);
  root.updateMatrixWorld(true);
  return root;
}

export function preloadIl76AirdropModel() {
  if (_il76Promise || _il76Source || _il76Failed) return _il76Promise;
  _il76Promise = loadGltf(IL76_ASSET_URL)
    .then((gltf) => {
      _il76Source = gltf.scene;
      return _il76Source;
    })
    .catch((err) => {
      _il76Failed = true;
      console.warn('[aircraft] Failed to load IL-76 airdrop model; using Su-24 fallback.', err);
      return null;
    });
  return _il76Promise;
}

// opts.cache (default true): loot reuses ONE cached instance (airdrops are never concurrent) and the
// 4 plane-teardown sites skip disposing it. Callers with a DISPOSING lifecycle that don't honour
// `userData.reusable` (the admin AssetViewer's clear()) MUST pass { cache: false } to get a fresh,
// fully-disposable clone that never touches the shared singleton.
export function buildIl76AirdropModel(opts = {}) {
  if (!_il76Source) return null;
  const cache = opts.cache !== false;
  // Reuse the cached instance when it isn't currently airborne. No re-fit: loot._updatePlane drives
  // world position/rotation each frame (placePlane overwrites them anyway), so reuse is behaviour-
  // identical; re-running fitIl76 would wrongly reset scale to 1×. Hidden gear children stay hidden.
  if (cache && _il76Runtime && !_il76Runtime.parent) { _il76Runtime.visible = true; return _il76Runtime; }
  const root = cloneForRuntime(_il76Source);
  root.name = 'IL-76 airdrop aircraft';
  root.userData.isFallback = false; // the real GLB — loot._updatePlane reads this to decide whether to hot-swap
  prepAircraftTree(root);
  fitIl76(root);
  // Engine exhausts, in the plane's ROOT-LOCAL frame (the space _updatePlane feeds
  // through mesh.localToWorld). Solved via worldToLocal from each D-30 nacelle's
  // measured rear-face world position on the fitted 1:1 model, nudged 0.35 behind the
  // nozzle so the puff trails. Order: outer-L, inner-L, inner-R, outer-R.
  // (The earlier values were raw world coords stored where LOCAL was expected, so
  // localToWorld re-scaled them ~3.3× → contrails spawned far below/outside the jet.)
  root.userData.contrailPorts = [
    new THREE.Vector3(-3.30, 1.26, 2.39),
    new THREE.Vector3(-1.75, 1.33, 2.07),
    new THREE.Vector3(1.75, 1.33, 2.07),
    new THREE.Vector3(3.30, 1.26, 2.39),
  ];
  root.userData.contrailPuff = { size: 1.55, life: 4.0, color: 0xf0f4f7 };
  // Cache the FIRST built instance as the reusable one; mark it so disposeAircraftObject never frees
  // it. A rare concurrent fallthrough clone (not cached) stays disposable → no leak. With cache:false
  // (admin viewer) we never cache/mark → the returned clone is fully disposable by the caller.
  if (cache && !_il76Runtime) { _il76Runtime = root; root.userData.reusable = true; }
  return root;
}

export function buildIl76AirdropFallback() {
  const fallback = buildSu24();
  fallback.scale.setScalar(1.5);
  fallback.userData.isFallback = true; // stand-in until the GLB finishes loading; loot._updatePlane hot-swaps it out
  fallback.userData.contrailPorts = [
    new THREE.Vector3(-0.48, -0.05, 6.3),
    new THREE.Vector3(0.48, -0.05, 6.3),
  ];
  fallback.userData.contrailPuff = { size: 2.1, life: 3.4 };
  return fallback;
}

export function disposeAircraftObject(root) {
  if (!root) return;
  if (root.userData && root.userData.reusable) return; // the cached IL-76 is kept alive for reuse, never freed
  const geometries = new Set();
  const materials = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) if (mat) materials.add(mat);
  });
  for (const geometry of geometries) if (typeof geometry.dispose === 'function') geometry.dispose();
  for (const material of materials) if (typeof material.dispose === 'function') material.dispose();
}
