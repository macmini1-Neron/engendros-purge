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

// --- mouse orbit (human use) ---
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.az = (cam.az - (e.clientX - drag.x) * 0.4 + 360) % 360;
  cam.el = Math.max(-80, Math.min(80, cam.el + (e.clientY - drag.y) * 0.3));
  drag = { x: e.clientX, y: e.clientY };
  syncSliders();
});
canvas.addEventListener('wheel', (e) => { cam.dist = Math.max(1, Math.min(12, cam.dist + e.deltaY * 0.002)); e.preventDefault(); }, { passive: false });

// --- sliders ---
const $ = (id) => document.getElementById(id);
function syncSliders() { $('az').value = cam.az | 0; $('el').value = cam.el | 0; $('dist').value = cam.dist.toFixed(1); }
for (const k of ['az', 'el', 'dist']) $(k).addEventListener('input', () => { cam[k] = +$(k).value; });

// --- wireframe / snapshot / overlay ---
let wf = false;
$('wf').addEventListener('click', () => { wf = !wf; if (model) model.traverse((o) => { if (o.material) o.material.wireframe = wf; }); });
$('snap').addEventListener('click', () => {
  renderer.render(scene, camera);
  const a = document.createElement('a'); a.download = 'snap.png'; a.href = canvas.toDataURL('image/png'); a.click();
});
const overlayImg = document.getElementById('overlay');
$('op').addEventListener('input', () => { overlayImg.style.opacity = $('op').value; });

Object.assign(window.VIEWER, {
  wireframe(on) { wf = !!on; if (model) model.traverse((o) => { if (o.material) o.material.wireframe = wf; }); return wf; },
  overlay(url, opacity = 0.5) { overlayImg.src = url; overlayImg.style.opacity = opacity; $('op').value = opacity; return true; },
  snapshot() { renderer.render(scene, camera); return canvas.toDataURL('image/png'); },
});
