// assetpreview.js — standalone localhost asset viewer (asset-preview.html). Lists every weapon, click
// to load its 3D model in free space; the model auto-spins (toggle), an ULTRA-FINE orbit/pan/dolly cam
// lets you nudge the view a few pixels at a time, and the wheel zooms. Reuses the game's WEAPONS
// registry + buildViewmodel (so it shows the real GLB models once they stream in). No game state here.
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER, buildViewmodel, buildMag } from './weapons.js';
import { clamp } from './util.js';

// ── Ultra-fine orbit camera ─────────────────────────────────────────────────────────────────────
// Spherical orbit (azimuth/polar) around a target, with pan + dolly. Sensitivity is deliberately tiny
// (rad-per-pixel) so a drag nudges the view a few degrees — never a whole-scene jump. `sensMult` (a
// slider) scales it live. LMB = orbit, Shift/RMB drag = pan, wheel = zoom.
class OrbitCam {
  constructor(camera, dom) {
    this.cam = camera; this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this.az = 0.7; this.pol = 1.25; this.dist = 3;
    this.orbitSens = 0.0030;   // rad / pixel — ultra fine
    this.panSens = 0.0016;     // world units / pixel, scaled by distance
    this.zoomSens = 0.0011;    // per wheel delta
    this.minDist = 0.15; this.maxDist = 40;
    this.sensMult = 1;
    this._mode = null; this._lx = 0; this._ly = 0;
    this._bind();
  }
  _bind() {
    const d = this.dom;
    d.addEventListener('pointerdown', (e) => {
      this._mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'orbit';
      this._lx = e.clientX; this._ly = e.clientY;
      try { d.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    const end = (e) => { this._mode = null; try { d.releasePointerCapture(e.pointerId); } catch (_) {} };
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', end);
    d.addEventListener('pointermove', (e) => {
      if (!this._mode) return;
      const dx = e.clientX - this._lx, dy = e.clientY - this._ly;
      this._lx = e.clientX; this._ly = e.clientY;
      const m = this.sensMult;
      if (this._mode === 'orbit') {
        this.az -= dx * this.orbitSens * m;
        this.pol = clamp(this.pol - dy * this.orbitSens * m, 0.05, Math.PI - 0.05);
      } else {
        const right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.cam.matrix, 1);
        const s = this.dist * this.panSens * m;
        this.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
      }
    });
    d.addEventListener('wheel', (e) => {
      this.dist = clamp(this.dist * (1 + e.deltaY * this.zoomSens), this.minDist, this.maxDist);
      e.preventDefault();
    }, { passive: false });
    d.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  frame(radius) { this.dist = clamp(radius * 2.6, this.minDist, this.maxDist); this.target.set(0, 0, 0); }
  reset(radius) { this.az = 0.7; this.pol = 1.25; this.target.set(0, 0, 0); this.frame(radius); }
  apply() {
    const st = Math.sin(this.pol), ct = Math.cos(this.pol);
    this.cam.position.set(
      this.target.x + this.dist * st * Math.sin(this.az),
      this.target.y + this.dist * ct,
      this.target.z + this.dist * st * Math.cos(this.az),
    );
    this.cam.lookAt(this.target);
  }
}

// ── Asset preview ───────────────────────────────────────────────────────────────────────────────
export class AssetPreview {
  constructor(canvas, listEl) {
    this.canvas = canvas; this.listEl = listEl;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14171c);
    // Lights cover both GLB (MeshStandard) and voxel (MeshLambert) so every asset reads correctly.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x44505e, 1.15));
    const d1 = new THREE.DirectionalLight(0xfff1d8, 1.7); d1.position.set(4, 7, 5); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x9fb6ff, 0.5); d2.position.set(-5, -1, -4); this.scene.add(d2);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 400);
    this.orbit = new OrbitCam(this.camera, canvas);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.spin = true; this.spinT = 0; this.cur = null; this.radius = 1; this.entries = [];
    this.pinned = this._loadPins();          // weapon keys the user flagged "to redo" — sorted to the top, persisted
    this._registerWeapons();
    this._buildList();
    this._resize(); window.addEventListener('resize', () => this._resize());
    this._last = performance.now();
    this._loop();
    if (this.entries.length) this.select(this.entries[0].key);
  }
  // Registry — one entry per weapon. `build()` returns a fresh Object3D (GLB Group or voxel Mesh).
  _registerWeapons() {
    for (const key of WEAPON_ORDER) {
      const def = WEAPONS[key];
      this.entries.push({
        key, name: def.name || key, cls: def.class || def.shape || '',
        build: () => {
          const g = new THREE.Group();
          g.add(buildViewmodel(def));
          const sm = def.spinMag; // pan/drum mags are separate meshes in-game
          if (sm) { const mg = buildMag(sm); mg.position.set(sm.x, sm.y, sm.z); g.add(mg); }
          return g;
        },
      });
    }
  }
  // Pins ("to redo" flags) persist in localStorage and sort to the top of the list.
  _loadPins() { try { return new Set(JSON.parse(localStorage.getItem('assetpreview_pinned') || '[]')); } catch (_) { return new Set(); } }
  _savePins() { try { localStorage.setItem('assetpreview_pinned', JSON.stringify([...this.pinned])); } catch (_) {} }
  togglePin(key) { if (this.pinned.has(key)) this.pinned.delete(key); else this.pinned.add(key); this._savePins(); this._buildList(); }
  _buildList() {
    this.listEl.innerHTML = '';
    const pinned = this.entries.filter((e) => this.pinned.has(e.key));
    const rest = this.entries.filter((e) => !this.pinned.has(e.key));
    [...pinned, ...rest].forEach((e, i) => {
      if (pinned.length && i === pinned.length) {            // divider between the pinned group and the rest
        const d = document.createElement('div'); d.className = 'ap-divider'; d.textContent = '↑ to redo · all assets ↓';
        this.listEl.appendChild(d);
      }
      const isPinned = this.pinned.has(e.key);
      const li = document.createElement('div');
      li.className = 'ap-item' + (isPinned ? ' pinned' : '') + (e.key === this.cur ? ' sel' : '');
      li.dataset.key = e.key;
      const pin = document.createElement('button');
      pin.className = 'ap-pin'; pin.textContent = '📌';
      pin.title = isPinned ? 'Unpin' : 'Pin — mark to redo';
      pin.addEventListener('click', (ev) => { ev.stopPropagation(); this.togglePin(e.key); });
      const name = document.createElement('span'); name.className = 'ap-name'; name.textContent = e.name;
      const cls = document.createElement('span'); cls.className = 'ap-cls'; cls.textContent = e.cls;
      li.append(pin, name, cls);
      li.addEventListener('click', () => this.select(e.key));
      this.listEl.appendChild(li);
    });
  }
  select(key) {
    const e = this.entries.find((x) => x.key === key); if (!e) return;
    this.cur = key;
    for (const li of this.listEl.children) li.classList.toggle('sel', li.dataset.key === key);
    const nameEl = document.getElementById('curName'); if (nameEl) nameEl.textContent = e.name;
    this._mount(e);
    // GLB world models stream in async — rebuild a couple of times so the textured model swaps in.
    clearTimeout(this._t1); clearTimeout(this._t2);
    this._t1 = setTimeout(() => { if (this.cur === key) this._mount(e); }, 450);
    this._t2 = setTimeout(() => { if (this.cur === key) this._mount(e); }, 1400);
  }
  _mount(e) {
    while (this.holder.children.length) {
      const c = this.holder.children.pop();
      c.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
      this.holder.remove(c);
    }
    this.holder.rotation.set(0, 0, 0); this.spinT = 0;
    const model = e.build();
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const ctr = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(ctr);                       // centre the asset at the origin
    this.holder.add(model);
    this.radius = Math.max(size.x, size.y, size.z, 0.1);
    this.orbit.frame(this.radius);
    const info = document.getElementById('curInfo');
    if (info) { let m = 0, t = 0; model.traverse((n) => { if (n.isMesh) { m++; const g = n.geometry; if (g && g.index) t += g.index.count / 3; else if (g && g.attributes.position) t += g.attributes.position.count / 3; } }); info.textContent = `${m} mesh · ${Math.round(t)} tris`; }
  }
  setSpin(on) { this.spin = on; }
  setSens(mult) { this.orbit.sensMult = mult; }
  resetView() { this.orbit.reset(this.radius); }
  _resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
  }
  _loop() {
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now;
    if (this.spin) { this.spinT += dt * 0.5; this.holder.rotation.y = this.spinT; }
    this.orbit.apply();
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const ap = new AssetPreview(document.getElementById('view'), document.getElementById('list'));
  window.AP = ap;
  const spin = document.getElementById('spin');
  if (spin) spin.addEventListener('change', () => ap.setSpin(spin.checked));
  const sens = document.getElementById('sens');
  const sensv = document.getElementById('sensv');
  if (sens) sens.addEventListener('input', () => { const v = parseFloat(sens.value); ap.setSens(v); if (sensv) sensv.textContent = v.toFixed(2) + '×'; });
  const reset = document.getElementById('reset');
  if (reset) reset.addEventListener('click', () => ap.resetView());
});
