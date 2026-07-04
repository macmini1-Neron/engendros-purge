// lukagunfx.js — black-powder muzzle blast + lock sparks for Luka's 4-barrel money gun.
// Ported 1:1 from the money-gun-dilna.html workshop (values approved 2026-06-17): orange
// rectangle spark streaks that shower into the priming pan, a punchy muzzle flash + forward
// fireball teardrop, a fast fire jet, and a dark→light gradient smoke cloud. All meshes share
// a handful of geometries and are pooled into one flat array updated per frame, so it stays
// cheap enough for gameplay (PMAX cap below guards rapid fire). Tune SMOKE_RATE / FIRE_RATE.
import * as THREE from 'three';

// shared geometries — one instance for ALL puffs of a kind (only .scale per particle)
const GEO_SPHERE = new THREE.SphereGeometry(1, 6, 5);   // smoke (low-poly, blurry → fine)
const GEO_FIRE   = new THREE.SphereGeometry(1, 7, 6);   // fire / flash / embers
const GEO_BOX    = new THREE.BoxGeometry(1, 1, 1);      // spark streaks
const _zAxis = new THREE.Vector3(0, 0, 1), _vd = new THREE.Vector3();
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

const SPARK = { n: 24, gap: 0.07 };   // 2 waves (flint scrapes down the frizzen), total n
// powder pour (1:1 dílna) — params RELATIVNÍ k velikosti zobáčku (maxD), ať sedí při libovolném scale gunu (sandbox/hra ≠ dílna)
const POUR = { rate: 332, off: 0.82, riseRel: 0.36, grainRel: 0.043, grainVar: 0.037, spreadRel: 0.85, gravRel: 43, vyRel: 0.3 };
const SPK_THICK = 0.006;              // streak rectangle cross-section
const PMAX = 900;                     // live-particle ceiling (gameplay safety vs rapid fire)
const FIRE_WIN = 0.12, SMOKE_WIN = 0.18; // muzzle stream emission windows (s)

function addMat(color, opacity, additive) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
}

export class LukaGunFX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];                 // flat particle pool
    this.spark2 = [];                // pending 2nd spark waves: {t, p, pan, n}
    this.panQ = [];                  // pending pan ignition: {t, kind:'fire'|'smoke', pan}
    this.smokeT = -1; this.fireT = -1; this.smokeCarry = 0; this.fireCarry = 0;
    this.mPos = new THREE.Vector3(); this.mDir = new THREE.Vector3();
    this.SMOKE_RATE = 3200; this.FIRE_RATE = 1900; // tunables (puffs / SIM-second)
    this.pourCarry = 0; this._pBox = new THREE.Box3(); this._pC = new THREE.Vector3(); this._pSz = new THREE.Vector3();
  }

  // ── public: lock sparks (frizzen→pan) ──
  lockBurst(p, pan) {
    const n1 = Math.ceil(SPARK.n / 2);
    this._emitSparks(p, pan, n1);
    this.spark2.push({ t: SPARK.gap, p: p.clone(), pan: pan.clone(), n: SPARK.n - n1 });
    // pan ignition a beat after the sparks: FIRE first (0.16s), SMOKE later (0.30s) — like the dílna
    this.panQ.push({ t: 0.16, kind: 'fire', pan: pan.clone() });
    this.panQ.push({ t: 0.30, kind: 'smoke', pan: pan.clone() });
  }

  // ── public: muzzle discharge (muzzlePos, forward unit dir) ──
  muzzleBlast(muzzlePos, dir) {
    this.mPos.copy(muzzlePos); this.mDir.copy(dir).normalize();
    this._emitFlash();
    this.fireT = FIRE_WIN; this.smokeT = SMOKE_WIN; this.smokeCarry = this.fireCarry = 0;
  }

  // ── public: powder pour — call EACH FRAME while the gun clip is in the feeder-open window (~0.31–0.51).
  //    Streams dark grains from the spout mouth (computed from scoopNode bbox) into the pan. ──
  pourTick(scoopNode, panNode, dt) {
    if (!scoopNode || dt <= 0) return;
    this._pBox.setFromObject(scoopNode); this._pBox.getCenter(this._pC); this._pBox.getSize(this._pSz);
    const maxD = Math.max(this._pSz.x, this._pSz.y, this._pSz.z) || 0.05;
    const pan = panNode ? panNode.getWorldPosition(new THREE.Vector3()) : this._pC.clone().add(new THREE.Vector3(0, -maxD, 0));
    const mouth = this._pC.clone().addScaledVector(pan.clone().sub(this._pC).normalize(), maxD * POUR.off); // ústí hubice
    mouth.y += maxD * POUR.riseRel;                                       // padá z větší výšky
    this.pourCarry += POUR.rate * dt;
    let n = Math.floor(this.pourCarry); this.pourCarry -= n; n = Math.min(n, PMAX - this.parts.length);
    for (let k = 0; k < n; k++) this._emitGrain(mouth, pan, this._pSz, maxD);
  }
  _emitGrain(mouth, pan, sz, maxD) {
    const o = mouth.clone();
    o.x += (Math.random() - 0.5) * sz.x * 0.40; o.z += (Math.random() - 0.5) * sz.z * 0.40; // rozptyl přes ústí
    const dir = pan.clone().sub(o);
    const m = new THREE.Mesh(GEO_BOX, addMat(0x2a2a2e, 1, false));        // tmavě šedá zrnka prachu
    const s0 = maxD * (POUR.grainRel + Math.random() * POUR.grainVar); m.scale.set(s0, s0, s0); m.position.copy(o); this.scene.add(m);
    this.parts.push({ m, kind: 'grain', s0, grav: maxD * POUR.gravRel, pan: pan.clone(),
      vx: dir.x * 1.8 + (Math.random() - 0.5) * maxD * POUR.spreadRel, vy: -maxD * POUR.vyRel, vz: dir.z * 1.8 + (Math.random() - 0.5) * maxD * POUR.spreadRel,
      life: 0.5 + Math.random() * 0.3, max: 0.8 });
  }

  // ── orange rectangle spark streaks showering into the pan ──
  _emitSparks(p, pan, count) {
    const panDir = pan.clone().sub(p).normalize();
    const reach = Math.max(0.05, p.distanceTo(pan) * 0.9);
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= PMAX) break;
      const r = Math.random();
      const c = r < 0.6 ? 0xff6a14 : (r < 0.85 ? 0xffa028 : 0xffe6a0);
      const m = new THREE.Mesh(GEO_BOX, addMat(c, 1, true));
      m.position.copy(p).addScaledVector(panDir, 0.03);
      this.scene.add(m);
      let vx, vy, vz;
      if (Math.random() < 0.18) {                  // few pop up, curled back toward the pan
        vy = 0.45 + Math.random() * 0.45;
        vx = panDir.x * (0.35 + Math.random() * 0.25);
        vz = panDir.z * (0.35 + Math.random() * 0.25) + (Math.random() - 0.5) * 0.15;
      } else {                                      // main stream → into the pan, tight spread
        const sp = 0.5 + Math.random() * 0.4, spread = 0.14;
        vx = panDir.x * sp + (Math.random() - 0.5) * spread;
        vy = panDir.y * sp - (0.05 + Math.random() * 0.15);
        vz = panDir.z * sp + (Math.random() - 0.5) * spread;
      }
      const sp = Math.hypot(vx, vy, vz) || 1;
      m.quaternion.setFromUnitVectors(_zAxis, _vd.set(vx / sp, vy / sp, vz / sp));
      const life = 0.45 + Math.random() * 0.55;
      this.parts.push({ m, vx, vy, vz, life, max: life, kind: 'streak', pan: pan.clone(), panR: reach });
    }
  }

  // ── punchy flash: white core bloom + forward fireball teardrop + jagged star + embers ──
  _emitFlash() {
    const P = this.mPos, D = this.mDir;
    // 1) white-hot core bloom
    let m = new THREE.Mesh(GEO_FIRE, addMat(0xfff6df, 1, true));
    m.position.copy(P).addScaledVector(D, 0.03); m.scale.setScalar(0.13); this.scene.add(m);
    this.parts.push({ m, kind: 'flashcore', r0: 0.13, vx: D.x * 0.6, vy: D.y * 0.6, vz: D.z * 0.6, life: 0.085, max: 0.085, grow: 1.7 });
    // 2) forward fireball teardrop — stretched ellipsoids, hot white → orange → red toward the tip
    const tear = [[0.09, 0.085, 0xfff2cc, 2.4], [0.20, 0.07, 0xffbe48, 3.4], [0.32, 0.052, 0xff6a1e, 3.2]];
    for (const seg of tear) {
      const e = new THREE.Mesh(GEO_FIRE, addMat(seg[2], 0.95, true));
      e.position.copy(P).addScaledVector(D, seg[0]);
      e.quaternion.setFromUnitVectors(_zAxis, D); e.scale.set(seg[1], seg[1], seg[1] * seg[3]); this.scene.add(e);
      this.parts.push({ m: e, kind: 'flashlance', r0: seg[1], lz: seg[3], vx: D.x * 2.6, vy: D.y * 2.6, vz: D.z * 2.6, life: 0.10 + Math.random() * 0.05, max: 0.15 });
    }
    // 3) jagged star — sideways streaks (blackpowder flash is irregular)
    _s1.copy(_up).cross(D).normalize(); _s2.copy(D).cross(_s1).normalize();
    for (let i = 0; i < 8; i++) {
      if (this.parts.length >= PMAX) break;
      const ang = Math.random() * Math.PI * 2, spread = 0.3 + Math.random() * 0.7;
      const dir = D.clone().addScaledVector(_s1, Math.cos(ang) * spread).addScaledVector(_s2, Math.sin(ang) * spread).normalize();
      const r0 = 0.022 + Math.random() * 0.03;
      m = new THREE.Mesh(GEO_FIRE, addMat(Math.random() < 0.5 ? 0xffe89a : 0xffae3a, 1, true));
      m.position.copy(P).addScaledVector(D, 0.03); m.scale.setScalar(r0); this.scene.add(m);
      const sp = 3.0 + Math.random() * 4.0;
      this.parts.push({ m, kind: 'mspike', r0, vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp, life: 0.07 + Math.random() * 0.06, max: 0.13 });
    }
    // 4) embers — unburnt grains thrown forward, glowing, gravity, short
    for (let i = 0; i < 22; i++) {
      if (this.parts.length >= PMAX) break;
      const r0 = 0.008 + Math.random() * 0.012;
      m = new THREE.Mesh(GEO_FIRE, addMat(Math.random() < 0.5 ? 0xffd24a : 0xff7a1e, 1, true));
      m.position.copy(P); m.scale.setScalar(r0); this.scene.add(m);
      const v = D.clone().multiplyScalar(2.2 + Math.random() * 4.5).add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)));
      this.parts.push({ m, kind: 'member', r0, vx: v.x, vy: v.y, vz: v.z, life: 0.15 + Math.random() * 0.35, max: 0.5 });
    }
  }

  // ── fire jet: fast forward-licking flame tongues, hot near the muzzle ──
  _emitFire(frac, n) {
    const P = this.mPos, D = this.mDir;
    _s1.copy(_up).cross(D).normalize(); _s2.copy(D).cross(_s1).normalize();
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= PMAX) break;
      const c = Math.random() < 0.4 ? 0xfff0bc : (Math.random() < 0.65 ? 0xffa828 : 0xff5210);
      const r0 = 0.035 + Math.random() * 0.06;
      const m = new THREE.Mesh(GEO_FIRE, addMat(c, 0.95, true));
      m.position.copy(P).addScaledVector(D, 0.02 + Math.random() * 0.06); m.scale.setScalar(r0); this.scene.add(m);
      const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * 0.26;
      const dir = D.clone().addScaledVector(_s1, Math.cos(ang) * rad).addScaledVector(_s2, Math.sin(ang) * rad).normalize();
      const v = dir.multiplyScalar(6.5 + 7.0 * frac);
      this.parts.push({ m, kind: 'mfire', r0, vx: v.x, vy: v.y + 0.05, vz: v.z, life: 0.10 + Math.random() * 0.13, max: 0.23 });
    }
  }

  // ── smoke cone: many small low-opacity lumpy puffs → blend into a billow; dark→light gradient ──
  _emitSmoke(frac, n) {
    const P = this.mPos, D = this.mDir;
    _s1.copy(_up).cross(D).normalize(); _s2.copy(D).cross(_s1).normalize();
    for (let k = 0; k < n; k++) {
      if (this.parts.length >= PMAX) break;
      const r0 = 0.027 + Math.random() * 0.036;
      const m = new THREE.Mesh(GEO_SPHERE, addMat(new THREE.Color(0.26, 0.25, 0.26), 0, false));
      m.position.copy(P).addScaledVector(D, 0.01 + Math.random() * 0.03);
      m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      const sv = new THREE.Vector3((0.75 + Math.random() * 0.6) * r0, (0.75 + Math.random() * 0.6) * r0, (0.75 + Math.random() * 0.6) * r0);
      this.scene.add(m);
      const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * 0.55;
      const dir = D.clone().addScaledVector(_s1, Math.cos(ang) * rad).addScaledVector(_s2, Math.sin(ang) * rad).normalize();
      const v = dir.multiplyScalar(6.5 + 11.0 * frac);
      this.parts.push({ m, kind: 'smoke', vx: v.x, vy: v.y, vz: v.z, life: 1.7 + Math.random() * 1.0, max: 2.7, grow: 3.2 + Math.random() * 3.2, drag: 2.7, buoy: 0.14, turb: 1.1, peak: 0.4, s0: 0.8, sv, spin: (Math.random() - 0.5) * 2.2, c0: new THREE.Color(0.26, 0.25, 0.26), c1: new THREE.Color(0.92, 0.92, 0.95) });
    }
  }

  // ── pan ignition flame: bright core burst + flame licks in the priming pan ──
  _emitPanFire(pan) {
    let m = new THREE.Mesh(GEO_FIRE, addMat(0xfff0c2, 1, true));
    m.position.copy(pan); m.scale.setScalar(0.09); this.scene.add(m);
    this.parts.push({ m, kind: 'flashcore', r0: 0.09, vx: 0, vy: 0.35, vz: 0, life: 0.13, max: 0.13, grow: 1.9 });
    for (let i = 0; i < 14; i++) {
      if (this.parts.length >= PMAX) break;
      const c = Math.random() < 0.45 ? 0xffe06a : (Math.random() < 0.72 ? 0xffb024 : 0xff6a12);
      const r0 = 0.022 + Math.random() * 0.042;
      m = new THREE.Mesh(GEO_FIRE, addMat(c, 0.98, true));
      m.position.copy(pan); m.position.x += (Math.random() - 0.5) * 0.045; m.position.y += (Math.random() - 0.5) * 0.02; m.position.z += (Math.random() - 0.5) * 0.045; m.scale.setScalar(r0); this.scene.add(m);
      this.parts.push({ m, kind: 'fire', r0, vx: (Math.random() - 0.5) * 0.22, vy: 0.42 + Math.random() * 0.7, vz: (Math.random() - 0.5) * 0.22, life: 0.18 + Math.random() * 0.24, max: 0.42 });
    }
  }

  // ── pan ignition smoke: dense bright-white billow at the flint/pan (flash in the pan) ──
  _emitPanSmoke(pan) {
    for (let i = 0; i < 10; i++) {
      if (this.parts.length >= PMAX) break;
      const w = 0.86 + Math.random() * 0.12, col = new THREE.Color(w, w * 0.99, w * 0.97);
      const r0 = 0.032 + Math.random() * 0.05;
      const m = new THREE.Mesh(GEO_SPHERE, addMat(col, 0, false));
      m.position.copy(pan); m.position.x += (Math.random() - 0.5) * 0.05; m.position.y += 0.01 + Math.random() * 0.02; m.position.z += (Math.random() - 0.5) * 0.05; this.scene.add(m);
      const sv = new THREE.Vector3((0.85 + Math.random() * 0.3) * r0, (0.85 + Math.random() * 0.3) * r0, (0.85 + Math.random() * 0.3) * r0);
      this.parts.push({ m, kind: 'smoke', vx: (Math.random() - 0.5) * 0.30, vy: 0.16 + Math.random() * 0.26, vz: (Math.random() - 0.5) * 0.30, life: 1.7 + Math.random() * 0.7, max: 2.4, grow: 1.9 + Math.random() * 2.0, drag: 1.2, buoy: 0.16, turb: 0.6, peak: 0.8, s0: 0.8, sv, c0: new THREE.Color(0.92, 0.92, 0.93), c1: new THREE.Color(0.80, 0.80, 0.84) });
    }
  }

  // ── per-frame: advance timers + every particle ──
  update(dt) {
    if (dt <= 0 || !this.parts.length && this.smokeT < 0 && this.fireT < 0 && !this.spark2.length && !this.panQ.length) return;
    // pending 2nd spark waves
    for (let i = this.spark2.length - 1; i >= 0; i--) { const w = this.spark2[i]; w.t -= dt; if (w.t <= 0) { this._emitSparks(w.p, w.pan, w.n); this.spark2.splice(i, 1); } }
    // pending pan ignition (fire / smoke at the priming pan, after the sparks)
    for (let i = this.panQ.length - 1; i >= 0; i--) { const q = this.panQ[i]; q.t -= dt; if (q.t <= 0) { if (q.kind === 'fire') this._emitPanFire(q.pan); else this._emitPanSmoke(q.pan); this.panQ.splice(i, 1); } }
    // muzzle smoke STREAM — RATE-BASED (per SIM-second) so density is framerate-independent
    if (this.smokeT >= 0) { const frac = Math.max(0, this.smokeT / SMOKE_WIN); this.smokeCarry += this.SMOKE_RATE * dt; let nn = Math.floor(this.smokeCarry); this.smokeCarry -= nn; nn = Math.min(nn, PMAX - this.parts.length); if (nn > 0) this._emitSmoke(frac, nn); this.smokeT -= dt; }
    if (this.fireT >= 0) { const frac = Math.max(0, this.fireT / FIRE_WIN); this.fireCarry += this.FIRE_RATE * (0.45 + 0.55 * frac) * dt; let nn = Math.floor(this.fireCarry); this.fireCarry -= nn; nn = Math.min(nn, PMAX - this.parts.length); if (nn > 0) this._emitFire(frac, nn); this.fireT -= dt; }

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const s = this.parts[i]; s.life -= dt; const u = Math.max(0, s.life / s.max);
      if (s.kind === 'streak') {
        if (!s.settled) {
          s.vy -= 5.0 * dt;
          s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
          if (s.pan && s.vy < 0 && s.m.position.y <= s.pan.y) {           // landed in the pan?
            const dx = s.m.position.x - s.pan.x, dz = s.m.position.z - s.pan.z;
            if (dx * dx + dz * dz < s.panR * s.panR) {
              if (Math.random() < 0.75) {                                  // 75% settle on the black powder, glow 0.5s
                s.vx = s.vy = s.vz = 0; s.settled = true;
                s.m.position.x = s.pan.x + (Math.random() - 0.5) * s.panR * 0.5;
                s.m.position.z = s.pan.z + (Math.random() - 0.5) * s.panR * 0.5;
                s.m.position.y = s.pan.y + s.panR * 0.06;
                const a = Math.random() * Math.PI * 2; s.m.quaternion.setFromUnitVectors(_zAxis, _vd.set(Math.cos(a), 0, Math.sin(a)));
                s.life = 0.5; s.max = 0.5;
              } else { s.vy = Math.abs(s.vy) * 0.15; s.vx *= 0.5; s.vz *= 0.5; s.pan = null; } // 25% continue a bit
            }
          }
        }
        const sp = Math.hypot(s.vx, s.vy, s.vz);
        if (sp > 0.01) s.m.quaternion.setFromUnitVectors(_zAxis, _vd.set(s.vx / sp, s.vy / sp, s.vz / sp));
        const len = s.settled ? 0.05 : 0.03 + Math.min(0.07, sp * 0.04);
        s.m.scale.set(SPK_THICK * (0.5 + u * 0.5), SPK_THICK * (0.5 + u * 0.5), len);
        s.m.material.opacity = s.settled ? Math.min(1, u * 3) : u;
      } else if (s.kind === 'smoke') {
        const age = 1 - u;
        s.vx *= (1 - dt * s.drag); s.vz *= (1 - dt * s.drag);
        s.vy = s.vy * (1 - dt * s.drag * 0.55) + s.buoy * dt;
        s.vx += (Math.random() - 0.5) * s.turb * dt; s.vz += (Math.random() - 0.5) * s.turb * dt;
        s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
        if (s.spin) { s.m.rotation.x += s.spin * dt; s.m.rotation.z += s.spin * 0.6 * dt; }
        s.m.material.color.copy(s.c0).lerp(s.c1, age);
        s.m.material.opacity = Math.sin(Math.min(1, age * 1.18) * Math.PI) * s.peak;
        const g = s.s0 + Math.pow(age, 0.6) * s.grow;
        s.m.scale.set(s.sv.x * g, s.sv.y * g, s.sv.z * g);
      } else if (s.kind === 'mfire') {
        s.vx *= (1 - dt * 3.5); s.vz *= (1 - dt * 3.5); s.vy = s.vy * (1 - dt * 2.0) + 0.4 * dt;
        s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
        s.m.material.opacity = u * 0.95; s.m.scale.setScalar(s.r0 * (0.7 + (1 - u) * 1.1));
      } else if (s.kind === 'fire') {           // pan flame licks (flash in the pan)
        s.vy -= 0.5 * dt;
        s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
        s.m.material.opacity = u * 0.95; s.m.scale.setScalar(s.r0 * (0.8 + (1 - u) * 1.5));
      } else if (s.kind === 'flashcore') {
        s.vx *= (1 - dt * 6); s.vy *= (1 - dt * 6); s.vz *= (1 - dt * 6);
        s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
        s.m.material.opacity = u; s.m.scale.setScalar(s.r0 * (0.6 + (1 - u) * s.grow));
      } else if (s.kind === 'flashlance') {
        s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
        s.m.material.opacity = u * 0.95;
        const r = s.r0 * (1 + (1 - u) * 0.5); s.m.scale.set(r, r, s.r0 * s.lz * (1 + (1 - u) * 0.4));
      } else if (s.kind === 'mspike') {
        s.vx *= (1 - dt * 3); s.vy *= (1 - dt * 3); s.vz *= (1 - dt * 3);
        s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
        s.m.material.opacity = u; s.m.scale.setScalar(s.r0 * (0.5 + u * 0.9));
      } else if (s.kind === 'member') {
        s.vy -= 3.0 * dt; s.vx *= (1 - dt * 1.5); s.vz *= (1 - dt * 1.5);
        s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
        s.m.material.opacity = u; s.m.scale.setScalar(s.r0 * (0.5 + u * 0.6));
      } else if (s.kind === 'grain') {        // zrnko prachu: padá z hubice, dosedne na prach v pánvičce, zhasne
        s.vy -= s.grav * dt;
        s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
        if (s.pan && s.vy < 0 && s.m.position.y <= s.pan.y) { s.m.position.y = s.pan.y; s.vx *= 0.3; s.vz *= 0.3; s.vy = 0; if (s.life > 0.12) { s.life = 0.12; s.max = 0.12; } }
        s.m.material.opacity = Math.min(1, u * 2.4);
        s.m.scale.setScalar(s.s0 * (0.85 + u * 0.15));
      }
      if (s.life <= 0) { this.scene.remove(s.m); s.m.material.dispose(); this.parts.splice(i, 1); }
    }
  }
}
