// 3D playing-card view layer for the poker table. THREE + canvas (browser-only).
// Faces are drawn ONCE into a shared 13x4 CanvasTexture atlas (ranks x suits); every card mesh
// samples its own cell via UVs (see src/poker/cardatlas.js for the pure index/UV math, unit-tested).
// The BACK is a separate texture chosen from a SKIN REGISTRY — v1 ships one custom back, but the
// registry + runtime swap (setCardBackSkin) is the seam for future card-back skins.
import * as THREE from 'three';
import { RANKS, SUITS } from './poker/cards.js';
import { ATLAS_COLS, ATLAS_ROWS, cardAtlasIndex, atlasUVRect } from './poker/cardatlas.js';

const CELL_W = 132, CELL_H = 184;            // px per atlas cell (poker 63x88mm ≈ 0.716 ratio)
const SUIT_GLYPH = { c: '♣', d: '♦', h: '♥', s: '♠' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rankLabel = (r) => RANK_LABEL[r] || String(r);
const CARD_W = 0.063, CARD_H = 0.088, CARD_T = 0.0009; // metres

// ---------- shared face atlas ----------
let _atlasTex = null;
function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = CELL_W * ATLAS_COLS; cv.height = CELL_H * ATLAS_ROWS;
  const ctx = cv.getContext('2d');
  for (const s of SUITS) {
    for (const r of RANKS) {
      const i = cardAtlasIndex({ r, s });
      const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
      drawFace(ctx, col * CELL_W, row * CELL_H, r, s);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}
function drawFace(ctx, x, y, r, s) {
  const red = s === 'h' || s === 'd';
  const pad = 7, w = CELL_W, h = CELL_H;
  ctx.save(); ctx.translate(x, y);
  roundRect(ctx, pad, pad, w - 2 * pad, h - 2 * pad, 12);
  ctx.fillStyle = '#f5f1e6'; ctx.fill();
  ctx.strokeStyle = '#cabfa3'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = red ? '#c01a1a' : '#1a1a1a';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // corner index (top-left + rotated bottom-right)
  ctx.font = 'bold 34px Georgia, serif';
  const lab = rankLabel(r);
  corner(ctx, lab, SUIT_GLYPH[s], pad + 16, pad + 24);
  ctx.save(); ctx.translate(w - pad - 16, h - pad - 24); ctx.rotate(Math.PI);
  corner(ctx, lab, SUIT_GLYPH[s], 0, 0); ctx.restore();
  // big centre pip
  ctx.font = '78px Georgia, serif'; ctx.fillText(SUIT_GLYPH[s], w / 2, h / 2 + 4);
  ctx.restore();
}
function corner(ctx, rank, suit, cx, cy) {
  ctx.save(); ctx.translate(cx, cy);
  ctx.font = 'bold 30px Georgia, serif'; ctx.fillText(rank, 0, 0);
  ctx.font = '26px Georgia, serif'; ctx.fillText(suit, 0, 28);
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function cardAtlasTexture() { if (!_atlasTex) _atlasTex = buildAtlas(); return _atlasTex; }

// ---------- back skin registry ----------
export const CARD_BACKS = {
  default(ctx, w, h) {
    ctx.fillStyle = '#5a1e16'; ctx.fillRect(0, 0, w, h);
    roundRect(ctx, 6, 6, w - 12, h - 12, 12); ctx.fillStyle = '#7a2a20'; ctx.fill();
    ctx.strokeStyle = '#d8b066'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(216,176,102,.55)'; ctx.lineWidth = 2;
    for (let i = -h; i < w; i += 14) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); }
    ctx.fillStyle = '#d8b066'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 16, 0, Math.PI * 2); ctx.fill();
  },
};
let _backSkin = 'default';
const _backCache = {};
export function setCardBackSkin(name) { if (CARD_BACKS[name]) _backSkin = name; }
function cardBackTexture() {
  if (_backCache[_backSkin]) return _backCache[_backSkin];
  const cv = document.createElement('canvas'); cv.width = CELL_W; cv.height = CELL_H;
  CARD_BACKS[_backSkin](cv.getContext('2d'), CELL_W, CELL_H);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  _backCache[_backSkin] = tex; return tex;
}

// ---------- card mesh ----------
// A thin card: a front plane (atlas face, +Y) + a back plane (skin, -Y) + a slim edge box. The whole
// group lies flat; show face-down by flipping it PI about X (also the natural flip animation pivot).
export function makeCardMesh() {
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ map: cardAtlasTexture(), toneMapped: false }));
  front.rotation.x = -Math.PI / 2; front.position.y = CARD_T / 2 + 0.0001;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ map: cardBackTexture(), toneMapped: false }));
  back.rotation.x = Math.PI / 2; back.position.y = -CARD_T / 2 - 0.0001;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H),
    new THREE.MeshLambertMaterial({ color: 0xece6d4 }));
  g.add(edge, front, back);
  g.userData.front = front;
  setCardFace(g, { r: 14, s: 's' });
  return g;
}

// Point the front plane's UVs at a given card's atlas cell (flip V for THREE's bottom-origin / flipY).
export function setCardFace(cardGroup, card) {
  const front = cardGroup.userData.front; if (!front || !card) return;
  const { u0, u1, v0, v1 } = atlasUVRect(cardAtlasIndex(card));
  const V0 = 1 - v1, V1 = 1 - v0; // canvas row 0 is top; flipY maps it to V=1
  const uv = front.geometry.attributes.uv;
  uv.setXY(0, u0, V1); uv.setXY(1, u1, V1); uv.setXY(2, u0, V0); uv.setXY(3, u1, V0);
  uv.needsUpdate = true;
  cardGroup.userData.card = card;
}

export const CARD_SIZE = { w: CARD_W, h: CARD_H, t: CARD_T };
