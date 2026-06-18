import * as THREE from 'three';
import { planChunks } from './terrain-layout.js';
import { buildChunkMesh } from './terrain-mesh.js';

// Owns the grid of terrain chunk meshes for one map. Builds them once from the (seeded) heightfield
// and culls them per-frame against the camera frustum. Each chunk is an independently-cullable mesh —
// that is the whole point of chunking vs one big plane. Reserved hook for Phase 3 LOD + Phase 1B
// draw-distance: extend update() to swap resolution / hide-by-distance.
export class TerrainChunks {
  constructor(terrain, opts = {}) {
    this.terrain = terrain;
    this.extent = opts.extent != null ? opts.extent : 160;
    this.chunkSize = opts.chunkSize != null ? opts.chunkSize : 64;
    this.resolution = opts.resolution != null ? opts.resolution : 16;
    this.scene = opts.scene || null;
    this.group = new THREE.Group();
    this.group.name = 'terrainChunks';
    this.meshes = [];
    this.visible = 0;
    // scratch objects reused each frame (no per-frame allocation)
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    for (const c of planChunks(this.extent, this.chunkSize)) {
      const mesh = buildChunkMesh(this.terrain, c, this.resolution);
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    this.visible = this.meshes.length;
    if (this.scene) this.scene.add(this.group);
  }

  // Explicit per-chunk frustum culling. Static chunks → world matrices are fixed (set at build),
  // so we only recompute the camera frustum and sphere-test each chunk. Sets this.visible (diagnostic).
  update(camera) {
    if (!camera) return;
    camera.updateMatrixWorld();
    this._inv.copy(camera.matrixWorld).invert();
    this._m.multiplyMatrices(camera.projectionMatrix, this._inv);
    this._frustum.setFromProjectionMatrix(this._m);
    let vis = 0;
    for (const mesh of this.meshes) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      this._sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
      const inView = this._frustum.intersectsSphere(this._sphere);
      mesh.visible = inView;
      if (inView) vis++;
    }
    this.visible = vis;
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.meshes.length = 0;
    if (this.scene) this.scene.remove(this.group);
  }
}
