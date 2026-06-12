// nightpost.js — ННП-23 «Резчик» (1ПН54): tripod day/night observation device, world prop
// + E-mount scope view. Behaviour follows the sourced TTX (models/nnp23/ref/dossier.json,
// archived НПЗ product page):
//   · NO zoom — fixed magnification; day branch 5.5×/6° FOV, night branch 5×/5.3° FOV (T toggles)
//   · azimuth: full 60-00 circle; elevation hard-clamped ±3-00 (±0.3142 rad)
//   · 1st-gen image intensifier: green phosphor (CSS filter on the canvas) + scene-light boost so
//     the night actually becomes readable; by day the night branch washes out (АРЯ overexposure)
//   · handwheel laying: heavily damped slow slew, SHIFT = coarse re-lay, wheel = ЯРКОСТЬ СЕТКИ
// The spec rig nodes (azimuth Y-spin → elevation X-hinge) are slewed live, so the model visibly
// tracks the operator's aim. Local-only: in co-op the pose is cosmetic, no sync (like the radio
// tuning dial) — damage/authority never flows through this prop.
import * as THREE from 'three';
import { clamp, damp, TAU } from './util.js';
import { placeProp, hasModel } from './props/registry.js';
import { yawToMils, formatUglomer } from './bearing.js';

const ELEV_MAX = 0.3142;                  // ±3-00 (dossier#angles)
const FOV_NIGHT = 5.3, FOV_DAY = 6.0;     // device true FOV in degrees (dossier#optics_*)
// View origin = the OBJECTIVE front face, not the rubber cups: the periscope offset means the
// scene is observed from the objective axis (1.58 m, +350 mm over the eyepieces) — and placing
// the camera at the cups would look straight through the device's own drum at 5.3° FOV.
const EYE_LOCAL = new THREE.Vector3(0, 1.58, 0.42);
const STAND_LOCAL = new THREE.Vector3(0, 0, -0.85);    // operator feet behind the tripod

export class NightPost {
  constructor(game, x, z, yaw = 0) {
    this.game = game;
    this.base = new THREE.Vector3(x, 0, z);
    this.baseYaw = yaw;
    this.root = null; this.azNode = null; this.elNode = null;
    this.az = 0;  this.el = 0;            // displayed device angles (az about Y, el = camera pitch)
    this.tAz = 0; this.tEl = 0;           // handwheel targets (mouse drives these, display damps after)
    this.branch = 'night';                // 'night' | 'day' optical branch (T)
    this.reticleGlow = 0.85;              // ЯРКОСТЬ СЕТКИ, wheel-adjusted 0.25..1
    this._hintT = 0;                      // controls hint visibility (fades out after a few s)
    this._snap = null;                    // pre-entry light/fog snapshot for exit restore
    this._hum = null;
  }

  // Lazy build: the spec registers async at boot; place the prop on the first frame it exists.
  ensureBuilt() {
    if (this.root || !hasModel('nnp23')) return;
    this.root = placeProp(this.game.engine.scene, 'nnp23', this.base.x, this.base.z, this.baseYaw);
    if (!this.root) return;
    this.azNode = this.root.getObjectByName('azimuth');
    this.elNode = this.root.getObjectByName('elevation');
    // tripod collider only (legs span ~0.9 m; keep it tight so the operator can stand close)
    this.game.world.boxes.push({
      min: new THREE.Vector3(this.base.x - 0.30, 0, this.base.z - 0.30),
      max: new THREE.Vector3(this.base.x + 0.30, 1.05, this.base.z + 0.30),
    });
  }

  near(p) { return !!this.root && Math.hypot(p.x - this.base.x, p.z - this.base.z) < 1.8 && Math.abs(p.y - this.base.y) < 2.2; }

  enter() {
    if (!this.root || this.game.player.nightPost) return;
    const pl = this.game.player;
    pl.nightPost = this;
    this.game.weapons.group.visible = false;
    this.tAz = this.az; this.tEl = this.el;
    // stand the operator behind the eyepieces of the CURRENT device lay
    const yawTotal = this.baseYaw + this.az;
    const stand = STAND_LOCAL.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yawTotal);
    pl.pos.set(this.base.x + stand.x, this.base.y, this.base.z + stand.z);
    pl.vel.set(0, 0, 0);
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '0';
    this._hintT = 6;                                            // show the controls hint, then fade
    this._showHint(true);
    // snapshot lights/fog once — lateLight() boosts per-frame, exit() restores (in longnight the
    // DayNight cycle re-applies its own values anyway on the next frame)
    const e = this.game.engine;
    this._snap = { amb: e.ambient.intensity, hemi: e.hemi.intensity, sun: e.sun ? e.sun.intensity : 0, exp: e.renderer.toneMappingExposure, fogNear: e.scene.fog ? e.scene.fog.near : 0, fogFar: e.scene.fog ? e.scene.fog.far : 0 };
    this._overlay(true);
    if (this.branch === 'night') this._humStart();   // the intensifier only runs on the night branch
  }

  exit() {
    const pl = this.game.player;
    if (pl.nightPost !== this) return;
    pl.nightPost = null;
    this.game.weapons.group.visible = true;
    // view continuity: leave looking the way the device points
    pl.yaw = this.baseYaw + this.az + Math.PI;
    pl.pitch = this.el;
    pl._camY = this.base.y + pl.eye;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '';
    this._showHint(false);
    const e = this.game.engine, s = this._snap;
    if (s) { e.ambient.intensity = s.amb; e.hemi.intensity = s.hemi; if (e.sun) e.sun.intensity = s.sun; e.renderer.toneMappingExposure = s.exp; if (e.scene.fog) { e.scene.fog.near = s.fogNear; e.scene.fog.far = s.fogFar; } }
    this._snap = null;
    e.setFov((this.game.settings && this.game.settings.data.fov) || 80);
    this._overlay(false);
    this._humStop();
    this.game.hud.setWeapon(this.game.weapons);
  }

  toggleBranch() {
    this.branch = this.branch === 'night' ? 'day' : 'night';
    const nv = document.getElementById('nvview');
    if (nv) nv.classList.toggle('day', this.branch === 'day');
    this._applyCanvasFilter();
    if (this.branch === 'night') this._humStart(); else this._humStop();
    this._hintT = Math.max(this._hintT, 3); this._showHint(true);   // resurface the hint briefly on a branch switch
    if (this.game.hud.toast) this.game.hud.toast(this.branch === 'night' ? 'НОЧЬ — image intensifier' : 'ДЕНЬ — day branch', 0x9dffac);
  }

  // The controls hint lives INSIDE the optic overlay (#nvhint) so it paints above the mask;
  // shown on entry/branch-switch, then faded out by the _hintT timer in controlUpdate.
  _showHint(on) {
    const el = document.getElementById('nvhint');
    if (!el) return;
    if (on) el.innerHTML = '<b>E</b> отойти · <b>T</b> день/ночь · <b>SHIFT</b> грубо · колесо ЯРКОСТЬ СЕТКИ';
    el.classList.toggle('show', !!on);
  }

  forceReset() { this.exit(); }

  controlUpdate(dt) {
    const input = this.game.input, pl = this.game.player;
    if (this._hintT > 0) { this._hintT = Math.max(0, this._hintT - dt); if (this._hintT === 0) this._showHint(false); } // fade the hint out once the timer runs out
    // handwheel laying: slow fine slew, SHIFT = coarse re-lay of the whole limb
    const coarse = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const rate = pl.sens * (coarse ? 0.55 : 0.085);
    this.tAz -= input.mouseDX * rate;
    this.tEl  = clamp(this.tEl - input.mouseDY * rate, -ELEV_MAX, ELEV_MAX);
    // wheel = ЯРКОСТЬ СЕТКИ (reticle illumination)
    if (input.wheel !== 0) this.reticleGlow = clamp(this.reticleGlow + (input.wheel > 0 ? -0.12 : 0.12), 0.25, 1);
    // the wheels have mass — the lay eases toward the target instead of snapping
    this.az = damp(this.az, this.tAz, 14, dt);
    this.el = damp(this.el, this.tEl, 14, dt);
    // slew the model rig (azimuth Y, elevation −X per the spec hinge sense)
    if (this.azNode) this.azNode.rotation.y = this.az;
    if (this.elNode) this.elNode.rotation.x = -this.el;
    // camera through the eyepieces: it orbits the tripod with the azimuth slew
    const yawTotal = this.baseYaw + this.az, up = new THREE.Vector3(0, 1, 0);
    const eye = EYE_LOCAL.clone().applyAxisAngle(up, yawTotal);
    const cam = this.game.engine.camera;
    cam.rotation.order = 'YXZ';
    cam.position.set(this.base.x + eye.x, this.base.y + eye.y, this.base.z + eye.z);
    cam.rotation.set(this.el, yawTotal + Math.PI, 0);     // device +Z forward ↔ camera −Z view
    // keep the body (and co-op ghost) standing behind the cups
    const stand = STAND_LOCAL.clone().applyAxisAngle(up, yawTotal);
    pl.pos.set(this.base.x + stand.x, this.base.y, this.base.z + stand.z);
    pl.yaw = yawTotal + Math.PI; pl.pitch = this.el;
    // fixed magnification — the only FOV change is the day/night branch switch
    this.game.engine.setFov(this.branch === 'night' ? FOV_NIGHT : FOV_DAY);
    this._readout();
  }

  // After DayNight has applied its frame values: lift the scene so the intensifier actually sees.
  // Night branch only — the day branch is plain glass.
  lateLight() {
    const e = this.game.engine;
    if (this.game.player.nightPost !== this || this.branch !== 'night') {
      if (this._snap) e.renderer.toneMappingExposure = this._snap.exp;   // day branch: plain glass
      return;
    }
    // 1st-gen tube gain: flood the scene so the dark actually reads (the green cast + grain come
    // from the canvas filter). Values bracketed in-browser — the ACES shoulder is a CLIFF between
    // exposure ~2.1 (dim) and ~2.4 (white-out), so tune in small steps and reshoot.
    e.ambient.intensity = Math.max(e.ambient.intensity, 2.9);
    e.hemi.intensity = Math.max(e.hemi.intensity, 1.8);
    if (e.sun) e.sun.intensity = Math.max(e.sun.intensity, 0.95);        // moonlight amplified → directional shape on walls
    e.renderer.toneMappingExposure = Math.max(e.renderer.toneMappingExposure, 2.18);
    if (e.scene.fog) { e.scene.fog.near = Math.max(e.scene.fog.near, 120); e.scene.fog.far = Math.max(e.scene.fog.far, 2000); }
  }

  _overlay(on) {
    const nv = document.getElementById('nvview');
    if (nv) { nv.classList.toggle('show', on); nv.classList.toggle('day', this.branch === 'day'); }
    if (!on) this.game.canvas.classList.remove('nvgreen');
    else this._applyCanvasFilter();
  }
  _applyCanvasFilter() { this.game.canvas.classList.toggle('nvgreen', this.game.player.nightPost === this && this.branch === 'night'); }

  _readout() {
    const el = document.getElementById('nvreadout');
    if (!el) return;
    // Soviet угломер via the shared datum (bearing.js): device optical-forward = camera yaw
    // (baseYaw + az + π, see the cam.rotation.set above) → 60-00 clockwise, grid-N=+Z.
    const m = yawToMils(this.baseYaw + this.az + Math.PI);
    const ev = Math.round(this.el / TAU * 6000);   // elevation is a tilt, not an azimuth — kept inline
    const f = (n) => `${String(Math.floor(Math.abs(n) / 100)).padStart(2, '0')}-${String(Math.abs(n) % 100).padStart(2, '0')}`;
    el.textContent = `У: ${formatUglomer(m)}   В: ${ev < 0 ? '−' : '+'}${f(ev)}   ${this.branch === 'night' ? '5× НОЧЬ' : '5,5× ДЕНЬ'}`;
    const svg = document.getElementById('nvreticle');
    if (svg) svg.style.opacity = String(this.reticleGlow);
  }

  // Quiet HV-converter whine + phosphor hiss while the intensifier runs (procedural, mute-safe).
  _humStart() {
    const a = this.game.audio;
    if (!a || !a.ctx || this._hum) return;
    try {
      const ctx = a.ctx, out = a.sfxGain || a.master || ctx.destination;
      const g = ctx.createGain(); g.gain.value = 0.012; g.connect(out);
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 142;
      const og = ctx.createGain(); og.gain.value = 0.5; osc.connect(og); og.connect(g); osc.start();
      const len = ctx.sampleRate * 1.2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
      const ng = ctx.createGain(); ng.gain.value = 0.35; noise.connect(hp); hp.connect(ng); ng.connect(g); noise.start();
      this._hum = { g, osc, noise };
    } catch (e) { this._hum = null; }
  }
  _humStop() {
    if (!this._hum) return;
    try { this._hum.osc.stop(); this._hum.noise.stop(); this._hum.g.disconnect(); } catch (e) { /* already torn down */ }
    this._hum = null;
  }
}
