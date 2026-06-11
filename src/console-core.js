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
        if (a.type === 'target') {
          const tok = rest[i];
          const looks = tok != null && (tok[0] === '@' || (ctx.sel && ctx.sel.byName && ctx.sel.byName(tok).length > 0));
          if (looks) { args[a.name] = resolveSelector(parseSelector(tok), ctx.sel); i++; }
          else if (a.optional) { args[a.name] = a.default ?? null; }                         // e.g. /kill ⇒ null ⇒ "all" in run
          else { args[a.name] = ctx.sel ? resolveSelector({ kind: 's' }, ctx.sel) : []; }    // required ⇒ @s (you)
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

const _SELECTORS = ['@a', '@e', '@p', '@s'];
// Enumerable suggestions for one arg. A 'target' may be omitted, so it also offers the NEXT arg's values.
function _optsForArg(a, args, ai) {
  if (!a) return [];
  switch (a.type) {
    case 'target': return [..._SELECTORS, ..._optsForArg(args[ai + 1], args, ai + 1)];
    case 'enum':   return a.choices.slice();
    case 'int': case 'num': return [String(a.default ?? 1)];
    case 'pos':    return ['~'];
    case 'word':   return a.suggest ? a.suggest.slice() : []; // a word arg may carry an explicit suggestion list (e.g. /give items)
    default:       return []; // sel / rest — no enumerable values
  }
}
// Walk the spec like dispatch (target peeks @, pos eats 3) to find the arg under the token being completed.
function _argSuggest(argDefs, tokens, completingIdx) {
  let ai = 0, ti = 0;
  while (ai < argDefs.length) {
    const a = argDefs[ai];
    if (a.type === 'pos') { if (completingIdx >= ti && completingIdx < ti + 3) return _optsForArg(a, argDefs, ai); ti += 3; ai++; continue; }
    if (a.type === 'rest') return completingIdx >= ti ? _optsForArg(a, argDefs, ai) : [];
    if (ti === completingIdx) return _optsForArg(a, argDefs, ai);
    if (a.type === 'target' && !(tokens[ti] && tokens[ti][0] === '@')) { ai++; continue; } // bare token ⇒ target omitted (consumes nothing)
    ti++; ai++;
  }
  return [];
}

export function suggest(line, registry) {
  const raw = String(line).replace(/^\//, '');
  const endsWithSpace = /\s$/.test(raw);
  const parts = raw.trim().length ? raw.trim().split(/\s+/) : [];
  const partial = endsWithSpace ? '' : (parts[parts.length - 1] ?? '');
  const completing = endsWithSpace ? parts.length : Math.max(0, parts.length - 1);
  if (completing <= 0) return registry.names().filter((n) => n.startsWith(partial)).sort(); // completing the command name
  const spec = registry.get(parts[0]);
  if (!spec || !spec.args) return [];
  const opts = _argSuggest(spec.args, parts.slice(1), completing - 1);
  return [...new Set(opts)].filter((c) => c.startsWith(partial)); // arg suggestions keep their natural order
}

export function parseSelector(tok) {
  const m = /^@([paes])(?:\[([^\]]*)\])?$/.exec(tok);   // @p @a @e @s, with an optional [filter]
  if (!m) return { kind: 'name', value: tok };
  const sel = { kind: m[1] };
  if (m[2]) { const t = /(?:^|,)type=([A-Za-z0-9_]+)/.exec(m[2]); if (t) sel.type = t[1]; } // v1: only type=
  return sel;
}
// provider: { self, players(): [], entities(filter?): [], byName?(name): [] }
export function resolveSelector(sel, provider) {
  switch (sel.kind) {
    case 's': return [provider.self].filter(Boolean);
    case 'p': return provider.players().slice(0, 1);   // v0: "nearest" = first; refine later
    case 'a': return provider.players();
    case 'e': return provider.entities(sel.type ? { type: sel.type } : undefined);
    case 'name': return provider.byName ? provider.byName(sel.value) : [];
    default: return [];
  }
}

// ---- Minecraft-style live syntax highlighting (PURE — node-testable) ----
// Returns [{ text, cls }] segments that concatenate back to the EXACT input string (every
// space preserved) so a DOM overlay can mirror the <input> character-for-character. Classes map
// to colours in CSS: mc-slash / mc-lit = gray, mc-err = red, and arguments cycle through
// mc-aqua → mc-yellow → mc-green → mc-purple → mc-gold (Brigadier ARGUMENT_STYLES order).
const ARG_STYLES = ['mc-aqua', 'mc-yellow', 'mc-green', 'mc-purple', 'mc-gold'];

function coordOk(t) {
  if (t === '~') return true;
  const body = t[0] === '~' ? t.slice(1) : t;
  return body === '' ? true : Number.isFinite(Number(body));
}
function argTokenOk(a, t) {
  switch (a.type) {
    case 'int':  return Number.isInteger(Number(t));
    case 'num':  return Number.isFinite(Number(t));
    case 'enum': return a.choices.includes(t);
    default:     return true; // word / sel / anything else: no value check
  }
}

export function highlight(line, registry) {
  const src = String(line);
  if (!src.length) return [];
  // 1) split into runs, preserving whitespace exactly
  const runs = [];
  for (let i = 0; i < src.length;) {
    const ws = /\s/.test(src[i]);
    let j = i + 1; while (j < src.length && /\s/.test(src[j]) === ws) j++;
    runs.push({ text: src.slice(i, j), ws });
    i = j;
  }
  const words = runs.filter((r) => !r.ws);
  // 2) classify each word
  const wordCls = [];
  let spec = null;
  if (words.length) {
    const w0 = words[0].text;
    const name = w0[0] === '/' ? w0.slice(1) : w0;
    spec = (registry && registry.get) ? registry.get(name) : null;
    wordCls[0] = (name === '') ? 'mc-slash' : (spec ? 'mc-lit' : 'mc-err');
  }
  if (spec) {
    let wi = 1, colorNo = 0;
    const defs = spec.args || [];
    for (let ai = 0; ai < defs.length && wi < words.length; ai++) {
      const a = defs[ai], cls = ARG_STYLES[colorNo % ARG_STYLES.length];
      if (a.type === 'target') { // optional leading target: colour an explicit @selector; a bare token means it defaulted to @s, so leave it for the next arg
        if (words[wi].text[0] === '@') { wordCls[wi] = cls; wi++; colorNo++; }
        continue;
      }
      if (a.type === 'rest') { for (; wi < words.length; wi++) wordCls[wi] = cls; colorNo++; break; }
      if (a.type === 'pos') { // a coordinate triple is ONE argument ⇒ one colour for all three
        for (let k = 0; k < 3 && wi < words.length; k++, wi++) wordCls[wi] = coordOk(words[wi].text) ? cls : 'mc-err';
        colorNo++; continue;
      }
      wordCls[wi] = argTokenOk(a, words[wi].text) ? cls : 'mc-err'; wi++; colorNo++;
    }
    for (; wi < words.length; wi++) wordCls[wi] = 'mc-err'; // tokens past the spec = too many args
  } else {
    for (let wi = 1; wi < words.length; wi++) wordCls[wi] = 'mc-plain';
  }
  // 3) stitch back; split the command word's leading slash into its own gray segment
  const out = [];
  let wIdx = 0;
  for (const r of runs) {
    if (r.ws) { out.push({ text: r.text, cls: 'mc-plain' }); continue; }
    const cls = wordCls[wIdx] ?? 'mc-plain';
    if (wIdx === 0 && r.text[0] === '/' && r.text.length > 1) {
      out.push({ text: '/', cls: 'mc-slash' });
      out.push({ text: r.text.slice(1), cls });
    } else {
      out.push({ text: r.text, cls });
    }
    wIdx++;
  }
  return out;
}
