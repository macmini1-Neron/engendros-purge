// gatehouse.js — ПРОХОДНАЯ (the guard booth / vrátnice beside the kombinát works
// gate) rebuilt as an ULTRA-detailed walkable interior with a WORKING Soviet
// gate-control console: aim at the red button, press E, and the main gate slides
// open/shut (host-authoritative, like the field radio). Built object-by-object
// via the voxel-building-modeling skill — real materials, layered shading, legible
// Cyrillic + analog gauges (CanvasTexture, the radio-faceplate technique), real
// 3D knobs/switches/lamps, a tiled floor, a Flopo-as-Lenin propaganda poster, a
// wall calendar, shelves + a chess set, a desk lamp, a telephone and a wall clock.
// One ceiling lamp lights the room.
//
// Coordinate frame (steppe world metres): +X east, +Z north, +Y up.
//   Booth at (8, −94). The works gate is at (0, −98) to the SOUTH-WEST; the
//   factory yard is to the NORTH; the ЗАВОДОУПРАВЛЕНИЕ admin HQ is to the WEST.
//   The guard faces SOUTH (out the control-room window, over the console) toward
//   the gate. SINGLE entrance: the N (yard) door. The W wall carries the ПРОХОДНАЯ
//   sign + a SERVICE HATCH (выдача пропусков) facing the admin HQ; the S wall has
//   the control-room window over the console. Shelves sit on the E wall (off the
//   hatch wall); the chess set + phone sit on the guard's hatch counter.
import * as THREE from 'three';
import { MeshBuilder, TAU, voxelMaterial } from './util.js';

// ---- palettes (layered shading: hi / mid / lo / slot — never a near-black blob) ----
const G  = { hi: 0x9cb78c, mid: 0x7e9a7c, lo: 0x5d7a5c, slot: 0x3b533c, bright: 0xbad2aa }; // Soviet equipment green
const M  = { hi: 0xc0c8cc, mid: 0x8a9094, lo: 0x5c6266 };                                    // brushed aluminium
const R  = { hi: 0xff5236, mid: 0xd22a1c, lo: 0x8c1810 };                                    // signal red
const BR = { hi: 0x8c4a36, mid: 0x743a2a, lo: 0x542a1e, slot: 0x331a12 };                    // booth brick
const CC = { hi: 0x9a958b, mid: 0x7c776d, lo: 0x5c584f };                                    // concrete
const WD = { hi: 0x8a6a3a, mid: 0x6a4a24, lo: 0x49321a };                                    // timber
const FRAME = 0x35383b;

// ---------------------------------------------------------------------------
// CanvasTexture helpers — fine detail (Cyrillic, gauges) that can't be voxelised.
// ---------------------------------------------------------------------------
function canvasTex(W, H, draw, opts = {}) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'); if (!x) return null;
  draw(x, W, H);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (opts.pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
  else { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; }
  return t;
}

// one analog gauge (white face, black bezel, arc scale, optional red zone + needle)
function drawGauge(x, cx, cy, r, label, o = {}) {
  x.save();
  x.fillStyle = '#0e120b'; x.beginPath(); x.arc(cx, cy, r + 7, 0, TAU); x.fill();           // outer bezel
  x.fillStyle = '#222b1d'; x.beginPath(); x.arc(cx, cy, r + 3, 0, TAU); x.fill();           // inner bezel ring
  const grd = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.15, cx, cy, r);
  grd.addColorStop(0, '#f6f1de'); grd.addColorStop(1, '#d6cfb2');
  x.fillStyle = grd; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();                      // cream face
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ticks = o.ticks || 10;
  for (let i = 0; i <= ticks; i++) {
    const a = a0 + (a1 - a0) * (i / ticks), c = Math.cos(a), s = Math.sin(a), long = i % 2 === 0;
    x.strokeStyle = (o.redFrom != null && i / ticks >= o.redFrom) ? '#9e1f17' : '#23271c';
    x.lineWidth = long ? Math.max(2, r * 0.05) : Math.max(1, r * 0.025);
    x.beginPath(); x.moveTo(cx + c * r * (long ? 0.64 : 0.72), cy + s * r * (long ? 0.64 : 0.72)); x.lineTo(cx + c * r * 0.82, cy + s * r * 0.82); x.stroke();
  }
  if (o.redFrom != null) { x.strokeStyle = '#9e1f17'; x.lineWidth = Math.max(3, r * 0.08); x.beginPath(); x.arc(cx, cy, r * 0.9, a0 + (a1 - a0) * o.redFrom, a1); x.stroke(); }
  if (o.nums) { x.fillStyle = '#23271c'; x.font = `bold ${Math.round(r * 0.24)}px monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const n = o.nums.length; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i / (n - 1)); x.fillText(o.nums[i], cx + Math.cos(a) * r * 0.48, cy + Math.sin(a) * r * 0.48); } }
  if (o.needle != null) { const a = a0 + (a1 - a0) * o.needle; x.strokeStyle = '#7a1208'; x.lineWidth = Math.max(2, r * 0.05);
    x.beginPath(); x.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12); x.lineTo(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74); x.stroke(); }
  x.fillStyle = '#2a2a2a'; x.beginPath(); x.arc(cx, cy, r * 0.09, 0, TAU); x.fill();         // hub
  if (label) { x.fillStyle = '#0d120a'; x.fillRect(cx - r * 0.8, cy + r * 1.02, r * 1.6, r * 0.42);
    x.fillStyle = '#d6e6c8'; x.font = `bold ${Math.round(r * 0.26)}px "Russo One",monospace`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, cx, cy + r * 1.24); }
  x.restore();
}

// upper console faceplate: 3 big gauges, a CRT, a keypad, a red-button well, switch labels
const PULT_UP = { CW: 1280, CH: 560, PW: 1.55, PH: 0.72 };
function consoleFaceUp() {
  return canvasTex(PULT_UP.CW, PULT_UP.CH, (x, W, H) => {
    x.fillStyle = '#516b46'; x.fillRect(0, 0, W, H);                                          // olive base
    for (let i = 0; i < 5200; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(180,195,150,0.06)'; x.fillRect(Math.random() * W | 0, Math.random() * H | 0, 2, 2); }
    x.strokeStyle = '#33442a'; x.lineWidth = 10; x.strokeRect(8, 8, W - 16, H - 16);
    x.strokeStyle = '#6a8454'; x.lineWidth = 3; x.strokeRect(16, 16, W - 32, H - 32);
    // title strip
    x.fillStyle = '#1b2414'; x.fillRect(30, 26, 560, 52);
    x.fillStyle = '#e7efd8'; x.font = 'bold 34px "Russo One",monospace'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('ПУЛЬТ ВОРОТ № 1', 48, 54);
    // 3 gauges
    drawGauge(x, 150, 250, 92, 'НАПРЯЖ. В', { nums: ['0', '', '220', '', '380'], ticks: 8, redFrom: 0.82 });
    drawGauge(x, 360, 250, 92, 'ТОК  А', { nums: ['0', '', '', '', '60'], ticks: 8, needle: 0.32 });
    drawGauge(x, 570, 250, 100, 'ВОРОТА %', { nums: ['0', '25', '50', '75', '100'], ticks: 8 }); // needle is 3D (animated)
    // CRT monitor (radar-style)
    const mx = 740, my = 96, mw = 260, mh = 210;
    x.fillStyle = '#0b1a0d'; x.fillRect(mx - 12, my - 12, mw + 24, mh + 24);
    x.fillStyle = '#08120a'; x.fillRect(mx, my, mw, mh);
    x.strokeStyle = '#1f6a2c'; x.lineWidth = 2;
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(mx, my + (mh * i) / 6); x.lineTo(mx + mw, my + (mh * i) / 6); x.stroke(); }
    for (let i = 1; i < 7; i++) { x.beginPath(); x.moveTo(mx + (mw * i) / 7, my); x.lineTo(mx + (mw * i) / 7, my + mh); x.stroke(); }
    x.strokeStyle = '#3fd45a'; x.lineWidth = 3; x.beginPath(); x.moveTo(mx + 20, my + mh - 40);
    for (let i = 0; i <= mw - 40; i += 8) x.lineTo(mx + 20 + i, my + mh - 40 - Math.abs(Math.sin(i * 0.05)) * 90); x.stroke();
    x.fillStyle = '#2f9a40'; x.font = '18px monospace'; x.fillText('СХ-1 ОК', mx + 14, my + 24);
    // keypad (3×4)
    const kx = 1040, ky = 70;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      x.fillStyle = '#11160d'; x.fillRect(kx + c * 64, ky + r * 56, 54, 46);
      x.fillStyle = '#cdd8bd'; x.font = 'bold 24px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      const lab = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'][r * 3 + c]; x.fillText(lab, kx + c * 64 + 27, ky + r * 56 + 23);
    }
    // red-button well + label (the 3D button sits here)
    x.fillStyle = '#0c0c0c'; x.beginPath(); x.arc(165, 470, 70, 0, TAU); x.fill();
    x.strokeStyle = '#c0c8cc'; x.lineWidth = 7; x.beginPath(); x.arc(165, 470, 74, 0, TAU); x.stroke();
    x.fillStyle = '#e7d24a'; x.font = 'bold 26px "Russo One",monospace'; x.textAlign = 'center'; x.fillText('ВОРОТА', 165, 392);
    x.fillStyle = '#d8d2b8'; x.font = '17px monospace'; x.fillText('ОТКР. / ЗАКР.', 165, 560 - 30);
    // indicator-lamp labels (3D lamps sit above these)
    x.fillStyle = '#cdd8bd'; x.font = 'bold 20px monospace'; x.textAlign = 'center';
    x.fillText('ОТКРЫТО', 560, 470); x.fillText('ЗАКРЫТО', 560, 510);
    // switch labels + warning band
    x.fillStyle = '#1b2414'; x.fillRect(360, 430, 360, 96);
    x.fillStyle = '#cdd8bd'; x.font = '16px monospace'; x.textAlign = 'left';
    ['ПИТАНИЕ', 'ОБОГРЕВ', 'СИРЕНА', 'СВЕТ'].forEach((t, i) => x.fillText(t, 376, 452 + i * 22));
    // corner screws
    x.fillStyle = '#9aa28c'; for (const [sx, sy] of [[30, 30], [W - 30, 30], [30, H - 30], [W - 30, H - 30]]) { x.beginPath(); x.arc(sx, sy, 6, 0, TAU); x.fill(); }
  });
}

// lower (sloped) console panel: button rows + a long slider scale
const PULT_LO = { CW: 1280, CH: 360, PW: 1.5, PH: 0.4 };
function consoleFaceLow() {
  return canvasTex(PULT_LO.CW, PULT_LO.CH, (x, W, H) => {
    x.fillStyle = '#5d7a52'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(190,205,160,0.06)'; x.fillRect(Math.random() * W | 0, Math.random() * H | 0, 2, 2); }
    x.strokeStyle = '#3a4d30'; x.lineWidth = 8; x.strokeRect(8, 8, W - 16, H - 16);
    // a grid of square pushbuttons (red/green/amber/black)
    const cols = ['#cf3a2a', '#3fae54', '#e0a72e', '#222a18'];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 9; c++) {
      const bx = 60 + c * 80, by = 60 + r * 96, col = cols[(r + c) % 4];
      x.fillStyle = '#10160c'; x.fillRect(bx - 4, by - 4, 64, 64);
      x.fillStyle = col; x.fillRect(bx, by, 56, 56);
      x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(bx, by, 56, 12);
    }
    // labels
    x.fillStyle = '#dfe8d2'; x.font = 'bold 20px "Russo One",monospace'; x.textAlign = 'left';
    x.fillText('ПУСК', 60, 50); x.fillText('СТОП', 380, 50); x.fillText('РЕЖИМ', 700, 50);
    // long slider scale (right)
    x.fillStyle = '#11160c'; x.fillRect(820, 70, 380, 40); x.fillStyle = '#cdd8bd';
    for (let i = 0; i <= 10; i++) { x.fillRect(826 + i * 37, 74, 2, i % 5 === 0 ? 32 : 18); }
    x.fillStyle = '#b9c0a8'; x.fillRect(900, 64, 26, 52); // slider knob
    x.font = '16px monospace'; x.fillText('СКОРОСТЬ СТВОРКИ', 820, 150);
  });
}

// ---------------------------------------------------------------------------
// Flopo-as-Lenin propaganda poster — pixel-art on a low-res canvas (NearestFilter).
// Flopo (cyan flower plush) wearing Lenin's flat cap + goatee, pointing forward,
// red rays + a Cyrillic slogan. Recognisably "Lenin pose", recognisably Flopo.
// ---------------------------------------------------------------------------
function flopoLeninPoster() {
  return canvasTex(150, 200, (x, W, H) => {
    // red ground + radiating lighter rays
    x.fillStyle = '#9a1b16'; x.fillRect(0, 0, W, H);
    x.save(); x.translate(W * 0.42, H * 0.42);
    for (let i = 0; i < 16; i++) { x.rotate(TAU / 16); x.fillStyle = i % 2 ? 'rgba(214,54,40,0.55)' : 'rgba(150,20,16,0.0)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(260, -34); x.lineTo(260, 34); x.closePath(); x.fill(); }
    x.restore();
    const px = (cx, cy, w, h, col) => { x.fillStyle = col; x.fillRect(cx, cy, w, h); };
    // ---- body: dark worker's coat ----
    px(50, 132, 50, 60, '#2a3a52'); px(46, 150, 58, 44, '#223149');           // torso + shoulders
    px(58, 138, 8, 52, '#1b2740');                                            // coat centre seam
    // ---- pointing arm (Lenin gesture), cyan plush ----
    px(92, 120, 40, 14, '#49c6df'); px(126, 110, 16, 16, '#49c6df');          // upper arm + fist
    px(140, 104, 12, 8, '#3aa9c0');                                            // pointing finger
    // pink flower petals around the head (drawn first so the head sits over them)
    for (const [dx, dy] of [[34, 58], [94, 58], [34, 106], [94, 106], [64, 48], [64, 118]]) px(dx, dy, 20, 20, '#e85ba0');
    // ---- head: cyan plush ball ----
    px(46, 70, 56, 56, '#49c6df'); px(46, 70, 56, 10, '#5fd2e6');             // head + lit top
    // ---- Lenin flat cap (кепка) ----
    px(40, 58, 68, 16, '#3b3a36'); px(40, 70, 78, 8, '#2c2b28'); px(96, 70, 26, 7, '#454440'); // cap + brim + peak
    // red star on the cap
    px(58, 59, 11, 11, '#d22a1c'); px(61, 62, 5, 5, '#f0c020');               // star block + gold centre
    // ---- face: big button eye (left), small eye (right), goatee ----
    px(55, 89, 16, 16, '#14223e'); px(59, 93, 8, 8, '#f0ead8'); px(61, 95, 4, 4, '#0c0a08'); // big button eye + white + pupil
    px(82, 91, 11, 11, '#14223e'); px(84, 93, 4, 4, '#f0ead8');               // small eye + glint
    px(63, 110, 24, 4, '#14223e');                                            // stitched smile
    px(67, 114, 17, 8, '#6a3c1e'); px(71, 121, 9, 10, '#52300f');            // reddish goatee (pointed)
    // ---- hammer & sickle emblem (gold, upper-left) ----
    x.save(); x.translate(28, 32); x.fillStyle = '#e7d24a'; x.strokeStyle = '#e7d24a'; x.lineCap = 'round';
    x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 12, Math.PI * 0.08, Math.PI * 1.08); x.stroke();   // sickle blade
    x.beginPath(); x.moveTo(-11, 4); x.lineTo(-3, 15); x.stroke();                                  // sickle handle
    x.beginPath(); x.moveTo(2, 15); x.lineTo(12, -7); x.stroke();                                   // hammer handle
    x.fillRect(5, -13, 15, 7); x.restore();                                                          // hammer head
    // ---- slogan banner ----
    x.fillStyle = '#e7d24a'; x.fillRect(8, 168, W - 16, 24);
    x.fillStyle = '#7a1410'; x.font = 'bold 18px "Russo One",monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('ВПЕРЁД!', W / 2, 181);
    // frame ticks
    x.strokeStyle = '#e7d24a'; x.lineWidth = 4; x.strokeRect(3, 3, W - 6, H - 6);
  }, { pixel: true });
}

// Soviet wall calendar (table tear-off look)
function calendarTex() {
  return canvasTex(360, 480, (x, W, H) => {
    x.fillStyle = '#efe9d8'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#b7b09a'; x.lineWidth = 6; x.strokeRect(4, 4, W - 8, H - 8);
    x.fillStyle = '#9a1b16'; x.fillRect(8, 8, W - 16, 96);                      // red header
    x.fillStyle = '#f4eedd'; x.font = 'bold 46px "Russo One",monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('ОКТЯБРЬ', W / 2, 44); x.font = 'bold 30px "Russo One",monospace'; x.fillText('1986', W / 2, 82);
    const days = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
    x.font = 'bold 22px monospace';
    for (let c = 0; c < 7; c++) { x.fillStyle = c >= 5 ? '#9a1b16' : '#2a2a2a'; x.fillText(days[c], 30 + c * 47, 132); }
    let d = 1; x.font = '24px monospace';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { if (d > 31) break; if (r === 0 && c < 2) continue;
      x.fillStyle = c >= 5 ? '#9a1b16' : '#2a2a2a'; x.fillText(String(d), 30 + c * 47, 174 + r * 50); d++; }
    x.fillStyle = '#7a1410'; x.font = 'italic 18px serif'; x.fillText('СЛАВА ТРУДУ!', W / 2, H - 26);
  });
}

// clock face
function clockFaceTex() {
  return canvasTex(256, 256, (x, W) => {
    x.fillStyle = '#f3eede'; x.beginPath(); x.arc(128, 128, 120, 0, TAU); x.fill();
    x.strokeStyle = '#23271c'; x.lineWidth = 6; x.beginPath(); x.arc(128, 128, 120, 0, TAU); x.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const lo = i % 3 === 0 ? 98 : 106;
      x.strokeStyle = '#23271c'; x.lineWidth = i % 3 === 0 ? 7 : 3; x.beginPath(); x.moveTo(128 + Math.cos(a) * lo, 128 + Math.sin(a) * lo); x.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116); x.stroke(); }
    x.fillStyle = '#9a1b16'; x.font = 'bold 20px monospace'; x.textAlign = 'center'; x.fillText('ЧАЙКА', 128, 176);
  });
}

// ---------------------------------------------------------------------------
// The gate-control console (ПУЛЬТ). Built in LOCAL coords (origin = base centre,
// +Z = toward the operator) then positioned in world. Sets world.gateConsole
// with the animatable refs (lamps / needle / red button) + the interaction point.
// ---------------------------------------------------------------------------
function buildGateConsole(world, wx, wy, wz) {
  const grp = new THREE.Group();
  const PW = PULT_UP.PW, PH = PULT_UP.PH, panelCY = 1.30, panelZ = -0.30; // upper panel
  const conv = (cx, cy) => ({ x: (cx / PULT_UP.CW - 0.5) * PW, y: panelCY + (0.5 - cy / PULT_UP.CH) * PH });

  // ---- static green body (one merged mesh) ----
  const b = new MeshBuilder();
  b.box(1.64, 0.10, 0.84, 0, 0.05, 0, G.slot);                                 // base shadow
  b.box(1.62, 0.84, 0.80, 0, 0.46, 0, G.mid, { tint: 0.03 });                  // cabinet body
  b.box(1.66, 0.10, 0.84, 0, 0.86, 0, G.hi);                                   // desk lip (lit)
  b.box(1.62, 0.06, 0.78, 0, 0.92, 0.02, G.bright);                            // desk top surface
  // louver vent (lower front) — recessed dark + lit slats
  b.box(1.18, 0.40, 0.04, 0, 0.30, 0.405, G.slot);
  for (let i = 0; i < 5; i++) b.box(1.12, 0.03, 0.05, 0, 0.16 + i * 0.08, 0.42, G.hi, { tint: 0.02 });
  // aluminium corner trims (front vertical edges)
  for (const sx of [-0.82, 0.82]) { b.box(0.06, 0.84, 0.06, sx, 0.46, 0.40, M.mid); b.box(0.05, 0.86, 0.05, sx, 0.46, 0.405, M.hi, { tint: 0.04 }); }
  // upper back panel (holds the faceplate + 3D controls) + raised bezel
  b.box(1.56, 0.74, 0.08, 0, panelCY, panelZ, G.mid, { tint: 0.04 });
  b.box(PW + 0.10, 0.06, 0.05, 0, panelCY + PH / 2 + 0.04, panelZ + 0.045, G.lo);
  b.box(PW + 0.10, 0.06, 0.05, 0, panelCY - PH / 2 - 0.04, panelZ + 0.045, G.lo);
  for (const sx of [-(PW / 2 + 0.05), PW / 2 + 0.05]) b.box(0.06, PH + 0.16, 0.05, sx, panelCY, panelZ + 0.045, G.lo);
  grp.add(new THREE.Mesh(b.build(), voxelMaterial()));

  // ---- upper faceplate texture ----
  const upTex = consoleFaceUp();
  if (upTex) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshLambertMaterial({ map: upTex })); pl.position.set(0, panelCY, panelZ + 0.052); grp.add(pl); }
  // ---- lower sloped faceplate (button rows), tilted toward the operator ----
  const loTex = consoleFaceLow();
  if (loTex) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(PULT_LO.PW, PULT_LO.PH), new THREE.MeshLambertMaterial({ map: loTex }));
    pl.position.set(0, 0.80, 0.30); pl.rotation.x = -Math.PI / 2.5; grp.add(pl); }

  // ---- 3D parts on the upper panel ----
  const faceZ = panelZ + 0.06;
  // big RED emergency/gate button (in its painted well)
  const redBtn = new THREE.Group();
  { let g = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 20); g.rotateX(Math.PI / 2); redBtn.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: M.mid }))); // chrome collar
    g = new THREE.CylinderGeometry(0.072, 0.072, 0.07, 20); g.rotateX(Math.PI / 2); const cap = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: R.mid })); cap.position.z = 0.03; redBtn.add(cap);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: R.hi })); dome.rotation.x = Math.PI / 2; dome.position.z = 0.06; redBtn.add(dome); }
  const rp = conv(165, 470); redBtn.position.set(rp.x, rp.y, faceZ + 0.02); grp.add(redBtn);
  // gate-state indicator lamps (open=green / closed=red) — unlit MeshBasic so they glow
  const lampOpen = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), new THREE.MeshBasicMaterial({ color: 0x123a16 }));
  const lampShut = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff2a22 }));
  { const a = conv(560, 470), c = conv(560, 510); lampOpen.position.set(a.x - 0.12, a.y, faceZ); lampShut.position.set(c.x - 0.12, c.y, faceZ); grp.add(lampOpen); grp.add(lampShut); }
  // toggle switches (row, lower-left of panel)
  for (let i = 0; i < 4; i++) { const sw = new THREE.Group();
    sw.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), new THREE.MeshLambertMaterial({ color: 0x14180f })));
    const lev = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.07, 8), new THREE.MeshLambertMaterial({ color: M.hi })); lev.position.z = 0.03; lev.rotation.x = i % 2 ? 0.6 : -0.6; sw.add(lev);
    const p = conv(372 + i * 0, 452 + i * 22); sw.position.set(p.x + 0.30, p.y, faceZ); grp.add(sw); }
  // animated needle on the "ВОРОТА %" gauge (3D, pivots at gauge centre)
  const ng = new THREE.BoxGeometry(0.014, 0.16, 0.014); ng.translate(0, 0.07, 0);
  const needleGate = new THREE.Mesh(ng, new THREE.MeshLambertMaterial({ color: 0x7a1208 }));
  const gp = conv(570, 250); needleGate.position.set(gp.x, gp.y, faceZ + 0.01); grp.add(needleGate);

  // ---- place in world, push collider, register interaction ----
  grp.position.set(wx, wy, wz);
  world.boxes.push({ min: new THREE.Vector3(wx - 0.83, wy, wz - 0.42), max: new THREE.Vector3(wx + 0.83, wy + 1.0, wz + 0.42) });
  world.scene.add(grp);
  world.gateConsole = {
    grp, x: wx, y: wy + 1.2, z: wz + 0.42, reach: 3.2, // interaction point (front of the panel)
    lampOpen, lampShut, redBtn, needleGate, _t: 0, _press: 0,
  };
  return grp;
}

// ---------------------------------------------------------------------------
// The booth itself (shell + interior) — built into the shared `b` (merged mesh),
// plus separate meshes for textured/animated props. Also installs the console
// interaction methods on `world` (updateGateConsole / toggleGate / applyGateSet).
// ---------------------------------------------------------------------------
export function buildGatehouse(world, b, cx, cz) {
  const W = 4.6, D = 5.0, H = 4.2, T = 0.5;
  const wX = cx - W / 2, eX = cx + W / 2, sZ = cz - D / 2, nZ = cz + D / 2;     // wall centre-planes
  const FLOORY = 0.12;

  // wall segment helpers (collidable). axis 'x' runs along X at z=fixed; 'z' along Z at x=fixed.
  const segX = (z, c0, c1, y0, y1, col, o = {}) => world._solid(b, c1 - c0, y1 - y0, T, (c0 + c1) / 2, (y0 + y1) / 2, z, col, o);
  const segZ = (x, c0, c1, y0, y1, col, o = {}) => world._solid(b, T, y1 - y0, c1 - c0, x, (y0 + y1) / 2, (c0 + c1) / 2, col, o);
  // see-through glass pane (separate transparent mesh)
  const glass = (x, y, z, w, h, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: 0xaed4dc, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 2; world.scene.add(m); };
  // window frame (proud, vertex-colour) around an opening
  const frameX = (z, c0, c1, y0, y1, out) => { const w = c1 - c0, h = y1 - y0, cxw = (c0 + c1) / 2, cyw = (y0 + y1) / 2, zo = z + out * 0.06;
    b.box(w + 0.16, 0.1, 0.06, cxw, y1, zo, FRAME); b.box(w + 0.16, 0.1, 0.06, cxw, y0, zo, FRAME); b.box(0.1, h, 0.06, c0, cyw, zo, FRAME); b.box(0.1, h, 0.06, c1, cyw, zo, FRAME); b.box(0.06, h, 0.05, cxw, cyw, zo, FRAME); };
  const frameZ = (x, c0, c1, y0, y1, out) => { const w = c1 - c0, h = y1 - y0, czw = (c0 + c1) / 2, cyw = (y0 + y1) / 2, xo = x + out * 0.06;
    b.box(0.06, 0.1, w + 0.16, xo, y1, czw, FRAME); b.box(0.06, 0.1, w + 0.16, xo, y0, czw, FRAME); b.box(0.06, h, 0.1, xo, cyw, c0, FRAME); b.box(0.06, h, 0.1, xo, cyw, c1, FRAME); b.box(0.05, h, 0.06, xo, cyw, czw, FRAME); };

  // ===== SOUTH wall (z=sZ, faces the gate) — big service window over the console =====
  const swL = cx - 1.3, swR = cx + 1.3, swB = 1.55, swT = 3.0;
  segX(sZ, wX, swL, 0, H, BR.mid, { tint: 0.05 });                              // left pier
  segX(sZ, swR, eX, 0, H, BR.mid, { tint: 0.05 });                              // right pier
  segX(sZ, swL, swR, 0, swB, BR.mid, { tint: 0.05 });                           // sill
  segX(sZ, swL, swR, swT, H, BR.mid, { tint: 0.05 });                           // lintel
  glass(cx, (swB + swT) / 2, sZ + 0.02, swR - swL, swT - swB, 0);
  frameX(sZ, swL, swR, swB, swT, -1);

  // ===== WEST wall (x=wX, faces the admin/lane) — SOLID, with a SERVICE HATCH (выдача пропусков)
  // directly under the ПРОХОДНАЯ sign. The booth now has a SINGLE entrance: the north yard door. =====
  const hzB = cz - 0.6, hzF = cz + 0.6, hY0 = 1.05, hY1 = 1.85;                  // hatch: z-span 1.2 m, sill/head
  segZ(wX, sZ, hzB, 0, H, BR.mid, { tint: 0.05 });                              // south pier
  segZ(wX, hzF, nZ, 0, H, BR.mid, { tint: 0.05 });                              // north pier
  segZ(wX, hzB, hzF, 0, hY0, BR.mid, { tint: 0.05 });                           // hatch sill (blocks walking → still one entrance)
  segZ(wX, hzB, hzF, hY1, H, BR.mid, { tint: 0.05 });                           // hatch lintel
  glass(wX + 0.02, (hY0 + hY1) / 2, cz, hzF - hzB, hY1 - hY0, Math.PI / 2);     // hatch glass
  frameZ(wX, hzB, hzF, hY0, hY1, -1);                                           // hatch frame (proud, lane side)
  for (const dz of [hzB, hzF]) b.box(0.14, hY1 - hY0 + 0.2, 0.16, wX, (hY0 + hY1) / 2, dz, 0x2d4a2a); // green hatch jambs
  b.box(0.5, 0.08, 1.4, wX - 0.30, hY0 - 0.02, cz, CC.hi);                      // exterior pass ledge (lane side)
  world._solid(b, 0.5, 0.94, 1.3, wX + 0.55, FLOORY + 0.5, cz, WD.mid, { tint: 0.03 }); // interior counter cabinet
  b.box(0.62, 0.08, 1.42, wX + 0.55, FLOORY + 0.98, cz, WD.hi);                 // counter top

  // ===== NORTH wall (z=nZ, yard) — main door (exit 1) =====
  const ndL = cx - 0.8, ndR = cx + 0.8;
  segX(nZ, wX, ndL, 0, H, BR.mid, { tint: 0.05 });
  segX(nZ, ndR, eX, 0, H, BR.mid, { tint: 0.05 });
  segX(nZ, ndL, ndR, 2.6, H, BR.mid, { tint: 0.05 });                           // lintel
  for (const dx of [ndL, ndR]) b.box(0.26, 2.6, 0.22, dx, 1.3, nZ, 0x2d4a2a);

  // ===== EAST wall (x=eX) — solid (the poster / decor wall) =====
  world._solid(b, T, H, D, eX, H / 2, cz, BR.mid, { tint: 0.05 });

  // ===== layered-shading bands: concrete plinth, lit top strip, cornice, roof =====
  for (const [ax, fz] of [['x', sZ], ['x', nZ]]) { b.box(W, 0.55, T + 0.1, cx, 0.27, fz, CC.mid); b.box(W, 0.34, T + 0.06, cx, H - 0.45, fz, BR.hi); b.box(W + 0.5, 0.4, T + 0.34, cx, H - 0.05, fz, CC.hi); }
  for (const fx of [wX, eX]) { b.box(T + 0.1, 0.55, D, fx, 0.27, cz, CC.mid); b.box(T + 0.06, 0.34, D, fx, H - 0.45, cz, BR.hi); b.box(T + 0.34, 0.4, D + 0.5, fx, H - 0.05, cz, CC.hi); }
  b.box(W + 0.6, 0.4, D + 0.6, cx, H + 0.18, cz, 0x3a3631);                     // roof deck (= ceiling underside at H)
  b.box(W + 0.2, 0.12, D + 0.2, cx, H + 0.42, cz, 0x4a463f);                    // roof cap (lit)

  // ===== interior FLOOR: collidable slab + a linoleum/tile texture on top =====
  world._floor(b, cx, cz, W - 0.55, D - 0.55, FLOORY, 0x6a5238);               // walkable slab (collider)
  { const ftex = canvasTex(256, 256, (x, S) => { const n = 8, c = S / n;        // chequer linoleum
      for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) { x.fillStyle = (r + cc) % 2 ? '#7c6038' : '#6a4f2c'; x.fillRect(cc * c, r * c, c, c); }
      x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * c, 0); x.lineTo(i * c, S); x.moveTo(0, i * c); x.lineTo(S, i * c); x.stroke(); } });
    if (ftex) { ftex.wrapS = ftex.wrapT = THREE.RepeatWrapping; ftex.repeat.set(2, 2);
      const fm = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, D - 0.6), new THREE.MeshLambertMaterial({ map: ftex })); fm.rotation.x = -Math.PI / 2; fm.position.set(cx, FLOORY + 0.012, cz); world.scene.add(fm); } }

  // ===== ceiling lamp (the booth interior is roofed → light it) =====
  const ceilLamp = new THREE.PointLight(0xfff2d6, 1.05, 11, 1.4); ceilLamp.position.set(cx, H - 0.4, cz); world.scene.add(ceilLamp);
  { const lb = new MeshBuilder(); lb.box(0.5, 0.08, 0.5, 0, 0, 0, 0x2a2a26); lb.box(0.4, 0.05, 0.4, 0, -0.05, 0, 0xfff2cf); const lm = new THREE.Mesh(lb.build(), voxelMaterial()); lm.position.set(cx, H - 0.12, cz); world.scene.add(lm); }

  // ===== the working console (against the south wall, faces +Z / the operator) =====
  buildGateConsole(world, cx, FLOORY, sZ + 0.7);

  // ===== textured wall props =====
  const wallPlane = (tex, x, y, z, w, h, ry, ro = 4) => { if (!tex) return; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = ro; world.scene.add(m); return m; };
  // Flopo-Lenin poster on the EAST wall (faces −X into the room). Wall inner face = eX−T/2 = 10.05;
  // the backing floats ~0.12 off the wall and the poster face floats ~0.06 in front of the backing —
  // GENEROUS gaps so nothing z-fights on the low-res depth buffer when the camera moves.
  b.box(0.10, 1.94, 1.48, eX - 0.40, 2.25, cz, 0x4a2e18);                        // wood frame/backing
  b.box(0.10, 1.74, 1.30, eX - 0.42, 2.25, cz, 0x2a1a0e);                        // inner mat (proud of the frame)
  wallPlane(flopoLeninPoster(), eX - 0.50, 2.25, cz, 1.30, 1.74, -Math.PI / 2); // poster face (0.06 proud of the backing)
  // wall calendar on the NORTH wall, left of the door (faces −Z) — same generous separation
  b.box(0.74, 1.0, 0.06, cx - 1.4, 2.0, nZ - 0.44, 0xb7b09a);                    // calendar board backing
  wallPlane(calendarTex(), cx - 1.4, 2.0, nZ - 0.52, 0.64, 0.86, Math.PI);       // face (0.05 proud)
  // wall clock on the NORTH wall, east of the door (faces −Z) — round, with 3D hands
  { const ctex = clockFaceTex(); const cg = new THREE.Group();
    if (ctex) { const f = new THREE.Mesh(new THREE.CircleGeometry(0.22, 28), new THREE.MeshLambertMaterial({ map: ctex })); cg.add(f); }
    const hh = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.12, 0.01), new THREE.MeshLambertMaterial({ color: 0x1a1a14 })); hh.geometry.translate(0, 0.05, 0); hh.position.z = 0.012; hh.rotation.z = -1.1; cg.add(hh);
    const mh = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.18, 0.01), new THREE.MeshLambertMaterial({ color: 0x1a1a14 })); mh.geometry.translate(0, 0.08, 0); mh.position.z = 0.014; mh.rotation.z = 2.4; cg.add(mh);
    cg.position.set(cx + 1.5, 2.45, nZ - 0.30); cg.rotation.y = Math.PI; world.scene.add(cg); }

  // ===== furniture: shelves (books / samovar / mug), a stool, a chess set, a desk lamp, a phone =====
  buildBoothFurniture(world, b, cx, cz, wX, eX, sZ, nZ, FLOORY);

  // ===== ПРОХОДНАЯ sign on the WEST wall above the lane door, facing −X toward the ЗАВОДОУПРАВЛЕНИЕ
  // admin building (whose facade faces the gate) — so it reads INTO the works, not out of the factory.
  // Auto-fit text (see signPlane) so the whole word always shows. =====
  b.box(0.12, 0.78, 2.9, wX - 0.36, 3.3, cz, 0x223a20);                          // enamel sign backing (proud of the wall, lane side)
  signPlane(world, 'ПРОХОДНАЯ', wX - 0.46, 3.3, cz, 2.7, 0.64, -Math.PI / 2, { panel: '#2d4a2a', border: '#c8b86a', color: '#e8e0cc' });

  // ===== install the interaction + control methods on world =====
  world.updateGateConsole = function (game) {
    this.gateTarget = null;
    const gc = this.gateConsole; if (!gc) return;
    if (game.state !== 'playing' || (game.mp && game.mp.frozen)) return;
    if (game.player.mountedGun) return;
    const cam = game.engine.camera; cam.updateMatrixWorld();
    const o = (this._gcO || (this._gcO = new THREE.Vector3())).setFromMatrixPosition(cam.matrixWorld);
    const f = (this._gcF || (this._gcF = new THREE.Vector3())).set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const dx = gc.x - o.x, dy = gc.y - o.y, dz = gc.z - o.z, along = dx * f.x + dy * f.y + dz * f.z;
    if (along <= 0.2 || along > gc.reach) return;
    const px = o.x + f.x * along, py = o.y + f.y * along, pz = o.z + f.z * along;
    if (Math.hypot(gc.x - px, gc.y - py, gc.z - pz) < 0.95) this.gateTarget = gc;
  };
  world.applyGateSet = function (open) { const Gt = this._slideGate; if (Gt) Gt.open = !!open; };
  world.toggleGate = function (game) {
    const Gt = this._slideGate; if (!Gt) return;
    const mp = game.mp;
    if (mp && mp.active && !mp.isHost) { if (mp.net) mp.net.send('gatereq', { open: !Gt.open }); return; } // client → host
    Gt.open = !Gt.open;
    if (this.gateConsole) this.gateConsole._press = 0.12;                       // depress the red button
    if (game.audio && game.audio.uiClick) game.audio.uiClick();
    if (game.hud && game.hud.toast) game.hud.toast(Gt.open ? 'ВОРОТА · ОТКРЫВАЮ' : 'ВОРОТА · ЗАКРЫВАЮ', Gt.open ? 0x6fd08a : 0xd2a23a);
    if (mp && mp.active && mp.isHost && mp.net) mp.net.broadcast('gateset', { open: Gt.open });
  };
}

// ---- booth furniture (shelves + objects + stool + chess + lamp + phone) ----
function buildBoothFurniture(world, b, cx, cz, wX, eX, sZ, nZ, FY) {
  // wall shelf unit on the EAST wall, NORTH of the poster (kept OFF the service-hatch wall)
  const sx = eX - 0.28, sz0 = nZ - 0.95;
  for (const sy of [1.15, 1.75, 2.35]) { b.box(0.36, 0.05, 1.2, sx, sy, sz0, WD.mid, { tint: 0.04 }); b.box(0.36, 0.03, 1.2, sx, sy + 0.03, sz0, WD.hi); }
  b.box(0.06, 1.34, 1.22, eX - 0.05, 1.75, sz0, WD.lo);                          // shelf back (against the wall)
  // books — spines face the room (−X), thin (0.05) along Z, spaced 0.10 (no overlap), 0.07 off the wall
  const bookCols = [0x8a2a22, 0x2a5a8a, 0x4a7a3a, 0x8a6a2a, 0x6a3a6a];
  for (let i = 0; i < 6; i++) b.box(0.16, 0.25, 0.05, eX - 0.40, 1.295, sz0 - 0.45 + i * 0.10, bookCols[i % 5], { tint: 0.03 + (i % 3) * 0.04 });
  for (let i = 0; i < 4; i++) b.box(0.15, 0.22, 0.05, eX - 0.40, 1.895, sz0 + 0.05 + i * 0.10, bookCols[(i + 2) % 5], { tint: 0.03 + (i % 2) * 0.05 });
  // samovar (brass) on the top shelf
  { const fb = new MeshBuilder(); const bd = new THREE.CylinderGeometry(0.11, 0.13, 0.22, 14); fb.geo(bd, 0, 0.11, 0, 0xb98a3a, { tint: 0.05 }); bd.dispose();
    const tp = new THREE.CylinderGeometry(0.05, 0.09, 0.08, 12); fb.geo(tp, 0, 0.26, 0, 0xcfa24a); tp.dispose();
    fb.box(0.04, 0.05, 0.04, 0.13, 0.12, 0, 0x8a6a2a); fb.box(0.04, 0.05, 0.04, -0.13, 0.12, 0, 0x8a6a2a); // handles
    const sm = new THREE.Mesh(fb.build(), voxelMaterial()); sm.position.set(eX - 0.34, 2.40, sz0 - 0.30); world.scene.add(sm); }
  // enamel mug
  { const mb = new MeshBuilder(); const mc = new THREE.CylinderGeometry(0.05, 0.05, 0.09, 12); mb.geo(mc, 0, 0, 0, 0xd8d2c2); mc.dispose(); const mm = new THREE.Mesh(mb.build(), voxelMaterial()); mm.position.set(eX - 0.34, 1.81, sz0 + 0.40); world.scene.add(mm); }

  // CHESS set + rotary telephone on the guard's service-hatch counter (west wall) — the table is gone
  const ctX = wX + 0.55, ctY = FY + 1.04, ctZ = cz;
  { const cb = new MeshBuilder(); const sq = 0.045;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) cb.box(sq, 0.014, sq, (c - 3.5) * sq, 0, (r - 3.5) * sq, (r + c) % 2 ? 0xe8e0c8 : 0x2a2018);
    cb.box(8 * sq + 0.04, 0.03, 8 * sq + 0.04, 0, -0.012, 0, 0x4a3420); // board edge
    const cm = new THREE.Mesh(cb.build(), voxelMaterial()); cm.position.set(ctX, ctY, ctZ - 0.30); world.scene.add(cm);
    const pb = new MeshBuilder(); const pieces = [[-3, -3, 0xf0ead8], [-1, -2, 0xf0ead8], [2, 1, 0x201a14], [0, 3, 0x201a14], [3, -1, 0xf0ead8], [-2, 2, 0x201a14]];
    for (const [pc, pr, col] of pieces) { const g = new THREE.CylinderGeometry(0.011, 0.018, 0.06, 8); pb.geo(g, pc * sq, 0.03, pr * sq, col); g.dispose(); }
    const pm = new THREE.Mesh(pb.build(), voxelMaterial()); pm.position.set(ctX, ctY + 0.015, ctZ - 0.30); world.scene.add(pm); }
  // rotary telephone (black) on the counter
  { const tb = new MeshBuilder(); tb.box(0.2, 0.08, 0.16, 0, 0.04, 0, 0x18181a); tb.box(0.22, 0.04, 0.06, 0, 0.11, -0.05, 0x202024); // base + handset cradle
    const dial = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12); tb.geo(dial, 0, 0.09, 0.03, 0x111113, { rx: Math.PI / 2 }); dial.dispose();
    const tm = new THREE.Mesh(tb.build(), voxelMaterial()); tm.position.set(ctX, ctY, ctZ + 0.40); world.scene.add(tm); }

  // a guard's stool in front of the console
  { const stx = cx + 0.8, stz = sZ + 1.7; world._solid(b, 0.42, 0.05, 0.42, stx, FY + 0.5, stz, WD.hi, { tint: 0.04 });
    for (const [dx, dz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) b.box(0.05, 0.5, 0.05, stx + dx, FY + 0.25, stz + dz, WD.lo); }

  // a green desk lamp on the console desk corner
  { const db = new MeshBuilder(); db.box(0.14, 0.02, 0.14, 0, 0, 0, 0x2a2a2a); db.box(0.03, 0.22, 0.03, 0, 0.12, 0, 0x2a2a2a);
    const sh = new THREE.CylinderGeometry(0.02, 0.09, 0.08, 12); db.geo(sh, 0.05, 0.24, 0, 0x2a6a3a, { rz: -0.5 }); sh.dispose();
    const dm = new THREE.Mesh(db.build(), voxelMaterial()); dm.position.set(cx - 0.7, FY + 0.95, sZ + 0.95); world.scene.add(dm);
    const bulb = new THREE.PointLight(0xffe6a8, 0.25, 2.4); bulb.position.set(cx - 0.62, FY + 1.12, sZ + 1.0); world.scene.add(bulb); }

  // огнетушитель (fire extinguisher) standing in the SE corner — classic Soviet booth kit
  { const xb = new MeshBuilder();
    let g = new THREE.CylinderGeometry(0.11, 0.11, 0.5, 14); xb.geo(g, 0, 0.25, 0, 0xb81818, { tint: 0.04 }); g.dispose();        // red body
    g = new THREE.SphereGeometry(0.11, 12, 8, 0, TAU, 0, Math.PI / 2); xb.geo(g, 0, 0.5, 0, 0xc42020); g.dispose();                // dome top
    xb.box(0.07, 0.10, 0.07, 0, 0.56, 0, 0x222222); xb.box(0.18, 0.03, 0.04, 0.05, 0.59, 0, 0x111111);                            // valve + squeeze lever
    g = new THREE.CylinderGeometry(0.014, 0.014, 0.36, 8); xb.geo(g, 0.1, 0.33, 0.03, 0x14110e, { rz: 0.55 }); g.dispose();        // hose
    xb.box(0.2, 0.13, 0.012, 0, 0.29, -0.112, 0xe8e0c8);                                                                           // white instruction label
    const xm = new THREE.Mesh(xb.build(), voxelMaterial()); xm.position.set(eX - 0.42, FY, sZ + 1.5); world.scene.add(xm); }
}

// ===========================================================================
// The works gate — two bi-parting sliding leaves, now BUTTON-CONTROLLED from the
// booth console (no more proximity auto-open). Leaf colliders track the leaves,
// so a closed gate blocks the 8 m opening and an open gate is clear. Moved here
// from industrial.js so all gate/booth code lives together.
// ===========================================================================
function buildGateLeaf(W, H) {
  const lb = new MeshBuilder();
  const MAROON = 0x6a2526, MA_HI = 0x803232, MA_LO = 0x481818, FR = 0x57201f;
  lb.box(W, H, 0.16, 0, 0, 0, MAROON, { tint: 0.03 });
  lb.box(W, 0.3, 0.22, 0, H / 2 - 0.15, 0, MA_HI); lb.box(W, 0.3, 0.22, 0, -H / 2 + 0.15, 0, MA_LO);
  for (const sx of [-1, 1]) lb.box(0.22, H, 0.22, sx * (W / 2 - 0.11), 0, 0, FR);
  lb.box(0.18, H, 0.2, 0, 0, 0, FR);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const px = sx * W * 0.24, py = sy * H * 0.22; lb.box(W * 0.32, H * 0.3, 0.06, px, py, 0.11, MA_LO); lb.box(W * 0.32, H * 0.3, 0.06, px, py, -0.11, MA_LO); }
  for (const wx of [-W * 0.32, W * 0.32]) { let g = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12); lb.geo(g, wx, -H / 2 - 0.05, 0, 0x222222, { rz: Math.PI / 2 }); g.dispose(); g = new THREE.CylinderGeometry(0.09, 0.09, 0.2, 8); lb.geo(g, wx, -H / 2 - 0.05, 0, 0x8a8680, { rz: Math.PI / 2 }); g.dispose(); }
  const m = new THREE.Mesh(lb.build(), voxelMaterial()); m.castShadow = true; m.receiveShadow = true; return m;
}

export function buildWorksGate(world, b, gx, gz, opening) {
  const half = opening / 2, PW = 1.6, PH = 5.0, PD = 1.4, px = half + 0.9, railY = 3.6;
  for (const sx of [-1, 1]) {
    const x = gx + sx * px;
    world._solid(b, PW, PH, PD, x, PH / 2, gz, CC.mid, { tint: 0.05 });
    b.box(PW + 0.14, 0.45, PD + 0.14, x, PH - 0.15, gz, CC.hi);
    b.box(PW + 0.06, PH - 1.2, 0.18, x, PH * 0.5, gz - PD / 2 - 0.03, CC.lo);
    b.box(0.75, 1.5, 0.95, x, railY, gz, 0x1e1e1e);
  }
  const beamW = opening + PW * 2 + 1.0;
  b.box(beamW, 0.5, 0.5, gx, railY, gz, 0xe0b020, { tint: 0.04 });
  b.box(beamW, 0.14, 0.56, gx, railY + 0.23, gz, 0xf4d24a);
  for (const sx of [-2.6, 0, 2.6]) b.box(0.12, 1.4, 0.12, gx + sx, railY + 0.95, gz, 0x262626);
  b.box(opening + 1.2, 0.13, 0.13, gx, railY + 1.6, gz, 0x262626);
  const trackW = opening + 2 * (half + 1);
  b.box(trackW, 0.12, 0.34, gx, 0.06, gz - 0.85, 0x39362f);
  b.box(trackW, 0.07, 0.12, gx, 0.13, gz - 0.85, 0x7c776d);
  // --- two bi-parting sliding leaves (own meshes) ---
  const W = half, H = 3.3, cy = 1.9, dz = gz - 0.85, travel = half + 0.4;
  const leftClosed = gx - half / 2, rightClosed = gx + half / 2;
  const left = buildGateLeaf(W, H), right = buildGateLeaf(W, H);
  left.position.set(leftClosed, cy, dz); right.position.set(rightClosed, cy, dz);
  world.scene.add(left); world.scene.add(right);
  // leaf colliders (track the leaves; closed → block, open → clear)
  const lcol = { min: new THREE.Vector3(leftClosed - W / 2, 0, dz - 0.12), max: new THREE.Vector3(leftClosed + W / 2, H + 0.5, dz + 0.12) };
  const rcol = { min: new THREE.Vector3(rightClosed - W / 2, 0, dz - 0.12), max: new THREE.Vector3(rightClosed + W / 2, H + 0.5, dz + 0.12) };
  world.boxes.push(lcol, rcol);
  world._slideGate = { left, right, gx, gz, leftClosed, rightClosed, travel, amt: 0, open: false, leafW: W, lcol, rcol, dz, H };

  // per-frame update: ease toward open/closed, slide leaves + colliders, drive the console
  world.updateGate = function (dt) {
    const Gt = this._slideGate; if (!Gt) return;
    const tgt = Gt.open ? 1 : 0;
    Gt.amt += (tgt - Gt.amt) * Math.min(1, dt * 2.2);
    if (Math.abs(tgt - Gt.amt) < 0.002) Gt.amt = tgt;
    const t = Gt.travel * Gt.amt;
    Gt.left.position.x = Gt.leftClosed - t; Gt.right.position.x = Gt.rightClosed + t;
    Gt.lcol.min.x = Gt.left.position.x - Gt.leafW / 2; Gt.lcol.max.x = Gt.left.position.x + Gt.leafW / 2;
    Gt.rcol.min.x = Gt.right.position.x - Gt.leafW / 2; Gt.rcol.max.x = Gt.right.position.x + Gt.leafW / 2;
    // booth console feedback
    const gc = this.gateConsole;
    if (gc) {
      gc._t += dt;
      const moving = Math.abs(tgt - Gt.amt) > 0.01;
      if (gc.lampOpen) gc.lampOpen.material.color.setHex(Gt.open ? (moving && (gc._t * 5 | 0) % 2 ? 0x123a16 : 0x46ff6e) : 0x123a16);
      if (gc.lampShut) gc.lampShut.material.color.setHex(!Gt.open ? (moving && (gc._t * 5 | 0) % 2 ? 0x401010 : 0xff2a22) : 0x401010);
      if (gc.needleGate) gc.needleGate.rotation.z = (0.62 - Gt.amt * 1.24); // 0%→ left, 100%→ right (matches the painted arc)
      if (gc._press > 0) { gc._press = Math.max(0, gc._press - dt); gc.redBtn.position.z = gc._pressZ0 != null ? gc._pressZ0 - gc._press * 0.4 : gc.redBtn.position.z; }
      if (gc._pressZ0 == null) gc._pressZ0 = gc.redBtn.position.z;
    }
  };
}

// ---- minimal Cyrillic sign plane (mirrors industrial.js buildSignage) ----
function signPlane(world, text, x, y, z, w, h, ry, opts = {}) {
  const CW = Math.max(512, Math.round(w * 260)), CH = Math.max(160, Math.round(h * 260));
  const tex = canvasTex(CW, CH, (c, W, H) => {
    if (opts.panel) { c.fillStyle = opts.panel; c.fillRect(0, 0, W, H); if (opts.border) { const lw = Math.max(6, Math.round(H * 0.06)); c.strokeStyle = opts.border; c.lineWidth = lw; c.strokeRect(lw, lw, W - 2 * lw, H - 2 * lw); } }
    c.fillStyle = opts.color || '#e8e0cc'; c.textAlign = 'center'; c.textBaseline = 'middle';
    // auto-fit: start large, shrink until the whole word fits the panel width (never clipped)
    let fs = opts.size || Math.round(H * 0.62); c.font = `bold ${fs}px "Russo One", Arial, sans-serif`;
    const maxW = W * 0.86; while (c.measureText(text).width > maxW && fs > 8) { fs -= 2; c.font = `bold ${fs}px "Russo One", Arial, sans-serif`; }
    c.fillText(text, W / 2, H / 2 + 2);
  });
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: !opts.panel, alphaTest: opts.panel ? 0 : 0.5, emissive: 0x0c0c0c, emissiveIntensity: 1, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 4; world.scene.add(m);
}
