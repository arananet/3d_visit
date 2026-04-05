/**
 * transitions.js — Full-screen GLSL transition effects
 *
 * Renders a fullscreen quad on top of the main scene by registering an
 * overlay callback with SceneManager (autoClear=false, drawn after main scene).
 * This avoids any RAF loop conflicts with the main renderer.
 */

import * as THREE from 'three';

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

const FADE_FRAG = /* glsl */`
  uniform float uProgress;
  uniform vec3  uColor;
  void main() {
    gl_FragColor = vec4(uColor, uProgress);
  }
`;

const DISSOLVE_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform float uProgress;

  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    float noise = rand(gl_FragCoord.xy * 0.003 + uProgress * 0.1);
    float alpha  = smoothstep(uProgress - 0.15, uProgress + 0.15, noise);
    gl_FragColor = vec4(0.02, 0.04, 0.08, alpha);
  }
`;

const WARP_FRAG = /* glsl */`
  uniform float uProgress;
  uniform float uTime;
  void main() {
    vec2 uv = (gl_FragCoord.xy / vec2(${window.innerWidth}.0, ${window.innerHeight}.0)) - 0.5;
    float r      = length(uv);
    float angle  = atan(uv.y, uv.x) + uTime * 2.0;
    float spiral = abs(sin(angle * 6.0 + r * 20.0 - uTime * 8.0));
    float mask   = smoothstep(uProgress + 0.05, uProgress - 0.05, r);
    vec3  col    = mix(
      vec3(0.0, 0.0, 0.05),
      vec3(0.3, 0.0, 0.6) * spiral + vec3(0.0, 0.3, 0.8) * (1.0 - spiral),
      mask
    );
    gl_FragColor = vec4(col, mask * (0.6 + 0.4 * spiral));
  }
`;

export const TransitionType = { FADE: 'fade', DISSOLVE: 'dissolve', WARP: 'warp' };

// ── Manager ───────────────────────────────────────────────────────────────────

export class TransitionManager {
  constructor(sceneManager) {
    this._sm = sceneManager;

    // Shared orthographic scene + fullscreen quad
    this._orthoScene  = new THREE.Scene();
    this._orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this._quad.frustumCulled = false;
    this._orthoScene.add(this._quad);

    this._material  = null;
    this._startTime = null;
    this._duration  = 0;
    this._direction = 'in';
    this._resolve   = null;
    this._elapsed   = 0;

    // Register overlay callback — runs every frame, draws when active
    this._sm.addOverlayCallback(() => this._draw());
  }

  /**
   * Play a transition effect.
   * @param {string}  type       — TransitionType value
   * @param {number}  duration   — milliseconds
   * @param {'in'|'out'} direction — 'in' covers scene, 'out' reveals it
   */
  play(type, duration = 800, direction = 'in') {
    return new Promise((resolve) => {
      if (this._material) this._material.dispose();

      this._material = new THREE.ShaderMaterial({
        vertexShader:   VERT,
        fragmentShader: this._shader(type),
        uniforms: {
          uProgress: { value: direction === 'in' ? 0.0 : 1.0 },
          uColor:    { value: new THREE.Color(0x020408) },
          uTime:     { value: 0.0 },
        },
        transparent: true,
        depthTest:   false,
        depthWrite:  false,
      });

      this._quad.material = this._material;
      this._startTime = performance.now();
      this._duration  = duration;
      this._direction = direction;
      this._resolve   = resolve;
    });
  }

  _draw() {
    if (!this._material || !this._startTime) return;

    const rawT    = Math.min((performance.now() - this._startTime) / this._duration, 1);
    const progress = this._direction === 'in' ? rawT : 1 - rawT;

    this._material.uniforms.uProgress.value = progress;
    this._material.uniforms.uTime.value     = (performance.now() - this._startTime) / 1000;

    this._sm.renderer.render(this._orthoScene, this._orthoCamera);

    if (rawT >= 1) {
      this._startTime = null;
      if (this._direction === 'out') {
        // Fully revealed — replace material with invisible one
        this._quad.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
      }
      const cb = this._resolve;
      this._resolve = null;
      cb?.();
    }
  }

  _shader(type) {
    switch (type) {
      case TransitionType.DISSOLVE: return DISSOLVE_FRAG;
      case TransitionType.WARP:     return WARP_FRAG;
      default:                      return FADE_FRAG;
    }
  }
}
