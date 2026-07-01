// radiopanel.js — the deployed field-radio CONTROL PANEL UI (Phase 2). A self-contained overlay
// built over the pixel-art Astra control head (assets/ui/radio-r114d-panel.png). Opens when the
// player interacts (E) with a radio placed on the ground; here it's dev-openable via
// GAME.radioPanel.open() for UI review. Tuning drives the deterministic model in radiosim.js.
// NB: first positioning pass — the digital readout floats over the meter; align to taste after review.

import { RADIO, clampFreq, snapReadout, fmtFreq } from './radiosim.js';

const PANEL_IMG = 'assets/ui/radio-panel.png';   // white bg trimmed + corners transparent (see scratchpad/trim.js)
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
    // transparent + blurred backdrop → the game stays visible (blurred) behind the floating panel
    wrap.style.cssText = 'position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(8,11,10,.30);backdrop-filter:blur(7px) saturate(.85);-webkit-backdrop-filter:blur(7px) saturate(.85);user-select:none;-webkit-user-select:none;';
    const row = 'display:flex;justify-content:space-between;gap:14px;margin:5px 0;font-size:13px;';
    wrap.innerHTML =
      '<div class="rp-wrap" style="position:relative;height:88vh;max-height:88vh;">' +
        '<img class="rp-img" src="' + PANEL_IMG + '" alt="Р-105Д" draggable="false" style="height:100%;display:block;image-rendering:pixelated;pointer-events:none;-webkit-user-drag:none;user-select:none;filter:drop-shadow(0 18px 55px rgba(0,0,0,.75));">' +
        // in-panel green VFD frequency readout (floats over the meter)
        '<div class="rp-readout" style="position:absolute;top:3.6%;left:50%;transform:translateX(-50%);text-align:center;font-family:\'Share Tech Mono\',\'Courier New\',monospace;background:rgba(4,10,6,.9);border:1px solid rgba(120,255,170,.4);border-radius:5px;padding:5px 15px;box-shadow:0 0 14px rgba(60,255,150,.3),inset 0 0 12px rgba(0,40,20,.9);">' +
          '<div class="rp-freq" style="font-size:26px;font-weight:700;letter-spacing:2px;color:#7dffb0;text-shadow:0 0 8px rgba(80,255,150,.8);line-height:1;">40.150</div>' +
          '<div style="font-size:9px;letter-spacing:3px;color:#4fe08f;margin-top:2px;">MHz</div>' +
        '</div>' +
        // side legend / log (status + controls)
        '<div class="rp-legend" style="position:absolute;top:50%;left:100%;transform:translateY(-50%);margin-left:26px;min-width:236px;font-family:\'Share Tech Mono\',\'Courier New\',monospace;color:#8fe6b0;background:linear-gradient(180deg,rgba(6,14,9,.93),rgba(4,10,7,.93));border:1px solid rgba(90,220,150,.28);border-radius:8px;padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,.6),inset 0 0 22px rgba(0,30,15,.5);">' +
          '<div style="font-size:15px;font-weight:800;letter-spacing:3px;color:#c9ffe0;border-bottom:1px solid rgba(90,220,150,.25);padding-bottom:7px;margin-bottom:9px;">📻 Р-105Д «АСТРА»</div>' +
          '<div style="' + row + '"><span style="opacity:.6">СТАТУС</span><b class="rp-status">○ ВЫП</b></div>' +
          '<div style="' + row + '"><span style="opacity:.6">ЧАСТОТА</span><b class="rp-lfreq" style="color:#7dffb0">40.150 MHz</b></div>' +
          '<div style="' + row + '"><span style="opacity:.6">ДИАПАЗОН</span><b style="opacity:.85">36.0–46.1</b></div>' +
          '<div style="' + row + '"><span style="opacity:.6">СИГНАЛ</span><b class="rp-signal" style="opacity:.85">—</b></div>' +
          '<div style="border-top:1px solid rgba(90,220,150,.2);margin-top:10px;padding-top:9px;font-size:11px;line-height:1.75;opacity:.82;">' +
            '<div><b style="color:#c9ffe0">scroll</b> · ладить &nbsp;&nbsp; <b style="color:#c9ffe0">⇧+scroll</b> · точно</div>' +
            '<div><b style="color:#c9ffe0">Z</b> · вкл/выкл &nbsp;&nbsp; <b style="color:#c9ffe0">держ. X</b> · передача</div>' +
            '<div><b style="color:#c9ffe0">G</b> · собрать &nbsp;&nbsp; <b style="color:#c9ffe0">E / Esc</b> · закрыть</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    this.el = wrap;
    this.freqEl = wrap.querySelector('.rp-freq');
    this.statusEl = wrap.querySelector('.rp-status');
    this.lfreqEl = wrap.querySelector('.rp-lfreq');
    this.signalEl = wrap.querySelector('.rp-signal');
    this._refresh();
  }

  _refresh() {
    if (!this.freqEl) return;
    const f = fmtFreq(this.freq);
    this.freqEl.textContent = f;
    this.freqEl.style.color = this.on ? '#7dffb0' : '#3a4a40';
    this.freqEl.style.textShadow = this.on ? '0 0 8px rgba(80,255,150,.8)' : 'none';
    if (this.lfreqEl) this.lfreqEl.textContent = f + ' MHz';
    if (this.statusEl) { this.statusEl.textContent = this.on ? '● ЗАП' : '○ ВЫП'; this.statusEl.style.color = this.on ? '#5dff9b' : '#c0554a'; }
    if (this.signalEl) {                                                    // live signal readout — reads voice.js preset stations
      let sig = '—', col = '#5a6a60';
      if (this.on) {
        const sts = (this.game.voice && this.game.voice.stations) || [];
        let best = 999; for (const st of sts) best = Math.min(best, Math.abs(this.freq - st.freq) * 1000);
        if (best < 8) { sig = '████ станция'; col = '#7dffb0'; }
        else if (best < 25) { sig = '▓▒░ шум'; col = '#e0c060'; }
        else { sig = '· · · тихо'; col = '#5a6a60'; }
      }
      this.signalEl.textContent = sig; this.signalEl.style.color = col;
    }
  }

  tune(deltaHz) {
    this.freq = clampFreq(snapReadout(this.freq + deltaHz / 1e6));
    this._refresh();
    this._pushState();
  }
  setFreq(mhz) { this.freq = clampFreq(snapReadout(mhz)); this._refresh(); this._pushState(); } // jump straight to a known freq
  _pushState() {
    const g = this.game;
    if (g.voice) { if (g.voice.setRadioFreq) g.voice.setRadioFreq(this.freq); if (g.voice.setRadioOn) g.voice.setRadioOn(this.on); } // live-monitor the tuning in your ear (real-time static↔signal as you turn the dial)
    if (this.struct && g.build && g.build.setR105State) g.build.setR105State(this.struct, this.freq, this.on); // deployed → ALSO loudspeaker + squad sync
  }

  _pickup() {
    const s = this.struct; this.struct = null; this.close();
    if (s && this.game.build && this.game.build.pickupR105) this.game.build.pickupR105(s);
  }

  toggleOn() { this.on = !this.on; this._refresh(); this._pushState(); }

  open(struct) {
    this._build();
    this.struct = struct || null;
    if (this.struct && typeof this.struct.freq === 'number') this.freq = this.struct.freq;
    if (this.struct && typeof this.struct.on === 'boolean') this.on = this.struct.on;
    this._refresh();
    this._pushState();
    if (this.open_) return;
    this.open_ = true;
    this.el.style.display = 'flex';
    this.game._radioPanelOpen = true;                       // freezes movement (player.controlsPaused) but the SIM keeps running → live tuning audio
    this.game._intentionalUnlock = this.game.input.locked; this.game.input.exitLock(); // free the cursor WITHOUT the pause-on-unlock (mirrors the game's menu pattern)
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('wheel', this._onWheel, { passive: false, capture: true });
  }

  close() {
    if (!this.open_) return;
    const wasStruct = !!this.struct;
    this.open_ = false; this.struct = null;
    if (this.el) this.el.style.display = 'none';
    this.game._radioPanelOpen = false;
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('wheel', this._onWheel, true);
    if (wasStruct && this.game.voice && this.game.voice.setRadioOn) this.game.voice.setRadioOn(false); // deployed radio keeps broadcasting via its loudspeaker, not in your ear
    if (this.game.state === 'playing' && this.game.input) this.game.input.requestLock(); // straight back into the game (re-lock cursor) — NOT the pause menu
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
