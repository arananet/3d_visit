/**
 * google-tiles.js — Google Photorealistic 3D Tiles integration
 *
 * Uses 3d-tiles-renderer (via importmap CDN) with GoogleCloudAuthPlugin
 * for automatic session-token refresh. The raw API key is never exposed —
 * the server returns a ready-to-use URL with the key injected.
 *
 * ECEF coordinate note: Google 3D Tiles are in Earth-Centered Earth-Fixed
 * space. After the root tileset loads, we reposition the camera to sit above
 * the tile bounding sphere rather than using hardcoded offsets.
 */

import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';

// Barcelona coordinates (generic city-centre area — no brand reference)
export const BARCELONA_COORDS = {
  lat: 41.4036,
  lng: 2.1744,
};

export class GoogleTilesLoader {
  /** @type {TilesRenderer|null} */
  _tiles = null;
  /** @type {Function|null} */
  _deregister = null;
  /** @type {THREE.Sphere|null} bounding sphere of the root tileset in world space */
  _boundingSphere = null;

  constructor(sceneManager) {
    this._sm = sceneManager;
  }

  /**
   * Fetch config from server, create TilesRenderer, attach to scene.
   */
  async load() {
    const res = await fetch('/api/maps-config');
    if (!res.ok) throw new Error('Failed to fetch maps config from server');
    const { tilesetUrl } = await res.json();

    this._tiles = new TilesRenderer(tilesetUrl);

    // GoogleCloudAuthPlugin handles session-token renewal transparently.
    // We pass the key via the backend-vended URL; the plugin appends it
    // to tile sub-requests automatically.
    this._tiles.registerPlugin(
      new GoogleCloudAuthPlugin({ apiToken: null }) // token already in URL
    );

    this._tiles.setCamera(this._sm.camera);
    this._tiles.setResolutionFromRenderer(this._sm.camera, this._sm.renderer);

    // Tune for cinematic quality (lower errorTarget = finer detail)
    this._tiles.errorTarget = 6;
    this._tiles.maxDownloadedTiles = 64;

    // Once the root tileset JSON loads we know the ECEF bounding sphere,
    // which lets us place the camera correctly above the real-world location.
    this._tiles.addEventListener('load-tile-set', () => {
      const sphere = new THREE.Sphere();
      if (this._tiles.getBoundingSphere(sphere)) {
        this._boundingSphere = sphere;
        this._positionCameraAbove(sphere, 8000);
      }
    });

    this._sm.scene.add(this._tiles.group);

    this._deregister = this._sm.addFrameCallback(() => {
      this._sm.camera.updateMatrixWorld();
      this._tiles.update();
    });

    return this._tiles;
  }

  /**
   * Immediately (no animation) place the camera above the tileset bounding
   * sphere at the given altitude in world-space units (≈ metres).
   */
  _positionCameraAbove(sphere, altitudeM) {
    const up = sphere.center.clone().normalize(); // radial "up" in ECEF
    this._sm.camera.position
      .copy(sphere.center)
      .addScaledVector(up, altitudeM);
    this._sm.camera.lookAt(sphere.center);
    this._sm.camera.updateProjectionMatrix();
  }

  dispose() {
    if (this._deregister) { this._deregister(); this._deregister = null; }
    if (this._tiles) {
      this._sm.scene.remove(this._tiles.group);
      this._tiles.dispose();
      this._tiles = null;
    }
    this._boundingSphere = null;
  }

  /**
   * Animated fly to overview (high altitude above the tileset).
   * Falls back to a generic position if the bounding sphere isn't known yet.
   */
  async flyToOverview() {
    const sphere = this._boundingSphere;
    if (sphere) {
      const up = sphere.center.clone().normalize();
      const target = sphere.center.clone();
      const position = sphere.center.clone().addScaledVector(up, 10000);
      await this._sm.flyTo({ position, target, duration: 4000 });
    } else {
      await this._sm.flyTo({ position: [0, 12000, 6000], target: [0, 0, 0], duration: 4000 });
    }
  }

  /**
   * Animated fly to street-level (low altitude above the tileset centre).
   */
  async flyToStreetLevel() {
    const sphere = this._boundingSphere;
    if (sphere) {
      const up = sphere.center.clone().normalize();
      const right = new THREE.Vector3(1, 0, 0).cross(up).normalize();
      const position = sphere.center.clone()
        .addScaledVector(up, 300)
        .addScaledVector(right, 500);
      const target = sphere.center.clone().addScaledVector(up, 80);
      await this._sm.flyTo({ position, target, duration: 5000 });
    } else {
      await this._sm.flyTo({ position: [200, 180, 800], target: [0, 100, 0], duration: 5000 });
    }
  }
}
