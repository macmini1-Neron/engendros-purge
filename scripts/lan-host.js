#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createLanRelay } = require('./lan-relay.js');

const DEFAULT_LAN_PORT = 53736;
const LAN_WS_PATH = '/__engendros_lan_ws';
const LAN_INFO_PATH = '/__engendros_lan_info';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}

function mimeType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.pdf': 'application/pdf',
  })[ext] || 'application/octet-stream';
}

function gameVersion(root) {
  try {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const m = html.match(/src=["']\.\/src\/game\.js\?v=(\d+)["']/);
    return m ? `v${m[1]}` : 'dev';
  } catch (e) {
    return 'dev';
  }
}

function networkCandidates(host) {
  const wildcard = !host || host === '0.0.0.0' || host === '::';
  const candidates = [];
  if (!wildcard) candidates.push({ name: 'host', address: host, hamachi: host.startsWith('25.') });
  if (wildcard) {
    for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
      for (const a of addrs || []) {
        const family = a.family === 'IPv4' || a.family === 4;
        if (!family || a.internal || !a.address) continue;
        candidates.push({ name, address: a.address, hamachi: a.address.startsWith('25.') || /hamachi/i.test(name) });
      }
    }
  }
  candidates.sort((a, b) => {
    const sa = a.hamachi ? 0 : (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) ? 1 : 2);
    const sb = b.hamachi ? 0 : (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(b.address) ? 1 : 2);
    return sa - sb || a.name.localeCompare(b.name) || a.address.localeCompare(b.address);
  });
  return candidates;
}

function urlFor(address, port, version) {
  return `http://${address}:${port}/?lan=1&cb=${encodeURIComponent(version)}`;
}

function makeInfo({ host, port, root, relay }) {
  const version = gameVersion(root);
  const candidates = networkCandidates(host);
  const localUrl = urlFor('localhost', port, version);
  const urls = candidates.map((c) => ({
    label: c.hamachi ? 'Hamachi' : 'LAN',
    interface: c.name,
    address: c.address,
    hamachi: !!c.hamachi,
    url: urlFor(c.address, port, version),
  }));
  const preferred = urls.find((u) => u.hamachi) || urls[0] || { label: 'Local', address: 'localhost', url: localUrl };
  return {
    ok: true,
    gameVersion: version,
    host,
    port,
    lan: true,
    lanWsPath: LAN_WS_PATH,
    localUrl,
    preferredUrl: preferred.url,
    hamachiUrl: (urls.find((u) => u.hamachi) || {}).url || '',
    urls,
    relay: relay.status(),
  };
}

function send(res, status, headers, body) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function serveStatic(req, res, root) {
  let pathname = '/';
  try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname); }
  catch (e) { return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad request\n'); }
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(root, '.' + pathname);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden\n');
  }
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found\n');
    const headers = { 'Content-Type': mimeType(target) };
    res.writeHead(200, { 'Cache-Control': 'no-store', ...headers });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  });
}

function printInfo(info) {
  console.log('');
  console.log('ENGENDROS PURGE LAN host is running');
  console.log(`Local:   ${info.localUrl}`);
  if (info.hamachiUrl) console.log(`Hamachi: ${info.hamachiUrl}`);
  else console.log('Hamachi: no 25.x.x.x address detected; open Hamachi and copy the shown IPv4 if needed.');
  for (const u of info.urls.filter((u) => !u.hamachi).slice(0, 3)) console.log(`LAN:     ${u.url} (${u.interface})`);
  console.log(`Relay:   ws://<host>:${info.port}${LAN_WS_PATH}`);
  console.log('');
  console.log('From Vercel or this local URL, use HOST & COPY to create an auto-join Hamachi invite.');
}

const root = path.resolve(arg('--root') || path.join(__dirname, '..'));
const host = process.env.HOST || arg('--host') || '0.0.0.0';
const port = Number(process.env.PORT || arg('--port') || DEFAULT_LAN_PORT);
const relay = createLanRelay({ path: LAN_WS_PATH });

const server = http.createServer((req, res) => {
  const pathname = (() => {
    try { return new URL(req.url || '/', 'http://localhost').pathname; } catch (e) { return ''; }
  })();
  if (pathname === LAN_INFO_PATH) {
    if (req.method === 'OPTIONS') return send(res, 204, corsHeaders(), '');
    const addr = server.address();
    const actualPort = addr && addr.port ? addr.port : port;
    const info = makeInfo({ host, port: actualPort, root, relay });
    return send(res, 200, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify(info, null, 2));
  }
  return serveStatic(req, res, root);
});

relay.attach(server);

server.listen(port, host, () => {
  const addr = server.address();
  const actualPort = addr && addr.port ? addr.port : port;
  printInfo(makeInfo({ host, port: actualPort, root, relay }));
});

server.on('error', (e) => {
  console.error(`LAN host failed: ${e.message || e}`);
  process.exitCode = 1;
});
