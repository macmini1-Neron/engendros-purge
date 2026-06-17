// input.js — keyboard, mouse, pointer-lock. Frame-stepped: call endFrame() after
// each update so "pressed-this-frame" edges and accumulated mouse delta reset.
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.down = new Set();        // keys currently held (by event.code)
    this.pressed = new Set();     // keys that went down this frame
    this.released = new Set();    // keys that went up this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = [false, false, false]; // left, middle, right
    this.buttonsPressed = [false, false, false];
    this.locked = false;
    this._listeners = {};
    this.enabled = true;

    this._bind();
  }

  on(ev, fn) { (this._listeners[ev] ||= []).push(fn); }
  _emit(ev, ...a) { (this._listeners[ev] || []).forEach((f) => f(...a)); }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      this._emit('key', e.code, e); // pass the event so a handler can preventDefault (e.g. the key that opens the console must not also type into it)
      // Prevent page scroll for game keys.
      if ([ 'Space', 'ArrowUp', 'ArrowDown', 'Tab' ].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button < 3) { this.buttons[e.button] = true; this.buttonsPressed[e.button] = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button < 3) this.buttons[e.button] = false;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY || e.deltaX); // Shift+wheel comes through as horizontal scroll (deltaX, deltaY=0) — fall back to it
    }, { passive: true });
    window.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      this._emit(this.locked ? 'lock' : 'unlock');
      if (!this.locked) { this.down.clear(); this.buttons = [false, false, false]; }
    });
  }

  requestLock() {
    if (!this.locked && this.dom.requestPointerLock) {
      const p = this.dom.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }
  exitLock() {
    if (this.locked && document.exitPointerLock) {
      const p = document.exitPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }
  // Movement axis helpers (support WASD + arrows)
  get forward() { return (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0); }
  get strafe() { return (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0); }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttonsPressed = [false, false, false];
  }
}
