// 3D chip-stack view layer. THREE-only (browser). The pure denomination math lives in
// src/poker/chips.js + the pure LAYOUT math in src/poker/chiplayout.js (both unit-tested);
// this turns a real ChipSet into a PHYSICAL stack whose chip count is EXACT — never a
// number approximated. "I added N" is real.
//
// Each denomination is drawn as ONE InstancedMesh (src/poker-chip-mesh.js): a single
// low-poly cylinder with the dice ring + spots baked into its texture. A full tray is a
// handful of draw calls instead of hundreds of meshes, so the real conserved count from
// chipbank.js renders cheaply. setChipTray keeps the old public API.
import * as THREE from 'three';
import { breakdown } from './poker/chips.js';
import { DENOMS, sigOf } from './poker/chipbank.js';
import { layoutChips, pileLayout } from './poker/chiplayout.js';
import { chipInstanced, CHIP_GEO_T } from './poker-chip-mesh.js';

const CAP = 256;                 // max instances per denomination per tray (a tall single-colour stack)
const _dummy = new THREE.Object3D();

// Build a physical chip tray from a real ChipSet ({denom:count}). opts: { jitter, seed }
// — seeded position/rotation jitter so stacks read hand-stacked, stable across rebuilds.
export function makeChipTray(chipSet, opts) { const g = new THREE.Group(); setChipTray(g, chipSet, opts); return g; }

export function setChipTray(group, chipSet, opts = {}) {
  chipSet = chipSet || {};
  const sig = sigOf(chipSet) + '|' + (opts.jitter || 0) + '|' + (opts.seed || 0) + (opts.pile ? '|P' : '');
  if (group.userData.sig === sig) return group;
  group.userData.sig = sig;
  if (!group.userData.inst) {                                  // lazily mint one InstancedMesh per denomination
    group.userData.inst = {};
    for (const d of DENOMS) { const im = chipInstanced(d, CAP); group.add(im); group.userData.inst[d] = im; }
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
  for (const d of DENOMS) { const im = group.userData.inst[d]; im.count = counters[d]; im.instanceMatrix.needsUpdate = true; }
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
