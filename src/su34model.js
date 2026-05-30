// su34model.js - procedural Su-34 Fullback exterior asset for the admin viewer.
// Asset only: public exterior silhouette/detail, no gameplay or functional systems.
import * as THREE from 'three';

const PI = Math.PI;
const TAU = Math.PI * 2;

export const SU34_GUIDE_SOURCE_URL = 'https://jetworks.online/wp-content/uploads/2020/11/Su-34_Construction-guide_2020-11-29.pdf';
export const SU34_GENERAL_ARRANGEMENT_SOURCE_URL = 'https://www.jetworks.online/wp-content/uploads/2020/10/su-34_General-Arrangement_2020-11-28.pdf';
export const SU34_GENERAL_ARRANGEMENT = Object.freeze({
  source: 'Jetworks Su-34 General Arrangement 2020-11-28',
  sourceUrl: SU34_GENERAL_ARRANGEMENT_SOURCE_URL,
  lengthMm: 1398,
  spanMm: 845,
  heightMm: 291,
  tailplaneOffsetMm: 96,
  spanToLength: 845 / 1398,
  heightToLength: 291 / 1398,
});

const SU34_GUIDE_SCENE_LENGTH = 22.78; // p11 nose tip (-12.44) to p17 tailcone (10.34)
const SU34_GUIDE_SCENE_NOSE_Z = -12.44;
const SU34_GUIDE_SCENE_TAIL_Z = SU34_GUIDE_SCENE_NOSE_Z + SU34_GUIDE_SCENE_LENGTH;
const SU34_GA_SCENE_HALF_SPAN = (SU34_GUIDE_SCENE_LENGTH * SU34_GENERAL_ARRANGEMENT.spanToLength) / 2;
const SU34_GA_SCENE_GROUND_Y = 0.58;
const SU34_GA_SCENE_TOP_Y = SU34_GA_SCENE_GROUND_Y + SU34_GUIDE_SCENE_LENGTH * SU34_GENERAL_ARRANGEMENT.heightToLength;

export const SU34_GUIDE_PAGE_MANIFEST = Object.freeze([
  { pages: [1, 2], scope: 'cover/history/design notes', modelRole: 'reference only' },
  { pages: [3, 4], scope: 'materials, adhesives, cutting, marking guidelines, weight notes', modelRole: 'construction metadata' },
  { pages: [5, 6, 7, 8, 9, 10], scope: 'forward fuselage belly, bulkheads, side layers, bridge/magnet panels', modelRole: 'forward module' },
  { pages: [11, 12, 13, 14], scope: 'nosecone, aligner, canopy, magnets, sanding transition', modelRole: 'forward module finish' },
  { pages: [15, 16], scope: 'wing, carbon spar, wing strakes, canards, rear turtledeck stack', modelRole: 'wing/canard module' },
  { pages: [17, 18, 19, 20], scope: 'rear turtledeck, tailcone, triangular bulkhead, spine, belly transition', modelRole: 'rear fuselage module' },
  { pages: [21, 22, 23, 24], scope: 'nacelle inners/outers, EDF bulkheads, jigs, splitters, belly support strips', modelRole: 'nacelle module' },
  { pages: [25, 26, 27, 28, 29, 30, 31, 32, 33], scope: 'ducting, exhaust bulkheads, belly panels, intake protectors, servo blocks, stabiliser spar', modelRole: 'duct/belly module' },
  { pages: [34, 35, 36, 37, 38, 39, 40], scope: 'cable tunnels, turtledeck layers, upper nacelles, upper fuselage, exhausts, vertical/horizontal stabilisers', modelRole: 'upper/tail/exhaust module' },
  { pages: [41, 42], scope: 'completed model, paint/photo shaping reference', modelRole: 'finish/photo module' },
]);

function makeMaterials() {
  const mk = (color, metalness = 0.04, roughness = 0.72) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x4e788d,
    roughness: 0.18,
    metalness: 0.02,
    transmission: 0.18,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return {
    paleBlue: mk(0x9fc2d6, 0.03, 0.76),
    blue: mk(0x5e92b2, 0.04, 0.78),
    blueDark: mk(0x3f657e, 0.05, 0.80),
    grey: mk(0xa9b5be, 0.04, 0.74),
    radome: mk(0xd9d2c2, 0.02, 0.82),
    greyDark: mk(0x6c7780, 0.08, 0.78),
    seam: mk(0x334452, 0.08, 0.86),
    intake: mk(0x0b1014, 0.04, 0.9),
    metal: mk(0x8f969a, 0.38, 0.46),
    darkMetal: mk(0x2b3035, 0.5, 0.56),
    heat: mk(0x6f6257, 0.46, 0.62),
    rubber: mk(0x111315, 0.02, 0.86),
    glass,
    red: new THREE.MeshBasicMaterial({ color: 0xc42f2b, side: THREE.DoubleSide }),
    white: new THREE.MeshBasicMaterial({ color: 0xe6ecef, side: THREE.DoubleSide }),
  };
}

function finish(mesh, name) {
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(parent, name, mat, size, pos, rot = [0, 0, 0]) {
  const mesh = finish(new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(mesh);
  return mesh;
}

function cyl(parent, name, mat, radius, depth, axis, pos, rot = [0, 0, 0], segments = 32) {
  const mesh = finish(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), mat), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (axis === 'x') mesh.rotation.z += PI / 2;
  if (axis === 'z') mesh.rotation.x += PI / 2;
  parent.add(mesh);
  return mesh;
}

function torus(parent, name, mat, radius, tubeRadius, pos, rot = [0, 0, 0], segments = 48) {
  const mesh = finish(new THREE.Mesh(new THREE.TorusGeometry(radius, tubeRadius, 8, segments), mat), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(mesh);
  return mesh;
}

function ellipsoid(parent, name, mat, radius, pos, scale, segments = 40) {
  const mesh = finish(new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(16, segments / 2)), mat), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  parent.add(mesh);
  return mesh;
}

function frustumZ(parent, name, mat, frontRadius, rearRadius, length, pos, scaleXY = [1, 1], segments = 36) {
  const geo = new THREE.CylinderGeometry(rearRadius, frontRadius, length, segments, 1);
  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(PI / 2));
  const mesh = finish(new THREE.Mesh(geo, mat), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.scale.set(scaleXY[0], scaleXY[1], 1);
  parent.add(mesh);
  return mesh;
}

function loftZ(parent, name, mat, sections, radialSegments = 36) {
  const verts = [];
  for (const sec of sections) {
    for (let i = 0; i < radialSegments; i++) {
      const a = (i / radialSegments) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const xPow = sec.xPow ?? 0.92;
      const yPow = sec.yPow ?? 1.05;
      const topScale = s > 0 ? (sec.top ?? 1) : (sec.bottom ?? 1);
      const chine = Math.max(0, Math.abs(c) - 0.72) * (sec.chine ?? 0);
      const x = (sec.x ?? 0) + Math.sign(c) * Math.pow(Math.abs(c), xPow) * sec.w;
      const y = sec.y + Math.sign(s) * Math.pow(Math.abs(s), yPow) * sec.h * topScale - chine;
      verts.push(x, y, sec.z);
    }
  }
  const idx = [];
  for (let j = 0; j < sections.length - 1; j++) {
    const a = j * radialSegments;
    const b = (j + 1) * radialSegments;
    for (let i = 0; i < radialSegments; i++) {
      const n = (i + 1) % radialSegments;
      idx.push(a + i, a + n, b + n, a + i, b + n, b + i);
    }
  }
  for (let i = 1; i < radialSegments - 1; i++) idx.push(0, i + 1, i);
  const end = (sections.length - 1) * radialSegments;
  for (let i = 1; i < radialSegments - 1; i++) idx.push(end, end + i, end + i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = finish(new THREE.Mesh(geo, mat), name);
  parent.add(mesh);
  return mesh;
}

function tube(parent, name, mat, pts, radius = 0.035, tubularSegments = 24) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const mesh = finish(new THREE.Mesh(new THREE.TubeGeometry(curve, tubularSegments, radius, 8, false), mat), name);
  parent.add(mesh);
  return mesh;
}

function prism(parent, name, mat, points, y, thickness) {
  const top = y + thickness / 2;
  const bottom = y - thickness / 2;
  const verts = [];
  for (const [x, z] of points) verts.push(x, top, z);
  for (const [x, z] of points) verts.push(x, bottom, z);
  const idx = [];
  for (let i = 1; i < points.length - 1; i++) idx.push(0, i, i + 1);
  const off = points.length;
  for (let i = 1; i < points.length - 1; i++) idx.push(off, off + i + 1, off + i);
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    idx.push(i, j, off + j, i, off + j, off + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = finish(new THREE.Mesh(geo, mat), name);
  parent.add(mesh);
  return mesh;
}

function airfoilPlanform(parent, name, mat, points, y, thickness = 0.10, camber = 0.05) {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cz = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const verts = [];
  for (const [x, z] of points) verts.push(x, y + thickness * 0.18, z);
  verts.push(cx, y + thickness * 0.72 + camber, cz);
  for (const [x, z] of points) verts.push(x, y - thickness * 0.42, z);
  verts.push(cx, y - thickness * 0.54, cz);
  const topC = points.length;
  const bottom = points.length + 1;
  const bottomC = bottom + points.length;
  const idx = [];
  for (let i = 0; i < points.length; i++) {
    const n = (i + 1) % points.length;
    idx.push(topC, i, n);
    idx.push(bottomC, bottom + n, bottom + i);
    idx.push(i, bottom + i, bottom + n, i, bottom + n, n);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = finish(new THREE.Mesh(geo, mat), name);
  parent.add(mesh);
  return mesh;
}

function surfacePanel(parent, name, mat, points) {
  const verts = [];
  for (const [x, y, z] of points) verts.push(x, y, z);
  const idx = [];
  for (let i = 1; i < points.length - 1; i++) idx.push(0, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = finish(new THREE.Mesh(geo, mat), name);
  parent.add(mesh);
  return mesh;
}

function ribbonSurface(parent, name, mat, rows, across = 12) {
  const verts = [];
  for (const row of rows) {
    for (let i = 0; i <= across; i++) {
      const t = (i / across) * 2 - 1;
      const a = Math.abs(t);
      const crown = (row.crown ?? 0) * (1 - a * a);
      const edgeDrop = (row.edgeDrop ?? 0) * Math.pow(a, row.edgePow ?? 1.6);
      verts.push((row.x ?? 0) + t * row.w, row.y + crown - edgeDrop, row.z);
    }
  }
  const stride = across + 1;
  const idx = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < across; i++) {
      const a = r * stride + i;
      idx.push(a, a + 1, a + stride + 1, a, a + stride + 1, a + stride);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = finish(new THREE.Mesh(geo, mat), name);
  parent.add(mesh);
  return mesh;
}

function sideShellSurface(parent, name, mat, sx, rows, vertical = 8) {
  const verts = [];
  for (const row of rows) {
    for (let i = 0; i <= vertical; i++) {
      const t = i / vertical;
      const y = row.yTop + (row.yBottom - row.yTop) * t;
      const midBulge = Math.sin(t * PI) * (row.bulge ?? 0);
      const lowerTuck = Math.max(0, t - 0.65) * (row.lowerTuck ?? 0);
      const upperTuck = Math.max(0, 0.22 - t) * (row.upperTuck ?? 0);
      const x = sx * (row.x + midBulge - lowerTuck - upperTuck);
      verts.push(x, y, row.z);
    }
  }
  const stride = vertical + 1;
  const idx = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < vertical; i++) {
      const a = r * stride + i;
      if (sx < 0) idx.push(a, a + stride, a + stride + 1, a, a + stride + 1, a + 1);
      else idx.push(a, a + 1, a + stride + 1, a, a + stride + 1, a + stride);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = finish(new THREE.Mesh(geo, mat), name);
  parent.add(mesh);
  return mesh;
}

function curvedWingPlanform(parent, name, mat, sx, cfg) {
  const stationInput = cfg.stations || null;
  const spanSegments = stationInput ? stationInput.length - 1 : (cfg.spanSegments ?? 10);
  const chordSegments = cfg.chordSegments ?? 5;
  const cols = chordSegments + 1;
  const rows = spanSegments + 1;
  const verts = [];
  const lerp = (a, b, t) => a + (b - a) * t;
  const stationAt = (s) => {
    if (stationInput) return stationInput[s];
    const st = s / spanSegments;
    return {
      lead: [lerp(cfg.rootLead[0], cfg.tipLead[0], st), lerp(cfg.rootLead[1], cfg.tipLead[1], st)],
      trail: [lerp(cfg.rootTrail[0], cfg.tipTrail[0], st), lerp(cfg.rootTrail[1], cfg.tipTrail[1], st)],
      y: cfg.y + (cfg.dihedral ?? 0) * st + (cfg.tipDrop ?? 0) * st * st,
      thicknessMul: 1 - st * 0.35,
      camberMul: 1 - st * 0.25,
    };
  };
  const pushSurface = (bottom = false) => {
    for (let s = 0; s <= spanSegments; s++) {
      const stn = stationAt(s);
      const xl = sx * stn.lead[0];
      const zl = stn.lead[1];
      const xt = sx * stn.trail[0];
      const zt = stn.trail[1];
      const yBase = stn.y ?? cfg.y;
      const thick = (cfg.thickness ?? 0.10) * (stn.thicknessMul ?? 1);
      for (let c = 0; c <= chordSegments; c++) {
        const ct = c / chordSegments;
        const x = lerp(xl, xt, ct);
        const z = lerp(zl, zt, ct);
        const camber = (cfg.camber ?? 0.035) * Math.sin(ct * PI) * (stn.camberMul ?? 1);
        const edgeThin = (cfg.edgeThin ?? 0.018) * (Math.cos(ct * PI * 2) * 0.5 + 0.5);
        const y = bottom ? yBase - thick + camber * 0.28 - edgeThin : yBase + camber;
        verts.push(x, y, z);
      }
    }
  };
  pushSurface(false);
  pushSurface(true);
  const bottomOff = rows * cols;
  const idx = [];
  for (let s = 0; s < spanSegments; s++) {
    for (let c = 0; c < chordSegments; c++) {
      const a = s * cols + c;
      idx.push(a, a + cols, a + cols + 1, a, a + cols + 1, a + 1);
      const b = bottomOff + a;
      idx.push(b, b + 1, b + cols + 1, b, b + cols + 1, b + cols);
    }
  }
  const connectEdge = (topA, topStep, botA, botStep, count) => {
    for (let i = 0; i < count; i++) {
      const a = topA + i * topStep;
      const n = topA + (i + 1) * topStep;
      const b = botA + i * botStep;
      const bn = botA + (i + 1) * botStep;
      idx.push(a, b, bn, a, bn, n);
    }
  };
  connectEdge(0, cols, bottomOff, cols, spanSegments);
  connectEdge(chordSegments, cols, bottomOff + chordSegments, cols, spanSegments);
  connectEdge(0, 1, bottomOff, 1, chordSegments);
  connectEdge(spanSegments * cols, 1, bottomOff + spanSegments * cols, 1, chordSegments);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = finish(new THREE.Mesh(geo, mat), name);
  parent.add(mesh);
  return mesh;
}

function verticalPlate(parent, name, mat, sx, x, profile, thickness = 0.16, cant = 0) {
  const group = new THREE.Group();
  group.name = name;
  group.position.x = x;
  group.rotation.z = cant;
  const verts = [];
  for (const [y, z] of profile) verts.push(sx * thickness / 2, y, z);
  for (const [y, z] of profile) verts.push(-sx * thickness / 2, y, z);
  const idx = [];
  for (let i = 1; i < profile.length - 1; i++) idx.push(0, i, i + 1);
  const off = profile.length;
  for (let i = 1; i < profile.length - 1; i++) idx.push(off, off + i + 1, off + i);
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length;
    idx.push(i, j, off + j, i, off + j, off + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  group.add(finish(new THREE.Mesh(geo, mat), `${name}Skin`));
  parent.add(group);
  return group;
}

function starShape(radius = 0.38) {
  const shape = new THREE.Shape();
  const inner = radius * 0.43;
  for (let i = 0; i < 10; i++) {
    const a = -PI / 2 + (i / 10) * TAU;
    const r = i % 2 === 0 ? radius : inner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function star(parent, M, name, pos, radius, rot = [0, 0, 0]) {
  const mesh = finish(new THREE.Mesh(new THREE.ShapeGeometry(starShape(radius)), M.red), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(mesh);
  return mesh;
}

function addCanopy(M, parent) {
  const group = new THREE.Group();
  group.name = 'canopy';
  loftZ(group, 'wideSmokeGlassCrown', M.glass, [
    { z: -8.18, y: 3.11, w: 0.82, h: 0.17, xPow: 0.78, yPow: 0.70, top: 1.28, bottom: 0.22, chine: 0.05 },
    { z: -7.62, y: 3.30, w: 1.18, h: 0.28, xPow: 0.82, yPow: 0.68, top: 1.34, bottom: 0.28, chine: 0.04 },
    { z: -6.78, y: 3.42, w: 1.36, h: 0.35, xPow: 0.88, yPow: 0.70, top: 1.22, bottom: 0.30, chine: 0.035 },
    { z: -5.86, y: 3.35, w: 1.22, h: 0.29, xPow: 0.92, yPow: 0.74, top: 1.05, bottom: 0.28, chine: 0.04 },
    { z: -5.30, y: 3.18, w: 0.74, h: 0.16, xPow: 0.96, yPow: 0.82, top: 0.86, bottom: 0.24, chine: 0.04 },
  ], 26);
  box(group, 'windscreenCenterFrame', M.greyDark, [0.060, 0.42, 1.06], [0, 3.33, -7.76], [0.44, 0, 0]);
  box(group, 'canopyCenterSpineFrame', M.greyDark, [0.060, 0.25, 2.04], [0, 3.55, -6.58], [0.04, 0, 0]);
  box(group, 'canopyLeftSill', M.greyDark, [0.13, 0.18, 2.58], [-1.21, 3.13, -6.66], [0, -0.05, 0]);
  box(group, 'canopyRightSill', M.greyDark, [0.13, 0.18, 2.58], [1.21, 3.13, -6.66], [0, 0.05, 0]);
  for (let i = 0; i < 5; i++) box(group, `canopyCrossFrame_${i}`, M.greyDark, [2.12 - i * 0.15, 0.060, 0.065], [0, 3.56 - i * 0.06, -7.62 + i * 0.52], [0.18, 0, 0]);
  box(group, 'leftSideWindowFrame', M.greyDark, [0.065, 0.34, 1.04], [-1.26, 3.28, -6.55], [0.18, -0.02, 0]);
  box(group, 'rightSideWindowFrame', M.greyDark, [0.065, 0.34, 1.04], [1.26, 3.28, -6.55], [0.18, 0.02, 0]);
  box(group, 'leftSeatSilhouette', M.intake, [0.38, 0.30, 0.48], [-0.42, 2.96, -6.52]);
  box(group, 'rightSeatSilhouette', M.intake, [0.38, 0.30, 0.48], [0.42, 2.96, -6.52]);
  box(group, 'genericInstrumentCoaming', M.intake, [1.38, 0.18, 0.36], [0, 3.03, -7.48], [0.12, 0, 0]);
  parent.add(group);
  return group;
}

function addNozzle(M, parent, sx) {
  const group = new THREE.Group();
  group.name = sx < 0 ? 'nozzlesL' : 'nozzlesR';
  const x = sx * 0.98;
  cyl(group, 'heatStainCollar', M.heat, 0.55, 0.58, 'z', [x, 1.72, 9.72], [0, 0, 0], 40);
  cyl(group, 'darkNozzleBell', M.darkMetal, 0.48, 0.92, 'z', [x, 1.72, 10.28], [0, 0, 0], 40);
  cyl(group, 'blackHollowCore', M.intake, 0.34, 0.08, 'z', [x, 1.72, 10.78], [0, 0, 0], 32);
  torus(group, 'rearNozzleOuterRing', M.metal, 0.47, 0.030, [x, 1.72, 10.78], [0, 0, 0], 56);
  torus(group, 'rearNozzleInnerRing', M.darkMetal, 0.29, 0.018, [x, 1.72, 10.82], [0, 0, 0], 40);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    box(group, `externalPetal_${i}`, M.metal, [0.07, 0.25, 0.36], [x + Math.cos(a) * 0.47, 1.72 + Math.sin(a) * 0.47, 10.62], [0, 0, a]);
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    box(group, `innerNozzleVane_${i}`, M.greyDark, [0.035, 0.30, 0.030], [x + Math.cos(a) * 0.25, 1.72 + Math.sin(a) * 0.25, 10.86], [0, 0, a]);
  }
  parent.add(group);
  return group;
}

export function buildSu34Airframe() {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 'su34Airframe';

  const fuselage = new THREE.Group();
  fuselage.name = 'fuselage';
  root.add(fuselage);
  loftZ(fuselage, 'fullbackLoftedFuselage', M.paleBlue, [
    { z: -11.92, y: 1.98, w: 0.20, h: 0.09, xPow: 0.52, yPow: 0.78, top: 0.62, bottom: 0.86, chine: 0.00 },
    { z: -11.34, y: 2.00, w: 1.08, h: 0.28, xPow: 0.40, yPow: 0.80, top: 0.74, bottom: 1.02, chine: 0.07 },
    { z: -10.42, y: 2.03, w: 1.74, h: 0.40, xPow: 0.38, yPow: 0.84, top: 0.80, bottom: 1.16, chine: 0.16 },
    { z: -9.18, y: 2.10, w: 1.98, h: 0.50, xPow: 0.42, yPow: 0.88, top: 0.88, bottom: 1.18, chine: 0.22 },
    { z: -8.12, y: 2.24, w: 1.94, h: 0.62, xPow: 0.54, yPow: 0.96, top: 1.06, bottom: 1.10, chine: 0.18 },
    { z: -7.10, y: 2.42, w: 1.82, h: 0.78, xPow: 0.66, yPow: 1.04, top: 1.22, bottom: 0.96, chine: 0.12 },
    { z: -6.05, y: 2.48, w: 1.58, h: 0.88, xPow: 0.78, yPow: 1.10, top: 1.24, bottom: 0.88, chine: 0.08 },
    { z: -4.70, y: 2.40, w: 1.54, h: 0.86, xPow: 0.84, yPow: 1.12, top: 1.15, bottom: 0.90, chine: 0.06 },
    { z: -2.72, y: 2.28, w: 1.64, h: 0.80, xPow: 0.88, yPow: 1.08, top: 1.04, bottom: 0.92, chine: 0.04 },
    { z: -0.30, y: 2.20, w: 1.42, h: 0.78, xPow: 0.92, yPow: 1.05, top: 1.00, bottom: 0.88, chine: 0.02 },
    { z: 2.28, y: 2.16, w: 1.28, h: 0.76, xPow: 0.96, yPow: 1.02, top: 0.98, bottom: 0.84, chine: 0.02 },
    { z: 5.10, y: 2.12, w: 1.14, h: 0.70, xPow: 1.00, yPow: 1.00, top: 0.94, bottom: 0.80, chine: 0.01 },
    { z: 7.58, y: 2.02, w: 0.82, h: 0.56, xPow: 1.00, yPow: 1.00, top: 0.88, bottom: 0.78, chine: 0.00 },
    { z: 9.22, y: 1.94, w: 0.46, h: 0.36, xPow: 1.00, yPow: 1.00, top: 0.82, bottom: 0.74, chine: 0.00 },
  ], 56);
  ribbonSurface(fuselage, 'smoothFullbackDorsalSpine', M.blue, [
    { z: -8.10, y: 2.86, w: 0.76, crown: 0.12, edgeDrop: 0.12 },
    { z: -7.02, y: 3.04, w: 0.94, crown: 0.18, edgeDrop: 0.18 },
    { z: -5.68, y: 3.03, w: 0.84, crown: 0.16, edgeDrop: 0.16 },
    { z: -3.82, y: 2.78, w: 0.78, crown: 0.10, edgeDrop: 0.14 },
    { z: -1.20, y: 2.62, w: 0.70, crown: 0.08, edgeDrop: 0.12 },
    { z: 1.90, y: 2.54, w: 0.62, crown: 0.06, edgeDrop: 0.10 },
    { z: 5.20, y: 2.42, w: 0.52, crown: 0.05, edgeDrop: 0.08 },
    { z: 8.36, y: 2.24, w: 0.34, crown: 0.03, edgeDrop: 0.06 },
  ], 16);
  for (const sx of [-1, 1]) {
    sideShellSurface(fuselage, sx < 0 ? 'leftContinuousSideShell' : 'rightContinuousSideShell', M.paleBlue, sx, [
      { z: -9.18, x: 1.26, yTop: 2.24, yBottom: 1.62, bulge: 0.04, lowerTuck: 0.12, upperTuck: 0.05 },
      { z: -8.42, x: 1.78, yTop: 2.52, yBottom: 1.36, bulge: 0.12, lowerTuck: 0.18, upperTuck: 0.08 },
      { z: -7.62, x: 1.82, yTop: 2.86, yBottom: 1.34, bulge: 0.14, lowerTuck: 0.18, upperTuck: 0.06 },
      { z: -6.04, x: 1.56, yTop: 3.02, yBottom: 1.48, bulge: 0.12, lowerTuck: 0.16, upperTuck: 0.04 },
      { z: -4.18, x: 1.48, yTop: 2.72, yBottom: 1.42, bulge: 0.10, lowerTuck: 0.14, upperTuck: 0.04 },
      { z: -1.65, x: 1.48, yTop: 2.50, yBottom: 1.30, bulge: 0.08, lowerTuck: 0.10, upperTuck: 0.03 },
      { z: 1.20, x: 1.28, yTop: 2.38, yBottom: 1.26, bulge: 0.07, lowerTuck: 0.08, upperTuck: 0.03 },
      { z: 4.54, x: 1.08, yTop: 2.24, yBottom: 1.26, bulge: 0.05, lowerTuck: 0.06, upperTuck: 0.02 },
      { z: 7.56, x: 0.78, yTop: 2.08, yBottom: 1.34, bulge: 0.03, lowerTuck: 0.04, upperTuck: 0.02 },
    ], 10);
  }
  box(fuselage, 'leftForwardShoulderChine', M.blue, [0.48, 0.14, 3.60], [-1.44, 2.54, -6.70], [0.02, 0.12, -0.14]);
  box(fuselage, 'rightForwardShoulderChine', M.blue, [0.48, 0.14, 3.60], [1.44, 2.54, -6.70], [0.02, -0.12, 0.14]);
  box(fuselage, 'leftDuckbillLowerCheek', M.grey, [0.52, 0.18, 3.12], [-1.34, 1.74, -9.56], [-0.02, 0.12, 0.10]);
  box(fuselage, 'rightDuckbillLowerCheek', M.grey, [0.52, 0.18, 3.12], [1.34, 1.74, -9.56], [-0.02, -0.12, -0.10]);
  box(fuselage, 'leftWingRootLERXBlend', M.paleBlue, [0.72, 0.18, 4.30], [-1.18, 2.25, -1.82], [0.02, 0.24, -0.06]);
  box(fuselage, 'rightWingRootLERXBlend', M.paleBlue, [0.72, 0.18, 4.30], [1.18, 2.25, -1.82], [0.02, -0.24, 0.06]);
  const nose = new THREE.Group();
  nose.name = 'nose';
  loftZ(nose, 'creamDuckbillRadomeShell', M.radome, [
    { z: -11.82, y: 2.00, w: 0.24, h: 0.10, xPow: 0.54, yPow: 0.74, top: 0.70, bottom: 0.82, chine: 0.00 },
    { z: -11.32, y: 2.02, w: 1.18, h: 0.31, xPow: 0.42, yPow: 0.76, top: 0.76, bottom: 1.02, chine: 0.09 },
    { z: -10.45, y: 2.04, w: 1.80, h: 0.42, xPow: 0.38, yPow: 0.80, top: 0.82, bottom: 1.12, chine: 0.18 },
    { z: -9.28, y: 2.11, w: 1.96, h: 0.50, xPow: 0.44, yPow: 0.86, top: 0.88, bottom: 1.13, chine: 0.20 },
    { z: -8.70, y: 2.18, w: 1.72, h: 0.45, xPow: 0.50, yPow: 0.92, top: 0.90, bottom: 1.02, chine: 0.15 },
  ], 48);
  ellipsoid(nose, 'roundedRadomeNoseTip', M.radome, 1, [0, 2.00, -11.84], [0.30, 0.12, 0.09], 24);
  torus(nose, 'radomeBreakOvalSeam', M.seam, 1.0, 0.010, [0, 2.12, -8.72], [0, 0, 0], 72).scale.set(1.72, 0.48, 1);
  box(nose, 'radomeTopPanelSeam', M.seam, [1.52, 0.022, 0.045], [0, 2.47, -9.86], [-0.18, 0, 0]);
  box(nose, 'radomeSideSeamL', M.seam, [0.035, 0.030, 1.28], [-1.28, 2.09, -10.18], [0, 0.09, 0]);
  box(nose, 'radomeSideSeamR', M.seam, [0.035, 0.030, 1.28], [1.28, 2.09, -10.18], [0, -0.09, 0]);
  surfacePanel(nose, 'leftFlatDuckbillCheekPlane', M.radome, [[-0.92, 1.66, -10.95], [-1.82, 1.78, -10.14], [-1.66, 1.90, -8.98], [-0.66, 1.75, -9.34]]);
  surfacePanel(nose, 'rightFlatDuckbillCheekPlane', M.radome, [[0.92, 1.66, -10.95], [1.82, 1.78, -10.14], [1.66, 1.90, -8.98], [0.66, 1.75, -9.34]]);
  box(nose, 'underNoseSensorWindow', M.glass, [0.86, 0.08, 0.52], [0, 1.72, -9.22], [-0.24, 0, 0]);
  tube(nose, 'pitotProbe', M.darkMetal, [[0, 2.08, -11.78], [0, 2.07, -12.04]], 0.020, 8);
  fuselage.add(nose);
  const cockpit = new THREE.Group();
  cockpit.name = 'cockpit';
  addCanopy(M, cockpit);
  fuselage.add(cockpit);
  surfacePanel(fuselage, 'leftCanopyShoulderBlendPanel', M.blue, [[-0.72, 2.78, -8.05], [-1.74, 2.54, -7.42], [-1.48, 2.48, -5.34], [-0.70, 2.78, -5.66]]);
  surfacePanel(fuselage, 'rightCanopyShoulderBlendPanel', M.blue, [[0.72, 2.78, -8.05], [1.74, 2.54, -7.42], [1.48, 2.48, -5.34], [0.70, 2.78, -5.66]]);
  surfacePanel(fuselage, 'wideForwardSpinePlate', M.paleBlue, [[-0.66, 2.90, -5.46], [0.66, 2.90, -5.46], [0.54, 2.76, -3.25], [-0.54, 2.76, -3.25]]);

  const canardsL = new THREE.Group();
  const canardsR = new THREE.Group();
  canardsL.name = 'canardsL';
  canardsR.name = 'canardsR';
  curvedWingPlanform(canardsL, 'leftCanardPlane', M.blue, -1, {
    rootLead: [1.06, -5.68], tipLead: [4.10, -4.76], rootTrail: [1.12, -4.12], tipTrail: [3.22, -3.42],
    y: 2.74, thickness: 0.12, camber: 0.035, dihedral: 0.03, tipDrop: -0.04, spanSegments: 8, chordSegments: 4,
  });
  curvedWingPlanform(canardsR, 'rightCanardPlane', M.blue, 1, {
    rootLead: [1.06, -5.68], tipLead: [4.10, -4.76], rootTrail: [1.12, -4.12], tipTrail: [3.22, -3.42],
    y: 2.74, thickness: 0.12, camber: 0.035, dihedral: 0.03, tipDrop: -0.04, spanSegments: 8, chordSegments: 4,
  });
  box(canardsL, 'leftCanardPivotFairing', M.greyDark, [0.54, 0.24, 0.76], [-1.18, 2.66, -5.02], [0, 0.15, 0]);
  box(canardsR, 'rightCanardPivotFairing', M.greyDark, [0.54, 0.24, 0.76], [1.18, 2.66, -5.02], [0, -0.15, 0]);
  box(canardsL, 'leftCanardTrailingSeam', M.seam, [1.95, 0.022, 0.040], [-2.55, 2.82, -4.08], [0, 0, 0.15]);
  box(canardsR, 'rightCanardTrailingSeam', M.seam, [1.95, 0.022, 0.040], [2.55, 2.82, -4.08], [0, 0, -0.15]);
  root.add(canardsL, canardsR);

  const wingsL = new THREE.Group();
  const wingsR = new THREE.Group();
  wingsL.name = 'wingsL';
  wingsR.name = 'wingsR';
  curvedWingPlanform(wingsL, 'leftMainSweptWing', M.paleBlue, -1, {
    stations: [
      { lead: [1.10, -3.18], trail: [1.08, 4.46], y: 2.28, thicknessMul: 1.18, camberMul: 1.10 },
      { lead: [1.80, -2.78], trail: [1.92, 4.44], y: 2.26, thicknessMul: 1.10, camberMul: 1.06 },
      { lead: [2.78, -2.18], trail: [3.04, 4.36], y: 2.24, thicknessMul: 1.00, camberMul: 1.02 },
      { lead: [3.96, -1.46], trail: [4.26, 4.22], y: 2.20, thicknessMul: 0.90, camberMul: 0.94 },
      { lead: [5.22, -0.78], trail: [5.42, 4.06], y: 2.15, thicknessMul: 0.80, camberMul: 0.86 },
      { lead: [6.48, -0.16], trail: [6.42, 3.82], y: 2.09, thicknessMul: 0.70, camberMul: 0.76 },
      { lead: [7.22, 0.10], trail: [7.02, 3.45], y: 2.02, thicknessMul: 0.60, camberMul: 0.66 },
    ],
    y: 2.20, thickness: 0.17, camber: 0.074, chordSegments: 9,
  });
  curvedWingPlanform(wingsR, 'rightMainSweptWing', M.paleBlue, 1, {
    stations: [
      { lead: [1.10, -3.18], trail: [1.08, 4.46], y: 2.28, thicknessMul: 1.18, camberMul: 1.10 },
      { lead: [1.80, -2.78], trail: [1.92, 4.44], y: 2.26, thicknessMul: 1.10, camberMul: 1.06 },
      { lead: [2.78, -2.18], trail: [3.04, 4.36], y: 2.24, thicknessMul: 1.00, camberMul: 1.02 },
      { lead: [3.96, -1.46], trail: [4.26, 4.22], y: 2.20, thicknessMul: 0.90, camberMul: 0.94 },
      { lead: [5.22, -0.78], trail: [5.42, 4.06], y: 2.15, thicknessMul: 0.80, camberMul: 0.86 },
      { lead: [6.48, -0.16], trail: [6.42, 3.82], y: 2.09, thicknessMul: 0.70, camberMul: 0.76 },
      { lead: [7.22, 0.10], trail: [7.02, 3.45], y: 2.02, thicknessMul: 0.60, camberMul: 0.66 },
    ],
    y: 2.20, thickness: 0.17, camber: 0.074, chordSegments: 9,
  });
  curvedWingPlanform(wingsL, 'leftLeadingEdgeGlove', M.blue, -1, {
    stations: [
      { lead: [0.78, -4.24], trail: [0.96, -1.20], y: 2.48, thicknessMul: 1.10, camberMul: 1.10 },
      { lead: [1.38, -3.68], trail: [1.88, -1.05], y: 2.44, thicknessMul: 1.00, camberMul: 1.04 },
      { lead: [2.32, -3.05], trail: [3.12, -0.78], y: 2.38, thicknessMul: 0.88, camberMul: 0.96 },
      { lead: [3.48, -2.28], trail: [4.22, -0.50], y: 2.30, thicknessMul: 0.72, camberMul: 0.82 },
    ],
    y: 2.36, thickness: 0.12, camber: 0.050, chordSegments: 5,
  });
  curvedWingPlanform(wingsR, 'rightLeadingEdgeGlove', M.blue, 1, {
    stations: [
      { lead: [0.78, -4.24], trail: [0.96, -1.20], y: 2.48, thicknessMul: 1.10, camberMul: 1.10 },
      { lead: [1.38, -3.68], trail: [1.88, -1.05], y: 2.44, thicknessMul: 1.00, camberMul: 1.04 },
      { lead: [2.32, -3.05], trail: [3.12, -0.78], y: 2.38, thicknessMul: 0.88, camberMul: 0.96 },
      { lead: [3.48, -2.28], trail: [4.22, -0.50], y: 2.30, thicknessMul: 0.72, camberMul: 0.82 },
    ],
    y: 2.36, thickness: 0.12, camber: 0.050, chordSegments: 5,
  });
  surfacePanel(wingsL, 'leftUpperWingRootBlendFacet', M.blueDark, [[-1.06, 2.42, -2.86], [-3.94, 2.36, -1.80], [-4.04, 2.30, -0.62], [-1.06, 2.38, -0.95]]);
  surfacePanel(wingsR, 'rightUpperWingRootBlendFacet', M.blueDark, [[1.06, 2.42, -2.86], [3.94, 2.36, -1.80], [4.04, 2.30, -0.62], [1.06, 2.38, -0.95]]);
  ribbonSurface(wingsL, 'leftShoulderToWingBlendCurve', M.blue, [
    { x: -1.24, z: -3.02, y: 2.48, w: 0.42, crown: 0.055, edgeDrop: 0.035 },
    { x: -2.22, z: -2.24, y: 2.42, w: 0.70, crown: 0.050, edgeDrop: 0.050 },
    { x: -3.48, z: -1.36, y: 2.34, w: 0.86, crown: 0.040, edgeDrop: 0.055 },
    { x: -4.70, z: -0.42, y: 2.25, w: 0.72, crown: 0.030, edgeDrop: 0.045 },
  ], 8);
  ribbonSurface(wingsR, 'rightShoulderToWingBlendCurve', M.blue, [
    { x: 1.24, z: -3.02, y: 2.48, w: 0.42, crown: 0.055, edgeDrop: 0.035 },
    { x: 2.22, z: -2.24, y: 2.42, w: 0.70, crown: 0.050, edgeDrop: 0.050 },
    { x: 3.48, z: -1.36, y: 2.34, w: 0.86, crown: 0.040, edgeDrop: 0.055 },
    { x: 4.70, z: -0.42, y: 2.25, w: 0.72, crown: 0.030, edgeDrop: 0.045 },
  ], 8);
  surfacePanel(wingsL, 'leftInnerFlapInset', M.grey, [[-1.52, 2.315, 3.44], [-3.86, 2.295, 3.30], [-3.72, 2.292, 4.10], [-1.44, 2.315, 4.20]]);
  surfacePanel(wingsR, 'rightInnerFlapInset', M.grey, [[1.52, 2.315, 3.44], [3.86, 2.295, 3.30], [3.72, 2.292, 4.10], [1.44, 2.315, 4.20]]);
  surfacePanel(wingsL, 'leftOuterAileronInset', M.grey, [[-4.06, 2.285, 3.12], [-6.82, 2.220, 3.10], [-6.64, 2.210, 3.66], [-3.92, 2.285, 3.92]]);
  surfacePanel(wingsR, 'rightOuterAileronInset', M.grey, [[4.06, 2.285, 3.12], [6.82, 2.220, 3.10], [6.64, 2.210, 3.66], [3.92, 2.285, 3.92]]);
  surfacePanel(wingsL, 'leftSquaredWingTipCap', M.greyDark, [[-7.16, 2.06, 0.10], [-7.42, 2.04, 0.56], [-7.28, 2.02, 3.28], [-7.02, 2.03, 3.45]]);
  surfacePanel(wingsR, 'rightSquaredWingTipCap', M.greyDark, [[7.16, 2.06, 0.10], [7.42, 2.04, 0.56], [7.28, 2.02, 3.28], [7.02, 2.03, 3.45]]);
  box(wingsL, 'leftWingtipRail', M.greyDark, [0.16, 0.15, 2.86], [-7.34, 2.14, 1.70], [0, -0.03, 0]);
  box(wingsR, 'rightWingtipRail', M.greyDark, [0.16, 0.15, 2.86], [7.34, 2.14, 1.70], [0, 0.03, 0]);
  root.add(wingsL, wingsR);

  const intakesL = new THREE.Group();
  const intakesR = new THREE.Group();
  intakesL.name = 'intakesL';
  intakesR.name = 'intakesR';
  for (const [sx, group] of [[-1, intakesL], [1, intakesR]]) {
    box(group, 'intakeShoulderFairing', M.blueDark, [0.90, 0.24, 2.60], [sx * 1.42, 2.03, -2.58], [0.02, -sx * 0.10, 0]);
    loftZ(group, 'roundedIntakeLip', M.grey, [
      { x: sx * 1.50, z: -3.66, y: 1.58, w: 0.62, h: 0.47, xPow: 0.34, yPow: 0.34, top: 0.92, bottom: 0.92 },
      { x: sx * 1.50, z: -3.36, y: 1.58, w: 0.56, h: 0.40, xPow: 0.38, yPow: 0.38, top: 0.96, bottom: 0.94 },
      { x: sx * 1.45, z: -2.38, y: 1.62, w: 0.50, h: 0.34, xPow: 0.52, yPow: 0.46, top: 0.98, bottom: 0.94 },
    ], 28);
    loftZ(group, 'darkIntakeTunnel', M.intake, [
      { x: sx * 1.52, z: -3.72, y: 1.55, w: 0.45, h: 0.30, xPow: 0.32, yPow: 0.32 },
      { x: sx * 1.48, z: -3.28, y: 1.55, w: 0.40, h: 0.26, xPow: 0.38, yPow: 0.36 },
    ], 24);
    surfacePanel(group, 'upperIntakeRampPlane', M.greyDark, [[sx * 1.04, 1.88, -3.58], [sx * 1.88, 1.88, -3.58], [sx * 1.68, 1.76, -2.18], [sx * 1.02, 1.76, -2.06]]);
    surfacePanel(group, 'lowerIntakeSplitterChine', M.grey, [[sx * 1.02, 1.26, -3.54], [sx * 1.86, 1.26, -3.54], [sx * 1.72, 1.16, -2.00], [sx * 1.02, 1.18, -2.10]]);
    box(group, 'intakeLipHighlight', M.paleBlue, [1.04, 0.06, 0.38], [sx * 1.50, 2.00, -3.48]);
    box(group, 'splitterPlate', M.greyDark, [0.12, 0.92, 2.05], [sx * 0.96, 1.62, -2.20]);
    box(group, 'intakeRoofFairing', M.blue, [0.92, 0.16, 2.26], [sx * 1.48, 2.06, -2.16], [0.02, -sx * 0.05, 0]);
    box(group, 'intakeSideWallOuter', M.greyDark, [0.08, 0.56, 1.80], [sx * 1.92, 1.55, -2.42]);
  }
  root.add(intakesL, intakesR);

  const nacellesL = new THREE.Group();
  const nacellesR = new THREE.Group();
  nacellesL.name = 'nacellesL';
  nacellesR.name = 'nacellesR';
  for (const [sx, group] of [[-1, nacellesL], [1, nacellesR]]) {
    loftZ(group, 'engineTunnel', M.grey, [
      { x: sx * 1.04, z: -1.45, y: 1.48, w: 0.72, h: 0.47, xPow: 0.58, yPow: 0.54, top: 1.03, bottom: 0.92 },
      { x: sx * 1.04, z: 1.70, y: 1.46, w: 0.78, h: 0.50, xPow: 0.62, yPow: 0.56, top: 1.02, bottom: 0.88 },
      { x: sx * 1.02, z: 5.35, y: 1.50, w: 0.68, h: 0.46, xPow: 0.66, yPow: 0.58, top: 0.96, bottom: 0.86 },
      { x: sx * 0.98, z: 8.92, y: 1.62, w: 0.54, h: 0.40, xPow: 0.72, yPow: 0.66, top: 0.92, bottom: 0.82 },
    ], 32);
    box(group, 'nacelleFlatLowerPanel', M.greyDark, [1.08, 0.14, 5.70], [sx * 1.04, 0.94, 2.50]);
    box(group, 'nacelleOuterKeel', M.greyDark, [0.12, 0.38, 4.80], [sx * 1.72, 1.26, 2.88]);
    surfacePanel(group, 'upperNacelleShoulderPlane', M.blueDark, [[sx * 0.54, 1.92, -0.84], [sx * 1.56, 1.86, -0.74], [sx * 1.50, 1.90, 5.88], [sx * 0.56, 2.00, 5.42]]);
    surfacePanel(group, 'innerNacelleValleyPlane', M.grey, [[sx * 0.26, 1.62, -0.46], [sx * 0.72, 1.58, -0.42], [sx * 0.68, 1.54, 5.76], [sx * 0.24, 1.58, 5.96]]);
    loftZ(group, 'roundedUpperEngineCover', M.grey, [
      { x: sx * 1.12, z: 2.05, y: 2.00, w: 0.42, h: 0.20, xPow: 0.72, yPow: 0.70, top: 1.35, bottom: 0.42, chine: 0.02 },
      { x: sx * 1.16, z: 3.72, y: 2.05, w: 0.56, h: 0.28, xPow: 0.76, yPow: 0.68, top: 1.42, bottom: 0.48, chine: 0.02 },
      { x: sx * 1.16, z: 5.86, y: 2.08, w: 0.62, h: 0.31, xPow: 0.82, yPow: 0.70, top: 1.36, bottom: 0.50, chine: 0.01 },
      { x: sx * 1.08, z: 7.70, y: 2.05, w: 0.50, h: 0.26, xPow: 0.86, yPow: 0.74, top: 1.22, bottom: 0.48, chine: 0.00 },
      { x: sx * 0.98, z: 8.86, y: 1.94, w: 0.34, h: 0.18, xPow: 0.92, yPow: 0.82, top: 1.05, bottom: 0.44, chine: 0.00 },
    ], 34);
    for (let i = 0; i < 5; i++) {
      box(group, `engineCoverAccessPanel_${i}`, M.seam, [0.42, 0.018, 0.035], [sx * 1.16, 2.48, 3.10 + i * 0.92], [0.12, 0, 0]);
    }
    box(group, 'engineAccessStrip', M.seam, [0.05, 0.025, 4.80], [sx * 1.04, 2.06, 2.62]);
  }
  root.add(nacellesL, nacellesR);

  const nozzlesL = addNozzle(M, root, -1);
  const nozzlesR = addNozzle(M, root, 1);
  const rearStinger = new THREE.Group();
  rearStinger.name = 'rearStinger';
  frustumZ(rearStinger, 'centralTailBoom', M.grey, 0.22, 0.34, 3.20, [0, 2.03, 10.32], [0.68, 0.45], 22);
  cyl(rearStinger, 'stingerTip', M.darkMetal, 0.055, 0.38, 'z', [0, 2.02, 12.12], [0, 0, 0], 12);
  root.add(rearStinger);

  const verticalTailsL = verticalPlate(root, 'verticalTailsL', M.blue, -1, -2.22, [[2.48, 5.44], [2.66, 8.36], [5.86, 7.52], [5.54, 6.05]], 0.18, 0.12);
  const verticalTailsR = verticalPlate(root, 'verticalTailsR', M.blue, 1, 2.22, [[2.48, 5.44], [2.66, 8.36], [5.86, 7.52], [5.54, 6.05]], 0.18, -0.12);
  box(verticalTailsL, 'leftTailRootFairing', M.greyDark, [0.58, 0.30, 2.20], [0, 2.54, 6.36], [0, 0, 0]);
  box(verticalTailsR, 'rightTailRootFairing', M.greyDark, [0.58, 0.30, 2.20], [0, 2.54, 6.36], [0, 0, 0]);
  for (const sx of [-1, 1]) {
    loftZ(root, sx < 0 ? 'leftCurvedTailBaseFillet' : 'rightCurvedTailBaseFillet', M.blueDark, [
      { x: sx * 2.08, z: 5.22, y: 2.34, w: 0.30, h: 0.16, xPow: 0.70, yPow: 0.68, top: 1.20, bottom: 0.50, chine: 0.01 },
      { x: sx * 2.15, z: 6.20, y: 2.50, w: 0.38, h: 0.24, xPow: 0.78, yPow: 0.70, top: 1.30, bottom: 0.55, chine: 0.01 },
      { x: sx * 2.18, z: 7.28, y: 2.46, w: 0.34, h: 0.20, xPow: 0.84, yPow: 0.74, top: 1.18, bottom: 0.52, chine: 0.00 },
    ], 26);
  }
  surfacePanel(verticalTailsL, 'leftRudderInsetPanel', M.blueDark, [[-0.10, 2.96, 7.20], [-0.10, 2.92, 8.04], [-0.10, 5.18, 7.42], [-0.10, 5.05, 6.86]]);
  surfacePanel(verticalTailsR, 'rightRudderInsetPanel', M.blueDark, [[0.10, 2.96, 7.20], [0.10, 2.92, 8.04], [0.10, 5.18, 7.42], [0.10, 5.05, 6.86]]);
  tube(verticalTailsL, 'leftTailTipAntenna', M.darkMetal, [[0, 5.80, 7.46], [0, 6.16, 7.52]], 0.018, 5);
  tube(verticalTailsR, 'rightTailTipAntenna', M.darkMetal, [[0, 5.80, 7.46], [0, 6.16, 7.52]], 0.018, 5);

  const horizontalStabsL = new THREE.Group();
  const horizontalStabsR = new THREE.Group();
  horizontalStabsL.name = 'horizontalStabsL';
  horizontalStabsR.name = 'horizontalStabsR';
  curvedWingPlanform(horizontalStabsL, 'leftAllMovingStabilator', M.grey, -1, {
    rootLead: [0.92, 6.38], tipLead: [4.32, 7.40], rootTrail: [0.84, 8.70], tipTrail: [3.38, 9.42],
    y: 2.16, thickness: 0.12, camber: 0.030, dihedral: -0.02, tipDrop: -0.02, spanSegments: 8, chordSegments: 4,
  });
  curvedWingPlanform(horizontalStabsR, 'rightAllMovingStabilator', M.grey, 1, {
    rootLead: [0.92, 6.38], tipLead: [4.32, 7.40], rootTrail: [0.84, 8.70], tipTrail: [3.38, 9.42],
    y: 2.16, thickness: 0.12, camber: 0.030, dihedral: -0.02, tipDrop: -0.02, spanSegments: 8, chordSegments: 4,
  });
  box(horizontalStabsL, 'leftStabPivotFairing', M.greyDark, [0.48, 0.20, 0.62], [-1.02, 2.10, 7.38]);
  box(horizontalStabsR, 'rightStabPivotFairing', M.greyDark, [0.48, 0.20, 0.62], [1.02, 2.10, 7.38]);
  root.add(horizontalStabsL, horizontalStabsR);

  root.userData = {
    nose, cockpit, canopy: cockpit.getObjectByName('canopy'), canardsL, canardsR, wingsL, wingsR,
    intakesL, intakesR, nacellesL, nacellesR, verticalTailsL, verticalTailsR,
    horizontalStabsL, horizontalStabsR, rearStinger, nozzlesL, nozzlesR,
  };
  return root;
}

function wheel(M, parent, name, pos, radius, width) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(pos[0], pos[1], pos[2]);
  cyl(group, 'rubberTire', M.rubber, radius, width, 'x', [0, 0, 0], [0, 0, 0], 32);
  cyl(group, 'greenGreyHubOuter', M.greyDark, radius * 0.56, width * 1.08, 'x', [0, 0, 0], [0, 0, 0], 24);
  cyl(group, 'metalHubCap', M.metal, radius * 0.26, width * 1.16, 'x', [0, 0, 0], [0, 0, 0], 18);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    cyl(group, `hubBolt_${i}`, M.metal, radius * 0.035, width * 1.22, 'x', [0, Math.sin(a) * radius * 0.38, Math.cos(a) * radius * 0.38], [0, 0, 0], 8);
  }
  parent.add(group);
  return group;
}

export function buildSu34LandingGear() {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 'su34LandingGear';

  const noseGear = new THREE.Group();
  noseGear.name = 'noseGear';
  box(noseGear, 'noseGearBayCavity', M.intake, [0.92, 0.16, 1.28], [0, 1.02, -7.00]);
  cyl(noseGear, 'noseMainStrut', M.metal, 0.055, 1.28, 'y', [0, 1.02, -7.02], [0, 0, 0], 16);
  cyl(noseGear, 'noseChromePiston', M.metal, 0.035, 0.86, 'y', [0, 0.54, -7.02], [0, 0, 0], 16);
  tube(noseGear, 'noseTorqueLinkA', M.darkMetal, [[-0.10, 0.92, -6.92], [-0.28, 0.48, -6.86], [-0.12, 0.28, -6.98]], 0.022);
  tube(noseGear, 'noseTorqueLinkB', M.darkMetal, [[0.10, 0.92, -6.92], [0.28, 0.48, -6.86], [0.12, 0.28, -6.98]], 0.022);
  const noseWheels = new THREE.Group();
  noseWheels.name = 'noseWheels';
  wheel(M, noseWheels, 'noseWheelL', [-0.20, 0.33, -6.88], 0.31, 0.18);
  wheel(M, noseWheels, 'noseWheelR', [0.20, 0.33, -6.88], 0.31, 0.18);
  noseGear.add(noseWheels);
  box(noseGear, 'leftNoseGearDoor', M.grey, [0.06, 0.68, 0.92], [-0.56, 0.78, -6.98], [0, 0, -0.28]);
  box(noseGear, 'rightNoseGearDoor', M.grey, [0.06, 0.68, 0.92], [0.56, 0.78, -6.98], [0, 0, 0.28]);
  root.add(noseGear);

  const mainWheelsL = new THREE.Group();
  const mainWheelsR = new THREE.Group();
  mainWheelsL.name = 'mainWheelsL';
  mainWheelsR.name = 'mainWheelsR';
  const gearDoors = new THREE.Group();
  gearDoors.name = 'gearDoors';
  const struts = new THREE.Group();
  struts.name = 'struts';
  const torqueLinks = new THREE.Group();
  torqueLinks.name = 'torqueLinks';
  const mainGearL = new THREE.Group();
  const mainGearR = new THREE.Group();
  mainGearL.name = 'mainGearL';
  mainGearR.name = 'mainGearR';
  for (const sx of [-1, 1]) {
    const gear = sx < 0 ? mainGearL : mainGearR;
    const wheels = sx < 0 ? mainWheelsL : mainWheelsR;
    const x = sx * 1.55;
    wheel(M, wheels, `mainForwardWheel_${sx}`, [x - sx * 0.18, 0.48, 0.28], 0.46, 0.28);
    wheel(M, wheels, `mainRearWheel_${sx}`, [x + sx * 0.18, 0.48, 0.92], 0.46, 0.28);
    cyl(struts, `mainCrossAxle_${sx}`, M.darkMetal, 0.040, 0.86, 'z', [x, 0.50, 0.60], [PI / 2, 0, 0], 12);
    cyl(struts, `mainOleostrut_${sx}`, M.metal, 0.07, 1.55, 'y', [x, 1.12, 0.54], [0, 0, sx * 0.14], 18);
    cyl(struts, `mainDragBrace_${sx}`, M.darkMetal, 0.035, 1.42, 'z', [x - sx * 0.22, 0.92, -0.05], [0.55, 0, 0], 12);
    cyl(struts, `mainSideBrace_${sx}`, M.darkMetal, 0.030, 1.20, 'z', [x + sx * 0.28, 0.98, 1.08], [-0.62, 0, 0], 12);
    tube(torqueLinks, `mainTorqueLink_${sx}`, M.darkMetal, [[x, 1.25, 0.42], [x + sx * 0.32, 0.78, 0.62], [x, 0.52, 0.84]], 0.026);
    box(gearDoors, `mainInnerDoor_${sx}`, M.grey, [0.08, 0.88, 1.42], [sx * 0.78, 0.96, 0.44], [0, 0, sx * 0.20]);
    box(gearDoors, `mainOuterDoor_${sx}`, M.grey, [0.08, 0.78, 1.24], [sx * 2.10, 0.90, 0.52], [0, 0, -sx * 0.24]);
    gear.add(wheels);
  }
  root.add(mainGearL, mainGearR, struts, torqueLinks, gearDoors);
  root.userData = {
    noseGear,
    mainGearL,
    mainGearR,
    noseWheels,
    mainWheelsL,
    mainWheelsR,
    gearDoors,
    struts,
    torqueLinks,
    viewerSpin: -0.78,
    viewerDistMult: 1.04,
    assetOnly: true,
  };
  return root;
}

function addPanelRows(M, group) {
  const seamZ = [-9.70, -8.42, -7.16, -5.62, -3.72, -1.80, 0.20, 2.08, 3.92, 5.82, 7.52];
  for (const z of seamZ) {
    torus(group, `fuselagePanelRing_${z}`, M.seam, 1.0, 0.010, [0, 2.30, z], [0, 0, 0], 64).scale.set(1.38, 0.72, 1);
  }
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU;
    const x = Math.cos(a) * 1.50;
    const y = 2.12 + Math.sin(a) * 0.43;
    cyl(group, `radomeBreakFastener_${i}`, M.seam, 0.012, 0.016, 'z', [x, y, -8.70], [0, 0, 0], 7);
  }
  for (const sx of [-1, 1]) {
    const wingRibs = [
      [[sx * 1.82, 2.365, -2.42], [sx * 1.92, 2.325, 4.16]],
      [[sx * 2.86, 2.345, -1.80], [sx * 3.02, 2.305, 4.04]],
      [[sx * 4.02, 2.310, -1.12], [sx * 4.18, 2.275, 3.86]],
      [[sx * 5.24, 2.270, -0.46], [sx * 5.36, 2.230, 3.62]],
      [[sx * 6.36, 2.220, 0.08], [sx * 6.34, 2.190, 3.26]],
    ];
    wingRibs.forEach((pts, i) => tube(group, `wingChordPanelLine_${sx}_${i}`, M.seam, pts, 0.010, 3));
    tube(group, `mainFlapHinge_${sx}`, M.seam, [[sx * 1.44, 2.330, 3.32], [sx * 3.96, 2.292, 3.12], [sx * 6.84, 2.215, 3.04]], 0.012, 8);
    tube(group, `trailingEdgeBreak_${sx}`, M.seam, [[sx * 1.28, 2.320, 4.28], [sx * 3.70, 2.285, 4.12], [sx * 7.06, 2.035, 3.44]], 0.012, 8);
    tube(group, `leadingEdgePanel_${sx}`, M.seam, [[sx * 1.18, 2.385, -3.05], [sx * 3.96, 2.300, -1.38], [sx * 7.18, 2.035, 0.14]], 0.010, 8);
    box(group, `canardPanelLine_${sx}`, M.seam, [1.80, 0.022, 0.040], [sx * 2.55, 2.755, -4.82], [0, 0, sx * 0.08]);
    box(group, `intakeSideServicePanel_${sx}`, M.seam, [0.050, 0.024, 1.20], [sx * 1.98, 1.86, -2.34], [0, 0, 0]);
    for (let j = 0; j < 5; j++) box(group, `pylonMountPlate_${sx}_${j}`, M.seam, [0.34, 0.018, 0.045], [sx * (2.15 + j * 0.82), 2.04, -0.42 + j * 0.36], [0, 0, sx * 0.06]);
  }
}

function addCamo(M, group) {
  const patches = [
    [-0.64, 2.92, -7.70, 1.05, 0.035, 1.24, M.blue],
    [0.58, 2.86, -5.92, 1.22, 0.035, 1.52, M.blueDark],
    [-0.38, 2.92, -2.82, 1.72, 0.035, 1.10, M.blue],
    [0.42, 2.78, 0.28, 1.92, 0.035, 1.26, M.blueDark],
    [-0.55, 2.78, 4.25, 1.56, 0.035, 1.70, M.blue],
  ];
  for (let i = 0; i < patches.length; i++) {
    const [x, y, z, sx, sy, sz, mat] = patches[i];
    box(group, `softCamoPatchFuselage_${i}`, mat, [sx, sy, sz], [x, y, z], [0.04, 0.08 * (i % 2 ? -1 : 1), 0.08]);
  }
  for (const side of [-1, 1]) {
    box(group, `blueWingCamo_${side}_A`, M.blue, [2.15, 0.030, 1.55], [side * 3.65, 2.32, 0.54], [0, 0, side * 0.10]);
    box(group, `darkWingCamo_${side}_B`, M.blueDark, [1.45, 0.030, 1.10], [side * 5.35, 2.33, 2.24], [0, 0, -side * 0.18]);
    box(group, `tailCamo_${side}`, M.blueDark, [0.08, 1.40, 1.20], [side * 2.20, 4.12, 6.78], [0, 0, -side * 0.08]);
  }
}

export function buildSu34Details() {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 'su34Details';
  addPanelRows(M, root);
  addCamo(M, root);

  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      box(root, `inertPylon_${sx}_${i}`, M.greyDark, [0.22, 0.44, 0.82], [sx * (1.95 + i * 0.82), 1.82, -0.65 + i * 0.36], [0, 0, sx * 0.08]);
    }
    tube(root, `wingtipAntennaRail_${sx}`, M.darkMetal, [[sx * 7.30, 2.30, 1.12], [sx * 7.74, 2.31, 1.08]], 0.018, 6);
    box(root, `navigationLight_${sx}`, sx < 0 ? M.red : M.white, [0.10, 0.06, 0.12], [sx * 7.45, 2.30, 1.10]);
    star(root, M, `wingStarTop_${sx}`, [sx * 4.95, 2.36, 2.60], 0.42, [-PI / 2, 0, 0]);
    star(root, M, `tailStar_${sx}`, [sx * 2.34, 4.48, 6.96], 0.32, [0, sx * PI / 2, 0]);
    for (let i = 0; i < 26; i++) {
      const z = -2.05 + i * 0.24;
      cyl(root, `upperFastener_${sx}_${i}`, M.seam, 0.015, 0.018, 'y', [sx * 1.05, 2.92, z], [0, 0, 0], 8);
    }
  }
  for (let i = 0; i < 8; i++) box(root, `engineDeckVent_${i}`, M.intake, [0.10, 0.035, 0.72], [-0.42 + i * 0.12, 2.94, 3.65]);
  for (let i = 0; i < 6; i++) {
    box(root, `leftAuxIntakeLouver_${i}`, M.intake, [0.42, 0.030, 0.045], [-1.06, 2.38, 2.70 + i * 0.20], [0, 0.05, 0]);
    box(root, `rightAuxIntakeLouver_${i}`, M.intake, [0.42, 0.030, 0.045], [1.06, 2.38, 2.70 + i * 0.20], [0, -0.05, 0]);
  }
  for (let i = 0; i < 7; i++) box(root, `rearHeatPanel_${i}`, M.heat, [0.24, 0.030, 0.58], [-0.72 + i * 0.24, 2.30, 8.78]);
  box(root, 'dorsalBladeAntennaForward', M.greyDark, [0.08, 0.28, 0.18], [0, 3.04, -2.05], [0.12, 0, 0]);
  box(root, 'dorsalBladeAntennaAft', M.greyDark, [0.08, 0.32, 0.20], [0, 2.90, 4.92], [0.08, 0, 0]);
  tube(root, 'leftSideCable', M.darkMetal, [[-1.18, 2.18, -5.60], [-1.30, 2.05, -2.20], [-1.16, 2.02, 1.70]], 0.018, 18);
  tube(root, 'rightSideCable', M.darkMetal, [[1.18, 2.18, -5.60], [1.30, 2.05, -2.20], [1.16, 2.02, 1.70]], 0.018, 18);
  root.userData = { panelSeams: true, camo: true, pylons: true, exteriorOnly: true };
  return root;
}

function buildSu34GuideForward(M) {
  const root = new THREE.Group();
  root.name = 'guideForwardFuselage';
  loftZ(root, 'forwardFuselageBellyAndSidesStack', M.paleBlue, [
    { z: -12.34, y: 1.91, w: 0.08, h: 0.045, xPow: 0.58, yPow: 0.82, top: 0.46, bottom: 0.74 },
    { z: -11.58, y: 1.97, w: 0.74, h: 0.19, xPow: 0.50, yPow: 0.80, top: 0.62, bottom: 1.02, chine: 0.05 },
    { z: -10.48, y: 2.03, w: 1.44, h: 0.34, xPow: 0.48, yPow: 0.82, top: 0.74, bottom: 1.16, chine: 0.14 },
    { z: -9.18, y: 2.12, w: 1.84, h: 0.48, xPow: 0.50, yPow: 0.86, top: 0.84, bottom: 1.16, chine: 0.22 },
    { z: -8.10, y: 2.30, w: 1.88, h: 0.62, xPow: 0.58, yPow: 0.94, top: 1.04, bottom: 1.00, chine: 0.18 },
    { z: -6.82, y: 2.48, w: 1.72, h: 0.78, xPow: 0.70, yPow: 1.04, top: 1.24, bottom: 0.88, chine: 0.10 },
    { z: -5.42, y: 2.48, w: 1.52, h: 0.84, xPow: 0.80, yPow: 1.08, top: 1.20, bottom: 0.86, chine: 0.06 },
    { z: -3.62, y: 2.34, w: 1.50, h: 0.80, xPow: 0.88, yPow: 1.08, top: 1.06, bottom: 0.88, chine: 0.04 },
    { z: -1.55, y: 2.24, w: 1.46, h: 0.76, xPow: 0.92, yPow: 1.04, top: 0.98, bottom: 0.86, chine: 0.02 },
  ], 60);

  loftZ(root, 'guideLayeredWhiteNosecone', M.radome, [
    { z: -12.48, y: 1.93, w: 0.035, h: 0.035, xPow: 0.70, yPow: 0.76, top: 0.48, bottom: 0.72 },
    { z: -11.84, y: 1.97, w: 0.46, h: 0.13, xPow: 0.58, yPow: 0.76, top: 0.58, bottom: 0.98, chine: 0.03 },
    { z: -10.86, y: 2.03, w: 1.22, h: 0.30, xPow: 0.50, yPow: 0.80, top: 0.74, bottom: 1.12, chine: 0.12 },
    { z: -9.62, y: 2.11, w: 1.78, h: 0.46, xPow: 0.48, yPow: 0.84, top: 0.86, bottom: 1.14, chine: 0.22 },
    { z: -8.62, y: 2.20, w: 1.60, h: 0.40, xPow: 0.58, yPow: 0.90, top: 0.88, bottom: 1.00, chine: 0.12 },
  ], 60);
  ellipsoid(root, 'noseconeSandedTip', M.radome, 1, [0, 1.94, -12.50], [0.085, 0.040, 0.050], 20);
  torus(root, 'noseconeAlignmentSeam', M.seam, 1, 0.010, [0, 2.13, -8.62], [0, 0, 0], 72).scale.set(1.58, 0.44, 1);
  tube(root, 'leftNoseconeSandingValley', M.seam, [[-0.12, 2.05, -12.18], [-0.72, 2.12, -10.72], [-1.42, 2.18, -8.78]], 0.009, 12);
  tube(root, 'rightNoseconeSandingValley', M.seam, [[0.12, 2.05, -12.18], [0.72, 2.12, -10.72], [1.42, 2.18, -8.78]], 0.009, 12);

  addCanopy(M, root);
  ribbonSurface(root, 'canopyBaseBridgePanel', M.greyDark, [
    { z: -8.12, y: 2.91, w: 0.90, crown: 0.08, edgeDrop: 0.08 },
    { z: -7.18, y: 3.04, w: 1.20, crown: 0.14, edgeDrop: 0.13 },
    { z: -6.02, y: 3.00, w: 1.10, crown: 0.12, edgeDrop: 0.12 },
    { z: -4.92, y: 2.76, w: 0.76, crown: 0.06, edgeDrop: 0.08 },
  ], 14);

  for (const sx of [-1, 1]) {
    sideShellSurface(root, sx < 0 ? 'leftForwardFuselageSides_1_to_4' : 'rightForwardFuselageSides_1_to_4', M.blue, sx, [
      { z: -8.74, x: 1.42, yTop: 2.34, yBottom: 1.48, bulge: 0.08, lowerTuck: 0.14, upperTuck: 0.08 },
      { z: -7.62, x: 1.86, yTop: 2.74, yBottom: 1.32, bulge: 0.13, lowerTuck: 0.16, upperTuck: 0.06 },
      { z: -6.10, x: 1.62, yTop: 3.02, yBottom: 1.45, bulge: 0.12, lowerTuck: 0.15, upperTuck: 0.04 },
      { z: -4.42, x: 1.48, yTop: 2.70, yBottom: 1.42, bulge: 0.09, lowerTuck: 0.13, upperTuck: 0.03 },
      { z: -2.15, x: 1.48, yTop: 2.48, yBottom: 1.30, bulge: 0.07, lowerTuck: 0.10, upperTuck: 0.03 },
    ], 10);
    tube(root, `forwardSideGlueLine_${sx}`, M.seam, [[sx * 1.76, 2.45, -8.42], [sx * 1.70, 2.62, -6.10], [sx * 1.45, 2.28, -2.05]], 0.012, 12);
    surfacePanel(root, `lowerCornerReinforcer_${sx}`, M.greyDark, [[sx * 1.10, 1.22, -8.20], [sx * 1.58, 1.28, -7.50], [sx * 1.38, 1.24, -2.05], [sx * 0.98, 1.22, -2.35]]);
    box(root, `bulkhead1VisibleEdge_${sx}`, M.seam, [0.05, 0.86, 0.035], [sx * 1.40, 2.02, -8.62]);
    box(root, `bulkhead2VisibleEdge_${sx}`, M.seam, [0.05, 1.05, 0.035], [sx * 1.54, 2.06, -5.45]);
    box(root, `bulkhead3VisibleEdge_${sx}`, M.seam, [0.05, 0.96, 0.035], [sx * 1.40, 2.02, -3.30]);
  }
  box(root, 'rxTrayCenterHint', M.greyDark, [1.08, 0.045, 2.48], [0, 2.92, -3.38], [0.03, 0, 0]);
  box(root, 'magnetBridgePanelHint', M.greyDark, [0.74, 0.042, 0.42], [0, 2.95, -7.98], [0.04, 0, 0]);
  root.userData = { nose: root.getObjectByName('guideLayeredWhiteNosecone'), canopy: root.getObjectByName('canopy') };
  return root;
}

function buildSu34GuideWingAssembly(M) {
  const root = new THREE.Group();
  root.name = 'guideWingAssembly_v6MeasuredPlanform';
  const wingCfg = {
    // Half-span is 6.88 in this scene scale, matched to the 845/1398
    // span/length ratio from the public General Arrangement plan. These trace the
    // public top-view Su-34 outline: broad root chord, swept leading edge,
    // straighter aft flap line, and the small squared-off wingtip rail zone.
    stations: [
      { lead: [0.82, -3.78], trail: [0.92, 4.78], y: 2.235, thicknessMul: 1.24, camberMul: 1.14 },
      { lead: [1.26, -3.55], trail: [1.42, 4.78], y: 2.235, thicknessMul: 1.20, camberMul: 1.12 },
      { lead: [2.06, -3.02], trail: [2.24, 4.68], y: 2.225, thicknessMul: 1.10, camberMul: 1.06 },
      { lead: [3.04, -2.36], trail: [3.24, 4.50], y: 2.205, thicknessMul: 1.00, camberMul: 1.00 },
      { lead: [4.08, -1.64], trail: [4.22, 4.24], y: 2.165, thicknessMul: 0.88, camberMul: 0.90 },
      { lead: [5.05, -0.92], trail: [5.12, 3.96], y: 2.105, thicknessMul: 0.77, camberMul: 0.80 },
      { lead: [6.02, -0.26], trail: [5.92, 3.64], y: 2.045, thicknessMul: 0.66, camberMul: 0.70 },
      { lead: [6.62, 0.06], trail: [6.46, 3.40], y: 1.995, thicknessMul: 0.58, camberMul: 0.62 },
      { lead: [6.88, 0.20], trail: [6.58, 3.28], y: 1.975, thicknessMul: 0.52, camberMul: 0.56 },
    ],
    y: 2.18, thickness: 0.17, camber: 0.070, chordSegments: 14,
  };
  const leftWing = curvedWingPlanform(root, 'leftOnePieceWingFromGuide_1to1TopView', M.paleBlue, -1, wingCfg);
  const rightWing = curvedWingPlanform(root, 'rightOnePieceWingFromGuide_1to1TopView', M.paleBlue, 1, wingCfg);
  const gloveCfg = {
    // The Su-34 wing is not a simple delta. This strake/LEX blends out of the
    // broad forward fuselage and creates the long curved shoulder in top view.
    stations: [
      { lead: [0.58, -4.52], trail: [0.82, -1.20], y: 2.505, thicknessMul: 1.16, camberMul: 1.18 },
      { lead: [1.10, -4.14], trail: [1.38, -1.12], y: 2.475, thicknessMul: 1.10, camberMul: 1.10 },
      { lead: [1.92, -3.58], trail: [2.28, -0.96], y: 2.425, thicknessMul: 1.00, camberMul: 1.00 },
      { lead: [2.92, -2.92], trail: [3.30, -0.74], y: 2.350, thicknessMul: 0.86, camberMul: 0.90 },
      { lead: [3.92, -2.18], trail: [4.34, -0.48], y: 2.260, thicknessMul: 0.70, camberMul: 0.76 },
    ],
    y: 2.35, thickness: 0.125, camber: 0.050, chordSegments: 7,
  };
  const leftLerx = curvedWingPlanform(root, 'leftWingStrakeLERXFromGuide_curvedShoulder', M.blue, -1, gloveCfg);
  const rightLerx = curvedWingPlanform(root, 'rightWingStrakeLERXFromGuide_curvedShoulder', M.blue, 1, gloveCfg);
  const canardCfg = {
    stations: [
      { lead: [1.02, -5.92], trail: [1.10, -4.24], y: 2.735, thicknessMul: 1.00, camberMul: 1.00 },
      { lead: [2.16, -5.46], trail: [2.20, -3.92], y: 2.750, thicknessMul: 0.86, camberMul: 0.92 },
      { lead: [3.40, -4.94], trail: [3.24, -3.54], y: 2.735, thicknessMul: 0.68, camberMul: 0.76 },
      { lead: [3.82, -4.72], trail: [3.40, -3.42], y: 2.715, thicknessMul: 0.54, camberMul: 0.62 },
    ],
    y: 2.72, thickness: 0.11, camber: 0.032, chordSegments: 5,
  };
  const leftCanard = curvedWingPlanform(root, 'leftCanardFromGuide_scaledForeplane', M.blue, -1, canardCfg);
  const rightCanard = curvedWingPlanform(root, 'rightCanardFromGuide_scaledForeplane', M.blue, 1, canardCfg);
  for (const sx of [-1, 1]) {
    const label = sx < 0 ? 'L' : 'R';
    tube(root, `topViewLeadingEdgeReference_${label}`, M.seam, [
      [sx * 0.82, 2.405, -3.78],
      [sx * 2.06, 2.385, -3.02],
      [sx * 4.08, 2.305, -1.64],
      [sx * 6.02, 2.120, -0.26],
      [sx * 6.88, 2.045, 0.20],
    ], 0.011, 12);
    tube(root, `topViewTrailingEdgeReference_${label}`, M.seam, [
      [sx * 0.92, 2.325, 4.78],
      [sx * 2.24, 2.285, 4.68],
      [sx * 4.22, 2.235, 4.24],
      [sx * 5.92, 2.085, 3.64],
      [sx * 6.58, 2.020, 3.28],
    ], 0.011, 12);
    tube(root, `visibleWingSparLine_${label}`, M.darkMetal, [[sx * 0.92, 2.210, -0.12], [sx * 6.62, 2.010, 0.70]], 0.018, 14);
    tube(root, `outerSlatBreak_${label}`, M.seam, [[sx * 2.10, 2.36, -2.76], [sx * 4.24, 2.25, -1.34], [sx * 6.26, 2.05, 0.06]], 0.010, 9);
    tube(root, `trailingControlHingeLine_${label}`, M.seam, [[sx * 1.30, 2.305, 3.50], [sx * 3.86, 2.235, 3.28], [sx * 6.46, 2.000, 3.08]], 0.012, 10);
    surfacePanel(root, `innerFlapGuidePanel_${label}`, M.grey, [[sx * 1.42, 2.315, 3.54], [sx * 3.92, 2.240, 3.30], [sx * 3.70, 2.228, 4.15], [sx * 1.34, 2.315, 4.32]]);
    surfacePanel(root, `outerAileronGuidePanel_${label}`, M.grey, [[sx * 4.05, 2.225, 3.14], [sx * 6.46, 2.000, 3.04], [sx * 6.20, 1.985, 3.66], [sx * 3.88, 2.220, 3.96]]);
    surfacePanel(root, `wingtipSquaredCap_${label}`, M.greyDark, [
      [sx * 6.78, 2.020, 0.18],
      [sx * 6.98, 2.010, 0.42],
      [sx * 6.74, 1.995, 3.26],
      [sx * 6.54, 2.006, 3.42],
    ]);
    box(root, `wingtipRailGuide_${label}`, M.greyDark, [0.15, 0.13, 3.08], [sx * 6.92, 2.075, 1.78], [0, sx * 0.02, 0]);
    box(root, `canardPivotTubeGuide_${label}`, M.greyDark, [0.50, 0.20, 0.58], [sx * 1.10, 2.665, -5.04], [0, -sx * 0.14, 0]);
    surfacePanel(root, `fuselageShoulderBlendPlate_${label}`, M.blueDark, [
      [sx * 0.70, 2.50, -4.08],
      [sx * 2.64, 2.42, -3.10],
      [sx * 3.74, 2.31, -1.92],
      [sx * 1.02, 2.37, -0.94],
    ]);
    for (let rib = 0; rib < 6; rib++) {
      const x = 1.42 + rib * 0.92;
      const z0 = -3.28 + rib * 0.55;
      const z1 = 4.56 - rib * 0.22;
      tube(root, `measuredWingRib_${label}_${rib}`, M.seam, [[sx * x, 2.32 - rib * 0.035, z0], [sx * (x + 0.16), 2.28 - rib * 0.035, z1]], 0.008, 3);
    }
  }
  root.userData = {
    wings: root,
    leftWing,
    rightWing,
    leftLerx,
    rightLerx,
    leftCanard,
    rightCanard,
    canards: true,
    planformScale: { lengthM: 23.34, wingspanM: 14.70 },
  };
  return root;
}

function buildSu34GuideRearAndNacelles(M) {
  const root = new THREE.Group();
  root.name = 'guideRearTurtledeckAndNacelles';
  ribbonSurface(root, 'rearTurtledeckSevenPieceSpine', M.blue, [
    { z: -1.42, y: 2.54, w: 0.78, crown: 0.08, edgeDrop: 0.12 },
    { z: 0.80, y: 2.56, w: 0.76, crown: 0.08, edgeDrop: 0.12 },
    { z: 3.20, y: 2.52, w: 0.68, crown: 0.07, edgeDrop: 0.10 },
    { z: 5.68, y: 2.38, w: 0.54, crown: 0.06, edgeDrop: 0.09 },
    { z: 8.50, y: 2.17, w: 0.36, crown: 0.04, edgeDrop: 0.07 },
    { z: 10.50, y: 1.98, w: 0.24, crown: 0.025, edgeDrop: 0.05 },
  ], 18);
  loftZ(root, 'sandedTailconeFromGuide', M.blue, [
    { z: 8.50, y: 1.84, w: 0.56, h: 0.32, xPow: 0.86, yPow: 0.86, top: 0.86, bottom: 0.76 },
    { z: 10.35, y: 1.80, w: 0.34, h: 0.22, xPow: 0.92, yPow: 0.92, top: 0.76, bottom: 0.70 },
    { z: 11.72, y: 1.78, w: 0.12, h: 0.09, xPow: 1.0, yPow: 1.0, top: 0.70, bottom: 0.66 },
  ], 30);
  for (const sx of [-1, 1]) {
    loftZ(root, sx < 0 ? 'leftSquareToRoundNacelleGuide' : 'rightSquareToRoundNacelleGuide', M.grey, [
      { x: sx * 1.58, z: -2.72, y: 1.34, w: 0.62, h: 0.42, xPow: 0.36, yPow: 0.38, top: 0.92, bottom: 0.92, chine: 0.06 },
      { x: sx * 1.42, z: -0.80, y: 1.34, w: 0.66, h: 0.44, xPow: 0.46, yPow: 0.48, top: 0.94, bottom: 0.90, chine: 0.04 },
      { x: sx * 1.28, z: 2.35, y: 1.38, w: 0.72, h: 0.48, xPow: 0.58, yPow: 0.55, top: 0.98, bottom: 0.86, chine: 0.02 },
      { x: sx * 1.16, z: 5.80, y: 1.48, w: 0.64, h: 0.46, xPow: 0.74, yPow: 0.70, top: 0.94, bottom: 0.78 },
      { x: sx * 1.00, z: 8.80, y: 1.58, w: 0.50, h: 0.38, xPow: 0.92, yPow: 0.86, top: 0.86, bottom: 0.72 },
    ], 40);
    loftZ(root, sx < 0 ? 'leftUpperNacelleFourLayerGuide' : 'rightUpperNacelleFourLayerGuide', M.grey, [
      { x: sx * 1.18, z: 2.32, y: 2.04, w: 0.42, h: 0.18, xPow: 0.70, yPow: 0.66, top: 1.34, bottom: 0.46 },
      { x: sx * 1.20, z: 4.20, y: 2.10, w: 0.58, h: 0.28, xPow: 0.76, yPow: 0.66, top: 1.44, bottom: 0.50 },
      { x: sx * 1.18, z: 6.30, y: 2.12, w: 0.62, h: 0.30, xPow: 0.82, yPow: 0.70, top: 1.36, bottom: 0.48 },
      { x: sx * 1.08, z: 8.20, y: 2.02, w: 0.44, h: 0.22, xPow: 0.90, yPow: 0.80, top: 1.10, bottom: 0.44 },
    ], 36);
    surfacePanel(root, `nacelleSplitterGuide_${sx}`, M.greyDark, [[sx * 0.96, 1.78, -2.82], [sx * 1.58, 1.86, -2.56], [sx * 1.30, 1.52, -0.96], [sx * 0.88, 1.48, -1.18]]);
    surfacePanel(root, `nacelleBellyPanelGuide_${sx}`, M.greyDark, [[sx * 0.80, 0.94, -0.45], [sx * 1.64, 0.96, -0.25], [sx * 1.44, 0.96, 7.58], [sx * 0.72, 0.98, 7.75]]);
    box(root, `intakeProtectorPly_${sx}`, M.greyDark, [0.10, 0.40, 1.64], [sx * 1.96, 1.36, -1.74]);
    addNozzle(M, root, sx);
  }
  root.userData = { turtledeck: root.getObjectByName('rearTurtledeckSevenPieceSpine'), nacelles: true };
  return root;
}

function buildSu34GuideTail(M) {
  const root = new THREE.Group();
  root.name = 'guideTailAssembly';
  const verticalTailsL = verticalPlate(root, 'leftVerticalStabiliserGuide', M.blue, -1, -2.28, [[2.38, 5.38], [2.72, 8.46], [5.98, 7.56], [5.52, 6.02]], 0.18, 0.12);
  const verticalTailsR = verticalPlate(root, 'rightVerticalStabiliserGuide', M.blue, 1, 2.28, [[2.38, 5.38], [2.72, 8.46], [5.98, 7.56], [5.52, 6.02]], 0.18, -0.12);
  surfacePanel(verticalTailsL, 'leftFoamLaminatedRudderPanel', M.blueDark, [[-0.09, 2.90, 7.15], [-0.09, 2.92, 8.06], [-0.09, 5.24, 7.48], [-0.09, 5.06, 6.82]]);
  surfacePanel(verticalTailsR, 'rightFoamLaminatedRudderPanel', M.blueDark, [[0.09, 2.90, 7.15], [0.09, 2.92, 8.06], [0.09, 5.24, 7.48], [0.09, 5.06, 6.82]]);
  const stabCfg = {
    stations: [
      { lead: [0.94, 6.36], trail: [0.82, 8.82], y: 2.14, thicknessMul: 1.00, camberMul: 1.00 },
      { lead: [2.22, 6.86], trail: [2.10, 9.12], y: 2.10, thicknessMul: 0.82, camberMul: 0.90 },
      { lead: [4.36, 7.42], trail: [3.38, 9.46], y: 2.04, thicknessMul: 0.62, camberMul: 0.72 },
    ],
    y: 2.12, thickness: 0.12, camber: 0.030, chordSegments: 4,
  };
  curvedWingPlanform(root, 'leftHorizontalStabiliserGuide', M.grey, -1, stabCfg);
  curvedWingPlanform(root, 'rightHorizontalStabiliserGuide', M.grey, 1, stabCfg);
  for (const sx of [-1, 1]) {
    loftZ(root, sx < 0 ? 'leftTailRootFairingGuide' : 'rightTailRootFairingGuide', M.blueDark, [
      { x: sx * 2.04, z: 5.10, y: 2.34, w: 0.30, h: 0.15, xPow: 0.74, yPow: 0.70, top: 1.18, bottom: 0.50 },
      { x: sx * 2.18, z: 6.20, y: 2.52, w: 0.40, h: 0.25, xPow: 0.80, yPow: 0.70, top: 1.26, bottom: 0.52 },
      { x: sx * 2.20, z: 7.35, y: 2.48, w: 0.34, h: 0.20, xPow: 0.86, yPow: 0.76, top: 1.14, bottom: 0.50 },
    ], 28);
  }
  root.userData = { verticalTailsL, verticalTailsR };
  return root;
}

function buildSu34GuideSurfaceDetails(M) {
  const root = new THREE.Group();
  root.name = 'guideSurfaceDetails';
  const zRings = [-8.62, -7.40, -6.20, -4.80, -3.25, -1.45, 0.70, 2.80, 4.90, 7.20];
  for (const z of zRings) torus(root, `guideFuselageFormerLine_${z}`, M.seam, 1, 0.009, [0, 2.24, z], [0, 0, 0], 70).scale.set(1.32, 0.62, 1);
  for (const sx of [-1, 1]) {
    tube(root, `guideWingLeadingEdgeInk_${sx}`, M.seam, [[sx * 1.00, 2.38, -3.42], [sx * 3.98, 2.26, -1.52], [sx * 7.30, 2.00, 0.16]], 0.010, 10);
    tube(root, `guideWingTrailingEdgeInk_${sx}`, M.seam, [[sx * 1.04, 2.29, 4.50], [sx * 3.90, 2.23, 4.18], [sx * 7.02, 1.98, 3.34]], 0.010, 10);
    for (let i = 0; i < 5; i++) tube(root, `guideWingRibInk_${sx}_${i}`, M.seam, [[sx * (1.72 + i * 1.06), 2.30 - i * 0.04, -2.85 + i * 0.62], [sx * (1.86 + i * 1.02), 2.26 - i * 0.04, 4.35 - i * 0.22]], 0.009, 3);
    star(root, M, `guideWingStar_${sx}`, [sx * 4.80, 2.36, 2.56], 0.40, [-PI / 2, 0, 0]);
    star(root, M, `guideTailStar_${sx}`, [sx * 2.42, 4.60, 7.04], 0.30, [0, sx * PI / 2, 0]);
  }
  for (let i = 0; i < 9; i++) box(root, `guideDorsalVent_${i}`, M.intake, [0.10, 0.034, 0.62], [-0.44 + i * 0.11, 2.88, 1.90 + i * 0.05]);
  box(root, 'guideDorsalAntennaForward', M.greyDark, [0.08, 0.30, 0.20], [0, 3.08, -2.00], [0.10, 0, 0]);
  box(root, 'guideDorsalAntennaAft', M.greyDark, [0.08, 0.34, 0.20], [0, 2.86, 5.25], [0.08, 0, 0]);
  return root;
}

function makeScratchMaterials() {
  const M = makeMaterials();
  const mk = (color, metalness = 0.02, roughness = 0.78, opacity = 1) =>
    new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
    });
  return {
    ...M,
    depron: mk(0xb8b8b2, 0.01, 0.86),
    depronEdge: mk(0x6f7475, 0.02, 0.88),
    ply: mk(0xa34f18, 0.02, 0.74),
    plyDark: mk(0x612b0c, 0.02, 0.82),
    carbon: mk(0x111719, 0.35, 0.42),
    foamBlue: mk(0x76c9d9, 0.02, 0.70),
    ink: mk(0x252a2d, 0.02, 0.88),
    ghost: mk(0x8ea0aa, 0.01, 0.82, 0.34),
    jig: mk(0x7e2e8d, 0.02, 0.70),
  };
}

function tagGuide(obj, page, part, step) {
  obj.userData.reference = {
    source: 'Jetworks Su-34 Construction Guide 2020-11-29',
    sourceUrl: SU34_GUIDE_SOURCE_URL,
    page,
    part,
    step,
  };
  return obj;
}

function tagGeneralArrangement(obj, part, datum) {
  obj.userData.reference = {
    source: SU34_GENERAL_ARRANGEMENT.source,
    sourceUrl: SU34_GENERAL_ARRANGEMENT.sourceUrl,
    part,
    datum,
    dimensionsMm: {
      length: SU34_GENERAL_ARRANGEMENT.lengthMm,
      span: SU34_GENERAL_ARRANGEMENT.spanMm,
      height: SU34_GENERAL_ARRANGEMENT.heightMm,
      tailplaneOffset: SU34_GENERAL_ARRANGEMENT.tailplaneOffsetMm,
    },
  };
  return obj;
}

function gaTube(parent, part, mat, pts, radius = 0.012, segments = 8, datum = 'general arrangement line') {
  return tagGeneralArrangement(tube(parent, part, mat, pts, radius, segments), part, datum);
}

function gaPanel(parent, part, mat, points, datum = 'general arrangement surface') {
  return tagGeneralArrangement(surfacePanel(parent, part, mat, points), part, datum);
}

function guideBox(parent, page, part, mat, size, pos, rot = [0, 0, 0]) {
  return tagGuide(box(parent, part, mat, size, pos, rot), page, part, `page ${page}`);
}

function guideTube(parent, page, part, mat, pts, radius = 0.03, segments = 16) {
  return tagGuide(tube(parent, part, mat, pts, radius, segments), page, part, `page ${page}`);
}

function guideSidePanel(parent, page, name, mat, sx, x, profile, thickness = 0.055, cant = 0) {
  return tagGuide(verticalPlate(parent, name, mat, sx, x, profile, thickness, cant), page, name, `page ${page}`);
}

function guideFlatPanel(parent, page, name, mat, points) {
  return tagGuide(surfacePanel(parent, name, mat, points), page, name, `page ${page}`);
}

function guideLongFormer(parent, page, name, mat, sx, x, z0, z1, y0, y1, w = 0.10) {
  const zc = (z0 + z1) / 2;
  const len = Math.abs(z1 - z0);
  const yc = (y0 + y1) / 2;
  const rz = Math.atan2(y1 - y0, z1 - z0);
  return guideBox(parent, page, name, mat, [w, 0.10, len], [sx * x, yc, zc], [rz, 0, 0]);
}

function buildScratchLayeredNose(M, parent) {
  const nose = new THREE.Group();
  nose.name = 'p11_layeredDuckbillNosecone';
  loftZ(nose, 'p11_3dPrintedOrSandedNosecone', M.foamBlue, [
    { z: -12.44, y: 1.74, w: 0.08, h: 0.035, xPow: 0.44, yPow: 0.58, top: 0.55, bottom: 0.60 },
    { z: -11.80, y: 1.78, w: 0.58, h: 0.15, xPow: 0.40, yPow: 0.62, top: 0.62, bottom: 0.95, chine: 0.04 },
    { z: -10.78, y: 1.86, w: 1.14, h: 0.29, xPow: 0.38, yPow: 0.66, top: 0.72, bottom: 1.08, chine: 0.10 },
    { z: -9.54, y: 1.96, w: 1.58, h: 0.42, xPow: 0.42, yPow: 0.72, top: 0.84, bottom: 1.12, chine: 0.18 },
    { z: -8.60, y: 2.04, w: 1.62, h: 0.46, xPow: 0.54, yPow: 0.82, top: 0.86, bottom: 1.02, chine: 0.16 },
  ], 56);
  tagGuide(nose.getObjectByName('p11_3dPrintedOrSandedNosecone'), 11, 'Nosecone', 'foam/3D-printed nosecone, sand mountains until valleys disappear');
  for (let i = -4; i <= 4; i++) {
    const x = i * 0.22;
    guideTube(nose, 11, `p11_noseconeLayerValley_${i + 4}`, M.ink, [
      [x * 0.18, 2.02, -12.20],
      [x * 0.80, 2.16, -10.48],
      [x * 1.00, 2.34, -8.68],
    ], 0.008, 10);
  }
  guideBox(nose, 11, 'p11_NoseconeAligner', M.ply, [0.46, 0.10, 0.26], [0, 1.58, -8.72], [0.02, 0, 0]);
  parent.add(nose);
  return tagGuide(nose, 11, 'Nosecone assembly', 'nosecone plus aligner');
}

function buildScratchCanopy(M, parent) {
  const canopy = new THREE.Group();
  canopy.name = 'p12_p14_laminatedWideCanopy';
  loftZ(canopy, 'p12_laminatedCanopyWideCrown', M.glass, [
    { z: -8.24, y: 2.73, w: 0.52, h: 0.08, xPow: 0.56, yPow: 0.60, top: 0.70, bottom: 0.28 },
    { z: -7.72, y: 2.92, w: 1.02, h: 0.22, xPow: 0.60, yPow: 0.62, top: 1.05, bottom: 0.30 },
    { z: -6.86, y: 3.07, w: 1.30, h: 0.36, xPow: 0.72, yPow: 0.66, top: 1.22, bottom: 0.34 },
    { z: -5.84, y: 3.05, w: 1.22, h: 0.34, xPow: 0.80, yPow: 0.70, top: 1.10, bottom: 0.34 },
    { z: -4.82, y: 2.86, w: 0.72, h: 0.18, xPow: 0.88, yPow: 0.76, top: 0.82, bottom: 0.30 },
  ], 34);
  tagGuide(canopy.getObjectByName('p12_laminatedCanopyWideCrown'), 12, 'Canopy', 'laminated/vac/printed canopy');
  guideBox(canopy, 14, 'p14_CanopyBase', M.depronEdge, [2.08, 0.08, 3.34], [0, 2.58, -6.62], [0.02, 0, 0]);
  guideBox(canopy, 12, 'p12_canopyCenterFrame', M.greyDark, [0.060, 0.22, 2.52], [0, 3.18, -6.45], [0.02, 0, 0]);
  for (let i = 0; i < 5; i++) {
    guideTube(canopy, 12, `p12_laminatedCanopyValley_${i}`, M.ink, [
      [-1.06 + i * 0.53, 3.03, -8.02],
      [-0.84 + i * 0.42, 3.34, -6.56],
      [-0.50 + i * 0.25, 3.05, -4.94],
    ], 0.008, 12);
  }
  guideBox(canopy, 13, 'p13_frontCanopyTongue', M.ply, [0.52, 0.06, 0.38], [0, 2.51, -8.24]);
  for (const sx of [-1, 1]) {
    cyl(canopy, `p13_canopyMagnet_${sx}`, M.metal, 0.065, 0.025, 'y', [sx * 0.44, 2.64, -5.08], [0, 0, 0], 18);
    tagGuide(canopy.getObjectByName(`p13_canopyMagnet_${sx}`), 13, 'Canopy magnet', 'magnet recess alignment');
  }
  guideBox(canopy, 14, 'p14_turtledeckToBeFittedGhost', M.ghost, [1.36, 0.08, 1.72], [0, 2.80, -3.80], [0.03, 0, 0]);
  parent.add(canopy);
  return tagGuide(canopy, 12, 'Canopy assembly', 'pages 12-14 canopy, magnets, base, sanding guide');
}

function buildSu34ScratchForwardModule() {
  const M = makeScratchMaterials();
  const root = new THREE.Group();
  root.name = 'su34_fromZero_p05_p14_forwardFuselage';

  const assembly = new THREE.Group();
  assembly.name = 'p05_p14_forwardFuselageAssembly';
  root.add(assembly);

  const belly = prism(assembly, 'p05_ForwardFuselageBellyInner', M.depron, [
    [-0.34, -8.72], [0.34, -8.72], [0.82, -1.40], [0.58, -0.78], [-0.58, -0.78], [-0.82, -1.40],
  ], 1.34, 0.09);
  tagGuide(belly, 5, 'Forward Fuselage Belly (Inner)', 'Bulkhead 1 glued to belly inner');
  guideBox(assembly, 5, 'p05_Bulkhead1', M.ply, [1.22, 0.84, 0.12], [0, 1.74, -8.46]);
  guideBox(assembly, 5, 'p05_Bulkhead1_topTab', M.plyDark, [0.42, 0.26, 0.14], [0, 2.30, -8.50]);
  guideBox(assembly, 5, 'p05_Bulkhead1_bottomNotchShadow', M.intake, [0.42, 0.20, 0.13], [0, 1.34, -8.55]);

  for (const sx of [-1, 1]) {
    const sideName = sx < 0 ? 'left' : 'right';
    guideSidePanel(assembly, 6, `p06_${sideName}_ForwardFuselageSide1`, M.depron, sx, sx * 0.78, [
      [1.18, -8.58], [1.30, -1.40], [1.88, -1.08], [2.20, -2.56], [2.62, -4.76], [2.42, -6.18], [1.78, -8.50],
    ], 0.060, -sx * 0.045);
    guideLongFormer(assembly, 6, `p06_${sideName}_LowerCornerReinforcer_outer`, M.ply, sx, 0.54, -8.14, -1.42, 1.45, 1.32, 0.10);
    guideLongFormer(assembly, 6, `p06_${sideName}_LowerCornerReinforcer_inner`, M.plyDark, sx, 0.34, -8.08, -2.08, 1.56, 1.40, 0.08);
    guideBox(assembly, 8, `p08_${sideName}_ForwardFuselageSide2`, M.plyDark, [0.060, 0.66, 6.86], [sx * 0.98, 1.66, -4.88], [0.00, 0, sx * 0.025]);
    guideBox(assembly, 8, `p08_${sideName}_ForwardTab`, M.plyDark, [0.070, 0.18, 0.52], [sx * 0.98, 1.38, -8.56]);
    guideBox(assembly, 8, `p08_${sideName}_RearRecessStep`, M.intake, [0.074, 0.14, 0.58], [sx * 1.02, 1.52, -1.78]);
    guideBox(assembly, 10, `p10_${sideName}_ForwardFuselageSide3_lowerSkin`, M.ply, [0.070, 0.56, 7.58], [sx * 1.08, 1.74, -4.82], [0.00, 0, sx * 0.020]);
    guideSidePanel(assembly, 10, `p10_${sideName}_ForwardFuselageSide4_upperSandingLayer`, M.ply, sx, sx * 1.13, [
      [2.02, -8.08], [2.24, -6.92], [2.62, -5.68], [2.58, -3.70], [2.06, -1.10], [1.92, -0.86], [1.84, -1.80], [2.22, -4.64],
    ], 0.052, -sx * 0.035);
    guideBox(assembly, 7, `p07_${sideName}_RXTraySupportSlot`, M.intake, [0.080, 0.12, 0.60], [sx * 0.82, 1.70, -4.04]);
  }

  guideBox(assembly, 7, 'p07_RXTray', M.ply, [1.20, 0.08, 2.28], [0, 1.92, -4.58], [0.02, 0, 0]);
  guideBox(assembly, 7, 'p07_Bulkhead3', M.ply, [1.16, 0.92, 0.14], [0, 1.82, -3.28]);
  guideBox(assembly, 7, 'p07_Bulkhead2', M.ply, [1.02, 0.86, 0.12], [0, 1.78, -5.28]);
  guideBox(assembly, 9, 'p09_BridgePanelInner', M.ply, [1.14, 0.10, 0.64], [0, 2.28, -7.94], [0.12, 0, 0]);
  guideBox(assembly, 9, 'p09_BridgePanelMiddle', M.ply, [1.44, 0.08, 0.84], [0, 2.48, -7.48], [0.08, 0, 0]);
  guideBox(assembly, 9, 'p09_BridgePanelOuter', M.ply, [1.72, 0.08, 0.88], [0, 2.56, -7.22], [0.08, 0, 0]);
  guideBox(assembly, 9, 'p09_MagnetPanel', M.ply, [1.10, 0.70, 0.12], [0, 2.12, -5.76], [0.10, 0, 0]);
  for (const sx of [-1, 1]) {
    cyl(assembly, `p09_MagnetPanelHole_${sx}`, M.intake, 0.090, 0.026, 'z', [sx * 0.28, 2.20, -5.84], [0, 0, 0], 20);
    tagGuide(assembly.getObjectByName(`p09_MagnetPanelHole_${sx}`), 9, 'Magnet Panel holes', 'magnet panel visible holes');
  }

  guideFlatPanel(assembly, 14, 'p14_forwardSandingSectionGhost', M.ghost, [
    [-1.24, 2.34, -7.92], [1.24, 2.34, -7.92], [1.08, 2.78, -4.72], [-1.08, 2.78, -4.72],
  ]);
  buildScratchLayeredNose(M, assembly);
  buildScratchCanopy(M, assembly);

  Object.assign(root.userData, {
    viewerSpin: -0.46,
    viewerDistMult: 1.08,
    source: 'Jetworks Su-34 Construction Guide 2020-11-29',
    pages: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    completedGuideParts: [
      'Forward Fuselage Belly (Inner)',
      'Bulkhead 1',
      'Forward Fuselage sides #1',
      'Lower Fuselage Corner Reinforcers',
      'RX Tray',
      'Bulkhead 2',
      'Bulkhead 3',
      'Forward Fuselage sides #2',
      'Bridge panel inner/middle/outer',
      'Magnet Panel',
      'Forward Fuselage sides #3',
      'Forward Fuselage sides #4',
      'Nosecone',
      'Nosecone Aligner',
      'Canopy',
      'Canopy base/magnets/tongue',
    ],
  });
  return root;
}

function buildSu34ScratchWingModule() {
  const M = makeScratchMaterials();
  const root = new THREE.Group();
  root.name = 'su34_fromZero_p15_p16_wingCanardAssembly';
  const wingCfg = {
    stations: [
      { lead: [0.66, -3.88], trail: [0.92, 4.70], y: 2.06, thicknessMul: 1.16, camberMul: 1.10 },
      { lead: [1.45, -3.45], trail: [1.62, 4.70], y: 2.055, thicknessMul: 1.12, camberMul: 1.08 },
      { lead: [2.70, -2.72], trail: [2.92, 4.54], y: 2.040, thicknessMul: 1.00, camberMul: 1.00 },
      { lead: [4.04, -1.86], trail: [4.16, 4.24], y: 2.000, thicknessMul: 0.88, camberMul: 0.88 },
      { lead: [5.34, -0.86], trail: [5.25, 3.88], y: 1.940, thicknessMul: 0.72, camberMul: 0.74 },
      { lead: [6.26, -0.20], trail: [6.10, 3.48], y: 1.885, thicknessMul: 0.60, camberMul: 0.64 },
      { lead: [6.88, 0.10], trail: [6.62, 3.22], y: 1.850, thicknessMul: 0.52, camberMul: 0.55 },
    ],
    y: 2.0,
    thickness: 0.16,
    camber: 0.060,
    chordSegments: 13,
  };
  const leftWing = curvedWingPlanform(root, 'p15_leftWing', M.depron, -1, wingCfg);
  const rightWing = curvedWingPlanform(root, 'p15_rightWing', M.depron, 1, wingCfg);
  tagGuide(leftWing, 15, 'Wing', 'main wing aligned to forward fuselage centreline');
  tagGuide(rightWing, 15, 'Wing', 'main wing aligned to forward fuselage centreline');
  guideTube(root, 15, 'p15_6mmCarbonTubeWingSpar', M.carbon, [[-6.78, 2.00, 0.42], [6.78, 2.00, 0.42]], 0.034, 18);
  guideBox(root, 15, 'p15_upperCenterlineMark', M.ink, [0.030, 0.025, 8.25], [0, 2.16, 0.16], [0, 0, 0]);
  guideBox(root, 15, 'p15_lowerCenterlineMark', M.ink, [0.030, 0.025, 8.25], [0, 1.86, 0.16], [0, 0, 0]);
  for (const sx of [-1, 1]) {
    const label = sx < 0 ? 'left' : 'right';
    curvedWingPlanform(root, `p16_${label}_WingStrake`, M.depronEdge, sx, {
      stations: [
        { lead: [0.68, -4.58], trail: [0.84, -1.18], y: 2.22, thicknessMul: 1.08, camberMul: 1.05 },
        { lead: [1.64, -3.94], trail: [1.88, -1.02], y: 2.18, thicknessMul: 0.98, camberMul: 1.00 },
        { lead: [2.82, -3.18], trail: [3.10, -0.78], y: 2.10, thicknessMul: 0.82, camberMul: 0.86 },
        { lead: [4.06, -2.28], trail: [4.28, -0.48], y: 2.00, thicknessMul: 0.66, camberMul: 0.70 },
      ],
      y: 2.12,
      thickness: 0.10,
      camber: 0.038,
      chordSegments: 6,
    });
    tagGuide(root.getObjectByName(`p16_${label}_WingStrake`), 16, 'Wing Strake', 'LERX/wing strake');
    curvedWingPlanform(root, `p16_${label}_FixedCanard`, M.depronEdge, sx, {
      stations: [
        { lead: [1.02, -5.94], trail: [1.08, -4.28], y: 2.42, thicknessMul: 1.00, camberMul: 1.00 },
        { lead: [2.20, -5.48], trail: [2.18, -3.94], y: 2.44, thicknessMul: 0.86, camberMul: 0.88 },
        { lead: [3.62, -4.92], trail: [3.34, -3.46], y: 2.42, thicknessMul: 0.62, camberMul: 0.66 },
      ],
      y: 2.42,
      thickness: 0.10,
      camber: 0.028,
      chordSegments: 5,
    });
    tagGuide(root.getObjectByName(`p16_${label}_FixedCanard`), 16, 'Canards', 'fixed canard with carbon spar slot');
    guideTube(root, 16, `p16_${label}_CanardSpar`, M.carbon, [[sx * 0.96, 2.43, -5.08], [sx * 3.46, 2.43, -4.56]], 0.023, 10);
  }
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.23;
    guideBox(root, 16, `p16_RearTurtledeckPiece_${i + 4}`, i % 2 ? M.ply : M.depronEdge, [0.18, 0.12, 3.86], [x, 2.34 + Math.abs(i) * 0.015, 3.52], [0.035, 0, 0]);
  }
  Object.assign(root.userData, {
    viewerSpin: -1.10,
    viewerDistMult: 1.06,
    source: 'Jetworks Su-34 Construction Guide 2020-11-29',
    pages: [15, 16],
    completedGuideParts: ['Wing', '6mm Carbon tube wing spar', 'centreline marks', 'Wing Strake', 'Canards', 'Rear Turtledeck seven pieces'],
  });
  return root;
}

function buildSu34ScratchRearNacelleModule() {
  const M = makeScratchMaterials();
  const root = new THREE.Group();
  root.name = 'su34_fromZero_p17_p24_rearTurtledeckNacelles';

  const turtle = new THREE.Group();
  turtle.name = 'p17_p18_rearTurtledeckAndTailcone';
  root.add(turtle);
  for (let i = -3; i <= 3; i++) {
    const abs = Math.abs(i);
    guideBox(turtle, i === 0 ? 17 : 18, `p17_p18_RearTurtledeckLaminate_${i + 4}`, i % 2 ? M.depron : M.depronEdge,
      [0.18, 0.16 + abs * 0.014, 7.30], [i * 0.22, 2.42 + (3 - abs) * 0.035, 4.76], [0.018, 0, 0]);
    guideTube(turtle, 17, `p17_rearTurtledeckSandingValley_${i + 4}`, M.ink,
      [[i * 0.22, 2.57, 1.12], [i * 0.20, 2.64, 4.80], [i * 0.14, 2.52, 8.42]], 0.007, 8);
  }
  loftZ(turtle, 'p17_Tailcone_sandedFoamOrPrinted', M.foamBlue, [
    { z: 8.34, y: 2.34, w: 0.54, h: 0.25, xPow: 0.82, yPow: 0.74, top: 0.90, bottom: 0.72 },
    { z: 9.42, y: 2.26, w: 0.40, h: 0.20, xPow: 0.90, yPow: 0.82, top: 0.82, bottom: 0.68 },
    { z: 10.34, y: 2.16, w: 0.20, h: 0.11, xPow: 1.0, yPow: 1.0, top: 0.70, bottom: 0.62 },
  ], 30);
  tagGuide(turtle.getObjectByName('p17_Tailcone_sandedFoamOrPrinted'), 17, 'Tailcone', 'sanded to match rear turtledeck top/bottom');
  guideBox(turtle, 18, 'p18_FibreglassWrapZone', M.ghost, [0.82, 0.035, 1.60], [0, 2.67, 7.30]);

  const belly = new THREE.Group();
  belly.name = 'p19_p20_spineAndBelly';
  root.add(belly);
  guideFlatPanel(belly, 19, 'p19_TriangularBulkhead', M.ply, [
    [-0.72, 2.02, 0.68], [0.72, 2.02, 0.68], [0, 2.74, 1.34],
  ]);
  guideBox(belly, 19, 'p19_SpineSparSupport', M.ply, [0.16, 0.14, 5.60], [0, 2.08, 3.20], [0.025, 0, 0]);
  guideTube(belly, 20, 'p20_CarbonSpine', M.carbon, [[0, 2.20, 0.72], [0, 2.14, 6.60]], 0.030, 12);
  guideBox(belly, 20, 'p20_ForwardFuselageBellyOuter', M.ply, [0.84, 0.09, 3.70], [0, 2.15, 0.72], [0.03, 0, 0]);
  for (const sx of [-1, 1]) {
    guideFlatPanel(belly, 20, `p20_LowerFuselageInnerFairing_${sx < 0 ? 'L' : 'R'}`, M.ply, [
      [sx * 0.26, 1.84, -0.72], [sx * 1.12, 1.72, -0.10], [sx * 1.76, 1.60, 2.42], [sx * 0.58, 1.68, 1.86],
    ]);
  }

  const nacelles = new THREE.Group();
  nacelles.name = 'p21_p24_nacelleCoreAndSplitters';
  root.add(nacelles);
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    guideSidePanel(nacelles, 21, `p21_${side}_NacelleInner`, M.plyDark, sx, sx * 1.08, [
      [1.32, -0.24], [1.40, 7.28], [2.02, 7.76], [2.12, 0.86], [1.78, -0.42],
    ], 0.065, -sx * 0.028);
    guideSidePanel(nacelles, 23, `p23_${side}_NacelleOuter`, M.ply, sx, sx * 2.08, [
      [1.20, -0.04], [1.32, 7.20], [1.92, 7.64], [2.10, 0.84], [1.66, -0.32],
    ], 0.070, -sx * 0.035);
    for (let jig = 0; jig < 3; jig++) {
      guideBox(nacelles, jig < 2 ? 21 : 23, `p21_p23_${side}_NacelleJig_${jig + 1}`, M.blueDark,
        [0.08, 0.72, 0.38], [sx * (1.54 + jig * 0.18), 1.80, 0.80 + jig * 2.68], [0, sx * 0.08, 0]);
    }
    guideFlatPanel(nacelles, 24, `p24_${side}_NacelleSplitter_crushBent`, M.ply, [
      [sx * 0.88, 1.26, -0.22], [sx * 1.78, 1.30, 0.26], [sx * 1.48, 1.74, 1.12], [sx * 0.82, 1.66, 0.58],
    ]);
    guideBox(nacelles, 24, `p24_${side}_FuselageBellySupportStrip_outer`, M.ply, [0.12, 0.10, 6.10], [sx * 1.44, 1.42, 3.24], [0.015, 0, 0]);
    guideBox(nacelles, 24, `p24_${side}_FuselageBellySupportStrip_inner`, M.carbon, [0.09, 0.08, 6.28], [sx * 0.92, 1.36, 3.28], [0.015, 0, 0]);
    guideBox(nacelles, 21, `p21_${side}_ForwardEDFBulkhead_visual`, M.ply, [0.92, 0.92, 0.12], [sx * 1.55, 1.50, 0.18]);
    guideBox(nacelles, 21, `p21_${side}_RearEDFBulkhead_visual`, M.ply, [0.86, 0.86, 0.12], [sx * 1.48, 1.54, 1.02]);
    cyl(nacelles, `p21_${side}_EDFBulkheadRoundOpening`, M.intake, 0.30, 0.035, 'z', [sx * 1.55, 1.50, 0.10], [0, 0, 0], 24);
    tagGuide(nacelles.getObjectByName(`p21_${side}_EDFBulkheadRoundOpening`), 21, 'EDF bulkhead opening', 'visual-only EDF bulkhead opening, no functional internals');
  }

  Object.assign(root.userData, {
    viewerSpin: -0.82,
    viewerDistMult: 1.10,
    source: 'Jetworks Su-34 Construction Guide 2020-11-29',
    pages: [17, 18, 19, 20, 21, 22, 23, 24],
    completedGuideParts: [
      'Rear Turtledeck',
      'Tailcone',
      'Triangular bulkhead',
      'Spine Spar Support',
      'Forward Fuselage Belly (Outer)',
      'Carbon spine',
      'Lower Fuselage Inner Fairings',
      'Nacelle (Inners)',
      'EDF Bulkheads visual placeholders',
      'Nacelle (Outers)',
      'Nacelle Splitters',
      'Fuselage belly support strips',
    ],
  });
  return root;
}

function buildSu34ScratchDuctBellyModule() {
  const M = makeScratchMaterials();
  const root = new THREE.Group();
  root.name = 'su34_fromZero_p25_p33_ductsBellyServoBlocks';

  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    loftZ(root, `p25_${side}_InletDucting_smoothEDFOption`, M.foamBlue, [
      { x: sx * 1.52, z: 0.62, y: 1.40, w: 0.42, h: 0.28, xPow: 0.42, yPow: 0.42, top: 0.85, bottom: 0.85 },
      { x: sx * 1.48, z: 1.82, y: 1.44, w: 0.54, h: 0.34, xPow: 0.56, yPow: 0.52, top: 0.92, bottom: 0.82 },
      { x: sx * 1.40, z: 3.44, y: 1.50, w: 0.46, h: 0.30, xPow: 0.66, yPow: 0.60, top: 0.90, bottom: 0.78 },
    ], 28);
    tagGuide(root.getObjectByName(`p25_${side}_InletDucting_smoothEDFOption`), 25, 'Inlet ducting', 'smooth airflow ducting visual shape');
    guideBox(root, 26, `p26_${side}_TrimAwayHoldingTab`, M.ply, [0.72, 0.08, 0.42], [sx * 1.50, 1.15, 5.94]);
    cyl(root, `p27_${side}_ThrustTube`, M.ghost, 0.34, 3.35, 'z', [sx * 1.28, 1.42, 5.72], [0, 0, 0], 32);
    tagGuide(root.getObjectByName(`p27_${side}_ThrustTube`), 27, 'Thrust tubes', 'transparent visual thrust tube, non-functional');
    guideBox(root, 27, `p27_${side}_ExhaustBulkhead_squareFrame`, M.ply, [1.02, 0.92, 0.14], [sx * 1.30, 1.46, 7.54]);
    torus(root, `p27_${side}_ExhaustBulkheadRoundFace`, M.plyDark, 0.34, 0.028, [sx * 1.30, 1.46, 7.46], [0, 0, 0], 36);
    tagGuide(root.getObjectByName(`p27_${side}_ExhaustBulkheadRoundFace`), 27, 'Exhaust bulkheads', 'round opening marked from exhaust bulkhead');
    for (let i = 0; i < 3; i++) {
      guideBox(root, 28, `p28_${side}_NacelleRearCornerReinforcer_${String.fromCharCode(65 + i)}`, M.ply, [0.10, 0.12, 2.72], [sx * (1.12 + i * 0.18), 1.86 + i * 0.08, 6.10], [0.02, 0, 0]);
    }
    guideBox(root, 28, `p28_${side}_NacelleBellyPanel`, M.ply, [0.92, 0.10, 5.26], [sx * 1.58, 1.08, 4.32], [0.02, -sx * 0.04, 0]);
    guideBox(root, 29, `p29_${side}_IntakeProtectorForward`, M.plyDark, [0.68, 0.09, 0.34], [sx * 1.60, 2.10, 0.18]);
    guideBox(root, 29, `p29_${side}_IntakeProtectorAft`, M.plyDark, [0.62, 0.09, 0.34], [sx * 1.72, 2.06, 2.10]);
    guideBox(root, 30, `p30_${side}_FuselageServoBlock_laminated`, M.ply, [0.24, 0.30, 4.86], [sx * 0.88, 1.62, 4.62], [0.035, 0, sx * 0.02]);
    for (let i = 0; i < 5; i++) {
      guideBox(root, 30, `p30_${side}_ServoBlockLaminateLine_${i}`, M.plyDark, [0.035, 0.33, 4.64], [sx * (0.78 + i * 0.045), 1.66, 4.58], [0.035, 0, sx * 0.02]);
    }
    guideBox(root, 32, `p32_${side}_Servo`, M.blue, [0.30, 0.20, 0.42], [sx * 2.28, 1.86, 3.34]);
    guideTube(root, 32, `p32_${side}_ServoWire_red`, M.red, [[sx * 2.26, 1.98, 3.26], [sx * 1.92, 2.22, 2.34], [sx * 1.32, 2.28, 1.34]], 0.010, 10);
    guideTube(root, 32, `p32_${side}_ServoWire_black`, M.ink, [[sx * 2.18, 1.98, 3.30], [sx * 1.86, 2.16, 2.42], [sx * 1.28, 2.24, 1.40]], 0.010, 10);
    guideTube(root, 33, `p33_${side}_HorizontalStabiliserCarbonSpar`, M.carbon, [[sx * 1.18, 2.16, 7.10], [sx * 4.18, 2.14, 7.86]], 0.030, 8);
    cyl(root, `p33_${side}_AluminiumTubeSleeve`, M.metal, 0.080, 0.30, 'x', [sx * 1.40, 2.16, 7.16], [0, 0, 0], 18);
    tagGuide(root.getObjectByName(`p33_${side}_AluminiumTubeSleeve`), 33, 'Aluminium tube sleeve', 'horizontal stabiliser spar sleeve');
  }

  guideTube(root, 25, 'p25_ESCBatteryCableBundle_blue', M.blue, [[0.18, 1.34, 0.10], [0.30, 1.30, 2.80], [0.16, 1.26, 6.30]], 0.012, 14);
  guideTube(root, 25, 'p25_ESCBatteryCableBundle_red', M.red, [[0.06, 1.32, 0.10], [0.18, 1.28, 2.80], [0.08, 1.24, 6.30]], 0.010, 14);
  guideBox(root, 25, 'p25_ESCMounting_visual', M.blueDark, [0.42, 0.12, 0.62], [0.42, 1.22, 2.32]);
  guideBox(root, 29, 'p29_leftTailExtensionReinforcer', M.ply, [0.48, 0.16, 1.12], [-0.34, 1.92, 8.20], [0.02, 0, 0]);
  guideBox(root, 29, 'p29_rightTailExtensionReinforcer', M.ply, [0.48, 0.16, 1.12], [0.34, 1.92, 8.20], [0.02, 0, 0]);
  guideBox(root, 30, 'p30_RearFuselageBellyLower', M.ply, [0.72, 0.10, 7.10], [0, 1.18, 5.72], [0.02, 0, 0]);
  guideBox(root, 30, 'p30_RearFuselageBellyUpper', M.ply, [0.54, 0.10, 5.18], [0, 2.12, 5.90], [0.02, 0, 0]);
  for (const sx of [-1, 1]) {
    guideTube(root, 33, `p33_${sx < 0 ? 'left' : 'right'}_UpperCurvedFuselageFormer`, M.ply, [
      [sx * 0.62, 2.16, -0.42],
      [sx * 0.76, 2.38, 2.20],
      [sx * 0.70, 2.46, 6.86],
    ], 0.045, 18);
  }

  Object.assign(root.userData, {
    viewerSpin: -0.90,
    viewerDistMult: 1.10,
    source: 'Jetworks Su-34 Construction Guide 2020-11-29',
    pages: [25, 26, 27, 28, 29, 30, 31, 32, 33],
    completedGuideParts: [
      'Inlet ducting',
      'Trim-away tabs',
      'Thrust tubes',
      'Exhaust bulkheads',
      'Nacelle Rear Corner Reinforcers A/B/C',
      'Nacelle Belly Panels',
      'Lite-ply Intake protectors',
      'Tail extension reinforcers',
      'Rear Fuselage belly Lower/Upper',
      'Fuselage servo blocks',
      'Servo wires/servos',
      'Horizontal stabiliser spars',
      'Upper curved Fuselage former pieces',
    ],
  });
  return root;
}

function buildSu34ScratchUpperTailExhaustModule() {
  const M = makeScratchMaterials();
  const root = new THREE.Group();
  root.name = 'su34_fromZero_p34_p40_upperTailExhaust';

  const wiring = new THREE.Group();
  wiring.name = 'p34_p35_servoCableTunnels';
  root.add(wiring);
  guideBox(wiring, 34, 'p34_CarbonSparTopCableTunnel', M.ink, [0.18, 0.055, 6.70], [0, 2.54, 2.45], [0.018, 0, 0]);
  guideBox(wiring, 35, 'p35_ESCPowerCableTunnelUnderServoTray', M.carbon, [0.22, 0.060, 6.20], [0, 1.84, 2.62], [0.014, 0, 0]);
  guideBox(wiring, 34, 'p34_RXBatteryConnector', M.ply, [0.28, 0.22, 0.34], [-0.22, 2.42, -1.24], [0.02, 0, 0]);
  guideBox(wiring, 34, 'p34_ServoTrayCableComb', M.plyDark, [0.70, 0.12, 0.20], [0, 2.40, 0.05], [0.02, 0, 0]);
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    guideTube(wiring, 34, `p34_${side}_ElevatorServoWire`, M.blueDark, [
      [sx * 2.23, 2.00, 3.22], [sx * 1.40, 2.32, 2.08], [sx * 0.28, 2.55, 0.22], [0.00, 2.53, -1.54],
    ], 0.010, 18);
    guideTube(wiring, 34, `p34_${side}_AileronServoWire`, M.green ?? M.blue, [
      [sx * 3.02, 2.02, 0.62], [sx * 2.18, 2.26, 0.32], [sx * 0.44, 2.55, 0.08], [0.00, 2.53, -1.48],
    ], 0.010, 18);
    guideTube(wiring, 34, `p34_${side}_CanardServoWire`, M.red, [
      [sx * 2.42, 2.24, -4.74], [sx * 1.32, 2.46, -3.24], [sx * 0.30, 2.55, -1.68], [0.00, 2.53, -1.34],
    ], 0.010, 18);
    guideTube(wiring, 35, `p35_${side}_ESCServoWire`, M.red, [
      [sx * 1.48, 1.56, 6.42], [sx * 0.90, 1.72, 4.08], [sx * 0.22, 1.86, 1.10], [0.00, 1.86, -1.44],
    ], 0.013, 18);
    cyl(wiring, `p34_${side}_WireExitHole_elevator`, M.ink, 0.045, 0.018, 'y', [sx * 2.18, 2.08, 3.18], [0, 0, 0], 14);
    tagGuide(wiring.getObjectByName(`p34_${side}_WireExitHole_elevator`), 34, 'elevator servo wire exit', 'servo cable tunnel exit');
    cyl(wiring, `p34_${side}_WireExitHole_aileron`, M.ink, 0.040, 0.018, 'y', [sx * 3.00, 2.08, 0.62], [0, 0, 0], 14);
    tagGuide(wiring.getObjectByName(`p34_${side}_WireExitHole_aileron`), 34, 'aileron servo wire exit', 'servo cable tunnel exit');
  }
  tagGuide(wiring, 34, 'Servo cable tunnels', 'pages 34-35 cable routing over carbon spar and under servo tray');

  const turtle = new THREE.Group();
  turtle.name = 'p36_turtledeckThreeLayerAccessHatch';
  root.add(turtle);
  const turtleRows = [
    { z: -3.20, y: 2.60, w: 0.84, crown: 0.08, edgeDrop: 0.10, edgePow: 1.45 },
    { z: -1.28, y: 2.67, w: 0.94, crown: 0.12, edgeDrop: 0.11, edgePow: 1.55 },
    { z: 1.08, y: 2.68, w: 0.82, crown: 0.12, edgeDrop: 0.10, edgePow: 1.60 },
    { z: 3.92, y: 2.59, w: 0.56, crown: 0.08, edgeDrop: 0.07, edgePow: 1.70 },
    { z: 6.72, y: 2.46, w: 0.34, crown: 0.04, edgeDrop: 0.04, edgePow: 1.80 },
  ];
  tagGuide(ribbonSurface(turtle, 'p36_TurtledeckInner', M.ply, turtleRows.map((r) => ({ ...r, w: r.w * 0.74, y: r.y + 0.02 })), 14), 36, 'Turtledeck (Inner)', 'glued to assembly first');
  tagGuide(ribbonSurface(turtle, 'p36_TurtledeckOuter', M.plyDark, turtleRows, 14), 36, 'Turtledeck (Outer)', 'outer turtledeck sheet');
  tagGuide(ribbonSurface(turtle, 'p36_TurtledeckMiddle', M.ply, turtleRows.map((r) => ({ ...r, w: r.w * 0.60, y: r.y + 0.12 })), 12), 36, 'Turtledeck (Middle)', 'middle turtledeck sheet with RX access hatch');
  guideBox(turtle, 36, 'p36_RXAccessHatchOpening', M.intake, [0.54, 0.035, 0.92], [0, 2.83, -0.74], [0.03, 0, 0]);
  guideBox(turtle, 36, 'p36_RXAccessHatchLid', M.ghost, [0.48, 0.030, 0.76], [0, 2.87, -0.72], [0.03, 0, 0]);
  for (const x of [-0.52, -0.28, 0, 0.28, 0.52]) {
    guideTube(turtle, 36, `p36_TurtledeckSandingLine_${Math.round((x + 0.6) * 100)}`, M.ink, [
      [x * 0.90, 2.78, -3.00],
      [x * 0.82, 2.90, -0.60],
      [x * 0.56, 2.74, 5.92],
    ], 0.006, 12);
  }

  const upper = new THREE.Group();
  upper.name = 'p37_p38_upperNacellesAndFuselage';
  root.add(upper);
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    const layerData = [
      { n: 1, w: 0.42, y: 2.12, z0: 2.70, z1: 7.60, crown: 0.08, mat: M.plyDark },
      { n: 2, w: 0.55, y: 2.20, z0: 2.92, z1: 7.82, crown: 0.12, mat: M.ply },
      { n: 3, w: 0.48, y: 2.30, z0: 3.18, z1: 7.64, crown: 0.16, mat: M.plyDark },
      { n: 4, w: 0.34, y: 2.45, z0: 3.52, z1: 7.24, crown: 0.18, mat: M.ply },
    ];
    for (const layer of layerData) {
      const rows = [
        { x: sx * 1.36, z: layer.z0, y: layer.y, w: layer.w, crown: layer.crown * 0.45, edgeDrop: 0.10, edgePow: 1.55 },
        { x: sx * 1.42, z: (layer.z0 + layer.z1) * 0.50, y: layer.y + 0.05, w: layer.w + 0.12, crown: layer.crown, edgeDrop: 0.09, edgePow: 1.70 },
        { x: sx * 1.32, z: layer.z1, y: layer.y - 0.03, w: layer.w * 0.76, crown: layer.crown * 0.55, edgeDrop: 0.08, edgePow: 1.75 },
      ];
      tagGuide(ribbonSurface(upper, `p37_${side}_UpperNacelle_${layer.n}`, layer.mat, rows, 12), 37, `Upper nacelle #${layer.n}`, 'laminated upper nacelle layer');
    }
    tagGuide(loftZ(upper, `p37_${side}_UpperNacelleSandedFairing`, M.ghost, [
      { x: sx * 1.36, z: 2.82, y: 2.20, w: 0.42, h: 0.14, xPow: 0.62, yPow: 0.72, top: 0.90, bottom: 0.48 },
      { x: sx * 1.44, z: 4.72, y: 2.36, w: 0.62, h: 0.30, xPow: 0.70, yPow: 0.72, top: 1.26, bottom: 0.42 },
      { x: sx * 1.35, z: 7.86, y: 2.24, w: 0.44, h: 0.18, xPow: 0.84, yPow: 0.80, top: 0.92, bottom: 0.40 },
    ], 34), 37, 'Upper nacelle sanded shape', 'upper nacelles glued together and sanded smooth');
    guideFlatPanel(upper, 38, `p38_${side}_UpperFuselagePanel`, M.ply, [
      [sx * 0.24, 2.36, -2.88],
      [sx * 1.24, 2.34, -1.64],
      [sx * 2.04, 2.23, 4.58],
      [sx * 1.72, 2.15, 6.80],
      [sx * 0.42, 2.42, 5.84],
      [sx * 0.34, 2.52, -1.82],
    ]);
    guideTube(upper, 38, `p38_${side}_UpperFuselagePanelEdge`, M.ink, [
      [sx * 0.34, 2.55, -2.70],
      [sx * 0.42, 2.56, 0.40],
      [sx * 0.46, 2.46, 5.70],
      [sx * 1.60, 2.16, 6.70],
    ], 0.008, 14);
  }
  guideBox(upper, 38, 'p38_CentralUpperFuselageSpineCap', M.depronEdge, [0.36, 0.18, 6.85], [0, 2.46, 3.02], [0.02, 0, 0]);
  guideBox(upper, 38, 'p38_ExhaustJigSidePlate', M.jig, [0.12, 0.74, 1.58], [0, 0.92, 8.48], [0.00, 0, 0]);
  guideBox(upper, 38, 'p38_ExhaustJigBase', M.jig, [0.42, 0.12, 1.54], [0, 0.58, 8.48]);
  for (const sx of [-1, 1]) {
    cyl(upper, `p38_ExhaustJigFace_${sx}`, M.jig, 0.34, 0.045, 'z', [sx * 0.28, 0.92, 7.72], [0, 0, 0], 28);
    tagGuide(upper.getObjectByName(`p38_ExhaustJigFace_${sx}`), 38, 'Exhaust jig face', 'reference jig, not aircraft hardware');
  }

  const exhaust = new THREE.Group();
  exhaust.name = 'p39_exhausts';
  root.add(exhaust);
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    tagGuide(frustumZ(exhaust, `p39_${side}_ExhaustTaperedSleeve`, M.heat, 0.42, 0.34, 0.94, [sx * 1.28, 1.47, 8.14], [1.06, 0.88], 44), 39, 'Exhausts', 'tapered exhaust sleeve glued to fuselage');
    tagGuide(frustumZ(exhaust, `p39_${side}_Exhaust3DPrintedRibbedOption`, M.foamBlue, 0.39, 0.36, 0.76, [sx * 1.28, 1.47, 8.62], [1.06, 0.88], 40), 39, '3D printed exhaust option', 'optional ribbed exhaust visual');
    cyl(exhaust, `p39_${side}_ExhaustDarkHollowCore`, M.intake, 0.285, 0.98, 'z', [sx * 1.28, 1.47, 8.62], [0, 0, 0], 36);
    tagGuide(exhaust.getObjectByName(`p39_${side}_ExhaustDarkHollowCore`), 39, 'Exhaust hollow core', 'dark visual-only interior');
    torus(exhaust, `p39_${side}_ExhaustFrontRing`, M.darkMetal, 0.40, 0.030, [sx * 1.28, 1.47, 7.66], [0, 0, 0], 42);
    tagGuide(exhaust.getObjectByName(`p39_${side}_ExhaustFrontRing`), 39, 'Exhaust front ring', 'jig-trimmed ring');
    torus(exhaust, `p39_${side}_ExhaustRearRing`, M.darkMetal, 0.34, 0.028, [sx * 1.28, 1.47, 9.04], [0, 0, 0], 42);
    tagGuide(exhaust.getObjectByName(`p39_${side}_ExhaustRearRing`), 39, 'Exhaust rear ring', 'finished tapered ring');
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const r = 0.35;
      const x = sx * 1.28 + Math.cos(a) * r * 1.06;
      const y = 1.47 + Math.sin(a) * r * 0.88;
      guideTube(exhaust, 39, `p39_${side}_ExhaustRib_${i}`, M.ink, [[x, y, 7.76], [x, y, 8.98]], 0.006, 2);
    }
  }

  const tails = new THREE.Group();
  tails.name = 'p40_verticalAndHorizontalStabilisers';
  root.add(tails);
  const tailProfile = [
    [2.16, 5.08],
    [2.50, 8.72],
    [5.32, 7.84],
    [4.92, 6.06],
  ];
  const leftFin = verticalPlate(tails, 'p40_leftVerticalStabiliser', M.ply, -1, -2.18, tailProfile, 0.18, 0.13);
  const rightFin = verticalPlate(tails, 'p40_rightVerticalStabiliser', M.ply, 1, 2.18, tailProfile, 0.18, -0.13);
  tagGuide(leftFin, 40, 'Vertical Stabiliser', 'left vertical stabiliser glued to fuselage');
  tagGuide(rightFin, 40, 'Vertical Stabiliser', 'right vertical stabiliser glued to fuselage');
  for (const [fin, sx, side] of [[leftFin, -1, 'left'], [rightFin, 1, 'right']]) {
    guideBox(tails, 40, `p40_${side}_VerticalStabiliserRootDoubler`, M.plyDark, [0.34, 0.20, 1.35], [sx * 2.13, 2.28, 5.82], [0.0, 0, -sx * 0.08]);
    guideTube(tails, 40, `p40_${side}_VerticalStabiliserControlHornSlot`, M.ink, [
      [sx * 2.20, 3.02, 5.78],
      [sx * 2.18, 4.42, 6.90],
    ], 0.014, 4);
    guideFlatPanel(tails, 40, `p40_${side}_VerticalStabiliserGreyCap`, M.grey, [
      [sx * 2.05, 5.12, 7.60],
      [sx * 2.18, 5.28, 7.82],
      [sx * 2.28, 5.04, 8.20],
      [sx * 2.18, 4.86, 8.02],
    ]);
    fin.userData.side = side;
  }
  const stabCfg = {
    stations: [
      { lead: [1.06, 6.22], trail: [0.92, 8.92], y: 2.08, thicknessMul: 1.00, camberMul: 1.00 },
      { lead: [2.36, 6.78], trail: [2.12, 9.28], y: 2.04, thicknessMul: 0.84, camberMul: 0.88 },
      { lead: [4.62, 7.58], trail: [3.62, 9.76], y: 1.98, thicknessMul: 0.62, camberMul: 0.68 },
    ],
    y: 2.04,
    thickness: 0.13,
    camber: 0.035,
    chordSegments: 7,
  };
  const leftStab = curvedWingPlanform(tails, 'p40_leftHorizontalStabiliser', M.ply, -1, stabCfg);
  const rightStab = curvedWingPlanform(tails, 'p40_rightHorizontalStabiliser', M.ply, 1, stabCfg);
  tagGuide(leftStab, 40, 'Horizontal Stabiliser', 'left horizontal stabiliser epoxied to carbon elevator spar');
  tagGuide(rightStab, 40, 'Horizontal Stabiliser', 'right horizontal stabiliser epoxied to carbon elevator spar');
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    guideBox(tails, 40, `p40_${side}_HorizontalStabiliserControlHorn`, M.plyDark, [0.08, 0.26, 0.16], [sx * 1.74, 2.17, 7.10], [0.04, 0, sx * 0.10]);
    guideTube(tails, 40, `p40_${side}_HorizontalStabiliserPushrod`, M.ink, [
      [sx * 0.94, 2.06, 6.96],
      [sx * 1.76, 2.18, 7.12],
      [sx * 2.70, 2.08, 7.70],
    ], 0.010, 8);
  }

  Object.assign(root.userData, {
    viewerSpin: -0.88,
    viewerDistMult: 1.10,
    source: 'Jetworks Su-34 Construction Guide 2020-11-29',
    pages: [34, 35, 36, 37, 38, 39, 40],
    completedGuideParts: [
      'Servo cable tunnels',
      'ESC power cable tunnel',
      'Turtledeck inner/middle/outer',
      'RX access hatch',
      'Upper nacelles #1-#4',
      'Upper fuselage panels',
      'Exhaust jig',
      'Exhausts',
      'Vertical stabilisers',
      'Horizontal stabilisers',
      'Lite-ply control horns',
    ],
  });
  return root;
}

function buildSu34ScratchFinishPhotoModule() {
  const M = makeScratchMaterials();
  const root = new THREE.Group();
  root.name = 'su34_fromZero_p41_p42_finishPhotoShaping';

  const finishSkin = new THREE.Group();
  finishSkin.name = 'p41_completedExteriorSkin';
  root.add(finishSkin);

  tagGuide(loftZ(finishSkin, 'p41_CompletedDuckbillRadomeFinish', M.radome, [
    { z: -12.50, y: 1.76, w: 0.06, h: 0.030, xPow: 0.44, yPow: 0.60, top: 0.58, bottom: 0.64 },
    { z: -11.66, y: 1.80, w: 0.64, h: 0.16, xPow: 0.38, yPow: 0.62, top: 0.64, bottom: 0.98, chine: 0.05 },
    { z: -10.44, y: 1.90, w: 1.18, h: 0.31, xPow: 0.38, yPow: 0.66, top: 0.72, bottom: 1.08, chine: 0.11 },
    { z: -9.26, y: 2.02, w: 1.58, h: 0.42, xPow: 0.46, yPow: 0.76, top: 0.82, bottom: 1.06, chine: 0.16 },
    { z: -8.46, y: 2.12, w: 1.60, h: 0.44, xPow: 0.58, yPow: 0.82, top: 0.84, bottom: 0.98, chine: 0.12 },
  ], 56), 41, 'completed nose finish', 'model complete before paint');
  tagGuide(loftZ(finishSkin, 'p41_CompletedForwardFuselageSkin', M.blue, [
    { z: -8.60, y: 2.10, w: 1.60, h: 0.42, xPow: 0.60, yPow: 0.78, top: 0.86, bottom: 1.02, chine: 0.10 },
    { z: -7.20, y: 2.35, w: 1.46, h: 0.50, xPow: 0.72, yPow: 0.78, top: 1.12, bottom: 0.72, chine: 0.04 },
    { z: -5.10, y: 2.44, w: 1.32, h: 0.44, xPow: 0.84, yPow: 0.82, top: 1.04, bottom: 0.66 },
    { z: -2.80, y: 2.36, w: 1.08, h: 0.34, xPow: 0.88, yPow: 0.88, top: 0.92, bottom: 0.60 },
  ], 52), 41, 'completed forward fuselage finish', 'smooth forward fuselage after sanding');
  tagGuide(ribbonSurface(finishSkin, 'p41_CompletedDorsalSpineSkin', M.blue, [
    { z: -3.02, y: 2.72, w: 0.86, crown: 0.13, edgeDrop: 0.11, edgePow: 1.45 },
    { z: -0.40, y: 2.78, w: 0.92, crown: 0.16, edgeDrop: 0.12, edgePow: 1.55 },
    { z: 2.90, y: 2.70, w: 0.74, crown: 0.12, edgeDrop: 0.10, edgePow: 1.65 },
    { z: 6.40, y: 2.52, w: 0.40, crown: 0.07, edgeDrop: 0.06, edgePow: 1.80 },
    { z: 9.36, y: 2.26, w: 0.18, crown: 0.03, edgeDrop: 0.04, edgePow: 1.90 },
  ], 18), 41, 'completed dorsal fuselage finish', 'paint-ready completed spine');
  guideFlatPanel(finishSkin, 42, 'p42_CockpitBlackAntiGlarePanel', M.intake, [
    [-0.86, 2.62, -8.22], [0.86, 2.62, -8.22], [0.78, 2.86, -5.02], [-0.78, 2.86, -5.02],
  ]);
  guideBox(finishSkin, 42, 'p42_WideSmokeCanopyOverlay', M.glass, [1.42, 0.040, 2.78], [0, 3.16, -6.50], [0.05, 0, 0]);

  const wingCfg = {
    stations: [
      { lead: [0.68, -3.88], trail: [0.90, 4.72], y: 2.115, thicknessMul: 1.10, camberMul: 1.04 },
      { lead: [1.52, -3.42], trail: [1.62, 4.70], y: 2.110, thicknessMul: 1.06, camberMul: 1.02 },
      { lead: [2.82, -2.64], trail: [2.94, 4.50], y: 2.090, thicknessMul: 0.98, camberMul: 0.96 },
      { lead: [4.12, -1.78], trail: [4.18, 4.18], y: 2.050, thicknessMul: 0.84, camberMul: 0.82 },
      { lead: [5.36, -0.82], trail: [5.24, 3.82], y: 1.995, thicknessMul: 0.68, camberMul: 0.68 },
      { lead: [6.30, -0.20], trail: [6.10, 3.40], y: 1.940, thicknessMul: 0.56, camberMul: 0.56 },
      { lead: [6.88, 0.10], trail: [6.62, 3.16], y: 1.910, thicknessMul: 0.48, camberMul: 0.50 },
    ],
    y: 2.08,
    thickness: 0.11,
    camber: 0.045,
    chordSegments: 12,
  };
  const leftFinishedWing = curvedWingPlanform(finishSkin, 'p41_leftCompletedWingSkin', M.paleBlue, -1, wingCfg);
  const rightFinishedWing = curvedWingPlanform(finishSkin, 'p41_rightCompletedWingSkin', M.paleBlue, 1, wingCfg);
  tagGuide(leftFinishedWing, 41, 'completed wing finish', 'paint-ready wing surface');
  tagGuide(rightFinishedWing, 41, 'completed wing finish', 'paint-ready wing surface');

  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    curvedWingPlanform(finishSkin, `p41_${side}_CompletedWingStrakeSkin`, M.blue, sx, {
      stations: [
        { lead: [0.70, -4.62], trail: [0.88, -1.08], y: 2.28, thicknessMul: 1.00, camberMul: 1.00 },
        { lead: [1.70, -3.92], trail: [1.94, -0.96], y: 2.22, thicknessMul: 0.90, camberMul: 0.90 },
        { lead: [2.94, -3.06], trail: [3.12, -0.72], y: 2.15, thicknessMul: 0.75, camberMul: 0.76 },
        { lead: [4.12, -2.20], trail: [4.28, -0.42], y: 2.05, thicknessMul: 0.58, camberMul: 0.60 },
      ],
      y: 2.18,
      thickness: 0.07,
      camber: 0.026,
      chordSegments: 5,
    });
    tagGuide(finishSkin.getObjectByName(`p41_${side}_CompletedWingStrakeSkin`), 41, 'completed wing strake finish', 'paint-ready LERX/strake');
    curvedWingPlanform(finishSkin, `p41_${side}_CompletedCanardSkin`, M.blue, sx, {
      stations: [
        { lead: [1.02, -5.96], trail: [1.08, -4.26], y: 2.48, thicknessMul: 0.92, camberMul: 0.90 },
        { lead: [2.22, -5.48], trail: [2.16, -3.92], y: 2.50, thicknessMul: 0.78, camberMul: 0.80 },
        { lead: [3.60, -4.92], trail: [3.32, -3.44], y: 2.48, thicknessMul: 0.55, camberMul: 0.58 },
      ],
      y: 2.48,
      thickness: 0.065,
      camber: 0.020,
      chordSegments: 5,
    });
    tagGuide(finishSkin.getObjectByName(`p41_${side}_CompletedCanardSkin`), 41, 'completed canard finish', 'paint-ready canard');
    tagGuide(loftZ(finishSkin, `p41_${side}_CompletedUpperNacellePaintSkin`, M.grey, [
      { x: sx * 1.36, z: 2.78, y: 2.27, w: 0.40, h: 0.12, xPow: 0.62, yPow: 0.72, top: 0.86, bottom: 0.42 },
      { x: sx * 1.44, z: 4.74, y: 2.46, w: 0.62, h: 0.28, xPow: 0.70, yPow: 0.74, top: 1.18, bottom: 0.40 },
      { x: sx * 1.34, z: 7.88, y: 2.31, w: 0.42, h: 0.16, xPow: 0.84, yPow: 0.80, top: 0.86, bottom: 0.38 },
    ], 36), 41, 'completed upper nacelle finish', 'paint-ready upper nacelle');
    guideFlatPanel(finishSkin, 42, `p42_${side}_DarkBlueCamoPatchWingRoot`, M.blueDark, [
      [sx * 0.70, 2.18, -1.40], [sx * 2.10, 2.13, -1.04], [sx * 2.86, 2.06, 3.80], [sx * 1.24, 2.12, 4.44],
    ]);
    guideFlatPanel(finishSkin, 42, `p42_${side}_PaleCamoPatchOuterWing`, M.blue, [
      [sx * 3.36, 2.14, -1.88], [sx * 5.62, 2.02, -0.62], [sx * 6.34, 1.96, 2.80], [sx * 4.08, 2.06, 3.88],
    ]);
    star(finishSkin, M, `p42_${side}_WingRedStar`, [sx * 5.08, 2.225, 2.60], 0.34, [-PI / 2, 0, 0]);
    tagGuide(finishSkin.getObjectByName(`p42_${side}_WingRedStar`), 42, 'photo reference marking', 'red star from public photo reference');
  }

  const tailProfile = [[2.20, 5.06], [2.50, 8.72], [5.32, 7.84], [4.92, 6.06]];
  const leftPaintFin = verticalPlate(finishSkin, 'p41_leftCompletedVerticalStabiliserSkin', M.blue, -1, -2.20, tailProfile, 0.11, 0.13);
  const rightPaintFin = verticalPlate(finishSkin, 'p41_rightCompletedVerticalStabiliserSkin', M.blue, 1, 2.20, tailProfile, 0.11, -0.13);
  tagGuide(leftPaintFin, 41, 'completed vertical stabiliser finish', 'paint-ready vertical stabiliser');
  tagGuide(rightPaintFin, 41, 'completed vertical stabiliser finish', 'paint-ready vertical stabiliser');
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    guideFlatPanel(finishSkin, 42, `p42_${side}_TailPaleCamoPatch`, M.paleBlue, [
      [sx * 2.13, 3.30, 5.86],
      [sx * 2.16, 4.96, 7.38],
      [sx * 2.24, 5.14, 7.88],
      [sx * 2.23, 3.62, 6.60],
    ]);
    star(finishSkin, M, `p42_${side}_TailRedStar`, [sx * 2.30, 4.34, 7.18], 0.26, [0, sx * PI / 2, 0]);
    tagGuide(finishSkin.getObjectByName(`p42_${side}_TailRedStar`), 42, 'photo reference marking', 'red star from public photo reference');
  }
  const stabCfg = {
    stations: [
      { lead: [1.06, 6.22], trail: [0.92, 8.92], y: 2.13, thicknessMul: 0.90, camberMul: 0.88 },
      { lead: [2.36, 6.78], trail: [2.12, 9.28], y: 2.08, thicknessMul: 0.74, camberMul: 0.76 },
      { lead: [4.62, 7.58], trail: [3.62, 9.76], y: 2.02, thicknessMul: 0.54, camberMul: 0.56 },
    ],
    y: 2.09,
    thickness: 0.07,
    camber: 0.022,
    chordSegments: 6,
  };
  tagGuide(curvedWingPlanform(finishSkin, 'p41_leftCompletedHorizontalStabiliserSkin', M.blueDark, -1, stabCfg), 41, 'completed horizontal stabiliser finish', 'paint-ready stabiliser');
  tagGuide(curvedWingPlanform(finishSkin, 'p41_rightCompletedHorizontalStabiliserSkin', M.blueDark, 1, stabCfg), 41, 'completed horizontal stabiliser finish', 'paint-ready stabiliser');

  const detail = new THREE.Group();
  detail.name = 'p42_photoShapingPanelLines';
  root.add(detail);
  const formerLines = [-8.46, -7.50, -6.24, -4.92, -3.10, -1.00, 1.40, 3.84, 6.24, 8.20];
  for (const z of formerLines) {
    torus(detail, `p42_FuselageFormerPaintLine_${z}`, M.seam, 0.72, 0.006, [0, 2.50, z], [0, 0, 0], 64).scale.set(1.34, 0.50, 1);
    tagGuide(detail.getObjectByName(`p42_FuselageFormerPaintLine_${z}`), 42, 'photo shaping panel/former line', 'visible panel/former line pass');
  }
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    guideTube(detail, 42, `p42_${side}_WingLeadingPanelLine`, M.seam, [
      [sx * 0.82, 2.24, -3.58],
      [sx * 2.70, 2.16, -2.46],
      [sx * 5.08, 2.02, -0.72],
      [sx * 6.66, 1.94, 0.12],
    ], 0.007, 16);
    guideTube(detail, 42, `p42_${side}_WingTrailingPanelLine`, M.seam, [
      [sx * 0.92, 2.20, 4.46],
      [sx * 3.42, 2.12, 4.20],
      [sx * 6.42, 1.94, 3.24],
    ], 0.007, 16);
    for (let i = 0; i < 6; i++) {
      const span = 1.55 + i * 0.84;
      guideTube(detail, 42, `p42_${side}_WingRibPaintLine_${i}`, M.seam, [
        [sx * span, 2.18 - i * 0.030, -3.08 + i * 0.42],
        [sx * (span + 0.18), 2.13 - i * 0.030, 4.32 - i * 0.18],
      ], 0.0055, 3);
    }
    guideBox(detail, 42, `p42_${side}_ForwardSideSensorDisc`, M.grey, [0.18, 0.035, 0.18], [sx * 1.06, 2.54, -6.18], [0.02, 0, 0]);
    guideBox(detail, 42, `p42_${side}_SmallGreyAccessPanel`, M.greyDark, [0.32, 0.026, 0.34], [sx * 1.08, 2.35, -7.38], [0.04, 0, 0]);
  }

  Object.assign(root.userData, {
    viewerSpin: -0.90,
    viewerDistMult: 1.12,
    source: 'Jetworks Su-34 Construction Guide 2020-11-29',
    pages: [41, 42],
    completedGuideParts: [
      'Completed model finish skin',
      'Paint/photo shaping pass',
      'Radome and canopy finish',
      'Upper camouflage panels',
      'Wing and tail markings',
      'Panel/former lines',
    ],
  });
  return root;
}

function buildSu34ScratchGeneralArrangementModule() {
  const M = makeScratchMaterials();
  const root = new THREE.Group();
  root.name = 'su34_generalArrangement_reference_1398_845_291';

  const noseZ = SU34_GUIDE_SCENE_NOSE_Z;
  const tailZ = SU34_GUIDE_SCENE_TAIL_Z;
  const halfSpan = SU34_GA_SCENE_HALF_SPAN;
  const groundY = SU34_GA_SCENE_GROUND_Y;
  const topY = SU34_GA_SCENE_TOP_Y;
  const wingY = 2.08;
  const wingRootZ = -3.86;
  const wingTipZ = 0.10;
  const wingTrailRootZ = 4.72;
  const wingTrailTipZ = 3.16;

  const reference = new THREE.Group();
  reference.name = 'ga_orthographicDatums';
  root.add(reference);

  gaTube(reference, 'ga_lengthDatum_1398mm', M.red, [[0, groundY, noseZ], [0, groundY, tailZ]], 0.020, 1, 'length 1398 mm');
  gaTube(reference, 'ga_spanDatum_845mm', M.red, [[-halfSpan, wingY + 0.18, wingTipZ], [halfSpan, wingY + 0.18, wingTipZ]], 0.020, 1, 'span 845 mm');
  gaTube(reference, 'ga_heightDatum_291mm', M.red, [[0.34, groundY, 7.84], [0.34, topY, 7.84]], 0.020, 1, 'height 291 mm');
  gaTube(reference, 'ga_centerline', M.ink, [[0, wingY + 0.05, noseZ], [0, wingY + 0.05, tailZ]], 0.010, 2, 'centerline from top and side view');

  gaPanel(reference, 'ga_topViewForwardDuckbillEnvelope', M.ghost, [
    [-0.10, 1.88, noseZ],
    [0.10, 1.88, noseZ],
    [1.62, 2.06, -9.20],
    [1.48, 2.16, -7.34],
    [0.76, 2.40, -4.80],
    [-0.76, 2.40, -4.80],
    [-1.48, 2.16, -7.34],
    [-1.62, 2.06, -9.20],
  ], 'wide Su-34 forward fuselage top-view envelope');
  gaPanel(reference, 'ga_leftWingPlanform_845span', M.ghost, [
    [-0.66, wingY, wingRootZ],
    [-2.70, wingY - 0.02, -2.72],
    [-5.34, wingY - 0.10, -0.86],
    [-halfSpan, wingY - 0.20, wingTipZ],
    [-6.62, wingY - 0.20, wingTrailTipZ],
    [-5.24, wingY - 0.09, 3.82],
    [-0.90, wingY, wingTrailRootZ],
  ], 'left wing planform scaled to GA span');
  gaPanel(reference, 'ga_rightWingPlanform_845span', M.ghost, [
    [0.66, wingY, wingRootZ],
    [2.70, wingY - 0.02, -2.72],
    [5.34, wingY - 0.10, -0.86],
    [halfSpan, wingY - 0.20, wingTipZ],
    [6.62, wingY - 0.20, wingTrailTipZ],
    [5.24, wingY - 0.09, 3.82],
    [0.90, wingY, wingTrailRootZ],
  ], 'right wing planform scaled to GA span');

  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    gaTube(reference, `ga_${side}_leadingEdge`, M.seam, [
      [sx * 0.66, wingY + 0.02, wingRootZ],
      [sx * 2.70, wingY, -2.72],
      [sx * 5.34, wingY - 0.10, -0.86],
      [sx * halfSpan, wingY - 0.18, wingTipZ],
    ], 0.012, 12, 'leading edge from top-view GA correction');
    gaTube(reference, `ga_${side}_trailingEdge`, M.seam, [
      [sx * 0.90, wingY, wingTrailRootZ],
      [sx * 3.00, wingY - 0.02, 4.50],
      [sx * 5.24, wingY - 0.10, 3.82],
      [sx * 6.62, wingY - 0.18, wingTrailTipZ],
    ], 0.012, 12, 'trailing edge from top-view GA correction');
    gaTube(reference, `ga_${side}_canardPlanform`, M.seam, [
      [sx * 1.02, 2.46, -5.96],
      [sx * 3.60, 2.48, -4.92],
      [sx * 3.32, 2.48, -3.44],
      [sx * 1.08, 2.46, -4.26],
      [sx * 1.02, 2.46, -5.96],
    ], 0.011, 5, 'canard public top-view location');
    gaTube(reference, `ga_${side}_verticalTailHeightLimit`, M.red, [
      [sx * 2.20, groundY, 7.84],
      [sx * 2.20, topY, 7.84],
    ], 0.012, 2, 'vertical tail must fit height datum');
  }

  gaTube(reference, 'ga_sideViewUpperSilhouette', M.blueDark, [
    [0, 1.82, noseZ],
    [0, 2.20, -8.80],
    [0, 3.36, -6.70],
    [0, 2.70, -1.20],
    [0, 2.52, 3.90],
    [0, 2.36, 7.20],
    [0, 2.16, tailZ],
  ], 0.014, 18, 'side-view upper fuselage curve');
  gaTube(reference, 'ga_sideViewLowerSilhouette', M.blueDark, [
    [0, 1.70, noseZ],
    [0, 1.28, -7.40],
    [0, 1.10, -1.00],
    [0, 0.94, 5.70],
    [0, 1.12, 9.50],
    [0, 1.70, tailZ],
  ], 0.014, 18, 'side-view lower fuselage/nacelle curve');
  gaTube(reference, 'ga_tailTopLimit_291height', M.red, [
    [-2.20, topY, 7.84],
    [2.20, topY, 7.84],
  ], 0.014, 1, 'top of vertical tails after 291/1398 height correction');

  const noseRing = torus(reference, 'ga_frontDuckbillCrossSection', M.red, 1, 0.010, [0, 2.02, -9.30], [0, 0, 0], 72);
  noseRing.scale.set(1.64, 0.42, 1);
  tagGeneralArrangement(noseRing, 'front duckbill cross-section', 'wide oval Su-34 nose, not conical');
  const midRing = torus(reference, 'ga_midFuselageCrossSection', M.seam, 1, 0.009, [0, 2.16, -1.20], [0, 0, 0], 72);
  midRing.scale.set(1.08, 0.62, 1);
  tagGeneralArrangement(midRing, 'mid fuselage cross-section', 'broad blended shoulder through wing roots');
  for (const sx of [-1, 1]) {
    const ring = torus(reference, sx < 0 ? 'ga_leftEngineTunnelDatum' : 'ga_rightEngineTunnelDatum', M.seam, 0.46, 0.010, [sx * 1.28, 1.47, 8.62], [0, 0, 0], 54);
    ring.scale.set(1.05, 0.88, 1);
    tagGeneralArrangement(ring, sx < 0 ? 'left engine tunnel datum' : 'right engine tunnel datum', 'twin nozzle position and scale');
  }

  Object.assign(root.userData, {
    viewerSpin: -0.78,
    viewerDistMult: 1.14,
    assetOnly: true,
    source: SU34_GENERAL_ARRANGEMENT.source,
    sourceUrl: SU34_GENERAL_ARRANGEMENT.sourceUrl,
    generalArrangement: SU34_GENERAL_ARRANGEMENT,
    sceneScale: {
      guideLengthUnits: SU34_GUIDE_SCENE_LENGTH,
      targetHalfSpanUnits: Number(SU34_GA_SCENE_HALF_SPAN.toFixed(3)),
      targetTopY: Number(SU34_GA_SCENE_TOP_Y.toFixed(3)),
    },
  });
  return root;
}

function buildSu34ScratchModel() {
  const root = new THREE.Group();
  root.name = 'su34_fromZero_stage05_p05_p42_assetOnly';
  const forward = buildSu34ScratchForwardModule();
  const wing = buildSu34ScratchWingModule();
  const rearNacelles = buildSu34ScratchRearNacelleModule();
  const ductsBelly = buildSu34ScratchDuctBellyModule();
  const upperTailExhaust = buildSu34ScratchUpperTailExhaustModule();
  const finishPhoto = buildSu34ScratchFinishPhotoModule();
  root.add(wing, forward, rearNacelles, ductsBelly, upperTailExhaust, finishPhoto);
  Object.assign(root.userData, {
    forward,
    wing,
    rearNacelles,
    ductsBelly,
    upperTailExhaust,
    finishPhoto,
    viewerSpin: -0.90,
    viewerDistMult: 1.20,
    source: 'Jetworks Su-34 Construction Guide 2020-11-29',
    sourceUrl: SU34_GUIDE_SOURCE_URL,
    generalArrangement: SU34_GENERAL_ARRANGEMENT,
    guideManifest: SU34_GUIDE_PAGE_MANIFEST,
    pages: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
    sceneScale: {
      guideLengthUnits: SU34_GUIDE_SCENE_LENGTH,
      targetHalfSpanUnits: Number(SU34_GA_SCENE_HALF_SPAN.toFixed(3)),
      targetTopY: Number(SU34_GA_SCENE_TOP_Y.toFixed(3)),
    },
    fidelityNotes: [
      'Main wing half-span corrected to the General Arrangement 845/1398 span/length ratio.',
      'Vertical stabiliser top corrected to the General Arrangement 291/1398 height/length ratio.',
      'Pages 1-4 are reference/material metadata; page-by-page geometry starts at page 5.',
    ],
    stage: 'from-zero guide rebuild, pages 5-42 complete as procedural modules plus GA proportion correction',
    assetOnly: true,
  });
  return root;
}

export function buildSu34GuideModel() {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 'su34Fullback_v6ModularGuide_assetOnly';
  const forward = buildSu34GuideForward(M);
  const wingAssembly = buildSu34GuideWingAssembly(M);
  const rearAndNacelles = buildSu34GuideRearAndNacelles(M);
  const tail = buildSu34GuideTail(M);
  const details = buildSu34GuideSurfaceDetails(M);
  const landingGear = buildSu34LandingGear();
  root.add(wingAssembly, forward, rearAndNacelles, tail, details, landingGear);
  Object.assign(root.userData, {
    forward,
    wingAssembly,
    rearAndNacelles,
    tail,
    details,
    landingGear,
    viewerSpin: -0.92,
    viewerDistMult: 1.12,
    guideSource: 'module-by-module Su-34 public exterior guide reconstruction',
    modules: ['forward', 'wingAssembly', 'rearAndNacelles', 'tail', 'details', 'landingGear'],
  });
  return root;
}

function withViewerSetup(root, spin, dist, sourceName) {
  Object.assign(root.userData, {
    viewerSpin: spin,
    viewerDistMult: dist,
    guideSource: sourceName,
    assetOnly: true,
  });
  return root;
}

export function buildSu34ForwardModule() {
  return buildSu34ScratchForwardModule();
}

export function buildSu34WingModule() {
  return buildSu34ScratchWingModule();
}

export function buildSu34RearModule() {
  return buildSu34ScratchRearNacelleModule();
}

export function buildSu34TailModule() {
  return buildSu34ScratchUpperTailExhaustModule();
}

export function buildSu34DuctBellyModule() {
  return buildSu34ScratchDuctBellyModule();
}

export function buildSu34UpperTailExhaustModule() {
  return buildSu34ScratchUpperTailExhaustModule();
}

export function buildSu34FinishPhotoModule() {
  return buildSu34ScratchFinishPhotoModule();
}

export function buildSu34GeneralArrangementModule() {
  return buildSu34ScratchGeneralArrangementModule();
}

export function buildSu34Model() {
  return buildSu34ScratchModel();
}
