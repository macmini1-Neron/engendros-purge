// viewer.js — the buildgen self-verify viewer (modelgen viewer pattern, building-flavoured).
// Adds over modelgen: collider overlay (yellow AABBs vs the visual mesh), eye-height
// door/interior views + a 300 m fog shot for landmark legibility, drag-drop reference
// upload (Pillar B), and snapshot() SELF-CHECKS that fail loudly on blank renders,
// out-of-frustum models, or a missing collider/ref overlay — the modelgen
// white-screenshot incident, mechanised.
import * as THREE from 'three';
import { buildBuilding } from '../../src/buildings/interp.js';
import { registerModel, hasModel } from '../../src/props/registry-core.js';
import { faceFrame, faceToWorld } from '../../src/buildings/operators/_math.js';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x222230);
scene.background = SKY;
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
const target = new THREE.Vector3(0, 1.6, 0);
let cam = { mode: 'orbit', az: 35, el: 14, dist: 18 };
const freePos = new THREE.Vector3(), freeLook = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.05));
const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(14, 22, 16); scene.add(key);
scene.add(new THREE.GridHelper(60, 60, 0x3a3a48, 0x26262f));

let building = null;       // THREE.Group
let lastBuild = null;      // { group, colliders, stats, warns, infos }
let spec = null;
let colGroup = null;       // collider overlay
let ghostGroup = null;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
function applyCam() {
  if (cam.mode === 'free') { camera.position.copy(freePos); camera.lookAt(freeLook); return; }
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

// Canonical sweep. front looks at the N face (az 0 = camera north of the building).
// graze exposes z-fighting; far300 proves the silhouette survives fog; door/interior
// are eye-height player views — the viewer proves the model, only the game proves
// the building, but these two get close.
const VIEWS = {
  front: { az: 0, el: 10 },
  q34: { az: 35, el: 14 },
  side: { az: 90, el: 10 },
  back34: { az: 215, el: 14 },
  top: { az: 10, el: 75 },
  graze: { az: 28, el: 4 },
  far300: { az: 25, el: 3, dist: 300 },
};

function setFog(on) {
  // 80–600 m ≈ the game's generous steppe fog: a silhouette must SURVIVE 300 m, not vanish.
  scene.fog = on ? new THREE.Fog(0x33333f, 80, 600) : null;
  scene.background = on ? new THREE.Color(0x33333f) : SKY;
}

function firstEntrance() {
  const p = spec?.parts?.find((x) => x.op === 'doorway' || x.op === 'gateOpening');
  if (!p) return null;
  const wallT = spec.parts.find((x) => x.op === 'shellBox')?.args?.wall ?? 0.3;
  const f = faceFrame(p.args.face, spec.footprint, wallT);
  const uc = f.L / 2 + (p.args.offset ?? 0);
  const [x, , z] = faceToWorld(f, uc, 0);
  const ox = f.axis === 'z' ? f.out : 0, oz = f.axis === 'x' ? f.out : 0;
  return { x, z, ox, oz, height: p.args.height };
}

function clearExtras() {
  if (colGroup) { scene.remove(colGroup); colGroup = null; }
  if (ghostGroup) { scene.remove(ghostGroup); ghostGroup = null; }
}

window.VIEWER = {
  // Load by id: fetches buildings/<id>/spec.json + ref/dossier.json (cache-busted),
  // PRE-REGISTERS every propRef'd modelgen model, builds, reports dims + diagnostics.
  async load(id) {
    const cb = `?cb=${Date.now()}`;
    const s = await (await fetch(`/buildings/${id}/spec.json${cb}`, { cache: 'no-store' })).json();
    let dossier;
    try { dossier = await (await fetch(`/buildings/${id}/ref/dossier.json${cb}`, { cache: 'no-store' })).json(); } catch { /* fixtures may have none */ }
    for (const p of s.parts ?? []) {
      if (p.op === 'propRef' && !hasModel(p.args.model)) {
        try { registerModel(p.args.model, await (await fetch(`/models/${p.args.model}/spec.json${cb}`)).json()); }
        catch { console.warn(`[buildgen] could not fetch prop '${p.args.model}'`); }
      }
    }
    return this.loadSpec(s, dossier);
  },

  loadSpec(s, dossier) {
    if (building) { scene.remove(building); building = null; }
    clearExtras();
    lastBuild = buildBuilding(s, { dossier });        // throws with the law list on ERRORs
    spec = s;
    building = lastBuild.group;
    scene.add(building);
    window.__BUILDING = building;
    const box = new THREE.Box3().setFromObject(building);
    box.getCenter(target);
    cam = { mode: 'orbit', az: 35, el: 14, dist: Math.max(8, box.getSize(new THREE.Vector3()).length() * 1.3) };
    for (const w of lastBuild.warns) console.warn(`[buildgen] ⚠ ${w}`);
    for (const i of lastBuild.infos) console.info(`[buildgen] ℹ ${i}`);
    const d = this.dims();
    document.getElementById('info').textContent =
      `${s.id}: ${d.w_m}×${d.h_m}×${d.d_m} m · ${lastBuild.stats.colliderCount} colliders · ~${lastBuild.stats.tris} tris · mats: ${lastBuild.stats.materials.join(', ')}`;
    return { dims: d, boxes: lastBuild.stats.colliderCount, stats: lastBuild.stats, warns: lastBuild.warns, infos: lastBuild.infos, needs: s.needs ?? [] };
  },

  // Numeric truth — compare to the dossier numbers immediately after every load.
  dims() {
    if (!building) return null;
    const box = new THREE.Box3().setFromObject(building);
    const s = box.getSize(new THREE.Vector3());
    return { w_m: +s.x.toFixed(3), h_m: +s.y.toFixed(3), d_m: +s.z.toFixed(3), min_y: +box.min.y.toFixed(3), footprint: spec?.footprint ?? null };
  },

  // Yellow AABBs = what the game will collide with; cyan = the declared footprint.
  colliders(on = true) {
    if (colGroup) { scene.remove(colGroup); colGroup = null; }
    if (!on || !lastBuild) return false;
    colGroup = new THREE.Group();
    for (const c of lastBuild.colliders) {
      colGroup.add(new THREE.Box3Helper(new THREE.Box3(
        new THREE.Vector3(...c.min), new THREE.Vector3(...c.max)), 0xf2d24a));
    }
    if (spec?.footprint) {
      const f = spec.footprint;
      colGroup.add(new THREE.Box3Helper(new THREE.Box3(
        new THREE.Vector3(-f.w / 2, 0, -f.d / 2), new THREE.Vector3(f.w / 2, f.h, f.d / 2)), 0x4ad8d8));
    }
    scene.add(colGroup);
    return true;
  },

  // 1.75 m human at the entrance — THE scale check (doors ≈ 1.26× the ghost).
  ghost(on = true) {
    if (ghostGroup) { scene.remove(ghostGroup); ghostGroup = null; }
    if (!on) return false;
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x6a7c8c, transparent: true, opacity: 0.7 });
    const add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); };
    add(0.13, 0.85, 0.16, -0.1, 0.425, 0); add(0.13, 0.85, 0.16, 0.1, 0.425, 0);
    add(0.40, 0.58, 0.20, 0, 1.14, 0);
    add(0.18, 0.24, 0.20, 0, 1.63, 0);
    const door = firstEntrance();
    if (door) g.position.set(door.x + door.ox * 1.2, 0, door.z + door.oz * 1.2);
    else g.position.x = (spec?.footprint?.w ?? 4) / 2 + 0.8;
    scene.add(g); ghostGroup = g;
    return true;
  },

  views() { return { ...VIEWS, door: 'eye-height outside the first entrance', interior: 'eye-height at the centre' }; },
  view(name) {
    setFog(name === 'far300');
    if (name === 'door') {
      const d = firstEntrance();
      if (!d) throw new Error('no doorway/gateOpening in the spec');
      cam.mode = 'free';
      freePos.set(d.x + d.ox * 7, 1.65, d.z + d.oz * 7);
      freeLook.set(d.x, d.height / 2, d.z);
      applyCam();
      return { mode: 'free', at: freePos.toArray() };
    }
    if (name === 'interior') {
      const d = firstEntrance();
      cam.mode = 'free';
      freePos.set(0, 1.65, 0);
      freeLook.set(d ? d.x : 2, 1.5, d ? d.z : 0);
      applyCam();
      return { mode: 'free', at: freePos.toArray() };
    }
    const v = VIEWS[name];
    if (!v) throw new Error(`unknown view '${name}' — one of ${Object.keys(VIEWS).join('/')}/door/interior`);
    cam = { ...cam, mode: 'orbit', ...v };
    applyCam();                                       // apply NOW — snapshot() must not lag a frame
    return cam;
  },

  fps(x, y, z, lookX, lookY, lookZ) {                 // free first-person placement for the interior walk
    cam.mode = 'free';
    freePos.set(x, y, z);
    freeLook.set(lookX ?? 0, lookY ?? y, lookZ ?? 0);
    applyCam();
    return { mode: 'free', at: [x, y, z] };
  },

  setCamera(az, el, dist) { cam = { mode: 'orbit', az, el, dist: dist ?? cam.dist }; applyCam(); return cam; },
  setTarget(x, y, z) { target.set(x, y, z); applyCam(); return [x, y, z]; },

  // Snapshot with SELF-CHECKS — a capture that cannot fail is decoration.
  // opts: { minColours, expectColliders, expectRef }
  snapshot(opts = {}) {
    resize(); applyCam(); renderer.render(scene, camera);
    const dataURL = canvas.toDataURL('image/png');
    const failures = [];
    const c2 = document.createElement('canvas'); c2.width = c2.height = 64;
    const x2 = c2.getContext('2d');
    x2.drawImage(canvas, 0, 0, 64, 64);
    const px = x2.getImageData(0, 0, 64, 64).data;
    const distinct = new Set();
    for (let i = 0; i < px.length; i += 4) distinct.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4));
    const minColours = opts.minColours ?? (cam.mode === 'orbit' && cam.dist > 100 ? 3 : cam.el <= 5 ? 5 : 8);
    if (distinct.size < minColours) failures.push(`blank/single-colour render (${distinct.size} distinct colours < ${minColours})`);
    if (!building) failures.push('no building loaded');
    else {
      const box = new THREE.Box3().setFromObject(building);
      let cornersIn = 0;
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
        if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z >= -1 && v.z <= 1) cornersIn++;
      }
      // standing INSIDE the building (interior walk) is looking at it too
      if (!cornersIn && !box.containsPoint(camera.position)) {
        failures.push('model out of frustum — the camera is not looking at the building');
      }
    }
    if (opts.expectColliders && lastBuild?.colliders?.length && !colGroup) failures.push('collider overlay empty while collide parts exist');
    if (opts.expectRef && (!overlayImg.src || +overlayImg.style.opacity === 0)) failures.push('reference overlay missing during the reference-confirm stage');
    return { dataURL, ok: failures.length === 0, failures };
  },

  wireframe(on) { if (building) building.traverse((o) => { if (o.material && !o.material.transparent) o.material.wireframe = !!on; }); return !!on; },
  overlay(url, opacity = 0.5) { overlayImg.src = url; overlayImg.style.opacity = opacity; document.getElementById('op').value = opacity; return true; },
  addRef(url) { addRef(url); return true; },
  clear() { if (building) { scene.remove(building); building = null; } clearExtras(); spec = null; lastBuild = null; },
};

// --- mouse orbit + sliders (human use) ---
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.mode = 'orbit';
  cam.az = (cam.az - (e.clientX - drag.x) * 0.4 + 360) % 360;
  cam.el = Math.max(-10, Math.min(85, cam.el + (e.clientY - drag.y) * 0.3));
  drag = { x: e.clientX, y: e.clientY };
  syncSliders();
});
canvas.addEventListener('wheel', (e) => { cam.dist = Math.max(2, Math.min(320, cam.dist + e.deltaY * 0.05)); e.preventDefault(); syncSliders(); }, { passive: false });

const $ = (id) => document.getElementById(id);
function syncSliders() { $('az').value = cam.az | 0; $('el').value = cam.el | 0; $('dist').value = cam.dist | 0; }
for (const k of ['az', 'el', 'dist']) $(k).addEventListener('input', () => { cam.mode = 'orbit'; cam[k] = +$(k).value; });
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => window.VIEWER.view(b.dataset.view));
$('snap').addEventListener('click', () => {
  const s = window.VIEWER.snapshot();
  const a = document.createElement('a'); a.download = `${spec?.id ?? 'building'}.png`; a.href = s.dataURL; a.click();
  if (!s.ok) console.warn('[buildgen] snapshot self-check FAILED:', s.failures);
});
$('ghostBtn').addEventListener('click', () => window.VIEWER.ghost(!ghostGroup));
$('colBtn').addEventListener('click', () => window.VIEWER.colliders(!colGroup));
let wfOn = false;
$('wf').addEventListener('click', () => { wfOn = !wfOn; window.VIEWER.wireframe(wfOn); });
const overlayImg = $('overlay');
$('op').addEventListener('input', () => { overlayImg.style.opacity = $('op').value; });

// --- drag-drop reference intake (Pillar B): saved to buildings/<id>/ref/ via the dev server ---
const drop = $('drop');
const refs = $('refs');
function addRef(url) {
  const im = document.createElement('img'); im.src = url; im.title = 'click → overlay';
  im.addEventListener('click', () => window.VIEWER.overlay(url, 0.5));
  refs.appendChild(im);
}
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('hot'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('hot'); }));
drop.addEventListener('drop', async (e) => {
  for (const f of e.dataTransfer.files) {
    if (!f.type.startsWith('image/')) continue;
    if (spec?.id) {
      try {
        const r = await (await fetch(`/upload?id=${encodeURIComponent(spec.id)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f })).json();
        if (r.ok) { addRef(r.path); console.log(`[buildgen] reference saved → ${r.path}`); continue; }
        console.warn('[buildgen] upload rejected:', r.error);
      } catch { console.warn('[buildgen] no upload endpoint (python http.server?) — view-only ref'); }
    }
    addRef(URL.createObjectURL(f));                   // fallback: view-only
  }
});

// --- ?model=<id> autoload ---
const autoload = new URLSearchParams(location.search).get('model');
if (autoload) {
  window.VIEWER.load(autoload)
    .then((r) => console.log(`[buildgen] loaded '${autoload}'`, r))
    .catch((e) => console.error(`[buildgen] autoload '${autoload}' failed:`, e));
}
