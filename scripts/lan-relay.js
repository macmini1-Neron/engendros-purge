const crypto = require('crypto');
const http = require('http');

function createLanRelay({ path = '/', logger = console } = {}) {
  const rooms = new Map();
  let nextClientId = 1;

  function roomFor(code) {
    const key = String(code || '').toUpperCase();
    if (!rooms.has(key)) rooms.set(key, { host: null, clients: new Map() });
    return rooms.get(key);
  }

  function removeClient(c) {
    if (!c.room) return;
    const room = rooms.get(c.room);
    if (!room) return;
    if (room.host === c) {
      for (const [, peer] of room.clients) peer.send({ lan: 'roomClosed' });
      rooms.delete(c.room);
      return;
    }
    room.clients.delete(c.id);
    if (room.host) room.host.send({ lan: 'peerLeft', id: c.id });
    if (!room.host && room.clients.size === 0) rooms.delete(c.room);
  }

  function relay(c, msg) {
    const room = c.room && rooms.get(c.room);
    if (!room || !room.host) return c.send({ lan: 'error', code: 'peer-unavailable' });
    const out = { lan: 'msg', from: c.id, t: msg.t, d: msg.d, _r: !!msg._r };
    if (c.isHost) {
      if (msg.to && msg.to !== '*') {
        const peer = room.clients.get(msg.to);
        if (peer) peer.send(out);
        return;
      }
      for (const [, peer] of room.clients) peer.send(out);
      return;
    }
    if (msg.to === '*') {
      room.host.send(out);
      for (const [id, peer] of room.clients) if (id !== c.id) peer.send(out);
      return;
    }
    room.host.send(out);
  }

  function handle(c, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.lan === 'host') {
      const code = String(msg.room || '').toUpperCase();
      const room = roomFor(code);
      if (room.host && room.host !== c) return c.send({ lan: 'error', code: 'unavailable-id' });
      c.id = 'host'; c.room = code; c.isHost = true; room.host = c;
      c.send({ lan: 'open', id: 'host', room: code });
      return;
    }
    if (msg.lan === 'join') {
      const code = String(msg.room || '').toUpperCase();
      const room = rooms.get(code);
      if (!room || !room.host) return c.send({ lan: 'error', code: 'peer-unavailable' });
      c.id = `lan-${nextClientId++}`; c.room = code; c.isHost = false; room.clients.set(c.id, c);
      c.send({ lan: 'open', id: c.id, room: code });
      room.host.send({ lan: 'peerJoin', id: c.id });
      return;
    }
    if (msg.lan === 'msg' && typeof msg.t === 'string') relay(c, msg);
    if (msg.lan === 'drop' && c.isHost && msg.id) {
      const room = c.room && rooms.get(c.room);
      const peer = room && room.clients.get(msg.id);
      if (peer) peer.close();
    }
  }

  function encodeFrame(text) {
    const payload = Buffer.from(text);
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
    else if (payload.length < 65536) {
      header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    return Buffer.concat([header, payload]);
  }

  function decodeFrames(state, chunk, onText) {
    state.buf = Buffer.concat([state.buf, chunk]);
    while (state.buf.length >= 2) {
      const b0 = state.buf[0], b1 = state.buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (state.buf.length < off + 2) return; len = state.buf.readUInt16BE(off); off += 2; }
      else if (len === 127) { if (state.buf.length < off + 8) return; len = Number(state.buf.readBigUInt64BE(off)); off += 8; }
      const maskOff = off;
      if (masked) off += 4;
      if (state.buf.length < off + len) return;
      const data = Buffer.from(state.buf.subarray(off, off + len));
      if (masked) {
        const mask = state.buf.subarray(maskOff, maskOff + 4);
        for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      }
      state.buf = state.buf.subarray(off + len);
      if (opcode === 0x8) return state.close();
      if (opcode === 0x9) state.socket.write(Buffer.from([0x8a, 0x00]));
      if (opcode === 0x1) onText(data.toString('utf8'));
    }
  }

  function matchesPath(req) {
    if (!path || path === '*') return true;
    try {
      const u = new URL(req.url || '/', 'http://localhost');
      return u.pathname === path;
    } catch (e) {
      return path === '/';
    }
  }

  function handleUpgrade(req, socket) {
    if (!matchesPath(req)) return false;
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return true; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'));

    const c = {
      id: '',
      room: '',
      isHost: false,
      buf: Buffer.alloc(0),
      socket,
      send(obj) { if (!socket.destroyed) socket.write(encodeFrame(JSON.stringify(obj))); },
      close() { try { socket.end(encodeFrame(JSON.stringify({ lan: 'closed' }))); } catch (e) {} },
    };
    socket.on('data', (chunk) => decodeFrames(c, chunk, (text) => {
      try { handle(c, JSON.parse(text)); } catch (e) { c.send({ lan: 'error', code: 'bad-message' }); }
    }));
    socket.on('close', () => removeClient(c));
    socket.on('error', () => removeClient(c));
    return true;
  }

  function attach(server) {
    server.on('upgrade', (req, socket) => {
      if (!handleUpgrade(req, socket)) socket.destroy();
    });
    return api;
  }

  function status() {
    let clients = 0;
    for (const [, room] of rooms) clients += room.clients.size + (room.host ? 1 : 0);
    return { path, rooms: rooms.size, clients };
  }

  const api = { attach, handleUpgrade, status };
  return api;
}

function startStandaloneRelay({ host = '0.0.0.0', port = 8787, path = '/', logger = console } = {}) {
  const relay = createLanRelay({ path, logger });
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('ENGENDROS PURGE LAN relay is running.\n');
  });
  relay.attach(server);
  server.listen(port, host, () => {
    const addr = server.address();
    const actualPort = addr && addr.port ? addr.port : port;
    logger.log(`ENGENDROS PURGE LAN relay listening on ws://${host}:${actualPort}${path === '/' ? '' : path}`);
    logger.log('Open the game through your Hamachi IP, then switch the lobby to NET: LAN.');
  });
  return { server, relay };
}

module.exports = { createLanRelay, startStandaloneRelay };
