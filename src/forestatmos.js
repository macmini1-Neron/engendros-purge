// forestatmos.js — ambient forest motes for ?map=forest (browser-only). Ported 1:1 from the
// forest-destruct R&D demo: warm POLLEN drifting in daylight + green FIREFLIES glowing at night.
// Two additive Points clouds — ONE draw call EACH (fireflies are Points, not 40 Sprites, so the
// night layer stays a single draw call) — fog-aware, and recentred on the player so the field
// follows you across the map. No runtime lights; per-frame work is just buffer updates (bounded).
import * as THREE from 'three';
import { rr } from './util.js';

// soft round dot (radial alpha) shared by both clouds
function dotTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, '#fff'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(16, 16, 16, 0, 6.28); g.fill();
  return new THREE.CanvasTexture(cv);
}

export class ForestAtmosphere {
  constructor(scene) {
    this.scene = scene;
    this._tex = dotTex();
    this._t = 0;

    // POLLEN — warm motes, always on, drifting up + sideways (1:1 with the demo's 500-pt cloud)
    this.NP = 480;
    const pp = new Float32Array(this.NP * 3);
    this.pv = new Float32Array(this.NP * 3);
    for (let i = 0; i < this.NP; i++) {
      pp[i * 3] = rr(-50, 50); pp[i * 3 + 1] = rr(0.5, 16); pp[i * 3 + 2] = rr(-50, 50);
      this.pv[i * 3] = rr(-0.15, 0.15); this.pv[i * 3 + 1] = rr(-0.05, 0.12); this.pv[i * 3 + 2] = rr(-0.15, 0.15);
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.pollen = new THREE.Points(pg, new THREE.PointsMaterial({
      map: this._tex, size: 0.16, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, color: 0xfff0c0, fog: true,
    }));
    this.pollen.frustumCulled = false; scene.add(this.pollen);

    // FIREFLIES — green motes, night only, with a gentle global twinkle
    this.NF = 90;
    const fp = new Float32Array(this.NF * 3);
    this.fv = new Float32Array(this.NF * 2); this.fph = new Float32Array(this.NF);
    for (let i = 0; i < this.NF; i++) {
      fp[i * 3] = rr(-44, 44); fp[i * 3 + 1] = rr(0.4, 3.4); fp[i * 3 + 2] = rr(-44, 44);
      this.fv[i * 2] = rr(-0.05, 0.05); this.fv[i * 2 + 1] = rr(-0.05, 0.05); this.fph[i] = rr(0, 6.28);
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    this.firefliesMat = new THREE.PointsMaterial({
      map: this._tex, size: 0.34, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, color: 0xccff66, fog: true,
    });
    this.fireflies = new THREE.Points(fg, this.firefliesMat);
    this.fireflies.frustumCulled = false; this.fireflies.visible = false; scene.add(this.fireflies);
  }

  // dt seconds, playerPos (THREE.Vector3-ish), night (bool — drives the firefly layer)
  update(dt, playerPos, night) {
    this._t += dt; const t = this._t, px = playerPos.x, pz = playerPos.z;
    // pollen drift — wrap height + recentre on the player as motes drift out of range
    const a = this.pollen.geometry.attributes.position, A = a.array;
    for (let i = 0; i < this.NP; i++) {
      const o = i * 3;
      let x = A[o] + this.pv[o] * 0.04, y = A[o + 1] + this.pv[o + 1] * 0.04, z = A[o + 2] + this.pv[o + 2] * 0.04;
      if (y > 17) y = 0.5;
      if (Math.abs(x - px) > 55) x = px + rr(-50, 50);
      if (Math.abs(z - pz) > 55) z = pz + rr(-50, 50);
      A[o] = x; A[o + 1] = y; A[o + 2] = z;
    }
    a.needsUpdate = true;

    // fireflies — only at night (single draw call; global opacity twinkle + per-mote bob/drift)
    this.fireflies.visible = !!night;
    if (night) {
      this.firefliesMat.opacity = 0.45 + 0.35 * Math.sin(t * 1.6);
      const f = this.fireflies.geometry.attributes.position, F = f.array;
      for (let i = 0; i < this.NF; i++) {
        const o = i * 3;
        let x = F[o] + this.fv[i * 2], z = F[o + 2] + this.fv[i * 2 + 1];
        const y = Math.max(0.3, F[o + 1] + Math.sin(t * 1.3 + this.fph[i]) * 0.012);
        if (Math.abs(x - px) > 44) x = px + rr(-40, 40);
        if (Math.abs(z - pz) > 44) z = pz + rr(-40, 40);
        F[o] = x; F[o + 1] = y; F[o + 2] = z;
      }
      f.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.pollen); this.pollen.geometry.dispose(); this.pollen.material.dispose();
    this.scene.remove(this.fireflies); this.fireflies.geometry.dispose(); this.fireflies.material.dispose();
    this._tex.dispose();
  }
}
