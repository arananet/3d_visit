/**
 * story-controller.js — Orchestrates the 8 story points of the virtual tour
 *
 * Story points:
 *   0 — Intro         (Three.js + Google 3D Tiles, aerial overview)
 *   1 — Flyover       (Google Aerial View video overlay)
 *   2 — Street Level  (Three.js + Google 3D Tiles, ground level)
 *   3 — Portal        (GLSL warp transition — gateway to AI worlds)
 *   4 — Cyberpunk     (World Labs SPZ Gaussian Splat)
 *   5 — Sketch        (World Labs SPZ Gaussian Splat)
 *   6 — Futuristic    (World Labs SPZ Gaussian Splat)
 *   7 — Return        (Fade back to 3D Tiles overview)
 */

import { GoogleTilesLoader } from './google-tiles.js';
import { AerialViewPlayer } from './aerial-view.js';
import { SplatRenderer } from './splat-renderer.js';
import { TransitionManager, TransitionType } from './transitions.js';
import { showError } from './main.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const storyTitle = document.getElementById('story-title');
const storySubtitle = document.getElementById('story-subtitle');
const progressDots = document.getElementById('progress-dots');
const styleBadge = document.getElementById('style-badge');

const STORY_POINTS = [
  { id: 0, name: 'Barcelona',      subtitle: 'Overview',      type: 'tiles-overview' },
  { id: 1, name: 'Drone Flyover',  subtitle: 'Real footage',  type: 'aerial-video'   },
  { id: 2, name: 'Street Level',   subtitle: 'Ground view',   type: 'tiles-street'   },
  { id: 3, name: 'The Portal',     subtitle: 'Step through',  type: 'portal'         },
  { id: 4, name: 'Cyberpunk',      subtitle: 'AI Dreamscape', type: 'splat', style: 'cyberpunk'  },
  { id: 5, name: 'Sketch',         subtitle: 'AI Dreamscape', type: 'splat', style: 'sketch'     },
  { id: 6, name: 'Futuristic',     subtitle: 'AI Dreamscape', type: 'splat', style: 'futuristic' },
  { id: 7, name: 'Return',         subtitle: 'Back to reality', type: 'return'       },
];

export class StoryController {
  _current = -1;
  _transitioning = false;

  /** @type {import('./scene-manager.js').SceneManager} */
  _sm;
  /** @type {import('./worldlabs.js').WorldLabsClient} */
  _wl;

  _tilesLoader;
  _aerialPlayer;
  _splatRenderer;
  _transitions;

  constructor(sceneManager, worldLabsClient) {
    this._sm = sceneManager;
    this._wl = worldLabsClient;

    this._tilesLoader = new GoogleTilesLoader(sceneManager);
    this._aerialPlayer = new AerialViewPlayer();
    this._splatRenderer = new SplatRenderer(sceneManager);
    this._transitions = new TransitionManager(sceneManager.renderer);

    this._buildDots();
  }

  _buildDots() {
    progressDots.innerHTML = '';
    for (const sp of STORY_POINTS) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      dot.title = sp.name;
      progressDots.appendChild(dot);
    }
  }

  _updateDots(index) {
    const dots = progressDots.querySelectorAll('.dot');
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
  }

  _updateHUD(sp) {
    storyTitle.textContent = sp.name;
    storyTitle.classList.add('visible');

    storySubtitle.textContent = sp.subtitle;
    storySubtitle.classList.add('visible');

    // Style badge for AI dreamscape scenes
    if (sp.style) {
      styleBadge.textContent = `AI · ${sp.style}`;
      styleBadge.className = `visible ${sp.style}`;
    } else {
      styleBadge.className = '';
      styleBadge.textContent = '';
    }
  }

  /** Navigate to a specific story point index. */
  async goTo(index) {
    if (this._transitioning) return;
    if (index < 0 || index >= STORY_POINTS.length) return;
    if (index === this._current) return;

    this._transitioning = true;
    const sp = STORY_POINTS[index];

    try {
      await this._leaveCurrentScene();
      await this._enterScene(sp, index);
    } catch (err) {
      console.error(`[story] Error at scene ${sp.name}:`, err);
      showError(`Scene error: ${err.message}. Skipping…`);
    } finally {
      this._transitioning = false;
    }
  }

  next() {
    const next = this._current + 1;
    if (next < STORY_POINTS.length) this.goTo(next);
  }

  prev() {
    const prev = this._current - 1;
    if (prev >= 0) this.goTo(prev);
  }

  // ── Scene transitions ───────────────────────────────────────────────────────

  async _leaveCurrentScene() {
    if (this._current < 0) return;

    const current = STORY_POINTS[this._current];

    // Fade out title
    storyTitle.classList.remove('visible');
    storySubtitle.classList.remove('visible');

    switch (current.type) {
      case 'aerial-video':
        this._aerialPlayer.hide();
        break;
      case 'splat':
        await this._transitions.play(TransitionType.DISSOLVE, 600, 'in');
        await this._splatRenderer.dispose();
        break;
      case 'portal':
        // No cleanup needed
        break;
      default:
        await this._transitions.play(TransitionType.FADE, 500, 'in');
    }
  }

  async _enterScene(sp, index) {
    this._current = index;
    this._updateDots(index);

    switch (sp.type) {
      case 'tiles-overview':
        await this._sceneOverview();
        break;
      case 'aerial-video':
        await this._sceneAerialVideo();
        break;
      case 'tiles-street':
        await this._sceneStreetLevel();
        break;
      case 'portal':
        await this._scenePortal();
        break;
      case 'splat':
        await this._sceneSplat(sp.style);
        break;
      case 'return':
        await this._sceneReturn();
        break;
    }

    this._updateHUD(sp);
    await this._transitions.play(TransitionType.FADE, 600, 'out');
  }

  // ── Individual scenes ───────────────────────────────────────────────────────

  async _sceneOverview() {
    this._sm.clearScene('splat');
    if (!this._tilesLoader._tiles) {
      await this._tilesLoader.load().catch((err) => {
        console.warn('[story] 3D Tiles unavailable:', err.message);
      });
    }
    await this._tilesLoader.flyToOverview().catch(() => {});
  }

  async _sceneAerialVideo() {
    // Pre-fetch the aerial video in the background if not already started
    this._aerialPlayer.prepare().catch((err) => {
      console.warn('[story] Aerial video prepare error:', err.message);
    });

    try {
      await this._aerialPlayer.play();
    } catch (err) {
      console.warn('[story] Aerial video unavailable:', err.message);
      showError('Aerial footage unavailable — continuing tour…');
      // Continue story after a short delay
      await sleep(2000);
    }
  }

  async _sceneStreetLevel() {
    await this._tilesLoader.flyToStreetLevel().catch(() => {});
  }

  async _scenePortal() {
    // Full warp portal — dramatic transition into AI worlds
    await this._transitions.play(TransitionType.WARP, 2500, 'in');
    // Hold for a beat
    await sleep(400);
  }

  async _sceneSplat(style) {
    try {
      // Show a loading indicator if world isn't ready yet
      if (!this._wl.isReady(style)) {
        storyTitle.textContent = `Generating ${style} world…`;
        storyTitle.classList.add('visible');
      }

      const assets = await this._wl.getAssets(style);
      await this._splatRenderer.loadWorld(assets, style);

      // Position camera for splat viewing
      await this._sm.flyTo({
        position: [0, 300, 600],
        target: [0, 100, 0],
        duration: 2000,
      });
    } catch (err) {
      console.error(`[story] Splat scene error (${style}):`, err.message);
      showError(`${style} world unavailable — skipping to next scene…`);
      await sleep(2000);
      this.next();
    }
  }

  async _sceneReturn() {
    await this._splatRenderer.dispose();
    await this._transitions.play(TransitionType.DISSOLVE, 800, 'in');
    await this._tilesLoader.flyToOverview().catch(() => {});
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
