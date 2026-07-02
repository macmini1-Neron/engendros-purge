#!/usr/bin/env node
// voice-harness — scripted 2-Chrome co-op voice/radio verification.
//
// Boots the game twice (two isolated browser contexts) with Chrome's FAKE mic
// (--use-fake-device-for-media-stream emits a pulsing tone), connects them over the
// bundled LAN relay on localhost, starts a co-op run through the real lobby code path,
// and asserts the full audio pipeline end-to-end:
//   1. voice auto-enables from the persisted setting + the WebRTC mesh connects (both ways)
//   2. remote audio actually FLOWS both ways (analyser RMS on the received track)
//   3. the remote nameplate lights its "speaking" dot
//   4. radio: A keys PTT on 40.150 → B (tuned to the channel) receives (radioGain opens)
//   5. secret station 44.100: both clients play the SAME position in the song (synced clock)
//   6. world audio: the generic 'snd' event (host growl relay) reaches B and plays positionally
//
// Usage:  node scripts/voice-harness/run.mjs        (from the repo root or anywhere)
// Exit 0 = all green. Non-zero = at least one assert failed (details on stdout).

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { join, extname, resolve, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.woff2': 'font/woff2',
};

function freePort() {
  return new Promise((res, rej) => {
    const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej);
  });
}

function startStatic(port) {
  const srv = createServer((req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',                     // module edits must always be re-fetched
      });
      createReadStream(file).pipe(res);
    } catch (e) { res.writeHead(500); res.end(); }
  });
  return new Promise((res) => srv.listen(port, '127.0.0.1', () => res(srv)));
}

function chromeExecutable() {
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return existsSync(mac) ? mac : null;
}

// ---- tiny assert framework -----------------------------------------------------------------
const results = [];
function report(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
function skip(name, why) { results.push({ name, ok: null }); console.log(`SKIP  ${name}  — ${why}`); }

async function poll(page, fn, { timeout = 15000, arg = undefined } = {}) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; }
  catch (e) { return false; }
}

async function main() {
  const staticPort = await freePort();
  const relayPort = await freePort();
  const url = `http://127.0.0.1:${staticPort}/`;

  const staticSrv = await startStatic(staticPort);
  const relay = spawn(process.execPath, [join(ROOT, 'scripts', 'lan-server.js'), '--host', '127.0.0.1', '--port', String(relayPort)], { stdio: 'ignore' });

  const exe = chromeExecutable();
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : { channel: 'chrome' }),
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',            // auto-grant mic permission
      '--use-fake-device-for-media-stream',        // fake mic emits a pulsing tone
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',                              // keep the Mac quiet; graph/analysers still run
      '--disable-gpu',
    ],
  });

  const mkPage = async (nick) => {
    const cx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
    await cx.addInitScript(([ws, nk]) => {
      localStorage.setItem('engendros_lan_mode', '1');
      localStorage.setItem('engendros_lan_ws', ws);
      localStorage.setItem('engendros_settings', JSON.stringify({
        voiceOn: 1, voiceVol: 1, micGain: 1, ptt: 0, vad: 0.8,   // open mic, sensitive VAD (fake tone pulses)
        echoCancel: 0, noiseSup: 0, autoGain: 0,                  // don't let processing eat the fake tone
        nick: nk, sfx: 0.8, music: 0,
      }));
    }, [`ws://127.0.0.1:${relayPort}`, nick]);
    const pg = await cx.newPage();
    pg.on('pageerror', (e) => console.log(`[${nick}] pageerror: ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error') console.log(`[${nick}] console.error: ${m.text()}`); });
    await pg.goto(url, { waitUntil: 'domcontentloaded' });
    if (!(await poll(pg, () => window.GAME && window.GAME.mp, { timeout: 20000 }))) throw new Error(nick + ': GAME never booted');
    return pg;
  };

  console.log(`serving ${ROOT} on :${staticPort}, LAN relay on :${relayPort}`);
  const A = await mkPage('HarnA');
  const B = await mkPage('HarnB');

  // ---- drive the real lobby flow ------------------------------------------------------------
  await A.evaluate(() => { window.GAME.toLobby(); window.GAME.mp.startHost('HarnA'); });
  if (!(await poll(A, () => /^[A-Z0-9]{5}$/.test((document.getElementById('mp-mycode') || {}).textContent || ''), { timeout: 15000 })))
    throw new Error('host: room code never appeared (LAN relay unreachable?)');
  const code = await A.evaluate(() => document.getElementById('mp-mycode').textContent.trim());
  console.log('room code:', code);

  await B.evaluate((c) => { window.GAME.toLobby(); window.GAME.mp.startJoin(c, 'HarnB'); }, code);
  if (!(await poll(A, () => window.GAME.mp.roster.size === 2, { timeout: 20000 }))) throw new Error('join: B never reached the host roster');
  if (!(await poll(B, () => !!window.GAME.mp.myId, { timeout: 10000 }))) throw new Error('join: B never got a session id');

  await B.evaluate(() => window.GAME.mp.toggleReady());
  if (!(await poll(A, () => [...window.GAME.mp.roster].every(([id, p]) => id === 'host' || p.ready), { timeout: 10000 })))
    throw new Error('ready: host never saw B ready');

  await A.evaluate(() => window.GAME.mp.hostStart());
  const playing = await poll(A, () => window.GAME.state === 'playing', { timeout: 15000 })
    && await poll(B, () => window.GAME.state === 'playing', { timeout: 15000 });
  if (!playing) throw new Error('start: run never reached state=playing on both clients');
  console.log('co-op run live on both clients');

  // ---- assert 1: auto-enabled voice + connected mesh ----------------------------------------
  const meshFn = () => {
    const v = window.GAME.voice; if (!v || !v.enabled) return false;
    const pv = [...v.peers.values()][0];
    return v.peers.size === 1 && !!pv && pv.pc.connectionState === 'connected' && !!pv.srcNode;
  };
  const m1 = await poll(A, meshFn, { timeout: 25000 });
  const m2 = m1 && await poll(B, meshFn, { timeout: 15000 });
  const diag = (pg) => pg.evaluate(() => {
    const v = window.GAME.voice, s = window.GAME.settings;
    const pv = v && [...v.peers.values()][0];
    return `enabled=${!!(v && v.enabled)} micDenied=${!!(v && v.micDenied)} voiceOnSetting=${s && s.data.voiceOn} peers=${v ? v.peers.size : '-'} conn=${pv ? pv.pc.connectionState : '-'} src=${!!(pv && pv.srcNode)}`;
  });
  report('1. voice auto-enable + mesh connected (both)', m1 && m2, `A[${await diag(A)}] B[${await diag(B)}]`);

  if (!(m1 && m2)) {
    skip('2. audio flows both ways (remote RMS)', 'no mesh');
    skip('3. remote nameplate speaking dot', 'no mesh');
    skip('4. radio PTT A→B on 40.150', 'no mesh');
    skip('5. station 44.100 position synced', 'no mesh');
  } else {
    // ---- assert 2: audio flows (fake mic tone pulses → RMS over threshold at the receiver) --
    const rmsFn = () => {
      const v = window.GAME.voice; const pv = [...v.peers.values()][0];
      return !!pv && v._rms(pv.analyser, pv._buf) > 0.02;
    };
    const r1 = await poll(A, rmsFn, { timeout: 20000 });
    const r2 = await poll(B, rmsFn, { timeout: 20000 });
    report('2. audio flows both ways (remote RMS > 0.02)', r1 && r2, `A←B:${r1} B←A:${r2}`);

    // ---- assert 3: nameplate speaking dot -----------------------------------------------------
    const dot = await poll(A, () => !!document.querySelector('.mp-label.speaking'), { timeout: 15000 });
    report('3. remote nameplate speaking dot lights', dot);

    // ---- assert 4: radio channel A→B ---------------------------------------------------------
    await A.evaluate(() => { const v = window.GAME.voice; v.setRadioOn(true); v.setRadioFreq(40.150); });
    await B.evaluate(() => { const v = window.GAME.voice; v.setRadioOn(true); v.setRadioFreq(40.150); });
    await A.keyboard.down('x');                                   // radio PTT (KeyX)
    const txUp = await poll(A, () => window.GAME.voice.radioTx === true, { timeout: 5000 });
    const rx = await poll(B, () => {
      const v = window.GAME.voice; const pv = [...v.peers.values()][0];
      return !!pv && pv.radioGain && pv.radioGain.gain.value > 0.3;
    }, { timeout: 8000 });
    await A.keyboard.up('x');
    const txDown = await poll(A, () => window.GAME.voice.radioTx === false, { timeout: 5000 });
    report('4. radio PTT A→B on 40.150 (radioGain opens)', txUp && rx && txDown, `tx=${txUp} rx=${rx} release=${txDown}`);

    // ---- assert 5: station playback position synced ------------------------------------------
    await A.evaluate(() => window.GAME.voice.setRadioFreq(44.100));
    await B.evaluate(() => window.GAME.voice.setRadioFreq(44.100));
    const stOn = (pg) => poll(pg, () => {
      const st = window.GAME.voice.stations[0];
      return !!st && !st.el.paused && st.cgain.gain.value > 0.05;
    }, { timeout: 10000 });
    const s1 = await stOn(A), s2 = await stOn(B);
    let drift = Infinity;
    if (s1 && s2) {
      const [ta, tb] = await Promise.all([
        A.evaluate(() => window.GAME.voice.stations[0].el.currentTime),
        B.evaluate(() => window.GAME.voice.stations[0].el.currentTime),
      ]);
      drift = Math.abs(ta - tb);
    }
    report('5. station 44.100 position synced (<1.75s)', s1 && s2 && drift < 1.75, `audible A:${s1} B:${s2} drift=${isFinite(drift) ? drift.toFixed(2) + 's' : '-'}`);

    // ---- assert 6: generic positional sound event ('snd') -----------------------------------
    // enemyGrowl on a CLIENT is only ever reachable through the 'snd' registry (the growl loop is
    // host-only), so counting growl invocations on B proves message → registry → playAt end-to-end.
    await B.evaluate(() => {
      window.__growls = 0;
      const a = window.GAME.audio, orig = a.enemyGrowl.bind(a);
      a.enemyGrowl = () => { window.__growls++; return orig(); };
    });
    await A.evaluate(() => { const g = window.GAME; g.mp.sound('egrowl', { x: g.player.pos.x + 3, y: 1, z: g.player.pos.z }); });
    const snd = await poll(B, () => window.__growls > 0, { timeout: 8000 });
    report('6. world-audio snd event host→client (registry+playAt)', snd);
  }

  await browser.close();
  staticSrv.close();
  relay.kill();

  const fails = results.filter((r) => r.ok === false).length;
  const skips = results.filter((r) => r.ok === null).length;
  console.log(`\n${results.length - fails - skips} passed, ${fails} failed, ${skips} skipped`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
