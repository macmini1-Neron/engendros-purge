// sim-worker.js — module Web Worker that offloads heavy PURE-MATH sim work off the
// main thread so the render loop never hitches on it.
//
// ⚠️ Import maps are document-scoped and are NOT inherited by workers, so this file
// (and everything it imports, transitively) must be THREE-free / bare-import-free.
// flowfield.js qualifies (no imports at all). Phase B will add terrain.js + the pure
// terrain-mesh-arrays.js here the same way.
//
// Protocol (main → worker): { cmd, ... }. Replies (worker → main): { cmd, ... } with
// the big typed arrays passed as transferables (zero-copy).
import { buildFlowField } from './flowfield.js';
import { makeTerrain } from './terrain.js';
import { computeChunkArrays } from './terrain-mesh-arrays.js';
import { DeformField } from './dig.js'; // excavation layer — also THREE-free (worker-safe)

// Phase A — the horde nav grid lives here so we only ship it across once; each refresh
// then sends just the goal and gets back a fresh Dijkstra field.
let _grid = null;
// Phase B — the deterministic terrain (rebuilt from the same {profile,seed,…} the main thread
// used) so each chunk job only sends a descriptor and gets back the heavy vertex arrays.
let _terrain = null;

self.onmessage = (e) => {
  const m = e.data;
  switch (m.cmd) {
    case 'setGrid':
      _grid = { cols: m.cols, rows: m.rows, cell: m.cell, originX: m.originX, originZ: m.originZ, blocked: m.blocked };
      break;
    case 'flow': {
      if (!_grid) return; // grid not delivered yet — main thread keeps the previous field
      const f = buildFlowField(_grid, m.goalX, m.goalZ, m.bounds); // window to m.bounds — mirrors the main-thread sync path
      self.postMessage(
        { cmd: 'flow', seq: m.seq,
          cols: f.cols, rows: f.rows, cell: f.cell, originX: f.originX, originZ: f.originZ,
          dist: f.dist, dirX: f.dirX, dirZ: f.dirZ, goalX: f.goalX, goalZ: f.goalZ },
        [f.dist.buffer, f.dirX.buffer, f.dirZ.buffer], // transfer (zero-copy); buildFlowField minted them fresh
      );
      break;
    }
    case 'terrainInit':
      _terrain = makeTerrain(m.opts); // {profile, seed, slopeLimit, tuning, reserved} → bit-identical to the main thread
      _terrain.setDeformField(new DeformField()); // empty excavation layer; fed by deformAdd / deformInit
      break;
    case 'deformAdd': // one dig primitive — replayed in the SAME host order as the main thread (Option A)
      if (_terrain && _terrain.deformField) _terrain.deformField.add(m.prim);
      break;
    case 'deformInit': // full deform list (late-join / map reset) replaces the worker's field
      if (_terrain) _terrain.setDeformField(DeformField.deserialize(m.arr));
      break;
    case 'chunk': {
      if (!_terrain) return; // terrain not delivered yet — main thread builds this chunk synchronously
      const a = computeChunkArrays(_terrain, m.chunk, m.resolution);
      self.postMessage(
        { cmd: 'chunk', jobId: m.jobId, positions: a.positions, colors: a.colors, normals: a.normals, indices: a.indices },
        [a.positions.buffer, a.colors.buffer, a.normals.buffer, a.indices.buffer],
      );
      break;
    }
  }
};
