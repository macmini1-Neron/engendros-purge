// music.js — procedural adaptive score. Owned by AudioManager; mixes through its
// OWN gain nodes placed downstream of audio.musicGain, so the radio's setMusicDuck
// (which owns musicGain.gain) keeps working untouched. NEVER write to musicGain.gain here.
//
// Engine: sustained drone layers (vertical remix by `intensity`) + a dt-independent
// look-ahead note scheduler. Scenes are data: { bpm, drones[], step() }. game.js sets
// the scene per game-state and pushes per-frame intensity/stress during play.

// Scene registry. Each scene:
//   { bpm, drones:[{ id, min, max, gain, build(M,bus)->droneHandle }], step(M,bus,when,bar,step,I) }
// `build` returns a drone handle (see MusicDirector.drone); the engine ramps handle.gain
// from `intensity` across [min,max]. `step` schedules notes at absolute time `when`.
export const SCENES = {
  // --- engine smoke-test scene (handy from the console; not used by the game) ---
  test: {
    bpm: 120,
    drones: [{ id: 'pad', min: 0, max: 0.6, gain: 0.2, build: (M, bus) => M.drone(bus, [110, 164.81], { cutoff: 700 }) }],
    step(M, bus, when, bar, step, I) {
      if (step % 4 === 0) M.kick(bus, when, 0.5);
      if (I > 0.5 && step % 2 === 0) M.hat(bus, when, 0.15);
      if (I > 0.8 && step % 8 === 4) M.snare(bus, when, 0.35);
    },
  },

  // --- MENU: Soviet "pixel" chiptune — an original arrangement of Korobeiniki, the 19th-century
  //     Russian folk tune (public domain; the melody famously known from Tetris). Square-wave lead +
  //     oom-pah bass + arcade hat. Plays regardless of intensity (everything lives in step()). ---
  menu: {
    bpm: 150,
    drones: [],
    step(M, bus, when, bar, step, I) {
      const b = bar % 8;
      const LEAD = [
        [659.25, 0, 493.88, 0, 523.25, 0, 587.33, 0,   0, 0, 523.25, 0, 493.88, 0,   0, 0],
        [440.00, 0,      0, 0, 440.00, 0, 523.25, 0, 659.25, 0,    0, 0, 587.33, 0, 523.25, 0],
        [493.88, 0,      0, 0,      0, 0, 523.25, 0, 587.33, 0,    0, 0, 659.25, 0,   0, 0],
        [523.25, 0,      0, 0, 440.00, 0,      0, 0, 440.00, 0,    0, 0,      0, 0,   0, 0],
        [     0, 0, 587.33, 0, 698.46, 0, 880.00, 0,   0, 0, 783.99, 0, 698.46, 0,   0, 0],
        [659.25, 0,      0, 0,      0, 0, 523.25, 0, 659.25, 0,    0, 0, 587.33, 0, 523.25, 0],
        [493.88, 0,      0, 0, 493.88, 0, 523.25, 0, 587.33, 0,    0, 0, 659.25, 0,   0, 0],
        [523.25, 0,      0, 0, 440.00, 0,      0, 0, 440.00, 0,    0, 0,      0, 0,   0, 0],
      ][b];
      const f = LEAD[step];
      if (f) M.note(bus, when, f, 0.16, 0.17, 'square');                          // chiptune lead
      const root = [82.41, 110.00, 82.41, 110.00, 73.42, 110.00, 82.41, 110.00][b]; // oom-pah bass per bar
      if (step % 4 === 0) M.note(bus, when, root, 0.12, 0.15, 'square');
      else if (step % 2 === 0) M.note(bus, when, root * 1.5, 0.10, 0.10, 'square');
      if (step % 2 === 1) M.hat(bus, when, 0.05, 0.02);                           // light arcade hat
    },
  },

  // --- gameplay / waves: dread → industrial (adaptive core). D minor, root D=73.42 ---
  gameplay: {
    bpm: 120,
    drones: [
      { id: 'sub',   min: 0.00, max: 0.30, gain: 0.22, build: (M, bus) => M.drone(bus, [36.71], { cutoff: 200, type: 'sine' }) },
      { id: 'pad',   min: 0.00, max: 0.45, gain: 0.16, build: (M, bus) => M.drone(bus, [73.42, 110.00], { cutoff: 520 }) },
      { id: 'tense', min: 0.45, max: 1.00, gain: 0.10, build: (M, bus) => M.drone(bus, [77.78, 110.00], { cutoff: 900 }) }, // D + Eb (minor 2nd) bite
    ],
    step(M, bus, when, bar, step, I) {
      if (step === 0 || step === 8) M.kick(bus, when, 0.35 + I * 0.25);            // sparse heartbeat pulse
      if (I < 0.35 && step === 6 && bar % 2 === 0) M.ping(bus, when, 1108, 0.12);  // dissonant high accent when calm
      if (I > 0.25) {                                                              // building
        if (step % 4 === 0) M.tom(bus, when, 110, 0.22 + I * 0.18);
        if (step === 0) M.note(bus, when, 73.42, 0.5, 0.18 * I, 'sawtooth');
        if (step === 10) M.note(bus, when, 77.78, 0.4, 0.15 * I, 'sawtooth');
      }
      if (I > 0.6) {                                                              // peak: industrial
        M.hat(bus, when, 0.10 + (step % 2 ? 0.0 : 0.06));
        if ([0, 3, 6, 8, 11, 14].includes(step)) M.note(bus, when, 73.42, 0.14, 0.16, 'square');
        if (step === 4 || step === 12) M.snare(bus, when, 0.3);
        if (step === 14 && bar % 2 === 1) M.note(bus, when, 103.83, 0.18, 0.14, 'sawtooth'); // G# tritone vs D
      }
    },
  },

  // --- lobby (co-op): warm ambient, anticipation. C minor, ~84 BPM ---
  lobby: {
    bpm: 84,
    drones: [
      { id: 'pad', min: 0, max: 1, gain: 0.16, build: (M, bus) => M.drone(bus, [130.81, 196.00], { cutoff: 760 }) }, // C G
      { id: 'sub', min: 0, max: 1, gain: 0.12, build: (M, bus) => M.drone(bus, [65.41], { cutoff: 240, type: 'sine' }) },
    ],
    step(M, bus, when, bar, step, I) {
      if (step % 2 === 0) M.note(bus, when, 65.41, 0.18, 0.12, 'sawtooth');        // soft pulsing eighth bass on C
      const motif = [523.25, 622.25, 783.99];                                     // C Eb G
      if (step === 4 || step === 12) M.bell(bus, when, motif[(bar + (step === 12 ? 1 : 0)) % 3], 0.6, 0.14);
      if (step % 4 === 2) M.hat(bus, when, 0.08);
    },
  },

  // --- boss: Soviet/WW2 epic march. E minor, ~100 BPM. M.variant: 'mitri' | 'tolo' | null ---
  boss: {
    bpm: 100,
    drones: [
      { id: 'choir', min: 0, max: 1, gain: 0.12, build: (M, bus) => M.drone(bus, [82.41, 123.47], { cutoff: 600 }) }, // E B
      { id: 'sub',   min: 0, max: 1, gain: 0.16, build: (M, bus) => M.drone(bus, [41.20], { cutoff: 200, type: 'sine' }) },
    ],
    step(M, bus, when, bar, step, I) {
      const tolo = M.variant === 'tolo';
      if (step % 4 === 0) M.timpani(bus, when, 110, 0.42 + I * 0.18);              // 4-on-the-floor timpani
      if (I > 0.6 && step === 14) M.timpani(bus, when, 146.83, 0.3);              // fill as boss weakens
      const prog = [82.41, 65.41, 73.42, 61.74];                                  // Em C D B — one chord / bar
      const root = prog[bar % 4];
      if (step === 0) M.brass(bus, when, root, 0.7, 0.22);
      if (step === 8) M.brass(bus, when, root * 1.5, 0.5, 0.16);                  // fifth
      if (step % 2 === 1) M.snare(bus, when, 0.12 + I * 0.08);                    // snare march roll
      if (I > 0.55 && (step === 4 || step === 12)) M.note(bus, when, root * 4, 0.2, 0.12, 'square'); // piccolo-ish lead
      if (M.variant === 'mitri' && step % 4 === 2) M.tom(bus, when, 90, 0.2);     // mechanical clank pulse
      if (tolo && step === 6) M.bell(bus, when, 880, 0.5, 0.12);                  // grotesque music-box accent
    },
  },

  // --- shop / Armory: lounge "elevator" muzak. F major ii–V–I, ~110 BPM, light swing ---
  shop: {
    bpm: 110,
    drones: [{ id: 'pad', min: 0, max: 1, gain: 0.10, build: (M, bus) => M.drone(bus, [174.61, 261.63], { cutoff: 900 }) }], // F C
    step(M, bus, when, bar, step, I) {
      const swing = 0.06 * (60 / 110) * (step % 2 ? 1 : 0);                        // delay off-beats → shuffle
      const w = when + swing;
      const walk = [87.31, 110.00, 130.81, 146.83];                              // walking bass F A C D
      if (step % 4 === 0) M.note(bus, w, walk[(step / 4) % 4], 0.22, 0.14, 'sine');
      if (step % 2 === 0) M.hat(bus, w, 0.06, 0.03);                              // brushed-hat shuffle
      const mel = [
        [392.00, 466.16, 587.33, 698.46], // Gm7  G Bb D F
        [392.00, 466.16, 587.33, 698.46],
        [523.25, 659.25, 783.99, 587.33], // C7   C E G D
        [349.23, 440.00, 523.25, 659.25], // Fma7 F A C E
      ][bar % 4];
      if (step === 0 || step === 6 || step === 10) M.bell(bus, w, mel[step % 4], 0.5, 0.13); // vibraphone melody
      if (bar % 4 === 3 && step === 14) M.bell(bus, w, 1046.50, 0.7, 0.16);       // elevator "ding"
    },
  },

  // --- game-over (solo): dread → solemn. A minor, ~60 BPM ---
  gameover: {
    bpm: 60,
    drones: [{ id: 'pad', min: 0, max: 1, gain: 0.20, build: (M, bus) => M.drone(bus, [55.00, 82.41], { cutoff: 420 }) }], // A E
    step(M, bus, when, bar, step, I) {
      const prog = [110.00, 82.41, 73.42, 110.00];                                // Am E Dm Am — descending
      if (step === 0) M.brass(bus, when, prog[bar % 4], 1.8, 0.18);
      if (step === 0 && bar % 2 === 0) { M.bell(bus, when, 220, 1.4, 0.14); M.timpani(bus, when, 73, 0.35); }
    },
  },
};

// --- Soviet song jukebox: real recordings (assets/*.mp3, sourced from the Internet Archive +
//     the owner's own Katyusha). Each is a "sample scene" — the MusicDirector plays the MP3 and
//     segues to the next on end; no synth. The title menu points at the `soviet` playlist. ---
const SONGS = [
  ['slavyanka', 'Прощание славянки', 1912],
  ['aviamarsh', 'Марш авиаторов', 1923],
  ['rodina', 'Широка страна моя родная', 1936],
  ['katyusha', 'Катюша', 1938],
  ['katyusha_frontline', 'Фронтовая Катюша', 1938],
  ['svyashchennaya_voyna', 'Священная война', 1941],
  ['vzemlyanke', 'В землянке', 1942],
  ['platochek', 'Синий платочек', 1942],
  ['gimn_sssr', 'Государственный гимн СССР', 1944],
  ['smuglyanka', 'Смуглянка', 1944],
  ['dorogi', 'Эх, дороги', 1945],
  ['podmoskovnye', 'Подмосковные вечера', 1956],
  ['khotyat', 'Хотят ли русские войны', 1962],
  ['solnce', 'Пусть всегда будет солнце', 1962],
  ['vysote', 'На безымянной высоте', 1963],
  ['nezhnost', 'Нежность', 1965],
  ['srodina', 'С чего начинается Родина', 1968],
  ['zhuravli', 'Журавли', 1969],
  ['den_pobedy', 'День Победы', 1975],
  ['million_roz', 'Миллион алых роз', 1982],
  ['komarovo', 'Комарово', 1985],
  ['peremen', 'Хочу перемен', 1987],
];
for (const [slug, title, year] of SONGS) SCENES[slug] = { audioUrl: 'assets/' + slug + '.mp3', title, year, bpm: 120, drones: [], step() {} };
const PLAYLISTS = { soviet: SONGS.map((s) => s[0]) };

export class MusicDirector {
  constructor(audio) {
    this.audio = audio;
    this.ctx = audio.ctx;
    // own master → musicGain (→ master → destination). musicGain.gain stays owned by AudioManager.
    this.out = this.ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(audio.musicGain);

    this.sceneName = null;     // current scene id
    this.sceneBus = null;      // crossfade gain node for the active scene
    this.drones = [];          // [{ def, handle }] sustained layers of the active scene
    this.scene = null;         // active scene def
    this.variant = null;       // optional scene flavor (e.g. boss 'mitri'/'tolo')
    this.playlist = null;      // active jukebox { id, members[], idx, fade } or null (single-scene mode)

    this.intensity = 0; this._intTarget = 0;
    this.stress = 0; this._stressTarget = 0;

    this._sched = null;        // setTimeout handle for the look-ahead scheduler
    this._nextNoteTime = 0;    // absolute ctx time of the next 16th step
    this._bar = 0; this._step = 0;
    this._pending = null;      // scene requested before ctx was ready (defensive; director only exists post-init)

    this.sceneIsSample = false;// active scene streams an MP3 (real recording) instead of synth notes
    this._sampleEl = null;     // active HTMLAudioElement (streamed, low-memory) for a sample scene
    this._sampleNode = null;   // its MediaElementSource node, routed through the scene bus
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  setIntensity(x) { this._intTarget = Math.max(0, Math.min(1, x)); }
  setStress(x) { this._stressTarget = Math.max(0, Math.min(1, x)); }

  // ---- voice palette (each schedules into `bus` at absolute time `when`) ----
  _noise(dur) {
    const n = Math.floor(this.ctx.sampleRate * Math.max(0.01, dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  note(bus, when, freq, dur, vol, type = 'triangle') {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, when);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.start(when); o.stop(when + dur + 0.05);
  }

  brass(bus, when, freq, dur, vol) { // warm two-saw → lowpass stab
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.setValueAtTime(freq, when); o2.frequency.setValueAtTime(freq * 1.007, when);
    lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.6;
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.05);
    g.gain.setValueAtTime(Math.max(0.0002, vol), when + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.start(when); o2.start(when); o.stop(when + dur + 0.06); o2.stop(when + dur + 0.06);
  }

  bell(bus, when, freq, dur, vol) { // sine + soft octave partial, bell decay
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o2.type = 'sine'; o.frequency.setValueAtTime(freq, when); o2.frequency.setValueAtTime(freq * 2.01, when);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(g);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.start(when); o2.start(when); o.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
  }

  kick(bus, when, vol = 0.6) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, when); o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(Math.max(0.0002, vol), when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    o.start(when); o.stop(when + 0.2);
  }

  snare(bus, when, vol = 0.4) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this._noise(0.2);
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
    const g = this.ctx.createGain(); s.connect(f); f.connect(g); g.connect(bus);
    g.gain.setValueAtTime(Math.max(0.0002, vol), when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    s.start(when); s.stop(when + 0.22);
    this.note(bus, when, 180, 0.06, vol * 0.4, 'triangle');
  }

  hat(bus, when, vol = 0.18, dur = 0.04) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this._noise(dur + 0.02);
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
    const g = this.ctx.createGain(); s.connect(f); f.connect(g); g.connect(bus);
    g.gain.setValueAtTime(Math.max(0.0002, vol), when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.start(when); s.stop(when + dur + 0.02);
  }

  tom(bus, when, freq = 120, vol = 0.4) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, when); o.frequency.exponentialRampToValueAtTime(freq * 0.5, when + 0.18);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(Math.max(0.0002, vol), when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    o.start(when); o.stop(when + 0.26);
  }

  timpani(bus, when, freq = 110, vol = 0.5) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, when); o.frequency.exponentialRampToValueAtTime(freq * 0.6, when + 0.3);
    o.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
    o.start(when); o.stop(when + 0.45);
    const s = this.ctx.createBufferSource(); s.buffer = this._noise(0.06);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 200; f.Q.value = 0.6;
    const ng = this.ctx.createGain(); s.connect(f); f.connect(ng); ng.connect(bus);
    ng.gain.setValueAtTime(vol * 0.4, when); ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    s.start(when); s.stop(when + 0.08);
  }

  cymbal(bus, when, vol = 0.3, dur = 0.7) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this._noise(dur + 0.05);
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = this.ctx.createGain(); s.connect(f); f.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.start(when); s.stop(when + dur + 0.05);
  }

  ping(bus, when, freq, vol = 0.18) { this.note(bus, when, freq, 0.5, vol, 'sine'); } // dissonant high accent

  // sustained drone layer: detuned saws → lowpass → own gain (starts silent). Returns a handle
  // whose .gain we ramp for intensity, and .stop() to release. Connected to `bus`.
  drone(bus, freqs, { cutoff = 500, type = 'sawtooth', detune = 0.4 } = {}) {
    if (!this.ctx) return { gain: null, stop() {} };
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.7;
    lp.connect(g); g.connect(bus);
    const oscs = [];
    for (const f of freqs) {
      const a = this.ctx.createOscillator(), b = this.ctx.createOscillator();
      a.type = type; b.type = type; a.frequency.value = f; b.frequency.value = f * (1 + detune / 100);
      a.connect(lp); b.connect(lp); a.start(); b.start(); oscs.push(a, b);
    }
    return { gain: g, stop: (when = this.t) => { try { for (const o of oscs) o.stop(when + 0.6); } catch (e) {} } };
  }

  // ---- sample (MP3) playback ----
  // Real recordings are STREAMED through an <audio> element (not decoded into RAM — these tracks
  // are minutes long; decoding 16 of them would cost ~1GB). The element feeds a MediaElementSource
  // into the SAME scene bus as the synth, so crossfade, the stress duck, and the diegetic radio's
  // music-duck all still apply (mix stays downstream of musicGain; invariant m.out !== musicGain).
  // Standalone scenes loop; in a jukebox the track segues to the next on `ended`.
  _startSample(url, bus, name) {
    const el = new Audio(url); el.loop = !this.playlist; el.preload = 'auto';
    let node = null;
    try { node = this.ctx.createMediaElementSource(el); node.connect(bus); } catch (e) {}
    el.onended = () => { if (this._sampleEl === el && this.playlist && this.sceneName === name) this._advancePlaylist(); };
    el.onerror = () => { if (this._sampleEl === el && this.playlist && this.sceneName === name) this._advancePlaylist(); }; // skip a missing/bad file
    el.play().catch(() => {});
    this._sampleEl = el; this._sampleNode = node;
  }
  _stopSample() { this._teardownSample(this._sampleEl, this._sampleNode); this._sampleEl = null; this._sampleNode = null; }
  _teardownSample(el, node) {
    if (el) { try { el.onended = null; el.onerror = null; el.pause(); el.src = ''; el.load(); } catch (e) {} }
    if (node) { try { node.disconnect(); } catch (e) {} }
  }

  // ---- scene control ----
  // Public scene change: any explicit setScene leaves jukebox (playlist) mode.
  setScene(name, opts = {}) { this.playlist = null; this._applyScene(name, opts); }

  // Start a named jukebox from PLAYLISTS: plays each member, then segues to the next (sample
  // scenes advance on the MP3's onended). game.js points the title menu here.
  setPlaylist(id, { fade = 1.6 } = {}) {
    if (!this.ctx) { this._pending = '@' + id; return; }
    const members = (PLAYLISTS[id] || []).filter((n) => SCENES[n]);
    if (!members.length) return;
    if (this.playlist && this.playlist.id === id) return;     // already running this jukebox
    this.playlist = { id, members, idx: 0, fade };
    this._applyScene(members[0], { fade });
  }
  _advancePlaylist() {
    const pl = this.playlist;
    if (!pl) return;
    pl.idx = (pl.idx + 1) % pl.members.length;
    this._applyScene(pl.members[pl.idx], { fade: pl.fade });   // _applyScene leaves this.playlist intact
  }

  // ---- jukebox player API (drives the asset-viewer "Music" tab, Spotify-style) ----
  jukeboxTracks() {
    return (PLAYLISTS.soviet || []).map((slug) => ({ slug, title: SCENES[slug].title || slug, year: SCENES[slug].year || null }));
  }
  jukeboxPlayAt(index, { fade = 0.5 } = {}) {
    const members = PLAYLISTS.soviet || [];
    if (!members.length) return;
    const i = ((index % members.length) + members.length) % members.length;
    this.playlist = { id: 'soviet', members, idx: i, fade: 1.4 };
    this._applyScene(members[i], { fade });
  }
  jukeboxNext() { if (this.playlist && this.playlist.id === 'soviet') this._advancePlaylist(); else this.jukeboxPlayAt(0); }
  jukeboxPrev() {
    const pl = this.playlist;
    if (!pl || pl.id !== 'soviet') return this.jukeboxPlayAt(0);
    pl.idx = (pl.idx - 1 + pl.members.length) % pl.members.length;
    this._applyScene(pl.members[pl.idx], { fade: 0.5 });
  }
  jukeboxToggle() {                                            // returns true if now playing
    const el = this._sampleEl;
    if (!el) { this.jukeboxPlayAt(this.playlist && this.playlist.id === 'soviet' ? this.playlist.idx : 0); return true; }
    if (el.paused) { el.play().catch(() => {}); return true; }
    el.pause(); return false;
  }
  jukeboxSeek(frac) { const el = this._sampleEl; if (el && isFinite(el.duration)) el.currentTime = Math.max(0, Math.min(1, frac)) * el.duration; }
  jukeboxStatus() {
    const pl = this.playlist, el = this._sampleEl;
    const on = !!(pl && pl.id === 'soviet' && this.sceneIsSample);
    return {
      active: on,
      index: on ? pl.idx : -1,
      slug: on ? pl.members[pl.idx] : null,
      title: on ? (SCENES[pl.members[pl.idx]].title || pl.members[pl.idx]) : null,
      year: on ? (SCENES[pl.members[pl.idx]].year || null) : null,
      paused: el ? el.paused : true,
      time: el ? (el.currentTime || 0) : 0,
      duration: el && isFinite(el.duration) ? el.duration : 0,
    };
  }

  _applyScene(name, { fade = 1.2, variant = null } = {}) {
    if (!this.ctx) { this._pending = name; return; }
    this.variant = variant;
    if (name === this.sceneName) return;
    const def = SCENES[name];
    if (!def) return;
    const t = this.t;
    // fade out + tear down the old scene (a sample keeps streaming through its bus fade, then stops)
    if (this.sceneBus) {
      const old = this.sceneBus, oldDrones = this.drones, oldEl = this._sampleEl, oldNode = this._sampleNode;
      if (oldEl) { oldEl.onended = null; oldEl.onerror = null; }  // forced stop must not trigger an advance
      old.gain.cancelScheduledValues(t); old.gain.setTargetAtTime(0.0001, t, fade / 3);
      for (const d of oldDrones) if (d.handle) d.handle.stop(t + fade);
      setTimeout(() => { try { old.disconnect(); } catch (e) {} this._teardownSample(oldEl, oldNode); }, (fade + 1) * 1000);
    }
    this._sampleEl = null; this._sampleNode = null; this.sceneIsSample = false;
    // build the new scene bus
    const bus = this.ctx.createGain(); bus.gain.value = 0.0001; bus.connect(this.out);
    bus.gain.setTargetAtTime(1, t, fade / 3);
    this.sceneBus = bus; this.scene = def; this.sceneName = name;
    // real-recording scene → stream the MP3 through the bus; otherwise build the synth drones
    if (def.audioUrl) {
      this.sceneIsSample = true; this.drones = [];
      this._startSample(def.audioUrl, bus, name);
    } else {
      this.drones = (def.drones || []).map((dd) => ({ def: dd, handle: dd.build(this, bus) }));
    }
    this._bar = 0; this._step = 0; this._nextNoteTime = t + 0.06;
    this._ensureScheduler();
  }

  _ramp01(x, a, b) { if (b <= a) return x >= b ? 1 : 0; return Math.max(0, Math.min(1, (x - a) / (b - a))); }

  // Called every frame from the game loop (in EVERY state, so drone gains ramp + fades smooth
  // even when _updatePlaying isn't running). Advances smoothing only — note timing is the scheduler's.
  update(dt) {
    const up = 1 - Math.exp(-dt / (this._intTarget > this.intensity ? 0.6 : 1.2)); // fast up, slow down
    this.intensity += (this._intTarget - this.intensity) * up;
    this.stress += (this._stressTarget - this.stress) * (1 - Math.exp(-dt / 0.5));
    const t = this.t;
    for (const d of this.drones) {
      if (!d.handle || !d.handle.gain) continue;
      const lvl = this._ramp01(this.intensity, d.def.min, d.def.max) * (d.def.gain || 0.2);
      d.handle.gain.gain.setTargetAtTime(Math.max(0.0001, lvl), t, 0.25);
    }
    if (this.sceneBus) { // scene duck under stress (overlay) — applied to sceneBus, NOT musicGain
      const target = (1 - 0.3 * this.stress);
      this.sceneBus.gain.setTargetAtTime(Math.max(0.0001, target), t, 0.3);
    }
  }

  stop({ fade = 1.0 } = {}) {
    const t = this.t;
    const bus = this.sceneBus;
    this._stopSample(); this.sceneIsSample = false;
    if (bus) bus.gain.setTargetAtTime(0.0001, t, fade / 3);
    for (const d of this.drones) if (d.handle) d.handle.stop(t + fade);
    setTimeout(() => { try { bus && bus.disconnect(); } catch (e) {} }, (fade + 1) * 1000);
    this.sceneBus = null; this.scene = null; this.sceneName = null; this.drones = []; this.playlist = null;
    if (this._sched) { clearTimeout(this._sched); this._sched = null; }
  }

  _ensureScheduler() {
    if (this._sched || !this.ctx) return;
    const LOOKAHEAD = 0.1, TICK = 25;
    const loop = () => {
      if (!this.ctx) { this._sched = null; return; }
      const stepDur = 60 / (this.scene ? this.scene.bpm : 120) / 4; // 16th notes
      while (this.scene && this._nextNoteTime < this.t + LOOKAHEAD) {
        if (!this.sceneIsSample) {                              // sample scenes play the MP3, not synth notes
          try { this.scene.step(this, this.sceneBus, this._nextNoteTime, this._bar, this._step, this.intensity); } catch (e) {}
          if (this.stress > 0.02) this._heartbeat(this._nextNoteTime, this._step);
        }
        this._step = (this._step + 1) % 16; if (this._step === 0) this._bar++;
        this._nextNoteTime += stepDur;
      }
      this._sched = setTimeout(loop, TICK);
    };
    loop();
  }

  _heartbeat(when, step) { // double-thump ~twice/bar, faster as stress rises
    const period = Math.max(2, Math.round(8 - this.stress * 5)); // steps between beats
    if (step % period !== 0) return;
    const v = 0.18 + this.stress * 0.22;
    this.tom(this.sceneBus, when, 70, v);
    this.tom(this.sceneBus, when + 0.13, 64, v * 0.7);
  }

  // one-shot cue over the current scene (does not change the scene)
  sting(name, size = 'small') {
    if (!this.ctx || !this.sceneBus) return;
    const bus = this.sceneBus, t = this.t + 0.02, big = size === 'big';
    if (name === 'victory') { // rising brass G–C–D→G + double timpani + cymbal swell
      const notes = [196.00, 261.63, 293.66, 392.00];
      notes.forEach((f, i) => this.brass(bus, t + i * 0.18, f, big ? 0.7 : 0.45, big ? 0.30 : 0.22));
      this.timpani(bus, t, 110, big ? 0.6 : 0.4); this.timpani(bus, t + 0.36, 146.83, big ? 0.55 : 0.36);
      this.cymbal(bus, t, big ? 0.34 : 0.22, big ? 0.9 : 0.6);
      if (big) this.brass(bus, t + 0.72, 392.00, 1.1, 0.30);
    }
  }
}
