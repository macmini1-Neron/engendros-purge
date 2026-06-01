// effects.js — particles (stuffing puffs, dust, sparks, shells), bullet tracers,
// muzzle flashes, explosions. Particles share one InstancedMesh for performance.
import * as THREE from 'three';
import { MeshBuilder, randRange, clamp, voxelMaterial } from './util.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.engine.scene;

    // --- particle pool (instanced cubes) ---
    this.capacity = 800;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    const colors = new Float32Array(this.capacity * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.scene.add(this.mesh);

    this.p = [];
    for (let i = 0; i < this.capacity; i++) {
      this.p.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        rot: new THREE.Euler(), rotV: new THREE.Vector3(), life: 0, maxLife: 1,
        size: 0.2, grav: -9.8, drag: 1, color: new THREE.Color(), bounce: 0, floorY: 0, shrink: true,
        onBounce: null, bounces: 0, maxBounceSounds: 0, bounceSoundMinVel: 0 });
    }
    this._cursor = 0;

    // --- tracers (pooled stretched boxes) ---
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, fog: false });
    this.tracers = [];

    // --- real .50 BMG spent casings (mesh, not particle cubes) ---
    this.caseGeo = this._makeFiftyCaseGeo();
    this.caseMat = voxelMaterial();
    this.cases = [];

    // --- muzzle flash (one reusable sprite quad + light) ---
    this.flashTex = this._makeFlashTexture();
    this.flashMat = new THREE.MeshBasicMaterial({ map: this.flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.flashes = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flashMat.clone());
      m.visible = false; m.renderOrder = 999;
      this.scene.add(m);
      this.flashes.push({ mesh: m, life: 0 });
    }

    // --- explosion rings ---
    this.rings = [];

    // --- point light for flashes/explosions ---
    this.flashLight = new THREE.PointLight(0xffcc66, 0, 30, 2);
    this.scene.add(this.flashLight);
    this._lightLife = 0;
  }

  _makeFiftyCaseGeo() {
    const b = new MeshBuilder();
    const brass = 0xcaa64a, brassHi = 0xe2c56b, brassLo = 0x8c6b2e, dark = 0x28241b;
    const body = new THREE.CylinderGeometry(0.026, 0.030, 0.16, 10); b.geo(body, 0, 0, 0, brass, { tint: 0.03 }); body.dispose();
    const rim = new THREE.CylinderGeometry(0.034, 0.034, 0.016, 10); b.geo(rim, 0, -0.086, 0, brassHi, { tint: 0.02 }); rim.dispose();
    const groove = new THREE.CylinderGeometry(0.027, 0.027, 0.012, 10); b.geo(groove, 0, -0.068, 0, brassLo); groove.dispose();
    const mouth = new THREE.CylinderGeometry(0.022, 0.022, 0.006, 10); b.geo(mouth, 0, 0.083, 0, dark); mouth.dispose();
    const primer = new THREE.CylinderGeometry(0.011, 0.011, 0.004, 8); b.geo(primer, 0, -0.096, 0, dark); primer.dispose();
    return b.build();
  }

  _seedRand(seed) {
    let a = (seed || 1) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  _makeFlashTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,220,1)');
    g.addColorStop(0.3, 'rgba(255,200,90,0.9)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    // star spikes
    x.strokeStyle = 'rgba(255,230,150,0.8)'; x.lineWidth = 3;
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30);
    }
    x.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _spawn(opts) {
    // find a free slot (overwrite oldest if needed)
    let slot = -1;
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this._cursor + i) % this.capacity;
      if (!this.p[idx].alive) { slot = idx; break; }
    }
    if (slot < 0) { slot = this._cursor; }
    this._cursor = (slot + 1) % this.capacity;
    const pt = this.p[slot];
    pt.alive = true;
    pt.pos.copy(opts.pos);
    pt.vel.copy(opts.vel);
    pt.life = pt.maxLife = opts.life;
    pt.size = opts.size;
    pt.grav = opts.grav ?? -14;
    pt.drag = opts.drag ?? 1.0;
    pt.color.copy(opts.color);
    pt.bounce = opts.bounce ?? 0;
    pt.floorY = opts.floorY ?? 0;
    pt.shrink = opts.shrink ?? true;
    pt.bloom = opts.bloom ?? false;   // grows from nothing → peak → fades (vapour/contrail)
    pt.onBounce = opts.onBounce || null;
    pt.bounces = 0;
    pt.maxBounceSounds = opts.maxBounceSounds ?? 0;
    pt.bounceSoundMinVel = opts.bounceSoundMinVel ?? 2.5;
    pt.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    pt.rotV.set(randRange(-8, 8), randRange(-8, 8), randRange(-8, 8));
    return pt;
  }

  // Plush stuffing burst on hit — fluffy colored cubes.
  stuffing(pos, color, amount = 10, power = 5) {
    const c = new THREE.Color(color);
    const white = new THREE.Color(0xfff6e8);
    for (let i = 0; i < amount; i++) {
      const useWhite = Math.random() < 0.5;
      this._spawn({
        pos,
        vel: _v.set(randRange(-1, 1), randRange(0.3, 1.2), randRange(-1, 1)).normalize().multiplyScalar(randRange(power * 0.4, power)),
        life: randRange(0.5, 1.1),
        size: randRange(0.08, 0.2),
        grav: -12,
        drag: 2.2,
        color: useWhite ? white : c,
        bounce: 0.3,
        floorY: pos.y - 0.4,
      });
    }
  }

  // Soft vapour puff that blooms then fades — Su-24 engine contrail.
  contrailPuff(pos, { size = 2.0, life = 3.4, color = 0xeef2f6 } = {}) {
    this._spawn({
      pos,
      vel: _v.set(randRange(-0.5, 0.5), randRange(-0.1, 0.4), randRange(-0.5, 0.5)),
      life: life * randRange(0.85, 1.15),
      size: size * randRange(0.8, 1.2),
      grav: -0.25, drag: 0.5,
      color: new THREE.Color(color),
      bounce: 0, floorY: -999, bloom: true,
    });
  }

  // Signal-flare smoke — a puff that blooms, rises and drifts; reddish near the
  // flame, greying as it climbs. `intensity` (0..1) scales size as the flare dies.
  flareSmoke(pos, intensity = 1) {
    const warm = Math.random() < 0.4;
    this._spawn({
      pos,
      vel: _v.set(randRange(-0.3, 0.3), randRange(0.9, 1.7), randRange(-0.3, 0.3)),
      life: randRange(1.5, 2.6),
      size: randRange(0.16, 0.32) * (0.5 + 0.5 * intensity),
      grav: 0.35, drag: 0.7,                       // gentle buoyant rise
      color: new THREE.Color(warm ? 0xbe5a34 : 0x6b635c),
      bounce: 0, floorY: -999, bloom: true,
    });
  }

  // Persistent fire-pool flames — orange/red blooming tongues licking up from the ground.
  // Used for the molotov pool, the in-flight rag trail, and burning enemies.
  firePool(pos, radius = 3.2, intensity = 1) {
    const n = Math.max(1, Math.round(3 * intensity));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, dist = Math.random() * radius * 0.7;
      this._spawn({
        pos: _v.set(pos.x + Math.cos(a) * dist, pos.y + 0.03, pos.z + Math.sin(a) * dist),
        vel: _s.set(randRange(-0.25, 0.25), randRange(0.5, 1.3), randRange(-0.25, 0.25)),
        life: randRange(0.45, 0.85), size: randRange(0.3, 0.6) * (0.6 + 0.4 * intensity),
        grav: 0.4, drag: 1.4,
        color: new THREE.Color(Math.random() < 0.7 ? 0xff7a2a : 0xffd24a),
        bounce: 0, floorY: -999, bloom: true,
      });
    }
  }

  // Bullet impact on world — dust + a few sparks.
  impact(pos, normal, kind = 'dust') {
    const dustC = new THREE.Color(0xb9a87e);
    for (let i = 0; i < 6; i++) {
      _v.copy(normal).multiplyScalar(2).add(_s.set(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1)));
      this._spawn({
        pos, vel: _v.clone().multiplyScalar(randRange(1, 3)),
        life: randRange(0.3, 0.6), size: randRange(0.05, 0.12),
        grav: -10, drag: 3, color: dustC, bounce: 0, floorY: -999,
      });
    }
    if (kind === 'spark') {
      const sp = new THREE.Color(0xffd070);
      for (let i = 0; i < 5; i++) {
        this._spawn({
          pos, vel: _v.set(randRange(-1, 1), randRange(0, 1), randRange(-1, 1)).multiplyScalar(randRange(2, 5)),
          life: randRange(0.15, 0.35), size: randRange(0.03, 0.07),
          grav: -16, drag: 1, color: sp, bounce: 0, floorY: -999,
        });
      }
    }
  }

  shell(pos, rightDir, opts = {}) {
    const onBounce = opts.sound === 'fiftyBrass'
      ? ((pt, impactVel, bounceIndex) => { if (this.game.audio && this.game.audio.fiftyBrassLand) this.game.audio.fiftyBrassLand(impactVel, bounceIndex); })
      : null;
    if (opts.mesh === 'fiftyCase') {
      this._spawnFiftyCase(pos, rightDir, opts, onBounce);
      return;
    }
    this._spawn({
      pos: pos.clone(),
      vel: rightDir.clone().multiplyScalar(randRange(opts.sideMin || 2, opts.sideMax || 3.5)).add(_v.set(0, randRange(opts.upMin || 1.5, opts.upMax || 2.5), 0)),
      life: opts.life || 1.4, size: opts.size || 0.05, grav: opts.grav ?? -16, drag: opts.drag ?? 0.4,
      color: new THREE.Color(opts.color || 0xd9a441), bounce: opts.bounce ?? 0.4, floorY: opts.floorY ?? (pos.y - 1.2), shrink: false,
      onBounce, maxBounceSounds: opts.maxBounceSounds ?? (onBounce ? 3 : 0), bounceSoundMinVel: opts.bounceSoundMinVel ?? 2.2,
    });
  }

  _spawnFiftyCase(pos, rightDir, opts, onBounce) {
    const rnd = opts.seed != null ? this._seedRand(opts.seed) : Math.random;
    const rr = (lo, hi) => lo + (hi - lo) * rnd();
    let c = this.cases.find((x) => !x.mesh.visible);
    if (!c) {
      const mesh = new THREE.Mesh(this.caseGeo, this.caseMat);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.visible = false;
      this.scene.add(mesh);
      c = { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), rotV: new THREE.Vector3(), life: 0, maxLife: 1, bounces: 0 };
      this.cases.push(c);
    }
    const side = rightDir.clone().normalize().multiplyScalar(rr(opts.sideMin || 2.6, opts.sideMax || 4.2));
    c.mesh.visible = true;
    c.pos.copy(pos);
    c.vel.copy(side).add(_v.set(rr(-0.2, 0.2), rr(opts.upMin || 1.2, opts.upMax || 2.1), rr(-0.2, 0.2)));
    c.rot.set(rnd() * 6, rnd() * 6, rnd() * 6);
    c.rotV.set(rr(-22, 22), rr(-32, 32), rr(-24, 24));
    c.life = c.maxLife = opts.life || 5;
    c.grav = opts.grav ?? -16;
    c.drag = opts.drag ?? 0.12;
    c.bounce = opts.bounce ?? 0.48;
    c.baseFloorY = opts.floorY ?? (pos.y - 1.2);
    c.floorY = c.baseFloorY;
    c._stacked = false;
    c.onBounce = onBounce;
    c.bounces = 0;
    c.maxBounceSounds = opts.maxBounceSounds ?? (onBounce ? 3 : 0);
    c.bounceSoundMinVel = opts.bounceSoundMinVel ?? 1.4;
    c.mesh.scale.setScalar(opts.size || 1);
    c.mesh.position.copy(c.pos);
    c.mesh.rotation.copy(c.rot);
  }

  _caseStackY(pos, baseY) {
    let nearby = 0;
    for (const c of this.cases) {
      if (!c.mesh.visible || c.bounces <= 0) continue;
      const dx = c.pos.x - pos.x, dz = c.pos.z - pos.z;
      if (dx * dx + dz * dz < 0.42) nearby++;
    }
    return baseY + Math.min(0.22, nearby * 0.018);
  }

  tracer(from, to, color = 0xffe08a) {
    let t = this.tracers.find((x) => !x.mesh.visible);
    if (!t) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.tracerMat.clone());
      mesh.castShadow = false;
      this.scene.add(mesh);
      t = { mesh, life: 0 };
      this.tracers.push(t);
    }
    const dist = from.distanceTo(to);
    t.mesh.visible = true;
    t.mesh.material.color.set(color);
    t.mesh.material.opacity = 0.9;
    t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    t.mesh.scale.set(0.03, 0.03, dist);
    t.mesh.lookAt(to);
    t.life = 0.06;
  }

  muzzleFlash(pos, dir, scale = 1) {
    const f = this.flashes.find((x) => x.life <= 0) || this.flashes[0];
    f.mesh.visible = true;
    f.mesh.position.copy(pos);
    f.mesh.scale.setScalar(randRange(0.5, 0.8) * scale);
    f.mesh.material.opacity = 1;
    f.mesh.rotation.z = Math.random() * Math.PI;
    f.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    f.mesh.rotateZ(Math.random() * Math.PI);
    f.life = 0.05;
    // light pop
    this.flashLight.position.copy(pos);
    this.flashLight.color.set(0xffcc66);
    this.flashLight.intensity = 6 * scale;
    this._lightLife = 0.06;
  }

  explosion(pos, radius = 6) {
    // core particles
    const fire = new THREE.Color(0xff7a2a);
    const smoke = new THREE.Color(0x55504a);
    for (let i = 0; i < 30; i++) {
      const isFire = Math.random() < 0.6;
      this._spawn({
        pos, vel: _v.set(randRange(-1, 1), randRange(-0.3, 1), randRange(-1, 1)).normalize().multiplyScalar(randRange(3, 10)),
        life: randRange(0.4, 1.0), size: randRange(0.2, 0.5),
        grav: isFire ? 2 : -2, drag: 1.5,
        color: isFire ? fire : smoke, bounce: 0, floorY: -999,
      });
    }
    // shockwave ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.7, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false })
    );
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.rings.push({ mesh: ring, life: 0.4, maxLife: 0.4, radius });
    // big light
    this.flashLight.position.copy(pos);
    this.flashLight.color.set(0xff8030);
    this.flashLight.intensity = 14;
    this._lightLife = 0.18;
    this.game.audio.explosion();
  }

  update(dt) {
    // particles
    let i = 0;
    for (let k = 0; k < this.capacity; k++) {
      const pt = this.p[k];
      if (!pt.alive) continue;
      pt.life -= dt;
      if (pt.life <= 0) { pt.alive = false; _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(k, _m); continue; }
      pt.vel.y += pt.grav * dt;
      pt.vel.multiplyScalar(Math.max(0, 1 - pt.drag * dt));
      pt.pos.addScaledVector(pt.vel, dt);
      if (pt.pos.y < pt.floorY && pt.bounce > 0) {
        const impactVel = Math.abs(pt.vel.y);
        pt.pos.y = pt.floorY;
        pt.vel.y = -pt.vel.y * pt.bounce;
        pt.vel.x *= 0.6; pt.vel.z *= 0.6;
        if (pt.onBounce && pt.bounces < pt.maxBounceSounds && impactVel >= pt.bounceSoundMinVel) pt.onBounce(pt, impactVel, pt.bounces);
        pt.bounces++;
      }
      pt.rot.x += pt.rotV.x * dt; pt.rot.y += pt.rotV.y * dt; pt.rot.z += pt.rotV.z * dt;
      const lifeFrac = pt.life / pt.maxLife;
      const sz = pt.bloom ? pt.size * Math.sin((1 - lifeFrac) * Math.PI)
        : pt.shrink ? pt.size * clamp(lifeFrac * 1.3, 0.05, 1) : pt.size;
      _q.setFromEuler(pt.rot);
      _m.compose(pt.pos, _q, _s.set(sz, sz, sz));
      this.mesh.setMatrixAt(k, _m);
      this.mesh.setColorAt(k, pt.color);
      i++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // mesh casings
    for (const c of this.cases) {
      if (!c.mesh.visible) continue;
      c.life -= dt;
      if (c.life <= 0) { c.mesh.visible = false; continue; }
      c.vel.y += c.grav * dt;
      c.vel.multiplyScalar(Math.max(0, 1 - c.drag * dt));
      c.pos.addScaledVector(c.vel, dt);
      if (c.pos.y < c.floorY && c.bounce > 0) {
        const impactVel = Math.abs(c.vel.y);
        if (!c._stacked) { c.floorY = this._caseStackY(c.pos, c.baseFloorY); c._stacked = true; }
        c.pos.y = c.floorY;
        c.vel.y = -c.vel.y * c.bounce;
        c.vel.x *= 0.58; c.vel.z *= 0.58;
        c.rotV.multiplyScalar(0.82);
        if (c.onBounce && c.bounces < c.maxBounceSounds && impactVel >= c.bounceSoundMinVel) c.onBounce(c, impactVel, c.bounces);
        c.bounces++;
      }
      c.rot.x += c.rotV.x * dt; c.rot.y += c.rotV.y * dt; c.rot.z += c.rotV.z * dt;
      c.mesh.position.copy(c.pos);
      c.mesh.rotation.copy(c.rot);
    }

    // tracers
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.06) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }

    // flashes
    for (const f of this.flashes) {
      if (f.life <= 0) { if (f.mesh.visible) f.mesh.visible = false; continue; }
      f.life -= dt;
      f.mesh.material.opacity = Math.max(0, f.life / 0.05);
      if (f.life <= 0) f.mesh.visible = false;
    }

    // explosion rings
    for (let r = this.rings.length - 1; r >= 0; r--) {
      const ring = this.rings[r];
      ring.life -= dt;
      const f = 1 - ring.life / ring.maxLife;
      const sc = 0.5 + f * ring.radius * 2;
      ring.mesh.scale.set(sc, sc, sc);
      ring.mesh.material.opacity = (1 - f) * 0.8;
      if (ring.life <= 0) { this.scene.remove(ring.mesh); ring.mesh.geometry.dispose(); ring.mesh.material.dispose(); this.rings.splice(r, 1); }
    }

    // flash light decay
    if (this._lightLife > 0) {
      this._lightLife -= dt;
      this.flashLight.intensity *= Math.max(0, 1 - dt * 14);
      if (this._lightLife <= 0) this.flashLight.intensity = 0;
    }
  }
}
