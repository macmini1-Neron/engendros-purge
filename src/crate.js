// crate.js — «Посылка» supply-crate lootbox: the whole feature (roll + ceremony).
//
// Design spec: docs/superpowers/specs/2026-06-10-lootbox-crate-design.md (approved).
// A maximally thrilling, psychology-engineered opening: a Su-24 flies over, drops a
// chuted army crate, it thuds down, 3 seals pop themselves open (with sparks), a near-miss
// "light roulette" flickers through tier colours, the lid bursts, the reward rises spinning
// in a real spotlight, then a trophy card. Every beat below carries its justification as
// a comment — future tuning must NOT silently delete the psychology.
//
// Import-cycle rule (load-fatal trap in this codebase): inventory.js must NOT import
// this module. The Shop reads crate data at runtime via `game.crate.def`. We import
// GADGETS one-way from inventory.js (no cycle: inventory never imports crate.js).
import * as THREE from 'three';
import { GADGETS } from './inventory.js';
import { WEAPONS, buildViewmodel, buildMag } from './weapons.js';
import { buildSu24, buildChuteRig, buildFlare } from './props.js';
import { getSpec } from './props/registry-core.js';
import { buildSpec } from './props/voxel-interp.js';
import { MeshBuilder, voxelMaterial, weightedPick, rr, clamp, shade } from './util.js';
import { rollCrateCosmetic, COSMETIC_DROP } from './poker/chipskins.js';
import { buildShowcaseChip } from './poker-chip-mesh.js';

// ---------------------------------------------------------------------------
// Data & economy (§3). Private hobby game, in-game cash only.
// ---------------------------------------------------------------------------
export const CRATE_DEF = {
  key: 'crate_supply', name: 'Supply Crate', price: 800,
  desc: 'A sealed army crate — a Su-24 drops it in personally. Inside: a weapon, gear, a poker chip set or cash. Duplicates convert to cash.',
};

// per-mille tier odds. Σ = 1000.
export const TIER_WEIGHTS = { common: 600, rare: 280, epic: 95, legendary: 25 };
// Pity ceilings keep hope mathematically alive (Hearthstone): hard guarantees.
export const PITY = { epic: 10, legendary: 20 };
// Duplicate → cash conversion. < 0.6 sell refund so there's NO buy↔sell arbitrage;
// a Thompson dupe still reads +$480 = a "win" (loss disguised as a win, peak-end rule).
export const DUP_RATE = 0.4;
// Tier colours: tier reveal arrives ONLY in the final ~0.5 s (Overwatch lesson —
// rarity colour shown too early kills anticipation). common/rare/epic/legendary.
export const TIER_COLORS = { common: 0xcfd3d8, rare: 0x84aab2, epic: 0xb070ff, legendary: 0xd8b066 };
export const TIER_NAMES = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };
const TIER_ORDER = ['common', 'rare', 'epic', 'legendary'];

// Tier mapping derives from each weapon's `loot:` weight (weapons.js): loot ≥ 10 common,
// 7–9 rare, 5–6 epic, ≤ 4 legendary; gadgets by price (≤450 common, flashlight 600 rare);
// luger ($400, no loot) → common. knife + mounted guns excluded.
export const LOOT_TABLE = {
  common: [   // Σw 24
    { cash: 150, name: 'Cash Bundle', w: 8 },
    { key: 'flare', w: 2 }, { key: 'molotov', w: 2 }, { key: 'grenade', w: 2 }, { key: 'binoculars', w: 1 },
    { key: 'luger', w: 3 }, { key: 'carbine', w: 2 }, { key: 'thompson', w: 2 }, { key: 'mp40', w: 2 },
  ],
  rare: [     // Σw 25
    { cash: 400, name: 'Field Pay', w: 6 },
    { key: 'machete', w: 2 }, { key: 'flashlight', w: 2 }, { key: 'axe', w: 2 }, { key: 'revolver', w: 2 },
    { key: 'grease', w: 2 }, { key: 'magnum', w: 2 }, { key: 'sawed_off', w: 2 }, { key: 'ppsh', w: 2 },
    { key: 'shotgun', w: 2 }, { key: 'garand', w: 1 },
  ],
  epic: [     // Σw 18
    { cash: 1000, name: 'Quartermaster Safe', w: 4 },
    { key: 'cleaver', w: 2 }, { key: 'shovel', w: 2 }, { key: 'stg44', w: 2 }, { key: 'mosin', w: 2 },
    { key: 'kar98', w: 2 }, { key: 'bar', w: 2 }, { key: 'dp28', w: 2 },
  ],
  legendary: [ // Σw 5
    { key: 'bazooka', w: 3 },
    { cash: 2500, name: 'GENERAL STAFF BONUS', w: 2 },
  ],
};
// EV: liquidation ≈ 67% of price (no arbitrage), all-owned ≈ 49% (endgame cash sink),
// fresh-account unlock EV ≫ price (the hook). Crate ≈ 2–3 cleared waves.

// GADGETS first, then WEAPONS — flashlight/binoculars carry their price in GADGETS, none in WEAPONS.
function _priceOf(key) { const g = GADGETS.find((x) => x.key === key); if (g) return g.price; return WEAPONS[key] ? (WEAPONS[key].price || 0) : 0; }
function _nameOf(key) { const g = GADGETS.find((x) => x.key === key); if (g) return g.name; return WEAPONS[key] ? WEAPONS[key].name : key; }

// ---------------------------------------------------------------------------
// The roll — COMMITTED in game.openCrate() BEFORE any animation, so it's Esc/crash-safe.
// Decrements stock, advances pity, grants the reward, returns a result descriptor.
// ---------------------------------------------------------------------------
export function rollCrateReward(game) {
  const m = game.meta;
  m.crates = (m.crates | 0) - 1;
  m.crateOpens = (m.crateOpens | 0) + 1;
  m.pityEpic = (m.pityEpic | 0) + 1; m.pityLegend = (m.pityLegend | 0) + 1;
  // Dedicated COSMETIC pool — independent of the weapon tier roll below; it does NOT reset weapon pity
  // (a chip-skin drop is a bonus, weapon pity keeps climbing). QA hook: GAME.crate._forceCosmetic='marx'.
  const fc = game.crate && game.crate._forceCosmetic;
  const cos = fc ? COSMETIC_DROP.find((e) => e.skin === fc) : rollCrateCosmetic(Math.random);
  if (cos) {
    if (!Array.isArray(m.chipSkinsUnlocked)) m.chipSkinsUnlocked = [];
    if (m.chipSkinsUnlocked.includes(cos.skin)) {                  // already owned → liquidate to cash
      const cash = Math.round(cos.value * DUP_RATE); m.bank += cash;
      return { tier: cos.tier, kind: 'dupe', skin: cos.skin, name: cos.name, cash, price: cos.value };
    }
    m.chipSkinsUnlocked.push(cos.skin);                            // fresh chip-skin unlock
    return { tier: cos.tier, kind: 'chipskin', skin: cos.skin, name: cos.name };
  }
  let tier = game.crate && game.crate._forceTier;                 // QA hook (GAME.crate._forceTier='epic')
  if (tier && !LOOT_TABLE[tier]) tier = null;                     // ignore a typo'd force value → fall through to a normal roll (never throws mid-mutation)
  if (!tier) {
    let r = Math.random() * 1000;
    tier = r < TIER_WEIGHTS.legendary ? 'legendary'
      : (r -= TIER_WEIGHTS.legendary) < TIER_WEIGHTS.epic ? 'epic'
        : (r -= TIER_WEIGHTS.epic) < TIER_WEIGHTS.rare ? 'rare' : 'common';
  }
  if (m.pityLegend >= PITY.legendary) tier = 'legendary';          // hard ceilings, legendary first
  else if (m.pityEpic >= PITY.epic && tier !== 'legendary') tier = 'epic';
  if (tier === 'legendary') { m.pityLegend = 0; m.pityEpic = 0; }
  else if (tier === 'epic') m.pityEpic = 0;
  const e = weightedPick(LOOT_TABLE[tier].map((en) => ({ w: en.w, v: en })));
  if (e.cash) { m.bank += e.cash; return { tier, kind: 'cash', cash: e.cash, name: e.name }; }
  const price = _priceOf(e.key), name = _nameOf(e.key);
  if (m.unlocked.includes(e.key)) {                                // already owned → liquidate to cash
    const cash = Math.round(price * DUP_RATE); m.bank += cash;
    return { tier, kind: 'dupe', key: e.key, name, cash, price };
  }
  m.unlocked.push(e.key);                                          // fresh unlock
  return { tier, kind: WEAPONS[e.key] ? 'weapon' : 'gadget', key: e.key, name, price };
}

// ---------------------------------------------------------------------------
// Crate model contract + fallback (§7) — NEVER hard-block on the modelgen spec.
// → { root, lid }: root sits on y=0, front = +z; rotate lid.rotation.x negative to open.
// ---------------------------------------------------------------------------
export function buildLootCrate() {
  const spec = getSpec('supply-lootbox');
  if (spec) {
    try {
      const root = buildSpec(spec);
      const lid = root.getObjectByName('lid');                    // buildSpec rigs the lid as a named pivot Group
      if (lid && lid.userData.rig && Array.isArray(lid.userData.rig.pivot)) return { root, lid };
      console.warn('[crate] supply-lootbox spec lacks a pivot-rigged lid — fallback crate');
    } catch (e) { console.warn('[crate] buildSpec failed — fallback crate', e); }
  }
  // Fallback: procedural olive pine chest (~0.8×0.40×0.5, floor-anchored), layered shading
  // (lit top strip + dark base), with an IDENTICAL animation contract — lid is an outer
  // Group at the rear-top pivot; rotate its .rotation.x negative to open.
  const od = 0x5b6234, odHi = shade(od, 0.10), odLo = shade(od, -0.12), steel = 0x6a7077, pine = 0xb39a63;
  const W = 0.8, H = 0.40, D = 0.5, bodyH = 0.32;
  const root = new THREE.Group();
  const b = new MeshBuilder();
  b.box(W, bodyH, D, 0, bodyH / 2, 0, od);                        // body
  b.box(W + 0.01, 0.04, D + 0.01, 0, bodyH - 0.02, 0, odHi);      // lit top rail
  b.box(W + 0.01, 0.05, D + 0.01, 0, 0.025, 0, odLo);            // dark base shadow
  b.box(0.06, bodyH, 0.02, -0.18, bodyH / 2, D / 2, steel);       // front latches (static look)
  b.box(0.06, bodyH, 0.02, 0.18, bodyH / 2, D / 2, steel);
  root.add(new THREE.Mesh(b.build(), voxelMaterial()));
  const lid = new THREE.Group(); lid.name = 'lid';
  lid.position.set(0, bodyH, -D / 2);                             // pivot at rear-top edge
  lid.userData.rig = { name: 'lid', pivot: [0, bodyH, -D / 2], axis: 'x', pose: 0 };
  const lb = new MeshBuilder();
  lb.box(W, 0.06, D, 0, 0.03, D / 2, od);                         // lid body (offset +D/2 from the pivot)
  lb.box(W + 0.01, 0.025, D, 0, 0.06, D / 2, odHi);              // lit lid strip
  lb.box(W - 0.02, 0.02, D - 0.02, 0, -0.005, D / 2, pine);      // raw pine underside (shows when open)
  lid.add(new THREE.Mesh(lb.build(), voxelMaterial()));
  root.add(lid);
  return { root, lid };
}

// per-tier ceremony pacing (rare rewards genuinely longer/louder/brighter — PMC 7882574).
const HOLD_DUR = { common: 0.6, rare: 0.8, epic: 1.1, legendary: 1.4 };
const RISE_DUR = { common: 0.7, rare: 0.7, epic: 0.9, legendary: 1.4 };
// Additive cone = just the visible beam-in-air (kept faint — the SpotLight below does the real
// lighting). Lerped per phase so it fades IN at landing and is NOT shown during the fly-over.
const SHAFT_TARGET = { idle: 0, fade: 0, flyby: 0, fall: 0, impact: 0.07, pry: 0.08, hold: 0.10, burst: 0.16, rise: 0.11, showcase: 0.10, end: 0.10 };
// REAL SpotLight intensity per phase (renderer is physically-correct → needs high values). This is
// what actually lights the landed crate + the risen reward (owner: "real light, not a texture").
const SPOT_TARGET = { idle: 0, fade: 0, flyby: 0, fall: 0, impact: 40, pry: 44, hold: 48, burst: 64, rise: 56, showcase: 52, end: 52 };

// ---------------------------------------------------------------------------
// CrateCeremony — own renderer / scene / phase machine. render(dt) is driven from
// Game._frame while state==='crate' (no internal rAF). Fusion of WeaponPreview +
// AssetViewer patterns. The reward is already granted before open() — we only show it.
// ---------------------------------------------------------------------------
export class CrateCeremony {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('crateCanvas');
    this.active = false; this.result = null;
    this.phase = 'idle'; this.t = 0; this.chain = 0; this._finishing = false;
    this.pity = PITY;                                              // read by the Shop for the pity-transparency line (no crate.js import there)
    this._shake = 0; this._reducedMotion = false;
    try { this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x070b0e, 1);
    this.cam = new THREE.PerspectiveCamera(50, 1.7, 0.02, 200);
    this.camPos = new THREE.Vector3(0, 1.7, 7.5);
    this.camTarget = this.camPos.clone();
    this.lookAt = new THREE.Vector3(0, 0.5, 0);
    this.lookTarget = this.lookAt.clone();

    this._buildScene();
    this._cacheDom();
    this._wire();
    this.setSize();
  }

  // --- DOM refs + wiring -----------------------------------------------------
  _cacheDom() {
    const $ = (id) => document.getElementById(id);
    this.elVig = $('crateVig'); this.elCount = $('crateCount'); this.elHint = $('crateHint');
    this.elCard = $('crateCard'); this.elTier = $('crateTier'); this.elName = $('crateName'); this.elSub = $('crateSub');
    this.elBtns = $('crateBtns'); this.elAgain = $('crateAgainBtn'); this.elLeft = $('crateLeft'); this.elBack = $('crateBackBtn');
  }
  _wire() {
    if (this.elAgain) this.elAgain.addEventListener('click', (e) => { e.stopPropagation(); this._again(); });
    if (this.elBack) this.elBack.addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
    // Pointer is NOT locked during the ceremony; these listeners are vestigial — the ceremony is
    // fully automatic so _onClick() is inert (Esc + the OPEN AGAIN / BACK buttons drive navigation).
    if (this.canvas) this.canvas.addEventListener('click', () => this._onClick());
    if (this.elVig) this.elVig.addEventListener('click', () => this._onClick());
    document.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === 'Escape') { e.preventDefault(); this.finishImmediately(); }       // §9.1 Esc anytime
    });
    window.addEventListener('resize', () => { if (this.active) this.setSize(); });     // resize only matters while active
  }
  setSize() {
    const w = (this.canvas && this.canvas.clientWidth) || 1280, h = (this.canvas && this.canvas.clientHeight) || 720;
    this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }

  // --- one-time scene (night steppe) ----------------------------------------
  _buildScene() {
    const s = new THREE.Scene();
    s.fog = new THREE.Fog(0x070b0e, 30, 90);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(28, 40), new THREE.MeshLambertMaterial({ color: 0x202a18 }));
    ground.rotation.x = -Math.PI / 2; s.add(ground);
    // ~220-star dome (fog:false so distant stars don't wash out)
    const sg = new THREE.BufferGeometry(), sp = new Float32Array(220 * 3);
    for (let i = 0; i < 220; i++) { const u = rr(0, Math.PI * 2), v = rr(0.05, 1), r = 70; const ph = Math.acos(v); sp[i * 3] = r * Math.sin(ph) * Math.cos(u); sp[i * 3 + 1] = r * Math.cos(ph) + 8; sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(u); }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe7ff, size: 0.35, sizeAttenuation: true, fog: false })));
    const moon = new THREE.DirectionalLight(0x9fb8d8, 1.0); moon.position.set(-12, 20, -8); s.add(moon);
    s.add(new THREE.HemisphereLight(0x2a3a4a, 0x0b0f0a, 0.55));
    this.scene = s;
    this.actors = new THREE.Group(); s.add(this.actors);     // everything rebuilt per-open lives here

    // FX point pools (hand-rolled — effects.js is hard-coupled to the game scene, do not touch it).
    this.dust = this._makePool(80, 0.035, 0x8a7a5a, false);
    this.sparks = this._makePool(72, 0.05, 0xc8a84b, true);
    this.scene.add(this.dust.points); this.scene.add(this.sparks.points);

    // light-shaft cone the reward rises through (additive, no depth write)
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 2.4, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    cone.position.set(0, 1.2, 0); this.shaft = cone; this.scene.add(cone);

    this.crackLight = new THREE.PointLight(0xffd9a0, 0, 3); this.scene.add(this.crackLight);   // warm-white crack glow
    this.burstLight = new THREE.PointLight(0xffffff, 0, 6); this.scene.add(this.burstLight);   // tier-colour burst
    // REAL spotlight from above — actually ILLUMINATES the landed crate + the risen reward.
    // (The additive cone above is only the visible beam-in-air; THIS lights surfaces.)
    this.spot = new THREE.SpotLight(0xfff1d6, 0, 16, 0.6, 0.5, 1.0);
    this.spot.position.set(0.5, 6, 1.4); this.spot.target.position.set(0, 0.55, 0);
    this.scene.add(this.spot); this.scene.add(this.spot.target);
    this._spotTarget = 0;
  }
  _makePool(n, size, color, additive) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = 9999;                 // park offscreen
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size, color, transparent: true, opacity: 0.95, depthWrite: false, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const points = new THREE.Points(geo, mat); points.frustumCulled = false;
    return { points, pos, parts: [], grav: additive ? -0.6 : -2 };
  }
  _emit(pool, x, y, z, count, spread, up, life, color, vzBias = 0) {
    if (color != null) pool.points.material.color.setHex(color);
    for (let i = 0; i < count; i++) pool.parts.push({ x, y, z, vx: rr(-spread, spread), vy: rr(0, up), vz: rr(-spread, spread) + vzBias, life, max: life });
  }
  _updatePool(pool, dt) {
    const p = pool.parts; let w = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[i]; q.life -= dt; if (q.life <= 0) continue;
      q.vy += pool.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      pool.pos[w * 3] = q.x; pool.pos[w * 3 + 1] = q.y; pool.pos[w * 3 + 2] = q.z; w++;
      p[w - 1] = q;
    }
    p.length = w;
    const cap = pool.pos.length / 3;
    for (let i = w; i < cap; i++) { pool.pos[i * 3] = 9999; pool.pos[i * 3 + 1] = 9999; pool.pos[i * 3 + 2] = 9999; }
    pool.points.geometry.attributes.position.needsUpdate = true;
    pool.points.material.opacity = 0.95;
  }

  // --- lifecycle -------------------------------------------------------------
  open(result) {
    this.result = result; this._finishing = false;
    this.active = true; this.t = 0; this._shake = 0; this._reward = null; this._rouletteIdx = 0; this._pryCount = 0;
    this.dust.parts.length = 0; this.sparks.parts.length = 0;       // no particle carry-over between opens
    this.shaft.material.opacity = 0; this._shaftTarget = 0;         // reset the beam each open (no carry-over → not shown until landing)
    this.crackLight.intensity = 0; this.burstLight.intensity = 0;
    this.spot.intensity = 0; this._spotTarget = 0;                  // real spotlight off until the crate lands
    this.setSize();
    this._disposeActors();
    this._spawnActors();
    if (this.canvas) this.canvas.classList.remove('lit');
    this._hideCard(); this._showButtons(false); this._setHint('');
    this.game.audio.setMusicDuck(0.3);                              // duck the jukebox under the ceremony
    if (this.game.audio.crateWind) this.game.audio.crateWind();
    // The full ceremony (incl. the Su-24 fly-over) plays every time — chained opens too (owner request).
    this._setPhase('fade');
  }
  _spawnActors() {
    const rig = buildLootCrate(); this.crate = rig.root; this.lid = rig.lid;
    this.crate.visible = false; this.actors.add(this.crate);
    this.jet = buildSu24(); this.jet.scale.setScalar(0.9); this.jet.visible = false; this.actors.add(this.jet);
    const ch = buildChuteRig(); this.chute = new THREE.Group();                       // {canopy, rig} → one group above the crate
    this.chute.add(ch.canopy); this.chute.add(ch.rig); this.chute.visible = false; this.actors.add(this.chute);
    this.itemHolder = new THREE.Group(); this.itemHolder.position.set(0, 0, 0); this.actors.add(this.itemHolder); // reward y is world-space (holder at ground)
    // Measure the crate in its LANDED frame (the model is floor-anchored at y=0) so the overlay
    // latches, lights and particle origins sit on the crate ON THE GROUND — not where it spawns (y=16).
    this.crate.position.set(0, 0, 0); this.crate.updateWorldMatrix(true, true);
    const bb = new THREE.Box3().setFromObject(this.crate);
    const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y, fz = bb.max.z + 0.012, ly = bb.min.y + 0.5 * h;
    this.latches = []; const xs = [-0.24 * w, 0, 0.24 * w];
    for (let i = 0; i < 3; i++) {
      const lm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.025), new THREE.MeshLambertMaterial({ color: 0xc2c7cf }));
      lm.position.set(xs[i], ly, fz); lm.visible = false; lm.userData.popped = false;   // hidden until the crate lands
      this.actors.add(lm); this.latches.push(lm);
    }
    // pulse ring marking the ACTIVE latch (additive, illusion-of-control affordance)
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.pulse.visible = false; this.actors.add(this.pulse);
    this._latchY = ly; this._frontZ = fz;
    this.crackLight.position.set(0, h + 0.02, fz); this.crackLight.intensity = 0;
    this.burstLight.position.set(0, h * 0.6, 0.1); this.burstLight.intensity = 0;
    this.crate.position.set(0, 16, 0);   // now lift it up for the drop
  }
  _disposeActors() {
    if (!this.actors) return;
    const kill = (o) => o && o.traverse && o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose && m.dispose()); } });
    while (this.actors.children.length) { const c = this.actors.children.pop(); kill(c); }
    this.crate = this.lid = this.jet = this.chute = this.itemHolder = this._reward = null; this.latches = [];
  }

  // --- phase machine ---------------------------------------------------------
  _setPhase(name) { this.phase = name; this.t = 0; this._onEnter(name); }
  _onEnter(name) {
    const a = this.game.audio;
    this._shaftTarget = SHAFT_TARGET[name] ?? this._shaftTarget;    // beam-in-air fades toward this in render()
    this._spotTarget = SPOT_TARGET[name] ?? this._spotTarget;       // real spotlight ramps toward this in render()
    switch (name) {
      case 'fade': this._setHint(''); break;
      case 'flyby':
        this.jet.visible = true; this.jet.position.set(-70, 24, -30); this.jet.rotation.y = -Math.PI / 2;
        this._jet = (a.startJetClip && a.startJetClip()) || (a.startJet && a.startJet());
        break;
      case 'fall':
        // crate is already parked at its start height (y=16 from _spawnActors).
        this.crate.visible = true; this.chute.visible = true;
        this.chute.position.copy(this.crate.position);            // chute rig carries its own canopy height above origin
        if (a.crateChute) a.crateChute();
        break;
      case 'impact':
        this.crate.position.y = 0; this._shake = this._reducedMotion ? 0 : 0.07;
        for (const lm of this.latches) lm.visible = true; this.pulse.visible = true;   // seals appear on the landed crate
        this._emit(this.dust, 0, 0.05, 0.2, 60, 1.1, 1.6, 0.9, 0x8a7a5a);
        if (a.crateThud) a.crateThud(); a.setMusicDuck(0.25);
        this._setHint('');
        break;
      case 'pry': this._pryAt = [0.45, 0.95, 1.45]; this._setHint('BREAKING THE SEALS…'); break; // auto-pops on these timers (no clicking)
      case 'hold':
        this._roulette = this._buildRoulette(this.result.tier, HOLD_DUR[this.result.tier]);
        this._rouletteIdx = 0; this._rouletteClock = 0;
        if (a.crateDrone) a.crateDrone(this.result.tier, HOLD_DUR[this.result.tier]);
        this._setHint('');
        break;
      case 'burst': this._doBurst(); break;
      case 'rise': this._ensureReward(); if (a.tone) a.tone(196, RISE_DUR[this.result.tier], 'sine', 0.06); break;
      case 'showcase': this._showCard(false); break;
      case 'end': this._showButtons(true); this._setHint(this._collectionLine()); break;
    }
  }

  render(dt) {
    if (!this.active) return;
    if (this.canvas && !this.canvas.classList.contains('lit')) this.canvas.classList.add('lit');
    this.t += dt;
    this._step(dt);
    // camera: damp toward target + decaying additive shake (§2.2)
    this.camPos.lerp(this.camTarget, 1 - Math.exp(-6 * dt));
    this.lookAt.lerp(this.lookTarget, 1 - Math.exp(-6 * dt));
    const sh = this._shake; this._shake *= Math.exp(-7 * dt);
    this.cam.position.set(this.camPos.x + rr(-1, 1) * sh, this.camPos.y + rr(-1, 1) * sh, this.camPos.z);
    this.cam.lookAt(this.lookAt);
    // beam: lerp toward the per-phase target → smooth fade-in at landing, never a hard pop
    const so = this.shaft.material; so.opacity += ((this._shaftTarget || 0) - so.opacity) * (1 - Math.exp(-7 * dt));
    this.spot.intensity += ((this._spotTarget || 0) - this.spot.intensity) * (1 - Math.exp(-7 * dt));   // real light ramps in smoothly
    this._updateLatchDebris(dt);                                   // every frame so popped seals keep flying + despawn (not just during 'pry')
    this._updatePool(this.dust, dt); this._updatePool(this.sparks, dt);
    this.renderer.render(this.scene, this.cam);
  }

  _aim(px, py, pz, lx, ly, lz) { this.camTarget.set(px, py, pz); this.lookTarget.set(lx, ly, lz); }

  _step(dt) {
    const a = this.game.audio, r = this.result;
    switch (this.phase) {
      case 'fade':
        this._aim(0, 1.7, 7.5, 0, 6, -25);
        if (this.t > 0.45) this._setPhase('flyby');
        break;
      case 'flyby': {
        // Su-24 banks across the sky ≈67 m/s; the camera tracks it (clamped) — anticipation.
        const u = clamp(this.t / 2.1, 0, 1), jx = -70 + 140 * u;
        this.jet.position.set(jx, 24, -30); this.jet.rotation.z = 0.25; this.jet.rotation.y = -Math.PI / 2;
        if (this._jet && this._jet.set) this._jet.set(0.4 + 0.5 * (1 - Math.abs(u - 0.5) * 2), 0.7);
        this._aim(0, 2.0, 7.0, clamp(jx, -14, 14), 16, -20);
        if (this.t > 2.1) { this._stopJet(); this._setPhase('fall'); }
        break;
      }
      case 'fall': {
        // chuted descent with sway — camera eases to the landing spot.
        this.crate.position.y = Math.max(0, this.crate.position.y - 7.2 * dt);
        this.crate.position.x = Math.sin(this.t * 2.1) * 0.35; this.crate.rotation.y = this.t * 0.4;
        this.chute.position.copy(this.crate.position);
        this.chute.rotation.y = this.crate.rotation.y;
        if (this._jet && this._jet.set) this._jet.set(0.2, 0.2);
        this._aim(2.6, 1.9, 4.4, 0, this.crate.position.y, 0);
        if (this.crate.position.y <= 0.001) { this.crate.position.x = 0; this.crate.rotation.y = 0; this._setPhase('impact'); }
        break;
      }
      case 'impact': {
        // squash-and-settle + the canopy collapses and drifts away. NEVER skip this thud
        // (conditioning: weight = value, identical cue every open — Halo 5 / Overwatch lesson).
        const k = clamp(this.t / 0.25, 0, 1); this.crate.scale.y = 1 - 0.07 * Math.sin(k * Math.PI);
        this.chute.position.z -= dt * 1.2; this.chute.scale.multiplyScalar(1 - dt * 1.4);
        if (this.t > 0.5) this.chute.visible = false;
        this._aim(1.6, 1.1, 3.0, 0, 0.35, 0);
        if (this.t > 0.8) { this.crate.scale.y = 1; this._setPhase('pry'); }
        break;
      }
      case 'pry':
        // AUTO-PRY (owner request): the 3 latches pop themselves on a timer — no clicking.
        this._aim(1.05, 0.74, 1.9, 0, 0.32, 0);
        while (this._pryCount < 3 && this.t >= this._pryAt[this._pryCount]) this._autoPry();
        if (this._pryCount < 3) {
          this.pulse.material.opacity = 0.25 + 0.2 * Math.sin(this.t * 8);
          const al = this.latches[this._pryCount]; if (al) { this.pulse.position.set(al.position.x, al.position.y, al.position.z + 0.02); this.pulse.lookAt(this.cam.position); }
        } else this.pulse.material.opacity = 0;
        if (this._pryCount >= 3 && this.t > 1.75) this._setPhase('hold');
        break;
      case 'hold': {
        // "light roulette": crack + seam flicker through tier colours with decelerating swaps
        // and engineered near-misses (gold teases) — slot-machine near-miss effect.
        this._aim(0.85, 0.62, 1.5, 0, 0.4, 0);
        this._rouletteClock += dt;
        const seq = this._roulette, dur = HOLD_DUR[r.tier];
        let acc = 0, iv = 0.06, idx = 0;
        for (; idx < seq.length; idx++) { acc += iv; iv *= 1.32; if (this._rouletteClock < acc) break; }
        if (idx !== this._rouletteIdx && idx < seq.length) { this._rouletteIdx = idx; if (a.crateTick) a.crateTick(idx, seq.length); }
        const cur = seq[Math.min(idx, seq.length - 1)];
        this.crackLight.color.setHex(TIER_COLORS[cur]); this.crackLight.intensity = 1.6;
        if (this.lid) this.lid.rotation.x = -0.02 + 0.02 * Math.sin(this.t * 20);    // strains against the latch
        if (this.t > dur) this._setPhase('burst');
        break;
      }
      case 'burst': {
        // reveal is SNAPPY (dopamine peaks at anticipation, not receipt): lid swings, flash, shaft.
        this._aim(0.95, 0.7, 1.7, 0, 0.5, 0);
        const k = clamp(this.t / 0.22, 0, 1), e = 1 - Math.pow(1 - k, 3);
        if (this.lid) this.lid.rotation.x = -2.15 * e + (k >= 1 ? 0.2 * Math.sin((this.t - 0.22) * 26) * Math.exp(-(this.t - 0.22) * 8) : 0);
        this.burstLight.intensity = (5 - 3.5 * k);                  // shaft beam handled by the per-phase target lerp
        if (this.t > 0.5) { if (this.lid) this.lid.rotation.x = -1.95; this._setPhase('rise'); }
        break;
      }
      case 'rise': {
        // reward rises spinning in the shaft (length scales with tier — bigger arousal for rares).
        // Kept low + small so it reads clearly and isn't "too big / too high" (owner feedback).
        this._aim(0.62, 0.72, 1.62, 0, 0.52, 0);
        const dur = RISE_DUR[r.tier], k = clamp(this.t / dur, 0, 1), e = 1 - Math.pow(1 - k, 2);
        if (this._reward) { this._reward.position.y = 0.22 + 0.42 * e; this._reward.rotation.y = this.t * 1.4; }
        this.burstLight.intensity = 1.1 + Math.sin(this.t * 6) * 0.2;
        if (this.t > dur) this._setPhase('showcase');
        break;
      }
      case 'showcase':
        // peak-end: the trophy + name card is the memory; dupe/cash counter rises (loss-as-win).
        // Fully automatic — advances to the end buttons on its own (no click needed, owner request).
        this._aim(0.62, 0.72, 1.6, 0, 0.55, 0);
        this.burstLight.intensity = 0.9;
        if (this._reward) this._reward.rotation.y += dt * 0.9;
        this._tickCounter(dt);
        if (this.t > 1.8) this._setPhase('end');
        break;
      case 'end':
        this._aim(0.62, 0.72, 1.6, 0, 0.55, 0);
        if (this._reward) this._reward.rotation.y += dt * 0.7;
        break;
    }
  }

  // --- pry (automatic) -------------------------------------------------------
  _autoPry() {
    const i = this._pryCount; const lm = this.latches[i];
    this._pryCount++;
    if (lm) {
      lm.userData.popped = true; lm.userData.vy = 2.2; lm.userData.vx = i === 0 ? -1.2 : (i === 1 ? 1.2 : 1.0); lm.userData.vz = 1.8; lm.userData.spin = rr(-6, 6); lm.userData.t = 1;
      const px = lm.position.x, py = lm.position.y, pz = lm.position.z + 0.04;   // the snapping seal showers metal + wood
      this._emit(this.sparks, px, py, pz, 20, 0.9, 2.8, 0.6, 0xffe08a, 1.1);  // additive metal sparks, sprayed toward the camera
      this._emit(this.dust, px, py, pz, 14, 0.6, 1.3, 0.75, 0x9a784a, 0.6);   // splintered wood bits
      this._shake = this._reducedMotion ? 0 : Math.max(this._shake, 0.03);
    }
    // crack light steps 0→.5→1.2→2.2 in WARM WHITE — NO tier colour yet (kills anticipation if early).
    this.crackLight.color.setHex(0xffd9a0); this.crackLight.intensity = [0.5, 1.2, 2.2][Math.min(this._pryCount - 1, 2)];
    if (this.lid) this.lid.rotation.x = -0.015;                    // micro-jitter
    if (this.game.audio.crateLatch) this.game.audio.crateLatch(i);
    this._setHint('BREAKING THE SEALS… ' + this._pryCount + '/3');
  }
  _updateLatchDebris(dt) {
    if (!this.latches) return;
    for (const lm of this.latches) {
      if (!lm.userData.popped || lm.userData.t == null) continue;
      lm.userData.vy -= 6 * dt; lm.position.x += lm.userData.vx * dt; lm.position.y += lm.userData.vy * dt; lm.position.z += lm.userData.vz * dt;
      lm.rotation.z += lm.userData.spin * dt; lm.userData.t -= dt; if (lm.userData.t <= 0) lm.visible = false;
    }
  }

  // --- reveal ----------------------------------------------------------------
  _buildRoulette(tier, dur) {
    // Decelerating swaps; the LAST three are engineered: two higher-tier teases (a gold pass
    // when the result isn't legendary; for a legendary, tease epic/rare so gold lands as the shock),
    // then the REAL tier held ~0.45 s.
    const seq = []; let t = 0, iv = 0.06;
    while (t + iv < dur - 0.45) { seq.push(TIER_ORDER[(Math.random() * 4) | 0]); t += iv; iv *= 1.32; }
    const tease = tier === 'legendary' ? ['epic', 'rare'] : ['legendary', TIER_ORDER.filter((x) => x !== tier && x !== 'legendary')[0]];
    seq.push(tease[0], tease[1], tier);
    return seq;
  }
  _doBurst() {
    const a = this.game.audio, tier = this.result.tier, col = TIER_COLORS[tier];
    this.burstLight.color.setHex(col); this.burstLight.intensity = 6;
    if (this.elVig) { this.elVig.style.boxShadow = `inset 0 0 240px 80px rgba(0,0,0,.2), inset 0 0 160px 40px ${_css(col)}`; setTimeout(() => { if (this.elVig) this.elVig.style.boxShadow = ''; }, 220); }
    this._emit(this.sparks, 0, 0.35, 0.15, 40, 0.9, 2.4, 0.8, 0xc8a84b);     // straw
    if (!this._reducedMotion) this._shake = tier === 'legendary' ? 0.09 : (tier === 'epic' ? 0.05 : 0.02);
    if (a.crateBurst) a.crateBurst(tier);
    setTimeout(() => { if (this.active && a.crateStinger) a.crateStinger(tier); }, 50);
  }
  _ensureReward() {
    if (this._reward) return;
    const mesh = this._rewardMesh(this.result);
    this._fitReward(mesh, 0.40);                                   // smaller so it reads clearly (owner feedback)
    mesh.position.set(0, 0.22, 0); this.itemHolder.add(mesh); this._reward = mesh;
  }
  _rewardMesh(r) {
    if (r.kind === 'chipskin') return buildShowcaseChip(20, r.skin);   // a $20-red chip wearing the won portrait
    if (r.kind === 'cash' || r.kind === 'dupe') return this._coinStack();
    if (r.kind === 'weapon' || WEAPONS[r.key]) {                  // weapons + flashlight/binoculars (tools live in WEAPONS)
      const g = new THREE.Group(); const m = buildViewmodel(WEAPONS[r.key]); g.add(m);
      const sm = WEAPONS[r.key].spinMag; if (sm) { const mag = buildMag(sm); mag.position.set(sm.x, sm.y, sm.z); g.add(mag); }
      return g;
    }
    if (r.key === 'flare') return buildFlare();
    if (r.key === 'grenade') return this._grenadeMesh();
    try { const m = this.game.loot && this.game.loot._pickupMesh(r.key); if (m && this._nonEmpty(m)) return m; }
    catch (e) { console.warn('[crate] _pickupMesh threw for reward', r.key, '— coin-stack fallback', e); }   // surface a builder regression, don't hide it
    return this._coinStack();                                     // last-resort fallback (never blank)
  }
  _grenadeMesh() {                                                // F1-style frag (gadget reward with no _pickupMesh case)
    const b = new MeshBuilder();
    let g = new THREE.CylinderGeometry(0.085, 0.1, 0.2, 12); b.geo(g, 0, 0.02, 0, 0x3f4a2a); g.dispose();
    for (let i = 0; i < 3; i++) { g = new THREE.CylinderGeometry(0.105, 0.105, 0.012, 12); b.geo(g, 0, -0.05 + i * 0.06, 0, 0x2c331d); g.dispose(); }
    b.box(0.06, 0.05, 0.06, 0, 0.135, 0, 0x6a7079);              // fuze top
    b.box(0.02, 0.13, 0.055, 0.06, 0.075, 0, 0x9aa0a8);          // safety lever / spoon
    return new THREE.Mesh(b.build(), voxelMaterial());
  }
  _coinStack() {
    const b = new MeshBuilder();
    for (let i = 0; i < 3; i++) { const c = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16); b.geo(c, rr(-0.03, 0.03), 0.03 + i * 0.055, rr(-0.03, 0.03), 0xffd23f); c.dispose(); }
    b.box(0.34, 0.02, 0.16, 0, 0.21, 0, 0xdcd2a0);                // banknote slip on top
    return new THREE.Mesh(b.build(), voxelMaterial({ emissive: 0x3a2c08, emissiveIntensity: 0.25 }));
  }
  _nonEmpty(o) { const bb = new THREE.Box3().setFromObject(o); const s = bb.getSize(new THREE.Vector3()); return (s.x * s.y * s.z) > 1e-6; }
  _fitReward(mesh, target) {
    const bb = new THREE.Box3().setFromObject(mesh); const s = bb.getSize(new THREE.Vector3());
    const m = Math.max(s.x, s.y, s.z) || 1; mesh.scale.setScalar(target / m);
    const bb2 = new THREE.Box3().setFromObject(mesh); const c = bb2.getCenter(new THREE.Vector3());
    mesh.position.sub(c);                                          // recentre on the holder origin
  }

  // --- card + counter --------------------------------------------------------
  _showCard(instant) {
    const r = this.result;
    if (this.elTier) { this.elTier.textContent = TIER_NAMES[r.tier] + ' CRATE'; }
    if (this.elCard) { this.elCard.style.setProperty('--tier', _css(TIER_COLORS[r.tier])); this.elCard.classList.add('show'); }
    if (this.elName) this.elName.textContent = r.name;
    let sub = '';
    if (r.kind === 'weapon') sub = (WEAPONS[r.key] && WEAPONS[r.key].class === 'tool') ? 'NEW GEAR UNLOCKED' : 'NEW WEAPON UNLOCKED'; // flashlight/binoculars are tools, not weapons
    else if (r.kind === 'gadget') sub = 'NEW GEAR UNLOCKED';
    else if (r.kind === 'chipskin') sub = 'NEW CHIP SET UNLOCKED';
    else if (r.kind === 'cash') sub = '';
    else if (r.kind === 'dupe') sub = 'DUPLICATE · ' + (r.skin ? r.name : _nameOf(r.key));
    if (this.elSub) this.elSub.textContent = sub;
    // dupe/cash: rising counter (peak-end "loss disguised as a win"). instant → no animation.
    this._counterMax = (r.kind === 'cash' || r.kind === 'dupe') ? r.cash : 0;
    this._counter = instant ? this._counterMax : 0; this._counterTimer = 0; this._coinK = 0;
    this._updateBankLine();
  }
  _tickCounter(dt) {
    if (!this._counterMax || this._counter >= this._counterMax) return;
    this._counterTimer += dt; const dur = 0.9;
    this._counter = Math.min(this._counterMax, Math.round(this._counterMax * (this._counterTimer / dur)));
    if (this.elSub) this.elSub.textContent = (this.result.kind === 'dupe' ? 'DUPLICATE · +$' : '+$') + this._counter;
    if (this._counterTimer > this._coinK * 0.055) { this._coinK++; if (this.game.audio.coinTick) this.game.audio.coinTick(this._coinK); this._emit(this.sparks, 0, 0.6, 0, 1, 0.25, 1.4, 0.7, 0xffd23f); }
    this._updateBankLine();
  }
  _hideCard() { if (this.elCard) this.elCard.classList.remove('show'); }
  _setHint(t) { if (this.elHint) { this.elHint.textContent = t; this.elHint.classList.toggle('show', !!t); } }
  _showButtons(on) {
    if (this.elBtns) this.elBtns.classList.toggle('show', on);
    const left = (this.game.meta.crates | 0);
    if (this.elLeft) this.elLeft.textContent = left;
    if (this.elAgain) this.elAgain.style.display = left > 0 ? '' : 'none';
    if (on) this._updateBankLine();
  }
  _updateBankLine() { if (this.elCount) this.elCount.textContent = `CRATES ×${this.game.meta.crates | 0} · BANK $${this.game.meta.bank | 0}`; }
  _collectionLine() {
    const owned = this.game.meta.unlocked.filter((k) => WEAPONS[k] && !WEAPONS[k].melee && WEAPONS[k].class !== 'tool').length;
    const total = Object.keys(WEAPONS).filter((k) => WEAPONS[k] && !WEAPONS[k].melee && WEAPONS[k].class !== 'tool').length;
    return `ARMORY: ${owned}/${total} GUNS`;
  }

  // --- input + transitions ---------------------------------------------------
  // The ceremony is fully automatic now — canvas clicks do nothing. Esc skips to the end,
  // and the OPEN AGAIN / BACK buttons handle navigation.
  _onClick() { /* intentionally inert */ }
  _again() {
    const g = this.game, m = g.meta;
    if (!((m.crates | 0) > 0)) { g.audio.noMoney(); return; }
    const result = rollCrateReward(g); g._saveMeta();               // chained open: roll handled here, NOT via openCrate (which guards state==='crate')
    this.chain++;
    this.open(result);                                              // full ceremony incl. the fly-over, every time
  }
  finishImmediately() {
    // §9.1 — reward was committed + saved pre-animation. Snap open, show card, NEVER re-roll/refund.
    if (!this.active || this._finishing) return; this._finishing = true;
    this._stopJet(); if (this.game.audio.crateWindStop) this.game.audio.crateWindStop();
    if (this.lid) this.lid.rotation.x = -1.95;
    if (this.crate) { this.crate.visible = true; this.crate.position.set(0, 0, 0); this.crate.scale.y = 1; }
    if (this.chute) this.chute.visible = false;
    for (const lm of this.latches) lm.visible = false;
    this.shaft.material.opacity = 0.10; this._shaftTarget = 0.10; this.spot.intensity = 52; this._spotTarget = 52;
    this.burstLight.color.setHex(TIER_COLORS[this.result.tier]); this.burstLight.intensity = 0.9;
    this._ensureReward(); if (this._reward) this._reward.position.y = 0.6;
    this._showCard(true);
    this._setPhase('end');
  }
  _stopJet() { if (this._jet && this._jet.stop) { try { this._jet.stop(); } catch (e) {} } this._jet = null; if (this.jet) this.jet.visible = false; }

  close() {
    this.active = false; this._finishing = false;
    this._stopJet();
    if (this.game.audio.crateWindStop) this.game.audio.crateWindStop();
    this.game.audio.setMusicDuck(1);                                // restore the jukebox
    this._hideCard(); this._showButtons(false); this._setHint('');
    if (this.canvas) this.canvas.classList.remove('lit');
    this._disposeActors();
    // back to the shop on the crate tile (returnTo 'menu'|'lobby' preserved — never touched here).
    const shop = this.game.shop;
    if (shop) { shop.open(shop.returnTo); shop.selected = CRATE_DEF.key; shop.activeCat = 'crate'; shop._render(); }
  }
  // §2.3.4 — called by Game._frame if the state got hijacked (e.g. co-op host starts a run)
  // while a ceremony was live. Reward already granted; just tear down silently.
  abort() {
    this.active = false; this._finishing = false;
    this._stopJet(); if (this.game.audio.crateWindStop) this.game.audio.crateWindStop();
    this.game.audio.setMusicDuck(1);
    this._hideCard(); this._showButtons(false); this._setHint('');
    if (this.canvas) this.canvas.classList.remove('lit');
    this._disposeActors();
  }

  // --- shop preview ----------------------------------------------------------
  buildPreviewMesh() { return buildLootCrate().root; }
  get def() { return CRATE_DEF; }
}

// hex int → css color string (for DOM tier styling)
function _css(hex) { return '#' + (hex & 0xffffff).toString(16).padStart(6, '0'); }
