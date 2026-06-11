// src/console-core.js — PURE command parsing core. No THREE, no DOM (node-testable).

export function tokenize(line) {
  const s = String(line).trim().replace(/^\//, '').trim();
  if (!s) return [];
  return s.split(/\s+/);
}

export function parseNum(tok) {
  const n = Number(tok);
  if (!Number.isFinite(n)) throw new Error(`Expected number, got "${tok}"`);
  return n;
}
export function parseInt_(tok) {
  const n = parseNum(tok);
  if (!Number.isInteger(n)) throw new Error(`Expected integer, got "${tok}"`);
  return n;
}
// Minecraft tilde: '~' = base, '~N' = base+N, bare 'N' = absolute.
export function parseCoord(tok, base) {
  if (tok === '~') return base;
  if (tok[0] === '~') return base + parseNum(tok.slice(1));
  return parseNum(tok);
}
