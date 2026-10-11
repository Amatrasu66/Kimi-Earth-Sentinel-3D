# Heatmap & Imagery Decision (T2.8)

Date: 2026-10-11 · Authoritative for T2.8 implementation.
PRD ref: T2.8 (+ T2.6-search / T2.7-stats provider contracts reused).

## 1. Current behavior (verified in source, no assumptions)

- Route `GET /api/v1/layers/<layerId>/heatmap?resolution=&time_range=` validates
  (`resolution` 1–512 default 128; `time_range` ∈ 24h/48h/7d/30d), then serves
  `getHeatmap()` from `src/server/providers/heatmap.ts`.
- All 8 catalogue layers (`BOUNDS_MAP`) get **seeded deterministic grids**
  (`mulberry32(seedFor(layer,resolution,timeRange))`, uniform [0,1) floats with
  per-layer min/max labels) → always `SIMULATED`/`no-store`. Unknown layers →
  `UNAVAILABLE` with an empty grid. `time_range` only changes the seed.
- Response contract (unchanged by T2.8): base64 little-endian float32 raster,
  2:1 equirectangular (`resolution²/2` values), `layer_id`, `resolution`,
  `grid`, `min_value`, `max_value`, `unit`, `timestamp`, `data_status`.
- No frontend consumer: `api.getLayerHeatmap` is defined but never called by
  any component/hook; no globe overlay renders heatmaps. Rate class `heavy`,
  `HEATMAP_TTL = 3600`, LIVE→public (never live today).
- Static art is not data: the globe's day/night/cloud textures
  (`public/textures/`) are decorative NASA Blue Marble family assets; the
  drifting cloud shell is illustrative, not a weather feed.

## 2. Upstream contracts verified 2026-10-11 (not invented)

- Open-Meteo Forecast `current=` supports `temperature_2m` (°C),
  `precipitation` (mm, preceding-hour sum), `cloud_cover` (%, total), and
  `wind_speed_10m` (km/h) — canonical documented names (the API also accepts
  the legacy aliases `cloudcover`/`windspeed_10m` used by the layer path;
  verified live: both spellings return identical values). Multi-location
  `current=` returns per-location structures in request order; single
  location returns one object. No key, fair use, model estimates (~9–25 km
  grids, best-match stitching).
- Open-Meteo Air Quality `current=us_aqi` (verified in T2.5): multi-location
  list in request order, CAMS model estimates, no key.
- USGS FDSNWS `query`: ISO8601 `starttime`/`endtime` (inclusive, UTC),
  `limit` ≤ 20000, `orderby=time`; 204 = genuine zero (verified in T2.7).
- EONET v3 `/events`: `status=open|closed|all`, `start`/`end` YYYY-MM-DD
  inclusive; geometry key is **`geometry`** (singular — the T2.7 contract
  fix; legacy `geometries` accepted defensively).
- FIRMS area CSV `.../VIIRS_NOAA20_NRT/<key>/WORLD/<days>`, days 1–10
  (key required; verified in T2.3/T2.7).
- NASA GIBS WMTS REST (verified in official access-basics docs):
  `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{Layer}/default/{Time}/{TileMatrixSet}/{z}/{y}/{x}.{ext}`
  — exactly the pattern `buildTileUrl` already emits (y-before-x). `best` =
  best-available incl. near-real-time; daily layers take `YYYY-MM-DD`;
  requesting the current date may return empty tiles where processing lags
  (documented GIBS caveat, not an app bug). Attribution: NASA EOSDIS GIBS.
  The 3 allow-listed products are genuine daily `epsg4326/best`
  visualizations (see §4). The tile redirect + capabilities routes are
  correct (allow-list, tile validation, 302, no arbitrary URLs) — no change
  needed. The UI never loads GIBS tiles (`gibsTileUrl` is builder + test
  only); CSP `img-src 'self'` (report-only) therefore stays untouched.

## 3. Numerical heatmaps vs imagery (product distinction)

- A **numerical heatmap** (`/heatmap` routes) is a grid of genuine numeric
  values with known source, units, coordinates, timestamp/window, sampling,
  and missing-value behavior (NaN cells for unobserved model cells; 0 counts
  only inside fully observed event windows — never failure-as-zero).
- **Satellite imagery** (GIBS tiles) is a dated raster visualization: real
  pixels, but pixel colors are never converted into fabricated numeric
  measurements. Imagery is served only through the existing tile-redirect
  API; no globe overlay is built in T2.8 (renderer rewrite explicitly out of
  scope — integration requirement recorded in §5).

## 4. Per-layer decision matrix

| Layer | Current behavior | Proposed data source | Output type | Freshness / resolution | Final decision |
|---|---|---|---|---|---|
| temperature | seeded grid (SIMULATED) | Open-Meteo `temperature_2m` current at cell centers | numeric grid, °C | current model run; ≤20×10 cells (≥18° spacing — coarse sampling, documented) | REAL |
| precipitation | seeded grid (SIMULATED) | Open-Meteo `precipitation` current at cell centers | numeric grid, mm | current model run; same sampling | REAL |
| clouds | seeded grid (SIMULATED) + decorative globe texture | Open-Meteo `cloud_cover` current at cell centers | numeric grid, % | current model run; same sampling. Texture stays illustrative (labelled) | REAL (grid only) |
| wind | seeded grid (SIMULATED) | Open-Meteo `wind_speed_10m` current at cell centers | numeric grid, km/h | current model run; same sampling | REAL |
| air_quality | seeded grid (SIMULATED) | Open-Meteo AQ `us_aqi` current at cell centers | numeric grid, AQI (CAMS estimates) | current model run; same sampling | REAL |
| wildfires | seeded grid (SIMULATED) | FIRMS detections binned per cell (`WORLD/1|2|7` by `time_range`); keyless or 30d → honest gap | numeric grid, detection **counts** | 24h/48h/7d observation windows | REAL (or UNAVAILABLE) |
| earthquakes | seeded grid (SIMULATED) | USGS M2.5+ events binned per cell over the `time_range` window | numeric grid, event **counts** | 24h/48h/7d/30d windows | REAL |
| disasters | seeded grid (SIMULATED) | EONET events (`status=all` + date range) binned per cell | numeric grid, event **counts** (curated-event density, not uniform surveillance) | 24h/48h/7d/30d windows | REAL |

Rejected alternative: per-cell upstream fetches at high resolution (e.g.
128²/2 = 8192 cells → ~164 requests) — unbounded fan-out, violates T2.2.
Sampling is therefore capped at 200 cells (`resolution` ≤ 20, 2:1 grid);
higher requests are served at the documented lower resolution (disclosed
in-band via the echoed `resolution` + status message), never silently
truncated; `> 512` still 400s. Cell spacing dwarfs model grid cells, so no
dedup pass is needed (same rationale as T2.5).

## 5. GIBS imagery mapping (visualization only, no globe integration in T2.8)

| App layer | GIBS product (allow-listed, verified) | Meaning / time | Integration status |
|---|---|---|---|
| (global context) | `MODIS_Terra_CorrectedReflectance_TrueColor` (250m, jpeg, z0–8) | daily true-color surface reflectance, best-available (≈1-day latency) | API only (redirect) — no globe overlay |
| (global context) | `VIIRS_SNPP_CorrectedReflectance_TrueColor` (250m, jpeg, z0–8) | daily true-color (Suomi NPP), best-available | API only (redirect) — no globe overlay |
| temperature (adjacent) | `MODIS_Terra_Brightness_Temp_Band31_Day` (1km, png, z0–6) | daytime brightness temperature — a **visualization**, not °C measurements | API only (redirect) — no globe overlay |

Globe integration (tile layer on either renderer + legend + date selector)
requires renderer/scene work that T2.8 explicitly forbids; it is recorded
here as remaining work for an owner-approved follow-up, not started.

## 6. Payload budget (250 KB gzip)

Worst supported case: resolution 20 → 200 float32 cells (800 B) → ~1.1 KB
base64 + ~0.6 KB JSON ≈ **1,203 B raw, 558 B gzip** (measured 2026-10-11,
independent Node script) — over 400× inside the 250 KB budget. Verified
in-test with Node `zlib` (asserts raw < 16 KB and gzip < 250 KB with the
measured values recorded in the test comment). No quantization needed; the
base64-LE-float32 contract is preserved byte-for-byte.

## 7. Final implementation decisions (post-implementation record)

- Seeded generation (`getSimulatedHeatmap`, `seedFor`, `BOUNDS_MAP`) deleted;
  complete provider failure → stale → `UNAVAILABLE` (never simulated).
- `time_range` is functional for event layers (window select), ignored with
  documentation for current-condition model layers.
- Clouds globe texture labelled illustrative in layer metadata + README.
- CSP unchanged (`img-src 'self'`, report-only) — no client tile loading.
- `HeatmapData` gains optional `warnings[]` (partial-coverage disclosure,
  mirrors `LayerData`); all other fields byte-compatible.
