import * as THREE from 'three';
import { buildSpec } from '../../src/props/voxel-interp.js';
import { validateSpec } from '../../src/props/spec.js';
import { boundsOf } from '../../src/props/bounds.js';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1a1e);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
const target = new THREE.Vector3(0, 0.5, 0);
let cam = { az: 45, el: 22, dist: 4 };

scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(4, 8, 5); scene.add(key);
const grid = new THREE.GridHelper(10, 20, 0x444450, 0x2c2c34); scene.add(grid);

let model = null;
let spec = null;          // last loaded spec (for footprint helpers)
let helpers = null;       // bbox helper group
let ghostGroup = null;    // 1.75 m human silhouette

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
// 'spin' axes slew side-to-side, 'hinge' axes sweep their [lo,hi] range, 'slide' skipped.
let anim = { playing: false, t0: 0 };
function rigNodes() { const out = []; if (model) model.traverse((o) => { if (o.userData && o.userData.rig && o.userData.rig.axis) out.push(o); }); return out; }
function tickAnim(tMs) {
  if (!anim.playing || !model) return;
  const t = (tMs - anim.t0) / 1000;
  for (const n of rigNodes()) {
    const rig = n.userData.rig, ax = rig.axis;
    if (rig.type === 'slide') continue;
    if (rig.type === 'spin') n.rotation[ax] = Math.sin(t * 0.32) * 1.35;
    else if (rig.type === 'hinge' && Array.isArray(rig.range)) {
      const [lo, hi] = rig.range;
      n.rotation[ax] = (lo + hi) / 2 + Math.sin(t * 0.5 + 0.6) * (hi - lo) / 2;
    }
  }
}
function restorePose() { for (const n of rigNodes()) n.rotation[n.userData.rig.axis] = n.userData.rig.pose ?? 0; }

function frame(t) { tickAnim(t || 0); resize(); applyCam(); renderer.render(scene, camera); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

const mm = (v) => Math.round(v * 1000);

// The canonical verify sweep. A model is only "seen" once it has been shot —
// and Read back — from every one of these (grazing angles expose the
// z-fighting that head-on views hide; 'back' shows hinge-side detail).
const VIEWS = {
  front: { az: 0, el: 12 },
  q34: { az: 35, el: 18 },
  side: { az: 90, el: 12 },
  back34: { az: 215, el: 18 },
  top: { az: 10, el: 75 },
  graze: { az: 28, el: 7 },
};

function clearExtras() {
  if (helpers) { scene.remove(helpers); helpers = null; }
  if (ghostGroup) { scene.remove(ghostGroup); ghostGroup = null; }
}

window.VIEWER = {
  // Load a spec OBJECT (raw) — prefer load('<id>') below, which also fetches
  // the dossier and cross-checks provenance.
  loadSpec(s, dossier = null) {
    if (model) { scene.remove(model); model = null; }
    clearExtras();
    validateSpec(s, dossier ? { dossier } : {});      // throw early, with the dossier cross-check when we have it
    spec = s;
    model = buildSpec(s);
    scene.add(model);
    window.__MODEL = model;   // debug hook: inspect & toggle rig nodes by name via Playwright
    const box = new THREE.Box3().setFromObject(model);
    box.getCenter(target);
    cam.dist = Math.max(1.2, box.getSize(new THREE.Vector3()).length() * 1.6);
    return this.dims();
  },

  // Load by model id: fetches models/<id>/spec.json + ref/dossier.json
  // (cache-busted), validates spec AGAINST the dossier, reports dims + needs.
  async load(id) {
    const cb = `?cb=${Date.now()}`;
    const spec_ = await (await fetch(`/models/${id}/spec.json${cb}`, { cache: 'no-store' })).json();
    let dossier = null;
    try { dossier = await (await fetch(`/models/${id}/ref/dossier.json${cb}`, { cache: 'no-store' })).json(); } catch { /* fixtures may have none */ }
    const dims = this.loadSpec(spec_, dossier);
    const needs = [...(spec_.needs || []), ...((dossier && dossier.needs) || [])];
    if (needs.length) console.warn(`[modelgen] ${id} needs[]:\n - ` + needs.join('\n - '));
    return { dims, needs, footprint: spec_.footprint };
  },

  // Numeric truth about what actually got built — compare to the dossier
  // numbers after EVERY load (the eyes lie at unknown scale; this doesn't).
  dims() {
    if (!model) return null;
    const box = new THREE.Box3().setFromObject(model);
    const s = box.getSize(new THREE.Vector3());
    return {
      w_m: +s.x.toFixed(4), h_m: +s.y.toFixed(4), d_m: +s.z.toFixed(4),
      w_mm: mm(s.x), h_mm: mm(s.y), d_mm: mm(s.z),
      min_y: +box.min.y.toFixed(4),
      footprint: spec?.footprint ?? null,
    };
  },

  // Toggle the actual-AABB (yellow) vs declared-footprint (cyan) wireframes.
  bbox(on = true) {
    if (helpers) { scene.remove(helpers); helpers = null; }
    if (!on || !model) return false;
    helpers = new THREE.Group();
    helpers.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(model), 0xd8b15a));
    if (spec?.footprint) {
      const f = spec.footprint;
      const fb = new THREE.Box3(new THREE.Vector3(-f.w / 2, 0, -f.d / 2), new THREE.Vector3(f.w / 2, f.h, f.d / 2));
      helpers.add(new THREE.Box3Helper(fb, 0x4ad8d8));
    }
    scene.add(helpers);
    return true;
  },

  // A 1.75 m human silhouette beside the model — THE scale sanity check.
  // (A 280 m ammo box looks perfectly normal alone in a viewer; it does not
  // look normal next to a person.)
  ghost(on = true) {
    if (ghostGroup) { scene.remove(ghostGroup); ghostGroup = null; }
    if (!on) return false;
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x6a7c8c, transparent: true, opacity: 0.65 });
    const add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); };
    add(0.13, 0.85, 0.16, -0.1, 0.425, 0); add(0.13, 0.85, 0.16, 0.1, 0.425, 0);   // legs
    add(0.40, 0.58, 0.20, 0, 1.14, 0);                                              // torso
    add(0.18, 0.24, 0.20, 0, 1.63, 0);                                              // head → 1.75 m
    const off = (spec?.footprint?.w ?? 1) / 2 + 0.45;
    g.position.x = off;
    scene.add(g); ghostGroup = g;
    return true;
  },

  views() { return VIEWS; },
  view(name) {
    const v = VIEWS[name];
    if (!v) throw new Error(`unknown view '${name}' — one of ${Object.keys(VIEWS).join('/')}`);
    cam = { ...cam, ...v };
    applyCam();                                  // apply NOW — snapshot() must not lag a frame
    return cam;
  },

  setCamera(az, el, dist) { cam = { az, el, dist: dist ?? cam.dist }; applyCam(); return cam; },
  setTarget(x, y, z) { target.set(x, y, z); applyCam(); return [x, y, z]; },   // re-aim orbit pivot (focus a sub-assembly)
  play() { anim = { playing: true, t0: performance.now() }; return true; },
  stop() { anim.playing = false; restorePose(); return true; },
  clear() { if (model) { scene.remove(model); model = null; } clearExtras(); spec = null; },
  // capture() — force a fresh render of the CURRENT camera and return a data-URL. Lets an agent
  // grab a deterministic frame via browser_evaluate (no flaky screenshot tool, no drawing-buffer
  // race — preserveDrawingBuffer is on). Pass jpeg quality 0..1; default jpeg 0.85.
  capture(q) { resize(); applyCam(); renderer.render(scene, camera); return canvas.toDataURL('image/jpeg', q ?? 0.85); },
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
canvas.addEventListener('wheel', (e) => { cam.dist = Math.max(0.5, Math.min(80, cam.dist + e.deltaY * 0.01)); e.preventDefault(); syncSliders(); }, { passive: false });

// --- sliders ---
const $ = (id) => document.getElementById(id);
function syncSliders() { $('az').value = cam.az | 0; $('el').value = cam.el | 0; $('dist').value = cam.dist.toFixed(1); }
for (const k of ['az', 'el', 'dist']) $(k).addEventListener('input', () => { cam[k] = +$(k).value; });

// --- wireframe / snapshot / overlay / ghost / bbox buttons ---
let wf = false;
$('wf').addEventListener('click', () => { wf = !wf; if (model) model.traverse((o) => { if (o.material) o.material.wireframe = wf; }); });
$('snap').addEventListener('click', () => {
  renderer.render(scene, camera);
  const a = document.createElement('a'); a.download = 'snap.png'; a.href = canvas.toDataURL('image/png'); a.click();
});
$('ghostBtn')?.addEventListener('click', () => window.VIEWER.ghost(!ghostGroup));
$('bboxBtn')?.addEventListener('click', () => window.VIEWER.bbox(!helpers));
$('play')?.addEventListener('click', () => {
  if (anim.playing) { window.VIEWER.stop(); $('play').textContent = '▶ animate'; }
  else { window.VIEWER.play(); $('play').textContent = '⏸ stop'; }
});
const overlayImg = document.getElementById('overlay');
$('op').addEventListener('input', () => { overlayImg.style.opacity = $('op').value; });

Object.assign(window.VIEWER, {
  wireframe(on) { wf = !!on; if (model) model.traverse((o) => { if (o.material) o.material.wireframe = wf; }); return wf; },
  overlay(url, opacity = 0.5) { overlayImg.src = url; overlayImg.style.opacity = opacity; $('op').value = opacity; return true; },
  snapshot() { resize(); applyCam(); renderer.render(scene, camera); return canvas.toDataURL('image/png'); },
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

// --- ?model=<id> autoload ---
const autoload = new URLSearchParams(location.search).get('model');
if (autoload) {
  window.VIEWER.load(autoload)
    .then((r) => console.log(`[modelgen] loaded '${autoload}'`, r))
    .catch((e) => console.error(`[modelgen] autoload '${autoload}' failed:`, e));
}
