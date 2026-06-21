// fire.js — FIRE SPREAD system (Phase 8 of the playable-demo engine overhaul).
//
// Far-Cry-2-style hybrid, deterministic + host-authoritative:
//   • A registered ignition SOURCE (a molotov puddle, a rocket fire, …) ignites the flammables
//     it sits near — sources are source-agnostic emitters (addEmitter), not hardcoded weapons.
//   • Fire spreads tree↔tree, tree↔grass and grass↔grass by an EMBER CHAIN: every burning
//     source, on each fixed tick, rolls to ignite the nearest untouched flammable within a
//     spread radius — line-of-sight gated against WALLS (not vegetation) so fire can't jump
//     a brick wall but does creep through a stand of trees / across the grass floor.
//   • Fire DIES at stone for free: brick/concrete/steel/glass/sheetmetal have MATERIALS.fuel
//     === 0, so they are never enumerated as flammable and never ignite — the front simply
//     starves at any masonry. (Walls also block the spread ray.)
//   • A burning tree chars after a burn-through time (forest.charTree → trunk dhp halved, so
//     a charred tree SNAPS easier) and topples (forest.fellTree) when it has fully burned out.
//
// PERF / DETERMINISM contract (north-star §"Perf gates" + Phase 8):
//   • Runs on its OWN fixed accumulator (simclock ~10 Hz) — never raw variable dt — so the
//     ember chain is dt-independent and replayable on every co-op peer.
//   • CAPS: ≤ OBJ_CAP burning objects (trees + building wood) and ≤ GRASS_CAP burning grass
//     cells. Overflow REFUSES the new ignition (logged, throttled). Bounded fires ⇒ bounded
//     spread work.
//   • Flames render through ONE dedicated instanced pool (FlamePool — clone of the
//     DebrisPool pattern, ~1 extra draw call) so the shared 800-particle effects pool is
//     never exhausted, and there is ONE aggregate flickering light at the fire centroid
//     (NOT one PointLight per fire).
//   • Seeded RNG (util.makeRNG, off the terrain seed) → identical spread on every peer.
//
// Wiring: game.js constructs `game.fire = new FireManager(game)` and calls fire.update(dt)
// in _updatePlaying. Inert (no scene objects, update no-ops) on flat maps (no terrain) so
// arena/steppe are byte-unaffected — the legacy molotov DoT in game.js still runs there.

import * as THREE from 'three';
import { makeRNG } from './util.js';
import { MATERIALS, rayAABB } from './destruct.js';
import { makeClock } from './simclock.js';
import { nearestIgnitable } from './fire-spread.js';

// ── tunables ──────────────────────────────────────────────────────────────────────
const TICK_HZ        = 10;          // fire sim rate (fixed step)
const OBJ_CAP        = 24;          // max concurrent burning objects (trees + building wood)
const GRASS_CAP      = 48;          // max concurrent burning grass cells
const SEC_PER_FUEL   = 0.9;         // burn duration = MATERIALS.fuel × this (trunk 10 → 9 s)
// A tree's leaves die in two stages over the burn (gradual, not instant): first they BLACKEN in
// place (char, still leafy), then later they DROP and the tree goes bare. On burnout only FELL_PCT%
// topple — the rest stay up as standing burnt snags.
const LEAF_BLACKEN_FRAC = 0.30;     // at this share of the burn the foliage chars black (forest.charTree)
const LEAF_DROP_FRAC    = 0.72;     // at this share the blackened leaves drop → bare snag (forest.dropLeaves)
const FELL_PCT          = 75;       // % of fire-killed trees that TOPPLE on burnout; the rest remain standing burnt (payoff: a fire LEVELS a stand)
// per-kind spread behaviour: radius (m) + per-tick ignite probability + flame visual size + how
// many flame billboards the fire owns (a tree spans many → a climbing column; grass/wood need 2).
const KIND = {
  tree:  { radius: 6.0, chance: 0.45, flameW: 1.0,  flameH: 3.0, slots: 5 },
  grass: { radius: 4.5, chance: 0.55, flameW: 0.85, flameH: 0.8, slots: 2 },
  wood:  { radius: 4.0, chance: 0.30, flameW: 0.75, flameH: 1.5, slots: 2 },
};
const EMITTER_MARGIN = 1.2;         // a persistent fire-source ignites flammables within radius + this
// A tree fire GROWS: a thin band at the impact point climbs up AND down to engulf the whole trunk+
// canopy over this share of the burn, then holds full. The upper TREE_CANOPY_FRAC of the tree is
// "foliage" → flames there bloom wider into a fireball (the canopy catches).
const TREE_GROW_FRAC   = 0.55;
const TREE_CANOPY_FRAC = 0.55;

// ── dedicated instanced flame pool (one draw call, ~no shared-pool cost) ────────────
class FlamePool {
  constructor(scene, cap) {
    this.cap = cap;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    // Additive, depth-write-off, fog-off → flames glow and never z-fight the foliage.
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
    this.free = [];
    for (let i = cap - 1; i >= 0; i--) { this.free.push(i); this._hide(i); }
    this.mesh.instanceColor && (this.mesh.instanceColor.needsUpdate = true);
  }
  _hide(i) { this.dummy.position.set(0, -999, 0); this.dummy.scale.setScalar(0.0001); this.dummy.rotation.set(0, 0, 0); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix); }
  acquire() { return this.free.length ? this.free.pop() : -1; }
  release(i) { if (i < 0) return; this._hide(i); this.free.push(i); this.mesh.instanceMatrix.needsUpdate = true; }
  set(i, x, y, z, sx, sy, sz, c) {
    if (i < 0) return;
    this.dummy.position.set(x, y, z); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.setColorAt(i, this.col.set(c));
  }
  flush() { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  dispose() { this.mesh.parent && this.mesh.parent.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

export class FireManager {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.scene = game.engine.scene;

    this.fires = [];          // active fire records (see ignite())
    this.emitters = [];       // persistent ignition SOURCES (source-agnostic — see addEmitter)
    this._pendingIgnite = []; // co-op client: host 'fireignite' for a forest prop not yet lazily
                              //   built — { id, owner, seed, tries }, retried in update() until live
    this._objN = 0;           // burning object count (trees + wood) — capped at OBJ_CAP
    this._grassN = 0;         // burning grass-cell count — capped at GRASS_CAP
    this._warned = 0;         // throttle the "fire cap reached" log
    this._clock = makeClock({ step: 1 / TICK_HZ, maxDt: 0.05 });

    // Inert on flat maps: no flammables, no scene objects, update() no-ops → arena/steppe
    // are unaffected and the legacy molotov DoT (game.js) keeps owning fire there.
    this.active = !!(this.world && this.world.hasTerrain && this.world.terrain);
    if (!this.active) return;

    const seed = ((this.world.terrain.seed || 1) ^ 0x1f1eba5e) >>> 0;
    this.rng = makeRNG(seed);
    this.flames = new FlamePool(this.scene, OBJ_CAP * KIND.tree.slots + GRASS_CAP * KIND.grass.slots + 16);
    this.light = new THREE.PointLight(0xff5a26, 0, 40, 1.5);
    this.light.position.set(0, -999, 0);
    this.scene.add(this.light);

    // scratch
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
  }

  // ── PUBLIC API ───────────────────────────────────────────────────────────────────
  // Ignite the nearest flammable to `at` within `radius` (default 4 m). Accepts a
  // THREE.Vector3 / {x,y,z} / [x,y,z]. Returns the fire record, or null (nothing in range,
  // wall-occluded, or cap reached). This is what molotov/bazooka and the verification call.
  igniteAt(at, radius = 4, seed = null, startY = null) {
    if (!this.active) return null;
    const p = v3(at);
    const cands = this._candidates();
    const target = nearestIgnitable(p, cands, radius, (c) => this._wallBetween(p[0], p[2], c.cx, c.cz, p[1] + 0.5));
    if (!target) return null;
    return this.ignite(target.part, seed, startY == null ? p[1] : startY);
  }

  // Ignite one specific flammable part. `seed` derives the deterministic fall/char seed. `startY`
  // (optional) is the WORLD height the fire starts at — molotov/shot impact Y — so a tree catches
  // where it was hit (low trunk hit → starts low; defaults to the part base) and grows from there.
  ignite(part, seed = null, startY = null) {
    if (!this.active || !part || part.dead || part._fire) return null;
    const mat = MATERIALS[part.dmat];
    if (!mat || mat.fuel <= 0) return null;               // fuel 0 ⇒ never ignites (stone)
    const kind = part.dmat === 'grass' ? 'grass' : (part.dmat === 'trunk' ? 'tree' : 'wood');
    // CAPS — refuse + log (throttled) when full.
    if (kind === 'grass' ? this._grassN >= GRASS_CAP : this._objN >= OBJ_CAP) {
      if (this._warned++ < 4) console.log(`[fire] cap reached (${kind}) — ignition refused (obj ${this._objN}/${OBJ_CAP}, grass ${this._grassN}/${GRASS_CAP})`);
      return null;
    }
    if (seed == null) seed = ((part.dpart * 2654435761) ^ 0x9e37) >>> 0;
    const cx = (part.min[0] + part.max[0]) / 2, cz = (part.min[2] + part.max[2]) / 2;
    const baseY = part.min[1];
    const k = KIND[kind];
    const rec = {
      part, owner: part.downer, kind, seed,
      cx, cz, baseY, midY: baseY + Math.min(1.2, (part.max[1] - baseY) * 0.5),
      age: 0, duration: mat.fuel * SEC_PER_FUEL,
      blackened: false, bared: false, slots: [],
    };
    if (kind === 'tree') {
      // Full tree height: ForestDemo tree records carry .height (the collision box is a short trunk
      // column ≤5 m, NOT the canopy) — fall back to the box height × 3 for non-ForestDemo trees.
      const h = (rec.owner && rec.owner.height) || ((part.max[1] - baseY) * 3) || 12;
      rec.treeTop = baseY + h;
      rec.startY = Math.max(baseY + 0.2, Math.min(rec.treeTop - 0.4, startY == null ? baseY : startY));
    }
    for (let s = 0; s < k.slots; s++) rec.slots.push(this.flames.acquire());
    part._fire = rec;
    this.fires.push(rec);
    if (kind === 'grass') this._grassN++; else this._objN++;

    // Host-auth co-op sync (Phase 10 owns the full handler): broadcast WHICH part lit + its
    // seed. Forest/building parts are seeded identically on every peer, so `dpart` resolves
    // to the same part everywhere; clients just call fire.igniteById(id, seed) to mirror.
    const mp = this.game.mp;
    if (mp && mp.active && mp.isHost && mp.net) {
      try { mp.net.send('fireignite', { id: part.dpart, owner: rec.owner === this.world.demoBuilding ? 'b' : 't', seed }); } catch (e) {}
    }
    return rec;
  }

  // ── persistent ignition-SOURCE registry (source-agnostic) ─────────────────────────
  // A registered emitter re-ignites the flammables it sits near on every host tick — so a
  // burning AREA (a molotov puddle, a future fougasse, a wreck fire…) starts the ember chain
  // without FireManager knowing what kind of source it is. Shape:
  //   { pos: THREE.Vector3 | {x,y,z} | [x,y,z], radius:number, alive:()=>bool, seed?:number }
  // Each tick: skip if alive() is false, else igniteAt(pos, radius + EMITTER_MARGIN, seed).
  // Instant one-shot sources (a rocket impact) DON'T register — they just call igniteAt once.
  addEmitter(em) { if (em && this.emitters.indexOf(em) < 0) this.emitters.push(em); return em; }
  removeEmitter(em) { const i = this.emitters.indexOf(em); if (i >= 0) this.emitters.splice(i, 1); }

  // Mirror a host ignition on a client (Phase 10 net handler calls this).
  // `owner` ('b' building / 't' forest) DISAMBIGUATES the id: forest part-ids and building
  // part-ids are separate counters that COLLIDE (both start at 1), so a bare id is ambiguous.
  // Dispatch on owner → search ONLY that source's flammable parts, never a global id match.
  igniteById(id, owner, seed) {
    if (!this.active) return null;
    const r = this._igniteFound(id, owner, seed);
    if (r) return r;
    // Forest props build lazily (forest._ensureProps waits on async specs) — a 'fireignite' (live
    // mirror or late-join snapshot) can arrive before the part exists. Defer + retry in update()
    // so the fire isn't silently lost (buildings build synchronously, so a 'b' miss is a real miss).
    if (owner !== 'b' && !this._pendingIgnite.some(p => p.id === id)) this._pendingIgnite.push({ id, owner, seed, tries: 0 });
    return null;
  }

  // Attempt-only ignition by part id — resolves the id against the owner's flammable parts and
  // ignites if found, WITHOUT deferring on a miss (igniteById adds the defer; the retry drain does not).
  _igniteFound(id, owner, seed) {
    const src = owner === 'b'
      ? (this.world.demoBuilding && this.world.demoBuilding.flammableParts ? this.world.demoBuilding.flammableParts() : [])
      : (this.game.forest && this.game.forest.flammableParts ? this.game.forest.flammableParts() : []);
    for (const part of src) if (part.dpart === id) return this.ignite(part, seed);
    return null;
  }

  // Late-join snapshot: the currently-burning parts as host→client ignition descriptors
  // (same {id, owner, seed} shape as the live 'fireignite' broadcast). A fresh joiner replays
  // these via igniteById to light the fires the host already has going.
  netSnapshot() {
    const out = [];
    for (const f of this.fires) if (f.part) out.push({ id: f.part.dpart, owner: f.owner === this.world.demoBuilding ? 'b' : 't', seed: f.seed });
    return out;
  }

  activeCount() { return this.fires.length; }

  clear() {
    if (!this.active) return;
    for (const f of this.fires) { if (f.part) f.part._fire = null; for (const s of f.slots) this.flames.release(s); }
    this.fires.length = 0; this.emitters.length = 0; this._pendingIgnite.length = 0; this._objN = 0; this._grassN = 0;
    this.light.intensity = 0; this.light.position.set(0, -999, 0);
    this.flames.flush();
    this._clock.reset();
  }

  // ── per-frame entry (variable dt in; fixed-step sim inside) ─────────────────────────
  update(dt) {
    if (!this.active) return;
    // Retry deferred prop ignitions (client mirror landed before forest._ensureProps built the part).
    // Drop on success, or expire after ~10 s (600 frames) so a genuinely-bad id can't pin a slot.
    for (let i = this._pendingIgnite.length - 1; i >= 0; i--) {
      const pi = this._pendingIgnite[i];
      if (this._igniteFound(pi.id, pi.owner, pi.seed) || ++pi.tries > 600) this._pendingIgnite.splice(i, 1);
    }
    const hostSim = !this.game.mp.active || this.game.mp.isHost;  // only the host drives spread/burn
    if (hostSim) this._clock.advance(dt, () => this._tick());
    else this._clientAge(dt);                                      // clients: fade+retire flame visuals only
    this._renderFlames(dt);                                        // visual flicker every frame
  }

  // CLIENT-ONLY visual ager. Clients never run _tick (spread/char/fell are host-authoritative
  // and arrive as synced events), but their mirrored 'fireignite' flames must still fade out and
  // free their pool slots — otherwise a client's flames would burn forever. The structural
  // consequences (tree char/fell, grass/door consume) come from the host as 'forestfx'/'bdestroy',
  // so here we ONLY retire the visual (no char/fell/consume).
  _clientAge(dt) {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]; f.age += dt;
      if (f.age >= f.duration) {
        if (f.part) f.part._fire = null;
        for (const s of f.slots) this.flames.release(s); f.slots.length = 0;
        if (f.kind === 'grass') this._grassN--; else this._objN--;
        this.fires.splice(i, 1);
      }
    }
  }

  // ── one fixed fire tick ─────────────────────────────────────────────────────────────
  _tick() {
    const step = this._clock.step;

    // 1. Persistent ignition SOURCES (the emitter registry) light the flammables they sit near,
    //    so the ember chain starts from whatever burning area is registered — molotov puddle,
    //    rocket fire, a future fougasse… FireManager is source-agnostic here (no weapon knowledge).
    for (const em of this.emitters) {
      if (em.alive && !em.alive()) continue;
      const p = em.pos;
      const px = Array.isArray(p) ? p[0] : p.x, py = Array.isArray(p) ? p[1] : p.y, pz = Array.isArray(p) ? p[2] : p.z;
      const seed = (em.seed != null) ? em.seed : (((px * 73856093) ^ (pz * 19349663)) >>> 0);
      // em.startY = the ORIGINAL impact height (molotov: where the bottle struck, before the puddle
      // dropped to the floor) → a trunk hit lights the tree at that height; defaults to the puddle Y.
      this.igniteAt([px, py, pz], (em.radius || 4) + EMITTER_MARGIN, seed, em.startY != null ? em.startY : py);
    }

    // 2. Advance every active fire: age, char/fell trees, spread the ember chain, burn out.
    let cands = null;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.age += step;

      if (f.kind === 'tree') {
        const fr = this.game.forest;
        if (!f.blackened && f.age >= f.duration * LEAF_BLACKEN_FRAC) {       // leaves char black, still on the tree
          f.blackened = true;
          try { fr && fr.charTree(f.owner); } catch (e) { console.warn('[fire] charTree failed', e); }
        }
        if (!f.bared && f.age >= f.duration * LEAF_DROP_FRAC) {              // blackened leaves drop → bare snag
          f.bared = true;
          try { fr && fr.dropLeaves && fr.dropLeaves(f.owner); } catch (e) { console.warn('[fire] dropLeaves failed', e); }
        }
      }

      // ember chain — roll to ignite the nearest untouched flammable in range, LOS-gated.
      const k = KIND[f.kind];
      if (this.rng() < k.chance) {
        if (!cands) cands = this._candidates();
        const from = [f.cx, f.midY, f.cz];
        const target = nearestIgnitable(from, cands, k.radius, (c) => this._wallBetween(f.cx, f.cz, c.cx, c.cz, f.midY));
        if (target) { const r = this.ignite(target.part, (f.seed * 1664525 + 1013904223) >>> 0); if (r) { target.taken = true; } }
      }

      if (f.age >= f.duration) { this._burnout(f); this.fires.splice(i, 1); }
    }
  }

  // A fire that has consumed its fuel: char+fell the tree, consume the grass/wood, free slots.
  _burnout(f) {
    if (f.part) f.part._fire = null;
    for (const s of f.slots) this.flames.release(s); f.slots.length = 0;
    if (f.kind === 'grass') this._grassN--; else this._objN--;

    try {
      if (f.owner && f.owner.prop) {                          // a forest prop (log/stump/debris)
        const fr = this.game.forest;
        if (fr && typeof fr.consumeProp === 'function') fr.consumeProp(f.owner);
        else if (f.part) f.part.dead = true;
      } else if (f.kind === 'tree') {
        const fr = this.game.forest;
        if (fr && f.owner && f.owner.standing) {
          if (!f.blackened) fr.charTree(f.owner);
          // ~FELL_PCT% of fire-killed trees TOPPLE (charred split); the rest stay up as bare burnt snags.
          if ((f.seed >>> 7) % 100 < FELL_PCT) {
            fr.fellTree(f.owner, null, f.seed);
          } else {
            if (!f.bared && fr.dropLeaves) fr.dropLeaves(f.owner);
            if (fr.burnoutSnag) fr.burnoutSnag(f.owner);
          }
        }
      } else if (f.kind === 'grass') {
        // grass is consumed — route through forest so the host broadcasts the consume (co-op).
        const fr = this.game.forest, rec = f.owner;
        if (fr && typeof fr.consumeGrass === 'function' && rec) fr.consumeGrass(rec);
        else { f.part.dead = true; if (rec && rec.inst && rec.inst.mesh) { rec.inst.mesh.setMatrixAt(rec.inst.index, new THREE.Matrix4().makeScale(0, 0, 0)); rec.inst.mesh.instanceMatrix.needsUpdate = true; } }
      } else {                                               // building wood (door) — burns through
        // route through the building so the host broadcasts the part death (co-op 'bdestroy').
        const b = f.owner;
        if (b && typeof b.netKillPart === 'function') b.netKillPart(f.part.dpart);
        else { f.part.dead = true; if (b && typeof b._refresh === 'function') b._refresh(); }
      }
    } catch (e) {
      // Non-fatal to the fire sim (the flame is already retired), but a throw here leaves the
      // prop/tree/door alive forever with part._fire null → it can never re-ignite or re-burnout.
      // Surface it rather than corrupt state silently.
      console.warn('[fire] burnout consume failed', e);
    }
  }

  // ── flame + aggregate-light rendering (every frame; not part of the deterministic sim) ─
  _renderFlames(dt) {
    if (!this.fires.length) { if (this.light.intensity !== 0) { this.light.intensity = 0; this.light.position.set(0, -999, 0); } return; }
    const t = performance.now() * 0.001;
    let cxs = 0, cys = 0, czs = 0;
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i], k = KIND[f.kind];
      const fade = f.age > f.duration - 1.2 ? Math.max(0.15, (f.duration - f.age) / 1.2) : 1;

      if (f.kind === 'tree') {
        // GROWING FRONT: a thin band at the impact point (startY) climbs up AND down to engulf the
        // whole tree over TREE_GROW_FRAC of the burn, then holds full → the fire visibly grows and
        // progressively consumes the tree from where the molotov struck.
        const grow = Math.min(1, f.age / Math.max(0.1, f.duration * TREE_GROW_FRAC));
        const span = grow * grow * (3 - 2 * grow);                 // smoothstep ease-in/out
        const lo = f.startY + (f.baseY - f.startY) * span;
        const hi = f.startY + (f.treeTop - f.startY) * span;
        const n = f.slots.length;
        const segH = Math.max(1.5, (hi - lo) / n * 1.8);
        let cy = 0;
        for (let j = 0; j < n; j++) {
          const u = (j + 0.5) / n;                                  // 0 = front bottom … 1 = front top
          const fy = lo + (hi - lo) * u;
          const flick = 0.74 + Math.sin(t * 12 + i * 1.7 + j * 2.1) * 0.26;
          const sway = Math.sin(t * 6 + i + j * 1.3) * 0.14;
          // canopy bloom: flames in the upper TREE_CANOPY_FRAC of the tree widen into a fireball.
          const heightFrac = (fy - f.baseY) / Math.max(1, f.treeTop - f.baseY);
          const canopy = Math.max(0, (heightFrac - (1 - TREE_CANOPY_FRAC)) / TREE_CANOPY_FRAC);
          const w = k.flameW * (0.7 + 1.8 * canopy) * (0.55 + 0.45 * fade) * (0.6 + 0.4 * span);
          const hh = segH * flick * (0.55 + 0.45 * fade);
          const col = canopy > 0.4 ? 0xff9326 : (u < 0.34 ? 0xffc24a : 0xff5a1e); // hot base · orange trunk · bright canopy
          this.flames.set(f.slots[j], f.cx + sway, fy + hh * 0.2, f.cz + sway * 0.5, w, hh, w, col);
          cy += fy;
        }
        cxs += f.cx; cys += cy / Math.max(1, n); czs += f.cz;
      } else {
        // grass / building wood — a small base flame (two billboards: orange tongue + hot core).
        const flick = 0.78 + Math.sin(t * 13 + i * 1.7) * 0.22;
        const sway = Math.sin(t * 7 + i) * 0.12;
        const w = k.flameW * (0.55 + 0.45 * fade);
        const h = k.flameH * flick * (0.5 + 0.5 * fade);
        this.flames.set(f.slots[0], f.cx + sway, f.baseY + h * 0.5, f.cz + sway * 0.5, w, h, w, 0xff6a1e);
        if (f.slots.length > 1) this.flames.set(f.slots[1], f.cx - sway * 0.4, f.baseY + h * 0.42, f.cz - sway * 0.3, w * 0.55, h * 0.7, w * 0.55, 0xffd24a);
        cxs += f.cx; cys += f.baseY + h * 0.4; czs += f.cz;
      }
    }
    this.flames.flush();
    // ONE aggregate light at the fire centroid; intensity grows (sub-linearly) with fire count.
    const n = this.fires.length;
    this.light.position.set(cxs / n, cys / n, czs / n);
    const target = Math.min(9, 2.2 + Math.sqrt(n) * 2.4) * (0.8 + Math.sin(t * 18) * 0.18);
    this.light.intensity += (target - this.light.intensity) * Math.min(1, dt * 8);
    this.light.distance = Math.min(60, 18 + n * 1.5);
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────
  // Current flammable candidates from forest + building, each with centre + taken flag.
  _candidates() {
    const out = [];
    const push = (parts) => { for (const part of parts) out.push({ part, cx: (part.min[0] + part.max[0]) / 2, cz: (part.min[2] + part.max[2]) / 2, taken: !!part._fire }); };
    const fr = this.game.forest; if (fr && fr.flammableParts) push(fr.flammableParts());
    const b = this.world.demoBuilding; if (b && b.flammableParts) push(b.flammableParts());
    return out;
  }

  // LOS gate: does a SOLID WALL sit on the segment A→B? Vegetation (trunk/grass boxes) is
  // skipped so fire creeps through a stand of trees, but masonry/steel/glass building walls
  // stop the ember (no jumping walls; the front also starves at stone for free).
  _wallBetween(ax, az, bx, bz, y) {
    const grid = this.world.grid; if (!grid || !grid.queryAABB) return false;
    const dx = bx - ax, dz = bz - az; const dist = Math.hypot(dx, dz);
    if (dist < 0.9) return false;
    const dir = [dx / dist, 0, dz / dist], o = [ax, y, az];
    const cands = grid.queryAABB(Math.min(ax, bx) - 0.5, Math.min(az, bz) - 0.5, Math.max(ax, bx) + 0.5, Math.max(az, bz) + 0.5);
    for (const box of cands) {
      if (box.tree || box.dmat === 'trunk' || box.dmat === 'grass') continue;   // ignore vegetation
      const t = rayAABB(o, dir, [box.min.x, box.min.y, box.min.z], [box.max.x, box.max.y, box.max.z]);
      if (t !== null && t > 0.3 && t < dist - 0.3) return true;
    }
    return false;
  }
}

// Coerce THREE.Vector3 / {x,y,z} / [x,y,z] → [x,y,z].
function v3(p) {
  if (Array.isArray(p)) return [p[0], p[1], p[2]];
  return [p.x, p.y, p.z];
}
