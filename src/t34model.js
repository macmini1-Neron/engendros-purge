// t34model.js - scratch-built T-34/76 Model 1942 asset-viewer model.
// Asset only: no enemy type, no wave spawn, no gameplay hooks.
import * as THREE from 'three';

const PI = Math.PI;
const TAU = Math.PI * 2;
const TRACK_X = 1.56;
const FRONT_Z = 2.72;
const REAR_Z = -2.72;
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v3 = new THREE.Vector3();
const _s3 = new THREE.Vector3();
const _e = new THREE.Euler();

function makeMaterials() {
  const mk = (color, metalness = 0.06, roughness = 0.78) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  return {
    armor: mk(0x2f8f22),
    armorLight: mk(0x63c83e),
    armorDark: mk(0x176318),
    edge: mk(0x9fe46c),
    steel: mk(0x737b77, 0.32, 0.58),
    steelDark: mk(0x2d3531, 0.38, 0.66),
    rubber: mk(0x151815, 0.02, 0.9),
    track: mk(0x242720, 0.42, 0.72),
    trackBright: mk(0x575d4d, 0.42, 0.60),
    slot: mk(0x10130f, 0.1, 0.86),
    glass: mk(0x193746, 0.15, 0.42),
    brass: mk(0xa07838, 0.45, 0.52),
    paintRed: new THREE.MeshBasicMaterial({ color: 0xb62f2e, side: THREE.DoubleSide }),
    paintWhite: new THREE.MeshBasicMaterial({ color: 0xd9dec9, side: THREE.DoubleSide }),
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

function sphere(parent, name, mat, radius, pos, scale = [1, 1, 1], segments = 32) {
  const mesh = finish(new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(12, segments / 2)), mat), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  parent.add(mesh);
  return mesh;
}

function torus(parent, name, mat, radius, tube, pos, rot = [0, 0, 0], segments = 32) {
  const mesh = finish(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, segments), mat), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(mesh);
  return mesh;
}

function tube(parent, name, mat, pts, radius = 0.025) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const mesh = finish(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), mat), name);
  parent.add(mesh);
  return mesh;
}

function instanceAt(inst, index, pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _v3.set(pos[0], pos[1], pos[2]);
  _s3.set(scale[0], scale[1], scale[2]);
  _m4.compose(_v3, _q, _s3);
  inst.setMatrixAt(index, _m4);
}

function instancedBox(name, mat, size, count) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat, count);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function plate(parent, name, mat, size, pos, rot = [0, 0, 0], lip = true) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.set(rot[0], rot[1], rot[2]);
  box(g, `${name}Body`, mat, size, [0, 0, 0]);
  if (lip) {
    box(g, `${name}TopEdge`, mat, [size[0] * 0.98, Math.max(0.018, size[1] * 0.18), size[2] * 0.98], [0, size[1] * 0.48, 0]);
  }
  parent.add(g);
  return g;
}

function footprintMesh(name, mat, points, height, pos, bevel = 0.035) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -height / 2);
  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-PI / 2));
  const mesh = finish(new THREE.Mesh(geo, mat), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  return mesh;
}

function frustumBox(parent, name, mat, bottom, top, height, pos) {
  const bx = bottom[0] / 2;
  const bz = bottom[1] / 2;
  const tx = top[0] / 2;
  const tz = top[1] / 2;
  const y0 = -height / 2;
  const y1 = height / 2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -bx, y0, bz, bx, y0, bz, bx, y0, -bz, -bx, y0, -bz,
    -tx, y1, tz, tx, y1, tz, tx, y1, -tz, -tx, y1, -tz,
  ], 3));
  geo.setIndex([
    0, 3, 2, 0, 2, 1,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ]);
  geo.computeVertexNormals();
  const mesh = finish(new THREE.Mesh(geo, mat), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  parent.add(mesh);
  return mesh;
}

function starShape(radius = 0.18) {
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

function addSideStar(parent, M, sx, name, pos, scale = 1) {
  const geo = new THREE.ShapeGeometry(starShape(0.18 * scale));
  const mesh = finish(new THREE.Mesh(geo, M.paintRed), name);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.y = sx < 0 ? -PI / 2 : PI / 2;
  parent.add(mesh);
  return mesh;
}

function addSideStenciled42(parent, M, sx, baseName, pos, scale = 1) {
  const g = new THREE.Group();
  g.name = baseName;
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.y = sx < 0 ? -PI / 2 : PI / 2;
  const w = 0.035 * scale, len = 0.20 * scale, gap = 0.07 * scale;
  const bar = (n, x, y, ww, hh) => box(g, n, M.paintWhite, [ww, hh, 0.012], [x, y, 0]);
  // digit 4
  bar('fourLeft', -gap, 0.03 * scale, w, len);
  bar('fourMid', 0.01 * scale, 0.00, len, w);
  bar('fourRight', 0.09 * scale, 0.03 * scale, w, len);
  // digit 2
  const ox = 0.24 * scale;
  bar('twoTop', ox, 0.10 * scale, len, w);
  bar('twoRight', ox + 0.085 * scale, 0.035 * scale, w, len * 0.55);
  bar('twoMid', ox, 0, len, w);
  bar('twoLeft', ox - 0.085 * scale, -0.065 * scale, w, len * 0.55);
  bar('twoBottom', ox, -0.12 * scale, len, w);
  parent.add(g);
  return g;
}

function addWheelFace(group, M, sx, radius) {
  cyl(group, 'outerBoltRing', M.steel, radius * 0.18, 0.06, 'x', [sx * 0.235, 0, 0], [0, 0, 0], 18);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const y = Math.sin(a) * radius * 0.55;
    const z = Math.cos(a) * radius * 0.55;
    cyl(group, `lighteningHole_${i}`, M.slot, radius * 0.055, 0.075, 'x', [sx * 0.255, y, z], [0, 0, 0], 10);
    const spoke = box(group, `spoke_${i}`, M.armorLight, [0.055, radius * 0.34, 0.035], [sx * 0.275, Math.sin(a) * radius * 0.33, Math.cos(a) * radius * 0.33], [0, 0, -a]);
    spoke.rotation.x = a;
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    cyl(group, `rimBolt_${i}`, M.steel, radius * 0.025, 0.08, 'x', [sx * 0.29, Math.sin(a) * radius * 0.78, Math.cos(a) * radius * 0.78], [0, 0, 0], 8);
  }
}

function createRoadWheel(M, sx, index, z) {
  const g = new THREE.Group();
  g.name = `roadWheel_${sx < 0 ? 'L' : 'R'}_${index}`;
  g.position.set(sx * TRACK_X, 0.50, z);
  cyl(g, 'rubberTire', M.rubber, 0.50, 0.33, 'x', [0, 0, 0], [0, 0, 0], 44);
  cyl(g, 'pressedSteelDish', M.armorLight, 0.415, 0.37, 'x', [0, 0, 0], [0, 0, 0], 44);
  cyl(g, 'innerDishShadow', M.armorDark, 0.305, 0.39, 'x', [sx * 0.018, 0, 0], [0, 0, 0], 34);
  cyl(g, 'hubCap', M.edge, 0.165, 0.43, 'x', [sx * 0.04, 0, 0], [0, 0, 0], 24);
  addWheelFace(g, M, sx, 0.43);
  return g;
}

function createIdler(M, sx) {
  const g = new THREE.Group();
  g.name = sx < 0 ? 'idlerL' : 'idlerR';
  g.position.set(sx * TRACK_X, 0.55, FRONT_Z);
  cyl(g, 'idlerRubber', M.rubber, 0.42, 0.30, 'x', [0, 0, 0], [0, 0, 0], 38);
  cyl(g, 'idlerDish', M.armorLight, 0.33, 0.34, 'x', [0, 0, 0], [0, 0, 0], 34);
  cyl(g, 'idlerHub', M.edge, 0.13, 0.39, 'x', [sx * 0.035, 0, 0], [0, 0, 0], 18);
  addWheelFace(g, M, sx, 0.34);
  return g;
}

function createSprocket(M, sx) {
  const g = new THREE.Group();
  g.name = sx < 0 ? 'sprocketL' : 'sprocketR';
  g.position.set(sx * TRACK_X, 0.55, REAR_Z);
  cyl(g, 'sprocketHub', M.steelDark, 0.44, 0.33, 'x', [0, 0, 0], [0, 0, 0], 38);
  cyl(g, 'sprocketPlate', M.armorLight, 0.34, 0.39, 'x', [0, 0, 0], [0, 0, 0], 32);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    box(g, `sprocketTooth_${i}`, M.trackBright, [0.12, 0.15, 0.095], [sx * 0.03, Math.sin(a) * 0.47, Math.cos(a) * 0.47], [a, 0, 0]);
  }
  addWheelFace(g, M, sx, 0.34);
  return g;
}

function addTrackSide(root, M, sx) {
  const side = new THREE.Group();
  side.name = sx < 0 ? 'trackL' : 'trackR';
  const links = [];
  const transforms = [];
  root.add(side);

  box(side, 'lowerBeltShadow', M.slot, [0.76, 0.20, 5.72], [sx * TRACK_X, 0.12, 0]);
  box(side, 'upperBeltShadow', M.slot, [0.68, 0.15, 5.46], [sx * TRACK_X, 1.02, 0]);
  box(side, 'outerTrackWall', M.track, [0.10, 0.56, 5.52], [sx * (TRACK_X + 0.37), 0.58, -0.02]);
  box(side, 'topTrackArmorLip', M.armorDark, [0.62, 0.10, 5.62], [sx * TRACK_X, 1.13, -0.02]);
  for (let i = 0; i < 18; i++) {
    box(side, `outerTreadRib_${i}`, M.trackBright, [0.12, 0.44, 0.045], [sx * (TRACK_X + 0.43), 0.56, -2.48 + i * 0.29]);
  }

  const queueLink = (y, z, pitch, name) => {
    const marker = new THREE.Object3D();
    marker.name = name;
    marker.position.set(sx * TRACK_X, y, z);
    marker.rotation.x = pitch;
    links.push(marker);
    transforms.push([sx * TRACK_X, y, z, pitch]);
  };

  for (let i = 0; i < 22; i++) queueLink(0.13, -2.45 + i * 0.233, 0, `lowerLink_${i}`);
  for (let i = 0; i < 20; i++) queueLink(1.02, -2.25 + i * 0.237, 0, `upperLink_${i}`);

  const arc = (centerZ, start, end, label) => {
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const a = start + (end - start) * (i / (steps - 1));
      const y = 0.58 + Math.sin(a) * 0.46;
      const z = centerZ + Math.cos(a) * 0.46;
      queueLink(y, z, -a, `${label}_${i}`);
    }
  };
  arc(FRONT_Z, -PI / 2, PI / 2, 'frontWrap');
  arc(REAR_Z, PI / 2, PI * 1.5, 'rearWrap');

  const plates = instancedBox('trackShoePlates', M.track, [0.72, 0.08, 0.22], transforms.length);
  const grousers = instancedBox('trackGrousers', M.trackBright, [0.70, 0.040, 0.040], transforms.length * 2);
  const teeth = instancedBox('trackGuideTeeth', M.steelDark, [0.10, 0.11, 0.075], transforms.length);
  const pins = instancedBox('trackPins', M.steel, [0.035, 0.08, 0.18], transforms.length * 2);
  let gi = 0;
  let pi = 0;
  for (let i = 0; i < transforms.length; i++) {
    const [x, y, z, pitch] = transforms[i];
    instanceAt(plates, i, [x, y, z], [pitch, 0, 0]);
    instanceAt(grousers, gi++, [x, y + 0.042, z - 0.072], [pitch, 0, 0]);
    instanceAt(grousers, gi++, [x, y + 0.042, z + 0.072], [pitch, 0, 0]);
    instanceAt(teeth, i, [x, y - 0.035, z], [pitch, 0, 0]);
    instanceAt(pins, pi++, [x - 0.32, y, z], [pitch, 0, 0]);
    instanceAt(pins, pi++, [x + 0.32, y, z], [pitch, 0, 0]);
  }
  plates.instanceMatrix.needsUpdate = true;
  grousers.instanceMatrix.needsUpdate = true;
  teeth.instanceMatrix.needsUpdate = true;
  pins.instanceMatrix.needsUpdate = true;
  side.add(plates, grousers, teeth, pins);
  side.userData.linkInstances = { plates, grousers, teeth, pins };

  for (let i = 0; i < 13; i++) {
    cyl(side, `returnRoller_${i}`, M.steelDark, 0.055, 0.55, 'x', [sx * TRACK_X, 0.88, -2.25 + i * 0.38], [0, 0, 0], 10);
  }

  if (sx < 0) root.userData.trackLinksL = links;
  else root.userData.trackLinksR = links;
  return side;
}

export function buildT34Tracks() {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 't34Tracks_scratch';
  root.userData.roadWheelsL = [];
  root.userData.roadWheelsR = [];
  root.userData.trackLinksL = [];
  root.userData.trackLinksR = [];

  root.userData.trackL = addTrackSide(root, M, -1);
  root.userData.trackR = addTrackSide(root, M, 1);

  const wheelZ = [1.84, 0.92, 0.0, -0.92, -1.84];
  for (const sx of [-1, 1]) {
    const roadWheels = sx < 0 ? root.userData.roadWheelsL : root.userData.roadWheelsR;
    wheelZ.forEach((z, i) => {
      const w = createRoadWheel(M, sx, i, z);
      root.add(w);
      roadWheels.push(w);
    });
    const idler = createIdler(M, sx);
    const sprocket = createSprocket(M, sx);
    root.add(idler, sprocket);
    if (sx < 0) {
      root.userData.idlerL = idler;
      root.userData.sprocketL = sprocket;
    } else {
      root.userData.idlerR = idler;
      root.userData.sprocketR = sprocket;
    }
  }
  root.userData.viewerDistMult = 1.08;
  root.userData.viewerSpin = -0.08;
  return root;
}

function buildDriverHatch(M) {
  const hatch = new THREE.Group();
  hatch.name = 'driverHatch';
  hatch.position.set(-0.42, 1.30, 2.02);
  hatch.rotation.x = -0.56;
  plate(hatch, 'rectangularHatchPlate', M.armorDark, [0.58, 0.08, 0.48], [0, 0, 0]);
  box(hatch, 'periscopeSlit', M.slot, [0.40, 0.035, 0.045], [0, 0.065, 0.26]);
  box(hatch, 'leftHinge', M.steel, [0.12, 0.09, 0.06], [-0.22, 0.08, -0.10]);
  box(hatch, 'rightHinge', M.steel, [0.12, 0.09, 0.06], [0.22, 0.08, -0.10]);
  torus(hatch, 'hatchPullRing', M.steel, 0.085, 0.012, [0.0, 0.09, 0.05], [PI / 2, 0, 0], 18);
  box(hatch, 'hatchRaisedRim', M.edge, [0.66, 0.028, 0.035], [0, 0.085, 0.27]);
  box(hatch, 'hatchLowerRim', M.edge, [0.66, 0.028, 0.035], [0, 0.085, -0.27]);
  return hatch;
}

function buildBowMg(M) {
  const mg = new THREE.Group();
  mg.name = 'bowMg';
  mg.position.set(0.58, 1.08, 2.56);
  mg.rotation.x = -0.36;
  sphere(mg, 'ballMount', M.steel, 0.20, [0, 0, 0], [1.08, 0.82, 0.66], 28);
  cyl(mg, 'dtBarrel', M.steelDark, 0.042, 0.70, 'z', [0, 0.015, 0.40], [0, 0, 0], 16);
  cyl(mg, 'dtMuzzle', M.slot, 0.055, 0.06, 'z', [0, 0.015, 0.77], [0, 0, 0], 16);
  return mg;
}

function buildEngineDeck(M) {
  const deck = new THREE.Group();
  deck.name = 'engineDeck';
  deck.position.set(0, 1.48, -1.88);
  plate(deck, 'engineDeckPlate', M.armorDark, [2.28, 0.12, 1.20], [0, 0, 0]);
  for (let i = 0; i < 8; i++) box(deck, `longitudinalGrille_${i}`, M.slot, [0.14, 0.045, 1.02], [-0.72 + i * 0.205, 0.095, -0.02]);
  for (let i = 0; i < 5; i++) box(deck, `crossLouver_${i}`, M.steel, [2.04, 0.035, 0.035], [0, 0.13, -0.44 + i * 0.22]);
  box(deck, 'leftGrilleFrame', M.edge, [0.045, 0.05, 1.10], [-1.06, 0.15, -0.02]);
  box(deck, 'rightGrilleFrame', M.edge, [0.045, 0.05, 1.10], [1.06, 0.15, -0.02]);
  box(deck, 'frontGrilleFrame', M.edge, [2.10, 0.05, 0.045], [0, 0.15, 0.54]);
  box(deck, 'rearGrilleFrame', M.edge, [2.10, 0.05, 0.045], [0, 0.15, -0.58]);
  plate(deck, 'leftServicePanel', M.armor, [0.84, 0.09, 0.36], [-0.66, 0.18, -0.82]);
  plate(deck, 'rightServicePanel', M.armor, [0.84, 0.09, 0.36], [0.66, 0.18, -0.82]);
  for (const x of [-0.65, 0.65]) {
    box(deck, `panelHandle_${x}`, M.steel, [0.34, 0.035, 0.035], [x, 0.25, -0.82]);
    box(deck, `panelHandleFootA_${x}`, M.steel, [0.035, 0.09, 0.035], [x - 0.16, 0.21, -0.82]);
    box(deck, `panelHandleFootB_${x}`, M.steel, [0.035, 0.09, 0.035], [x + 0.16, 0.21, -0.82]);
  }
  return deck;
}

function buildFuelTanks(M) {
  const group = new THREE.Group();
  group.name = 'fuelTanks';
  group.userData.tanks = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const tank = new THREE.Group();
      tank.name = `fuelTank_${sx < 0 ? 'L' : 'R'}_${i}`;
      tank.position.set(sx * 1.38, 1.40, -1.04 - i * 0.72);
      cyl(tank, 'cylindricalCan', M.armor, 0.17, 0.68, 'z', [0, 0, 0], [0, 0, 0], 28);
      cyl(tank, 'frontCap', M.armorLight, 0.175, 0.035, 'z', [0, 0, 0.36], [0, 0, 0], 28);
      cyl(tank, 'rearCap', M.armorLight, 0.175, 0.035, 'z', [0, 0, -0.36], [0, 0, 0], 28);
      box(tank, 'strapA', M.steelDark, [0.045, 0.39, 0.04], [0, 0, -0.18]);
      box(tank, 'strapB', M.steelDark, [0.045, 0.39, 0.04], [0, 0, 0.18]);
      group.add(tank);
      group.userData.tanks.push(tank);
    }
  }
  return group;
}

function buildFenders(M) {
  const group = new THREE.Group();
  group.name = 'fenders';
  group.userData.fenders = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Group();
    f.name = sx < 0 ? 'fenderL' : 'fenderR';
    plate(f, 'mainFenderStrip', M.armorDark, [0.68, 0.095, 5.82], [sx * 1.55, 1.20, -0.04]);
    box(f, 'outerFenderLip', M.edge, [0.055, 0.13, 5.72], [sx * 1.91, 1.22, -0.04]);
    box(f, 'innerFenderLip', M.armor, [0.045, 0.10, 5.55], [sx * 1.20, 1.19, -0.04]);
    box(f, 'frontBentMudguard', M.armorDark, [0.72, 0.18, 0.76], [sx * 1.55, 1.08, 2.70], [-0.30, 0, 0]);
    box(f, 'rearBentMudguard', M.armorDark, [0.72, 0.16, 0.68], [sx * 1.55, 1.08, -2.72], [0.18, 0, 0]);
    for (let i = 0; i < 12; i++) box(f, `fenderBracket_${i}`, M.steel, [0.065, 0.16, 0.13], [sx * 1.50, 1.29, 2.36 - i * 0.43]);
    group.add(f);
    group.userData.fenders.push(f);
  }
  return group;
}

export function buildT34Hull() {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 't34Hull_scratch';

  box(root, 'lowerHullTub', M.armor, [2.46, 0.74, 5.42], [0, 0.80, -0.04]);
  frustumBox(root, 'upperSlopedHullCore', M.armor, [2.62, 4.82], [1.70, 3.24], 0.64, [0, 1.23, -0.22]);
  box(root, 'leftTrackPodBlock', M.armorDark, [0.42, 0.42, 5.62], [-1.42, 0.87, -0.03]);
  box(root, 'rightTrackPodBlock', M.armorDark, [0.42, 0.42, 5.62], [1.42, 0.87, -0.03]);
  box(root, 'leftUpperTrackChamfer', M.armor, [0.35, 0.18, 5.38], [-1.26, 1.08, -0.06], [0, 0, 0.18]);
  box(root, 'rightUpperTrackChamfer', M.armor, [0.35, 0.18, 5.38], [1.26, 1.08, -0.06], [0, 0, -0.18]);
  plate(root, 'upperDeck', M.armorLight, [1.86, 0.16, 2.82], [0, 1.55, -0.46]);
  box(root, 'frontGlacis', M.armorLight, [2.58, 0.20, 1.42], [0, 1.15, 2.23], [-0.64, 0, 0]);
  box(root, 'glacisLowerShadow', M.armorDark, [2.48, 0.060, 1.28], [0, 0.85, 2.42], [-0.64, 0, 0]);
  box(root, 'glacisTopCatchlight', M.edge, [2.40, 0.040, 1.18], [0, 1.40, 2.04], [-0.64, 0, 0]);
  box(root, 'blockyLowerNosePlate', M.armorDark, [2.46, 0.22, 0.80], [0, 0.48, 2.78], [-0.20, 0, 0]);
  box(root, 'rearSlopedPlate', M.armorDark, [2.42, 0.20, 1.06], [0, 1.05, -2.60], [0.44, 0, 0]);
  box(root, 'rearVerticalPlate', M.armorDark, [2.32, 0.76, 0.18], [0, 0.72, -3.00]);
  box(root, 'rearBoxyStowageLeft', M.armor, [0.52, 0.46, 0.42], [-1.01, 1.12, -2.82]);
  box(root, 'rearBoxyStowageRight', M.armor, [0.52, 0.46, 0.42], [1.01, 1.12, -2.82]);

  const driverHatch = buildDriverHatch(M);
  const bowMg = buildBowMg(M);
  const engineDeck = buildEngineDeck(M);
  const fuelTanks = buildFuelTanks(M);
  const fenders = buildFenders(M);
  root.add(driverHatch, bowMg, engineDeck, fuelTanks, fenders);

  for (const sx of [-1, 1]) {
    box(root, `sideHullCastLine_${sx}`, M.edge, [0.045, 0.055, 4.36], [sx * 1.23, 1.35, -0.15], [0, 0, sx * 0.18]);
    for (let i = 0; i < 13; i++) {
      cyl(root, `sideBolt_${sx}_${i}`, M.steel, 0.022, 0.035, 'x', [sx * 1.31, 1.18, 2.00 - i * 0.32], [0, 0, 0], 8);
    }
  }
  box(root, 'frontSpareTrackRack', M.steelDark, [1.18, 0.09, 0.08], [0.08, 1.39, 1.56]);
  for (let i = 0; i < 7; i++) box(root, `spareTrackLink_${i}`, M.trackBright, [0.15, 0.09, 0.22], [-0.38 + i * 0.13, 1.43, 1.58], [-0.55, 0, 0]);
  tube(root, 'leftTowCable', M.steel, [[-1.06, 1.40, 1.35], [-1.22, 1.42, 0.25], [-1.06, 1.38, -1.45]], 0.026);
  tube(root, 'rightTowCable', M.steel, [[1.06, 1.40, 1.35], [1.22, 1.42, 0.25], [1.06, 1.38, -1.45]], 0.026);
  box(root, 'shovelHandle', M.steel, [0.055, 0.055, 1.18], [0.92, 1.44, 0.44], [0, 0.08, 0]);
  box(root, 'shovelBlade', M.steelDark, [0.18, 0.04, 0.26], [0.94, 1.46, 1.08], [0, 0.08, 0]);
  box(root, 'crowbar', M.steel, [0.045, 0.045, 1.24], [-0.92, 1.45, 0.42], [0, -0.05, 0]);
  cyl(root, 'headlampHousing', M.steelDark, 0.11, 0.12, 'z', [-0.92, 1.23, 2.62], [-0.28, 0, 0], 18);
  cyl(root, 'headlampGlass', M.glass, 0.075, 0.035, 'z', [-0.92, 1.23, 2.70], [-0.28, 0, 0], 18);
  for (const sx of [-1, 1]) {
    torus(root, `frontTowHook_${sx}`, M.steel, 0.12, 0.018, [sx * 0.72, 0.50, 3.03], [PI / 2, 0, 0], 18);
    torus(root, `rearTowHook_${sx}`, M.steel, 0.10, 0.018, [sx * 0.80, 0.60, -3.05], [PI / 2, 0, 0], 18);
  }
  box(root, 'rearLouverShadow', M.slot, [1.18, 0.44, 0.045], [0, 0.98, -3.105]);
  for (let i = 0; i < 6; i++) box(root, `rearLouverBar_${i}`, M.steel, [1.10, 0.030, 0.060], [0, 0.82 + i * 0.065, -3.13]);
  for (let i = 0; i < 5; i++) box(root, `rearLouverVertical_${i}`, M.steelDark, [0.035, 0.43, 0.055], [-0.44 + i * 0.22, 0.98, -3.135]);
  for (const sx of [-1, 1]) {
    cyl(root, `rearSmokeCan_${sx}`, M.steelDark, 0.10, 0.34, 'z', [sx * 0.58, 0.50, -3.18], [0, 0, 0], 16);
    cyl(root, `frontMarkerLight_${sx}`, M.glass, 0.045, 0.035, 'z', [sx * 1.04, 1.08, 2.72], [-0.35, 0, 0], 14);
  }
  addSideStar(root, M, -1, 'leftHullStar', [-1.34, 1.08, 0.72], 0.65);
  addSideStar(root, M, 1, 'rightHullStar', [1.34, 1.08, 0.72], 0.65);

  root.userData.driverHatch = driverHatch;
  root.userData.bowMg = bowMg;
  root.userData.engineDeck = engineDeck;
  root.userData.fuelTanks = fuelTanks;
  root.userData.fenders = fenders;
  root.userData.viewerDistMult = 1.08;
  root.userData.viewerSpin = -0.12;
  return root;
}

function buildHatch(M, name, pos) {
  const h = new THREE.Group();
  h.name = name;
  h.position.set(pos[0], pos[1], pos[2]);
  cyl(h, 'roundHatchDisc', M.armorDark, 0.23, 0.085, 'y', [0, 0, 0], [0, 0, 0], 28);
  cyl(h, 'raisedHatchLid', M.armorLight, 0.22, 0.055, 'y', [name === 'hatchL' ? -0.05 : 0.05, 0.18, -0.14], [PI * 0.58, 0, name === 'hatchL' ? -0.10 : 0.10], 28);
  box(h, 'hatchHinge', M.steel, [0.10, 0.09, 0.14], [0.18, 0.06, -0.02]);
  torus(h, 'hatchRing', M.steel, 0.08, 0.010, [-0.02, 0.07, 0.05], [PI / 2, 0, 0], 18);
  return h;
}

function addTurretDetails(turret, M) {
  cyl(turret, 'commanderCupola', M.armorDark, 0.22, 0.24, 'y', [-0.44, 0.84, -0.18], [0, 0, 0], 32);
  cyl(turret, 'cupolaCap', M.armorLight, 0.17, 0.08, 'y', [-0.44, 1.02, -0.18], [0, 0, 0], 28);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    box(turret, `cupolaVision_${i}`, M.slot, [0.075, 0.035, 0.018], [-0.44 + Math.cos(a) * 0.23, 0.91, -0.18 + Math.sin(a) * 0.23], [0, a, 0]);
  }
  box(turret, 'gunnerSightBlock', M.steelDark, [0.20, 0.14, 0.22], [0.50, 0.82, 0.40]);
  box(turret, 'gunnerSightGlass', M.glass, [0.13, 0.07, 0.035], [0.50, 0.83, 0.53]);
  for (const [x, z, r] of [[-0.86, 0.25, -0.20], [0.86, 0.23, 0.20], [0.0, -0.70, 0]]) {
    box(turret, `turretHandrail_${x}_${z}`, M.steel, [0.36, 0.032, 0.032], [x, 0.78, z], [0, r, 0]);
    box(turret, `turretHandrailFootA_${x}_${z}`, M.steel, [0.032, 0.10, 0.032], [x - 0.18, 0.73, z]);
    box(turret, `turretHandrailFootB_${x}_${z}`, M.steel, [0.032, 0.10, 0.032], [x + 0.18, 0.73, z]);
  }
  for (let i = 0; i < 11; i++) {
    const x = -0.82 + i * 0.164;
    cyl(turret, `rearTurretBolt_${i}`, M.steel, 0.018, 0.03, 'y', [x, 0.74, -0.73], [0, 0, 0], 8);
  }
  cyl(turret, 'antennaBase', M.steelDark, 0.055, 0.12, 'y', [0.70, 0.83, -0.45], [0, 0, 0], 12);
  box(turret, 'antennaWhip', M.steel, [0.025, 0.82, 0.025], [0.70, 1.25, -0.45], [0.10, 0, -0.08]);
  addSideStar(turret, M, -1, 'leftTurretStar', [-1.115, 0.42, 0.12], 0.9);
  addSideStar(turret, M, 1, 'rightTurretStar', [1.115, 0.42, 0.12], 0.9);
  addSideStenciled42(turret, M, -1, 'leftTurretNumber42', [-1.125, 0.43, -0.18], 0.76);
  addSideStenciled42(turret, M, 1, 'rightTurretNumber42', [1.125, 0.43, -0.18], 0.76);
}

export function buildT34Turret() {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 't34Turret_scratchRoot';

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 1.58, 0.44);
  root.add(turret);
  root.userData.turret = turret;

  const shell = footprintMesh('hexCastTurretShell', M.armorLight, [
    [-0.70, -0.94], [0.70, -0.94], [1.08, -0.58], [1.20, 0.18],
    [0.88, 0.90], [0.36, 1.16], [-0.36, 1.16], [-0.88, 0.90],
    [-1.20, 0.18], [-1.08, -0.58],
  ], 0.86, [0, 0.42, 0], 0.045);
  turret.add(shell);
  box(turret, 'frontTurretBlockFace', M.armor, [1.58, 0.56, 0.22], [0, 0.43, 0.98], [-0.08, 0, 0]);
  box(turret, 'leftFrontCheekBlock', M.armor, [0.38, 0.54, 0.70], [-0.86, 0.40, 0.55], [0, -0.30, 0]);
  box(turret, 'rightFrontCheekBlock', M.armor, [0.38, 0.54, 0.70], [0.86, 0.40, 0.55], [0, 0.30, 0]);
  sphere(turret, 'leftCastCheekRoundover', M.armor, 0.54, [-0.68, 0.40, 0.42], [0.54, 0.42, 0.82], 28);
  sphere(turret, 'rightCastCheekRoundover', M.armor, 0.54, [0.68, 0.40, 0.42], [0.54, 0.42, 0.82], 28);
  sphere(turret, 'roofCastCrown', M.edge, 0.54, [0, 0.82, -0.05], [1.60, 0.20, 1.12], 30);
  box(turret, 'frontTurretNeckShadow', M.armorDark, [1.35, 0.10, 0.12], [0, 0.24, 1.06]);
  box(turret, 'rearWeldBead', M.steelDark, [1.86, 0.060, 0.060], [0, 0.84, -0.90]);
  addTurretDetails(turret, M);

  const hatchL = buildHatch(M, 'hatchL', [-0.28, 0.96, -0.24]);
  const hatchR = buildHatch(M, 'hatchR', [0.30, 0.96, -0.20]);
  turret.add(hatchL, hatchR);
  root.userData.hatchL = hatchL;
  root.userData.hatchR = hatchR;

  const gunMantlet = new THREE.Group();
  gunMantlet.name = 'gunMantlet';
  gunMantlet.position.set(0, 0.43, 1.16);
  turret.add(gunMantlet);
  root.userData.gunMantlet = gunMantlet;

  box(gunMantlet, 'blockyMantletFrame', M.armorDark, [0.86, 0.52, 0.28], [0, 0, -0.03]);
  sphere(gunMantlet, 'roundedMantlet', M.armorDark, 0.42, [0, 0, 0.05], [1.18, 0.78, 0.58], 30);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    cyl(gunMantlet, `mantletBolt_${i}`, M.steel, 0.018, 0.03, 'z', [Math.cos(a) * 0.31, Math.sin(a) * 0.18, 0.23], [0, 0, 0], 8);
  }

  const recoilNode = new THREE.Group();
  recoilNode.name = 'recoilNode';
  gunMantlet.add(recoilNode);
  root.userData.recoilNode = recoilNode;

  cyl(recoilNode, 'f34BaseTube', M.steel, 0.112, 1.10, 'z', [0, 0, 0.60], [0, 0, 0], 28);
  cyl(recoilNode, 'f34MiddleTube', M.steel, 0.088, 1.46, 'z', [0, 0, 1.88], [0, 0, 0], 28);
  cyl(recoilNode, 'f34MuzzleTube', M.steelDark, 0.068, 0.82, 'z', [0, 0, 3.02], [0, 0, 0], 24);
  for (let i = 0; i < 5; i++) cyl(recoilNode, `barrelCollar_${i}`, M.steel, 0.112, 0.055, 'z', [0, 0, 0.28 + i * 0.39], [0, 0, 0], 20);
  cyl(recoilNode, 'muzzleRing', M.steel, 0.092, 0.10, 'z', [0, 0, 3.48], [0, 0, 0], 20);
  cyl(recoilNode, 'darkBore', M.slot, 0.047, 0.035, 'z', [0, 0, 3.54], [0, 0, 0], 18);
  cyl(recoilNode, 'coaxialDt', M.steelDark, 0.035, 0.82, 'z', [0.20, -0.05, 0.54], [0, 0, 0], 14);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, 3.57);
  recoilNode.add(muzzle);
  root.userData.muzzle = muzzle;
  root.userData.viewerDistMult = 1.12;
  root.userData.viewerSpin = -0.30;
  return root;
}

export function buildT34Model() {
  const root = new THREE.Group();
  root.name = 't34_76_1942_scratch';

  const tracks = buildT34Tracks();
  const hull = buildT34Hull();
  const turretRoot = buildT34Turret();
  root.add(tracks, hull, turretRoot);

  root.userData.tracks = tracks;
  root.userData.hull = hull;
  root.userData.turret = turretRoot.userData.turret;
  root.userData.gunMantlet = turretRoot.userData.gunMantlet;
  root.userData.recoilNode = turretRoot.userData.recoilNode;
  root.userData.muzzle = turretRoot.userData.muzzle;
  root.userData.hatchL = turretRoot.userData.hatchL;
  root.userData.hatchR = turretRoot.userData.hatchR;
  root.userData.trackL = tracks.userData.trackL;
  root.userData.trackR = tracks.userData.trackR;
  root.userData.roadWheelsL = tracks.userData.roadWheelsL;
  root.userData.roadWheelsR = tracks.userData.roadWheelsR;
  root.userData.sprocketL = tracks.userData.sprocketL;
  root.userData.sprocketR = tracks.userData.sprocketR;
  root.userData.idlerL = tracks.userData.idlerL;
  root.userData.idlerR = tracks.userData.idlerR;
  root.userData.trackLinksL = tracks.userData.trackLinksL;
  root.userData.trackLinksR = tracks.userData.trackLinksR;
  root.userData.driverHatch = hull.userData.driverHatch;
  root.userData.bowMg = hull.userData.bowMg;
  root.userData.engineDeck = hull.userData.engineDeck;
  root.userData.fuelTanks = hull.userData.fuelTanks;
  root.userData.fenders = hull.userData.fenders;
  root.userData.viewerDistMult = 1.06;
  root.userData.viewerSpin = -3.38;
  return root;
}
