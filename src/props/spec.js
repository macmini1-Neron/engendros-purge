// spec.js — the anti-hallucination + anti-nonsense gate. A spec may only use
// facts that are declared and physically plausible:
//   · a dimensional part with no `src` citation is a HARD ERROR, never a guess
//   · `src` must point INTO the dossier (`dossier#key`), not be free prose
//   · dimensions are METRES — millimetre-scale numbers are rejected outright
//     (the real incident this guards: an ammo box authored in mm built 280 m
//     wide, filled the whole viewport white, and still got "approved")
//   · the declared footprint must match what the parts actually build (bounds.js)
// Pure module (no THREE) so it runs under `node --test`.
import { MANIFEST } from './operators/manifest.js';
import { PALETTE } from './palette.js';
import { boundsErrors } from './bounds.js';

const HEX = /^#?[0-9a-fA-F]{3,8}$/;
const SRC = /^dossier#[\w.\-/]+$/;
const MAX_DIM_DEFAULT = 12;           // metres — fits an 11 m S-75 missile; anything bigger is a building

function checkMetres(errs, where, label, v, maxDim) {
  if (typeof v !== 'number' || !Number.isFinite(v)) { errs.push(`${where}: ${label} must be a finite number (got ${JSON.stringify(v)})`); return; }
  if (Math.abs(v) > 50) errs.push(`${where}: ${label}=${v} looks like MILLIMETRES — spec dimensions are METRES (${v} mm would be ${(v / 1000).toFixed(3)})`);
  else if (Math.abs(v) > maxDim) errs.push(`${where}: ${label}=${v} m exceeds the ${maxDim} m prop limit (set spec.maxDim only for genuinely oversized props)`);
}

// Resolve "dossier#key" / "dossier#a.b.c" into the dossier object: exact dotted
// path from the root, else a deep search for the final segment as a key.
export function resolveDossierKey(dossier, src) {
  const path = src.slice('dossier#'.length).split('.');
  let node = dossier;
  for (const seg of path) { node = node?.[seg]; if (node === undefined) break; }
  if (node !== undefined) return true;
  const last = path[path.length - 1];
  const seen = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object' || seen.has(n)) return false;
    seen.add(n);
    if (!Array.isArray(n) && Object.prototype.hasOwnProperty.call(n, last)) return true;
    return Object.values(n).some(walk);
  };
  return walk(dossier);
}

export function validateSpec(spec, opts = {}) {
  if (!spec || typeof spec !== 'object') throw new Error('spec must be an object');
  const errs = [];
  if (!spec.id) errs.push("spec.id is required");
  if (!Array.isArray(spec.parts) || spec.parts.length === 0) errs.push('spec.parts must be a non-empty array');

  const maxDim = Math.min(spec.maxDim ?? MAX_DIM_DEFAULT, 30);

  const f = spec.footprint;
  if (!f || typeof f !== 'object') {
    errs.push("spec.footprint {w,h,d} (metres) is required — it is the placement/collision box AND the scale sanity check");
  } else {
    for (const k of ['w', 'h', 'd']) {
      if (typeof f[k] !== 'number' || !(f[k] > 0)) errs.push(`footprint.${k} must be a positive number (metres)`);
      else checkMetres(errs, 'footprint', k, f[k], maxDim);
    }
  }

  let structuralOk = true;
  (spec.parts || []).forEach((p, i) => {
    const at = `parts[${i}]${p && p.id ? ` '${p.id}'` : ''}`;
    if (!p || !p.op) { errs.push(`${at}: missing 'op'`); structuralOk = false; return; }
    const m = MANIFEST[p.op];
    if (!m) { errs.push(`${at}: unknown operator '${p.op}'`); structuralOk = false; return; }

    for (const a of m.args) {
      if (p.args == null || p.args[a] == null) { errs.push(`${at}: operator '${p.op}' missing arg '${a}'`); structuralOk = false; }
    }
    for (const [k, v] of Object.entries(p.args || {})) {
      if (k === 'count' || k === 'lines') {
        if (!Number.isInteger(v) || v < 1 || v > 30) { errs.push(`${at}: ${k} must be an integer 1–30 (got ${JSON.stringify(v)})`); structuralOk = false; }
      } else if (typeof v === 'number' && m.dims.includes(k)) {
        if (!(v > 0)) { errs.push(`${at}: ${k} must be > 0`); structuralOk = false; }
        else checkMetres(errs, at, k, v, maxDim);
      }
    }
    if (p.at != null) {
      if (!Array.isArray(p.at) || p.at.length > 3 || p.at.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
        errs.push(`${at}: 'at' must be [x,y,z] numbers (metres)`); structuralOk = false;
      } else p.at.forEach((v, ax) => checkMetres(errs, at, `at[${ax}]`, v, maxDim));
    }
    if (p.rot != null && (!Array.isArray(p.rot) || p.rot.length !== 3 || p.rot.some((v) => typeof v !== 'number' || !Number.isFinite(v)))) {
      errs.push(`${at}: 'rot' must be [x,y,z] in DEGREES (prefer multiples of 90)`); structuralOk = false;
    }

    if (m.dims.length > 0) {
      if (!p.src) {
        errs.push(`${at}: operator '${p.op}' has real-world dimensions — a 'src' provenance citation is required (no invented sizes)`);
      } else if (!SRC.test(p.src)) {
        errs.push(`${at}: src '${p.src}' is not a dossier citation — use 'dossier#<key>' pointing at a fact in ref/dossier.json (prose is not provenance)`);
      } else if (opts.dossier && !resolveDossierKey(opts.dossier, p.src)) {
        errs.push(`${at}: src '${p.src}' does not resolve to any key in the dossier — cite a real fact or add it to the dossier (with its own source)`);
      }
    }
    if (p.mat == null) errs.push(`${at}: missing 'mat'`);
    else if (HEX.test(p.mat)) errs.push(`${at}: raw hex '${p.mat}' not allowed — use a palette name`);
    else if (!PALETTE[p.mat]) errs.push(`${at}: unknown material '${p.mat}'`);
  });

  // Spatial sanity only once the parts are structurally sound — otherwise the
  // bounds math would just repeat the structural noise. Specs with pivoted rigs
  // (a posed launcher arm, a hinged lid) are SKIPPED: the static part AABB can't
  // know the posed geometry — the per-value metre checks above still apply.
  const dimErrors = errs.length > 0;
  const pivotRigged = Array.isArray(spec.rig) && spec.rig.some((r) => Array.isArray(r.pivot));
  if (structuralOk && !dimErrors && f && !pivotRigged) {
    for (const e of boundsErrors(spec)) errs.push(`bounds: ${e}`);
  }

  if (errs.length) throw new Error('invalid spec:\n  - ' + errs.join('\n  - '));
  return true;
}
