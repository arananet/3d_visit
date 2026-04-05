/**
 * google-tiles.js — Google Photorealistic 3D Tiles integration
 *
 * TilesRenderer is loaded from 3d-tiles-renderer via the importmap.
 * The API key never leaves the server — SceneManager fetches a ready-to-use
 * tile URL from /api/maps-config and caches it.
 *
 * ECEF note: Google 3D Tiles use Earth-Centred Earth-Fixed coordinates.
 * On `load-tile-set` we read the real bounding sphere and reposition the
 * camera above the actual location.
 */

import * as THREE from 'three';

// Sagrada Família — Barcelona
export const SAGRADA_COORDS = {
  lat: 41.40363,
  lng: 2.17435,
};

export class GoogleTilesLoader {
  _tiles = null;
  _deregister = null;
  _boundingSphere = null;   // THREE.Sphere in ECEF world space
  _tilesAvailable = false;

  constructor(sceneManager) {
    this._sm = sceneManager;
  }

  async load() {
    const config = this._sm.getMapsConfig();
    if (!config?.tilesetUrl) {
      console.warn('[tiles] No maps config — skipping 3D Tiles');
      return null;
    }

    // Dynamic import so a CDN failure doesn't break the whole app
    let TilesRenderer, GoogleCloudAuthPlugin;
    try {
      const mod  = await import('3d-tiles-renderer');
      const plug = await import('3d-tiles-renderer/plugins');
      TilesRenderer       = mod.TilesRenderer;
      GoogleCloudAuthPlugin = plug.GoogleCloudAuthPlugin;
    } catch (err) {
      console.warn('[tiles] 3d-tiles-renderer unavailable:', err.message);
      return null;
    }

    this._tiles = new TilesRenderer(config.tilesetUrl);

    if (GoogleCloudAuthPlugin) {
      // Plugin refreshes the session token automatically on each tile request
      this._tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: null }));
    }

    this._tiles.setCamera(this._sm.camera);
    this._tiles.setResolutionFromRenderer(this._sm.camera, this._sm.renderer);
    this._tiles.errorTarget       = 6;    // lower = higher quality
    this._tiles.maxDownloadedTiles = 64;

    // Once the root tileset loads, compute camera placement from the real ECEF sphere
    this._tiles.addEventListener('load-tile-set', () => {
      const sphere = new THREE.Sphere();
      if (this._tiles.getBoundingSphere(sphere)) {
        this._boundingSphere = sphere;
        this._snapCameraAbove(sphere, 9000);
      }
    });

    this._sm.scene.add(this._tiles.group);

    this._deregister = this._sm.addFrameCallback(() => {
      this._sm.camera.updateMatrixWorld();
      this._tiles.update();
    });

    this._tilesAvailable = true;
    return this._tiles;
  }

  /** Instantly place camera above bounding sphere (no animation). */
  _snapCameraAbove(sphere, altM) {
    const up = sphere.center.clone().normalize();
    this._sm.camera.position.copy(sphere.center).addScaledVector(up, altM);
    this._sm.camera.lookAt(sphere.center);
    this._sm.camera.updateProjectionMatrix();
  }

  /** Animated fly to high overview. */
  async flyToOverview() {
    if (this._boundingSphere) {
      const up  = this._boundingSphere.center.clone().normalize();
      await this._sm.flyTo({
        position: this._boundingSphere.center.clone().addScaledVector(up, 9000),
        target:   this._boundingSphere.center,
        duration: 4000,
      });
    } else {
      await this._sm.flyTo({ position: [0, 9000, 4000], target: [0, 0, 0], duration: 4000 });
    }
  }

  /** Animated fly to street / plaza level. */
  async flyToStreetLevel() {
    if (this._boundingSphere) {
      const up    = this._boundingSphere.center.clone().normalize();
      const right = new THREE.Vector3(1, 0, 0).cross(up).normalize();
      const pos   = this._boundingSphere.center.clone()
        .addScaledVector(up, 250)
        .addScaledVector(right, 400);
      await this._sm.flyTo({
        position: pos,
        target:   this._boundingSphere.center.clone().addScaledVector(up, 60),
        duration: 5000,
      });
    } else {
      await this._sm.flyTo({ position: [200, 180, 800], target: [0, 100, 0], duration: 5000 });
    }
  }

  setVisible(visible) {
    if (this._tiles) this._tiles.group.visible = visible;
  }

  dispose() {
    this._deregister?.();
    this._deregister = null;
    if (this._tiles) {
      this._sm.scene.remove(this._tiles.group);
      this._tiles.dispose();
      this._tiles = null;
    }
    this._boundingSphere = null;
    this._tilesAvailable = false;
  }
}
