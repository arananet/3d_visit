/**
 * worldlabs.js — World Labs API client
 *
 * Manages the generation, polling, and caching of three AI-generated worlds:
 *   - cyberpunk
 *   - sketch
 *   - futuristic
 *
 * Generation is kicked off as early as possible so assets are ready
 * when the user reaches those story points.
 */

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 120; // 10 min max (plus model ~5 min)

/** Prompts for each style. Tuned to produce convincing Barcelona environments. */
const WORLD_PROMPTS = {
  cyberpunk: {
    prompt:
      'Cyberpunk version of a Barcelona urban street at night, neon signs in Catalan, ' +
      'rain-slicked pavement reflections, dark moody sky, Gothic Quarter architecture ' +
      'fused with holographic advertisements, dense fog, cinematic atmosphere',
    model: 'Marble 0.1-plus',
  },
  sketch: {
    prompt:
      'Hand-drawn pencil and ink architectural sketch of a Barcelona street, ' +
      'Eixample block architecture, loose expressive linework, light watercolour wash, ' +
      'white paper background, artistic illustration style',
    model: 'Marble 0.1-plus',
  },
  futuristic: {
    prompt:
      'Clean utopian futuristic Barcelona street, white biomorphic architecture, ' +
      'lush vertical gardens, calm blue sky, autonomous electric vehicles, pedestrian plazas, ' +
      'soft warm daylight, photorealistic render',
    model: 'Marble 0.1-plus',
  },
};

export class WorldLabsClient {
  /**
   * Map of style → world asset data (populated once generation completes)
   * @type {Map<string, {splats: object, colliderMeshUrl: string|null, thumbnailUrl: string|null}>}
   */
  _cache = new Map();

  /**
   * Map of style → Promise<assets> (in-flight generation)
   * @type {Map<string, Promise<object>>}
   */
  _pending = new Map();

  /**
   * Kick off generation for all three styles in parallel.
   * Does NOT await completion — worlds finish in the background.
   */
  async queueAll() {
    for (const style of Object.keys(WORLD_PROMPTS)) {
      if (!this._pending.has(style) && !this._cache.has(style)) {
        const p = this._generate(style);
        this._pending.set(style, p);
        p.then((assets) => {
          this._cache.set(style, assets);
          this._pending.delete(style);
        }).catch((err) => {
          console.error(`[worldlabs] Generation failed for ${style}:`, err.message);
          this._pending.delete(style);
        });
      }
    }
  }

  /**
   * Returns assets for a style — waits for generation if still in flight.
   * @param {'cyberpunk'|'sketch'|'futuristic'} style
   */
  async getAssets(style) {
    if (this._cache.has(style)) return this._cache.get(style);
    if (this._pending.has(style)) return this._pending.get(style);

    // Not started yet — start now
    const p = this._generate(style);
    this._pending.set(style, p);
    const assets = await p;
    this._cache.set(style, assets);
    this._pending.delete(style);
    return assets;
  }

  async _generate(style) {
    const { prompt, model } = WORLD_PROMPTS[style];

    // 1. Trigger generation
    const genRes = await fetch('/api/worldlabs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, style, model }),
    });

    if (!genRes.ok) {
      const err = await genRes.json().catch(() => ({}));
      throw new Error(err.error ?? `World generation failed for style: ${style}`);
    }

    const { operationId } = await genRes.json();
    console.log(`[worldlabs] ${style} generation started, op: ${operationId}`);

    // 2. Poll until done
    const worldId = await this._pollOperation(operationId, style);

    // 3. Fetch world assets
    const worldRes = await fetch(`/api/worldlabs/world/${encodeURIComponent(worldId)}`);
    if (!worldRes.ok) throw new Error(`Failed to fetch world assets for ${style}`);

    const assets = await worldRes.json();
    console.log(`[worldlabs] ${style} world ready:`, worldId);
    return assets;
  }

  async _pollOperation(operationId, style) {
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS);

      const statusRes = await fetch(
        `/api/worldlabs/status/${encodeURIComponent(operationId)}`
      );
      if (!statusRes.ok) continue;

      const { done, worldId } = await statusRes.json();

      if (done && worldId) {
        return worldId;
      }

      if (i % 6 === 0) {
        console.log(`[worldlabs] ${style} still generating… (${Math.round((i / MAX_POLLS) * 100)}%)`);
      }
    }
    throw new Error(`World generation timed out for style: ${style}`);
  }

  /** True if world assets are already cached and immediately available. */
  isReady(style) {
    return this._cache.has(style);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
