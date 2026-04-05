'use strict';

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Startup validation ────────────────────────────────────────────────────────
const REQUIRED_ENV = ['GOOGLE_MAPS_API_KEY', 'GOOGLE_AERIAL_VIEW_API_KEY', 'WORLDLABS_API_KEY'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.warn(`[warn] Missing environment variables: ${missing.join(', ')}`);
  console.warn('[warn] Some API endpoints will return 503 until these are set.');
}

const { version } = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // needed for inline Three.js import maps
          'cdn.jsdelivr.net',
          'unpkg.com',
          'cdn.skypack.dev',
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', '*.googleapis.com', '*.worldlabs.ai'],
        mediaSrc: ["'self'", 'blob:', '*.googleapis.com'],
        connectSrc: [
          "'self'",
          'blob:',
          '*.googleapis.com',
          '*.worldlabs.ai',
        ],
        workerSrc: ["'self'", 'blob:'],
        frameSrc: ["'none'"],
      },
    },
  })
);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ───────────────────────────────────────────────────────────────────
function requireEnv(key, res) {
  if (!process.env[key]) {
    res.status(503).json({ error: `Server not configured: missing ${key}` });
    return false;
  }
  return true;
}

async function proxyFetch(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version });
});

// GET /api/maps-config
// Returns the Google Photorealistic 3D Tiles root URL with the key injected.
app.get('/api/maps-config', (req, res) => {
  if (!requireEnv('GOOGLE_MAPS_API_KEY', res)) return;
  res.json({
    tilesetUrl: `https://tile.googleapis.com/v1/3dtiles/root.json?key=${process.env.GOOGLE_MAPS_API_KEY}`,
  });
});

// POST /api/aerial-view/render
// Body: { coordinates: { latitude, longitude } }
app.post('/api/aerial-view/render', async (req, res) => {
  if (!requireEnv('GOOGLE_AERIAL_VIEW_API_KEY', res)) return;

  const { coordinates } = req.body ?? {};
  if (!coordinates?.latitude || !coordinates?.longitude) {
    return res.status(400).json({ error: 'coordinates.latitude and coordinates.longitude are required' });
  }

  const url = `https://aerialview.googleapis.com/v1/videos:renderVideo?key=${process.env.GOOGLE_AERIAL_VIEW_API_KEY}`;
  const { status, body } = await proxyFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinatesQuery: {
        coordinates: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
      },
    }),
  }).catch((err) => {
    console.error('[aerial-view/render]', err.message);
    return { status: 502, body: { error: 'Upstream request failed' } };
  });

  if (status !== 200 || !body.videoId) {
    return res.status(status).json({ error: body.error?.message ?? 'Render request failed', detail: body });
  }

  res.json({ videoId: body.videoId });
});

// GET /api/aerial-view/status/:videoId
app.get('/api/aerial-view/status/:videoId', async (req, res) => {
  if (!requireEnv('GOOGLE_AERIAL_VIEW_API_KEY', res)) return;

  const { videoId } = req.params;
  const url = `https://aerialview.googleapis.com/v1/videos?videoId=${encodeURIComponent(videoId)}&key=${process.env.GOOGLE_AERIAL_VIEW_API_KEY}`;

  const { status, body } = await proxyFetch(url).catch((err) => {
    console.error('[aerial-view/status]', err.message);
    return { status: 502, body: { error: 'Upstream request failed' } };
  });

  if (status === 404) return res.status(404).json({ error: 'Video not found' });
  if (status !== 200) return res.status(status).json({ error: body.error?.message ?? 'Status check failed' });

  res.json({
    state: body.state ?? 'PENDING',
    videoUri: body.uris?.MP4_HIGH ?? body.uris?.MP4_MEDIUM ?? null,
  });
});

// POST /api/worldlabs/generate
// Body: { prompt, style, model }
app.post('/api/worldlabs/generate', async (req, res) => {
  if (!requireEnv('WORLDLABS_API_KEY', res)) return;

  const { prompt, style, model = 'Marble 0.1-plus' } = req.body ?? {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  if (!['cyberpunk', 'sketch', 'futuristic'].includes(style)) {
    return res.status(400).json({ error: 'style must be one of: cyberpunk, sketch, futuristic' });
  }

  const url = 'https://api.worldlabs.ai/marble/v1/worlds:generate';
  const { status, body } = await proxyFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'WLT-Api-Key': process.env.WORLDLABS_API_KEY,
    },
    body: JSON.stringify({
      display_name: `Barcelona ${style}`,
      model,
      world_prompt: {
        type: 'text',
        text_prompt: prompt.trim(),
      },
      permission: { public: false },
    }),
  }).catch((err) => {
    console.error('[worldlabs/generate]', err.message);
    return { status: 502, body: { error: 'Upstream request failed' } };
  });

  if (status !== 200 || !body.name) {
    return res.status(status).json({ error: body.error?.message ?? 'Generation failed', detail: body });
  }

  // World Labs returns operation name like "operations/op-id"
  const operationId = body.name.split('/').pop();
  res.json({ operationId });
});

// GET /api/worldlabs/status/:operationId
app.get('/api/worldlabs/status/:operationId', async (req, res) => {
  if (!requireEnv('WORLDLABS_API_KEY', res)) return;

  const { operationId } = req.params;
  const url = `https://api.worldlabs.ai/marble/v1/operations/${encodeURIComponent(operationId)}`;

  const { status, body } = await proxyFetch(url, {
    headers: { 'WLT-Api-Key': process.env.WORLDLABS_API_KEY },
  }).catch((err) => {
    console.error('[worldlabs/status]', err.message);
    return { status: 502, body: { error: 'Upstream request failed' } };
  });

  if (status === 404) return res.status(404).json({ error: 'Operation not found' });
  if (status !== 200) return res.status(status).json({ error: body.error?.message ?? 'Status check failed' });

  const done = body.done === true;
  const worldId = done ? body.response?.name?.split('/').pop() : undefined;

  res.json({ done, worldId });
});

// GET /api/worldlabs/world/:worldId
app.get('/api/worldlabs/world/:worldId', async (req, res) => {
  if (!requireEnv('WORLDLABS_API_KEY', res)) return;

  const { worldId } = req.params;
  const url = `https://api.worldlabs.ai/marble/v1/worlds/${encodeURIComponent(worldId)}`;

  const { status, body } = await proxyFetch(url, {
    headers: { 'WLT-Api-Key': process.env.WORLDLABS_API_KEY },
  }).catch((err) => {
    console.error('[worldlabs/world]', err.message);
    return { status: 502, body: { error: 'Upstream request failed' } };
  });

  if (status === 404) return res.status(404).json({ error: 'World not found' });
  if (status !== 200) return res.status(status).json({ error: body.error?.message ?? 'World fetch failed' });

  const assets = body.assets ?? {};
  res.json({
    worldId: body.name?.split('/').pop() ?? worldId,
    splats: {
      url100k: assets.splats?.spz_urls?.['100k'] ?? null,
      url500k: assets.splats?.spz_urls?.['500k'] ?? null,
      urlFullRes: assets.splats?.spz_urls?.full_res ?? null,
    },
    colliderMeshUrl: assets.mesh?.collider_mesh_url ?? null,
    thumbnailUrl: assets.imagery?.thumbnail_url ?? null,
    panoramaUrl: assets.imagery?.panorama_url ?? null,
    caption: assets.caption ?? null,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[barcelona-tour] Server running on port ${PORT}`);
  console.log(`[barcelona-tour] Health: http://localhost:${PORT}/api/health`);
});
