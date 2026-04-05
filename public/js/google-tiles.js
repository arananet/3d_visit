/**
 * google-tiles.js — Google Photorealistic 3D Tiles integration
 *
 * Uses the `3d-tiles-renderer` library loaded via CDN ESM.
 * Fetches the tileset root URL server-side (key never exposed to client).
 */

const TILES_RENDERER_CDN =
  'https://cdn.jsdelivr.net/npm/3d-tiles-renderer@0.3.34/src/index.js';

// Barcelona coordinates (generic city-center area)
export const BARCELONA_COORDS = {
  lat: 41.4036,
  lng: 2.1744,
  altM: 200, // metres above ground for initial view
};

export class GoogleTilesLoader {
  /** @type {import('3d-tiles-renderer').TilesRenderer|null} */
  _tiles = null;
  /** @type {Function|null} deregister frame callback */
  _deregister = null;

  /**
   * @param {import('./scene-manager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    this._sm = sceneManager;
  }

  /**
   * Load the tileset and add it to the scene.
   * Returns a Promise that resolves once root tileset JSON is fetched.
   */
  async load() {
    // 1. Get tileset URL from server (key injected server-side)
    const res = await fetch('/api/maps-config');
    if (!res.ok) throw new Error('Failed to fetch maps config');
    const { tilesetUrl } = await res.json();

    // 2. Dynamically import TilesRenderer from CDN
    let TilesRenderer;
    try {
      const mod = await import(TILES_RENDERER_CDN);
      TilesRenderer = mod.TilesRenderer;
    } catch {
      throw new Error('Could not load 3d-tiles-renderer from CDN');
    }

    // 3. Instantiate TilesRenderer
    this._tiles = new TilesRenderer(tilesetUrl);
    this._tiles.setCamera(this._sm.camera);
    this._tiles.setResolutionFromRenderer(this._sm.camera, this._sm.renderer);

    // Position the tileset group at Earth surface level (WGS-84 aware)
    // For simplicity we translate to origin so the camera can orbit naturally.
    this._sm.scene.add(this._tiles.group);

    // 4. Register per-frame update
    this._deregister = this._sm.addFrameCallback(() => {
      this._tiles.update();
    });

    return this._tiles;
  }

  /** Remove tiles from the scene and free resources. */
  dispose() {
    if (this._deregister) {
      this._deregister();
      this._deregister = null;
    }
    if (this._tiles) {
      this._sm.scene.remove(this._tiles.group);
      this._tiles.dispose();
      this._tiles = null;
    }
  }

  /** Fly camera to an overview position above Barcelona. */
  async flyToOverview() {
    await this._sm.flyTo({
      position: [0, 12000, 6000],
      target: [0, 0, 0],
      duration: 4000,
    });
  }

  /** Fly camera to a street-level position. */
  async flyToStreetLevel() {
    await this._sm.flyTo({
      position: [200, 180, 800],
      target: [0, 100, 0],
      duration: 5000,
    });
  }
}
