// waves.js — extracted from game.js during the module split (mechanical move, no logic changes).
import { chc, pick, rr, weightedPick } from './util.js?u=3';
import { BOSS_ROSTER, MINIBOSS_NAMES, WAVE_ADVANCE_SECS, WAVE_TYPES } from './tuning.js';
import { ENEMY_TYPES } from './enemies.js';


export class WaveManager {
  constructor(game) { this.game = game; this.wave = 0; this.active = false; }
  reset() { this.wave = 0; this.active = false; this.toSpawn = 0; this.minibossPending = false; if (this.game.hud) this.game.hud.clearWaveTag(); }
  _coopMul() { const mp = this.game.mp; return (mp && mp.active) ? 1 + (Math.max(1, mp.pstate.size) - 1) * 0.5 : 1; } // co-op enemy multiplier (1p=1.0, 2p=1.5, 3p=2.0, 4p=2.5); single-player = 1
  startWave(n) {
    this.bossPick = null;
    if (this.game.mp.active && this.game.mp.isHost) { this.game.mp.respawnAll(); this.game.mp.net.send('wave', { n, label: 'WAVE ' + n, sub: 'co-op — hold the line' }); } // host: respawn bled-out players + broadcast the wave (both modes — hoisted above the longnight return)
    if (this.game.mode === 'longnight') return this._startLongNight(n);
    this.wave = n; this.active = true; this.spawned = 0;
    this.isBossWave = (n % 5 === 0);
    if (this.isBossWave) this.bossPick = BOSS_ROSTER[(Math.random() * BOSS_ROSTER.length) | 0];
    if (this._forceBoss) { this.isBossWave = true; this.bossPick = this._forceBoss; this._forceBoss = null; }
    // pick a wave archetype (specials only from wave 3)
    let typeKey = 'normal';
    if (!this.isBossWave && n >= 3 && chc(0.5)) typeKey = pick(['horde', 'stampede', 'volatile', 'elite']);
    this.typeKey = typeKey; const t = WAVE_TYPES[typeKey];
    this.minibossPending = (!this.isBossWave && n >= 3 && n % 5 === 3); // waves 3, 8, 13, …
    this.speedMul = (t.speedMul || 1);
    this.hpMul = (t.hpMul || 1);
    const pcMul = this._coopMul();                            // co-op scales enemy count; single-player unchanged
    this.cap = Math.round((t.cap || 24) * pcMul) + this.game.enemies.aliveCount; // +carried-over survivors so new spawns aren't starved
    this.total = this.isBossWave ? Math.round((6 + n * 1.4) * pcMul) : Math.round((5 + n * 2.3) * (t.countMul || 1) * pcMul);
    this.toSpawn = this.total; this.spawnTimer = 0.5; this.advanceTimer = null;
    this.weights = this._effectiveWeights(typeKey, n);
    if (this.game.player.armorOnWave > 0) { this.game.player.armor = Math.max(this.game.player.armor, Math.min(this.game.player.armorMax, this.game.player.armorOnWave)); this.game.hud.setArmor(this.game.player.armor, this.game.player.armorMax); }
    this.game.hud.setWave(n);
    // banner + persistent tag
    const title = this.isBossWave ? `WAVE ${n}` : `${t.label} ${n}`;
    let sub = this.isBossWave ? (this.bossPick === 'tank' ? 'T-90M «MITRI» ROLLS IN' : 'BOSS TOLO APPROACHES') : t.sub;
    this.game.hud.bigMessage(title, sub);
    const tags = [];
    if (this.isBossWave) tags.push({ t: '☠ BOSS' });
    else if (typeKey !== 'normal') tags.push({ t: t.label });
    if (this.minibossPending) tags.push({ t: '☠ Mini-boss' });
    this.game.hud.setWaveTag(tags);
    if (this.game.mp.active && this.game.mp.isHost) this.game.mp.net.send('wavetag', { tags }); // host: persistent special-wave tags → clients
    this.game.audio.waveStart();
  }
  // THE LONG NIGHT: endless escalation, boss every 5th wave, blood-moon swell.
  _startLongNight(n) {
    this.bossPick = null;
    this.wave = n; this.active = true; this.spawned = 0;
    this.isBossWave = (n % 5 === 0); this.minibossPending = false; this.typeKey = 'normal';
    if (this.isBossWave) this.bossPick = BOSS_ROSTER[(Math.random() * BOSS_ROSTER.length) | 0];
    if (this._forceBoss) { this.isBossWave = true; this.bossPick = this._forceBoss; this._forceBoss = null; }
    const blood = this.game.dayNight && this.game.dayNight.bloodMoon;
    this.speedMul = 1 + Math.min(n * 0.012, 0.45);
    this.hpMul = (1 + (n - 1) * 0.06) * (blood ? 1.2 : 1);
    const pcMul = this._coopMul();                            // co-op scales enemy count; single-player unchanged
    this.cap = Math.round(Math.min(60, 26 + Math.floor(n * 1.6)) * pcMul) + this.game.enemies.aliveCount; // +carried-over survivors
    this.total = this.isBossWave ? Math.round((8 + n * 1.6) * pcMul) : Math.round((8 + n * 3.0) * (blood ? 1.3 : 1) * pcMul);
    this.toSpawn = this.total; this.spawnTimer = 0.5; this.advanceTimer = null;
    this.weights = this._longNightWeights(n);
    if (this.game.player.armorOnWave > 0) { this.game.player.armor = Math.max(this.game.player.armor, Math.min(this.game.player.armorMax, this.game.player.armorOnWave)); this.game.hud.setArmor(this.game.player.armor, this.game.player.armorMax); }
    this.game.hud.setWave(n);
    this.game.hud.bigMessage(`WAVE ${n}`, this.isBossWave ? (this.bossPick === 'tank' ? 'T-90M «MITRI» ROLLS IN' : 'BOSS TOLO APPROACHES') : 'more keep coming…');
    const tags = []; if (this.isBossWave) tags.push({ t: '☠ BOSS' }); if (blood) tags.push({ t: '🔴 Blood Moon', mod: true });
    this.game.hud.setWaveTag(tags);
    if (this.game.mp.active && this.game.mp.isHost) this.game.mp.net.send('wavetag', { tags }); // host: persistent special-wave tags → clients
    this.game.audio.waveStart();
  }
  _longNightWeights(n) {
    const w = { swarmer: Math.max(8, 30 - n), runner: 22, grunt: 20 + n * 0.5, charger: 4 + n * 0.3, exploder: 4 + n * 0.3, brute: Math.max(0, (n - 1) * 0.9), titan: Math.max(0, (n - 5) * 0.8) };
    return Object.keys(w).filter((k) => w[k] > 0).map((v) => ({ v, w: w[v] }));
  }
  _updateLongNight(dt) {
    if (!this.active) return;
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.game.enemies.aliveCount < this.cap) {
        this.spawnTimer = Math.max(0.16, 1.2 - this.wave * 0.04);
        this._spawnOne(); this.toSpawn--;
      }
    } else this._advanceCheck(dt);
  }
  // Wave fully spawned: clear when all dead; otherwise after ~25s start the next wave with survivors
  // CARRIED OVER (never despawned). A live boss pauses the countdown — bosses must be killed.
  _advanceCheck(dt) {
    if (this.game.enemies.aliveCount === 0) { this.active = false; this.game.hud.clearWaveTag(); if (this.game.mp.active && this.game.mp.isHost) this.game.mp.net.send('wavetag', { tags: [] }); this.game.onWaveCleared(this.wave); return; }
    const bossAlive = this.game.enemies.active.some((e) => e.alive && e.def.boss);
    if (bossAlive) { this.advanceTimer = null; return; }
    if (this.advanceTimer == null) this.advanceTimer = WAVE_ADVANCE_SECS;
    this.advanceTimer -= dt;
    if (this.advanceTimer <= 0) { this.active = false; this.game.onTimedAdvance(this.wave); }
  }
  // Spawn weights as a weightedPick array; normal waves creep toward heavier enemies as n climbs.
  _effectiveWeights(typeKey, n) {
    const base = { ...WAVE_TYPES[typeKey].base };
    if (typeKey === 'normal') {
      base.brute = (base.brute || 0) + n * 0.8;
      if (n >= 5) base.titan = (base.titan || 0) + (n - 4) * 1.4;
      base.swarmer = Math.max(4, (base.swarmer || 0) - n * 0.4);
    }
    return Object.keys(base).map((v) => ({ v, w: base[v] }));
  }
  update(dt) {
    if (this.game.mode === 'longnight') return this._updateLongNight(dt);
    if (!this.active) return;
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.game.enemies.aliveCount < this.cap) {
        this.spawnTimer = Math.max(0.2, 1.4 - this.wave * 0.05);
        this._spawnOne(); this.toSpawn--;
      }
    } else this._advanceCheck(dt);
  }
  _spawnPos() {
    const pp = this.game.player.pos; let best = null, bestD = -1;
    for (let i = 0; i < 5; i++) { const s = pick(this.game.world.spawns); const d = Math.hypot(s.x - pp.x, s.z - pp.z); if (d > bestD) { bestD = d; best = s; } }
    const pos = best.clone(); pos.x += rr(-2, 2); pos.z += rr(-2, 2); return pos;
  }
  _spawnOne() {
    const n = this.wave, pos = this._spawnPos();
    if (this.isBossWave && this.spawned === 0) {
      const hpScale = 1 + (Math.floor(n / 5) - 1) * 0.6;
      const which = this.bossPick || (this.bossPick = BOSS_ROSTER[(Math.random() * BOSS_ROSTER.length) | 0]);
      this._spawnBoss(which, pos, hpScale);
      this.spawned++; return;
    }
    if (this.minibossPending && this.spawned === 0) { this.minibossPending = false; this._spawnMiniboss(pos, n); this.spawned++; return; }
    const type = weightedPick(this.weights);
    const def = ENEMY_TYPES[type];
    const hpScale = (1 + (n - 1) * 0.16) * this.hpMul;
    const spd = def.speed * Math.min(1 + (n - 1) * 0.025, 1.55) * this.speedMul;
    const e = this.game.enemies.spawn(type, pos, Math.round(def.hp * hpScale), spd);
    if (chc(0.01)) this.game.enemies.makeCourier(e); // ~1% rare backpack courier → drops a radio
    this.spawned++;
  }
  _spawnBoss(which, pos, hpScale) {
    if (which === 'tank') {
      const e = this.game.enemies.spawn('tank', pos, Math.round(ENEMY_TYPES.tank.armorHP * hpScale), ENEMY_TYPES.tank.speed);
      e.armorHP = e.armorHPmax = Math.round(ENEMY_TYPES.tank.armorHP * hpScale);
      e.mitriHP = e.mitriHPmax = Math.round(ENEMY_TYPES.tank.mitriHP * Math.min(hpScale, 2.0)); // cap so capture stays viable late-game
      // Task 14: dramatic entrance — tank rolls in from spawn edge toward arena center
      e.entering = true;
      e.entryTarget = { x: 0, z: 0 }; // plaza/arena center
      this.game.hud.bigMessage('T-90M «MITRI» ROLLS IN', 'armored boss inbound');
      this.game.audio.tone(40, 0.6, 'sawtooth', 0.35); // low engine roar entrance sting
      if (!this.game._tankIntroShown) {
        this.game._tankIntroShown = true;
        // Delay the teach banner slightly so it doesn't clash with the entrance bigMessage
        setTimeout(() => {
          if (this.game && this.game.hud) this.game.hud.bigMessage('⚠ T-90M «MITRI»', 'Bullets won\'t dent armor — use EXPLOSIVES on the rear/tracks, or shoot the COMMANDER when he pops out to STEAL the tank!');
        }, 2400);
      }
    } else {
      this.game.enemies.spawn('boss', pos, Math.round(ENEMY_TYPES.boss.hp * hpScale), ENEMY_TYPES.boss.speed);
    }
  }
  _forceTankWave() { this._forceBoss = 'tank'; this.startWave(this.wave + 1); } // DEBUG: forces next wave to be a tank boss
  // A named elite that hijacks the boss bar (no laser/phase-2) and pays out big.
  _spawnMiniboss(pos, n) {
    const baseType = chc(0.5) ? 'titan' : 'brute', def = ENEMY_TYPES[baseType];
    const hpScale = (1 + (n - 1) * 0.16) * this.hpMul * 2.4;
    const e = this.game.enemies.spawn(baseType, pos, Math.round(def.hp * hpScale), def.speed * 0.95 * this.speedMul);
    e.isElite = true; e.name = '☠ ' + pick(MINIBOSS_NAMES);
    e.scale *= 1.18; e.radius = 0.55 * e.scale; e.height = 2.2 * e.scale; e.headY = 1.18 * e.scale;
    e.mesh.scale.setScalar(e.scale);
    this.game.hud.bigMessage('MINI-BOSS', e.name + ' joins the horde!');
  }
}
