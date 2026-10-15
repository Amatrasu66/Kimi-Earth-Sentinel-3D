# Feature Preservation Matrix (Phase 1)

Status key: **V** implemented-verified · **P** partial · **U** UI-only ·
**N** not found. Migration strategy: **keep** (unchanged) · **adapt** (small
adapter) · **modify** · **replace** · **tbd**.

Priority: **P0** must preserve · **P1** should preserve · **P2** nice to have.
Risk: effort/regression risk of the migration step for that feature.

## A. Globe rendering

| Feature | Status | Evidence (file/component) | Data source | Deps | Target CesiumJS behavior | Migration strategy | Regression test | Priority | Risk |
|---|---|---|---|---|---|---|---|---|---|
| Default dotted Earth | V | `globe/dotted/DottedEarth.tsx`, `shell/GlobeStage.tsx:57-67` | `public/geo/land-110m.json` | d3-geo | Keep as zero-GPU fallback behind selector | keep | `DottedEarth.*.test`, `GlobeStage.test` | P0 | Low |
| 3D day-textured sphere | V | `globe/Globe.tsx:108-116`, `WebGPUEarth.tsx:464-482` | `public/textures/earth-day*.jpg` | three/R3F/drei | Cesium globe + imagery provider (ion or GIBS WMTS) | replace | renderer contract tests | P0 | Med |
| Day/night shading | V | TSL smoothstep `WebGPUEarth.tsx:467-478`; const shell `Globe.tsx:132-141` | `earth-night*.jpg`, sun tuple | — | `Viewer.shadows` + sun-driven lighting; night lights via imagery or emissive skip | replace | visual PoC checklist | P1 | Med |
| Clouds | V (decorative) | `Globe.tsx:146-187`, `WebGPUEarth.tsx:491-506` | `earth-clouds.jpg` | — | Drop static shell; optional real cloud imagery layer later | replace | — | P2 | Low |
| Atmosphere | V (3D) | `shaders/atmosphere.ts`, `WebGPUEarth.tsx:508-526` | procedural | — | `scene.skyAtmosphere` (built-in) | replace | PoC checklist | P1 | Low |
| Stars | V (3D) | `Globe.tsx:449`, `WebGPUEarth.tsx:529-548` | procedural | — | `scene.skyBox` (built-in) | replace | — | P2 | Low |
| Sun lighting (60 s tick) | V | `hooks/useSunDirection.ts`, `lib/solar.ts` | computed (no provider) | — | keep hook; drive Cesium sun/clock | adapt | `solar.test.ts` | P1 | Low |
| Graticule | P (dotted only) | `DottedEarth.tsx:76,280-284` | procedural | d3-geo | optional grid layer; not default | tbd | — | P2 | Low |
| Country boundaries | N | — | none | — | optional vector tiles later | tbd | — | P2 | Low |
| Terrain/elevation | N | bump/normal art only | none | — | ellipsoid default; ion terrain opt-in | tbd | — | P1 | Med |
| Satellite tracks | N | — | none | — | CZML/entity path if data sourced | tbd | — | P2 | High |
| Globe labels | N | shell-only text | — | — | Cesium labels if needed | tbd | — | P2 | Low |
| Reset/home view | N | — | — | — | `camera.flyTo` home + HomeButton off (custom) | modify | new test | P1 | Low |

## B. Markers, picking, camera

| Feature | Status | Evidence | Data source | Deps | Target CesiumJS behavior | Migration strategy | Regression test | Priority | Risk |
|---|---|---|---|---|---|---|---|---|---|
| Severity markers (instanced) | V | `markerSync.ts:59-83`, both 3D paths | `/api/v1/layers/[id]/data` | — | `Entity` + `BillboardGraphics` per point (≤2000) or `PointPrimitiveCollection` | replace | marker-count/severity tests | P0 | Med |
| Hover highlight + cursor card | V | `Globe.tsx:282-294`, `MarkerHoverCard.tsx` | selection state | — | `ScreenSpaceEventHandler(MOUSE_MOVE)` + pick; reuse card | adapt | hover tests | P0 | Med |
| Click select → detail | V | `SentinelApp.tsx:221` → `useEventSelection` | `/api/v1/events/[id]` | — | `LEFT_CLICK` pick → same `selectEvent(id)` | adapt | `useEventSelection.test` | P0 | Low |
| Coordinate picking (empty globe) | V | raycast / 10 px nearest | — | — | `pickEllipsoid` vs `pickPosition` vs entity pick per feature (see target arch) | modify | new picking tests | P0 | Med |
| Search fly-to | V | `CommandSearch.tsx:123-134`, `useFlyTo.ts`, `motion.ts:37-62` | `/api/v1/search` | — | `camera.flyTo(destination fromDegrees, orientation)`; keep `flyTo {lat,lon,key}` prop contract | adapt | `useFlyTo.test` | P0 | Low |
| Zoom/rotate | V | OrbitControls 7–30; dotted wheel/drag | — | — | default Cesium controls (tune min/max) | replace | — | P0 | Low |
| Auto-rotate toggle | V | `isRotating`, `SentinelApp.tsx:82,199,301` | — | — | `viewer.clock`/`camera` rotate or `autoRotate` equivalent; respect reduced motion | adapt | settings tests | P1 | Low |
| Low-power mode | V | `lib/low-power.ts`, `textureTiers.ts`, DPR caps | — | — | resolution scale + imagery off + requestRenderMode | adapt | `low-power.test.ts` | P1 | Med |
| Reduced-motion support | V | `usePrefersReducedMotion.ts`, instant jumps | — | — | instant camera sets; disable rotate | adapt | hook tests | P0 | Low |
| Keyboard shortcuts (1–8, Space, Esc, /, ?) | V | `useKeyboardShortcuts.ts`, `useSingleKeyShortcuts.ts` | — | — | keep (globe-agnostic) | keep | shortcut tests | P0 | Low |
| Renderer selector + fallback | V | `EarthRenderer.tsx`, 30 s watchdog, error boundary | — | — | add `?renderer=cesium` branch; keep dotted default + fallback chain | modify | `EarthRenderer.test` | P0 | Med |
| Loading veils / status / errors | V | Suspense veils, `RendererInfo`, `WebGpuErrorBoundary` | — | — | same pattern for Cesium init (dynamic import + boundary + veil) | adapt | renderer tests | P0 | Low |

## C. Dashboard, panels, state

| Feature | Status | Evidence | Data source | Deps | Target CesiumJS behavior | Migration strategy | Regression test | Priority | Risk |
|---|---|---|---|---|---|---|---|---|---|
| AppShell regions | V | `shell/AppShell.tsx` | — | — | unchanged | keep | `AppShell.test` | P0 | Low |
| Layer rail (8 layers) | V | `shell/LayerRail.tsx` | `/api/v1/layers` | — | unchanged | keep | `LayerRail.test` | P0 | Low |
| Command search + combobox | V | `shell/CommandSearch.tsx` | `/api/v1/search` | `useSearch` | unchanged; fly-to target feeds Cesium camera | keep | `CommandSearch.test` | P0 | Low |
| DataPanel/EventDetails/EventList | V | `intelligence/*` | layer data + event detail | — | unchanged | keep | `DataPanel.test` | P0 | Low |
| Severity filter + legends | V | `SeverityFilter.tsx`, `LayerOverview.tsx` | layer meta | — | unchanged (client-side filter before entity sync) | keep | filter tests | P0 | Low |
| StatusDock + provenance chips | V | `shell/StatusDock.tsx`, `overlays/DataStatusBanner.tsx` | `data_status` envelope | — | unchanged; add imagery-provider status line later | keep | dock/banner tests | P0 | Low |
| Settings + Diagnostics + About | V | `panels/SettingsModal.tsx` | renderer info, api config | — | extend diagnostics with Cesium/ion status | adapt | settings tests | P1 | Low |
| URL state (?layer=&event=&q=&sev=&view=) | V | `lib/url-state.ts`, `useAppUrlState.ts` | — | — | unchanged | keep | `url-state.test.ts` | P0 | Low |
| List view | V | `shell/ListStage.tsx`, `shell/ViewToggle.tsx` | same data | — | unchanged (no globe dependency) | keep | view tests | P0 | Low |
| Charts (histograms/bars) | V | `charts/*`, `LayerOverview.tsx` | layer stats | visx | unchanged | keep | chart tests | P1 | Low |
| Time selectors / playback | N | — | — | — | Cesium clock/timeline only if data needs it | tbd | — | P2 | Med |

## D. Data, API, providers

| Feature | Status | Evidence | Data source | Deps | Target CesiumJS behavior | Migration strategy | Regression test | Priority | Risk |
|---|---|---|---|---|---|---|---|---|---|
| Layer catalogue (8) | V | `server/models/layers.ts`, `api/v1/layers/route.ts` | code-defined | — | unchanged | keep | api tests | P0 | Low |
| Layer points + stats + provenance | V | `layers/[layerId]/data/route.ts`, `services/layers.ts` | USGS/EONET/FIRMS/Open-Meteo/AirNow | keys (server) | unchanged; Cesium consumes same payloads | keep | route/service tests | P0 | Low |
| Heatmap grids | V | `layers/[layerId]/heatmap/route.ts`, `providers/heatmap.ts` | same providers | — | optional future drape; no globe use today | keep | heatmap tests | P1 | Low |
| Event detail (live USGS/EONET/FIRMS) | V | `events/[eventId]/route.ts`, `services/event-detail.ts` | providers | — | unchanged | keep | detail tests | P0 | Low |
| Stats overview + historical | V | `stats/route.ts`, `stats/historical/route.ts` | providers | — | unchanged | keep | stats tests | P0 | Low |
| Search (geocoding + event index) | V | `search/route.ts`, `providers/geocoding.ts` | Open-Meteo + bundled index | — | unchanged | keep | search tests | P0 | Low |
| Timezones (offline) | V | `timezones/route.ts`, `providers/geocode.ts` | `tz-lookup` | — | unchanged | keep | timezone tests | P1 | Low |
| Reverse geocode stub | V (intentional UNAVAILABLE) | `geocode/reverse/route.ts` | none | — | unchanged | keep | reverse tests | P1 | Low |
| GIBS capabilities + tile redirect | V (API-only, UI never loads) | `imagery/gibs/*/route.ts`, `providers/imagery.ts` | NASA GIBS | — | **prime candidate**: wire as Cesium `WebMapTileServiceImageryProvider` | adapt | providers tests | P0 | Med |
| Rate limiting + 429 envelope | V | `middleware.ts`, `server/rate-limit.ts` | — | — | unchanged; add tile-proxy class if proxying imagery | keep | `rate-limit.test.ts` | P0 | Low |
| Cache + `data_status` honesty | V | `cache.ts`, `provenance.ts`, `http-cache.test.ts` | — | — | unchanged | keep | cache/provenance tests | P0 | Low |
| Sentinel-1/2 products | N | zero hits in `src` | none | — | STAC search + footprint entities + tiled-via-service imagery (backlog Phases 6–7) | tbd | new tests | P1 | High |
