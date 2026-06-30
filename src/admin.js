// admin.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { clamp, voxelMaterial } from './util.js';
import { buildBarbedWire, buildBarricade, buildChuteRig, buildFieldRadio, buildFlare, buildSandbags, buildSupplyCrate } from './props.js';
import { buildGramophone } from './fonoteka.js';
import { WEAPONS, WEAPON_ORDER, buildMag, buildViewmodel } from './weapons.js';
import { ENGENDRO_COLORS, buildTolo, buildCourierRadio } from './enemies.js';
import { buildRig, dressRig } from './engendro.js';
import { getSpec } from './props/registry-core.js';
import { buildSpec } from './props/voxel-interp.js';
import { buildIl76AirdropFallback, buildIl76AirdropModel, preloadIl76AirdropModel } from './aircraft.js';


// ---------------------------------------------------------------------------
// Admin asset viewer — orbit any 3D asset (weapons model+POV, enemy skins, props)
// and audition every sound. Opened from the menu; its own WebGL canvas.
// ---------------------------------------------------------------------------
class AssetViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x55606e, 1.2));
    const d1 = new THREE.DirectionalLight(0xfff1d0, 1.8); d1.position.set(4, 6, 5); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x90b0ff, 0.6); d2.position.set(-5, -2, -4); this.scene.add(d2);
    this.cam = new THREE.PerspectiveCamera(35, 1.6, 0.01, 4000);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.spin = 0.6; this.dist = 3; this.pov = false; this.dragX = 0; this.dragY = 0;
    this._drag = false; this._lx = 0; this._ly = 0;
    canvas.addEventListener('pointerdown', (e) => { this._drag = true; this._lx = e.clientX; this._ly = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} });
    const up = () => { this._drag = false; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointerleave', up);
    canvas.addEventListener('pointermove', (e) => { if (!this._drag) return; this.dragY += (e.clientX - this._lx) * 0.01; this.dragX = clamp(this.dragX + (e.clientY - this._ly) * 0.01, -1.3, 1.3); this._lx = e.clientX; this._ly = e.clientY; });
    this.setSize();
  }
  setSize() {
    const w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 380;
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  clear() {
    while (this.holder.children.length) {
      const c = this.holder.children.pop();
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    }
  }
  show(obj, pov = false) {
    this.clear(); this.pov = pov; this.dragX = 0; this.dragY = 0; this.spin = 0.6;
    obj.traverse((o) => { if (o.material) { o.material.depthTest = true; o.renderOrder = 0; } });
    this.holder.add(obj);
    if (pov) { obj.position.set(0.3, -0.27, -0.72); }
    else {
      const box = new THREE.Box3().setFromObject(obj);
      const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      obj.position.sub(ctr);
      this.dist = Math.max(size.x, size.y, size.z, 0.5) * 1.6 * (obj.userData.viewerDistMult || 1) + 0.4;
      if (typeof obj.userData.viewerSpin === 'number') this.spin = obj.userData.viewerSpin;
    }
  }
  render(dt) {
    if (this.pov) {
      this.cam.fov = 75; this.cam.position.set(0, 0, 0.0001); this.cam.up.set(0, 1, 0); this.cam.lookAt(0, -0.05, -1);
      this.holder.rotation.set(0, 0, 0);
    } else {
      this.spin += dt * 0.5; this.holder.rotation.y = this.spin + this.dragY; this.holder.rotation.x = this.dragX;
      const d = this.dist; this.cam.fov = 35; this.cam.position.set(d * 0.5, d * 0.42, d * 0.85); this.cam.up.set(0, 1, 0); this.cam.lookAt(0, 0, 0);
    }
    this.cam.updateProjectionMatrix();
    this.renderer.render(this.scene, this.cam);
  }
}

export class Admin {
  constructor(game) {
    this.game = game; this.tab = 'weapons'; this.pov = false; this.curIdx = 0;
    this.viewer = new AssetViewer(document.getElementById('adminCanvas'));
    this.tabsEl = document.getElementById('adminTabs');
    this.listEl = document.getElementById('adminList');
    this.nameEl = document.getElementById('adminName');
    this.povBtn = document.getElementById('adminPovBtn');
    this._buildTabs();
    this.povBtn.addEventListener('click', () => { this.pov = !this.pov; this.povBtn.classList.toggle('on', this.pov); this._select(this.curIdx); });
  }
  _buildTabs() {
    this.tabsEl.innerHTML = '';
    for (const [id, label] of [['weapons', 'Weapons'], ['enemies', 'Enemies / Skins'], ['props', 'Props'], ['sounds', 'Sounds'], ['music', '🎵 Music']]) {
      const t = document.createElement('div'); t.className = 'tab' + (id === this.tab ? ' on' : ''); t.textContent = label;
      t.addEventListener('click', () => { this.tab = id; for (const c of this.tabsEl.children) c.classList.toggle('on', c.textContent === label); this._render(); });
      this.tabsEl.appendChild(t);
    }
  }
  open() { this.game.audio.init(); preloadIl76AirdropModel(); this.game.ui.show('admin'); this.viewer.setSize(); this._render(); }
  _crate() { return buildSupplyCrate(); }
  _chuteRig() {   // crate + full parachute rigging (canopy, crossed risers, carabiners)
    const grp = new THREE.Group();
    const crate = buildSupplyCrate(); grp.add(crate);
    const { canopy, rig } = buildChuteRig(); grp.add(canopy); grp.add(rig);
    return grp;
  }
  _items() {
    const g = this.game;
    if (this.tab === 'weapons') return WEAPON_ORDER.map((k) => ({ name: WEAPONS[k].name, sub: WEAPONS[k].class, make: () => { const grp = new THREE.Group(); grp.add(buildViewmodel(WEAPONS[k])); const sm = WEAPONS[k].spinMag; if (sm) { const mg = buildMag(sm); mg.position.set(sm.x, sm.y, sm.z); grp.add(mg); } return grp; } }));
    if (this.tab === 'enemies') {
      // Live in-game model: regular engendros are part-rigged plush (engendro.js buildRig/dressRig),
      // NOT the legacy buildEngendro merged mesh — so the viewer dresses a rig to match what spawns.
      const rigged = (colorHex, variant, seed) => () => { const rig = buildRig(voxelMaterial()); dressRig(rig, colorHex, seed >>> 0, variant); return rig.root; };
      const list = ENGENDRO_COLORS.map((col, i) => ({ name: col.name, sub: 'engendro skin', make: rigged(col.body, 'normal', (i + 1) * 2654435761) }));
      list.push({ name: 'BOSS TOLO', sub: 'boss (legacy merged mesh)', make: () => new THREE.Mesh(buildTolo(), voxelMaterial()) });
      list.push({ name: 'mini Tolo', sub: 'phase-2 add', make: rigged(0xede7df, 'normal', 7777) });
      list.push({ name: 'Mitri (exploder)', sub: 'exploder', make: rigged(ENGENDRO_COLORS[5 % ENGENDRO_COLORS.length].body, 'exploder', 5151) });
      list.push({ name: 'Boomer (charger)', sub: 'kamikaze', make: rigged(0x8a2b2b, 'charger', 3131) });
      list.push({ name: 'Courier (R-105d on back)', sub: 'backpack courier — radio worn on the back', make: () => {
        const rig = buildRig(voxelMaterial());
        dressRig(rig, ENGENDRO_COLORS[0].body, 4242, 'normal');
        const radio = buildCourierRadio();   // null until the spec registers; mounted exactly as in makeCourier
        if (radio) rig.root.add(radio);
        return rig.root;
      } });
      return list;
    }
    if (this.tab === 'props') return [
      { name: 'IL-76 Candid', sub: 'supply plane', make: () => buildIl76AirdropModel({ cache: false }) || buildIl76AirdropFallback() }, // cache:false → the viewer's clear() can dispose it; never touches loot's reused singleton
      { name: 'Field Radio «Р-105»', sub: 'music prop (NEW)', make: () => buildFieldRadio() },
      { name: 'Vysílačka (Falcon III)', sub: 'pickup', make: () => g.loot._pickupMesh('airbeacon') },
      { name: 'Supply crate', sub: 'air drop', make: () => this._crate() },
      { name: 'Parachute rig', sub: 'air drop', make: () => this._chuteRig() },
      { name: 'Lootbox Key', sub: 'pickup', make: () => g.loot._keyMesh() },
      { name: 'Medkit', sub: 'pickup', make: () => g.loot._pickupMesh('medkit') },
      { name: 'Ammo box', sub: 'pickup', make: () => g.loot._pickupMesh('ammo') },
      { name: 'DShK Ammo Box', sub: 'pickup (modelgen)', make: () => { const s = getSpec('dshk-ammo-box'); return s ? buildSpec(s) : null; } },
      { name: 'Часы «ЧАСОЗБОР»', sub: 'wall clock (modelgen, live in demo)', make: () => { const s = getSpec('wallclock-chasozbor'); return s ? buildSpec(s) : null; } },
      { name: 'ННП-23 «Резчик» (1ПН54)', sub: 'night obs post (modelgen)', make: () => { const s = getSpec('nnp23'); return s ? buildSpec(s) : null; } },
      { name: 'ЛПР-1 «Каралон-М» (1Д13)', sub: 'laser rangefinder (modelgen)', make: () => { const s = getSpec('lpr1'); return s ? buildSpec(s) : null; } },
      { name: 'R-105d (Tesla/ČSLA)', sub: 'field radio — courier backpack (modelgen)', make: () => { const s = getSpec('r105d'); return s ? buildSpec(s) : null; } },
      { name: 'Armor plate', sub: 'pickup', make: () => g.loot._pickupMesh('armor') },
      { name: 'Field splint', sub: 'pickup', make: () => g.loot._pickupMesh('splint') },
      { name: 'Ration tin', sub: 'pickup', make: () => g.loot._pickupMesh('food') },
      { name: 'Molotov bottle', sub: 'pickup', make: () => g.loot._pickupMesh('molotov') },
      { name: 'Flare', sub: 'thrown light', make: () => buildFlare() },
      { name: 'Sandbags', sub: 'fortification', make: () => buildSandbags() },
      { name: 'Barbed wire', sub: 'fortification', make: () => buildBarbedWire() },
      { name: 'Barricade', sub: 'fortification', make: () => buildBarricade() },
      { name: 'H.K.M. Gramophone', sub: 'ФОНОТЕКА prop', make: () => buildGramophone() || new THREE.Group() },
    ];
    return [];
  }
  _sounds() {
    const a = this.game.audio;
    return [
      ['📻 Radio call (IL-76)', () => a.radioCall()],
      ['✈ Jet pass (demo)', () => { const j = a.startJetClip() || (a._jetFailed ? null : a.startJet()); if (!j) return; if (j.set) { let t = 0; const id = setInterval(() => { t += 0.1; const near = Math.max(0, 1 - Math.abs(t - 1.6) / 1.6); j.set(0.3 + near * 0.7, near); if (t >= 3.3) { clearInterval(id); j.stop(); } }, 100); } else { setTimeout(() => j.stop(1.4), 3800); } }],
      ['Gunshot', () => a.gunshot({})], ['Explosion', () => a.explosion()],
      ['Reload click', () => a.reloadClick()], ['Reload in', () => a.reloadIn()], ['Dry fire', () => a.dryFire()],
      ['Hit marker', () => a.hitMarker()], ['Headshot', () => a.headshot()], ['Enemy hurt', () => a.enemyHurt()],
      ['Enemy die', () => a.enemyDie()], ['Enemy growl', () => a.enemyGrowl()], ['Player hurt', () => a.playerHurt()],
      ['Footstep', () => a.footstep()], ['Jump', () => a.jump()], ['Land (hard)', () => a.land(true)],
      ['UI click', () => a.uiClick()], ['UI hover', () => a.uiHover()], ['Buy', () => a.buy()], ['No money', () => a.noMoney()],
      ['Wave start', () => a.waveStart()], ['Wave clear', () => a.waveClear()], ['Game over', () => a.gameOver()],
      ['📻 Grant Radio x2 (dev)', () => { this.game.inventory.addItem('radio', 2); this.game.inventory.refreshHotbar(); this.game.hud.toast('Granted 2 Radios — select & place (LMB)', 0x6fd0e8); }], // dev/testing convenience — real acquisition is the 30% supply-drop (loot _spillDropLoot, gated on none in play)
    ];
  }
  _render() {
    this._stopMusicTick();
    this.listEl.innerHTML = '';
    const hint = document.getElementById('adminHint'); if (hint) hint.style.display = (this.tab === 'sounds' || this.tab === 'music') ? 'none' : '';
    if (this.tab === 'music') { this._renderMusic(); return; }
    const isSound = this.tab === 'sounds';
    this.povBtn.style.display = this.tab === 'weapons' ? '' : 'none';
    this.viewer.canvas.style.display = isSound ? 'none' : '';
    if (isSound) {
      this.nameEl.textContent = '🔊 Click a sound to play it';
      for (const [label, fn] of this._sounds()) { const el = document.createElement('div'); el.className = 'arow snd'; el.innerHTML = `<span>${label}</span>`; el.addEventListener('click', fn); this.listEl.appendChild(el); }
      return;
    }
    this._cache = this._items(); this._rows = [];
    this._cache.forEach((it, i) => {
      const el = document.createElement('div'); el.className = 'arow'; el.innerHTML = `<span>${it.name}</span><small>${it.sub || ''}</small>`;
      el.addEventListener('click', () => this._select(i)); this.listEl.appendChild(el); this._rows.push(el);
    });
    if (this._cache.length) this._select(0);
  }
  // --- Spotify-style jukebox player (Music tab) ---
  _renderMusic() {
    const m = this.game.audio.music;
    this.povBtn.style.display = 'none';
    this.viewer.canvas.style.display = 'none';
    if (!m) { this.nameEl.textContent = 'Audio not ready — click anywhere first.'; return; }
    this.nameEl.innerHTML =
      '<div class="mplayer">' +
        '<div class="mp-now" id="mp-now">— select a track —</div>' +
        '<div class="mp-ctl">' +
          '<button class="mp-btn mp-tg" id="mp-shuffle" title="Shuffle (random)">🔀</button>' +
          '<button class="mp-btn" id="mp-prev" title="Previous">⏮</button>' +
          '<button class="mp-btn mp-big" id="mp-play" title="Play / Pause">▶</button>' +
          '<button class="mp-btn" id="mp-next" title="Next">⏭</button>' +
          '<button class="mp-btn mp-tg" id="mp-repeat" title="Repeat one track">🔂</button>' +
          '<div class="mp-bar" id="mp-bar"><div class="mp-fill" id="mp-fill"></div></div>' +
          '<span class="mp-time" id="mp-time">0:00 / 0:00</span>' +
        '</div>' +
      '</div>';
    this.listEl.innerHTML = '';
    this._mpRows = m.jukeboxTracks().map((t, i) => {
      const el = document.createElement('div'); el.className = 'arow snd mp-row';
      el.innerHTML = `<span><b>${i + 1}.</b> ${t.title}</span><small>${t.year || ''}</small>`;
      el.addEventListener('click', () => m.jukeboxPlayAt(i));
      this.listEl.appendChild(el); return el;
    });
    const $ = (id) => document.getElementById(id);
    $('mp-prev').onclick = () => m.jukeboxPrev();
    $('mp-next').onclick = () => m.jukeboxNext();
    $('mp-play').onclick = () => m.jukeboxToggle();
    $('mp-shuffle').onclick = () => m.jukeboxSetShuffle();
    $('mp-repeat').onclick = () => m.jukeboxSetRepeatOne();
    $('mp-bar').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); m.jukeboxSeek((e.clientX - r.left) / r.width); };
    this._startMusicTick();
  }
  _fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  _startMusicTick() {
    this._stopMusicTick();
    const m = this.game.audio.music;
    const tick = () => {
      if (this.game.state !== 'admin' || this.tab !== 'music') { this._stopMusicTick(); return; }
      const s = m.jukeboxStatus();
      const now = document.getElementById('mp-now'), play = document.getElementById('mp-play');
      const fill = document.getElementById('mp-fill'), time = document.getElementById('mp-time');
      if (now) now.innerHTML = s.active ? `<span class="mp-dot ${s.paused ? '' : 'on'}"></span><b>${s.title}</b>${s.year ? ' · ' + s.year : ''}` : '— select a track —';
      if (play) play.textContent = (s.active && !s.paused) ? '⏸' : '▶';
      const sh = document.getElementById('mp-shuffle'), rp = document.getElementById('mp-repeat');
      if (sh) sh.classList.toggle('on', !!s.shuffle);
      if (rp) rp.classList.toggle('on', !!s.repeatOne);
      if (fill) fill.style.width = (s.duration ? (s.time / s.duration * 100) : 0) + '%';
      if (time) time.textContent = this._fmt(s.time) + ' / ' + this._fmt(s.duration);
      if (this._mpRows) this._mpRows.forEach((r, i) => r.classList.toggle('on', i === s.index));
    };
    tick();
    this._musicTimer = setInterval(tick, 250);
  }
  _stopMusicTick() { if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; } }

  _select(i) {
    if (!this._cache || !this._cache[i]) return;
    this.curIdx = i; this._rows.forEach((r, j) => r.classList.toggle('on', j === i));
    const it = this._cache[i], usePov = this.pov && this.tab === 'weapons';
    this.viewer.show(it.make(), usePov);
    this.nameEl.textContent = it.name + (usePov ? '  ·  POV' : '');
  }
}
