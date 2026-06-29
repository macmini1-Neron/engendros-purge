// gpucheck.js — classify the unmasked WebGL renderer string into a perf tier, for the
// low-end-GPU helper notice. PURE (no DOM / no WebGL) → node-testable like simclock/hitch.
//
// Input is WEBGL_debug_renderer_info's UNMASKED_RENDERER_WEBGL, e.g.
//   "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)"
//   "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Ti Laptop GPU (0x...) Direct3D11 ..., D3D11)"
//
// We only ever return 'weak' on a POSITIVE match (integrated / software / mobile). Anything we
// can't classify is 'unknown' → the caller must NOT warn, so we never nag someone whose GPU is
// actually fine. AMD APUs (e.g. "Radeon(TM) Graphics") are intentionally left 'unknown' rather
// than risk flagging a discrete Radeon as integrated — distinguishing them by string is unreliable.

const SOFTWARE = /swiftshader|software|llvmpipe|microsoft basic|basic render/i;
// Capable GPUs trusted as OK, checked BEFORE the integrated/mobile rules so they aren't mis-flagged:
// NVIDIA, Radeon RX/Pro, Intel Arc (Intel's DISCRETE line — must beat the \bintel\b integrated rule),
// and Apple Silicon (Safari reports "Apple GPU", Chrome "... Apple M2 ..." — desktop-class, NOT a phone).
const DISCRETE = /nvidia|geforce|\brtx\b|\bgtx\b|quadro|\barc\b|\bapple\b|radeon\s*(rx|pro)\b|\brx\s?\d{3,}/i;
const MOBILE = /\bmali\b|adreno|powervr|videocore/i;
const INTEGRATED = /\bintel\b|\biris\b|\buhd\b|\bhd graphics\b/i;

// Pull a clean human label out of the (mostly ANGLE-formatted) renderer string.
function prettyLabel(s) {
  let m = s.match(/ANGLE \([^,]+,\s*(.+?)\s*\(0x/i);          // "...,  NAME (0x1234) ..."
  if (!m) m = s.match(/ANGLE \([^,]+,\s*(.+?)\s+Direct3D/i);  // "...,  NAME Direct3D11 ..."
  if (!m) m = s.match(/ANGLE \([^,]+,\s*(.+?)\)/i);           // "...,  NAME)"
  const raw = m ? m[1] : s;
  return raw.replace(/\((?:R|TM)\)/gi, '').replace(/\s+/g, ' ').trim().slice(0, 64);
}

/**
 * classifyRenderer(renderer) → { tier, kind, label }
 *   tier: 'weak' | 'ok' | 'unknown'
 *   kind: 'integrated' | 'software' | 'mobile' | 'discrete' | 'unknown'
 *   label: short human GPU name ('' when unknown)
 */
export function classifyRenderer(renderer) {
  const s = String(renderer || '').trim();
  if (!s || /^\(/.test(s) || /^(unknown|masked)$/i.test(s)) {
    return { tier: 'unknown', kind: 'unknown', label: '' };
  }
  const label = prettyLabel(s);
  if (SOFTWARE.test(s)) return { tier: 'weak', kind: 'software', label };
  if (DISCRETE.test(s)) return { tier: 'ok', kind: 'discrete', label };   // capable parts before the integrated/mobile rules
  if (MOBILE.test(s)) return { tier: 'weak', kind: 'mobile', label };
  if (INTEGRATED.test(s)) return { tier: 'weak', kind: 'integrated', label };
  return { tier: 'unknown', kind: 'unknown', label };
}
