// shilka.js -- runtime adapter for the ZSU-23-4 Shilka station.
//
// The actual fire-control rules live in shilka-mechanics.js. This module owns Three.js
// meshes, camera framing, DOM overlay updates, and game integration.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import {
  SHILKA_PHASES,
  SHILKA_ROLES,
  SHILKA_SEARCH_MODES,
  SHILKA_TUNING,
  computeShilkaKinematics,
  createShilkaState,
  fireShilkaBurst,
  grantRoundDir,
  makeShilkaBurstGrant,
  makeShilkaDrone,
  radarReady,
  setShilkaRangeGate,
  setShilkaRole,
  setShilkaSwitch,
  shilkaFireControl,
  shilkaPhase,
  shilkaSolutionQuality,
  shilkaSolutionReady,
  simulateShilkaProjectile,
  startShilkaSearch,
  stepShilka,
  stepShilkaDrone,
  tryShilkaAngleLock,
  updateShilkaTrack,
} from './shilka-mechanics.js';
import { buildShilkaRig } from './shilka-rig.js';
import { createDriveState, stepDrive, SHILKA_DRIVE_TUNING } from './shilka-drive.js';
import { formatUglomer } from './bearing.js';
import { clamp, damp, TAU } from './util.js';

const SWITCH_LABELS = [
  ['power54v', '54V'],
  ['gyroUnlocked', 'ГАГ'],
  ['hydroDrive', 'ГИДРО'],
  ['radarFilament', 'НАКАЛ'],
  ['radarAnode', 'АНОД'],
  ['radarHighVoltage', 'ВН'],
  ['radarOnAir', 'РАДАР'],
];

const SHILKA_ASSET_URL = './assets/vehicles/lowpoly_zsu-23-4.glb?v=20260617-2';
const SHILKA_ASSET_TARGET_LENGTH_M = 6.7;
const TMP_ORIGIN = new THREE.Vector3();
const TMP_END = new THREE.Vector3();
const TMP_FWD = new THREE.Vector3();
let _gltfLoader = null;

function loadGltf(url) {
  _gltfLoader = _gltfLoader || new GLTFLoader();
  return new Promise((resolve, reject) => _gltfLoader.load(url, resolve, undefined, reject));
}

function prepVehicleMeshTree(root) {
  root.traverse((o) => {
    o.frustumCulled = false;
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
    }
  });
}


export class ShilkaStation {
  constructor(game, pos, yaw = 0, opts = {}) {
    this.game = game;
    this.id = opts.id || 'shilka-1';
    this.base = pos.clone();
    this.baseYaw = yaw;
    this.state = createShilkaState({ rangeGateM: 1200 });
    this.driveMode = false;
    this.drive = createDriveState({ x: this.base.x, z: this.base.z, heading: this.baseYaw });
    this.rig = null; // set when the GLB finishes loading (see _loadVehicleAsset)
    this.aimAzMils = 0;
    this.aimElDeg = 8;
    this.drones = [
      makeShilkaDrone('meteor-1', 0x53484c31, this.base),
      makeShilkaDrone('meteor-2', 0x53484c32, this.base),
      makeShilkaDrone('meteor-3', 0x53484c33, this.base),
    ];
    this.projectiles = [];
    this._targetT = 0;
    this._uiWired = false;
    this._lastPanelText = '';
    this.cursorMode = true;
    this._buildRuntimeMeshes();
  }

  _groundY(x, z) {
    const t = this.game.world && this.game.world.terrain;
    return t && t.terrainHeightAt ? t.terrainHeightAt(x, z) : 0;
  }

  _origin() {
    return { x: this.base.x, y: this.base.y + 2.2, z: this.base.z };
  }

  _buildRuntimeMeshes() {
    const scene = this.game.engine.scene;
    const y = this._groundY(this.base.x, this.base.z);
    this.base.y = y;

    this.vehicleRoot = new THREE.Group();
    this.vehicleRoot.name = `${this.id} vehicle root`;
    this.vehicleRoot.position.set(this.base.x, y, this.base.z);
    this.vehicleRoot.rotation.y = this.baseYaw;
    scene.add(this.vehicleRoot);
    this.vehicleModel = null;
    this._loadVehicleAsset();

    const ringGeo = new THREE.RingGeometry(1.8, 2.15, 18);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x45e0cf, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(ringGeo, ringMat);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.set(this.base.x, y + 0.05, this.base.z);
    scene.add(this.marker);

    const droneGeo = new THREE.BoxGeometry(2.7, 0.5, 1.2);
    const wingGeo = new THREE.BoxGeometry(6.2, 0.16, 0.72);
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8b066 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x394044 });
    for (const d of this.drones) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(droneGeo, mat);
      const wing = new THREE.Mesh(wingGeo, dark);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.18), dark);
      tail.position.set(0, 0.45, 0.7);
      g.add(body, wing, tail);
      g.visible = d.alive;
      scene.add(g);
      d.mesh = g;
    }
  }

  async _loadVehicleAsset() {
    try {
      const gltf = await loadGltf(SHILKA_ASSET_URL);
      if (!this.vehicleRoot) return;
      const rig = buildShilkaRig(gltf.scene, THREE);
      // scale the assembled rig to the target length
      rig.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rig.root);
      const size = new THREE.Vector3(); box.getSize(size);
      const scale = SHILKA_ASSET_TARGET_LENGTH_M / Math.max(0.001, size.x, size.z);
      rig.root.scale.setScalar(scale);
      // ground it: recenter X/Z and drop the model so its lowest point sits (wheelRadius+rideHeight)
      // below the rig.root origin. stepDrive then parks vehicleRoot.y at meanGround+wheelRadius+
      // rideHeight, so the wheels/tracks rest on the terrain. Measured BEFORE the vehicleRoot.add
      // so the bbox is in rig.root's own (parent-local) frame — the frame rig.root.position lives in.
      rig.root.updateMatrixWorld(true);
      const fb = new THREE.Box3().setFromObject(rig.root);
      const fc = fb.getCenter(new THREE.Vector3());
      const groundDrop = SHILKA_DRIVE_TUNING.wheelRadius + SHILKA_DRIVE_TUNING.rideHeight;
      rig.root.position.set(-fc.x, -fb.min.y - groundDrop, -fc.z);
      prepVehicleMeshTree(rig.root);
      this.vehicleRoot.add(rig.root);
      this.vehicleModel = rig.root;
      this.rig = rig;
      this._rigScale = scale;
      // ground the PARKED vehicle too: _applyRig only lifts it to drive.y while mounted, so without
      // this the un-mounted Shilka sits groundDrop (~0.87 m) below the terrain.
      this.vehicleRoot.position.y = this.base.y + groundDrop;
      this.drive.y = this.vehicleRoot.position.y;
    } catch (e) {
      this._assetFailed = true;
      console.warn('[shilka] Failed to load/rig GLB vehicle; station marker remains.', e);
    }
  }

  near(p) {
    return Math.hypot(p.x - this.base.x, p.z - this.base.z) < 3.4 && Math.abs(p.y - this.base.y) < 3.2;
  }

  updateNearby(p) {
    return this.near(p);
  }

  mount() {
    if (!this.rig) {
      // GLB not ready (or failed): don't enter a phantom drive with an invisible, un-re-enterable vehicle.
      if (this.game.hud) this.game.hud.bigMessage(this._assetFailed ? 'SHILKA — model unavailable' : 'SHILKA — loading…');
      return;
    }
    const pl = this.game.player;
    pl.shilka = this;
    this.driveMode = true;
    this.game.weapons.group.visible = false;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '0';
    // sync drive state to where the vehicle physically sits
    this.drive.x = this.base.x; this.drive.z = this.base.z; this.drive.heading = this.baseYaw;
    this.drive.gear = 'N'; this.drive.speed = 0; this.drive.engineOn = true; this.drive.stalled = false;
    this._lookYaw = 0; this._lookPitch = 0;
    this._showDriveHud(true);
    if (!this.game.input.locked) this.game.input.requestLock();
    this._frameDriverCamera(0.001);
  }

  dismount() {
    const pl = this.game.player;
    if (pl.shilka !== this) return;
    this.driveMode = false; this._showDriveHud(false);
    pl.shilka = null;
    this.game.weapons.group.visible = true;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '';
    this.game.engine.setFov((this.game.settings && this.game.settings.data.fov) || 80);
    this._showPanel(false);
    this.cursorMode = false;
    if (this.game.state === 'playing' && !this.game.input.locked) this.game.input.requestLock();
    this.game.hud.setWeapon(this.game.weapons);
  }

  onPointerUnlock() {
    if (this.game.player.shilka === this) this._setCursorMode(true);
  }

  forceReset() {
    if (this.game.player.shilka === this) this.dismount();
    this.state = createShilkaState({ rangeGateM: 1200 });
    this.aimAzMils = 0;
    this.aimElDeg = 8;
    for (let i = 0; i < this.drones.length; i++) {
      const fresh = makeShilkaDrone(`meteor-${i + 1}`, 0x53484c31 + i, this.base);
      Object.assign(this.drones[i], fresh, { mesh: this.drones[i].mesh });
    }
  }

  update(dt) {
    this._updateDrones(dt);
    this._updateProjectiles(dt);
    if (this.marker) {
      this.marker.material.opacity = this.game.player.shilka === this ? 0.48 : 0.24 + Math.sin(performance.now() * 0.003) * 0.08;
    }
  }

  controlUpdate(dt) {
    if (this.driveMode) { this._driveControlUpdate(dt); return; }
    // --- v1 fire-control (dormant this slice; re-wired in the commander/scope layer) ---
    const input = this.game.input;
    this._wirePanelOnce();
    this._targetT += dt;

    if (this.state.role === SHILKA_ROLES.ANGLE) {
      this.aimAzMils = (this.aimAzMils + input.mouseDX * 0.9 + 6000) % 6000;
      this.aimElDeg = clamp(this.aimElDeg - input.mouseDY * 0.04, -4, 62);
    } else {
      let gate = this.state.rangeGateM;
      if (input.isDown('KeyW')) gate += 260 * dt;
      if (input.isDown('KeyS')) gate -= 260 * dt;
      if (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) {
        if (input.isDown('KeyW')) gate += 740 * dt;
        if (input.isDown('KeyS')) gate -= 740 * dt;
      }
      if (gate !== this.state.rangeGateM) this.state = setShilkaRangeGate(this.state, gate);
    }

    if (input.wasPressed('Tab')) this.state = setShilkaRole(this.state, this.state.role === SHILKA_ROLES.ANGLE ? SHILKA_ROLES.RANGE : SHILKA_ROLES.ANGLE);
    if (input.wasPressed('KeyR')) this._toggleSearch();
    if (input.wasPressed('KeyX')) this._dropLock();
    if (input.wasPressed('Digit1')) this._toggleSwitch('power54v');
    if (input.wasPressed('Digit2')) this._toggleSwitch('gyroUnlocked');
    if (input.wasPressed('Digit3')) this._toggleSwitch('hydroDrive');
    if (input.wasPressed('Digit4')) this._toggleSwitch('radarFilament');
    if (input.wasPressed('Digit5')) this._toggleSwitch('radarAnode');
    if (input.wasPressed('Digit6')) this._toggleSwitch('radarHighVoltage');
    if (input.wasPressed('Digit7')) this._toggleSwitch('radarOnAir');

    const origin = this._origin();
    this.state = updateShilkaTrack(this.state, origin, this.drones);
    const aimError = this._aimErrorDeg();
    if (input.buttonsPressed[2]) this.state = tryShilkaAngleLock(this.state, aimError);
    this.state = stepShilka(this.state, dt, aimError);
    if (input.buttons[0]) this._tryFire(0.16);

    this._frameCamera(dt);
    this._updatePanel();
  }

  _updateDrones(dt) {
    for (let i = 0; i < this.drones.length; i++) {
      let d = this.drones[i];
      if (d.alive) {
        d = stepShilkaDrone(d, dt, this.base);
        this.drones[i] = d;
      }
      if (d.mesh) {
        d.mesh.visible = !!d.alive;
        d.mesh.position.set(d.pos.x, d.pos.y, d.pos.z);
        const yaw = Math.atan2(d.vel.x, d.vel.z);
        d.mesh.rotation.set(0, yaw, 0);
      }
    }
  }

  _updateProjectiles(dt) {
    const scene = this.game.engine.scene;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.mesh) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
        this.projectiles.splice(i, 1);
        continue;
      }
      const step = p.speed * dt;
      const from = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.dir, step);
      p.mesh.lookAt(TMP_END.copy(p.mesh.position).add(p.dir));
      if (this.game.effects && Math.random() < 0.4) this.game.effects.tracer(from, p.mesh.position, 0xffd16a);
    }
  }

  _tryFire(seconds) {
    if (!shilkaSolutionReady(this.state) || this.state.heat >= SHILKA_TUNING.firingHeatLimit) return;
    const target = this.drones.find((d) => d.id === this.state.selectedTargetId && d.alive);
    if (!target) return;
    const seed = ((performance.now() * 1000) ^ (this.state.ammo * 2654435761)) >>> 0;
    const muzzle = this._origin();
    const grant = makeShilkaBurstGrant(this.state, this.id, muzzle, seed, seconds);
    if (!grant) return;
    this.state = fireShilkaBurst(this.state, seconds);
    const hits = this._resolveBurst(grant, target);
    if (hits > 0) {
      target.health -= hits * 28;
      if (target.health <= 0) {
        target.alive = false;
        if (this.game.effects) this.game.effects.explosion(new THREE.Vector3(target.pos.x, target.pos.y, target.pos.z), 4.5);
        if (this.game.hud) this.game.hud.toast('METEOR-1 TARGET DESTROYED', 0xd8b066);
      } else if (this.game.hud) this.game.hud.hitmarker(false);
    }
    this._spawnBurstVisuals(grant, target, hits);
  }

  _resolveBurst(grant, target) {
    let hits = 0;
    const origin = grant.muzzle;
    const maxRounds = Math.min(grant.roundCount, 84);
    for (let i = 0; i < maxRounds; i++) {
      const dir = grantRoundDir(grant, i);
      const shot = simulateShilkaProjectile({
        origin,
        dir,
        targetStart: target.pos,
        targetVel: target.vel,
        targetRadius: SHILKA_TUNING.droneHitRadiusM,
      });
      if (shot.hit) hits++;
    }
    return hits;
  }

  _spawnBurstVisuals(grant, target, hits) {
    const scene = this.game.engine.scene;
    const origin = new THREE.Vector3(grant.muzzle.x, grant.muzzle.y, grant.muzzle.z);
    const shown = Math.min(12, grant.roundCount);
    for (let i = 0; i < shown; i++) {
      const dirObj = grantRoundDir(grant, i * 3);
      const dir = new THREE.Vector3(dirObj.x, dirObj.y, dirObj.z);
      const end = origin.clone().addScaledVector(dir, 1200);
      if (this.game.effects) this.game.effects.tracer(origin, end, i % 3 === 0 ? 0xff3428 : 0xffd16a);
      if (i < 4) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff3428 : 0xffd16a, fog: false }));
        mesh.position.copy(origin).addScaledVector(dir, 4 + i * 0.3);
        mesh.lookAt(TMP_END.copy(mesh.position).add(dir));
        scene.add(mesh);
        this.projectiles.push({ mesh, dir, speed: SHILKA_TUNING.projectileSpeedMps, life: 0.8 });
      }
    }
    if (this.game.effects) this.game.effects.muzzleFlash(origin, new THREE.Vector3(grant.baseDir.x, grant.baseDir.y, grant.baseDir.z), 2.6);
    if (hits > 0 && this.game.effects) this.game.effects.stuffing(new THREE.Vector3(target.pos.x, target.pos.y, target.pos.z), 0xd8b066, Math.min(18, hits), 5);
  }

  _aimErrorDeg() {
    const kin = this.state.targetKinematics;
    if (!kin) return 999;
    let az = this.aimAzMils - kin.azimuthMils;
    while (az > 3000) az -= 6000;
    while (az < -3000) az += 6000;
    const azDeg = az / 6000 * 360;
    const elDeg = this.aimElDeg - kin.elevationDeg;
    return Math.hypot(azDeg, elDeg);
  }

  _toggleSearch() {
    if (!radarReady(this.state)) return;
    if (!this.state.searchMode) this.state = startShilkaSearch(this.state, SHILKA_SEARCH_MODES.SECTOR);
    else this.state = startShilkaSearch(this.state, this.state.searchMode === SHILKA_SEARCH_MODES.SECTOR ? SHILKA_SEARCH_MODES.CIRCULAR : SHILKA_SEARCH_MODES.SECTOR);
  }

  _dropLock() {
    this.state = {
      ...this.state,
      angleLocked: false,
      rangeGateLocked: false,
      rangeSolution: 0,
      leadSolution: 0,
      lockQuality: 0,
      firing: false,
      lastBurstRounds: 0,
    };
  }

  _toggleSwitch(name) {
    this.state = setShilkaSwitch(this.state, name, !this.state[name]);
  }

  quickStart() {
    let s = this.state;
    for (const [key] of SWITCH_LABELS) s = setShilkaSwitch(s, key, true);
    this.state = stepShilka(s, SHILKA_TUNING.warmupSeconds);
    this.state = startShilkaSearch(this.state, SHILKA_SEARCH_MODES.SECTOR);
  }

  _frameCamera(dt) {
    const cam = this.game.engine.camera;
    const yaw = (this.aimAzMils / 6000) * TAU;
    const pitch = this.aimElDeg * D2R;
    const fwd = new THREE.Vector3(Math.sin(yaw), Math.sin(pitch), Math.cos(yaw)).normalize();
    const back = new THREE.Vector3(Math.sin(this.baseYaw), 0, Math.cos(this.baseYaw));
    cam.position.set(this.base.x - back.x * 1.2, this.base.y + 2.05, this.base.z - back.z * 1.2);
    cam.rotation.order = 'YXZ';
    cam.lookAt(TMP_END.copy(cam.position).add(fwd));
    this.game.engine.setFov(72);
    const pl = this.game.player;
    pl.pos.set(this.base.x - back.x * 1.15, this.base.y, this.base.z - back.z * 1.15);
    pl.vel.set(0, 0, 0);
    pl.yaw = damp(pl.yaw, yaw + Math.PI, 12, dt);
    pl.pitch = damp(pl.pitch, -0.08, 12, dt);
  }

  _driveControlUpdate(dt) {
    const input = this.game.input;
    // gear selection (mode-gated; clash-free with commander digits in a later slice)
    let gearReq = null;
    if (input.wasPressed('Digit1')) gearReq = '1';
    else if (input.wasPressed('Digit2')) gearReq = '2';
    else if (input.wasPressed('Digit3')) gearReq = '3';
    else if (input.wasPressed('Digit4')) gearReq = '4';
    else if (input.wasPressed('Digit5')) gearReq = '5';
    else if (input.wasPressed('KeyR')) gearReq = 'R';
    else if (input.wasPressed('Backquote') || input.wasPressed('Digit0')) gearReq = 'N';
    const inp = {
      throttle: input.isDown('KeyW') ? 1 : 0,
      brake: input.isDown('KeyS') ? 1 : 0,
      steer: (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
      clutch: (input.isDown('Space')) ? 0 : 1, // Space pressed = clutch in (disengaged)
      gearReq,
      starter: input.isDown('Enter'),
    };
    const ground = this._sampleWheelGround();
    this.drive = stepDrive(this.drive, dt, inp, ground);
    this._applyRig(dt);
    this._frameDriverCamera(dt);
    this._updateDriveHud();
  }

  // terrain height under each road wheel, read from the ACTUAL rig pivots' world XZ.
  // Sampling the real pivots (not reconstructed geometry) keeps L[i]/R[i] in lockstep with
  // rig.wheelsL[i]/rig.wheelsR[i] through the rig's π re-orient — so stepDrive's front
  // (index 0) is the true front wheel and _applyRig feeds suspension back to the same wheel.
  _sampleWheelGround() {
    if (!this.rig) return null;
    if (this.rig.wheelsL.length < 6 || this.rig.wheelsR.length < 6) {
      if (!this._wheelCountWarned) { this._wheelCountWarned = true; console.warn(`[shilka] ${this.id}: rig has ${this.rig.wheelsL.length}L/${this.rig.wheelsR.length}R wheels (expected 6/side) — suspension disabled, drive still works.`); }
      return null; // stepDrive accepts null wheelGroundY → no tilt, but no crash
    }
    const L = [], R = [];
    for (let i = 0; i < 6; i++) {
      this.rig.wheelsL[i].getWorldPosition(TMP_ORIGIN); L.push(this._groundY(TMP_ORIGIN.x, TMP_ORIGIN.z));
      this.rig.wheelsR[i].getWorldPosition(TMP_ORIGIN); R.push(this._groundY(TMP_ORIGIN.x, TMP_ORIGIN.z));
    }
    return { L, R };
  }

  _applyRig(dt) {
    const rig = this.rig; if (!rig) return;
    const d = this.drive;
    this.vehicleRoot.position.set(d.x, d.y, d.z);
    this.vehicleRoot.rotation.y = d.heading;
    // hull tilt: +pitch raises the model front (-Z) → nose up climbing forward; roll negated
    // because the rig's π re-orient flips the body-local Z axis the roll is applied about
    // (so the higher-terrain side of the hull rises). Verified headless on sloped steppe.
    rig.body.rotation.set(d.pitch, 0, -d.roll);
    // keep the re-enter anchor + teal ring on the vehicle so it stays mountable after driving off
    const gy = this._groundY(d.x, d.z);
    this.base.set(d.x, gy, d.z);
    if (this.marker) this.marker.position.set(d.x, gy + 0.05, d.z);
    const s = this._rigScale || 1;
    for (let i = 0; i < rig.wheelsL.length; i++) { const w = rig.wheelsL[i]; w.position.y = (w.userData.restY || 0) + d.wheelOffsetL[i] / s; w.rotation.x = d.wheelSpin; }
    for (let i = 0; i < rig.wheelsR.length; i++) { const w = rig.wheelsR[i]; w.position.y = (w.userData.restY || 0) + d.wheelOffsetR[i] / s; w.rotation.x = d.wheelSpin; }
    for (const sp of rig.sprockets) sp.rotation.x = d.wheelSpin;
    const sway = clamp(-d.yawRate * 0.25, -0.25, 0.25);
    for (const a of rig.antennas) a.rotation.z = damp(a.rotation.z || 0, sway, 8, dt);
  }

  _frameDriverCamera(dt) {
    const cam = this.game.engine.camera;
    const d = this.drive;
    // driver eye: front-left of the hull, at hatch/periscope level looking forward; tunable in verification.
    // y was 2.0 (≈0.9 m ABOVE the deck → looked down onto the hull/barrels); 1.3 sits at the hatch.
    const EYE = { x: -0.7, y: 1.3, z: 1.4 };
    const cos = Math.cos(d.heading), sin = Math.sin(d.heading);
    const ex = d.x + (EYE.x * cos + EYE.z * sin);
    const ez = d.z + (-EYE.x * sin + EYE.z * cos);
    cam.position.set(ex, d.y + EYE.y, ez);
    cam.rotation.order = 'YXZ';
    // periscope look: mouse pans a limited cone around the hull's forward axis
    this._lookYaw = clamp((this._lookYaw || 0) + this.game.input.mouseDX * 0.0022, -0.9, 0.9);
    this._lookPitch = clamp((this._lookPitch || 0) - this.game.input.mouseDY * 0.0022, -0.5, 0.6);
    // tilt the driver view with the terrain (spec §4): fold the hull pitch into the look pitch
    // (+pitch = nose up = look up, matching the hull) so the horizon climbs going uphill.
    const camPitch = clamp(this._lookPitch + d.pitch, -1.3, 1.3);
    const fwd = TMP_FWD.set(
      Math.sin(d.heading + this._lookYaw) * Math.cos(camPitch),
      Math.sin(camPitch),
      Math.cos(d.heading + this._lookYaw) * Math.cos(camPitch),
    );
    cam.lookAt(TMP_END.copy(cam.position).add(fwd));
    // hull roll banks the horizon (sign matches the hull's negated roll)
    cam.rotation.z = -d.roll;
    this.game.engine.setFov(70);
    const pl = this.game.player;
    pl.pos.set(d.x, d.y, d.z); pl.vel.set(0, 0, 0);
  }

  _showDriveHud(on) { const el = document.getElementById('shilka-drive-hud'); if (el) el.classList.toggle('show', !!on); }
  _updateDriveHud() {
    const el = document.getElementById('shilka-drive-hud'); if (!el) return;
    const d = this.drive;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('shilka-dh-gear', d.gear);
    set('shilka-dh-speed', `${Math.round(Math.abs(d.speed) * 3.6)} km/h`);
    set('shilka-dh-rpm', d.engineOn ? `${Math.round(d.engineRpm)} rpm` : 'STALL');
    el.classList.toggle('stall', !d.engineOn);
  }

  _showPanel(on) {
    const el = document.getElementById('shilka-panel');
    if (el) el.classList.toggle('show', !!on);
    if (!on) this._lastPanelText = '';
  }

  _setCursorMode(on) {
    this.cursorMode = !!on;
    const panel = document.getElementById('shilka-panel');
    if (panel) panel.classList.toggle('aiming', !this.cursorMode);
    if (on) {
      if (this.game.input.locked) this.game.input.exitLock();
    } else if (!this.game.input.locked) {
      this.game.input.requestLock();
    }
    this._updatePanel(true);
  }

  _wirePanelOnce() {
    if (this._uiWired) return;
    this._uiWired = true;
    const panel = document.getElementById('shilka-panel');
    if (panel) {
      for (const evName of ['pointerdown', 'mousedown', 'mouseup', 'click', 'contextmenu']) {
        panel.addEventListener(evName, (ev) => {
          ev.stopPropagation();
          if (evName === 'contextmenu') ev.preventDefault();
        });
      }
      panel.querySelectorAll('.shilka-scope, .shilka-rangebar').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this._setCursorMode(false);
        });
      });
    }
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); this._setCursorMode(true); this._updatePanel(true); }); };
    bind('shilka-start', () => this.quickStart());
    bind('shilka-role', () => { this.state = setShilkaRole(this.state, this.state.role === SHILKA_ROLES.ANGLE ? SHILKA_ROLES.RANGE : SHILKA_ROLES.ANGLE); });
    bind('shilka-search', () => this._toggleSearch());
    bind('shilka-lock', () => { this.state = tryShilkaAngleLock(this.state, this._aimErrorDeg()); });
    bind('shilka-drop', () => this._dropLock());
    bind('shilka-fire', () => this._tryFire(0.22));
    for (const [key] of SWITCH_LABELS) bind(`shilka-sw-${key}`, () => this._toggleSwitch(key));
  }

  _updatePanel(force = false) {
    const panel = document.getElementById('shilka-panel');
    if (!panel || this.game.player.shilka !== this) return;
    const fc = shilkaFireControl(this.state);
    const phase = shilkaPhase(this.state);
    const txt = [
      phase, this.state.role, this.state.ammo, Math.round(this.state.heat),
      this.state.selectedTargetId, fc && Math.round(fc.rangeM), Math.round(this.state.rangeGateM),
      Math.round(this.aimAzMils), Math.round(this.aimElDeg * 10),
      Math.round(this.state.lockQuality * 100), Math.round(this.state.rangeSolution * 100), Math.round(this.state.leadSolution * 100),
      this.cursorMode ? 'cursor' : 'aim',
    ].join('|');
    if (!force && txt === this._lastPanelText) return;
    this._lastPanelText = txt;

    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    panel.classList.toggle('ready', shilkaSolutionReady(this.state));
    panel.classList.toggle('range-role', this.state.role === SHILKA_ROLES.RANGE);
    set('shilka-phase', phase.toUpperCase().replace(/_/g, ' '));
    set('shilka-role-read', this.state.role === SHILKA_ROLES.ANGLE ? 'X УГЛЫ' : 'C ДАЛЬНОСТЬ');
    set('shilka-mode-read', this.state.searchMode ? this.state.searchMode.toUpperCase() : 'OFF');
    set('shilka-az', formatUglomer(this.aimAzMils));
    set('shilka-el', `${this.aimElDeg.toFixed(1)}°`);
    set('shilka-range', fc ? `${Math.round(fc.rangeM)}m` : '----');
    set('shilka-gate', `${Math.round(this.state.rangeGateM)}m`);
    set('shilka-lead', fc ? `${fc.leadAzMils.toFixed(0)} mil / ${fc.leadElDeg.toFixed(1)}°` : '--');
    set('shilka-ammo', `${this.state.ammo}/${SHILKA_TUNING.ammoMax}`);
    set('shilka-heat', `${Math.round(this.state.heat)}%`);
    set('shilka-target', this.state.selectedTargetId || 'NO TARGET');
    set('shilka-signal', `${Math.round(this.state.radarSignal * 100)}%`);
    set('shilka-quality', `${Math.round(shilkaSolutionQuality(this.state) * 100)}%`);
    set('shilka-help', this.cursorMode ? 'CLICK BUTTONS · CLICK X/C SCREEN FOR MOUSE AIM · E EXIT' : 'MOUSE AIM · LMB FIRE · RMB LOCK · ESC CURSOR · E EXIT');

    for (const [key] of SWITCH_LABELS) {
      const el = document.getElementById(`shilka-sw-${key}`);
      if (el) el.classList.toggle('on', !!this.state[key]);
    }
    const xDot = document.getElementById('shilka-x-dot');
    const cDot = document.getElementById('shilka-c-dot');
    if (xDot) {
      const az = fc ? fc.azimuthMils : this.aimAzMils;
      const r = fc ? clamp(fc.rangeM / this.state.rangeScaleM, 0, 1) : 0.15;
      const a = (az / 6000) * TAU;
      xDot.style.left = `${50 + Math.sin(a) * r * 42}%`;
      xDot.style.top = `${50 - Math.cos(a) * r * 42}%`;
      xDot.classList.toggle('lock', !!this.state.angleLocked);
    }
    if (cDot) {
      const range = fc ? fc.rangeM : this.state.rangeGateM;
      cDot.style.left = `${clamp(range / this.state.rangeScaleM, 0, 1) * 100}%`;
      cDot.classList.toggle('lock', !!this.state.rangeGateLocked);
    }
  }
}

const D2R = Math.PI / 180;
