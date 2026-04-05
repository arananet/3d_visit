/**
 * scene-manager.js — Three.js renderer, camera, and animation loop
 */

import * as THREE from 'three';

export class SceneManager {
  /** @type {HTMLCanvasElement} */
  canvas;
  /** @type {THREE.WebGLRenderer} */
  renderer;
  /** @type {THREE.Scene} */
  scene;
  /** @type {THREE.PerspectiveCamera} */
  camera;

  // Active animation mixins (called each frame by external systems)
  _frameCallbacks = new Set();

  // Camera animation state
  _cameraAnim = null;

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
      logarithmicDepthBuffer: true, // required for 3D Tiles depth precision
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050a14);
    this.scene.fog = new THREE.Fog(0x050a14, 5000, 80000);
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1_000_000
    );
    // Start high above Barcelona
    this.camera.position.set(0, 8000, 0);
    this.camera.lookAt(0, 0, 0);
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffd9a0, 1.2);
    sun.position.set(5000, 10000, 5000);
    this.scene.add(sun);
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  /** Called once after construction to begin the render loop. */
  start() {
    return new Promise((resolve) => {
      this._loop();
      resolve();
    });
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    // Advance camera animation
    if (this._cameraAnim) this._cameraAnim.tick();

    // External per-frame callbacks (tiles update, splat update, etc.)
    for (const cb of this._frameCallbacks) cb();

    this.renderer.render(this.scene, this.camera);
  }

  /** Register a per-frame callback (returns a deregister fn). */
  addFrameCallback(fn) {
    this._frameCallbacks.add(fn);
    return () => this._frameCallbacks.delete(fn);
  }

  /**
   * Smoothly fly the camera to a target position + lookAt over `duration` ms.
   * Returns a Promise that resolves when the animation completes.
   */
  flyTo({ position, target = new THREE.Vector3(0, 0, 0), duration = 3000 }) {
    return new Promise((resolve) => {
      const startPos = this.camera.position.clone();
      const startTarget = new THREE.Vector3();
      this.camera.getWorldDirection(startTarget);
      startTarget.multiplyScalar(100).add(this.camera.position);

      const endPos = new THREE.Vector3(...(Array.isArray(position) ? position : [position.x, position.y, position.z]));
      const endTarget = target instanceof THREE.Vector3 ? target : new THREE.Vector3(...target);

      const clock = new THREE.Clock();
      clock.start();

      this._cameraAnim = {
        tick: () => {
          const elapsed = clock.getElapsedTime() * 1000;
          const t = Math.min(elapsed / duration, 1);
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

  /** Remove all objects added by a specific scene (by userData.sceneId). */
  clearScene(sceneId) {
    const toRemove = [];
    this.scene.traverse((obj) => {
      if (obj.userData.sceneId === sceneId) toRemove.push(obj);
    });
    for (const obj of toRemove) {
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    }
  }
}

// ── Easing ────────────────────────────────────────────────────────────────────
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
