// engine.js — renderer, scene, camera, lighting, sky/fog, and the pixelation
// effect (render at low internal resolution, upscale crisp via CSS).
import * as THREE from 'three';
import { clamp } from './util.js';
import { adaptiveStep } from './graphics.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';

// The held weapon (viewmodel) renders in a SECOND pass on its own layer with a
// freshly-cleared depth buffer: always drawn on top of the world, yet it still
// depth-tests against ITSELF so its parts self-occlude (no see-through artifacts).
export const WEAPON_LAYER = 1;

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.pixelScale = 3; // 1 = crisp, higher = chunkier pixels

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: (() => { try { return JSON.parse(localStorage.getItem('engendros_settings') || '{}').aa === 1; } catch (e) { return false; } })(),
      powerPreference: 'high-performance',
      stencil: false,
    });
    this._renderScale = 1;                                   // graphics-quality render scale (×DPR)
    this._baseDpr = Math.min(window.devicePixelRatio || 1, 2);
    this._adaptive = false;                                  // adaptive resolution on/off
    this._adaptCd = 0;                                       // updateAdaptive() realloc cooldown (frames); explicit init for clarity
    // Bloom post-processing — lazily built on first enable (setBloom). World-only:
    // the world pass goes through the composer, the viewmodel is forward-drawn on top.
    this._bloomOn = false; this._composer = null; this._bloomPass = null;
    this._dbSize = new THREE.Vector2();                      // scratch for the drawing-buffer size
    this._bloomParams = { strength: 0.6, radius: 0.4, threshold: 0.82 };
    this.renderer.setClearColor(0x9fd3e8, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false; // we refresh shadows ourselves (every other frame in render()) — re-rendering the 2048² shadow map EVERY frame is wasted work; 1-frame-stale shadows are imperceptible and it ~halves the shadow pass
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = false; // we drive clears manually for the 2-pass viewmodel render
    this.renderer.info.autoReset = false; // 2-pass render resets stats per render() call → accumulate, reset once per frame in render()

    this.scene = new THREE.Scene();

    // Warm desert sky + distance fog (de_dust2 haze).
    this.skyColor = new THREE.Color(0xbfe3f2);
    this.horizonColor = new THREE.Color(0xe9dcc0);
    this.scene.fog = new THREE.Fog(0xdfd6bd, 70, 320);
    this.scene.background = this.skyColor.clone();

    this.camera = new THREE.PerspectiveCamera(80, 1, 0.05, 1200);
    this.camera.position.set(0, 1.7, 0);

    this._buildSky();
    this._buildLights();

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  _buildLights() {
    // Hemisphere fill (sky/ground bounce) for the soft toy-like look.
    this.hemi = new THREE.HemisphereLight(0xdfeaff, 0xb89b6a, 0.95);
    this.scene.add(this.hemi);

    // Sun — warm directional with shadows.
    this.sun = new THREE.DirectionalLight(0xfff1d0, 2.1);
    this.sun.position.set(60, 110, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -120; s.right = 120; s.top = 120; s.bottom = -120;
    s.near = 1; s.far = 360;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);

    // The viewmodel renders in its own pass on WEAPON_LAYER — let the main lights reach it too
    // (a light only illuminates objects that share one of its layers).
    this.hemi.layers.enable(WEAPON_LAYER);
    this.sun.layers.enable(WEAPON_LAYER);
    this.ambient.layers.enable(WEAPON_LAYER);

    // FX point-light POOL — pre-created ONCE so the scene's point-light COUNT never changes
    // at runtime. Adding/removing a light mid-game forces THREE.js to recompile EVERY lit
    // material's shader program (a measured ~12-program stall = visible stutter). Transient
    // glows (molotov puddles, signal flares) borrow from this fixed pool instead, so the
    // light count stays constant → shaders compile once at load, never mid-game. Lambert
    // lights are evaluated per-vertex, so a dozen idle (intensity-0) pool lights are cheap.
    // pool size: realistic concurrent need is FIRE_POOL_MAX molotovs (4) + a few flares (~6) ≈ 10; 12 gives margin
    this._fxLights = []; this._fxIdx = 0; this._fxTok = 0;
    for (let i = 0; i < 12; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 10, 2);
      L.position.set(0, -999, 0);
      this.scene.add(L);
      this._fxLights.push(L);
    }
  }

  // Borrow an FX point light from the fixed pool (round-robin). Returns a handle { light, tok };
  // keep the handle, move/recolor handle.light each frame while it burns, then releaseFxLight(handle).
  acquireFxLight(color, intensity, distance, decay = 2) {
    const L = this._fxLights[this._fxIdx];
    this._fxIdx = (this._fxIdx + 1) % this._fxLights.length;
    const tok = ++this._fxTok; L.userData.fxTok = tok;
    L.color.setHex(color); L.intensity = intensity; L.distance = distance; L.decay = decay;
    return { light: L, tok };
  }

  // Dim a borrowed light — but ONLY if it hasn't since been re-lent to a newer owner (token guard),
  // so a late release can never snuff out someone else's glow.
  releaseFxLight(h) { if (h && h.light && h.light.userData.fxTok === h.tok) h.light.intensity = 0; }

  // Pooled remote-player flashlight SpotLights. A RemotePlayer used to `new SpotLight` + scene.add on join
  // and scene.remove on leave — each forces THREE to recompile EVERY lit shader (the co-op join/leave hitch,
  // same class of stall as the FX lights above). The pool is built on first borrow (ONE compile, during a
  // co-op load), then reused forever: the scene's light count never changes again, so joins/leaves are free.
  // Idle (intensity-0) spots are per-vertex cheap, and only exist once a co-op session actually starts.
  acquireFlashLight() {
    if (!this._flashPool) {
      this._flashPool = [];
      for (let i = 0; i < 6; i++) {                        // co-op cap is 6 players → ≤5 remote cones; 6 = margin
        const L = new THREE.SpotLight(0xfff0d0, 0, 60, 0.62, 0.4, 0.0), T = new THREE.Object3D();
        L.target = T; L.position.set(0, -999, 0); this.scene.add(L); this.scene.add(T);
        this._flashPool.push({ light: L, target: T, inUse: false });
      }
    }
    for (const h of this._flashPool) if (!h.inUse) { h.inUse = true; h.light.intensity = 0; return h; }
    const L = new THREE.SpotLight(0xfff0d0, 0, 60, 0.62, 0.4, 0.0), T = new THREE.Object3D(); // backstop overflow (one rare recompile)
    L.target = T; this.scene.add(L); this.scene.add(T);
    const h = { light: L, target: T, inUse: true }; this._flashPool.push(h); return h;
  }
  releaseFlashLight(h) { if (h) { h.inUse = false; h.light.intensity = 0; h.light.position.set(0, -999, 0); } }

  _buildSky() {
    // Big gradient dome.
    const geo = new THREE.SphereGeometry(600, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x4f9fd6) },
        mid: { value: new THREE.Color(0xbfe3f2) },
        bot: { value: new THREE.Color(0xe9dcc0) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `
        varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){
          float h = normalize(vP).y;
          vec3 c = h > 0.0 ? mix(mid, top, pow(h,0.6)) : mix(mid, bot, pow(-h,0.5));
          gl_FragColor = vec4(c,1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // A couple of slow drifting cloud billboards for life.
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    for (let i = 0; i < 14; i++) {
      const w = 30 + Math.random() * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.5), cloudMat);
      m.position.set((Math.random() - 0.5) * 600, 120 + Math.random() * 90, (Math.random() - 0.5) * 600);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = -1;
      this.clouds.add(m);
    }
    this.scene.add(this.clouds);
  }

  setPixelScale() { /* pixelization removed — the renderer is always full-resolution / crisp */ }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Full native resolution (crisp); cap DPR at 2 so 4K/retina stays performant.
    this._baseDpr = Math.min(window.devicePixelRatio || 1, 2);
    this._applyPixelRatio();
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this._syncComposerSize(); // after setSize → composer targets follow the new drawing buffer
  }

  setFov(fov) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setExposure(v) { this.renderer.toneMappingExposure = clamp(v, 0.4, 2.0); }

  // Bloom on/off. Builds the composer once on first enable (cheap to keep idle once built).
  setBloom(on) {
    on = !!on;
    if (on && !this._composer) this._buildComposer();
    this._bloomOn = on;
  }
  _buildComposer() {
    this.renderer.getDrawingBufferSize(this._dbSize);
    // Match the world pass's MSAA to the AA setting (canvas-level MSAA doesn't reach a render target).
    let samples = 0;
    try { samples = JSON.parse(localStorage.getItem('engendros_settings') || '{}').aa === 1 ? 4 : 0; } catch (e) {}
    // HDR target so values >1 survive into the bloom threshold; depth buffer for the 3D world pass.
    const rt = new THREE.WebGLRenderTarget(this._dbSize.x, this._dbSize.y, { type: THREE.HalfFloatType, samples });
    this._composer = new EffectComposer(this.renderer, rt);
    this._composer.setPixelRatio(1); // we drive size from the real drawing buffer ourselves
    const p = this._bloomParams;
    this._bloomPass = new UnrealBloomPass(this._dbSize.clone(), p.strength, p.radius, p.threshold);
    this._composer.addPass(new RenderPass(this.scene, this.camera));
    this._composer.addPass(this._bloomPass);
    this._composer.addPass(new OutputPass()); // re-applies renderer.toneMapping + sRGB → tone matches the direct path
    this._syncComposerSize();
  }
  // Keep the composer's internal targets the size of the real drawing buffer (DPR × renderScale).
  _syncComposerSize() {
    if (!this._composer) return;
    this.renderer.getDrawingBufferSize(this._dbSize);
    this._composer.setSize(this._dbSize.x, this._dbSize.y);
  }

  _applyPixelRatio() {
    this.renderer.setPixelRatio(this._baseDpr * this._renderScale);
    this._syncComposerSize(); // adaptive-resolution path: pixelRatio changed → resize composer in lockstep
  }
  setRenderScale(scale) {
    this._renderScale = Math.max(0.5, Math.min(1, scale));
    this._applyPixelRatio();
  }
  setAdaptive(on) { this._adaptive = !!on; if (!on) { this._renderScale = 1; this._applyPixelRatio(); } }
  // Called each frame with the smoothed frame time; nudges render scale to hold ~60fps.
  updateAdaptive(frameMs) {
    if (!this._adaptive || !(frameMs > 0)) return;
    // A scale change reallocates the composer render targets — expensive. Gate it to ~every 30 frames so
    // the realloc can't fire every frame (the "cure" hitching) or oscillate across the target-band boundary.
    if (this._adaptCd > 0) { this._adaptCd--; return; }
    const next = adaptiveStep(this._renderScale, frameMs, { targetMs: 16.7 });
    if (next !== this._renderScale) { this._renderScale = next; this._applyPixelRatio(); this._adaptCd = 30; }
  }
  setShadowQuality(px) {
    const want = px | 0;
    if (!want) { // shadows off
      if (this.renderer.shadowMap.enabled) {
        this.renderer.shadowMap.enabled = false; this.sun.castShadow = false;
        if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } // free the GPU texture
      }
      return;
    }
    if (this.renderer.shadowMap.enabled && this.sun.shadow.mapSize.x === want) return; // already at this size → no rebuild
    this.renderer.shadowMap.enabled = true; this.sun.castShadow = true;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } // resize → force rebuild
    this.sun.shadow.mapSize.set(want, want);
  }

  update(dt) {
    this._lastDt = dt;                                    // stashed for the trauma-shake decay in render() (no dt there)
    if (this.clouds) this.clouds.position.x += dt * 1.2;
    if (this.clouds && this.clouds.position.x > 300) this.clouds.position.x -= 600;
    // Keep sky centered on camera.
    this.sky.position.copy(this.camera.position);
  }

  // Trauma-model screen shake (Eiserloh, GDC 2016): callers add 0..1 of "trauma"; the actual
  // shake is trauma² so a big boom BOOMS and a small tick barely quivers — one knob, huge dynamic
  // range. Legacy shake(a) routes straight into trauma at the same numeric range it always used
  // (an explosion's shake(0.5) lands at ~the old offset, so existing call-sites keep their feel).
  addTrauma(t) { this._trauma = Math.min(1, (this._trauma || 0) + t); }
  shake(a) { this.addTrauma(a); }

  render() {
    this.renderer.info.reset(); // once per frame; both passes below accumulate into info.render for the F3 stats
    // Apply camera shake as a transient per-frame offset.
    // The player/controller re-sets camera.position authoritatively every frame
    // before render() is called, so this offset is safely discarded next frame.
    const tr = this._trauma || 0;
    if (tr > 0.001) {
      const m = tr * tr;                                  // quadratic: reserves the ceiling for big hits
      const s = m * 0.6;                                  // positional magnitude (shake(0.5)→0.15, matches the old linear feel; trauma 1.0→0.6, a real wallop)
      this.camera.position.x += (Math.random() * 2 - 1) * s;
      this.camera.position.y += (Math.random() * 2 - 1) * s;
      this.camera.position.z += (Math.random() * 2 - 1) * s;
      this.camera.rotateZ((Math.random() * 2 - 1) * m * 0.012); // tiny roll kick (transient; player re-sets rotation next frame) — only meaningful at high trauma
      this._trauma = Math.max(0, tr - (this._lastDt || 0.016) * 2.8); // decay per-second (frame-rate independent): full trauma settles in ~0.35 s
    } else this._trauma = 0;
    // Two-pass render: world first, then wipe depth and draw the viewmodel on top.
    const r = this.renderer, cam = this.camera, sc = this.scene;
    // Refresh the (autoUpdate-off) shadow map every other frame — must be set before the world pass
    // that builds it. Halves the shadow-pass cost; moving casters' shadows lag at most one frame.
    this._shadowTick = (this._shadowTick || 0) + 1;
    r.shadowMap.needsUpdate = (this._shadowTick % 2) === 0;
    if (this._bloomOn && this._composer) {
      // Pass 1 (world, layer 0) runs through the bloom composer to the screen; the viewmodel
      // is then forward-rendered on top with a fresh depth buffer (same depth trick as below).
      cam.layers.set(0);
      this._composer.render();          // world → UnrealBloom → OutputPass(tonemap+sRGB) → screen
      r.setRenderTarget(null);
      r.clearDepth();                   // wipe ONLY depth so the weapon can't lose a depth test to the world…
      const bg = sc.background; sc.background = null; // …and don't repaint the sky over the composited frame
      cam.layers.set(WEAPON_LAYER);     // pass 2 — the viewmodel, self-occluding (depthTest stays on)
      r.render(sc, cam);
      sc.background = bg;
      cam.layers.set(0);                // restore the default layer (raycasts / game logic expect it)
    } else {
      r.clear();                          // autoClear is off → clear colour+depth ourselves
      cam.layers.set(0);                  // pass 1 — the world (default layer)
      r.render(sc, cam);
      r.clearDepth();                     // wipe ONLY depth so the weapon can never lose a depth test to the world…
      const bg = sc.background; sc.background = null; // …and don't repaint the sky over the world in pass 2
      cam.layers.set(WEAPON_LAYER);       // pass 2 — the viewmodel, self-occluding (its materials keep depthTest on)
      r.render(sc, cam);
      sc.background = bg;
      cam.layers.set(0);                  // restore the default layer (raycasts / game logic expect it)
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
  }
}
