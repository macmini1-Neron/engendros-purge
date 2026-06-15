// Pure graphics-quality config + adaptive-resolution controller. NO THREE → node-testable.
// renderScale multiplies the device pixel ratio (0.5 = quarter the pixels, sharpness↓ not textures↓);
// shadowQ is the directional shadow-map size (0 = shadows off); drawDist in metres (0 = unlimited);
// aa = MSAA on/off (applied at renderer construction, i.e. on reload).
export const GFX_PRESETS = {
  Low:    { renderScale: 0.6, shadowQ: 0,    drawDist: 220, aa: 0 },
  Medium: { renderScale: 0.85, shadowQ: 1024, drawDist: 0,   aa: 0 },
  High:   { renderScale: 1.0, shadowQ: 2048, drawDist: 0,   aa: 1 },
};

export function presetConfig(name) {
  return GFX_PRESETS[name] || GFX_PRESETS.High;
}

// One adaptive step: nudge renderScale toward the frame-time target. Dead-band around the target
// prevents oscillation; STEP bounds how fast it moves; clamped to [MIN, MAX].
export function adaptiveStep(scale, frameMs, opts = {}) {
  const targetMs = opts.targetMs != null ? opts.targetMs : 16.7; // 60 fps
  const MIN = opts.min != null ? opts.min : 0.5;
  const MAX = opts.max != null ? opts.max : 1.0;
  const STEP = opts.step != null ? opts.step : 0.05;
  const band = opts.band != null ? opts.band : 0.15; // ±15% dead-band
  const hi = targetMs * (1 + band), lo = targetMs * (1 - band);
  let next = scale;
  if (frameMs > hi) next = scale - STEP;        // too slow → fewer pixels
  else if (frameMs < lo) next = scale + STEP;   // headroom → more pixels
  return Math.max(MIN, Math.min(MAX, next));
}
