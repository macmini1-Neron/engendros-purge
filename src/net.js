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
const CONNECT_TIMEOUT_MS = 14000;
const PEER_OPTIONS = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
  debug: 2,
};

function peerOptions() {
  const opts = { ...PEER_OPTIONS };
  try {
    const raw = window.ENGENDROS_ICE_SERVERS || localStorage.getItem('engendros_ice_servers');
    const iceServers = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : null);
    if (Array.isArray(iceServers) && iceServers.length) opts.config = { sdpSemantics: 'unified-plan', iceServers };
  } catch (e) {}
  return opts;
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
    // callbacks (assign directly)
    this.onPeerOpen = null;       // (roomCode)        host/peer is registered with the broker
    this.onConnect = null;        // (peerId)          a data connection opened
    this.onDisconnect = null;     // (peerId)          a data connection closed
    this.onError = null;          // (errCode, err)    fatal-ish error
  }

  get peerCount() { return this.conns.size; }

  _mkPeer(id) {
    if (!window.Peer) { throw new Error('PeerJS not loaded (no internet?)'); }
    const opts = peerOptions();
    return id ? new window.Peer(id, opts) : new window.Peer(opts);
  }

  _clearConnectTimer() {
    if (this._connectTimer) clearTimeout(this._connectTimer);
    this._connectTimer = null;
  }

  _watchConnect(conn) {
    this._clearConnectTimer();
    this._connectTimer = setTimeout(() => {
      if (conn && !conn.open && !this.connected) {
        try { conn.close(); } catch (e) {}
        this.onError && this.onError('connect-timeout', { peer: conn.peer, room: this.room });
      }
    }, CONNECT_TIMEOUT_MS);
  }

  // HOST a room under `code` (the broker id becomes ID_PREFIX+code).
  host(code) {
    this.isHost = true;
    this.room = code;
    try { this.peer = this._mkPeer(ID_PREFIX + code); }
    catch (e) { this.onError && this.onError('no-peerjs', e); return; }
    this.peer.on('open', (pid) => { this.selfId = pid; this.connected = true; this.onPeerOpen && this.onPeerOpen(code); });
    this.peer.on('connection', (conn) => this._accept(conn));
    this.peer.on('error', (e) => this.onError && this.onError(e.type || 'error', e));
  }

  // JOIN a room by `code`.
  join(code) {
    this.isHost = false;
    this.room = code;
    try { this.peer = this._mkPeer(null); }
    catch (e) { this.onError && this.onError('no-peerjs', e); return; }
    this.peer.on('open', (pid) => {
      this.selfId = pid;
      this.onPeerOpen && this.onPeerOpen(code);
      const conn = this.peer.connect(ID_PREFIX + code, { reliable: true });
      this._watchConnect(conn);
      this._accept(conn);
    });
    this.peer.on('error', (e) => this.onError && this.onError(e.type || 'error', e));
  }

  _accept(conn) {
    conn.on('open', () => {
      this._clearConnectTimer();
      this.conns.set(conn.peer, conn);
      this.connected = true;
      this.onConnect && this.onConnect(conn.peer);
    });
    conn.on('data', (msg) => { try { this._recv(msg, conn.peer); } catch (e) { if (typeof console !== 'undefined') console.warn('[net] handler threw for', msg && msg.t, e); } });
    conn.on('close', () => { this.conns.delete(conn.peer); this.onDisconnect && this.onDisconnect(conn.peer); });
    conn.on('error', (e) => {
      if (!conn.open && !this.connected) {
        this._clearConnectTimer();
        this.onError && this.onError((e && e.type) || 'connect-failed', e);
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
    this.conns.clear();
    this.peer = null; this.connected = false; this.isHost = false; this.room = null; this.selfId = null;
  }
}

// A short, human-shareable room code (avoids ambiguous chars).
export function makeRoomCode() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}
