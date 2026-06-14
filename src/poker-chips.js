// 3D chip-stack view layer. THREE-only (browser). The pure denomination math lives in
// src/poker/chips.js (unit-tested); this turns an integer amount into a PHYSICAL stack whose chip
// count is exact — one column per denomination, largest nearest the player. "I added N" is real.
//
// The chip look mirrors the modelgen `models/poker-chip` "dice" spec (solid colour body + white inlay
// ring + 6 contrasting edge tabs). It is rebuilt procedurally here (not via buildSpec) because chips are
// mass-instanced, recoloured PER DENOMINATION, and disposed every rebuild — fresh geometry is the safe,
// cheap form; the modelgen spec stays the canonical/admin model + skin reference.
//
// SKINS: CHIP_SKINS is the swap registry the owner asked to prepare — v1 is 'dice'; a future skin just
// adds another builder and `setChipSkin('name')` swaps it everywhere.
import * as THREE from 'three';
import { breakdown } from './poker/chips.js';
import { DENOMS, sigOf } from './poker/chipbank.js';

const R = 0.020, T = 0.0033, GAP = 0.0006;                          // metres
const RING_R = 0.0122, RING_T = 0.0006, TAB_W = 0.0085, TAB_H = 0.0037, TAB_D = 0.007, TAB_R = 0.0165;

// per-denomination dice-chip colours: body + a contrasting spot/ring. White $1 gets navy spots (as the
// real 5-colour dice set does) so it doesn't vanish; the rest get white spots.
const DICE = {
  5:    { body: 0xe8e8e8, spot: 0x24408f }, // white  (navy spots so it doesn't vanish)
  10:   { body: 0x2a52b0, spot: 0xf0f0f0 }, // blue
  20:   { body: 0xb02828, spot: 0xf0f0f0 }, // red
  50:   { body: 0x1f8040, spot: 0xf0f0f0 }, // green
  100:  { body: 0x1a1a1a, spot: 0xf0f0f0 }, // black
  500:  { body: 0xd8b84a, spot: 0x141414 }, // yellow (dark spots for contrast)
};
const denomColor = (d) => DICE[d] || DICE[100];

function buildDiceChip({ body, spot }) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: body });
  const spotMat = new THREE.MeshLambertMaterial({ color: spot });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, 24), bodyMat);
  disc.position.y = T / 2; g.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, RING_T, 8, 32), spotMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = T; g.add(ring);  // flat inlay ring on the top face
  for (let i = 0; i < 6; i++) {                                     // 6 edge tabs (the "dice" spots)
    const th = i * Math.PI / 3;
    const tab = new THREE.Mesh(new THREE.BoxGeometry(TAB_W, TAB_H, TAB_D), spotMat);
    tab.position.set(Math.cos(th) * TAB_R, TAB_H / 2, Math.sin(th) * TAB_R);
    tab.rotation.y = Math.PI / 2 - th;                              // face radially outward
    g.add(tab);
  }
  return g;
}

// Skin registry — the seam for future chip designs. Each skin(denom) returns a floor-anchored chip Group.
export const CHIP_SKINS = {
  dice: (denom) => buildDiceChip(denomColor(denom)),
};
let _skin = 'dice';
export function setChipSkin(name) { if (CHIP_SKINS[name]) _skin = name; }

function disposeTree(o) {
  o.traverse?.((c) => { c.geometry?.dispose?.(); const m = c.material; if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else m?.dispose?.(); });
}

const COL_GAP = 2 * R + 0.0012;          // centre-to-centre spacing of columns (≈ chip Ø)
const ROW_GAP = 2 * R + 0.0016;          // spacing of rows (depth, when columns wrap)
const COL_CAP = 18;                      // chips per column before a new column starts (no stack "into space")
const COLS_PER_ROW = 6;                  // columns per row before wrapping to a row further back

// Build a physical chip tray from a real ChipSet ({denom:count}) — one column PER DENOMINATION,
// largest nearest the player's left, ordered like a real rack. This is the conserved path: it draws
// the actual chips the chipbank holds, never a breakdown() of a number, so "two greens stay two
// greens". Columns are centred about the group origin so the tray reads symmetrically wherever it
// is placed.
export function makeChipTray(chipSet) {
  const g = new THREE.Group();
  setChipTray(g, chipSet);
  return g;
}

export function setChipTray(group, chipSet) {
  chipSet = chipSet || {};
  const sig = sigOf(chipSet);
  if (group.userData.sig === sig && group.userData.skin === _skin) return group;
  for (let i = group.children.length - 1; i >= 0; i--) { const c = group.children[i]; group.remove(c); disposeTree(c); }
  group.userData.sig = sig; group.userData.skin = _skin; group.userData.amount = undefined;
  // one column per denomination, but CAP each column's height and overflow a tall denomination into
  // extra columns — a big win becomes several short stacks in a grid (rows back), never one column
  // shooting "into space". Columns stay grouped by denomination, largest-first, so colours read.
  const cols = [];                                              // flat list of { denom, n }
  for (const denom of DENOMS) {
    let rem = chipSet[denom] || 0;
    while (rem > 0) { const n = Math.min(rem, COL_CAP); cols.push({ denom, n }); rem -= n; }
  }
  const rows = Math.ceil(cols.length / COLS_PER_ROW) || 1;
  cols.forEach((c, idx) => {
    const row = Math.floor(idx / COLS_PER_ROW);
    const inRow = Math.min(COLS_PER_ROW, cols.length - row * COLS_PER_ROW);
    const x = (idx % COLS_PER_ROW - (inRow - 1) / 2) * COL_GAP; // centre each row on x
    const z = (row - (rows - 1) / 2) * ROW_GAP;                 // centre the rows on z (depth)
    for (let i = 0; i < c.n; i++) {
      const chip = CHIP_SKINS[_skin](c.denom);
      chip.position.set(x, i * (T + GAP), z);
      group.add(chip);
    }
  });
  return group;
}

// Back-compat / fallback: derive a ChipSet from an integer (greedy breakdown) and draw it as a tray.
// Used by the 2D path and as a defensive fallback when no chipbank multiset is available — the 3D
// table feeds setChipTray real multisets instead.
export function makeChipStack(amount) {
  const g = new THREE.Group();
  setChipStack(g, amount);
  return g;
}

export function setChipStack(group, amount) {
  const set = {};
  for (const { denom, count } of breakdown(amount)) set[denom] = count;
  return setChipTray(group, set);
}

export const CHIP_SIZE = { r: R, t: T };
