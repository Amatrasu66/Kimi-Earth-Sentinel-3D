# Development guide

Practical reference for working in this repository. The root `README.md` covers architecture, data sources, and deployment in depth.

## Repository structure

```
Kimi-Earth-Sentinel-3D/
├── src/app/api/   # Next.js Route Handlers (health, v1/*)
├── src/server/    # config, provenance, validation, cache, http,
│                  # models, providers/*, services/*
├── frontend/      # React + TypeScript + Vite + Three.js client
├── backend/       # RETIRED Flask API (archived reference, not deployed)
├── docs/
│   ├── development.md   # this file
│   └── prompts/         # briefs from prior foundation passes
├── .github/workflows/ci.yml
├── package.json         # root Next.js app
├── next.config.mjs / vercel.json
└── .env.example         # API env template (server-only)
```

`frontend/` (Vite client) and the root Next.js API app are siblings — never nest one inside the other.

## Start the API backend

```bash
npm install
copy .env.example .env        # then set AIRNOW_API_KEY / NASA_FIRMS_API_KEY if needed
npm run dev                   # http://localhost:3000, GET /api/health
```

Provider keys (`AIRNOW_API_KEY`, `NASA_FIRMS_API_KEY`) are optional; without them the affected layers return clearly-labelled `SIMULATED` data.

## Start the frontend

```bash
cd frontend
npm install
copy .env.example .env        # then set VITE_API_BASE_URL if needed
npm run dev                   # http://localhost:3000 (use another port if the API dev server is on 3000)
```

The client defaults to `http://localhost:5001/api/v1` (legacy Flask dev default); locally point `VITE_API_BASE_URL` at the Next.js API (`http://localhost:3000/api/v1`), and in production at same-origin `/api/v1` (see root README → Deployment).

## Environment files

| File | Purpose |
|---|---|
| `frontend/.env` (from `.env.example`) | `VITE_API_BASE_URL` (+ legacy `VITE_API_URL` fallback) |
| root `.env` (from `.env.example`) | provider URLs/keys, `REQUEST_TIMEOUT`, `CACHE_DEFAULT_TIMEOUT` (all server-only) |

Never commit `.env` files or keys; both are git-ignored.

## Test / build commands

API (repo root):

```bash
npm run typecheck
npm test            # vitest run (node; src/**/*.test.ts)
npm run build       # next build
```

Frontend (`cd frontend`):

```bash
npm run lint
npm test          # vitest run
npm run build     # tsc -b && vite build → dist/
```

## Diagnosing production connectivity

1. Open the deployed frontend → Settings → Diagnostics. It shows the configured API base + source, backend health + latency, current layer/provenance, WebGPU support, and the active renderer.
2. If `API base` reads `not configured`, the Vercel build is missing `VITE_API_BASE_URL` — set it to same-origin `/api/v1` (or the deployed `https://<app>.vercel.app/api/v1`) and redeploy. The client intentionally refuses to fall back to localhost in production.
3. If `Backend health` reads `unreachable`, check the Vercel deployment (failed build, missing env vars). There is no CORS layer anymore — same-origin requests cannot fail on CORS.
4. `GET /api/health` and `GET /api/v1/health` must both return `{ status: "ok", … }`; `GET /api/v1/layers` must list the 8 layers.

## Earth renderer

- `components/globe/WebGPUEarth.tsx` — WebGPU + TSL Earth (Three.js 0.185.x: `three/webgpu`, `three/tsl`, OrbitControls from `three/addons`). Imperative engine in a mount-once effect; props flow through refs so the frame loop never sets React state. Full cleanup on unmount (animation loop, controls, listeners, geometries/materials/textures, renderer).
- `components/globe/EarthRenderer.tsx` — probes `lib/webgpu.ts`, lazy-loads the WebGPU chunk on capable browsers, falls back to `Globe`/`GlobeScene` (WebGL) otherwise or on init error.
- `lib/webgpu.ts` — cached `navigator.gpu.requestAdapter()` probe; unit-tested with mocks (never requires a real GPU in CI).
- Manual GPU validation cannot run in Vitest/jsdom: verify in a real browser (see root README → Earth Renderer).

## Deployment overview

- **Single Vercel project (repo root):** framework Next.js, build `npm run build`. Set server-only `AIRNOW_API_KEY` / `NASA_FIRMS_API_KEY` (never `NEXT_PUBLIC_`). No Render, no `render.yaml`, no CORS, no scheduler.
- **Frontend transition:** `frontend/src/services/api.ts` still resolves `VITE_API_BASE_URL`; switch it to same-origin `/api/v1` (files: `frontend/src/services/api.ts`, `frontend/.env.example`, Vercel env dashboard).

## Where integrations live

- **Provider integrations:** `src/server/providers/` — one adapter per upstream (`usgs`, `nasa-eonet`, `nasa-firms`, `open-meteo`, `airnow`), plus `heatmap`, `fallback`, `imagery`, `geocode`. Dispatch + cache + stale-fallback live in `src/server/services/layers.ts`. Individual event lookup lives in `src/server/services/event-detail.ts`: an explicit id resolver routes raw ids to the USGS detail feed, `eonet-*` ids to the EONET event endpoint, and everything else (FIRMS fire observations, mock markers, other layers) to labelled simulated detail. No database is required — details are fetched on demand and cached briefly per instance.
- **Frontend API integration:** `frontend/src/services/api.ts` — the single client boundary (base URL, timeout, cancellation, error normalization). Components never call `fetch` directly.
- **Provenance:** every payload carries `data_status` (`live` / `simulated` / `stale` / `unavailable`); see `src/server/provenance.ts` and `frontend/src/components/overlays/DataStatusBanner.tsx`.

## Current caching approach

Per-instance in-memory TTL store with stale fallback (`src/server/cache.ts`, `FALLBACK_TTL=60`, `STALE` re-serve of expired live entries on refresh failure). Vercel serverless instances are ephemeral, so the cache is a best-effort per-instance optimization, never the source of truth. **No database or Redis is required** — the app visualizes externally-owned provider data rather than persisting its own dataset.
