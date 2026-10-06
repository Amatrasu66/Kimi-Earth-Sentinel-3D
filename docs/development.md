# Development guide

Practical reference for working in this repository. The root `README.md` covers architecture, data sources, and deployment in depth.

## Repository structure

```
Kimi-Earth-Sentinel-3D/
├── src/app/         # page.tsx (globe UI) + layout.tsx + globals.css + api/
├── src/server/      # config, provenance, validation, cache, providers, services
├── src/components/  # app shell, globe (WebGPU ssr:false + WebGL fallback), panels, ui
├── src/hooks|lib|types|shaders|services/  # incl. same-origin api.ts (/api/v1)
├── docs/
│   ├── development.md   # this file
│   └── prompts/         # briefs from prior foundation passes
├── .github/workflows/ci.yml
├── package.json         # root Next.js app
├── next.config.mjs / vercel.json
├── tailwind.config.js
└── .env.example         # API env template (server-only)
```

`src/` is the single application (UI + API).

## Start the app

```bash
npm install
copy .env.example .env        # then set AIRNOW_API_KEY / NASA_FIRMS_API_KEY if needed
npm run dev                   # http://localhost:3000 — globe UI at /, API at /api/*
```

Provider keys (`AIRNOW_API_KEY`, `NASA_FIRMS_API_KEY`) are optional; without them the affected layers return clearly-labelled `SIMULATED` data. The UI calls same-origin `/api/v1` — no `VITE_API_BASE_URL`, no CORS.

## Environment files

| File | Purpose |
|---|---|
| root `.env` (from `.env.example`) | provider URLs/keys, `REQUEST_TIMEOUT`, `CACHE_DEFAULT_TIMEOUT` (all server-only) |

Never commit `.env` files or keys; both are git-ignored.

## Test / build commands

```bash
npm run lint            # eslint (app + server)
npm run typecheck       # tsc --noEmit
npm test                # vitest run (node API tests + jsdom UI tests)
npm run build           # next build
```

## Diagnosing production connectivity

1. Open the deployed app → Settings → Diagnostics. It shows the configured API base + source, backend health + latency, current layer/provenance, WebGPU support, and the active renderer.
2. If `Backend health` reads `unreachable`, check the Vercel deployment (failed build, missing env vars). There is no CORS layer — same-origin requests cannot fail on CORS. (The old `API base: not configured` state no longer exists: the base is the constant `/api/v1`.)
3. `GET /api/health` and `GET /api/v1/health` must both return `{ status: "ok", … }`; `GET /api/v1/layers` must list the 8 layers.

## Earth renderer

- `components/globe/WebGPUEarth.tsx` — WebGPU + TSL Earth (Three.js 0.185.x: `three/webgpu`, `three/tsl`, OrbitControls from `three/addons`). Imperative engine in a mount-once effect; props flow through refs so the frame loop never sets React state. Full cleanup on unmount (animation loop, controls, listeners, geometries/materials/textures, renderer).
- `components/globe/EarthRenderer.tsx` — probes `lib/webgpu.ts`, lazy-loads the WebGPU chunk on capable browsers, falls back to `Globe`/`GlobeScene` (WebGL) otherwise or on init error.
- `lib/webgpu.ts` — cached `navigator.gpu.requestAdapter()` probe; unit-tested with mocks (never requires a real GPU in CI).
- Manual GPU validation cannot run in Vitest/jsdom: verify in a real browser (see root README → Earth Renderer).

## Deployment overview

- **Single Vercel project (repo root):** framework Next.js, build `npm run build`. Set server-only `AIRNOW_API_KEY` / `NASA_FIRMS_API_KEY` (never `NEXT_PUBLIC_`). No Render, no separate frontend deployment, no CORS, no scheduler. The UI (`/`) and API (`/api/*`) ship together.

## Where integrations live

- **Provider integrations:** `src/server/providers/` — one adapter per upstream (`usgs`, `nasa-eonet`, `nasa-firms`, `open-meteo`, `airnow`), plus `heatmap`, `fallback`, `imagery`, `geocode`. Dispatch + cache + stale-fallback live in `src/server/services/layers.ts`. Individual event lookup lives in `src/server/services/event-detail.ts`: an explicit id resolver routes raw ids to the USGS detail feed, `eonet-*` ids to the EONET event endpoint, and everything else (FIRMS fire observations, mock markers, other layers) to labelled simulated detail. No database is required — details are fetched on demand and cached briefly per instance.
- **Frontend API integration:** `src/services/api.ts` — the single client boundary (same-origin `/api/v1` base, timeout, cancellation, error normalization). Components never call `fetch` directly.
- **Globe:** `src/components/globe/` — `EarthRenderer.tsx` probes WebGPU and loads `WebGPUEarth.tsx` (`three/webgpu` + TSL, `ssr: false` code-split) with the WebGL `Globe`/`GlobeScene` fallback. Rendering code is production-sensitive: do not rewrite the scene, textures, markers, controls, or animation loop. Textures live in `public/textures/`.
- **Provenance:** every payload carries `data_status` (`live` / `simulated` / `stale` / `unavailable`); see `src/server/provenance.ts` and `src/components/overlays/DataStatusBanner.tsx`.

## Current caching approach

Per-instance in-memory TTL store with stale fallback (`src/server/cache.ts`, `FALLBACK_TTL=60`, `STALE` re-serve of expired live entries on refresh failure). Vercel serverless instances are ephemeral, so the cache is a best-effort per-instance optimization, never the source of truth. **No database or Redis is required** — the app visualizes externally-owned provider data rather than persisting its own dataset.
