// spec.js — the anti-hallucination gate. A spec may only use facts that are
// declared: a dimensional part with no `src` citation is a HARD ERROR, never a
// silent guess. Pure module (no THREE) so it runs under `node --test`.
import { MANIFEST } from './operators/manifest.js';
import { PALETTE } from './palette.js';

const HEX = /^#?[0-9a-fA-F]{3,8}$/;

export function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('spec must be an object');
  const errs = [];
  if (!spec.id) errs.push("spec.id is required");
  if (!Array.isArray(spec.parts) || spec.parts.length === 0) errs.push('spec.parts must be a non-empty array');

  (spec.parts || []).forEach((p, i) => {
    const at = `parts[${i}]${p && p.id ? ` '${p.id}'` : ''}`;
    if (!p || !p.op) { errs.push(`${at}: missing 'op'`); return; }
    const m = MANIFEST[p.op];
    if (!m) { errs.push(`${at}: unknown operator '${p.op}'`); return; }

    for (const a of m.args) {
      if (p.args == null || p.args[a] == null) errs.push(`${at}: operator '${p.op}' missing arg '${a}'`);
    }
    if (m.dims.length > 0 && !p.src) {
      errs.push(`${at}: operator '${p.op}' has real-world dimensions — a 'src' provenance citation is required (no invented sizes)`);
    }
    if (p.mat == null) errs.push(`${at}: missing 'mat'`);
    else if (HEX.test(p.mat)) errs.push(`${at}: raw hex '${p.mat}' not allowed — use a palette name`);
    else if (!PALETTE[p.mat]) errs.push(`${at}: unknown material '${p.mat}'`);
  });

  if (errs.length) throw new Error('invalid spec:\n  - ' + errs.join('\n  - '));
  return true;
}
