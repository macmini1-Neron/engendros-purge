// fonoteka.js — ФОНОТЕКА: a full-screen "Soviet Spotify" music screen built around a live 3D
// H.K.M. gramophone (the modelgen `gramophone` spec). The record spins while playing and its
// centre label re-skins per song; a genre filter bar + search + transport drive the jukebox
// (game.audio.music). This module also hosts the in-world gramophone PROP (GramophoneManager).
import * as THREE from 'three';
import { buildSpec } from './props/voxel-interp.js';
import { registerModel, getSpec, hasModel } from './props/registry.js';
import { makeRecordLabelTexture } from './props/operators/round.js';
import { GENRES, GENRE_BY_ID, SONG_GENRES, SONG_INFO } from './music.js';
import { radioAttenuation } from './radio.js';
import { icon } from './icons.js';

const RECORD_RPS = 78 / 60;                 // 1.3 rev/s
const RECORD_SPIN = RECORD_RPS * Math.PI * 2; // 8.168 rad/s

// One shared async load of the gramophone spec → registry. buildSpec is sync once registered.
let _specPromise = null;
export function ensureGramophoneSpec() {
  if (!_specPromise) {
    _specPromise = fetch('./models/gramophone/spec.json')
      .then((r) => r.json())
      .then((spec) => { if (!hasModel('gramophone')) registerModel('gramophone', spec); return getSpec('gramophone'); })
      .catch((e) => { console.warn('[fonoteka] gramophone spec load failed', e); return null; });
  }
  return _specPromise;
}

// Build a fresh gramophone THREE.Group + its rig handles (turntable spin node, tonearm, record
// label mesh). Returns null until the spec is registered (call after ensureGramophoneSpec()).
export function buildGramophone() {
  const spec = getSpec('gramophone');
  if (!spec) return null;
  const g = buildSpec(spec);
  let label = null, record = null;
  g.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === 'CircleGeometry') label = o; });
  g.userData.rig = {
    turntable: g.getObjectByName('turntable'),
    tonearm: g.getObjectByName('tonearm'),
    lid: g.getObjectByName('lid'),
    crank: g.getObjectByName('crank'),
    label,
  };
  return g;
}

// Re-skin a built gramophone's record label to the given track (canvas CCCP label).
export function setGramophoneLabel(g, title) {
  const lbl = g && g.userData.rig && g.userData.rig.label;
  if (!lbl) return;
  const tex = makeRecordLabelTexture({ title: title || 'СССР', mode: 'black' });
  if (lbl.material.map) lbl.material.map.dispose();
  lbl.material.map = tex; lbl.material.needsUpdate = true;
}

// --- the self-contained 3D showpiece on the ФОНОТЕКА screen ---
class GramophoneViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xfff4e2, 0x2a3a34, 1.2));
    const key = new THREE.DirectionalLight(0xfff1d0, 2.0); key.position.set(3, 6, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fb8ff, 0.7); rim.position.set(-4, 2, -3); this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe0b0, 0.55); fill.position.set(-1, -2, 5); this.scene.add(fill); // lifts the lid logo
    this.cam = new THREE.PerspectiveCamera(33, 1.4, 0.01, 60);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.model = null; this.rig = null; this._dist = 1.0;
    this.playing = false; this.armPlay = 0; this._yaw = 0.5; this._spin = 0;
    this._drag = false; this._lx = 0;
    canvas.addEventListener('pointerdown', (e) => { this._drag = true; this._lx = e.clientX; });
    window.addEventListener('pointerup', () => { this._drag = false; });
    canvas.addEventListener('pointermove', (e) => { if (this._drag) { this._yaw += (e.clientX - this._lx) * 0.01; this._lx = e.clientX; } });
    this.setSize();
  }
  setSize() {
    const w = this.canvas.clientWidth || 560, h = this.canvas.clientHeight || 520;
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  async ensureModel() {
    if (this.model) return true;
    await ensureGramophoneSpec();
    if (this.model) return true;                 // race guard
    const g = buildGramophone();
    if (!g) return false;
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    g.position.set(-c.x, -box.min.y - s.y / 2, -c.z);   // sit centred at the holder origin
    this.holder.add(g); this.model = g; this.rig = g.userData.rig;
    this._dist = Math.max(s.x, s.y, s.z) * 1.85 + 0.18;
    if (this._pendingLabel) { this.setLabel(this._pendingLabel); this._pendingLabel = null; }
    return true;
  }
  setLabel(title) {
    if (!this.model) { this._pendingLabel = title; return; }
    setGramophoneLabel(this.model, title);
  }
  render(dt) {
    if (!this.model) { this.ensureModel(); this.renderer.render(this.scene, this.cam); return; }
    // record spins clockwise (−Y) while playing, eases to a stop when paused
    const target = this.playing ? 1 : 0;
    this._spin += (target - this._spin) * Math.min(1, dt * 3);
    if (this.rig.turntable) this.rig.turntable.rotation.y -= RECORD_SPIN * dt * this._spin;
    // tonearm settles onto the record while playing, lifts back when stopped (subtle)
    this.armPlay += ((this.playing ? 1 : 0) - this.armPlay) * Math.min(1, dt * 2.5);
    if (this.rig.tonearm) this.rig.tonearm.rotation.y = -0.5 + this.armPlay * 0.28;
    this.holder.rotation.y = this._yaw + (this._drag ? 0 : dt * 0.12) * 0; // slow idle drift handled below
    if (!this._drag) this._yaw += dt * 0.10;
    this.holder.rotation.y = this._yaw;
    const d = this._dist;
    this.cam.position.set(d * 0.55, d * 0.42, d * 0.92); this.cam.lookAt(0, 0.02, 0);
    this.renderer.render(this.scene, this.cam);
  }
}

export class Fonoteka {
  constructor(game) {
    this.game = game;
    this.built = false;
    this.viewer = null;
    this.genre = 'all';          // active genre filter
    this.query = '';             // search text
    this._rows = [];
    this._timer = null;
    this._lastSlug = null;
  }

  // Build the overlay DOM once (the #music container lives in index.html).
  _build() {
    if (this.built) return;
    const root = document.getElementById('music');
    if (!root) return;
    const gbtns = [`<button class="fono-g on" data-g="all" title="Все · All">${icon('disc')}<i>ВСЕ</i></button>`]
      .concat(GENRES.map((g) => `<button class="fono-g" data-g="${g.id}" title="${g.ru} · ${g.en}">${icon(g.icon)}<i>${g.en}</i></button>`))
      .join('');
    root.innerHTML =
      '<div class="fono">' +
        '<div class="fono-head">' +
          '<div class="fono-brand"><b>ФОНОТЕКА</b><span>PHONOTHÈQUE · СОВЕТСКАЯ ЭСТРАДА</span></div>' +
          `<button class="btn sec mini" id="fonoteka-back">${icon('back')} НАЗАД · BACK</button>` +
        '</div>' +
        '<div class="fono-body">' +
          '<div class="fono-stage">' +
            '<canvas id="fonoCanvas"></canvas>' +
            '<div class="fono-np" id="fono-np">' +
              '<div class="fono-np-ru" id="fono-np-ru">—</div>' +
              '<div class="fono-np-en" id="fono-np-en"></div>' +
              '<div class="fono-np-meta" id="fono-np-meta"></div>' +
            '</div>' +
          '</div>' +
          '<div class="fono-side">' +
            `<div class="fono-search">${icon('search')}<input id="fono-q" type="text" placeholder="Поиск · search title…" spellcheck="false"></div>` +
            `<div class="fono-genres" id="fono-genres">${gbtns}</div>` +
            '<div class="fono-count" id="fono-count"></div>' +
            '<div class="fono-list" id="fono-list"></div>' +
            '<div class="fono-bar" id="fono-bar"><div class="fono-fill" id="fono-fill"></div></div>' +
            '<div class="fono-transport">' +
              '<span class="fono-time" id="fono-time">0:00 / 0:00</span>' +
              `<button class="fono-t tg" id="fono-shuffle" title="Перемешать · shuffle">${icon('shuffle')}</button>` +
              `<button class="fono-t" id="fono-prev" title="Назад · previous">${icon('skipback')}</button>` +
              `<button class="fono-t big" id="fono-play" title="Играть · play / pause">${icon('play')}</button>` +
              `<button class="fono-t" id="fono-next" title="Вперёд · next">${icon('skipfwd')}</button>` +
              `<button class="fono-t tg" id="fono-repeat" title="Повтор · repeat one">${icon('repeat')}</button>` +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const m = () => this.game.audio.music;
    const $ = (id) => document.getElementById(id);
    $('fonoteka-back').onclick = () => this.game.closeFonoteka();
    $('fono-q').addEventListener('input', (e) => { this.query = e.target.value.trim().toLowerCase(); this._renderList(); });
    $('fono-genres').querySelectorAll('.fono-g').forEach((b) => b.addEventListener('click', () => {
      this.genre = b.dataset.g;
      $('fono-genres').querySelectorAll('.fono-g').forEach((x) => x.classList.toggle('on', x === b));
      this._renderList();
    }));
    $('fono-prev').onclick = () => m() && m().jukeboxPrev();
    $('fono-next').onclick = () => m() && m().jukeboxNext();
    $('fono-play').onclick = () => m() && m().jukeboxToggle();
    $('fono-shuffle').onclick = () => m() && m().jukeboxSetShuffle();
    $('fono-repeat').onclick = () => m() && m().jukeboxSetRepeatOne();
    $('fono-bar').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); m() && m().jukeboxSeek((e.clientX - r.left) / r.width); });

    this.viewer = new GramophoneViewer($('fonoCanvas'));
    this.built = true;
  }

  _renderList() {
    const m = this.game.audio.music; if (!m) return;
    const list = document.getElementById('fono-list'); if (!list) return;
    const tracks = m.jukeboxTracks();
    list.innerHTML = '';
    this._rows = [];
    let shown = 0;
    tracks.forEach((t, i) => {
      if (this.genre !== 'all' && t.genre !== this.genre) return;
      if (this.query && !(`${t.title} ${t.en || ''}`.toLowerCase().includes(this.query))) return;
      const g = GENRE_BY_ID[t.genre];
      const el = document.createElement('div');
      el.className = 'fono-row';
      el.innerHTML =
        `<span class="fr-n">${shown + 1}</span>` +
        `<span class="fr-tt"><b>${t.title}</b><small>${t.en || ''}</small></span>` +
        (g ? `<span class="fr-g" title="${g.ru}">${icon(g.icon)}</span>` : '<span class="fr-g"></span>') +
        `<span class="fr-y">${t.year || ''}</span>`;
      el.addEventListener('click', () => { this.game.audio.init(); m.jukeboxPlayAt(i); });
      list.appendChild(el);
      this._rows.push({ el, index: i });
      shown++;
    });
    const c = document.getElementById('fono-count');
    if (c) { const gname = this.genre === 'all' ? 'ВСЕ ЖАНРЫ · ALL' : `${GENRE_BY_ID[this.genre].ru} · ${GENRE_BY_ID[this.genre].en}`; c.textContent = `${gname} — ${shown}`; }
  }

  open() {
    this._build();
    this.game.audio.init();
    const m = this.game.audio.music;
    if (m && !m.playlist) m.setPlaylist('soviet');
    this._renderList();
    // size + spin up the 3D once the overlay is visible (clientWidth valid next frame)
    requestAnimationFrame(() => { if (this.viewer) { this.viewer.setSize(); this.viewer.ensureModel(); } });
    this._startTick();
  }
  close() { this._stopTick(); }

  render(dt) { if (this.viewer) this.viewer.render(dt); }   // called from Game._frame in state 'music'

  _startTick() {
    this._stopTick();
    this._tick();
    this._timer = setInterval(() => this._tick(), 250);
  }
  _stopTick() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  _tick() {
    if (this.game.state !== 'music') { this._stopTick(); return; }
    const m = this.game.audio.music; if (!m) return;
    const s = m.jukeboxStatus();
    const $ = (id) => document.getElementById(id);
    const ru = $('fono-np-ru'), en = $('fono-np-en'), meta = $('fono-np-meta');
    if (ru) ru.textContent = s.active && s.title ? s.title : '—';
    if (en) en.textContent = s.active && s.en ? s.en : '';
    if (meta) { const g = s.genre && GENRE_BY_ID[s.genre]; meta.textContent = s.active ? [g ? g.ru : null, s.year || null].filter(Boolean).join('  ·  ') : ''; }
    const play = $('fono-play'); if (play) play.innerHTML = icon(s.active && !s.paused ? 'pause' : 'play');
    const sh = $('fono-shuffle'), rp = $('fono-repeat');
    if (sh) sh.classList.toggle('on', !!s.shuffle);
    if (rp) rp.classList.toggle('on', !!s.repeatOne);
    const fill = $('fono-fill'), time = $('fono-time');
    if (fill) fill.style.width = (s.duration ? (s.time / s.duration * 100) : 0) + '%';
    if (time) time.textContent = this._fmt(s.time) + ' / ' + this._fmt(s.duration);
    // viewer state: spin while a real track plays; swap the record label on track change
    if (this.viewer) {
      this.viewer.playing = !!(s.active && !s.paused);
      if (s.slug !== this._lastSlug) { this._lastSlug = s.slug; this.viewer.setLabel(s.title || 'СССР'); }
    }
    // highlight the active row
    this._rows.forEach((r) => r.el.classList.toggle('on', r.index === s.index));
  }
  _fmt(x) { x = Math.max(0, Math.floor(x || 0)); return Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); }
}

// ============================================================================
// GramophoneManager — the in-world gramophone PROP. Fixed props scattered per map,
// each tied to ONE genre; E toggles play/stop, ◀/▶ change the song within that genre.
// Plays a local mp3 through an <audio> element with distance-based volume + score duck;
// host-authoritative + co-op-synced (gramoreq/gramoset), mirroring the radio prop.
// ============================================================================
const PROP_SCALE = 3.2;                       // ~0.31 m case → ~1 m floor prop (a visible aim target)
const PROP_SPIN = RECORD_SPIN;

export class GramophoneManager {
  constructor(game) {
    this.game = game;
    this.props = [];
    this._idc = 1;
    this.target = null;
    this._o = new THREE.Vector3(); this._f = new THREE.Vector3();
  }
  addProp(scene, x, y, z, yaw, genre) {
    const g = buildGramophone();
    if (!g) { ensureGramophoneSpec().then(() => this.addProp(scene, x, y, z, yaw, genre)); return null; } // defer until spec ready
    g.scale.setScalar(PROP_SCALE); g.position.set(x, y, z); g.rotation.y = yaw;
    scene.add(g);
    const slugs = (SONG_GENRES[genre] && SONG_GENRES[genre].length) ? SONG_GENRES[genre] : SONG_GENRES.disco;
    const p = { id: this._idc++, pos: new THREE.Vector3(x, y, z), genre, mesh: g, on: false, songIdx: 0, audio: null, slugs, _spin: 0 };
    setGramophoneLabel(g, (SONG_INFO[slugs[0]] || {}).title);
    this.props.push(p);
    return p;
  }
  _slug(p) { const n = p.slugs.length; return p.slugs[((p.songIdx % n) + n) % n]; }
  _start(p) {
    if (typeof Audio === 'undefined') return;
    if (!p.audio) {
      const el = new Audio(); el.preload = 'none';
      el.addEventListener('ended', () => this.cycleSong(p, 1, true)); // auto-advance within the genre
      p.audio = el;
    }
    const url = 'assets/' + this._slug(p) + '.mp3';
    if (!p.audio.src.endsWith(url)) p.audio.src = url;
    const pr = p.audio.play(); if (pr && pr.catch) pr.catch(() => {});
  }
  _stop(p) { if (p.audio) { try { p.audio.pause(); } catch (e) {} } }
  update(dt) {
    const a = this.game.audio, pp = this.game.player.pos;
    let nearest = 0;
    for (const p of this.props) {
      const rig = p.mesh.userData.rig;
      p._spin += ((p.on ? 1 : 0) - p._spin) * Math.min(1, dt * 3);
      if (rig && rig.turntable) rig.turntable.rotation.y -= PROP_SPIN * dt * p._spin;
      if (!p.on || !p.audio) continue;
      const dist = Math.hypot(pp.x - p.pos.x, pp.z - p.pos.z);
      const att = radioAttenuation(dist);
      p.audio.volume = Math.max(0, Math.min(1, att * (a && a.musicVolume != null ? a.musicVolume : 0.5) * (a && a.muted ? 0 : 1)));
      if (att > nearest) nearest = att;
    }
    if (nearest > 0 && a && a.setMusicDuck) a.setMusicDuck(1 - nearest * 0.85); // duck the procedural score near a playing gramophone
  }
  // Raycast the crosshair → nearest gramophone within reach; while one plays, consume ←/→ to change song.
  updateTarget() {
    this.target = null;
    const g = this.game;
    if (g.state !== 'playing' || (g.mp && g.mp.frozen) || g.player.mountedGun) return;
    if (g.build && g.build.radioTarget) return;                 // a targeted radio takes priority
    const cam = g.engine.camera; cam.updateMatrixWorld();
    const o = this._o.setFromMatrixPosition(cam.matrixWorld);
    const f = this._f.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    let best = null, bestD = 4.0;
    for (const p of this.props) {
      const dx = p.pos.x - o.x, dz = p.pos.z - o.z, along = dx * f.x + dz * f.z;
      if (along <= 0 || along > bestD) continue;
      const px = o.x + f.x * along, pz = o.z + f.z * along;
      if (Math.hypot(p.pos.x - px, p.pos.z - pz) < 1.3) { best = p; bestD = along; }
    }
    this.target = best;
    if (best && best.on) {
      const inp = g.input;
      if (inp.wasPressed('ArrowRight')) this.cycleSong(best, 1);
      else if (inp.wasPressed('ArrowLeft')) this.cycleSong(best, -1);
      inp.down.delete('ArrowLeft'); inp.down.delete('ArrowRight'); // suppress strafe while changing track
    }
  }
  prompt(p) {
    const t = SONG_INFO[this._slug(p)] || {};
    return p.on ? `♪ ${t.title || ''} · ←/→ change · <b>E</b> stop` : 'Press <b>E</b> to play the gramophone';
  }
  toggle(p) {
    if (!p) return;
    this.game.audio.init();
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) { mp.net.send('gramoreq', { id: p.id, on: !p.on, songIdx: p.songIdx }); return; }
    this.applySet({ id: p.id, on: !p.on, songIdx: p.songIdx });
    if (mp && mp.active && mp.isHost) mp.net.broadcast('gramoset', { id: p.id, on: p.on, songIdx: p.songIdx });
  }
  cycleSong(p, dir, fromEnded) {
    if (!p) return;
    const n = p.slugs.length, mp = this.game.mp, idx = ((p.songIdx + dir) % n + n) % n;
    if (mp && mp.active && !mp.isHost) { mp.net.send('gramoreq', { id: p.id, on: true, songIdx: idx }); return; }
    this.applySet({ id: p.id, on: true, songIdx: idx });
    if (mp && mp.active && mp.isHost) mp.net.broadcast('gramoset', { id: p.id, on: true, songIdx: idx });
    if (!fromEnded && this.game.hud && this.game.hud.toast) { const t = SONG_INFO[this._slug(p)] || {}; this.game.hud.toast('♪ ' + (t.title || ''), 0xd8b066); }
  }
  applySet(d) {
    const p = this.props.find((x) => x.id === d.id); if (!p) return;
    p.on = !!d.on; p.songIdx = d.songIdx | 0;
    setGramophoneLabel(p.mesh, (SONG_INFO[this._slug(p)] || {}).title);
    if (p.on) this._start(p); else this._stop(p);
    if (this.game.audio && this.game.audio.uiClick) this.game.audio.uiClick();
  }
  // late-join: host resends every ON gramophone's state to a newcomer.
  syncTo(net) { for (const p of this.props) if (p.on) net.send('gramoset', { id: p.id, on: true, songIdx: p.songIdx }); }
}

// Scatter the gramophone props across a map — each near a known structure, each a different genre
// so every category is represented around the world. Floor-anchored (y=0); reposition freely.
export function placeGramophones(manager, scene, mapId) {
  const spots = mapId === 'steppe'
    ? [ [-150, 0, -86, 0.0, 'marshi'], [-150, 0, -94, 3.0, 'frontline'], [20, 0, 20, 1.0, 'disco'], [2, 0, -158, 0.0, 'bard'] ]
    : [ [0, 0, 40, 0.0, 'marshi'], [30, 0, 38, -0.8, 'disco'], [-20, 0, 10, 1.5, 'frontline'], [16, 0, -18, 2.4, 'estrada'] ];
  for (const [x, y, z, yaw, genre] of spots) manager.addProp(scene, x, y, z, yaw, genre);
}
