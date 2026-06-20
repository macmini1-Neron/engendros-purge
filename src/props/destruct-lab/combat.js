// combat.js — minimal combatants for the destruction sandbox: shootable dummy "soldiers" with
// line-of-sight, cover-seeking, and environmental-kill hooks. The POINT is to turn destruction into
// a VERB — LoS runs against the live building meshes (which rebuild without dead cells), so breaching
// a wall opens a sightline and a dust cloud blocks it, for free. NOT a combat AI (no return fire —
// that's a later feature); these are reactive targets that prove mechanics #1–#6.
//
// Reusable / game-portable: depends only on THREE + util MeshBuilder/voxelMaterial. The demo feeds it
// a ctx each frame ({ playerPos, dust, tankAABB, ... }); nothing here knows about the demo globals.
import * as THREE from 'three';
import { MeshBuilder, voxelMaterial } from '../../util.js';

const _ray = new THREE.Raycaster();
const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _dir = new THREE.Vector3(), _v = new THREE.Vector3();
let _mat = null;
const mat = () => (_mat || (_mat = voxelMaterial()));

// merged humanoid (~1.8 m), ONE mesh per soldier so the demo's non-recursive raycast hits it
function soldierGeo(color) {
  const mb = new MeshBuilder(), leg = 0x2c3a1f, skin = 0xc7b08c;
  mb.box(0.16, 0.85, 0.18, -0.11, 0.45, 0, leg); mb.box(0.16, 0.85, 0.18, 0.11, 0.45, 0, leg);   // legs
  mb.box(0.46, 0.62, 0.26, 0, 1.18, 0, color);                                                    // torso
  mb.box(0.20, 0.24, 0.22, 0, 1.62, 0, skin);                                                     // head
  mb.box(0.12, 0.5, 0.12, -0.30, 1.18, 0.04, color); mb.box(0.12, 0.5, 0.12, 0.30, 1.18, 0.04, color); // arms
  return mb.build();
}

export class Combatants {
  // { scene, destructibles: BuildingDestruct[], debris: DebrisPool }
  constructor({ scene, destructibles, debris }) {
    this.scene = scene; this.destructibles = destructibles; this.debris = debris;
    this.soldiers = []; this._tick = 0; this.smoke = [];
  }

  // #4 dust/smoke concealment: a lingering cloud (from a breach/collapse) that BLOCKS line-of-sight
  // both ways for a few seconds — push through it and the AI loses you. cur = current LoS radius.
  addSmoke(x, y, z, r = 3.4, life = 4) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbcb09a, transparent: true, opacity: 0.5, depthWrite: false }));
    y = Math.max(0.7, y); mesh.position.set(x, y, z); mesh.scale.setScalar(r * 0.45); this.scene.add(mesh);
    const sm = { mesh, x, y, z, r, cur: r * 0.45, life, max: life }; this.smoke.push(sm); return sm;
  }
  _segSphere(a, b, cx, cy, cz, r) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const ab2 = abx * abx + aby * aby + abz * abz || 1;
    let t = ((cx - a.x) * abx + (cy - a.y) * aby + (cz - a.z) * abz) / ab2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = a.x + abx * t - cx, dy = a.y + aby * t - cy, dz = a.z + abz * t - cz;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }

  spawn(x, z, opts = {}) {
    const s = {
      id: this.soldiers.length + 1, pos: new THREE.Vector3(x, 0, z), home: new THREE.Vector3(x, 0, z),
      eyeY: 1.55, hp: opts.hp ?? 100, state: 'post', seesPlayer: false, coverRef: null, indoors: !!opts.indoors,
    };
    s.mesh = new THREE.Mesh(soldierGeo(opts.color ?? 0x6a5b3a), mat());
    s.mesh.castShadow = s.mesh.receiveShadow = true; s.mesh.position.copy(s.pos);
    s.mesh.userData = { soldier: s };
    this.scene.add(s.mesh); this.soldiers.push(s); return s;
  }

  alive() { return this.soldiers.filter((s) => s.state !== 'dead'); }
  meshes() { return this.alive().map((s) => s.mesh); }            // fire() raycast targets

  hurt(s, dmg, source) {
    if (!s || s.state === 'dead') return;
    s.hp -= dmg;
    if (this.debris) this.debris.burst('rubble', [s.pos.x, s.eyeY, s.pos.z], (s.id * 977 + s.hp) | 0, 3);
    if (s.hp <= 0) this.kill(s, source);
  }
  kill(s, source) {
    if (s.state === 'dead') return;
    s.state = 'dead'; s.hp = 0; s.seesPlayer = false; s.killedBy = source || 'shot';
    s.mesh.rotation.z = (Math.PI / 2) * (s.id % 2 ? 1 : -1);    // topple the body
    s.mesh.position.set(s.pos.x, 0.25, s.pos.z);
    if (this.debris) this.debris.burst('rubble', [s.pos.x, 0.8, s.pos.z], (s.id * 1597) | 0, 5);
  }

  // segment LoS from `from` (Vector3) to `to` (Vector3): blocked if any LIVE building mesh sits
  // between them. (Dust occlusion is layered in by mechanic #4.)
  canSee(from, to) {
    _from.copy(from); _dir.copy(to).sub(_from);
    const dist = _dir.length(); if (dist < 1e-3) return true;
    _dir.divideScalar(dist);
    _ray.set(_from, _dir); _ray.near = 0; _ray.far = dist - 0.35;   // stop short of the target's own surface
    const targets = this.destructibles.flatMap((bd) => bd.meshes());
    if (_ray.intersectObjects(targets, false).length) return false;   // a wall blocks
    for (const sm of this.smoke) if (this._segSphere(from, to, sm.x, sm.y, sm.z, sm.cur * 0.9)) return false;   // smoke blocks
    return true;
  }

  // #2 destruction = cover: stand behind the nearest cover whose far side BREAKS LoS to the player.
  // When you blow that cover away (the canSee check stops returning false there) the soldier is
  // exposed again and re-seeks. cover = world AABBs the demo passes in ctx.coverAABBs.
  _bestCover(s, pp, cover) {
    let best = null, bestD = Infinity;
    for (const c of cover) {
      const cx = (c.min[0] + c.max[0]) / 2, cz = (c.min[2] + c.max[2]) / 2;
      const dx = cx - pp.x, dz = cz - pp.z, dl = Math.hypot(dx, dz) || 1;
      const reach = Math.max(c.max[0] - c.min[0], c.max[2] - c.min[2]) / 2 + 0.9;
      _to.set(cx + dx / dl * reach, s.eyeY, cz + dz / dl * reach);
      if (this.canSee(_to, pp)) continue;                  // still visible there → not real cover
      const d = (_to.x - s.pos.x) ** 2 + (_to.z - s.pos.z) ** 2;
      if (d < bestD) { bestD = d; best = _to.clone(); best.y = 0; }
    }
    return best;
  }

  update(dt, ctx = {}) {
    this._tick++;
    // animate smoke (grow then fade); cur drives the LoS-blocking radius
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const sm = this.smoke[i]; sm.life -= dt;
      if (sm.life <= 0) { this.scene.remove(sm.mesh); sm.mesh.geometry.dispose(); sm.mesh.material.dispose(); this.smoke.splice(i, 1); continue; }
      const k = 1 - sm.life / sm.max; sm.cur = sm.r * (0.45 + k * 0.6);
      sm.mesh.scale.setScalar(sm.cur); sm.mesh.material.opacity = 0.5 * Math.min(1, sm.life / 0.7) * (1 - k * 0.25);
    }
    const pp = ctx.playerPos, cover = ctx.coverAABBs || [];
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      if (s.state === 'dead') continue;
      // throttled think — each soldier re-evaluates every 8 frames, staggered by index (lag-safe)
      if (pp && (this._tick + i) % 8 === 0) {
        _from.set(s.pos.x, s.eyeY, s.pos.z);
        s.seesPlayer = this.canSee(_from, pp, ctx);
        if (s.seesPlayer && cover.length) { const spot = this._bestCover(s, pp, cover); if (spot) { s.target = spot; s.state = 'moving'; } else s.state = 'exposed'; }
        else if (!s.seesPlayer && s.state !== 'moving') s.state = 'cover';
      }
      // movement toward the chosen cover (simple lerp; no pathfinding needed for the demo)
      if (s.state === 'moving' && s.target) {
        _v.copy(s.target).sub(s.pos); _v.y = 0; const dist = _v.length();
        if (dist > 0.08) { _v.multiplyScalar(Math.min(dist, 2.6 * dt) / dist); s.pos.add(_v); s.mesh.position.copy(s.pos); }
        if (dist < 0.5) s.state = s.seesPlayer ? 'exposed' : 'cover';
      }
    }
  }

  stats() {
    return this.soldiers.map((s) => ({ id: s.id, state: s.state, hp: Math.max(0, Math.round(s.hp)), sees: s.seesPlayer, pos: [+s.pos.x.toFixed(1), +s.pos.z.toFixed(1)], killedBy: s.killedBy || null }));
  }
}
