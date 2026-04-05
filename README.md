# Sagrada Família — Virtual Tour

A guided 3D story experience that blends real-world drone footage and photorealistic 3D map data with AI-generated dreamscapes of Barcelona's most iconic landmark.

**Developer:** Eduardo Arana

---

## Experience

The tour progresses through 8 story points:

| # | Scene | Technology |
|---|-------|------------|
| 1 | **Sagrada Família Overview** | Google Photorealistic 3D Tiles — animated aerial approach |
| 2 | **Drone Flyover** | Google Aerial View API — real cinematic footage |
| 3 | **At Ground Level** | Google 3D Tiles — plaza street view |
| 4 | **The Portal** | GLSL warp shader — gateway into AI worlds |
| 5 | **Cyberpunk** | World Labs Gaussian Splat — neon-drenched nocturnal vision |
| 6 | **Sketch** | World Labs Gaussian Splat — hand-drawn architectural illustration |
| 7 | **Year 2150** | World Labs Gaussian Splat — utopian completed basilica |
| 8 | **Return** | Dissolve back to reality |

Navigate with **← →** arrow keys, swipe, or the on-screen buttons.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS ES modules, Three.js r165, no bundler |
| 3D Tiles | `3d-tiles-renderer` + `GoogleCloudAuthPlugin` |
| AI Worlds | World Labs Marble API (Gaussian Splats, SPZ format) |
| Splat Rendering | SparkJS — Three.js-native SPZ renderer |
| Drone Video | Google Aerial View API |
| Backend | Node.js + Express (API proxy — keys never reach the browser) |
| Deployment | Railway |

### Architecture

```
Browser (Three.js + SparkJS)
  ↕ fetch — no API keys exposed
Express Server (Railway)
  ├── GET  /api/health
  ├── GET  /api/maps-config          → injects Maps tile URL server-side
  ├── POST /api/aerial-view/render   → proxies Google Aerial View API
  ├── GET  /api/aerial-view/status/:videoId
  ├── POST /api/worldlabs/generate   → proxies World Labs API
  ├── GET  /api/worldlabs/status/:operationId
  ├── GET  /api/worldlabs/world/:worldId
  └── /                              → serves public/ static files
```

---

## Project Structure

```
├── server.js                  # Express server — API proxy + static serving
├── package.json
├── railway.json               # Railway deployment config
├── .env.example               # Required environment variables (template)
├── spec/
│   └── openapi.yaml           # OpenAPI 3.1 spec (written spec-first)
└── public/
    ├── index.html             # Single page — importmap + Three.js canvas
    ├── css/
    │   └── main.css
    └── js/
        ├── main.js            # App bootstrap + navigation bindings
        ├── ui.js              # Shared UI helpers (toast, progress, loading)
        ├── scene-manager.js   # Three.js renderer, camera, animation loop
        ├── google-tiles.js    # Photorealistic 3D Tiles + ECEF positioning
        ├── aerial-view.js     # Aerial View render/poll/play
        ├── worldlabs.js       # World Labs generation + polling + cache
        ├── splat-renderer.js  # SparkJS Gaussian Splat loader
        ├── story-controller.js# Story state machine — 8 scenes
        └── transitions.js     # GLSL fade / dissolve / warp shaders
```

---

## Local Development

### Prerequisites

- Node.js ≥ 18
- API keys for Google Maps Platform and World Labs (see below)

### Setup

```bash
git clone https://github.com/arananet/3d_visit
cd 3d_visit
npm install
cp .env.example .env
# Fill in your API keys in .env
npm run dev
```

Open `http://localhost:3000`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. **Never commit `.env`.**

```bash
# Google Maps Platform — enable: Map Tiles API
# Restrict HTTP referrers to your domain in Google Cloud Console
GOOGLE_MAPS_API_KEY=AIza...

# Google Maps Platform — enable: Aerial View API
# Called server-side only; can be the same key as above
GOOGLE_AERIAL_VIEW_API_KEY=AIza...

# World Labs — obtain at: https://platform.worldlabs.ai/api-keys
WORLDLABS_API_KEY=wlt_...

PORT=3000
NODE_ENV=development
```

### Enabling the APIs

In **Google Cloud Console → APIs & Services → Enable APIs**:
- Map Tiles API
- Aerial View API

In **API Credentials**, restrict `GOOGLE_MAPS_API_KEY` to your Railway domain
(e.g. `*.up.railway.app/*`) so it cannot be misused if extracted from a response.

`GOOGLE_AERIAL_VIEW_API_KEY` is only called server-side and never reaches the
browser, so referrer restriction is not needed — IP restriction is optional.

---

## Deploying to Railway

1. Push the branch to GitHub
2. Create a new Railway project → **New Service → GitHub Repo**
3. Select the `claude/sagrada-familia-virtual-tour` branch
4. Add the three environment variables under **Variables**:
   - `GOOGLE_MAPS_API_KEY`
   - `GOOGLE_AERIAL_VIEW_API_KEY`
   - `WORLDLABS_API_KEY`
5. Railway auto-detects Node.js via `package.json` and runs `node server.js`
6. Health check is at `/api/health`

---

## World Labs Credit Usage

Each AI world generation costs credits on your World Labs account:

| Model | Cost per world | 3 worlds total |
|-------|---------------|----------------|
| `Marble 0.1-plus` (production) | ~1,580 credits | ~4,740 credits |
| `Marble 0.1-mini` (draft, ~45 s) | ~230 credits | ~690 credits |

To use `mini` during development, edit `worldlabs.js` and change the `model`
field in `WORLD_PROMPTS` from `Marble 0.1-plus` to `Marble 0.1-mini`.

---

## API Specification

The full OpenAPI 3.1 spec is at [`spec/openapi.yaml`](spec/openapi.yaml).
All endpoints are under `/api/`.

---

## License

MIT

---

*Built with Google Maps Platform, World Labs Marble API, Three.js, and SparkJS.*
