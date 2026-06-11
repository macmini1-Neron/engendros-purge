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

    this.reg.register('help', { args: [], run: () => 'Commands: /' + this.reg.names().join('  /') });
    this.reg.register('pos', { args: [], run: () => { const p = g.player.pos; return `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}`; } });
    this.reg.register('seed', { args: [], run: () => `seed ${g.world.terrain ? g.world.terrain.seed ?? 1337 : 'flat'} (map ${g.mapId})` });
    this.reg.register('clear', { args: [], run: () => { if (this._log) this._log.innerHTML = ''; return ''; } });

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
    this._f3 = document.getElementById('f3debug');
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
    if (!this._el || !this._input) return;
    this.open = true; this._el.classList.add('show');
    this.game.input.exitLock(); this.game.input.enabled = false;
    this._input.value = prefill; this._input.focus();
  }
  close() {
    if (!this._el) return;
    this.open = false; this._el.classList.remove('show');
    this.game.input.enabled = true;
    if (this.game.state === 'playing') this.game.input.requestLock();
  }

  // ---- F3 debug overlay (updated each frame from game) ----
  updateF3(visible) {
    const el = this._f3;
    if (!el) return;
    el.classList.toggle('show', !!visible);
    if (!visible) return;
    const p = this.game.player.pos;
    const gy = this.game.world.groundY ? this.game.world.groundY(p.x, p.z).toFixed(1) : '0';
    el.textContent = `XYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}   ground ${gy}   map ${this.game.mapId}   seed ${this.game.world.terrain ? (this.game.world.terrain.seed ?? 1337) : '-'}   enemies ${this.game.enemies.aliveCount}`;
  }
}

// Extending: future systems register their own commands, e.g. in their init:
//   game.devconsole.reg.register('bleed', { args:[...], run:(a)=>{ ...bleeding/radiation... } });
// or add new /threat, /time, /weather once those subsystems exist.
