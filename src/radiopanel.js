// radiopanel.js — the deployed field-radio CONTROL PANEL UI (Phase 2). A self-contained overlay
// built over the pixel-art Astra control head (assets/ui/radio-r114d-panel.png). Opens when the
// player interacts (E) with a radio placed on the ground; here it's dev-openable via
// GAME.radioPanel.open() for UI review. Tuning drives the deterministic model in radiosim.js.
// NB: first positioning pass — the digital readout floats over the meter; align to taste after review.

import { RADIO, clampFreq, snapReadout, fmtFreq } from './radiosim.js';

const PANEL_IMG = 'assets/ui/radio-r114d-panel.png';
const COARSE_HZ = 10_000;   // wheel / arrow step
const FINE_HZ = 1_000;      // shift + wheel / arrow step

export class RadioPanel {
  constructor(game) {
    this.game = game;
    this.open_ = false;
    this.freq = 40.150;       // MHz
    this.on = true;           // ЗАП / ВЫП
    this.el = null;
    this._onKey = this._onKey.bind(this);
    this._onWheel = this._onWheel.bind(this);
  }

  _build() {
    if (this.el) return;
    const wrap = document.createElement('div');
    wrap.id = 'radiopanel';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(6,8,9,.82);backdrop-filter:blur(2px);';
    wrap.innerHTML =
      '<div class="rp-wrap" style="position:relative;height:92vh;max-height:92vh;">' +
        '<img class="rp-img" src="' + PANEL_IMG + '" alt="R-105 panel" style="height:100%;display:block;image-rendering:pixelated;filter:drop-shadow(0 12px 40px rgba(0,0,0,.6));">' +
        '<div class="rp-readout" style="position:absolute;top:4.5%;left:50%;transform:translateX(-50%);text-align:center;font-family:\'Share Tech Mono\',\'Courier New\',monospace;background:rgba(4,10,6,.86);border:1px solid rgba(120,255,170,.35);border-radius:6px;padding:6px 16px;box-shadow:0 0 14px rgba(60,255,150,.25),inset 0 0 12px rgba(0,40,20,.9);">' +
          '<div class="rp-freq" style="font-size:30px;font-weight:700;letter-spacing:2px;color:#7dffb0;text-shadow:0 0 8px rgba(80,255,150,.8);line-height:1;">40.150</div>' +
          '<div class="rp-sub" style="font-size:11px;letter-spacing:3px;color:#4fe08f;margin-top:3px;">MHz · <span class="rp-onoff">ЗАП</span></div>' +
        '</div>' +
        '<div class="rp-hint" style="position:absolute;bottom:-30px;left:50%;transform:translateX(-50%);white-space:nowrap;font:12px/1.4 system-ui,sans-serif;color:#9fb0a6;opacity:.8;">scroll = ladit · shift+scroll = jemně · Z = ЗАП/ВЫП · G = sebrat · E / Esc = zavřít</div>' +
      '</div>';
    document.body.appendChild(wrap);
    this.el = wrap;
    this.freqEl = wrap.querySelector('.rp-freq');
    this.onoffEl = wrap.querySelector('.rp-onoff');
    this._refresh();
  }

  _refresh() {
    if (!this.freqEl) return;
    this.freqEl.textContent = fmtFreq(this.freq);
    this.freqEl.style.color = this.on ? '#7dffb0' : '#3a4a40';
    this.freqEl.style.textShadow = this.on ? '0 0 8px rgba(80,255,150,.8)' : 'none';
    if (this.onoffEl) { this.onoffEl.textContent = this.on ? 'ЗАП' : 'ВЫП'; this.onoffEl.style.color = this.on ? '#4fe08f' : '#c0554a'; }
  }

  tune(deltaHz) {
    this.freq = clampFreq(snapReadout(this.freq + deltaHz / 1e6));
    if (this.struct) this.struct.freq = this.freq;                                                   // persist per-radio
    this._refresh();
    if (this.game.voice && this.game.voice.setRadioFreq) this.game.voice.setRadioFreq(this.freq);   // wired in the audio-routing step
  }

  _pickup() {
    const s = this.struct; this.struct = null; this.close();
    if (s && this.game.build && this.game.build.pickupR105) this.game.build.pickupR105(s);
  }

  toggleOn() { this.on = !this.on; this._refresh(); }

  open(struct) {
    this._build();
    this.struct = struct || null;
    if (this.struct && typeof this.struct.freq === 'number') this.freq = this.struct.freq;
    this._refresh();
    if (this.open_) return;
    this.open_ = true;
    this.el.style.display = 'flex';
    this.game._radioPanelOpen = true;                       // let the game gate input while tuning
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('wheel', this._onWheel, { passive: false, capture: true });
  }

  close() {
    if (!this.open_) return;
    this.open_ = false; this.struct = null;
    if (this.el) this.el.style.display = 'none';
    this.game._radioPanelOpen = false;
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('wheel', this._onWheel, true);
  }

  toggle() { this.open_ ? this.close() : this.open(); }

  _onKey(e) {
    if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); this.close(); return; }
    if (e.code === 'KeyG') { e.preventDefault(); this._pickup(); return; }
    if (e.code === 'KeyZ') { e.preventDefault(); this.toggleOn(); return; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowDown') { e.preventDefault(); this.tune(-(e.shiftKey ? FINE_HZ : COARSE_HZ)); }
    else if (e.code === 'ArrowRight' || e.code === 'ArrowUp') { e.preventDefault(); this.tune(e.shiftKey ? FINE_HZ : COARSE_HZ); }
  }

  _onWheel(e) {
    e.preventDefault();
    const step = e.shiftKey ? FINE_HZ : COARSE_HZ;
    this.tune(e.deltaY < 0 ? step : -step);
  }
}
