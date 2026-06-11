#!/usr/bin/env node
// server.mjs — buildgen dev server (zero-dep node:http; DEV-ONLY, never deployed).
// Static GET over the repo root + ONE write endpoint: POST /upload?id=<building>&name=<file>
// saves a dropped reference image into buildings/<id>/ref/ (Pillar B intake).
//
// Hardening (the one real footgun is a crafted name overwriting a repo file):
//   · id must match /^[a-z0-9_-]{1,40}$/ AND buildings/<id>/ must already exist
//   · name is basename()d and must match a strict image-filename regex
//   · body capped at 8 MB (hard-abort past it) and must start with an image magic number
//   · final resolve() guard: the write path must stay inside buildings/<id>/ref/
//   · bytes are written as-is; nothing is ever parsed or executed
//
//   node tools/buildgen/server.mjs [port]      # run from the repo root; default port 8124
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, extname, basename, sep } from 'node:path';

const PORT = +(process.argv[2] ?? 8124);
const ROOT = process.cwd();
const MAX_UPLOAD = 8 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon',
};

const ID_RE = /^[a-z0-9_-]{1,40}$/;
const NAME_RE = /^[\w][\w.-]{0,80}\.(png|jpe?g|webp|gif)$/i;

function isImageMagic(buf) {
  if (buf.length < 12) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;          // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;                              // JPEG
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return true;                                       // GIF
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return true; // WEBP
  return false;
}

function bad(res, code, msg) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: msg })); }

function upload(req, res, url) {
  const id = url.searchParams.get('id') ?? '';
  if (!ID_RE.test(id)) return bad(res, 400, 'bad building id');
  if (!existsSync(join(ROOT, 'buildings', id))) return bad(res, 400, `unknown building '${id}' — create buildings/${id}/ first`);
  const rawName = url.searchParams.get('name') ?? '';
  const name = basename(rawName);
  if (name !== rawName || !NAME_RE.test(name)) return bad(res, 400, 'bad filename (image extensions only, no path tricks)');
  const declared = +(req.headers['content-length'] ?? 0);
  if (declared > MAX_UPLOAD) return bad(res, 413, 'file too large (max 8 MB)');

  const refDir = resolve(ROOT, 'buildings', id, 'ref');
  const dst = resolve(refDir, name);
  if (!dst.startsWith(refDir + sep)) return bad(res, 400, 'path escapes ref/');   // belt + braces

  const chunks = [];
  let size = 0, aborted = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_UPLOAD) { aborted = true; bad(res, 413, 'file too large (max 8 MB)'); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (aborted) return;
    const buf = Buffer.concat(chunks);
    if (!isImageMagic(buf)) return bad(res, 400, 'not an image (magic-number check failed)');
    mkdirSync(refDir, { recursive: true });
    writeFileSync(dst, buf);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: `/buildings/${id}/ref/${name}`, bytes: buf.length }));
    console.log(`[upload] buildings/${id}/ref/${name} (${buf.length} bytes)`);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/upload') return upload(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return bad(res, 405, 'method not allowed');

  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + sep) && file !== ROOT) return bad(res, 400, 'path escapes the root');
  if (!existsSync(file) || !statSync(file).isFile()) return bad(res, 404, 'not found');
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',                       // dev server — always fresh modules
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`[buildgen] dev server on http://localhost:${PORT}  (root: ${ROOT})`));
