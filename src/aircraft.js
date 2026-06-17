import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { buildSu24 } from './props.js';

const IL76_ASSET_URL = './assets/aircraft/low_poly_il-76.glb';
const IL76_TARGET_LENGTH = 36;
const IL76_HIDDEN_GEAR = new Set(['bone4_77', 'bone18_76', 'bone19_84', 'bone20_97', 'bone21_110']);

let _gltfLoader = null;
let _il76Promise = null;
let _il76Source = null;
let _il76Failed = false;

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

export function buildIl76AirdropModel() {
  if (!_il76Source) return null;
  const root = cloneForRuntime(_il76Source);
  root.name = 'IL-76 airdrop aircraft';
  prepAircraftTree(root);
  fitIl76(root);
  // Measured from the GLB nacelle tail edges after fitting the 46.6 m IL-76
  // to 36 in-game units; smoke now starts at the four actual engine exits.
  root.userData.contrailPorts = [
    new THREE.Vector3(-8.46, -2.79, 1.2),
    new THREE.Vector3(-4.49, -2.63, 0.4),
    new THREE.Vector3(4.49, -2.63, 0.4),
    new THREE.Vector3(8.46, -2.79, 1.2),
  ];
  root.userData.contrailPuff = { size: 1.55, life: 4.0, color: 0xf0f4f7 };
  return root;
}

export function buildIl76AirdropFallback() {
  const fallback = buildSu24();
  fallback.scale.setScalar(1.5);
  fallback.userData.contrailPorts = [
    new THREE.Vector3(-0.48, -0.05, 6.3),
    new THREE.Vector3(0.48, -0.05, 6.3),
  ];
  fallback.userData.contrailPuff = { size: 2.1, life: 3.4 };
  return fallback;
}

export function disposeAircraftObject(root) {
  if (!root) return;
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
