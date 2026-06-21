// mp.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { TAU, clamp, damp, rayAABB } from './util.js';
import { ENEMY_BURN_DUR, MOLO_GRAV, MOLO_MAX_FLIGHT, PLAYER_BURN_DPS, PLAYER_BURN_DUR, SOUND_BY_CLASS } from './tuning.js';
import { KILL_CASH } from './economy.js';
import { WEAPONS, buildViewmodel } from './weapons.js';
import { GADGETS } from './inventory.js';
import { buildFlopo } from './props.js';
import { LanNet, Net, makeRoomCode } from './net.js';
import { canAnte, POKER_BUYIN_TIERS } from './poker/coop.js';
import { bearingMils, rangeMeters, formatUglomer } from './bearing.js';


// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Multiplayer (WebRTC P2P via PeerJS) — host-authoritative co-op.
// RemotePlayer renders another player's Flopo avatar (interpolated) with a
// floating name + HP bar and a simple walk animation. MP wires the lobby and
// syncs transforms/enemies/waves/combat + runs the knockdown/revive rules.
// ---------------------------------------------------------------------------
const MP_SKINS = [
  { skin: 0x49c6df, petal: 0xe85ba0 }, { skin: 0xe8a23a, petal: 0x6fcf4f },
  { skin: 0x9b6fe0, petal: 0xffd24a }, { skin: 0x5fd0a0, petal: 0xe8533a },
];
const DOWN_SECONDS = 30;
const REVIVE_CLICKS = 30;
const _v3a = new THREE.Vector3();
const _mpMin = new THREE.Vector3(), _mpMax = new THREE.Vector3();
const _flareWP = new THREE.Vector3();   // scratch: flare flame world-position
export function mpEscape(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

class RemotePlayer {
  constructor(game, id, name, skinIdx) {
    this.game = game; this.id = id; this.name = name || 'Flopo';
    this.obj = buildFlopo(MP_SKINS[skinIdx % MP_SKINS.length]);
    game.engine.scene.add(this.obj);
    this.parts = this.obj.userData.parts;
    this.gunAnchor = new THREE.Group(); this.gunAnchor.position.set(0.42, 0.95, 0.34); this.obj.add(this.gunAnchor); this._wep = null;
    // flashlight beam — a spotlight in world space, on when this player holds the flashlight (so everyone sees their cone)
    this.flashLight = new THREE.SpotLight(0xfff0d0, 0, 60, 0.62, 0.4, 0.0); this.flashTarget = new THREE.Object3D();
    this.flashLight.target = this.flashTarget; game.engine.scene.add(this.flashLight); game.engine.scene.add(this.flashTarget);
    this._hasFlash = false; this._flashOn = true; this._seat = 0; this._fwd = new THREE.Vector3(); this._fe = new THREE.Euler();
    this.pos = new THREE.Vector3(0, 0, 30); this.tpos = this.pos.clone();
    this.yaw = 0; this.tyaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100; this.down = false; this.waiting = false; this.dead = false;
    this._prone = false; this._proneYaw = 0;
    this.burnT = 0; this._burnFxT = 0; // on-fire flame (broadcast via xf bf flag); throttle for the body fire puff
    this._animT = 0; this._spd = 0; this._lastx = 0; this._lastz = 30;
    const wrap = document.getElementById('mp-labels');
    this.label = document.createElement('div'); this.label.className = 'mp-label';
    this.label.innerHTML = '<span class="mp-name"></span><span class="mp-hpwrap"><i class="mp-hp"></i></span>';
    this.label.querySelector('.mp-name').textContent = this.name;
    this._hpEl = this.label.querySelector('.mp-hp');
    if (wrap) wrap.appendChild(this.label);
  }
  setTransform(s) {
    this.tpos.set(s.x, s.y || 0, s.z); this.tyaw = s.yaw; this.pitch = s.pitch || 0;
    this._flashOn = (s.fl === undefined) ? true : !!s.fl; this._seat = s.seat ? 1 : 0;
    if ('down' in s) this.down = !!s.down;
    if ('dead' in s) this.dead = !!s.dead;
    if ('waiting' in s) this.waiting = !!s.waiting;
    this.setBurn(s.bf ? PLAYER_BURN_DUR : 0);
    if (s.wep && s.wep !== this._wep) { this._wep = s.wep; this.setWeapon(s.wep); }
  } // pstate is authoritative; xf mirrors down/dead/waiting as an immediate visual fallback for host/self state.
  setHP(hp, maxHp) { this.hp = hp; if (maxHp) this.maxHp = maxHp; }
  setBurn(t) { this.burnT = t; }
  update(dt, cam) {
    const k = 1 - Math.exp(-15 * dt);
    this.pos.lerp(this.tpos, k);
    let dy = this.tyaw - this.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU; this.yaw += dy * k;
    const mv = Math.hypot(this.pos.x - this._lastx, this.pos.z - this._lastz) / Math.max(dt, 1e-3);
    this._spd = damp(this._spd, mv, 8, dt); this._lastx = this.pos.x; this._lastz = this.pos.z;
    // on fire: render a body flame for everyone (visual only; burnT is refreshed by the xf bf flag in setTransform)
    this.burnT = Math.max(0, this.burnT - dt);
    if (this.burnT > 0) { this._burnFxT -= dt; if (this._burnFxT <= 0) { this._burnFxT = 0.08; this.game.effects.firePool(this.pos, 0.45, 0.4); } }
    const o = this.obj, p = this.parts;
    o.position.set(this.pos.x, this.pos.y, this.pos.z);
    const prone = this.dead || this.down || this.waiting;
    if (prone && !this._prone) this._proneYaw = this.yaw;
    this._prone = prone;
    if (prone) {
      let headYaw = this.yaw - this._proneYaw; while (headYaw > Math.PI) headYaw -= TAU; while (headYaw < -Math.PI) headYaw += TAU;
      o.rotation.set(-Math.PI * 0.5, this._proneYaw + Math.PI, this.dead ? -0.08 : 0.16, 'YXZ'); // fully prone; body yaw freezes, head still tracks look
      o.position.y = this.pos.y + 0.28;
      p.legL.rotation.x = 0.22; p.legR.rotation.x = -0.18;
      p.armL.rotation.x = 0.75; p.armR.rotation.x = -0.55;
      p.head.rotation.x = -0.18 + clamp(this.pitch, -0.45, 0.35) * 0.35;
      p.head.rotation.y = clamp(headYaw, -0.55, 0.55);
      if (this.gunAnchor) this.gunAnchor.visible = false;
    } else {
      o.rotation.set(0, this.yaw + Math.PI, 0); // +PI: model faces +z, but look/move forward is -z
      const moving = this._spd > 0.7;
      this._animT += dt * (moving ? 9 : 2.6);
      const sw = Math.sin(this._animT) * (moving ? 0.6 : 0.07);
      p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
      p.armL.rotation.x = -sw * 0.7; p.armR.rotation.x = sw * 0.7;
      p.head.rotation.x = clamp(this.pitch, -0.5, 0.5) * 0.5;
      p.head.rotation.y = 0;
      o.position.y = this.pos.y + (moving ? Math.abs(Math.sin(this._animT)) * 0.06 : 0);
      if (this.gunAnchor) this.gunAnchor.visible = true;
    }
    if (this._seat && this.gunAnchor) this.gunAnchor.visible = false; // manning the .50cal: hide held weapon (avatar is pinned at the gun base by its broadcast pos)
    if (this._hasFlash && this._flashOn && !this.down && !this.dead && !this.waiting) { // beam from this player's flashlight (held + toggled on), aimed where they look
      const f = this._fwd.set(0, 0, -1).applyEuler(this._fe.set(this.pitch, this.yaw, 0, 'XYZ'));
      const hx = this.pos.x, hy = this.pos.y + 1.6, hz = this.pos.z;
      this.flashLight.position.set(hx, hy, hz);
      this.flashTarget.position.set(hx + f.x * 10, hy + f.y * 10, hz + f.z * 10);
      this.flashLight.intensity = 7;
    } else this.flashLight.intensity = 0;
    const labelY = (this.dead || this.down || this.waiting) ? 0.95 : 2.5;
    const hp = _v3a.set(this.pos.x, this.pos.y + labelY, this.pos.z).project(cam);
    if (hp.z > 1 || hp.z < -1) { this.label.style.display = 'none'; return; }
    this.label.style.display = 'block';
    this.label.style.left = ((hp.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    this.label.style.top = ((-hp.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    this._hpEl.style.width = clamp((this.hp / this.maxHp) * 100, 0, 100) + '%';
    this.label.classList.toggle('down', this.down || this.waiting || this.dead);
  }
  setWeapon(key) {
    while (this.gunAnchor.children.length) { const c = this.gunAnchor.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
    this._hasFlash = (key === 'flashlight');
    const def = WEAPONS[key]; if (!def) return;
    const m = buildViewmodel(def); if (m.material) { m.material.depthTest = true; m.renderOrder = 0; }
    m.scale.setScalar(0.5); m.rotation.set(0, Math.PI, 0); m.position.set(0, 0, 0);
    this.gunAnchor.add(m);
  }
  dispose() {
    this.game.engine.scene.remove(this.obj);
    this.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.game.engine.scene.remove(this.flashLight); this.game.engine.scene.remove(this.flashTarget);
    if (this.label) this.label.remove();
  }
}

export class MP {
  constructor(game) {
    this.game = game; this.net = this._makeNet();
    this.active = false; this.isHost = false; this.myId = null; this.name = '';
    this.remotes = new Map(); this.roster = new Map(); this.pstate = new Map(); this.ghosts = new Map();
    this._ghostProjectiles = []; // VISUAL-ONLY thrown/launched projectiles from teammates (never deal damage)
    this.chosenSkin = 0; this._hadBoss = false; this.ready = false; this.friendlyFire = true; // co-op: teammates CAN damage each other (watch your fire)
    this._lobbyMode = 'purge'; // mode the squad will play; host picks it in the lobby, clients mirror it ('purge'|'longnight'|'poker')
    this.pokerBuyIn = 0;       // poker mode: host-authoritative buy-in (mirrored to clients); 0 = FREE practice
    this._xfT = 0; this._snapT = 0; this._reviveClicks = 0; this._reviveTargetId = null; this._reviveActive = false; this._incomingRevive = null; this._reviveHostProgress = new Map(); this._lastXf = new Map(); this._toT = 0; // _lastXf: host-side per-client heartbeat for crash detection
    this._nightT = 0; this._clockT = 0; // host: periodic day/night + survive-clock/enemies-left broadcast throttles
    this._lastClockDrift = null; // client: last measured world-clock prediction error vs host (minutes), for /time check
    this.frozen = false; this._localDown = false; this._localDead = false; this._localWaiting = false; this._spilledLoot = false;
    this.spectateTarget = null;
    this._bleedT = 0; this._bleedShown = false; // local bleed-out bar state
    this._joinHandshakeTimer = null;
    this.diag = this._newDiag();
    this.myPing = 0; this._pingT = 0; this._pstatT = 0; this._sbOpen = false;
    this._wireNet(); this._wireScoreboard();
    this._hb = setInterval(() => { if (this.active && !this.isHost && (performance.now() - (this.net.lastRecv || 0)) > 7000) this._hostGone(); }, 2000);
  }
  // ---- lobby ----
  _clearJoinHandshakeTimer() {
    if (this._joinHandshakeTimer) clearTimeout(this._joinHandshakeTimer);
    this._joinHandshakeTimer = null;
  }
  _setLobbyDiag(text) {
    const el = document.getElementById('mp-netdiag');
    if (el) el.textContent = text || '';
  }
  _lanMode() { try { return localStorage.getItem('engendros_lan_mode') === '1'; } catch (e) { return false; } }
  _makeNet() { return this._lanMode() ? new LanNet() : new Net(); }
  _newDiag(role = 'idle', room = '') {
    return {
      role, room, broker: false, data: false, helloSent: false, helloReceived: false,
      joinokSent: false, joinokReceived: false, iceTypes: [], selectedType: '',
      remoteType: '', iceMode: '', iceState: '', connectionState: '', last: 'Idle',
      error: '', message: '', details: '', peerId: '',
    };
  }
  _resetDiag(role = 'idle', room = '') {
    this.diag = this._newDiag(role, room);
    this._renderNetDiag();
  }
  _mergeIce(types) {
    const set = new Set(this.diag.iceTypes || []);
    for (const t of types || []) if (t) set.add(t);
    this.diag.iceTypes = [...set].sort();
  }
  _onNetDiag(d) {
    if (!d) return;
    if (d.room) this.diag.room = d.room;
    if (d.role) this.diag.role = d.role;
    if (d.peerId) this.diag.peerId = d.peerId;
    if (d.iceMode) this.diag.iceMode = d.iceMode;
    if (d.phase === 'broker') { this.diag.broker = true; this.diag.last = 'Broker connected'; }
    else if (d.phase === 'data') { this.diag.data = true; this.diag.last = 'Data channel open'; }
    else if (d.phase === 'ice') {
      this._mergeIce(d.candidateTypes);
      if (d.selectedType) this.diag.selectedType = d.selectedType;
      if (d.remoteType) this.diag.remoteType = d.remoteType;
      if (d.iceState) this.diag.iceState = d.iceState;
      if (d.connectionState) this.diag.connectionState = d.connectionState;
    } else if (d.phase === 'closed') this.diag.last = 'Connection closed';
    else if (d.phase === 'error') {
      this.diag.error = d.code || 'error';
      this.diag.message = d.message || '';
      this.diag.details = d.details || '';
      if (d.iceState) this.diag.iceState = d.iceState;
      if (d.connectionState) this.diag.connectionState = d.connectionState;
      this.diag.last = 'Error: ' + this.diag.error;
    }
    this._renderNetDiag();
  }
  _markDiag(fields, last) {
    Object.assign(this.diag, fields || {});
    if (last) this.diag.last = last;
    this._renderNetDiag();
  }
  _diagAdvice(d) {
    if (!d) return '';
    if (d.error) {
      if (d.error === 'negotiation-failed' || d.error === 'ice-failed' || d.error === 'connection-failed') {
        return this._forceRelay()
          ? 'ICE failed even with forced TURN. The relay is blocked/unreachable from this network, or the browser cannot use it.'
          : 'ICE failed: broker is reachable, but the browsers found no usable route. Try same non-guest Wi-Fi/hotspot; if it repeats, use a dedicated TURN relay.';
      }
      if (d.error === 'connect-timeout' || d.error === 'connect-failed') return this._forceRelay() ? 'Forced TURN relay failed. The relay server is blocked or unavailable on this network.' : 'WebRTC route failed after a long attempt. Toggle RELAY: FORCE, re-host, and try again to isolate NAT/firewall from game code.';
      if (d.error === 'peer-unavailable') return 'No host owns that code right now. Ask the host to re-host and share the fresh code.';
      return 'Connection failed before the lobby handshake completed.';
    }
    if (!d.broker) return this._lanMode() ? 'Waiting for the LAN relay.' : 'Waiting for the PeerJS broker.';
    if (d.broker && !d.data) {
      return d.role === 'join'
        ? (this._lanMode() ? 'LAN relay OK. Waiting for the host handshake.' : 'Broker OK, data WAIT: still trying WebRTC. This can take up to 45s on strict NAT/firewall.')
        : (this._lanMode() ? 'LAN relay OK. Waiting for a player.' : 'Broker OK. Waiting for a player data channel.');
    }
    if (d.role === 'join' && d.data && d.helloSent && !d.joinokReceived) return 'Data OK, but host did not answer. This points to host cache/code or a stale room.';
    if (d.role === 'host' && d.data && !d.helloReceived) return 'Data OK. Waiting for the joiner hello packet.';
    if ((d.iceTypes || []).includes('relay') || d.selectedType === 'relay') return d.selectedType === 'relay' ? 'TURN relay route active.' : 'TURN relay available.';
    if (d.data && (d.joinokReceived || d.joinokSent)) return 'Lobby handshake OK.';
    return '';
  }
  _forceRelay() { try { return localStorage.getItem('engendros_force_relay') === '1'; } catch (e) { return false; } }
  toggleLanMode() {
    const on = !this._lanMode();
    try { localStorage.setItem('engendros_lan_mode', on ? '1' : '0'); } catch (e) {}
    this._setLobbyDiag(on ? 'LAN mode enabled. Start scripts/lan-server.js, host on this Mac, and have the squad open the Hamachi IP.' : 'WebRTC mode enabled.');
    this._resetLobbyTransport();
    this._resetDiag('idle', '');
    this._renderLanMode();
    this._renderRelayMode();
    this._renderRoomBrowser();
  }
  _renderLanMode() {
    const b = document.getElementById('mpLanBtn'); if (!b) return;
    const on = this._lanMode();
    b.textContent = on ? 'NET: LAN' : 'NET: WEBRTC';
    b.classList.toggle('danger', on);
  }
  toggleRelayMode() {
    const on = !this._forceRelay();
    try { localStorage.setItem('engendros_force_relay', on ? '1' : '0'); } catch (e) {}
    this._setLobbyDiag(on ? 'Relay test enabled. Host/join again to use TURN only.' : 'Relay test disabled. Host/join again to use automatic routing.');
    this._renderRelayMode();
    this._renderNetDiag();
  }
  _renderRelayMode() {
    const b = document.getElementById('mpRelayBtn'); if (!b) return;
    const on = this._forceRelay();
    b.textContent = on ? 'RELAY: FORCE' : 'RELAY: AUTO';
    b.classList.toggle('danger', on);
    b.style.display = this._lanMode() ? 'none' : '';
  }
  _renderNetDiag() {
    const el = document.getElementById('mp-diaggrid');
    if (!el) return;
    const d = this.diag || this._newDiag();
    const yn = (ok) => ok ? '<b class="ok">OK</b>' : '<b class="wait">WAIT</b>';
    const hello = d.helloSent ? 'sent' : (d.helloReceived ? 'received' : 'wait');
    const joinok = d.joinokReceived ? 'received' : (d.joinokSent ? 'sent' : 'wait');
    const ice = (d.iceTypes && d.iceTypes.length) ? d.iceTypes.join(' / ') : 'waiting';
    const sel = d.selectedType || 'unknown';
    const route = d.selectedType ? (d.remoteType ? `${d.selectedType}->${d.remoteType}` : d.selectedType) : 'unknown';
    const mode = d.iceMode || (this._lanMode() ? 'lan-ws' : (this._forceRelay() ? 'force-relay' : 'auto-default'));
    const detail = d.message || d.details || '';
    el.innerHTML = `
      <div><span>Broker</span>${yn(d.broker)}</div>
      <div><span>Data</span>${yn(d.data)}</div>
      <div><span>Hello</span><b>${mpEscape(hello)}</b></div>
      <div><span>Join OK</span><b>${mpEscape(joinok)}</b></div>
      <div><span>Mode</span><b>${mpEscape(mode)}</b></div>
      <div><span>Route</span><b class="${sel === 'relay' ? 'ok' : ''}">${mpEscape(route)}</b></div>
      <div><span>ICE</span><b>${mpEscape(ice)}</b></div>
      <div class="wide"><span>State</span><b>${mpEscape([d.iceState, d.connectionState].filter(Boolean).join(' / ') || d.last || 'idle')}</b></div>
      ${d.error ? `<div class="wide err"><span>Error</span><b>${mpEscape(d.error)}</b></div>` : ''}
      ${detail ? `<div class="wide msg"><span>Message</span><b>${mpEscape(detail)}</b></div>` : ''}
      ${this._diagAdvice(d) ? `<div class="wide advice">${mpEscape(this._diagAdvice(d))}</div>` : ''}`;
  }
  _renderRoomBrowser() {
    this._renderNetDiag();
    const list = document.getElementById('mp-roomlist');
    const badge = document.getElementById('mp-public-state');
    const close = document.getElementById('mpCloseRoomBtn');
    if (close) close.style.display = (this.isHost && this.net && this.net.room) ? 'inline-block' : 'none';
    if (badge) {
      badge.textContent = (this.isHost && this.net && this.net.room) ? 'ROOM CODE' : 'CODE JOIN';
      badge.classList.toggle('on', !!(this.isHost && this.net && this.net.room));
    }
    if (list) list.innerHTML = '<div class="mp-roomempty">Public room browser is disabled for this stabilization build. Host, copy the room code, and join manually.</div>';
  }
  _resetLobbyTransport() {
    try { this.net && this.net.close(); } catch (e) {}
    this.net = this._makeNet();
    this._wireNet();
    for (const [, rp] of this.remotes) rp.dispose();
    this.remotes.clear(); this.roster.clear(); this.pstate.clear(); this.ghosts.clear();
    this._reviveHostProgress.clear();
    if (this._lastXf) this._lastXf.clear();
    this.active = false; this.isHost = false; this.ready = false; this.myId = null; this.spectateTarget = null; this._resetRevive(true);
  }
  closeRoom() {
    const old = this.net && this.net.room;
    if (!old) { this._lobbyMsg('No room is open.'); return; }
    try { if (this.isHost) this.net.send('roomClosed', {}); } catch (e) {}
    this.leave();
    this._lobbyMsg(`Room <b>${old}</b> closed. Host again when ready.`);
    this._setLobbyDiag('Room closed.');
    this._resetDiag('idle', '');
    this._renderRoomBrowser();
  }
  startHost(name) {
    this._clearJoinHandshakeTimer();
    this._setLobbyDiag('');
    this._resetLobbyTransport();
    this.name = name || 'Host'; this.isHost = true; this.myId = 'host';
    this.roster.set('host', { name: this.name, skin: this.chosenSkin || 0, chipSkin: (this.game.meta && this.game.meta.chipSkin) || 'dice', ready: true, loadout: this._myLoadoutKeys(), pid: this.game.meta.playerId });
    const code = makeRoomCode();
    this._resetDiag('host', code);
    this.net.onPeerOpen = (c) => { this._lobbyMsg(`Room code: <b>${c}</b> — copy it and send it to the squad.`, c); this._setLobbyDiag(this._lanMode() ? 'LAN room is open. Squad joins through the Hamachi IP and this code.' : 'Manual room is open. Share the code; no public-room scanner is running.'); this._renderRoomBrowser(); };
    this.net.onError = (t) => { this._lobbyMsg(this._netErr(t)); };
    this.net.host(code); this._renderRoster();
  }
  startJoin(code, name) {
    const room = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (!room) { this._lobbyMsg('Enter a room code.'); return; }
    if (room.length !== 5) { this._lobbyMsg('Room codes are 5 characters.'); return; }
    this._clearJoinHandshakeTimer();
    this._setLobbyDiag('');
    this._resetLobbyTransport();
    this._resetDiag('join', room);
    this.name = name || 'Player'; this.isHost = false; this.myId = null; this._joinRoom = room;
    this.net.onPeerOpen = () => this._lobbyMsg(this._lanMode() ? ('Connecting to LAN room ' + room + '…') : ('Connecting to ' + room + '… finding WebRTC route (can take up to 45s).'));
    this.net.onConnect = () => {
      this.myId = this.net.selfId; this.net.lastRecv = performance.now();
      this.net.send('hello', { name: this.name, skin: this.chosenSkin || 0, chipSkin: (this.game.meta && this.game.meta.chipSkin) || 'dice', loadout: this._myLoadoutKeys(), pid: this.game.meta.playerId });
      this._markDiag({ helloSent: true }, 'Hello sent');
      this._lobbyMsg('Connected… handshaking with host (waiting up to 25s).');
      this._joinHandshakeTimer = setTimeout(() => this._lobbyMsg('Connected, but the host did not answer after 25s. Ask the host to refresh/re-host.'), 25000);
    };
    this.net.onError = (t) => { this._clearJoinHandshakeTimer(); this._lobbyMsg(this._netErr(t)); };
    this.net.join(room);
  }
  leave() {
    this._clearJoinHandshakeTimer();
    this.ready = false;
    try { if (this.active && !this.isHost) this.net.send('goodbye', {}); } catch (e) {} // tell the host to despawn me instantly
    try { this.net.close(); } catch (e) {}
    for (const [, rp] of this.remotes) rp.dispose();
    this._clearGhostProjectiles();
    this.remotes.clear(); this.roster.clear(); this.pstate.clear(); this.ghosts.clear();
    this._reviveHostProgress.clear();
    if (this._lastXf) this._lastXf.clear();
    this.active = false; this.isHost = false; this.frozen = false; this._spilledLoot = false; this.spectateTarget = null;
    this._localDown = false; this._localDead = false; this._localWaiting = false; this._resetRevive(true); this._bleedShown = false; if (this.game.hud) this.game.hud.setBleed(-1); // clear the bleed-out bar on leave
    for (const gun of (this.game._mountedGunList ? this.game._mountedGunList() : [this.game.mountedGun])) if (gun) gun.occupant = null; // free fixed MG seats on session end
    this.net = this._makeNet(); this._wireNet();
    const ci = document.getElementById('mp-mycode'); if (ci) ci.textContent = '-----';
    this._lobbyMsg('Host a room or paste a code.');
    this._setLobbyDiag('');
    this._resetDiag('idle', '');
    this._renderRoster();
    this._renderRoomBrowser();
  }
  endRunToLobby(msg) {
    this.active = false; this.frozen = false; this._spilledLoot = false; this.spectateTarget = null;
    this._localDown = false; this._localDead = false; this._localWaiting = false; this._resetRevive(true); this._bleedShown = false; this._bleedT = 0;
    this.pstate.clear(); this.ghosts.clear(); this._clearGhostProjectiles(); this._reviveHostProgress.clear();
    if (this._lastXf) this._lastXf.clear();
    for (const [, rp] of this.remotes) rp.dispose();
    this.remotes.clear();
    for (const gun of (this.game._mountedGunList ? this.game._mountedGunList() : [this.game.mountedGun])) if (gun) gun.occupant = null;
    if (this.isHost) {
      for (const [id, r] of this.roster) r.ready = (id === 'host');
      try { this.net.send('roster', this._rosterArr()); } catch (e) {}
    } else {
      this.ready = false;
      const me = this.roster.get(this.myId);
      if (me) me.ready = false;
    }
    this._lobbyMsg(msg || 'Run ended. Ready up and start again.');
  }
  // host: fully remove a player (clean leave / disconnect / crash / kick) and tell everyone to despawn their character now
  _dropPeer(peerId, opts) {
    if (peerId === 'host') return;
    const r = this.roster.get(peerId), nm = r ? r.name : null;
    if (this.remotes.has(peerId)) { this.remotes.get(peerId).dispose(); this.remotes.delete(peerId); }
    this.roster.delete(peerId); this.pstate.delete(peerId); if (this._lastXf) this._lastXf.delete(peerId);
    if (this.isHost) {
      this.net.broadcast('playerLeft', { id: peerId });   // other clients dispose this character immediately
      this.net.send('roster', this._rosterArr());
      this._renderRoster(); this._checkGameOver();
      if (!(opts && opts.silent) && nm) { try { this.game.hud.kill(mpEscape(nm) + ' left'); } catch (e) {} }
    }
  }
  hostKick(peerId) {
    if (!this.isHost || !peerId || peerId === 'host') return;
    try { this.net.sendTo(peerId, 'kicked', {}); } catch (e) {}
    const c = this.net.conns.get(peerId); if (c) { try { c.close(); } catch (e) {} }   // stop them sending
    this._dropPeer(peerId);
  }
  _lobbyMsg(html, code) {
    const el = document.getElementById('mp-status'); if (el) el.innerHTML = html;
    if (code) {
      const ci = document.getElementById('mp-mycode'); if (ci) ci.textContent = code;
      const bar = document.getElementById('mp-codebar'); if (bar) bar.classList.add('show');
    }
  }
  _netErr(t) {
    const forced = this._forceRelay();
    return ({
      'unavailable-id': 'Code taken — pick another.',
      'peer-unavailable': 'No room with that code.',
      'connect-timeout': forced ? 'Forced relay timed out after 45s — this relay is blocked or unavailable on this network.' : 'Connection timed out after 45s — toggle RELAY: FORCE, re-host, and try again to isolate NAT/firewall.',
      'connect-failed': forced ? 'Forced relay failed — try AUTO again or use a dedicated TURN relay.' : 'WebRTC connection failed — try a fresh room code, or RELAY: FORCE if it repeats.',
      'connection-failed': forced ? 'Forced relay connection failed — this relay is blocked or unavailable here.' : 'WebRTC connection state failed — broker is OK, but no browser-to-browser route worked.',
      'ice-failed': forced ? 'Forced TURN ICE failed — the relay is blocked/unavailable on this network.' : 'WebRTC ICE failed — broker is OK, but the devices could not find a route.',
      'negotiation-failed': forced ? 'Forced TURN negotiation failed — this relay is blocked/unavailable on this network.' : 'WebRTC negotiation failed — broker is OK, but ICE could not find a route.',
      'network': 'Network error — check your internet.',
      'server-error': 'Matchmaking busy — try again.',
      'socket-error': 'Connection lost — try again.',
      'socket-closed': 'Connection closed — try again.',
      'lan-unavailable': 'LAN relay is not reachable — run: node scripts/lan-server.js --host 0.0.0.0',
      'browser-incompatible': 'Your browser blocks WebRTC co-op.',
      'ssl-unavailable': 'Secure connection failed.',
    })[t] || ('Connection error: ' + t);
  }
  _myLoadoutKeys() { const lo = (this.game.meta && this.game.meta.loadout) || []; return Array.isArray(lo) ? lo.filter(Boolean) : []; } // flat equal-slot loadout array (empties dropped for the roster)
  _loadoutLabel(k) { if (!k) return ''; if (WEAPONS[k]) return WEAPONS[k].name; const gd = GADGETS.find((x) => x.key === k); return gd ? gd.name : k; }
  toggleReady() {
    if (this.isHost) return;
    if (!this.ready && this._lobbyMode === 'poker' && !canAnte(this.game.meta.bank, this.pokerBuyIn)) { // poker: READY = ante the buy-in
      this._lobbyMsg(`You need $${this.pokerBuyIn} to ante up — your bank is $${this.game.meta.bank | 0}.`); return;
    }
    this.ready = !this.ready; this.net.send('ready', { val: this.ready }); this._renderRoster();
  }
  _renderRoster() {
    const poker = this._lobbyMode === 'poker';
    const el = document.getElementById('mp-roster');
    if (el) {
      const rows = [...this.roster].map(([id, p]) => {
        const okTag = poker ? '✓ ANTED' : '✓ READY';
        const tag = (id === 'host') ? '<span style="color:#c9a84a">★ HOST</span>' : (p.ready ? `<span style="color:#6fcf4f">${okTag}</span>` : '<span style="color:#e8a23a">…</span>');
        const lo = (p.loadout || []).map((k) => this._loadoutLabel(k)).filter(Boolean).join(' · ') || 'Bayonet Knife';
        const kick = (this.isHost && id !== 'host') ? ` <button class="mp-kick" data-peer="${mpEscape(id)}" title="Kick player" style="margin-left:6px;background:#5a2024;color:#fff;border:1px solid #a3434a;border-radius:4px;cursor:pointer;font-weight:800;padding:0 7px">✕</button>` : '';
        return `<div class="mp-rosteritem">🌸 ${mpEscape(p.name)} ${tag}${kick}<br><small style="opacity:.65;font-weight:600">${mpEscape(lo)}</small></div>`;
      });
      el.innerHTML = rows.join('');
      if (this.isHost) el.querySelectorAll('.mp-kick').forEach((b) => { b.onclick = () => this.hostKick(b.getAttribute('data-peer')); });
    }
    const allReady = [...this.roster].every(([id, p]) => id === 'host' || p.ready);
    const antedClients = [...this.roster].filter(([id, p]) => id !== 'host' && p.ready).length;
    const pokerCanDeal = (antedClients + 1) >= 2; // host + ≥1 anted client (seat exactly the anted set)
    const sb = document.getElementById('mpStartBtn');
    if (sb) {
      sb.style.display = (this.isHost && this.net.connected) ? 'block' : 'none';
      if (poker) { sb.disabled = !pokerCanDeal; sb.textContent = pokerCanDeal ? '▶ DEAL POKER' : '▶ WAITING FOR ANTE…'; }
      else { sb.disabled = !allReady; sb.textContent = allReady ? '▶ START CO-OP' : '▶ WAITING FOR READY…'; }
    }
    const rb = document.getElementById('mpReadyBtn');
    if (rb) {
      rb.style.display = (!this.isHost && this.net.connected) ? 'block' : 'none';
      if (poker) {
        const afford = canAnte(this.game.meta.bank, this.pokerBuyIn);
        const tier = this.pokerBuyIn ? ('$' + this.pokerBuyIn) : 'FREE';
        rb.disabled = !afford && !this.ready;
        rb.textContent = this.ready ? '✓ ANTED — click to back out' : (afford ? `☐ ANTE UP ${tier} / ACCEPT` : `✗ NEED $${this.pokerBuyIn} TO ANTE`);
      } else {
        rb.disabled = false;
        rb.textContent = this.ready ? '✓ READY — click to unready' : '☐ CLICK WHEN READY';
      }
    }
    this._renderModeSel();
    this._renderLanMode();
    this._renderRelayMode();
    this._renderRoomBrowser();
  }
  // ---- game-mode pick (host-authoritative; only the host simulates waves, so the host owns the mode) ----
  setMode(m) {
    if (this.active) return;                                   // locked once the run starts
    if (!(this.isHost || !this.net.connected)) return;          // a connected client can't override the host
    const mode = (m === 'longnight') ? 'longnight' : (m === 'poker') ? 'poker' : 'purge';
    this._lobbyMode = mode;
    if (mode === 'poker') {
      // poker is a LOBBY selection ONLY — never write game.mode (it drives the wave/world sim)
      this._resetReadies();                                     // ante semantics change → everyone re-accepts
      if (this.isHost) { this.net.send('mode', { mode, buyIn: this.pokerBuyIn }); this.net.send('roster', this._rosterArr()); }
    } else {
      this.game.mode = mode;
      if (this.isHost) this.net.send('mode', { mode });          // tell the squad (no-op with zero peers)
    }
    this._renderRoster();                                        // re-render labels + buy-in + start/ready states
    this._renderRoomBrowser();
  }
  _resetReadies() { for (const [id, r] of this.roster) { if (id !== 'host') r.ready = false; } this.ready = false; }
  setPokerBuyIn(v) {                                            // host (or not-yet-connected) sets the table's buy-in
    if (this.active || !(this.isHost || !this.net.connected) || this._lobbyMode !== 'poker') return;
    this.pokerBuyIn = v | 0;
    this._resetReadies();                                       // a $500 acceptance must NOT carry to $2000 — re-ante
    this.net.send('mode', { mode: 'poker', buyIn: this.pokerBuyIn });
    this.net.send('roster', this._rosterArr());
    this._renderRoster();
  }
  _renderModeSel() {
    const wrap = document.getElementById('mp-modes'); if (!wrap) return;
    const canPick = this.isHost || !this.net.connected;         // host (or nobody yet) picks; joined clients just see it
    const mode = this._lobbyMode || 'purge';                    // poker lives in _lobbyMode (never written to game.mode)
    wrap.querySelectorAll('.tab').forEach((b) => {
      const on = b.getAttribute('data-mode') === mode;
      b.classList.toggle('on', on);
      b.disabled = !canPick; b.style.cursor = canPick ? 'pointer' : 'default'; b.style.opacity = (canPick || on) ? '1' : '.4';
    });
    const note = document.getElementById('mp-modenote');
    if (note) {
      const base = mode === 'poker' ? "♠ Underground Hold'em — winner-takes-all; everyone antes the buy-in."
        : mode === 'longnight' ? '🌙 Endless survival — day/night cycle, pitch-dark nights.'
        : '⚔ Arcade waves — special waves & mini-bosses.';
      note.textContent = base + (this._lanMode() ? ' LAN mode uses Hamachi/WebSocket.' : (this._forceRelay() ? ' Relay test forces TURN only.' : (canPick ? ' Host picks the mode for the squad.' : ' Set by the host.')));
    }
    this._renderPokerBuyIn(mode, canPick);
  }
  _renderPokerBuyIn(mode, canPick) {
    const box = document.getElementById('mp-poker-buyin'); if (!box) return;
    if (mode !== 'poker') { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    const bank = this.game.meta.bank | 0;
    if (canPick) {                                              // host: tier picker
      const btns = POKER_BUYIN_TIERS.map((t) => {
        const sel = (this.pokerBuyIn | 0) === t, label = t ? ('$' + t) : 'FREE';
        return `<button class="pk-buyin-tier" data-buyin="${t}" style="margin:0 4px;padding:4px 12px;border-radius:6px;border:1px solid ${sel ? '#d8b066' : '#5a4a2a'};background:${sel ? 'linear-gradient(180deg,#3a2f12,#221a08)' : '#1a160e'};color:${sel ? '#f3d999' : '#c9bfa3'};cursor:pointer;font-weight:700">${label}</button>`;
      }).join('');
      box.innerHTML = `<div style="opacity:.7;margin-bottom:5px">Buy-in (winner-takes-all) · your bank $${bank}</div>${btns}`;
      box.querySelectorAll('.pk-buyin-tier').forEach((b) => { b.onclick = () => this.setPokerBuyIn(+b.getAttribute('data-buyin')); });
    } else {                                                     // client: read-only buy-in + affordability
      const tier = this.pokerBuyIn ? ('$' + this.pokerBuyIn) : 'FREE', afford = canAnte(bank, this.pokerBuyIn);
      box.innerHTML = `<div>Buy-in: <b style="color:#f3d999">${tier}</b> · your bank $${bank}${afford ? '' : ' <span style="color:#e0584f">— not enough to ante</span>'}</div>`;
    }
  }
  hostStart() {
    if (!this.isHost) return;
    if (this._lobbyMode === 'poker') { this.game.startCoopPokerFromLobby(); return; } // poker deals its own way (no wave start; mp.active stays false)
    const allReady = [...this.roster].every(([id, p]) => id === 'host' || p.ready);
    if (!allReady) { this._lobbyMsg('Waiting for all players to be READY…'); return; }
    const now = performance.now(); for (const [id] of this.roster) this._lastXf.set(id, now); // fresh heartbeat baseline so nobody is insta-timed-out
    const mode = this.game.mode || 'purge';
    this.active = true; this._renderRoomBrowser(); this._initHostStates(); this.net.send('start', { mode }); this.game._enterMP(mode);
    this.sendWorldTime();
  }
  _initHostStates() { this.pstate.clear(); for (const [id, info] of this.roster) this.pstate.set(id, this._freshState(info)); }
  _freshState(info) { return { hp: 100, maxHp: 100, armor: 0, armorMax: 100, down: false, downT: 0, waiting: false, dead: false, downs: 0, burnT: 0, name: info.name, skin: info.skin }; }
  // ---- net wiring ----
  _wireNet() {
    const n = this.net, g = this.game;
    n.onDiag = (d) => this._onNetDiag(d);
    n.onDisconnect = (pid) => {
      if (this.isHost) { this._dropPeer(pid); if (g.poker && g.poker.coop) g.poker.onPeerDisconnect(pid); } // host: bust the dropped poker seat
      else if (this.active) this._hostGone();
      else if (g.poker && g.poker.coop) g.poker.onAbort(); // host vanished while we were at the poker table → refund + bail
    };
    n.on('hello', (d, from) => {
      if (!this.isHost) return;
      this._markDiag({ helloReceived: true }, 'Hello received');
      const nm = (d.name || 'Player').slice(0, 14), pid = (typeof d.pid === 'string') ? d.pid : null;
      // same player reconnecting (reload / 2nd tab / network blip) → drop the stale entry first (by stable id, else name)
      const dupe = [...this.roster].find(([id, r]) => id !== from && id !== 'host' && ((pid && r.pid === pid) || (r.name || '').toLowerCase() === nm.toLowerCase()));
      if (dupe) this._dropPeer(dupe[0], { silent: true });
      if (!this.roster.has(from) && this.roster.size >= 4) { this.net.sendTo(from, 'full', {}); return; }   // co-op cap = 4 (host + 3)
      const skin = (d.skin != null) ? d.skin : this.roster.size;
      const chipSkin = (typeof d.chipSkin === 'string') ? d.chipSkin : 'dice';
      this.roster.set(from, { name: nm, skin, chipSkin, ready: false, loadout: Array.isArray(d.loadout) ? d.loadout : [], pid });
      this._lastXf.set(from, performance.now());
      this.net.send('roster', this._rosterArr()); this._renderRoster();
      this.net.sendTo(from, 'joinok', {});
      this._markDiag({ joinokSent: true }, 'Join OK sent');
      this.net.sendTo(from, 'mode', { mode: this._lobbyMode || 'purge', buyIn: this.pokerBuyIn });   // joiner's lobby shows the chosen mode (+ poker buy-in)
      this.net.sendTo(from, 'map', { map: this.game.mapId });               // host-only map: the whole squad plays the HOST's map
      if (this.active) { this.pstate.set(from, this._freshState(this.roster.get(from))); this._sendWorldTo(from); this._broadcastPState(from); }
    });
    n.on('full', () => { if (!this.isHost) { this._lobbyMsg('Room is full (max 4 players).'); try { this.net.close(); } catch (e) {} } });
    n.on('joinok', () => { if (!this.isHost) { this._clearJoinHandshakeTimer(); this._markDiag({ joinokReceived: true }, 'Join OK received'); this._lobbyMsg('Connected! Waiting for the host to start…'); } });
    n.on('roomClosed', () => {
      if (!this.isHost) {
        this._clearJoinHandshakeTimer();
        this._lobbyMsg('Host closed the room.');
        this._setLobbyDiag('Room closed by host.');
        this._resetDiag('idle', '');
        try { this.net.close(); } catch (e) {}
        this.net = this._makeNet(); this._wireNet();
        this.ready = false; this.myId = null; this.roster.clear(); this.pstate.clear();
        this._renderRoster();
      }
    });
    n.on('goodbye', (d, from) => { if (this.isHost) this._dropPeer(from); });                                  // client left cleanly
    n.on('playerLeft', (d) => { if (!d) return; const id = d.id; if (this.remotes.has(id)) { this.remotes.get(id).dispose(); this.remotes.delete(id); } this.roster.delete(id); this.pstate.delete(id); this._renderRoster(); }); // despawn that character now
    n.on('kicked', () => { if (!this.isHost) { try { this.game.hud.bigMessage('KICKED', 'the host removed you from the game'); } catch (e) {} this.leave(); this.game.toMenu(); } });
    n.on('roster', (arr) => { if (!Array.isArray(arr)) return; this.roster.clear(); for (const p of arr) this.roster.set(p.id, { name: p.name, skin: p.skin, chipSkin: (typeof p.chipSkin === 'string') ? p.chipSkin : 'dice', ready: !!p.ready, loadout: p.loadout || [], pid: p.pid || null }); this._renderRoster(); this._syncRemoteObjs(); });
    n.on('ready', (d, from) => { if (!this.isHost) return; const r = this.roster.get(from); if (r) r.ready = !!d.val; this.net.send('roster', this._rosterArr()); this._renderRoster(); });
    n.on('mode', (d) => { // host announced the squad's mode (+ poker buy-in)
      if (this.isHost || !d) return;
      this._lobbyMode = (d.mode === 'longnight') ? 'longnight' : (d.mode === 'poker') ? 'poker' : 'purge';
      if (this._lobbyMode !== 'poker') this.game.mode = this._lobbyMode;       // never poison game.mode with 'poker'
      else { this.pokerBuyIn = d.buyIn | 0; this.ready = false; const me = this.roster.get(this.myId); if (me) me.ready = false; } // buy-in/mode change → must re-accept
      this._renderRoster();
    });
    n.on('map', (d) => { // host-only map: joiner adopts the HOST's map; if it differs, reload world and auto-rejoin
      if (this.isHost || !d) return;
      const want = (d.map === 'steppe') ? 'steppe' : 'arena';
      if (want === this.game.mapId) return;
      try { localStorage.setItem('engendros_map', want); } catch (e) {}
      try { sessionStorage.setItem('engendros_autojoin', JSON.stringify({ code: this._joinRoom || '', name: this.name || 'Player', skin: this.chosenSkin || 0, lan: !!(this._lanMode && this._lanMode()) })); } catch (e) {}
      this._lobbyMsg('Host is on the ' + want.toUpperCase() + ' map — switching and rejoining...');
      if (this.game.hud && this.game.hud.bigMessage) this.game.hud.bigMessage('SWITCHING MAP', 'joining host on ' + want.toUpperCase());
      setTimeout(() => { try { location.href = location.pathname; } catch (e) {} }, 700);
    });
    n.on('start', (d) => { this.active = true; this.net.lastRecv = performance.now(); this.game._enterMP(d.mode || 'purge'); this._syncRemoteObjs(); });
    n.on('xf', (d, from) => { if (this.isHost) this._lastXf.set(from, performance.now()); const rp = this._remote(d.id); if (rp) rp.setTransform(d); }); // host: track per-client heartbeat
    n.on('espawn', (d) => this._clientSpawnEnemy(d));
    n.on('esnap', (arr) => this._clientSnap(arr));
    n.on('struct', (d) => g.build.applyRemoteStruct(d));                       // a structure was placed (host-authoritative)
    n.on('structreq', (d, from) => { if (this.isHost) g.build.hostPlaceFromClient(d, from); }); // client asks host to place
    n.on('structrej', (d) => { if (!this.isHost && d && typeof d.kind === 'string') this.game.inventory.addItem(d.kind, 1); }); // host rejected → restore material
    n.on('structdie', (d) => g.build.applyRemoteDestroy(d.id));                // a structure was destroyed
    // --- co-op poker (host-authoritative; clients are thin terminals) ---
    n.on('pkstart', (d) => { if (!this.isHost) g._enterCoopPoker(d); });                          // host invited me → pay + ante-ack, then wait for the deal (pksnap)
    n.on('pksnap', (d) => { if (!this.isHost && g.poker) g.poker.onSnap(d); });                   // host → my personalised view
    n.on('pkact', (d, from) => { if (this.isHost && g.poker && d) g.poker.hostClientAct(from, d.action); }); // client action → host validates
    n.on('pkleave', (d, from) => { if (this.isHost && g.poker) g.poker.onPeerDisconnect(from); }); // client left the table → eliminate
    n.on('pkabort', () => { if (!this.isHost && g.poker) g.poker.onAbort(); }); // host ended the session → onAbort refunds + returns to lobby
    n.on('pkante', (d, from) => { if (this.isHost && g.poker) g.poker.onAnte(from); }); // client confirmed it paid its buy-in → count it in the pool (C1 ante-ack)
    n.on('chipskin', (d, from) => { if (!this.isHost || !d) return; const r = this.roster.get(from); if (r && typeof d.chipSkin === 'string') { r.chipSkin = d.chipSkin; this.net.send('roster', this._rosterArr()); this._renderRoster(); } }); // cosmetic: update only the peer's poker chip skin, PRESERVING its anted/ready state
    n.on('structhit', (d) => { if (this.isHost) { const s = g.build.structures.find((x) => x.id === d.id); if (s) g.build.attackStructure(s, d.dmg, null); } }); // client shot/meleed a structure
    n.on('radioset', (d) => g.build.applyRadioSet(d));                          // authoritative radio on/off/station (host → clients)
    n.on('radioreq', (d, from) => { if (this.isHost) { g.build.applyRadioSet(d); n.broadcast('radioset', d); } }); // client asks host to toggle/tune a radio
    n.on('gramoset', (d) => g.gramophone.applySet(d));                          // authoritative gramophone on/off/song (host → clients)
    n.on('gramoreq', (d, from) => { if (this.isHost) { g.gramophone.applySet(d); n.broadcast('gramoset', d); } }); // client asks host to toggle/change a gramophone
    n.on('gateset', (d) => { if (d && g.world.applyGateSet) g.world.applyGateSet(d.open); });                         // authoritative works-gate open/close (host → clients)
    n.on('gatereq', (d, from) => { if (this.isHost && d && g.world.applyGateSet) { g.world.applyGateSet(d.open); n.broadcast('gateset', { open: !!d.open }); } }); // client asks host to open/close the gate
    n.on('doorset', (d) => { if (d && g.world.applyDoorSet) g.world.applyDoorSet(d.id, d.open); });                   // authoritative bunker гермодверь open/closed (host → clients)
    n.on('doorreq', (d, from) => { if (this.isHost && d && g.world.applyDoorSet) { g.world.applyDoorSet(d.id, d.open); n.broadcast('doorset', { id: d.id, open: !!d.open }); } }); // client asks host to swing a blast door
    n.on('edie', (d) => this._clientEnemyDie(d));
    n.on('fx', (d) => { if (!d || !d.e) return; const eff = g.effects, V = (a) => new THREE.Vector3(a[0], a[1], a[2]); // host-relayed one-shot particle+sound
      if (d.e === 'expl') { const bp = V(d.p); eff.explosion(bp, d.s || 3); if (g.engine.shake) { const dist = bp.distanceTo(g.player.pos); if (dist < 18) g.engine.shake(Math.max(0.08, 0.5 * (1 - dist / 18))); } } // distance-scaled shake so a teammate's blast also rattles the viewer
      else if (d.e === 'laser') { const from = V(d.p), dir = V(d.d); eff.muzzleFlash(from, dir, 2.6); g.audio.tone(1300, 0.08, 'square', 0.35); g.audio.noise(0.16, 0.35, 'highpass', 1400, 0.8); g._fxBeam(from, dir); } });
    n.on('bossfx', (d) => { if (this.isHost || !d || !d.k) return; const V = (a) => new THREE.Vector3(a[0], a[1], a[2]); const em = g.enemies; // host-relayed boss/tank attack VISUALS (clients don't run EnemyManager.update) — visual-only, NO damage
      switch (d.k) {
        case 'bolt': em.spawnGhostBolt(V(d.p), V(d.d), d.col); break;
        case 'sweepStart': em.ghostSweepStart(d.ph); break;
        case 'sweep': em.ghostSweepUpdate(V(d.p), d.a, d.len, d.th, d.ph); break;
        case 'sweepEnd': em.ghostSweepEnd(); break;
        case 'fire': g.effects.firePool({ x: d.x, y: 0.08, z: d.z }, 1.2, 0.8); em.addGhostFire(d.x, d.z); break;
        case 'glow': { const gh = this.ghosts.get(d.id); if (gh && gh.pos) { const belly = new THREE.Vector3(gh.pos.x, gh.pos.y + 0.6 * (gh.scale || 1), gh.pos.z + 0.4 * (gh.scale || 1)); g.effects.firePool({ x: belly.x, y: belly.y, z: belly.z }, 0.6, 1.2); } break; }
        case 'banner': g.hud.bigMessage(d.title || '', d.sub || ''); g.audio.tone(200, 0.5, 'sawtooth', 0.4); break;
        case 'aimring': em.ghostAimMarker(d.x, d.z); break;
        case 'mg': g.effects.tracer(V(d.o), V(d.e), 0xfff1a0); g.audio.tone(180, 0.03, 'square', 0.10); break;
        case 'shell': g.effects.explosion(V(d.p), d.s || 4); if (g.engine.shake) g.engine.shake(0.4); break;
        case 'shake': if (g.engine.shake) g.engine.shake(d.a || 0.2); break;
      }
    });
    n.on('bosshit', () => { g.audio.bossHit(); g.hud.bossHitCue(); }); // host → THIS shooter: your hit on Tolo was effective (yellow crosshair + thunk)
    n.on('shot', (d) => { if (!d || d.pid === this.myId) return; const V = (a) => new THREE.Vector3(a[0], a[1], a[2]); // a teammate's gunfire: muzzle + tracer + shot sound
      const muzzle = V(d.p), dir = V(d.d).normalize();
      g.effects.muzzleFlash(muzzle, dir, (d.cls === 'shotgun' || d.cls === 'launcher') ? 1.6 : 1);
      const wh = g.world.rayHit(muzzle, dir, 120); const end = wh ? wh.point : muzzle.clone().addScaledVector(dir, 120);
      g.effects.tracer(muzzle, end, d.col != null ? d.col : 0xffd27f);
      if (d.w === 'mosin' && g.audio && typeof g.audio.mosinShot === 'function') g.audio.mosinShot();
      else g.audio.gunshot(SOUND_BY_CLASS[d.cls] || SOUND_BY_CLASS.pistol); });
    n.on('weaponfoley', (d) => { if (!d || d.pid === this.myId || d.w !== 'mosin') return; // teammate Mosin bolt/reload foley
      const a = g.audio; if (!a) return;
      if (d.k === 'boltOpen' && typeof a.mosinBoltOpen === 'function') a.mosinBoltOpen();
      else if (d.k === 'boltClose' && typeof a.mosinBoltClose === 'function') a.mosinBoltClose();
      else if (d.k === 'caseEject' && typeof a.mosinCaseEject === 'function') a.mosinCaseEject();
      else if (d.k === 'reloadStart' && typeof a.mosinReloadStart === 'function') a.mosinReloadStart();
      else if (d.k === 'clipLoad' && typeof a.mosinClipLoad === 'function') a.mosinClipLoad();
      else if (d.k === 'roundInsert' && typeof a.mosinRoundInsert === 'function') a.mosinRoundInsert();
      else if (d.k === 'reloadFinish' && typeof a.mosinReloadFinish === 'function') a.mosinReloadFinish();
      else if (typeof a.reloadClick === 'function') a.reloadClick(); });
    // ---- rooftop fixed heavy MGs: seat claim + fire FX + barrel slew ----
    n.on('fiftyclaim', (d, from) => { if (this.isHost && d) this._hostFiftyClaim(d.want, from, d.g); });           // client → host: request mount/dismount
    n.on('fiftystate', (d) => { if (!this.isHost && d) this._applyFiftyState(d); });                              // host → clients: who owns the seat now
    n.on('fiftyfire', (d) => { if (!d || d.pid === this.myId) return; const V = (a) => new THREE.Vector3(a[0], a[1], a[2]); // a teammate firing the .50cal: muzzle + tracer + shot/brass sound (damage is host-authoritative)
      const gun = g.mountedGunById ? g.mountedGunById(d.g) : g.mountedGun;
      if (gun && typeof gun.feedBeltShot === 'function') gun.feedBeltShot();
      if (Number.isFinite(d.ammo) && gun && typeof gun.setAmmo === 'function') gun.setAmmo(d.ammo);
      const o = V(d.o), e = V(d.e);
      const dir = d.d ? V(d.d).normalize() : e.clone().sub(o).normalize();
      g.effects.muzzleFlash(o, dir, (gun && gun.muzzleFlashScale) || 2.2);
      g.effects.tracer(o, e, d.c != null ? d.c : 0xffe08a);
      if (d.s && d.r) g.effects.shell(V(d.s), V(d.r).normalize(), { mesh: 'fiftyCase', size: 1, color: 0xcaa64a, sound: 'fiftyBrass', life: 5, bounce: 0.48, maxBounceSounds: 3, bounceSoundMinVel: 1.4, sideMin: 2.8, sideMax: 4.4, upMin: 1.2, upMax: 2.1, seed: d.rs });
      if (gun && gun.variant === 'dshk' && g.audio && typeof g.audio.dshkShot === 'function') g.audio.dshkShot();
      else if (g.audio && typeof g.audio.fiftyShot === 'function') g.audio.fiftyShot(); else if (g.audio && typeof g.audio.gunshot === 'function') g.audio.gunshot(SOUND_BY_CLASS.fiftycal); });
    n.on('fiftysound', (d) => { if (!d || d.pid === this.myId || !d.k) return; // non-shot .50cal foley: charging handle / overheat should be audible to nearby peers too
      const gun = g.mountedGunById ? g.mountedGunById(d.g) : g.mountedGun;
      if (d.k === 'charge') { if (gun && typeof gun.animateCharge === 'function') gun.animateCharge(); if (g.audio && typeof g.audio.fiftyCharge === 'function') g.audio.fiftyCharge(); else if (g.audio && typeof g.audio.reloadIn === 'function') g.audio.reloadIn(); }
      else if (d.k === 'overheat') { if (g.audio && typeof g.audio.fiftyOverheat === 'function') g.audio.fiftyOverheat(); else if (g.audio && typeof g.audio.tone === 'function') g.audio.tone(100, 0.25, 'sawtooth', 0.25); } });
    n.on('fiftyaim', (d) => { if (!d || d.pid === this.myId) return; const gun = g.mountedGunById ? g.mountedGunById(d.g) : g.mountedGun; if (gun && gun.occupant === d.pid && gun.gun) { gun.gun.rotation.set(d.pitch, d.yaw, 0); if (typeof gun.updateCollisionBoxes === 'function') gun.updateCollisionBoxes(); } if (gun && d.heat != null) gun.heat = d.heat; if (gun && Number.isFinite(d.ammo) && typeof gun.setAmmo === 'function') gun.setAmmo(d.ammo); }); // slew the barrel + mirror heat/ammo so everyone sees the glow/smoke/empty box
    n.on('fiftyrefill', (d, from) => { if (this.isHost) this._hostFiftyRefill(from, d && d.g); }); // client → host: reload the host-owned fixed MG from a carried can
    // ── 82-ПМ-37 co-op mortar (host-authoritative seat + ammo + impact; clients render visual-only arcs) ──
    n.on('mortarclaim', (d, from) => { if (this.isHost && d) this._hostMortarClaim(d.want, from, d.m); });        // client → host: man/leave the mortar
    n.on('mortarstate', (d) => { if (!this.isHost && d) this._applyMortarState(d); });                            // host → clients: occupant + mines
    n.on('mortaraim', (d) => { if (!d || d.pid === this.myId) return; const m = this._mortarById(d.m); if (m && m.occupant === d.pid) { m._netAz = d.az; m._netEl = d.el; } }); // mirror the gunner's lay so the tube slews for everyone
    n.on('mortarfirereq', (d, from) => { if (this.isHost && d) this._hostMortarFire(d.m, from); });                // client gunner → host: request a shot
    n.on('mortarfire', (d) => { if (this.isHost || !d) return; const m = this._mortarById(d.m); if (m) m.spawnShell(d, false); }); // host → clients: render the identical arc (NO damage)
    n.on('mortarspot', (d, from) => { if (this.isHost && d) this._hostMortarSpot(d.p, from); });                   // spotter → host: compute the firing solution
    n.on('mortarmark', (d) => { if (!this.isHost && d) this.game._dropMortarMark(d); });                           // host → clients: shared target marker + call
    n.on('proj', (d) => this._clientSpawnProj(d)); // a teammate threw/launched a projectile → render a visual-only ghost that flies + detonates like the real one
    n.on('boom', (d, from) => {                                                                                    // client thrower's explosion → host authoritatively applies enemy AoE + player FF + item clearing + destruction (visual already shown via the 'proj' ghost)
      if (!this.isHost) return;
      if (!d || !Array.isArray(d.p) || d.p.length < 3 || !d.p.every(Number.isFinite) || !Number.isFinite(d.r)) { console.warn('mp: dropped malformed boom packet', from, d); return; } // don't no-op silently on a NaN radius / garbage payload
      g.explode(new THREE.Vector3(d.p[0], d.p[1], d.p[2]), { radius: Math.min(d.r, 30), dmg: +d.d || 0, enemyDmg: +d.ed || 0, source: d.s, attacker: from, harmEnemies: !!d.he, harmPlayers: !!d.hp, clearLoot: !!d.cl, destroy: !!d.ds, isRocket: !!d.rk, visual: false, net: false }); }); // radius clamped (room codes are public → untrusted peers); attacker:from credits the KILL to the real thrower, not the host
    n.on('boss', (d) => { if (d.hide) g.hud.hideBoss(); else { g.hud.setBoss(d.frac, d.name); if (d.pip != null) g.hud.setBossPip(d.pip); } });
    n.on('wave', (d) => { g.waves.wave = d.n; g.hud.setWave(d.n); g.hud.bigMessage(d.label, d.sub); }); // continuous: clients just track the wave (no shop)
    n.on('wavetag', (d) => { if (!this.isHost && d) g.hud.setWaveTag(d.tags || []); });                  // host-authoritative special-wave tag (set/clear)
    n.on('night', (d) => { if (!this.isHost && d) g.dayNight.applyNetState(d); });                       // host-authoritative world clock + day/night + blood-moon (clients reconcile, never roll their own)
    n.on('timereq', (d, from) => { if (this.isHost && d && Number.isFinite(d.min)) g.dayNight.setMinuteOfDay(d.min); }); // client asked host to set time → host applies (setMinuteOfDay re-renders + broadcasts)
    n.on('clock', (d) => { if (!this.isHost && d) { if (typeof d.t === 'number') g._surviveTime = d.t; if (typeof d.left === 'number') g.hud.setEnemiesLeft(d.left); } }); // host-authoritative survive-clock + enemies-left
    n.on('waveclear', (d) => { if (g.state === 'playing') g.hud.bigMessage('WAVE CLEAR', 'breathe — next wave incoming'); });
    n.on('hit', (d, from) => { if (!this.isHost) return; const e = this._enemyById(d.eid); if (e && e.alive) g.enemies.damage(e, d.dmg, d.src || 'gun', null, from); });
    n.on('phit', (d, from) => { if (this.isHost) this.hostHurt(d.tid, d.dmg, from); });
    n.on('molotov', (d) => { if (this.isHost) this.game._spawnMolotovPool(new THREE.Vector3(d.x, d.y, d.z), true); });
    n.on('firepool', (d) => { if (!this.isHost) this.game._spawnMolotovPool(new THREE.Vector3(d.x, d.y, d.z), true); });
    n.on('fireignite', (d) => { if (!this.isHost && this.game.fire && d) this.game.fire.igniteById(d.id, d.owner, d.seed); }); // host-auth fire SPREAD: mirror the exact part+seed the host lit. owner ('b' building / 't' forest) disambiguates the id (forest & building part-ids are separate counters that collide → must dispatch by owner, never a global id search)
    n.on('bdestroy', (d) => { if (!this.isHost && d) { const b = this.game.world.demoBuilding; if (b && typeof b.applyNetDestroy === 'function') b.applyNetDestroy(d.parts, d.holes); } }); // host-auth BUILDING destruction: replay the exact dead parts (brick breach / shattered panes / burnt door) + APFSDS through-holes. Single building per world → 'bdestroy' type routes unambiguously (no owner flag needed)
    n.on('forestfx', (d) => { if (this.isHost || !d) return; const fr = this.game.forest; if (!fr) return; // host-auth FOREST mutations: fell/char a tree, consume a grass tuft. Tree fall is replayed with the host's exact dir+seed → identical deterministic FallingBody
      if (d.k === 'fell') fr.fellTreeById(d.id, d.dx, d.dz, d.seed);
      else if (d.k === 'char') fr.charTreeById(d.id);
      else if (d.k === 'grass') fr.consumeGrassById(d.id);
      else if (d.k === 'propdie') fr.destroyPropById(d.id); });
    n.on('kill', (d) => this._clientKill(d));
    n.on('burn', () => { this.game.player.burnT = PLAYER_BURN_DUR; });
    n.on('bleed', (d) => { if (d && typeof d.t === 'number') this._bleedT = d.t; }); // host re-syncs the downed player's bleed-out bar to the authoritative downT
    n.on('ignite', (d, from) => { if (this.isHost) { const s = this.pstate.get(from); if (s) s.burnT = PLAYER_BURN_DUR; } }); // client self-ignite (in-hand molotov shatter) → host owns the lingering burn DoT
    n.on('pstate', (d) => this._applyPState(d));
    n.on('revive', (d, from) => { if (this.isHost) this.hostRevive(d.tid, from); });
    n.on('reviveprog', (d, from) => { if (this.isHost) this._hostReviveProgress(d, from); else this._applyReviveProgress(d); });
    n.on('ping', (d, from) => { if (this.isHost) this.net.sendTo(from, 'pong', d); });
    n.on('pong', (d) => { this.myPing = Math.round(performance.now() - d.t); });
    n.on('pstat', (d) => { const r = this.roster.get(d.id); if (r) { r.ping = d.ping; r.money = d.money; } if (this._sbOpen) this.renderScoreboard(); });
    n.on('feed', (d) => this.game.hud.kill(d.who + ' \u27a4 ' + d.what));
    n.on('gameover', (d) => this.game._mpGameOver(d && d.reason));
    n.on('droppickup', (d) => { if (!d || typeof d.kind !== 'string' || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return; const p = this.game.player.pos.clone(); p.set(d.x, 0.55, d.z); this.game.loot._spawnPickup(d.kind, p, d.value); }); // a teammate's spilled loot → grab it with E (legacy local pile)
    // ---- host-authoritative SHARED ground loot (one pile for everyone, first grab claims it) ----
    n.on('pickup', (d) => { if (!this.isHost && d) g.loot._spawnPickup(d.kind, new THREE.Vector3(d.x, 0.55, d.z), d.value, d.life, d.id); });        // client spawns the EXACT shared pickup the host broadcast
    n.on('pickupgone', (d) => { if (d) g.loot.removePickupById(d.id); });                                                  // everyone removes a claimed/destroyed pickup
    n.on('pickupclaim', (d, from) => { if (this.isHost && d) g.loot.claimPickup(d.id, from); });                           // a client wants it → host dedupes + authorizes
    n.on('pickupgrant', (d) => { if (d) g.loot._applyGrant(d.kind, d.value); });                                          // host authorized THIS client to apply the effect
    n.on('dropitem', (d, from) => { if (this.isHost && d) g.loot.spawnNetPickup(d.kind, d.x, d.z, d.value); });           // a client manually dropped an item → host makes it a shared pickup
    n.on('dropreq', () => { if (this.isHost) g.loot.requestSupplyDrop(); });                                              // client asked for a drop → host spawns + broadcasts it
    n.on('supplydrop', (d) => { if (!this.isHost && d) g.loot.callSupplyDrop({ id: d.id, tx: d.tx, tz: d.tz, ang: d.ang }); }); // mirror the host's flyby+crate (visual)
    n.on('dropopen', (d, from) => { if (!this.isHost || !d) return; const drop = g.loot.drops.find((x) => x.id === d.id && !x.opened); if (!drop) return; drop.opened = true; g.loot._removeDrop(drop); g.loot._spillDropLoot(drop.pos, g.loot._rollGive(), from); this.net.broadcast('dropopened', { id: d.id }); }); // host-authoritative: roll the gun + spawn ONE shared pile (loot only, no cash)
    n.on('dropopened', (d) => { if (d) g.loot.removeDropById(d.id); });                                                   // someone claimed it → clear the visual crate everywhere
  }
  _rosterArr() { return [...this.roster].map(([id, p]) => ({ id, name: p.name, skin: p.skin, chipSkin: p.chipSkin || 'dice', ready: !!p.ready, loadout: p.loadout || [], pid: p.pid || null })); }
  // Cosmetic-only: the local player picked a new poker chip skin in the co-op lobby. Refresh the roster
  // so the host ships the right per-seat skin in the next poker snapshot. No-op when not networked.
  notifyChipSkinChanged() {
    if (!this.net || !this.myId) return;                                  // solo / not in a session → nothing to sync
    const skin = (this.game.meta && this.game.meta.chipSkin) || 'dice';
    if (this.isHost) {
      const me = this.roster.get('host'); if (me) me.chipSkin = skin;
      try { this.net.send('roster', this._rosterArr()); } catch (e) {}    // host owns the roster → re-broadcast it
    } else {
      // Targeted skin-only update — NOT a re-hello: a full hello re-handshake would reset my roster
      // entry to ready:false on the host (its hello handler always un-readies), which would wipe my
      // anted state mid-lobby and disable the host's DEAL button. This only touches chipSkin.
      try { this.net.send('chipskin', { chipSkin: skin }); } catch (e) {}
    }
  }
  _remote(id) {
    if (id === this.myId) return null;
    if (!this.remotes.has(id)) { const info = this.roster.get(id) || { name: 'Flopo', skin: 1 }; this.remotes.set(id, new RemotePlayer(this.game, id, info.name, info.skin)); }
    return this.remotes.get(id);
  }
  _syncRemoteObjs() { for (const [id, info] of this.roster) if (id !== this.myId && !this.remotes.has(id)) this.remotes.set(id, new RemotePlayer(this.game, id, info.name, info.skin)); }
  // ---- rooftop fixed MG seats (host-authoritative occupants) ----
  _hostFiftyClaim(want, from, gid) {
    if (!this.isHost) return; const gun = this.game.mountedGunById ? this.game.mountedGunById(gid) : this.game.mountedGun; if (!gun) return;
    if (want === 'mount') { if (gun.overheated || gun.ammo <= 0) { this.net.sendTo(from, 'fiftystate', { g: gun.id, occ: gun.occupant, ammo: gun.ammo }); return; } if (gun.occupant == null) { gun.occupant = from; } else if (gun.occupant !== from) { /* occupied: deny — just tell the asker the current owner */ this.net.sendTo(from, 'fiftystate', { g: gun.id, occ: gun.occupant, ammo: gun.ammo }); return; } }
    else if (want === 'dismount') { if (gun.occupant === from) gun.occupant = null; }
    this._applyFiftyState({ g: gun.id, occ: gun.occupant, ammo: gun.ammo }); this.net.send('fiftystate', { g: gun.id, occ: gun.occupant, ammo: gun.ammo });
  }
  _hostFiftyRefill(from, gid) {
    if (!this.isHost) return; const gun = this.game.mountedGunById ? this.game.mountedGunById(gid) : this.game.mountedGun; if (!gun) return;
    if (gun.ammo >= gun.maxAmmo) return;                                  // already full — the client wasted nothing it can detect; ignore
    gun.setAmmo(gun.maxAmmo);
    if (typeof gun.animateCharge === 'function') gun.animateCharge();     // host-local rack anim
    this.net.send('fiftystate', { g: gun.id, occ: gun.occupant, ammo: gun.ammo }); // sync the new belt to all clients
    this.net.broadcast('fiftysound', { pid: this.myId, g: gun.id, k: 'charge' });  // everyone hears/sees the rack
  }
  _applyFiftyState(d) {
    const gun = this.game.mountedGunById ? this.game.mountedGunById(d && d.g) : this.game.mountedGun; if (!gun) return; gun.occupant = d.occ;
    if (Number.isFinite(d.ammo) && typeof gun.setAmmo === 'function') gun.setAmmo(d.ammo);
    if (d.occ === this.myId) { if (this.game.player.mountedGun !== gun) gun._doMount(); }
    else if (this.game.player.mountedGun === gun) { gun._doDismount(); }   // someone else took/cleared it
  }
  // ---- 82-ПМ-37 mortar host authority (cloned from the fifty* seat pattern) ----
  _mortarById(id) { return (this.game.mortars || []).find((m) => m.id === id) || null; }
  _hostMortarClaim(want, from, mid) {
    if (!this.isHost) return; const m = this._mortarById(mid); if (!m) return;
    if (want === 'mount') {
      if (m.ammo <= 0) { this.net.sendTo(from, 'mortarstate', { m: m.id, occ: m.occupant, ammo: m.ammo }); return; }
      if (m.occupant == null) { m.occupant = from; }
      else if (m.occupant !== from) { this.net.sendTo(from, 'mortarstate', { m: m.id, occ: m.occupant, ammo: m.ammo }); return; } // occupied: deny
    } else if (want === 'dismount') { if (m.occupant === from) m.occupant = null; }
    this._applyMortarState({ m: m.id, occ: m.occupant, ammo: m.ammo }); this.net.send('mortarstate', { m: m.id, occ: m.occupant, ammo: m.ammo });
  }
  _applyMortarState(d) {
    const m = this._mortarById(d && d.m); if (!m) return; m.occupant = d.occ;
    if (Number.isFinite(d.ammo)) m.setAmmo(d.ammo);
    if (d.occ === this.myId) { if (this.game.player.mortar !== m) m._doMount(); }
    else if (this.game.player.mortar === m) { m._doDismount(); }            // someone else took/cleared the seat
  }
  _hostMortarFire(mid, from) {
    if (!this.isHost) return; const m = this._mortarById(mid); if (!m) return;
    if (m.occupant !== from || m.ammo <= 0 || m.loadT > 0) { this.net.sendTo(from, 'mortarstate', { m: m.id, occ: m.occupant, ammo: m.ammo }); return; } // reject + resync
    m._hostFire(this);                                                       // decrements ammo, computes the deterministic impact, broadcasts the arc
  }
  _hostMortarSpot(p, from) {
    if (!this.isHost || !p) return; const m = this._mortarById('mortar') || (this.game.mortars && this.game.mortars[0]); if (!m) return;
    const hit = { x: p[0], z: p[1] }, iy = m._groundY(hit.x, hit.z);
    const mark = { p: [+hit.x.toFixed(2), +iy.toFixed(2), +hit.z.toFixed(2)], rng: Math.round(rangeMeters(m.base, hit)), mils: formatUglomer(bearingMils(m.base, hit)) };
    this.game._dropMortarMark(mark);                                         // host sees it locally
    this.net.send('mortarmark', mark);                                       // → all clients
  }
  // ---- per-frame ----
  update(dt) {
    if (!this.active) return;
    const g = this.game, cam = g.engine.camera;
    this._xfT -= dt;
    if (this._xfT <= 0) {
      this._xfT = 0.066; const p = g.player;
      this.net.broadcast('xf', { id: this.myId, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, down: this._localDown, dead: this._localDead, waiting: this._localWaiting, wep: g.weapons.cur, fl: g.inventory.isHoldingFlashlight() && !!(g.dayNight && g.dayNight.flashOn), bf: (g.player.burnT > 0) ? 1 : 0, seat: (g.player.mountedGun ? 1 : 0) });
    }
    for (const [, rp] of this.remotes) rp.update(dt, cam);
    this._updateGhostProjectiles(dt);
    if (this.isHost) {
      this._snapT -= dt;
      if (this._snapT <= 0) {
        this._snapT = 0.08; const arr = [];
        for (const e of g.enemies.active) if (e.alive) arr.push({ id: e.id, x: +e.pos.x.toFixed(2), y: +e.pos.y.toFixed(2), z: +e.pos.z.toFixed(2), ry: +e.mesh.rotation.y.toFixed(2), hp: Math.round((e.hp / e.maxHp) * 100), bf: e.burnT > 0 ? 1 : 0 }); // y carried so terrain-map ghosts don't float at 0 (esnap-Y fix); host knows true Y incl. knockback/boss
        this.net.send('esnap', arr); this._tickDowns(); this._tickBurn();
        // pick a SINGLE highest-priority boss without flicker: a real boss/tank outranks an elite mini-boss
        let boss = null; for (const e of g.enemies.active) { if (!e.alive) continue; if (e.def.boss) { boss = e; break; } if (e.isElite && !boss) boss = e; }
        if (boss) {
          const frac = boss.hp / boss.maxHp;
          this.net.send('boss', { frac, name: boss.name, pip: -1 }); this._hadBoss = true;
        }
        else if (this._hadBoss) { this.net.send('boss', { hide: true }); this._hadBoss = false; }
      }
      this._toT -= dt;
      if (this._toT <= 0) { this._toT = 2; const now = performance.now(); for (const [id] of this.roster) { if (id === 'host') continue; const last = this._lastXf.get(id); if (last != null && now - last > 10000) this._dropPeer(id); } } // crash detection: no xf for 10s → despawn
      // host-authoritative survive-clock + enemies-left (~0.5s) and day/night drift correction (~2s) — only meaningful in LONG NIGHT but cheap to always send
      this._clockT -= dt;
      if (this._clockT <= 0) { this._clockT = 0.5; const left = g.waves.active ? g.waves.toSpawn + g.enemies.aliveCount : g.enemies.aliveCount; this.net.send('clock', { t: g._surviveTime, left }); }
      this._nightT -= dt;
      if (this._nightT <= 0) { this._nightT = 1; this.sendWorldTime(); } // ~1s world-clock push; clients predict locally between pushes + reconcile
    } else {
      for (const [, e] of this.ghosts) {
        if (!e.alive) continue;
        e.pos.x = damp(e.pos.x, e._tx, 14, dt); e.pos.z = damp(e.pos.z, e._tz, 14, dt); e.pos.y = damp(e.pos.y, (e._ty || 0), 14, dt); e.bob += dt * 7;
        e.mesh.position.set(e.pos.x, e.pos.y + Math.abs(Math.sin(e.bob)) * 0.08, e.pos.z); // ground Y from host (esnap-Y) + cosmetic bob on top; flat maps → host y=0 → identical to before
        e.mesh.rotation.y = damp(e.mesh.rotation.y, e._try, 12, dt);
        if (e.burnT > 0) { e.burnT -= dt; e._burnFxT = (e._burnFxT || 0) - dt; if (e._burnFxT <= 0) { e._burnFxT = 0.08; g.effects.firePool(e.pos, 0.45, 0.4); } } // mirror the host's on-fire enemy flame
      }
    }
    this._pingT -= dt; if (this._pingT <= 0) { this._pingT = 2; if (!this.isHost) this.net.send('ping', { t: performance.now() }); }
    this._pstatT -= dt; if (this._pstatT <= 0) { this._pstatT = 1; const myPing = this.isHost ? 0 : this.myPing, myMoney = g.player.money; const me = this.roster.get(this.myId); if (me) { me.ping = myPing; me.money = myMoney; } this.net.broadcast('pstat', { id: this.myId, ping: myPing, money: myMoney }); if (this._sbOpen) this.renderScoreboard(); }
    this._updateRevive(dt);
    this.updateSpectator(dt);
    // local bleed-out bar: counts the downed player's 30s toward bleeding out; revive progress temporarily takes over this bar.
    if (this._localDown) {
      this._bleedT = Math.max(0, (this._bleedT || 0) - dt);
      const prog = this._incomingRevive && performance.now() < this._incomingRevive.until ? this._incomingRevive : null;
      g.hud.setBleed(prog ? (prog.clicks / Math.max(1, prog.total)) : (this._bleedT / DOWN_SECONDS));
      this._bleedShown = true;
    }
    else if (this._bleedShown) { g.hud.setBleed(-1); this._bleedShown = false; }
  }
  // ---- ghost projectiles (visual-only mirror of a teammate's thrown/launched projectile) ----
  _clientSpawnProj(d) {
    if (!d || d.pid === this.myId) return; // never ghost your OWN projectile — you simulate the real one locally
    const g = this.game;
    const col = d.kind === 'grenade' ? 0x3c5a32 : (d.kind === 'molotov' ? 0x2f6b3a : 0x394b2e);
    const geo = d.kind === 'rocket' ? new THREE.BoxGeometry(0.2, 0.2, 0.55) : new THREE.BoxGeometry(0.22, 0.22, 0.22);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }));
    mesh.position.set(d.p[0], d.p[1], d.p[2]); mesh.castShadow = true;
    g.engine.scene.add(mesh);
    // fuses mirror the real projectiles so the ghost detonates at ~the same moment/place as the thrower's real one
    const fuse = d.kind === 'grenade' ? 1.6 : (d.kind === 'rocket' ? 4 : MOLO_MAX_FLIGHT);
    this._ghostProjectiles.push({ mesh, kind: d.kind, vel: new THREE.Vector3(d.v[0], d.v[1], d.v[2]), fuse, r: d.r || 5, trailT: 0 });
  }
  _updateGhostProjectiles(dt) {
    const arr = this._ghostProjectiles;
    if (!arr || !arr.length) return;
    const g = this.game, tmp = this._gpTmp || (this._gpTmp = new THREE.Vector3());
    for (let i = arr.length - 1; i >= 0; i--) {
      const gp = arr[i];
      gp.fuse -= dt;
      let boom = gp.fuse <= 0;
      if (gp.kind === 'molotov') { // MOLO_GRAV arc + fire trail (mirrors the real molotov integration)
        gp.vel.y -= MOLO_GRAV * dt;
        gp.mesh.position.addScaledVector(gp.vel, dt);
        const gy = g.world.groundY(gp.mesh.position.x, gp.mesh.position.z);
        if (gp.mesh.position.y <= gy + 0.05) { gp.mesh.position.y = gy + 0.05; boom = true; }
        if (!boom) { gp.trailT -= dt; if (gp.trailT <= 0) { gp.trailT = 0.04; g.effects.firePool(gp.mesh.position, 0.3, 0.6); } }
      } else if (gp.kind === 'rocket') { // straight line + smoke/spark trail (mirrors the real rocket integration)
        const dir = tmp.copy(gp.vel).normalize();
        gp.mesh.position.addScaledVector(gp.vel, dt);
        if (gp.mesh.position.y < g.world.groundY(gp.mesh.position.x, gp.mesh.position.z) + 0.2) boom = true;
        g.effects.impact(gp.mesh.position, dir, 'spark');
      } else { // grenade: gravity + floor bounce (mirrors the real grenade integration)
        gp.vel.y -= 22 * dt; gp.mesh.position.addScaledVector(gp.vel, dt);
        gp.mesh.rotation.x += dt * 6; gp.mesh.rotation.y += dt * 4;
        const gy = g.world.groundY(gp.mesh.position.x, gp.mesh.position.z);
        if (gp.mesh.position.y < gy + 0.11) { gp.mesh.position.y = gy + 0.11; gp.vel.y *= -0.4; gp.vel.x *= 0.6; gp.vel.z *= 0.6; }
      }
      if (boom) {
        const pos = gp.mesh.position.clone();
        if (gp.kind === 'molotov') g.effects.explosion(pos, 1.2); // the damaging fire pool is synced separately via 'molotov'/'firepool'
        else g.effects.explosion(pos, gp.r || 5);
        g.engine.scene.remove(gp.mesh); gp.mesh.geometry.dispose(); gp.mesh.material.dispose();
        arr.splice(i, 1);
      }
    }
  }
  _clearGhostProjectiles() { if (this._ghostProjectiles) { for (const gp of this._ghostProjectiles) { this.game.engine.scene.remove(gp.mesh); gp.mesh.geometry.dispose(); gp.mesh.material.dispose(); } this._ghostProjectiles.length = 0; } }
  // ---- enemy sync (host → clients) ----
  onEnemySpawn(e) { if (this.active && this.isHost) this.net.send('espawn', { id: e.id, type: e.type, gk: e.geoKey, cb: e.col.body, vr: e.def.variant, nm: e.name, sc: e.scale, x: +e.pos.x.toFixed(2), y: +e.pos.y.toFixed(2), z: +e.pos.z.toFixed(2), hpf: Math.round((e.hp / e.maxHp) * 100) }); }
  onEnemyDie(e, killer) { if (this.active && this.isHost) this.net.send('edie', { id: e.id, k: killer, x: +e.pos.x.toFixed(2), y: +(e.pos.y + e.height * 0.5).toFixed(2), z: +e.pos.z.toFixed(2), col: e.col.body, el: !!e.isElite, bs: !!e.def.boss, ex: e.def.explode ? (e.def.explodeRadius || 5) : 0 }); }
  onBoss(frac, name) { if (this.active && this.isHost) this.net.send('boss', { frac, name }); }
  onBossHide() { if (this.active && this.isHost) this.net.send('boss', { hide: true }); }
  _enemyById(id) { for (const e of this.game.enemies.active) if (e.id === id) return e; return null; }
  _clientSpawnEnemy(d) {
    if (this.ghosts.has(d.id)) return;
    const e = this.game.enemies.spawnGhost(d.id, d.type, d.gk, d.cb, d.vr, d.nm, d.sc);
    if (Number.isFinite(d.x)) { e.pos.set(d.x, d.y || 0, d.z); e.mesh.position.set(d.x, 0, d.z); } // spawn at the host's real position (no (0,0,0) flash)
    if (Number.isFinite(d.hpf)) e.hp = (d.hpf / 100) * e.maxHp;                                   // late-join: start at the host's current HP, not full
    e._tx = e.pos.x; e._ty = e.pos.y; e._tz = e.pos.z; e._try = 0; this.ghosts.set(d.id, e);
  }
  _clientSnap(arr) { for (const s of arr) { const e = this.ghosts.get(s.id); if (!e) continue; e._tx = s.x; e._tz = s.z; if (s.y != null) e._ty = s.y; e._try = s.ry; e.hp = (s.hp / 100) * e.maxHp; e.burnT = s.bf ? ENEMY_BURN_DUR : 0; } }
  _clientEnemyDie(d) {
    const e = this.ghosts.get(d.id); if (!e) return;
    const top = Number.isFinite(d.x) ? new THREE.Vector3(d.x, d.y, d.z) : new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
    const col = (d.col != null) ? d.col : e.col.body;
    this.game.effects.stuffing(top, col, d.bs ? 44 : (d.el ? 30 : 16), d.bs ? 9 : (d.el ? 8 : 6)); // boss/elite get the bigger burst
    if (d.ex) this.game.effects.explosion(top, d.ex); else this.game.audio.enemyDie();              // exploder death blast (explosion() plays its own boom)
    e.alive = false; e.mesh.visible = false;
    const i = this.game.enemies.active.indexOf(e); if (i >= 0) this.game.enemies.active.splice(i, 1);
    this.ghosts.delete(d.id);
  }
  // ---- combat ----
  claimHit(e, dmg, src) { this.net.send('hit', { eid: e.id, dmg, src }); }
  creditKill(killerId, e) {
    this.net.sendTo(killerId, 'kill', { reward: KILL_CASH, name: e.name, type: e.type, x: e.pos.x, z: e.pos.z, elite: !!e.isElite, score: e.def.reward + (e.def.boss ? 1500 : 0) });
    this.feed(((this.roster.get(killerId) || {}).name) || 'Player', e.name);
  }
  _clientKill(d) {
    // Client's personal kill reward ONLY. Ground items arrive as shared 'pickup' broadcasts from the host.
    const g = this.game; g.kills++; g.player.addMoney(d.reward); g.score += d.score; g.hud.setScore(g.score); g.hud.kill(d.name);
  }
  liveSpectateTargets() {
    const out = [];
    for (const [id, rp] of this.remotes) {
      const s = this.pstate.get(id);
      if ((!s || (!s.dead && !s.down && !s.waiting)) && !rp.dead && !rp.down && !rp.waiting) out.push(rp);
    }
    return out;
  }
  ensureSpectateTarget() {
    if (!this._localDead) return null;
    const live = this.liveSpectateTargets();
    if (!live.length) { this.spectateTarget = null; return null; }
    if (!this.spectateTarget || !live.some((rp) => rp.id === this.spectateTarget)) this.spectateTarget = live[0].id;
    return live.find((rp) => rp.id === this.spectateTarget) || live[0];
  }
  cycleSpectate(dir = 1) {
    if (!this._localDead) return;
    const live = this.liveSpectateTargets();
    if (!live.length) { this.spectateTarget = null; return; }
    const cur = live.findIndex((rp) => rp.id === this.spectateTarget);
    const next = (cur < 0 ? 0 : (cur + dir + live.length) % live.length);
    this.spectateTarget = live[next].id;
    this.game.hud.bigMessage('SPECTATING', live[next].name || 'teammate');
  }
  updateSpectator(dt) {
    if (!this._localDead) return;
    const rp = this.ensureSpectateTarget();
    if (!rp) return;
    const cam = this.game.engine.camera;
    const k = 1 - Math.exp(-14 * dt);
    cam.rotation.order = 'YXZ';
    cam.position.lerp(_v3a.set(rp.pos.x, rp.pos.y + 1.62, rp.pos.z), k);
    let dy = rp.yaw - cam.rotation.y; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
    cam.rotation.y += dy * k;
    cam.rotation.x += (clamp(rp.pitch, -1.2, 1.2) - cam.rotation.x) * k;
    cam.rotation.z += (0 - cam.rotation.z) * k;
  }
  rayHitPlayers(origin, dir, maxDist, force = false) {
    if (!this.friendlyFire && !force) return null;   // co-op: gunfire passes through teammates (no accidental teamkills); force=true for non-damaging probes (ЛПР-1 ranging)
    let best = maxDist, hit = null, hp = null;
    for (const [id, rp] of this.remotes) {
      if (rp.dead || rp.down || rp.waiting) continue;
      const mn = _mpMin.set(rp.pos.x - 0.42, rp.pos.y, rp.pos.z - 0.42), mx = _mpMax.set(rp.pos.x + 0.42, rp.pos.y + 2.5, rp.pos.z + 0.42);
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, mn, mx);
      if (t !== null && t < best) { best = t; hit = id; hp = new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t); }
    }
    if (!hit) return null;
    return { id: hit, dist: best, point: hp, head: hp.y >= this.remotes.get(hit).pos.y + 1.5 };
  }
  claimPlayerHit(id, dmg) { if (this.isHost) this.hostHurt(id, dmg, this.myId); else this.net.send('phit', { tid: id, dmg }); }
  meleeHitPlayers(origin, fwd, range, arcCos) { // co-op melee FF: ids of upright teammates inside the swing arc (always-on, like explosive Full-FF)
    const out = [];
    for (const [id, rp] of this.remotes) {
      if (rp.dead || rp.down || rp.waiting) continue;               // never melee a downed/dead/waiting ally (you revive them, not hit them)
      const dx = rp.pos.x - origin.x, dz = rp.pos.z - origin.z, dist = Math.hypot(dx, dz);
      if (dist > range + 0.5) continue;
      if ((dx / (dist || 1)) * fwd.x + (dz / (dist || 1)) * fwd.z < arcCos) continue;
      out.push(id);
    }
    return out;
  }
  // ---- player HP / knockdown / revive (host-authoritative) ----
  hostHurt(id, dmg, attacker) {
    if (!this.isHost) return;
    const s = this.pstate.get(id); if (!s || s.dead || s.waiting || s.down) return;
    if (s.armor > 0) { const t = Math.min(s.armor, dmg); s.armor -= t; dmg -= t; }
    s.hp -= dmg;
    if (s.hp <= 0) { s.hp = 0; s.downs++; if (s.downs >= 3) s.dead = true; else { s.down = true; s.downT = DOWN_SECONDS; } } // 2 downs survivable, the 3rd is permanent death
    this._broadcastPState(id);
    if (s.dead || s.down || s.waiting) this._checkGameOver();
  }
  hostRevive(tid, from = this.myId) {
    if (!this.isHost) return;
    const s = this.pstate.get(tid); if (!s || !s.down) return;
    const key = (from || 'host') + ':' + tid;
    if ((this._reviveHostProgress.get(key) || 0) < REVIVE_CLICKS) return;
    this._hostReviveProgress({ tid, clicks: 0 }, from);
    this._reviveHostProgress.delete(key);
    s.down = false; s.downT = 0; s.hp = Math.round(s.maxHp * 0.5); this._broadcastPState(tid);
  }
  _tickDowns() { if (!this.isHost) return; let changed = false; for (const [id, s] of this.pstate) { if (s.down) { s.downT -= 0.08; if (s.downT <= 0) { s.down = false; s.waiting = true; this._broadcastPState(id); changed = true; } else if (id === this.myId) this._bleedT = s.downT; else this.net.sendTo(id, 'bleed', { t: s.downT }); } } if (changed) this._checkGameOver(); } // push authoritative remaining time so the on-screen bleed bar matches the host clock
  // host-authoritative, persistent player burn DoT: the molotov pool only refreshes s.burnT, so this is the SINGLE place DoT is applied (and it lingers after leaving the pool)
  _tickBurn() { if (!this.isHost) return; for (const [id, s] of this.pstate) { if (s.burnT > 0) { s.burnT -= 0.08; this.hostHurt(id, PLAYER_BURN_DPS * 0.08); if (id === this.myId) this.game.player.burnT = PLAYER_BURN_DUR; else this.net.sendTo(id, 'burn', {}); } } }
  respawnAll() { if (!this.isHost) return; for (const [id, s] of this.pstate) { if (s.waiting && !s.dead) { s.waiting = false; s.hp = s.maxHp; s.armor = 0; this._broadcastPState(id); } } }
  _pStatePayload(id, s) { return { id, hp: s.hp, maxHp: s.maxHp, armor: s.armor, down: s.down, downT: s.downT, waiting: s.waiting, dead: s.dead, burn: s.burnT > 0 }; }
  _broadcastPState(id) { const s = this.pstate.get(id); if (!s) return; const d = this._pStatePayload(id, s); this._applyPState(d); this.net.send('pstate', d); }
  _applyPState(d) {
    const g = this.game;
    if (d.id === this.myId) {
      g.player.hp = d.hp; g.player.armor = d.armor;
      g.hud.setHealth(d.hp, d.maxHp); g.hud.setArmor(d.armor, g.player.armorMax);
      this._localDown = d.down; this._localDead = d.dead; this._localWaiting = d.waiting;
      this.frozen = d.down || d.dead || d.waiting;
      g.player.alive = !(d.dead || d.down || d.waiting); // pstate owns life-state so Player.hurt's `if(!this.alive)` guard stops re-killing a downed player
      if (d.down) this._bleedT = d.downT || DOWN_SECONDS; // start/refresh the local bleed-out bar countdown
      if (d.dead) { g.hud.bigMessage('YOU ARE OUT', 'spectating live squadmates'); if (!this._spilledLoot) { this._spilledLoot = true; g.inventory.spillAll(); } this.ensureSpectateTarget(); } // real death → spill your backpack for teammates
      else if (d.down) g.hud.bigMessage('DOWNED', 'a teammate can revive you');
      else if (d.waiting) g.hud.bigMessage('WAITING', 'respawn at the next wave');
      else { this.spectateTarget = null; this._incomingRevive = null; g.hud.setBleed(-1); }
    } else { const rp = this._remote(d.id); if (rp) { rp.setHP(d.hp, d.maxHp); rp.down = d.down; rp.waiting = d.waiting; rp.dead = d.dead; rp.setBurn(d.burn ? PLAYER_BURN_DUR : 0); } } // setBurn here is a backup to the xf bf flag (primary remote-flame driver)
  }
  nearestPlayer(x, z) {
    let best = Infinity, id = null, pos = null;
    const consider = (pid, px, pz, py) => { const s = this.pstate.get(pid); if (!s || s.down || s.dead || s.waiting) return; const dd = (px - x) ** 2 + (pz - z) ** 2; if (dd < best) { best = dd; id = pid; pos = { x: px, y: py, z: pz }; } };
    consider(this.myId, this.game.player.pos.x, this.game.player.pos.z, this.game.player.pos.y);
    for (const [rid, rp] of this.remotes) consider(rid, rp.pos.x, rp.pos.z, rp.pos.y);
    return id ? { id, pos, dist: Math.sqrt(best) } : null;
  }
  // ---- revive interaction ----
  _downedRemoteNear() { const p = this.game.player.pos; for (const [, rp] of this.remotes) if (rp.down && !rp.dead && Math.hypot(rp.pos.x - p.x, rp.pos.z - p.z) < 2.4) return rp; return null; }
  _downedRemoteAimed() {
    const cam = this.game.engine.camera, origin = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, -1);
    cam.updateMatrixWorld(); origin.setFromMatrixPosition(cam.matrixWorld); dir.applyQuaternion(cam.quaternion).normalize();
    let best = 0.9, hit = null;
    for (const [, rp] of this.remotes) {
      if (!rp.down || rp.dead || rp.waiting) continue;
      const target = _v3a.set(rp.pos.x, rp.pos.y + 0.45, rp.pos.z);
      const to = target.clone().sub(origin), dist = to.length();
      if (dist > 3.1 || dist < 0.2) continue;
      const dot = dir.dot(to.normalize());
      const side = Math.sqrt(Math.max(0, 1 - dot * dot)) * dist;
      if (dot > best && side < 0.9) { best = dot; hit = rp; }
    }
    return hit;
  }
  reviveTargetNear() { return this._reviveActive ? this._reviveRemote() : this._downedRemoteAimed(); }
  canStartRevive() { return !this.frozen && !!this._downedRemoteAimed(); }
  tryStartRevive() {
    if (!this.active || this.frozen) return false;
    if (this.game.player.mountedGun) return false;
    const rp = this._downedRemoteAimed();
    if (!rp) return false;
    this._reviveActive = true; this._reviveTargetId = rp.id; this._reviveClicks = 0;
    this._sendReviveProgress(rp.id, 0);
    this.game.hud.setBleed(0);
    if (this.game.audio && typeof this.game.audio.reloadIn === 'function') this.game.audio.reloadIn();
    return true;
  }
  _reviveRemote() {
    const rp = this._reviveTargetId ? this.remotes.get(this._reviveTargetId) : null;
    if (!rp || !rp.down || rp.dead || rp.waiting) return null;
    if (Math.hypot(rp.pos.x - this.game.player.pos.x, rp.pos.z - this.game.player.pos.z) > 3.2) return null;
    return rp;
  }
  _resetRevive(clearIncoming = false) {
    this._reviveActive = false; this._reviveTargetId = null; this._reviveClicks = 0;
    if (clearIncoming) this._incomingRevive = null;
  }
  // ---- Tab scoreboard ----
  _wireScoreboard() {
    const toggle = (down) => (e) => {
      if (e.code !== 'Tab' || !this.active) return; e.preventDefault();
      this._sbOpen = down; const el = document.getElementById('mp-scoreboard'); if (el) el.classList.toggle('show', down); if (down) this.renderScoreboard();
    };
    window.addEventListener('keydown', toggle(true)); window.addEventListener('keyup', toggle(false));
  }
  renderScoreboard() {
    const rows = document.getElementById('sb-rows'); if (!rows) return;
    const list = [...this.roster.entries()].map(([id, r]) => ({ id, name: r.name, skin: r.skin || 0, ping: r.ping, money: r.money }));
    list.sort((a, b) => (b.money || 0) - (a.money || 0));
    rows.innerHTML = list.map(e => {
      const sk = MP_SKINS[e.skin % MP_SKINS.length];
      const skinCss = '#' + sk.skin.toString(16).padStart(6, '0'), petalCss = '#' + sk.petal.toString(16).padStart(6, '0');
      const isHostRow = (e.id === 'host');
      const ping = isHostRow ? 'host' : (e.ping == null ? '\u2014' : e.ping + 'ms');
      const pc = isHostRow ? '#9fd0ff' : (e.ping == null ? '#888' : e.ping < 80 ? '#7fd06a' : e.ping < 180 ? '#ffcf5c' : '#e8533a');
      const money = e.money == null ? '' : '$' + e.money;
      const you = e.id === this.myId ? ' <span style="opacity:.55;font-weight:400">(you)</span>' : '';
      return '<div class="sb-row"><span class="sb-skin" style="background:' + skinCss + ';border-color:' + petalCss + '"></span><span class="sb-name">' + mpEscape(e.name) + you + '</span><span class="sb-money">' + money + '</span><span class="sb-ping" style="color:' + pc + '">' + ping + '</span></div>';
    }).join('');
  }
  _sendWorldTo(pid) {
    this.net.sendTo(pid, 'start', { mode: this.game.mode || 'purge' });
    const snap = [];
    for (const e of this.game.enemies.active) if (e.alive) {
      this.net.sendTo(pid, 'espawn', { id: e.id, type: e.type, gk: e.geoKey, cb: e.col.body, vr: e.def.variant, nm: e.name, sc: e.scale, x: +e.pos.x.toFixed(2), y: +e.pos.y.toFixed(2), z: +e.pos.z.toFixed(2), hpf: Math.round((e.hp / e.maxHp) * 100) });
      snap.push({ id: e.id, x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2), ry: +e.mesh.rotation.y.toFixed(2), hp: Math.round((e.hp / e.maxHp) * 100) });
    }
    if (snap.length) this.net.sendTo(pid, 'esnap', snap);                                   // immediate exact positions/HP (don't make the joiner wait ~80ms)
    for (const s of this.game.build.structures) this.net.sendTo(pid, 'struct', { id: s.id, kind: s.kind, x: s.pos.x, z: s.pos.z, yaw: s.yaw }); // late-join: existing fortifications
    for (const s of this.game.build.structures) if (s.kind === 'radio' && s.on) this.net.sendTo(pid, 'radioset', { id: s.id, on: true, station: s.station }); // late-join: tune newcomers into playing radios
    if (this.game.gramophone) for (const p of this.game.gramophone.props) if (p.on) this.net.sendTo(pid, 'gramoset', { id: p.id, on: true, songIdx: p.songIdx }); // late-join: start newcomers' playing gramophones
    if (this.game.world._slideGate) this.net.sendTo(pid, 'gateset', { open: !!this.game.world._slideGate.open }); // late-join: current works-gate state
    if (this.game.world._doors) for (const dr of this.game.world._doors) this.net.sendTo(pid, 'doorset', { id: dr.id, open: !!dr.open }); // late-join: current bunker гермодверь states
    for (const pu of this.game.loot.pickups) if (pu.id != null) this.net.sendTo(pid, 'pickup', { id: pu.id, kind: pu.kind, x: pu.mesh.position.x, z: pu.mesh.position.z, value: pu.value, life: pu.life }); // late-join: existing shared ground pickups
    let boss = null; for (const e of this.game.enemies.active) { if (!e.alive) continue; if (e.def.boss) { boss = e; break; } if (e.isElite && !boss) boss = e; }
    if (boss) { const frac = boss.hp / boss.maxHp; this.net.sendTo(pid, 'boss', { frac, name: boss.name, pip: -1 }); }   // late-join: current boss bar
    this.net.sendTo(pid, 'wave', { n: this.game.waves.wave, label: 'WAVE ' + this.game.waves.wave, sub: 'co-op — hold the line' });
    for (const [id, s] of this.pstate) this.net.sendTo(pid, 'pstate', this._pStatePayload(id, s)); // late-join: current down/dead/waiting states
    this.sendWorldTime(pid); // late-join: current day/night + blood-moon state
    // ── demo (?map=demo) host-auth destruction/fire — replay everything the joiner missed ──
    const b = this.game.world.demoBuilding;
    if (b && typeof b.netSnapshot === 'function') { const snap = b.netSnapshot(); if (snap.parts.length || snap.holes.length) this.net.sendTo(pid, 'bdestroy', snap); } // existing breaches / shattered panes / APFSDS holes
    if (this.game.forest && typeof this.game.forest.netSnapshot === 'function') for (const fx of this.game.forest.netSnapshot()) this.net.sendTo(pid, 'forestfx', fx); // felled / charred trees + consumed grass
    if (this.game.fire && typeof this.game.fire.netSnapshot === 'function') for (const ig of this.game.fire.netSnapshot()) this.net.sendTo(pid, 'fireignite', ig); // currently-burning parts
  }
  worldTimeState() {
    const g = this.game;
    return { mode: g.mode || 'purge', active: true, total: g._worldClock.total, n: g.dayNight.nightCount, blood: g.dayNight.bloodMoon };
  }
  sendWorldTime(pid = null) {
    if (!this.active || !this.isHost) return;
    const d = this.worldTimeState();
    if (pid) this.net.sendTo(pid, 'night', d);
    else this.net.send('night', d);
  }
  // client → host: ask the host (the time authority) to set the clock to a minute-of-day. Host applies + broadcasts.
  requestSetTime(minuteOfDay) { if (this.active && !this.isHost) this.net.send('timereq', { min: minuteOfDay }); }
  _hostGone() { if (!this.active) return; this.active = false; try { this.game.hud.bigMessage('HOST LEFT', 'returning to menu…'); } catch (e) {} this.leave(); this.game.toMenu(); }
  _checkGameOver() {
    if (!this.isHost || !this.active) return;
    let any = false, allOut = true;
    for (const [, s] of this.pstate) { any = true; if (!(s.dead || s.waiting)) allOut = false; }
    if (any && allOut) {
      const reason = 'Squad wiped. Ready up and start again.';
      this.net.send('gameover', { reason });
      this.game._mpGameOver(reason);
    }
  }
  feed(who, what) { this.game.hud.kill(who + ' \u27a4 ' + what); this.net.broadcast('feed', { who, what }); }
  blocksWeaponUse() { return this._reviveActive || !!this._downedRemoteAimed(); }
  revivePrompt(rp) {
    if (this._reviveActive) return `CPR on <b>${rp.name}</b>: ${this._reviveClicks}/${REVIVE_CLICKS} clicks`;
    return `Press <b>E</b> to start CPR on <b>${rp.name}</b>`;
  }
  _sendReviveProgress(tid, clicks) {
    const d = { tid, clicks, total: REVIVE_CLICKS };
    if (this.isHost) this._hostReviveProgress(d, this.myId);
    else this.net.send('reviveprog', d);
  }
  _hostReviveProgress(d, from) {
    if (!d || typeof d.tid !== 'string') return;
    const clicks = clamp(Number(d.clicks) || 0, 0, REVIVE_CLICKS), total = REVIVE_CLICKS;
    const s = this.pstate.get(d.tid);
    if (!s || !s.down || s.dead || s.waiting) return;
    this._reviveHostProgress.set((from || 'host') + ':' + d.tid, clicks);
    const payload = { tid: d.tid, rid: from || 'host', clicks, total };
    if (d.tid === this.myId) this._applyReviveProgress(payload);
    else this.net.sendTo(d.tid, 'reviveprog', payload);
  }
  _applyReviveProgress(d) {
    if (!d || d.tid !== this.myId) return;
    this._incomingRevive = { clicks: clamp(Number(d.clicks) || 0, 0, Number(d.total) || REVIVE_CLICKS), total: Number(d.total) || REVIVE_CLICKS, until: performance.now() + 1200 };
  }
  _updateRevive(dt) {
    if (!this.active || this.frozen) { if (this._reviveActive) this._sendReviveProgress(this._reviveTargetId, 0); this._resetRevive(); return; }
    if (!this._reviveActive) return;
    const rp = this._reviveRemote();
    if (!rp) { this._sendReviveProgress(this._reviveTargetId, 0); this._resetRevive(); this.game.hud.setBleed(-1); return; }
    if (this.game.input.buttonsPressed[0]) {
      this._reviveClicks = Math.min(REVIVE_CLICKS, this._reviveClicks + 1);
      this._sendReviveProgress(rp.id, this._reviveClicks);
      this.game.hud.setBleed(this._reviveClicks / REVIVE_CLICKS);
      if (this.game.audio && typeof this.game.audio.reloadIn === 'function') this.game.audio.reloadIn();
    }
    this.game.hud.setInteract(this.revivePrompt(rp));
    if (this._reviveClicks >= REVIVE_CLICKS) {
      this._sendReviveProgress(rp.id, REVIVE_CLICKS);
      this._resetRevive(); this.game.hud.setBleed(-1);
      if (this.isHost) this.hostRevive(rp.id); else this.net.send('revive', { tid: rp.id });
    }
  }
}
