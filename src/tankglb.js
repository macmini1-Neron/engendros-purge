// tankglb.js — load the realistic T-90 GLB and auto-rig it for the game.
// The GLB is 326 unstructured meshes with NO node hierarchy, but the turret +
// gun + roof gear sit cleanly above the hull deck (verified ~y1.7 after scaling
// to 9.6 m). So we classify at LOAD TIME by in-engine Box3 and reparent the
// above-deck meshes into a yaw pivot (turret), with the barrel in a pitch/recoil
// node. Mitri, muzzle markers and headlight SpotLights are added on top.
//
// buildTank()/buildTankWreck() are SYNCHRONOUS (the game needs that) and return a
// clone of a preloaded template — call preloadTank() once during init and await it
// before the first spawn / asset-viewer use.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { buildMitri } from './tankmodel.js';

const GLB_URL = './assets/modely/tank_t-90_custom_design.glb';
const TARGET_LEN = 9.6;      // metres (≈ real T-90M gun-forward)
const DECK_Y = 1.7;          // turret/hull split height after normalisation (verified)

let TEMPLATE = null;
let _loading = null;

export function preloadTank() {
  if (TEMPLATE) return Promise.resolve(TEMPLATE);
  if (_loading) return _loading;
  _loading = new Promise((resolve, reject) => {
    new GLTFLoader().load(GLB_URL,
      (gltf) => { try { TEMPLATE = buildTemplate(gltf.scene); resolve(TEMPLATE); } catch (e) { reject(e); } },
      undefined, reject);
  });
  return _loading;
}
export function tankReady() { return !!TEMPLATE; }

// ── Build the rigged template from the raw GLB scene ──
function buildTemplate(model) {
  const v = () => new THREE.Vector3();

  // 1. scale to target length by the longer horizontal axis
  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(v());
  model.scale.setScalar(TARGET_LEN / Math.max(size.x, size.z));
  model.updateMatrixWorld(true);

  // 2. orient: the longer horizontal axis is the tank length (X for this model) →
  //    rotate it onto +Z (game forward). Auto-detecting the gun axis was unreliable
  //    (a long Z-rail beat the barrel), so the rotation is hardcoded; GUN_YAW sign is
  //    set empirically so the gun ends up pointing +Z (flip if it comes out backwards).
  box = new THREE.Box3().setFromObject(model); size = box.getSize(v());
  const lenAxisX = size.x >= size.z;
  const GUN_YAW = Math.PI / 2;             // maps +X → +Z (sign set so the gun points +Z)
  const yaw = lenAxisX ? GUN_YAW : 0;
  model.rotation.y = yaw;
  model.updateMatrixWorld(true);

  // 3. re-centre x/z by the MEDIAN mesh centroid (robust to the gun + asymmetric wrap meshes
  //    that skew the bbox and push the turret off to one side), ground y on the bbox.
  box = new THREE.Box3().setFromObject(model);
  const cs = []; model.traverse(o => { if (o.isMesh) cs.push(new THREE.Box3().setFromObject(o).getCenter(v())); });
  const medA = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1] || 0;
  model.position.x -= medA(cs.map(c => c.x));
  model.position.z -= medA(cs.map(c => c.z));
  model.position.y -= box.min.y;
  model.updateMatrixWorld(true);

  // 4. classify (forward = +Z now)
  const meshes = [];
  model.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = false;
    const b = new THREE.Box3().setFromObject(o);
    meshes.push({ o, c: b.getCenter(v()), s: b.getSize(v()) }); } });
  const O = new THREE.Box3().setFromObject(model);
  const deckY = O.min.y + DECK_Y;
  const med = (arr) => { const a = arr.slice().sort((p, q) => p - q); return a[a.length >> 1] || 0; };
  const above = meshes.filter(m => m.c.y > deckY);
  // robust turret centre z from medium "core" meshes (skip tiny bolts, giant wraps, long barrels)
  const core = above.filter(m => { const h = Math.max(m.s.x, m.s.z); return h > 0.5 && h < 3.5 && m.s.z < 2.0; });
  // turret pivot = CENTROID of the turret-shell core meshes (barrel excluded) → centred yaw, no wobble
  const ref = core.length ? core : above;
  const tcx = ref.reduce((s, m) => s + m.c.x, 0) / ref.length;
  const tcz = ref.reduce((s, m) => s + m.c.z, 0) / ref.length;
  const R = 2.4;                                   // turret footprint radius
  const distC = (m) => Math.hypot(m.c.x - tcx, m.c.z - tcz);
  // barrel = a LONG THIN tube forward of centre, near centreline (SHAPE-based → not smoke tubes/panels)
  const isBarrel = (m) => Math.abs(m.c.x - tcx) < 0.7 && m.c.z > tcz + 0.3 &&
                          Math.max(m.s.x, m.s.z) > 1.0 && Math.min(m.s.x, m.s.z) < 0.7 && m.s.y < 0.85;
  const notTiny = (m) => Math.max(m.s.x, m.s.y, m.s.z) > 0.18;
  // turret = above-deck within footprint (skip only the tiniest scattered bolts) OR the barrel.
  // NOTE: keep this inclusive — it must keep the Relikt ERA tiles + front laser-warning/designators.
  // The ring of small deck bolts that still yaw is a KNOWN open item (fix with Playwright, post-compact).
  const turret = meshes.filter(m => (m.c.y > deckY && distC(m) < R && notTiny(m)) || isBarrel(m));
  const barrel = turret.filter(isBarrel);
  if (typeof console !== 'undefined') {
    const cand = meshes.filter(m => Math.min(m.s.x, m.s.z) < 0.7 && m.s.y < 0.9 && Math.max(m.s.x, m.s.z) > 1.5)
      .sort((a, b) => Math.max(b.s.x, b.s.z) - Math.max(a.s.x, a.s.z)).slice(0, 4)
      .map(m => ({ x: +m.c.x.toFixed(2), y: +m.c.y.toFixed(2), z: +m.c.z.toFixed(2), sx: +m.s.x.toFixed(2), sz: +m.s.z.toFixed(2) }));
    console.log('[tankglb] tcz=' + tcz.toFixed(2), 'deckY=' + deckY.toFixed(2), 'barrel=' + barrel.length,
      'modelLenX/Z=' + (O.max.x - O.min.x).toFixed(1) + '/' + (O.max.z - O.min.z).toFixed(1), 'thinTubes', JSON.stringify(cand));
  }
  const roofY = turret.filter(m => m.s.y < 1.2).reduce((mx, m) => Math.max(mx, m.c.y + m.s.y / 2), deckY + 1.0);

  // 5. root (game controls) → model(hull) + turret pivot
  const root = new THREE.Group(); root.name = 'tank';
  root.add(model);
  const turretG = new THREE.Group(); turretG.name = 'turret';
  turretG.position.set(tcx, deckY, tcz);
  root.add(turretG);
  turret.forEach(m => turretG.attach(m.o));       // preserve world transform

  // 6. gun: barrel → pitch/recoil node (rest of turret stays yaw-only)
  const gunY = barrel.length ? barrel.reduce((s, m) => s + m.c.y, 0) / barrel.length : deckY + 0.5;
  const gBox = new THREE.Box3(); barrel.forEach(m => gBox.expandByObject(m.o));
  const frontZ = isFinite(gBox.max.z) ? gBox.max.z : tcz + 4;
  const gunMantlet = new THREE.Group(); gunMantlet.name = 'gunMantlet';
  gunMantlet.position.set(tcx, gunY, tcz + 0.3);
  turretG.add(gunMantlet);
  const recoilNode = new THREE.Group(); recoilNode.name = 'recoilNode';
  gunMantlet.add(recoilNode);
  barrel.forEach(m => recoilNode.attach(m.o));
  recoilNode.updateMatrixWorld(true);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle';
  muzzle.position.copy(recoilNode.worldToLocal(new THREE.Vector3(tcx, gunY, frontZ + 0.1)));
  recoilNode.add(muzzle);

  // 7. mg muzzle (offset right of barrel)
  const mgMuzzle = new THREE.Object3D(); mgMuzzle.name = 'mgMuzzle';
  mgMuzzle.position.set(0.7, gunY - deckY + 0.1, (frontZ - tcz) * 0.4);
  turretG.add(mgMuzzle);

  // 8. commander hatch + Mitri (rides exposed on the roof, right side)
  const hatch = new THREE.Group(); hatch.name = 'hatch';
  hatch.position.set(tcx + 0.7, roofY - deckY - 0.1, tcz - 0.2);  // turret-local
  turretG.add(hatch);
  const mitri = buildMitri(); mitri.name = 'mitri'; mitri.scale.setScalar(0.9);
  hatch.add(mitri);

  // markers/refs onto root.userData filled per-clone in buildTank()
  root.userData._rigMeta = { tcx, tcz, deckY, gunY, roofY };
  if (typeof console !== 'undefined') console.log('[tankglb] rigged: turret', turret.length, 'meshes, hull', meshes.length - turret.length, 'center', tcx.toFixed(2), tcz.toFixed(2), 'deckY', deckY.toFixed(2));
  return root;
}

// ── Re-link userData rig nodes on a freshly cloned root ──
function linkRig(root) {
  const byName = {};
  root.traverse(o => { if (o.name) byName[o.name] = o; });
  const ud = root.userData;
  ud.turret = byName.turret || null;
  ud.gunMantlet = byName.gunMantlet || null;
  ud.recoilNode = byName.recoilNode || null;
  ud.muzzle = byName.muzzle || null;
  ud.mgMuzzle = byName.mgMuzzle || null;
  ud.hatch = byName.hatch || null;
  ud.mitri = byName.mitri || null;
  if (ud.turret) ud.turret.userData.gunMantlet = ud.gunMantlet;
  if (ud.gunMantlet) ud.gunMantlet.userData.recoilNode = ud.recoilNode;
  // static (no spin for v1) — dummy nodes so animateTank() never throws
  ud.roadWheels = [];
  ud.sprocketL = new THREE.Object3D(); ud.sprocketR = new THREE.Object3D();
  ud.trackL = new THREE.Object3D(); ud.trackR = new THREE.Object3D();
  // headlights: fresh SpotLights at the front
  ud.headlamps = [];
  ud.headlampLights = [];
  for (const hx of [-0.9, 0.9]) {
    const sl = new THREE.SpotLight(0xfff0c0, 0, 36, 0.55, 0.4, 1.5);
    sl.castShadow = false; sl.position.set(hx, 1.55, 4.3);
    const tgt = new THREE.Object3D(); tgt.position.set(hx, 1.2, 30);
    root.add(sl); root.add(tgt); sl.target = tgt;
    ud.headlampLights.push(sl);
  }
}

export function buildTank(camo = 'desert') {
  if (!TEMPLATE) { console.warn('[tankglb] buildTank before preload — returning empty group'); const g = new THREE.Group(); g.name = 'tank'; linkRig(g); return g; }
  const root = TEMPLATE.clone(true);
  root.name = 'tank';
  linkRig(root);
  if (root.userData.mitri) root.userData.mitri.visible = true;
  return root;
}

export function buildTankWreck() {
  const root = buildTank('desert');
  root.name = 'tankWreck';
  // darken everything + tilt the turret as if blown
  root.traverse(o => { if (o.isMesh && o.material) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map(m => { const c = m.clone(); if (c.color) c.color.multiplyScalar(0.28); if (c.emissive) c.emissive.setHex(0); if ('metalness' in c) c.metalness *= 0.5; return c; });
    if (!Array.isArray(o.material)) o.material = o.material[0];
  }});
  const ud = root.userData;
  if (ud.turret) { ud.turret.rotation.y = 0.5; ud.turret.position.x += 0.2; }
  if (ud.gunMantlet) ud.gunMantlet.rotation.x = 0.3;
  if (ud.mitri) ud.mitri.visible = false;
  if (ud.headlampLights) ud.headlampLights.forEach(l => l.intensity = 0);
  return root;
}
