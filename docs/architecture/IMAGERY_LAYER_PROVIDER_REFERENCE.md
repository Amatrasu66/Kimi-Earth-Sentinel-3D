# Imagery & Layer Provider Reference (Phases 4–7)

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

## 1b. Selected-scene raster provider — Microsoft Planetary Computer (Phase 7; dynamic, NOT a registry layer)

Added by Phase 7 (backlog "Sentinel scene rendering (tiled imagery)";
provider substitution recorded in `PHASE_7_IMPLEMENTATION_REPORT.md` §2 —
the backlog's credentialed Sentinel Hub / COG-proxy paths were not
authorized or provisioned). This is a **dynamic per-scene provider**, not
a `IMAGERY_LAYER_REGISTRY` entry and never user-selectable: it is created
by `src/components/globe/cesiumSceneRaster.ts` (lazy chunk) from a
server-validated, server-pinned descriptor for the currently selected
scene, and destroyed when the selection or toggle changes. The registry
rules above are unchanged; `SUPPORTED_IMAGERY_PROVIDERS` gained
`microsoft-planetary-computer` for the imagery engine's accounting only.

| Aspect | Verified value |
|---|---|
| Service / endpoint | Microsoft Planetary Computer Data API, `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?…` via Cesium `UrlTemplateImageryProvider` |
| Auth | **none (keyless)** — verified live 2026-10: HTTP 200 PNG tiles, no SAS token anywhere in the URL |
| Item resolution | PC STAC API `https://planetarycomputer.microsoft.com/api/stac/v1`; collection-items endpoint with exact-name CQL2 `filter` + `limit=1` (the `/search?filter=` form returned 504 in probes and is not used); identity re-checked against `s2:product_uri` (L2A) / `s1:product_identifier` (S1 GRD); a mismatch is a failure state — never a swapped raster |
| Collections / rendering | `sentinel-2-l2a` true color (`assets=visual&asset_bidx=visual%7C1,2,3&nodata=0&format=png`); `sentinel-1-grd` default dual-pol composite (`assets=vv&assets=vh&expression=vv;vh;vv%2Fvh&rescale=…&asset_as_band=True&tile_format=png&format=png`); no L1C collection exists on PC → honest `unsupported` |
| CRS / tiling | WebMercatorQuad EPSG:3857 XYZ (tilejson: scheme `xyz`, 256 px, zoom 0–24) — matches Cesium's `WebMercatorTilingScheme`; descriptor clamps to 0–14 (~10 m native); zooming beyond 14 interpolates pixels, stated in `resolution_note` |
| Temporal semantics | Pixels are the archive product rendered by PC; acquisition/sensed time is shown from the Phase 6 scene record — never labelled live |
| Attribution | `Rendered by Microsoft Planetary Computer` (panel), Copernicus disclosure reused (`Contains modified Copernicus Sentinel data [year]`) |
| Error handling | Descriptor validation failure → previous map kept + visible report; tile failures reported once per layer generation; retries capped (`SCENE_RASTER_MAX_TILE_RETRIES = 2`) then disabled — no retry loops, no blank globe |
| Licensing | PC renders Copernicus Sentinel data; disclosures kept in the panel |
| CSP | The PC host will appear in report-only CSP reports exactly like the pre-existing direct GIBS tiles; enforcement decision deferred to Phase 8 (host recorded, not silently allowed) |

## 2. Layer roles and ordering

- Exactly one base is active at a time (`DEFAULT_BASE_LAYER_ID =
  gibs-modis-truecolor`). Replacements are add-then-remove with the new
  base pinned via `lowerToBottom` — the base always renders beneath
  overlays by construction.
- Overlays render above the base in registry order. With a single
  overlay there is no user-controlled ordering (`supportsReordering:
  false`); the control appears only when a second reorderable overlay
  ships with verified semantics.
- The Phase 7 scene raster (§1b) is a dynamic overlay above the base,
  beneath the graticule (the graticule is re-raised on every raster
  attach); it is created/destroyed by selection + toggle, not a registry
  layer, and never participates in reordering.

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
- Scene raster visibility ("Show raster on globe", Phase 7) is **session
  state only** — default off, not URL-encoded, not persisted; it resets
  on reload. The raster descriptor itself is never persisted.

## 4. Explicitly unimplemented (future integrations, NOT supported)

- Sentinel scene **downloads** and authenticated STAC item search
  (require CDSE OIDC credentials — keyless STAC item search returns zero
  features, proven in the Phase 6 proposal §4), NDVI or derived rasters,
  precipitation/pollution/fire overlays, commercial WMTS/WMS, ion World
  Imagery/Terrain (requires a token — forbidden on the default path),
  self-hosted quantized-mesh terrain, Sentinel Hub (OAuth + quota).
  (Scene **metadata discovery** is supported — §1a; selected-scene
  **raster rendering** is supported through the keyless Planetary
  Computer path — §1b. Neither is a registry imagery layer and neither
  changes the registry rules above.)
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

Dynamic per-scene providers (§1b pattern) are an approved variant:
they bypass the registry but must keep server-validated descriptors,
pinned origins (re-validated client-side), explicit lifecycle tests,
bounded retries, and honest failure states. They must never become
user-selectable controls or accept client-supplied URLs.
