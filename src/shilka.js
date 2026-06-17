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

function fitShilkaAsset(assetScene) {
  const assetRoot = new THREE.Group();
  assetRoot.name = 'fitted Shilka GLB';
  assetScene.rotation.set(-Math.PI / 2, 0, 0); // Sketchfab export is Z-up; runtime world is Y-up.
  assetRoot.add(assetScene);
  assetRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(assetRoot);
  const size = new THREE.Vector3();
  box.getSize(size);
  const rawLength = Math.max(0.001, size.x, size.z);
  const scale = SHILKA_ASSET_TARGET_LENGTH_M / rawLength;
  assetRoot.scale.setScalar(scale);
  assetRoot.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(assetRoot);
  const center = new THREE.Vector3();
  fitted.getCenter(center);
  assetRoot.position.add(new THREE.Vector3(-center.x, -fitted.min.y, -center.z));
  return assetRoot;
}

export class ShilkaStation {
  constructor(game, pos, yaw = 0, opts = {}) {
    this.game = game;
    this.id = opts.id || 'shilka-1';
    this.base = pos.clone();
    this.baseYaw = yaw;
    this.state = createShilkaState({ rangeGateM: 1200 });
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
      const root = fitShilkaAsset(gltf.scene);
      root.name = `${this.id} GLB vehicle`;
      prepVehicleMeshTree(root);
      this.vehicleRoot.add(root);
      this.vehicleModel = root;
    } catch (e) {
      console.warn('[shilka] Failed to load GLB vehicle; station marker remains without a vehicle mesh.', e);
    }
  }

  near(p) {
    return Math.hypot(p.x - this.base.x, p.z - this.base.z) < 3.4 && Math.abs(p.y - this.base.y) < 3.2;
  }

  updateNearby(p) {
    return this.near(p);
  }

  mount() {
    const pl = this.game.player;
    pl.shilka = this;
    this.game.weapons.group.visible = false;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '0';
    this._showPanel(true);
    this._setCursorMode(true);
    this._frameCamera(0.001);
    this._updatePanel();
  }

  dismount() {
    const pl = this.game.player;
    if (pl.shilka !== this) return;
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
