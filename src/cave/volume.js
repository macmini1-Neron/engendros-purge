// cave/volume.js — ONE monolithic rock body (a single density field) with a cave carved into it. This is the
// SINGLE source of truth for the mountain: Surface Nets meshes the field → the visible craggy rock, AND the
// same field answers collision (groundY / solidAt / gradient / ceilingAbove). No heightfield massif, no render
// vs collision split — the terrain heightfield is only the gentle ground the rock stands on (= the cave floor).
//
// Density (Lysenko: solid < 0, air > 0, surface at 0):
//   rockTop(x,z)  — the craggy mountain outer surface (self-contained analytic; BURIED below grade off the
//                    massif footprint so there is no rock slab lying on the grass).
//   ground(x,z)   — gentle terrain height (the rock's base + the cave-floor level).
//   the walkable TUNNEL (mouth→back, ground..ceil) is subtracted back out of the solid rock.
//   field = max( rockBody , tunnelVoid )   where rockBody<0 inside the rock, tunnelVoid>0 inside the cave.
import * as THREE from 'three';
import { makeNoise } from './noise.js';
import { meshChunk } from './surfacenets.js';
import { FOREST_TUNING } from '../terrain.js';
import { MeshBuilder, voxelMaterial } from '../util.js';

const smooth01 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// smooth |v| (rounded with radius ~k) + smooth-crested ridge in [0,1] — the "no-teeth" fold. A raw 1−|n|
// ridge has a slope discontinuity at every crest, which the mesh renders as literal sawteeth; this keeps the
// ridge line but weathers the crest into a rounded rock spine.
const sabs = (v, k) => Math.sqrt(v * v + k * k) - k;
const ridge = (n, k = 0.3) => 1 - sabs(n, k) / (Math.sqrt(1 + k * k) - k);
function segPD(x, z, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az, ab2 = abx * abx + abz * abz || 1e-6;
  let t = ((x - ax) * abx + (z - az) * abz) / ab2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + abx * t, cz = az + abz * t, dx = x - cx, dz = z - cz;
  return { t, d: Math.hypot(dx, dz) };
}

export class CaveVolume {
  constructor(world, opts = {}) {
    this.world = world;
    this.terrain = world.terrain;
    const c = FOREST_TUNING.corridor, m = FOREST_TUNING.massif;
    this.massif = m;
    // tunnel PATH through the rock (mouth → back), the only overhang carved out of the solid body
    this.A = { x: c.bx, z: -38 };          // mouth end (opens at the base of the south face)
    this.B = { x: c.bx, z: c.bz - 1 };     // back end (a solid rock back wall)
    this.halfW = 4.6;                      // tunnel half-width (a roomy cave, not a crack)
    this.rim = 7.5;
    this.ROOF_H = opts.roofH || 6.0;       // chamber headroom (m)
    this.BURY = 1.5;                       // off-footprint the rock top sits this far UNDER grade (buried, invisible)
    // AABB spans the full massif footprint (circle radius m.r1) + a margin, tall to the crest. groundY/marches
    // are only ever run inside `contains()` (a tighter circle), so a generous rectangle here is fine.
    this.aabb = { minX: m.x - (m.r1 + 6), maxX: m.x + (m.r1 + 6), minZ: m.z - (m.r1 + 6), maxZ: -33, minY: -4.0, maxY: 48 };
    this.footR = m.r1 + 8;                 // contains() radius (fast reject for world.groundY)
    this.voxel = opts.voxel || 0.7;        // whole-mountain volume — coarser voxel keeps the one-time build cheap
    this.N = makeNoise(0xca7e);
    this.group = new THREE.Group(); this.group.name = 'caveVolume';
    this.mesh = null;
  }

  // ── the field (self-contained; the ONE source of truth) ──────────────────────────────────────────────

  // mountain height ABOVE the ground (≥0), analytic & craggy: compact cone (r≤r0 core, cliff to r1) + a warped
  // irregular footprint + heavy ridged relief so the silhouette reads as jagged ROCK, not a smooth dirt hump.
  mountRise(x, z) {
    const m = this.massif, N = this.N;
    const warp = 4.2 * N.simplex2(x * 0.045 + 2.0, z * 0.045 + 8.0);
    const md = Math.hypot(x - m.x, z - m.z) + warp;
    if (md >= m.r1) return 0;
    const mt = md <= m.r0 ? 1 : 1 - smooth01(m.r0, m.r1, md);
    let rise = (m.h + m.jag * N.simplex2(x * 0.06 + 7.1, z * 0.06 + 2.3)) * mt;
    // REALISM ("no-teeth" pass): ridge relief uses the SMOOTH fold (never raw 1−|n| — that's a knife edge at
    // every crest), calm amplitudes, and it concentrates MID-SLOPE (mt·(1−mt): quiet crest line, sculpted
    // flanks — how real weathered rock reads). Wavelengths stay ≥ ~9 m: finer fracture is the triplanar rock
    // shading's job, not the silhouette's. Same rules apply when building the ЗОНА-704 «ХРЕБЕТ» massif.
    const spur = ridge(N.simplex2(x * 0.08 + 3.3, z * 0.08 + 9.1), 0.30);     // λ≈12 m — spurs & gullies
    const rib  = ridge(N.simplex2(x * 0.14 + 1.7, z * 0.14 + 4.4), 0.35);     // λ≈7 m — secondary ribs
    const mid = mt * (1 - mt) * 4;                       // 0 at the grass line AND the crest, 1 mid-flank
    rise += (spur * 2.2 + rib * 0.8) * mt                // massif-wide relief, calm amplitude
          + (spur * 4.6 + rib * 2.2) * mid;              // spur/gully sculpting concentrated on the flanks
    return rise > 0 ? rise : 0;
  }

  // the craggy rock outer surface Y. On the massif it's ground+rise; OFF the massif it sinks BURY under grade so
  // there is no visible rock sheet on the grass (the buried surface hides under the terrain mesh).
  rockTop(x, z, ground) {
    const rise = this.mountRise(x, z);
    const mask = smooth01(0.0, 0.6, rise);
    return ground - this.BURY + (rise + this.BURY) * mask;
  }

  // 0 (solid) → 1 (open tunnel). Open at the mouth, fading to the rim walls + the back wall.
  insideAt(x, z) {
    const pd = segPD(x, z, this.A.x, this.A.z, this.B.x, this.B.z);
    const perp = 1 - smooth01(this.halfW - 0.5, this.rim, pd.d);
    const along = 1 - smooth01(0.82, 1.0, pd.t);
    return Math.max(0, Math.min(1, perp * along));
  }
  // walkable tunnel ceiling Y: the floor when closed, ground+ROOF_H (+ organic jitter) in the tunnel core.
  ceilAt(x, z, ground) {
    const ins = this.insideAt(x, z);
    if (ins <= 0.001) return ground;
    const jitter = 0.5 * this.N.simplex3(x * 0.5, 7.3, z * 0.5);
    return ground + this.ROOF_H * ins + jitter * ins;
  }

  // signed density (>0 air, <0 solid rock). ONE field: the solid rock body (base..rockTop) MINUS the tunnel void.
  densityAt(x, y, z) {
    const g = this.terrain.terrainHeightAt(x, z);      // gentle ground = rock base + cave floor
    const top = this.rockTop(x, z, g);                 // craggy mountain surface (buried off-footprint)
    const base = g - 3.0;                              // rock extends a little into the ground (buried base)
    const ceil = this.ceilAt(x, z, g);
    const rockBody = Math.max(base - y, y - top);      // <0 inside the rock (base<y<top), >0 outside
    const tunnelVoid = Math.min(ceil - y, y - g);      // >0 inside the walkable tunnel (g<y<ceil), else <0
    return Math.max(rockBody, tunnelVoid);
  }

  // ── collision API (marches the SAME field) ───────────────────────────────────────────────────────────

  // (x,z) near the rock? fast reject so world.groundY only marches near the mountain.
  contains(x, z) { const m = this.massif; const dx = x - m.x, dz = z - m.z; return dx * dx + dz * dz < this.footR * this.footR; }

  solidAt(x, y, z) { return this.densityAt(x, y, z) < 0; }

  // topmost solid surface at or below fromY: scan down for an air→solid crossing, bisect. null if none (or if
  // fromY already sits inside rock — caller resolves that with a horizontal push-out).
  groundY(x, z, fromY) {
    const a = this.aabb, step = 0.5;
    let y0 = fromY == null ? a.maxY : Math.min(fromY, a.maxY);
    let prev = this.densityAt(x, y0, z);
    if (prev <= 0) return null;                        // starting inside solid → not a valid stand point
    for (let y = y0 - step; y >= a.minY; y -= step) {
      const cur = this.densityAt(x, y, z);
      if (prev > 0 && cur <= 0) {                      // air → solid: surface in (y, y+step)
        let lo = y, hi = y + step;
        for (let it = 0; it < 12; it++) { const mid = (lo + hi) * 0.5; (this.densityAt(x, mid, z) <= 0) ? (lo = mid) : (hi = mid); }
        return (lo + hi) * 0.5;
      }
      prev = cur;
    }
    return null;
  }

  // first solid surface ABOVE fromY (the cave ROOF the head must stay under). null if open to the sky.
  ceilingAbove(x, z, fromY) {
    const a = this.aabb, step = 0.4;
    let prev = this.densityAt(x, fromY, z);
    if (prev <= 0) return fromY;                       // already in rock → clamp right here
    for (let y = fromY + step; y <= a.maxY; y += step) {
      const cur = this.densityAt(x, y, z);
      if (prev > 0 && cur <= 0) {                      // air → solid going up: roof underside in (y-step, y)
        let lo = y - step, hi = y;
        for (let it = 0; it < 10; it++) { const mid = (lo + hi) * 0.5; (this.densityAt(x, mid, z) <= 0) ? (hi = mid) : (lo = mid); }
        return (lo + hi) * 0.5;
      }
      prev = cur;
    }
    return null;
  }

  // ray vs the rock body — so bullets/decals/LOS/throwables STOP on the visible mountain exactly like
  // collision does (same field ⇒ hitbox ≡ render). Clips the ray to the AABB, marches the density for an
  // air→solid crossing, bisects tight. Returns t (distance along dir) or null. Rays that start inside
  // rock (shouldn't happen in play) return t0.
  rayHit(o, d, maxT) {
    const a = this.aabb;
    // slab-clip [t0,t1] against the AABB so we only march near the mountain
    let t0 = 0, t1 = maxT;
    const axes = [['x', a.minX, a.maxX], ['y', a.minY, a.maxY], ['z', a.minZ, a.maxZ]];
    for (const [k, mn, mx] of axes) {
      const ok = o[k], dk = d[k];
      if (Math.abs(dk) < 1e-9) { if (ok < mn || ok > mx) return null; continue; }
      let ta = (mn - ok) / dk, tb = (mx - ok) / dk;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
    const step = 0.35;
    let tPrev = t0;
    let prev = this.densityAt(o.x + d.x * t0, o.y + d.y * t0, o.z + d.z * t0);
    if (prev <= 0) return t0;
    for (let t = Math.min(t0 + step, t1); ; t = Math.min(t + step, t1)) {
      const cur = this.densityAt(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
      if (cur <= 0) {                                   // air → solid: surface in (tPrev, t)
        let lo = tPrev, hi = t;
        for (let it = 0; it < 10; it++) {
          const m = (lo + hi) * 0.5;
          (this.densityAt(o.x + d.x * m, o.y + d.y * m, o.z + d.z * m) <= 0) ? (hi = m) : (lo = m);
        }
        return (lo + hi) * 0.5;
      }
      if (t >= t1) return null;
      tPrev = t;
    }
  }

  // outward normal (= +∇f since the field grows toward air) for wall/ceiling push-out.
  gradient(x, y, z, h = 0.4) {
    const gx = this.densityAt(x + h, y, z) - this.densityAt(x - h, y, z);
    const gy = this.densityAt(x, y + h, z) - this.densityAt(x, y - h, z);
    const gz = this.densityAt(x, y, z + h) - this.densityAt(x, y, z - h);
    const il = 1 / (Math.hypot(gx, gy, gz) || 1);
    return { x: gx * il, y: gy * il, z: gz * il };
  }

  // ── render (Surface Nets over the field) ─────────────────────────────────────────────────────────────

  build(material) {
    const a = this.aabb, vs = this.voxel;
    const nx = Math.round((a.maxX - a.minX) / vs), ny = Math.round((a.maxY - a.minY) / vs), nz = Math.round((a.maxZ - a.minZ) / vs);
    const dim = [nx + 1, ny + 1, nz + 1];
    const data = new Float32Array(dim[0] * dim[1] * dim[2]);
    // ground / rockTop / ceil are y-independent → sample each (x,z) column ONCE (the terrain fBm is the hot path).
    const cols = dim[0] * dim[2], gC = new Float32Array(cols), topC = new Float32Array(cols), ceilC = new Float32Array(cols);
    for (let k = 0; k < dim[2]; k++) { const wz = a.minZ + k * vs;
      for (let i = 0; i < dim[0]; i++) { const wx = a.minX + i * vs, ci = i + k * dim[0];
        const g = this.terrain.terrainHeightAt(wx, wz); gC[ci] = g; topC[ci] = this.rockTop(wx, wz, g); ceilC[ci] = this.ceilAt(wx, wz, g); } }
    for (let k = 0; k < dim[2]; k++) { const kk = k * dim[0] * dim[1], c0 = k * dim[0];
      for (let j = 0; j < dim[1]; j++) { const wy = a.minY + j * vs, jj = j * dim[0];
        for (let i = 0; i < dim[0]; i++) { const ci = i + c0, g = gC[ci];
          data[i + jj + kk] = Math.max(Math.max(g - 3.0 - wy, wy - topC[ci]), Math.min(ceilC[ci] - wy, wy - g)); } } }
    const m = meshChunk(data, dim, vs, [a.minX, a.minY, a.minZ]);
    if (!m) { console.warn('[cave] empty volume — no surface'); return this; }
    const V = m.vertCount, pos = m.positions, nor = new Float32Array(V * 3);
    const h = 0.35;
    for (let v = 0; v < V; v++) {                       // analytic gradient normals (outward = +∇f toward air)
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const gx = this.densityAt(x + h, y, z) - this.densityAt(x - h, y, z);
      const gy = this.densityAt(x, y + h, z) - this.densityAt(x, y - h, z);
      const gz = this.densityAt(x, y, z + h) - this.densityAt(x, y, z - h);
      const il = 1 / (Math.hypot(gx, gy, gz) || 1); nor[v * 3] = gx * il; nor[v * 3 + 1] = gy * il; nor[v * 3 + 2] = gz * il;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'caveRock'; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.group.add(this.mesh); this.world.scene.add(this.group);
    this.triCount = m.triCount;
    this._addFloor();
    this._addRocks();
    this._addTorches();
    return this;
  }

  // a rounded multi-tone granite boulder (sits on y=0, grows +Y), lighter toward the top
  _makeBoulder(seed, scale) {
    let s = (seed >>> 0) || 1; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const b = new MeshBuilder(), TONES = [0x47443c, 0x575146, 0x686154, 0x787061], R = 0.9 * scale, n = 12 + (rnd() * 8 | 0);
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1), rad = R * (0.35 + 0.55 * rnd());
      const px = Math.sin(v) * Math.cos(u) * rad, py = Math.abs(Math.cos(v)) * rad * 0.85, pz = Math.sin(v) * Math.sin(u) * rad, sz = R * (0.5 + 0.45 * rnd());
      b.box(sz, sz * 0.85, sz, px, py, pz, TONES[Math.min(3, Math.floor((py / (R * 0.9)) * 4))]);
    }
    return b.build();
  }

  // Frame the cave mouth with rock outcrops + a couple of cover boulders just outside (cave-as-holdout cover).
  _addRocks() {
    const t = this.terrain, mat = voxelMaterial();
    const place = (x, z, scale, seed, solid) => {
      const geo = this._makeBoulder(seed, scale), mesh = new THREE.Mesh(geo, mat);
      const y = t.terrainHeightAt(x, z) - 0.55 * scale; mesh.position.set(x, y, z); mesh.rotation.y = (seed % 628) / 100;
      mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; this.group.add(mesh);
      if (solid) { const r = 0.75 * scale, hh = 1.2 * scale; this.world.boxes.push({ min: new THREE.Vector3(x - r, y + 0.3 * scale, z - r), max: new THREE.Vector3(x + r, y + hh, z + r) }); }
    };
    place(this.A.x - 4.4, -37.0, 2.5, 0x51a1, true); place(this.A.x - 5.9, -34.6, 1.7, 0x1d2e, true);   // left jamb cluster
    place(this.A.x + 4.6, -37.4, 2.7, 0x77b3, true); place(this.A.x + 6.1, -35.0, 1.6, 0x9f3a, true);   // right jamb cluster
    place(this.A.x - 1.6, -30.5, 1.4, 0x4c2b, true);                                                     // cover boulder, approach L
    place(this.A.x + 2.4, -29.6, 1.2, 0xbe5c, true);                                                     // cover boulder, approach R
  }

  // dark dirt floor laid over the ground inside the cave footprint (bare grass reads wrong for a cave interior).
  _addFloor() {
    const a = this.aabb, step = 0.8, t = this.terrain, pos = [], idx = [], vid = [];
    const minZ = a.minZ, maxZ = -29;
    const covered = (x, z) => this.insideAt(x, z) > 0.04 || (z > -43.0 && Math.abs(x - this.A.x) < 5.2 - (z + 43.0) * 0.16);
    const cols = Math.ceil((a.maxX - a.minX) / step), rows = Math.ceil((maxZ - minZ) / step);
    let vi = 0;
    for (let r = 0; r <= rows; r++) { vid[r] = []; const z = minZ + r * step;
      for (let c = 0; c <= cols; c++) { const x = a.minX + c * step;
        if (covered(x, z)) { pos.push(x, t.terrainHeightAt(x, z) + 0.05, z); vid[r][c] = vi++; } else vid[r][c] = -1; } }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const A = vid[r][c], B = vid[r][c + 1], C = vid[r + 1][c], D = vid[r + 1][c + 1];
      if (A >= 0 && B >= 0 && C >= 0 && D >= 0) idx.push(A, C, B, B, C, D); }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0x4a3a26 }); mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
    const floor = new THREE.Mesh(geo, mat); floor.name = 'caveFloor'; floor.receiveShadow = true; floor.frustumCulled = false;
    this.group.add(floor);
  }

  // Warm torch glow at MAP-BUILD time (never scene.add a light at runtime — see CLAUDE.md).
  _addTorches() {
    const t = this.terrain;
    this.torches = [];
    const flameTex = this._flameTex();
    const spots = [
      { x: this.A.x - 2.4, z: -41.5 }, { x: this.A.x + 2.4, z: -43.5 }, { x: this.A.x, z: -49.5 },
    ];
    for (const s of spots) {
      const fy = t.terrainHeightAt(s.x, s.z) + 1.9;
      const L = new THREE.PointLight(0xffa24a, 5.6, 10, 2.3);
      L.position.set(s.x, fy, s.z); L.castShadow = false;
      this.group.add(L);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffd27a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flame.scale.set(0.9, 1.3, 1); flame.position.set(s.x, fy, s.z); this.group.add(flame);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.9, 5), new THREE.MeshLambertMaterial({ color: 0x241b12 }));
      post.position.set(s.x, t.terrainHeightAt(s.x, s.z) + 0.95, s.z); this.group.add(post);
      this.torches.push({ light: L, flame, baseI: 5.6, phase: s.x * 1.7 + s.z });
    }
    const dx = this.A.x, dz = -52, dy = t.terrainHeightAt(dx, dz) + 3.2;
    const fill = new THREE.PointLight(0x4a5a70, 1.5, 18, 1.6); fill.position.set(dx, dy, dz); fill.castShadow = false; this.group.add(fill);
  }

  _flameTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    const g = x.createRadialGradient(32, 34, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.35, 'rgba(255,170,70,0.8)'); g.addColorStop(0.7, 'rgba(200,80,20,0.25)'); g.addColorStop(1, 'rgba(120,40,10,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  }

  update(dt) {
    if (!this.torches) return;
    this._t = (this._t || 0) + (dt || 0); const time = this._t;
    for (const t of this.torches) { const f = 0.80 + 0.20 * Math.sin(time * 11 + t.phase) * Math.sin(time * 6.3 + t.phase * 1.7); t.light.intensity = t.baseI * f; t.flame.scale.set(0.78 + 0.18 * f, 1.15 + 0.3 * f, 1); }
  }
}
