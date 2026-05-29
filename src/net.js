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

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.connected = false;       // at least one live connection (or host peer open)
    this.room = null;             // the short room code
    this.selfId = null;           // our PeerJS id
    this.conns = new Map();       // remotePeerId -> DataConnection
    this.handlers = {};           // type -> fn(data, fromId)
    // callbacks (assign directly)
    this.onPeerOpen = null;       // (roomCode)        host/peer is registered with the broker
    this.onConnect = null;        // (peerId)          a data connection opened
    this.onDisconnect = null;     // (peerId)          a data connection closed
    this.onError = null;          // (errCode, err)    fatal-ish error
  }

  get peerCount() { return this.conns.size; }

  _mkPeer(id) {
    if (!window.Peer) { throw new Error('PeerJS not loaded (no internet?)'); }
    return id ? new window.Peer(id, { debug: 1 }) : new window.Peer({ debug: 1 });
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
      this._accept(conn);
    });
    this.peer.on('error', (e) => this.onError && this.onError(e.type || 'error', e));
  }

  _accept(conn) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      this.connected = true;
      this.onConnect && this.onConnect(conn.peer);
    });
    conn.on('data', (msg) => { try { this._recv(msg, conn.peer); } catch (e) { /* swallow per-message errors */ } });
    conn.on('close', () => { this.conns.delete(conn.peer); this.onDisconnect && this.onDisconnect(conn.peer); });
    conn.on('error', () => { /* connection-level errors are non-fatal */ });
  }

  _recv(msg, fromId) {
    if (!msg || typeof msg.t !== 'string') return;
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
