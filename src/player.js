// player.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { clamp, damp } from './util.js';
import { FALL_ARMOR_BYPASS, FALL_DMG_BONUS_AT_LETHAL, FALL_DMG_PER_VY, FALL_LETHAL, FALL_SAFE, HUNGER_DRAIN_PER_SEC, HUNGER_LOW, HUNGER_LOW_SPEED_MULT, HUNGER_MAX, LEG_BREAK_VY, LIMP_SPEED_MULT, PLAYER_BURN_DPS, PLAYER_BURN_TICK, SPLINT_APPLY_TIME, STARVE_TICK_DMG, STARVE_TICK_TIME } from './tuning.js';

const CLIMB_SPEED = 3.7; // m/s on a ladder/скоб-трап (escape shaft + bunker tower)


// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(0, 0, 30); this.vel = new THREE.Vector3();
    this.yaw = Math.PI; this.pitch = 0;
    this.radius = 0.35; this.height = 1.7; this.eye = 1.62;
    this.onGround = true; this.sens = 0.0022;
    this._footT = 0; this._fallVel = 0; this._regenT = 0; this._camY = this.eye;
    this.resetStats();
  }
  resetStats() {
    this.maxHp = 100; this.hp = 100; this.armor = 0; this.armorMax = 100;
    this.money = 0; this.radios = 0; this.alive = true;
    this.moveSpeedMult = 1; this.damageMult = 1; this.reloadMult = 1;
    this.armorOnWave = 0;
    this.mountedGun = null;
    // --- survival mechanics ---
    this.legBroken = false; this._splintT = 0; this.splints = 0;
    this.hunger = HUNGER_MAX; this._starveT = 0; this._wasFrozen = false;
    this.burnT = 0; this._burnTickT = 0;
  }
  reset() {
    this.pos.set(0, 0, 30); this.vel.set(0, 0, 0); this.yaw = Math.PI; this.pitch = 0;
    if (this.game && this.game.mapId === 'steppe') { this.pos.set(-330, 0, -282); this.yaw = Math.PI; } // spawn in the field strongpoint (home base, far SW), facing in
    else if (this.game && this.game.mapId === 'demo') { // ?map=demo: spawn ON the terrain, near + facing the big hill (60,-40) so it's a short walk up
      const t = this.game.world && this.game.world.terrain;
      const sx = 35, sz = -8;
      this.pos.set(sx, t ? t.terrainHeightAt(sx, sz) : 0, sz);
      this.yaw = Math.atan2(-(60 - sx), -(-40 - sz)); // fwd = (-sin yaw, 0, -cos yaw) aimed at the hill
    }
    this.onGround = true; this._regenT = 0; this.resetStats();
  }

  hurt(dmg, bypassArmor = 0) {
    if (this.game.freecam) return;            // observation/fly-cam: invulnerable
    if (!this.alive) return;
    if (this.game.rules && this.game.rules.god) return;
    const mp = this.game.mp;
    if (mp && mp.active) { mp.claimPlayerHit(mp.myId, dmg); return; } // co-op: player damage is host-authoritative (pstate owns hp/armor/down/3-down death)
    // bypassArmor 0..1 = fraction of dmg armor cannot soak (blunt trauma). 0 = bullets, 1 = ignores armor.
    if (this.armor > 0 && bypassArmor < 1) { const take = Math.min(this.armor, dmg * (1 - bypassArmor)); this.armor -= take; dmg -= take; this.game.hud.setArmor(this.armor, this.armorMax); }
    this.hp -= dmg; this._regenT = 0;
    this.game.audio.playerHurt(); this.game.hud.damageFlash();
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.game.onPlayerDead(); }
    else this.game.hud.setHealth(this.hp, this.maxHp);
  }
  breakLeg() {
    if (this.legBroken) return;
    this.legBroken = true;
    this.game.audio.playerHurt(); this.game.hud.damageFlash();
    this.game.hud.toast('🦵 LEG BROKEN — find a splint (use it from your inventory)!', 0xd23a2a);
    this.game.hud.setSurvival(this);
  }
  applySplint() {
    if (this._splintT > 0) return;
    if (!this.legBroken) { this.game.hud.toast('Leg is fine.', 0x7fd06a); return; }
    if (this.splints <= 0) { this.game.hud.toast('No splint.', 0xd23a2a); this.game.audio.noMoney(); return; }
    if (this.mountedGun) { this.game.hud.toast('Dismount first.', 0xd23a2a); return; }
    if (!this.onGround) { this.game.hud.toast("Can't splint mid-air.", 0xd23a2a); return; }
    this.splints--; this._splintT = SPLINT_APPLY_TIME;
    this.game.audio.reloadIn(); this.game.hud.setSurvival(this);
  }
  eatFood(amount) {
    const before = this.hunger;
    this.hunger = Math.min(HUNGER_MAX, this.hunger + amount);
    if (this.hunger <= before) { this.game.hud.toast('Already full.', 0x7fd06a); return false; }
    this.game.hud.setHunger(this.hunger); this.game.audio.reloadIn(); return true;
  }
  // Survival timers — called every frame from _updatePlaying so they keep ticking on foot or on the .50 cal.
  survivalTick(dt) {
    if (this.game.freecam) return;            // observation/fly-cam: no hunger/burn/regen
    const mp = this.game.mp;
    const frozen = mp.active && mp.frozen;
    if (this._wasFrozen && !frozen) { this.game.hud.setHunger(this.hunger); this.game.hud.setSurvival(this); } // refresh HUD after an MP revive/respawn
    this._wasFrozen = frozen;
    if (frozen) return;
    if (this._splintT > 0) {
      this._splintT -= dt;
      if (this._splintT <= 0) { this._splintT = 0; this.legBroken = false; this.game.hud.toast('🦵 Leg splinted — mobility restored', 0x7fd06a); this.game.hud.setSurvival(this); }
    }
    if (this.alive) {
      const h0 = this.hunger;
      this.hunger = Math.max(0, this.hunger - HUNGER_DRAIN_PER_SEC * dt);
      if (Math.floor(h0) !== Math.floor(this.hunger)) this.game.hud.setHunger(this.hunger);
      if (this.hunger <= 0) { this._starveT += dt; if (this._starveT >= STARVE_TICK_TIME) { this._starveT = 0; const starveFloor = this.maxHp * 0.5; if (this.hp > starveFloor) this._takeSurvivalDamage(Math.min(STARVE_TICK_DMG, this.hp - starveFloor), 1); } }
      else this._starveT = 0;
    }
    if (this.hp < this.maxHp && this.hunger > HUNGER_LOW) { this._regenT += dt; if (this._regenT > 4) { this.hp = Math.min(this.maxHp, this.hp + 12 * dt); this.game.hud.setHealth(this.hp, this.maxHp); } }
    // --- on fire (burnT set by molotov pools / in-hand shatter) ---
    if (this.burnT > 0) {
      this.burnT -= dt; this._burnTickT += dt;
      if (!mp.active && this._burnTickT >= PLAYER_BURN_TICK) { this._burnTickT = 0; this.hurt(PLAYER_BURN_DPS * PLAYER_BURN_TICK, 1); }
    } else this._burnTickT = 0;
    this.game.hud.setBurn(this.burnT);
  }
  // Fall/starvation damage — host-authoritative in MP (the armor-bypass nuance only applies in single-player).
  _takeSurvivalDamage(dmg, bypassArmor = 0) {
    if (this.game.rules && this.game.rules.god) return;
    const mp = this.game.mp;
    if (mp.active) this.game.mp.claimPlayerHit(mp.myId, dmg);
    else this.hurt(dmg, bypassArmor);
  }
  addMoney(n) { this.money += Math.round(n); this.game.hud.setMoney(this.money); }
  spend(n) { if (this.money >= n) { this.money -= n; this.game.hud.setMoney(this.money); return true; } return false; }

  // Dev fly-cam (noclip). Solo only; toggled with N or ?fly=1. Moves the eye directly in 3D, ignoring
  // collision/gravity/survival so the whole 500 m map can be inspected. `game.freecam` gates damage + spawns.
  _freecamUpdate(dt, input) {
    const controlsPaused = this.game.mpMenuOpen;
    if (!controlsPaused) {
      this.yaw -= input.mouseDX * this.sens;
      this.pitch -= input.mouseDY * this.sens;
    }
    this.pitch = clamp(this.pitch, -1.54, 1.54); // allow near-straight-down for top-downs
    const cp = Math.cos(this.pitch);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const boost = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const move = new THREE.Vector3().addScaledVector(fwd, input.forward).addScaledVector(right, input.strafe);
    if (input.isDown('Space')) move.y += 1;
    if (input.isDown('ControlLeft') || input.isDown('ControlRight') || input.isDown('KeyC')) move.y -= 1;
    if (controlsPaused) move.set(0, 0, 0);
    if (move.lengthSq() > 1) move.normalize();
    this.pos.addScaledVector(move, (boost ? 65 : 22) * dt);
    this.vel.set(0, 0, 0); this.onGround = false; this._fallVel = 0; this._camY = this.pos.y;
    const cam = this.game.engine.camera;
    cam.rotation.order = 'YXZ';
    cam.position.set(this.pos.x, this.pos.y, this.pos.z);
    cam.rotation.y = this.yaw; cam.rotation.x = this.pitch; cam.rotation.z = 0;
  }

  // Is the player's body column inside any registered ladder zone? (bunker escape shaft / tower скоб-трап)
  _onLadder() {
    const zones = this.game.world && this.game.world._ladders;
    if (!zones || !zones.length) return false;
    const x = this.pos.x, z = this.pos.z, fy = this.pos.y, hy = this.pos.y + this.height;
    for (const a of zones) {
      if (x < a.minX || x > a.maxX || z < a.minZ || z > a.maxZ) continue;
      if (hy < a.bottom || fy > a.top) continue;
      return true;
    }
    return false;
  }

  update(dt) {
    const input = this.game.input;
    if (this.game.freecam) return this._freecamUpdate(dt, input); // dev noclip fly-cam (solo only)
    const mp = this.game.mp;
    const frozen = mp && mp.active && mp.frozen;
    const controlsPaused = mp && mp.active && this.game.mpMenuOpen;
    const lookScale = frozen ? 0.35 : 1;
    this.yaw -= input.mouseDX * this.sens * lookScale;
    this.pitch -= input.mouseDY * this.sens * lookScale;
    this.pitch = frozen ? clamp(this.pitch, -0.45, 0.32) : clamp(this.pitch, -1.45, 1.45);

    if (frozen) {
      this.vel.x = 0; this.vel.z = 0;
      this.vel.y -= 22 * dt; this._fallVel = this.vel.y;
      const wasAir = !this.onGround;
      this.onGround = this.game.world.collide(this.pos, this.vel, this.radius, this.height, dt);
      if (this.onGround && wasAir && this._fallVel < -6) this.game.audio.land(false);
      this._footT = 0;
      this._camY = damp(this._camY, this.pos.y + 0.34, 10, dt);
      const cam = this.game.engine.camera;
      cam.rotation.order = 'YXZ';
      cam.position.set(this.pos.x, this._camY, this.pos.z);
      cam.rotation.y = this.yaw; cam.rotation.x = this.pitch - 0.08; cam.rotation.z = damp(cam.rotation.z || 0, 0.72, 8, dt);
      return;
    }

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const sprint = !controlsPaused && (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && !this.legBroken && this._splintT <= 0;
    let survMult = 1;
    if (this.legBroken) survMult *= LIMP_SPEED_MULT;
    if (this.hunger < HUNGER_LOW) survMult *= HUNGER_LOW_SPEED_MULT;
    if (this._splintT > 0) survMult = 0; // immobile while binding the splint
    const speed = (sprint ? 7.6 : 5.2) * this.moveSpeedMult * survMult;
    const wish = controlsPaused ? new THREE.Vector3() : new THREE.Vector3().addScaledVector(fwd, input.forward).addScaledVector(right, input.strafe);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);
    const accel = this.onGround ? 6 : 1.2;
    this.vel.x = damp(this.vel.x, wish.x, accel, dt);
    this.vel.z = damp(this.vel.z, wish.z, accel, dt);

    // --- ladder climb (bunker escape shaft + НП tower скоб-трап) — gravity off, no fall damage ---
    const onLadder = this._onLadder();
    if (onLadder && !controlsPaused) {
      let climb = 0;
      if (input.isDown('Space')) climb = 1;
      else if (input.isDown('ControlLeft') || input.isDown('ControlRight') || input.isDown('KeyC')) climb = -1;
      else if (input.forward > 0.1) climb = (this.pitch < -0.12 ? -1 : 1); // walk into the ladder: look down to descend, else climb up
      else if (input.forward < -0.1) climb = -1;
      this.vel.y = climb * CLIMB_SPEED; this._fallVel = 0;
      this.vel.x *= 0.5; this.vel.z *= 0.5;                                 // stick to the rungs
    } else {
      if (!controlsPaused && this.onGround && input.wasPressed('Space') && !this.legBroken && this._splintT <= 0) { this.vel.y = 7.2; this.onGround = false; this.game.audio.jump(); }
      this.vel.y -= 22 * dt; this._fallVel = this.vel.y;
    }
    const wasAir = !this.onGround;
    this.onGround = this.game.world.collide(this.pos, this.vel, this.radius, this.height, dt);
    if (!onLadder && this.onGround && wasAir && this._fallVel < -6) this.game.audio.land(this._fallVel < -12);
    if (!onLadder && this.onGround && wasAir && this._fallVel < FALL_SAFE) {
      let dmg = ((-this._fallVel) - (-FALL_SAFE)) * FALL_DMG_PER_VY; // HP per m/s beyond the safe threshold
      if (this._fallVel <= FALL_LETHAL) dmg += FALL_DMG_BONUS_AT_LETHAL;
      if (this._fallVel <= LEG_BREAK_VY && !this.legBroken) this.breakLeg();
      this._takeSurvivalDamage(dmg, FALL_ARMOR_BYPASS); // blunt trauma; host-authoritative in MP
    }

    const horiz = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && horiz > 1.5) { this._footT -= dt; if (this._footT <= 0) { this._footT = sprint ? 0.3 : 0.42; this.game.audio.footstep(); } }
    else this._footT = 0;

    this._camY = damp(this._camY, this.pos.y + this.eye, 18, dt);
    const cam = this.game.engine.camera;
    cam.rotation.order = 'YXZ';
    cam.position.set(this.pos.x, this._camY, this.pos.z);
    cam.rotation.y = this.yaw + this.game.weapons.recoilYawKick; cam.rotation.x = this.pitch + this.game.weapons.recoilPitch; cam.rotation.z = 0;
  }
}
