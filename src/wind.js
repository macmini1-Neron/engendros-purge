// wind.js — a global gusting WIND field: one slowly-varying {dir, speed} vector that turns four cosmetic
// systems into one learnable TACTICAL variable (Far Cry 2 / Ghost of Tsushima). It steers: fire-spread
// (fire runs downwind, crawls upwind), drifting motes/smoke/embers, foliage sway, and a HUD windsock you
// read before committing ("set the fire upwind of the horde"). Pure fn of a local time accumulator → smooth
// & cheap; gameplay (fire-spread) is host-authoritative so no co-op sync is needed (clients replay host fire).
export class Wind {
  constructor() {
    this.t = Math.PI * 0.37;     // non-zero phase so it doesn't start dead-calm
    this.dir = 0; this.speed = 0.5; this.x = 1; this.z = 0; this.gust = 0;
    this._hud = null; this._arrow = null; this._bar = null;
  }

  // smooth, slowly-drifting direction + base breeze + periodic gusts. dir in radians (XZ plane).
  update(dt) {
    const t = (this.t += Math.min(dt, 0.1));
    this.dir = 1.1 + 0.62 * Math.sin(t * 0.013) + 0.34 * Math.sin(t * 0.031 + 1.7);
    this.gust = Math.max(0, Math.sin(t * 0.11) * Math.sin(t * 0.23 + 1.1));
    this.speed = 0.42 + 0.32 * Math.sin(t * 0.017 + 0.5) + 0.5 * this.gust;   // ~0.1 .. 1.3
    this.x = Math.cos(this.dir); this.z = Math.sin(this.dir);
    if (this._hud) this._drawHUD();
  }

  // unit wind direction (XZ); multiply by .speed for force
  get vx() { return this.x; }
  get vz() { return this.z; }

  // a tiny DOM windsock (built from JS so we don't touch index.html). Appended to <body>; auto-positioned.
  mountHUD() {
    if (this._hud || typeof document === 'undefined') return;
    const wrap = document.createElement('div');
    wrap.id = 'windsock';
    wrap.style.cssText = 'position:fixed;left:16px;top:96px;z-index:40;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;font:700 11px/1 "Rajdhani",system-ui,sans-serif;color:#cdbb8a;letter-spacing:.16em;opacity:.92;text-shadow:0 1px 2px #000;background:rgba(14,16,12,.42);border:1px solid rgba(120,110,80,.35);border-radius:6px;padding:7px 9px';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('width', '46'); svg.setAttribute('height', '46');
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', '16'); ring.setAttribute('cy', '16'); ring.setAttribute('r', '14'); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', 'rgba(120,110,80,.4)'); ring.setAttribute('stroke-width', '1');
    svg.appendChild(ring);
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M16 3 L23 22 L16 17 L9 22 Z');     // a chevron/arrow
    arrow.setAttribute('fill', '#e6c25a'); arrow.setAttribute('stroke', '#1a160e'); arrow.setAttribute('stroke-width', '1.2');
    arrow.style.transformOrigin = '16px 16px';
    svg.appendChild(arrow);
    const bar = document.createElement('div');
    bar.style.cssText = 'width:46px;height:4px;background:#2a2418;border-radius:2px;overflow:hidden';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:40%;background:linear-gradient(90deg,#7a8a4a,#e6c25a);transition:width .25s';
    bar.appendChild(fill);
    const label = document.createElement('div'); label.textContent = 'ВЕТЕР'; label.style.opacity = '.75';
    wrap.appendChild(svg); wrap.appendChild(bar); wrap.appendChild(label);
    document.body.appendChild(wrap);
    this._hud = wrap; this._arrow = arrow; this._bar = fill;
  }
  _drawHUD() {
    // arrow points the way the wind BLOWS (screen-up = +screen). dir is world-XZ; show absolute compass dir.
    const deg = (this.dir * 180 / Math.PI) % 360;
    this._arrow.style.transform = `rotate(${deg}deg)`;
    this._bar.style.width = Math.round(Math.min(1, this.speed / 1.3) * 100) + '%';
  }
  setHUDVisible(v) { if (this._hud) this._hud.style.display = v ? 'flex' : 'none'; }
}

// Shared singleton so consumers (fire-spread, atmosphere motes, foliage) read the wind WITHOUT threading it
// through constructors/update signatures. game.js owns the single `WIND.update(dt)` + `WIND.mountHUD()` call.
// The constructor touches no DOM (mountHUD is guarded) → safe to import in pure/node-tested modules.
export const WIND = new Wind();

