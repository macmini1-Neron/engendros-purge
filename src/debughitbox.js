// debughitbox.js — Minecraft-F3+B-style collision hitbox overlay (DEV/debug).
//
// Draws the live AABB colliders the game actually uses (world.boxes via the spatial grid +
// enemy + player boxes) as coloured wireframe boxes, near the camera, in ONE LineSegments
// draw call (preallocated buffer, vertex colours, rebuilt each frame). X-ray (depthTest off)
// so a box sitting INSIDE its own mesh (a trunk band inside the trunk) is still visible.
//
// Toggled by Game with F3+B (see game.js); update(game, active) is called once per frame
// from the render path. Inert (mesh hidden, no work) when inactive.

import * as THREE from 'three';

// colour by box role (RGB 0..1)
const C_ENEMY      = [1.00, 0.18, 0.22];   // red    — enemies
const C_PLAYER     = [0.30, 0.85, 1.00];   // cyan   — you
const C_EXPLODABLE = [1.00, 0.40, 0.00];   // orange-red — FAB / explodable
const C_STRUCT     = [0.32, 0.62, 1.00];   // blue   — player fortifications
const C_FOLIAGE    = [0.27, 0.89, 0.35];   // green  — foliage (shoot-through / soft cover)
const C_TREE       = [1.00, 0.62, 0.25];   // orange — solid wood (trunk band / fallen log)
const C_WORLD      = [0.85, 0.86, 0.92];   // white  — generic world / terrain / arena colliders
const C_CAP        = [0.25, 0.95, 1.00];   // cyan   — exact capsule narrowphase (round hitbox)

const R         = 30;     // draw radius around the camera (m) — readable (just your surroundings) + bounds the rebuild cost
const MAX_BOXES = 2500;   // hard cap (each box = 12 edges = 24 line vertices) — headroom so a dense stand isn't truncated within R
const VERTS     = MAX_BOXES * 24;

const EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

export class HitboxDebug {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.BufferGeometry();
    this.posA = new Float32Array(VERTS * 3);
    this.colA = new Float32Array(VERTS * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posA, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color',    new THREE.BufferAttribute(this.colA, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6,
      depthTest: false, depthWrite: false, fog: false });
    this.mesh = new THREE.LineSegments(this.geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 999; this.mesh.visible = false;
    scene.add(this.mesh);
    this._n = 0;          // vertices written this frame
    this._cap = false;    // hit the cap (logged once)
    this._mn = new THREE.Vector3(); this._mx = new THREE.Vector3();
  }

  // append one wireframe box (min/max are {x,y,z}); c = [r,g,b]
  _box(min, max, c) {
    if (this._n + 24 > VERTS) { this._cap = true; return; }
    const p = this.posA, col = this.colA;
    const x0 = min.x, y0 = min.y, z0 = min.z, x1 = max.x, y1 = max.y, z1 = max.z;
    const cr = [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
    let o = this._n * 3;
    for (let e = 0; e < 12; e++) {
      const A = cr[EDGES[e][0]], B = cr[EDGES[e][1]];
      p[o] = A[0]; p[o+1] = A[1]; p[o+2] = A[2]; col[o] = c[0]; col[o+1] = c[1]; col[o+2] = c[2]; o += 3;
      p[o] = B[0]; p[o+1] = B[1]; p[o+2] = B[2]; col[o] = c[0]; col[o+1] = c[1]; col[o+2] = c[2]; o += 3;
    }
    this._n += 24;
  }

  // draw a capsule wireframe: two perpendicular-plane rings at each end + 4 axis-parallel connectors.
  // 2 rings × 10 segments × 2 verts + 4 connectors × 2 verts = 48 verts total.
  // Writes directly into the preallocated posA/colA Float32Arrays (same pattern as _box).
  _emitCapsule(cap, col) {
    const RING = 10;
    const needed = RING * 4 + 8;          // 40 ring verts + 8 connector verts = 48
    if (this._n + needed > VERTS) { this._cap = true; return; }
    // axis unit vector
    const adx = cap.bx - cap.ax, ady = cap.by - cap.ay, adz = cap.bz - cap.az;
    const al = Math.hypot(adx, ady, adz) || 1e-6;
    const ux = adx / al, uy = ady / al, uz = adz / al;
    // perpendicular basis e1 (cross with world-up; fall back to world-X if axis is near-vertical)
    let e1x = -uy, e1y = ux, e1z = 0;
    if (Math.abs(ux) < 1e-3 && Math.abs(uy) < 1e-3) { e1x = 1; e1y = 0; e1z = 0; }
    const l1 = Math.hypot(e1x, e1y, e1z) || 1e-6; e1x /= l1; e1y /= l1; e1z /= l1;
    // e2 = axis × e1
    const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
    const r = cap.r;
    const p = this.posA, co = this.colA;
    // helper: emit one ring of RING segments at centre (cx,cy,cz)
    const ring = (cx, cy, cz) => {
      for (let i = 0; i < RING; i++) {
        const a0 = (i / RING) * Math.PI * 2, a1 = ((i + 1) / RING) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        let o = this._n * 3;
        p[o]   = cx + r*(c0*e1x + s0*e2x); p[o+1] = cy + r*(c0*e1y + s0*e2y); p[o+2] = cz + r*(c0*e1z + s0*e2z);
        co[o] = col[0]; co[o+1] = col[1]; co[o+2] = col[2]; o += 3;
        p[o]   = cx + r*(c1*e1x + s1*e2x); p[o+1] = cy + r*(c1*e1y + s1*e2y); p[o+2] = cz + r*(c1*e1z + s1*e2z);
        co[o] = col[0]; co[o+1] = col[1]; co[o+2] = col[2];
        this._n += 2;
      }
    };
    ring(cap.ax, cap.ay, cap.az);
    ring(cap.bx, cap.by, cap.bz);
    // 4 axis-parallel connectors at ±e1 and ±e2 offsets
    const segs = [[e1x,e1y,e1z],[-e1x,-e1y,-e1z],[e2x,e2y,e2z],[-e2x,-e2y,-e2z]];
    for (let s = 0; s < 4; s++) {
      const sx = segs[s][0], sy = segs[s][1], sz = segs[s][2];
      let o = this._n * 3;
      p[o]   = cap.ax + r*sx; p[o+1] = cap.ay + r*sy; p[o+2] = cap.az + r*sz;
      co[o] = col[0]; co[o+1] = col[1]; co[o+2] = col[2]; o += 3;
      p[o]   = cap.bx + r*sx; p[o+1] = cap.by + r*sy; p[o+2] = cap.bz + r*sz;
      co[o] = col[0]; co[o+1] = col[1]; co[o+2] = col[2];
      this._n += 2;
    }
  }

  update(game, active) {
    if (!active) { if (this.mesh.visible) this.mesh.visible = false; return; }
    this._n = 0;
    const cam = game.engine.camera, cx = cam.position.x, cz = cam.position.z;
    const world = game.world;

    // 1) world / collision AABBs near the camera (one grid query, deduped)
    if (world && world.grid && world.grid.queryAABB) {
      const seen = new Set();
      for (const b of world.grid.queryAABB(cx - R, cz - R, cx + R, cz + R)) {
        if (!b || !b.min || !b.max || seen.has(b)) continue; seen.add(b);
        const c = b.explodable ? C_EXPLODABLE : b.struct ? C_STRUCT
                : b.foliage ? C_FOLIAGE : b.tree ? C_TREE : C_WORLD;
        this._box(b.min, b.max, c);
        if (b.cap) this._emitCapsule(b.cap, C_CAP);
      }
    }

    // 2) enemy AABBs (pos ± radius, height up) — matches enemies.js collision/hit math
    const en = game.enemies && game.enemies.active;
    if (en) for (let i = 0; i < en.length; i++) {
      const e = en[i]; if (!e || !e.alive) continue;
      const dx = e.pos.x - cx, dz = e.pos.z - cz; if (dx*dx + dz*dz > R*R) continue;
      this._mn.set(e.pos.x - e.radius, e.pos.y, e.pos.z - e.radius);
      this._mx.set(e.pos.x + e.radius, e.pos.y + e.height, e.pos.z + e.radius);
      this._box(this._mn, this._mx, C_ENEMY);
    }

    // 3) the player capsule (feet → head)
    const pl = game.player;
    if (pl && pl.pos) {
      this._mn.set(pl.pos.x - pl.radius, pl.pos.y, pl.pos.z - pl.radius);
      this._mx.set(pl.pos.x + pl.radius, pl.pos.y + pl.height, pl.pos.z + pl.radius);
      this._box(this._mn, this._mx, C_PLAYER);
    }

    if (this._cap) { console.log(`[hitbox] cap ${MAX_BOXES} boxes reached — some near-camera colliders not drawn`); this._cap = false; }
    this.geo.setDrawRange(0, this._n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.mesh.visible = this._n > 0;
  }

  dispose() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
