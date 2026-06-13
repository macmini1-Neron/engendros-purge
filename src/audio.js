// audio.js — Web Audio SFX + music. Most sounds are procedural; selected hero
// weapon sounds use recorded-source WAV assets with procedural fallback.
import { MusicDirector } from './music.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.volume = 0.8;
    this.musicVolume = 0.5;
    this._musicDuck = 1;
    this.muted = false;
    this._musicTimer = null;
    this._started = false;
    this.music = null; // MusicDirector, created in init() once ctx exists
    this._pendingScene = null; // scene requested before init() (no ctx yet)
    // real recorded crew-radio line (assets/crew-lines.mp3), wired through a comms-band filter in init()
    this._crewEl = null; this._crewSrc = null; this._crewGain = null; this._crewFailed = false;
    this._jetFailed = false; // real jet.mp3 may fail async (404/decode/autoplay) — callers degrade to procedural startJet()
    this._sampleBuffers = new Map();
    this._samplePromises = new Map();
    this._sampleIdx = {};
    this._activeLoops = {};
    this._gunshotSamplesPrimed = false;
    this._m2SamplesPrimed = false;
    this._mosinSamplesPrimed = false;
    this._dshkSamplesPrimed = false;
    this._dshkLooping = false;
    this._gunshot = {
      fire: [],
    };
    this._m2 = {
      fireClose: Array.from({ length: 8 }, (_, i) => `sounds/weapons/m2hb_v2/fire/m2hb_v2_fire_heavy_close_${String(i + 1).padStart(2, '0')}.wav`),
      brassHeavy: Array.from({ length: 10 }, (_, i) => `sounds/weapons/m2hb_v2/brass/m2hb_v2_brass_heavy_roof_${String(i + 1).padStart(2, '0')}.wav`),
      brassTick: Array.from({ length: 10 }, (_, i) => `sounds/weapons/m2hb_v2/brass/m2hb_v2_brass_short_tick_${String(i + 1).padStart(2, '0')}.wav`),
      charge: ['sounds/weapons/m2hb_v2/foley/m2hb_v2_charge_handle_real_01.wav'],
    };
    this._dshk = {
      singleShot: ['assets/vystrel.mp3'],
      fireClose: Array.from({ length: 12 }, (_, i) => `sounds/weapons/dshk/fire/dshk_fire_close_${String(i + 1).padStart(2, '0')}.wav`),
      burstStart: ['sounds/weapons/dshk/burst/dshk_burst_start_01.wav'],
      burstLoop: ['sounds/weapons/dshk/burst/dshk_burst_loop_01.wav'],
      burstTail: ['sounds/weapons/dshk/burst/dshk_burst_tail_01.wav'],
    };
    this._mosin = {
      fireClose: Array.from({ length: 5 }, (_, i) => `sounds/weapons/mosin_9130/fire/mosin_9130_fire_close_${String(i + 1).padStart(2, '0')}.wav`),
      boltOpen: Array.from({ length: 2 }, (_, i) => `sounds/weapons/mosin_9130/foley/mosin_9130_bolt_open_${String(i + 1).padStart(2, '0')}.wav`),
      boltClose: Array.from({ length: 2 }, (_, i) => `sounds/weapons/mosin_9130/foley/mosin_9130_bolt_close_${String(i + 1).padStart(2, '0')}.wav`),
      caseEject: Array.from({ length: 2 }, (_, i) => `sounds/weapons/mosin_9130/brass/mosin_9130_case_eject_${String(i + 1).padStart(2, '0')}.wav`),
      clipLoad: Array.from({ length: 2 }, (_, i) => `sounds/weapons/mosin_9130/foley/mosin_9130_clip_load_${String(i + 1).padStart(2, '0')}.wav`),
      roundInsert: Array.from({ length: 2 }, (_, i) => `sounds/weapons/mosin_9130/foley/mosin_9130_round_insert_${String(i + 1).padStart(2, '0')}.wav`),
      reloadStart: ['sounds/weapons/mosin_9130/foley/mosin_9130_reload_start_01.wav'],
      reloadFinish: ['sounds/weapons/mosin_9130/foley/mosin_9130_reload_finish_01.wav'],
    };
  }

  // Must be created/resumed from a user gesture.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.volume;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);
    this._initCrewLine();
    this._primeGunshotSamples();
    this._primeM2Samples();
    this._primeDshkSamples();
    this._primeMosinSamples();
    if (!this.music) this.music = new MusicDirector(this);
    if (this._pendingScene) { this.music.setScene(this._pendingScene); this._pendingScene = null; }
  }

  // Load the real recorded crew-radio line and route it through a telephone/radio band
  // (highpass 300 + lowpass 3600) so it sounds like genuine comms while staying intelligible.
  _initCrewLine() {
    if (this._crewEl || this._crewFailed || typeof Audio === 'undefined') return;
    try {
      const el = new Audio('assets/crew-lines.mp3');
      el.preload = 'auto';
      el.addEventListener('error', () => { this._crewFailed = true; if (typeof console !== 'undefined') console.warn('[audio] crew-lines.mp3 load failed — using TTS/chatter fallback'); });
      const src = this.ctx.createMediaElementSource(el);
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
      const g = this.ctx.createGain(); g.gain.value = 1.5;
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.sfxGain);
      this._crewEl = el; this._crewSrc = src; this._crewGain = g;
    } catch (e) { this._crewFailed = true; }
  }

  // Play the recorded crew line. Returns its duration (s) if it could start, else 0 (caller falls back to TTS).
  _playCrewLine() {
    const el = this._crewEl;
    if (!el || this._crewFailed) return 0;
    try {
      el.currentTime = 0;
      el.volume = Math.min(1, (this.volume || 0.8) * 1.2);
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { return 0; }
    return (el.duration && isFinite(el.duration)) ? el.duration : 1.8;
  }

  // Real jet roar (assets/jet.mp3) for the Su-24 fly-by: fade-in + .set(level) distance swell; .stop(fade) fades out (no abrupt cut).
  // Returns null if the clip can't load/play; callers consult _jetFailed and degrade to the procedural startJet().
  startJetClip() {
    if (typeof Audio === 'undefined' || !this.ctx || this._jetFailed) return null;
    try {
      const el = new Audio('assets/jet.mp3'); el.preload = 'auto'; el.loop = true;
      // stop()'s `el.src=''` makes the element fire a spurious 'error' (and can reject the play() promise) — a `tearing`
      // guard keeps that self-inflicted teardown from setting _jetFailed, which used to mute the jet on EVERY drop after the first.
      let tearing = false;
      const onErr = () => { if (tearing) return; this._jetFailed = true; if (typeof console !== 'undefined') console.warn('[audio] jet.mp3 load failed — using procedural jet'); };
      el.addEventListener('error', onErr);
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain(); g.gain.value = 0.0001;
      src.connect(g); g.connect(this.sfxGain);
      const t = this.t, peak = Math.max(0.0002, (this.volume || 0.8) * 0.9);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.9); // fade-in
      const p = el.play(); if (p && p.catch) p.catch(() => { if (tearing) return; this._jetFailed = true; if (typeof console !== 'undefined') console.warn('[audio] jet.mp3 play blocked — using procedural jet'); });
      return {
        src, // keep the MediaElementSource referenced so it isn't GC'd mid-fly-by
        set: (level) => { g.gain.setTargetAtTime(Math.max(0.0002, level * peak), this.t, 0.1); }, // approach/recede swell, driven each frame by _updatePlane (same contract as the procedural jet)
        stop: (fade = 1.4) => { tearing = true; el.removeEventListener('error', onErr); const tt = this.t; try { g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0.0001, tt, Math.max(0.05, fade / 3)); } catch (e) {} setTimeout(() => { try { el.pause(); el.src = ''; } catch (e) {} }, (fade + 0.3) * 1000); },
      };
    } catch (e) { this._jetFailed = true; return null; }
  }

  setVolume(v) { this.volume = v; if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; this._applyMusicGain(); }
  setMusicDuck(d) { this._musicDuck = Math.max(0, Math.min(1, d)); this._applyMusicGain(); } // 1 = full, ~0.15 = radio nearby
  _applyMusicGain() { if (this.musicGain) this.musicGain.gain.value = this.musicVolume * (this._musicDuck == null ? 1 : this._musicDuck); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 1; }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  _loadSample(path) {
    if (!this.ctx) return null;
    if (this._sampleBuffers.has(path)) return Promise.resolve(this._sampleBuffers.get(path));
    if (this._samplePromises.has(path)) return this._samplePromises.get(path);
    const p = fetch(path)
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${path}`); return r.arrayBuffer(); })
      .then((buf) => this.ctx.decodeAudioData(buf))
      .then((decoded) => { this._sampleBuffers.set(path, decoded); return decoded; })
      .catch((e) => { if (typeof console !== 'undefined') console.warn('[audio] sample load failed', path, e); return null; });
    this._samplePromises.set(path, p);
    return p;
  }

  _primeGunshotSamples() {
    if (!this.ctx || this._gunshotSamplesPrimed) return;
    this._gunshotSamplesPrimed = true;
    for (const p of this._gunshot.fire) this._loadSample(p);
  }

  _primeM2Samples() {
    if (!this.ctx || this._m2SamplesPrimed) return;
    this._m2SamplesPrimed = true;
    for (const p of [...this._m2.fireClose, ...this._m2.brassHeavy, ...this._m2.brassTick, ...this._m2.charge]) this._loadSample(p);
  }

  _primeDshkSamples() {
    if (!this.ctx || this._dshkSamplesPrimed) return;
    this._dshkSamplesPrimed = true;
    for (const p of [...this._dshk.singleShot, ...this._dshk.fireClose, ...this._dshk.burstStart, ...this._dshk.burstLoop, ...this._dshk.burstTail]) this._loadSample(p);
  }

  _primeMosinSamples() {
    if (!this.ctx || this._mosinSamplesPrimed) return;
    this._mosinSamplesPrimed = true;
    for (const p of [
      ...this._mosin.fireClose,
      ...this._mosin.boltOpen,
      ...this._mosin.boltClose,
      ...this._mosin.caseEject,
      ...this._mosin.clipLoad,
      ...this._mosin.roundInsert,
      ...this._mosin.reloadStart,
      ...this._mosin.reloadFinish,
    ]) this._loadSample(p);
  }

  _pickSample(key, paths) {
    if (!paths || !paths.length) return null;
    if (this._sampleIdx[key] == null) this._sampleIdx[key] = Math.floor(Math.random() * paths.length);
    else this._sampleIdx[key] = (this._sampleIdx[key] + 1) % paths.length;
    return paths[this._sampleIdx[key]];
  }

  _playSample(path, { vol = 1, rate = 1, when = this.t, dest = null } = {}) {
    if (!this.ctx || !path) return false;
    const buf = this._sampleBuffers.get(path);
    if (!buf) { this._loadSample(path); return false; }
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, rate);
    g.gain.value = vol;
    src.connect(g); g.connect(dest || this.sfxGain);
    src.start(when);
    return true;
  }

  _startLoopSample(key, path, { vol = 1, rate = 1, dest = null, fade = 0.06 } = {}) {
    if (!this.ctx || !path) return false;
    if (this._activeLoops[key]) return true;
    const buf = this._sampleBuffers.get(path);
    if (!buf) { this._loadSample(path); return false; }
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    const t = this.t;
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = Math.max(0.25, rate);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + fade);
    src.connect(g); g.connect(dest || this.sfxGain);
    src.start(t);
    this._activeLoops[key] = { src, gain: g };
    return true;
  }

  _stopLoopSample(key, { fade = 0.08 } = {}) {
    const loop = this._activeLoops[key];
    if (!loop || !this.ctx) return false;
    delete this._activeLoops[key];
    const t = this.t;
    try {
      loop.gain.gain.cancelScheduledValues(t);
      loop.gain.gain.setValueAtTime(Math.max(0.0002, loop.gain.gain.value || 0.0002), t);
      loop.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      loop.src.stop(t + fade + 0.04);
    } catch (e) {}
    return true;
  }

  _playM2CloseShot() {
    const path = this._pickSample('m2FireClose', this._m2.fireClose);
    return this._playSample(path, { vol: 0.78 + Math.random() * 0.12, rate: 0.985 + Math.random() * 0.03 });
  }

  _playDshkCloseShot() {
    const loopTrim = this._dshkLooping ? 0.12 : 0;
    const single = this._pickSample('dshkSingleShot', this._dshk.singleShot);
    if (this._playSample(single, { vol: 0.92 - loopTrim + Math.random() * 0.08, rate: 0.985 + Math.random() * 0.03 })) return true;
    const path = this._pickSample('dshkFireClose', this._dshk.fireClose);
    return this._playSample(path, { vol: 0.82 - loopTrim + Math.random() * 0.09, rate: 0.975 + Math.random() * 0.045 });
  }

  _playM2BrassSample(scale, bounceIndex) {
    const paths = bounceIndex === 0 ? this._m2.brassHeavy : this._m2.brassTick;
    const path = this._pickSample(bounceIndex === 0 ? 'm2BrassHeavy' : 'm2BrassTick', paths);
    return this._playSample(path, {
      vol: Math.min(0.5, Math.max(0.05, 0.34 * scale)),
      rate: 0.96 + Math.random() * 0.09,
    });
  }

  _playM2ChargeSample() {
    const path = this._pickSample('m2Charge', this._m2.charge);
    return this._playSample(path, { vol: 0.92, rate: 0.98 + Math.random() * 0.025 });
  }

  _playMosinSample(key, paths, { vol = 1, rate = 1 } = {}) {
    const path = this._pickSample(key, paths);
    return this._playSample(path, { vol, rate });
  }

  _playRecordedGunshot(profile = {}) {
    const path = this._pickSample('recordedGunshot', this._gunshot.fire);
    const vol = Math.min(1.08, Math.max(0.32, (profile.vol || 0.5) * 1.12));
    return this._playSample(path, { vol, rate: 0.965 + Math.random() * 0.07 });
  }

  _noiseBuffer(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  // ---- generic one-shots ----
  tone(freq, dur, type = 'sine', vol = 0.4, dest = null) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(dest || this.sfxGain);
    this._env(g, this.t, vol, 0.005, dur);
    o.start(this.t); o.stop(this.t + dur + 0.05);
  }

  noise(dur, vol, filterType, freq, q = 1, dest = null) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    this._env(g, this.t, vol, 0.002, dur);
    src.start(this.t); src.stop(this.t + dur + 0.02);
    return { f, g, src };
  }

  // ---- gunshots: parameterized by weapon "punch" ----
  gunshot(profile = {}) {
    if (!this.ctx) return;
    if (this._playRecordedGunshot(profile)) return;
    const t0 = this.t;
    const body = profile.body || 220;   // low thump freq
    const crack = profile.crack || 0.07; // hi crack duration
    const vol = profile.vol || 0.5;
    // low body thump
    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(body, t0);
    o.frequency.exponentialRampToValueAtTime(body * 0.4, t0 + 0.12);
    o.connect(og); og.connect(this.sfxGain);
    this._env(og, t0, vol, 0.002, 0.13);
    o.start(t0); o.stop(t0 + 0.2);
    // high crack (filtered noise)
    this.noise(crack, vol * 0.9, 'highpass', profile.hp || 1800, 0.7);
    // mid snap
    this.noise(0.03, vol * 0.5, 'bandpass', profile.bp || 900, 1.2);
  }

  explosion() {
    if (!this.ctx) return;
    const t0 = this.t;
    this.noise(0.6, 0.9, 'lowpass', 600, 0.6);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(35, t0 + 0.5);
    o.connect(g); g.connect(this.sfxGain);
    this._env(g, t0, 0.9, 0.005, 0.55);
    o.start(t0); o.stop(t0 + 0.7);
  }

  // ---- 82mm mortar: the round dropping + sliding the bore, then the deep firing WHUMP ----
  mortarDrop() {                                  // bomb released → slides down → seats on the pin (the pre-BOOM beat)
    if (!this.ctx) return;
    this.noise(0.09, 0.30, 'lowpass', 360, 0.8);  // muffled tube slide
    this.tone(120, 0.07, 'sine', 0.15);           // low clack of the round seating
    this.noise(0.02, 0.16, 'bandpass', 1500, 3);  // faint primer-seat tick
  }
  mortarFire() {                                  // the report: a deep, low-frequency, concussive THUMP — NOT a treble crack
    if (!this.ctx) return;
    const t0 = this.t;
    for (const [f0, f1, type, vol, dec] of [[78, 40, 'sine', 0.95, 0.32], [112, 55, 'triangle', 0.5, 0.26]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dec);
      o.connect(g); g.connect(this.sfxGain);
      this._env(g, t0, vol, 0.003, dec);
      o.start(t0); o.stop(t0 + dec + 0.1);
    }
    this.noise(0.34, 0.95, 'lowpass', 520, 0.6);  // pressure blast body (the "felt" part)
    this.noise(0.45, 0.40, 'lowpass', 200, 0.5);  // low rumble tail / echo
    if (Math.random() < 0.3) this.noise(0.05, 0.5, 'highpass', 1400, 0.8); // occasional secondary-combustion crack
  }
  reloadClick() { this.noise(0.04, 0.3, 'bandpass', 2600, 3); }
  reloadIn() { this.tone(180, 0.08, 'square', 0.25); this.noise(0.05, 0.25, 'lowpass', 500, 1); }
  boltCycle() { this.noise(0.05, 0.28, 'bandpass', 1700, 4); setTimeout(() => { this.noise(0.06, 0.32, 'bandpass', 2200, 5); this.tone(150, 0.05, 'square', 0.14); }, 130); } // bolt lift-pull then push-lock
  garandPing() { this.tone(2300, 0.55, 'triangle', 0.30); this.tone(3100, 0.45, 'sine', 0.16); this.tone(1750, 0.5, 'triangle', 0.10); } // en-bloc clip "ping"
  shellInsert() { this.noise(0.05, 0.3, 'lowpass', 600, 1); this.tone(210, 0.05, 'square', 0.16); } // a single shell pressed into the tube
  dryFire() { this.noise(0.03, 0.25, 'bandpass', 3200, 4); }

  // ---- Mosin 91/30: recorded rifle shot + bolt/reload foley, with procedural fallback ----
  mosinShot() {
    if (!this.ctx) return;
    if (this._playMosinSample('mosinFireClose', this._mosin.fireClose, { vol: 1.10 + Math.random() * 0.08, rate: 0.985 + Math.random() * 0.03 })) return;
    this.gunshot({ body: 145, crack: 0.13, vol: 0.78, hp: 2400, bp: 820 });
  }
  mosinBoltOpen() {
    if (!this.ctx) return;
    if (this._playMosinSample('mosinBoltOpen', this._mosin.boltOpen, { vol: 0.78, rate: 0.96 + Math.random() * 0.08 })) return;
    const t0 = this.t;
    this._burst(t0, 0.026, 0.18, 'bandpass', 1850, 2.2);
    this._metalPing(t0 + 0.014, 3600 + Math.random() * 1100, 0.035, 0.07);
  }
  mosinBoltClose() {
    if (!this.ctx) return;
    if (this._playMosinSample('mosinBoltClose', this._mosin.boltClose, { vol: 0.82, rate: 0.965 + Math.random() * 0.07 })) return;
    const t0 = this.t;
    this._clank(t0, 0.20, 190 + Math.random() * 20);
    this._burst(t0 + 0.018, 0.018, 0.09, 'highpass', 4500, 0.8);
  }
  mosinCaseEject() {
    if (!this.ctx) return;
    if (this._playMosinSample('mosinCaseEject', this._mosin.caseEject, { vol: 0.38, rate: 0.95 + Math.random() * 0.12 })) return;
    const t0 = this.t;
    this._metalPing(t0, 4300 + Math.random() * 1700, 0.04, 0.08);
    this._burst(t0 + 0.012, 0.012, 0.04, 'highpass', 6200, 0.7);
  }
  mosinReloadStart(kind = 'single') {
    if (!this.ctx) return;
    const played = this._playMosinSample(`mosinReloadStart:${kind}`, this._mosin.reloadStart, { vol: kind === 'clip' ? 0.44 : 0.36, rate: 0.98 + Math.random() * 0.04 });
    if (!played) this.reloadIn();
  }
  mosinClipLoad() {
    if (!this.ctx) return;
    if (this._playMosinSample('mosinClipLoad', this._mosin.clipLoad, { vol: 0.62, rate: 0.985 + Math.random() * 0.045 })) return;
    this.reloadClick();
  }
  mosinRoundInsert() {
    if (!this.ctx) return;
    if (this._playMosinSample('mosinRoundInsert', this._mosin.roundInsert, { vol: 0.50, rate: 0.97 + Math.random() * 0.07 })) return;
    this.reloadClick();
  }
  mosinReloadFinish() {
    if (!this.ctx) return;
    if (this._playMosinSample('mosinReloadFinish', this._mosin.reloadFinish, { vol: 0.40, rate: 0.985 + Math.random() * 0.035 })) return;
    this.reloadClick();
  }

  // ---- M2HB .50 cal: heavy industrial layered sound (close perspective) ----
  _burst(t0, dur, vol, filterType, freq, q = 1) { // filtered-noise burst scheduled at an absolute time
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuffer(dur);
    const f = this.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    this._env(g, t0, vol, 0.002, dur);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }
  _clank(t0, vol, freq) { // heavy steel-on-steel impact (bolt rear-stop / lock-up)
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(freq, t0); o.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + 0.05);
    o.connect(g); g.connect(this.sfxGain);
    this._env(g, t0, vol, 0.001, 0.06); o.start(t0); o.stop(t0 + 0.11);
    this._burst(t0 + 0.003, 0.05, vol * 0.6, 'bandpass', 1500, 1.4); // metallic body
    this._burst(t0 + 0.008, 0.02, vol * 0.4, 'highpass', 4800, 0.7); // sharp edge
  }
  _metalPing(t0, freq, vol, dur = 0.11) { // short brass/steel resonance, used for links and spent cases
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * (0.97 + Math.random() * 0.06), t0);
    o.connect(g); g.connect(this.sfxGain);
    this._env(g, t0, vol, 0.001, dur);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  fiftyShot() { // one .50 round: muzzle pressure + supersonic crack + heavy bolt + belt rattle + mount resonance
    if (!this.ctx) return;
    if (this._playM2CloseShot()) return;
    const t0 = this.t, pv = 0.97 + Math.random() * 0.06, vv = 0.92 + Math.random() * 0.16;
    // L1 muzzle pressure — deep boom (sine sub + saw body)
    const o1 = this.ctx.createOscillator(), g1 = this.ctx.createGain();
    o1.type = 'sine'; o1.frequency.setValueAtTime(95 * pv, t0); o1.frequency.exponentialRampToValueAtTime(42, t0 + 0.09);
    o1.connect(g1); g1.connect(this.sfxGain); this._env(g1, t0, 0.9 * vv, 0.001, 0.09); o1.start(t0); o1.stop(t0 + 0.15);
    const o2 = this.ctx.createOscillator(), g2 = this.ctx.createGain();
    o2.type = 'sawtooth'; o2.frequency.setValueAtTime(155 * pv, t0); o2.frequency.exponentialRampToValueAtTime(64, t0 + 0.07);
    o2.connect(g2); g2.connect(this.sfxGain); this._env(g2, t0, 0.5 * vv, 0.001, 0.06); o2.start(t0); o2.stop(t0 + 0.12);
    this._burst(t0, 0.05, 0.45 * vv, 'bandpass', 230, 0.8);   // body that reads on small speakers
    this._burst(t0, 0.025, 0.32 * vv, 'bandpass', 620, 1.0);
    // L2 sharp supersonic crack (2-8 kHz, very short)
    this._burst(t0, 0.012, 0.55 * vv, 'highpass', 3600, 0.6);
    // L3 heavy bolt / mechanism (~28 ms after)
    const m0 = t0 + 0.028;
    const om = this.ctx.createOscillator(), gm = this.ctx.createGain();
    om.type = 'square'; om.frequency.setValueAtTime(190, m0); om.frequency.exponentialRampToValueAtTime(110, m0 + 0.05);
    om.connect(gm); gm.connect(this.sfxGain); this._env(gm, m0, 0.3 * vv, 0.002, 0.06); om.start(m0); om.stop(m0 + 0.1);
    this._burst(m0 + 0.004, 0.05, 0.3 * vv, 'bandpass', 1800, 1.4);
    this._burst(m0 + 0.01, 0.018, 0.18 * vv, 'highpass', 5200, 0.7);
    // L4 belt/link rattle (~50-100 ms after, randomized — some shots more, some none)
    if (Math.random() < 0.75) {
      const r0 = t0 + 0.05 + Math.random() * 0.05, n = 1 + (Math.random() * 2 | 0);
      for (let i = 0; i < n; i++) this._burst(r0 + i * 0.022 + Math.random() * 0.015, 0.012, 0.08 + Math.random() * 0.07, 'bandpass', 2600 + Math.random() * 2400, 3);
    }
    // L6 mount resonance — low damped tone (tripod/structure rings with each shot)
    const or = this.ctx.createOscillator(), gr = this.ctx.createGain();
    or.type = 'triangle'; or.frequency.setValueAtTime(125, t0); or.frequency.exponentialRampToValueAtTime(78, t0 + 0.18);
    or.connect(gr); gr.connect(this.sfxGain); this._env(gr, t0 + 0.004, 0.16 * vv, 0.004, 0.18); or.start(t0); or.stop(t0 + 0.24);
  }
  dshkShot() {
    if (!this.ctx) return;
    if (this._playDshkCloseShot()) return;
    this.fiftyShot();
  }
  dshkSustain(firing) {
    if (!this.ctx) return;
    if (!firing) { this.dshkStopSustain(true); return; }
    const loopPath = this._dshk.burstLoop[0];
    if (!this._dshkLooping) {
      this._dshkLooping = true;
      const startPath = this._pickSample('dshkBurstStart', this._dshk.burstStart);
      this._playSample(startPath, { vol: 0.52, rate: 0.985 + Math.random() * 0.025 });
    }
    this._startLoopSample('dshkBurstLoop', loopPath, {
      vol: 0.34,
      rate: 0.985 + Math.random() * 0.018,
      fade: 0.055,
    });
  }
  dshkStopSustain(tail = true) {
    if (!this.ctx || (!this._dshkLooping && !this._activeLoops.dshkBurstLoop)) return;
    this._dshkLooping = false;
    this._stopLoopSample('dshkBurstLoop', { fade: 0.075 });
    if (tail) {
      const tailPath = this._pickSample('dshkBurstTail', this._dshk.burstTail);
      this._playSample(tailPath, { vol: 0.50, rate: 0.985 + Math.random() * 0.035 });
    }
  }
  fiftyCharge() { // M2HB load/charge: two vigorous pull-release cycles, heavy spring + bolt + loose receiver rattle
    if (!this.ctx) return;
    if (this._playM2ChargeSample()) return;
    const t0 = this.t;
    const cycle = (off, v) => {
      const t = t0 + off, pv = 0.96 + Math.random() * 0.08;
      this._burst(t + 0.015, 0.025, 0.12 * v, 'bandpass', 2100, 2.2);          // hand grabs the retracting slide handle
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();        // long rearward pull against the drive spring
      o.type = 'sawtooth'; o.frequency.setValueAtTime(165 * pv, t + 0.06); o.frequency.linearRampToValueAtTime(95 * pv, t + 0.30);
      o.connect(g); g.connect(this.sfxGain); this._env(g, t + 0.06, 0.13 * v, 0.018, 0.25); o.start(t + 0.06); o.stop(t + 0.34);
      this._burst(t + 0.07, 0.24, 0.12 * v, 'bandpass', 480, 0.8);             // oiled rail scrape / mass sliding
      this._burst(t + 0.09, 0.16, 0.06 * v, 'bandpass', 1700, 1.8);            // higher metal-on-metal edge
      for (let i = 0; i < 3; i++) this._burst(t + 0.13 + i * 0.055 + Math.random() * 0.012, 0.009, 0.045 * v, 'bandpass', 2600 + Math.random() * 2200, 3.5);
      this._clank(t + 0.34, 0.42 * v, 148 * pv);                               // bolt group reaches the rear stop
      this._metalPing(t + 0.352, 5100 + Math.random() * 1600, 0.055 * v, 0.08);
      const f = t + 0.43;
      this._burst(f, 0.08, 0.10 * v, 'bandpass', 820, 1.0);                    // spring-driven forward run
      const o2 = this.ctx.createOscillator(), g2 = this.ctx.createGain();
      o2.type = 'sawtooth'; o2.frequency.setValueAtTime(120 * pv, f); o2.frequency.linearRampToValueAtTime(190 * pv, f + 0.10);
      o2.connect(g2); g2.connect(this.sfxGain); this._env(g2, f, 0.08 * v, 0.012, 0.12); o2.start(f); o2.stop(f + 0.16);
      this._clank(f + 0.10, 0.50 * v, 116 * pv);                               // bolt closes / locks in battery
      this._burst(f + 0.105, 0.03, 0.12 * v, 'bandpass', 1450, 1.3);
      for (let i = 0; i < 3; i++) this._burst(f + 0.16 + i * 0.045 + Math.random() * 0.02, 0.010, 0.045 * v, 'bandpass', 1800 + Math.random() * 4700, 4);
    };
    cycle(0.0, 1.0);
    cycle(0.58 + Math.random() * 0.04, 0.82);
  }
  fiftyOverheat() { // barrel maxed: steam hiss + low metallic stress groan + action seizing
    if (!this.ctx) return;
    const t0 = this.t;
    this._burst(t0, 0.6, 0.3, 'highpass', 4200, 0.5);                         // steam hiss
    this._burst(t0 + 0.05, 0.5, 0.2, 'bandpass', 2200, 0.8);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();          // low stress groan
    o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t0); o.frequency.exponentialRampToValueAtTime(85, t0 + 0.5);
    o.connect(g); g.connect(this.sfxGain); this._env(g, t0, 0.28, 0.01, 0.5); o.start(t0); o.stop(t0 + 0.62);
    this._clank(t0 + 0.02, 0.4, 130);                                         // action seizes
  }
  fiftyBrassLand(impactVel = 4, bounceIndex = 0) { // heavy .50 BMG brass casing on roof/concrete: clonk, ping, lazy tumble
    if (!this.ctx) return;
    const t0 = this.t;
    if (bounceIndex === 0) this._fiftyBrassSeq = (this._fiftyBrassSeq || 0) + 1;
    const full = bounceIndex === 0 && ((this._fiftyBrassSeq || 0) % 3 === 1 || Math.random() < 0.16);
    const fall = Math.max(0.22, Math.min(1.15, impactVel / 6.5));
    const s = fall * Math.pow(0.58, bounceIndex);
    if (s < 0.08) return;
    if (this._playM2BrassSample(s, bounceIndex)) return;
    const bodyFreq = 230 + Math.random() * 210;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(bodyFreq, t0); o.frequency.exponentialRampToValueAtTime(bodyFreq * 0.72, t0 + 0.08);
    o.connect(g); g.connect(this.sfxGain); this._env(g, t0, 0.075 * s, 0.002, 0.085); o.start(t0); o.stop(t0 + 0.13);
    this._burst(t0, 0.006, 0.15 * s, 'highpass', 5200 + Math.random() * 2200, 0.55);       // hard lip-on-concrete tick
    this._burst(t0 + 0.002, 0.020, 0.10 * s, 'bandpass', 2200 + Math.random() * 1400, 3.2); // hollow brass body
    this._metalPing(t0 + 0.004, 2800 + Math.random() * 1600, 0.070 * s, 0.10);
    this._metalPing(t0 + 0.009, 5600 + Math.random() * 2800, 0.035 * s, 0.07);
    if (Math.random() < 0.5) this._burst(t0 + 0.018 + Math.random() * 0.035, 0.010, 0.045 * s, 'highpass', 7000 + Math.random() * 1800, 0.6); // belt-link tick
    if (full) {
      const n = 2 + (Math.random() * 2 | 0);
      for (let i = 0; i < n; i++) {
        const tt = t0 + 0.07 + i * (0.09 + Math.random() * 0.05);
        const v = s * Math.pow(0.58, i + 1);
        this._burst(tt, 0.008, 0.055 * v, 'bandpass', 1800 + Math.random() * 3300, 4);
        this._metalPing(tt + 0.002, 3600 + Math.random() * 4700, 0.026 * v, 0.05);
      }
    }
  }

  hitMarker() { this.tone(1400, 0.04, 'square', 0.2); }
  headshot() { this.tone(2000, 0.05, 'square', 0.3); this.tone(2600, 0.05, 'square', 0.2); }
  // Effective hit on boss Tolo (bullseye-in-window or bazooka) — a meaty thunk + bright ding.
  bossHit() { this.tone(180, 0.09, 'sawtooth', 0.32); this.tone(880, 0.07, 'triangle', 0.26); this.tone(1320, 0.06, 'sine', 0.2); }

  enemyHurt() {
    // squeaky plush "oof"
    if (!this.ctx) return;
    const t0 = this.t;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(420 + Math.random() * 120, t0);
    o.frequency.exponentialRampToValueAtTime(180, t0 + 0.12);
    o.connect(g); g.connect(this.sfxGain);
    this._env(g, t0, 0.3, 0.005, 0.13);
    o.start(t0); o.stop(t0 + 0.2);
  }
  enemyDie() {
    if (!this.ctx) return;
    const t0 = this.t;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(500, t0);
    o.frequency.exponentialRampToValueAtTime(80, t0 + 0.3);
    o.connect(g); g.connect(this.sfxGain);
    this._env(g, t0, 0.35, 0.005, 0.3);
    o.start(t0); o.stop(t0 + 0.4);
    this.noise(0.25, 0.3, 'lowpass', 900, 0.7); // stuffing puff
  }
  enemyGrowl() {
    if (!this.ctx) return;
    const t0 = this.t;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(90 + Math.random() * 40, t0);
    o.connect(g); g.connect(this.sfxGain);
    this._env(g, t0, 0.12, 0.05, 0.3);
    o.start(t0); o.stop(t0 + 0.4);
  }

  playerHurt() {
    if (!this.ctx) return;
    this.noise(0.18, 0.4, 'lowpass', 700, 0.8);
    this.tone(160, 0.12, 'sine', 0.3);
  }
  footstep() { this.noise(0.05, 0.12, 'lowpass', 380, 1.0); }
  jump() { this.tone(320, 0.08, 'sine', 0.15); }
  land(hard) { this.noise(hard ? 0.12 : 0.06, hard ? 0.4 : 0.18, 'lowpass', hard ? 250 : 400, 0.8); }

  uiClick() { this.tone(660, 0.04, 'square', 0.25); }
  uiHover() { this.tone(880, 0.02, 'sine', 0.12); }
  // ЛПР-1 «Каралон-М»: ИЗМЕРЕНИЕ button press — relay click + a quiet capacitor-bank
  // whine rising through the first second of the 5 s ranging cycle.
  lprPulse() {
    if (!this.ctx) return;
    this.reloadClick();
    const t = this.t, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(2350, t + 1.05);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 1.2);
  }
  // ЛПР-1: готовность lamp relights — soft rising double beep from the indicator eyepiece.
  lprReady() {
    if (!this.ctx) return;
    const t = this.t;
    for (const [dt, f] of [[0, 1560], [0.09, 2080]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.16, t + dt + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.07);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t + dt); o.stop(t + dt + 0.12);
    }
  }
  buy() { this.tone(720, 0.06, 'square', 0.3); this.tone(960, 0.06, 'square', 0.25); }
  noMoney() { this.tone(160, 0.12, 'sawtooth', 0.3); }

  // Epic Soviet-radio transmission: squelch + static + a gruff "general" barking a confirmation
  // through a thin comms band, then an ULTRA WW2 brass/timpani victory sting. (Stylised chatter,
  // not real words — the audio engine is fully procedural.)
  radioCall() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = this.t;
    // radio voice bus: bandpass-limited (thin comms band)
    const bus = ctx.createGain(); bus.gain.value = 1.0;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1150; band.Q.value = 0.9;
    bus.connect(band); band.connect(this.sfxGain);
    const burst = (ts, dur, vol, freq, q, dest) => {
      const s = ctx.createBufferSource(); s.buffer = this._noiseBuffer(dur);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); s.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
      g.gain.setValueAtTime(0.0001, ts); g.gain.exponentialRampToValueAtTime(vol, ts + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, ts + dur);
      s.start(ts); s.stop(ts + dur + 0.02);
    };
    const beep = (ts, freq, dur, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = freq;
      o.connect(g); g.connect(this.sfxGain);
      g.gain.setValueAtTime(0.0001, ts); g.gain.exponentialRampToValueAtTime(vol, ts + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, ts + dur);
      o.start(ts); o.stop(ts + dur + 0.02);
    };
    const syl = (ts, freq, dur, vol) => { // a barked voice syllable (gritty + vibrato, through radio bus)
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, ts);
      o.frequency.linearRampToValueAtTime(freq * 1.07, ts + dur * 0.4);
      o.frequency.linearRampToValueAtTime(freq * 0.94, ts + dur);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 19; lg.gain.value = freq * 0.05;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0.0001, ts); g.gain.exponentialRampToValueAtTime(vol, ts + 0.02);
      g.gain.setValueAtTime(vol, ts + dur * 0.65); g.gain.exponentialRampToValueAtTime(0.0001, ts + dur);
      o.start(ts); o.stop(ts + dur + 0.03); lfo.start(ts); lfo.stop(ts + dur + 0.03);
    };
    const note = (ts, freq, dur, vol) => { // warm brass (detuned saws → lowpass)
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = freq; o2.frequency.value = freq * 1.006;
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.6;
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.sfxGain);
      g.gain.setValueAtTime(0.0001, ts); g.gain.exponentialRampToValueAtTime(vol, ts + 0.04);
      g.gain.setValueAtTime(vol, ts + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, ts + dur);
      o.start(ts); o2.start(ts); o.stop(ts + dur + 0.05); o2.stop(ts + dur + 0.05);
    };
    const drum = (ts, vol) => { // deep timpani hit
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(150, ts); o.frequency.exponentialRampToValueAtTime(48, ts + 0.3);
      o.connect(g); g.connect(this.sfxGain);
      g.gain.setValueAtTime(0.0001, ts); g.gain.exponentialRampToValueAtTime(vol, ts + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.4);
      o.start(ts); o.stop(ts + 0.45); burst(ts, 0.06, vol * 0.4, 200, 0.6);
    };
    // 1) squelch open + static bed
    beep(t0, 1700, 0.05, 0.22); burst(t0 + 0.02, 0.16, 0.34, 1500, 0.8, bus);
    burst(t0 + 0.16, 1.45, 0.06, 1250, 0.6, bus);
    // 2) voice — REAL recorded crew radio line (through the comms band); falls back to
    //    Russian TTS, then procedural barking, if the clip can't play.
    const crewDur = this._playCrewLine();
    if (!crewDur && !this._speakRu('Вас понял! Запрос подтверждён. Сброс груза!')) this._radioChatter();
    // 3) squelch close + 4) ULTRA-EPIC WW2 sting (rising brass + double timpani + cymbal)
    //    — waits for the recording to finish; TTS/chatter path keeps the original ~1.5s mark.
    const ts = t0 + (crewDur ? crewDur + 0.2 : 1.5);
    burst(ts + 0.04, 0.18, 0.3, 1500, 0.8, bus); beep(ts + 0.05, 900, 0.06, 0.18);
    const st = ts + 0.12;
    drum(st, 0.55); drum(st + 0.3, 0.5);
    note(st, 196, 0.55, 0.24); note(st, 246.94, 0.55, 0.18);
    note(st + 0.16, 392, 0.85, 0.28); note(st + 0.16, 293.66, 0.85, 0.16);
    burst(st, 0.6, 0.15, 6500, 0.4);
  }
  // Procedural gruff "barking" fallback when no Russian TTS voice is installed.
  _radioChatter() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = this.t;
    const bus = ctx.createGain(); bus.gain.value = 1.0;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1150; band.Q.value = 0.9;
    bus.connect(band); band.connect(this.sfxGain);
    const syl = (ts, freq, dur, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, ts);
      o.frequency.linearRampToValueAtTime(freq * 1.07, ts + dur * 0.4);
      o.frequency.linearRampToValueAtTime(freq * 0.94, ts + dur);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 19; lg.gain.value = freq * 0.05;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0.0001, ts); g.gain.exponentialRampToValueAtTime(vol, ts + 0.02);
      g.gain.setValueAtTime(vol, ts + dur * 0.65); g.gain.exponentialRampToValueAtTime(0.0001, ts + dur);
      o.start(ts); o.stop(ts + dur + 0.03); lfo.start(ts); lfo.stop(ts + dur + 0.03);
    };
    let ts = t0 + 0.05;
    for (const [f, d] of [[120, 0.16], [140, 0.12], [112, 0.18], [132, 0.12], [150, 0.13], [124, 0.1], [180, 0.34]]) { syl(ts, f, d, 0.62); ts += d + 0.045; }
  }
  // Speak a real Russian line with a gruff, slowed TTS voice. Returns false if it
  // certainly can't (no TTS / no Russian voice) so the caller plays the chatter instead.
  _speakRu(text) {
    if (this.muted) return true;
    const synth = (typeof window !== 'undefined') && window.speechSynthesis;
    if (!synth) return false;
    let done = false;
    const speak = () => {
      if (done) return; done = true;
      const ru = synth.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('ru'));
      if (!ru) { this._radioChatter(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.voice = ru; u.lang = ru.lang; u.rate = 0.95; u.pitch = 0.45; u.volume = Math.min(1, (this.volume || 0.8) * 1.15);
      try { synth.cancel(); } catch (e) {}
      synth.speak(u);
    };
    const voices = synth.getVoices();
    if (voices.length) {
      if (!voices.some((v) => v.lang && v.lang.toLowerCase().startsWith('ru'))) return false;
      setTimeout(speak, 220); return true;
    }
    try { synth.onvoiceschanged = () => { synth.onvoiceschanged = null; setTimeout(speak, 60); }; } catch (e) {}
    setTimeout(speak, 400);
    return true;
  }

  // Sustained jet engine roar that follows the supply plane. Handle: .set(level0..1, near0..1)
  // modulates loudness + brightness/pitch (pseudo-Doppler); .stop() fades it out.
  startJet() {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuffer(1.2); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 0.7;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 56;
    const og = ctx.createGain(); og.gain.value = 0.0;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(lp); lp.connect(g); o.connect(og); og.connect(g); g.connect(this.sfxGain);
    src.start(); o.start();
    return {
      set: (level, near) => {
        const t = this.t;
        g.gain.setTargetAtTime(Math.max(0.0001, level * 0.5), t, 0.1);
        og.gain.setTargetAtTime(level * 0.16, t, 0.1);
        lp.frequency.setTargetAtTime(280 + near * 1700, t, 0.1);
        o.frequency.setTargetAtTime(50 + near * 30, t, 0.12);
      },
      stop: () => { const t = this.t; g.gain.setTargetAtTime(0.0001, t, 0.25); og.gain.setTargetAtTime(0.0001, t, 0.25); try { src.stop(t + 0.7); o.stop(t + 0.7); } catch (e) {} },
    };
  }

  // ---- crate ceremony («Посылка» lootbox) ----
  // Sound carries ~half the thrill: weight-as-value thud, per-latch creak rising in pitch,
  // a tension drone whose end-pitch is a subtle tier-tell, escalating stingers + a legendary fanfare.
  crateThud() {                                                 // sub-bass impact = the conditioned "it landed, it's heavy" cue
    if (!this.ctx) return;
    const t0 = this.t, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(60, t0); o.frequency.exponentialRampToValueAtTime(24, t0 + 0.5);
    o.connect(g); g.connect(this.sfxGain); this._env(g, t0, 0.9, 0.004, 0.5); o.start(t0); o.stop(t0 + 0.6);
    this.noise(0.45, 0.7, 'lowpass', 220, 0.7);                 // body
    this._burst(t0 + 0.02, 0.12, 0.3, 'bandpass', 90, 1);       // slap
    for (let i = 0; i < 3; i++) this._burst(t0 + 0.12 + i * 0.07, 0.04, 0.12, 'highpass', 3000 + Math.random() * 2000, 0.7); // settling dirt
  }
  crateLatch(i) {                                               // creak → metallic pop; pitch climbs per latch (rising tension)
    if (!this.ctx) return;
    const t0 = this.t, base = [300, 380, 470][i % 3];
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(base, t0); o.frequency.exponentialRampToValueAtTime(base * 1.9, t0 + 0.2);
    o.connect(g); g.connect(this.sfxGain); this._env(g, t0, 0.2, 0.01, 0.2); o.start(t0); o.stop(t0 + 0.25);
    this.noise(0.16, 0.3, 'bandpass', 700 + i * 150, 2.5);      // creak
    this._metalPing(t0 + 0.18, 2400 + i * 500, 0.12, 0.08);     // pop
    this._clank(t0 + 0.19, 0.18, 150 + i * 30);
  }
  crateDrone(tier, dur) {                                       // FINITE riser (abort-safe); end-pitch is a subtle tier tell
    if (!this.ctx) return;
    const t0 = this.t, ti = { common: 0, rare: 1, epic: 2, legendary: 3 }[tier] ?? 0;
    const endHz = [82, 90, 110, 130][ti], lpEnd = [900, 1100, 1500, 2200][ti], gMax = [0.10, 0.13, 0.17, 0.22][ti];
    const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.setValueAtTime(55, t0); o2.frequency.setValueAtTime(55.6, t0);
    o1.frequency.linearRampToValueAtTime(endHz, t0 + dur); o2.frequency.linearRampToValueAtTime(endHz * 1.01, t0 + dur);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t0); lp.frequency.linearRampToValueAtTime(lpEnd, t0 + dur); lp.Q.value = 0.8;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.sfxGain);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gMax, t0 + dur); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.12);
    o1.start(t0); o2.start(t0); o1.stop(t0 + dur + 0.2); o2.stop(t0 + dur + 0.2);
  }
  crateTick(k, n) { if (!this.ctx) return; this.tone(900 + 600 * (k / Math.max(1, n)), 0.025, 'square', 0.10); } // reel tick, climbs as it slows
  crateBurst(tier) {                                            // lid-pop whoosh; epic+ gets a sub-bass drop
    if (!this.ctx) return;
    const t0 = this.t; this._clank(t0, 0.5, 95);
    [600, 1500, 3200].forEach((f, i) => this._burst(t0 + 0.01 + i * 0.04, 0.18, 0.22, 'bandpass', f, 0.8));
    if (tier === 'epic' || tier === 'legendary') {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(30, t0 + 0.35);
      o.connect(g); g.connect(this.sfxGain); this._env(g, t0, 0.5, 0.005, 0.35); o.start(t0); o.stop(t0 + 0.4);
    }
  }
  crateStinger(tier) {                                          // four escalating reveal stingers (conditioned tier reward)
    if (!this.ctx) return;
    if (tier === 'legendary') { this.crateFanfare(); return; }
    const t0 = this.t;
    if (tier === 'common') { this.tone(660, 0.12, 'triangle', 0.25); setTimeout(() => this.tone(880, 0.18, 'sine', 0.2), 60); }
    else if (tier === 'rare') { this.tone(523, 0.16, 'square', 0.22); this.tone(784, 0.16, 'square', 0.2); this.noise(0.3, 0.08, 'highpass', 6000, 0.5); }
    else if (tier === 'epic') {
      [587, 880, 1174].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.2), i * 95));
      setTimeout(() => this.tone(2350, 0.5, 'sine', 0.12), 300);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(130, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.4);
      o.connect(g); g.connect(this.sfxGain); this._env(g, t0, 0.45, 0.005, 0.4); o.start(t0); o.stop(t0 + 0.45);
    }
  }
  crateFanfare() {                                              // unique legendary brass+timpani crown (lifts radioCall's builders)
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = this.t;
    const note = (ts, freq, dur, vol) => {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = freq; o2.frequency.value = freq * 1.006;
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.6;
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.sfxGain);
      g.gain.setValueAtTime(0.0001, ts); g.gain.exponentialRampToValueAtTime(vol, ts + 0.04); g.gain.setValueAtTime(vol, ts + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, ts + dur);
      o.start(ts); o2.start(ts); o.stop(ts + dur + 0.05); o2.stop(ts + dur + 0.05);
    };
    const drum = (ts, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(150, ts); o.frequency.exponentialRampToValueAtTime(48, ts + 0.3);
      o.connect(g); g.connect(this.sfxGain);
      g.gain.setValueAtTime(0.0001, ts); g.gain.exponentialRampToValueAtTime(vol, ts + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.4);
      o.start(ts); o.stop(ts + 0.45); this._burst(ts, 0.06, vol * 0.4, 'bandpass', 200, 0.6);
    };
    drum(t0, 0.5); drum(t0 + 0.3, 0.45);
    note(t0, 196, 1.2, 0.16); note(t0, 246.94, 1.2, 0.14);
    note(t0 + 0.18, 392, 1.0, 0.16); note(t0 + 0.18, 293.66, 1.0, 0.13);
    note(t0 + 0.42, 523.25, 1.2, 0.18);
    this._burst(t0 + 0.42, 0.7, 0.16, 'highpass', 6500, 0.4);   // cymbal shimmer
  }
  coinTick(k) {                                                 // dense→sparse coin cascade under the rising counter
    if (!this.ctx) return;
    const t0 = this.t; this._metalPing(t0, 2200 + Math.random() * 1800 + k * 40, 0.07, 0.06);
    if (k % 3 === 0) this._burst(t0, 0.03, 0.05, 'highpass', 7000, 0.6);
  }
  crateChute() { if (!this.ctx) return; this.noise(0.18, 0.4, 'bandpass', 900, 1.2); this.noise(0.4, 0.18, 'highpass', 2400, 0.8); } // fabric snap + flutter
  crateWind() {                                                 // looping night-steppe bed under the whole ceremony
    if (!this.ctx || this._crateWind) return;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuffer(2); src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, this.t); g.gain.linearRampToValueAtTime(0.05, this.t + 0.4);
    src.connect(lp); lp.connect(g); g.connect(this.sfxGain); src.start();
    this._crateWind = { src, g };
  }
  crateWindStop() {
    if (!this._crateWind) return;
    const { src, g } = this._crateWind, t = this.t;
    try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); src.stop(t + 0.55); } catch (e) {}
    this._crateWind = null;
  }

  waveStart() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'square', 0.3), i * 90));
  }
  waveClear() {
    [784, 659, 523, 392].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.28), i * 110));
  }
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'sawtooth', 0.3), i * 220));
  }

  // Legacy shims — the procedural score now lives in MusicDirector (music.js).
  // Kept so old call sites + console keep working. Scene selection is done by game.js.
  startMusic() { if (this.music) this.music.setScene('gameplay'); else this._pendingScene = 'gameplay'; }
  stopMusic() { if (this.music) this.music.stop(); }
}
