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

function coerceArg(tok, a, cmd) {
  switch (a.type) {
    case 'int':  return parseInt_(tok);
    case 'num':  return parseNum(tok);
    case 'word': return tok;
    case 'enum':
      if (!a.choices.includes(tok)) throw new Error(`/${cmd}: <${a.name}> must be ${a.choices.join('|')}`);
      return tok;
    case 'sel':  return parseSelector(tok);
    default:     return tok;
  }
}

export function createRegistry() {
  const cmds = new Map();
  function register(name, spec) { cmds.set(name, spec); return api; }
  function dispatch(line, ctx = {}) {
    const toks = tokenize(line);
    if (!toks.length) return { ok: false, error: 'Empty command' };
    const [name, ...rest] = toks;
    const spec = cmds.get(name);
    if (!spec) return { ok: false, error: `Unknown command: /${name}` };
    const args = {};
    let i = 0;
    try {
      for (const a of (spec.args || [])) {
        if (a.type === 'rest') { args[a.name] = rest.slice(i).join(' '); i = rest.length; continue; }
        if (a.type === 'pos') {
          if (i + 3 > rest.length) {
            if (a.optional) { args[a.name] = a.default ?? null; continue; }
            throw new Error(`/${name}: missing coordinates for <${a.name}>`);
          }
          const base = ctx.origin || [0, 0, 0];
          args[a.name] = [parseCoord(rest[i], base[0]), parseCoord(rest[i + 1], base[1]), parseCoord(rest[i + 2], base[2])];
          i += 3;
          continue;
        }
        if (i >= rest.length) {
          if (a.optional) { args[a.name] = a.default ?? null; continue; }
          throw new Error(`/${name}: missing <${a.name}>`);
        }
        args[a.name] = coerceArg(rest[i++], a, name);
      }
    } catch (e) { return { ok: false, error: e.message }; }
    return { ok: true, message: spec.run(args, ctx) ?? '' };
  }
  const api = { register, dispatch, has: (n) => cmds.has(n), names: () => [...cmds.keys()] };
  return api;
}
