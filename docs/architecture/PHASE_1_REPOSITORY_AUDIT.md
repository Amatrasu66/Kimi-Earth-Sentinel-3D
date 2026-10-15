# Phase 1 — Repository Audit (CesiumJS Migration Blueprint)

**Project:** Kimi Earth Sentinel 3D (`kimi-earth-sentinel-3d` 1.0.0)
**Audit date (UTC):** 2026-10-15
**Auditor environment:** OpenCode, Node.js v24.15.0
**Phase type:** Read-only discovery. No application code, dependencies, lockfiles,
environment, or deployment settings were changed for this audit.

Evidence labels used throughout: **Verified** (repo or reproducible check),
**Inferred** (strongly suggested, not conclusive), **Unknown** (not determinable),
**Recommended** (proposal, not fact).

---

## 1. Executive summary

Kimi Earth Sentinel 3D is a single Next.js 15 App Router application (React 19,
TypeScript 5.9) that renders an interactive Earth with switchable environmental
layers. The globe UI at `/` and the JSON API at `/api/v1/*` deploy together as one
Vercel project. There is no separate backend, database, scheduler, or Redis.

The globe has **three mutually exclusive renderer branches** behind one selector
(`src/components/globe/EarthRenderer.tsx`, `rendererMode.ts`):

| Branch | Engine | Active when |
|---|---|---|
| Dotted Earth (default) | 2D canvas + d3-geo orthographic, no three.js | no `?renderer=` override |
| WebGL fallback | React Three Fiber + three + drei | `?renderer=webgl`, or WebGPU degradation |
| WebGPU opt-in | vanilla `three/webgpu` + TSL, imperative | `?renderer=webgpu` |

All three expose the same Sentinel contract (markers, hover/click, fly-to,
rotation) and are lazy client-only chunks (`next/dynamic`, `ssr: false`).
The surrounding dashboard (AppShell regions, URL-owned state, SWR data layer,
14 API routes, per-layer TTL cache, honest `data_status` provenance) is
engine-agnostic and is the primary preservation target.

**No Sentinel-1, Sentinel-2, Copernicus, or Cesium code exists in `src/`**
(verified by grep). The only satellite-imagery integration is a NASA GIBS
WMTS **URL-builder API** that the UI never loads. Live data comes from USGS,
NASA EONET, NASA FIRMS (keyed), Open-Meteo (+Air Quality), AirNow (keyed, US),
Open-Meteo Geocoding, and an offline timezone dataset.

**Baseline validation:** typecheck passed, lint passed, production build passed,
texture budgets met (both tiers), initial-JS bundle passed (194.6 KiB gzip <
200 KiB). Test suite: 740/741 pass with 1 flaky timeout failure in
`SentinelApp.a11y.test.tsx` plus 5 unhandled jsdom errors from
`@radix-ui/react-use-size` (`inlineSize` of undefined) — pre-existing,
environment-related, not repaired per Phase 1 rules.

**Migration posture:** the dashboard, API, state, and data layers can be kept
unchanged; only the globe host + marker/projection math + texture pipeline need
replacement. Recommended integration: pinned `cesium` npm package + Resium (or
imperative viewer) behind the existing `EarthRenderer` selector as a fourth
branch (`?renderer=cesium`), assets copied to `public/cesium` with
`CESIUM_BASE_URL`, Windowing via existing `next/dynamic ssr:false` pattern.
Biggest risks: (a) Cesium bundle/asset weight on Vercel serverless + the
200 KiB initial-JS budget, (b) report-only CSP must gain worker/blob/img/connect
sources for Cesium + ion, (c) Sentinel raster products are not directly
renderable — they need a tile-service step, (d) no paid ion dependency should be
required for the default path.

---

## 2. Verified technology stack

| Area | Verified value | Evidence |
|---|---|---|
| Package / version | `kimi-earth-sentinel-3d` 1.0.0, private | `package.json:1-5` |
| Node engine | `24.x` (`.nvmrc`); audit ran on v24.15.0 | `package.json:6-8`, `node --version` |
| Next.js | `^15.3.0` (App Router) | `package.json:44` |
| React / DOM | `^19.2.0` / `^19.2.0` (audit env resolved 19.3.0) | `package.json:45-46` |
| TypeScript | `~5.9.3`, strict, `noEmit`, `jsx: preserve`, path `@/*` | `tsconfig.json` |
| three | `^0.185.1` | `package.json:49` |
| @react-three/fiber | `^9.6.1` | `package.json:30` |
| @react-three/drei | `^10.7.7` | `package.json:29` |
| swr | `2.5.1` | `package.json:47` |
| UI | Radix primitives, `lucide-react ^0.562.0`, `motion ^14.0.0`, Tailwind v3.4 | `package.json` |
| Charts | d3-array/geo, visx suite | `package.json:31-40` |
| Tests | vitest `^4.1.11`, Testing Library, jsdom | `package.json:51-72`, `vitest.config.ts` |
| Lint | eslint 9 + `@next/eslint-plugin-next` + `eslint-plugin-react-hooks` | `package.json`, `eslint.config.mjs` |
| Lockfile | `package-lock.json` (npm; CI uses `npm ci`) | repo root, `.github/workflows/ci.yml` |
| CesiumJS | **not installed, zero references in `src/`** | `package.json`, grep §3.5 |
| State libs | none (no Redux/Zustand/Router in app code) | `package.json`, `README.md:78` |

Scripts (verified in `package.json:9-18`): `dev`, `build`, `start`,
`lint` (`eslint src`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`),
`textures:report`, `bundle:check`. CI runs `npm ci → lint → typecheck → test →
build` on Node 24 (`.github/workflows/ci.yml`).

---

## 3. Repository structure

```text
Kimi-Earth-Sentinel-3D/            branch: main @ 2f60324 (see §11)
├── src/app/                       layout.tsx, page.tsx (thin server wrapper),
│                                  globals.css, api/ (16 route.ts files)
├── src/components/
│   ├── app/SentinelApp.tsx         "use client" composition root + 8 focused hooks
│   ├── globe/                     EarthRenderer, GlobeScene, Globe, WebGPUEarth,
│   │                              WebGpuErrorBoundary, dotted/, earthConfig,
│   │                              rendererMode, textureTiers, markerSync
│   ├── shell/                     AppShell, AppHeader, LayerRail, GlobeStage,
│   │                              ListStage, CommandSearch, StatusDock, ViewToggle…
│   ├── intelligence/              DataPanel, EventDetails, EventList, LayerOverview,
│   │                              SeverityFilter/Badge/Distribution, MetricCard/Row
│   ├── overlays/                  MarkerHoverCard, DataStatusBanner
│   ├── panels/                    SettingsModal (Diagnostics, About)
│   ├── charts/                    visx-based histogram/bars/tooltips
│   └── ui/                        shadcn-style Radix primitives
├── src/hooks/                     useLayers (SWR), useSearch, useSunDirection,
│                                  useKeyboardShortcuts, usePrefersReducedMotion…
├── src/lib/                       geo, solar, webgpu, url-state, low-power, motion,
│                                  provenance, format, keyboard, histogram…
├── src/services/api.ts            single same-origin `/api/v1` client
├── src/types/                     DataPoint, LayerId, envelopes, SearchResult…
├── src/shaders/atmosphere.ts      WebGL fresnel shader
├── src/server/                    config, cache, provenance, validation, http,
│   ├── providers/                 usgs, nasa-eonet, nasa-firms, open-meteo,
│   │                              open-meteo-aq, airnow, heatmap, imagery (GIBS),
│   │                              geocode, geocoding, fallback
│   ├── services/                  layers, event-detail, stats
│   └── models/                    layers (catalogue)
├── src/middleware.ts              pre-handler rate limiting for `/api/v1/*`
├── public/textures/               7 files, 3.6 MB high tier (see §8)
├── public/geo/                    land-110m.json + NOTICE.md
├── scripts/                       texture-report.mjs, bundle-budget.mjs
├── docs/                          development.md, audit/, design/, prompts/
└── docs/architecture/             Phase 1 deliverables (this set)
```

Test layout: colocated `src/**/*.test.{ts,tsx}` (77 files), single jsdom project
(`vitest.config.ts`), setup at `src/test/setup.ts`.

---

## 4. Existing globe architecture (Verified)

### 4.1 Entry point and selector

- Server wrapper `src/app/page.tsx:23-25` returns `<SentinelApp/>`; deliberately
  **not** `force-dynamic` (`page.tsx:15-22`).
- `SentinelApp.tsx:1` is `"use client"`; globe mounts only for `view==='globe'`
  via memoized boundary `StableEarthRenderer = memo(EarthRenderer)`
  (`SentinelApp.tsx:38,217-229`).
- Single decision point `rendererMode.ts:27-31`: `resolveGlobeMode() =
  getForcedRenderer() ?? 'dotted'`; `useGlobeMode()` uses
  `useSyncExternalStore` with server snapshot `'pending'` (`:45-50`).
  `getForcedRenderer()` parses `?renderer=webgl|webgpu` (`lib/webgpu.ts:71-86`).
  The `probeWebGpuSupport()` helper exists but has **no call site** in the
  selector path — selection is URL-only (Verified).
- `EarthRenderer.tsx:38,44` lazy-loads both 3D branches with
  `next/dynamic(..., {ssr:false})`; `dotted` returns `null` here (`:201`) because
  `GlobeStage` mounts `<DottedEarth/>` in the stage cell (`GlobeStage.tsx:57-67`).
- Degradation: WebGPU error/chunk-failure/30 s watchdog → `webgpuDegraded` →
  WebGL (`EarthRenderer.tsx:112-159`); `qualityKey` remounts the 3D branch on
  low-power flips (`:206`); `onActiveRenderer` reports status to the dock
  (`:161-195`).

### 4.2 Per-branch rendering

Constants: `EARTH_RADIUS=5`, `DEFAULT_CAMERA_DISTANCE=16.4`,
`DEFAULT_SUN_DIRECTION=[6,2.5,4]` (`earthConfig.ts:10,22,32`).

**Dotted default — vanilla 2D canvas + d3-geo, no three.js.**
`geoOrthographic` projection per draw (`DottedEarth.tsx:227,266-269`), land dots
from a prebuilt `Float32Array` (`dotField.ts:32-57`, 3600 candidates), graticule
15° steps, custom drag (`0.28°/px`, polar clamp ±85°) and exponential wheel zoom
(1–5×), double-click resets zoom only. rAF loop gated by
`shouldAnimate()` (flight/drag/rotate/hidden-tab) with dt clamp 0.1 s;
`ResizeObserver` sizing; DPR via shared `maxDprForMode`; teardown cancels rAF,
disconnects RO, removes 7 listeners (`DottedEarth.tsx:532-551`). No sun shading,
no textures, no WebGL context (context-loss N/A).

**WebGL (`?renderer=webgl`) — R3F + three + drei.**
`<Canvas frameloop="demand">` (`GlobeScene.tsx:62-94`), camera
`[0,0,16.4]` fov 45, adaptive DPR `[1, max]`, `OrbitControls` (pan off,
distance 7–30, damping). Spheres: main `[5,48,48]` Phong (day + topology
normalMap + water specularMap), night shell `[5.002]` additive constant
opacity 0.8 (does **not** track sun — Verified), clouds `[5*1.006]` additive,
atmosphere `[5*1.04]` BackSide custom shader (`shaders/atmosphere.ts`),
drei `Stars` 2500. Sun flows `SentinelApp → EarthRenderer → GlobeScene →
directional light` with 60 s tick (`useSunDirection`). Markers: single
`InstancedMesh` cones via shared `writeMarkersToInstancedMesh`
(`markerSync.ts:59-83`), rAF-throttled raycast picking, `quaternionForLatLon`
fly-to. Explicit disposal limited to earth material + marker geometry/material;
R3F/drei texture disposal internals Unknown. **No `webglcontextlost`
handling** (grep: zero hits in `src/components/globe`).

**WebGPU (`?renderer=webgpu`) — vanilla `three/webgpu` + TSL, imperative.**
Mount-once engine effect, props via refs. TSL `colorNode` day/night
`smoothstep(-0.12,0.35)` blend + emissive night + water roughness + topology
bump 0.6; Fresnel atmosphere shell; drifting clouds; 1800-pt deterministic
starfield; `DirectionalLight 2.2` + `Ambient 0.35` tracking the shared sun tuple.
Self-starting/stopping `setAnimationLoop`, hidden-tab handling, first-frame
`ready` gating, full teardown registry (controls, geometries, textures,
`renderer.dispose()`), and device-lost/error hooks — the most complete
lifecycle of the three branches.

### 4.3 Call graph

```text
page.tsx (server) → SentinelApp ("use client")
  ├─ useAppUrlState ── layer/event/q/sev/view (+ ?renderer= passthrough)
  ├─ useLayers / useLayerData (SWR) ── /api/v1/layers/[id]/data
  ├─ useEventSelection ── /api/v1/events/[id]
  ├─ useFlyTo ── flyTo {lat,lon,key}
  ├─ useSunDirection (60 s) ── sunDirection tuple
  ├─ view==='globe' ? StableEarthRenderer : ListStage
  │    ├─ mode==='dotted' → null (GlobeStage mounts DottedEarth in stage cell)
  │    ├─ mode==='webgpu' → Suspense veil → WebGpuErrorBoundary → WebGPUEarth
  │    └─ mode==='webgl'  → Suspense veil → GlobeScene (Canvas → Globe)
  └─ shell: AppHeader+CommandSearch / LayerRail / StatusDock / DataPanel…
```

---

## 5. Existing globe feature inventory

Status: **V** implemented-verified · **P** partial · **U** UI-only · **N** not found.

| Feature | Status | Evidence |
|---|---|---|
| Base Earth texture (3D) | V | `Globe.tsx:84-89,108-116`; `WebGPUEarth.tsx:433-436,464-482` |
| Day/night shading (3D) | V | TSL smoothstep `WebGPUEarth.tsx:467-478`; WebGL night shell constant (`Globe.tsx:132-141`) + sun-driven diffuse |
| Terrain / elevation | N | topology art used as normal/bump only; no displacement, no height query |
| Cloud layer (decorative) | V | `Globe.tsx:146-187`; `WebGPUEarth.tsx:491-506`; off in low-power |
| Atmosphere glow (3D) | V | `shaders/atmosphere.ts`; `WebGPUEarth.tsx:508-526` |
| Sun direction + lighting | V | `useSunDirection.ts:31-52`, `solar.ts:143-144`; both 3D lights track it |
| Starfield (3D) | V | drei `Stars` (`Globe.tsx:449`); 1800-pt LCG (`WebGPUEarth.tsx:529-548`) |
| Country boundaries | N | 127 land polygons only; no border dataset |
| Lat/lon graticule | P | dotted only, 15° (`DottedEarth.tsx:76,280-284`); absent in 3D |
| Instanced markers | V | single `InstancedMesh` both 3D (`markerSync.ts`); 2D circles dotted |
| Severity-coloured events | V | `SEVERITY_COLORS`, click → `selectEvent` |
| Satellite tracks/footprints | N | only a `satellite?: string` data field |
| Globe labels | N | labels live in shell panels only |
| Search fly-to | V | `CommandSearch→flyToLocation→useFlyTo`; quaternion/slerp (3D), 1400 ms ease (dotted); reduced-motion instant |
| Zoom / rotate | V | all branches; OrbitControls 7–30 (3D); wheel 1–5× (dotted) |
| Pan | N | `enablePan=false` both 3D; dotted drag is rotate |
| Tilt control | P | free orbit tilt only, no UI, no polar clamp in 3D code |
| Reset / home view | N | dotted dblclick resets zoom only |
| Coordinate picking | V | raycast+instanceId (3D); 10 px nearest (dotted); hover coords in dock |
| Hover/click + tooltips | V | rAF-throttled hover, 6 px drag discrimination, `MarkerHoverCard` |
| Imagery-layer switcher | N | internal tier/low-power only; rail switches *data* layers |
| Globe overlays (heatmap/WMS) | N | overlays exist only as shell panels |
| Time animation | P | auto-rotate toggle + sun tick; no timeline/scrubber |
| Loading/empty/error | V | Suspense veils, `RendererInfo`, dotted always draws ocean+graticule, `geography unavailable` status |
| Responsive / mobile | V | coarse-pointer DPR caps, RO sizing, `dvh` caps |
| Keyboard / a11y | P | full combobox search, skip link, canvas `role=img`; no globe keyboard-drag; rail lacks roving nav |

---

## 6. Dashboard and state-management architecture (Verified)

- Composition root `SentinelApp.tsx` wires 8 focused hooks (URL state, selection,
  focus, hint, shortcuts, fly-to, pending resolution) into shell regions
  (`AppShell`, `AppHeader`, `LayerRail`, `GlobeStage`/`ListStage`, `StatusDock`,
  `DataPanel`, `SettingsModal`, `MarkerHoverCard`). No global store library.
- Sources of truth: **URL query** (`?layer=&event=&q=&sev=&view=`, pure
  parse/serialize in `lib/url-state.ts`, `?renderer=` passes through verbatim) ·
  **SWR** for layer data (`useLayers.ts`, `dedupingInterval 2000`, bounded
  retries) · local `useState` for hover/settings/rotation/renderer info ·
  server props only for static metadata.
- Globe↔dashboard contract (props only, no viewer leakage): `activeLayer`,
  `dataPoints`, `onMarkerClick/onMarkerHover`, `isRotating`, `flyTo {lat,lon,key}`,
  `sunDirection`, `lowPowerActive`, `onActiveRenderer`. This contract is what the
  Cesium host must implement unchanged.
- Data flow (traced): layer select → `useLayerData` key validation →
  `buildLayerDataPath` → SWR `fetchEnvelope` (15 s) → route validation →
  `getLayerPayload→resolveWithCache` → lazy provider → `withStatus` →
  `SentinelApp` mirrors `points` to markers + `dataStatus` to provenance UI.
- Preservation classes: reusable-unchanged (shell, panels, overlays, hooks,
  lib, API client, all server code); small-adapter (marker color/size mapping,
  fly-to driver, hover-card anchor); modification (globe host, projection math,
  texture pipeline); replacement (three sphere/scene/camera/controls per branch
  policy in `FEATURE_PRESERVATION_MATRIX.md`).

---

## 7. API and data-provider inventory (summary; full table in §10 refs)

14 functional route groups (16 `route.ts` files incl. two JSON-404 catch-alls):
`layers`, `layers/[id]/data`, `layers/[id]/heatmap`, `events/[id]`, `stats`,
`stats/historical`, `search`, `geocode/reverse` (honest `UNAVAILABLE` stub),
`timezones` (offline), `health` ×2, `imagery/gibs/capabilities`,
`imagery/gibs/tile/[layer]/[z]/[x]/[y]` (302 redirect), index `/api/v1`.

- Envelope `{success:true,data,meta{timestamp,cache_hit,cached_at,stale,source,
  data_status}}`; errors `{success:false,error:{code,message}}` with
  400/404/405/429/500. `data_status.status ∈ live|simulated|stale|unavailable`.
- Cache: LIVE → `public, s-maxage=N, stale-while-revalidate=2N` (per-layer TTLs:
  300–3600 s); all fallbacks/errors/health → `no-store`. Per-instance memory
  cache, best-effort, never source of truth.
- Rate limits (pre-handler `src/middleware.ts`, matcher `/api/v1/*` only):
  light 120 / standard 60 / heavy 20 per 60 s per IP; 429 + `Retry-After` +
  standard envelope, before any provider call.
- Providers (all server-side fetch; keys never leave server): USGS FDSNWS +
  detail feed (no key); NASA EONET v3 open events + detail (no key); NASA FIRMS
  VIIRS NRT CSV (key required, URL path segment, redacted in logs); Open-Meteo
  forecast + Air Quality model (no key); AirNow US stations (key, US bboxes
  only, else model); Open-Meteo Geocoding; offline `tz-lookup`; NASA GIBS WMTS
  redirect (3 allow-listed layers, no fetch); deterministic seeded fallbacks
  always labelled `SIMULATED`.
- **Sentinel-1/2, Copernicus, Cesium: zero hits in `src`** (verified grep).
  GIBS is API-only — the UI never loads tiles (`gibsTileUrl` is a string
  builder referenced only in tests).

---

## 8. Texture and geospatial asset inventory (Verified)

| File | Size | Role | Cesium reuse |
|---|---|---|---|
| `earth-day.jpg` 4096×2048 | 1.39 MB | day map | No — static JPEG, not a tiled provider |
| `earth-day-2k.jpg` 2048×1024 | 0.39 MB | standard tier | No |
| `earth-night.jpg` 4096×2048 | 0.68 MB | night/emissive art | No — additive art, no shader equivalent |
| `earth-night-2k.jpg` | 0.19 MB | standard tier | No |
| `earth-clouds.jpg` 2048×1024 | 0.79 MB | additive shell (alpha-free) | No — not time-dynamic data |
| `earth-topology.png` 2048×1024 gray | 0.36 MB | normal/bump source | No — not elevation data |
| `earth-water.png` 1600×800 | 0.41 MB | specular/roughness mask | No |
| `land-110m.json` 127 polygons | 123 KB | dotted dots + coastline (Natural Earth, public domain) | No — too coarse, no borders/tiling |

`textures:report` passed: standard tier 2.1 MB file / ~49 MB GPU; high tier
3.6 MB / ~113 MB GPU (6 MB file budget). GPU figures are formula estimates
(`w*h*4*4/3`), not measurements. No KTX2/WebP variants.

Coordinate system (Verified, `lib/geo.ts:45-67,104-120`): degrees in,
`phi=(90-lat)`, `theta=(lon+180)`; equator/prime-meridian → +X, north → +Y;
fly-to maps target to +Z; markers at radius ×1.01 (WebGL) / ×1.012 (WebGPU).
Tests: `geo.test.ts`, `globeProjection.test.ts`, `markerSync.test.ts`,
`landGeo.test.ts`, `dotField.test.ts`.

---

## 9. Existing tests and baseline results (Verified by execution)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **Passed** (clean) |
| Lint | `npm run lint` | **Passed** (clean) |
| Unit/component tests | `npm test` (2 runs) | **740–741/741**: 1 flaky timeout (`SentinelApp.a11y.test.tsx:302` “reloads with the switch still off…”, 5 s timeout) + 5 unhandled jsdom errors (`@radix-ui/react-use-size` `inlineSize` of undefined). Pre-existing, environment-related. Not repaired. |
| Production build | `npm run build` | **Passed** (all `/` + 14 `/api/v1/*` routes; first-load 103 kB shared) |
| Texture report | `npm run textures:report` | **Passed**, both tiers within 6 MB |
| Bundle budget | `npm run bundle:check` | **Passed**, 194.6 KiB gzip < 200 KiB; 3D chunks correctly excluded (lazy) |

77 test files colocated (`src/**/*.test.{ts,tsx}`); coverage centers on
validation, provenance/fallback honesty, caching, providers, projection math,
hooks, and shell components. No browser-automation framework exists.

---

## 10. Deployment and build configuration (Verified)

- Single Vercel project (Next.js auto-detected; **no `vercel.json`** — Verified
  absent). Production: `https://kimi-earth-sentinel-3d.vercel.app/` (README).
- `next.config.mjs`: `reactStrictMode`, no `powered-by` header, global security
  headers — **report-only** CSP
  (`default-src 'self'; script-src 'self' 'unsafe-inline'; style/img/connect/
  font/worker-src 'self'; object-src 'none'; frame-ancestors 'none'`) plus
  nosniff, strict referrer, restrictive permissions policy, `DENY` framing.
  CSP explicitly documents workers/blob/data-URLs as not-allow-listed — a
  Cesium migration **must** extend this (workers, blob:, ion/data hosts).
- React Strict Mode is **on** — Cesium lifecycle must tolerate double-mount
  (init guard + dispose + re-init).
- No scheduler/cron, no CORS (same-origin), server-only env (`.env.example`,
  never `NEXT_PUBLIC_`; verified single comment-only hit in `config.ts:3`).
- Secrets: no hardcoded keys/tokens found; only empty placeholders and
  `*.test.ts` stub fixtures; FIRMS/AirNow keys redacted via `redact.ts`.

---

## 11. Confirmed technical debt (pre-existing, do not fix in Phase 1)

1. Flaky a11y test timeout + jsdom/Radix `use-size` unhandled errors (§9).
2. WebGL night shell is a constant additive overlay, not sun-tracked
   (`Globe.tsx:132-141`) — visual parity gap vs WebGPU TSL blend.
3. No WebGL context-loss handling in any globe branch code.
4. R3F/drei texture disposal beyond two explicit `dispose()` effects relies on
   internals (Unknown coverage).
5. `?renderer=` override rides in URL but is not part of the canonical
   `AppUrlState` contract (passes through verbatim, `url-state.ts:20-22`).
6. Reverse geocode is an intentional `UNAVAILABLE` stub; GIBS tiles are
   API-only with no globe overlay; heatmap grids cap at resolution 20.
7. Rate limiter is per-instance (N× under serverless fan-out); `/api/health`
   (top-level) sits outside the middleware matcher.

---

## 12. Unknowns and unresolved questions

1. Production Vercel plan / Firewall rules — Unknown (not in repo).
2. Live upstream freshness/latency beyond code comments — Unknown.
3. R3F/drei internal disposal and texture-cache behavior — Unknown.
4. Exact `.next` MIME/size behavior for future Cesium static assets — Unknown
   until a Phase 2+ proof of concept.
5. Resium vs imperative viewer choice — Recommended for Phase 2 PoC, not decided.
6. Whether existing 4K textures' GPU residency strains low-end devices —
   unmeasured (no profiling run in Phase 1).

---

## 13. Evidence references

Primary: `src/app/page.tsx`, `src/components/app/SentinelApp.tsx`,
`src/components/globe/{EarthRenderer,GlobeScene,Globe,WebGPUEarth,
WebGpuErrorBoundary,earthConfig,rendererMode,textureTiers,markerSync}.tsx/ts`,
`src/components/globe/dotted/*`, `src/components/shell/*`,
`src/hooks/*`, `src/lib/{geo,solar,webgpu,url-state,low-power,motion,
provenance}.ts`, `src/services/api.ts`, `src/server/{config,cache,
provenance,validation,http,rate-limit,route-helpers,redact}.ts`,
`src/server/providers/*`, `src/server/services/*`, `src/middleware.ts`,
`src/app/api/**/route.ts`, `next.config.mjs`, `tsconfig.json`,
`vitest.config.ts`, `package.json`, `package-lock.json`, `.env.example`,
`scripts/*.mjs`, `public/textures/*`, `public/geo/*`, `README.md`,
`docs/development.md`, `docs/audit/*`.
External: cesium.com Downloads (1.145, 2026-09-01), npm `cesium` 1.145.0,
GitHub CesiumGS/cesium releases (1.146, 2026-10-01), CesiumJS Quickstart,
Cesium+Webpack guide (2024-02-13), `cesium-webpack-example`,
`cesium-vite-example`, Next.js discussion #86185, Resium docs
(`resium.reearth.io`, npm `resium`), CDSE STAC
(`stac.dataspace.copernicus.eu`, S2 L2A), AWS Open Data S2 L2A COGs.
