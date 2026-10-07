# Kimi Earth Sentinel 3D

Interactive 3D Earth environmental-intelligence dashboard: a React + Three.js globe fed by a Next.js API (App Router Route Handlers) that aggregates live environmental data (USGS, NASA EONET/FIRMS, Open-Meteo, AirNow) with clearly-labelled simulated fallbacks when providers are unreachable.

> **Single Next.js application.** This repository previously contained a
> Python/Flask backend (formerly on Render) and a Vite frontend; both were
> migrated into this Next.js project and the obsolete `backend/` and
> `frontend/` directories have been removed. The production app is the 3D
> globe UI at `/` plus API Route Handlers under `/api/v1`, deployed as one
> Vercel project. Same-origin API base: `/api/v1`. See “Deployment” below.

## Live Demo

The project is deployed and publicly accessible:

| Service | URL | Hosting |
|---|---|---|
| Live Frontend | https://kimi-earth-sentinel-3d.vercel.app/ | Vercel (Hobby) |
| Backend API | https://kimi-earth-sentinel-3d.vercel.app/api/v1 | Vercel (same Next.js app, no Render) |

The React + TypeScript frontend and the Next.js API Route Handlers deploy together from this GitHub repository as one Vercel project. There is no Render service anymore (`render.yaml` deleted).

## Overview

Kimi Earth Sentinel renders an interactive 3D Earth (day/night textures, clouds, atmosphere glow, starfield) with switchable environmental layers. Selecting a layer fetches geolocated observations from the backend and renders them as severity-coloured 3D markers that can be hovered, clicked, filtered, and inspected in detail. A search box flies the camera to any matching location or event.

The app never silently presents simulated data as live measurements: every API payload carries a `data_status` block (`live` / `simulated` / `stale` / `unavailable`, plus source and fetch timestamp), and the UI surfaces it next to the data.

This is a single Next.js application:

```text
Kimi-Earth-Sentinel-3D/
├── src/app/        # globe page (/) + API Route Handlers (/api/*)
└── src/server/     # providers, services, cache, validation (server-only)
```

## Key Features

- Interactive 3D Earth (Three.js WebGPU + TSL day/night Earth, WebGL/React Three Fiber fallback): rotate, zoom, auto-rotation, night lights, clouds, Fresnel atmosphere, starfield
- Environmental layers: temperature, precipitation, cloud cover, wind, earthquakes, natural disasters, air quality, wildfires
- Live data from USGS, NASA EONET, NASA FIRMS, Open-Meteo, AirNow (keys required for AirNow/FIRMS)
- Simulated fallback data that is always labelled `SIMULATED` in the UI
- Interactive severity-coloured markers (single `THREE.InstancedMesh`) with hover tooltips and click-to-inspect event details
- Live event details for USGS earthquakes and NASA EONET disasters; explicitly simulated details where no provider event endpoint exists
- Location/event search with smooth interruptible camera fly-to
- Severity filtering, layer legends with units, data-freshness indicators
- Keyboard shortcuts (1–8 layers, Space pause, Esc back/close)
- Per-layer HTTP caching with honest `fetched_at` / `cache_hit` metadata
- Gridded heatmap endpoint with a simulated provider behind a swappable interface
- Production configs: single Vercel project (Next.js app + `/api/*` Route Handlers)

## Tech Stack

| Area              | Technology                         | Version              |
| ----------------- | ---------------------------------- | -------------------- |
| Frontend          | React                              | 19                   |
| Language          | TypeScript                         | ~5.9                 |
| Build Tool        | Next.js                            | 15                   |
| 3D Engine         | Three.js                           | ^0.185               |
| React 3D          | React Three Fiber                  | ^9                   |
| 3D Utilities      | Drei                               | ^10                  |
| Styling           | Tailwind CSS                       | ^3.4                 |
| UI                | Radix UI / shadcn-style components | assorted ^1/^2      |
| Icons             | Lucide React                       | ^0.562               |
| Backend           | Next.js Route Handlers (App Router)  | 15                   |
| Language (API)    | TypeScript                           | ~5.9                 |
| HTTP Client (API) | native `fetch` + `AbortController`   | Node 20+             |
| Cache             | Per-instance in-memory TTL + stale fallback | — (no server needed) |
| Scheduler         | None (request-time caching; APScheduler retired) | —            |
| Logging           | Structured `console.warn/error` (server-only) | —               |
| Production Server | Vercel serverless functions          | —                    |
| API Testing       | Vitest (root `src/**/*.test.ts`)      | Vitest ^2            |
| UI Testing        | Vitest + Testing Library (jsdom)   | Vitest ^2            |
| CI                | GitHub Actions                     | source control + CI                |
| Frontend Hosting  | Vercel (Hobby)                     | https://kimi-earth-sentinel-3d.vercel.app/ |
| Backend Hosting   | Vercel (same Next.js app, `/api/*`) | no separate backend host |

Supporting UI libraries: `clsx` / `tailwind-merge` / `class-variance-authority`, `lucide-react`, Radix primitives (dialog, tabs, tooltip, …). State is local React state (`useState` + hooks); there is no Redux, Zustand store, or React Router in the application code.

Local development requires Node.js 24+.

## System Architecture

```text
User
 ↓
Next.js app on Vercel (single deployment)
 ↓ JSON (/api/v1/*, same-origin)
Route Handlers (src/app/api)
 ↓ dispatch
Routes (validation + JSON) → application/service layer → provider adapters
 ↓ HTTPS
External environmental APIs (USGS, NASA EONET/FIRMS/GIBS, Open-Meteo, AirNow)
```

- **Globe UI (`src/components/`, `src/hooks/`, `src/services/api.ts`)** — globe scene, markers, panels, search, and a single centralized same-origin API client (`/api/v1`). Components never construct backend URLs directly. One layer is active at a time (`activeLayer` in `SentinelApp`).
- **Next.js API (`src/app/api`, `src/server`)** — route validation, per-layer TTL caching, `data_status` provenance envelope, predictable JSON error handlers.
- **Application/service layer (`src/server/services/layers.ts`, `event-detail.ts`)** — owns provider dispatch, cache lookup/store, and stale-fallback semantics. Shared by all Route Handlers (no background scheduler; APScheduler retired).
- **Provider adapters (`src/server/providers/usgs.ts`, `nasa-eonet.ts`, `nasa-firms.ts`, `open-meteo.ts`, `airnow.ts`, plus `heatmap.ts`, `imagery.ts`, `geocode.ts`, `fallback.ts`)** — each fetches from one upstream API and normalizes to the canonical payload. Adapters hold no request objects and touch no cache directly.
- **Routes (`src/app/api/`)** — thin HTTP controllers: validate query params, call the service layer, render JSON. Provider-specific logic belongs in service/provider modules, never in routes.
- **Utilities (`src/server/`)** — `validation.ts` (query-param parsing; malformed input yields `400`, never `500`) and `provenance.ts` (the `data_status` envelope, per-layer TTLs).
- **Cache (`src/server/cache.ts`)** — per-instance in-memory TTL store with stale fallback (Vercel serverless: best-effort per instance, never the source of truth).

## Data Architecture / Request Flow

```text
Request
 → process-local cache (fresh entry? return it with cache_hit: true)
 → provider adapter on cache miss (fetch + normalize)
 → attach provenance (data_status) + fetched_at
 → store in cache (LIVE payloads: full layer TTL; SIMULATED/UNAVAILABLE: 60 s)
 → JSON response { success, data, meta }
```

On refresh failure with an expired `LIVE` entry still in memory, the expired entry is served once more with its status rewritten to `STALE` and the original `fetched_at` preserved, so the UI reports true age instead of claiming real-time data.

There is no database, no Redis, no PostgreSQL/PostGIS, no persistent environmental data store, and no production background worker. The application visualizes externally-owned provider data rather than persisting its own dataset, so a short-lived per-instance cache is sufficient. There is no cache-warming scheduler (the old in-process APScheduler was retired with the Flask backend); request-time caching + stale fallback cover production.

## Environmental Data Sources

| Layer | Provider | Needs key | Without key / on failure |
|---|---|---|---|
| Earthquakes | USGS FDSNWS | No | Simulated (labelled) |
| Disasters | NASA EONET | No | Simulated (labelled) |
| Temperature / Precipitation / Clouds / Wind | Open-Meteo | No | Simulated (labelled) |
| Air quality | AirNow (US only) | `AIRNOW_API_KEY` | Simulated (labelled); `bbox` rejected with `400 UNSUPPORTED_PARAM` (cannot be honored by this source) |
| Wildfires | NASA FIRMS | `NASA_FIRMS_API_KEY` | Simulated (labelled) |
| Satellite imagery | NASA GIBS | No | Tile redirect to GIBS WMTS (allow-listed layers only) |

All upstream base URLs and both API keys are server-side configuration (`src/server/config.ts`); keys are never sent to the frontend.

## Data Reliability and Provenance

Every layer payload carries:

```json
{
  "data_status": {
    "status": "live | simulated | stale | unavailable",
    "source": "USGS",
    "fetched_at": "2026-…Z",
    "message": "optional human-readable note"
  }
}
```

- **Live** — payload came straight from the provider (`status: "live"`, `fetched_at` = fetch time).
- **Cached** — repeated requests within the layer TTL return the same payload with `meta.cache_hit: true` and the original `fetched_at`; the UI shows the actual age ("Updated 4 min ago"), never "real-time".
- **Simulated** — provider unreachable or key missing; the UI shows an amber `SIMULATED · <source> unavailable · Showing fallback data` banner. Simulated fallback data is explicitly labelled and is never presented as live environmental measurements.
- **Stale** — an expired cached `LIVE` payload re-served after a refresh failure, with the original `fetched_at` preserved.
- **Unavailable** — no data could be produced at all (e.g. heatmap requested for an unknown layer).

Event details: earthquake ids resolve live against the USGS detail feed; `eonet-*` ids resolve live against the NASA EONET event endpoint (both cached 5 minutes, `STALE`-served on refresh failure). A provider-confirmed absence returns `404`, never disguised as fallback data.

## Project Structure

```text
Kimi-Earth-Sentinel-3D/
├── README.md                      # this file
├── package.json                   # Next.js app (root: lint/typecheck/test/build)
├── next.config.mjs              # Vercel deployment (single project, auto-detected)
├── tailwind.config.js             # Tailwind v3 design tokens
├── .env.example                   # API env template (server-only, no secrets)
├── public/textures/               # Earth day/night/cloud/topology/water
├── src/
│   ├── app/
│   │   ├── layout.tsx             # root layout + metadata + globals.css
│   │   ├── page.tsx               # globe UI (server wrapper, force-dynamic)
│   │   ├── globals.css            # design system (ported index.css + App.css)
│   │   └── api/                   # Route Handlers: health, v1/{health,layers,events,search,stats,geocode,timezones,imagery}
│   ├── components/
│   │   ├── app/SentinelApp.tsx    # app shell ("use client")
│   │   ├── globe/                 # EarthRenderer + WebGPUEarth (ssr:false) + WebGL fallback
│   │   ├── panels/ overlays/ ui/  # HUD, shadcn/Radix primitives
│   ├── hooks/ lib/ types/ shaders/ services/  # incl. same-origin api.ts (/api/v1)
│   └── server/                    # config, provenance, validation, cache, http,
│                                  # models/layers, providers/*, services/*, health
├── .github/workflows/ci.yml       # Next.js app job (lint/typecheck/test/build)
└── docs/
    ├── development.md             # practical dev guide (setup, env, tests, deploy)
    └── prompts/                   # briefs from prior foundation passes
```

## Local Development

Prerequisites: Node.js 24+ (`nvm use` picks it up from `.nvmrc`).

One dev server serves both the globe UI and the API:

```bash
npm ci
copy .env.example .env        # then set AIRNOW_API_KEY / NASA_FIRMS_API_KEY if needed
npm run dev                   # Next.js on http://localhost:3000
```

Open `http://localhost:3000`, pick a layer (or press `5` for earthquakes). The client calls same-origin `/api/v1` — no `VITE_API_BASE_URL`, no CORS. Provider keys are optional (affected layers return labelled simulated data without them). `GET /api/health` and `GET /api/v1/layers` verify the API directly.

## Environment Variables

All server-only (root `.env`, never `NEXT_PUBLIC_`):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `CACHE_DEFAULT_TIMEOUT` | No | `300` | Fallback cache TTL (s); per-layer TTLs in code |
| `USGS_API_URL` / `NASA_EONET_URL` / `NASA_FIRMS_URL` / `NASA_GIBS_URL` / `OPEN_METEO_URL` / `AIRNOW_API_URL` | No | provider defaults | Upstream base URLs (override for tests/proxies) |
| `AIRNOW_API_KEY` | For live AQI | — | Server-side only; air quality is simulated without it |
| `NASA_FIRMS_API_KEY` | For live fires | — | Server-side only; wildfires are simulated without it |
| `REQUEST_TIMEOUT` | No | `15` | Upstream HTTP timeout (seconds) |

(Retired with Flask: `FLASK_ENV`, `SECRET_KEY`, `PORT`/`FLASK_PORT`, `CORS_ORIGINS`, `SCHEDULER_ENABLED` — no equivalents needed. Same-origin API needs no CORS allow-list; there is no background scheduler.)

Never commit `.env` files or keys; they are git-ignored with the `.env.example` template provided.

Use `GET /api/v1/health` (or Settings → Diagnostics in the UI) to verify the app reaches its API. Diagnostics shows the API base, backend health + latency, current layer/provenance, WebGPU support, and the active renderer — never secrets.

## API Overview

Base URL `/api/v1` (plus unversioned `GET /api/health` for deployment checks). All success responses use `{ success: true, data, meta }`; errors use `{ success: false, error: { code, message } }` with meaningful status codes (400 validation, 404 unknown layer/route, 405 wrong method).

| Endpoint | Description |
|---|---|
| `GET /api/health` | Liveness: `{ status: "ok", service, version, timestamp, uptime_seconds }` |
| `GET /api/v1/health` | Same payload, versioned |
| `GET /api/v1/layers` | Layer metadata (id, name, source, unit, color scale, refresh interval) |
| `GET /api/v1/layers/<layer_id>/data?bbox=&limit=&min_severity=` | Points + stats + `data_status`; validated (`limit` 1–2000, bbox ranges, known severities); cached per layer TTL; `air_quality` rejects `bbox` with `400 UNSUPPORTED_PARAM` (US-only source) |
| `GET /api/v1/layers/<layer_id>/heatmap?resolution=&time_range=` | Base64 float32 grid + `data_status` (currently simulated; same schema for future real grids) |
| `GET /api/v1/events/<id>` | Event detail: live USGS lookup for earthquake ids, live NASA EONET lookup for `eonet-*` ids (both cached 5 min, `LIVE`/`STALE` labelled); provider-confirmed absence → `404`; provider failure or lookup-less markers (wildfire observations, other layers) → labelled `SIMULATED` fallback |
| `GET /api/v1/search?q=&type=&limit=` | Location/event search over bundled gazetteer + event index (simulated, labelled) |
| `GET /api/v1/stats` | Global rollup (simulated, labelled) |
| `GET /api/v1/stats/historical?metric=&period=&aggregation=` | Placeholder series (simulated, labelled — no fake history presented as measured) |
| `GET /api/v1/geocode/reverse?lat=&lon=` | Coarse region lookup (simulated, labelled) |
| `GET /api/v1/timezones?lat=&lon=` | Approximate timezone from longitude only (simulated, labelled — not authoritative) |
| `GET /api/v1/imagery/gibs/capabilities` | NASA GIBS layer catalogue |
| `GET /api/v1/imagery/gibs/tile/<layer>/<z>/<x>/<y>` | Redirect to NASA GIBS tile (allow-listed layers only) |

Only the endpoints above exist; no other API surface is implemented.

## Testing

Full app (repo root):

```bash
npm run lint            # eslint (app + server)
npm run typecheck       # tsc --noEmit
npm test                # vitest run (node API tests + jsdom UI tests)
npm run build           # next build (all /api routes + globe page)
```

CI (`.github/workflows/ci.yml`) runs a single app job (`npm ci` → `lint` → `typecheck` → `test` → `build`, Node 24) on pushes to `main` and all pull requests.

## Deployment

Single Vercel project (Next.js frontend + API):

```text
GitHub Repository (root = Next.js app)
        │
        ▼
      Vercel
        │
        ├── Globe UI at / (SentinelApp client tree)
        │
        └── /api/* Route Handlers (src/app/api, src/server)
```

There is **no Render dependency** and no second deployment: the obsolete
Flask backend, Gunicorn, APScheduler, and `render.yaml` are gone, as is the
standalone Vite frontend. The UI (`/`) and API (`/api/*`) ship together
from this repository.

### Production URLs

| Service | URL |
|---|---|
| App (Vercel) | https://kimi-earth-sentinel-3d.vercel.app/ |
| API base (same origin) | https://kimi-earth-sentinel-3d.vercel.app/api/v1 |
| Health check | https://kimi-earth-sentinel-3d.vercel.app/api/health |

### Production request flow

```text
User
 ↓
Vercel Next.js app
 ↓ same-origin
/api/* Route Handlers
 ↓
Server service layer
 ↓
Provider adapters
 ↓
USGS / NASA EONET / NASA FIRMS / Open-Meteo / AirNow / NASA GIBS
```

External data providers keep their own access requirements (AirNow and NASA FIRMS need server-side keys; without them the affected layers return labelled simulated data — see Environmental Data Sources below).

Backend → Vercel (root Next.js app):

- No Root Directory override (repo root), framework Next.js, build `npm run build`.
- Server-only env vars: `AIRNOW_API_KEY`, `NASA_FIRMS_API_KEY` (never `NEXT_PUBLIC_`), plus optional upstream URL overrides and `REQUEST_TIMEOUT` (see `.env.example`).
- No scheduler/cron: request-time caching + stale fallback need no warming.
- No CORS configuration: browser requests are same-origin.
- No frontend env vars: the UI calls relative `/api/v1` (see `src/services/api.ts`).

App structure (single deployment):

- The UI runs from `src/` in this same app: `src/app/page.tsx` (server wrapper) → `src/components/app/SentinelApp.tsx` (`"use client"`).
- Globe code is unchanged in behavior: `EarthRenderer` probes WebGPU and loads `WebGPUEarth` (`three/webgpu` + TSL, `ssr: false` code-split chunk) with the WebGL `Globe`/`GlobeScene` fallback. Textures live in `public/textures/`.

CORS:

- None. Same-origin `/api/*` requests need no cross-origin configuration.

## Earth Renderer (WebGPU + TSL)

The Earth surface is rendered by `src/components/globe/WebGPUEarth.tsx`, an imperative React component built on the official Three.js `webgpu_tsl_earth` example (Three.js 0.185.x, `three/webgpu` + `three/tsl`):

- `MeshStandardNodeMaterial` with a TSL `colorNode` blending the day texture and night city-lights by a sun-oriented smoothstep transition (`dot(normalWorld, sunDirection)`), classic `emissiveMap` night glow, water-texture roughness, and topology bump.
- TSL Fresnel atmosphere shell (`BackSide`, additive), drifting cloud layer, deterministic starfield, directional sun (configurable `sunDirection` prop, reserved for future UTC solar wiring).
- `EarthRenderer.tsx` probes WebGPU support and lazy-loads the WebGPU chunk only on capable browsers; otherwise (or on init failure) the existing WebGL/React Three Fiber globe (`Globe`/`GlobeScene`) takes over with the identical marker/hover/click/fly-to/rotation contract. The app never renders a blank viewport.
- Markers keep the canonical `latLonToVector3Into` projection (same radius `5`, altitude factor `1.012`), severity colors, instanced rendering, rAF-throttled raycast picking, and quaternion fly-to — verified against known continents (no lat/lon reversal).
- Earth textures are the `public/textures/` assets (NASA Visible Earth Blue Marble family, as credited in Settings → About).

Validate the real renderer manually in a Chromium browser with WebGPU (day/night transition, night lights, clouds, atmosphere, rotation, marker hover/click, search fly-to), plus once with WebGPU disabled (`--disable-webgpu` or a non-supporting browser) to confirm the fallback.

## Current Limitations

- **NASA FIRMS observations vs persistent event records:** wildfire markers are brightness observations with no individual-event endpoint, so their details stay explicitly `SIMULATED` even when the marker list itself is live.
- **Simulated heatmaps:** all layers return deterministic seeded grids behind the same schema; real gridded datasets can plug in per layer (`HEATMAP_PROVIDERS`) without frontend changes.
- **Simulated historical statistics:** `GET /api/v1/stats` and `GET /api/v1/stats/historical` return labelled placeholders, not measured history.
- **Simulated search/geocoding:** search runs over a bundled gazetteer + event index, reverse-geocode is a coarse region lookup, and the timezone endpoint is a longitude-only approximation — all labelled `SIMULATED`.
- **AirNow geographic limitations:** the air-quality source is US-oriented and cannot honor an arbitrary global `bbox`; passing `bbox` for `air_quality` is rejected with `400 UNSUPPORTED_PARAM` rather than silently ignored. Live AQI additionally requires `AIRNOW_API_KEY`.
- **EONET events with missing/empty geometry:** some EONET events carry no usable coordinates; their detail payloads return `lat`/`lon` as `null` rather than fabricated positions.
- **Single active layer:** the UI shows exactly one layer at a time (multi-layer compositing is a roadmap item, not current behavior).

## Roadmap

- Multi-layer compositing (visible-layers set + per-layer opacity)
- Timeline/history playback (24h / 48h / 7d) backed by real archives — no fabricated history
- Real gridded heatmaps per layer via `HEATMAP_PROVIDERS` (schema is ready)
- Live single-event lookup for remaining marker kinds
- PostGIS + Redis for geospatial filtering and shared caching (future options only — not current dependencies)
- Alerting, richer analytics, mobile layout refinements

## Contributing

1. Fork and branch from `main`.
2. `npm ci && npm run dev` — keep `npm run lint`, `npm run typecheck`, and `npm run build` clean.
3. New endpoints need validation tests and `data_status` coverage (`npm test` covers API + UI).
4. Never commit secrets or `node_modules`; simulated data must always stay labelled.

## License

Licensing is currently unspecified.
