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

- **Provider integrations:** `src/server/providers/` — one adapter per upstream (`usgs`, `nasa-eonet`, `nasa-firms`, `open-meteo`, `airnow`, `geocoding` for Open-Meteo forward search), plus `heatmap`, `fallback`, `imagery`, `geocode` (offline IANA timezone lookup via `@photostructure/tz-lookup`). Dispatch + cache + stale-fallback live in `src/server/services/layers.ts`. Individual event lookup lives in `src/server/services/event-detail.ts`: an explicit id resolver routes raw ids to the USGS detail feed, `eonet-*` ids to the EONET event endpoint, and `fire-<lat>-<lon>` marker ids to the live FIRMS observation detail below; everything else (mock markers, other layers) goes to labelled simulated detail. No database is required — details are fetched on demand and cached briefly per instance.
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
| `GET /api/v1/search` — LIVE merged results | 300 (`SEARCH_TTL`) | 600 | exact-query key; bounds repeat upstream fan-out from debounced typeahead + shared-cache clients |
| `GET /api/v1/timezones` — LIVE (offline lookup) | `no-store` | — | payload embeds current wall-clock time/offset (per-second staleness); lookup is in-process sync, so no cache entry is needed either |
| `GET /api/v1/events/<id>` — LIVE | 300 (`EVENT_DETAIL_TTL`) | 600 | live USGS/EONET detail, same TTL as the memory cache |
| `GET /api/v1/layers` | 3600 | 7200 | static code-defined catalogue, changes only on deploy |
| `GET /api/v1/imagery/gibs/capabilities` | 3600 | 7200 | static 3-layer catalogue |
| `GET /api/v1` (index) | 60 | 120 | static version + links; short TTL keeps `meta.timestamp` fresh |
| Health (`/api/health`, `/api/v1/health`) | `no-store` | — | per-isolate `started_at`/timestamp must remain current |
| Layer data / heatmap / event detail when STALE or SIMULATED | `no-store` | — | never extend fallback data through a shared cache |
| Search (STALE re-serve, SIMULATED event fallback, UNAVAILABLE), stats, historical stats, reverse geocode (always UNAVAILABLE) | `no-store` | — | fallbacks and unavailable results are never extended via CDN |
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
| `GET /api/v1/search` | 1 geocoding request ≤ 8 s (count ≤ 10, no paging) | ~8 s + merge | none (platform default applies) | single bounded request, far under ceilings |
| heatmap, stats, geocode, timezones, layers, capabilities, tile, health, index | none (local compute / static / redirect / offline sync lookup) | < 1 s | none (platform default applies) | no upstream fan-out to bound |
| `GET /api/v1/events/<id>` | 1 detail fetch ≤ 8 s | ~8 s + normalize | `maxDuration = 15` (~2× headroom) | same Hobby cap |

- **Known platform limits:** the 300 s Hobby cap is verified from Vercel's public docs (2026), not from dashboard access — plan-specific behavior (e.g., a future Pro move) must be re-verified by the owner. `maxDuration` is a backstop only; per-batch timeouts remain the primary bound. No Redis/workers/queues were added.

## Wildfire detail from FIRMS observations (T2.3)

- **Marker association:** wildfire markers carry `fire-<lat>-<lon>` ids built from the observation's parsed coordinates, so the detail lookup re-associates the exact feed row by numeric coordinate match — no payload is embedded in the id and no marker change was needed. Repeat overpasses at identical coordinates resolve to the latest acquisition. Malformed fire ids (`fire-abc`, out-of-range, …) are rejected with `400` before any provider call; the `fire-` namespace never accepts upstream URLs.
- **Exposed fields:** `brightness` (bright_ti4), `frp`, `confidence`, `daynight`, `satellite`, `instrument`, `acq_date`, `acq_time` (combined into `timestamp`), `lat`/`lon`, plus FIRMS source attribution. Absent optionals are `null`; rows without numeric brightness cannot yield an honest detail. Brightness/FRP describe the thermal signal, not fire size or burned area.
- **Status meanings for wildfire detail:** `live` = built from a successfully fetched feed row (source `NASA FIRMS`, cached 5 min, publicly cacheable per T2.1); `stale` = expired live re-served after a refresh failure; `simulated` = keyless instance, fetch failure, malformed feed, or marker no longer in the 24 h feed window (never publicly cached). No key → no fetch is ever attempted.

## Real search, reverse geocode, and timezones (T2.6)

- **Forward search (`src/server/providers/geocoding.ts`, route `src/app/api/v1/search/route.ts`):** live locations from Open-Meteo Geocoding (`https://geocoding-api.open-meteo.com/v1/search`, override `OPEN_METEO_GEOCODING_URL`; contract verified in official docs — `name`/`count` 1–100/`language=en`, 2-char exact / 3+-char prefix matching, postal codes accepted, `{error, reason}` on 400, GeoNames-based data, no key for non-commercial use). One request per route call, `count = min(limit, 10)` (no 100-result paging), shared timeout helper (`OPEN_METEO_TIMEOUT` applies), existing heavy-route limit, client 300 ms debounce + abort (unchanged). Queries < 2 chars short-circuit with empty results before any network work (provider rule, not just ours); validation (trim, 200 cap, control-char reject) unchanged.
- **Merge strategy:** provider locations first in provider relevance order, then bundled event-index matches (`matchEventIndex` in `fallback.ts`, ids/behavior unchanged; `type=event` stays fully local and SIMULATED), sliced to `limit`. Dedupe by provider id then normalized name+country (first wins); deterministic — no scores compared. Per-result `source` (`Open-Meteo Geocoding` vs `bundled event index`/`bundled gazetteer`); envelope source names both when mixed. New optional `SearchResult` fields (`admin1`, `country_code`, `source`) are additive — existing clients ignore them.
- **Fallback order:** LIVE (cached 300 s in-memory + `public, s-maxage=300, stale-while-revalidate=600`) → expired LIVE re-served as STALE (`no-store`, `fetched_at` preserved) → bundled events as SIMULATED where they exist (`no-store`) → UNAVAILABLE empty (`no-store`). Cities/coordinates are never invented.
- **Reverse geocode (`src/app/api/v1/geocode/reverse/route.ts`):** explicit UNAVAILABLE with shape-stable null place fields. No compliant no-key provider fits: public Nominatim caps at 1 req/s *per application* aggregate (verified 2026-10-11, https://operations.osmfoundation.org/policies/nominatim/ — plus UA/attribution/ODbL terms and an autocomplete ban), which per-instance serverless state cannot enforce application-wide; Open-Meteo has no reverse endpoint. The old fabricated region generator (`reverseGeocodeMock`) is deleted. Heavy rate class unchanged; no upstream call is ever made.
- **Timezones (`src/server/providers/geocode.ts`, route `src/app/api/v1/timezones/route.ts`):** genuine offline IANA lookup via `@photostructure/tz-lookup` (pinned exact `11.7.0`, 0 deps, CC0-1.0, timezone-boundary-builder data; 73 KB self-contained module — no runtime data-file reads, so no serverless packaging risk; `geo-tz` rejected at ~70 MB + `data/`-read/bundler hazards). Replaces the 15°-slice approximation (which mislabelled Kolkata as Asia/Dhaka). UTC offset + wall-clock are computed live via `Intl` (DST-aware). Near-border coordinates resolve deterministically to one best match (border-exactness not claimed); offshore/uninhabited points return `Etc/GMT*` ocean zones; lookup failure → UNAVAILABLE (never the old approximation). LIVE + `no-store` (wall-clock payloads must stay fresh); no per-instance cache entry needed (in-process sync call). Standard rate class unchanged.
- **Request limits:** search + reverse stay `heavy` (20/60 s), timezones stays `standard` (60/60 s) — no limiter changes. Timeouts: geocoding reuses `OPEN_METEO_TIMEOUT` (default 8 s); timezone/reverse make no network calls.

## Global air quality (T2.5)
- **Sources:** Open-Meteo Air Quality (`https://air-quality-api.open-meteo.com/v1`, override `OPEN_METEO_AQ_URL`) is the global model-based source — no key for standard non-commercial use, attribution to CAMS + Open-Meteo required. AirNow (`latLong/current`, key `AIRNOW_API_KEY`) stays as an optional U.S. station-observation source behind its existing fixed central-U.S. query (endpoint/params unchanged).
- **Selection (`getAirQualityData`, `src/server/providers/airnow.ts`):** U.S.-envelope bbox (lat 17–72, lon −180–−60) + key → try AirNow, fall through to the model on failure; anything else (global, non-U.S., straddling, or keyless) → model directly; model failure → labelled `SIMULATED` via the established stale policy. No per-point AirNow fan-out: the AirNow docs' bbox observation feeds were not verifiable from here, so key-bearing requests stay at one fixed query per AQ request (plus T1.3 limits + 1800 s shared cache).
- **Model vs stations:** `data_status.source` is `Open-Meteo Air Quality` or `AirNow` per request; model messages state "estimates, not monitoring-station observations", AirNow messages state "monitoring-station observations". Requested variables: `us_aqi, pm2_5, pm10, ozone, nitrogen_dioxide` only. Points keep the layer contract (`aqi-<lat>-<lon>`, US-AQI `value`, `severityForAqi`, `parameter: "AQI"`) plus `pollutants` (`null` for omitted values, never zeros); missing `us_aqi` skips the point. No worldwide station coverage is claimed — outside AirNow, values are CAMS model estimates.
- **Sampling:** weather grid (108 global / 100 bbox, cap 200, 50-point batches) over the shared `runBatches` pool (`src/server/batch-pool.ts`, concurrency 2, per-batch `OPEN_METEO_TIMEOUT`). Multi-location responses (a list, unlike single-location objects) pair by request order; requested grid coordinates are kept so markers stay stable when the model echoes a nearby cell center. Grid spacing dwarfs the ~45 km cells, so no dedup pass is needed.
- **Freshness:** model `timestamp` is the feed's `current.time`, `fetched_at` the fetch time; AirNow points carry feed time (`utcnowIso` at normalize). AirNow TTL, cache policies, timeouts, and rate-limit classes are unchanged (air_quality TTL stays 1800; LIVE → public, else `no-store`).

## Real-time solar position (T2.4)

- **Pure calculation (`src/lib/solar.ts`, no React/DOM/timers/network):** `getSubsolarPoint(date)` implements a low-precision solar ephemeris (J2000 mean longitude/anomaly + equation-of-center + obliquity → declination; GMST − right ascension → hour-angle longitude, which embeds the equation of time — solar noon is NOT assumed at 12:00 UTC, equinox latitude is NOT assumed 0). `subsolarPointToSunDirection` converts to the renderers' world-space vector; `getSunDirection` is the one-step single source. Invalid dates throw `TypeError` (never a silent 0/0 terminator).
- **Accuracy:** cross-checked against the independent NOAA day-angle series at 2026-03-20 / 06-21 / 12-21 12:00 UTC (values + method pinned in `src/lib/solar.test.ts`): worst deviation ≈ 0.25°, inside the PRD's ≈ 1° terminator budget with ~4× margin. Residual limits: truncated periodic terms (dominant, < 0.5°), ignored nutation/aberration (< 0.01°) and UTC-vs-terrestrial-time (< 0.02°).
- **Convention:** vector FROM Earth's centre TOWARD the subsolar point, projected exactly as `latLonToVector3` (`src/lib/geo.ts`): equator/prime-meridian → +X, north pole → +Y. WebGPU feeds it to the TSL day/night `dot()` blend + directional light; WebGL feeds it to its directional light position (previously a hardcoded `[10,5,10]` that ignored the prop entirely — the WebGL night-lights overlay itself is still a constant additive shell, so only the lit-side shading tracks the Sun there; no shader rewrite was in scope).
- **One shared tick (`src/hooks/useSunDirection.ts`, consumed once in `SentinelApp`):** deterministic `DEFAULT_SUN_DIRECTION` (`src/components/globe/earthConfig.ts`) for SSR/first render (hydration-identical), live UTC value after mount, single 60 s `setInterval` (`SUN_DIRECTION_UPDATE_INTERVAL_MS`), cleared on unmount. No per-renderer timers; the tuple identity changes at most once per minute so the memoized renderer stays settled. The Sun drifts ≈ 0.25°/min, so 60 s keeps the terminator well inside budget. Globe auto-rotation / fly-to / camera behaviour untouched.
- **Tests:** `src/lib/solar.test.ts` (18: NOAA reference vectors, hemispheres, UTC-hour shift, normalization sweep, leap-day/boundary, invalid dates, conversion parity, sign/axis), `src/hooks/useSunDirection.test.tsx` (4: interval value, SSR determinism, mount + 60 s refresh,   cleanup), `src/components/globe/EarthRenderer.test.tsx` (3: identical authoritative tuple reaches both the WebGPU and WebGL branches).

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
