// inventory.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { MeshBuilder, rr, voxelMaterial } from './util.js';
import { buildFlare, buildFieldRadio } from './props.js';
import { WEAPONS, WEAPON_ORDER, buildViewmodel } from './weapons.js';
import { ITEM_DEFS } from './loot.js';
import { WEAPON_LAYER } from './engine.js';


// ---------------------------------------------------------------------------
// Shop (DOM) — weapons / items tabs. Perks removed by design: hardcore survival,
// no stat-creep upgrades — you live on weapons, ammo, heals and your aim.
// ---------------------------------------------------------------------------
// (SHOP_ITEMS removed — the lobby Shop/Armory replaces the between-wave shop; consumables are scavenged in-run.)

// Buyable gadgets (grenade/molotov/flare are virtual items; flashlight/binoculars also live in WEAPONS as tools).
export const GADGETS = [
  { key: 'grenade',    name: 'Frag Grenades', price: 400, desc: 'Hold LMB to cook, release to throw. Each loadout slot deploys 2.' },
  { key: 'molotov',    name: 'Molotov',       price: 350, desc: 'Hold LMB to light, then throw a fire pool. Each loadout slot deploys 1.' },
  { key: 'flashlight', name: 'Flashlight',    price: 600, desc: 'Hold it out — the beam lights the dark while held.' },
  { key: 'binoculars', name: 'Binoculars 8×', price: 450, desc: 'Hold RMB to glass the horizon at 8×.' },
  { key: 'flare',      name: 'Signal Flare',  price: 250, desc: 'Throw a burning marker that lights the dark. Each loadout slot deploys 1.' },
];

// Pre-run loadout = a flat list of LOADOUT_SLOTS EQUAL slots (any gear in any slot, duplicates OK).
export const LOADOUT_SLOTS = 10;
// Catalog category rail — id matches a weapon `.class`, plus 'gadget' for the gadget registry.
const SHOP_CATS = [
  { id: 'all', label: 'All' }, { id: 'rifle', label: 'Rifles' }, { id: 'smg', label: 'SMG' },
  { id: 'pistol', label: 'Pistols' }, { id: 'shotgun', label: 'Shotguns' }, { id: 'sniper', label: 'Snipers' },
  { id: 'launcher', label: 'Heavy' }, { id: 'melee', label: 'Melee' }, { id: 'gadget', label: 'Gadgets' },
];

// The lobby/menu ARMORY: spend the persistent bank to permanently UNLOCK gear (unlock-once), then build a flat
// LOADOUT_SLOTS-slot equal-slot loadout (any gear in any slot). Each DUPLICATE copy placed costs again (refunded
// on removal). 3-column UI: category rail | catalog | detail (3D preview + stats + BUY/EQUIP/SELL, confirm-gated).
// (Class kept named "Shop" so existing `this.shop` references stay valid.)
export class Shop {
  constructor(game) {
    this.game = game;
    this.grid = document.getElementById('shopGrid');
    this.rail = document.getElementById('shopRail');
    this.searchEl = document.getElementById('shopSearch');
    this.bankEl = document.getElementById('bankAmt');
    this.stripEl = document.getElementById('loadoutStrip');
    this.summaryEl = document.getElementById('shopSummary');
    this.warnEl = document.getElementById('shopWarning');
    this.nameEl = document.getElementById('previewName');
    this.statsEl = document.getElementById('previewStats');
    this.confirmEl = document.getElementById('shopConfirm');
    this.confirmMsgEl = document.getElementById('shopConfirmMsg');
    this.activeCat = 'all'; this.search = ''; this.selected = null; this.returnTo = 'menu'; this._onConfirm = null;
    this._buildRail();
    if (this.searchEl) this.searchEl.addEventListener('input', () => { this.search = this.searchEl.value || ''; const l = this._filteredCatalog(); if (!l.some((i) => i.key === this.selected)) this.selected = l.length ? l[0].key : null; this._renderCatalog(); this._renderDetail(); }); // keep an explicit click-selection while it still matches
    const yes = document.getElementById('shopConfirmYes'), no = document.getElementById('shopConfirmNo');
    if (yes) yes.addEventListener('click', () => { const fn = this._onConfirm; this._hideConfirm(); if (fn) fn(); });
    if (no) no.addEventListener('click', () => this._hideConfirm());
    if (this.confirmEl) this.confirmEl.addEventListener('click', (e) => { if (e.target === this.confirmEl) this._hideConfirm(); }); // click backdrop = cancel
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.confirmEl && this.confirmEl.classList.contains('show')) this._hideConfirm(); }); // Esc = cancel the confirm
    const clr = document.getElementById('shopClearAll'); if (clr) clr.addEventListener('click', () => this._askClearAll());
    const start = document.getElementById('shopStartBtn'); if (start) start.addEventListener('click', () => { if (this.returnTo !== 'lobby') this.game.startGame('purge'); });
  }
  open(returnTo) {
    this.returnTo = returnTo || 'menu';
    this.game.state = 'shop';
    this._hideConfirm();
    const list = this._filteredCatalog(); this.selected = list.length ? list[0].key : null;
    this._render(); this.game.ui.show('shop');
    if (this.game.preview) this.game.preview.setSize();
    const start = document.getElementById('shopStartBtn'); if (start) start.style.display = (this.returnTo === 'lobby') ? 'none' : '';
  }
  _meta() { return this.game.meta; }

  // ---- small helpers ----
  _icon(key) {
    if (WEAPONS[key]) { const d = WEAPONS[key]; return d.melee ? '🔪' : (d.class === 'tool' ? (d.zoom ? '🔭' : '🔦') : (d.class === 'launcher' ? '🚀' : '🔫')); }
    return (ITEM_DEFS[key] || {}).icon || '🎯';
  }
  _nameOf(key) { const g = GADGETS.find((x) => x.key === key); if (g) return g.name; return WEAPONS[key] ? WEAPONS[key].name : key; } // GADGETS first (flashlight/binoculars live in both registries)
  _descOf(key) { const g = GADGETS.find((x) => x.key === key); if (g) return g.desc; const w = WEAPONS[key]; return w ? (w.class + (w.melee ? ' · melee weapon' : ' · firearm')) : ''; }
  _price(key) { const g = GADGETS.find((x) => x.key === key); if (g) return g.price; return WEAPONS[key] ? (WEAPONS[key].price || 0) : 0; } // GADGETS first: flashlight/binoculars have a price in GADGETS, none in WEAPONS
  _count(key) { return this._meta().loadout.filter((k) => k === key).length; }

  // ---- economy: unlock-once + paid duplicates ----
  _placeFirstEmpty(key) {
    const m = this._meta(); const idx = m.loadout.indexOf(null);
    if (idx < 0) { if (this.game.hud && this.game.hud.toast) this.game.hud.toast('Loadout full — clear a slot first', 0xd23a2a); this.game.audio.noMoney(); return false; }
    m.loadout[idx] = key; return true;
  }
  _refundSlot(idx) { const m = this._meta(); const key = m.loadout[idx]; if (!key) return; if (this._count(key) >= 2) m.bank += this._price(key); m.loadout[idx] = null; } // refund only paid duplicates
  _clearSlot(idx) { const m = this._meta(); if (!m.loadout[idx]) return; this._refundSlot(idx); this.game.audio.uiClick(); this.game._saveMeta(); this._render(); }
  _clearAll() { const m = this._meta(); for (let i = 0; i < m.loadout.length; i++) this._refundSlot(i); this.game.audio.uiClick(); this.game._saveMeta(); this._render(); }
  _equipOwned(key) { if (this._placeFirstEmpty(key)) { this.game.audio.uiClick(); this.game._saveMeta(); this._render(); } } // free: placing an owned copy
  _buy(key) { // unlock 1st copy + auto-equip — needs a free slot; only charge once placed
    const m = this._meta(), price = this._price(key);
    if (m.bank < price) { this.game.audio.noMoney(); return; }
    if (!this._placeFirstEmpty(key)) return;                  // loadout full → no charge (feedback already shown)
    m.bank -= price; if (!m.unlocked.includes(key)) m.unlocked.push(key);
    this.game.audio.buy(); this.game._saveMeta(); this._render();
  }
  _buyDuplicate(key) { // paid extra copy of something already owned — needs a free slot; only charge once placed
    const m = this._meta(), price = this._price(key);
    if (m.bank < price) { this.game.audio.noMoney(); return; }
    if (!this._placeFirstEmpty(key)) return;                  // loadout full → no charge
    m.bank -= price;
    this.game.audio.buy(); this.game._saveMeta(); this._render();
  }
  _sell(key) {
    if (key === 'knife') return; // bare knife is free + permanent
    const m = this._meta(), price = this._price(key), dupes = Math.max(0, this._count(key) - 1);
    m.bank += Math.round(price * 0.6) + dupes * price; // 60% for ownership + full price per paid duplicate
    m.unlocked = m.unlocked.filter((k) => k !== key);
    for (let i = 0; i < m.loadout.length; i++) if (m.loadout[i] === key) m.loadout[i] = null;
    this.game.audio.buy(); this.game._saveMeta(); this._render();
  }

  // ---- confirm modal (reserved for spends + sells; free actions never confirm) ----
  _confirm(msg, onYes) { this._onConfirm = onYes; if (this.confirmMsgEl) this.confirmMsgEl.textContent = msg; if (this.confirmEl) this.confirmEl.classList.add('show'); this.game.audio.uiHover(); }
  _hideConfirm() { this._onConfirm = null; if (this.confirmEl) this.confirmEl.classList.remove('show'); }
  _askClearAll() { const n = this._meta().loadout.filter(Boolean).length; if (!n) return; this._confirm(`Clear all ${n} loadout slot${n > 1 ? 's' : ''}? (duplicate purchases are refunded)`, () => this._clearAll()); }

  // ---- catalog data ----
  _catalogItems() {
    const out = [];
    for (const k of WEAPON_ORDER) { const w = WEAPONS[k]; if (!w || w.class === 'tool') continue; out.push({ key: k, name: w.name, price: w.price || 0, cat: w.class }); }
    for (const g of GADGETS) out.push({ key: g.key, name: g.name, price: g.price, cat: 'gadget' });
    return out;
  }
  _filteredCatalog() {
    let items = this._catalogItems();
    if (this.activeCat !== 'all') items = items.filter((i) => i.cat === this.activeCat);
    const q = (this.search || '').trim().toLowerCase();
    if (q) items = items.filter((i) => i.name.toLowerCase().includes(q) || i.cat.includes(q));
    return items;
  }

  // ---- render ----
  _buildRail() {
    if (!this.rail) return; this.rail.innerHTML = '';
    for (const c of SHOP_CATS) {
      const b = document.createElement('button');
      b.className = 'shop-cat' + (c.id === this.activeCat ? ' on' : ''); b.dataset.cat = c.id; b.textContent = c.label;
      b.addEventListener('click', () => { this.activeCat = c.id; const l = this._filteredCatalog(); this.selected = l.length ? l[0].key : null; this._render(); });
      b.addEventListener('mouseenter', () => this.game.audio.uiHover());
      this.rail.appendChild(b);
    }
  }
  _render() {
    const m = this._meta();
    if (this.bankEl) this.bankEl.textContent = '$' + m.bank;
    if (this.rail) for (const b of this.rail.children) b.classList.toggle('on', b.dataset.cat === this.activeCat);
    this._renderCatalog(); this._renderLoadoutBar(); this._renderDetail(); this._updateSummary();
  }
  _renderCatalog() {
    if (!this.grid) return; const m = this._meta(); const _st = this.grid.scrollTop; this.grid.innerHTML = '';
    const list = this._filteredCatalog();
    if (!list.length) { this.grid.innerHTML = '<div class="cat-empty">No gear matches your search.</div>'; return; }
    for (const it of list) {
      const owned = m.unlocked.includes(it.key), cnt = this._count(it.key);
      const afford = owned ? true : m.bank >= it.price;
      const el = document.createElement('div');
      el.className = 'cat-item' + (it.key === this.selected ? ' sel' : '') + (owned ? ' owned' : (afford ? '' : ' dim'));
      el.dataset.key = it.key;
      const tag = owned ? '<span class="cat-owned">OWNED</span>' : `<span class="cat-price">$${it.price}</span>`;
      const badge = cnt > 0 ? `<span class="cat-badge">×${cnt}</span>` : '';
      el.innerHTML = `${badge}<div class="cat-ico">${this._icon(it.key)}</div><div class="cat-nm">${it.name}</div>${tag}`;
      el.addEventListener('click', () => { this.selected = it.key; this._renderCatalog(); this._renderDetail(); this.game.audio.uiClick(); });
      this.grid.appendChild(el);
    }
    this.grid.scrollTop = _st; // preserve scroll across the full rebuild (clicking a tile re-renders the grid)
  }
  _setPreview(key) {
    const g = this.game;
    if (g.preview && g.preview.setSize) g.preview.setSize(); // keep the WebGL buffer matched to the live canvas box
    if (key && WEAPONS[key] && g.preview) g.preview.show(key);
    else if (g.preview && g.preview.hide) g.preview.hide();
    if (this.nameEl) this.nameEl.textContent = key ? this._nameOf(key) : '';
    if (this.statsEl) { const w = WEAPONS[key]; const p = []; if (w) { if (w.dmg) p.push('DMG ' + w.dmg); if (w.rpm) p.push(w.rpm + ' RPM'); if (w.mag) p.push(w.mag + ' mag'); if (w.melee) p.push('melee'); } this.statsEl.textContent = w ? p.join('  ·  ') : (key ? 'gadget' : ''); }
  }
  _renderDetail() {
    this._setPreview(this.selected);
    const host = document.getElementById('shopActions'); const desc = document.getElementById('previewDesc');
    const m = this._meta(), key = this.selected;
    if (desc) desc.textContent = key ? this._descOf(key) : '';
    if (!host) return;
    if (!key) { host.innerHTML = '<div class="det-hint">Pick a weapon to inspect.</div>'; return; }
    const owned = m.unlocked.includes(key), cnt = this._count(key), price = this._price(key), afford = m.bank >= price;
    const full = m.loadout.indexOf(null) < 0; // adding needs a free slot
    let html = '';
    if (!owned) {
      html += `<button class="det-btn buy" data-act="buy" ${(afford && !full) ? '' : 'disabled'}>UNLOCK · $${price}</button>`;
      if (!afford) html += `<div class="det-warn">Need $${price - m.bank} more</div>`;
      else if (full) html += `<div class="det-warn">Loadout full — clear a slot first</div>`;
    } else {
      if (cnt === 0) {
        html += `<button class="det-btn equip" data-act="equip" ${full ? 'disabled' : ''}>EQUIP</button>`;
        if (full) html += `<div class="det-warn">Loadout full — clear a slot first</div>`;
      } else {
        html += `<button class="det-btn dup" data-act="dup" ${((afford || price === 0) && !full) ? '' : 'disabled'}>ADD ANOTHER · $${price}</button><div class="det-incl">×${cnt} in loadout</div>`;
        if (full) html += `<div class="det-warn">Loadout full — clear a slot first</div>`;
        else if (!afford && price > 0) html += `<div class="det-warn">Need $${price - m.bank} more</div>`;
      }
      if (key !== 'knife') { const refund = Math.round(price * 0.6) + Math.max(0, cnt - 1) * price; html += `<button class="det-btn sell" data-act="sell">SELL · +$${refund}</button>`; }
    }
    host.innerHTML = html;
    host.querySelectorAll('.det-btn').forEach((b) => {
      b.addEventListener('mouseenter', () => this.game.audio.uiHover());
      b.addEventListener('click', () => {
        const act = b.dataset.act, nm = this._nameOf(key);
        if (act === 'buy') this._confirm(`Unlock ${nm} for $${price}?`, () => this._buy(key));
        else if (act === 'dup') this._confirm(`Add another ${nm} for $${price}?`, () => this._buyDuplicate(key));
        else if (act === 'equip') this._equipOwned(key);
        else if (act === 'sell') { const c = this._count(key), refund = Math.round(price * 0.6) + Math.max(0, c - 1) * price; const msg = c > 1 ? `Sell ALL ×${c} ${nm} and give up the unlock? You get $${refund} back.` : `Sell ${nm}? You get $${refund} back and it leaves your loadout.`; this._confirm(msg, () => this._sell(key)); }
      });
    });
  }
  _renderLoadoutBar() {
    if (!this.stripEl) return; const m = this._meta(); this.stripEl.innerHTML = '';
    for (let i = 0; i < LOADOUT_SLOTS; i++) {
      const key = m.loadout[i];
      const cell = document.createElement('div'); cell.className = 'lo-cell' + (key ? ' filled' : ' empty'); cell.dataset.slot = i;
      if (key) {
        cell.draggable = true;
        cell.innerHTML = `<button class="lo-clear" title="Remove">✕</button><div class="lo-ico">${this._icon(key)}</div><div class="lo-nm">${this._nameOf(key)}</div>`;
        cell.querySelector('.lo-clear').addEventListener('click', (e) => { e.stopPropagation(); this._clearSlot(i); });
        cell.addEventListener('click', () => { this.selected = key; this._renderCatalog(); this._renderDetail(); });
        cell.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; cell.classList.add('dragging'); });
        cell.addEventListener('dragend', () => cell.classList.remove('dragging'));
      } else cell.innerHTML = '<div class="lo-plus">+</div>';
      cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag-over'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
      cell.addEventListener('drop', (e) => { e.preventDefault(); cell.classList.remove('drag-over'); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!isNaN(from) && from !== i) { const a = m.loadout[from]; m.loadout[from] = m.loadout[i]; m.loadout[i] = a; this.game.audio.uiClick(); this.game._saveMeta(); this._render(); } });
      this.stripEl.appendChild(cell);
    }
  }
  _updateSummary() {
    const m = this._meta(), filled = m.loadout.filter(Boolean), value = filled.reduce((s, k) => s + this._price(k), 0);
    if (this.summaryEl) this.summaryEl.textContent = `${filled.length}/${LOADOUT_SLOTS} slots · value $${value}`;
    if (this.warnEl) {
      let warn = '';
      if (!filled.length) warn = '⚠ Empty loadout — you spawn with just a knife';
      else if (!filled.some((k) => WEAPONS[k] && !WEAPONS[k].melee && WEAPONS[k].class !== 'tool')) warn = '⚠ No firearm equipped — melee only out there';
      this.warnEl.textContent = warn; this.warnEl.classList.toggle('show', !!warn);
    }
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
    const w = this.game.weapons;
    const lo = (this.game.meta && Array.isArray(this.game.meta.loadout)) ? this.game.meta.loadout : []; // flat array of equal slots
    const granted = new Set();                                                          // grant() is ammo-init (idempotent) — once per weapon kind
    for (const k of lo) {
      if (!k) continue;
      if (WEAPONS[k]) { if (!granted.has(k)) { w.grant(k); granted.add(k); } this.addItem(k); } // weapon/tool: each slot = one backpack entry
      else if (k === 'grenade') { this.addItem('grenade'); this.addItem('grenade'); }   // 2 frags per loadout slot
      else if (k === 'molotov') { this.addItem('molotov'); }                            // 1 molotov per slot
      else if (k === 'flare') { this.addItem('flare'); }                                // 1 flare per slot
    }
    if (!this.slots.some((s) => s && WEAPONS[s.kind] && WEAPONS[s.kind].melee)) { w.grant('knife'); if (!this.addItem('knife')) this.slots[this.slots.length - 1] = { kind: 'knife', value: 1 }; } // a run always has a melee (evict the last item if the backpack overflowed)
    this._activeSlot = -1; this._wheelIdx = 0;
    const o = this.scrollOrder();
    if (o.length) { let i = o.findIndex((e) => e.kind === w.cur); if (i < 0) i = 0; this._select(o[i], i); } // hold the computed weapon (first firearm), not just slot 0
    else this._holdNothing();
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
      ammo: () => loot._pickupMesh('ammo'), fiftyammo: () => loot._pickupMesh('fiftyammo'), splint: () => loot._pickupMesh('splint'), airbeacon: () => loot._pickupMesh('airbeacon'),
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
