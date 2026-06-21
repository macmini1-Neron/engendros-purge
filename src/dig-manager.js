// dig-manager.js — browser-side coordinator for terrain excavation. Owns the one DeformField (wired
// into world.terrain AND mirrored into the sim-worker), turns digs into chunk re-meshes, runs the
// gravity-collapse SupportScan on the host, and bridges co-op (host emits 'deform', clients apply).
//
// The deform MATH + storage is the pure, node-tested src/dig.js; this file is the THREE/game glue
// (no THREE import needed — it only ever reads {x,z} and calls into world/chunks/worker/mp).
import { DeformField, craterShape } from './dig.js';
import { SupportScan } from './support.js';

export class DigManager {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.field = new DeformField();
    // attach to the live terrain so every terrainHeightAt (collision, AI, molotov-settle) sees digs.
    if (this.world && this.world.terrain) this.world.terrain.setDeformField(this.field);
    this._dirty = new Set();              // chunk indices awaiting a re-mesh, coalesced per frame
    this._scan = new SupportScan(game);   // host-only gravity collapse of undermined objects
  }

  get terrain() { return this.world && this.world.terrain; }
  get chunks() { return this.world && this.world.chunks; }
  get _worker() { return this.game.simWorker; }

  // ── carve ────────────────────────────────────────────────────────────────────────────────────
  // Host-authoritative single dig increment at (pos.x, pos.z). depth>0 lowers, lip>0 raises a rim.
  // Returns the stored primitive, or null for a no-op. net:false suppresses the co-op broadcast
  // (used when REPLAYING a peer's dig, so it doesn't echo back).
  dig(pos, opts = {}) {
    const r = opts.r, depth = opts.depth, lip = opts.lip || 0;
    if (!(r > 0) || !(depth > 0)) return null;
    const res = this.field.add({ x: pos.x, z: pos.z, r, depth, lip });
    this._afterCarve(res, opts.net !== false);
    return res.stored;
  }

  // Explosion crater: shape scales with the blast radius (small = scuff, ordnance = bowl + ejecta).
  carveCrater(pos, radius) {
    const shape = craterShape(radius);
    if (!shape) return null;
    return this.dig(pos, { r: shape.r, depth: shape.depth, lip: shape.lip });
  }

  _afterCarve(res, net) {
    const prim = res.stored;
    // 1) keep the worker's field in lock-step (BEFORE the re-mesh request it will service)
    if (this._worker) this._worker.deformAdd({ x: prim.x, z: prim.z, r: prim.r, depth: prim.depth, lip: prim.lip });
    // 2) queue the affected chunk(s) for re-mesh (+ the evicted primitive's, if the cap rolled over)
    this._markDirty(prim);
    if (res.removed) this._markDirty(res.removed);
    // 3) host: drop anything the dig just undermined, and broadcast the dig to clients
    const mp = this.game.mp;
    const hostSim = !mp || !mp.active || mp.isHost;
    if (hostSim && this._scan) this._scan.run(this._rect(prim), prim);
    if (net && mp && mp.active && mp.isHost) {
      mp.net.send('deform', { x: prim.x, z: prim.z, r: prim.r, dp: prim.depth, lip: prim.lip });
    }
  }

  // XZ bounds of a primitive's influence (3.8σ support — matches dig.js's truncation).
  _rect(prim) {
    const sup = prim.r * 3.8;
    return { minx: prim.x - sup, minz: prim.z - sup, maxx: prim.x + sup, maxz: prim.z + sup };
  }

  _markDirty(prim) {
    const chunks = this.chunks;
    if (!chunks || !chunks.chunksOverlapping) return;       // map without chunked terrain → no visual re-mesh
    const r = this._rect(prim);
    for (const ci of chunks.chunksOverlapping(r.minx, r.minz, r.maxx, r.maxz)) this._dirty.add(ci);
  }

  // ── per-frame flush ────────────────────────────────────────────────────────────────────────────
  // Re-mesh each dirty chunk ONCE (a shovel-hold fires many tiny digs into the same chunk each
  // frame; this coalesces them to a single rebuild). Cheap no-op when nothing was dug.
  update() {
    if (this._dirty.size === 0) return;
    const chunks = this.chunks;
    if (chunks && chunks.remeshChunk) for (const ci of this._dirty) chunks.remeshChunk(ci);
    this._dirty.clear();
  }

  // ── co-op apply (client) ─────────────────────────────────────────────────────────────────────
  // A host 'deform' arrived. Single dig: {x,z,r,dp,lip}. Late-join: {batch:[serialized prims]}.
  // Clients NEVER run the support scan — collapse OUTCOMES arrive over the existing host-auth
  // destruction channels (forestfx / structdie / bcollapse).
  applyNetDeform(d) {
    if (d.batch) { for (const p of d.batch) this._applyOne({ x: p.x, z: p.z, r: p.r, depth: p.depth, lip: p.lip || 0 }); return; }
    this._applyOne({ x: d.x, z: d.z, r: d.r, depth: d.dp, lip: d.lip || 0 });
  }

  _applyOne(p) {
    if (!(p.r > 0) || !(p.depth > 0)) return;
    const res = this.field.add(p);
    if (this._worker) this._worker.deformAdd({ x: res.stored.x, z: res.stored.z, r: res.stored.r, depth: res.stored.depth, lip: res.stored.lip });
    this._markDirty(res.stored);
    if (res.removed) this._markDirty(res.removed);
  }

  // late-join: the host ships its whole deform list to a joiner (mp.js _sendWorldTo).
  netSnapshot() { return this.field.serialize(); }
}
