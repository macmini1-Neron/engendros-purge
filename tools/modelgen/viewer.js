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
// --- rig animation: drive the model's named rig nodes by their userData.rig contract.
// Generic + reusable: 'spin' axes slew side-to-side, 'hinge' axes sweep their [lo,hi] range,
// 'slide' axes are SKIPPED (no firing/launch). Works for any rigged model, not just the S-75.
let anim = { playing: false, t0: 0 };
function rigNodes() { const out = []; if (model) model.traverse((o) => { if (o.userData && o.userData.rig && o.userData.rig.axis) out.push(o); }); return out; }
function tickAnim(tMs) {
  if (!anim.playing || !model) return;
  const t = (tMs - anim.t0) / 1000;
  for (const n of rigNodes()) {
    const rig = n.userData.rig, ax = rig.axis;
    if (rig.type === 'slide') continue;                                  // no firing/launch
    if (rig.type === 'spin') n.rotation[ax] = Math.sin(t * 0.32) * 1.35; // azimuth slew ±77°
    else if (rig.type === 'hinge' && Array.isArray(rig.range)) {
      const [lo, hi] = rig.range;                                        // sweep through the real range
      n.rotation[ax] = (lo + hi) / 2 + Math.sin(t * 0.5 + 0.6) * (hi - lo) / 2;
    }
  }
}
function restorePose() { for (const n of rigNodes()) n.rotation[n.userData.rig.axis] = n.userData.rig.pose ?? 0; }

function frame(t) { tickAnim(t || 0); resize(); applyCam(); renderer.render(scene, camera); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

window.VIEWER = {
  loadSpec(spec) {
    if (model) { scene.remove(model); model = null; }
    model = buildSpec(spec);
    scene.add(model);
    window.__MODEL = model;   // debug hook: lets Claude/Playwright inspect & toggle rig nodes by name

    const box = new THREE.Box3().setFromObject(model);
    box.getCenter(target);
    cam.dist = Math.max(2, box.getSize(new THREE.Vector3()).length() * 1.2);
    return true;
  },
  setCamera(az, el, dist) { cam = { az, el, dist: dist ?? cam.dist }; return cam; },
  setTarget(x, y, z) { target.set(x, y, z); return [x, y, z]; },   // re-aim orbit pivot (focus a sub-assembly)
  clear() { if (model) { scene.remove(model); model = null; } },
  play() { anim = { playing: true, t0: performance.now() }; return true; },
  stop() { anim.playing = false; restorePose(); return true; },
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
canvas.addEventListener('wheel', (e) => { cam.dist = Math.max(1, Math.min(80, cam.dist + e.deltaY * 0.01)); e.preventDefault(); syncSliders(); }, { passive: false });

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
$('play').addEventListener('click', () => {
  if (anim.playing) { window.VIEWER.stop(); $('play').textContent = '▶ animate'; }
  else { window.VIEWER.play(); $('play').textContent = '⏸ stop'; }
});

Object.assign(window.VIEWER, {
  wireframe(on) { wf = !!on; if (model) model.traverse((o) => { if (o.material) o.material.wireframe = wf; }); return wf; },
  overlay(url, opacity = 0.5) { overlayImg.src = url; overlayImg.style.opacity = opacity; $('op').value = opacity; return true; },
  snapshot() { renderer.render(scene, camera); return canvas.toDataURL('image/png'); },
});

// --- drag-drop reference images (F0: view-only; persistent save-to-ref/ is F1) ---
const drop = document.getElementById('drop');
const refs = document.getElementById('refs');
function addRef(url) {
  const im = document.createElement('img'); im.src = url; im.title = 'click → overlay';
  im.addEventListener('click', () => window.VIEWER.overlay(url, 0.5));
  refs.appendChild(im);
}
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('hot'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('hot'); }));
drop.addEventListener('drop', (e) => {
  for (const f of e.dataTransfer.files) if (f.type.startsWith('image/')) addRef(URL.createObjectURL(f));
});
// Claude can also inject a ref by URL/path (served over http) without a real drag:
window.VIEWER.addRef = (url) => { addRef(url); return true; };

// --- auto-load a model from ?model=<id> so a single URL shows it (no console needed) ---
// add &anim=1 to autoplay the rig animation.
const _params = new URLSearchParams(location.search), _autoId = _params.get('model');
if (_autoId) {
  fetch(`/models/${_autoId}/spec.json?cb=${Date.now()}`)
    .then((r) => r.json())
    .then((spec) => {
      window.VIEWER.loadSpec(spec); syncSliders();
      if (_params.get('anim')) { window.VIEWER.play(); $('play').textContent = '⏸ stop'; }
    })
    .catch((e) => console.warn('[viewer] auto-load of', _autoId, 'failed:', e));
}
