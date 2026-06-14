// Pure card-back skin registry — the swap seam for the back face of the playing cards. NO THREE / NO
// DOM-at-import: backs are 2D-canvas PAINTERS, so the THREE card layer (poker-cards.js) and the lobby
// swatch picker (poker-ui.js) both draw via drawCardBack() while this stays node-unit-testable. Mirrors
// poker/chipskins.js exactly (same lock/unlock + crate-drop model). Designs here are PLACEHOLDER art —
// the registry/wiring is the point; prettier backs just drop in as new entries later.

// helpers (fractions of the cell so one painter serves the 132×184 texture and the small swatch alike)
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function star5(ctx, cx, cy, ro, ri, color) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}
function frame(ctx, w, h, bg, panel, edge) {            // shared base: filled cell + inset panel + edge line
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  roundRect(ctx, 6, 6, w - 12, h - 12, 12); ctx.fillStyle = panel; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 3; ctx.stroke();
}

// ---- placeholder painters: paint(ctx, w, h) fills the back face ----
function paintDefault(ctx, w, h) {                      // the original red diagonal-line back (unchanged look)
  frame(ctx, w, h, '#5a1e16', '#7a2a20', '#d8b066');
  ctx.strokeStyle = 'rgba(216,176,102,.55)'; ctx.lineWidth = 2;
  for (let i = -h; i < w; i += 14) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); }
  ctx.fillStyle = '#d8b066'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 16, 0, Math.PI * 2); ctx.fill();
}
function paintAzure(ctx, w, h) {                        // placeholder: blue crosshatch + centre diamond
  frame(ctx, w, h, '#13314f', '#1c4470', '#9fc3e8');
  ctx.strokeStyle = 'rgba(159,195,232,.5)'; ctx.lineWidth = 2;
  for (let i = -h; i < w; i += 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke(); }
  ctx.fillStyle = '#9fc3e8'; ctx.beginPath();
  ctx.moveTo(w / 2, h / 2 - 18); ctx.lineTo(w / 2 + 14, h / 2); ctx.lineTo(w / 2, h / 2 + 18); ctx.lineTo(w / 2 - 14, h / 2); ctx.closePath(); ctx.fill();
}
function paintRedStar(ctx, w, h) {                      // placeholder (locked): dark field + Soviet star
  frame(ctx, w, h, '#3a0e0a', '#5a1411', '#e0b24a');
  star5(ctx, w / 2, h / 2, 30, 12, '#e0b24a');
}
function paintEmblem(ctx, w, h) {                       // placeholder (locked): olive field + ring emblem
  frame(ctx, w, h, '#243018', '#33401f', '#c7d08a');
  ctx.strokeStyle = '#c7d08a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(w / 2, h / 2, 24, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#c7d08a'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 8, 0, Math.PI * 2); ctx.fill();
}

export const CARD_BACKS = {
  default: { id: 'default', label: 'CLASSIC', paint: paintDefault },
  azure:   { id: 'azure',   label: 'AZURE',   paint: paintAzure },
  redstar: { id: 'redstar', label: 'RED STAR', paint: paintRedStar },
  emblem:  { id: 'emblem',  label: 'EMBLEM',  paint: paintEmblem },
};
export const CARD_BACK_LIST = ['default', 'azure', 'redstar', 'emblem']; // display order for the picker

// ---- lock / unlock (mirrors chipskins) ----
export const CARD_BACKS_FREE = ['default', 'azure'];     // available from the start
export const CARD_BACKS_LOCKED = ['redstar', 'emblem'];  // unlocked as a «Посылка» crate drop
export function cardBackAvailable(id, owned) {
  return CARD_BACKS_FREE.includes(id) || (Array.isArray(owned) && owned.includes(id));
}

// ---- dedicated cosmetic crate pool (drained by poker/cosmetics.js alongside the chip skins) ----
export const CARD_BACK_DROP = [
  { back: 'redstar', name: 'Red Star Deck', tier: 'epic',      value: 350, w: 2 },
  { back: 'emblem',  name: 'Emblem Deck',   tier: 'legendary', value: 600, w: 1 },
];

let _back = 'default', _rev = 0;
export function setCardBackSkin(name) { if (CARD_BACKS[name] && name !== _back) { _back = name; _rev++; } return _back; }
export function getCardBackSkin() { return _back; }
export function cardBackRev() { return _rev; }

// paint one card's back face into a 2D context (used by the THREE texture builder AND the lobby swatch).
export function drawCardBack(ctx, w, h, id) {
  (CARD_BACKS[id || _back] || CARD_BACKS.default).paint(ctx, w, h);
}
