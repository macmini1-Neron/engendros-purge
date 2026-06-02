// audio.js — Web Audio SFX + music. Most sounds are procedural; selected hero
// weapon sounds use recorded-source WAV assets with procedural fallback.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.volume = 0.8;
    this.musicVolume = 0.5;
    this.muted = false;
    this._musicTimer = null;
    this._started = false;
    // real recorded crew-radio line (assets/crew-lines.mp3), wired through a comms-band filter in init()
    this._crewEl = null; this._crewSrc = null; this._crewGain = null; this._crewFailed = false;
    this._jetFailed = false; // real jet.mp3 may fail async (404/decode/autoplay) — callers degrade to procedural startJet()
    this._sampleBuffers = new Map();
    this._samplePromises = new Map();
    this._sampleIdx = {};
    this._m2SamplesPrimed = false;
    this._m2 = {
      fireClose: Array.from({ length: 8 }, (_, i) => `sounds/weapons/m2hb_v2/fire/m2hb_v2_fire_heavy_close_${String(i + 1).padStart(2, '0')}.wav`),
      brassHeavy: Array.from({ length: 10 }, (_, i) => `sounds/weapons/m2hb_v2/brass/m2hb_v2_brass_heavy_roof_${String(i + 1).padStart(2, '0')}.wav`),
      brassTick: Array.from({ length: 10 }, (_, i) => `sounds/weapons/m2hb_v2/brass/m2hb_v2_brass_short_tick_${String(i + 1).padStart(2, '0')}.wav`),
      charge: ['sounds/weapons/m2hb_v2/foley/m2hb_v2_charge_handle_real_01.wav'],
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
    this._primeM2Samples();
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

  // Real jet roar (assets/jet.mp3) for the Su-24 fly-by: smooth fade-in; .stop(fade) fades out (no abrupt cut).
  // Returns null if the clip can't load/play; callers consult _jetFailed and degrade to the procedural startJet().
  startJetClip() {
    if (typeof Audio === 'undefined' || !this.ctx || this._jetFailed) return null;
    try {
      const el = new Audio('assets/jet.mp3'); el.preload = 'auto'; el.loop = true;
      el.addEventListener('error', () => { this._jetFailed = true; if (typeof console !== 'undefined') console.warn('[audio] jet.mp3 load failed — using procedural jet'); });
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain(); g.gain.value = 0.0001;
      src.connect(g); g.connect(this.sfxGain);
      const t = this.t, peak = Math.max(0.0002, (this.volume || 0.8) * 0.9);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.9); // fade-in
      const p = el.play(); if (p && p.catch) p.catch(() => { this._jetFailed = true; if (typeof console !== 'undefined') console.warn('[audio] jet.mp3 play blocked — using procedural jet'); });
      return {
        stop: (fade = 1.4) => { const tt = this.t; try { g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0.0001, tt, Math.max(0.05, fade / 3)); } catch (e) {} setTimeout(() => { try { el.pause(); el.src = ''; } catch (e) {} }, (fade + 0.3) * 1000); },
      };
    } catch (e) { this._jetFailed = true; return null; }
  }

  setVolume(v) { this.volume = v; if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.musicGain) this.musicGain.gain.value = v; }
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

  _primeM2Samples() {
    if (!this.ctx || this._m2SamplesPrimed) return;
    this._m2SamplesPrimed = true;
    for (const p of [...this._m2.fireClose, ...this._m2.brassHeavy, ...this._m2.brassTick, ...this._m2.charge]) this._loadSample(p);
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

  _playM2CloseShot() {
    const path = this._pickSample('m2FireClose', this._m2.fireClose);
    return this._playSample(path, { vol: 0.78 + Math.random() * 0.12, rate: 0.985 + Math.random() * 0.03 });
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

  reloadClick() { this.noise(0.04, 0.3, 'bandpass', 2600, 3); }
  reloadIn() { this.tone(180, 0.08, 'square', 0.25); this.noise(0.05, 0.25, 'lowpass', 500, 1); }
  boltCycle() { this.noise(0.05, 0.28, 'bandpass', 1700, 4); setTimeout(() => { this.noise(0.06, 0.32, 'bandpass', 2200, 5); this.tone(150, 0.05, 'square', 0.14); }, 130); } // bolt lift-pull then push-lock
  garandPing() { this.tone(2300, 0.55, 'triangle', 0.30); this.tone(3100, 0.45, 'sine', 0.16); this.tone(1750, 0.5, 'triangle', 0.10); } // en-bloc clip "ping"
  shellInsert() { this.noise(0.05, 0.3, 'lowpass', 600, 1); this.tone(210, 0.05, 'square', 0.16); } // a single shell pressed into the tube
  dryFire() { this.noise(0.03, 0.25, 'bandpass', 3200, 4); }

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
  waveStart() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'square', 0.3), i * 90));
  }
  waveClear() {
    [784, 659, 523, 392].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.28), i * 110));
  }
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'sawtooth', 0.3), i * 220));
  }

  // ---- ambient tension music: slow arpeggio drone ----
  startMusic() {
    if (!this.ctx || this._started) return;
    this._started = true;
    const scale = [55, 65.41, 73.42, 82.41, 98, 110]; // low A minor-ish
    let step = 0;
    const tick = () => {
      if (!this._started) return;
      const f = scale[step % scale.length];
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * (step % 6 === 0 ? 1 : 2);
      o.connect(g); g.connect(this.musicGain);
      const t0 = this.t;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      o.start(t0); o.stop(t0 + 1.8);
      step++;
      this._musicTimer = setTimeout(tick, 900);
    };
    tick();
  }
  stopMusic() {
    this._started = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
  }
}
