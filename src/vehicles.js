// vehicles.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { clamp, rng, rr } from './util.js?u=3';
import { _tankWrecks, animateTank, buildTankWreck, tankGroundFX, updateTankLights } from './bosstank.js';


// ---------------------------------------------------------------------------
// CapturedTank — boardable T-90M after Mitri is killed.
// Mirrors the MountedGun mount/dismount/controlUpdate pattern.
// Architected 2-player-ready: each seat is an independent station;
// co-op can later fill the other seat remotely.
// Driver/gunner views + firing are implemented in later tasks.
// ---------------------------------------------------------------------------
export class CapturedTank {
  constructor(game, group, pos, yaw) {
    this.game = game;
    this.group = group;
    this.pos = pos.clone();
    this.hullYaw = yaw || 0;
    this.turYaw = yaw || 0;
    this.gunPitch = 0;
    this.hp = this.hpMax = 2200;
    this.cannonAmmo = 16; this.cannonCD = 0;
    this.mgAmmo = 250; this.mgReload = 0;
    this.seats = { driver: { occupant: null }, gunner: { occupant: null } };
    this.active = null;             // 'driver' | 'gunner' | null (local seat)
    this.thermal = true;
    this.stance = 'sight';          // gunner: 'sight' | 'peek'
    this.group.visible = true;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.hullYaw;
  }

  near(p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 4.5; }

  shielded() { return this.active != null && this.stance !== 'peek'; } // buttoned-up in any seat = armor protects the player

  enter(seat) {
    this.seats[seat].occupant = 'local';
    this.active = seat;
    this.game.player.inTank = this;
    this.game.weapons.group.visible = false;
    if (this.game.audio.reloadIn) this.game.audio.reloadIn();
  }

  switchSeat() {
    this.active = this.active === 'driver' ? 'gunner' : 'driver';
    this.stance = 'sight'; this.peekYaw = null; this.peekPitch = null;
    if (this.game.audio.uiClick) this.game.audio.uiClick();
  }

  leave() {
    this._showOverlay('none');
    if (this.active) this.seats[this.active].occupant = null;
    this.active = null;
    this.game.player.inTank = null;
    this.game.weapons.group.visible = true;
    const bx = Math.sin(this.hullYaw + 1.6), bz = Math.cos(this.hullYaw + 1.6);
    this.game.player.pos.set(this.pos.x + bx * 3, 0, this.pos.z + bz * 3);
    if (this.game.player.vel) this.game.player.vel.set(0, 0, 0);
    if (this.game.hud.setTankHp) this.game.hud.setTankHp(-1);
  }

  hurt(d) {
    if (!this.group || this.hp <= 0) return;
    this.hp -= d;
    if (this.game.engine.shake) this.game.engine.shake(0.15);
    if (this.hp <= 0) this.destroy();
  }

  destroy() {
    if (this._dead) return; this._dead = true;
    const c = new THREE.Vector3(this.pos.x, 1.4, this.pos.z);
    for (let k = 0; k < 4; k++) this.game.effects.explosion(c.clone().add(new THREE.Vector3(rr(-1.5, 1.5), rr(0, 1.5), rr(-1.5, 1.5))), 4);
    if (this.game.audio.enemyDie) this.game.audio.enemyDie();
    if (this.game.engine.shake) this.game.engine.shake(0.5);
    const wasAboard = this.active != null;
    this.leave();                                   // clears player.inTank (so the next hurt isn't shielded) + restores weapons + ejects beside tank
    if (wasAboard) this.game.player._takeSurvivalDamage(35, 1);        // ejection damage (now unshielded since leave() cleared inTank)
    if (this.group) this.group.visible = false;
    if (this.game.world.addWreckObstacle) this.game.world.addWreckObstacle(this.pos.clone(), this.hullYaw);
    { // Place visible wreck mesh + register for lingering smoke
      const wreckMesh = buildTankWreck();
      wreckMesh.position.set(this.pos.x, 0, this.pos.z);
      wreckMesh.rotation.y = this.hullYaw;
      this.game.engine.scene.add(wreckMesh);
      if (_tankWrecks.length >= 6) {
        const oldest = _tankWrecks.shift();
        if (oldest.mesh.parent) oldest.mesh.parent.remove(oldest.mesh);
      }
      _tankWrecks.push({ mesh: wreckMesh, pos: { x: this.pos.x, y: 0, z: this.pos.z }, t: 0, _smokeAccum: 0 });
    }
    if (this.game.hud.setTankHp) this.game.hud.setTankHp(-1);  // hide HP bar
    this.game.capturedTank = null;
  }

  controlUpdate(dt) {
    this.game.player.pos.set(this.pos.x, 0, this.pos.z); // player rides inside the tank
    if (this.active === 'driver') this._driver(dt);
    else if (this.active === 'gunner') (this._gunner ? this._gunner(dt) : this._followCam());
    else this._followCam();
    this._tickShells(dt);   // shells fly regardless of seat
    if (this.game.hud.setTankHp) this.game.hud.setTankHp(this.hp / this.hpMax); // show + update HP bar while crewing
    updateTankLights(this.group, this.game);
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 2); // decay recoil (all seats)
    animateTank(this.group, dt, this._lastSpd || 0, this.recoil);
    tankGroundFX(this.group, this.game, dt, this._lastSpd || 0, false); // captured tank: base smoke only
  }

  _followCam() {
    this._showOverlay('none');
    const cam = this.game.engine.camera;
    cam.rotation.order = 'YXZ';
    const back = 8, up = 4;
    cam.position.set(
      this.pos.x - Math.sin(this.hullYaw) * back,
      up,
      this.pos.z - Math.cos(this.hullYaw) * back
    );
    cam.lookAt(this.pos.x, 1.5, this.pos.z);
  }

  _driver(dt) {
    const input = this.game.input;
    const turnRate = 1.1;                                  // rad/s, heavy
    if (input.isDown('KeyA')) this.hullYaw += turnRate * dt;
    if (input.isDown('KeyD')) this.hullYaw -= turnRate * dt;
    let spd = 0; const max = 1.6;
    if (input.isDown('KeyW')) spd = max;
    else if (input.isDown('KeyS')) spd = -max * 0.6;
    this._lastSpd = spd;
    const fwd = new THREE.Vector3(Math.sin(this.hullYaw), 0, Math.cos(this.hullYaw));
    this.pos.x += fwd.x * spd * dt; this.pos.z += fwd.z * spd * dt;
    if (spd !== 0) this._runOver();
    this._collide();
    const lim = this.game.world.HALF - 2.6;
    this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim);
    this.group.position.set(this.pos.x, 0, this.pos.z); this.group.rotation.y = this.hullYaw;
    // periscope camera: first-person at the driver hatch, looking forward along the hull
    const cam = this.game.engine.camera; cam.rotation.order = 'YXZ';
    cam.position.set(this.pos.x + fwd.x * 1.9, 1.5, this.pos.z + fwd.z * 1.9);
    cam.rotation.set(0, this.hullYaw, 0);
    if (this.game.engine.setFov) this.game.engine.setFov(72);
    this._showOverlay('periscope');
    // crude engine rumble while driving (optional, low vol)
    this._engT = (this._engT || 0) - dt;
    if (this._engT <= 0 && this.game.audio.tone) { this._engT = 0.28; this.game.audio.tone(42, 0.26, 'sawtooth', 0.05 + (spd !== 0 ? 0.04 : 0)); }
  }

  // ---- Task 17: gunner station ------------------------------------------------

  _gunner(dt) {
    // ---- Task 19: commander peek stance (wide free-look, exposed, no firing) ----
    if (this.stance === 'peek') {
      const input = this.game.input, sens = this.game.player.sens || 0.0022;
      this.peekYaw   = (this.peekYaw   == null ? this.turYaw : this.peekYaw) - input.mouseDX * sens;
      this.peekPitch = clamp((this.peekPitch == null ? 0 : this.peekPitch) - input.mouseDY * sens, -0.8, 0.5);
      if (this.group.userData.hatch) this.group.userData.hatch.position.y = 1.6; // hatch up, commander exposed
      const cam = this.game.engine.camera; cam.rotation.order = 'YXZ';
      cam.position.set(this.pos.x, 3.4, this.pos.z);                              // head out of the cupola
      cam.rotation.set(this.peekPitch, this.peekYaw, 0);
      if (this.game.engine.setFov) this.game.engine.setFov((this.game.settings && this.game.settings.data && this.game.settings.data.fov) || 80);
      this._showOverlay('none');
      return; // no firing while peeking
    }

    // ---- sight stance ----
    if (this.group.userData.hatch) this.group.userData.hatch.position.y = 1.0; // hatch down, buttoned-up

    const input = this.game.input;
    const cam   = this.game.engine.camera;
    const sens  = this.game.player.sens || 0.0025;

    // 1. Mouse aim (weighty)
    this.turYaw  -= input.mouseDX * sens;
    this.gunPitch = clamp(this.gunPitch - input.mouseDY * sens, -0.15, 0.4);

    // 2. Apply to rig
    const ud = this.group.userData;
    if (ud.turret)     ud.turret.rotation.y     = this.turYaw - this.hullYaw;
    if (ud.gunMantlet) ud.gunMantlet.rotation.x = -this.gunPitch;

    // 3. Camera down the sight
    cam.rotation.order = 'YXZ';
    const aimFwd = new THREE.Vector3(Math.sin(this.turYaw), 0, Math.cos(this.turYaw));
    cam.position.set(
      this.pos.x - aimFwd.x * 0.4,
      2.7,
      this.pos.z - aimFwd.z * 0.4
    );
    cam.rotation.set(this.gunPitch, this.turYaw, 0);
    if (this.game.engine.setFov) this.game.engine.setFov(this.thermal ? 40 : 45);
    this._showOverlay('sight');
    this._updateSight();

    // 4. Fire timers
    this.cannonCD -= dt;
    if (this.mgReload > 0) this.mgReload -= dt;

    // LMB → cannon
    if (input.buttons[0] && this.cannonCD <= 0 && this.cannonAmmo > 0) {
      this._gunFireCannon();
    }
    // RMB → MG
    if (input.buttons[2]) {
      this._gunFireMG(dt);
    }

  }

  _gunFireCannon() {
    this.cannonCD  = 3.5;
    this.cannonAmmo--;

    const cam = this.game.engine.camera;
    cam.updateMatrixWorld();
    const muz = this.group.userData.muzzle
      ? this.group.userData.muzzle.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(this.pos.x, 2.4, this.pos.z);

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();

    // shell mesh
    this.shells = this.shells || [];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.65),
      new THREE.MeshBasicMaterial({ color: 0xffe060 })
    );
    mesh.position.copy(muz);
    this.game.engine.scene.add(mesh);
    this.shells.push({ mesh, vel: dir.clone().multiplyScalar(70), fuse: 3, radius: 6.5, dmg: 200 });

    this.recoil = 0.5;
    if (this.game.effects.muzzleFlash) this.game.effects.muzzleFlash(muz, dir, 2.6);
    if (this.game.audio.gunshot) this.game.audio.gunshot({ body: 55, crack: 0.3, vol: 1.0, hp: 400, bp: 120 });
    if (this.game.engine.shake) this.game.engine.shake(0.25);

    if (this.cannonAmmo <= 0 && this.game.hud.bigMessage) {
      this.game.hud.bigMessage('OUT OF SHELLS', 'MG only');
    }
  }

  _tickShells(dt) {
    if (!this.shells || this.shells.length === 0) return;
    const enemies = this.game.enemies;
    const scene   = this.game.engine.scene;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.fuse -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const p = s.mesh.position;

      let boom = p.y < 0.2 || s.fuse <= 0;

      // ray along velocity for world collision
      if (!boom && this.game.world.rayHit) {
        const velDir = s.vel.clone().normalize();
        const step   = s.vel.length() * dt + 0.5;
        if (this.game.world.rayHit(p, velDir, step)) boom = true;
      }

      // proximity to any alive enemy
      if (!boom) {
        for (const e of enemies.active) {
          if (!e.alive) continue;
          if (Math.hypot(p.x - e.pos.x, p.z - e.pos.z) < (e.radius || 1) + 0.8) { boom = true; break; }
        }
      }

      if (boom) {
        if (this.game.effects.explosion) this.game.effects.explosion(p.clone(), s.radius);
        enemies.damageInRadius(p.clone(), s.radius, s.dmg);
        if (this.game.engine.shake) this.game.engine.shake(0.2);
        scene.remove(s.mesh);
        this.shells.splice(i, 1);
      } else if (p.y < -5) {
        scene.remove(s.mesh);
        this.shells.splice(i, 1);
      }
    }
  }

  _gunFireMG(dt) {
    if (this.mgReload > 0) return;
    this._mgCD = (this._mgCD || 0) - dt;
    if (this._mgCD > 0) return;
    this._mgCD = 0.08;

    if (this.mgAmmo <= 0) { this.mgReload = 3; this.mgAmmo = 250; return; }
    this.mgAmmo--;

    const cam = this.game.engine.camera;
    cam.updateMatrixWorld();
    const o = this.group.userData.mgMuzzle
      ? this.group.userData.mgMuzzle.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(this.pos.x, 2.4, this.pos.z);

    // camera-forward + small jitter
    const jit = 0.03;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    dir.x += rr(-jit, jit); dir.y += rr(-jit, jit); dir.z += rr(-jit, jit); dir.normalize();

    const range  = 60;
    const enemies = this.game.enemies;
    const eHit = enemies.rayHit(o, dir, range);
    const wHit = this.game.world.rayHit(o, dir, range);

    const eDist = eHit ? eHit.dist : Infinity;
    const wDist = wHit ? wHit.dist : Infinity;
    const endPt = o.clone().addScaledVector(dir, Math.min(eDist, wDist, range));

    if (this.game.effects.tracer) this.game.effects.tracer(o, endPt, 0xfff1a0);

    if (eHit && eDist < wDist) {
      enemies.damage(eHit.enemy, 9, 'gun', eHit.point);
    }

    if (this.game.audio.tone) this.game.audio.tone(180, 0.03, 'square', 0.10);

    if (this.mgAmmo <= 0) {
      this.mgReload = 3;
      this.mgAmmo   = 250;
      if (this.game.audio.tone) this.game.audio.tone(80, 0.2, 'square', 0.2);
    }
  }

  _runOver() {
    const enemies = this.game.enemies;
    for (const e of enemies.active) {
      if (!e.alive || (e.def && e.def.boss) || e.isElite || e.isTank) continue;
      if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 3.0) {
        enemies.damage(e, (e.hp || 0) + 1, 'contact');
      }
    }
  }

  _collide() {
    const r = 2.6;
    for (const b of this.game.world.boxes) {
      if (b.max.y < 0.6) continue;
      if (this.pos.x + r <= b.min.x || this.pos.x - r >= b.max.x) continue;
      if (this.pos.z + r <= b.min.z || this.pos.z - r >= b.max.z) continue;
      const px = Math.min(b.max.x + r - this.pos.x, this.pos.x - (b.min.x - r));
      const pz = Math.min(b.max.z + r - this.pos.z, this.pos.z - (b.min.z - r));
      if (px < pz) this.pos.x += (this.pos.x < (b.min.x + b.max.x) / 2 ? -px : px);
      else this.pos.z += (this.pos.z < (b.min.z + b.max.z) / 2 ? -pz : pz);
    }
  }

  _updateSight() {
    const c = this.game.canvas || document.getElementById('game');
    if (c) c.classList.toggle('thermal-cam', !!this.thermal);
    const id = (x) => document.getElementById(x);
    const mode = id('ts-mode'); if (mode) mode.textContent = this.thermal ? 'ТЕПЛО' : 'ДЕНЬ';
    const ammo = id('ts-ammo'); if (ammo) ammo.textContent = String(this.cannonAmmo);
    const st = id('ts-state'); if (st) st.textContent = this.cannonAmmo <= 0 ? 'ПУСТО' : (this.cannonCD > 0 ? 'ЗАРЯД' : 'ГОТОВ');
    // range readout: cast forward ray vs enemies + world, show nearer distance
    const cam = this.game.engine.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const o = cam.position.clone();
    const eH = this.game.enemies.rayHit(o, fwd, 400);
    const wH = this.game.world.rayHit(o, fwd, 400);
    let d = eH && (!wH || eH.dist <= wH.dist) ? eH.dist : (wH ? wH.dist : null);
    const rng = id('ts-range'); if (rng) rng.textContent = d != null ? String(Math.round(d * 4)) : '----';
  }

  _showOverlay(which) {
    const ps = document.getElementById('periscope'), ts = document.getElementById('tanksight');
    if (ps) ps.classList.toggle('show', which === 'periscope');
    if (ts) ts.classList.toggle('show', which === 'sight');
    // clear thermal canvas filter whenever we leave the sight stance
    if (which !== 'sight') {
      const c = this.game.canvas || document.getElementById('game');
      if (c) c.classList.remove('thermal-cam');
    }
  }

  forceReset() {
    if (this.game.player && this.game.player.inTank === this) {
      this.game.player.inTank = null;
      this.game.weapons.group.visible = true;
    }
    this.active = null;
    this.seats.driver.occupant = null;
    this.seats.gunner.occupant = null;
    this._showOverlay('none');
    if (this.game.hud) this.game.hud.setTankHp(-1);
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
  }
}
