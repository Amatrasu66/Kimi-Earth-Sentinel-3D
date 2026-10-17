# Imagery & Layer Provider Reference (Phases 4–6)

Authoritative record of every imagery provider the application actually
supports. Only listed providers may appear in the layer registry
(`src/components/globe/imageryLayers.ts`); anything else is a future
integration and is marked as such below — never exposed in the UI.

## 1. Supported providers

### `nasa-gibs` — NASA EOSDIS GIBS (Global Imagery Browse Services)

| Aspect | Verified value |
|---|---|
| Layer (base) | `gibs-modis-truecolor` → `MODIS_Terra_CorrectedReflectance_TrueColor` |
| Endpoint | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi` (WMTS KVP) |
| Protocol | WebMapTileService KVP auto-detect via `WebMapTileServiceImageryProvider` |
| CRS / tiling | EPSG:3857, `GoogleMapsCompatible_Level9` — exact quadtree (256 px, levels 0–9), matching Cesium's `WebMercatorTilingScheme` |
| Zoom levels | WMTS 0–9 (`GIBS_MAXIMUM_LEVEL = 9`); ~250 m native at top level |
| Format / style | `image/jpeg` / `default` |
| Authentication | none (token-free, verified live with `Access-Control-Allow-Origin: *`) |
| Attribution | `Imagery © NASA EOSDIS GIBS` (provider credit + Settings display) |
| Temporal semantics | `Time` = UTC calendar day of the MODIS Terra CorrectedReflectance TrueColor **daily composite** (mosaic availability date). **Not live observation**; same-day pixels appear only after processing/publishing latency |
| Resolution limits | Global daily mosaic; visibly soft beyond regional zoom — must not be presented as high-resolution local imagery |
| Error handling | Tile errors → degraded status line; base replacement failures → previous working layer kept + visible recoverable error; no retry loops |
| Licensing | NASA EOSDIS open imagery with credit requirement (credit container kept visible) |

The geographic-endpoint (`epsg4326`, `250m` set) variant of the same
allow-listed layer is NOT quadtree-compatible (L1 col-3 → HTTP 400,
proven in Phase 2) and is not used. Layer discipline: the product id is
asserted against the server allow-list (`isAllowedLayer`) in tests.

### `cesium-native` — Built-in Cesium providers (no network)

| Aspect | Verified value |
|---|---|
| Layer (overlay) | `cesium-graticule` → `GridImageryProvider` |
| Endpoint | none (procedural canvas texture, one 256 px tile shared by all tiles) |
| CRS / tiling | `GeographicTilingScheme` by construction; cell boundaries on the 180°/2^n lattice |
| Configuration | 8 cells, line `#dbe9ff` @ 0.16 alpha, fully transparent glow and background |
| Authentication | none |
| Attribution | none required |
| Temporal semantics | n/a (reference geometry, no observation data) |
| Limitations | Density refines with zoom by construction; carries no data |
| Lifecycle | Created once per Viewer; `show` toggles visibility; `alpha` fades; disposed with the Viewer |

## 1a. Catalogue (metadata) provider — CDSE OData (Phase 6; NOT an imagery layer)

Added by Phase 6. This provider supplies **scene metadata discovery**
(search results + product footprints), not imagery tiles, and therefore
is **not** part of `IMAGERY_LAYER_REGISTRY` — it lives server-side in
`src/server/providers/cdse-catalogue.ts` behind `GET /api/v1/scenes`
and renders only as footprint entities in the lazy Cesium chunk.

| Aspect | Verified value |
|---|---|
| Service | Copernicus Data Space Ecosystem OData catalogue, `https://catalogue.dataspace.copernicus.eu/odata/v1/Products` (code constant; env-overridable for tests only) |
| Auth | **none (keyless)** — verified live repeatedly (Stage A §4.6–4.7; Stage B entry + close) |
| Query form | `$filter=Collection/Name eq '…' and contains(Name,'…') and OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((…))') and ContentDate/Start gt … lt …` + `$select=Id,Name,ContentDate,GeoFootprint,Online,PublicationDate` + `$orderby=ContentDate/Start desc` + `$top` |
| Collections | allow-list only: `sentinel-2-l1c` (default), `sentinel-2-l2a`, `sentinel-1-grd`; forged ids throw before any fetch |
| Geometry | `GeoFootprint` GeoJSON (Polygon \| MultiPolygon, `[lon,lat]`); parse cap 4,096 vertices (over cap → footprint `null`, scene kept); entity caps 400 entities / 1,024 vertices per outer ring |
| Temporal semantics | `ContentDate/Start` = **acquisition/sensed time — never live coverage**; `PublicationDate` shown separately; both displayed in UTC, distinct from fetch/cache times |
| Attribution | `Contains modified Copernicus Sentinel data [<current year>]` (payload + panel display) |
| Caching / rate | route TTL 900 s + `stale-while-revalidate=1800`; limit 20/20; one upstream request per user action; heavy rate-limit class; no polling |
| Honesty states | LIVE / CACHED / STALE (expired cache served during upstream failure, labeled) / UNAVAILABLE (empty labeled payload) — failures never fabricated, never blank the globe |
| Licensing boundary | metadata discovery only; product downloads require CDSE OIDC credentials (not implemented; Phase 7 decision) |

## 2. Layer roles and ordering

- Exactly one base is active at a time (`DEFAULT_BASE_LAYER_ID =
  gibs-modis-truecolor`). Replacements are add-then-remove with the new
  base pinned via `lowerToBottom` — the base always renders beneath
  overlays by construction.
- Overlays render above the base in registry order. With a single
  overlay there is no user-controlled ordering (`supportsReordering:
  false`); the control appears only when a second reorderable overlay
  ships with verified semantics.

## 3. State, persistence, and validation

- `?imagery=<base-id>` — validated against the registry; unknown ids
  parse to `null` (default) and canonicalize away. `null` serializes to
  "parameter omitted" (legacy URLs byte-identical).
- `sentinel:globe-grid:v1` — grid visibility (existing behavior).
- `sentinel:imagery-base-opacity:v1`,
  `sentinel:imagery-grid-opacity:v1` — validated 0–1 opacities.
- Precedence: URL `?imagery=` wins for the base selection; local
  preferences win for display state (opacity/visibility). Malformed
  storage or URL values fall back to registry defaults — never a crash,
  never an arbitrary request.

## 4. Explicitly unimplemented (future integrations, NOT supported)

- Sentinel scene **raster rendering/ingestion** (Phase 7 by backlog),
  scene **downloads** and authenticated STAC item search (require CDSE
  OIDC credentials — keyless STAC item search returns zero features,
  proven in the Phase 6 proposal §4), NDVI or derived rasters,
  precipitation/pollution/fire overlays, commercial WMTS/WMS, ion World
  Imagery/Terrain (requires a token — forbidden on the default path),
  self-hosted quantized-mesh terrain, Sentinel Hub (OAuth + quota).
  (Scene **metadata discovery** is now supported — see §1a; it is not
  an imagery layer and does not change the registry rules above.)
- Each requires: endpoint + tiling verification, auth review, CSP review,
  attribution/licensing clearance, temporal-semantics documentation, and
  a registry + factory + UI + test + smoke update. Until then they must
  not appear as controls.

## 5. Adding a future provider safely

1. Verify the endpoint live (protocol, CRS/tiling quadtree fit, zoom
   range, CORS, auth, attribution, temporal behavior) and record the
   evidence.
2. Add the descriptor to `IMAGERY_LAYER_REGISTRY` with a new stable id
   (never reuse, never an index/URL).
3. Extend `cesiumImageryProviders.ts` with an explicit branch on the new
   id (constants only — no user input in URL construction) or throw.
4. Wire UI (selection/opacity/ordering only where genuinely supported),
   URL/state validation, and persistence.
5. Add registry + validation + factory + lifecycle + UI + smoke coverage;
   re-run typecheck, lint, full tests, build, bundle, and the production
   smoke suite. Update this reference.
