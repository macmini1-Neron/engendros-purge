// textures.js — procedural tiled textures for buildings (DOM canvas only; NO three).
// Law 8: ALL randomness comes from the seeded makeRNG family — the same spec must render
// pixel-identical across runs (render diffs between build rounds stay meaningful).
// Generators are keyed by the palette entry's `tex` field; each returns an HTMLCanvasElement
// that tiles seamlessly (the interp maps it with metric UVs + RepeatWrapping + repeat 1).
import { makeRNG } from '../util.js';

// stable per-material seed: spec.seed × a small string hash, so two materials in one
// building don't share a random stream (and stay deterministic).
function matSeed(seed, name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return (seed ^ h) >>> 0;
}

const GEN = {
  // Brick courses: tile 0.45×0.30 m ≈ 3 stretchers × 4 courses (75 mm course). Half-bond offset.
  brick(rng, t, S) {
    const x = ctx2d(S, t.tones.slot);                       // mortar field
    const rows = 4, cols = 3, bh = S / rows, bw = S / cols, m = Math.max(1, S / 128);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (bw / 2);
      for (let c = -1; c < cols + 1; c++) {
        const px = c * bw + off, py = r * bh;
        const roll = rng();
        const tone = roll < 0.08 ? t.tones.bright : roll < 0.2 ? t.tones.hi : roll < 0.85 ? t.tones.mid : t.tones.lo;
        x.fillStyle = tone;
        x.fillRect(px + m, py + m, bw - 2 * m, bh - 2 * m);
        if (rng() < 0.3) {                                  // weathered lower edge on some bricks
          x.fillStyle = t.tones.lo;
          x.fillRect(px + m, py + bh - 3 * m, bw - 2 * m, 2 * m);
        }
      }
    }
    speckle(x, rng, S, t.tones.slot, 30);
    return x.canvas;
  },

  // One precast concrete panel per tile (3.0×2.8 m): field + seam grooves on the borders.
  panelGrid(rng, t, S) {
    const x = ctx2d(S, t.tones.mid);
    speckle(x, rng, S, t.tones.hi, 220);
    speckle(x, rng, S, t.tones.lo, 220);
    for (let i = 0; i < 5; i++) {                           // rain streaks
      const sx = rng() * S, sw = 2 + rng() * 5, sh = S * (0.25 + rng() * 0.5);
      x.fillStyle = t.tones.lo; x.globalAlpha = 0.25;
      x.fillRect(sx, 0, sw, sh);
      x.globalAlpha = 1;
    }
    const g = Math.max(2, S / 64);                          // seam grooves (panel joints)
    x.fillStyle = t.tones.slot;
    x.fillRect(0, 0, S, g); x.fillRect(0, S - g, S, g);
    x.fillRect(0, 0, g, S); x.fillRect(S - g, 0, g, S);
    x.fillStyle = t.tones.bright;                           // lit groove lip
    x.fillRect(0, g, S, 1); x.fillRect(g, 0, 1, S);
    return x.canvas;
  },

  // Corrugated sheet: vertical ribs (hi edge / mid face / lo shadow), occasional rust run.
  corrugated(rng, t, S) {
    const x = ctx2d(S, t.tones.mid);
    const rib = Math.max(4, S / 16);
    for (let px = 0; px < S; px += rib) {
      x.fillStyle = t.tones.hi; x.fillRect(px, 0, Math.ceil(rib * 0.25), S);
      x.fillStyle = t.tones.mid; x.fillRect(px + rib * 0.25, 0, Math.ceil(rib * 0.5), S);
      x.fillStyle = t.tones.lo; x.fillRect(px + rib * 0.75, 0, Math.ceil(rib * 0.25), S);
    }
    for (let i = 0; i < 4; i++) {                           // rust streaks from fixings
      if (rng() < 0.5) continue;
      const sx = Math.floor(rng() * S), sy = Math.floor(rng() * S * 0.4), sh = S * (0.2 + rng() * 0.4);
      x.fillStyle = t.tones.slot; x.globalAlpha = 0.35;
      x.fillRect(sx, sy, 2 + rng() * 3, sh);
      x.globalAlpha = 1;
    }
    return x.canvas;
  },

  // Weathered stucco: blotches + hairline cracks + a spalled patch or two.
  plaster(rng, t, S) {
    const x = ctx2d(S, t.tones.mid);
    for (let i = 0; i < 24; i++) {
      x.fillStyle = rng() < 0.5 ? t.tones.hi : t.tones.lo;
      x.globalAlpha = 0.12 + rng() * 0.12;
      const bx = rng() * S, by = rng() * S, br = S * (0.05 + rng() * 0.15);
      x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill();
      x.globalAlpha = 1;
    }
    x.strokeStyle = t.tones.slot; x.lineWidth = 1;
    for (let i = 0; i < 3; i++) {                           // cracks
      let cx = rng() * S, cy = 0;
      x.beginPath(); x.moveTo(cx, cy);
      while (cy < S * (0.4 + rng() * 0.5)) { cx += (rng() - 0.5) * S * 0.08; cy += S * 0.07; x.lineTo(cx, cy); }
      x.stroke();
    }
    speckle(x, rng, S, t.tones.lo, 40);
    return x.canvas;
  },
};

function ctx2d(S, bg) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, S, S);
  return x;
}

function speckle(x, rng, S, tone, n) {
  x.fillStyle = tone;
  for (let i = 0; i < n; i++) x.fillRect(Math.floor(rng() * S), Math.floor(rng() * S), 1 + (rng() < 0.3 ? 1 : 0), 1);
}

export function makeTextureCanvas(name, entry, seed) {
  const gen = GEN[entry.tex];
  if (!gen) throw new Error(`buildgen textures: no generator '${entry.tex}' for material '${name}'`);
  return gen(makeRNG(matSeed(seed ?? 1, name)), entry, entry.canvas ?? 256);
}

// Painted Cyrillic board for sign/stencil parts (one canvas per distinct text).
export function makeSignCanvas(text, entry, opts = {}) {
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = entry.bg; x.fillRect(0, 0, W, H);
  x.strokeStyle = entry.fg; x.lineWidth = 6;
  x.strokeRect(8, 8, W - 16, H - 16);
  x.fillStyle = entry.fg;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let size = 72; size >= 24; size -= 8) {              // largest size that fits
    x.font = `bold ${size}px 'Arial Black', sans-serif`;
    if (x.measureText(text).width <= W - 48) break;
  }
  x.fillText(text, W / 2, H / 2 + 2);
  return c;
}
