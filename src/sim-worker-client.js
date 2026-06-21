// sim-worker-client.js — main-thread wrapper around src/sim-worker.js.
//
// Offloads pure-math sim work (Phase A: the horde Dijkstra flow-field; Phase B: terrain
// chunk arrays) to a module Web Worker. Fire-and-forget: post a request, apply the result
// when its message arrives (NOT awaited in the game loop — see CLAUDE.md "no async in the
// loop"). Degrades gracefully: if Workers are unavailable or the worker fails to start,
// `ok` stays false and callers run the original synchronous compute instead — identical
// behaviour, just unthreaded.
export class SimWorker {
  constructor() {
    this.ok = false;
    this._seq = 0;
    this._flowPending = false;
    this._flowSeqApplied = -1;
    this._flowCb = null;
    this._jobId = 0;
    this._chunkCbs = new Map(); // jobId -> cb(arrays)
    try {
      if (typeof Worker !== 'undefined') {
        this._w = new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' });
        this._w.onmessage = (e) => this._onMessage(e.data);
        this._w.onerror = (err) => { console.warn('[sim-worker] disabled (error → sync fallback):', err && err.message); this.ok = false; };
        this.ok = true;
      }
    } catch (e) {
      console.warn('[sim-worker] could not start (→ sync fallback):', e && e.message);
      this.ok = false;
    }
  }

  _onMessage(m) {
    if (m.cmd === 'flow') {
      this._flowPending = false;
      if (m.seq < this._flowSeqApplied) return; // a newer field already landed — drop this stale one
      this._flowSeqApplied = m.seq;
      if (this._flowCb) {
        this._flowCb({ cols: m.cols, rows: m.rows, cell: m.cell, originX: m.originX, originZ: m.originZ,
                       dist: m.dist, dirX: m.dirX, dirZ: m.dirZ, goalX: m.goalX, goalZ: m.goalZ });
      }
    } else if (m.cmd === 'chunk') {
      const cb = this._chunkCbs.get(m.jobId);
      if (cb) { this._chunkCbs.delete(m.jobId); cb({ positions: m.positions, colors: m.colors, normals: m.normals, indices: m.indices }); }
    }
  }

  // --- Phase A: flow-field ---------------------------------------------------
  // Ship the (static) nav grid to the worker ONCE. A copy of `blocked` is transferred so the
  // main thread keeps its own grid for the per-frame lineBlocked()/flowDirAt() lookups.
  setGrid(grid) {
    if (!this.ok || !grid) return;
    const blocked = grid.blocked.slice();
    this._w.postMessage(
      { cmd: 'setGrid', cols: grid.cols, rows: grid.rows, cell: grid.cell, originX: grid.originX, originZ: grid.originZ, blocked },
      [blocked.buffer],
    );
    this._flowPending = false;
  }

  // Request a fresh flow-field toward (goalX, goalZ), restricted to `bounds`
  // ({minX,minZ,maxX,maxZ} or null = full grid). `cb(field)` fires when it arrives.
  // `bounds` MUST be forwarded so the worker windows the Dijkstra exactly like the
  // synchronous path — otherwise the offload silently reverts to a full-grid sweep
  // (the steppe-stutter regression). It's a small plain object → structured-cloned.
  // Returns true if the request is handled by the worker (or one is already in flight),
  // false if there is no worker — in which case the caller must compute it synchronously.
  requestFlow(goalX, goalZ, bounds, cb) {
    if (!this.ok) return false;
    this._flowCb = cb;
    if (this._flowPending) return true;     // one already in flight — skip this tick
    this._flowPending = true;
    this._w.postMessage({ cmd: 'flow', seq: ++this._seq, goalX, goalZ, bounds });
    return true;
  }

  // --- Phase B: terrain chunk arrays -----------------------------------------
  // Reconstruct the deterministic terrain inside the worker once (same opts the main thread used).
  terrainInit(opts) {
    if (!this.ok) return false;
    this._w.postMessage({ cmd: 'terrainInit', opts });
    return true;
  }

  // Request the vertex arrays for one chunk×LOD. `cb(arrays)` fires when they arrive.
  // Returns true if the worker will handle it, false if there's no worker (build synchronously).
  requestChunk(chunk, resolution, cb) {
    if (!this.ok) return false;
    const jobId = ++this._jobId;
    this._chunkCbs.set(jobId, cb);
    this._w.postMessage({ cmd: 'chunk', jobId, chunk, resolution });
    return true;
  }
}
