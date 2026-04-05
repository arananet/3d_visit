/**
 * aerial-view.js — Google Aerial View API client
 *
 * Requests a drone fly-over render for the Sagrada Família coordinates,
 * polls until ready, then plays it as a full-screen video overlay.
 */

import { SAGRADA_COORDS } from './google-tiles.js';

const POLL_MS   = 3000;
const MAX_POLLS = 60;   // 3-minute timeout

export class AerialViewPlayer {
  _videoEl  = document.getElementById('aerial-video');
  _videoUri = null;
  _prepared = false;

  /**
   * Trigger a render request and poll until the video is ready.
   * Safe to call multiple times — returns cached URI after first success.
   */
  async prepare() {
    if (this._videoUri) return this._videoUri;

    const renderRes = await fetch('/api/aerial-view/render', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        coordinates: {
          latitude:  SAGRADA_COORDS.lat,
          longitude: SAGRADA_COORDS.lng,
        },
      }),
    });

    if (!renderRes.ok) {
      const err = await renderRes.json().catch(() => ({}));
      throw new Error(err.error ?? 'Aerial View render request failed');
    }

    const { videoId } = await renderRes.json();
    this._videoUri    = await this._poll(videoId);
    return this._videoUri;
  }

  async _poll(videoId) {
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_MS);
      const res = await fetch(`/api/aerial-view/status/${encodeURIComponent(videoId)}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.state === 'ACTIVE' && data.videoUri) return data.videoUri;
      if (data.state === 'FAILED') throw new Error('Aerial View render failed');
    }
    throw new Error('Aerial View render timed out');
  }

  /** Show the video overlay and play. Resolves when playback ends. */
  async play() {
    if (!this._videoUri) {
      // If prepare() wasn't awaited yet, try once more
      await this.prepare();
    }

    this._videoEl.src = this._videoUri;
    this._videoEl.load();

    return new Promise((resolve, reject) => {
      this._videoEl.oncanplay = async () => {
        this._videoEl.classList.add('visible');
        try {
          await this._videoEl.play();
        } catch {
          // Autoplay blocked — still resolve so story advances
          resolve();
        }
      };
      this._videoEl.onended = () => { this.hide(); resolve(); };
      this._videoEl.onerror = () => reject(new Error('Aerial video playback error'));
    });
  }

  hide() {
    this._videoEl.classList.remove('visible');
    this._videoEl.pause();
    this._videoEl.src = '';
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
