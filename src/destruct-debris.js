// destruct-debris.js — BROWSER-ONLY debris pool (needs THREE). Graduated from
// tools/destructlab/debris.js. Kept OUT of src/destruct.js so that the pure core stays
// node-testable (importing THREE under `node --test` would fail to resolve the bare
// 'three' specifier). The destruction CORE lives in src/destruct.js; this is just the
// renderer for its debris bursts. DestructRuntime takes an instance of this as `debris`.
//
// 256-chunk InstancedMesh, ONE draw call, ring-recycled oldest-first. Visual only —
// settled chunks fade out; persistent rubble is the building rebuild's job, not the pool's.
import * as THREE from 'three';
import { MATERIALS } from './destruct.js';

const POOL = 256;
// Recipe per material `debris` key (MATERIALS[mat].debris → RECIPES[key]).
const RECIPES = {
  shards:  { color: 0xd8eef4, size: [0.10, 0.10, 0.02], speed: 4, count: 10, life: 2.5 },
  splints: { color: 0xa8854a, size: [0.30, 0.06, 0.06], speed: 3, count: 8,  life: 3.5 },
  rubble:  { color: 0x7e4634, size: [0.18, 0.14, 0.14], speed: 3, count: 14, life: 5.0 },
  panels:  { color: 0x9aa0a8, size: [0.25, 0.25, 0.04], speed: 3, count: 6,  life: 3.0 },
  sparks:  { color: 0xffd24a, size: [0.06, 0.06, 0.06], speed: 7, count: 12, life: 0.8 },
};
const G = 14;   // matches effects.js particle gravity feel

export class DebrisPool {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial(), POOL);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = Array.from({ length: POOL }, () => ({ live: false }));
    this.head = 0;
    this.color = new THREE.Color();
    this.dummy = new THREE.Object3D();
    for (let i = 0; i < POOL; i++) this._stash(i);
  }
  _stash(i) {
    this.dummy.position.set(0, -99, 0); this.dummy.scale.setScalar(0.001);
    this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
  }
  // kind is a RECIPES key OR a MATERIALS key (auto-resolved to its debris recipe).
  // opts (additive — every existing caller passes none, so behaviour is unchanged): { count, dir }.
  //   count : cap the chunk count (a small value ⇒ a light puff — e.g. an HMG bullet chip vs a full
  //           breach). Never exceeds the recipe count.
  //   dir   : [x,y,z] — bias chunks to fly OUT along this HORIZONTAL direction (e.g. a tank shoving
  //           masonry forward off its hull, or spall kicking off a bullet's entry face) instead of an
  //           even radial spray. Ported from the demo lab (debris.js).
  // NB: the no-dir path keeps the exact original rnd() draw order, so legacy callers' debris is identical.
  burst(kind, at, seed = 1, floorY = 0, opts = {}) {
    const r = RECIPES[kind] || RECIPES[MATERIALS[kind]?.debris]; if (!r) return;
    const { count, dir } = opts;
    const N = Math.min(r.count, count ?? r.count);
    const dl = dir ? Math.hypot(dir[0], dir[2]) || 1 : 1, dx = dir ? dir[0] / dl : 0, dz = dir ? dir[2] / dl : 0;
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let n = 0; n < N; n++) {
      const i = this.head; this.head = (this.head + 1) % POOL;
      const it = this.items[i];
      it.live = true; it.life = r.life * (0.7 + rnd() * 0.6);
      it.floorY = floorY;   // settle on the terrain under the burst (0 on flat maps)
      it.pos = [at[0], at[1], at[2]];
      if (dir) {                                        // directional: forward along (dx,dz) + lateral spread + up
        const up = 1 + rnd() * 2, f = r.speed * (0.8 + rnd() * 1.0), lat = (rnd() - 0.5) * r.speed * 0.8;
        it.vel = [dx * f - dz * lat, up + rnd() * r.speed * 0.4, dz * f + dx * lat];
      } else {                                          // radial spray (unchanged legacy path)
        const a = rnd() * Math.PI * 2, up = 1 + rnd() * 2;
        it.vel = [Math.cos(a) * r.speed * rnd(), up + rnd() * r.speed * 0.5, Math.sin(a) * r.speed * rnd()];
      }
      it.rot = [rnd() * 6, rnd() * 6, rnd() * 6]; it.spin = 3 + rnd() * 6;
      it.size = r.size; it.bounced = false;
      this.mesh.setColorAt(i, this.color.set(r.color));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let live = 0;
    for (let i = 0; i < POOL; i++) {
      const it = this.items[i];
      if (!it.live) continue;
      it.life -= dt;
      if (it.life <= 0) { it.live = false; this._stash(i); continue; }
      live++;
      it.vel[1] -= G * dt;
      for (let k = 0; k < 3; k++) it.pos[k] += it.vel[k] * dt;
      const fy = (it.floorY || 0) + it.size[1] / 2;
      if (it.pos[1] < fy) {
        it.pos[1] = fy;
        if (!it.bounced) { it.vel[1] *= -0.3; it.vel[0] *= 0.5; it.vel[2] *= 0.5; it.bounced = true; }
        else { it.vel = [0, 0, 0]; it.spin = 0; }
      }
      it.rot[1] += it.spin * dt;
      this.dummy.position.set(...it.pos);
      this.dummy.rotation.set(...it.rot);
      this.dummy.scale.set(...it.size);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return live;
  }
}
