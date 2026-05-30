// audio.js — fully procedural SFX + music via Web Audio. No asset files needed.
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
  }

  // Load the real recorded crew-radio line and route it through a telephone/radio band
  // (highpass 300 + lowpass 3600) so it sounds like genuine comms while staying intelligible.
  _initCrewLine() {
    if (this._crewEl || this._crewFailed || typeof Audio === 'undefined') return;
    try {
      const el = new Audio('assets/crew-lines.mp3');
      el.preload = 'auto';
      el.addEventListener('error', () => { this._crewFailed = true; });
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
  startJetClip() {
    if (typeof Audio === 'undefined' || !this.ctx) return null;
    try {
      const el = new Audio('assets/jet.mp3'); el.preload = 'auto'; el.loop = true;
      el.addEventListener('error', () => {});
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain(); g.gain.value = 0.0001;
      src.connect(g); g.connect(this.sfxGain);
      const t = this.t, peak = Math.max(0.0002, (this.volume || 0.8) * 0.9);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.9); // fade-in
      const p = el.play(); if (p && p.catch) p.catch(() => {});
      return {
        stop: (fade = 1.4) => { const tt = this.t; try { g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0.0001, tt, Math.max(0.05, fade / 3)); } catch (e) {} setTimeout(() => { try { el.pause(); el.src = ''; } catch (e) {} }, (fade + 0.3) * 1000); },
      };
    } catch (e) { return null; }
  }

  setVolume(v) { this.volume = v; if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.musicGain) this.musicGain.gain.value = v; }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 1; }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

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
  dryFire() { this.noise(0.03, 0.25, 'bandpass', 3200, 4); }

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
