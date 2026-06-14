// Pure chip-skin registry — the swap seam the owner asked to prepare ("a CHIP_SKINS registry like the
// card backs"). NO THREE, NO DOM-at-import: skins are 2D-canvas PAINTERS, so the THREE texture layer
// (poker-chip-mesh.js) and the lobby swatch picker (poker-ui.js) both draw via drawChip() while this
// stays browser-free and node-unit-testable — mirroring the pure poker/cardatlas.js ↔ THREE
// poker-cards.js split (and CARD_BACKS in poker-cards.js, which this deliberately echoes).
//
// DESIGN RULE: a skin changes only the PATTERN. The denomination→colour map (DICE) is shared and
// canonical so a chip's colour always means the same value (readability — a player never has to relearn
// "which colour is $100"). Painters receive the fixed colours; they never pick their own. The Marx/Lenin
// portrait skins follow the same rule: the portrait is stamped in the SPOT colour, body stays per-denom.
import { PORTRAITS } from './chipportraits.js';

// per-denomination dice colours (CSS hex for canvas fillStyle): body + a contrasting spot/ring. White
// $5 gets navy spots (as a real 5-colour dice set does) so it doesn't vanish; $500 gets dark spots.
export const DICE = {
  5:   { body: '#e8e8e8', spot: '#24408f' }, // white
  10:  { body: '#2a52b0', spot: '#f0f0f0' }, // blue
  20:  { body: '#b02828', spot: '#f0f0f0' }, // red
  50:  { body: '#1f8040', spot: '#f0f0f0' }, // green
  100: { body: '#1a1a1a', spot: '#f0f0f0' }, // black
  500: { body: '#d8b84a', spot: '#141414' }, // yellow
};
export const denomColor = (d) => DICE[d] || DICE[100];

// ---- painters: paint(ctx, s, colors) fills the whole s×s top face. Geometry is in fractions of s so
// the same painter serves the 128px texture and the ~44px lobby swatch identically. ----
function ring(ctx, s, color, rFrac, wFrac) {
  ctx.strokeStyle = color; ctx.lineWidth = wFrac * s;
  ctx.beginPath(); ctx.arc(s / 2, s / 2, rFrac * s, 0, Math.PI * 2); ctx.stroke();
}
function dot(ctx, s, color, cxF, cyF, rFrac) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cxF * s, cyF * s, rFrac * s, 0, Math.PI * 2); ctx.fill();
}
function ticks(ctx, s, color, n, rIn, rOut, wFrac, phase = 0) {
  ctx.strokeStyle = color; ctx.lineWidth = wFrac * s;
  for (let i = 0; i < n; i++) {
    const a = phase + i * (Math.PI * 2) / n;
    ctx.beginPath();
    ctx.moveTo(s / 2 + Math.cos(a) * rIn * s, s / 2 + Math.sin(a) * rIn * s);
    ctx.lineTo(s / 2 + Math.cos(a) * rOut * s, s / 2 + Math.sin(a) * rOut * s);
    ctx.stroke();
  }
}
function star5(ctx, s, color, rOutF, rInF) {
  const cx = s / 2, cy = s / 2, ro = rOutF * s, ri = rInF * s;
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}
// n filled "edge tabs" (rounded-ish rects) at the rim — drawn as quads (no ctx transforms) so the
// painters stay runnable against a minimal stub context in node tests.
function tabs(ctx, s, color, n) {
  ctx.fillStyle = color;
  const rad = 0.45 * s, hl = 0.045 * s, hw = 0.05 * s; // half radial length, half tangential width
  for (let i = 0; i < n; i++) {
    const a = i * (Math.PI * 2) / n - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const cxp = s / 2 + ca * rad, cyp = s / 2 + sa * rad;
    ctx.beginPath();
    ctx.moveTo(cxp + ca * hl - sa * hw, cyp + sa * hl + ca * hw);
    ctx.lineTo(cxp + ca * hl + sa * hw, cyp + sa * hl - ca * hw);
    ctx.lineTo(cxp - ca * hl + sa * hw, cyp - sa * hl - ca * hw);
    ctx.lineTo(cxp - ca * hl - sa * hw, cyp - sa * hl + ca * hw);
    ctx.closePath(); ctx.fill();
  }
}
// decode a base64-packed 1-bit portrait mask into a {w,h,grid} of 0/1 bytes (cached). atob is standard
// in both browsers and node ≥16, so this stays pure + node-testable.
const _portraitCache = {};
function portraitGrid(id) {
  if (_portraitCache[id] !== undefined) return _portraitCache[id];
  const p = PORTRAITS[id];
  if (!p) return (_portraitCache[id] = null);
  const bin = atob(p.bits), grid = new Uint8Array(p.w * p.h);
  for (let i = 0; i < grid.length; i++) grid[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  return (_portraitCache[id] = { w: p.w, h: p.h, grid });
}

// skin v1 — the classic "dice" chip: inlay ring + 6 edge spots (verbatim from the original chipTexture).
function paintDice(ctx, s, c) {
  ctx.fillStyle = c.body; ctx.fillRect(0, 0, s, s);
  ring(ctx, s, c.spot, 40 / 128, 6 / 128);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    dot(ctx, s, c.spot, 0.5 + Math.cos(a) * 54 / 128, 0.5 + Math.sin(a) * 54 / 128, 7 / 128);
  }
}
// clean clay look: thin inlay ring + a ring of short rim dashes + a small centre pip.
function paintCasino(ctx, s, c) {
  ctx.fillStyle = c.body; ctx.fillRect(0, 0, s, s);
  ring(ctx, s, c.spot, 0.30, 4 / 128);
  ticks(ctx, s, c.spot, 12, 0.40, 0.47, 5 / 128);
  dot(ctx, s, c.spot, 0.5, 0.5, 0.055);
}
// Soviet star centre + 6 edge dashes (fits the game's theme).
function paintStar(ctx, s, c) {
  ctx.fillStyle = c.body; ctx.fillRect(0, 0, s, s);
  ring(ctx, s, c.spot, 0.42, 4 / 128);
  ticks(ctx, s, c.spot, 6, 0.40, 0.47, 5 / 128);
  star5(ctx, s, c.spot, 0.24, 0.10);
}
// pixel-art leader portrait (Marx / Lenin) — thin ring + 6 edge tabs (matching the reference art) + the
// portrait stamped in the spot colour. Body stays per-denomination so value colours read as always.
function paintPortrait(ctx, s, c, id) {
  ctx.fillStyle = c.body; ctx.fillRect(0, 0, s, s);
  ring(ctx, s, c.spot, 0.42, 4 / 128);
  tabs(ctx, s, c.spot, 6);
  const g = portraitGrid(id);
  if (!g) return;
  const fit = 0.64 * s, scale = fit / Math.max(g.w, g.h);
  const ox = (s - g.w * scale) / 2, oy = (s - g.h * scale) / 2, cell = scale + 0.6; // slight overlap = no seams
  ctx.fillStyle = c.spot;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.grid[y * g.w + x]) ctx.fillRect(ox + x * scale, oy + y * scale, cell, cell);
    }
  }
}

export const CHIP_SKINS = {
  dice:   { id: 'dice',   label: 'DICE',  paint: paintDice },
  casino: { id: 'casino', label: 'CLAY',  paint: paintCasino },
  star:   { id: 'star',   label: 'STAR',  paint: paintStar },
  marx:   { id: 'marx',   label: 'MARX',  paint: (ctx, s, c) => paintPortrait(ctx, s, c, 'marx') },
  lenin:  { id: 'lenin',  label: 'LENIN', paint: (ctx, s, c) => paintPortrait(ctx, s, c, 'lenin') },
};
export const CHIP_SKIN_LIST = ['dice', 'casino', 'star', 'marx', 'lenin']; // display order for the picker

// ---- lock / unlock (the leader portraits are crate-only cosmetics) ----
export const CHIP_SKINS_FREE = ['dice', 'casino', 'star'];   // available from the start
export const CHIP_SKINS_LOCKED = ['marx', 'lenin'];          // unlocked as a «Посылка» crate drop
// A skin is usable if it's free or in the player's owned list (meta.chipSkinsUnlocked).
export function chipSkinAvailable(id, owned) {
  return CHIP_SKINS_FREE.includes(id) || (Array.isArray(owned) && owned.includes(id));
}

// ---- chip-skin entries for the crate cosmetic pool (drained by poker/cosmetics.js, which merges these
// with the card backs under one drop chance). `tier` is CEREMONY PRESENTATION only (glow/pacing);
// `value` backs the duplicate→cash payout. ----
export const COSMETIC_DROP = [
  { skin: 'lenin', name: 'Lenin Chips', tier: 'epic',      value: 400, w: 2 },
  { skin: 'marx',  name: 'Marx Chips',  tier: 'legendary', value: 700, w: 1 },
];

let _skin = 'dice', _rev = 0;
// validates against the registry and bumps a revision on a real change (mirrors setCardBackSkin's guard;
// the rev lets already-built chip trays know to adopt the new materials — see poker-chips.js).
export function setChipSkin(name) { if (CHIP_SKINS[name] && name !== _skin) { _skin = name; _rev++; } return _skin; }
export function getChipSkin() { return _skin; }
export function chipSkinRev() { return _rev; }

// paint one chip's full top face at `size` px. Used by the THREE texture builder AND the lobby swatch.
export function drawChip(ctx, size, denom, skinId) {
  (CHIP_SKINS[skinId || _skin] || CHIP_SKINS.dice).paint(ctx, size, denomColor(denom));
}
