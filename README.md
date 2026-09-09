# Kimi Earth Sentinel 3D

Interactive 3D Earth environmental-intelligence dashboard: a React + Three.js globe fed by a Flask API that aggregates live environmental data (USGS, NASA EONET/FIRMS, Open-Meteo, AirNow) with clearly-labelled simulated fallbacks when providers are unreachable.

## Overview

Kimi Earth Sentinel renders an interactive 3D Earth (day/night textures, clouds, atmosphere glow, starfield) with switchable environmental layers. Selecting a layer fetches geolocated observations from the backend and renders them as severity-coloured 3D markers that can be hovered, clicked, filtered, and inspected in detail. A search box flies the camera to any matching location or event.

The app never silently presents simulated data as live measurements: every API payload carries a `data_status` block (`live` / `simulated` / `stale` / `unavailable`, plus source and fetch timestamp), and the UI surfaces it next to the data.

This is a modular monorepo-style project with two siblings that are never nested:

```text
Kimi-Earth-Sentinel-3D/
├── frontend/   # React client (deploys to Vercel)
└── backend/    # Flask API (deploys to Render)
```

## Key Features

- Interactive 3D Earth (Three.js / React Three Fiber): rotate, zoom, auto-rotation, night lights, clouds, atmosphere glow, starfield
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
- Production configs: Vercel (frontend) + Render + Gunicorn (backend)

## Tech Stack

| Area              | Technology                         | Version              |
| ----------------- | ---------------------------------- | -------------------- |
| Frontend          | React                              | 19                   |
| Language          | TypeScript                         | ~5.9                 |
| Build Tool        | Vite                               | 7                    |
| 3D Engine         | Three.js                           | ^0.185               |
| React 3D          | React Three Fiber                  | ^9                   |
| 3D Utilities      | Drei                               | ^10                  |
| Styling           | Tailwind CSS                       | ^3.4                 |
| UI                | Radix UI / shadcn-style components | assorted ^1/^2      |
| Icons             | Lucide React                       | ^0.562               |
| Backend           | Python                             | 3.12 (see below)     |
| API               | Flask                              | 3.0.3                |
| HTTP Client       | Requests                           | 2.32.3               |
| Cache             | Process-local InMemoryCache        | — (no server needed) |
| Scheduler         | APScheduler                        | 3.10.4               |
| Logging           | structlog                          | 24.4.0               |
| Production Server | Gunicorn                           | 22.0.0               |
| Frontend Testing  | Vitest + Testing Library           | Vitest ^5            |
| Backend Testing   | pytest                             | 8.3.4                |
| CI                | GitHub Actions                     | —                    |
| Frontend Hosting  | Vercel                             | —                    |
| Backend Hosting   | Render                             | —                    |

Supporting frontend libraries (forms, charts, utilities — not core stack): `react-hook-form`, `zod`, `recharts`, `date-fns`, `clsx` / `tailwind-merge` / `class-variance-authority`, `cmdk`, `embla-carousel-react`, `input-otp`, `next-themes`, `react-day-picker`, `react-resizable-panels`, `sonner`, `vaul`. State is local React state (`useState` + hooks); there is no Redux, Zustand store, or React Router in the application code.

Python runtime is pinned to `python-3.12.7` in `backend/runtime.txt`; local development requires Python 3.12+ and Node.js 20+.

## System Architecture

```text
User
 ↓
React frontend (frontend/src)
 ↓ JSON (/api/v1/*, centralized client in services/api.ts)
Flask REST API (backend/app)
 ↓ dispatch
Routes (validation + JSON) → application/service layer → provider adapters
 ↓ HTTPS
External environmental APIs (USGS, NASA EONET/FIRMS/GIBS, Open-Meteo, AirNow)
```

- **Frontend (`frontend/src`)** — globe scene, markers, panels, search, and a single centralized API client (`services/api.ts`). Components never construct backend URLs directly. One layer is active at a time (`activeLayer` in `App.tsx`).
- **Flask API (`backend/app`)** — route validation, per-layer TTL caching, `data_status` provenance envelope, predictable JSON error handlers.
- **Application/service layer (`backend/app/services/layer_service.py`, `event_detail.py`)** — owns provider dispatch, cache lookup/store, and stale-fallback semantics. Shared by HTTP routes and the optional cache-warming scheduler.
- **Provider adapters (`backend/app/services/usgs.py`, `nasa_eonet.py`, `nasa_firms.py`, `open_meteo.py`, `airnow.py`, plus `heatmap.py`, `imagery.py`, `geocode.py`, `fallback.py`)** — each fetches from one upstream API and normalizes to the canonical payload. Adapters hold no Flask `request` objects and touch no cache directly.
- **Routes (`backend/app/routes/`)** — thin HTTP controllers: validate query params, call the service layer, render JSON. Provider-specific logic belongs in service/provider modules, never in routes.
- **Utilities (`backend/app/utils/`)** — `validation.py` (query-param parsing; malformed input yields `400`, never `500`) and `provenance.py` (the `data_status` envelope, per-layer TTLs).
- **Cache (`backend/app/cache_service.py`)** — `CacheService` interface with an `InMemoryCache` implementation (process-local, thread-safe, bounded, TTL-based).

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

There is no database, no Redis, no PostgreSQL/PostGIS, no persistent environmental data store, and no production background worker. The application visualizes externally-owned provider data rather than persisting its own dataset, so a short-lived process-local cache is sufficient. Cache warming via the in-process APScheduler exists but is disabled in production (see below).

## Environmental Data Sources

| Layer | Provider | Needs key | Without key / on failure |
|---|---|---|---|
| Earthquakes | USGS FDSNWS | No | Simulated (labelled) |
| Disasters | NASA EONET | No | Simulated (labelled) |
| Temperature / Precipitation / Clouds / Wind | Open-Meteo | No | Simulated (labelled) |
| Air quality | AirNow (US only) | `AIRNOW_API_KEY` | Simulated (labelled); `bbox` rejected with `400 UNSUPPORTED_PARAM` (cannot be honored by this source) |
| Wildfires | NASA FIRMS | `NASA_FIRMS_API_KEY` | Simulated (labelled) |
| Satellite imagery | NASA GIBS | No | Tile redirect to GIBS WMTS (allow-listed layers only) |

All upstream base URLs and both API keys are server-side configuration (`backend/app/config.py`); keys are never sent to the frontend.

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
├── render.yaml                    # Render backend deployment (rootDir: backend)
├── .github/workflows/ci.yml       # Frontend (lint/test/build) + backend (pytest) jobs
├── frontend/                      # React/Vite app (Vercel Root Directory)
│   ├── package.json
│   ├── vite.config.ts             # dev server on :3000, "@" alias, dev-only inspect plugin
│   ├── vitest.config.ts           # jsdom + setup file, src/**/*.test.{ts,tsx}
│   ├── index.html
│   ├── public/textures/           # Earth day/night/cloud/topology/water
│   ├── src/
│   │   ├── App.tsx                # active layer, selection, fly-to, shortcuts
│   │   ├── components/globe/      # GlobeScene (canvas) + Globe (markers, flight)
│   │   ├── components/panels/     # TopNav, LayerPanel, DataPanel, BottomBar, SettingsModal
│   │   ├── components/overlays/   # Tooltip, DataStatusBanner
│   │   ├── components/ui/         # shadcn-style Radix primitives
│   │   ├── hooks/                 # useLayers/useLayerData, useSearch, useKeyboardShortcuts
│   │   ├── services/api.ts        # centralized API base URL + client
│   │   ├── lib/geo.ts             # canonical coordinate validation + projection
│   │   ├── lib/format.ts          # units, relative time, coordinate formatting
│   │   ├── shaders/               # atmosphere shader
│   │   └── types/                 # DataPoint, LayerData, DataStatus, …
│   ├── .env.example               # VITE_API_BASE_URL template
│   └── README.md                  # frontend quick-start
├── backend/                       # Flask API (Render rootDir)
│   ├── wsgi.py                    # Gunicorn entrypoint (honours $PORT, defaults to 5001)
│   ├── requirements.txt           # production deps
│   ├── requirements-dev.txt       # pytest
│   ├── runtime.txt                # Python version for Render (python-3.12.7)
│   ├── .env.example               # backend env template
│   ├── README.md                  # backend quick-start
│   ├── app/
│   │   ├── __init__.py            # app factory: CORS allow-list, JSON errors, /api/health
│   │   ├── config.py              # central config (URLs/keys/timeouts from env)
│   │   ├── cache_service.py       # CacheService interface + InMemoryCache (process-local)
│   │   ├── routes/                # layers, events, search, stats, geocode, imagery, health
│   │   ├── services/              # layer_service, event_detail, usgs, nasa_eonet,
│   │   │                          # nasa_firms, open_meteo, airnow, heatmap,
│   │   │                          # fallback, imagery, geocode
│   │   ├── models/                # layer metadata
│   │   ├── utils/                 # validation (400s, never 500s) + provenance (data_status)
│   │   └── scheduler/jobs.py      # opt-in cache warming (disabled in production)
│   └── tests/                     # pytest contract + unit tests
└── docs/
    ├── development.md             # practical dev guide (setup, env, tests, deploy)
    └── prompts/                   # briefs from prior foundation passes
```

## Local Development

Prerequisites: Node.js 20+, Python 3.12+.

Backend (serves on `http://localhost:5001` by default; `PORT` wins, `FLASK_PORT` is the local fallback):

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate | macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env        # or: cp .env.example .env
# FLASK_PORT defaults to 5001; provider keys optional (see below)
python wsgi.py
```

Frontend (Vite dev server on `http://localhost:3000`):

```bash
cd frontend
npm install
copy .env.example .env        # then set VITE_API_BASE_URL if needed
npm run dev                   # Vite on http://localhost:3000
```

Open `http://localhost:3000`, pick a layer (or press `5` for earthquakes). The client defaults to `http://localhost:5001/api/v1`; in production set `VITE_API_BASE_URL` to the Render backend URL.

## Environment Variables

Frontend (`frontend/.env`):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes (prod) | `http://localhost:5001/api/v1` | Backend base URL incl. `/api/v1` |
| `VITE_API_URL` | No | — | Legacy alias, used only if the above is unset |

Backend (`backend/.env`):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `FLASK_ENV` | No | `production` | `development` enables verbose 500s |
| `SECRET_KEY` | Yes (prod) | dev placeholder | Flask secret; warning logged if default in prod |
| `PORT` / `FLASK_PORT` | No | `5001` | Listen port (`PORT` wins; Render injects it) |
| `CORS_ORIGINS` | Yes (prod) | `http://localhost:3000,http://localhost:5173` | Allowed browser origins, comma-separated |
| `CACHE_DEFAULT_TIMEOUT` | No | `300` | Fallback cache TTL (s); per-layer TTLs in code |
| `USGS_API_URL` / `NASA_EONET_URL` / `NASA_FIRMS_URL` / `NASA_GIBS_URL` / `OPEN_METEO_URL` / `AIRNOW_API_URL` | No | provider defaults | Upstream base URLs (override for tests/proxies) |
| `AIRNOW_API_KEY` | For live AQI | — | Server-side only; air quality is simulated without it |
| `NASA_FIRMS_API_KEY` | For live fires | — | Server-side only; wildfires are simulated without it |
| `REQUEST_TIMEOUT` | No | `15` | Upstream HTTP timeout (seconds) |
| `SCHEDULER_ENABLED` | No | `true` (local) / `false` (Render) | Opt-in cache warming toggle (`false` disables; production stays `false`) |

Never commit `.env` files or keys; both are git-ignored with `.env.example` templates provided.

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

Frontend (`cd frontend`):

```bash
npm run lint          # eslint
npm test              # vitest run (jsdom; src/**/*.test.{ts,tsx})
npm run build         # tsc -b && vite build → dist/
```

Backend (`cd backend`):

```bash
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests/ -q
```

CI (`.github/workflows/ci.yml`) runs both on pushes to `main` and on all pull requests: frontend `npm ci` → `lint` → `test` → `build` (Node 20), and backend `pip install -r requirements.txt -r requirements-dev.txt` → `pytest` (Python 3.12, scheduler disabled via `DISABLE_SCHEDULER=1`).

## Deployment

Intended architecture (not claimed as currently live — configure your own instances):

```text
GitHub
├── frontend/ → Vercel
└── backend/  → Render + Gunicorn
```

Backend → Render (see `render.yaml` at repo root):

- Root Directory `backend`, build `pip install -r requirements.txt`, start via Gunicorn (`wsgi:app`, honours `$PORT`), health check `/api/health`, Python pinned in `runtime.txt`.
- Set `CORS_ORIGINS` to the Vercel frontend origin(s), comma-separated, plus `SECRET_KEY` and any provider keys. The backend uses an explicit allow-list — never `*`.
- `SCHEDULER_ENABLED` is `false` in production: with multiple Gunicorn workers each process would run its own scheduler against its own process-local cache — duplicate provider traffic with no shared benefit. Request-time cache + stale fallback need no warming.

Frontend → Vercel:

- Root Directory `frontend`, framework Vite, build `npm run build`, output `dist`.
- Set `VITE_API_BASE_URL` to `https://<your-render-service>.onrender.com/api/v1`. No localhost URL is baked into the client; all calls go through the centralized `API_BASE`.

CORS:

- The Flask API enables CORS only for `/api/*` against the explicit `CORS_ORIGINS` allow-list (exact origins, comma-separated). There is no wildcard mode.
- Local development default covers the Vite dev server (`http://localhost:3000`, `http://localhost:5173`).
- Production: set `CORS_ORIGINS` to the deployed Vercel frontend origin(s). After renaming the Vercel project or adding a custom domain, update this variable — otherwise browsers block API requests. Preview deployments with distinct URLs need their own entries.

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
2. Frontend: `cd frontend && npm install && npm run dev` — keep `npm run lint` and `npm run build` clean.
3. Backend: `cd backend && pip install -r requirements.txt -r requirements-dev.txt && python -m pytest tests` — new endpoints need validation tests and `data_status` coverage.
4. Never commit secrets, `__pycache__`, or `node_modules`; simulated data must always stay labelled.

## License

Licensing is currently unspecified.
