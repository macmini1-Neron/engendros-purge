// shilka-rig.js -- ЗСУ-23-4 GLB auto-rig: a PURE bbox part-classifier + a THREE re-parenter.
// The classifier is the source of truth shared with tools/shilka-rig-view.html (dev viewer).
// classifyShilkaPart works in the GLTFLoader-native (Y-up) space, the same space the viewer renders.

export const SHILKA_RIG_GROUPS = Object.freeze(['hull', 'track', 'wheel', 'sprocket', 'turret', 'gun', 'radar', 'antenna']);

// centre (cx,cy,cz) + size (sx,sy,sz) of a mesh's world AABB, model loaded raw (front = -Z).
export function classifyShilkaPart(cx, cy, cz, sx, sy, sz) {
  // low running gear
  if (sx < 0.30 && cy < 0.65 && sy >= 0.45 && sz >= 0.45 && sz < 0.75) return 'wheel';
  if (sx < 0.30 && cy < 0.65 && sy >= 0.30 && sy < 0.48) return 'sprocket';
  if (sz > 3.5 && cy < 0.60 && sx < 0.6) return 'track';
  // whip antennas: tall + super-thin verticals -> own physics rig (NOT radar)
  if (sx < 0.14 && sz < 0.14 && sy > 0.60) return 'antenna';
  // 23 mm barrels: long in Z, thin both ways, at turret height
  if (sz > 1.0 && cy >= 1.05 && cy <= 1.6 && sx < 0.5 && sy < 0.5) return 'gun';
  // radar gun-dish drum: rear-top cluster only
  if (cy > 1.70 && cz > 0.45) return 'radar';
  // turret vs hull-deck: central compact = turret; side sponsons/fenders/engine deck = hull
  if (cy >= 1.0) {
    if (Math.abs(cx - (-0.22)) > 0.65) return 'hull';
    return 'turret';
  }
  return 'hull';
}

// Re-parent a freshly-loaded gltf.scene into movable rig groups. THREE is injected so the
// classifier module stays import-free. Returns a rig handle the adapter animates each frame.
export function buildShilkaRig(modelScene, THREE) {
  modelScene.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(modelScene).getCenter(new THREE.Vector3());

  const root = new THREE.Group(); root.name = 'shilka rig root';
  const body = new THREE.Group(); body.name = 'shilka body (tilt)';
  root.add(body);

  const buckets = { hull: [], track: [], wheel: [], sprocket: [], turret: [], gun: [], radar: [], antenna: [] };
  const tmp = new THREE.Box3(), ctr = new THREE.Vector3(), siz = new THREE.Vector3();
  const meshes = [];
  modelScene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    tmp.setFromObject(m); tmp.getCenter(ctr); tmp.getSize(siz);
    const g = classifyShilkaPart(ctr.x, ctr.y, ctr.z, siz.x, siz.y, siz.z);
    buckets[g].push({ mesh: m, cx: ctr.x, cy: ctr.y, cz: ctr.z });
  }

  // helper: make a pivot group at a world point and re-home a mesh under it (keep world transform)
  const pivotAt = (px, py, pz, name) => { const grp = new THREE.Group(); grp.name = name; grp.position.set(px, py, pz); return grp; };
  const reparentKeepWorld = (mesh, parent) => { parent.attach(mesh); }; // THREE.attach preserves world transform

  // static body groups
  const turret = new THREE.Group(); turret.name = 'turret'; body.add(turret);
  for (const { mesh } of buckets.hull) reparentKeepWorld(mesh, body);
  for (const { mesh } of buckets.track) reparentKeepWorld(mesh, body);
  for (const { mesh } of [...buckets.turret, ...buckets.gun, ...buckets.radar]) reparentKeepWorld(mesh, turret);

  const guns = buckets.gun.map(b => b.mesh);
  const dish = buckets.radar.map(b => b.mesh);

  // road wheels: split L/R by sign of X, order front→rear (front = -Z => ascending z)
  const wheelsL = [], wheelsR = [];
  const wheelEntries = buckets.wheel.slice().sort((a, b) => a.cz - b.cz);
  for (const w of wheelEntries) {
    const side = (w.cx >= center.x) ? wheelsR : wheelsL;
    if (side.length >= 6) continue; // guard against stray extra meshes
    const pivot = pivotAt(w.cx, w.cy, w.cz, `wheel ${side === wheelsL ? 'L' : 'R'}${side.length}`);
    pivot.userData.restY = w.cy; // axle rest height; the adapter adds suspension offset on top
    body.add(pivot); reparentKeepWorld(w.mesh, pivot);
    side.push(pivot);
  }

  const sprockets = buckets.sprocket.map(b => { const p = pivotAt(b.cx, b.cy, b.cz, 'sprocket'); body.add(p); reparentKeepWorld(b.mesh, p); return p; });
  const tracks = buckets.track.map(b => b.mesh); // mesh refs under body — not pivoted (no spin)

  // antenna whips: each gets its own base pivot for sway
  const antennas = buckets.antenna.map((b) => {
    tmp.setFromObject(b.mesh); tmp.getCenter(ctr);
    const baseY = (new THREE.Box3().setFromObject(b.mesh)).min.y;
    const pivot = pivotAt(ctr.x, baseY, ctr.z, 'antenna');
    body.add(pivot); reparentKeepWorld(b.mesh, pivot);
    return pivot;
  });

  // orient: model front is -Z; rotate the assembly so front faces world +Z
  root.rotation.y = Math.PI;

  if (wheelsL.length !== 6 || wheelsR.length !== 6) {
    console.warn(`[shilka-rig] wheel classification produced ${wheelsL.length}L/${wheelsR.length}R pivots (expected 6/side) — check classifyShilkaPart bounds against the loaded GLB.`);
  }
  return { root, body, turret, wheelsL, wheelsR, sprockets, tracks, guns, dish, antennas };
}
