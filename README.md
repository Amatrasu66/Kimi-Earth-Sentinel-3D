# Kimi Earth Sentinel

Interactive 3D Earth environmental-intelligence dashboard: a React + Three.js globe fed by a Flask API that aggregates live environmental data (USGS, NASA EONET/FIRMS, Open-Meteo, AirNow) with clearly-labelled simulated fallbacks when providers are unreachable.

## Overview

Kimi Earth Sentinel renders an interactive 3D Earth (day/night textures, clouds, atmosphere, starfield) with switchable environmental layers. Selecting a layer fetches geolocated observations from the backend and renders them as severity-coloured 3D markers that can be hovered, clicked, filtered, and inspected in detail. A search box flies the camera to any matching location or event.

Crucially, the app never silently presents simulated data as live measurements: every API payload carries a `data_status` block (`live` / `simulated` / `stale` / `unavailable` + source + fetch timestamp), and the UI surfaces it next to the data.

## Features

- Interactive 3D Earth (Three.js / React Three Fiber): rotate, zoom, auto-rotation, night lights, clouds, atmosphere glow, starfield
- Environmental layers: temperature, precipitation, cloud cover, wind, earthquakes, natural disasters, air quality, wildfires
- Live data from USGS, NASA EONET, NASA FIRMS, Open-Meteo, AirNow (keys required for AirNow/FIRMS)
- Simulated fallback data that is always labelled `SIMULATED` in the UI
- Interactive severity-coloured markers (InstancedMesh) with hover tooltips and click-to-inspect event details
- Location/event search with smooth interruptible camera fly-to
- Severity filtering, layer legends with units, data-freshness indicators
- Keyboard shortcuts (1–8 layers, Space pause, Esc back/close)
- Per-layer HTTP caching with honest `fetched_at` / `cache_hit` metadata
- Gridded heatmap endpoint with a simulated provider behind a swappable interface
- Production configs: Vercel (frontend) + Render + Gunicorn (backend)

## Screenshots

No screenshots are checked in yet. To add them, place PNG files under `docs/screenshots/` and reference them here, e.g.:

- `docs/screenshots/globe-overview.png` — globe with the earthquakes layer active
- `docs/screenshots/event-detail.png` — event detail panel with provenance banner
- `docs/screenshots/simulated-banner.png` — simulated-data disclosure state

## Architecture

```
┌──────────────┐      ┌────────────────┐      ┌──────────────────┐      ┌─────────────────────────┐
│  React +     │      │  Flask API     │      │  Data services   │      │  Upstream providers     │
│  Vite +      │─────▶│  /api/v1/*     │─────▶│  usgs / eonet /  │─────▶│  USGS · NASA EONET ·    │
│  Three.js    │ JSON │  validation +  │      │  open_meteo /    │ HTTP │  NASA FIRMS ·           │
│  frontend    │◀─────│  cache +       │      │  airnow / firms  │◀─────│  Open-Meteo · AirNow    │
│  (app/src)   │      │  data_status   │      │  + fallback      │      │                         │
└──────────────┘      └────────────────┘      └──────────────────┘      └─────────────────────────┘
```

- **Frontend (`app/src`)** — globe scene, markers, panels, search, API client (`services/api.ts`), formatting/provenance display. Single `activeLayer` state (see *Future Roadmap* for compositing plans).
- **Flask API (`app/backend/app`)** — route validation, per-layer TTL caching, `data_status` provenance envelope, JSON error handlers.
- **Data services (`app/backend/app/services`)** — one module per provider; provider errors and normalization errors are handled separately; failures degrade to *labelled* simulated data, never silent fakes.
- **Fallback (`services/fallback.py`)** — deterministic demo data used only when a provider is unreachable/misconfigured.

## Tech Stack

Frontend:

- React 19, TypeScript, Vite 7
- Three.js, React Three Fiber, Drei
- Tailwind CSS (+ shadcn-style `components/ui` primitives)
- lucide-react icons

Backend:

- Python, Flask, Flask-CORS, Flask-Caching, Gunicorn
- requests, APScheduler (cache-warming schedule), structlog, python-dotenv
- pytest (dev)

## Data Sources

| Layer | Provider | Needs key | Without key / on failure |
|---|---|---|---|
| Earthquakes | USGS FDSNWS | No | Simulated (labelled) |
| Disasters | NASA EONET | No | Simulated (labelled) |
| Temperature / Precipitation / Clouds / Wind | Open-Meteo | No | Simulated (labelled) |
| Air quality | AirNow (US only) | `AIRNOW_API_KEY` | Simulated (labelled) |
| Wildfires | NASA FIRMS | `NASA_FIRMS_API_KEY` | Simulated (labelled) |

Live vs cached vs simulated:

- **Live** — payload came straight from the provider (`data_status.status: "live"`, `fetched_at` = fetch time).
- **Cached** — repeated requests within the layer TTL return the same payload with `meta.cache_hit: true` and the original `fetched_at`; the UI shows the actual age ("Updated 4 min ago"), never "real-time".
- **Simulated** — provider unreachable or key missing; the UI shows an amber `SIMULATED · <source> unavailable · Showing fallback data` banner.
- **Heatmaps** are currently simulated for all layers (deterministic seeded grids) behind the same schema, so real gridded datasets can be plugged in per layer without frontend changes.

## Project Structure

```
Kimi-Earth-Sentinel-3D/
├── render.yaml                  # Render backend deployment
├── README.md
└── app/                         # Frontend root (Vercel Root Directory)
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    ├── public/textures/         # Earth day/night/cloud/topology/water
    ├── src/
    │   ├── App.tsx              # Active layer, selection, fly-to, shortcuts
    │   ├── components/globe/    # GlobeScene (canvas) + Globe (markers, flight)
    │   ├── components/panels/   # TopNav, LayerPanel, DataPanel, BottomBar, SettingsModal
    │   ├── components/overlays/ # Tooltip, DataStatusBanner
    │   ├── hooks/               # useLayers/useLayerData (loop-safe), useStats/useSearch
    │   ├── services/api.ts      # Centralized API base URL + client
    │   ├── lib/geo.ts           # Canonical coordinate validation + projection
    │   ├── lib/format.ts        # Units, relative time, coordinate formatting
    │   └── types/               # DataPoint, LayerData, DataStatus, …
    └── backend/
        ├── wsgi.py              # Gunicorn entrypoint (honours $PORT)
        ├── requirements.txt     # Production deps
        ├── requirements-dev.txt # pytest
        ├── runtime.txt          # Python version for Render
        ├── .env.example
        ├── app/
        │   ├── __init__.py      # App factory: CORS allow-list, JSON errors, /api/health
        │   ├── config.py
        │   ├── cache.py         # Shared Flask-Caching instance
        │   ├── routes/          # layers, events, search, stats, geocode, imagery, health
        │   ├── services/        # usgs, nasa_eonet, nasa_firms, open_meteo, airnow, heatmap, fallback
        │   ├── utils/           # validation (400s, never 500s) + provenance (data_status)
        │   └── scheduler/jobs.py
        └── tests/               # pytest: contract + unit tests
```

## Local Development

Prerequisites: Node.js 20+, Python 3.12+.

Backend:

```bash
cd app/backend
python -m venv .venv
# Windows: .venv\Scripts\activate | macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env        # or: cp .env.example .env
# FLASK_PORT defaults to 5001; provider keys optional (see below)
python wsgi.py
```

Frontend:

```bash
cd app
npm install
# point at the backend (defaults to http://localhost:5001/api/v1)
copy .env.example .env        # then set VITE_API_BASE_URL if needed
npm run dev                   # Vite on http://localhost:3000
```

Open `http://localhost:3000`, pick a layer (or press `5` for earthquakes).

## Environment Variables

Frontend (`app/.env`):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes (prod) | `http://localhost:5001/api/v1` | Backend base URL incl. `/api/v1` |
| `VITE_API_URL` | No | — | Legacy alias, used only if the above is unset |

Backend (`app/backend/.env`):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `FLASK_ENV` | No | `production` | `development` enables verbose 500s |
| `SECRET_KEY` | Yes (prod) | dev placeholder | Flask secret; warning logged if default in prod |
| `PORT` / `FLASK_PORT` | No | `5001` | Listen port (`PORT` wins; Render injects it) |
| `CORS_ORIGINS` | Yes (prod) | `http://localhost:3000,http://localhost:5173` | Allowed browser origins, comma-separated |
| `CACHE_TYPE` | No | `simple` | `simple` or `redis` |
| `REDIS_URL` | If redis | — | Redis URL for cache backend |
| `AIRNOW_API_KEY` | For live AQI | — | Server-side only; air quality is simulated without it |
| `NASA_FIRMS_API_KEY` | For live fires | — | Server-side only; wildfires are simulated without it |
| `REQUEST_TIMEOUT` | No | `15` | Upstream HTTP timeout (seconds) |

Never commit `.env` files or keys; both are git-ignored with `.env.example` templates provided.

## API

Base URL `/api/v1` (plus unversioned `GET /api/health` for deployment checks). All success responses use `{ success: true, data, meta }`; errors use `{ success: false, error: { code, message } }` with meaningful status codes (400 validation, 404 unknown layer/route, 405 wrong method).

| Endpoint | Description |
|---|---|
| `GET /api/health` | Liveness: `{ status: "ok", service, version, timestamp, uptime_seconds }` |
| `GET /api/v1/health` | Same payload, versioned |
| `GET /api/v1/layers` | Layer metadata (id, name, source, unit, color scale, refresh interval) |
| `GET /api/v1/layers/<layer_id>/data?bbox=&limit=&min_severity=` | Points + stats + `data_status`; validated (`limit` 1–2000, bbox ranges, known severities); cached per layer TTL |
| `GET /api/v1/layers/<layer_id>/heatmap?resolution=&time_range=` | Base64 float32 grid + `data_status` (currently simulated; same schema for future real grids) |
| `GET /api/v1/events/<id>` | Event detail (currently simulated, labelled; live lookup is an extension point) |
| `GET /api/v1/search?q=&type=&limit=` | Location/event search over bundled gazetteer + event index |
| `GET /api/v1/stats` | Global rollup (simulated, labelled) |
| `GET /api/v1/stats/historical?metric=&period=&aggregation=` | Placeholder series (simulated, labelled — no fake history presented as measured) |
| `GET /api/v1/geocode/reverse?lat=&lon=` | Coarse region lookup (simulated, labelled) |
| `GET /api/v1/imagery/gibs/capabilities` | NASA GIBS layer catalogue |
| `GET /api/v1/imagery/gibs/tile/<layer>/<z>/<x>/<y>` | Redirect to NASA GIBS tile (allow-listed layers only) |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `1`–`8` | Toggle temperature, precipitation, clouds, wind, earthquakes, disasters, air quality, wildfires |
| `Space` | Pause / resume globe rotation |
| `Esc` | Back to layer → close panel → close settings |
| `Enter` (in search) | Fly to first result |

Shortcuts are ignored while typing in inputs.

## Deployment

Backend → Render (see `render.yaml` at repo root):

- Root Directory `app/backend`, build `pip install -r requirements.txt`, start via Gunicorn (`wsgi:app`, honours `$PORT`), health check `/api/health`, Python pinned in `runtime.txt`.
- Set `CORS_ORIGINS` to the Vercel frontend origin, plus `SECRET_KEY` and any provider keys.

Frontend → Vercel:

- Root Directory `app`, framework Vite, build `npm run build`, output `dist`.
- Set `VITE_API_BASE_URL` to `https://<your-render-service>.onrender.com/api/v1`. No localhost URL is baked into the client; all calls go through the centralized `API_BASE`.

## Data Reliability

Upstream providers can be slow, rate-limited, or down — and two layers need keys that may not exist in every environment. The API therefore degrades gracefully **without lying**: failures and missing keys return deterministic fallback data wrapped in `data_status: { status: "simulated", source, fetched_at, message }`, and the frontend renders an amber `SIMULATED` banner wherever that data appears. Cached responses keep their original `fetched_at` with `cache_hit: true` so the UI reports true age. Event details and historical series are simulated placeholders in this build and are labelled as such; they are extension points for live endpoints, not real records.

## Performance

- Markers render as a single `THREE.InstancedMesh` with per-instance severity colours — one draw call for hundreds of markers.
- One canonical validated points array drives count, matrices, and picking, so instance `N` ≡ data point `N`.
- Raycasting is throttled to one pick per animation frame; listeners subscribe once (callbacks via refs); drags are distinguished from clicks; cursor state is restored on unmount.
- Globe/cloud spheres use 48-segment geometry (32 for atmosphere), no per-frame allocations in `useFrame` (delta-based, frame-rate independent), adaptive pixel-ratio cap (`1.5` on coarse-pointer/mobile, `2` desktop), reduced star count.
- `mousemove` for the tooltip is rAF-throttled to avoid re-rendering the app per pointer event; the minimap uses memoized dots.

## Future Roadmap

- Multi-layer compositing (visible-layers set + per-layer opacity; `MarkerSystem` already accepts arbitrary point arrays)
- Timeline/history playback (24h / 48h / 7d) backed by real archives — no fabricated history
- Real gridded heatmaps per layer via `HEATMAP_PROVIDERS` (schema is ready)
- Live single-event lookup in `GET /events/<id>` (USGS/EONET by id)
- PostGIS + Redis for geospatial filtering and shared caching
- Alerting, richer analytics, mobile layout refinements

## Contributing

1. Fork and branch from `main`.
2. Frontend: `cd app && npm install && npm run dev` — keep `npm run lint` and `npm run build` clean.
3. Backend: `cd app/backend && pip install -r requirements.txt -r requirements-dev.txt && python -m pytest tests` — new endpoints need validation tests and `data_status` coverage.
4. Never commit secrets, `__pycache__`, or `node_modules`; simulated data must always stay labelled.

## License

Licensing is currently unspecified.
