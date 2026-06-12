// clockface.js — live green VFD display for the «Электроника 6.15М» desk clock.
//
// The PHYSICAL clock body is a modelgen voxel prop (models/electronika-clock). THIS module
// is the live readout that glows on its smoked-black front panel: a custom 7-segment renderer
// painted into a CanvasTexture, shown on an unlit (self-lit) plane so the green reads as a
// vacuum-fluorescent glow regardless of world lighting. NEAREST filtering keeps the segments
// crisp and pixelly (the retro VFD look).
//
// SHARED TIME SYSTEM: this digital face and the parallel analog wall clock both read the SAME
// source of truth — the game world clock. Feed setTime() the string from
//   formatHHMM(game._worldClock.minuteOfDay())   // src/worldclock.js → "HH:MM"
// so the readout is 1:1 with game time. This module renders time; it does not own it.
import * as THREE from 'three';

// 7-segment truth table. Segments: a=top, b=top-right, c=bottom-right, d=bottom,
// e=bottom-left, f=top-left, g=middle.
const SEG = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  ' ': '', '-': 'g',
};

// VFD palette — emerald «Электроника» green on near-black.
const C = {
  bg:      '#02060a',   // smoked-panel black (very slightly blue-green)
  on:      '#56ff7e',   // lit segment core
  onGlow:  '#1bff5a',   // bloom colour
  ghost:   'rgba(40,150,70,0.10)', // unlit segment faint ghost (authentic VFD tell)
  logo:    'rgba(150,200,160,0.45)',
};

// Draw one 7-segment digit into the 2D context. (ox,oy)=top-left of the digit cell,
// w/h = cell size, t = segment thickness. Lit segments come from `on` (a string of seg ids).
function drawDigit(ctx, ox, oy, w, h, t, on, withGhost) {
  const x0 = ox, x1 = ox + w;
  const y0 = oy, ym = oy + h / 2, y1 = oy + h;
  const g = t * 0.5;                 // gap so segments don't touch at corners
  // Each segment as a hexagon (mitred ends) for a clean VFD shape.
  const horiz = (cx0, cy, cx1) => [
    [cx0 + g, cy], [cx0 + g + g, cy - g], [cx1 - g - g, cy - g],
    [cx1 - g, cy], [cx1 - g - g, cy + g], [cx0 + g + g, cy + g],
  ];
  const vert = (cx, cy0, cy1) => [
    [cx, cy0 + g], [cx + g, cy0 + g + g], [cx + g, cy1 - g - g],
    [cx, cy1 - g], [cx - g, cy1 - g - g], [cx - g, cy0 + g + g],
  ];
  const segs = {
    a: horiz(x0, y0, x1),
    g: horiz(x0, ym, x1),
    d: horiz(x0, y1, x1),
    f: vert(x0, y0, ym),
    b: vert(x1, y0, ym),
    e: vert(x0, ym, y1),
    c: vert(x1, ym, y1),
  };
  const poly = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  };
  for (const k of Object.keys(segs)) {
    const lit = on.indexOf(k) !== -1;
    if (lit) {
      ctx.fillStyle = C.on;
      ctx.shadowColor = C.onGlow;
      ctx.shadowBlur = t * 1.6;
      poly(segs[k]);
      ctx.shadowBlur = 0;
    } else if (withGhost) {
      ctx.fillStyle = C.ghost;
      poly(segs[k]);
    }
  }
}

/**
 * Build a live digital VFD face.
 * @param {object} o
 * @param {number} o.widthM   plane width in metres (≈ smoked-panel inner width)
 * @param {number} o.heightM  plane height in metres
 * @param {boolean} o.ghost   draw faint unlit-segment ghosts (default true)
 * @param {boolean} o.pixel   NEAREST filtering for a crisp pixel look (default true)
 * @returns {{mesh:THREE.Mesh, setTime:Function, texture:THREE.Texture}}
 */
export function makeDigitalClockFace({ widthM = 0.150, heightM = 0.044, ghost = true, pixel = true } = {}) {
  // Canvas resolution: keep the display aspect, modest px so NEAREST reads as chunky pixels.
  const CW = 384, CH = Math.round(CW * (heightM / widthM)); // ~384 × 113
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const ctx = cv.getContext('2d');

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = pixel ? THREE.NearestFilter : THREE.LinearFilter;
  tex.minFilter = pixel ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = !pixel;

  // Self-lit: MeshBasic ignores scene light → the green stays bright (VFD glow). toneMapped
  // off so the emerald doesn't get crushed by the renderer's tonemap.
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), mat);
  mesh.name = 'clockface-vfd';

  // Digit layout (canvas px). 4 digits HH:MM + colon, «электроника» bottom-right.
  const padX = CW * 0.07, padTop = CH * 0.12;
  const dh = CH * 0.56;                 // digit height
  const dw = dh * (13.67 / 21);         // dossier digit aspect 21×13.67 mm
  const t  = dw * 0.20;                 // segment thickness
  const colonW = dw * 0.55;
  const gap = dw * 0.28;
  const totalW = dw * 4 + colonW + gap * 4;
  const startX = (CW - totalW) / 2 - CW * 0.02; // nudge left (logo lives bottom-right)
  const dy = padTop;

  let last = null;
  function render(hhmm, blinkOn, alarm) {
    const key = hhmm + '|' + (blinkOn ? 1 : 0) + '|' + (alarm ? 1 : 0);
    if (key === last) return;
    last = key;
    const s = (hhmm || '--:--').replace(/[^0-9: ]/g, '');
    const m = s.match(/^(\d| )(\d| )\s*:?\s*(\d| )(\d| )$/) || ['', s[0] || ' ', s[1] || ' ', s[3] || ' ', s[4] || ' '];
    const d = [m[1], m[2], m[3], m[4]];

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, CW, CH);

    let x = startX;
    // HH
    drawDigit(ctx, x, dy, dw, dh, t, SEG[d[0]] || '', ghost); x += dw + gap;
    drawDigit(ctx, x, dy, dw, dh, t, SEG[d[1]] || '', ghost); x += dw + gap;
    // colon (two dots), blinking
    const cx = x + colonW / 2, r = t * 0.62;
    if (blinkOn) {
      ctx.fillStyle = C.on; ctx.shadowColor = C.onGlow; ctx.shadowBlur = t * 1.6;
      for (const cy of [dy + dh * 0.34, dy + dh * 0.66]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowBlur = 0;
    }
    x += colonW + gap;
    // MM
    drawDigit(ctx, x, dy, dw, dh, t, SEG[d[2]] || '', ghost); x += dw + gap;
    drawDigit(ctx, x, dy, dw, dh, t, SEG[d[3]] || '', ghost);

    // alarm indicator dot (top-left of colon) — only when alarm armed
    if (alarm) {
      ctx.fillStyle = C.on; ctx.shadowColor = C.onGlow; ctx.shadowBlur = t;
      ctx.beginPath(); ctx.arc(startX + dw * 2 + gap * 1.5, dy + dh * 0.08, r * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // «электроника» silk-screen, lower-right
    ctx.fillStyle = C.logo;
    ctx.font = `${Math.round(CH * 0.13)}px "Russo One", system-ui, sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('электроника', CW - padX * 0.5, CH - CH * 0.04);

    tex.needsUpdate = true;
  }

  // Render an initial frame so the plane isn't blank before the first tick.
  render('--:--', true, false);

  return {
    mesh,
    texture: tex,
    /** setTime("HH:MM", {blink, alarm}) — call per frame; redraws only on change. */
    setTime(hhmm, { blink = true, alarm = false } = {}) { render(hhmm, blink, alarm); },
  };
}
