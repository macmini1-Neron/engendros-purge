// console.js — in-game dev console («ПОЛИГОН» creative backbone). Minecraft-style syntax.
// Pure parsing lives in console-core.js; this wires commands to live game subsystems.
import * as THREE from 'three';
import { createRegistry, suggest, highlight, parseSummonArgs, parseCoord } from './console-core.js';
import { parseHHMM, formatHHMM, keywordMinute } from './worldclock.js';
import { ENEMY_TYPES } from './enemies.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { ITEM_DEFS } from './loot.js';
import { EFFECTS, applyEffect, clearEffects } from './effects-status.js';
import { yawToMils, formatUglomer } from './bearing.js';

const ENEMY_KEYS = Object.keys(ENEMY_TYPES);
const _projV = new THREE.Vector3(); // scratch for projecting enemy world positions to screen (F3 labels)

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
    const isEnemy = (t) => t && t !== g.player && t.alive !== undefined; // enemy targets carry .alive; the player does not
    const GIVE_CHOICES = ['money', 'health', 'armor', ...WEAPON_ORDER, ...Object.keys(ITEM_DEFS)]; // /give: resources + any weapon/item key (built lazily so module init order is safe)

    this.reg.register('help', { args: [], run: () => 'Commands: /' + this.reg.names().join('  /') });
    this.reg.register('pos', { args: [], run: () => { const p = g.player.pos; return `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}`; } });
    this.reg.register('seed', { args: [], run: () => `seed ${g.world.terrain ? g.world.terrain.seed ?? 1337 : 'flat'} (map ${g.mapId})` });
    this.reg.register('clear', { args: [], run: () => { const n = g.inventory.slots.filter(Boolean).length; g.inventory.reset(); g.inventory._holdNothing(); if (g.hud) g.hud.setWeapon(g.weapons); return n ? `Cleared inventory (${n} item${n === 1 ? '' : 's'})` : 'Inventory already empty'; } }); // Minecraft /clear = wipe items INCLUDING what's in hand (reset only hides item models; _holdNothing also holsters the weapon viewmodel). Console scrollback is cleared with F3+D

    this.reg.register('tp', {
      args: [{ name: 'target', type: 'target' }, { name: 'dest', type: 'pos' }],
      run: (a) => {
        const [x, , z] = a.dest; let y = a.dest[1];
        if (g.world.hasTerrain) y = Math.max(y, g.world.groundY(x, z)); // never under the terrain
        let n = 0;
        for (const t of (a.target || [])) {
          if (t === g.player) { t.pos.set(x, y, z); t.vel.set(0, 0, 0); n++; }
          else if (isEnemy(t)) { t.pos.set(x, y, z); n++; }
        }
        return `Teleported ${n} to ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`;
      },
    });

    // /summon <type> [x y z] [count] [{NoAI:1}] — entity-first (Minecraft order). count + the {NoAI:1}
    // dummy tag are our extensions (vanilla /summon has neither); the tail blob is parsed order-tolerantly.
    // The whole tail after <type> is parsed freeform ("[x y z] [count] [{NoAI:1}]") so the NBT tag never
    // mis-colours as a bad coordinate and the suggest popup can offer {NoAI:1}; coords stay optional.
    this.reg.register('summon', {
      args: [
        { name: 'type', type: 'enum', choices: ENEMY_KEYS },
        { name: 'tail', type: 'rest', suggest: ['{NoAI:1}'] },
      ],
      run: (a) => {
        const { coordToks, count, noAI } = parseSummonArgs(a.tail);
        const o = g.player.pos;
        const base = coordToks
          ? new THREE.Vector3(parseCoord(coordToks[0], o.x), parseCoord(coordToks[1], o.y), parseCoord(coordToks[2], o.z))
          : new THREE.Vector3(o.x, o.y, o.z - 6); // no coords ⇒ 6 m in front (−Z)
        for (let k = 0; k < count; k++) {
          const p = base.clone();
          if (count > 1) { p.x += (Math.random() - 0.5) * 3; p.z += (Math.random() - 0.5) * 3; } // scatter so they don't stack on one point
          if (g.world.hasTerrain) p.y = g.world.groundY(p.x, p.z);
          const e = g.enemies.spawn(a.type, p);
          if (noAI) e.noAI = true; // dummy: stands still, no contact damage (host-authoritative — enough on the spawner)
        }
        return `Summoned ${count > 1 ? count + ' × ' : ''}${a.type}${noAI ? ' (dummy)' : ''}`;
      },
    });

    this.reg.register('kill', {
      args: [{ name: 'target', type: 'target', optional: true, default: null }],
      run: (a) => {
        if (!a.target) { const n = g.enemies.aliveCount; g.enemies.clearAll(); return `Cleared ${n} Engendros`; } // no target = wipe enemies (legacy)
        let n = 0;
        for (const t of a.target) {
          if (t === g.player) { g.player.hurt(99999); n++; }
          else if (isEnemy(t)) { g.enemies.damage(t, t.hp + 9999, 'console'); n++; }
        }
        return `Killed ${n}`;
      },
    });

    this.reg.register('give', {
      args: [{ name: 'target', type: 'target' }, { name: 'what', type: 'word', suggest: GIVE_CHOICES }, { name: 'amount', type: 'int', optional: true, default: null }],
      run: (a) => {
        const ps = (a.target || []).filter((t) => t === g.player); // v1: only the local player is actionable (co-op = Phase 2)
        if (!ps.length) return 'No player target (give affects players).';
        const what = a.what;
        if (what === 'money' || what === 'health' || what === 'armor') {
          const n = a.amount ?? 100;
          for (const p of ps) {
            if (what === 'money') p.addMoney(n);
            else if (what === 'health') { p.hp = Math.min(p.maxHp, p.hp + n); g.hud.setHealth(p.hp, p.maxHp); }
            else { p.armor = Math.min(p.armorMax, p.armor + n); g.hud.setArmor(p.armor, p.armorMax); }
          }
          return `Gave ${n} ${what}`;
        }
        if (!WEAPONS[what] && !ITEM_DEFS[what]) return `Unknown item: ${what}`; // weapon/item key or a resource only
        const qty = Math.max(1, Math.min(50, a.amount ?? 1));                    // amount = NUMBER OF ITEMS (one slot each), not a stack value
        const def = ITEM_DEFS[what];
        const val = WEAPONS[what] ? 1 : ((def && (def.heal ?? def.food ?? def.armor)) ?? 1); // each copy carries its natural payload (heal/food/armor) or 1
        const pl = ps[0];
        let added = 0, dropped = 0;
        for (let k = 0; k < qty; k++) {
          if (WEAPONS[what] && g.weapons.grant) g.weapons.grant(what);           // own the weapon so it's usable
          if (g.inventory.addItem(what, val)) added++;
          else { g.loot.spawnNetPickup(what, pl.pos.x, pl.pos.z, val); dropped++; } // backpack full → the rest drops at the player's feet
        }
        const head = added > 0 ? `Gave ${what}${added > 1 ? ' ×' + added : ''}` : 'Backpack full';
        return dropped ? `${head} — ${dropped} dropped at your feet` : head;
      },
    });

    // /time → status (+ co-op Δ vs host) · /time set HH:MM|<phase> · /time check
    const timeStatus = () => {
      const wc = g._worldClock; const base = `${formatHHMM(wc.minuteOfDay())} · day ${wc.day() + 1}`;
      if (!g.mp.active) return base;                            // solo: the local clock IS the authority
      if (g.mp.isHost) return `${base} · host (time authority)`;
      const drift = g.mp._lastClockDrift;                       // client: last measured prediction error vs host
      return `${base} · Δ host ${drift == null ? '—' : (drift > 0 ? '+' : '') + drift + 'm'}`;
    };
    const timeCheck = () => {
      if (!g.mp.active) return 'solo — clock is locally authoritative (always in sync)';
      if (g.mp.isHost) return 'host — you ARE the time authority';
      const drift = g.mp._lastClockDrift;
      if (drift == null) return 'client — no host clock received yet';
      return Math.abs(drift) <= 1 ? `✓ IN SYNC (Δ host ${drift > 0 ? '+' : ''}${drift}m ≤ 1)` : `✗ OUT OF SYNC (Δ host ${drift}m)`;
    };
    this.reg.register('time', {
      args: [
        { name: 'op', type: 'word', optional: true, suggest: ['set', 'check'] },
        { name: 'val', type: 'word', optional: true, suggest: ['dawn', 'noon', 'dusk', 'midnight'] },
      ],
      run: (a) => {
        if (!g._worldClock || !g.dayNight) return 'World clock not available';
        if (!a.op) return timeStatus();
        if (a.op === 'check') return timeCheck();
        if (a.op !== 'set') return '/time: use  set <HH:MM|phase>  ·  check  ·  (no args = status)';
        if (a.val == null) return 'usage: /time set <HH:MM | dawn | noon | dusk | midnight>';
        let min = parseHHMM(a.val); if (min == null) min = keywordMinute(a.val);
        if (min == null) return `/time set: "${a.val}" is not HH:MM (e.g. 20:18) or a phase (dawn/noon/dusk/midnight)`;
        if (g.mp.active && !g.mp.isHost) { g.mp.requestSetTime(min); return `→ asked host to set ${formatHHMM(min)} (host-authoritative)`; }
        g.dayNight.setMinuteOfDay(min);
        return `Time set to ${formatHHMM(min)}`;
      },
    });

    // P1-P2 wired effects only (burn stays on its legacy/co-op path until P3) + heal/hurt/clear.
    const FX_KEYS = ['radiation', 'bleed', 'broken_leg'];
    this.reg.register('effect', {
      args: [
        { name: 'target', type: 'target' },
        { name: 'kind', type: 'enum', choices: ['heal', 'hurt', 'clear', ...FX_KEYS] },
        { name: 'amount', type: 'int', optional: true },   // heal/hurt = HP; an effect = seconds
      ],
      run: (a) => {
        let n = 0;
        for (const t of (a.target || [])) {
          if (a.kind === 'heal') {
            const amt = a.amount ?? 20;
            if (t === g.player) { t.hp = Math.min(t.maxHp, t.hp + amt); g.hud.setHealth(t.hp, t.maxHp); n++; }
            else if (isEnemy(t)) { g.enemies.heal(t, amt); n++; }
          } else if (a.kind === 'hurt') {
            const amt = a.amount ?? 20;
            if (t === g.player) { t.hurt(amt); n++; }
            else if (isEnemy(t)) { g.enemies.damage(t, amt, 'console'); n++; }
          } else if (a.kind === 'clear') {
            clearEffects(t, g._fxCtx); n++;
          } else {                                          // an effect key from FX_KEYS
            const def = EFFECTS[a.kind];
            if (def.targets === 'player' && isEnemy(t)) continue;   // player-only effect (e.g. broken_leg) — don't claim a phantom enemy target
            if (applyEffect(t, a.kind, a.amount ?? def.secs, g._fxCtx)) n++;
          }
        }
        if (a.kind === 'clear') return `cleared effects → ${n} target(s)`;
        if (a.kind === 'heal' || a.kind === 'hurt') return `${a.kind} ${a.amount ?? 20} → ${n} target(s)`;
        return `${a.kind} ${a.amount ?? EFFECTS[a.kind].secs}s → ${n} target(s)`;
      },
    });

    // doMobSpawning = freeze natural/wave spawns (/summon still works); spawn_mobs = the 1.21.11+ MC alias.
    // sendCommandFeedback = show/hide the console command echo + success lines (Minecraft's chat-feedback rule).
    const RULE_KEY = { god: 'god', doMobSpawning: 'doMobSpawning', spawn_mobs: 'doMobSpawning', sendCommandFeedback: 'sendCommandFeedback' };
    this.reg.register('gamerule', {
      args: [{ name: 'rule', type: 'enum', choices: ['god', 'doMobSpawning', 'spawn_mobs', 'sendCommandFeedback'] }, { name: 'value', type: 'enum', choices: ['true', 'false'] }], // Minecraft uses true/false (no on/off)
      run: (a) => {
        const on = a.value === 'true';
        const key = RULE_KEY[a.rule];
        g.rules[key] = on;
        return `gamerule ${key} = ${on}`;
      },
    });

    // /fly = player fly mode (noclip free movement) with the sim STILL running — NOT the N freecam (which freezes spawns/enemies).
    this.reg.register('fly', { args: [], run: () => { g.flyMode = !g.flyMode; if (g.flyMode) g.player.onGround = false; g.hud.bigMessage(g.flyMode ? '✈ FLY' : 'FLY OFF', g.flyMode ? 'WASD fly · Space up · Ctrl/C down · world keeps running' : ''); return `fly ${g.flyMode ? 'on' : 'off'}`; } });

    // /testtree [species] [scale] — DEV: spawn/reset one isolated test tree with per-piece flat debug colors.
    // Every wood piece (standing trunk, stump, falling top, each log chunk) gets a DISTINCT flat color so you
    // can see exactly which piece is which as the tree fells/sections. Re-running fully resets the test tree.
    this.reg.register('testtree', {
      args: [
        { name: 'species', type: 'word', optional: true, suggest: ['oak', 'birch', 'scotsPine', 'pine', 'poplar', 'willow'] },
        { name: 'scale',   type: 'word', optional: true },
      ],
      run: (a) => {
        if (!g.forest || typeof g.forest.spawnTestTree !== 'function') return 'forest not active — load ?map=forest first';
        const VALID = ['scotsPine', 'birch', 'oak', 'poplar', 'willow'];
        let sp = a.species || 'oak';
        if (sp === 'pine') sp = 'scotsPine';   // friendly alias
        if (!VALID.includes(sp)) sp = 'oak';
        const sc = parseFloat(a.scale);
        const scale = isFinite(sc) ? Math.max(0.4, Math.min(3, sc)) : 1.0;
        const rec = g.forest.spawnTestTree(sp, scale);
        return `test tree spawned: ${rec.species} scale ${scale.toFixed(2)} at (${rec.x.toFixed(1)}, ${rec.z.toFixed(1)}) — /testtree again to reset`;
      },
    });
  }

  // ---- DOM ----
  _buildDom() {
    this._el = document.getElementById('console');
    this._log = document.getElementById('console-log');
    this._input = document.getElementById('console-input');
    this._hl = document.getElementById('console-hl');   // colour overlay painted behind the (transparent-text) input
    this._f3 = document.getElementById('f3debug');
    this._entCanvas = document.getElementById('entlabels');
    this._entCtx = this._entCanvas ? this._entCanvas.getContext('2d') : null;
    this._entSize = { w: 0, h: 0 };
    this._suggestEl = document.getElementById('console-suggest');
    this._sugList = []; this._sugIdx = 0;
    if (!this._input) return;
    this._input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Tab') { e.preventDefault(); this._complete(); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') { const res = this._submit(this._input.value); this._input.value = ''; if (res && res.ok) this.close(); else this._refreshInput(); } // Enter (incl. num-pad) submits; success → close (Minecraft), error → stay open
      else if (e.code === 'Escape') { if (this._sugList.length) { this._sugList = []; this._renderSuggest(); } else this.close(false); } // Esc closes WITHOUT re-locking (see close()) so it can never bounce into the pause menu
      else if (e.code === 'ArrowUp') { e.preventDefault(); if (this._sugList.length) { this._sugIdx = (this._sugIdx - 1 + this._sugList.length) % this._sugList.length; this._renderSuggest(); } else this._recall(-1); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); if (this._sugList.length) { this._sugIdx = (this._sugIdx + 1) % this._sugList.length; this._renderSuggest(); } else this._recall(1); }
    });
    this._input.addEventListener('input', () => this._refreshInput());
    this._input.addEventListener('scroll', () => this._syncScroll());
  }

  _submit(line) {
    if (!line.trim()) return;
    this.history.push(line); this._hi = this.history.length;
    const feedback = !this.game.rules || this.game.rules.sendCommandFeedback !== false; // /gamerule sendCommandFeedback false hides the echo + success lines (errors still show)
    const shown = line.trim();
    if (feedback) this._print('› ' + (shown[0] === '/' ? shown : '/' + shown), 'c-echo'); // echo the sent command in gray (like Minecraft chat shows your message)
    const g = this.game;
    const sel = {
      self: g.player,
      players: () => [g.player], // co-op teammates added in Phase 2
      entities: (f) => { const a = g.enemies.active.filter((e) => e.alive); return (f && f.type) ? a.filter((e) => e.type === f.type) : a; },
      byName: (tok) => {
        const ent = g.enemies.active.filter((e) => e.alive && e.tag === tok);
        if (ent.length) return ent;                                         // an enemy by its tag (swarmer#7)
        return ((g.player.nick || g.player.name) === tok) ? [g.player] : []; // a player by nick
      },
    };
    const ctx = { origin: [g.player.pos.x, g.player.pos.y, g.player.pos.z], game: g, sel };
    const res = this.reg.dispatch(line, ctx);
    if (res.ok) { if (feedback) this._print(res.message || 'ok', 'c-ok'); } // success feedback is suppressed when sendCommandFeedback=false
    else this._print(res.error || 'failed', 'c-err');                       // errors ALWAYS show (Minecraft shows command errors regardless)
    return res;
  }

  _print(text, cls) {
    if (!this._log) return;
    const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls;
    this._log.appendChild(d); this._log.scrollTop = this._log.scrollHeight;
  }
  clearLog() { if (this._log) this._log.innerHTML = ''; } // F3+H — wipe the console scrollback (Minecraft's F3+D clears chat)

  _recall(dir) {
    if (!this.history.length) return;
    this._hi = Math.max(0, Math.min(this.history.length, this._hi + dir));
    this._input.value = this.history[this._hi] || '';
    this._renderHighlight();
  }

  _refreshInput() { this._renderHighlight(); this._refreshSuggest(); }
  _renderHighlight() {
    if (!this._hl) return;
    this._hl.textContent = ''; // rebuild as DOM nodes (textContent only) — no innerHTML, so user input can't inject markup
    for (const s of highlight(this._input.value, this.reg)) {
      const span = document.createElement('span'); span.className = s.cls; span.textContent = s.text;
      this._hl.appendChild(span);
    }
    this._syncScroll();
  }
  _syncScroll() { if (this._hl) this._hl.scrollLeft = this._input.scrollLeft; }
  _refreshSuggest() {
    const v = this._input ? this._input.value : '';
    this._sugList = v.trim() ? suggest(v, this.reg) : []; // empty line ⇒ no popup (Minecraft only shows it once you start a command)
    this._sugIdx = 0;
    this._renderSuggest();
  }
  _renderSuggest() {
    const el = this._suggestEl; if (!el) return;
    if (!this._sugList.length) { el.classList.remove('show'); el.innerHTML = ''; return; }
    el.classList.add('show'); el.innerHTML = '';
    let sel = null;
    this._sugList.forEach((s, i) => {
      const d = document.createElement('div');
      d.textContent = s; d.className = 'sug' + (i === this._sugIdx ? ' on' : '');
      if (i === this._sugIdx) sel = d;
      el.appendChild(d);
    });
    if (sel) sel.scrollIntoView({ block: 'nearest' }); // keep the ↑/↓-highlighted row visible (list is overflow-y:auto)
  }
  _complete() {
    if (!this._sugList.length) return;
    const pick = this._sugList[Math.max(0, this._sugIdx)];
    const v = this._input.value;
    const hasSlash = v.startsWith('/');
    const body = hasSlash ? v.slice(1) : v;
    const endsWithSpace = /\s$/.test(body);
    const parts = body.trim().length ? body.trim().split(/\s+/) : [];
    if (endsWithSpace || !parts.length) parts.push(pick); else parts[parts.length - 1] = pick;
    this._input.value = (hasSlash ? '/' : '') + parts.join(' ') + ' ';
    this._refreshInput();
  }

  toggle() { this.open ? this.close() : this.openConsole(); }
  openConsole(prefill = '') {
    if (!this._el || !this._input) return;
    this.open = true; this._el.classList.add('show');
    // Minecraft-style: opening chat must NOT pause. Mirror the survival inventory overlay —
    // flag the unlock as intentional so the 'unlock' handler skips pause(), then free the cursor.
    this.game._intentionalUnlock = true; this.game.input.exitLock(); this.game.input.enabled = false;
    this._input.value = prefill; this._input.focus();
    this._refreshInput();
  }
  close(relock = true) {
    if (!this._el) return;
    this.open = false; this._el.classList.remove('show');
    this.game.input.enabled = true;
    // Esc passes relock=false. Esc is the browser's "exit pointer lock" key, so re-locking inside the Esc
    // keystroke bounces straight back to an unlock — and the game's 'unlock' handler turns that into the
    // pause menu. Closing via Esc therefore leaves the cursor free (the next click re-locks). Enter (success)
    // keeps relock=true: Enter doesn't release the lock, so re-grabbing it cleanly returns you to mouse-look.
    if (relock && this.game.state === 'playing') this.game.input.requestLock();
    this._sugList = []; this._renderSuggest();
  }

  // ---- F3 debug overlay (Minecraft-style, rebuilt each frame from live game state) ----
  updateF3(visible) {
    const el = this._f3;
    if (!el) return;
    el.classList.toggle('show', !!visible);
    if (!visible) return;
    const g = this.game, p = g.player, pos = p.pos;
    // Facing — replicate the player forward vector (player.js): fwd = (−sin yaw·cp, sin pitch, −cos yaw·cp).
    const cp = Math.cos(p.pitch);
    const fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
    let dir, axis;
    if (Math.abs(fz) >= Math.abs(fx)) { dir = fz >= 0 ? 'south' : 'north'; axis = fz >= 0 ? 'Towards positive Z' : 'Towards negative Z'; }
    else { dir = fx >= 0 ? 'east' : 'west'; axis = fx >= 0 ? 'Towards positive X' : 'Towards negative X'; }
    const mcYaw = Math.atan2(-fx, fz) * 180 / Math.PI;                          // south = 0 (Minecraft convention)
    const mcPitch = -Math.asin(Math.max(-1, Math.min(1, fy))) * 180 / Math.PI;  // looking down = positive
    const di = (g.dayNight && g.dayNight.info) ? g.dayNight.info() : { night: false, n: 0, blood: false };
    const gy = g.world.groundY ? g.world.groundY(pos.x, pos.z).toFixed(1) : '0';
    el.textContent = [
      `ENGENDROS PURGE  ${g.gameVersion || ''}`,
      `${Math.round(g._fps || 0)} fps  (${(g._frameMs || 0).toFixed(1)} ms)  ·  ${g._draws || 0} draws  ·  ${(g._tris || 0).toLocaleString()} tris  ·  ${g.world && g.world.chunks ? g.world.chunks.visible : 0} chunks`,
      '',
      `XYZ: ${pos.x.toFixed(3)} / ${pos.y.toFixed(3)} / ${pos.z.toFixed(3)}`,
      `Block: ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}   (ground ${gy})`,
      `Facing: ${dir} (${axis}) (${mcYaw.toFixed(1)} / ${mcPitch.toFixed(1)})`,
      `Azimuth: ${formatUglomer(yawToMils(p.yaw))}  (угломер 60-00 · grid-N=+Z · CW→+X)`, // authoritative world datum (bearing.js). NB: the Facing line above uses the Minecraft −Z=north frame, so +Z reads "south" there but 00-00 (north) here — intentional.
      '',
      `Map: ${g.mapId}`,
      `Gamemode: ${g.mode}${g.rules && g.rules.god ? '  ·  GOD' : ''}${g.rules && !g.rules.doMobSpawning ? '  ·  NO-SPAWN' : ''}`,
      `Wave ${g.waves.wave}   ·   enemies ${g.enemies.aliveCount}`,
      `Day #${di.n}  ${di.night ? 'NIGHT' : 'DAY'}${di.blood ? '  · BLOOD MOON' : ''}`,
      `HP ${Math.round(p.hp)}/${p.maxHp}   ARM ${Math.round(p.armor)}   food ${Math.round(p.hunger)}`,
    ].join('\n');
  }

  // F3-gated floating tags (+HP) over the nearest living enemies, drawn on one canvas overlay.
  updateEntityLabels(visible) {
    const cv = this._entCanvas, ctx = this._entCtx; if (!cv || !ctx) return;
    if (!visible) { if (cv.classList.contains('show')) cv.classList.remove('show'); return; }
    cv.classList.add('show');
    const W = window.innerWidth, H = window.innerHeight;
    if (this._entSize.w !== W || this._entSize.h !== H) { cv.width = W; cv.height = H; this._entSize.w = W; this._entSize.h = H; }
    ctx.clearRect(0, 0, W, H);
    const g = this.game, cam = g.engine.camera, px = g.player.pos;
    const near = g.enemies.active
      .filter((e) => e.alive)
      .map((e) => ({ e, d: e.pos.distanceTo(px) }))
      .filter((o) => o.d <= 50)
      .sort((a, b) => a.d - b.d)
      .slice(0, 24);
    ctx.font = '12px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    for (const { e } of near) {
      _projV.set(e.pos.x, e.pos.y + (e.def && e.def.scale ? e.def.scale * 2.2 : 2.2), e.pos.z).project(cam);
      if (_projV.z > 1) continue; // behind the camera / beyond the far plane
      const sx = (_projV.x * 0.5 + 0.5) * W, sy = (-_projV.y * 0.5 + 0.5) * H;
      const label = `${e.tag}  ${Math.max(0, Math.round(e.hp))}/${e.maxHp}`;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(label, sx + 1, sy + 1);
      ctx.fillStyle = '#d7ecd0'; ctx.fillText(label, sx, sy);
    }
  }
}

// Extending: future systems register their own commands, e.g. in their init:
//   game.devconsole.reg.register('bleed', { args:[...], run:(a)=>{ ...bleeding/radiation... } });
// or add new /threat, /time, /weather once those subsystems exist.
