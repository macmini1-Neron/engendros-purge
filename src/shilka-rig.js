// shilka-rig.js -- ЗСУ-23-4 GLB auto-rig: a PURE bbox part-classifier + a THREE re-parenter.
// The classifier is the source of truth shared with tools/shilka-rig-view.html (dev viewer).
// classifyShilkaPart works in the GLTFLoader-native (Y-up) space, the same space the viewer renders.

export const SHILKA_RIG_GROUPS = Object.freeze(['hull', 'track', 'wheel', 'sprocket', 'turret', 'gun', 'radar', 'antenna']);

// centre (cx,cy,cz) + size (sx,sy,sz) of a mesh's world AABB, model loaded raw (front = -Z).
export function classifyShilkaPart(cx, cy, cz, sx, sy, sz) {
  // low running gear
  if (sx < 0.30 && cy < 0.48 && sy >= 0.45 && sz >= 0.45 && sz < 0.75) return 'wheel'; // road wheels sit low (cy≈0.25); cy<0.48 leaves the RAISED rear drive sprocket (cy≈0.5) for the sprocket rule so the per-side 6-cap can't drop it (was: rear wheel vanished)
  if (sx < 0.30 && cy < 0.65 && sy >= 0.30 && sy < 0.48) return 'sprocket';
  if (sz > 3.5 && cy < 0.60 && sx < 0.6) return 'track';
  // whip antennas: tall + super-thin verticals -> own physics rig (NOT radar)
  if (sx < 0.14 && sz < 0.14 && sy > 0.60) return 'antenna';
  // 23 mm barrels: long in Z, thin both ways, at turret height, and on the turret CENTRELINE (cx≈-0.22) —
  // the cx gate keeps thin Z-long fender/skirt rails on the hull SIDES out of the gun bucket (they were
  // mis-rigged as barrels and flipped up on elevation).
  if (sz > 1.0 && cy >= 1.05 && cy <= 1.6 && sx < 0.5 && sy < 0.5 && Math.abs(cx - (-0.22)) < 0.6) return 'gun';
  // radar gun-dish drum: rear-top cluster only
  if (cy > 1.70 && cz > 0.45) return 'radar';
  // turret vs hull-deck: central compact = turret; side sponsons/fenders/engine deck = hull
  if (cy >= 1.0) {
    if (Math.abs(cx - (-0.22)) > 0.65) return 'hull';
    return 'turret';
  }
  return 'hull';
}

// Build a rig handle from the NAMED-NODE GLB (Blender-exported `zsu-23-4-named.glb`): turret,
// gun_elev, radar_disk, wheel_{L,R}0-5 nested under wheelarm_{L,R}0-5, idler/sprocket_{L,R},
// trackrig_{L,R} skinned belts, hatch_*. Walks by node NAME (no bbox classifier — classifyShilkaPart
// is kept only for the dev viewer). Wraps the whole model in a root (π re-orient: model front -Z →
// world +Z) + a tilting body so the adapter pitches/rolls the hull on one node. THREE is injected.
export function buildShilkaRig(modelScene, THREE) {
  modelScene.updateMatrixWorld(true);

  const root = new THREE.Group(); root.name = 'shilka rig root';
  const body = new THREE.Group(); body.name = 'shilka body (tilt)';
  root.add(body);

  // index named nodes + collect skinned belt meshes BEFORE re-parenting (references survive the move,
  // but modelScene.children empties out once we attach them under body, so do the traversal first).
  const byName = new Map();
  const tracks = [];
  modelScene.traverse((o) => {
    if (o.name && !byName.has(o.name)) byName.set(o.name, o);
    if (o.isSkinnedMesh) {
      const j0 = (o.skeleton && o.skeleton.bones[0]) ? o.skeleton.bones[0].name : '';
      o.userData.side = j0.indexOf('_R') >= 0 ? 'R' : 'L';
      tracks.push(o);
    }
  });
  const get = (n) => byName.get(n) || null;

  // re-home every top-level scene node under the tilting body (THREE.attach preserves world transform)
  for (const o of modelScene.children.slice()) body.attach(o);

  const turret = get('turret');
  const gun_elev = get('gun_elev');
  const guns = gun_elev ? [gun_elev] : [];   // elevate the gun_elev pivot (holds the barrels + mantlet)
  const radar = get('radar_disk');           // adapter spins this on Y each frame (RPK-2 «Тобол» scan)

  // road wheels (spin pivots) nested under wheel arms (suspension arc pivots), front→rear index 0-5
  const wheelsL = [], wheelsR = [], wheelarmL = [], wheelarmR = [];
  for (let i = 0; i < 6; i++) {
    const wl = get(`wheel_L${i}`), wr = get(`wheel_R${i}`);
    if (wl) { wl.userData.restY = wl.position.y; wheelsL.push(wl); }   // local Y; adapter adds susp. offset
    if (wr) { wr.userData.restY = wr.position.y; wheelsR.push(wr); }
    const al = get(`wheelarm_L${i}`), ar = get(`wheelarm_R${i}`);
    if (al) { al.userData.restRotX = al.rotation.x; wheelarmL.push(al); } // rest arm angle (Phase 4 arc)
    if (ar) { ar.userData.restRotX = ar.rotation.x; wheelarmR.push(ar); }
  }

  const sprockets = [get('sprocket_L'), get('sprocket_R')].filter(Boolean);
  const idlers = [get('idler_L'), get('idler_R')].filter(Boolean);
  for (const p of [...sprockets, ...idlers]) p.userData.side = p.name.endsWith('_R') ? 'R' : 'L';

  const beltL = get('trackrig_L'), beltR = get('trackrig_R'); // skinned-belt armatures (belt-bone handles)

  const dish = [];
  if (radar) radar.traverse((o) => { if (o.isMesh) dish.push(o); });

  const hatches = {
    driver: get('hatch_driver'), ammoL: get('hatch_ammo_L'),
    ammoR: get('hatch_ammo_R'), gunner: get('hatch_gunner'),
  };
  const antennas = []; // no separate antenna meshes in this rig yet → sway loop is a no-op until added

  // orient: model front is -Z; rotate the assembly so front faces world +Z
  root.rotation.y = Math.PI;

  if (wheelsL.length !== 6 || wheelsR.length !== 6) {
    console.warn(`[shilka-rig] named-node walk found ${wheelsL.length}L/${wheelsR.length}R wheels (expected 6/side) — check GLB node names.`);
  }
  return { root, body, turret, wheelsL, wheelsR, wheelarmL, wheelarmR, sprockets, idlers,
           tracks, guns, dish, radar, antennas, beltL, beltR, hatches };
}
