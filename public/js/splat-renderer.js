/**
 * splat-renderer.js — World Labs Gaussian Splat renderer via SparkJS
 *
 * SparkJS is resolved via the importmap as "@sparkjsdev/spark".
 * If the CDN is unavailable we degrade gracefully — a coloured placeholder
 * mesh is shown instead so the story can still advance.
 */

import * as THREE from 'three';

// Lazy-loaded so a CDN failure is caught per-world rather than at boot
let _spark = null;
async function getSpark() {
  if (_spark) return _spark;
  try {
    _spark = await import('@sparkjsdev/spark');
    return _spark;
  } catch {
    return null; // unavailable — caller uses placeholder
  }
}

/** Simple coloured sphere shown when SPZ loading is unavailable. */
function makePlaceholder(style) {
  const colours = { cyberpunk: 0xff00cc, sketch: 0xc8d8ff, futuristic: 0x00ffd4 };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 32),
    new THREE.MeshStandardMaterial({
      color:      colours[style] ?? 0xffffff,
      emissive:   colours[style] ?? 0x888888,
      emissiveIntensity: 0.4,
      wireframe:  style === 'sketch',
    })
  );
  mesh.userData.isPlaceholder = true;
  return mesh;
}

export class SplatRenderer {
  _sm;
  _currentSplat = null;
  _deregister   = null;

  constructor(sceneManager) {
    this._sm = sceneManager;
  }

  /**
   * Load a Gaussian Splat world into the scene.
   * Falls back to a placeholder sphere if SparkJS or the SPZ URL is unavailable.
   */
  async loadWorld(assets, style) {
    await this.dispose();

    const spzUrl = assets?.splats?.url500k
      ?? assets?.splats?.url100k
      ?? assets?.splats?.urlFullRes;

    const spark = await getSpark();

    if (spark && spzUrl) {
      await this._loadSplat(spark, spzUrl, style);
    } else {
      console.warn(`[splat] SparkJS or SPZ URL unavailable for "${style}" — using placeholder`);
      const placeholder = makePlaceholder(style);
      placeholder.userData.sceneId = `splat-${style}`;
      this._sm.scene.add(placeholder);
      this._currentSplat = placeholder;
    }
  }

  async _loadSplat(spark, spzUrl, style) {
    console.log(`[splat] Loading ${style} from`, spzUrl);

    let splatObject;

    if (spark.SplatMesh) {
      // SparkJS ≥ 0.2 pattern
      splatObject = new spark.SplatMesh();
      if (typeof splatObject.load === 'function') {
        await splatObject.load(spzUrl);
      } else {
        // Constructor-only pattern
        splatObject = new spark.SplatMesh({ url: spzUrl });
        await this._waitReady(splatObject);
      }
    } else if (spark.loadSplat) {
      splatObject = await spark.loadSplat(spzUrl, this._sm.renderer);
    } else {
      throw new Error('Unrecognised SparkJS API — check package version');
    }

    splatObject.userData.sceneId = `splat-${style}`;
    splatObject.scale.setScalar(100);
    splatObject.position.set(0, 0, 0);

    this._sm.scene.add(splatObject);
    this._currentSplat = splatObject;

    if (typeof splatObject.update === 'function') {
      this._deregister = this._sm.addFrameCallback(
        () => splatObject.update(this._sm.camera)
      );
    }
  }

  _waitReady(splat, timeoutMs = 30_000) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const check = () => {
        if (splat.isReady || splat.ready)    { resolve(); return; }
        if (splat.hasError || splat.error)   { reject(new Error('SplatMesh load error')); return; }
        if (Date.now() > deadline)           { reject(new Error('SplatMesh load timeout')); return; }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  async dispose() {
    this._deregister?.();
    this._deregister = null;
    if (this._currentSplat) {
      this._sm.scene.remove(this._currentSplat);
      this._currentSplat.geometry?.dispose();
      [this._currentSplat.material].flat().forEach((m) => m?.dispose?.());
      if (typeof this._currentSplat.dispose === 'function') {
        this._currentSplat.dispose();
      }
      this._currentSplat = null;
    }
  }

  isLoaded() { return this._currentSplat !== null; }
}
