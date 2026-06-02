// inventory.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { MeshBuilder, rr, voxelMaterial } from './util.js?u=3';
import { buildFlare, buildFieldRadio } from './props.js';
import { WEAPONS, WEAPON_ORDER, buildViewmodel } from './weapons.js';
import { ITEM_DEFS } from './loot.js';
import { WEAPON_LAYER } from './engine.js?e=2';


// ---------------------------------------------------------------------------
// Shop (DOM) — weapons / items tabs. Perks removed by design: hardcore survival,
// no stat-creep upgrades — you live on weapons, ammo, heals and your aim.
// ---------------------------------------------------------------------------
// (SHOP_ITEMS removed — the lobby Shop/Armory replaces the between-wave shop; consumables are scavenged in-run.)

// Typed loadout slots + the gadget catalogue (molotov/grenade are virtual; tools/builders live in WEAPONS).
const ARMORY_SLOTS = [
  { id: 'primary',   label: 'Primary',   classes: ['rifle', 'smg', 'shotgun', 'sniper', 'launcher'] },
  { id: 'secondary', label: 'Secondary', classes: ['pistol'] },
  { id: 'melee',     label: 'Melee',     classes: ['melee'] },
  { id: 'gadget1',   label: 'Gadget 1',  classes: null },
  { id: 'gadget2',   label: 'Gadget 2',  classes: null },
];
export const GADGETS = [
  { key: 'grenade',    name: 'Frag Grenades', price: 400, desc: 'Hold in hand · hold LMB to cook, release to throw. Deploy with 2; scavenge more.' },
  { key: 'molotov',    name: 'Molotov',       price: 350, desc: 'Hold in hand · hold LMB to light, then throw a fire pool. Deploy with 1; scavenge more.' },
  { key: 'flashlight', name: 'Flashlight',    price: 600, desc: 'Hold it out — the beam lights the dark while held.' },
  { key: 'binoculars', name: 'Binoculars 8×', price: 450, desc: 'Hold RMB to glass the horizon at 8×.' },
];

// The lobby/menu SHOP: spend the persistent bank to permanently unlock gear, then build the 5-slot loadout.
// (Class kept named "Shop" so existing `this.shop` references stay valid.)
export class Shop {
  constructor(game) {
    this.game = game;
    this.grid = document.getElementById('shopGrid');
    this.tabsEl = document.getElementById('shopTabs');
    this.bankEl = document.getElementById('bankAmt');
    this.stripEl = document.getElementById('loadoutStrip');
    this.tab = 'primary';
    this.returnTo = 'menu';
    this._buildTabs();
  }
  _buildTabs() {
    this.tabsEl.innerHTML = '';
    for (const s of ARMORY_SLOTS) {
      const t = document.createElement('div'); t.className = 'tab' + (s.id === this.tab ? ' on' : ''); t.dataset.tab = s.id; t.textContent = s.label;
      t.addEventListener('click', () => { this.tab = s.id; this._render(); });
      t.addEventListener('mouseenter', () => this.game.audio.uiHover());
      this.tabsEl.appendChild(t);
    }
  }
  open(returnTo) {
    this.returnTo = returnTo || 'menu';
    this.game.state = 'shop';
    this._render(); this.game.ui.show('shop');
    if (this.game.preview) this.game.preview.setSize();
  }
  _meta() { return this.game.meta; }
  _slotList(slot) {
    if (slot === 'gadget1' || slot === 'gadget2') return GADGETS.map((gd) => ({ key: gd.key, name: gd.name, price: gd.price, desc: gd.desc, pk: WEAPONS[gd.key] ? gd.key : null }));
    const classes = ARMORY_SLOTS.find((s) => s.id === slot).classes;
    return WEAPON_ORDER.filter((k) => WEAPONS[k] && classes.includes(WEAPONS[k].class))
      .map((k) => ({ key: k, name: WEAPONS[k].name, price: WEAPONS[k].price || 0, desc: WEAPONS[k].class, pk: k }));
  }
  _render() {
    const g = this.game, m = this._meta();
    if (this.bankEl) this.bankEl.textContent = '$' + m.bank;
    for (const t of this.tabsEl.children) t.classList.toggle('on', t.dataset.tab === this.tab);
    this.grid.innerHTML = '';
    const slot = this.tab, list = this._slotList(slot);
    const nameEl = document.getElementById('previewName');
    const cards = [];
    const preview = (pk, el) => { if (pk && g.preview) { g.preview.show(pk); if (nameEl) nameEl.textContent = WEAPONS[pk].name; } for (const c of cards) c.classList.toggle('previewing', c === el); };
    let firstPk = null, firstEl = null;
    for (const it of list) {
      const el = this._card(it, this._meta().unlocked.includes(it.key), m.loadout[slot] === it.key, slot);
      cards.push(el);
      if (it.pk) { el.addEventListener('mouseenter', () => preview(it.pk, el)); el.addEventListener('click', () => preview(it.pk, el)); if (!firstPk) { firstPk = it.pk; firstEl = el; } }
    }
    const pw = document.getElementById('previewWrap'); if (pw) pw.style.display = firstPk ? 'block' : 'none';
    if (firstPk) preview(firstPk, firstEl);
    this._renderStrip();
  }
  _card(it, unlocked, equipped, slot) {
    const g = this.game, m = this._meta();
    const el = document.createElement('div'); el.className = 'item' + (equipped ? ' equipped' : (unlocked ? ' owned' : ''));
    const canSell = unlocked && !(slot === 'melee' && it.key === 'knife'); // the knife is free + un-sellable (always a melee)
    let costHtml, btns = '';
    if (!unlocked) {
      const afford = m.bank >= it.price;
      costHtml = '$' + it.price;
      btns = `<button class="buy" data-act="unlock" ${afford ? '' : 'disabled'}>UNLOCK</button>`;
    } else if (equipped) {
      costHtml = '✓ equipped';
      if (canSell) btns = `<button class="buy sell" data-act="sell">SELL</button>`;
    } else {
      costHtml = 'owned';
      btns = `<button class="buy" data-act="equip">EQUIP</button>` + (canSell ? ` <button class="buy sell" data-act="sell">SELL</button>` : '');
    }
    el.innerHTML = `<div class="nm">${it.name}</div><div class="ds">${it.desc || ''}</div>
      <div class="row"><span class="cost">${costHtml}</span><span class="acts">${btns}</span></div>`;
    el.querySelectorAll('.buy').forEach((btn) => {
      btn.addEventListener('mouseenter', () => g.audio.uiHover());
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._action(btn.dataset.act, it, slot); });
    });
    this.grid.appendChild(el);
    return el;
  }
  _action(act, it, slot) {
    const g = this.game, m = this._meta();
    if (act === 'unlock') {
      if (m.bank < it.price) { g.audio.noMoney(); return; }
      m.bank -= it.price; if (!m.unlocked.includes(it.key)) m.unlocked.push(it.key);
      m.loadout[slot] = it.key; // auto-equip on unlock for convenience
      g.audio.buy();
    } else if (act === 'equip') {
      m.loadout[slot] = it.key; g.audio.uiClick();
    } else if (act === 'sell') {
      if (slot === 'melee' && it.key === 'knife') return;
      m.bank += Math.round((it.price || 0) * 0.6); // 60% refund
      m.unlocked = m.unlocked.filter((k) => k !== it.key);
      if (m.loadout[slot] === it.key) m.loadout[slot] = (slot === 'melee' ? 'knife' : null); // unequip (melee falls back to knife)
      g.audio.buy();
    }
    // a gadget can occupy only one of the two gadget slots — clear it from the other
    if ((slot === 'gadget1' || slot === 'gadget2') && (act === 'unlock' || act === 'equip')) {
      const other = slot === 'gadget1' ? 'gadget2' : 'gadget1';
      if (m.loadout[other] === it.key) m.loadout[other] = null;
    }
    g._saveMeta();
    this._render();
  }
  _renderStrip() {
    if (!this.stripEl) return;
    const m = this._meta();
    const nm = (k) => !k ? '— empty —' : (WEAPONS[k] ? WEAPONS[k].name : ((GADGETS.find((x) => x.key === k) || {}).name || k));
    this.stripEl.innerHTML = ARMORY_SLOTS.map((s) => `<div class="lo-slot${m.loadout[s.id] ? ' on' : ''}"><span class="lo-lbl">${s.label}</span><span class="lo-nm">${nm(m.loadout[s.id])}</span></div>`).join('');
  }
}

// ---------------------------------------------------------------------------
// Inventory — survival backpack + the unified "everything is a held item" model.
// Owns the flat 15-slot inventory (SLOT_CAP) — deployed gear + scavenged loot share equal slots — plus the molotov/grenade throw state.
// scrollOrder() = the filled slots in order — the wheel
// traverses this single list; LMB uses whatever is held.
// ---------------------------------------------------------------------------
const SLOT_CAP = 15; // ONE flat, uniform inventory — deployed gear + scavenged loot share these equal slots
export class Inventory {
  constructor(game) {
    this.game = game;
    this.slots = new Array(SLOT_CAP).fill(null); // null | { kind, value } — kind is a WEAPONS key OR an ITEM_DEFS kind
    this._activeSlot = -1;     // index of the slot currently held in hand
    this._wheelIdx = 0;        // index into scrollOrder()
    this.itemModels = {};      // held viewmodels for ITEM_DEFS kinds (weapons reuse weapons.models)
    this._hotbarDirty = true; this._lastHotbarIdx = -1;
    this._buildItemModels();
  }
  reset() { this.slots.fill(null); this._activeSlot = -1; this._wheelIdx = 0; this._hideAllItemModels(); this._hotbarDirty = true; this._lastHotbarIdx = -1; }
  firstFreeSlot() { return this.slots.findIndex((s) => s === null); }
  isFull() { return this.firstFreeSlot() < 0; }
  count(kind) { return this.slots.reduce((n, s) => n + (s && s.kind === kind ? 1 : 0), 0); }
  addItem(kind, value) { const i = this.firstFreeSlot(); if (i < 0) return false; this.slots[i] = { kind, value: (value == null ? 1 : value) }; this.refreshHotbar(); return true; }
  // back-compat alias (older call sites): scavenged/granted things go into the flat inventory
  addToBackpack(kind, value) { return this.addItem(kind, value); }
  scrollOrder() { const out = []; for (let i = 0; i < this.slots.length; i++) if (this.slots[i]) out.push({ slot: i, kind: this.slots[i].kind }); return out; }
  curItem() { const o = this.scrollOrder(); return o.length ? o[Math.max(0, Math.min(this._wheelIdx, o.length - 1))] : null; }
  _curIndexInOrder() { return this.scrollOrder().findIndex((o) => o.slot === this._activeSlot); }
  heldMaterial() { const c = this.curItem(); return (c && ITEM_DEFS[c.kind] && ITEM_DEFS[c.kind].class === 'material') ? ITEM_DEFS[c.kind].build : null; }
  isHoldingFlashlight() { const c = this.curItem(); return !!(c && c.kind === 'flashlight'); }
  isThrowLocked() { return this.game.weapons.isThrowLocked(); }
  refreshHotbar() { this._hotbarDirty = true; } // flag a rebuild; update() picks it up next frame

  // deploy the meta loadout into the flat inventory at run start (called from WeaponSystem.resetLoadout after the weapons are granted)
  deployLoadout() {
    this.slots.fill(null);
    const w = this.game.weapons, lo = w.loadout;
    for (const s of ['primary', 'secondary', 'melee', 'gadget1', 'gadget2']) {
      const k = lo[s]; if (!k) continue;
      if (WEAPONS[k]) { w.grant(k); this.addItem(k); }                                  // weapon/tool: grant = ammo init, the slot = ownership
      else if (k === 'grenade') { this.addItem('grenade'); this.addItem('grenade'); }   // throwable start-stock
      else if (k === 'molotov') { this.addItem('molotov'); }
    }
    if (!this.slots.some((s) => s && WEAPONS[s.kind] && WEAPONS[s.kind].melee)) { w.grant('knife'); this.addItem('knife'); } // a run always has a melee
    this._activeSlot = -1; this._wheelIdx = 0;
    const o = this.scrollOrder(); if (o.length) this._select(o[0], 0); else this._holdNothing();
    this.refreshHotbar();
  }

  update(dt) {
    const w = this.game.weapons, down = this.game.input.buttons[0];
    // throwables: molotov lit + LMB released -> throw; grenade pin pulled + released -> throw (ignite/fuse tick in WeaponSystem.update)
    if (w.molotovState === 'lit' && !down) this._throwMolotovFromSlot();
    else if (w._grenadeArmed && !down) this._throwGrenadeFromSlot();
    const hud = this.game.hud; if (!hud || !hud.refreshHotbar) return;
    const idx = this._curIndexInOrder();
    if (this._hotbarDirty || idx !== this._lastHotbarIdx) { this._hotbarDirty = false; this._lastHotbarIdx = idx; hud.refreshHotbar(this); }
  }

  // ---- selection: wheel scrolls the flat list; digit jumps to the Nth filled slot; every slot is equal ----
  _select(entry, idx) { this._wheelIdx = idx; this._activateSlot(entry.slot); }
  _activateSlot(slotIdx) {
    const entry = this.slots[slotIdx]; if (!entry) return;
    const w = this.game.weapons, kind = entry.kind;
    this._activeSlot = slotIdx;
    if (WEAPONS[kind]) {
      this._hideAllItemModels(); if (w.molotovModel) w.molotovModel.visible = false;
      if (w.owns(kind)) {
        if (kind !== w.cur) w.select(kind);
        w.cur = kind;
        for (const k in w.models) w.models[k].visible = (k === kind);
        for (const k in w.magMeshes) w.magMeshes[k].visible = (k === kind);
        if (this.game.hud) this.game.hud.setWeapon(w);
      }
    } else {
      for (const k in w.models) w.models[k].visible = false;
      for (const k in w.magMeshes) w.magMeshes[k].visible = false;
      if (w.molotovModel) w.molotovModel.visible = false;
      this._hideAllItemModels();
      const m = this.itemModels[kind]; if (m) m.visible = true;
      if (this.game.hud && this.game.hud.setHeldItem) this.game.hud.setHeldItem(ITEM_DEFS[kind], entry);
    }
  }
  _holdNothing() { const w = this.game.weapons; this._hideAllItemModels(); if (w.molotovModel) w.molotovModel.visible = false; for (const k in w.models) w.models[k].visible = false; for (const k in w.magMeshes) w.magMeshes[k].visible = false; }
  cycleWheel(dir) {
    if (this.isThrowLocked()) return;
    const order = this.scrollOrder(); if (!order.length) return;
    let i = this._curIndexInOrder(); if (i < 0) i = 0;
    i = (i + dir + order.length) % order.length;
    this._select(order[i], i);
  }
  selectSlotN(n) { const o = this.scrollOrder(); if (o[n - 1]) this._select(o[n - 1], n - 1); } // 1-9 -> jump to the Nth filled slot in the wheel
  selectKind(kind) { const o = this.scrollOrder(), i = o.findIndex((e) => e.kind === kind); if (i >= 0) this._select(o[i], i); } // jump to the slot holding a given kind (quick-melee)

  // ---- LMB use, dispatched by the held thing ----
  handleLMB(edge) {
    const c = this.curItem(); if (!c) return;
    if (WEAPONS[c.kind]) { this.game.weapons.tryFire(edge); return; }   // gun/melee/tool (tools no-op in tryFire)
    const def = ITEM_DEFS[c.kind]; if (!def) return;
    if (def.class === 'consumable') { if (edge === 'press') this._useConsumable(c.kind, c.slot); }
    else if (def.class === 'material') { if (edge === 'press') this.game.build.place(); }
    else if (def.class === 'callable') { if (edge === 'press') { if (c.kind === 'airbeacon') this._useRadio(c.slot); else this._throwFlare(c.slot); } }
    else if (def.class === 'throwable') { this._armThrowable(c.kind, c.slot, edge); }
  }
  _useConsumable(kind, slotIdx) {
    const p = this.game.player; if (!this.slots[slotIdx]) return;
    const val = this.slots[slotIdx].value; let used = true;
    if (kind === 'medkit') { if (p.hp >= p.maxHp) { this.game.hud.toast('Already at full HP', 0x7fd06a); used = false; } else { p.hp = Math.min(p.maxHp, p.hp + val); this.game.hud.setHealth(p.hp, p.maxHp); this.game.audio.reloadIn(); this.game.hud.toast('+' + val + ' HP', 0x7fd06a); } }
    else if (kind === 'food') { used = p.eatFood(val); }
    else if (kind === 'armor') { if (p.armor >= p.armorMax) { this.game.hud.toast('Armor full', 0x6fa8e8); used = false; } else { p.armor = Math.min(p.armorMax, p.armor + val); this.game.hud.setArmor(p.armor, p.armorMax); this.game.audio.buy(); this.game.hud.toast('+' + val + ' Armor', 0x6fa8e8); } }
    else if (kind === 'ammo') { this.game.weapons.refillAll(); this.game.audio.reloadClick(); this.game.hud.toast('Ammo refilled', 0xb88a3a); }
    else if (kind === 'splint') {
      if (!p.legBroken) { this.game.hud.toast('Leg is fine -- saved', 0x7fd06a); used = false; }
      else { p.splints = (p.splints || 0) + 1; const t0 = p._splintT; p.applySplint(); used = p._splintT > t0; if (!used) p.splints -= 1; }
    }
    if (used) this._consumeSlot(slotIdx);
  }
  _useRadio(slotIdx) { this.game.loot.requestSupplyDrop(); this.game.audio.buy(); this.game.hud.toast('Supply drop inbound!', 0x6fd0e8); this._consumeSlot(slotIdx); }
  _throwFlare(slotIdx) { this.game.weapons.flares = (this.game.weapons.flares || 0) + 1; this.game.throwFlare(true); this._consumeSlot(slotIdx); }
  // throwables: hold LMB to arm (committed -> can't scroll away), release to throw
  _armThrowable(kind, slotIdx, edge) {
    const w = this.game.weapons;
    if (edge !== 'press' && edge !== 'hold') return;
    if (this.game.player.inTank || this.game.player.mountedGun || this.game._waveBreak > 0) return;
    if (kind === 'molotov') {
      if (w.molotovState || w.molotovCD > 0 || w.reloading > 0) return;
      w.molotovState = 'lighting'; w.molotovLightT = 0; w.molotovFuseT = 0; w._throwSlot = slotIdx;
      if (this.itemModels.molotov) this.itemModels.molotov.visible = false;
      w.molotovModel.visible = true; w.molotovRagFlame.scale.setScalar(0);
      this.game.audio.reloadIn();
    } else if (kind === 'grenade') {
      if (w._grenadeArmed || w.grenadeCD > 0) return;
      w._grenadeArmed = true; w._throwSlot = slotIdx; this.game.audio.reloadIn();
    }
  }
  _throwMolotovFromSlot() {
    const w = this.game.weapons, slot = w._throwSlot; w._throwSlot = null;
    w.throwMolotov(); // spawns the bottle/pool, clears state, hides the model
    if (slot != null) this._consumeSlot(slot);
  }
  _throwGrenadeFromSlot() {
    const w = this.game.weapons, slot = w._throwSlot; w._grenadeArmed = false; w._throwSlot = null;
    w.throwGrenade(); // spawns the grenade projectile
    if (slot != null) this._consumeSlot(slot);
  }
  _reshowAfterThrow() { if (this._activeSlot >= 0 && this.slots[this._activeSlot]) { const m = this.itemModels[this.slots[this._activeSlot].kind]; if (m) m.visible = true; } }

  // ---- consume / drop / reorder / spill ----
  consumeHeldMaterial() { if (this._activeSlot >= 0) this._consumeSlot(this._activeSlot); }
  _consumeSlot(slotIdx) {
    const wasKind = this.slots[slotIdx] ? this.slots[slotIdx].kind : null;
    this.slots[slotIdx] = null;
    if (this.game.weapons._throwSlot === slotIdx) this.game.weapons._throwSlot = null; // keep an armed throwable's slot index valid
    if (this._activeSlot === slotIdx) {
      this._activeSlot = -1;
      const order = this.scrollOrder();
      let idx = order.findIndex((o) => o.kind === wasKind); // keep the same kind in hand if more remain
      if (idx < 0) idx = 0;
      if (order.length) this._select(order[idx], idx); else this._holdNothing();
    }
    this.refreshHotbar();
  }
  // drop ANY slot by dragging it out of the inventory UI (freedom of choice — incl. your starting gear)
  dropSlot(slotIdx) {
    const entry = this.slots[slotIdx]; if (!entry) return;
    const kind = entry.kind, pos = this.game.player.pos.clone(); pos.y = 0.55;
    if (kind === 'knife') { this.game.hud.toast('Can not drop your bare knife', 0xd23a2a); return; } // bare knife stays — always have a melee
    const mp = this.game.mp;
    if (mp && mp.active) {                                                  // co-op: route through the host so it becomes ONE shared pickup (no local non-id duplicate)
      if (mp.isHost) this.game.loot.spawnNetPickup(kind, pos.x, pos.z, entry.value);
      else mp.net.send('dropitem', { kind, value: entry.value, x: pos.x, z: pos.z });
    } else {
      this.game.loot._spawnPickup(kind, pos, entry.value);                 // solo: re-grabbable with E (unchanged)
    }
    if (this.game.audio.uiClick) this.game.audio.uiClick();
    this._consumeSlot(slotIdx);
  }
  moveSlot(from, to) {
    if (from === to) return;
    const a = this.slots[from]; this.slots[from] = this.slots[to]; this.slots[to] = a;
    if (this._activeSlot === from) this._activeSlot = to; else if (this._activeSlot === to) this._activeSlot = from;
    const w = this.game.weapons; if (w._throwSlot === from) w._throwSlot = to; else if (w._throwSlot === to) w._throwSlot = from;
    this.refreshHotbar();
  }
  // co-op: on real death spill the whole inventory onto the ground (local + broadcast so teammates can grab it with E)
  spillAll() {
    const pos = this.game.player.pos, mp = this.game.mp;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]; if (!s) continue;
      if (s.kind === 'knife') { this.slots[i] = null; continue; }
      const p = pos.clone(); p.y = 0.55; p.x += rr(-1.2, 1.2); p.z += rr(-1.2, 1.2);
      this.game.loot._spawnPickup(s.kind, p, s.value);
      if (mp && mp.active) mp.net.broadcast('droppickup', { kind: s.kind, value: s.value, x: p.x, z: p.z });
      this.slots[i] = null;
    }
    this.refreshHotbar();
  }

  // ---- held viewmodels (added to weapons.group; rendered in the WEAPON_LAYER pass like guns) ----
  _buildItemModels() {
    const loot = this.game.loot, grp = this.game.weapons.group;
    const makers = {
      medkit: () => loot._pickupMesh('medkit'), food: () => loot._pickupMesh('food'), armor: () => loot._pickupMesh('armor'),
      ammo: () => loot._pickupMesh('ammo'), splint: () => loot._pickupMesh('splint'), airbeacon: () => loot._pickupMesh('airbeacon'),
      molotov: () => loot._pickupMesh('molotov'), flare: () => buildFlare(), grenade: () => this._buildGrenadeModel(),
      sandbag: () => buildViewmodel({ shape: 'build_sandbag', color: 0xcdb887, accent: 0xb89a5e }),
      wire: () => buildViewmodel({ shape: 'build_wire', color: 0x8a8f98, accent: 0x5a4a32 }),
      wood: () => buildViewmodel({ shape: 'build_wood', color: 0x8a6a40, accent: 0x5a4026 }),
      radio: () => buildFieldRadio(),
    };
    for (const kind in makers) {
      let obj; try { obj = makers[kind](); } catch (e) { obj = null; if (typeof console !== 'undefined') console.warn('[loot] held item model build failed: ' + kind, e); }
      if (!obj) continue;
      const held = this._poseHeld(obj); held.visible = false;
      held.traverse((o) => { if (o.isMesh) { o.layers.set(WEAPON_LAYER); o.frustumCulled = false; o.renderOrder = 1000; } });
      grp.add(held); this.itemModels[kind] = held;
    }
  }
  _poseHeld(obj) {
    const grp = new THREE.Group();
    const bb = new THREE.Box3().setFromObject(obj), c = new THREE.Vector3(), sz = new THREE.Vector3();
    bb.getCenter(c); bb.getSize(sz);
    obj.position.set(obj.position.x - c.x, obj.position.y - c.y, obj.position.z - c.z); // recenter around origin
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1;
    grp.add(obj); grp.scale.setScalar(0.42 / maxd);
    grp.position.set(0.05, -0.12, -0.42); grp.rotation.set(0.18, 0.5, 0.05);
    return grp;
  }
  _buildGrenadeModel() {
    const b = new MeshBuilder();
    let g = new THREE.SphereGeometry(0.13, 12, 10); g.scale(1, 1.25, 1); b.geo(g, 0, 0, 0, 0x46532f, { tint: 0.05 }); g.dispose();
    g = new THREE.CylinderGeometry(0.05, 0.06, 0.06, 10); b.geo(g, 0, 0.17, 0, 0x6a7240); g.dispose();
    g = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 10); b.geo(g, 0, 0.21, 0, 0x3a3a32); g.dispose();
    b.box(0.02, 0.17, 0.05, 0.07, 0.12, 0, 0x9aa07e);
    return new THREE.Mesh(b.build(), voxelMaterial({}));
  }
  _hideAllItemModels() { for (const k in this.itemModels) this.itemModels[k].visible = false; }
}
