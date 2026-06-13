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

export function makeChipStack(amount) {
  const g = new THREE.Group();
  setChipStack(g, amount);
  return g;
}

// Build (or rebuild) a chip stack for `amount`: one column per denomination, exact chip counts.
export function setChipStack(group, amount) {
  if (group.userData.amount === (amount | 0) && group.userData.skin === _skin) return group;
  for (let i = group.children.length - 1; i >= 0; i--) { const c = group.children[i]; group.remove(c); disposeTree(c); }
  group.userData.amount = amount | 0; group.userData.skin = _skin;
  // ONE narrow column (largest denomination at the bottom) → never wider than a single chip, so a stack
  // can't spill past the green felt no matter how big it gets; still exact (every chip is real).
  let k = 0;
  for (const { denom, count } of breakdown(amount)) {
    for (let i = 0; i < count; i++) { const chip = CHIP_SKINS[_skin](denom); chip.position.set(0, k * (T + GAP), 0); group.add(chip); k++; }
  }
  return group;
}

export const CHIP_SIZE = { r: R, t: T };
