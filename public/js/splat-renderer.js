/**
 * splat-renderer.js — Gaussian Splat loader + renderer via SparkJS
 *
 * SparkJS is World Labs' open-source renderer for SPZ Gaussian Splats.
 * It integrates with Three.js as a standard Object3D.
 *
 * CDN: https://unpkg.com/@sparkjsdev/spark/dist/spark.module.js
 */

const SPARK_CDN = 'https://unpkg.com/@sparkjsdev/spark/dist/spark.module.js';

let _SparkModule = null;

async function getSparkModule() {
  if (_SparkModule) return _SparkModule;
  try {
    _SparkModule = await import(SPARK_CDN);
    return _SparkModule;
  } catch (err) {
    throw new Error(`Failed to load SparkJS from CDN: ${err.message}`);
  }
}

export class SplatRenderer {
  /** @type {import('./scene-manager.js').SceneManager} */
  _sm;
  /** @type {THREE.Object3D|null} currently loaded splat object */
  _currentSplat = null;
  /** @type {string|null} style key of the currently rendered splat */
  _currentStyle = null;
  /** @type {Function|null} */
  _deregister = null;

  constructor(sceneManager) {
    this._sm = sceneManager;
  }

  /**
   * Load and display a Gaussian Splat world.
   *
   * @param {object} assets - World asset object from WorldLabsClient.getAssets()
   * @param {'cyberpunk'|'sketch'|'futuristic'} style - Used for logging/tagging
   */
  async loadWorld(assets, style) {
    await this.dispose(); // remove previous splat

    const spark = await getSparkModule();

    // Prefer 500k resolution — good quality / performance balance
    const spzUrl = assets.splats?.url500k ?? assets.splats?.url100k ?? assets.splats?.urlFullRes;
    if (!spzUrl) throw new Error(`No SPZ URL available for style: ${style}`);

    console.log(`[splat-renderer] Loading ${style} splat from:`, spzUrl);

    // SparkJS SplatMesh / SplatLoader pattern
    // The exact API depends on the SparkJS version; we handle both common patterns.
    let splatObject;

    if (spark.SplatMesh) {
      // SparkJS ≥ 0.2 pattern
      splatObject = new spark.SplatMesh();
      await splatObject.load(spzUrl);
    } else if (spark.loadSplat) {
      // Alternative helper
      splatObject = await spark.loadSplat(spzUrl, this._sm.renderer);
    } else {
      throw new Error('SparkJS API not recognised — check CDN version');
    }

    splatObject.userData.sceneId = `splat-${style}`;
    splatObject.userData.style = style;

    // Centre and scale the splat to fit comfortably in view
    splatObject.scale.setScalar(100);
    splatObject.position.set(0, 0, 0);

    this._sm.scene.add(splatObject);
    this._currentSplat = splatObject;
    this._currentStyle = style;

    // Some SparkJS builds expose an update() method for streaming/LOD
    if (typeof splatObject.update === 'function') {
      this._deregister = this._sm.addFrameCallback(() => splatObject.update(this._sm.camera));
    }

    return splatObject;
  }

  /** Remove the current splat and free GPU memory. */
  async dispose() {
    if (this._deregister) {
      this._deregister();
      this._deregister = null;
    }
    if (this._currentSplat) {
      this._sm.scene.remove(this._currentSplat);
      if (typeof this._currentSplat.dispose === 'function') {
        this._currentSplat.dispose();
      }
      this._currentSplat = null;
      this._currentStyle = null;
    }
  }

  isLoaded() {
    return this._currentSplat !== null;
  }
}
