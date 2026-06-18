// Pure frame-hitch metrics for the perf stress harness. No THREE import → node-testable.
// A "hitch" is a frame whose wall time exceeded a threshold (50ms = noticeable, 100ms = a real stall).

export function hitchStats(samplesMs) {
  const n = samplesMs.length;
  if (!n) return { count: 0, worstMs: 0, p99Ms: 0, hitches50: 0, hitches100: 0 };
  let worst = 0, h50 = 0, h100 = 0;
  for (const ms of samplesMs) {
    if (ms > worst) worst = ms;
    if (ms > 50) h50++;
    if (ms > 100) h100++;
  }
  const sorted = samplesMs.slice().sort((a, b) => a - b);
  const p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))];
  return { count: n, worstMs: worst, p99Ms: p99, hitches50: h50, hitches100: h100 };
}

// Stateful collector: sample one frame-time per frame; tag frames with a "cause" so a
// hitch can be attributed to what happened that frame (boss-fire / drop-build / spawn / …).
export class HitchLogger {
  constructor() { this.reset(); }
  reset() { this._samples = []; this._causes = {}; this._tag = null; }
  setCause(tag) { this._tag = tag; }
  clearCause() { this._tag = null; }
  sample(ms, cause = this._tag) {
    this._samples.push(ms);
    if (cause && ms > 50) this._causes[cause] = (this._causes[cause] || 0) + 1;
  }
  report() { return { ...hitchStats(this._samples), causes: { ...this._causes } }; }
}
