/**
 * story-controller.js — Orchestrates the 8 story-point guided tour
 *
 * Story points:
 *   0 — Sagrada Família   (Google 3D Tiles overview)
 *   1 — Drone Flyover     (Google Aerial View video)
 *   2 — At Ground Level   (3D Tiles street view)
 *   3 — The Portal        (GLSL warp transition)
 *   4 — Cyberpunk         (World Labs Gaussian Splat)
 *   5 — Sketch            (World Labs Gaussian Splat)
 *   6 — Year 2150         (World Labs Gaussian Splat)
 *   7 — Return            (Fade back to reality)
 */

import { GoogleTilesLoader } from './google-tiles.js';
import { AerialViewPlayer }  from './aerial-view.js';
import { SplatRenderer }     from './splat-renderer.js';
import { TransitionManager, TransitionType } from './transitions.js';
import { showError }         from './ui.js';

const STORY_POINTS = [
  { id: 0, name: 'Sagrada Família', subtitle: 'Barcelona · Overview',    type: 'tiles-overview' },
  { id: 1, name: 'Drone Flyover',   subtitle: 'Cinematic aerial footage', type: 'aerial-video'   },
  { id: 2, name: 'At Ground Level', subtitle: 'Walking the plaza',        type: 'tiles-street'   },
  { id: 3, name: 'The Portal',      subtitle: 'Stepping into the dream',  type: 'portal'         },
  { id: 4, name: 'Cyberpunk',       subtitle: 'AI Dreamscape',            type: 'splat', style: 'cyberpunk'  },
  { id: 5, name: 'Sketch',          subtitle: 'AI Dreamscape',            type: 'splat', style: 'sketch'     },
  { id: 6, name: 'Year 2150',       subtitle: 'AI Dreamscape',            type: 'splat', style: 'futuristic' },
  { id: 7, name: 'Sagrada Família', subtitle: 'Back to reality',          type: 'return'         },
];

export class StoryController {
  _current = -1;
  _busy = false;

  constructor(sceneManager, worldLabsClient) {
    this._sm    = sceneManager;
    this._wl    = worldLabsClient;
    this._tiles = new GoogleTilesLoader(sceneManager);
    this._aerial = new AerialViewPlayer();
    this._splat  = new SplatRenderer(sceneManager);
    this._trans  = new TransitionManager(sceneManager);

    this._titleEl    = document.getElementById('story-title');
    this._subtitleEl = document.getElementById('story-subtitle');
    this._dotsEl     = document.getElementById('progress-dots');
    this._badgeEl    = document.getElementById('style-badge');

    this._buildDots();

    // Load 3D Tiles eagerly in the background
    this._tiles.load().catch((err) =>
      console.warn('[story] 3D Tiles load error:', err.message)
    );

    // Warm up Aerial View video in background
    this._aerial.prepare().catch(() => {});
  }

  _buildDots() {
    this._dotsEl.innerHTML = '';
    for (const sp of STORY_POINTS) {
      const d = document.createElement('div');
      d.className = 'dot';
      d.title = sp.name;
      this._dotsEl.appendChild(d);
    }
  }

  _updateDots(i) {
    this._dotsEl.querySelectorAll('.dot').forEach((d, idx) =>
      d.classList.toggle('active', idx === i)
    );
  }

  _showHUD(sp) {
    this._titleEl.textContent = sp.name;
    this._titleEl.classList.add('visible');
    this._subtitleEl.textContent = sp.subtitle;
    this._subtitleEl.classList.add('visible');

    if (sp.style) {
      this._badgeEl.textContent = `AI · ${sp.style}`;
      this._badgeEl.className   = `visible ${sp.style}`;
    } else {
      this._badgeEl.className   = '';
      this._badgeEl.textContent = '';
    }
  }

  _hideHUD() {
    this._titleEl.classList.remove('visible');
    this._subtitleEl.classList.remove('visible');
  }

  async goTo(index) {
    if (this._busy) return;
    if (index < 0 || index >= STORY_POINTS.length) return;
    if (index === this._current) return;

    this._busy = true;
    const sp = STORY_POINTS[index];

    try {
      this._hideHUD();
      await this._leave(this._current);
      await this._enter(sp, index);
    } catch (err) {
      console.error(`[story] Scene "${sp.name}" error:`, err);
      showError(`${sp.name}: ${err.message} — continuing…`);
    } finally {
      this._busy = false;
    }
  }

  next() { this.goTo(this._current + 1); }
  prev() { this.goTo(this._current - 1); }

  // ── Leave current scene ─────────────────────────────────────────────────────
  async _leave(index) {
    if (index < 0) return;
    const sp = STORY_POINTS[index];
    if (sp.type === 'aerial-video') {
      this._aerial.hide();
    } else if (sp.type === 'splat') {
      await this._trans.play(TransitionType.DISSOLVE, 500, 'in');
      await this._splat.dispose();
    } else if (sp.type !== 'portal') {
      await this._trans.play(TransitionType.FADE, 400, 'in');
    }
  }

  // ── Enter new scene ─────────────────────────────────────────────────────────
  async _enter(sp, index) {
    this._current = index;
    this._updateDots(index);

    switch (sp.type) {
      case 'tiles-overview': await this._sceneOverview(); break;
      case 'aerial-video':   await this._sceneAerial();   break;
      case 'tiles-street':   await this._sceneStreet();   break;
      case 'portal':         await this._scenePortal();   break;
      case 'splat':          await this._sceneSplat(sp.style); break;
      case 'return':         await this._sceneReturn();   break;
    }

    this._showHUD(sp);
    await this._trans.play(TransitionType.FADE, 500, 'out');
  }

  // ── Scene handlers ──────────────────────────────────────────────────────────

  async _sceneOverview() {
    this._tiles.setVisible(true);
    await this._tiles.flyToOverview();
  }

  async _sceneAerial() {
    this._tiles.setVisible(false);
    try {
      await this._aerial.play();
    } catch (err) {
      console.warn('[story] Aerial video error:', err.message);
      showError('Aerial footage unavailable — moving on…');
      await sleep(2000);
    }
  }

  async _sceneStreet() {
    this._tiles.setVisible(true);
    await this._tiles.flyToStreetLevel();
  }

  async _scenePortal() {
    // Full warp — holds for 2.5 s before resolving
    await this._trans.play(TransitionType.WARP, 2500, 'in');
    this._tiles.setVisible(false);
    await sleep(300);
  }

  async _sceneSplat(style) {
    // Show a loading hint if world isn't done yet
    if (!this._wl.isReady(style)) {
      this._titleEl.textContent  = `Generating ${style} world…`;
      this._subtitleEl.textContent = 'This takes about a minute';
      this._titleEl.classList.add('visible');
      this._subtitleEl.classList.add('visible');
    }

    try {
      const assets = await this._wl.getAssets(style);
      await this._splat.loadWorld(assets, style);
      await this._sm.flyTo({ position: [0, 300, 600], target: [0, 100, 0], duration: 2000 });
    } catch (err) {
      console.error(`[story] Splat error (${style}):`, err.message);
      showError(`${style} world unavailable — skipping…`);
      await sleep(1500);
      this.next();
    }
  }

  async _sceneReturn() {
    await this._splat.dispose();
    await this._trans.play(TransitionType.DISSOLVE, 700, 'in');
    this._tiles.setVisible(true);
    await this._tiles.flyToOverview();
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
