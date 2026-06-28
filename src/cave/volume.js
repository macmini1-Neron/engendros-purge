// cave/volume.js — a TRUE 3D cave (real overhangs / převisy) bolted onto the heightfield forest map,
// the ROBUST way: the floor stays the battle-tested HEIGHTFIELD everywhere (zero sink risk — owner's #1
// demand), and the cave adds only a DENSITY-FIELD rock ROOF/ENCLOSURE you walk under, meshed by Naive
// Surface Nets. It sits inside the steep massif over the sunken CAVE CORRIDOR (terrain.js FOREST_TUNING),
// open at the mouth, closing to a rock back-wall + dome. Player-only (enemies path on the surface).
//
// Density (solid<0, Lysenko): air is the chamber VOID between the heightfield floor and the rock roof;
// rock is everything above the roof underside (+ a buried slab below the floor so no floor face z-fights).
// field = min(roofY - y, y - (floorH - 2)). insideAt(x,z) lerps the roof from "at the floor" (closed
// shell) to ROOF_H headroom (open chamber). Collision = a CEILING CLAMP (head can't pop through the roof);
// the floor is the heightfield, so the player can never fall through.
import * as THREE from 'three';
import { makeNoise } from './noise.js';
import { meshChunk } from './surfacenets.js';
import { FOREST_TUNING } from '../terrain.js';
import { MeshBuilder, voxelMaterial } from '../util.js';

const smooth01 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
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
    const c = FOREST_TUNING.corridor;
    // roofed segment = the inner part of the corridor (the outer slot stays open-top heightfield).
    this.A = { x: c.bx, z: -40 };          // mouth end (a few m inside the slot)
    this.B = { x: c.bx, z: c.bz - 1 };     // back end (just past the corridor end → a solid back wall)
    this.halfW = 3.8;
    this.rim = 6.2;
    this.ROOF_H = opts.roofH || 5.0;       // chamber headroom (m)
    this.aabb = { minX: c.bx - 7.5, maxX: c.bx + 7.5, minZ: c.bz - 3, maxZ: -36, minY: -3.0, maxY: this.ROOF_H + 3.5 };
    this.voxel = opts.voxel || 0.5;
    this.N = makeNoise(0xca7e);
    this.group = new THREE.Group(); this.group.name = 'caveVolume';
    this.mesh = null;
  }

  // 0 (closed shell) → 1 (open chamber). Open at the mouth, fading to the rim walls + the back wall.
  insideAt(x, z) {
    const pd = segPD(x, z, this.A.x, this.A.z, this.B.x, this.B.z);
    const perp = 1 - smooth01(this.halfW - 0.5, this.rim, pd.d);
    const along = 1 - smooth01(0.82, 1.0, pd.t);        // open from the mouth (t=0) to t~0.82, then close to the back wall
    return Math.max(0, Math.min(1, perp * along));
  }
  // the rock roof underside Y at (x,z): floor when closed, floor+ROOF_H (+ organic jitter) in the chamber.
  roofYAt(x, z, floorH) {
    const ins = this.insideAt(x, z);
    if (ins <= 0.001) return floorH;                    // closed → roof sits on the floor (no void)
    const jitter = 0.55 * this.N.simplex3(x * 0.5, 7.3, z * 0.5);
    return floorH + this.ROOF_H * ins + jitter * ins;
  }
  // signed density (solid<0). rock above the roof + buried slab below the floor; air is the chamber void.
  densityAt(x, y, z) {
    const floorH = this.terrain.terrainHeightAt(x, z);
    const roofY = this.roofYAt(x, z, floorH);
    return Math.min(roofY - y, y - (floorH - 2.0));     // >0 = air (void), <0 = solid (roof rock / sub-floor)
  }

  build(material) {
    const a = this.aabb, vs = this.voxel;
    const nx = Math.round((a.maxX - a.minX) / vs), ny = Math.round((a.maxY - a.minY) / vs), nz = Math.round((a.maxZ - a.minZ) / vs);
    const dim = [nx + 1, ny + 1, nz + 1];               // CORNER counts
    const data = new Float32Array(dim[0] * dim[1] * dim[2]);
    for (let k = 0; k < dim[2]; k++) { const wz = a.minZ + k * vs, kk = k * dim[0] * dim[1];
      for (let j = 0; j < dim[1]; j++) { const wy = a.minY + j * vs, jj = j * dim[0];
        for (let i = 0; i < dim[0]; i++) { data[i + jj + kk] = this.densityAt(a.minX + i * vs, wy, wz); } } }
    const m = meshChunk(data, dim, vs, [a.minX, a.minY, a.minZ]);
    if (!m) { console.warn('[cave] empty volume — no surface'); return this; }
    const V = m.vertCount, pos = m.positions, nor = new Float32Array(V * 3);
    const h = 0.35;
    for (let v = 0; v < V; v++) {                       // analytic gradient normals (outward = +∇f toward air)
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      let gx = this.densityAt(x + h, y, z) - this.densityAt(x - h, y, z);
      let gy = this.densityAt(x, y + h, z) - this.densityAt(x, y - h, z);
      let gz = this.densityAt(x, y, z + h) - this.densityAt(x, y, z - h);
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
    // darker WARM granite tones so the outcrops read as the same rock as the cliff (the old cool light greys
    // looked pale/detached). lit lighter toward the top, weathered/mossy darker at the base.
    const b = new MeshBuilder(), TONES = [0x47443c, 0x575146, 0x686154, 0x787061], R = 0.9 * scale, n = 12 + (rnd() * 8 | 0);
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1), rad = R * (0.35 + 0.55 * rnd());
      const px = Math.sin(v) * Math.cos(u) * rad, py = Math.abs(Math.cos(v)) * rad * 0.85, pz = Math.sin(v) * Math.sin(u) * rad, sz = R * (0.5 + 0.45 * rnd());
      b.box(sz, sz * 0.85, sz, px, py, pz, TONES[Math.min(3, Math.floor((py / (R * 0.9)) * 4))]);
    }
    return b.build();
  }

  // Frame the cave mouth with rock outcrops (the "frame the mouth" legibility cue) + a couple of cover
  // boulders just outside (the cave-as-holdout firefight gets hard cover). Modeled rock = the vision's
  // "drama from modeled rocks, not noise". Big ones get an AABB collider (indexed by the later grid.build).
  _addRocks() {
    const t = this.terrain, mat = voxelMaterial();
    const place = (x, z, scale, seed, solid) => {
      const geo = this._makeBoulder(seed, scale), mesh = new THREE.Mesh(geo, mat);
      // EMBED deep (−0.55·scale) so it's never a floating box on a slope; sit it in the ground like real geology.
      const y = t.terrainHeightAt(x, z) - 0.55 * scale; mesh.position.set(x, y, z); mesh.rotation.y = (seed % 628) / 100;
      mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; this.group.add(mesh);
      if (solid) { const r = 0.75 * scale, hh = 1.2 * scale; this.world.boxes.push({ min: new THREE.Vector3(x - r, y + 0.3 * scale, z - r), max: new THREE.Vector3(x + r, y + hh, z + r) }); }
    };
    // CLUSTERED jambs framing the mouth (each side = a big + a buddy, overlapping) on the flatter apron, plus
    // two cover boulders on the approach. No lone rocks on the steep flank (those read as a placement bug).
    place(this.A.x - 4.4, -37.0, 2.5, 0x51a1, true); place(this.A.x - 5.9, -34.6, 1.7, 0x1d2e, true);   // left jamb cluster
    place(this.A.x + 4.6, -37.4, 2.7, 0x77b3, true); place(this.A.x + 6.1, -35.0, 1.6, 0x9f3a, true);   // right jamb cluster
    place(this.A.x - 1.6, -30.5, 1.4, 0x4c2b, true);                                                     // cover boulder, approach L
    place(this.A.x + 2.4, -29.6, 1.2, 0xbe5c, true);                                                     // cover boulder, approach R
  }

  // A dark dirt floor laid over the heightfield inside the cave footprint (the bare heightfield reads as
  // grass — wrong for a cave interior). Sits 0.05 m above the ground (polygonOffset) so it never z-fights.
  _addFloor() {
    const a = this.aabb, step = 0.8, t = this.terrain, pos = [], idx = [], vid = [];
    const minZ = a.minZ, maxZ = -29;                                   // extend the dirt SOUTH into a scree apron in front of the mouth
    // covered if inside the cave OR on the mouth apron (a corridor of dirt that narrows as it leaves the mouth)
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

  // Warm torch glow + ember sources. Added at MAP-BUILD time (not mid-game) so the one-time shader recompile
  // happens at load — never `scene.add` a light at runtime (would stutter; see CLAUDE.md). Light economy: the
  // cave is a lit-but-spooky retreat; the torches mark it without solving the darkness deeper in.
  _addTorches() {
    const t = this.terrain;
    this.torches = [];
    const flameTex = this._flameTex();
    const spots = [
      { x: this.A.x - 2.4, z: -41.5 }, { x: this.A.x + 2.4, z: -43.5 }, { x: this.A.x, z: -49.5 },
    ];
    for (const s of spots) {
      const fy = t.terrainHeightAt(s.x, s.z) + 1.9;
      const L = new THREE.PointLight(0xffa24a, 5.6, 10, 2.3);   // tighter local pools (not a smooth orange wash over the whole maw)
      L.position.set(s.x, fy, s.z); L.castShadow = false;
      this.group.add(L);
      // ADDITIVE glowing flame sprite (camera-facing radial gradient → reads as fire, not a flat lozenge)
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffd27a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flame.scale.set(0.9, 1.3, 1); flame.position.set(s.x, fy, s.z); this.group.add(flame);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.9, 5), new THREE.MeshLambertMaterial({ color: 0x241b12 }));
      post.position.set(s.x, t.terrainHeightAt(s.x, s.z) + 0.95, s.z); this.group.add(post);
      this.torches.push({ light: L, flame, baseI: 5.6, phase: s.x * 1.7 + s.z });
    }
    // one dim COOL fill deep in the chamber so the back reads as silhouette, not pure black (light economy:
    // torches are the warm pockets, this is the faint cold ambient that keeps the space legible). Static.
    const dx = this.A.x, dz = -52, dy = t.terrainHeightAt(dx, dz) + 3.2;
    const fill = new THREE.PointLight(0x4a5a70, 1.5, 18, 1.6); fill.position.set(dx, dy, dz); fill.castShadow = false; this.group.add(fill);
  }

  // soft radial flame gradient (warm core → transparent) for the additive torch sprite
  _flameTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    const g = x.createRadialGradient(32, 34, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.35, 'rgba(255,170,70,0.8)'); g.addColorStop(0.7, 'rgba(200,80,20,0.25)'); g.addColorStop(1, 'rgba(120,40,10,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  }

  // gentle torch flicker — call each frame with dt (cheap; 3 lights + sprites).
  update(dt) {
    if (!this.torches) return;
    this._t = (this._t || 0) + (dt || 0); const time = this._t;
    for (const t of this.torches) { const f = 0.80 + 0.20 * Math.sin(time * 11 + t.phase) * Math.sin(time * 6.3 + t.phase * 1.7); t.light.intensity = t.baseI * f; t.flame.scale.set(0.78 + 0.18 * f, 1.15 + 0.3 * f, 1); }
  }

  // quick XZ test — is (x,z) inside the cave footprint?
  contains(x, z) { const a = this.aabb; return x > a.minX - 1 && x < a.maxX + 1 && z > a.minZ - 1 && z < a.maxZ + 1 && this.insideAt(x, z) > 0.02; }

  // CEILING CLAMP: keep the player's head below the rock roof (never pushes below the heightfield floor).
  // Returns the clamped feet-Y for a body of height `hgt` whose feet are at feetY. Floor stays the heightfield.
  clampHead(x, z, feetY, hgt) {
    if (!this.contains(x, z)) return feetY;
    const floorH = this.terrain.terrainHeightAt(x, z);
    const roofY = this.roofYAt(x, z, floorH) - 0.25;    // 0.25 m head clearance below the rock
    const maxFeet = roofY - hgt;
    if (maxFeet <= floorH) return feetY;                // roof too low here (shell edge) → don't clamp below the floor
    return feetY > maxFeet ? maxFeet : feetY;
  }
}
