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

Prerequisites: Node.js 24 (`nvm use` picks it up from `.nvmrc`).

```bash
npm ci
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
3. `GET /api/health` and `GET /api/v1/health` must both return `{ status: "ok", … }`; `GET /api/v1` must return the `{ version, links }` index; `GET /api/v1/layers` must list the 8 layers. Health carries `started_at` (ISO 8601 instance-local boot time, captured at module load — not deployment time; it resets per serverless isolate, which is why the old `uptime_seconds` was removed).

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

## HTTP caching (T2.1)

Successful `LIVE` or static-catalogue responses carry `Cache-Control: public, s-maxage=<TTL>, stale-while-revalidate=<2 × TTL>` (helpers in `src/server/route-helpers.ts`). Everything else — errors, throttles, health, and stale/simulated fallbacks — carries `no-store`, so a shared cache never extends data that must stay current or was never live. Responses do not vary by request headers (no auth/cookies/content negotiation); query strings already differentiate shared-cache keys.

| Endpoint / layer | TTL (s-maxage) | Stale-while-revalidate | Policy rationale |
|---|---:|---:|---|
| `GET /api/v1/layers/<id>/data` — LIVE | per-layer `LAYER_TTLS` (300 quakes/disasters, 600 wildfires, 1800 clouds/wind/air_quality, 3600 temp/precip) | 2 × TTL | mirrors the in-memory TTL for live provider data |
| `GET /api/v1/events/<id>` — LIVE | 300 (`EVENT_DETAIL_TTL`) | 600 | live USGS/EONET detail, same TTL as the memory cache |
| `GET /api/v1/layers` | 3600 | 7200 | static code-defined catalogue, changes only on deploy |
| `GET /api/v1/imagery/gibs/capabilities` | 3600 | 7200 | static 3-layer catalogue |
| `GET /api/v1` (index) | 60 | 120 | static version + links; short TTL keeps `meta.timestamp` fresh |
| Health (`/api/health`, `/api/v1/health`) | `no-store` | — | per-isolate `started_at`/timestamp must remain current |
| Layer data / heatmap / event detail when STALE or SIMULATED | `no-store` | — | never extend fallback data through a shared cache |
| Search, stats, historical stats, reverse geocode, timezones | `no-store` | — | labelled SIMULATED (stats uses `Math.random` per request) |
| GIBS tile 302 redirect | (unchanged, no policy) | — | `Location` embeds the current date; upstream owns tile caching |
| 400 / 404 / 500 (`fail`/`notFound`/`internalError`) | `no-store` | — | invalid-input and internal errors are never public data |
| 429 (middleware) | `no-store` (+ `Retry-After`) | — | per-client throttle decisions, never cached as success |

How the layers interact:

- **In-memory L1** (`MemoryCache`): per-instance, keyed by full query (`layerCacheKey`/`heatmapCacheKey`/`eventCacheKey`). Only `LIVE` payloads get the full TTL; simulated payloads get `min(60, TTL)`; expired `LIVE` entries are re-served as `STALE` when refresh yields simulated data. `meta.cache_hit` reports the L1 outcome (`true` on fresh hit or stale re-serve); `fetched_at` is the provider fetch time and never moves on cache hits.
- **HTTP L2** (CDN/shared cache): applies only to the rows marked public above, with TTLs aligned to the L1 TTLs, so both layers expire together. `meta.timestamp` is the origin response time and legitimately lags on CDN-served responses.
- **Upstream `fetch` revalidation was evaluated and rejected:** provider fetches (`src/server/http.ts`) use plain `fetch` with no `next: { revalidate }`. A fetch cache would duplicate the L1 (same per-instance scope) while losing stale-fallback and provenance semantics, so no second cache layer was added.

Limitations (do not overclaim):

- No Vercel cache hit is claimed without deployment evidence (`x-vercel-cache` headers); local `next start` verification below proves origin headers only.
- Serverless isolates each hold their own L1; a cold isolate refetches from providers on first miss.
- CDN-served responses bypass the origin handler entirely, so origin-side (T1.3) rate limiting is defense-in-depth, not a global abuse-control guarantee — pair with a Vercel Firewall rule when the plan allows it.

## Provider timeouts + bounded concurrency (T2.2)

- **Default upstream timeout: 8 s** (`REQUEST_TIMEOUT`, was 15 s). Every provider fetch goes through `fetchJsonWithTimeout` (`src/server/http.ts`), which aborts the request on the deadline, cleans up its timer and abort listener, and throws `UpstreamTimeoutError` — distinct from HTTP error statuses (returned, not thrown) and connection failures (propagated unwrapped). A pre-aborted caller signal propagates as cancellation without starting work. Timeout messages are redacted at construction (T1.4): configured key values are scrubbed even as URL path segments, query-param credentials by pattern.
- **Per-provider overrides (seconds):** `USGS_TIMEOUT`, `EONET_TIMEOUT`, `OPEN_METEO_TIMEOUT`, `AIRNOW_TIMEOUT`, `FIRMS_TIMEOUT` — each falls back to the global default. Values are validated: malformed or `< 1` → default; `> 30` clamps to `MAX_UPSTREAM_TIMEOUT_SEC=30`, so no override can outrun the route ceilings below.
- **Open-Meteo bounded concurrency:** the grid (108 points global 12×9, 100 per bbox 10×10) is sliced to `min(limit, MAX_FETCH_POINTS=200)` in 50-point batches (upstream batch contract, unchanged), dispatched through a 2-worker pool (`BATCH_CONCURRENCY=2`, `src/server/providers/open-meteo.ts`). No provider quota is claimed: 2 is a small multiple of the previous serial dispatch — worst case drops from 4 sequential batch timeouts to 2 waves (≤ ~16 s), while never fanning out unboundedly (at most 4 batches exist). Results re-associate by chunk index, so coordinate ordering is preserved; scheduling stops once a caller signal aborts; an optional `signal` is accepted by `getWeatherData` (routes do not wire one yet — client-disconnect cancellation is future work).
- **Partial failures:** a failed batch keeps its successful siblings. Live-but-incomplete results stay `LIVE` with the same source/`fetched_at`, plus `warnings[]` and a `data_status.message` of the form "Partial live coverage: N of M grid points could not be fetched; …" — never presented as complete. Batches that omit a point's value are coverage gaps (counted, skipped), never invented zeros. All batches failing keeps the existing hierarchy: valid stale re-serve if allowed, else labelled `SIMULATED` (timeout → simulated + `no-store` per T2.1, since the policy keys on status).
- **Route `maxDuration` inventory:**

| Route | Upstream ops | Worst case by construction | Configured | Evidence |
|---|---|---:|---:|---|
| `GET /api/v1/layers/<id>/data` | weather: ≤4 batches @ conc. 2 × 8 s; others: 1 fetch ≤ 8 s | ~16 s + overhead | `maxDuration = 30` (~2× headroom) | Vercel docs 2026: Hobby Node.js functions 300 s default/maximum |
| `GET /api/v1/events/<id>` | 1 detail fetch ≤ 8 s | ~8 s + normalize | `maxDuration = 15` (~2× headroom) | same Hobby cap |
| heatmap, search, stats, geocode, timezones, layers, capabilities, tile, health, index | none (local compute / static / redirect) | < 1 s | none (platform default applies) | no upstream fan-out to bound |

- **Known platform limits:** the 300 s Hobby cap is verified from Vercel's public docs (2026), not from dashboard access — plan-specific behavior (e.g., a future Pro move) must be re-verified by the owner. `maxDuration` is a backstop only; per-batch timeouts remain the primary bound. No Redis/workers/queues were added.

## Rate limiting (T1.3)

Enforced in `src/middleware.ts` (matcher `/api/v1/:path*`) via the token bucket in `src/server/rate-limit.ts` — light 120 / standard 60 / heavy 20 requests per 60 s per client IP (route classes in `classifyRoute()`). Throttled callers get `429` + the standard `{ success: false, error: { code: "RATE_LIMITED", … } }` envelope + `Retry-After`, before any provider call. The store is hard-bounded (`MAX_ENTRIES=2000`, expiry + oldest-first eviction) and Edge-safe (no Node APIs).

Know the limits of this layer — it is per isolate/region, not global:

1. **Prefer Vercel-native enforcement when the plan allows it.** There is no `vercel.json` firewall config in this repo (WAF/rate-limit rules are plan-gated and dashboard-managed, not code). Recommended rule once available: match `/api/v1/layers/*/data`, `/heatmap`, `/search`, `/geocode/*`, `/imagery/gibs/tile/*` with a stricter threshold than the metadata routes, action `rate_limit`/`block`, and keep this in-process limiter as defense-in-depth. No paid upgrade was made for T1.3.
2. **Do not trust `x-forwarded-for` blindly off-platform.** On Vercel it is platform-appended (first entry = client). Direct-to-origin traffic could spoof it — the bounded store caps the blast radius to slot churn, not memory growth.
3. **Unidentifiable clients share one `unknown` bucket** — they are limited together, never exempt.
4. No Redis/Upstash/database was added; none is needed for this abuse-control tier.

## Charts — why `@visx/*` stays on alpha (P1-1 decision)

All seven `@visx/*` packages are pinned **exact** (`4.0.1-alpha.0`, no caret) in `package.json`. Rationale: the set is internally consistent, lockfile-pinned, `npm ls` peer-clean, and covered by `ValueHistogram` tests — while the newest stable (`4.0.0`) is OLDER than the installed alpha (a `4.0.1` prerelease), so "migrating to stable" would be a downgrade with unknown visual/API regressions. Do not replace visx (no Bklit migration) without a separate owner-approved product decision. Revisit only if a real incompatibility or a stable `≥4.0.1` appears.

## Audit status (P1-1, 2026-10-08 — intentionally unfixed)

`npm audit` reports 16 vulns (6 moderate / 8 high / 2 critical), ALL confined to dev/build-time chains: vitest→vite→esbuild/tinypool/`@vitest/mocker`, tailwind→postcss/braces/micromatch/chokidar, and `@next/eslint-plugin-next`'s bundled fast-glob. No flagged advisory touches the production runtime (Next server, React, three, route handlers). Every fix requires a breaking major (vitest 5, tailwind 4) — explicitly deferred by the alignment scope. Revisit in P2-11 (supply chain) alongside Dependabot setup; `npm audit --audit-level=high` stays informational until then.
