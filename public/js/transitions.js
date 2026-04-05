/**
 * transitions.js — Full-screen GLSL transition effects
 *
 * Uses a Three.js orthographic scene + fullscreen quad to render
 * dissolve, warp/portal, and fade effects between story points.
 */

import * as THREE from 'three';

// ── Shader sources ────────────────────────────────────────────────────────────

const BASE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FADE_FRAG = /* glsl */ `
  uniform float uProgress;
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, uProgress);
  }
`;

const DISSOLVE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uProgress;
  uniform sampler2D uNoise;

  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453);
  }

  void main() {
    float noise = rand(vUv * 17.3 + uProgress * 0.1);
    float edge = smoothstep(uProgress - 0.15, uProgress + 0.15, noise);
    gl_FragColor = vec4(0.02, 0.04, 0.08, edge);
  }
`;

const WARP_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uProgress;
  uniform float uTime;

  void main() {
    vec2 uv = vUv - 0.5;
    float r = length(uv);
    float angle = atan(uv.y, uv.x) + uTime * 2.0;
    float spiral = abs(sin(angle * 6.0 + r * 20.0 - uTime * 8.0));
    float mask = smoothstep(uProgress + 0.05, uProgress - 0.05, r);
    vec3 col = mix(
      vec3(0.0, 0.0, 0.05),
      vec3(0.3, 0.0, 0.6) * spiral + vec3(0.0, 0.3, 0.8) * (1.0 - spiral),
      mask
    );
    float alpha = mask * (0.6 + 0.4 * spiral);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Transition types ──────────────────────────────────────────────────────────
export const TransitionType = {
  FADE: 'fade',
  DISSOLVE: 'dissolve',
  WARP: 'warp',
};

export class TransitionManager {
  _renderer;
  _orthoScene;
  _orthoCamera;
  _quad;
  _material = null;
  _clock = new THREE.Clock(false);

  constructor(renderer) {
    this._renderer = renderer;
    this._orthoScene = new THREE.Scene();
    this._orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this._orthoScene.add(this._quad);
  }

  /**
   * Play a transition effect.
   * @param {string} type - One of TransitionType values
   * @param {number} duration - Duration in milliseconds
   * @param {'in'|'out'} direction - 'in' fades to black, 'out' reveals scene
   */
  play(type, duration = 1000, direction = 'in') {
    return new Promise((resolve) => {
      const fragShader = this._getShader(type);
      if (this._material) this._material.dispose();

      this._material = new THREE.ShaderMaterial({
        vertexShader: BASE_VERT,
        fragmentShader: fragShader,
        uniforms: {
          uProgress: { value: direction === 'in' ? 0 : 1 },
          uColor: { value: new THREE.Color(0x020408) },
          uTime: { value: 0 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });

      this._quad.material = this._material;

      const startTime = performance.now();
      this._clock.start();

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const rawT = Math.min(elapsed / duration, 1);
        const t = direction === 'in' ? rawT : 1 - rawT;

        this._material.uniforms.uProgress.value = t;
        this._material.uniforms.uTime.value = this._clock.getElapsedTime();

        // Render the transition quad on top
        const prevAutoClear = this._renderer.autoClear;
        this._renderer.autoClear = false;
        this._renderer.render(this._orthoScene, this._orthoCamera);
        this._renderer.autoClear = prevAutoClear;

        if (rawT < 1) {
          requestAnimationFrame(animate);
        } else {
          this._clock.stop();
          // Hide quad after 'out' direction finishes
          if (direction === 'out') this._quad.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  /** Fade to black, then reveal. Combined in/out. */
  async crossFade(type = TransitionType.FADE, halfDuration = 600) {
    await this.play(type, halfDuration, 'in');
    await this.play(type, halfDuration, 'out');
  }

  _getShader(type) {
    switch (type) {
      case TransitionType.DISSOLVE: return DISSOLVE_FRAG;
      case TransitionType.WARP: return WARP_FRAG;
      case TransitionType.FADE:
      default: return FADE_FRAG;
    }
  }
}
