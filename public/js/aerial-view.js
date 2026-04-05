/**
 * aerial-view.js — Google Aerial View API client
 *
 * Requests a drone fly-over video render for the Barcelona coordinates,
 * polls until it is ready, then plays it as a full-screen video overlay.
 */

import { BARCELONA_COORDS } from './google-tiles.js';
import { showError } from './main.js';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60; // 3 min max wait

export class AerialViewPlayer {
  /** @type {HTMLVideoElement} */
  _videoEl = document.getElementById('aerial-video');

  /** @type {string|null} */
  _videoId = null;

  /** @type {string|null} */
  _videoUri = null;

  /** Whether this aerial video has already been rendered (cached for session). */
  _rendered = false;

  /**
   * Trigger a render request and begin polling.
   * Resolves with the video URI when ready (or rejects on failure/timeout).
   */
  async prepare() {
    if (this._videoUri) return this._videoUri; // already resolved

    // Kick off render
    const renderRes = await fetch('/api/aerial-view/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates: {
          latitude: BARCELONA_COORDS.lat,
          longitude: BARCELONA_COORDS.lng,
        },
      }),
    });

    if (!renderRes.ok) {
      const err = await renderRes.json().catch(() => ({}));
      throw new Error(err.error ?? 'Aerial View render request failed');
    }

    const { videoId } = await renderRes.json();
    this._videoId = videoId;

    // Poll for completion
    this._videoUri = await this._poll(videoId);
    return this._videoUri;
  }

  async _poll(videoId) {
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS);

      const statusRes = await fetch(`/api/aerial-view/status/${encodeURIComponent(videoId)}`);
      if (!statusRes.ok) continue;

      const data = await statusRes.json();

      if (data.state === 'ACTIVE' && data.videoUri) return data.videoUri;
      if (data.state === 'FAILED') throw new Error('Aerial View render failed');
    }
    throw new Error('Aerial View render timed out');
  }

  /**
   * Show the video overlay and play the footage.
   * Returns a Promise that resolves when playback ends.
   */
  async play() {
    if (!this._videoUri) {
      throw new Error('prepare() must be called before play()');
    }

    this._videoEl.src = this._videoUri;
    this._videoEl.load();

    return new Promise((resolve, reject) => {
      this._videoEl.oncanplay = async () => {
        this._videoEl.classList.add('visible');
        try {
          await this._videoEl.play();
        } catch (e) {
          // Autoplay blocked — still resolve so story can continue
          console.warn('[aerial-view] Autoplay blocked:', e.message);
          resolve();
        }
      };

      this._videoEl.onended = () => {
        this.hide();
        resolve();
      };

      this._videoEl.onerror = (e) => {
        reject(new Error('Aerial video playback error'));
      };
    });
  }

  /** Hide and unload the video element. */
  hide() {
    this._videoEl.classList.remove('visible');
    this._videoEl.pause();
    this._videoEl.src = '';
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
