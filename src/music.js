// music.js — procedural adaptive score. Owned by AudioManager; mixes through its
// OWN gain nodes placed downstream of audio.musicGain, so the radio's setMusicDuck
// (which owns musicGain.gain) keeps working untouched. NEVER write to musicGain.gain here.
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

    this.intensity = 0; this._intTarget = 0;
    this.stress = 0; this._stressTarget = 0;

    this._sched = null;        // setTimeout handle for the look-ahead scheduler
    this._nextNoteTime = 0;    // absolute ctx time of the next 16th step
    this._bar = 0; this._step = 0;
    this._pending = null;      // scene requested before ctx/gesture was ready
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  setScene(name /*, opts */) { this._pending = name; }   // real impl in Task 3
  setIntensity(x) { this._intTarget = Math.max(0, Math.min(1, x)); }
  setStress(x) { this._stressTarget = Math.max(0, Math.min(1, x)); }
  sting(/* name, size */) {}                              // real impl in Task 8
  update(/* dt */) {}                                    // real impl in Task 3
  stop(/* opts */) {}                                    // real impl in Task 3
}
