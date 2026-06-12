// interp.js — the ONLY three-importing module in src/buildings/. Realizes a validated spec's
// neutral prims as merged THREE meshes (one per material — the draw-call budget), derives
// nothing itself: geometry truth lives in plan.js, legality in spec.js.
//
// Tiling: metric TRIPLANAR UVs written post-merge from world-space positions — adjacent wall
// segments (jambs/lintels) share the world grid, so brick courses run continuously across
// every cut with no seams, and texture.repeat stays (1,1) (the law: tiling lives in UVs).
import * as THREE from 'three';
import { MeshBuilder, voxelMaterial } from '../util.js';
import { validate } from './spec.js';
import { planBuild } from './plan.js';
import { resolveMaterial } from './palette.js';
import { makeTextureCanvas, makeSignCanvas } from './textures.js';
import { buildSpec as buildPropSpec } from '../props/voxel-interp.js';   // the one allowed modelgen coupling
import { getSpec as getPropSpec, hasModel as hasPropModel } from '../props/registry-core.js';

const D2R = Math.PI / 180;

function metricUVs(geometry, tile) {
  const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, p.getX(i) / tile.w, p.getZ(i) / tile.h);
    else if (nx >= nz) uv.setXY(i, p.getZ(i) / tile.w, p.getY(i) / tile.h);
    else uv.setXY(i, p.getX(i) / tile.w, p.getY(i) / tile.h);
  }
  uv.needsUpdate = true;
}

// Triangular-prism (gable) geometry: bbox w×h×d centred at origin; ridge along `axis` at the top.
function prismGeometry(w, h, d, axis) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  // cross-section triangle in the plane ⊥ axis: base corners at −hh, apex at +hh centre
  const tri = axis === 'x'
    ? [[-hd, -hh], [hd, -hh], [0, hh]]                       // (z, y) extruded along x
    : [[-hw, -hh], [hw, -hh], [0, hh]];                      // (x, y) extruded along z
  const a = axis === 'x' ? hw : hd;
  const v = [];
  const P = (t, ax) => (axis === 'x' ? [ax, t[1], t[0]] : [t[0], t[1], ax]);
  // two triangle caps
  v.push(P(tri[0], -a), P(tri[1], -a), P(tri[2], -a));
  v.push(P(tri[1], a), P(tri[0], a), P(tri[2], a));
  // three rectangular sides (two slopes + base), as quads
  for (let i = 0; i < 3; i++) {
    const A = tri[i], B = tri[(i + 1) % 3];
    v.push(P(A, -a), P(B, -a), P(B, a), P(A, -a), P(B, a), P(A, a));
  }
  return rawGeometry(v);
}

// Wedge (ramp slab): bbox w×h×d centred at origin; full height at the `hi` side (N/S/E/W),
// sloping to zero at the opposite side; `axis` is the level (extrusion) direction.
function wedgeGeometry(w, h, d, axis, hi) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const s = (hi === 'N' || hi === 'E') ? 1 : -1;            // which end of the slope axis is high
  // profile in the slope direction: (slopeCoord, y): low at −s·half, high at +s·half
  const half = axis === 'x' ? hd : hw;                       // slope runs ⊥ to the extrusion axis
  const prof = [[-s * half, -hh], [s * half, -hh], [s * half, hh]];
  const a = axis === 'x' ? hw : hd;
  const v = [];
  const P = (t, ax) => (axis === 'x' ? [ax, t[1], t[0]] : [t[0], t[1], ax]);
  v.push(P(prof[0], -a), P(prof[1], -a), P(prof[2], -a));    // cap
  v.push(P(prof[1], a), P(prof[0], a), P(prof[2], a));       // cap
  for (let i = 0; i < 3; i++) {                              // base, vertical end, hypotenuse
    const A = prof[i], B = prof[(i + 1) % 3];
    v.push(P(A, -a), P(B, -a), P(B, a), P(A, -a), P(B, a), P(A, a));
  }
  return rawGeometry(v);
}

function rawGeometry(verts) {
  const g = new THREE.BufferGeometry();
  const flat = new Float32Array(verts.flat());
  g.setAttribute('position', new THREE.BufferAttribute(flat, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((flat.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

// Build a validated building spec → { group, colliders, stats, warns, infos }.
// opts: { dossier, props } forwarded to the validator (defaults to the live prop registry).
export function buildBuilding(spec, opts = {}) {
  const props = opts.props ?? { hasModel: hasPropModel, getSpec: getPropSpec };
  const res = validate(spec, { dossier: opts.dossier, props: opts.skipPropCheck ? undefined : props });
  if (res.errors.length) throw new Error(`buildgen spec '${spec?.id}' invalid:\n  - ${res.errors.join('\n  - ')}`);

  const plan = planBuild(spec);
  const root = new THREE.Group();
  root.name = `building:${spec.id}`;

  // bucket prims per material; signs and panes become standalone meshes
  const buckets = new Map();
  const bucket = (mat) => { if (!buckets.has(mat)) buckets.set(mat, new MeshBuilder()); return buckets.get(mat); };

  for (const c of plan.prims) {
    if (c.kind === 'propRef') {
      if (props.hasModel(c.model)) {
        const obj = buildPropSpec(props.getSpec(c.model));
        obj.position.set(c.x, c.y, c.z);
        obj.rotation.y = c.yaw * D2R;
        root.add(obj);
      } else console.warn(`[buildgen] propRef '${c.model}' not registered — skipped`);
      continue;
    }
    if (c.kind === 'pane') {
      const entry = resolveMaterial(c.mat ?? 'glassPane');
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(c.w, c.h),
        new THREE.MeshLambertMaterial({
          color: entry.color, transparent: true, opacity: entry.opacity,
          side: THREE.DoubleSide, depthWrite: false, emissive: entry.emissive, emissiveIntensity: 0.3,
        }),
      );
      m.position.set(c.x, c.y, c.z);
      m.rotation.y = (c.ry ?? 0) * D2R;
      if (c.lean) m.rotation.x = c.lean * D2R;
      m.renderOrder = 3;                                     // the airfield glass recipe
      root.add(m);
      continue;
    }
    if (c.text != null) {                                    // sign/stencil board — own canvas per text
      const entry = resolveMaterial(c.mat ?? 'signage');
      const tex = new THREE.CanvasTexture(makeSignCanvas(c.text, entry));
      tex.magFilter = THREE.NearestFilter;
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), new THREE.MeshLambertMaterial({ map: tex }));
      m.position.set(c.x, c.y, c.z);
      root.add(m);
      continue;
    }
    const entry = resolveMaterial(c.mat ?? 'concrete');
    const tone = new THREE.Color(entry.tones.mid).getHex();
    const b = bucket(c.mat ?? 'concrete');
    if (c.kind === 'box') {
      const rot = c.rot ?? [0, 0, 0];
      b.box(c.w, c.h, c.d, c.x, c.y, c.z, tone, { rx: rot[0] * D2R, ry: rot[1] * D2R, rz: rot[2] * D2R });
    } else if (c.kind === 'cyl') {
      const g = new THREE.CylinderGeometry(c.rTop, c.rBot, c.h, c.seg ?? 12);
      b.geo(g, c.x, c.y, c.z, tone);
      g.dispose();
    } else if (c.kind === 'prism') {
      const g = prismGeometry(c.w, c.h, c.d, c.axis);
      b.geo(g, c.x, c.y, c.z, tone);
      g.dispose();
    } else if (c.kind === 'wedge') {
      const g = wedgeGeometry(c.w, c.h, c.d, c.axis, c.hi);
      b.geo(g, c.x, c.y, c.z, tone);
      g.dispose();
    }
  }

  // realize the buckets: tiled → CanvasTexture with metric UVs; flat → vertex-colour Lambert
  for (const [matName, b] of buckets) {
    const entry = resolveMaterial(matName);
    const geo = b.build();
    let mesh;
    if (entry.kind === 'tiled') {
      metricUVs(geo, entry.tile);
      const tex = new THREE.CanvasTexture(makeTextureCanvas(matName, entry, spec.seed));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.NearestFilter;
      tex.repeat.set(1, 1);                                  // tiling lives in the UVs — never here
      mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    } else {
      mesh = new THREE.Mesh(geo, voxelMaterial());
    }
    mesh.name = `mat:${matName}`;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }

  root.userData = { buildingId: spec.id, footprint: spec.footprint, stats: plan.stats };
  return { group: root, colliders: plan.colliders, stats: plan.stats, warns: res.warns, infos: res.infos };
}
