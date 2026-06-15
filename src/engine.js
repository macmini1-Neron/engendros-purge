// engine.js — renderer, scene, camera, lighting, sky/fog, and the pixelation
// effect (render at low internal resolution, upscale crisp via CSS).
import * as THREE from 'three';
import { clamp } from './util.js';
import { adaptiveStep } from './graphics.js';

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
    this.renderer.setClearColor(0x9fd3e8, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false; // we refresh shadows ourselves (every other frame in render()) — re-rendering the 2048² shadow map EVERY frame is wasted work; 1-frame-stale shadows are imperceptible and it ~halves the shadow pass
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = false; // we drive clears manually for the 2-pass viewmodel render

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
  }

  setFov(fov) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  _applyPixelRatio() {
    this.renderer.setPixelRatio(this._baseDpr * this._renderScale);
  }
  setRenderScale(scale) {
    this._renderScale = Math.max(0.5, Math.min(1, scale));
    this._applyPixelRatio();
  }
  setAdaptive(on) { this._adaptive = !!on; if (!on) { this._renderScale = 1; this._applyPixelRatio(); } }
  // Called each frame with the smoothed frame time; nudges render scale to hold ~60fps.
  updateAdaptive(frameMs) {
    if (!this._adaptive || !(frameMs > 0)) return;
    const next = adaptiveStep(this._renderScale, frameMs, { targetMs: 16.7 });
    if (next !== this._renderScale) { this._renderScale = next; this._applyPixelRatio(); }
  }
  setShadowQuality(px) {
    if (!px) { this.renderer.shadowMap.enabled = false; this.sun.castShadow = false; return; }
    this.renderer.shadowMap.enabled = true; this.sun.castShadow = true;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } // force rebuild at new size
    this.sun.shadow.mapSize.set(px, px);
  }

  update(dt) {
    if (this.clouds) this.clouds.position.x += dt * 1.2;
    if (this.clouds && this.clouds.position.x > 300) this.clouds.position.x -= 600;
    // Keep sky centered on camera.
    this.sky.position.copy(this.camera.position);
  }

  shake(a) { this._shake = Math.min(0.6, (this._shake || 0) + a); }

  render() {
    // Apply camera shake as a transient per-frame offset.
    // The player/controller re-sets camera.position authoritatively every frame
    // before render() is called, so this offset is safely discarded next frame.
    if (this._shake > 0) {
      const s = this._shake * 0.3;
      this.camera.position.x += (Math.random() - 0.5) * 2 * s;
      this.camera.position.y += (Math.random() - 0.5) * 2 * s;
      this.camera.position.z += (Math.random() - 0.5) * 2 * s;
      this._shake *= 0.85;
      if (this._shake < 0.005) this._shake = 0;
    }
    // Two-pass render: world first, then wipe depth and draw the viewmodel on top.
    const r = this.renderer, cam = this.camera, sc = this.scene;
    // Refresh the (autoUpdate-off) shadow map every other frame — must be set before the world pass
    // that builds it. Halves the shadow-pass cost; moving casters' shadows lag at most one frame.
    this._shadowTick = (this._shadowTick || 0) + 1;
    r.shadowMap.needsUpdate = (this._shadowTick % 2) === 0;
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

  dispose() {
    window.removeEventListener('resize', this._onResize);
  }
}
