// 3D chip-stack view layer. THREE-only (browser). The pure denomination math lives in
// src/poker/chips.js + the pure LAYOUT math in src/poker/chiplayout.js (both unit-tested);
// this turns a real ChipSet into a PHYSICAL stack whose chip count is EXACT — never a
// number approximated. "I added N" is real.
//
// Each denomination is drawn as ONE InstancedMesh (src/poker-chip-mesh.js): a single
// low-poly cylinder with the chosen skin's top-face design (ring+spots / star / portrait) baked in. A full tray is a
// handful of draw calls instead of hundreds of meshes, so the real conserved count from
// chipbank.js renders cheaply. setChipTray keeps the old public API.
import * as THREE from 'three';
import { breakdown } from './poker/chips.js';
import { DENOMS, sigOf, skinValueByDenom } from './poker/chipbank.js';
import { layoutChips, pileLayout, assignSkins } from './poker/chiplayout.js';
import { chipInstanced, chipMaterial, CHIP_GEO_T } from './poker-chip-mesh.js';
import { getChipSkin } from './poker/chipskins.js';

const CAP = 256;                 // max instances per denomination per tray (a tall single-colour stack)
const _dummy = new THREE.Object3D();

// Build a physical chip tray from a real ChipSet ({denom:count}). opts: { jitter, seed, pile, skin }
// — seeded position/rotation jitter so stacks read hand-stacked, stable across rebuilds. `skin` overrides
// the chip top-face design PER TRAY (so each player's stack/bet can wear that player's own skin); omit it
// to follow the global getChipSkin() (the local player's pick).
export function makeChipTray(chipSet, opts) { const g = new THREE.Group(); setChipTray(g, chipSet, opts); return g; }

export function setChipTray(group, chipSet, opts = {}) {
  chipSet = chipSet || {};
  const skin = opts.skin || getChipSkin();                     // explicit per-tray skin (a player's choice) or the global default
  const sig = sigOf(chipSet) + '|' + (opts.jitter || 0) + '|' + (opts.seed || 0) + (opts.pile ? '|P' : '') + (opts.layoutRef ? '|r' + sigOf(opts.layoutRef) : '') + '|s' + skin;
  if (group.userData.sig === sig) return group;
  group.userData.sig = sig;
  if (!group.userData.inst) {                                  // lazily mint one InstancedMesh per denomination
    group.userData.inst = {};
    // frustumCulled OFF: an InstancedMesh keeps the geometry's origin-centred bounding sphere, which does NOT
    // cover instances spread across the tray — so a tray placed where the frustum is narrow (e.g. the bet heap)
    // would wrongly cull every chip but the centre one. The trays are tiny (a handful of draw calls), so just
    // skip culling them.
    for (const d of DENOMS) { const im = chipInstanced(d, CAP, skin); im.frustumCulled = false; group.add(im); group.userData.inst[d] = im; }
    group.userData.skin = skin;
  } else if (group.userData.skin !== skin) {                   // this tray's skin changed → its meshes adopt the new materials
    group.userData.skin = skin;
    for (const d of DENOMS) group.userData.inst[d].material = chipMaterial(d, skin);
  }
  const places = opts.pile ? pileLayout(chipSet, opts) : layoutChips(chipSet, opts); // pile = loose tossed heap; else tidy columns
  const counters = {};
  for (const d of DENOMS) counters[d] = 0;
  for (const p of places) {
    const n = counters[p.denom];
    if (n >= CAP) continue;                                    // guard: never overflow the instance buffer
    const im = group.userData.inst[p.denom];
    _dummy.position.set(p.x, p.y + CHIP_GEO_T / 2, p.z);       // +half-thickness so the bottom chip rests ON the felt
    _dummy.rotation.set(p.tiltX || 0, p.rot || 0, p.tiltZ || 0); // pile chips carry a small tilt (tossed); columns just a Y lean
    _dummy.scale.setScalar(1);
    _dummy.updateMatrix();
    im.setMatrixAt(n, _dummy.matrix);
    counters[p.denom] = n + 1;
  }
  // boundingSphere=null forces three.js to recompute it from the CURRENT instances on the next raycast.
  // InstancedMesh.raycast caches the sphere once and uses it as a hard early-out; without this a tray that
  // GROWS after its sphere was first cached (your stack regrowing as you pull the raise slider back down,
  // the live bet heap swelling) loses its hover hitbox beyond the stale radius — only the base stayed clickable.
  for (const d of DENOMS) { const im = group.userData.inst[d]; im.count = counters[d]; im.instanceMatrix.needsUpdate = true; im.boundingSphere = null; }
  return group;
}

// MULTI-SKIN tray — the flagship pot/stack render. `skinMap` = { skinId: ChipSet } (the cosmetic
// provenance ledger from chipbank). Lays out ONE coherent heap/stack from the aggregate, then mints one
// InstancedMesh per (denom, skin) bucket so chips of different owners' skins sit interleaved in the same
// columns — a pot of Marx+Lenin chips reads as a mix, a winner's stack shows the skins they won. Buckets
// are reused across rebuilds of the same group; each carries `mesh.userData.pkBucket = {denom,skin}` for hover.
export function makeMultiSkinTray(skinMap, opts) { const g = new THREE.Group(); setMultiSkinTray(g, skinMap, opts); return g; }

export function setMultiSkinTray(group, skinMap, opts = {}) {
  skinMap = skinMap || {};
  const skins = Object.keys(skinMap).sort();
  const sig = 'M|' + skins.map((s) => s + ':' + sigOf(skinMap[s])).join('/') + '|' + (opts.jitter || 0) + '|' + (opts.seed || 0) + (opts.pile ? '|P' : '') + (opts.layoutRef ? '|r' + sigOf(opts.layoutRef) : '');
  if (group.userData.sig === sig) return group;
  group.userData.sig = sig;
  group.userData.multiskin = true;
  if (!group.userData.imBy) { group.userData.imBy = {}; group.userData.buckets = []; }
  for (const k in group.userData.imBy) group.userData.imBy[k].count = 0;     // reset; refill below (reuse meshes)
  const agg = skinValueByDenom(skinMap);                                     // the real ChipSet → one shared layout
  const places = assignSkins(opts.pile ? pileLayout(agg, opts) : layoutChips(agg, opts), skinMap);
  const counters = {};
  for (const p of places) {
    const key = p.denom + '|' + p.skin;
    let im = group.userData.imBy[key];
    if (!im) {
      im = chipInstanced(p.denom, CAP, p.skin); im.frustumCulled = false;
      im.userData.pkBucket = { denom: p.denom, skin: p.skin };
      group.add(im); group.userData.imBy[key] = im; group.userData.buckets.push({ denom: p.denom, skin: p.skin, mesh: im });
    }
    const n = counters[key] || 0;
    if (n >= CAP) continue;
    _dummy.position.set(p.x, p.y + CHIP_GEO_T / 2, p.z);
    _dummy.rotation.set(p.tiltX || 0, p.rot || 0, p.tiltZ || 0);
    _dummy.scale.setScalar(1); _dummy.updateMatrix();
    im.setMatrixAt(n, _dummy.matrix);
    counters[key] = n + 1;
  }
  for (const k in group.userData.imBy) { const im = group.userData.imBy[k]; im.count = counters[k] || 0; im.instanceMatrix.needsUpdate = true; im.boundingSphere = null; }
  return group;
}

// Back-compat / fallback: derive a ChipSet from an integer (greedy breakdown) and draw it.
// Used by the 2D path and defensively when no chipbank multiset is available — the 3D
// table feeds setChipTray real multisets instead.
export function makeChipStack(amount, opts) { const g = new THREE.Group(); setChipStack(g, amount, opts); return g; }
export function setChipStack(group, amount, opts) {
  const set = {};
  for (const { denom, count } of breakdown(amount)) set[denom] = count;
  return setChipTray(group, set, opts);
}

export const CHIP_SIZE = { r: 0.020, t: CHIP_GEO_T };
