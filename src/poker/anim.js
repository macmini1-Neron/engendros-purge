// Pure animation math (no THREE). Browser glue lerps THREE vectors with these;
// node tests cover the curves + the stepper.
export const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
export function easeOutBack(p) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }

export class Tween {
  constructor(dur, delay = 0) { this.dur = Math.max(1e-4, dur); this.delay = delay; this.t = 0; this.p = 0; this.done = false; }
  step(dt) {
    this.t += dt;
    const active = Math.max(0, this.t - this.delay);
    this.p = Math.min(1, active / this.dur);
    this.done = this.t >= this.delay + this.dur;
    return this.p;
  }
}
