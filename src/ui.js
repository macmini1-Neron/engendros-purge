// ui.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { clamp, hex } from './util.js';
import { HUNGER_LOW, HUNGER_MAX, PLAYER_BURN_DUR } from './tuning.js';
import { WEAPONS, buildMag, buildViewmodel } from './weapons.js';
import { ITEM_DEFS } from './loot.js';
import { mpEscape } from './mp.js';
import { icon, WEAPON_ICON, ITEM_ICON, KEY_ICON } from './icons.js';
import { EFFECTS, EFFECT_TPS } from './effects-status.js';
import { formatHHMM } from './worldclock.js';
import { formatUglomer } from './bearing.js';
import { presetConfig } from './graphics.js';


// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
export class HUD {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), hpfill: $('hpfill'), armorfill: $('armorfill'), hpnum: $('hpnum'),
      ammonum: $('ammonum'), wepname: $('wepname'), wepclass: $('wepclass'),
      wave: $('wave'), money: $('money'), radios: $('radios'), score: $('score'),
      msg: $('msg'), vignette: $('vignette'), hitmarker: $('hitmarker'), killfeed: $('killfeed'),
      cross: $('cross'), toast: $('toast'), interact: $('interact'), scope: $('scope'), binoview: $('binoview'),
      lprview: $('lprview'), lprdigits: $('lprdigits'), lprready: $('lprready'), lprbat: $('lprbat'),
      compassview: $('compassview'), compassrose: $('compassrose'), compassmils: $('compassmils'), compasscoords: $('compasscoords'),
      bossbar: $('bossbar'), bossfill: $('bossfill'), bossname: $('bossname'), bosspip: $('bosspip'), left: $('left'),
      bleedbar: $('bleedbar'), bleedfill: $('bleedfill'),
      heatbar: $('heatbar'), heatfill: $('heatfill'), heatlabel: $('heatlabel'), wavetag: $('wavetag'),
      clock: $('clock'), nightgear: $('nightgear'),
      hungerfill: $('hungerfill'), survival: $('survival'),
      firevig: $('firevig'), firepov: $('firepov'), molotov: $('molotovhud'),
      buildmats: $('buildmats'), hotbar: $('hotbar'),
      mortarpanel: $('mortarpanel'), mElev: $('m-elev'), mRange: $('m-range'), mMils: $('m-mils'), mAmmo: $('m-ammo'), spotcall: $('spotcall'),
    };
    this._hitT = 0; this._msgT = 0; this._spotT = 0;
    this._initDamageNumbers();
  }
  // Floating damage numbers — a fixed pool of reused <div>s (no per-hit DOM alloc, in the spirit of the
  // particle/ring pools). popDamage() world-anchors one; tickDamage() integrates a little arc and projects
  // world→screen with a single scratch Vector3 each frame. Toggle via settings.data.dmgNumbers.
  _initDamageNumbers() {
    const c = document.createElement('div');
    c.id = 'dmgnums';
    c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:24;overflow:hidden';
    document.body.appendChild(c);
    this._dmgC = c; this._dmgPool = []; this._dmgScratch = new THREE.Vector3();
    for (let i = 0; i < 30; i++) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:0;top:0;will-change:transform,opacity;opacity:0;font-weight:800;letter-spacing:.5px;white-space:nowrap;text-shadow:0 2px 5px rgba(0,0,0,.9),0 0 3px rgba(0,0,0,.95);transform:translate(-9999px,-9999px)';
      c.appendChild(d);
      this._dmgPool.push({ el: d, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, life: 0, max: 1 });
    }
  }
  popDamage(world, amount, opts = {}) {
    if (!this._dmgPool || !world) return;
    const st = this.game.settings; if (st && st.data && st.data.dmgNumbers === 0) return;
    let slot = null;
    for (const s of this._dmgPool) if (!s.active) { slot = s; break; }
    if (!slot) { slot = this._dmgPool[0]; for (const s of this._dmgPool) if (s.life < slot.life) slot = s; } // all busy → recycle the most-faded
    const crit = !!opts.crit, kill = !!opts.kill;
    slot.active = true;
    slot.x = world.x; slot.y = world.y + 0.5; slot.z = world.z;
    slot.vx = (Math.random() * 2 - 1) * 0.7; slot.vy = 1.8 + Math.random() * 0.6;
    slot.max = slot.life = kill ? 1.0 : 0.7;
    slot.el.style.color = kill ? '#ff4d2e' : (crit ? '#ffd23f' : '#fff3e0');
    slot.el.style.fontSize = (kill || crit ? 30 : 20) + 'px';
    slot.el.textContent = Math.max(1, Math.round(amount)) + (crit ? '!' : '');
  }
  clearDamage() { if (!this._dmgPool) return; for (const s of this._dmgPool) { if (!s.active) continue; s.active = false; s.el.style.opacity = '0'; s.el.style.transform = 'translate(-9999px,-9999px)'; } }
  tickDamage(dt) {
    if (!this._dmgPool) return;
    if (this.game.state !== 'playing') { this.clearDamage(); return; } // never leave numbers floating over the death screen / menu (tick runs in every state)
    const cam = this.game.engine && this.game.engine.camera; if (!cam) return;
    const v = this._dmgScratch, W = window.innerWidth, H = window.innerHeight;
    for (const s of this._dmgPool) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.el.style.opacity = '0'; s.el.style.transform = 'translate(-9999px,-9999px)'; continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy -= 2.2 * dt;     // gentle upward arc, gravity-eased
      v.set(s.x, s.y, s.z).project(cam);
      if (v.z > 1) { s.el.style.opacity = '0'; continue; }      // behind the camera
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      const t = s.life / s.max;                                 // 1 → 0 over its life
      s.el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-50%) scale(${(1.3 - (1 - t) * 0.5).toFixed(3)})`;
      s.el.style.opacity = String(Math.min(1, t * 2.4));        // pop in, fade over the last ~40%
    }
  }
  show(on) { this.el.hud.classList.toggle('show', on); }
  setHealth(hp, max) { const f = clamp(hp / max, 0, 1); this.el.hpfill.style.width = (f * 100) + '%'; this.el.hpnum.textContent = Math.ceil(hp); this.el.vignette.style.boxShadow = `inset 0 0 200px 40px rgba(200,30,20,${(1 - f) * 0.5})`; }
  setArmor(a, max) { this.el.armorfill.style.width = clamp(a / max, 0, 1) * 100 + '%'; }
  setHunger(h) { if (!this.el.hungerfill) return; this.el.hungerfill.style.width = clamp(h / HUNGER_MAX, 0, 1) * 100 + '%'; this.el.hungerfill.style.filter = h < HUNGER_LOW ? 'saturate(1.7) brightness(1.2)' : 'none'; }
  setSurvival(p) {
    if (!this.el.survival) return;
    let s = '';
    if (p.legBroken) s += `<span class="leg">${icon('leg')} LEG BROKEN — X to splint</span> `;
    if (p.splints > 0) s += `<span class="spl">${icon('splint')} ×${p.splints}</span> `;
    if (p.effects && p.effects.size) {
      for (const [key, inst] of p.effects) {
        if (key === 'broken_leg') continue;            // already shown by the leg line above
        const def = EFFECTS[key];
        const secs = inst.ticksLeft === Infinity ? '' : ' ' + Math.ceil(inst.ticksLeft / EFFECT_TPS) + 's';
        const col = '#' + def.hud.color.toString(16).padStart(6, '0');
        s += `<span class="fxchip" style="color:${col}">${def.hud.icon}${secs}</span> `;
      }
    }
    if (s === this._lastSurvival) return;   // called every frame; the chip string changes ~1 Hz — skip redundant innerHTML
    this._lastSurvival = s;
    this.el.survival.innerHTML = s;
  }
  setWeapon(w) {
    const key = w.cur, d = WEAPONS[key];
    this.el.ammonum.classList.remove('low'); // reset low-ammo tint (re-added below only for a near-empty gun mag)
    this.setCompass(null); // tear the буссоль overlay down on any held-item change (switch / death-reset)
    this.el.wepname.textContent = d.name.toUpperCase();
    this.el.wepname.style.color = 'var(--gold)';
    if (d.class === 'tool') { // flashlight / binoculars / буссоль: no ammo
      if (d.shape === 'bussole') { this.el.wepclass.textContent = 'буссоль · RMB: азимут'; this.el.ammonum.innerHTML = `<span style="font-size:20px">${icon('compass')} 60-00</span>`; }
      else if (d.zoom) { this.el.wepclass.textContent = 'optics · RMB to zoom'; this.el.ammonum.innerHTML = `<span style="font-size:20px">${icon('binoculars')} 6×</span>`; }
      else { const on = this.game.dayNight && this.game.dayNight.flashOn; this.el.wepclass.textContent = 'tool · E: toggle beam'; this.el.ammonum.innerHTML = `<span style="font-size:20px">${icon('flashlight')} ${on ? 'ON' : 'off'}</span>`; }
      if (this.el.molotov) this.el.molotov.innerHTML = '';
      return;
    }
    // (builder HUD branch removed — fortification material is carried as inventory items)
    const slot = w.ownedOrder().indexOf(key) + 1;
    const mode = d.melee ? '' : (d.auto ? (w.semi[key] ? ' · SEMI' : ' · AUTO') : ' · SEMI');
    this.el.wepclass.textContent = `${d.class}${slot ? ' · slot ' + slot : ''}${mode}`;
    if (d.melee) this.el.ammonum.innerHTML = `<span style="font-size:22px">MELEE</span>`;
    else {
      const res = w.reserve[key] === Infinity ? '∞' : w.reserve[key]; this.el.ammonum.innerHTML = `${w.mag[key]}<span class="res"> / ${res}</span>${w.reloading > 0 ? ' ⟳' : ''}`;
      // low-ammo telegraph: tint the mag count red at ≤25%, with a soft click the moment it crosses (firing the SAME gun
      // down — not a weapon switch, where the key changes, nor a reload, which refills above the threshold and re-arms it)
      const low = w.reloading <= 0 && (d.mag || 0) > 0 && w.mag[key] / d.mag <= 0.25;
      if (low) this.el.ammonum.classList.add('low');
      if (low && !this._lowAmmo && this._lowAmmoKey === key && this.game.audio) this.game.audio.uiClick();
      this._lowAmmo = low; this._lowAmmoKey = key;
    }
    if (this.el.molotov) { const mc = this.game.inventory ? this.game.inventory.count('molotov') : 0; this.el.molotov.innerHTML = mc > 0 ? `${icon('molotov')} ×${mc}` : ''; }
  }
  setMountedGun(ammo = 0, maxAmmo = 250, label = '.50 CAL M2HB') { // shown in the weapon slot while manning a fixed heavy MG
    this.el.wepname.textContent = label; this.el.wepname.style.color = 'var(--gold)';
    this.el.wepclass.textContent = 'mounted · overheats · E: dismount';
    this.el.ammonum.innerHTML = `${Math.max(0, Math.round(ammo))}<span class="res"> / ${maxAmmo}</span>`;
    if (this.el.molotov) this.el.molotov.innerHTML = '';
  }
  // 82-ПМ-37 indirect-fire dial panel — elevation°→range, угломер mils, mines, loading.
  setMortar({ elevDeg, range, mils, ammo, max, loading }) {
    if (!this.el.mortarpanel) return;
    this.el.mortarpanel.classList.add('show');
    this.el.mortarpanel.classList.toggle('loading', !!loading);
    this.el.mElev.textContent = `${elevDeg}°`;
    this.el.mRange.textContent = `${range} m`;
    this.el.mMils.textContent = mils;
    this.el.mAmmo.textContent = `${ammo}/${max}`;
    // also drive the weapon slot so it reads as a manned station (E to dismount)
    this.el.wepname.textContent = '82-PM-37'; this.el.wepname.style.color = 'var(--gold)';
    this.el.wepclass.textContent = 'indirect · W/S range · A/D bearing · E exit';
    this.el.ammonum.innerHTML = `${ammo}<span class="res"> / ${max}</span>`;
  }
  hideMortar() { if (this.el.mortarpanel) this.el.mortarpanel.classList.remove('show', 'loading'); }
  // spotter's last firing-solution call (auto-fades)
  setSpotCall(text) { if (!this.el.spotcall) return; this.el.spotcall.textContent = text; this.el.spotcall.classList.add('show'); this._spotT = 6; }
  setHeldItem(def, slot) {
    if (!def) return;
    this.el.wepname.textContent = (def.name || '').toUpperCase(); this.el.wepname.style.color = 'var(--gold)';
    const hint = def.class === 'throwable' ? 'hold LMB to throw' : def.class === 'material' ? 'LMB to build' : 'LMB to use';
    this.el.wepclass.textContent = def.class + ' · ' + hint;
    this.el.ammonum.innerHTML = `<span style="font-size:22px">${this._itemIcon(slot && slot.kind)}</span>`;
    if (this.el.molotov) this.el.molotov.innerHTML = '';
  }
  refreshHotbar(inv) {
    const el = this.el.hotbar; if (!el) return;
    const order = inv.scrollOrder(), sel = inv._curIndexInOrder();
    let html = '';
    for (let i = 0; i < order.length; i++) {
      const o = order[i]; let badge = '', cls = 'hb-slot';
      const glyph = this._itemIcon(o.kind);
      if (WEAPONS[o.kind]) {
        const d = WEAPONS[o.kind];
        if (!d.melee && d.class !== 'tool' && inv.game.weapons.mag[o.kind] != null) badge = String(inv.game.weapons.mag[o.kind]);
      }
      if (i === sel) cls += ' hb-sel';
      html += `<div class="${cls}"><span class="hb-ico">${glyph}</span>${badge ? `<span class="hb-badge">${badge}</span>` : ''}</div>`;
    }
    el.innerHTML = html;
  }
  openInventory(inv) { this._renderInventory(inv); const el = document.getElementById('inventory'); if (el) el.classList.add('show'); }
  closeInventory() { const el = document.getElementById('inventory'); if (el) el.classList.remove('show'); }
  _itemIcon(kind) {
    if (WEAPONS[kind]) {
      const d = WEAPONS[kind];
      if (d.melee) return icon(KEY_ICON[kind] || 'knife');
      if (d.class === 'tool') return icon(d.zoom ? 'binoculars' : 'flashlight');
      return icon(WEAPON_ICON[d.class] || 'rifle');
    }
    return icon(ITEM_ICON[kind] || 'crate');
  }
  _renderInventory(inv) {
    const grid = document.getElementById('inv-grid'); if (!grid) return;
    let html = '';
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (s) {
        const name = WEAPONS[s.kind] ? WEAPONS[s.kind].name : ((ITEM_DEFS[s.kind] || {}).name || s.kind);
        html += `<div class="inv-slot filled" draggable="true" data-slot="${i}"><div class="inv-ico">${this._itemIcon(s.kind)}</div><div class="inv-snm">${mpEscape(name)}</div></div>`;
      } else html += `<div class="inv-slot empty" data-slot="${i}"></div>`;
    }
    grid.innerHTML = html;
    const cnt = document.getElementById('inv-count'); if (cnt) cnt.textContent = inv.slots.filter(Boolean).length + '/' + inv.slots.length;
    // drag to reorder (drop onto a slot); drag OUT of the grid (drop anywhere else) to discard the item
    let dragFrom = null, handled = false;
    grid.querySelectorAll('.inv-slot').forEach((el) => {
      const idx = parseInt(el.dataset.slot, 10);
      el.addEventListener('dragover', (e) => e.preventDefault());
      el.addEventListener('drop', (e) => { e.preventDefault(); if (dragFrom != null && !isNaN(idx)) { inv.moveSlot(dragFrom, idx); handled = true; this._renderInventory(inv); } });
      if (el.classList.contains('filled')) {
        el.addEventListener('dragstart', () => { dragFrom = idx; handled = false; });
        el.addEventListener('dragend', () => { if (!handled && dragFrom != null) { inv.dropSlot(dragFrom); this._renderInventory(inv); } dragFrom = null; });
      }
    });
  }
  setMoney(m) { this.el.money.textContent = '$' + m; }
  setRadios(n) { if (this.el.radios) this.el.radios.innerHTML = n > 0 ? `${icon('radio')} ${n}` : ''; }
  setWaveTag(tags) {
    const el = this.el.wavetag; if (!el) return;
    if (!tags || !tags.length) { el.classList.remove('show'); el.innerHTML = ''; return; }
    el.innerHTML = tags.map((t) => `<span class="wt${t.mod ? ' mod' : ''}">${t.t}</span>`).join('');
    el.classList.add('show');
  }
  clearWaveTag() { const el = this.el.wavetag; if (el) { el.classList.remove('show'); el.innerHTML = ''; } }
  setNightMode(on) {
    if (this.el.clock) this.el.clock.classList.toggle('show', on);
    if (this.el.nightgear) this.el.nightgear.classList.toggle('show', on);
    if (on) this.setNightGear(this.game);
  }
  setClock(info, wc) {
    if (!this.el.clock) return;
    const glyph = info.blood ? icon('blood') : (info.night ? icon('moon') : icon('sun'));
    const label = info.blood ? 'BLOOD MOON' : (info.night ? 'NIGHT ' + info.n : 'DAY');
    this.el.clock.innerHTML = `${glyph} ${formatHHMM(wc.minuteOfDay())} <b>·</b> ${label}`;
  }
  setNightGear(g) {
    if (!this.el.nightgear) return;
    const w = g.weapons;
    const fl = w.owns('flashlight'); this.el.nightgear.innerHTML = `<span class="ng${fl ? ' on' : ' off'}">${icon('flashlight')} ${fl ? (g.dayNight.flashOn ? 'ON' : 'off') : '—'}</span><span class="ng">${icon('flare')} ×${w.flares}</span>`;
  }
  setScore(s) { this.el.score.textContent = s; }
  setWave(n) { this.el.wave.textContent = 'WAVE ' + n; }
  setEnemiesLeft(n) { this.el.left.textContent = n > 0 ? '· ' + n + ' left' : ''; }
  setScope(on, shape = '') {
    const bino = !!on && shape === 'binoculars';  // binoculars: twin-circle mask, no reticle
    const lpr = !!on && shape === 'lpr1';         // ЛПР-1: vizír mil reticle + indicator inset (1:1 per Рис. 5.4 / slide-9)
    this.el.scope.classList.toggle('show', !!on && !bino && !lpr); // rifle scope: single circle + crosshair
    if (this.el.binoview) this.el.binoview.classList.toggle('show', bino);
    if (this.el.lprview) this.el.lprview.classList.toggle('show', lpr);
    if (this.el.cross) this.el.cross.style.opacity = (bino || lpr) ? '0' : ''; // hide the crosshair while glassing
  }
  // ЛПР-1 indicator eyepiece state — st = { ready, value } | null. value: null = display dark (no
  // measurement yet), 0 = no echo (00000), N = range in metres. Green лампа готовности gates T.
  setLpr(st) {
    if (!this.el.lprdigits) return;
    if (!st) { this._lprLast = null; return; }      // overlay hidden — nothing to paint
    const key = st.ready + ':' + st.value + ':' + st.night;
    if (this._lprLast === key) return;              // imperative DOM — only write on change
    this._lprLast = key;
    this.el.lprdigits.textContent = st.value == null ? '' : String(Math.min(99999, Math.max(0, st.value))).padStart(5, '0');
    this.el.lprready.classList.toggle('on', !!st.ready);
    if (this.el.lprview) this.el.lprview.classList.toggle('night', !!st.night); // ПОДСВ — сетка lamp after dark
  }
  // буссоль ПАБ-2А readout. state = { mils, x, z } while raised, or null to tear the overlay down.
  // Writes are gated on change (imperative DOM, like setLpr/nightpost._readout) — the digital
  // угломер + rose rotation only repaint when the bearing crosses a whole mil. Datum = bearing.js.
  setCompass(state) {
    if (!this.el.compassview) return;
    const on = !!state;
    this.el.compassview.classList.toggle('show', on);
    if (this.el.cross) this.el.cross.style.opacity = on ? '0' : '';
    if (!on) { this._compassMils = -1; return; }
    const m = Math.round(state.mils);
    if (m !== this._compassMils) {
      this._compassMils = m;
      this.el.compassmils.textContent = formatUglomer(m);
      // card spins opposite the heading so the live bearing sits under the fixed lubber line
      this.el.compassrose.style.transform = `rotate(${-m / 6000 * 360}deg)`;
    }
    this.el.compasscoords.textContent = `X ${Math.round(state.x)}  Z ${Math.round(state.z)}`;
  }
  setBoss(frac, name) { this.el.bossbar.classList.add('show'); this.el.bossfill.style.width = clamp(frac, 0, 1) * 100 + '%'; if (name) this.el.bossname.textContent = name; }
  setBossPip(frac) {
    const el = this.el.bosspip; if (!el) return;
    if (frac < 0) { el.classList.remove('show'); if (this.el.bossbar) this.el.bossbar.classList.remove('exposed'); }
    else { el.classList.add('show'); if (this.el.bossbar) this.el.bossbar.classList.add('exposed'); el.style.width = (clamp(frac, 0, 1) * 100) + '%'; }
  }
  hideBoss() { this.el.bossbar.classList.remove('show'); }
  setBleed(frac) { if (!this.el.bleedbar) return; if (frac < 0) this.el.bleedbar.classList.remove('show'); else { this.el.bleedbar.classList.add('show'); this.el.bleedfill.style.width = (clamp(frac, 0, 1) * 100) + '%'; } }
  setHeat(frac, over) { this.el.heatbar.classList.add('show'); this.el.heatfill.style.width = clamp(frac, 0, 1) * 100 + '%'; this.el.heatbar.classList.toggle('over', !!over); this.el.heatlabel.textContent = over ? 'OVERHEATED — COOLING' : 'BARREL HEAT'; }
  hideHeat() { this.el.heatbar.classList.remove('show'); }
  hitmarker(kill) { const h = this.el.hitmarker; h.classList.remove('boss'); h.classList.toggle('kill', !!kill); h.style.transition = 'none'; h.style.opacity = '1'; this._hitT = 0.12; }
  // Effective hit on boss Tolo (bullseye-in-window / bazooka): yellow hitmarker + a brief yellow crosshair tint.
  bossHitCue() {
    const h = this.el.hitmarker; h.classList.remove('kill'); h.classList.add('boss'); h.style.transition = 'none'; h.style.opacity = '1'; this._hitT = 0.18;
    const c = this.el.cross; if (c) { c.classList.add('boss-hit'); clearTimeout(this._crossT); this._crossT = setTimeout(() => c.classList.remove('boss-hit'), 180); }
  }
  damageFlash() { this.el.vignette.style.transition = 'box-shadow .05s'; this.el.vignette.style.boxShadow = 'inset 0 0 220px 60px rgba(220,30,20,0.55)'; setTimeout(() => { this.el.vignette.style.transition = 'box-shadow .4s'; this.setHealth(this.game.player.hp, this.game.player.maxHp); }, 60); }
  // overpressure "punch" — a brief dusty-white vignette flash when a heavy blast (e.g. the mortar) goes off near you
  concussion(s = 1) { if (!this.el.vignette) return; const a = (0.28 * clamp(s, 0, 1)).toFixed(3); this.el.vignette.style.transition = 'box-shadow .04s'; this.el.vignette.style.boxShadow = `inset 0 0 240px 80px rgba(235,225,200,${a})`; setTimeout(() => { this.el.vignette.style.transition = 'box-shadow .35s'; this.setHealth(this.game.player.hp, this.game.player.maxHp); }, 70); }
  setBurn(burnT) {
    if (!this.el.firevig) return;
    if (burnT <= 0) { this.el.firevig.style.boxShadow = 'inset 0 0 220px 80px rgba(255,90,20,0)'; if (this.el.firepov) this.el.firepov.classList.remove('on'); return; }
    const it = clamp(burnT / PLAYER_BURN_DUR, 0, 1), flick = 0.6 + Math.sin(performance.now() * 0.02) * 0.2;
    this.el.firevig.style.boxShadow = `inset 0 0 220px 80px rgba(255,90,20,${(0.45 * it * flick).toFixed(3)})`;
    if (this.el.firepov) this.el.firepov.classList.add('on');
  }
  bigMessage(text, sub = '') { this.el.msg.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); this.el.msg.classList.add('show'); this._msgT = 2.2; }
  kill(name) { const d = document.createElement('div'); d.innerHTML = `${icon('skull')} ${mpEscape(name)}`; this.el.killfeed.appendChild(d); setTimeout(() => d.remove(), 2400); }
  toast(text, color = 0xffffff, tag = '') {
    const d = document.createElement('div');
    const hex = '#' + color.toString(16).padStart(6, '0');
    d.innerHTML = tag ? `${text} <span class="tag" style="background:${hex};color:#1a1206">${tag}</span>` : text;
    d.style.borderColor = hex;
    this.el.toast.appendChild(d); setTimeout(() => d.remove(), 3000);
  }
  setInteract(text) { if (text) { this.el.interact.innerHTML = text; this.el.interact.classList.add('show'); } else this.el.interact.classList.remove('show'); }
  update(dt) {
    // crosshair bloom/movement reactivity: drive the arm gap from the weapon's bloom + player speed + recent fire
    // (the #cross arms already CSS-transition .05s, so this reads as a smooth bloom). Static crosshair → legible spread.
    if (this.el.cross) {
      const w = this.game.weapons, p = this.game.player;
      const spd = p && p.vel ? Math.hypot(p.vel.x, p.vel.z) : 0;
      const gap = 3.2 + (w ? w.bloom * 130 : 0) + Math.min(spd, 8) * 0.6 + (w && w.cooldown > 0 ? 3 : 0);
      this.el.cross.style.setProperty('--cross-gap', gap.toFixed(1) + 'px');
    }
    if (this._hitT > 0) { this._hitT -= dt; if (this._hitT <= 0) { this.el.hitmarker.style.transition = 'opacity .25s'; this.el.hitmarker.style.opacity = '0'; this.el.hitmarker.classList.remove('boss'); } }
    if (this._msgT > 0) { this._msgT -= dt; if (this._msgT <= 0) this.el.msg.classList.remove('show'); }
    if (this._spotT > 0) { this._spotT -= dt; if (this._spotT <= 0 && this.el.spotcall) this.el.spotcall.classList.remove('show'); }
  }
}

export class UI {
  constructor() {
    this.overlays = {
      menu: document.getElementById('menu'), play: document.getElementById('play'),
      pause: document.getElementById('pause'),
      shop: document.getElementById('shop'), gameover: document.getElementById('gameover'),
      settings: document.getElementById('settings'), lobby: document.getElementById('lobby'),
      admin: document.getElementById('admin'), music: document.getElementById('music'),
      crate: document.getElementById('crateOverlay'),
      poker: document.getElementById('poker'),
    };
    this.hint = document.getElementById('hint');
  }
  hideAll() { for (const k in this.overlays) this.overlays[k] && this.overlays[k].classList.remove('show'); }
  show(name) { this.hideAll(); if (this.overlays[name]) this.overlays[name].classList.add('show'); }
}

// ---------------------------------------------------------------------------
// Settings — persisted (localStorage) options, applied live.
// ---------------------------------------------------------------------------
// Bumped when graphics-knob DEFAULTS change in a way existing saves should pick up (see load() migration).
const SETTINGS_VER = 1;
// adaptiveRes + bloom default OFF: on high-refresh (144 Hz) displays the 60 fps-targeted adaptive resolution
// churns the render-target size (stutter) and renders sub-native (blur), and bloom softens the crisp voxel look.
// Both stay toggleable in Settings; the High/Medium presets can still switch bloom back on.
const SETTINGS_DEFAULTS = { sens: 0.0022, sfx: 0.8, music: 0.5, fov: 80, nick: 'Player', pokerOdds: 1, gfxPreset: 'High', adaptiveRes: 0, shadowQ: 2048, drawDist: 0, renderScale: 1, aa: 0, showFps: 0, bloom: 0, exposure: 1.05, dmgNumbers: 1, setVer: SETTINGS_VER };

export class Settings {
  constructor(game) {
    this.game = game;
    this.data = { ...SETTINGS_DEFAULTS };
    this.returnTo = 'menu';
    this.load(); this._wire(); this.apply();
  }
  load() { try { const s = JSON.parse(localStorage.getItem('engendros_settings') || '{}'); for (const k in this.data) if (typeof s[k] === 'number') this.data[k] = s[k]; if (typeof s.nick === 'string' && s.nick.trim()) this.data.nick = s.nick.trim().slice(0, 14); if (typeof s.gfxPreset === 'string') this.data.gfxPreset = s.gfxPreset; if (s.setVer !== SETTINGS_VER) { this.data.adaptiveRes = SETTINGS_DEFAULTS.adaptiveRes; this.data.bloom = SETTINGS_DEFAULTS.bloom; this.data.renderScale = SETTINGS_DEFAULTS.renderScale; this.data.setVer = SETTINGS_VER; this.save(); } } catch (e) {} }
  save() { try { localStorage.setItem('engendros_settings', JSON.stringify(this.data)); } catch (e) {} }
  apply() {
    if (this.game.player) { this.game.player.sens = this.data.sens; this.game.player.nick = this.data.nick; }
    this.game.audio.setVolume(this.data.sfx);
    this.game.audio.setMusicVolume(this.data.music);
    this.game.engine.setFov(this.data.fov);
    const e = this.game.engine;
    if (e.setShadowQuality) e.setShadowQuality(this.data.shadowQ);
    if (e.setAdaptive) e.setAdaptive(!!this.data.adaptiveRes);
    if (e.setRenderScale && !this.data.adaptiveRes) e.setRenderScale(this.data.renderScale); // manual: honor preset scale
    if (e.setBloom) e.setBloom(!!this.data.bloom);
    if (e.setExposure) e.setExposure(this.data.exposure);
    this.game._drawDist = this.data.drawDist | 0;
    this.game._showFps = !!this.data.showFps;
    if (!this.data.showFps) { const f = document.getElementById('fps'); if (f) f.style.display = 'none'; }
    const mpName = document.getElementById('mp-name'); if (mpName && !mpName.value) mpName.value = this.data.nick; // pre-fill the co-op lobby name
    this._refresh();
  }
  _refresh() {
    const txt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const val = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    txt('s-sens-v', Math.round(this.data.sens / SETTINGS_DEFAULTS.sens * 100) + '%');
    txt('s-sfx-v', Math.round(this.data.sfx * 100) + '%');
    txt('s-music-v', Math.round(this.data.music * 100) + '%');
    txt('s-fov-v', this.data.fov + '°');
    txt('s-exposure-v', this.data.exposure.toFixed(2));
    val('s-sens', this.data.sens); val('s-sfx', this.data.sfx); val('s-music', this.data.music);
    val('s-fov', this.data.fov);
    val('s-exposure', this.data.exposure);
    val('s-nick', this.data.nick);
    const po = document.getElementById('s-pokerodds'); if (po) { po.textContent = this.data.pokerOdds ? 'ON' : 'OFF'; po.style.color = this.data.pokerOdds ? 'var(--neon, #45e0cf)' : '#888'; }
    const setTog = (id, on, onTxt, offTxt) => { const el = document.getElementById(id); if (el) { el.textContent = on ? (onTxt || 'ON') : (offTxt || 'OFF'); el.style.color = on ? 'var(--neon,#45e0cf)' : '#888'; } };
    const gpv = document.getElementById('s-gfx'); if (gpv) gpv.textContent = String(this.data.gfxPreset).toUpperCase();
    setTog('s-adapt', this.data.adaptiveRes); setTog('s-showfps', this.data.showFps); setTog('s-aa', this.data.aa, 'ON (reload)', 'OFF');
    setTog('s-bloom', this.data.bloom); setTog('s-dmgnum', this.data.dmgNumbers);
  }
  _wire() {
    const bind = (id, key) => { const e = document.getElementById(id); if (!e) return; e.addEventListener('input', () => { this.data[key] = parseFloat(e.value); this.apply(); this.save(); }); };
    bind('s-sens', 'sens'); bind('s-sfx', 'sfx'); bind('s-music', 'music'); bind('s-fov', 'fov'); bind('s-exposure', 'exposure');
    const nickEl = document.getElementById('s-nick'); if (nickEl) nickEl.addEventListener('input', () => { this.data.nick = (nickEl.value || 'Player').slice(0, 14); this.apply(); this.save(); }); // text field, not parseFloat
    const po = document.getElementById('s-pokerodds'); if (po) po.addEventListener('click', () => { this.data.pokerOdds = this.data.pokerOdds ? 0 : 1; this.save(); this._refresh(); }); // poker outs/% helper toggle
    const presets = ['Low', 'Medium', 'High'];
    const gp = document.getElementById('s-gfx'); if (gp) gp.addEventListener('click', () => {
      const i = (presets.indexOf(this.data.gfxPreset) + 1) % presets.length; this.data.gfxPreset = presets[i];
      const c = presetConfig(this.data.gfxPreset); this.data.shadowQ = c.shadowQ; this.data.drawDist = c.drawDist; this.data.renderScale = c.renderScale; this.data.aa = c.aa; this.data.bloom = c.bloom;
      this.apply(); this.save(); this._refresh();
    });
    const ar = document.getElementById('s-adapt'); if (ar) ar.addEventListener('click', () => { this.data.adaptiveRes = this.data.adaptiveRes ? 0 : 1; this.apply(); this.save(); this._refresh(); });
    const sfps = document.getElementById('s-showfps'); if (sfps) sfps.addEventListener('click', () => { this.data.showFps = this.data.showFps ? 0 : 1; this.apply(); this.save(); this._refresh(); });
    const dn = document.getElementById('s-dmgnum'); if (dn) dn.addEventListener('click', () => { this.data.dmgNumbers = this.data.dmgNumbers ? 0 : 1; this.save(); this._refresh(); }); // floating damage numbers toggle
    const aaEl = document.getElementById('s-aa'); if (aaEl) aaEl.addEventListener('click', () => { this.data.aa = this.data.aa ? 0 : 1; this.save(); this._refresh(); }); // MSAA applies on reload
    const bl = document.getElementById('s-bloom'); if (bl) bl.addEventListener('click', () => { this.data.bloom = this.data.bloom ? 0 : 1; this.apply(); this.save(); this._refresh(); });
    const fs = document.getElementById('s-fullscreen'); if (fs) fs.addEventListener('click', () => this.game.toggleFullscreen());
    const back = document.getElementById('s-back'); if (back) back.addEventListener('click', () => this.close());
  }
  open(from) { this.returnTo = from || 'menu'; this._refresh(); this.game.ui.show('settings'); }
  close() { this.game.ui.show(this.returnTo); }
}

// ---------------------------------------------------------------------------
// WeaponPreview — a small second renderer showing a rotating 3D model of the
// weapon the player is hovering in the shop.
// ---------------------------------------------------------------------------
export class WeaponPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x55606e, 1.15));
    const d1 = new THREE.DirectionalLight(0xfff1d0, 1.7); d1.position.set(3, 5, 4); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x90b0ff, 0.5); d2.position.set(-4, -1, -3); this.scene.add(d2);
    this.cam = new THREE.PerspectiveCamera(32, 1.7, 0.01, 100);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.spin = 0.6; this.cur = null; this.dist = 2;
    this.setSize();
  }
  setSize() {
    const w = this.canvas.clientWidth || 360, h = this.canvas.clientHeight || 200;
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  // Dispose every holder child by TRAVERSE — viewmodels are flat but the crate preview is a nested
  // modelgen Group, so a shallow pop-dispose would leak its nested geometries/materials.
  _clearHolder() {
    while (this.holder.children.length) {
      const c = this.holder.children.pop();
      c.traverse && c.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => m.dispose && m.dispose()); });
    }
  }
  show(key) {
    if (this.cur === key) return; this.cur = key;
    this._clearHolder();
    const m = buildViewmodel(WEAPONS[key]); m.material.depthTest = true; m.renderOrder = 0; this.holder.add(m);
    const sm = WEAPONS[key].spinMag; if (sm) { const mag = buildMag(sm); mag.material.depthTest = true; mag.renderOrder = 0; mag.position.set(sm.x, sm.y, sm.z); this.holder.add(mag); }
    const box = new THREE.Box3().setFromObject(this.holder);
    const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    for (const c of this.holder.children) c.position.sub(ctr);
    this.dist = Math.max(size.x, size.y, size.z) * 1.7 + 0.35;
    this.spin = 0.6;
  }
  hide() { this._clearHolder(); this.cur = null; } // clear the model (gadgets with no 3D viewmodel)
  // Show any Object3D (not a WEAPONS key) — e.g. the crate preview (a nested modelgen Group).
  showObject(obj) {
    this.cur = null;
    this._clearHolder();
    if (!obj) return;
    this.holder.add(obj);
    const box = new THREE.Box3().setFromObject(this.holder);
    const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    for (const c of this.holder.children) c.position.sub(ctr);
    this.dist = Math.max(size.x, size.y, size.z) * 1.7 + 0.35; this.spin = 0.6;
  }
  render(dt) {
    this.spin += dt * 0.7; this.holder.rotation.y = this.spin;
    const d = this.dist;
    this.cam.position.set(d * 0.55, d * 0.42, d * 0.8); this.cam.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.cam);
  }
}
