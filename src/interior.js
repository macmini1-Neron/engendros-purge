// interior.js — the underground MINE as a separate "GTA-SA interior" pocket. It lives at a fixed offset
// (ΔY = −1000, same XZ, directly below the cave) as its own THREE.Group + wall colliders. While the LOCAL player
// is inside (world.interiorActive), World.collide routes to _collideInterior (this.floorAt + the wall boxes),
// bypassing the terrain/rock. Crossing the seam plane (in the dark back of the cave) teleports the player by the
// offset — pos/vel/facing preserved — so it just "continues" downward. No fade: the seam sits in the dark, and
// heavy fog underground hides the far surface, so the one-frame swap is invisible.
//
// Placeholder mine (mechanic test): a flat landing at the seam → a descending ramp → one room. Timber supports +
// torches for the Minecraft-mineshaft read. Pure fns of position (floorAt) → co-op deterministic.
import * as THREE from 'three';
import { MeshBuilder, voxelMaterial } from './util.js';

const EX = -10;                         // entry X (under the cave tunnel centreline)
const SEAM_Z = -47;                     // seam plane (dark back of the cave; player never reaches the solid wall past it)
const DY = -1000;                       // pocket offset (straight down)
const LAND_Z1 = -44, RAMP_Z0 = -52, RAMP_Z1 = -72, SLOPE = 0.27;   // landing (incl. seam) → ramp (~15°) → room
const ROOM_Z0 = -72, ROOM_Z1 = -86, ROOM_X0 = -19, ROOM_X1 = -1;
const HALF_W = 4.0;                     // tunnel half-width
const HEAD = 4.2;                       // headroom

export class Interior {
  constructor(world) {
    this.world = world;
    this.EX = EX; this.SEAM_Z = SEAM_Z; this.dy = DY;
    this.G = world.terrain.terrainHeightAt(EX, SEAM_Z);   // surface cave floor at the seam
    this.baseY = this.G + DY;                             // pocket landing floor (1000 m below the seam floor)
    this.roomY = this.baseY - (RAMP_Z0 - RAMP_Z1) * SLOPE;
    this.group = new THREE.Group(); this.group.name = 'mineInterior';
    this._torch = [];
  }

  // mine ground Y (pure). Flat landing at/near the seam → ramp down going north → flat room. Co-op deterministic.
  floorAt(x, z) {
    if (z > RAMP_Z0) return this.baseY;                          // landing (covers the seam)
    if (z >= RAMP_Z1) return this.baseY - (RAMP_Z0 - z) * SLOPE; // ramp descends northward
    return this.roomY;                                          // room + beyond
  }
  contains(x, z) { return x > ROOM_X0 - 3 && x < ROOM_X1 + 3 && z < LAND_Z1 + 2 && z > ROOM_Z1 - 3; }

  build() {
    const b = new MeshBuilder();
    const ROCK = 0x2b2b30, ROCK_HI = 0x39393f, ROCK_LO = 0x202024, TIMBER = 0x5a4327, TIMBER_HI = 0x6e5433;
    // walk the mine in 2 m z-slices; emit floor + side walls + ceiling following floorAt (room section is wider)
    for (let z = LAND_Z1; z >= ROOM_Z1; z -= 2) {
      const inRoom = z <= ROOM_Z0;
      const x0 = inRoom ? ROOM_X0 : EX - HALF_W, x1 = inRoom ? ROOM_X1 : EX + HALF_W;
      const w = x1 - x0, cx = (x0 + x1) / 2, fy = this.floorAt(cx, z);
      b.box(w + 1, 0.5, 2.1, cx, fy - 0.25, z, ROCK_LO);          // floor slab
      b.box(w + 1, 0.4, 2.1, cx, fy + HEAD, z, ROCK_HI);          // ceiling
      b.box(0.6, HEAD + 0.6, 2.1, x0 - 0.3, fy + HEAD / 2, z, ROCK);   // left wall
      b.box(0.6, HEAD + 0.6, 2.1, x1 + 0.3, fy + HEAD / 2, z, ROCK);   // right wall
    }
    // timber support frames every ~6 m (uprights + lintel)
    for (let z = LAND_Z1 - 2; z >= ROOM_Z1 + 2; z -= 6) {
      const inRoom = z <= ROOM_Z0, x0 = inRoom ? ROOM_X0 + 1 : EX - HALF_W, x1 = inRoom ? ROOM_X1 - 1 : EX + HALF_W;
      const fy = this.floorAt(EX, z);
      b.box(0.45, HEAD, 0.45, x0, fy + HEAD / 2, z, TIMBER);
      b.box(0.45, HEAD, 0.45, x1, fy + HEAD / 2, z, TIMBER);
      b.box(x1 - x0 + 0.9, 0.45, 0.45, (x0 + x1) / 2, fy + HEAD, z, TIMBER_HI);   // lintel
    }
    const mesh = new THREE.Mesh(b.build(), voxelMaterial());
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.group.add(mesh);
    this.world.scene.add(this.group);
    this._buildColliders();
    this._buildTorches();
    this.buildEntrance();
    return this;
  }

  // ── diegetic entrance UX (no glowing markers): a timber MINE PORTAL + warning sign + rails & cart + a hanging
  // caged bulb + dust drifting out. Built identically on the SURFACE (cave back) AND at the pocket doorway so the
  // walk-through is seamless. The descend audio/vignette confirm lives in game._swapMine.
  buildEntrance() {
    this._surface = new THREE.Group(); this._surface.name = 'mineEntrance'; this.world.scene.add(this._surface);
    this._portal(this._surface, this.G);        // surface doorway (cave back)
    this._portal(this.group, this.baseY);       // pocket doorway (matches → seamless)
    this._rails(this._surface, true);           // rails on the cave floor up to the portal
    this._rails(this.group, false);             // rails continuing down the ramp
    this._cart(this._surface, -43);             // вагонетка just inside the cave
    this._dust();                               // motes drifting out of the mouth
    this._entranceColliders();
  }

  _portal(group, y) {
    const b = new MeshBuilder(), EX = this.EX, Z = this.SEAM_Z, TIMBER = 0x4a3620, TIMBER_HI = 0x5e4526, HW = 3.6, H = 3.0;
    b.box(0.5, H, 0.5, EX - HW, y + H / 2, Z, TIMBER);                 // left upright
    b.box(0.5, H, 0.5, EX + HW, y + H / 2, Z, TIMBER);                 // right upright
    b.box(HW * 2 + 1, 0.5, 0.5, EX, y + H, Z, TIMBER_HI);             // lintel
    b.box(HW * 2 + 1.2, 0.8, 0.35, EX, y + H + 0.55, Z, 0x2f2214);     // header board (sign backing)
    b.box(1.7, 0.35, 0.35, EX - HW + 0.95, y + H - 0.55, Z, TIMBER);   // brace L
    b.box(1.7, 0.35, 0.35, EX + HW - 0.95, y + H - 0.55, Z, TIMBER);   // brace R
    const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; group.add(m);
    this._sign(group, y, H); this._bulb(group, y, H);
  }

  _sign(group, y, H) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 100; const x = cv.getContext('2d');
    x.fillStyle = '#6b1f16'; x.fillRect(0, 0, 256, 100);
    x.strokeStyle = '#e8d9a0'; x.lineWidth = 5; x.strokeRect(7, 7, 242, 86);
    x.fillStyle = '#e8d9a0'; x.textAlign = 'center';
    x.font = 'bold 46px Georgia, serif'; x.fillText('ШАХТА', 128, 46);
    x.font = 'bold 20px Georgia, serif'; x.fillText('ОПАСНО · НЕ ВХОДИТЬ', 128, 78);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.15), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(this.EX, y + H + 0.55, this.SEAM_Z + 0.3); sign.frustumCulled = false; group.add(sign);   // faces +Z (toward the approach)
  }

  _bulb(group, y, H) {
    const EX = this.EX, Z = this.SEAM_Z - 0.6, by = y + H - 0.7;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 4), new THREE.MeshBasicMaterial({ color: 0x141414 }));
    cord.position.set(EX, y + H - 0.35, Z); cord.frustumCulled = false; group.add(cord);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
    bulb.position.set(EX, by, Z); bulb.frustumCulled = false; group.add(bulb);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x2a2a2a, wireframe: true }));
    cage.position.set(EX, by, Z); cage.frustumCulled = false; group.add(cage);
    const L = new THREE.PointLight(0xffd9a0, 3.4, 10, 2.0); L.position.set(EX, by, Z); L.castShadow = false; group.add(L);
  }

  _rails(group, surface) {
    const b = new MeshBuilder(), EX = this.EX, RAIL = 0x2a2a30, TIE = 0x35281a, t = this.world.terrain;
    const z0 = surface ? -42 : -48, z1 = surface ? this.SEAM_Z : -70;
    for (let z = z0; z >= z1; z -= 1) {
      const y = surface ? t.terrainHeightAt(EX, z) + 0.06 : this.floorAt(EX, z) + 0.06;
      b.box(1.9, 0.1, 0.35, EX, y, z, TIE);
      b.box(0.12, 0.14, 1.0, EX - 0.7, y + 0.1, z, RAIL);
      b.box(0.12, 0.14, 1.0, EX + 0.7, y + 0.1, z, RAIL);
    }
    const m = new THREE.Mesh(b.build(), voxelMaterial()); m.receiveShadow = true; m.frustumCulled = false; group.add(m);
  }

  _cart(group, z) {
    const b = new MeshBuilder(), cx = this.EX, y = this.world.terrain.terrainHeightAt(cx, z) + 0.06, METAL = 0x33333a, RUST = 0x5a3a24;
    b.box(1.7, 0.16, 1.4, cx, y + 0.72, z, METAL);
    b.box(1.7, 0.72, 0.16, cx, y + 1.1, z - 0.7, RUST);
    b.box(1.7, 0.72, 0.16, cx, y + 1.1, z + 0.7, RUST);
    b.box(0.16, 0.72, 1.4, cx - 0.85, y + 1.1, z, RUST);
    b.box(0.16, 0.72, 1.4, cx + 0.85, y + 1.1, z, RUST);
    for (const dz of [-0.5, 0.5]) for (const dx of [-0.7, 0.7]) b.box(0.3, 0.3, 0.14, cx + dx, y + 0.28, z + dz, METAL);
    const m = new THREE.Mesh(b.build(), voxelMaterial()); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; group.add(m);
    this._cartZ = z;
  }

  _dust() {
    const N = 26, pos = new Float32Array(N * 3); this._dustV = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = this.EX + (Math.random() * 2 - 1) * 3.2; pos[i * 3 + 1] = this.G + 0.3 + Math.random() * 2.4; pos[i * 3 + 2] = this.SEAM_Z + Math.random() * 1.2;
      this._dustV.push({ vy: -0.18 - Math.random() * 0.16, vz: 0.35 + Math.random() * 0.4 });   // drift down + OUT (south)
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9a9080, size: 0.06, transparent: true, opacity: 0.5, depthWrite: false }));
    this._dust.frustumCulled = false; this._surface.add(this._dust);
  }

  _entranceColliders() {
    const push = (x0, y0, z0, x1, y1, z1) => this.world.boxes.push({ min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) });
    const EX = this.EX, Z = this.SEAM_Z, HW = 3.6;
    for (const yy of [this.G, this.baseY]) {                          // frame uprights on both sides (walk through the gap)
      push(EX - HW - 0.3, yy, Z - 0.4, EX - HW + 0.3, yy + 3, Z + 0.4);
      push(EX + HW - 0.3, yy, Z - 0.4, EX + HW + 0.3, yy + 3, Z + 0.4);
    }
    push(EX - 0.95, this.G, this._cartZ - 0.85, EX + 0.95, this.G + 1.5, this._cartZ + 0.85);   // cart body
  }

  // side/back walls as AABB colliders (at pocket Y → gated out on the surface by the Y-overlap test in collide;
  // gated IN underground). The floor is the analytic floorAt. Pushed BEFORE world builds its SpatialGrid.
  _buildColliders() {
    const push = (x0, y0, z0, x1, y1, z1) => this.world.boxes.push({ min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) });
    for (let z = LAND_Z1; z >= ROOM_Z1; z -= 2) {
      const inRoom = z <= ROOM_Z0, x0 = inRoom ? ROOM_X0 : EX - HALF_W, x1 = inRoom ? ROOM_X1 : EX + HALF_W;
      const fy = this.floorAt(EX, z);
      push(x0 - 0.8, fy, z - 1.1, x0, fy + HEAD, z + 1.1);     // left wall
      push(x1, fy, z - 1.1, x1 + 0.8, fy + HEAD, z + 1.1);     // right wall
    }
    push(ROOM_X0, this.roomY, ROOM_Z1 - 0.8, ROOM_X1, this.roomY + HEAD, ROOM_Z1);   // room back wall
  }

  _buildTorches() {
    for (const z of [-50, -60, -78]) {
      const fy = this.floorAt(EX, z) + 2.2;
      const L = new THREE.PointLight(0xffa24a, 6.0, 13, 2.2); L.position.set(EX + 3, fy, z); L.castShadow = false;
      this.group.add(L);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      glow.position.copy(L.position); glow.frustumCulled = false; this.group.add(glow);
      this._torch.push({ light: L, base: 6.0, ph: z });
    }
  }

  update(dt) {
    this._t = (this._t || 0) + (dt || 0);
    for (const t of this._torch) t.light.intensity = t.base * (0.82 + 0.18 * Math.sin(this._t * 10 + t.ph));
    if (this._dust) {   // dust drifting OUT of the mouth (down + south), respawn at the threshold
      const arr = this._dust.geometry.attributes.position.array;
      for (let i = 0; i < this._dustV.length; i++) {
        const v = this._dustV[i]; arr[i * 3 + 1] += v.vy * dt; arr[i * 3 + 2] += v.vz * dt;
        if (arr[i * 3 + 2] > this.SEAM_Z + 5 || arr[i * 3 + 1] < this.G - 0.2) {
          arr[i * 3] = this.EX + (Math.random() * 2 - 1) * 3.2; arr[i * 3 + 1] = this.G + 0.3 + Math.random() * 2.4; arr[i * 3 + 2] = this.SEAM_Z;
        }
      }
      this._dust.geometry.attributes.position.needsUpdate = true;
    }
  }
}
