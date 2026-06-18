import * as THREE from 'three';
import { planChunks } from './terrain-layout.js';
import { buildChunkMesh } from './terrain-mesh.js';
import { pickLOD, LOD_RESOLUTIONS, LOD_BANDS } from './terrain-lod.js';

// Owns the grid of terrain chunk meshes for one map. Each chunk is pre-built at every LOD
// resolution (high→low); update() picks ONE per chunk by camera distance and composes that with
// per-chunk frustum culling and the optional draw-distance radius (set by Game._cullByDistance).
// Pre-building all LODs fits the bounded, fully-resident world (no streaming) and the no-build-step
// ethos; Phase 3b will measure load cost when extent scales and add lazy LOD build only if needed.
export class TerrainChunks {
  constructor(terrain, opts = {}) {
    this.terrain = terrain;
    this.extent = opts.extent != null ? opts.extent : 160;
    this.chunkSize = opts.chunkSize != null ? opts.chunkSize : 64;
    this.resolutions = opts.resolutions || LOD_RESOLUTIONS; // [0] = nearest/highest detail
    this.lodBands = opts.lodBands || LOD_BANDS;
    this.lodMargin = opts.lodMargin != null ? opts.lodMargin : 24; // hysteresis metres
    this.scene = opts.scene || null;
    this.group = new THREE.Group();
    this.group.name = 'terrainChunks';
    this.chunks = [];     // { meshes:[perLOD], lod:int, cx, cz }
    this.meshes = [];     // flat list of EVERY mesh (for dispose)
    this.visible = 0;
    this.drawDistance = 0; // 0 = unlimited; set by Game._cullByDistance
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    for (const c of planChunks(this.extent, this.chunkSize)) {
      const meshes = this.resolutions.map((r) => buildChunkMesh(this.terrain, c, r));
      meshes.forEach((mesh, li) => { mesh.visible = (li === 0); this.group.add(mesh); this.meshes.push(mesh); });
      this.chunks.push({ meshes, lod: 0, cx: c.centerX, cz: c.centerZ });
    }
    this.visible = this.chunks.length;
    if (this.scene) this.scene.add(this.group);
  }

  // Per-frame: pick LOD (distance + hysteresis), then frustum + draw-distance cull. Only the chosen
  // LOD mesh of a visible chunk is shown; all others (other LODs, or culled chunks) are hidden.
  update(camera) {
    if (!camera) return;
    camera.updateMatrixWorld();
    this._inv.copy(camera.matrixWorld).invert();
    this._m.multiplyMatrices(camera.projectionMatrix, this._inv);
    this._frustum.setFromProjectionMatrix(this._m);
    const dd = this.drawDistance, dd2 = dd > 0 ? dd * dd : 0;
    const cx = camera.position;
    let vis = 0;
    for (const ch of this.chunks) {
      const dxc = ch.cx - cx.x, dzc = ch.cz - cx.z;
      const dist2 = dxc * dxc + dzc * dzc;
      const dist = Math.sqrt(dist2);
      ch.lod = pickLOD(dist, this.lodBands, ch.lod, this.lodMargin);
      const active = ch.meshes[ch.lod];
      if (!active.geometry.boundingSphere) active.geometry.computeBoundingSphere();
      this._sphere.copy(active.geometry.boundingSphere).applyMatrix4(active.matrixWorld);
      let inView = this._frustum.intersectsSphere(this._sphere);
      if (inView && dd2 > 0 && dist2 > dd2) inView = false; // beyond draw distance
      for (let li = 0; li < ch.meshes.length; li++) ch.meshes[li].visible = inView && (li === ch.lod);
      if (inView) vis++;
    }
    this.visible = vis;
  }

  dispose() {
    for (const mesh of this.meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.meshes.length = 0;
    this.chunks.length = 0;
    if (this.scene) this.scene.remove(this.group);
  }
}
