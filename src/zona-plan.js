// zona-plan.js — «ЗОНА 704» master-plan registry. PURE DATA + lint. Imports NOTHING (node-testable,
// sim-worker-safe). SOURCE OF TRUTH: docs/superpowers/specs/2026-07-02-world-map-master-plan.html v1.2 —
// every coordinate transcribes 1:1; values the plan under-specifies are marked AUTHORED: and feed back
// into the plan's next version bump. Frame: x,z ∈ [−1250,+1250], +X=east +Z=north, heights above ±0.
export const EXTENT = 1250;

// ── parcels (plan section B) — kind 'rect' uses w(×X)×d(×Z); 'disc' uses r. h = plan-pinned pad height
// (null ⇒ pad samples the stamped terrain at the anchor). noPad: terrain feature parcels that must NOT
// be flattened (the terrain stamp IS the POI — kurgans, quarry, crater field).
export const PARCELS = [
  { id: 'P1', name: 'КПП «ПРОХОДНАЯ»',        kind: 'rect', x: -1080, z: -1060, w: 40,  d: 30,  h: 5,    tier: 1 },
  { id: 'P2', name: 'ОПОРНЫЙ ПУНКТ',           kind: 'disc', x: -950,  z: -920,  r: 56,  h: 8,    tier: 1 },
  { id: 'P3', name: 'ЛЕТИЩЕ «ЗАСЛОН»',         kind: 'rect', x: 50,    z: 630,   w: 380, d: 140, h: 60,   tier: 3, gate: 'G1' },
  { id: 'P4', name: 'КОЛХОЗ «ЗАРЯ»',           kind: 'rect', x: 50,    z: -840,  w: 260, d: 160, h: 4,    tier: 3, gate: 'G3' },
  { id: 'P5', name: 'КОМБИНАТ «ПЛЮШТАЛЬ»',     kind: 'rect', x: 680,   z: 60,    w: 280, d: 240, h: 30,   tier: 4, gate: 'G5' },
  { id: 'P6', name: 'ШАХТА №8',                kind: 'rect', x: 640,   z: 760,   w: 60,  d: 50,  h: 140,  tier: 4, gate: 'G2' },
  { id: 'P7', name: 'ПЛОТИНА',                 kind: 'rect', x: 780,   z: -680,  w: 90,  d: 12,  h: -4,   tier: 4, gate: 'G4' },
  { id: 'P8', name: 'ОБЪЕКТ 1180 + LZ',        kind: 'rect', x: 960,   z: 1020,  w: 70,  d: 60,  h: 200,  tier: 5 },
  { id: 'P9', name: 'ОБЪЕКТ 704 (ПОРТАЛ)',     kind: 'disc', x: 180,   z: 80,    r: 30,  h: 40,   tier: 6 },
  { id: 'S01', name: 'РТ-1',                   kind: 'disc', x: -820,  z: -700,  r: 12, h: null, tier: 2 },
  { id: 'S02', name: 'РТ-2',                   kind: 'disc', x: -120,  z: 480,   r: 12, h: null, tier: 3 },
  { id: 'S03', name: 'РТ-3',                   kind: 'disc', x: 920,   z: 560,   r: 12, h: null, tier: 4 },
  { id: 'S04', name: 'МОСТ (ТИХАЯ)',           kind: 'disc', x: -470,  z: -620,  r: 14, h: null, tier: 2, noPad: true },
  { id: 'S05', name: 'АЗС',                    kind: 'rect', x: -240,  z: -640,  w: 30, d: 20, h: null, tier: 2 },
  { id: 'S06', name: 'КУРГАНЫ',                kind: 'disc', x: -450,  z: -250,  r: 60, h: null, tier: 2, noPad: true },
  { id: 'S07', name: 'КАРЬЕР',                 kind: 'disc', x: -140,  z: -260,  r: 90, h: -25,  tier: 3, noPad: true },
  { id: 'S08', name: 'КРАТЕРНОЕ ПОЛЕ',         kind: 'disc', x: -500,  z: 300,   r: 70, h: null, tier: 3, noPad: true },
  { id: 'S09', name: 'ХАЙОВНА',                kind: 'rect', x: -700,  z: 320,   w: 24, d: 18, h: null, tier: 2 },
  { id: 'S10', name: 'ВЫШКА (ТЕСНАЯ БРАНА)',   kind: 'disc', x: -690,  z: 720,   r: 14, h: null, tier: 3 },
  { id: 'S11', name: 'БАТАРЕЯ С-75',           kind: 'disc', x: 320,   z: 700,   r: 30, h: null, tier: 3 },
  { id: 'S12', name: 'ЭЛЕВАТОР',               kind: 'rect', x: 140,   z: -800,  w: 16, d: 16, h: null, tier: 3 },
  { id: 'S13', name: 'ЗАТОПЛЕННАЯ ЦЕРКОВЬ',    kind: 'disc', x: 380,   z: -980,  r: 24, h: null, tier: 4 },
  { id: 'S14', name: 'ЛАГЕРЬ БРАКОНЬЕРОВ',     kind: 'disc', x: 180,   z: -520,  r: 18, h: null, tier: 3 },
  { id: 'S15', name: 'ВОДОКАЧКА',              kind: 'rect', x: 920,   z: -40,   w: 16, d: 14, h: null, tier: 3 },
  { id: 'S16', name: 'КОЛОДЕЦ',                kind: 'disc', x: 40,    z: -700,  r: 8,  h: null, tier: 2 },
  { id: 'S17', name: 'ОСТАНОВКА',              kind: 'disc', x: -300,  z: -480,  r: 8,  h: null, tier: 2 },
  { id: 'S18', name: 'ОБЛОМКИ «АИСТ»',         kind: 'disc', x: 260,   z: 190,   r: 26, h: null, tier: 5 },
  { id: 'S19', name: 'ЛЕСОПИЛКА',              kind: 'rect', x: -790,  z: 460,   w: 36, d: 20, h: null, tier: 3 },
  { id: 'S20', name: 'ПуСО',                   kind: 'rect', x: -370,  z: -1040, w: 40, d: 56, h: null, tier: 2 },
  { id: 'E01', name: 'ЛАГЕРЬ «ОРЛЁНОК»',       kind: 'disc', x: -1180, z: 390,   r: 40, h: null, tier: 3 },
  { id: 'E02', name: 'ТРИАНГУЛЯЦИОННАЯ ВЫШКА', kind: 'disc', x: -1130, z: -350,  r: 12, h: null, tier: 2 },
  { id: 'E03', name: 'МЕТЕОСТАНЦИЯ «ГОРА-9»',  kind: 'disc', x: -320,  z: 990,   r: 18, h: null, tier: 4 },
  { id: 'E04', name: 'ОБЛОМКИ АН-2',           kind: 'disc', x: -700,  z: 950,   r: 20, h: null, tier: 3 },
  { id: 'E05', name: 'ТОННЕЛЬ + ДРЕЗИНА',      kind: 'rect', x: 1180,  z: -20,   w: 40, d: 20, h: null, tier: 4 },
  { id: 'E06', name: '«ИЗОЛЯТОР»',             kind: 'rect', x: 980,   z: -260,  w: 50, d: 36, h: null, tier: 4 },
  { id: 'E07', name: '«ЗАСТАВА ЮГ»',           kind: 'rect', x: 600,   z: -1180, w: 50, d: 30, h: null, tier: 3 },
  { id: 'E08', name: '«ПРОРЫВ»',               kind: 'disc', x: -550,  z: -1190, r: 30, h: null, tier: 2 },
];

// ── roads (plan section D, polylines verbatim) — maxSlope = longitudinal clamp (fraction). The gated
// trunk routes are split at their gates (R1/R1N/R1E, R2/R2E/R2N) exactly as the plan writes them.
export const ROADS = [
  // bridges: corridor conditioning opens a GAP window there (the river channel passes under; the
  // Task-7 bridge deck spans it). S04 is deliberately the map's ONLY bridge — dirt roads ford the river.
  { id: 'R1', name: 'ТРАССА', surface: 'asphalt', width: 7.5, maxSlope: 0.08, bridges: [{ at: [-470, -620], halfLen: 14 }], pts: [
    [-1080, -1060], [-950, -920], [-760, -760], [-600, -660], [-470, -620], [-340, -540], [-330, -380], [-300, -200],
    [-340, -20], [-440, 140], [-560, 240], [-660, 320], [-700, 480], [-720, 560], [-690, 720], [-520, 690], [-300, 670], [-140, 630],
  ] },
  { id: 'R1N', name: 'ТРАССА (ЗА G1)', surface: 'asphalt', width: 7.5, maxSlope: 0.08, pts: [
    [240, 640], [380, 660], [520, 700], [640, 760], [700, 770],
  ] },
  { id: 'R1E', name: 'ТРАССА (ЗА G2)', surface: 'asphalt', width: 7.5, maxSlope: 0.08, pts: [
    [780, 780], [900, 700], [950, 540], [880, 380], [800, 200],
  ] },
  { id: 'R2', name: 'БЕТОНКА', surface: 'panels', width: 6, maxSlope: 0.09, pts: [
    [-340, -540], [-260, -600], [-240, -640], [-160, -700], [-80, -780],
  ] },
  { id: 'R2E', name: 'БЕТОНКА (ЗА G3)', surface: 'panels', width: 6, maxSlope: 0.09, pts: [
    [180, -820], [280, -840], [420, -800], [520, -820], [620, -780], [720, -720], [780, -680],
  ] },
  { id: 'R2N', name: 'БЕТОНКА (ЗА G4)', surface: 'panels', width: 6, maxSlope: 0.09, pts: [
    [820, -560], [850, -400], [840, -240], [800, -100], [740, -60],
  ] },
  { id: 'LOOP', name: 'ЛЕСНОЙ КРУГ', surface: 'dirt', width: 4, maxSlope: 0.12, pts: [
    [-470, -620], [-580, -400], [-640, -200], [-700, -80], [-480, 80], [-600, 180], [-700, 320], [-660, 320],
  ] },
  { id: 'QUARRY', name: 'КАРЬЕРНАЯ СПОЙКА', surface: 'dirt', width: 4, maxSlope: 0.12, pts: [
    [-300, -200], [-200, -240], [-140, -260], [-120, -440], [-100, -600], [-80, -780],
  ] },
  { id: 'RAIL', name: 'ЖЕЛЕЗНАЯ ДОРОГА', surface: 'rail', width: 3, maxSlope: 0.03, pts: [
    [1250, -20], [1180, -20], [1050, -30], [920, -40], [820, -40],
  ] },
  { id: 'SERP', name: 'СЕРПАНТИН', surface: 'gravel', width: 4, maxSlope: 0.14, pts: [
    [800, 200], [940, 370], [1000, 560], [980, 760], [1040, 880], [1000, 990], [960, 1020], [1060, 1120],
  ] },
  { id: 'PERIM', name: 'ПЕРИМЕТРАЛЬНАЯ', surface: 'dirt', width: 4, maxSlope: 0.12, pts: [
    [-1080, -1060], [-800, -1120], [-550, -1180], [-400, -1100], [-370, -1040], [-240, -940], [-160, -860], [-80, -780],
  ] },
  { id: 'SP_METEO', name: 'СТЕЖКА: МЕТЕО', surface: 'path', width: 1.6, maxSlope: 0.25, pts: [
    [-400, 780], [-320, 990],
  ] },
  // NOTE: plan lists the scarp spur as P2→(−1090,−700)→E01→E02 — E01 sits far north of E02, so the
  // leg doubles back along the western scarp. Long legs are legit here; lint must not reject them.
  { id: 'SP_SRAZ', name: 'СТЕЖКА: СРАЗ', surface: 'path', width: 1.6, maxSlope: 0.25, pts: [
    [-950, -920], [-1090, -700], [-1180, 390], [-1130, -350],
  ] },
  { id: 'SP_PERIM_V', name: 'СТЕЖКА: ПЕРИМЕТР-ВОСТОК', surface: 'path', width: 1.6, maxSlope: 0.25, pts: [
    [50, -840], [200, -1000], [500, -1120], [600, -1180],
  ] },
  { id: 'SP_PILA', name: 'СТЕЖКА: ПИЛА', surface: 'path', width: 1.6, maxSlope: 0.25, pts: [
    [-700, 320], [-760, 420], [-790, 460],
  ] },
  // AUTHORED: the two T5 ridge scrambles (plan: «pěší scramble PŘES hřbet, 2 stezky») — exact courses authored.
  { id: 'T5A', name: 'СТЕЖКА: ХРЕБЕТ-СЗ', surface: 'path', width: 1.4, maxSlope: 0.30, pts: [
    [-440, 140], [-260, 120], [-60, 60], [50, 20], [180, 80], [260, 190],
  ] },
  { id: 'T5B', name: 'СТЕЖКА: ХРЕБЕТ-ЮВ', surface: 'path', width: 1.4, maxSlope: 0.30, pts: [
    [-300, -200], [-100, -160], [100, -120], [300, -140], [450, -330], [540, -60],
  ] },
];

// ── gates (plan section C) — physical blockades; the skeleton builds each as a colliding placeholder
// + sign. No opening logic (bosses/world-state = later specs).
export const GATES = [
  { id: 'G1', x: 240, z: 640,  kind: 'steelGate',  name: 'ВОРОТА ПЕРИМЕТРА', roadId: 'R1N' },
  { id: 'G2', x: 700, z: 770,  kind: 'rockfall',   name: 'ЗАВАЛ «ЩЕЛЬ»',     roadId: 'R1N' },
  { id: 'G3', x: 180, z: -820, kind: 'nest',       name: 'ГНЕЗДО ТОЛО',      roadId: 'R2E' },
  { id: 'G4', x: 780, z: -680, kind: 'floodedGat', name: 'ГАТЬ (ЗАТОПЛЕНА)', roadId: 'R2E' },
  { id: 'G5', x: 940, z: 370,  kind: 'derailed',   name: 'ВЫКОЛЕЙКА',        roadId: 'SERP' },
];

// ── water — AUTHORED: course/levels read off the plan's «Biomy+voda» layer; exact values authored here
// and flagged back into the master plan on its next version bump.
export const WATER = {
  river: { // Тихая: N (sawmill bend S19) → S04 bridge → S edge into the swamp; carves its own channel stamp
    pts: [[-760, 620], [-790, 460], [-720, 330], [-640, 200], [-560, 40], [-520, -150], [-500, -350], [-470, -620], [-430, -800], [-380, -950], [-330, -1100], [-310, -1250]],
    width: 14, depth: 2.5, surfaceOffset: 1.2, // water plane rides the channel-bed profile + 1.2 m
  },
  swamp:     { x: 470, z: -850, w: 560, d: 340, level: -11 },   // bowl floor −12, plane at −11
  reservoir: { x: 780, z: -590, w: 170, d: 160, level: -6 },    // held behind the dam (P7 crest −4)
};

// ── terrain features (plan section A anchors) — the stamp layer consumed by zona-terrain.js.
// Vocabulary: 'ridge' (polyline pts [x,z,crestH] + halfW falloff; negative crestH = balka/úvoz carve),
// 'plateau' (rect/disc + h + skirt; abs:true pins ABSOLUTE height), 'bowl' (disc; abs or delta),
// 'channel' (river carve resolved against WATER[ref]). AUTHORED: exact polylines/extents authored from
// plan anchors (P9 portal +40 face, запретка crest (+50,+20) ≈ +150, P6 mountains +140, P8 saddle +200).
export const TERRAIN_FEATURES = [
  // central massif NW→SE («ХРЕБЕТ РАНА», dead forest → rock, crest ~+150 near запретка)
  { kind: 'ridge', id: 'RANA', halfW: 220, pts: [
    [-620, 560, 60], [-430, 380, 100], [-220, 220, 130], [-50, 60, 150], [120, -40, 140], [300, -140, 120], [450, -330, 90], [560, -430, 50],
  ] },
  // NE edge range (mine bench + bunker saddle live in it)
  { kind: 'ridge', id: 'NE_RANGE', halfW: 260, pts: [
    [300, 900, 90], [560, 860, 140], [800, 900, 170], [980, 1080, 210], [1160, 1200, 180],
  ] },
  // honest edges: W scarp + E range (plan pillar «poctivé hranice»)
  { kind: 'ridge', id: 'W_SCARP', halfW: 140, pts: [[-1250, -500, 60], [-1220, -100, 80], [-1230, 400, 90], [-1250, 800, 70]] },
  { kind: 'ridge', id: 'E_RANGE', halfW: 160, pts: [[1250, -600, 70], [1200, -200, 90], [1230, 300, 110], [1250, 700, 90]] },
  // airfield shelf, industrial terrace, mine bench, bunker saddle (abs plateaus under the pads)
  { kind: 'plateau', id: 'SHELF_P3', x: 50, z: 630, w: 460, d: 220, h: 60, skirt: 90, abs: true },
  { kind: 'plateau', id: 'TERR_P5', x: 680, z: 60, w: 360, d: 320, h: 30, skirt: 70, abs: true },
  { kind: 'plateau', id: 'BENCH_P6', x: 640, z: 760, w: 120, d: 100, h: 140, skirt: 60, abs: true },
  { kind: 'plateau', id: 'SEDLO_P8', x: 1000, z: 1060, w: 260, d: 220, h: 200, skirt: 80, abs: true },
  // depressions
  { kind: 'bowl', id: 'SWAMP', x: 470, z: -850, r: 330, h: -12, skirt: 120, abs: true },
  { kind: 'bowl', id: 'QUARRY', x: -140, z: -260, r: 90, h: -25, skirt: 40, abs: true },
  { kind: 'bowl', id: 'STARICA', x: -600, z: 180, r: 46, h: -3, skirt: 24 },
  // micro-feature fields (deltas)
  { kind: 'bowl', id: 'CRATER1', x: -520, z: 280, r: 16, h: -3.5, skirt: 8 },
  { kind: 'bowl', id: 'CRATER2', x: -480, z: 330, r: 13, h: -3, skirt: 7 },
  { kind: 'bowl', id: 'CRATER3', x: -540, z: 350, r: 11, h: -2.5, skirt: 6 },
  { kind: 'ridge', id: 'KURGAN1', halfW: 18, pts: [[-470, -230, 5], [-455, -225, 5]] },
  { kind: 'ridge', id: 'KURGAN2', halfW: 15, pts: [[-430, -270, 4], [-418, -262, 4]] },
  { kind: 'ridge', id: 'KURGAN3', halfW: 16, pts: [[-490, -285, 4.5], [-478, -278, 4.5]] },
  { kind: 'ridge', id: 'BALKA1', halfW: 30, pts: [[-900, -300, -6], [-780, -180, -7], [-660, -100, -5]] },
  { kind: 'ridge', id: 'BALKA2', halfW: 26, pts: [[-980, 100, -5], [-860, 180, -6], [-760, 240, -4]] },
  { kind: 'ridge', id: 'UVOZ', halfW: 14, pts: [[-740, -120, -4], [-700, -80, -4.5], [-640, -30, -4]] },
  // river channel (bed = terrain − depth along course; the water plane rides bed + surfaceOffset)
  { kind: 'channel', id: 'TIHAYA', ref: 'river' },
];

// ── lint — fail-loud plan validation (run at zona boot + in node tests).
export function lintPlan() {
  const errors = [], warnings = [];
  const seen = new Set();
  for (const p of PARCELS) {
    if (seen.has(p.id)) errors.push(`duplicate parcel id ${p.id}`);
    seen.add(p.id);
    if (Math.abs(p.x) > EXTENT || Math.abs(p.z) > EXTENT) errors.push(`${p.id} out of bounds`);
    if (p.kind === 'rect' && !(p.w > 0 && p.d > 0)) errors.push(`${p.id} rect missing w/d`);
    if (p.kind === 'disc' && !(p.r > 0)) errors.push(`${p.id} disc missing r`);
  }
  for (const r of ROADS) {
    if (r.pts.length < 2) errors.push(`${r.id} degenerate polyline`);
    for (let i = 0; i < r.pts.length; i++) {
      const [x, z] = r.pts[i];
      if (Math.abs(x) > EXTENT || Math.abs(z) > EXTENT) errors.push(`${r.id}[${i}] out of bounds`);
      if (i > 0 && Math.hypot(x - r.pts[i - 1][0], z - r.pts[i - 1][1]) < 1) errors.push(`${r.id}[${i}] zero-length segment`);
    }
    if (!(r.width > 0) || !(r.maxSlope > 0)) errors.push(`${r.id} missing width/maxSlope`);
  }
  for (const g of GATES) {
    const road = ROADS.find(r => r.id === g.roadId);
    if (!road) { errors.push(`${g.id} unknown road ${g.roadId}`); continue; }
    if (!road.pts.some(([x, z]) => Math.hypot(x - g.x, z - g.z) <= 30)) errors.push(`${g.id} not on ${g.roadId}`);
  }
  // pad proximity (rect/disc as circles by max half-extent) — WARNING, not error: the plan legitimately
  // nests some pairs (e.g. P7 dam inside the swamp system); only true duplicates are errors.
  const list = PARCELS.filter(p => !p.noPad);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const ra = a.kind === 'disc' ? a.r : Math.max(a.w, a.d) / 2;
    const rb = b.kind === 'disc' ? b.r : Math.max(b.w, b.d) / 2;
    if (Math.hypot(a.x - b.x, a.z - b.z) < (ra + rb) * 0.8) warnings.push(`${a.id}/${b.id} pads close/overlapping`);
  }
  return { errors, warnings };
}
