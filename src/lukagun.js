// lukagun.js — load the real Blender "money gun" (revolving 4-barrel flintlock)
// GLB and hand it to Luka in phase 4, WITH its baked animations.
//
// The pistol is a high-poly PBR model (gold/ivory/copper, MeshStandardMaterial),
// unlike the rest of the game's voxel Lambert art — so the scene needs an
// environment map (Engine adds a cheap PMREM env) or the metal reads near-black.
//
// buildLukaGun() is SYNCHRONOUS and returns a clone of a preloaded template plus
// the AnimationClips — call preloadLukaGun() once at init and let it resolve
// before Luka reaches phase 4. Until it's ready, enemies.js falls back to the
// voxel buildMoneyGun().
//
// Conventions: the GLB has the muzzle along +X and up along +Y (Blender Z-up →
// glTF Y-up). The template is scale-normalised to length 1.0 and centred on its
// bbox; a 'muzzle' marker sits at the +X tip. All gun ORIENTATION (so the muzzle
// points along Luka's aim) is applied by the caller in enemies.js, in one place,
// so it's easy to tune against a render.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

// resolved relative to THIS module (src/), so it works from the game (root index.html),
// the standalone preview, and the /bosses/ sandbox alike.
const GLB_URL = new URL('../assets/modely/revolving_4barrel_pistol.glb', import.meta.url).href;

// Bore interiors must read as DARK hollow holes. The iron liner is metallic, so under the
// scene's warm gold PMREM env it MIRRORS gold and the bore looks gold-filled. A dark, matte,
// non-metallic override stays dark regardless of env → a believable hollow bore.
const BORE_MAT = new THREE.MeshStandardMaterial({ color: 0x111317, metalness: 0.0, roughness: 0.95 });

let TEMPLATE = null;   // rigged THREE.Group template (clone per instance)
let CLIPS = null;      // AnimationClip[] from the GLB
let _loading = null;

export function preloadLukaGun() {
  if (TEMPLATE) return Promise.resolve(TEMPLATE);
  if (_loading) return _loading;
  _loading = new Promise((resolve, reject) => {
    new GLTFLoader().load(GLB_URL,
      (gltf) => { try { TEMPLATE = buildTemplate(gltf.scene); CLIPS = gltf.animations || []; resolve(TEMPLATE); } catch (e) { reject(e); } },
      undefined,
      (err) => { console.warn('[lukagun] GLB load failed — voxel fallback in use', err); reject(err); });
  });
  return _loading;
}

export function lukaGunReady() { return !!TEMPLATE; }

// ── Build the normalised template from the raw GLB scene ──
function buildTemplate(model) {
  const v = () => new THREE.Vector3();

  // 0. drop the Blender scene's ground plane + loose decorative coins — they're not
  //    part of the gun and otherwise blow up the bbox (→ wrong scale/centre).
  for (const name of ['Ground', 'COINS_Copper', 'COINS_Dollar']) {
    const o = model.getObjectByName(name);
    if (o && o.parent) o.parent.remove(o);
  }

  // 1. scale to unit length (longest axis = the barrels, along X)
  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(v());
  const len = Math.max(size.x, size.y, size.z) || 1;
  model.scale.setScalar(1 / len);
  model.updateMatrixWorld(true);

  // 2. centre on bbox (caller positions the grip via the hand anchor)
  box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(v());
  model.position.sub(c);
  model.updateMatrixWorld(true);

  // 3. no shadows (matches tankglb + keeps the 2-pass pixel look clean)
  model.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = false; } });

  // 3b. force bore interiors (IronBore_*, BoreEnd_*) dark so they don't mirror the gold env
  model.traverse(o => { if (o.isMesh && /bore/i.test(o.name)) o.material = BORE_MAT; });

  // 4. wrap so the caller transforms a stable handle; animations still target
  //    the named nodes (BARREL_PIVOT, COCK_PIVOT…) inside `model`.
  const root = new THREE.Group();
  root.name = 'lukaGun';
  root.add(model);

  // 5. muzzle marker at the +X barrel tip, on the TOP barrel (the one that fires) —
  //    not the cluster centre. The marker does NOT rotate with the barrels, so effects
  //    always emit from the top position while the barrels spin under it.
  box = new THREE.Box3().setFromObject(root);
  root.updateMatrixWorld(true);
  let topY = 0, topZ = 0, best = -1e9;
  model.traverse(o => {
    if (o.isMesh && /^BoreTube/.test(o.name)) {
      const p = o.getWorldPosition(v());
      if (p.y > best) { best = p.y; topY = p.y; topZ = p.z; }
    }
  });
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(box.max.x, topY, topZ);
  root.add(muzzle);

  return root;
}

// Returns { root, clips } — root is a fresh clone, clips are shared (read-only).
// AnimationMixer(root) binds clips by node name within the clone, so cloning is safe.
export function buildLukaGun() {
  if (!TEMPLATE) return null;
  return { root: TEMPLATE.clone(true), clips: CLIPS || [] };
}
