/**
 * scene-manager.js — Three.js renderer, camera, and animation loop
 *
 * The render loop runs via requestAnimationFrame and calls three kinds of
 * registered callbacks in order every frame:
 *   1. frameCallbacks  — update logic (tiles, splats, etc.)
 *   2. renderer.render — main scene draw
 *   3. overlayCallbacks — drawn on top with autoClear=false (transitions)
 */

import * as THREE from 'three';

export class SceneManager {
  canvas;
  renderer;
  scene;
  camera;

  _frameCallbacks = new Set();
  _overlayCallbacks = new Set();
  _cameraAnim = null;
  _mapsConfig = null; // cached { tilesetUrl }

  constructor(canvas) {
    this.canvas = canvas;
    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initLights();
    this._bindResize();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      logarithmicDepthBuffer: true, // required for Google 3D Tiles depth precision
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Mediterranean sky
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1_000_000
    );
    // Start high above the Sagrada Família — overridden once tiles load
    this.camera.position.set(0, 8000, 0);
    this.camera.lookAt(0, 0, 0);
  }

  _initLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.2);
    sun.position.set(5000, 10000, 5000);
    this.scene.add(sun);
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /** Fetch and cache the maps config from the server. */
  async preloadMapsConfig() {
    try {
      const res = await fetch('/api/maps-config');
      if (!res.ok) throw new Error(`maps-config ${res.status}`);
      this._mapsConfig = await res.json();
    } catch (err) {
      console.warn('[scene-manager] Maps config unavailable:', err.message);
      this._mapsConfig = null;
    }
    return this._mapsConfig;
  }

  getMapsConfig() {
    return this._mapsConfig;
  }

  /** Start the render loop. */
  start() {
    this._loop();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    // 1. Per-frame update callbacks (tiles, splats)
    for (const cb of this._frameCallbacks) {
      try { cb(); } catch (e) { console.warn('[frame cb]', e.message); }
    }

    // 2. Advance camera animation
    if (this._cameraAnim) this._cameraAnim.tick();

    // 3. Main scene render
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);

    // 4. Overlay callbacks (transitions rendered on top, no clear)
    if (this._overlayCallbacks.size > 0) {
      this.renderer.autoClear = false;
      for (const cb of this._overlayCallbacks) {
        try { cb(); } catch (e) { console.warn('[overlay cb]', e.message); }
      }
      this.renderer.autoClear = true;
    }
  }

  /** Register a per-frame update callback. Returns a deregister function. */
  addFrameCallback(fn) {
    this._frameCallbacks.add(fn);
    return () => this._frameCallbacks.delete(fn);
  }

  /**
   * Register a callback that renders on top of the main scene each frame
   * (autoClear is false when it runs). Returns a deregister function.
   */
  addOverlayCallback(fn) {
    this._overlayCallbacks.add(fn);
    return () => this._overlayCallbacks.delete(fn);
  }

  /**
   * Smoothly fly the camera to a position + lookAt target.
   * @param {{ position: THREE.Vector3|number[], target?: THREE.Vector3|number[], duration?: number }}
   */
  flyTo({ position, target = [0, 0, 0], duration = 3000 }) {
    return new Promise((resolve) => {
      const startPos = this.camera.position.clone();

      // Compute current look-at target as a point 100 units ahead
      const startTarget = new THREE.Vector3();
      this.camera.getWorldDirection(startTarget);
      startTarget.multiplyScalar(100).add(this.camera.position);

      const endPos = toVec3(position);
      const endTarget = toVec3(target);

      const startTime = performance.now();

      this._cameraAnim = {
        tick: () => {
          const t = Math.min((performance.now() - startTime) / duration, 1);
          const ease = easeInOutCubic(t);

          this.camera.position.lerpVectors(startPos, endPos, ease);

          const lerpedTarget = new THREE.Vector3().lerpVectors(startTarget, endTarget, ease);
          this.camera.lookAt(lerpedTarget);

          if (t >= 1) {
            this._cameraAnim = null;
            resolve();
          }
        },
      };
    });
  }

  /** Remove all objects tagged with a given sceneId from userData. */
  clearScene(sceneId) {
    const toRemove = [];
    this.scene.traverse((obj) => {
      if (obj.userData.sceneId === sceneId) toRemove.push(obj);
    });
    for (const obj of toRemove) {
      this.scene.remove(obj);
      obj.geometry?.dispose();
      [obj.material].flat().forEach((m) => m?.dispose());
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toVec3(v) {
  if (v instanceof THREE.Vector3) return v.clone();
  if (Array.isArray(v)) return new THREE.Vector3(...v);
  return new THREE.Vector3(v.x, v.y, v.z);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
