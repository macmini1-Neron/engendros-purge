import * as THREE from 'three';
import { planChunks } from './terrain-layout.js';
import { buildChunkMesh, assembleChunkMesh } from './terrain-mesh.js';
import { pickLOD, LOD_RESOLUTIONS, LOD_BANDS } from './terrain-lod.js';

// Owns the grid of terrain chunk meshes for one map. Each chunk is built at every LOD resolution
// (high→low); update() picks ONE per chunk by camera distance and composes that with per-chunk
// frustum culling and the optional draw-distance radius (set by Game._cullByDistance).
//
// Build path: if a sim Web Worker is available the heavy per-vertex arrays are computed off-thread
// and the chunk meshes stream in over the next frames (no boot hitch); update() shows the nearest
// already-built LOD until a chunk's chosen LOD lands. With no worker it falls back to the original
// fully-synchronous build (identical result, just blocking).
export class TerrainChunks {
  constructor(terrain, opts = {}) {
    this.terrain = terrain;
    this.extent = opts.extent != null ? opts.extent : 160;
    this.chunkSize = opts.chunkSize != null ? opts.chunkSize : 64;
    this.resolutions = opts.resolutions || LOD_RESOLUTIONS; // [0] = nearest/highest detail
    this.lodBands = opts.lodBands || LOD_BANDS;
    this.lodMargin = opts.lodMargin != null ? opts.lodMargin : 24; // hysteresis metres
    this.scene = opts.scene || null;
    this.simWorker = opts.simWorker || null;
    this.group = new THREE.Group();
    this.group.name = 'terrainChunks';
    this.chunks = [];     // { meshes:[perLOD] (sparse while streaming), lod:int, cx, cz, chunk }
    this.meshes = [];     // flat list of EVERY built mesh (for dispose)
    this.visible = 0;
    this.drawDistance = 0; // 0 = unlimited; set by Game._cullByDistance
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();

    const list = planChunks(this.extent, this.chunkSize);
    const sw = this.simWorker;
    const useWorker = !!(sw && sw.ok && sw.terrainInit({
      profile: terrain.profile, seed: terrain.seed, slopeLimit: terrain.slopeLimit, tuning: terrain.tuning, reserved: terrain.reserved,
    }));

    if (useWorker) {
      // Async: queue every chunk×LOD; assemble each as the worker ships its arrays back.
      for (let ci = 0; ci < list.length; ci++) {
        const c = list[ci];
        this.chunks.push({ meshes: new Array(this.resolutions.length), lod: 0, cx: c.centerX, cz: c.centerZ, chunk: c });
        for (let li = 0; li < this.resolutions.length; li++) {
          const r = this.resolutions[li], segs = Math.max(1, Math.floor(r));
          const ok = sw.requestChunk(c, r, (arrays) => this._place(ci, li, assembleChunkMesh(arrays, c, segs)));
          if (!ok) this._place(ci, li, buildChunkMesh(this.terrain, c, r)); // worker vanished mid-queue → sync
        }
      }
      this.visible = 0; // grows as chunks land + update() runs
    } else {
      // Synchronous fallback — original behaviour, all meshes resident immediately.
      for (const c of list) {
        const meshes = this.resolutions.map((r) => buildChunkMesh(this.terrain, c, r));
        meshes.forEach((mesh, li) => { mesh.visible = (li === 0); this.group.add(mesh); this.meshes.push(mesh); });
        this.chunks.push({ meshes, lod: 0, cx: c.centerX, cz: c.centerZ, chunk: c });
      }
      this.visible = this.chunks.length;
    }
    if (this.scene) this.scene.add(this.group);
  }

  // Slot a freshly-assembled chunk mesh into its chunk (worker-stream path).
  _place(ci, li, mesh) {
    const entry = this.chunks[ci];
    if (!entry) { mesh.geometry.dispose(); mesh.material.dispose(); return; } // disposed before it landed
    mesh.visible = false; // update() owns visibility
    entry.meshes[li] = mesh;
    this.group.add(mesh);
    this.meshes.push(mesh);
  }

  // Per-frame: pick LOD (distance + hysteresis), then frustum + draw-distance cull. Only the chosen
  // LOD mesh of a visible chunk is shown; others (other LODs, or culled chunks) are hidden. While a
  // chunk is still streaming, the nearest already-built LOD is shown so there's no void.
  update(camera) {
    if (!camera) return;
    camera.updateMatrixWorld();
    this._inv.copy(camera.matrixWorld).invert();
    this._m.multiplyMatrices(camera.projectionMatrix, this._inv);
    this._frustum.setFromProjectionMatrix(this._m);
    const dd = this.drawDistance, dd2 = dd > 0 ? dd * dd : 0;
    const cx = camera.position;
    const nLod = this.resolutions.length;
    let vis = 0;
    for (const ch of this.chunks) {
      const dxc = ch.cx - cx.x, dzc = ch.cz - cx.z;
      const dist2 = dxc * dxc + dzc * dzc;
      const dist = Math.sqrt(dist2);
      ch.lod = pickLOD(dist, this.lodBands, ch.lod, this.lodMargin);
      // pick the LOD to actually show: the chosen one if built, else the nearest built LOD
      let shown = ch.meshes[ch.lod] ? ch.lod : -1;
      if (shown < 0) for (let off = 1; off < nLod; off++) {
        if (ch.lod + off < nLod && ch.meshes[ch.lod + off]) { shown = ch.lod + off; break; }
        if (ch.lod - off >= 0 && ch.meshes[ch.lod - off]) { shown = ch.lod - off; break; }
      }
      if (shown < 0) { for (let li = 0; li < nLod; li++) if (ch.meshes[li]) ch.meshes[li].visible = false; continue; } // not built yet
      const active = ch.meshes[shown];
      if (!active.geometry.boundingSphere) active.geometry.computeBoundingSphere();
      this._sphere.copy(active.geometry.boundingSphere).applyMatrix4(active.matrixWorld);
      let inView = this._frustum.intersectsSphere(this._sphere);
      if (inView && dd2 > 0 && dist2 > dd2) inView = false; // beyond draw distance
      for (let li = 0; li < nLod; li++) if (ch.meshes[li]) ch.meshes[li].visible = inView && (li === shown);
      if (inView) vis++;
    }
    this.visible = vis;
  }

  // ── live re-mesh after a terrain dig (src/dig-manager.js) ───────────────────────────────────────
  // Return the indices of chunks whose footprint overlaps the XZ rect (a dug crater's bounds).
  chunksOverlapping(minx, minz, maxx, maxz) {
    const out = [];
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i].chunk;
      if (c.maxX >= minx && c.minX <= maxx && c.maxZ >= minz && c.minZ <= maxz) out.push(i);
    }
    return out;
  }

  // Rebuild EVERY LOD mesh of chunk `ci` from the (now-deformed) terrain. There is no incremental
  // vertex update — each LOD is recomputed and swapped in. Worker path streams the new arrays in
  // (old mesh stays visible until its replacement lands); no-worker path builds synchronously.
  remeshChunk(ci) {
    const entry = this.chunks[ci];
    if (!entry) return;
    const c = entry.chunk, sw = this.simWorker;
    for (let li = 0; li < this.resolutions.length; li++) {
      const r = this.resolutions[li], segs = Math.max(1, Math.floor(r));
      if (sw && sw.ok && sw.requestChunk(c, r, (arrays) => this._swap(ci, li, assembleChunkMesh(arrays, c, segs)))) continue;
      this._swap(ci, li, buildChunkMesh(this.terrain, c, r)); // worker absent/vanished → sync
    }
  }

  // Replace chunk ci's LOD-li mesh with a fresh one, disposing the old. update() owns visibility.
  _swap(ci, li, mesh) {
    const entry = this.chunks[ci];
    if (!entry) { mesh.geometry.dispose(); mesh.material.dispose(); return; } // disposed before it landed
    const old = entry.meshes[li];
    mesh.visible = false;
    entry.meshes[li] = mesh;
    this.group.add(mesh);
    this.meshes.push(mesh);
    if (old) {
      this.group.remove(old);
      const oi = this.meshes.indexOf(old);
      if (oi >= 0) this.meshes.splice(oi, 1);
      old.geometry.dispose(); old.material.dispose();
    }
  }

  dispose() {
    for (const mesh of this.meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.meshes.length = 0;
    this.chunks.length = 0;
    if (this.scene) this.scene.remove(this.group);
  }
}
