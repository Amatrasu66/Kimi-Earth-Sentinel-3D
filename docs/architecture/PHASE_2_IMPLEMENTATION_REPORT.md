# Phase 2 Implementation Report — CesiumJS Foundation PoC

**Date (UTC):** 2026-10-15 · **Branch:** main (Phase 2 baseline `2f60324`;
during the session the owner committed skills + Phase 1 docs as `e658b39` —
all Phase 2 changes below sit uncommitted on top, no conflicts, nothing
overwritten) · **Node:** v24.15.0
**Status:** Implemented, verified to the extent the environment permits.
Manual browser verification is **blocked** (no browser/automation available);
substitute evidence is documented per criterion. No Phase 3 work started.

Note on prompt path: §2 references `docs/prompts/PHASE_1_REPOSITORY_AUDIT.md`;
the actual file is `docs/prompts/architecture/PHASE_1_REPOSITORY_AUDIT.md`
(and likewise for the Phase 2 prompt). Code took precedence throughout; no
other conflicts found.

## 1. Summary

CesiumJS is now an isolated fourth renderer (`?renderer=cesium`) behind the
existing selector. Default (dotted), `webgl`, and `webgpu` branches are
unchanged. Token-free GIBS imagery + ellipsoid terrain, full Viewer lifecycle
with StrictMode safety, click-to-coordinate picking wired to the dock readout,
reduced-motion/low-power mappings, deterministic asset pipeline, bundle budget
still passing, no CSP change required.

## 2. Files created

| File | Purpose |
|---|---|
| `src/components/globe/CesiumEarth.tsx` | Fourth branch component (client, dynamic cesium import, lifecycle, picking, fly-to, veils) |
| `src/components/globe/cesiumConfig.ts` | Pure config (base URL, GIBS constants, home view, TIME builder, `loadCesiumRuntime` seam); no cesium import |
| `src/components/globe/CesiumEarth.test.tsx` | 10 tests (loading/init/error, lifecycle/StrictMode, low-power, picking, fly-to) |
| `src/components/globe/cesiumConfig.test.ts` | 7 tests (constants, TIME builder, allow-list assertion) |
| `src/types/cesium-assets.d.ts` | Ambient CSS module shim for the widget stylesheet |
| `scripts/copy-cesium-assets.mjs` | Deterministic asset copy (342 files, idempotent, fails loudly) |
| `docs/architecture/PHASE_2_IMPLEMENTATION_REPORT.md` | this file |
| `docs/architecture/PHASE_2_ACCEPTANCE_CHECKLIST.md` | per-criterion verdicts |

## 3. Files modified

| File | Change |
|---|---|
| `package.json` | `+ "cesium": "1.146.0"` (exact); `+ cesium:assets`, `+ postinstall` scripts |
| `package-lock.json` | +277 lines, purely additive (cesium + transitive deps) |
| `.gitignore` | `+ public/cesium/` (generated assets stay out of git) |
| `src/lib/webgpu.ts` | `RendererKind` gains `'cesium'`; `getForcedRenderer` accepts it; `decideRendererMode` passes non-3D overrides through |
| `src/components/globe/rendererMode.ts` | `GlobeMode` gains `'cesium'`; docs updated |
| `src/components/globe/EarthRenderer.tsx` | lazy `CesiumEarth` chunk + branch + Suspense veil + self-report skip + `onCoordinatePick` pass-through |
| `src/components/app/SentinelApp.tsx` | `pickedCoord` readout state, `handleCoordinatePick`, dock fallback `hovered ?? picked`, cleared on layer toggle/close |
| `src/components/globe/EarthRenderer.test.tsx` | Cesium stub in dynamic mock + 3 new branch tests |
| `src/lib/webgpu.test.ts` | 2 new `cesium` selection tests |
| `docs/architecture/CESIUM_MIGRATION_BACKLOG.md` | Phase 2 section annotated with PoC findings (appendix below) |

Untouched as required: three.js/R3F/drei deps, all API routes/schemas,
providers, SWR hooks, dashboard components (except the two-line dock fallback),
CSP/headers, budget thresholds, `url-state` contract, Next/React versions.

## 4. Dependency and compatibility evidence

- `cesium@1.146.0` verified pre-install: `npm view` (exists, latest stable
  2026-10-01), `engines: node >=22.0.0` (Node 24 satisfies — no warning at
  install), built-in types (`Source/Cesium.d.ts`), ESM (`Source/Cesium.js`).
- Installed dist verified on disk: `Build/Cesium/{Workers(63),ThirdParty(7),
  Assets(205),Widgets(67)}`, matching official layout.
- Every API used was verified against the installed source, and the compiler
  corrected four wrong assumptions (`ImageryLayer.fromProvider` absent →
  `new ImageryLayer(provider)`; `camera.pickEllipsoid` not `globe.`;
  CSS needs ambient declaration; literal-type height). Typecheck is clean.
- No Resium, no global store, no Next/React upgrade, no unrelated dep changes.

## 5. Imagery provider configuration and evidence

- Default: `WebMapTileServiceImageryProvider`, KVP auto-detect (plain `.cgi`
  URL), `layer: MODIS_Terra_CorrectedReflectance_TrueColor` (allow-listed —
  asserted in test), `style: default`, `format: image/jpeg`,
  `tileMatrixSetID: GoogleMapsCompatible_Level9`, `maximumLevel: 9`,
  `dimensions: { Time: <today UTC> }`, credit `Imagery © NASA EOSDIS GIBS`.
- Verified live 2026-10-15: epsg3857 GetCapabilities (5.8 MB) shows the layer
  on the `GoogleMapsCompatible_Level9` set (256 px, L0–L9, exact quadtree);
  KVP tile probes at L0/L1/L2/L5/L9 all `200 image/jpeg` with
  `Access-Control-Allow-Origin: *`; no key; full-globe coverage.
- Documented deviation: repo `buildTileUrl`/allow-list metadata describes the
  geographic endpoint, whose `250m` set is non-quadtree (L1 col-3 → HTTP 400,
  proven). Same allow-listed layer is served via the compatible epsg3857
  endpoint. Layer discipline preserved; no arbitrary URLs.
- Terrain: default `EllipsoidTerrainProvider` (verified default in installed
  `Viewer.js`); explicit in code. No terrain token. Default base imagery
  (`fromWorldImagery`, ion) is overridden — verified it would need a token.

## 6. Asset-copy strategy and worker configuration

- `scripts/copy-cesium-assets.mjs` copies the four documented dirs from
  `node_modules/cesium/Build/Cesium` to `public/cesium` (served at `/cesium`).
  Remove-then-copy (idempotent, verified twice → 342 files, no nesting);
  fails non-zero with cause if the package or a dir is missing; verifies
  `Widgets/widgets.css` post-copy.
- Runs via `postinstall` (covers `npm ci`, local installs, Vercel builds) and
  `npm run cesium:assets`. Added to `.gitignore`; never committed.
- `window.CESIUM_BASE_URL = '/cesium'` is set in the component before the
  dynamic import (asserted in test). Workers resolve same-origin under
  existing `worker-src 'self'` — no blob:, no plugin, no bundler change.
- Production probes (`next start`): `/cesium/Widgets/widgets.css` → 200
  `text/css`; worker sample → 200 `application/javascript`;
  `Assets/approximateTerrainHeights.json` → 200; ThirdParty wasm → 200
  `application/wasm`.

## 7. CSP changes

**None.** Policy stays report-only and byte-identical (verified header in prod
probe). Rationale: workers are same-origin (`worker-src 'self'` ✓), widget CSS
is Next-bundled (`style-src 'self'` ✓), GIBS tiles load via image elements
(same as any `<img>`; enforcing-CSP migration must add the GIBS host to
`img-src`, plus `connect-src` if a tile proxy lands later — recorded, not
applied). No `unsafe-eval`, no wildcards, no weakened headers.

## 8. Renderer-selection changes

- `?renderer=cesium` selects the new branch; default/invalid/`webgl`/`webgpu`
  behavior unchanged (tests: invalid → empty container; `?renderer=` rides
  through URL canonicalization untouched).
- Lazy isolation verified in production build: component shell chunk
  `117.*.js` (5 KB raw / 2.3 KB gzip) + engine chunk `733.*.js` (4.81 MB raw /
  1.35 MB gzip); neither referenced by default-route HTML (probed).
- Fallback (user-initiated, justified): init/module failure renders a
  `role=alert` veil naming the error and telling the user to drop
  `?renderer=cesium`; no silent URL rewrite (no existing normalization
  convention for failures), no retry loop, no repeated Viewer construction
  (construction happens at most once per mount; abandoned StrictMode pass
  builds nothing).

## 9. Lifecycle design

Mount-once effect + per-mount `cancelled` flag; dynamic import → provider →
`new Viewer` (all widgets off except credits, ellipsoid terrain, GIBS base) →
home `setView` → canvas `ScreenSpaceEventHandler(LEFT_CLICK)` → imagery
`errorEvent` listener (degrades status, never destroys). Teardown destroys
handler, removes listener, destroys Viewer once, clears refs. Callbacks via ref
mirror (no stale closures). Resize relies on Cesium built-in behavior.

## 10. Geographic interaction behavior

- Click → `camera.pickEllipsoid(pos, globe.ellipsoid)` → `Cartographic`
  → degrees → `isValidCoordinate` → optional `onCoordinatePick(lat, lon)`.
  Space clicks (no pick), missing positions, and out-of-range values never
  call back. Handler is canvas-bound, so dashboard controls are unaffected.
- Wired in `SentinelApp` to the dock coordinate readout (hover wins while
  set; cleared on layer toggle/close). Readout-only — no selection change.
- Fly-to: existing `flyTo {lat,lon,key}` prop → `camera.flyTo` (1.4 s,
  top-down, current altitude preserved) or `setView` under reduced motion;
  invalid targets ignored. No ambient rotation exists on this branch
  (reduced-motion-safe by construction); `isRotating` accepted for parity.
- Markers/sun wiring intentionally deferred (Phase 4+); props accepted so the
  contract does not fork.

## 11. Reduced-motion and low-power behavior

- Reduced motion (`usePrefersReducedMotion`, existing hook): instant `setView`
  instead of `flyTo`; no auto-rotation introduced; interactive camera kept.
- Low power (`lowPowerActive`, existing policy): `viewer.resolutionScale`
  1 → 0.5 and `globe.maximumScreenSpaceError` 2 → 4 (both documented Cesium
  options; verified in installed source). Applied at init and on change
  without remount (tested). `requestRenderMode` deliberately not used
  (render-loop semantics change). Other renderers untouched.

## 12. Test results

| Check | Result |
|---|---|
| `typecheck` | clean (before and after; compiler caught 4 API misassumptions) |
| `lint` | clean |
| New tests | 22 (7 config + 10 component + 3 selector + 2 parser) — all pass, repeatedly |
| Non-app suite | **67 files / 666 tests pass** (server, API, shell, globe, hooks, lib) |
| App cluster | timing-flaky on this machine: view 18/18 and firstrun 16/16 in isolation; url 6/7, a11y 16/17 solo (single known 5 s timeouts); grouped runs cascade. Every failure observed is `Test timed out in 5000ms` — zero assertion failures; failing identity varies run to run. Renderer-preservation test passes. |
| `build` | passes (all routes; first-load JS 103 kB shared) |
| `textures:report` | both tiers MET (unchanged code paths) |
| `bundle:check` | **PASS 195.7 KiB < 200 KiB** (+1.1 KiB vs 194.6 baseline; Cesium isolated in lazy chunks) |
| Production probes | health ok; default + `?renderer=cesium` HTML identical 29 KB with no cesium refs; 4/4 asset URLs 200 with correct MIME; layers API 8/8; CSP + cache headers unchanged |

## 13. Bundle measurements

| | Before (Phase 1) | After (Phase 2) |
|---|---|---|
| Initial JS (gzip, per `bundle:check`) | 199,259 B (194.6 KiB) | 200,381 B (195.7 KiB) — PASS |
| Cesium engine chunk | — | `733.*.js` 4,812,220 raw / 1,351,837 gzip (lazy) |
| Cesium shell chunk | — | `117.*.js` 4,988 raw / 2,285 gzip (lazy) |
| Method | repo script (per-file gzip level 6, initial-route files only) | same script + node zlib level 6 for lazy chunks |

Budget threshold unchanged (204,800 B). The script counts only initial-route
JS; lazy-chunk sizes measured separately and reported (not hidden).

## 14. Production build findings

`next build` clean; `.next` contains the two cesium chunks; `public/cesium`
(342 files, gitignored) served correctly by `next start`. No dev-only asset
paths (single `/cesium` constant used everywhere). Vercel deploy not run
(spec requires local prod verification; deploy remains manual).

## 15. Known limitations

1. No real-browser run: Viewer render, tile painting, and actual picking
   verified only via unit/component mocks + HTTP-level probes (jsdom has no
   WebGL; no automation framework in repo).
2. Imagery is a single daily GIBS layer at today-UTC; date-boundary gaps would
   surface as the honest degraded status, not silent blanks.
3. No markers/entities, no sun wiring, no home control, no imagery switcher —
   all Phase 4+.
4. `pickedCoord` readout persists until hover/layer change by design.
5. App-cluster timing flake is worse under parallel load on this machine
   (documented above; unrelated to these changes by isolated-run evidence).

## 16. Deviations from the prompt

1. Imagery endpoint: epsg3857 instead of the allow-list's geographic endpoint
   (same layer; quadtree incompatibility proven; §5).
2. `decideRendererMode` passes `cesium` through instead of probe-deciding
   (function is unused by the selector; behavior for legacy inputs unchanged).
3. `onCoordinatePick` prop extension (smallest justified; optional;
   readout-only wiring) instead of reusing selection callbacks (semantically
   wrong for empty-globe clicks).
4. No `requestRenderMode` for low power (semantics risk; documented).
5. Manual browser verification substituted with prod-server HTTP probes +
   mocked lifecycle tests (environment has no browser).

## 17. Unresolved issues

- Real-browser Viewer boot/pick/resize on this stack (needs a browser env).
- Vercel preview behavior of `public/cesium` + 4.8 MB chunk serving.
- Report-only CSP → enforcing policy with GIBS host (Phase 8).
- Whether `pickedCoord` should also clear on view change (trivial, Phase 4).
- App-cluster timing flake on slow machines (pre-existing; Phase 8).

## 18. Addendum — Phase 2 defect repair: Cesium chunk `SyntaxError` (2026-10-15)

Manual browser verification in Edge (production `build + start`) FAILED the
gate with new evidence: `/?renderer=cesium` rendered the error veil
`Loading chunk 782 failed`, caused by
`Uncaught SyntaxError: Octal escape sequences are not allowed in template
strings` at parse time of the lazy chunk. Default (`/`) still rendered.

Root cause (verified against installed packages and the emitted build):
`import('cesium')` resolves to the ESM `Source/` tree, which re-exports
`@cesium/engine`, which statically imports `{ loadSpz }` from
`@spz-loader/core@0.3.1` (`Source/Scene/GltfSpzLoader.js`, via the engine
barrel). That dist ships Node-isms plus a binary blob the minifier
re-encodes with octal escapes in a template literal — unparseable in any
browser. Unit mocks never execute the chunk, so CI stayed green.

Minimal repair (no Phase 3 work, no threshold/CSP/budget changes):
- `src/components/globe/cesiumSpzLoaderStub.ts` (new): honest stub —
  `loadSpz()` rejects loudly. Safe: only called when decoding `.spz`
  model content; this PoC loads zero models.
- `src/components/globe/cesiumSpzLoaderStub.test.ts` (new): 2 tests.
- `next.config.mjs`: exact-match webpack alias `@spz-loader/core$` →
  stub (first and only `webpack()` hook; headers/CSP byte-identical).

Artifact verification (same production build): `@spz-loader/core` dist
absent from all emitted chunks (only the stub's own error string
remains); all 25 emitted JS chunks pass `node --check` as ES modules;
`typecheck`/`lint` clean; globe suite 99/99; `bundle:check` PASS at
200,375 B (195.7 KiB, threshold unchanged); textures both tiers MET.
Checklist items C (real-browser render) and G (manual verification)
remain **Blocked** pending a user browser re-run of the smoke test —
artifact checks are supporting evidence, not rendering proof.
