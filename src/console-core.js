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
export function asInt(tok) {
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
    case 'int':  return asInt(tok);
    case 'num':  return parseNum(tok);
    case 'word': return tok;
    case 'enum':
      if (!a.choices.includes(tok)) throw new Error(`/${cmd}: <${a.name}> must be ${a.choices.join('|')}`);
      return tok;
    case 'sel':  return parseSelector(tok);
    default: throw new Error(`Unknown arg type "${a.type}" for <${a.name}>`);
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
    try {
      return { ok: true, message: spec.run(args, ctx) ?? '' };
    } catch (e) { return { ok: false, error: `/${name} threw: ${e.message}` }; }
  }
  const api = { register, dispatch, has: (n) => cmds.has(n), names: () => [...cmds.keys()], get: (n) => cmds.get(n) };
  return api;
}

export function suggest(line, registry) {
  const raw = String(line).replace(/^\//, '');
  const endsWithSpace = /\s$/.test(raw);
  const parts = raw.trim().length ? raw.trim().split(/\s+/) : [];
  const partial = endsWithSpace ? '' : (parts[parts.length - 1] ?? '');
  const tokenIndex = endsWithSpace ? parts.length : Math.max(0, parts.length - 1);
  if (tokenIndex <= 0) {                       // completing the command name
    return registry.names().filter((n) => n.startsWith(partial)).sort();
  }
  const spec = registry.get(parts[0]);
  if (!spec || !spec.args) return [];
  const arg = spec.args[tokenIndex - 1];       // arg position (1 token per arg; good enough — enums are single-token leading args)
  if (arg && arg.type === 'enum' && arg.choices) return arg.choices.filter((c) => c.startsWith(partial));
  return [];                                    // pos/int/num/word/rest → no value suggestions
}

export function parseSelector(tok) {
  const m = /^@([paes])$/.exec(tok);
  return m ? { kind: m[1] } : { kind: 'name', value: tok };
}
// provider: { self, players(): [], entities(): [], byName?(name): [] }
export function resolveSelector(sel, provider) {
  switch (sel.kind) {
    case 's': return [provider.self].filter(Boolean);
    case 'p': return provider.players().slice(0, 1);   // v0: "nearest" = first; refine later
    case 'a': return provider.players();
    case 'e': return provider.entities();
    case 'name': return provider.byName ? provider.byName(sel.value) : [];
    default: return [];
  }
}
