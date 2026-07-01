// net.js — thin PeerJS (WebRTC) transport for ENGENDROS PURGE co-op.
// Uses the FREE public PeerJS cloud broker for signalling (no server, no Hamachi).
// Star topology: one HOST (authority) + up to N clients. The host relays
// "broadcast" messages between clients. PeerJS itself is loaded via a <script>
// tag in index.html (sets window.Peer); we only touch window.Peer here.
//
// Message envelope on the wire: { t: type, d: data, _r?: true (relay) }.
//   send(type,data)      → client: to host ; host: to all clients
//   broadcast(type,data) → reaches EVERYONE (host relays + sees it too)
// Register handlers with on(type, fn(data, fromId)).

const ID_PREFIX = 'engpurgv1-'; // namespace room codes on the shared public broker
const CONNECT_TIMEOUT_MS = 45000;
const ICE_SAMPLE_MS = 1200;
const ICE_WATCH_TICKS = Math.ceil(CONNECT_TIMEOUT_MS / ICE_SAMPLE_MS) + 3;
const PEER_OPTIONS = { debug: 1 };
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function shortText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.slice(0, 220);
  if (v.message && typeof v.message === 'string') return v.message.slice(0, 220);
  try { return JSON.stringify(v).slice(0, 220); } catch (e) { return String(v).slice(0, 220); }
}

function errorInfo(e, fallbackCode = 'error') {
  return {
    code: (e && (e.type || e.code)) || fallbackCode,
    name: (e && e.name) || '',
    message: shortText((e && e.message) || e),
    details: shortText(e && e.details),
  };
}

function parseIceServers(raw) {
  if (Array.isArray(raw) && raw.length) return raw;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch (e) {
    return null;
  }
}

async function peerSetup() {
  const opts = { ...PEER_OPTIONS };
  let mode = 'auto-default';
  let forceRelay = !!(typeof window !== 'undefined' && window.ENGENDROS_FORCE_RELAY);
  forceRelay = forceRelay || storageGet('engendros_force_relay') === '1';
  const makeConfig = (iceServers) => ({
    sdpSemantics: 'unified-plan',
    iceServers,
    ...(forceRelay ? { iceTransportPolicy: 'relay' } : {}),
  });

  const windowIce = parseIceServers(typeof window !== 'undefined' && window.ENGENDROS_ICE_SERVERS);
  if (windowIce) {
    opts.config = makeConfig(windowIce);
    return { opts, mode: forceRelay ? 'custom-force-relay' : 'custom-ice' };
  }

  const storedIce = parseIceServers(storageGet('engendros_ice_servers'));
  if (storedIce) {
    opts.config = makeConfig(storedIce);
    return { opts, mode: forceRelay ? 'custom-force-relay' : 'custom-ice' };
  }

  opts.config = makeConfig(DEFAULT_ICE_SERVERS);
  mode = forceRelay ? 'force-relay' : 'auto-turn';
  return { opts, mode };
}

// Shared ICE config for the voice mesh (voice.js): the *exact* same STUN/TURN + force-relay
// policy the data plane uses, so voice NAT/TURN traversal matches data connectivity. Returns a
// plain RTCConfiguration for `new RTCPeerConnection(await iceConfig())`.
export async function iceConfig() {
  try {
    const setup = await peerSetup();
    if (setup && setup.opts && setup.opts.config) return setup.opts.config;
  } catch (e) {}
  return { iceServers: DEFAULT_ICE_SERVERS };
}

function peerConnectionFor(conn) {
  if (!conn) return null;
  const direct = [conn.peerConnection, conn._peerConnection, conn.pc, conn._pc];
  for (const pc of direct) if (pc && typeof pc.getStats === 'function') return pc;
  const nested = [conn.negotiator, conn._negotiator, conn.provider, conn._provider];
  for (const obj of nested) {
    if (!obj || typeof obj !== 'object') continue;
    for (const k of ['peerConnection', '_peerConnection', 'pc', '_pc']) {
      const pc = obj[k];
      if (pc && typeof pc.getStats === 'function') return pc;
    }
  }
  if (typeof RTCPeerConnection !== 'undefined') {
    for (const v of Object.values(conn)) if (v instanceof RTCPeerConnection) return v;
  }
  return null;
}

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.connected = false;       // at least one live connection (or host peer open)
    this.room = null;             // the short room code
    this.selfId = null;           // our PeerJS id
    this.conns = new Map();       // remotePeerId -> DataConnection
    this.handlers = {};           // type -> fn(data, fromId)
    this.lastRecv = 0;            // perf.now() of the last received message (heartbeat)
    this._connectTimer = null;
    this._iceWatches = new Map();
    this._iceMode = 'auto-default';
    // callbacks (assign directly)
    this.onPeerOpen = null;       // (roomCode)        host/peer is registered with the broker
    this.onConnect = null;        // (peerId)          a data connection opened
    this.onDisconnect = null;     // (peerId)          a data connection closed
    this.onError = null;          // (errCode, err)    fatal-ish error
    this.onDiag = null;           // ({phase,...})     connection diagnostics for the lobby
  }

  get peerCount() { return this.conns.size; }

  async _mkPeer(id) {
    if (!window.Peer) { throw new Error('PeerJS not loaded (no internet?)'); }
    const setup = await peerSetup();
    this._iceMode = setup.mode;
    const opts = setup.opts;
    return id ? new window.Peer(id, opts) : new window.Peer(opts);
  }

  _clearConnectTimer() {
    if (this._connectTimer) clearTimeout(this._connectTimer);
    this._connectTimer = null;
  }

  _diag(d) {
    const payload = { role: this.isHost ? 'host' : 'join', room: this.room, iceMode: this._iceMode, ...d };
    if (payload.phase === 'error' && typeof console !== 'undefined') console.warn('[net]', payload);
    this.onDiag && this.onDiag(payload);
  }

  _clearIceWatch(peerId) {
    const w = this._iceWatches.get(peerId);
    if (!w) return;
    if (w.timer) clearInterval(w.timer);
    if (w.pc && w.onChange) {
      try { w.pc.removeEventListener('iceconnectionstatechange', w.onChange); } catch (e) {}
      try { w.pc.removeEventListener('connectionstatechange', w.onChange); } catch (e) {}
    }
    this._iceWatches.delete(peerId);
  }

  async _collectIce(conn) {
    const pc = peerConnectionFor(conn);
    if (!pc) { this._diag({ phase: 'ice', peerId: conn && conn.peer, available: false }); return; }
    const types = new Set();
    let selectedType = '';
    let remoteType = '';
    try {
      const stats = await pc.getStats();
      const byId = new Map();
      stats.forEach((r) => {
        if (r.type === 'local-candidate' || r.type === 'remote-candidate') {
          byId.set(r.id, r);
          if (r.candidateType) types.add(r.candidateType);
        }
      });
      stats.forEach((r) => {
        if (r.type !== 'candidate-pair') return;
        if (!(r.selected || r.nominated || r.state === 'succeeded')) return;
        const local = byId.get(r.localCandidateId);
        const remote = byId.get(r.remoteCandidateId);
        if (local && local.candidateType) selectedType = local.candidateType;
        if (remote && remote.candidateType) remoteType = remote.candidateType;
      });
    } catch (e) {}
    this._diag({
      phase: 'ice',
      peerId: conn.peer,
      available: true,
      candidateTypes: [...types],
      selectedType,
      remoteType,
      iceState: pc.iceConnectionState || '',
      connectionState: pc.connectionState || '',
    });
  }

  _watchIce(conn) {
    if (!conn || !conn.peer) return;
    this._clearIceWatch(conn.peer);
    const pc = peerConnectionFor(conn);
    let ticks = 0;
    let failed = false;
    const reportFailure = () => {
      if (failed) return;
      failed = true;
      const code = (pc && pc.iceConnectionState === 'failed') ? 'ice-failed' : 'connection-failed';
      const message = 'ICE failed before the WebRTC data channel opened.';
      const info = {
        phase: 'error',
        code,
        peerId: conn.peer,
        message,
        iceState: (pc && pc.iceConnectionState) || '',
        connectionState: (pc && pc.connectionState) || '',
      };
      this._diag(info);
      if (!conn.open) {
        this._clearConnectTimer();
        this.onError && this.onError(code, info);
      }
    };
    const tick = () => {
      ticks++;
      this._collectIce(conn);
      if (pc && !conn.open && (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed')) reportFailure();
      const w = this._iceWatches.get(conn.peer);
      if (w && ticks >= ICE_WATCH_TICKS) this._clearIceWatch(conn.peer);
    };
    const timer = setInterval(tick, ICE_SAMPLE_MS);
    const onChange = () => tick();
    if (pc && pc.addEventListener) {
      try { pc.addEventListener('iceconnectionstatechange', onChange); } catch (e) {}
      try { pc.addEventListener('connectionstatechange', onChange); } catch (e) {}
    }
    this._iceWatches.set(conn.peer, { timer, pc, onChange });
    setTimeout(tick, 50);
  }

  _watchConnect(conn) {
    this._clearConnectTimer();
    this._connectTimer = setTimeout(() => {
      if (conn && !conn.open) {
        try { conn.close(); } catch (e) {}
        const info = { phase: 'error', code: 'connect-timeout', peerId: conn.peer, message: 'Timed out before the WebRTC data channel opened.' };
        this._diag(info);
        this.onError && this.onError('connect-timeout', { peer: conn.peer, room: this.room, message: info.message });
      }
    }, CONNECT_TIMEOUT_MS);
  }

  // HOST a room under `code` (the broker id becomes ID_PREFIX+code).
  async host(code) {
    this.isHost = true;
    this.room = code;
    try { this.peer = await this._mkPeer(ID_PREFIX + code); }
    catch (e) { this._diag({ phase: 'error', ...errorInfo(e, 'no-peerjs') }); this.onError && this.onError('no-peerjs', e); return; }
    if (!this.peer || !this.isHost || this.room !== code) { try { this.peer && this.peer.destroy(); } catch (e) {} this.peer = null; return; }
    this.peer.on('open', (pid) => { this.selfId = pid; this.connected = true; this._diag({ phase: 'broker', peerId: pid }); this.onPeerOpen && this.onPeerOpen(code); });
    this.peer.on('connection', (conn) => this._accept(conn));
    this.peer.on('error', (e) => { const info = errorInfo(e); this._diag({ phase: 'error', ...info }); this.onError && this.onError(info.code, e); });
  }

  // JOIN a room by `code`.
  async join(code) {
    this.isHost = false;
    this.room = code;
    try { this.peer = await this._mkPeer(null); }
    catch (e) { this._diag({ phase: 'error', ...errorInfo(e, 'no-peerjs') }); this.onError && this.onError('no-peerjs', e); return; }
    if (!this.peer || this.isHost || this.room !== code) { try { this.peer && this.peer.destroy(); } catch (e) {} this.peer = null; return; }
    this.peer.on('open', (pid) => {
      this.selfId = pid;
      this._diag({ phase: 'broker', peerId: pid });
      this.onPeerOpen && this.onPeerOpen(code);
      const conn = this.peer.connect(ID_PREFIX + code, { reliable: true });
      this._watchConnect(conn);
      this._accept(conn);
    });
    this.peer.on('error', (e) => { const info = errorInfo(e); this._diag({ phase: 'error', ...info }); this.onError && this.onError(info.code, e); });
  }

  _accept(conn) {
    this._watchIce(conn);
    conn.on('open', () => {
      this._clearConnectTimer();
      this.conns.set(conn.peer, conn);
      this.connected = true;
      this._diag({ phase: 'data', peerId: conn.peer });
      this._collectIce(conn);
      this.onConnect && this.onConnect(conn.peer);
    });
    conn.on('data', (msg) => { try { this._recv(msg, conn.peer); } catch (e) { if (typeof console !== 'undefined') console.warn('[net] handler threw for', msg && msg.t, e); } });
    conn.on('close', () => { this._clearIceWatch(conn.peer); this.conns.delete(conn.peer); this._diag({ phase: 'closed', peerId: conn.peer }); this.onDisconnect && this.onDisconnect(conn.peer); });
    conn.on('error', (e) => {
      if (!conn.open) {
        this._clearConnectTimer();
        const info = errorInfo(e, 'connect-failed');
        this._diag({ phase: 'error', ...info, peerId: conn.peer });
        this.onError && this.onError(info.code, e);
      }
    });
  }

  _recv(msg, fromId) {
    if (!msg || typeof msg.t !== 'string') return;
    this.lastRecv = (typeof performance !== 'undefined') ? performance.now() : 0;
    // host relays "broadcast" messages on to the OTHER clients
    if (this.isHost && msg._r) {
      for (const [pid, c] of this.conns) if (pid !== fromId && c.open) c.send(msg);
    }
    const h = this.handlers[msg.t];
    if (h) h(msg.d, fromId);
  }

  on(type, fn) { this.handlers[type] = fn; }

  // client → host ; host → all clients
  send(type, data) {
    const msg = { t: type, d: data };
    if (this.isHost) { for (const [, c] of this.conns) if (c.open) c.send(msg); }
    else { const c = this.conns.values().next().value; if (c && c.open) c.send(msg); }
  }

  // reaches everyone (client sends to host, host relays to the rest + handles locally)
  broadcast(type, data) {
    const msg = { t: type, d: data, _r: true };
    if (this.isHost) { for (const [, c] of this.conns) if (c.open) c.send(msg); }
    else { const c = this.conns.values().next().value; if (c && c.open) c.send(msg); }
  }

  // send only to one specific peer (host use)
  sendTo(peerId, type, data) {
    const c = this.conns.get(peerId);
    if (c && c.open) c.send({ t: type, d: data });
  }

  close() {
    try { for (const [, c] of this.conns) c.close(); } catch (e) {}
    try { this.peer && this.peer.destroy(); } catch (e) {}
    this._clearConnectTimer();
    for (const peerId of [...this._iceWatches.keys()]) this._clearIceWatch(peerId);
    this.conns.clear();
    this.peer = null; this.connected = false; this.isHost = false; this.room = null; this.selfId = null;
  }
}

function lanWsUrl() {
  const explicit = (typeof window !== 'undefined' && window.ENGENDROS_LAN_WS) || storageGet('engendros_lan_ws');
  if (explicit) return explicit;
  const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss:' : 'ws:';
  const host = (typeof location !== 'undefined' && location.hostname) ? location.hostname : 'localhost';
  return `${proto}//${host}:8787`;
}

function lanPeer(peerId, onClose) {
  return {
    peer: peerId,
    open: true,
    close() { this.open = false; onClose && onClose(peerId); },
  };
}

export class LanNet {
  constructor() {
    this.ws = null;
    this.isHost = false;
    this.connected = false;
    this.room = null;
    this.selfId = null;
    this.conns = new Map();
    this.handlers = {};
    this.lastRecv = 0;
    this._iceMode = 'lan-ws';
    this.onPeerOpen = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
    this.onDiag = null;
  }

  get peerCount() { return this.conns.size; }

  _diag(d) {
    this.onDiag && this.onDiag({ role: this.isHost ? 'host' : 'join', room: this.room, iceMode: this._iceMode, ...d });
  }

  _connect(kind, code) {
    this.room = code;
    const url = lanWsUrl();
    let ws;
    try { ws = new WebSocket(url); }
    catch (e) { this._diag({ phase: 'error', code: 'lan-unavailable', message: shortText(e) }); this.onError && this.onError('lan-unavailable', e); return; }
    this.ws = ws;
    ws.onopen = () => this._sendRaw({ lan: kind, room: code });
    ws.onmessage = (ev) => {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      this._handle(msg);
    };
    ws.onerror = () => {
      const info = { phase: 'error', code: 'socket-error', message: 'LAN relay is not reachable. Start scripts/lan-server.js and open the game through the Hamachi IP.' };
      this._diag(info); this.onError && this.onError(info.code, info);
    };
    ws.onclose = () => {
      const wasConnected = this.connected;
      this.connected = false;
      this._diag({ phase: 'closed' });
      if (wasConnected) {
        for (const peerId of [...this.conns.keys()]) this._dropPeer(peerId);
      }
    };
  }

  _sendRaw(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  _addPeer(peerId) {
    if (!peerId || this.conns.has(peerId)) return;
    this.conns.set(peerId, lanPeer(peerId, (id) => this._sendRaw({ lan: 'drop', id })));
    this.connected = true;
    this._diag({ phase: 'data', peerId });
    this.onConnect && this.onConnect(peerId);
  }

  _dropPeer(peerId) {
    const c = this.conns.get(peerId);
    if (c) c.open = false;
    this.conns.delete(peerId);
    this._diag({ phase: 'closed', peerId });
    this.onDisconnect && this.onDisconnect(peerId);
  }

  _handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.lan === 'open') {
      this.selfId = msg.id || (this.isHost ? 'host' : '');
      this.connected = true;
      this._diag({ phase: 'broker', peerId: this.selfId, message: 'LAN relay connected' });
      this.onPeerOpen && this.onPeerOpen(this.room);
      if (!this.isHost) this._addPeer('host');
      return;
    }
    if (msg.lan === 'peerJoin' && this.isHost) { this._addPeer(msg.id); return; }
    if (msg.lan === 'peerLeft') { this._dropPeer(msg.id); return; }
    if (msg.lan === 'roomClosed') { this.onError && this.onError('socket-closed', msg); this.close(); return; }
    if (msg.lan === 'closed') { this.close(); return; }
    if (msg.lan === 'error') {
      const code = msg.code || 'socket-error';
      this._diag({ phase: 'error', code, message: msg.message || '' });
      this.onError && this.onError(code, msg);
      return;
    }
    if (msg.lan === 'msg' && typeof msg.t === 'string') {
      this.lastRecv = (typeof performance !== 'undefined') ? performance.now() : 0;
      const h = this.handlers[msg.t];
      if (h) h(msg.d, msg.from);
    }
  }

  host(code) {
    this.isHost = true;
    this.selfId = 'host';
    this._connect('host', code);
  }

  join(code) {
    this.isHost = false;
    this._connect('join', code);
  }

  on(type, fn) { this.handlers[type] = fn; }

  send(type, data) {
    this._sendRaw({ lan: 'msg', to: this.isHost ? '*' : 'host', t: type, d: data });
  }

  broadcast(type, data) {
    this._sendRaw({ lan: 'msg', to: '*', t: type, d: data, _r: true });
  }

  sendTo(peerId, type, data) {
    this._sendRaw({ lan: 'msg', to: peerId, t: type, d: data });
  }

  close() {
    try { this.ws && this.ws.close(); } catch (e) {}
    for (const [, c] of this.conns) c.open = false;
    this.conns.clear();
    this.ws = null; this.connected = false; this.isHost = false; this.room = null; this.selfId = null;
  }
}

// A short, human-shareable room code (avoids ambiguous chars).
export function makeRoomCode() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}
