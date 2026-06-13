// mortar.js — the crewed 82-ПМ-37 indirect-fire station (co-op gunner seat).
//
// A FIXED emplacement the gunner mans (E), then lays BLIND by the dials — W/S elevation
// (→ range), A/D traverse azimuth (Shift = coarse) — and fires (LMB). There is NO downrange
// sight: the camera frames the PIECE, the HUD shows the firing solution (elevation°→range,
// угломер mils, ammo). A teammate spots targets (game.tryMortarSpot / C) and CALLS the
// solution; the gunner dials to match. Indirect fire that rewards a two-man crew.
//
// Authority: the SEAT (occupant) + AMMO + the IMPACT are host-authoritative, cloned from the
// MountedGun fifty* pattern (mortarclaim/state/aim/firereq/fire). The host computes the impact
// point ONCE (mortar-ballistics, seeded) and ships it; clients render the identical arc but
// apply NO damage. Solo runs the host path locally with the net dormant. The HE detonation
// reuses the grenade/rocket sequence (effects + damageInRadius + _demoBlast + _explodeHurt).
import * as THREE from 'three';
import { clamp, lerp, TAU } from './util.js';
import { placeProp, hasModel } from './props/registry.js';
import { dirToMils, formatUglomer } from './bearing.js';
import * as BAL from './mortar-ballistics.js';

const MODEL_ID = 'mortar-82pm37';
const ELEV_RATE = 18;       // deg/s the elevation dial moves while W/S held
const AZ_FINE = 0.35;       // rad/s fine traverse (A/D)
const AZ_COARSE = 1.4;      // rad/s coarse traverse (Shift+A/D)
const SHELL_R = 0.041;      // visual bomb radius (m)

export class Mortar {
  constructor(game, pos, yaw = 0, opts = {}) {
    this.game = game;
    this.base = pos.clone();
    this.baseYaw = yaw;
    this.id = opts.id || 'mortar';
    this.occupant = null;                 // null / 'host' / peerId (host-authoritative seat)
    this.ammo = BAL.AMMO_MAX;
    this.az = 0;                          // traverse offset from baseYaw (rad)
    this.elevDeg = 65;                    // current elevation (mid-band)
    this.loadT = 0;                       // drop-load cadence timer
    this._aimT = 0;                       // mortaraim broadcast throttle
    this._screwSpin = 0;                  // cosmetic screw rotation accumulator
    this.shells = [];                     // in-flight bombs (tick every frame, even unseated)
    this._impactMarks = [];               // fading F3 landing rings (golf-tracer "where they land")
    this.root = null; this.azNode = this.elNode = this.elevScrewNode = this.traverseScrewNode = this.muzzleNode = null;
    this._netAz = null; this._netEl = null;  // remote-mirrored lay (non-occupant clients)
  }

  // ── lazy build (spec registers async at boot) ───────────────────────────────
  ensureBuilt() {
    if (this.root || !hasModel(MODEL_ID)) return;
    const y = this._groundY(this.base.x, this.base.z);
    this.base.y = y;
    this.root = placeProp(this.game.engine.scene, MODEL_ID, this.base.x, this.base.z, this.baseYaw, { y });
    if (!this.root) return;
    this.azNode = this.root.getObjectByName('azimuth');
    this.elNode = this.root.getObjectByName('elevation');
    this.elevScrewNode = this.root.getObjectByName('elevScrew');
    this.traverseScrewNode = this.root.getObjectByName('traverseScrew');
    this.muzzleNode = this.root.getObjectByName('muzzle');
    this._applyLay();
    // solid baseplate/bipod collider so you can't walk THROUGH the piece. Player collision
    // queries world.grid (the SpatialGrid index), NOT the raw boxes array — pushing to `boxes`
    // alone leaves the mortar phantom; the runtime grid.addBox is what actually makes it solid
    // (same pattern as world.js wreck/struct colliders).
    const box = {
      min: new THREE.Vector3(this.base.x - 0.4, y, this.base.z - 0.4),
      max: new THREE.Vector3(this.base.x + 0.4, y + 1.0, this.base.z + 0.4),
    };
    this.game.world.boxes.push(box);
    this.game.world.grid.addBox(box);
    this._collider = box;
  }

  _phi() { return this.baseYaw + this.az; }                 // world firing heading
  _groundY(x, z) { const t = this.game.world.terrain; return t && t.terrainHeightAt ? t.terrainHeightAt(x, z) : 0; }
  _range() { return BAL.elevToRange(this.elevDeg * Math.PI / 180); }
  _muzzleWorld() { this.root.updateMatrixWorld(true); return this.muzzleNode.getWorldPosition(new THREE.Vector3()); }
  _applyLay() {                                             // push az/elev to the rig nodes
    if (this.azNode) this.azNode.rotation.y = this.az;
    if (this.elNode) this.elNode.rotation.x = BAL.elevToRigX(this.elevDeg * Math.PI / 180);
    if (this.elevScrewNode) this.elevScrewNode.rotation.y = this._screwSpin;
    if (this.traverseScrewNode) this.traverseScrewNode.rotation.x = this._screwSpin;
  }

  near(p) { return !!this.root && Math.hypot(p.x - this.base.x, p.z - this.base.z) < 2.4 && Math.abs(p.y - this.base.y) < 2.2; }
  canMount(p) { return this.near(p) && this.occupant == null && this.ammo > 0; }
  updateNearby(p) { return this.canMount(p); }              // predicate parity with nearestMortar

  // ── seat lifecycle (clone of MountedGun: claim-gated in co-op, immediate solo) ──
  _doMount() {
    const pl = this.game.player;
    pl.mortar = this;
    this.game.weapons.group.visible = false;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '0';
    this._frameCamera();
    this._updateHud();
  }
  mount() {
    if (this.occupant != null && this.occupant !== this._myId()) { this.game.hud.toast && this.game.hud.toast('OCCUPIED', 0xd8b13a); return; }
    if (this.ammo <= 0) { this.game.hud.toast && this.game.hud.toast('NO ROUNDS', 0xd8b13a); return; }
    const mp = this.game.mp;
    if (!mp || !mp.active) { this._doMount(); return; }       // solo
    if (mp.isHost) mp._hostMortarClaim('mount', 'host', this.id);
    else mp.net.send('mortarclaim', { want: 'mount', m: this.id });
  }
  _doDismount() {
    const pl = this.game.player;
    if (pl.mortar !== this) return;
    pl.mortar = null;
    this.game.weapons.group.visible = true;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '';
    // view continuity: leave standing behind the piece, looking along the lay
    pl.yaw = this._phi() + Math.PI; pl.pitch = -0.1;
    pl.vel.set(0, 0, 0);
    this.game.engine.setFov((this.game.settings && this.game.settings.data.fov) || 80);
    this.game.hud.hideMortar && this.game.hud.hideMortar();
    this.game.hud.setWeapon(this.game.weapons);
  }
  dismount() {
    const wasMe = (this.game.player.mortar === this);
    this._doDismount();
    const mp = this.game.mp;
    if (mp && mp.active && wasMe) {
      if (mp.isHost) mp._hostMortarClaim('dismount', 'host', this.id);
      else mp.net.send('mortarclaim', { want: 'dismount', m: this.id });
    }
  }
  forceReset() {
    if (this.game.player.mortar === this) this._doDismount();
    this.occupant = null;
    const sc = this.game.engine.scene;
    for (const s of this.shells) { for (const o of [s.mesh, s.trace, s.ring]) if (o) { sc.remove(o); o.geometry.dispose(); o.material.dispose(); } }
    for (const k of this._impactMarks) { sc.remove(k.ring); k.ring.geometry.dispose(); k.ring.material.dispose(); }
    this.shells = []; this._impactMarks = [];
  }
  _myId() { const mp = this.game.mp; return mp && mp.active ? mp.myId : 'host'; }

  // ── per-FRAME (always; even unseated / on remotes — so in-flight shells land + the
  //     reload cadence ticks host-authoritatively regardless of who is seated) ──
  update(dt) {
    if (this.loadT > 0) this.loadT -= dt;
    const f3 = !!this.game.f3;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const f = clamp(s.t / s.tof, 0, 1);
      s.mesh.position.set(
        lerp(s.p0.x, s.p1.x, f),
        lerp(s.p0.y, s.p1.y, f) + s.apex * 4 * f * (1 - f),   // parabola (variable-dt safe)
        lerp(s.p0.z, s.p1.z, f),
      );
      if (s.trace) { s.trace.visible = f3; s.ring.visible = f3; }  // golf tracer only in F3
      if (f >= 1) { this._detonate(s); this.shells.splice(i, 1); }
    }
    for (let i = this._impactMarks.length - 1; i >= 0; i--) {       // fade the landing rings
      const k = this._impactMarks[i]; k.t -= dt;
      k.ring.visible = f3 && k.t > 0;
      k.ring.material.opacity = 0.4 * Math.max(0, k.t / k.life);
      if (k.t <= 0) { this.game.engine.scene.remove(k.ring); k.ring.geometry.dispose(); k.ring.material.dispose(); this._impactMarks.splice(i, 1); }
    }
    // non-occupant clients ease the rig toward the broadcast lay
    if (this._netAz != null && this.game.player.mortar !== this) {
      this.az = this._netAz; this.elevDeg = this._netEl; this._applyLay();
    }
  }

  // ── seated control: blind indirect lay by the dials, LMB fires ──────────────
  controlUpdate(dt) {
    const I = this.game.input;
    if (I.isDown('KeyW')) this.elevDeg = clamp(this.elevDeg + ELEV_RATE * dt, BAL.ELEV_MIN_DEG, BAL.ELEV_MAX_DEG);
    if (I.isDown('KeyS')) this.elevDeg = clamp(this.elevDeg - ELEV_RATE * dt, BAL.ELEV_MIN_DEG, BAL.ELEV_MAX_DEG);
    const coarse = (I.isDown('ShiftLeft') || I.isDown('ShiftRight')) ? AZ_COARSE : AZ_FINE;
    const turn = (I.isDown('KeyD') ? 1 : 0) - (I.isDown('KeyA') ? 1 : 0);
    this.az += turn * coarse * dt;
    const eleving = I.isDown('KeyW') || I.isDown('KeyS');
    if (turn || eleving) this._screwSpin += 8 * dt;
    this._applyLay();
    this._frameCamera();
    // pin the body (co-op ghost kneels behind the breech)
    const pl = this.game.player, up = new THREE.Vector3(0, 1, 0);
    const back = new THREE.Vector3(0, 0, -0.95).applyAxisAngle(up, this._phi());
    pl.pos.set(this.base.x + back.x, this.base.y, this.base.z + back.z); pl.vel.set(0, 0, 0);
    pl.yaw = this._phi() + Math.PI; pl.pitch = -0.2;
    if (I.buttons[0] && this.loadT <= 0 && this.ammo > 0) this.fire();   // loadT ticks in update() (always)
    // ~10 Hz lay broadcast so remotes slew the tube
    const mp = this.game.mp;
    if (mp && mp.active) { this._aimT -= dt; if (this._aimT <= 0) { this._aimT = 0.1; mp.net.broadcast('mortaraim', { pid: mp.myId, m: this.id, az: +this.az.toFixed(3), el: +this.elevDeg.toFixed(2) }); } }
    this._updateHud();
  }

  // FIRST-PERSON at the breech: you STAND behind the tube and stare up the barrel. Deliberately a
  // poor field of view — no downrange sight, the tube fills the frame and the battlefield beyond is
  // hidden. That blindness IS the mechanic: you lay by the dials and a spotter calls corrections.
  _frameCamera() {
    const cam = this.game.engine.camera;
    const phi = this._phi();
    const fwd = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));   // firing heading (bearing datum)
    // eye height, just behind the breech
    cam.position.set(this.base.x - fwd.x * 0.55, this.base.y + 1.55, this.base.z - fwd.z * 0.55);
    cam.rotation.order = 'YXZ';
    // aim up the tube toward the muzzle — the higher you crank, the more you just see barrel + sky
    const mz = this.muzzleNode ? this._muzzleWorld()
      : new THREE.Vector3(this.base.x + fwd.x * 0.6, this.base.y + 1.2, this.base.z + fwd.z * 0.6);
    const aim = new THREE.Vector3(this.base.x, this.base.y + 0.55, this.base.z).lerp(mz, 0.72);
    cam.lookAt(aim.x, aim.y, aim.z);
    this.game.engine.setFov((this.game.settings && this.game.settings.data.fov) || 80);
  }

  _updateHud() {
    if (!this.game.hud.setMortar) return;
    const mils = dirToMils(Math.sin(this._phi()), Math.cos(this._phi()));
    this.game.hud.setMortar({
      elevDeg: Math.round(this.elevDeg), range: Math.round(this._range()),
      mils: formatUglomer(mils), ammo: this.ammo, max: BAL.AMMO_MAX, loading: this.loadT > 0,
    });
  }

  // ── firing ──────────────────────────────────────────────────────────────────
  fire() {
    const mp = this.game.mp, hostSim = !mp || !mp.active || mp.isHost;
    if (this.ammo <= 0 || this.loadT > 0) return;
    if (hostSim) this._hostFire(mp);
    else mp.net.send('mortarfirereq', { m: this.id });      // client gunner asks host (no local damage)
    this.loadT = BAL.RELOAD_S;
    if (this.game.audio && this.game.audio.explosion) { /* a soft thunk foley could go here */ }
  }

  // host/solo authoritative shot: decrement ammo, compute the deterministic impact, fire.
  _hostFire(mp) {
    const phi = this._phi(), range = this._range(), seed = (this._rand() * 0xffffffff) >>> 0;
    const imp = BAL.impactPoint(this.base.x, this.base.z, phi, range, seed);
    const iy = this._groundY(imp.x, imp.z);
    const muzzle = this._muzzleWorld();
    this.setAmmo(this.ammo - 1);
    const grant = { m: this.id, o: [+muzzle.x.toFixed(2), +muzzle.y.toFixed(2), +muzzle.z.toFixed(2)],
      i: [+imp.x.toFixed(2), +iy.toFixed(2), +imp.z.toFixed(2)], tof: +BAL.timeOfFlight(range).toFixed(2), seed, ammo: this.ammo };
    this.loadT = BAL.RELOAD_S;                                // host-auth reload cadence (even when a client is the gunner)
    this.spawnShell(grant, true);
    if (mp && mp.active) mp.net.broadcast('mortarfire', grant);
  }
  _rand() { return Math.random(); }                          // host-only entropy (clients get the seed)

  spawnShell(grant, hostAuth) {
    const p0 = new THREE.Vector3(grant.o[0], grant.o[1], grant.o[2]);
    const p1 = new THREE.Vector3(grant.i[0], grant.i[1], grant.i[2]);
    const range = Math.hypot(p1.x - p0.x, p1.z - p0.z), apex = BAL.apexHeight(range);
    const geo = new THREE.CylinderGeometry(SHELL_R * 0.6, SHELL_R, 0.16, 8);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x23241f }));
    this.game.engine.scene.add(mesh);
    const { trace, ring } = this._buildTracer(p0, p1, apex);     // golf-style arc + landing ring (F3-gated)
    this.shells.push({ mesh, t: 0, tof: grant.tof, p0, p1, apex, hostAuth, trace, ring });
    if (Number.isFinite(grant.ammo)) this.setAmmo(grant.ammo);
  }

  // golf-tracer: a polyline tracing the WHOLE parabolic flight path + a ground ring at the landing
  // point (= the HE footprint). Both created always but shown only when F3 debug is on.
  _buildTracer(p0, p1, apex) {
    const f3 = !!this.game.f3, pts = [], N = 30;
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      pts.push(new THREE.Vector3(lerp(p0.x, p1.x, f), lerp(p0.y, p1.y, f) + apex * 4 * f * (1 - f), lerp(p0.z, p1.z, f)));
    }
    const trace = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.9 }));
    trace.visible = f3;
    this.game.engine.scene.add(trace);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, BAL.HE_RADIUS, 28), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p1.x, p1.y + 0.06, p1.z); ring.visible = f3;
    this.game.engine.scene.add(ring);
    return { trace, ring };
  }

  _detonate(shell) {
    const p = shell.p1.clone();
    this.game.effects.explosion(p, BAL.HE_RADIUS);
    if (this.game.audio && this.game.audio.explosion) this.game.audio.explosion();
    this.game.engine.scene.remove(shell.mesh); shell.mesh.geometry.dispose(); shell.mesh.material.dispose();
    if (shell.trace) { this.game.engine.scene.remove(shell.trace); shell.trace.geometry.dispose(); shell.trace.material.dispose(); } // drop the flight arc
    if (shell.ring) this._impactMarks.push({ ring: shell.ring, t: 4, life: 4 });   // keep the landing ring, fading (golf "where it landed")
    if (!shell.hostAuth) return;                             // clients: visual only
    this.game.enemies.damageInRadius(p, BAL.HE_RADIUS, BAL.HE_DMG, null, 'explosion');
    if (this.game.weapons._demoBlast) this.game.weapons._demoBlast(p, BAL.HE_RADIUS, true);  // HE breach / fell / ignite (self-gated)
    this.game._explodeHurt(p.clone(), BAL.HE_RADIUS, BAL.HE_DMG);
    this.game.loot.clearPickupsInRadius(p.x, p.z, BAL.HE_RADIUS);
  }

  setAmmo(n) { this.ammo = clamp(n | 0, 0, BAL.AMMO_MAX); if (this.game.player.mortar === this) this._updateHud(); }
}
