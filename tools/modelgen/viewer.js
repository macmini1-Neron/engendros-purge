import * as THREE from 'three';
import { buildSpec } from '../../src/props/voxel-interp.js';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1a1e);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
const target = new THREE.Vector3(0, 0.5, 0);
let cam = { az: 45, el: 22, dist: 4 };

scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(4, 8, 5); scene.add(key);
const grid = new THREE.GridHelper(10, 20, 0x444450, 0x2c2c34); scene.add(grid);

let model = null;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
function applyCam() {
  const az = THREE.MathUtils.degToRad(cam.az), el = THREE.MathUtils.degToRad(cam.el);
  camera.position.set(
    target.x + cam.dist * Math.cos(el) * Math.sin(az),
    target.y + cam.dist * Math.sin(el),
    target.z + cam.dist * Math.cos(el) * Math.cos(az),
  );
  camera.lookAt(target);
}
function frame() { resize(); applyCam(); renderer.render(scene, camera); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

window.VIEWER = {
  loadSpec(spec) {
    if (model) { scene.remove(model); model = null; }
    model = buildSpec(spec);
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    box.getCenter(target);
    cam.dist = Math.max(2, box.getSize(new THREE.Vector3()).length() * 1.2);
    return true;
  },
  setCamera(az, el, dist) { cam = { az, el, dist: dist ?? cam.dist }; return cam; },
  clear() { if (model) { scene.remove(model); model = null; } },
};
window.addEventListener('resize', resize);
