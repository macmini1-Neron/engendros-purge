// Generic round-robin object pool with a token guard. No THREE import → node-testable.
// Pre-allocates `size` elements via factory(i) ONCE; acquire() hands back the oldest slot
// round-robin so callers never allocate on the hot path. The token guard lets a late
// release() detect that its slot has already been re-acquired by a newer owner (same idiom
// as the FX point-light pool in engine.js). Callers own visibility/reset of the returned obj.
export class RoundRobinPool {
  constructor(size, factory) {
    this._objs = [];
    this._tok = new Array(size).fill(0);
    this._next = 0;
    for (let i = 0; i < size; i++) this._objs.push(factory(i));
  }
  acquire() {
    const i = this._next;
    this._next = (this._next + 1) % this._objs.length;
    this._tok[i]++;
    return { obj: this._objs[i], tok: this._tok[i], _i: i };
  }
  isStale(handle) { return !handle || this._tok[handle._i] !== handle.tok; }
  release(handle) { return !this.isStale(handle); }
  get size() { return this._objs.length; }
  forEach(fn) { this._objs.forEach(fn); }
}
