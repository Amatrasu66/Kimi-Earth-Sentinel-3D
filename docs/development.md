# Development guide

Practical reference for working in this repository. The root `README.md` covers architecture, data sources, and deployment in depth.

## Repository structure

```
Kimi-Earth-Sentinel-3D/
├── frontend/    # React + TypeScript + Vite + Three.js client (Vercel Root Directory)
├── backend/     # Flask API (Render rootDir)
├── docs/
│   ├── development.md   # this file
│   └── prompts/         # briefs from prior foundation passes
├── .github/workflows/ci.yml
├── README.md
└── render.yaml
```

`frontend/` and `backend/` are siblings — never nest one inside the other.

## Start the backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate | macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env        # or: cp .env.example .env
python wsgi.py                # http://localhost:5001, GET /api/health
```

Provider keys (`AIRNOW_API_KEY`, `NASA_FIRMS_API_KEY`) are optional; without them the affected layers return clearly-labelled `SIMULATED` data.

## Start the frontend

```bash
cd frontend
npm install
copy .env.example .env        # then set VITE_API_BASE_URL if needed
npm run dev                   # http://localhost:3000
```

The client defaults to `http://localhost:5001/api/v1`; in production set `VITE_API_BASE_URL` to the Render backend URL (Vercel → Root Directory `frontend`, build `npm run build`, output `dist`).

## Environment files

| File | Purpose |
|---|---|
| `frontend/.env` (from `.env.example`) | `VITE_API_BASE_URL` (+ legacy `VITE_API_URL` fallback) |
| `backend/.env` (from `.env.example`) | `SECRET_KEY`, `CORS_ORIGINS`, provider URLs/keys, `REQUEST_TIMEOUT`, `SCHEDULER_ENABLED` |

Never commit `.env` files or keys; both are git-ignored.

## Test / build commands

Frontend (`cd frontend`):

```bash
npm run lint
npm test          # vitest run
npm run build     # tsc -b && vite build → dist/
```

Backend (`cd backend`):

```bash
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests/ -q
```

## Deployment overview

- **Backend → Render:** `render.yaml` (`rootDir: backend`, Gunicorn `wsgi:app`, health check `/api/health`). Set `CORS_ORIGINS` to the Vercel origin(s), `SECRET_KEY`, and provider keys. `SCHEDULER_ENABLED` stays `false` in production.
- **Frontend → Vercel:** Root Directory `frontend`, `npm run build`, output `dist`, `VITE_API_BASE_URL` pointing at the Render service.

## Where integrations live

- **Provider integrations:** `backend/app/services/` — one adapter per upstream (`usgs`, `nasa_eonet`, `nasa_firms`, `open_meteo`, `airnow`), plus `heatmap`, `fallback`, `imagery`, `geocode`. Dispatch + cache + stale-fallback live in `services/layer_service.py`.
- **Frontend API integration:** `frontend/src/services/api.ts` — the single client boundary (base URL, timeout, cancellation, error normalization). Components never call `fetch` directly.
- **Provenance:** every payload carries `data_status` (`live` / `simulated` / `stale` / `unavailable`); see `backend/app/utils/provenance.py` and `frontend/src/components/overlays/DataStatusBanner.tsx`.

## Current caching approach

`CacheService` → `InMemoryCache`: thread-safe, TTL-based, bounded, process-local (`backend/app/cache_service.py`). Short TTL for simulated payloads, `STALE` re-serve of expired live entries on refresh failure. **No database or Redis is required for V1** — the app visualizes externally-owned provider data rather than persisting its own dataset.
