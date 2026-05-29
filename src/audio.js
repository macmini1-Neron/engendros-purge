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
