// src/console-core.js — PURE command parsing core. No THREE, no DOM (node-testable).

export function tokenize(line) {
  const s = String(line).trim().replace(/^\//, '').trim();
  if (!s) return [];
  return s.split(/\s+/);
}
