# «ПОЛИГОН» Dev-Console (Fáze 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postavit in-game dev konzoli s Minecraft-style syntaxí (`/summon`, `/tp`, `/effect`, `/gamerule`…) jako páteř «ПОЛИГОН» creative sandboxu — fundament, kterým se pak staví a testují všechny další mechaniky.

**Architecture:** Dělíme na **pure jádro** (`src/console-core.js` — tokenizer, registr příkazů, arg/coord/selektor parsing; žádný THREE/DOM → plně node-testovatelné, sedí k patternu `destruct.js`/`simclock.js`) a **integraci** (`src/console.js` — `DevConsole` třída: registruje reálné příkazy nad `game` subsystémy, DOM input + F3 overlay). Příkazy pro UŽ EXISTUJÍCÍ systémy ship hned; budoucí mechaniky (bleeding/radiation/threat-tier) si svůj příkaz zaregistrují, až vzniknou.

**Tech Stack:** Vanilla ES modules, Three.js r160 (jen v `console.js`), `node:test` pro pure jádro, žádný build krok.

---

## File Structure

| Soubor | Odpovědnost |
|---|---|
| **Create** `src/console-core.js` | PURE: `tokenize`, `parseNum/parseInt_/parseCoord`, `parseSelector/resolveSelector`, `createRegistry()` (register + dispatch). Žádný import THREE/DOM. |
| **Create** `tests/console/core.test.mjs` | Node testy pure jádra. |
| **Create** `src/console.js` | `DevConsole` — registruje reálné příkazy nad `game`, DOM input UI, F3 overlay. Importuje `console-core.js` + THREE + `ENEMY_TYPES`. |
| **Modify** `index.html` | `#console` + `#f3debug` DOM + CSS (uvnitř/za `#hud`). |
| **Modify** `src/game.js` | Instancovat `DevConsole`, `this.rules`, open/close klávesy, `input.enabled` handling, F3 update. |
| **Modify** `src/player.js` | 1 řádek god-guard v `hurt()`. |

---

## Task 1: console-core — tokenize

**Files:**
- Create: `src/console-core.js`
- Test: `tests/console/core.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/console/core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/console-core.js';

test('tokenize: strips one leading slash and splits on whitespace', () => {
  assert.deepEqual(tokenize('/summon grunt 1 2 3'), ['summon', 'grunt', '1', '2', '3']);
});
test('tokenize: works without a leading slash', () => {
  assert.deepEqual(tokenize('tp ~ ~ ~'), ['tp', '~', '~', '~']);
});
test('tokenize: collapses runs of spaces and trims', () => {
  assert.deepEqual(tokenize('   give   money   500  '), ['give', 'money', '500']);
});
test('tokenize: empty / slash-only line ⇒ []', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('/'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/console/core.test.mjs`
Expected: FAIL — `Cannot find module '../../src/console-core.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/console-core.js — PURE command parsing core. No THREE, no DOM (node-testable).

export function tokenize(line) {
  const s = String(line).trim().replace(/^\//, '').trim();
  if (!s) return [];
  return s.split(/\s+/);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/console/core.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/console-core.js tests/console/core.test.mjs
git commit -m "feat(console): pure tokenize + node test harness (Faze 0)"
```

---

## Task 2: console-core — number & tilde-coordinate parsing

**Files:**
- Modify: `src/console-core.js`
- Test: `tests/console/core.test.mjs`

- [ ] **Step 1: Write the failing test** (append)

```js
import { parseNum, parseInt_, parseCoord } from '../../src/console-core.js';

test('parseNum: parses floats, throws on garbage', () => {
  assert.equal(parseNum('3.5'), 3.5);
  assert.equal(parseNum('-12'), -12);
  assert.throws(() => parseNum('abc'), /Expected number/);
});
test('parseInt_: integers only', () => {
  assert.equal(parseInt_('7'), 7);
  assert.throws(() => parseInt_('7.5'), /Expected integer/);
});
test('parseCoord: Minecraft tilde is relative to base; bare number is absolute', () => {
  assert.equal(parseCoord('~', 100), 100);     // ~ = base
  assert.equal(parseCoord('~5', 100), 105);    // ~5 = base+5
  assert.equal(parseCoord('~-3', 100), 97);    // ~-3 = base-3
  assert.equal(parseCoord('42', 100), 42);     // absolute
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/console/core.test.mjs`
Expected: FAIL — `parseNum` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `src/console-core.js`)

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/console/core.test.mjs`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/console-core.js tests/console/core.test.mjs
git commit -m "feat(console): number + tilde-coordinate parsing"
```

---

## Task 3: console-core — registry + dispatch

**Files:**
- Modify: `src/console-core.js`
- Test: `tests/console/core.test.mjs`

- [ ] **Step 1: Write the failing test** (append)

```js
import { createRegistry } from '../../src/console-core.js';

function reg() {
  const r = createRegistry();
  r.register('tp', { args: [{ name: 'dest', type: 'pos' }], run: (a) => `tp -> ${a.dest.join(',')}` });
  r.register('summon', {
    args: [{ name: 'type', type: 'word' }, { name: 'at', type: 'pos', optional: true, default: null }],
    run: (a) => `summon ${a.type}@${a.at ? a.at.join(',') : 'self'}`,
  });
  r.register('say', { args: [{ name: 'msg', type: 'rest' }], run: (a) => `say:${a.msg}` });
  r.register('mode', { args: [{ name: 'm', type: 'enum', choices: ['creative', 'survival'] }], run: (a) => `mode:${a.m}` });
  return r;
}

test('dispatch: unknown command ⇒ ok:false', () => {
  const r = reg();
  assert.deepEqual(r.dispatch('/nope'), { ok: false, error: 'Unknown command: /nope' });
});
test('dispatch: pos args resolve tilde against ctx.origin', () => {
  const r = reg();
  assert.deepEqual(r.dispatch('/tp ~ ~10 50', { origin: [3, 4, 5] }), { ok: true, message: 'tp -> 3,14,50' });
});
test('dispatch: optional pos omitted ⇒ default', () => {
  const r = reg();
  assert.deepEqual(r.dispatch('/summon grunt'), { ok: true, message: 'summon grunt@self' });
});
test('dispatch: missing required arg ⇒ ok:false with message', () => {
  const r = reg();
  const res = r.dispatch('/tp 1 2');
  assert.equal(res.ok, false);
  assert.match(res.error, /missing coordinates/);
});
test('dispatch: rest grabs all remaining tokens', () => {
  const r = reg();
  assert.deepEqual(r.dispatch('/say hello brave new world'), { ok: true, message: 'say:hello brave new world' });
});
test('dispatch: enum rejects bad value', () => {
  const r = reg();
  const res = r.dispatch('/mode flying');
  assert.equal(res.ok, false);
  assert.match(res.error, /creative\|survival/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/console/core.test.mjs`
Expected: FAIL — `createRegistry` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `src/console-core.js`)

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/console/core.test.mjs`
Expected: PASS (13 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/console-core.js tests/console/core.test.mjs
git commit -m "feat(console): command registry + arg-parsing dispatch"
```

---

## Task 4: console-core — @-selector parse & resolve

**Files:**
- Modify: `src/console-core.js`
- Test: `tests/console/core.test.mjs`

- [ ] **Step 1: Write the failing test** (append)

```js
import { parseSelector, resolveSelector } from '../../src/console-core.js';

test('parseSelector: @p/@a/@e/@s recognised; bare word ⇒ name target', () => {
  assert.deepEqual(parseSelector('@e'), { kind: 'e' });
  assert.deepEqual(parseSelector('@s'), { kind: 's' });
  assert.deepEqual(parseSelector('Boris'), { kind: 'name', value: 'Boris' });
});
test('resolveSelector: routes to the injected provider', () => {
  const self = { id: 'me' };
  const others = [{ id: 'a' }, { id: 'b' }];
  const provider = { self, players: () => [self, ...others], entities: () => [{ id: 'z1' }] };
  assert.deepEqual(resolveSelector({ kind: 's' }, provider), [self]);
  assert.deepEqual(resolveSelector({ kind: 'a' }, provider), [self, ...others]);
  assert.deepEqual(resolveSelector({ kind: 'p' }, provider), [self]);              // nearest = first for now
  assert.deepEqual(resolveSelector({ kind: 'e' }, provider), [{ id: 'z1' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/console/core.test.mjs`
Expected: FAIL — `parseSelector` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `src/console-core.js`)

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/console/core.test.mjs`
Expected: PASS (15 tests total). Also run the whole suite to confirm nothing regressed: `node --test tests/` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/console-core.js tests/console/core.test.mjs
git commit -m "feat(console): @-selector parse + resolve (provider-injected)"
```

---

## Task 5: console.js — DevConsole with real commands (verified-API subset)

**Files:**
- Create: `src/console.js`

> Ships commands backed by **already-existing** game APIs. Future systems (bleeding, radiation, threat-tier, day/night) register their own commands when built (see "Extending" note at end of file).

- [ ] **Step 1: Write `src/console.js`**

```js
// console.js — in-game dev console («ПОЛИГОН» creative backbone). Minecraft-style syntax.
// Pure parsing lives in console-core.js; this wires commands to live game subsystems.
import * as THREE from 'three';
import { createRegistry } from './console-core.js';
import { ENEMY_TYPES } from './enemies.js';

const ENEMY_KEYS = Object.keys(ENEMY_TYPES);

export class DevConsole {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.history = [];
    this._hi = -1;
    this.reg = createRegistry();
    this._registerCommands();
    this._buildDom();
  }

  // ---- command registry (verified APIs only) ----
  _registerCommands() {
    const g = this.game;
    const playerPos = () => g.player.pos;

    this.reg.register('help', { args: [], run: () => 'Commands: /' + this.reg.names().join('  /') });
    this.reg.register('pos', { args: [], run: () => { const p = playerPos(); return `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}`; } });
    this.reg.register('seed', { args: [], run: () => `seed ${g.world.terrain ? g.world.terrain.seed ?? 1337 : 'flat'} (map ${g.mapId})` });
    this.reg.register('clear', { args: [], run: () => { this._log.innerHTML = ''; return ''; } });

    this.reg.register('tp', {
      args: [{ name: 'dest', type: 'pos' }],
      run: (a) => {
        const [x, , z] = a.dest;
        let y = a.dest[1];
        if (g.world.hasTerrain) y = Math.max(y, g.world.groundY(x, z)); // never under the terrain
        g.player.pos.set(x, y, z); g.player.vel.set(0, 0, 0);
        return `Teleported to ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`;
      },
    });

    this.reg.register('summon', {
      args: [
        { name: 'type', type: 'enum', choices: ENEMY_KEYS },
        { name: 'at', type: 'pos', optional: true, default: null },
      ],
      run: (a) => {
        let p;
        if (a.at) p = new THREE.Vector3(a.at[0], a.at[1], a.at[2]);
        else {
          const o = g.player.pos; p = new THREE.Vector3(o.x, o.y, o.z - 6); // 6 m in front (−Z)
        }
        if (g.world.hasTerrain) p.y = g.world.groundY(p.x, p.z);
        g.enemies.spawn(a.type, p);
        return `Summoned ${a.type}`;
      },
    });

    this.reg.register('kill', { args: [], run: () => { const n = g.enemies.aliveCount; g.enemies.clearAll(); return `Cleared ${n} Engendros`; } });

    this.reg.register('give', {
      args: [{ name: 'what', type: 'enum', choices: ['money', 'health', 'armor'] }, { name: 'amount', type: 'int', optional: true, default: 100 }],
      run: (a) => {
        const n = a.amount;
        if (a.what === 'money') g.player.addMoney(n);
        else if (a.what === 'health') { g.player.hp = Math.min(g.player.maxHp, g.player.hp + n); g.hud.setHealth(g.player.hp, g.player.maxHp); }
        else if (a.what === 'armor') { g.player.armor = Math.min(g.player.armorMax, g.player.armor + n); g.hud.setArmor(g.player.armor, g.player.armorMax); }
        return `Gave ${n} ${a.what}`;
      },
    });

    this.reg.register('effect', {
      args: [{ name: 'kind', type: 'enum', choices: ['heal', 'hurt'] }, { name: 'amount', type: 'int', optional: true, default: 20 }],
      run: (a) => {
        if (a.kind === 'heal') { g.player.hp = Math.min(g.player.maxHp, g.player.hp + a.amount); g.hud.setHealth(g.player.hp, g.player.maxHp); }
        else g.player.hurt(a.amount);
        return `${a.kind} ${a.amount}`;
      },
    });

    this.reg.register('gamerule', {
      args: [{ name: 'rule', type: 'enum', choices: ['god'] }, { name: 'value', type: 'enum', choices: ['on', 'off', 'true', 'false'] }],
      run: (a) => {
        const on = a.value === 'on' || a.value === 'true';
        g.rules.god = on;
        return `gamerule ${a.rule} = ${on}`;
      },
    });

    // /fly toggles the existing dev freecam (noclip). Verified: Game.toggleFreecam() + Game.freecam.
    this.reg.register('fly', { args: [], run: () => { if (g.toggleFreecam) g.toggleFreecam(); return `freecam ${g.freecam ? 'on' : 'off'}`; } });
  }

  // ---- DOM ----
  _buildDom() {
    this._el = document.getElementById('console');
    this._log = document.getElementById('console-log');
    this._input = document.getElementById('console-input');
    if (!this._input) return;
    this._input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') { this._submit(this._input.value); this._input.value = ''; }
      else if (e.code === 'Escape') { this.close(); }
      else if (e.code === 'ArrowUp') { this._recall(-1); e.preventDefault(); }
      else if (e.code === 'ArrowDown') { this._recall(1); e.preventDefault(); }
    });
  }

  _submit(line) {
    if (!line.trim()) return;
    this.history.push(line); this._hi = this.history.length;
    const ctx = { origin: [this.game.player.pos.x, this.game.player.pos.y, this.game.player.pos.z], game: this.game };
    const res = this.reg.dispatch(line, ctx);
    this._print((res.ok ? '» ' : '✗ ') + (res.ok ? (res.message || 'ok') : res.error), res.ok ? '#9fd' : '#f88');
  }

  _print(text, color) {
    if (!this._log) return;
    const d = document.createElement('div'); d.textContent = text; d.style.color = color || '#cde';
    this._log.appendChild(d); this._log.scrollTop = this._log.scrollHeight;
  }

  _recall(dir) {
    if (!this.history.length) return;
    this._hi = Math.max(0, Math.min(this.history.length, this._hi + dir));
    this._input.value = this.history[this._hi] || '';
  }

  toggle() { this.open ? this.close() : this.openConsole(); }
  openConsole(prefill = '') {
    if (!this._el) return;
    this.open = true; this._el.classList.add('show');
    this.game.input.exitLock(); this.game.input.enabled = false;
    this._input.value = prefill; this._input.focus();
  }
  close() {
    if (!this._el) return;
    this.open = false; this._el.classList.remove('show');
    this.game.input.enabled = true;
  }

  // ---- F3 debug overlay (updated each frame from game) ----
  updateF3(visible) {
    const el = document.getElementById('f3debug');
    if (!el) return;
    el.classList.toggle('show', !!visible);
    if (!visible) return;
    const p = this.game.player.pos;
    const gy = this.game.world.groundY ? this.game.world.groundY(p.x, p.z).toFixed(1) : '0';
    el.textContent = `XYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}   ground ${gy}   map ${this.game.mapId}   seed ${this.game.world.terrain ? (this.game.world.terrain.seed ?? 1337) : '-'}   enemies ${this.game.enemies.aliveCount}`;
  }
}

// Extending: future systems register their own commands, e.g. in their init:
//   game.devconsole.reg.register('effect', { args:[...], run:(a)=>{ ...bleeding/radiation... } });
// or add new /threat, /time, /weather once those subsystems exist.
```

- [ ] **Step 2: Verify it parses (no syntax errors)**

Run: `node -e "import('./src/console-core.js').then(()=>console.log('core OK'))"`
Expected: `core OK` (console.js itself imports THREE/DOM so isn't node-loadable; the in-browser smoke in Task 8 verifies it).

- [ ] **Step 3: Commit**

```bash
git add src/console.js
git commit -m "feat(console): DevConsole — real commands over verified game APIs"
```

---

## Task 6: index.html — console + F3 DOM & CSS

**Files:**
- Modify: `index.html` (add inside `#hud`, after `<div id="killfeed"></div>` at line ~904)

- [ ] **Step 1: Add the DOM**

Insert after `<div id="killfeed"></div>`:

```html
    <div id="f3debug"></div>
    <div id="console">
      <div id="console-log"></div>
      <input id="console-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="/help — Esc closes" />
    </div>
```

- [ ] **Step 2: Add the CSS** (in the `<style>` block, near other HUD rules)

```css
#f3debug { position: absolute; top: 6px; left: 8px; font: 12px/1.45 ui-monospace, Menlo, monospace; color: #b8e6c0; text-shadow: 0 1px 2px #000; background: rgba(0,0,0,.35); padding: 4px 8px; border-radius: 4px; pointer-events: none; display: none; white-space: pre; }
#f3debug.show { display: block; }
#console { position: absolute; left: 0; right: 0; bottom: 0; display: none; flex-direction: column; background: rgba(8,10,12,.86); border-top: 2px solid #3a4a3a; font: 13px/1.5 ui-monospace, Menlo, monospace; z-index: 60; }
#console.show { display: flex; }
#console-log { max-height: 38vh; overflow-y: auto; padding: 8px 10px; color: #cde; }
#console-input { width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0c0f0c; color: #dfe; border: none; border-top: 1px solid #2a3a2a; outline: none; font: inherit; }
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(console): console + F3 DOM and CSS"
```

---

## Task 7: game.js + player.js — wire DevConsole

**Files:**
- Modify: `src/game.js` (constructor wiring; the `input.on('key', …)` handler ~line 232; the frame loop)
- Modify: `src/player.js` (`hurt()` god-guard)

- [ ] **Step 1: Import + instantiate in `game.js`**

Add the import near the other `src/` imports at the top of `game.js`:

```js
import { DevConsole } from './console.js';
```

In the `Game` constructor, after `this.enemies = new EnemyManager(this);` (~line 73), add:

```js
    this.rules = { god: false };       // «ПОЛИГОН» gamerules
    this.devconsole = new DevConsole(this);
    this.f3 = false;
```

- [ ] **Step 2: Open the console / toggle F3 from the key handler**

In `this.input.on('key', (code) => { … })` (~line 232), immediately after the `if (this.state !== 'playing') return;` guard, add:

```js
      if (this.devconsole && this.devconsole.open) return; // console eats input while open
      if (code === 'Backquote' || code === 'Slash') { this.devconsole.openConsole(code === 'Slash' ? '/' : ''); return; }
      if (code === 'F3') { this.f3 = !this.f3; return; }
```

- [ ] **Step 3: Update F3 each frame**

In `_frame(t)` (or `_updatePlaying(dt)`), where the HUD is refreshed, add one line so F3 tracks live state:

```js
    if (this.devconsole) this.devconsole.updateF3(this.f3 && this.state === 'playing');
```

(Place it inside `_frame`, after `engine.update/render`, so it runs every frame regardless of pause.)

- [ ] **Step 4: god-guard in `player.js` `hurt()`**

Insert as the **first statement inside `hurt(...)`**, immediately before `const mp = this.game.mp;` (player.js ~line 48):

```js
    if (this.game.rules && this.game.rules.god) return;
```

- [ ] **Step 5: Commit**

```bash
git add src/game.js src/player.js
git commit -m "feat(console): wire DevConsole + F3 + god gamerule into Game"
```

---

## Task 8: In-browser smoke verification + cache-bust

**Files:**
- Modify: `index.html` (bump `?v=`), `src/game.js` (bump `GAME_BUILD`)

- [ ] **Step 1: Run the full node test suite**

Run: `node --test tests/`
Expected: all green (console core + existing destruct/fire/simclock/terrain suites).

- [ ] **Step 2: Serve on a fresh port**

Run: `python3 -m http.server 8455 --directory "/Users/macmini1/game 4.8/.claude/worktrees/playable-demo"`

- [ ] **Step 3: Playwright smoke (load `select:` the playwright tools first)**

Navigate `http://localhost:8455/?map=demo&cb=1`, then in the page:
1. Confirm `window.GAME.devconsole` exists, `window.GAME.rules.god === false`.
2. Drive the console programmatically (bypasses pointer-lock for the test):
   ```js
   GAME.state='playing';
   GAME.devconsole.reg.dispatch('/summon grunt ~ ~ ~', {origin:[GAME.player.pos.x,GAME.player.pos.y,GAME.player.pos.z], game:GAME});
   ```
   Expected return `{ok:true, message:'Summoned grunt'}` and `GAME.enemies.aliveCount` increments.
3. `GAME.devconsole.reg.dispatch('/tp 60 ~ -40', {origin:[GAME.player.pos.x,GAME.player.pos.y,GAME.player.pos.z]})` → player.pos.x ≈ 60, z ≈ −40, y ≈ terrain height (not underground).
4. `GAME.devconsole.reg.dispatch('/gamerule god on')` → `GAME.rules.god === true`; then `GAME.player.hurt(50)` leaves hp unchanged.
5. `GAME.devconsole.reg.dispatch('/nope')` → `{ok:false, error:'Unknown command: /nope'}`.
6. `GAME.devconsole.updateF3(true)` → `#f3debug` has text content with `XYZ`.

Expected: all asserts hold; **zero console errors** on load.

- [ ] **Step 4: Cache-bust (per CLAUDE.md ritual)**

Bump `index.html` entry `./src/game.js?v=N` to the next number, and `GAME_BUILD` in `src/game.js` to the current local minute.

- [ ] **Step 5: Commit**

```bash
git add index.html src/game.js
git commit -m "chore(console): node suite green + in-browser smoke + cache-bust (Faze 0 done)"
```

---

## Done = Fáze 0 hotová

In-game konzole otevíratelná (`` ` `` / `/`), plná MC-style syntax přes `console-core` (node-tested), reálné příkazy `/tp /summon /kill /give /effect /gamerule /fly /pos /seed /clear /help` nad ověřenými API, F3 overlay (souřadnice/ground/seed/enemies), god gamerule + freecam. **«ПОЛИГОН» backbone stojí** — každá další mechanika (Fáze 1+) si zaregistruje svůj příkaz (`/effect bleeding`, `/gamerule radiation`, `/threat`, `/time`, `/weather`).
