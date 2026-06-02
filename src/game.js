// game.js — ENGENDROS PURGE. Orchestrator + gameplay.
// A Zumbi-Blocks-style voxel FPS wave shooter: hold a dusty de_dust2-flavored
// arena against waves of "Engendros" voodoo-plush zombies. Big weapon roster
// (guns + melee), a bank-economy survival loop: scavenge pickups, unlock loadout gear in the SHOP, manage a flat 15-slot inventory.
import * as THREE from 'three';
import { TAU, randRange } from './util.js';
import { ENEMY_BURN_DUR, FIRE_BURN_TICK, FIRE_DOT_ENEMY, FIRE_POOL_LIFE, FIRE_POOL_MAX, FIRE_POOL_RADIUS, OCCLUSION_INSET, PLAYER_BURN_DUR, WAVE_BREATHER } from './tuning.js';
import { KILL_CASH } from './economy.js';
import { buildFlare, buildFlopo } from './props.js';
import { MountedGun, WeaponSystem } from './weapons.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { BuildManager, DayNight, World } from './world.js';
import { LootManager } from './loot.js';
import { Inventory, Shop, LOADOUT_SLOTS } from './inventory.js';
import { WaveManager } from './waves.js';
import { HUD, Settings, UI, WeaponPreview } from './ui.js';
import { Admin } from './admin.js';
import { MP } from './mp.js';
import { Engine } from './engine.js';
import { Input } from './input.js';
import { AudioManager } from './audio.js';
import { Effects } from './effects.js';

// --- build identity (shown bottom-right in the co-op lobby) ---
// GAME_VERSION auto-tracks the ?v= cache-bust on this module's own URL, so it can't drift from
// the build the browser actually loaded. GAME_BUILD is the release time (local, to the minute) —
// bump it together with index.html's ?v= on every deploy.
const GAME_VERSION = (() => { try { const m = String(import.meta.url).match(/[?&]v=(\d+)/); return m ? 'v' + m[1] : 'dev'; } catch (e) { return 'dev'; } })();
const GAME_BUILD = '2026-06-02 22:05';

const _flareWP = new THREE.Vector3();   // scratch: flare flame world-position (module-private, mirrors the copies in mp.js/loot.js; was dropped from game.js during the module split)

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.engine = new Engine(this.canvas);
    this.engine.setPixelScale(2); // sharper than the default chunky 3x
    this.input = new Input(this.canvas);
    this.audio = new AudioManager();
    this.effects = new Effects(this);
    this.world = new World(this);
    this.player = new Player(this);
    this.enemies = new EnemyManager(this);
    this.weapons = new WeaponSystem(this);
    this.loot = new LootManager(this);
    this.build = new BuildManager(this); // fortification placement (held builders, ghost preview, structures)
    this.mountedGun = new MountedGun(this, new THREE.Vector3(0, 3.4, 46), 0); // .50 cal on the bunker roof
    this.capturedTank = null; // set by _tankCaptured; cleared on reset
    this.waves = new WaveManager(this);
    this.hud = new HUD(this);
    this.inventory = new Inventory(this); // survival backpack + unified held-item model
    this.shop = new Shop(this);
    const _pc = document.getElementById('previewCanvas'); this.preview = _pc ? new WeaponPreview(_pc) : null;
    this.ui = new UI();
    const _ac = document.getElementById('adminCanvas'); this.admin = _ac ? new Admin(this) : null;
    this.settings = new Settings(this); // loads localStorage + applies sens/volume/sharpness/fov
    this.meta = this._loadMeta(); // persistent best-wave / lifetime stats
    this.dayNight = new DayNight(this); // day/night + sky + flashlight (drives THE LONG NIGHT)
    this.mp = new MP(this); // multiplayer co-op (dormant until host/join)
    this.mode = 'purge'; this.flares = []; this.molotovPools = []; this._surviveTime = 0;
    this._molTmp = new THREE.Vector3(); this._molTmp2 = new THREE.Vector3(); this._molTmp3 = new THREE.Vector3();

    this.state = 'menu'; this.score = 0; this.kills = 0; this.mpMenuOpen = false;
    this._intentionalUnlock = false; this._waveBreak = 0; this._startCountdown = 0;
    this._last = 0; this._bound = this._frame.bind(this);

    this._wireUI(); this._wireInput(); this._showMenuBest();
    this.player.update(0.0001); this.engine.render();
    requestAnimationFrame((t) => { this._last = t; requestAnimationFrame(this._bound); });

    const DEBUG = true; // TODO remove in final task
    if (DEBUG) { window.__dbg = () => this; window.__dbgTank = () => this.waves._forceTankWave(); }
  }

  _wireUI() {
    const click = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };
    // build version + release time (to the minute), shown in both the main menu and the co-op lobby corner
    const verHTML = `ENGENDROS PURGE <b>${GAME_VERSION}</b> (${GAME_BUILD})`;
    for (const id of ['lobby-version', 'menu-version']) { const e = document.getElementById(id); if (e) e.innerHTML = verHTML; }
    click('playBtn', () => this.startGame('purge'));
    click('longNightBtn', () => this.startGame('longnight'));
    click('resumeBtn', () => this.resume());
    click('quitBtn', () => this.toMenu());
    click('menuBtn', () => this.toMenu());
    click('restartBtn', () => this.startGame(this.mode)); // try again in the same mode
    click('nextWaveBtn', () => this.beginNextWave());
    click('settingsBtn', () => this.settings.open('menu'));
    click('adminBtn', () => this.openAdmin());
    click('adminBack', () => this.toMenu());
    click('multiplayerBtn', () => this.toLobby());
    click('armoryBtn', () => this.shop.open('menu'));
    click('lobbyArmoryBtn', () => this.shop.open('lobby'));
    click('armoryBackBtn', () => { if (this.shop.returnTo === 'lobby') this.toLobby(); else this.toMenu(); });
    click('mpHostBtn', () => this.mp.startHost((document.getElementById('mp-name') || {}).value || 'Host'));
    click('mpJoinBtn', () => this.mp.startJoin((document.getElementById('mp-code') || {}).value || '', (document.getElementById('mp-name') || {}).value || 'Player'));
    click('mpCloseRoomBtn', () => this.mp.closeRoom());
    click('mpCopyCodeBtn', async () => {
      const code = ((document.getElementById('mp-mycode') || {}).textContent || '').trim();
      if (!code || code === '-----') return;
      const ok = await this._copyText(code);
      this.mp._setLobbyDiag(ok ? 'Room code copied.' : 'Copy failed. Select the room code and copy it manually.');
      if (this.hud && this.hud.toast) this.hud.toast(ok ? 'Room code copied' : 'Copy failed', ok ? 0x7fd06a : 0xd23a2a);
    });
    click('mpStartBtn', () => this.mp.hostStart());
    click('mpReadyBtn', () => this.mp.toggleReady());
    click('mpLanBtn', () => this.mp.toggleLanMode());
    click('mpRelayBtn', () => this.mp.toggleRelayMode());
    click('mp-mode-purge', () => this.mp.setMode('purge'));
    click('mp-mode-night', () => this.mp.setMode('longnight'));
    click('mpBackBtn', () => { this.mp.leave(); this.toMenu(); });
    document.querySelectorAll('.mp-skinpick').forEach(b => b.addEventListener('click', () => {
      this.mp.chosenSkin = +b.dataset.skin;
      document.querySelectorAll('.mp-skinpick').forEach(x => x.classList.toggle('sel', x === b));
    }));
    click('pauseSettingsBtn', () => this.settings.open('pause'));
    this.canvas.addEventListener('click', () => {
      if (this.state === 'menu' || this.state === 'dead' || this.state === 'shop' || this.state === 'admin') return;
      if (this.state === 'paused') this.resume(); else this.input.requestLock();
    });
    this.input.on('lock', () => { if (this.mpMenuOpen) this._closeMpMenu(false); else if (this.state === 'paused') { this.state = 'playing'; this.ui.hideAll(); } });
    this.input.on('unlock', () => { if (this._intentionalUnlock) { this._intentionalUnlock = false; return; } if (this._invOpen) { this._closeInventory(); return; } if (this.state === 'playing') this.pause(); });
    document.addEventListener('fullscreenchange', () => this.engine.resize());
  }

  async _copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  _wireInput() {
    this.input.on('key', (code) => {
      if (this.state !== 'playing') return;
      if (this.mpMenuOpen) {
        if (code === 'KeyF') this.toggleFullscreen();
        else if (code === 'KeyM') { this.audio.setMuted(!this.audio.muted); this.hud.bigMessage(this.audio.muted ? 'MUTED' : 'SOUND ON'); }
        return;
      }
      if (this.mp.active && this.mp._localDead) {
        if (code === 'KeyQ') this.mp.cycleSpectate(-1);
        else if (code === 'KeyE') this.mp.cycleSpectate(1);
        else if (code === 'KeyF') this.toggleFullscreen();
        else if (code === 'KeyM') { this.audio.setMuted(!this.audio.muted); this.hud.bigMessage(this.audio.muted ? 'MUTED' : 'SOUND ON'); }
        return;
      }
      if (this.weapons.isThrowLocked() && code !== 'KeyM') return; // committed molotov: only the LMB throw (and mute) work
      if (this.mp.active && this.mp.frozen) return; // downed/dead/waiting: no reload/melee/mount/board/loot/weapon-switch
      if (this.player.mountedGun && code !== 'KeyE' && code !== 'KeyF' && code !== 'KeyM') return; // on the .50 cal: only dismount / fullscreen / mute — no weapon or inventory switching
      if (code === 'KeyR') this.weapons.startReload();
      else if (code === 'KeyV') this.weapons.quickMelee();
      else if (code === 'KeyE') {
        if (this.mp.active && this.mp.tryStartRevive && this.mp.tryStartRevive()) return;
        // ---- CapturedTank: exit when aboard ----
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct) { _ct.leave(); return; }
        // ---- .50 cal + loot ----
        if (this.player.mountedGun) this.player.mountedGun.dismount();
        else if (this.inventory.tryReloadFiftyCan()) { /* reloaded the .50-cal from a carried ammo can */ }
        else if (this.mountedGun.canMount(this.player.pos)) this.mountedGun.mount();
        // ---- CapturedTank: board (gate by proximity, not currently on .50 cal) ----
        else if (_ct && _ct.near(this.player.pos) && !this.player.mountedGun) { _ct.enter('driver'); }
        else if (this.build.radioTarget) { this.build.toggleRadio(this.build.radioTarget); }
        else if (this.loot.tryPickupNearby()) { /* grabbed a ground item into the backpack */ }
        else if (this.loot.openNearby()) { /* claimed a landed supply drop */ }
        else if (this.inventory.isHoldingFlashlight()) this.dayNight.toggleFlashlight(); // nothing nearby to interact with → toggle the held flashlight beam
      }
      else if (code === 'KeyQ') {
        // CapturedTank: switch driver ↔ gunner seat
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct) { _ct.switchSeat(); return; }
      }
      else if (code === 'KeyF') this.toggleFullscreen();
      else if (code === 'KeyC') {
        // CapturedTank: gunner peek stance (flares are a held inventory item now, used with LMB)
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct && _ct.active === 'gunner') { _ct.stance = _ct.stance === 'sight' ? 'peek' : 'sight'; if (_ct.stance === 'sight') { _ct.peekYaw = null; _ct.peekPitch = null; } }
      }
      else if (code === 'KeyT') {
        // CapturedTank: thermal toggle (gunner only); radio is a held inventory item now, used with LMB
        const _ct = this.capturedTank;
        if (_ct && this.player.inTank === _ct && _ct.active === 'gunner') { _ct.thermal = !_ct.thermal; }
      }
      else if (code === 'KeyB') this.weapons.toggleFireMode();
      else if (code === 'KeyG') { const c = this.inventory.curItem(); if (c) this.inventory.dropSlot(c.slot); }
      else if (code === 'KeyI') this.toggleInventory();
      else if (code === 'KeyM') { this.audio.setMuted(!this.audio.muted); this.hud.bigMessage(this.audio.muted ? 'MUTED' : 'SOUND ON'); }
      else if (code.startsWith('Digit')) { const n = parseInt(code.slice(5), 10); if (n >= 1 && n <= 9) this.inventory.selectSlotN(n); }
    });

    // Prime Web Audio on the first user gesture so menu/lobby/shop music can start
    // (browsers block audio until a gesture). One-shot; safe if already inited.
    const _primeMusic = () => {
      window.removeEventListener('pointerdown', _primeMusic); window.removeEventListener('keydown', _primeMusic);
      this.audio.init();
      if (this.state === 'menu' && this.audio.music) this.audio.music.setScene(this._lobbyVisible() ? 'lobby' : 'menu');
    };
    window.addEventListener('pointerdown', _primeMusic); window.addEventListener('keydown', _primeMusic);
  }

  startGame(mode = 'purge') {
    this.mode = mode === 'longnight' ? 'longnight' : 'purge';
    this.audio.init(); this.audio.music.setScene('gameplay');
    this._intentionalUnlock = false;
    this.reset();
    this.ui.hideAll(); this.hud.show(true); this.ui.hint.style.display = 'none';
    this.state = 'playing'; this._startCountdown = 0.6;
    // Go real-fullscreen on this user gesture, then resize & grab the pointer.
    const root = document.documentElement;
    const after = () => { this.engine.resize(); this.input.requestLock(); };
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().then(after, after);
    else after();
  }

  toggleFullscreen() {
    if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
    else { const r = document.documentElement; if (r.requestFullscreen) r.requestFullscreen().then(() => this.engine.resize(), () => {}); }
  }

  reset() {
    if (this._invOpen) { this._invOpen = false; if (this.hud) this.hud.closeInventory(); }
    this.player.reset();
    this.enemies.clearAll(); this.loot.reset();
    this.mountedGun.forceReset();
    if (this.capturedTank) { this.capturedTank.forceReset(); this.capturedTank = null; }
    this.world.clearWrecks && this.world.clearWrecks();
    this.build.reset();
    this.inventory.reset(); // clear backpack BEFORE resetLoadout (which deploys throwable start-stock into it)
    this.weapons.resetLoadout();
    this.waves.reset();
    this._clearFlares();
    if (this._clearMolotovPools) this._clearMolotovPools();
    this.dayNight.reset(this.mode === 'longnight'); // bright noon for PURGE, dawn-into-night for LONG NIGHT
    this._surviveTime = 0;
    this.score = 0; this.kills = 0;
    this.hud.setHealth(this.player.hp, this.player.maxHp);
    this.hud.setArmor(this.player.armor, this.player.armorMax);
    this.hud.setMoney(this.player.money); this.hud.setRadios(this.player.radios);
    this.hud.setHunger(this.player.hunger); this.hud.setSurvival(this.player);
    this.hud.setScore(0); this.hud.setWeapon(this.weapons);
    this.hud.setNightMode(this.mode === 'longnight'); // shows/hides the clock + gear readout
    this._startCountdown = 0.6; this._waveBreak = 0; this._banked = false; // _banked: per-run guard for bank deposit
    this._tankIntroShown = false; // reset per-run so the first tank teach banner shows once per run
  }
  _disposeFlare(f) {
    this.engine.scene.remove(f.mesh); this.engine.scene.remove(f.light);
    f.mesh.geometry.dispose(); f.mesh.material.dispose();
    if (f.flame) { f.flame.geometry.dispose(); f.flame.material.dispose(); }
  }
  _clearFlares() {
    for (const f of this.flares) this._disposeFlare(f);
    this.flares.length = 0;
  }
  throwFlare(force) {
    if ((!force && this.mode !== 'longnight') || this.weapons.flares <= 0) return;
    this.weapons.flares--; this.hud.setNightGear(this);
    const cam = this.engine.camera; cam.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const mesh = buildFlare();
    mesh.position.copy(origin).addScaledVector(fwd, 0.8);
    mesh.rotation.set(randRange(0, TAU), randRange(0, TAU), randRange(0, TAU));
    // burning flame nub at the cap end (local +Y), additive glow
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd14a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flame.position.set(0, 0.34, 0); flame.renderOrder = 998; mesh.add(flame);
    const light = new THREE.PointLight(0xff5a26, 18, 28, 1.2); // starts hot → eases down (ignite flash)
    light.position.copy(mesh.position);
    this.engine.scene.add(mesh); this.engine.scene.add(light);
    this.effects.muzzleFlash(mesh.position.clone(), fwd, 0.6); // small ignite flash
    this.flares.push({ mesh, light, flame, flameMat: flame.material,
      vel: fwd.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.5, 0)),
      spin: new THREE.Vector3(randRange(-7, 7), randRange(-4, 4), randRange(-7, 7)),
      life: 22, grounded: false, out: false, smokeT: 0 });
    // keep spent sticks on the ground, but cap how many linger
    const spent = this.flares.filter((x) => x.out);
    while (spent.length > 6) { const old = spent.shift(); this._disposeFlare(old); this.flares.splice(this.flares.indexOf(old), 1); }
    this.audio.uiClick();
  }
  _updateFlares(dt) {
    if (!this.flares.length) return;
    const t = performance.now() * 0.001;   // mode-independent clock for flicker (matches _updateMolotovPools); _surviveTime only advances in longnight, freezing the flame in purge
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      if (!f.grounded) {
        f.vel.y -= 20 * dt; f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt; f.mesh.rotation.z += f.spin.z * dt;
        if (f.mesh.position.y <= 0.06) { f.mesh.position.y = 0.06; f.grounded = true; f.vel.set(0, 0, 0); f.mesh.rotation.set(Math.PI / 2, f.mesh.rotation.y, 0); } // settle lying down
      }
      if (f.out) continue;                               // spent: just a dark stick on the ground
      f.life -= dt;
      f.flame.getWorldPosition(_flareWP); f.light.position.copy(_flareWP);
      const fade = f.life < 3.5 ? Math.max(0, f.life / 3.5) : 1;          // gradual burn-out over the last 3.5s
      const flick = 0.82 + Math.sin(t * 22 + i) * 0.12 + Math.sin(t * 57 + i) * 0.05;
      f.light.intensity += (9 * fade * flick - f.light.intensity) * Math.min(1, dt * 6); // eases the ignite spike down, then fades out
      f.light.color.setHSL(0.035, 1, 0.5 + 0.05 * Math.sin(t * 30 + i));
      f.flame.scale.setScalar((0.8 + Math.sin(t * 26 + i) * 0.2) * (0.35 + 0.65 * fade));
      f.flameMat.opacity = 0.95 * fade;
      f.smokeT -= dt;
      if (f.smokeT <= 0) { f.smokeT = 0.07; this.effects.flareSmoke(_flareWP.clone().setY(_flareWP.y + 0.05), fade); }
      if (f.life <= 0) { f.out = true; f.light.intensity = 0; this.engine.scene.remove(f.light); f.flame.visible = false; }
    }
  }
  // Line-of-sight test so molotov fire cannot reach through a wall into the next room.
  raySegBlocked(from, to) {
    const dir = this._molTmp3.copy(to).sub(from); const dist = dir.length();
    if (dist < 0.9) return false; dir.multiplyScalar(1 / dist);
    const start = from.clone().addScaledVector(dir, OCCLUSION_INSET);
    return this.world.rayHit(start, dir, dist - OCCLUSION_INSET * 2) !== null;
  }
  _spawnMolotovPool(pos, fromNet = false) {
    if (this.mp.active && !this.mp.isHost && !fromNet) { this.mp.net.send('molotov', { x: pos.x, y: pos.y, z: pos.z }); return; }
    if (!this.molotovPools) this.molotovPools = [];
    if (this.molotovPools.length >= FIRE_POOL_MAX) this._disposeMolotovPool(this.molotovPools.shift());
    this._downV = this._downV || new THREE.Vector3(0, -1, 0); // drop the burning liquid onto the floor under the impact so the fire never floats
    const gh = this.world.rayHit(new THREE.Vector3(pos.x, pos.y + 0.5, pos.z), this._downV, 200);
    const py = gh ? gh.point.y + 0.02 : 0.05;
    const light = new THREE.PointLight(0xff5a26, 7, 14, 1.4); light.position.set(pos.x, py + 0.45, pos.z); this.engine.scene.add(light);
    this.molotovPools.push({ pos: new THREE.Vector3(pos.x, py, pos.z), light, life: FIRE_POOL_LIFE, maxLife: FIRE_POOL_LIFE, radius: FIRE_POOL_RADIUS, emitT: 0, tickT: 0 });
    if (this.mp.active && this.mp.isHost) this.mp.net.send('firepool', { x: pos.x, y: pos.y, z: pos.z });
  }
  _fxBeam(from, dir) { // transient red boss-laser beam for clients (visual only — damage is host-authoritative)
    const len = 70, end = from.clone().addScaledVector(dir, len);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff2436, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
    beam.renderOrder = 998; beam.position.copy(from).add(end).multiplyScalar(0.5); beam.scale.set(0.4, 0.4, len); beam.lookAt(end);
    this.engine.scene.add(beam);
    setTimeout(() => { this.engine.scene.remove(beam); beam.geometry.dispose(); beam.material.dispose(); }, 180);
  }
  _disposeMolotovPool(p) { if (p && p.light) this.engine.scene.remove(p.light); }
  _clearMolotovPools() { if (this.molotovPools) { for (const p of this.molotovPools) this._disposeMolotovPool(p); this.molotovPools.length = 0; } }
  _updateMolotovPools(dt) {
    if (!this.molotovPools || !this.molotovPools.length) return;
    const hostSim = !this.mp.active || this.mp.isHost;
    const t = performance.now() * 0.001;
    for (let i = this.molotovPools.length - 1; i >= 0; i--) {
      const p = this.molotovPools[i];
      p.life -= dt;
      const fade = p.life < 2.0 ? Math.max(0, p.life / 2.0) : 1;
      p.emitT -= dt; if (p.emitT <= 0) { p.emitT = 0.05; this.effects.firePool(p.pos, p.radius, fade); }
      if (p.light) { const flick = 0.8 + Math.sin(t * 24 + i) * 0.15; p.light.intensity += (7 * fade * flick - p.light.intensity) * Math.min(1, dt * 6); }
      p.tickT -= dt;
      if (hostSim && p.tickT <= 0 && p.life > 0) {
        p.tickT = FIRE_BURN_TICK;
        this.loot.clearPickupsInRadius(p.pos.x, p.pos.z, p.radius); // fire burns up any ground item lying in (or dropped into) the pool while it's alight; broadcasts 'pickupgone' so clients' copies vanish too
        const center = this._molTmp.set(p.pos.x, p.pos.y + 0.5, p.pos.z);
        for (const e of this.enemies.active) {
          if (!e.alive || e.isTank) continue;
          if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > p.radius) continue;
          if (this.raySegBlocked(center, this._molTmp2.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z))) continue;
          e.burnT = ENEMY_BURN_DUR; this.enemies.damage(e, FIRE_DOT_ENEMY * FIRE_BURN_TICK, 'fire', e.pos.clone());
        }
        const tryBurn = (px, py, pz, id, isLocal) => {
          if (Math.hypot(px - p.pos.x, pz - p.pos.z) > p.radius) return;
          if (this.raySegBlocked(center, this._molTmp2.set(px, py + 0.9, pz))) return;
          // MP: refresh the burn timer only — _tickBurn is the SINGLE source of player DoT, so burn lingers ~PLAYER_BURN_DUR after leaving the pool (no per-tick hostHurt here, or it'd double-dip)
          if (this.mp.active) { const s = this.mp.pstate.get(id); if (s) s.burnT = PLAYER_BURN_DUR; }
          else this.player.burnT = PLAYER_BURN_DUR; // solo: local burnT + survivalTick DoT (unchanged)
        };
        if (this.mp.active && this.mp.isHost) { tryBurn(this.player.pos.x, this.player.pos.y, this.player.pos.z, 'host', true); for (const [id, rp] of this.mp.remotes) tryBurn(rp.pos.x, rp.pos.y, rp.pos.z, id, false); }
        else if (!this.mp.active) tryBurn(this.player.pos.x, this.player.pos.y, this.player.pos.z, null, true);
      }
      if (p.life <= 0) { this._disposeMolotovPool(p); this.molotovPools.splice(i, 1); }
    }
  }
  onNightStart(n, blood) {
    if (this.mode !== 'longnight') return;
    if (blood) this.hud.bigMessage('🔴 BLOOD MOON', 'the horde swells — survive it');
    else this.hud.bigMessage(`NIGHT ${n}`, 'darkness falls — watch your back');
    this.audio.waveStart();
  }
  onDayStart() { if (this.mode === 'longnight') this.hud.bigMessage('DAWN', 'you made it through the night'); }
  useRadio() {
    if (this.state !== 'playing') return;
    if ((this.player.radios || 0) <= 0) { this.hud.bigMessage('NO RADIO', 'kill a backpack courier to get one'); this.audio.noMoney(); return; }
    this.player.radios--; this.hud.setRadios(this.player.radios);
    this.loot.requestSupplyDrop();
  }

  // Survival inventory overlay (key I) — non-pausing: free the cursor but keep the run live (you stay vulnerable while managing).
  toggleInventory() {
    if (this._invOpen) { this._closeInventory(); return; }
    this._invOpen = true; this.hud.openInventory(this.inventory);
    this._intentionalUnlock = true; this.input.exitLock(); // free the cursor; the 'unlock' handler skips the pause
  }
  _closeInventory() { this._invOpen = false; this.hud.closeInventory(); if (this.state === 'playing') this.input.requestLock(); }
  pause() {
    if (this.state !== 'playing') return;
    if (this._invOpen) this._closeInventory();
    this.weapons.cancelMolotov();
    if (this.mp && this.mp.active) { this.mpMenuOpen = true; this.ui.show('pause'); return; }
    this.state = 'paused'; this.ui.show('pause');
  }
  resume() {
    if (this.mp && this.mp.active && this.mpMenuOpen) { this._closeMpMenu(true); return; }
    if (this.state !== 'paused') return;
    // Re-enter fullscreen (Esc may have dropped it) then re-grab the pointer; 'lock' handler hides the overlay once granted.
    const root = document.documentElement;
    const after = () => this.input.requestLock();
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().then(after, after);
    else after();
  }
  _closeMpMenu(lockPointer) {
    this.mpMenuOpen = false;
    this.ui.hideAll();
    if (lockPointer && this.state === 'playing') this.input.requestLock();
  }
  _lobbyVisible() { const el = document.getElementById('lobby'); return !!(el && el.classList.contains('show')); }
  toMenu() {
    if (this.state === 'playing' || this.state === 'paused') { this._bankRunMoney(); this._saveMeta(); } // leaving a live run banks its money
    if (this.mp && this.mp.active) this.mp.leave();
    const _lab = document.getElementById('mp-labels'); if (_lab) _lab.style.display = 'none';
    this.mpMenuOpen = false;
    this.state = 'menu'; this._intentionalUnlock = this.input.locked; this.input.exitLock();
    this.mountedGun.forceReset();
    if (this.capturedTank) { this.capturedTank.forceReset(); this.capturedTank = null; }
    this.enemies.clearAll(); if (this.audio.music) this.audio.music.setScene('menu'); this.hud.show(false);
    this.ui.show('menu'); this.ui.hint.style.display = '';
  }
  // Dev/preview: drop a Flopo avatar into the scene (returns the rigged Group).
  showAvatar(opts) {
    if (this._avatarMesh) { this.engine.scene.remove(this._avatarMesh); this._avatarMesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const o = buildFlopo(opts || {});
    this._avatarMesh = o; this.engine.scene.add(o);
    return o;
  }

  openAdmin() { this.state = 'admin'; if (this.audio.music) this.audio.music.stop(); if (this.admin) this.admin.open(); }
  beginNextWave() {
    if (this.state !== 'shop') return;
    if (this.mp.active && !this.mp.isHost) { this.ui.hideAll(); this.hud.bigMessage('READY', 'waiting for the host…'); return; }
    this.ui.hideAll(); this.state = 'playing'; this.input.requestLock();
    this.waves.startWave(this.waves.wave + 1);
  }

  onEnemyKilled(e, attacker = 'host') {
    // CO-OP, client-credited kill: the HOST still rolls+broadcasts the SHARED ground loot (so everyone sees
    // the same pile), but the cash/score CREDIT — including the rolled key-cash — goes to the actual KILLER
    // via creditKill. The host does NOT keep the client's reward. Tank-mechanic special rewards stay host-side.
    if (this.mp.active && this.mp.isHost && attacker !== 'host') {
      if (e.def.tank) this.loot.drop(e.pos, Object.assign({}, e.def, { boss: false }));
      else { this.loot.drop(e.pos, e.def); if (e.courier) this.loot.dropCourier(e.pos); }
      this.mp.creditKill(attacker, e);   // killer gets flat personal cash + score; shared loot is separate
      return;
    }
    this.kills++;
    // --- Task 12: asymmetric tank rewards (replaces generic boss payout for the tank) ---
    if (e.def.tank) {
      if (e.captured) {
        // Captured — tank itself is the prize: smaller cash, base score only
        this.player.addMoney(KILL_CASH);
        this.score += e.def.reward; this.hud.setScore(this.score);
      } else {
        // Destroyed — walked away with loot: full cash, +800 score bonus
        this.player.addMoney(KILL_CASH);
        this.score += e.def.reward + 800; this.hud.setScore(this.score);
      }
      if (this.mp.active && this.mp.isHost) this.mp.feed(((this.mp.roster.get('host') || {}).name) || 'Host', e.name); else this.hud.kill(e.name);
      this.loot.drop(e.pos, Object.assign({}, e.def, { boss: false }));
      return; // skip generic boss payout below — no double-pay
    }
    // --- generic path (non-tank enemies) ---
    this.player.addMoney(KILL_CASH);
    this.score += e.def.reward + (e.def.boss ? 1500 : 0); this.hud.setScore(this.score);
    if (this.mp.active && this.mp.isHost) this.mp.feed(((this.mp.roster.get('host') || {}).name) || 'Host', e.name); else this.hud.kill(e.name);
    this.loot.drop(e.pos, e.def);
    if (e.courier) this.loot.dropCourier(e.pos);
  }
  toLobby() {
    this.state = 'menu';
    this.ui.show('lobby');
    this.mp._renderLanMode();
    this.mp._renderRelayMode();
    this.mp._renderModeSel();
    this.mp._renderRoomBrowser();
    if (this.audio.music) { this.audio.music.setScene('lobby'); this.audio.music.setIntensity(0.7); }
  }
  _enterMP(mode) {
    this.mode = (mode === 'longnight') ? 'longnight' : 'purge';
    this.audio.init(); this.audio.music.setScene('gameplay'); this._intentionalUnlock = false;
    this.mpMenuOpen = false;
    if (this.mp) { this.mp._spilledLoot = false; this.mp.spectateTarget = null; } // fresh run → loot can spill again on the next real death
    this.reset(); this.ui.hideAll(); this.hud.show(true); this.ui.hint.style.display = 'none';
    const labels = document.getElementById('mp-labels'); if (labels) labels.style.display = 'block';
    this.state = 'playing'; this._startCountdown = this.mp.isHost ? 0.6 : 0;
    const root = document.documentElement; const after = () => { this.engine.resize(); this.input.requestLock(); };
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().then(after, after); else after();
  }
  _mpGameOver(msg) {
    this._mpReturnToLobby(msg || 'Squad wiped. Ready up and start again.');
  }
  _mpReturnToLobby(msg) {
    if (this.state === 'menu' && !(this.mp && this.mp.active)) return;
    if (this._invOpen) { this._invOpen = false; this.hud.closeInventory(); }
    this._intentionalUnlock = this.input.locked; this.input.exitLock();
    this._bankRunMoney(); this._saveMeta(); // each player banks their own run money locally
    if (this.mp && typeof this.mp.endRunToLobby === 'function') this.mp.endRunToLobby(msg);
    this.state = 'menu'; this.mpMenuOpen = false;
    this.mountedGun.forceReset();
    if (this.capturedTank) { this.capturedTank.forceReset(); this.capturedTank = null; }
    this.enemies.clearAll(); this.loot.reset(); this.build.reset(); this.waves.reset();
    this._clearFlares();
    if (this._clearMolotovPools) this._clearMolotovPools();
    this.dayNight.reset(this.mode === 'longnight');
    if (this.audio.music) { this.audio.music.setScene('lobby'); this.audio.music.setIntensity(0.7); } this.hud.show(false);
    this.hud.setBleed(-1); this.hud.hideBoss(); this.hud.clearWaveTag();
    const lab = document.getElementById('mp-labels'); if (lab) lab.style.display = 'none';
    this.ui.show('lobby');
    this.mp._lobbyMsg(msg || 'Run ended. Ready up and start again.');
    this.mp._renderRoster();
    this.mp._renderLanMode();
    this.mp._renderRelayMode();
    this.mp._renderModeSel();
    this.mp._renderRoomBrowser();
  }
  // _mpOpenShop removed — co-op has continuous waves with no between-wave shop.
  _hurtTarget(id, dmg) { if (this.mp.active && this.mp.isHost) this.mp.hostHurt(id, dmg); else this.player.hurt(dmg); }
  // Host-origin one-way broadcast of a boss/tank attack VISUAL so clients (who never run EnemyManager.update) can SEE/HEAR it.
  _bossFx(kind, fields) { if (this.mp && this.mp.active && this.mp.isHost) this.mp.net.send('bossfx', Object.assign({ k: kind }, fields)); }
  _explodeHurt(pos, radius, dmg) {
    const hurt = (px, pz, id) => { const d = Math.hypot(px - pos.x, pz - pos.z); if (d < radius) { const dd = dmg * (1 - d / radius); if (this.mp.active && this.mp.isHost) this.mp.hostHurt(id, dd); else this.player.hurt(dd); } };
    if (this.mp.active && this.mp.isHost) { hurt(this.player.pos.x, this.player.pos.z, 'host'); for (const [id, rp] of this.mp.remotes) hurt(rp.pos.x, rp.pos.z, id); }
    else hurt(this.player.pos.x, this.player.pos.z, 'host');
  }
  onWaveCleared(n) {
    this.audio.waveClear(); if (this.audio.music) this.audio.music.sting('victory', 'small'); this.player.addMoney(150 + n * 25);
    if (this.mp.active && this.mp.isHost) this.mp.net.send('waveclear', { n: this.waves.wave });
    this.hud.bigMessage('WAVE CLEAR', 'breathe — next wave incoming'); this._waveBreak = WAVE_BREATHER; // pure breather, auto-advances (no shop)
  }
  // Wave timed out with survivors still alive — start the next wave on top of them (no clear, no breather; they carry over).
  onTimedAdvance(n) {
    this.waves.startWave(n + 1); // startWave handles the MP 'wave' broadcast + survivors persist (it never clears enemies)
    this.hud.bigMessage('WAVE ' + (n + 1), 'survivors remain — hold!');
  }
  onPlayerDead() {
    if (this.mp && this.mp.active) return; // co-op death is pstate-driven; _mpGameOver handles the squad wipe
    if (this._invOpen) { this._invOpen = false; this.hud.closeInventory(); }
    this.state = 'dead'; this._intentionalUnlock = this.input.locked; this.input.exitLock();
    this._bankRunMoney(); // run money → persistent bank (the _saveMeta below persists it)
    this.mountedGun.forceReset();
    if (this.capturedTank) { this.capturedTank.forceReset(); this.capturedTank = null; }
    if (this.audio.music) { this.audio.music.setScene('gameover'); this.audio.music.setIntensity(0.85); this.audio.music.setStress(0); } this.hud.show(false);
    // persistent meta (per mode) + lifetime tallies
    const m = this.meta; m.kills = (m.kills || 0) + this.kills; m.runs = (m.runs || 0) + 1;
    const rec = document.getElementById('goRecord');
    if (this.mode === 'longnight') {
      const prev = m.bestNight || 0, record = this._surviveTime > prev;
      m.bestNight = Math.max(prev, this._surviveTime);
      document.getElementById('goWave').textContent = 'night wave ' + this.waves.wave;
      if (rec) rec.innerHTML = `survived <b style="color:var(--gold)">${this._fmtTime(this._surviveTime)}</b> ` + (record ? `🏆 <b style="color:var(--gold)">NEW BEST!</b>` : `· best ${this._fmtTime(m.bestNight)}`);
    } else {
      const prevBest = m.bestWave || 0, record = this.waves.wave > prevBest;
      m.bestWave = Math.max(prevBest, this.waves.wave); m.bestScore = Math.max(m.bestScore || 0, this.score);
      document.getElementById('goWave').textContent = 'wave ' + this.waves.wave;
      if (rec) rec.innerHTML = (record ? `🏆 <b style="color:var(--gold)">NEW BEST — wave ${m.bestWave}!</b>` : `Best: wave ${m.bestWave}`) + ` &nbsp;·&nbsp; lifetime ${m.kills} popped over ${m.runs} runs`;
    }
    this._saveMeta(); this._showMenuBest();
    document.getElementById('goScore').textContent = this.score;
    document.getElementById('goKills').textContent = this.kills;
    this.ui.show('gameover');
  }
  _fmtTime(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  _loadMeta() {
    let m; try { m = JSON.parse(localStorage.getItem('engendros_meta') || '{}'); } catch (e) { m = {}; }
    // roguelite economy (backward-compatible: missing keys default for existing players)
    if (typeof m.bank !== 'number') m.bank = 0;                                   // persistent money "account"
    if (!Array.isArray(m.unlocked)) m.unlocked = ['knife'];                       // permanently owned gear keys
    if (!m.unlocked.includes('knife')) m.unlocked.push('knife');                  // knife is always owned (cold start)
    // Loadout is now a flat array of LOADOUT_SLOTS equal slots (any gear in any slot, duplicates OK).
    // Migrate the old keyed forms losslessly: oldest {gadget}, then {primary,secondary,melee,gadget1,gadget2}.
    if (Array.isArray(m.loadout)) {
      m.loadout = m.loadout.slice(0, LOADOUT_SLOTS);
    } else {
      const old = (m.loadout && typeof m.loadout === 'object') ? m.loadout : {};
      if ('gadget' in old && old.gadget1 == null) old.gadget1 = old.gadget;       // oldest single-gadget form
      const arr = [];
      for (const s of ['primary', 'secondary', 'melee', 'gadget1', 'gadget2']) { const k = old[s]; if (k && typeof k === 'string') arr.push(k); }
      m.loadout = arr;
    }
    while (m.loadout.length < LOADOUT_SLOTS) m.loadout.push(null);                 // pad to fixed length
    m.loadout = m.loadout.map((k) => (k && typeof k === 'string' && !/^build_/.test(k)) ? k : null); // drop junk/removed-builder keys
    if (m.loadout.every((k) => !k)) m.loadout[0] = 'knife';                       // cold start / empty → knife in slot 0
    for (const k of m.loadout) { if (k && !m.unlocked.includes(k)) m.unlocked.push(k); } // anything equipped is owned (catalog ownership derives from m.unlocked)
    if (!m.playerId) { m.playerId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); try { localStorage.setItem('engendros_meta', JSON.stringify(m)); } catch (e) {} } // stable per-device co-op identity — persist immediately so it survives reloads
    return m;
  }
  _saveMeta() { try { localStorage.setItem('engendros_meta', JSON.stringify(this.meta)); } catch (e) {} }
  // Deposit this run's money into the persistent bank — once per run (guarded by _banked, reset in reset()).
  _bankRunMoney() {
    if (this._banked) return; this._banked = true;
    this.meta.bank = (this.meta.bank || 0) + Math.max(0, Math.round(this.player.money || 0));
  }
  _showMenuBest() {
    const el = document.getElementById('menuBest'); if (!el) return;
    const m = this.meta || {}; const parts = [];
    if (m.bestWave) parts.push(`Purge: wave ${m.bestWave}`);
    if (m.bestNight) parts.push(`Long Night: ${this._fmtTime(m.bestNight)}`);
    el.textContent = parts.length ? 'Best — ' + parts.join(' · ') : '';
  }

  // Adaptive score driver (client-local, cosmetic): pick scene from local threat,
  // ramp intensity, fire the boss-down victory sting. Smoothing/scheduling live in MusicDirector.
  _updateAdaptiveMusic() {
    const m = this.audio.music; if (!m) return;
    const en = this.enemies;
    let boss = null;
    for (const e of en.active) { if (e.alive && e.def && (e.def.boss || e.def.tank)) { boss = e; break; } }
    if (boss) {
      if (m.sceneName !== 'boss') m.setScene('boss', { variant: boss.def.tank ? 'mitri' : 'tolo' });
      const frac = Math.max(0, Math.min(1, boss.hp / (boss.maxHp || 1)));
      m.setIntensity(0.65 + (1 - frac) * 0.35);
      this._bossMusic = true;
    } else {
      if (this._bossMusic) { this._bossMusic = false; m.sting('victory', 'big'); m.setScene('gameplay'); }
      if (m.sceneName === 'gameplay') {
        const pp = this.player.pos; let near = 0;
        for (const e of en.active) { if (!e.alive) continue; if (Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z) < 14) near++; }
        const aliveFrac = Math.min(1, en.aliveCount / 18);
        const nearFrac = Math.min(1, near / 8);
        const waveBonus = (this._waveBreak > 0) ? 0 : 0.15;
        m.setIntensity(Math.min(1, 0.05 + nearFrac * 0.6 + aliveFrac * 0.3 + waveBonus));
      }
    }
    const hpFrac = this.player.maxHp ? this.player.hp / this.player.maxHp : 1;
    m.setStress(Math.max(0, Math.min(1, (0.35 - hpFrac) / 0.35)));
  }

  _frame(t) {
    requestAnimationFrame(this._bound);
    let dt = (t - this._last) / 1000; this._last = t;
    if (!(dt > 0)) dt = 0.0001; dt = Math.min(dt, 0.05);
    if (this.audio.music) this.audio.music.update(dt); // score smoothing runs in every state
    if (this.state === 'playing') this._updatePlaying(dt);
    this.engine.update(dt); this.engine.render();
    if (this.state === 'shop' && this.preview) this.preview.render(dt);
    if (this.state === 'admin' && this.admin) this.admin.viewer.render(dt);
    this.input.endFrame();
  }

  _updatePlaying(dt) {
    const hostSim = !this.mp.active || this.mp.isHost; // clients don't simulate enemies/waves
    if (hostSim && this._startCountdown > 0) { this._startCountdown -= dt; if (this._startCountdown <= 0) this.waves.startWave(this.waves.wave + 1); }
    if (hostSim && this._waveBreak > 0) { this._waveBreak -= dt; if (this._waveBreak <= 0) { this._waveBreak = 0; this.waves.startWave(this.waves.wave + 1); } } // continuous: breather → next wave (no shop, stay 'playing')

    if (this.mp.active && this.mp.frozen) {
      if (this.player.mountedGun) this.player.mountedGun.dismount();
      if (this.player.inTank) this.player.inTank.leave();
      this.weapons.cancelMolotov();
    }
    if (this.player.mountedGun) {
      this.player.mountedGun.controlUpdate(dt); // aim + fire + heat + camera handled here
    } else if (this.player.inTank) {
      this.player.inTank.controlUpdate(dt); // tank camera + controls handled here
    } else {
      if (!this.mp.frozen) {
        const edge = this.input.buttonsPressed[0] ? 'press' : (this.input.buttons[0] ? 'hold' : null);
        const reviving = this.mp.active && this.mp.blocksWeaponUse && this.mp.blocksWeaponUse();
        if (edge && !reviving) this.inventory.handleLMB(edge); // LMB use, dispatched by held item class (gun/melee/consumable/material/callable/throwable)
      }
      if (!this.mp.frozen && this.input.wheel !== 0) { const _shift = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'); if (this.inventory.heldMaterial() && _shift) this.build.rotateGhost(this.input.wheel > 0 ? 1 : -1); else this.weapons.cycle(this.input.wheel > 0 ? 1 : -1); } // Shift+wheel rotates a held material's ghost; plain wheel scrolls the inventory
      this.build.updateRadioTarget(); // radio look-target + ←/→ tuning, BEFORE player.update reads strafe
      this.player.update(dt);
      this.weapons.update(dt);
      this.inventory.update(dt); // throwable (molotov/grenade) state-machine tick
    }
    if (this.player.mountedGun !== this.mountedGun) this.mountedGun.idleCool(dt); // the .50 cools down even when nobody is manning it
    this.player.survivalTick(dt); // survival timers tick in every seat (on foot, .50 cal, tank)
    this.build.update(dt); // build ghost preview (shows only while a builder is held, on foot)
    this.dayNight.flash.intensity = (!this.player.inTank && !this.player.mountedGun && this.inventory.isHoldingFlashlight() && this.dayNight.flashOn) ? 7 : 0; // flashlight beam = the flashlight is the held item
    if (hostSim) this.enemies.update(dt);
    this.loot.update(dt);
    if (!hostSim) this.enemies.updateGhostFx(dt); // clients advance host-relayed boss/tank attack visuals (they don't tick enemies.update)
    if (hostSim) this.waves.update(dt);
    this.mp.update(dt);
    this._updateAdaptiveMusic();
    if (this.mode === 'longnight') { if (hostSim) { this._surviveTime += dt; this.dayNight.update(dt); } this.hud.setClock(this.dayNight.info(), this._surviveTime); } // host advances clock + sky; clients adopt host state via 'night'/'clock'
    this._updateFlares(dt);       // flare is a deployable gadget in EVERY mode → tick gravity/burn/smoke unconditionally (mirrors _updateMolotovPools), else a flare thrown in purge hangs in mid-air
    this._updateMolotovPools(dt);
    if (hostSim) this.hud.setEnemiesLeft(this.waves.active ? this.waves.toSpawn + this.enemies.aliveCount : this.enemies.aliveCount); // clients get the authoritative count via 'clock'
    this.effects.update(dt);
    this.hud.update(dt);
    // ---- Interact prompt priority: tank crew > .50 cal > loot ----
    if (this.mp.active && this.mp._localDead) {
      const rp = this.mp.ensureSpectateTarget();
      this.hud.setInteract(rp ? `Spectating <b>${rp.name}</b> · Q/E switch` : 'No live squadmate to spectate');
      return;
    }
    if (this.mp.active && this.mp._localDown) {
      const prog = this.mp._incomingRevive && performance.now() < this.mp._incomingRevive.until ? this.mp._incomingRevive : null;
      this.hud.setInteract(prog ? `Being revived: <b>${prog.clicks}/${prog.total}</b> clicks` : `DOWNED · bleed-out ${(this.mp._bleedT || 0).toFixed(0)}s`);
      return;
    }
    if (this.mp.active && this.mp._localWaiting) {
      this.hud.setInteract('WAITING · squad must survive');
      return;
    }
    if (this.mp.active && !this.mp.frozen && this.mp.reviveTargetNear) {
      const rp = this.mp.reviveTargetNear();
      if (rp) { this.hud.setInteract(this.mp.revivePrompt(rp)); return; }
    }
    const _ct = this.capturedTank;
    const _nearMountedGun = !this.player.inTank && this.mountedGun.updateNearby(this.player.pos);
    if (this.player.mountedGun) {
      this.hud.setInteract('Press <b>E</b> to leave the .50 cal');
    } else if (_ct && this.player.inTank === _ct) {
      const seatHint = _ct.active === 'gunner' ? ' · T thermal · C peek' : '';
      this.hud.setInteract('E exit · Q seat' + seatHint);
    } else if (_ct && _ct.near(this.player.pos) && !this.player.mountedGun) {
      this.hud.setInteract('Press <b>E</b> to commandeer the T-90M');
    } else if (_nearMountedGun) {
      this.hud.setInteract('Press <b>E</b> to man the .50 cal — 250 rounds, overheats');
    } else if (this.player._splintT > 0) {
      this.hud.setInteract(`Applying splint… ${this.player._splintT.toFixed(1)}s`);
    } else if (this.build.radioTarget) {
      const _r = this.build.radioTarget;
      this.hud.setInteract(_r.on ? '←/→ stanice · <b>E</b> vypnout rádio' : 'Press <b>E</b> to turn on radio');
    } else if (this.loot.nearPickup) {
      this.hud.setInteract(this.loot.promptPickup());
    } else {
      this.hud.setInteract(this.loot.prompt);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => { if (!window.GAME) window.GAME = new Game(); });
if (document.readyState !== 'loading' && !window.GAME) window.GAME = new Game();
