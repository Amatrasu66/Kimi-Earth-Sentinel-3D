# Cesium Migration Backlog — Phases 2–9 (Phase 1 proposal)

Conventions: each phase lists objective, scope, prerequisites, tasks,
files/modules, dependencies, risks, testing, acceptance criteria, and explicit
out-of-scope. Regression rule for every phase: `lint + typecheck + test +
build` green (modulo the known flaky a11y timeout in Phase 1 §9), no API
contract change unless stated and approved.

## Phase 2 — Cesium proof of concept (gated spike)

> Phase 2 status (2026-10-15): IMPLEMENTED — see
> `PHASE_2_IMPLEMENTATION_REPORT.md` and `PHASE_2_ACCEPTANCE_CHECKLIST.md`.
> Verified findings for later phases:
> - Pinned `cesium@1.146.0` (exact); APIs used verified against installed
>   source (compiler corrected 4 misassumptions — always re-verify option
>   names like `ImageryLayer` construction and `camera.pickEllipsoid`).
> - GIBS geographic (`epsg4326`, `250m` set) TileMatrixSets are NOT
>   quadtree-compatible (L1 col-3 → HTTP 400, proven); the PoC serves the
>   same allow-listed layer via `epsg3857`/`GoogleMapsCompatible_Level9`.
>   Any future geographic-endpoint use needs a custom tiling approach.
> - Lazy isolation holds: shell chunk ~5 KB, engine chunk ~4.8 MB raw /
>   ~1.35 MB gzip; initial route +1.1 KiB (195.7 KiB total, budget passes).
> - `public/cesium` (342 files) is generated via `postinstall`, gitignored,
>   and served correctly by `next start` (all MIME types verified).
> - Real-browser verification is RESOLVED (2026-10-15): a zero-dependency
>   CDP harness (`scripts/browser-smoke.mjs`, `npm run smoke:browser`) drives
>   headless Edge against the production server. Phase 2 gate passed on it
>   (see `PHASE_2_ACCEPTANCE_CHECKLIST.md` C/G), and Phase 3 re-used it with
>   grid/narrow-viewport steps. Regenerating evidence needs no new tooling —
>   only `next start` + the npm script.
> - App-cluster test timing flake persists (5 s timeouts under load, zero
>   assertion failures; 62/62 green with `--no-file-parallelism`, CPU
>   contention characterized in `PHASE_3_IMPLEMENTATION_REPORT.md` §16) —
>   Phase 8 must address it before it masks regressions.
> - Defect repair 2026-10-15 (see `PHASE_2_IMPLEMENTATION_REPORT.md` §18):
>   Edge + production build proved `?renderer=cesium` never booted — the
>   lazy chunk failed to parse (`@spz-loader/core@0.3.1`, pulled in via
>   `@cesium/engine`'s `GltfSpzLoader`, emits octal escapes in a template
>   literal). Fixed with an exact webpack alias to a stub (zero SPZ models
>   in this PoC); all emitted chunks now parse, budget still passes.
>   Browser re-verification of the gate is still open.

- Objective: prove Cesium boots in this Next.js 15 app on Vercel with assets,
  picking, and budget intact — then throw away or keep deliberately.
- Scope: pinned `cesium` install; `public/cesium` asset copy; `?renderer=cesium`
  branch; ellipsoid + GIBS WMTS; ≤50 markers; fly-to; click/hover readout.
- Prerequisites: Phase 1 approval; pin `cesium@1.14x` (re-check latest);
  decide Resium vs imperative (recommendation: imperative first — fewer peers
  to verify — revisit Resium in Phase 5 if ergonomics demand it).
- Tasks: (1) install + lockfile; (2) CopyWebpackPlugin/prebuild asset step;
  (3) `CesiumGlobeHost` + controller skeleton behind dynamic `ssr:false`;
  (4) `CESIUM_BASE_URL=/cesium`; widgets.css in chunk; (5) GIBS imagery +
  ellipsoid; (6) entity sync for active layer; (7) picking + fly-to wiring to
  existing props; (8) Vercel preview deploy; measure budgets + CSP reports.
- Files: `next.config.mjs` (webpack hook only), `package.json`/lockfile,
  `src/components/globe/CesiumGlobeHost.tsx`,
  `src/components/globe/useCesiumController.ts`,
  `src/components/globe/cesiumImagery.ts`, `src/lib/geo-cesium.ts`,
  `EarthRenderer.tsx` (one new branch).
- Dependencies: Phase 1 deliverables.
- Risks: bundle/asset weight; Node-engines note; worker 404s; CSP blocks.
- Testing: unit (converters, config); component (mocked cesium: veil, error,
  unmount disposal); manual browser PoC matrix (init, camera, pick, layers,
  resize, prod preview).
- Acceptance: boots from preview URL with zero console errors; assets 200;
  picking works; initial-JS budget still passes; CSP report-only reviewed.
- Out of scope: terrain, Sentinel data, default-renderer switch, three removal,
  timeline, proxy routes.

## Phase 3 — Scientific Earth (per `PHASE_3_SCIENTIFIC_EARTH.md`)

> Phase 3 status (2026-10-15): IMPLEMENTED — see
> `PHASE_3_IMPLEMENTATION_REPORT.md` (21 sections) and
> `PHASE_3_ACCEPTANCE_CHECKLIST.md` (all §§20.A–G passed).
> Verified findings for later phases:
> - Scientific baseline: uniform lighting (`enableLighting=false`),
>   `backgroundColor #020202`, `globe.baseColor #1a2a3c` (deep slate:
>   discernible pre-imagery, never ocean-mimicking). MSAA 4 full / 1 low
>   power. Imagery: GIBS `MODIS_Terra_CorrectedReflectance_TrueColor`
>   (EPSG:3857 WMTS, `today` = mosaic availability, NOT live) —
>   allow-listed, 217/217 × 200 in final smoke run.
> - Optional graticule: built-in `GridImageryProvider`, transparent
>   background/glow, 0.16-alpha lines, created once and `show`-toggled,
>   off-by-default w/ `sentinel:globe-grid:v1` preference; Settings →
>   Globe switch (a11y-wired). Lines confirmed semantically against
>   installed source (color = lines, not fill).
> - Terrain: ellipsoid retained (no token-free verified global provider;
>   ion would require a token — forbidden by the mandatory-token-free
>   rule). Upgrade path = ion opt-in behind explicit consent.
> - Fly-to centralized in pure `resolveFlyToView()` (validated targets,
>   home-height fallback, reduced-motion jumps). Picking contract
>   unchanged. `requestRenderMode` evaluated and deferred to Phase 4
>   (marker density decides); no new continuous-render loop.
> - CSP: document remains report-only; but inline-style violations and
>   WASM-instantiation notes mean Phase 8 enforcement must add style
>   handling + `wasm-unsafe-eval` first (recorded in the Phase 3 report).
> - Budgets: initial JS 200,385 B → 200,738 B gzip (196.0 KiB) PASS;
>   Cesium lazy ≈ 1.36 MiB gzip total (shell 2.6 KiB); textures MET.
> - Tests: 782/81 with 5–7 pre-existing flaky timeouts (contention,
>   62/62 sequential). 16 new tests, all green.
>
> Items in the older Phase 3 plan below that were NOT part of the executed
> scientific-Earth scope (imagery registry CRUD, ion terrain opt-in,
> Settings Diagnostics, provider status lines, imagery switcher UI) are
> re-targeted to Phase 4 per the delivered Phase 4 spec, which is the
> authority from here on.
>
> Superseded pre-Phase-3 plan items (kept for history): production-grade
> viewer lifecycle state machine; imagery CRUD/registry + provider status
> lines; ion terrain opt-in; Settings → Diagnostics; CSP additions. The
> imagery-registry and provider-management subset now belongs to Phase 4's
> "Satellite Imagery and Scientific Layer Management" scope; re-check this
> list against the Phase 4 spec at Phase 4 entry.

## Phase 4 — Observation sync + interaction parity

- Objective: every current marker/interaction behavior works on Cesium.
- Scope: `DataPoint[]` → entities (≤2000, severity colors, filter-aware);
  hover card anchor; click → `selectEvent`; empty-globe coordinate readout
  (`pickEllipsoid` default, `pickPosition` where depth needed);
  quaternion-flight parity via `camera.flyTo`; reduced-motion instant sets;
  auto-rotate + low-power mappings; home/reset control (new; fills a current gap).
- Prerequisites: Phase 3.
- Tasks: entity sync with id-diffing; screen-space handlers with rAF throttle;
  drag-vs-click discrimination; fly-to driver on `flyTo.key`; home button in
  header/stage; keyboard equivalent for reset.
- Files: `cesiumObservations.ts`, `useCesiumController.ts`,
  `GlobeStage.tsx`/`AppHeader.tsx` (home control only), `lib/geo-cesium.ts`.
- Risks: pick-behavior differences (ellipsoid vs terrain vs entity);
  performance at 2000 entities on low-end (measure; fall back to points).
- Testing: sync/count/severity tests; pick-routing tests; flight tests;
  reduced-motion tests.
- Acceptance: side-by-side checklist vs §5 inventory — all V items behave
  equivalently; a11y suite passes (flake root-caused or quarantined with note).
- Out of scope: footprints, timeline, default flip.

## Phase 5 — Dashboard integration + default-renderer decision

- Objective: Cesium becomes a first-class citizen; decide the default.
- Scope: layer rail/panels/search/filters/dock operate unchanged against
  Cesium; imagery switcher UI (GIBS layers, opacity) if Phase 3 stable;
  `?renderer=` matrix (dotted default retained); readiness gate for flipping
  default to cesium (metrics: load time, error rate, budget).
- Prerequisites: Phase 4 parity.
- Tasks: imagery controls UI; opacity plumbing; default-flip decision record
  (approved separately); docs update (`README`, `development.md` renderer
  section); keep legacy branches behind flag.
- Files: shell components (controls only), docs.
- Risks: premature default flip — gate on measured preview data, not opinion.
- Testing: full suite + manual renderer-matrix pass (dotted/webgl/webgpu/
  cesium × layers × search × selection).
- Acceptance: decision record signed; if flipped, fallback chain verified.
- Out of scope: three removal, Sentinel phases.

## Phase 6 — Sentinel catalogue (STAC search + footprints + metadata)

- Objective: real Sentinel-1/2 discovery integrated with existing search/panels.
- Scope: server STAC client (`stac.dataspace.copernicus.eu`:
  bbox+datetime+collection+limit, validated like other providers);
  footprint polygons as Cesium entities; selected-scene detail panel reusing
  event-detail patterns; provenance (`data_status`, citation
  "Copernicus Sentinel data [Year]"); honest `UNAVAILABLE` when catalogue
  unreachable (same honesty rules as current fallbacks).
- Prerequisites: Phases 2–4 (stable host); no new globe engine work.
- Tasks: `server/providers/cdse-stac.ts`; search extension or dedicated
  scene-search route (new route allowed here with validation+tests);
  `cesiumFootprints.ts`; detail mapping (acquisition time, orbit, cloud cover,
  product id); rate-limit class + cache TTL for catalogue calls.
- Files: `src/server/providers/cdse-stac.ts`, search/scene route(s),
  `cesiumFootprints.ts`, intelligence panels (scene card).
- Risks: STAC rate limits; geometry size (simplify before entity load);
  S1 vs S2 schema differences.
- Testing: provider tests (fixtures), route validation tests, footprint
  render tests (mocked), stale/unavailable honesty tests.
- Acceptance: AOI+date search returns real footprints on globe with metadata;
  offline/keyless-misconfig states are labelled, never fabricated.
- Out of scope: rendering scene rasters (Phase 7), S3 bulk download UI.

## Phase 7 — Sentinel scene rendering (tiled imagery)

- Objective: render selected Sentinel scenes on the globe.
- Scope: chosen path from Phase 6 findings — (a) Sentinel Hub Process API →
  server proxy → WMTS/URL-template layer, or (b) COG tiling proxy; per-scene
  imagery layer add/remove; time/date labelling ("acquisition, not live");
  quota-aware caching + rate limits; key secrecy server-side.
- Prerequisites: Phase 6; credentials provisioned (server env, redacted logs).
- Tasks: proxy route(s) with allow-list + TTL; imagery registry extension;
  scene-layer UI (add/remove/opacity); cost/quota monitoring note;
  attribution + citation display.
- Files: proxy route(s), `server/providers/sentinel-imagery.ts`,
  `cesiumImagery.ts` extension, layer UI.
- Risks: quota/cost overruns (cap + cache aggressively); large-scene latency
  (loading states mandatory); raw-product rendering without tiling (forbidden —
  must go through tile service).
- Testing: proxy tests (allow-list, redaction, cache headers); layer tests;
  quota-exhausted honesty test.
- Acceptance: a selected S2 scene renders correctly georeferenced with
  acquisition label; quota failure degrades to labelled state, never blank.
- Out of scope: bulk download, processing pipelines, three removal.

## Phase 8 — Quality gates (testing, a11y, security, perf)

- Objective: production-grade gates across the migrated app.
- Scope: root-cause or quarantine the flaky a11y timeout; jsdom/Radix
  `use-size` error resolution; browser-automation decision (adopt only if
  justified — do not install speculatively); full a11y pass on new controls;
  security review (ion token restrictions, proxy allow-lists, CSP enforce
  decision); perf budgets (initial JS, Cesium chunk, imagery concurrency,
  mobile); docs (`development.md`, README, DESIGN.md if applicable).
- Prerequisites: Phases 2–7 (or the subset actually built).
- Tasks: flake fix; automation PoC; CSP report-only → enforce decision;
  budget re-baseline; dependency audit (`npm audit` + supply-chain checks per
  `docs/audit/supply-chain.md` conventions).
- Risks: scope creep — gate criteria frozen at phase start.
- Testing: the gates themselves.
- Acceptance: suite green (no flakes, no unhandled errors); budgets pass;
  security checklist signed.
- Out of scope: new features.

## Phase 9 — Legacy retirement + cutover

- Objective: remove what the migration proved redundant, safely.
- Scope: iff Cesium is the approved default AND legacy branches are unused:
  remove WebGL/WebGPU branches (or keep one fallback per decision record);
  remove `three`/R3F/drei deps + lockfile entries; delete `public/textures`
  4K set if unused (keep dotted `land-110m.json` regardless); CSP cleanup;
  final bundle/texture verification; migration retrospective doc.
- Prerequisites: Phase 8 gates green + explicit removal approval.
- Tasks: staged removal (one engine per commit, full suite between);
  dep uninstall; asset pruning; docs final.
- Risks: breaking the fallback chain — keep dotted Earth permanently.
- Testing: full suite + renderer matrix after each removal.
- Acceptance: `lint+typecheck+test+build` green; budgets pass; no dead
  imports; fallback (dotted) verified live.
- Out of scope: everything else. Dotted fallback is never removed.
