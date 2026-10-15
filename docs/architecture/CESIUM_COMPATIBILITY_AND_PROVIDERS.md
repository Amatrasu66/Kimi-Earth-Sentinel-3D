# CesiumJS Compatibility and Provider Assessment (Phase 1)

Labels: **Verified** (official docs checked 2026-10-15) · **Proposed** (needs
Phase 2 proof of concept) · **Unknown** (could not verify).

## 1. Recommended version (Verified sources)

- **Latest stable: CesiumJS 1.146** (released 2026-10-01; GitHub
  CesiumGS/cesium releases). Previous: 1.145 (2026-09-01). Monthly cadence.
- npm `cesium` 1.145.0, Apache-2.0, built-in TypeScript types, ESM+CJS
  (npmjs.com/package/cesium). **No `@types/cesium` needed** (Resium docs).
- **Recommended strategy:** pin exact `cesium@1.146` in `package.json` at Phase 2
  start, re-verify the newest stable that week, keep the lockfile as the source
  of truth. New in 1.146: `@cesium/core` split out of `@cesium/engine`
  (math/geometry/time/utils) — prefer the umbrella `cesium` package unless the
  PoC proves the split packages reduce the served weight.
- Optional React binding: **Resium** (~1.19–1.24; npm shows 1.19.4 as latest
  under one tag listing and 1.24.0 in another — **Unknown**, re-check at install
  time). Resium ships an official **Next.js App Router example** and install
  guide (resium.reearth.io). Decision Resium-vs-imperative is **Proposed** for
  the Phase 2 PoC, not made here.

## 2. Stack compatibility

| Dependency | Assessment |
|---|---|
| Node.js 24 | **Proposed-compatible.** npm `cesium` page lists `Node =22.0.0` (engines field of a mirrored view) — build tooling only; the runtime targets browsers. Verify `npm ci` + `next build` in PoC. |
| Next.js 15 App Router | **Verified pattern.** `next/dynamic ssr:false` + client component + `window.CESIUM_BASE_URL` is the documented Resium/Next.js approach; Next.js discussion #86185 shows the same for Next 15 with CopyWebpackPlugin. |
| React 19 | **Proposed-compatible.** Resium is actively released (Sept 2026) against modern React; confirm peer range at install. Imperative viewer code has no React-version coupling at all. |
| TypeScript 5.9 | **Verified.** Cesium ships its own types; `skipLibCheck` is already on. |
| StrictMode | On in this repo — lifecycle must guard double-mount (**Proposed** design in target arch §5). |
| ESLint (Next plugin) | No new constraints expected; widget CSS import inside client chunk only. |
| Vercel serverless | No code change needed for the app; risk is **asset weight + function size**, measured in PoC (see §5). |

## 3. Client-only rendering constraints (Verified)

- Cesium requires DOM, WebGL, Web Workers — **SSR unsupported** (Resium guide:
  "Server side rendering is not supported"; React Native also unsupported —
  irrelevant here).
- Existing repo pattern already satisfies this: `next/dynamic ssr:false`
  chunks + `useSyncExternalStore` server snapshots + mount-once effects.
- `"use client"` alone is **not** sufficient (it still SSRs); the dynamic
  boundary is mandatory. Hydration risk is low because the globe container
  renders only a veil/placeholder on the server.

## 4. Static assets and workers (Verified)

Official requirement (Cesium Quickstart + Webpack guide 2024-02-13 +
`cesium-webpack-example`): serve 4 directories and set the base URL before
import:

- `node_modules/cesium/Build/Cesium/{Workers,ThirdParty,Assets,Widgets}`
- `window.CESIUM_BASE_URL = '/cesium'` (or `DefinePlugin CESIUM_BASE_URL`)
- `import "cesium/Build/Cesium/Widgets/widgets.css"` in client code only

Next.js mapping (**Proposed**, standard community pattern): CopyWebpackPlugin in
`next.config.mjs webpack()` copying to `public/cesium/{Workers,Assets,Widgets,
ThirdParty}`; `CESIUM_BASE_URL=/cesium`. Do **not** commit copied assets; do
not hand-edit webpack output. Dev and prod serve `public/` identically, but
Vercel output inclusion must be verified in the PoC. CSP must add
`worker-src blob:`, `img-src data: blob: <hosts>`, `connect-src <hosts>`
(report-only first).

## 5. Performance implications (Proposed — measure in PoC)

- `cesium` package ≈ 75 MB unpacked / ~123 MB download zip; initial-JS budget
  (200 KiB gzip, currently 194.6 KiB) survives **only** if Cesium stays in a
  lazy `?renderer=cesium` chunk like today's 3D branches. Never import it in the
  default graph.
- Replaces ~113 MB GPU texture residency with tiled streaming (better steady
  state, heavier network). Marker path (≤2000 entities) is well within
  Entity-API norms.
- StrictMode double-mount, worker startup, and first-frame latency are PoC
  acceptance items.

## 6. Terrain options

| Option | Access | Licensing/cost | Fallback |
|---|---|---|---|
| Ellipsoid (default) | none | free | — (this IS the fallback) |
| `Terrain.fromWorldTerrain()` (ion) | ion token | free tier quotas; commercial terms if exceeded | ellipsoid on failure |
| Self-hosted quantized-mesh | own pipeline | own cost | — |

**Recommended:** ellipsoid default, ion terrain opt-in. Never require paid
service for the default path.

## 7. Imagery options

| Option | Access | Notes |
|---|---|---|
| GIBS WMTS (existing allow-list, 3 layers) | no key | **Recommended default.** No token, matches existing `imagery.ts` discipline; `WebMapTileServiceImageryProvider` maps 1:1 to the redirect template. |
| Ion World Imagery | ion token | opt-in alternative. |
| `SingleTileImageryProvider` with `earth-day.jpg` | local file | emergency static fallback only — not a real provider. |
| Sentinel Hub WMTS/WMS | OAuth client + subscription/quota | opt-in later phase; never default. |

Attribution: GIBS and ion both require credit display — keep `Viewer`
credit container visible (do not hide credits to "clean up" the UI).

## 8. Sentinel data access options (Verified endpoints, Proposed wiring)

- **Catalog (metadata):** CDSE STAC API `https://stac.dataspace.copernicus.eu/v1`
  (STAC 1.1.0; collections e.g. `sentinel-2-l2a`, L2A Collection 1, 2015→present).
  Free-text/bbox/datetime search; OIDC login for some paths. This gives
  **footprints + acquisition metadata**, directly mappable to Cesium polygon
  entities. **Recommended for Phase 6.**
- **Bulk raster:** CDSE S3 (`eodata.dataspace.copernicus.eu`, free account S3
  credentials) or AWS Open Data S2 L2A COGs (`s3://e84-earth-search-sentinel-data`,
  us-west-2, no account). Raw products (JPEG2000/COG) are **not directly
  renderable** by Cesium — a tile-service step is required (Sentinel Hub Process
  API → WMTS; or a COG tiling proxy stood up per phase plan). Catalogue ≠
  imagery: do not promise scene rendering from STAC alone.
- **On-demand render:** Sentinel Hub Process API (`sentinel-2-l2a` type id,
  evalscript-defined RGB/composites) returns renderable PNG/JPEG per request;
  needs OAuth + subscription/quota → server-side proxy with key secrecy,
  rate-limit class, and cache policy like existing providers. **Recommended for
  Phase 7.**
- Auth direction: STAC search can start keyless (verify rate limits in PoC);
  S3 and Process API need credentials → server-side only, same pattern as
  FIRMS/AirNow.

## 9. Authentication requirements

- **Cesium ion token** (`Ion.defaultAccessToken`): public browser token if ion
  imagery/terrain is used. Get from `ion.cesium.com/tokens`. Restrict by
  HTTP referrer/domain + asset scope per provider guidance; ship the *default
  project token*, never an admin/account token. If only GIBS/ellipsoid ship,
  **no token is needed at all** — preferred for the default path.
- **CDSE/Sentinel Hub credentials**: server-side only (Phase 6–7), via
  `.env` + `config.ts` pattern, redacted logs, never `NEXT_PUBLIC_`.
- Existing FIRMS/AirNow handling is already compliant; extend the same rules.

## 10. Licensing and attribution

- CesiumJS: Apache-2.0 (commercial + non-commercial OK). `cesium` npm license
  field confirms.
- Natural Earth `land-110m.json`: public domain (repo NOTICE.md) — stays with
  the dotted fallback regardless.
- NASA Blue Marble textures: NASA Visible Earth family (credited in
  Settings → About) — retained for legacy branches; not redistributed
  differently.
- Sentinel data: free, full, open use per Copernicus legal notice, with
  `sci:citation: "Copernicus Sentinel data [Year]"` required on derived views.
- GIBS/ion credits must remain visible in-app.

## 11. Known incompatibilities / PoC items

1. Bundle/asset weight vs 200 KiB budget + Vercel limits — measure in PoC.
2. `cesium` Node-engines note (=22.0.0 on one registry view) vs repo Node 24 —
   install-time verification.
3. Resium exact latest + React 19 peer range — verify at install.
4. CopyWebpackPlugin writing into `public/cesium` during `next build` on
   Vercel — verify output + runtime 200s for Workers/Assets.
5. CSP worker/blob/data/image/connect additions — observe report-only first.
6. STAC keyless rate limits; S3 credential flow; Sentinel Hub quota/cost.
7. `pickEllipsoid` vs `pickPosition` behavior for the coordinate-readout
   feature; entity-pick parity with current raycast UX.
