# Phase 3 Implementation Report — Scientific Earth

Spec: `docs/prompts/architecture/PHASE_3_SCIENTIFIC_EARTH.md`.
Predecessors: `PHASE_2_IMPLEMENTATION_REPORT.md`,
`PHASE_2_ACCEPTANCE_CHECKLIST.md`. Companion:
`PHASE_3_ACCEPTANCE_CHECKLIST.md`.
Environment: Windows, Node v24.15.0, Next.js 15.5.27, `cesium@1.146.0`
(exact), headless Microsoft Edge via a zero-dependency CDP script
(`scripts/browser-smoke.mjs`) — the browser automation environment whose
absence blocked the Phase 2 checklist items C/G.

## 1. Executive summary

Phase 3 upgraded the Phase 2 Cesium proof of concept into a deliberately
restrained scientific Earth: uniform (terminator-free) lighting, a deep-space
scene baseline with a discernible slate globe base, the existing token-free
NASA GIBS true-color imagery preserved and documented as a machine-readable
descriptor, an optional Cesium-native geographic reference grid, and a
reduced-motion-aware fly-to resolver. Terrain was evaluated and ellipsoid
retention was chosen and documented (§7). No new dependencies. The initial
JavaScript budget passes unchanged (196.0 KiB of 200.0 KiB) and all Phase 2
behaviors are preserved.

The Phase 2 real-browser gate was closed first (all 10 §2.1 items verified —
see §2), then implementation proceeded. Final real-browser verification on
the production build: 17/17 checks pass, 217/217 GIBS tile responses HTTP 200,
zero runtime exceptions, CSP still report-only.

## 2. Phase 2 gate results (verified before implementation)

Executed with `scripts/browser-smoke.mjs` against a production server
(`next start`) — evidence `sentinel-smoke/report.json` + 9 screenshots.

| §2.1 item | Result |
| --- | --- |
| 1. `?renderer=cesium` opens, Viewer initializes | Passed (~8 s, software GL) |
| 2. Earth visibly rendered | Passed (screenshot review) |
| 3. Imagery provider loads | Passed (130/130 `wmts.cgi` HTTP 200) |
| 4. Camera interaction | Passed (drag frame-diff + wheel zoom) |
| 5. Assets/workers succeed | Passed (0 non-canceled failed loads) |
| 6. No fatal CSP/worker/WebGL errors | Passed (see §14) |
| 7. Globe resizes with container | Passed (innerWidth 1200 = canvas 1200) |
| 8. Renderer round-trip, no duplicate Viewer | Passed (`cesium-widget=1`) |
| 9. Default renderer remains functional | Passed (dotted canvas) |
| 10. Browser/environment recorded | Passed (Edge version + flags in report) |

Supporting defect repair from the Phase 2 branch (committed `1ba31d5`):
the `@spz-loader/core` parse error that prevented the lazy chunk from
booting was already fixed and was re-confirmed by this gate.

## 3. Files inspected

- `src/components/globe/CesiumEarth.tsx`, `cesiumConfig.ts`,
  `EarthRenderer.tsx`, `rendererMode.ts`, globe test files.
- `src/components/app/SentinelApp.tsx`, `useSingleKeyShortcuts.ts` (pattern
  source for the new hook), `SentinelApp.*.test.tsx` suites.
- `src/components/panels/SettingsModal.tsx` (+ tests), `src/lib/geo.ts`.
- `next.config.mjs` (CSP headers), `package.json`, smoke/budget scripts.
- Installed Cesium sources (verification, not assumption):
  `@cesium/engine/Source/Scene/GridImageryProvider.js` (option names,
  defaults, canvas drawing), `Scene.js` (`msaaSamples` getter/setter and
  render consumption points), `@cesium/engine` `ImageryLayer`.
- Spec: `PHASE_3_SCIENTIFIC_EARTH.md` §§2–22.

## 4. Files changed

| File | Change |
| --- | --- |
| `src/components/globe/cesiumConfig.ts` | `GIBS_PROVIDER_DESCRIPTOR` (§7.3 documentation object incl. time semantics), scene baseline constants, grid constants, MSAA constants, `FlyToViewPlan` + `resolveFlyToView` |
| `src/components/globe/CesiumEarth.tsx` | new `globeGridVisible` prop; scene baseline applied at init; grid imagery layer created once and `show`-toggled; MSAA in init + low-power; fly-to uses `resolveFlyToView` |
| `src/components/app/useGlobeGrid.ts` | **new** hydration-safe grid preference hook (`sentinel:globe-grid:v1`, default off) |
| `src/components/globe/EarthRenderer.tsx` | threads `globeGridVisible` (literal default, keeps cesiumConfig out of the initial graph) |
| `src/components/app/SentinelApp.tsx` | hook wiring to renderer + Settings |
| `src/components/panels/SettingsModal.tsx` | Globe tab: "Geographic grid" row (`sentinel-globe-grid`, `Grid3x3` icon) |
| `src/components/globe/cesiumConfig.test.ts` | descriptor/baseline/grid/MSAA/`resolveFlyToView` tests |
| `src/components/globe/CesiumEarth.test.tsx` | scene baseline, grid layer, MSAA, low-power tests |
| `src/components/app/useGlobeGrid.test.tsx` | **new** (4 tests) |
| `src/components/panels/SettingsModal.test.tsx` | grid toggle tests |
| `scripts/browser-smoke.mjs` | **new** CDP smoke harness + Phase 3 grid/narrow steps (see §17) |
| `package.json` | `smoke:browser` script (only change) |

Also from the Phase 2 gate work on this branch: `StatusDock.tsx`/test
(`cesium: 'Cesium Earth'` label fix). No API routes, server code, hooks, or
URL-state contracts were touched.

## 5. Rendering improvements

- **Uniform lighting**: `globe.enableLighting = false`. No day/night
  terminator: continents stay readable at every camera orientation and the
  view cannot imply a real-time sun position (§9.1 both clauses).
- **Scene baseline**: `scene.backgroundColor = #020202` matches the app's
  deep-space veil; `globe.baseColor = #1a2a3c` replaces Cesium's default
  `Color(0,0,0.5)` navy (which read as "ocean" where tiles were absent).
  Initially `#0e1216`; real-browser review showed the pre-imagery globe was
  effectively invisible against the near-black background ("excessive
  darkening", §9.1), so it was lightened to a discernible deep slate that
  does not mimic ocean-blue.
- **Atmosphere**: Cesium default sky/ground atmosphere retained (restrained);
  no shader injection (§9.2). The default star field and atmosphere were
  judged adequate for the scientific target.
- **MSAA**: `scene.msaaSamples` 4 (full) / 1 (low power) — see §12.

## 6. Imagery provider configuration

Unchanged provider (Phase 2), now fully documented in
`GIBS_PROVIDER_DESCRIPTOR` (`cesiumConfig.ts`): NASA GIBS
`MODIS_Terra_CorrectedReflectance_TrueColor`, WMTS KVP endpoint, EPSG:3857 /
`GoogleMapsCompatible_Level9`, JPEG, `time=today` (UTC date), token-free,
attribution included. Re-verified in the final browser run: 217/217 tile
responses HTTP 200, CORS working, allow-list assertion preserved. §7.2:
MODIS is a 250 m-class global daily mosaic — it supports full/continental
views and visibly softens at close zoom; it must not be presented as
high-resolution local imagery (documented in the descriptor and here).
§7.4: `today` is the *mosaic availability date*, not "live satellite
observation" — the app's `data_status` provenance already distinguishes LIVE
data (USGS events) from imagery; imagery is never labeled real-time.

## 7. Terrain assessment and implementation

Evaluated per §8.1: (a) ellipsoid — token-free, zero network, instant, but
no relief; (b) Cesium World Terrain (ion) — requires an ion token
(account/paid tier risk, violates the mandatory-token-free rule §8.2);
(c) third-party global terrain (e.g., `CesiumTerrainProvider` self-hosted
quantized-mesh) — no verified token-free hosted endpoint exists in this
environment, and self-hosting is out of scope. **Decision: ellipsoid terrain
retained as default**; the upgrade path (ion opt-in behind explicit user
consent) is documented in the backlog. Coordinate picking remains
ellipsoid-based (`camera.pickEllipsoid` → degrees → `isValidCoordinate`),
contract unchanged (§8.4); with ellipsoid retained there is no ambiguity to
resolve.

## 8. Lighting and atmosphere configuration

See §5. Explicitly evaluated and NOT changed: `scene.globe.showGroundAtmosphere`,
`scene.skyAtmosphere`, star field, `scene.fog`. `requestRenderMode` was
evaluated: it would reduce idle GPU work (§2 "unnecessary rendering activity
while idle") but interacts with entity/imagery streaming and marker work
planned for Phase 4; enabling it now would trade a real regression risk for
an optimization with no current measured cost. **Deferred to Phase 4** with
this rationale recorded (spec allows deferral with documentation; no
continuous-render loop was *added* — the render loop is Cesium's default and
was present in Phase 2).

## 9. Grid implementation

Implemented as an optional layer (§10):
- Cesium-native `GridImageryProvider` (verified against installed source:
  `cells`/`color`/`glowColor`/`backgroundColor` option names, `GeographicTilingScheme`
  default) — aligned to the ellipsoid by construction, refines with zoom,
  respects imagery depth rules, no entities/”z-fighting”.
- Restraint: 8 cells, line color `#dbe9ff` at alpha 0.16, glow fully
  transparent, background fully transparent — the graticule never tints or
  overwhelms the imagery. Screenshot review (grid-off vs grid-on at the same
  camera) confirms "improves orientation without overwhelming the base
  imagery".
- Lifecycle: created once per Viewer, toggled via `imageryLayer.show`
  (never rebuilt); cleanup nulls the ref; no duplicate layers across
  StrictMode/remounts (tested).
- UI: Settings → Globe → "Geographic grid" switch (`Grid3x3` icon), off by
  default, persisted under `sentinel:globe-grid:v1` (hydration-safe hook,
  mirrors `useSingleKeyShortcuts`; malformed values fall back to off). Not a
  URL parameter — consistent with how the single-key-shortcuts preference is
  handled.

## 10. Camera-navigation changes

- Default camera: unchanged from Phase 2 (whole-globe home view; verified in
  browser: no in-surface/polar/horizon start).
- Fly-to: centralized into the pure `resolveFlyToView()` helper — validates
  the target (`isValidCoordinate`), falls back to the home-view height when
  the current camera height is unavailable, and returns a jump (duration 0,
  `animate: false`) under reduced motion. Existing fly-to contract and props
  are preserved.
- Controls: Cesium defaults retained (rotate/zoom/pan/tilt/look); no
  imitation of another engine; no reset-toolbar added (§11.3 explicitly
  optional; reserved for Phase 4 parity work).

## 11. Geographic correctness findings

- Picking contract unchanged (ellipsoid → degrees → `isValidCoordinate`);
  tests still green.
- `resolveFlyToView` unit tests use reference destinations across
  hemispheres/latitudes (Greenwich 51.4779/−0.0015, Sydney −33.8688/151.2093,
  Quito −0.1807/−78.4678, Reykjavík 64.1466/−21.9426) and assert destination
  passthrough, height fallback, reduced-motion jumps, and null on invalid
  targets.
- In-browser: the grid follows the ellipsoid precisely (cell boundaries on
  the 180°/2^n lattice); imagery/geography alignment re-verified via the
  drag/zoom screenshots (Africa/Europe recognizable at the final camera).

## 12. Reduced-motion and low-power behavior

- Reduced motion: fly-to jumps (no animation) via `resolveFlyToView`; no
  ambient rotation was introduced anywhere in Phase 3 (tested).
- Low power: existing `resolutionScale` (1→0.5) and `maximumScreenSpaceError`
  (2→4) mappings preserved, plus new `msaaSamples` 4→1 to cut fragment cost
  on weak GPUs (tested; setter verified against installed `Scene.js`, applied
  at init and on toggle without remount).

## 13. Accessibility and responsive behavior

- New switch follows the existing Settings row pattern: native
  `role="switch"`, `aria-label="Toggle geographic grid"`, keyboard-operable,
  focus ring intact (tested). No new shortcuts were introduced.
- Responsive: Cesium canvas tracks the container at 1600×900, 1200×700, and
  430×820 (mobile metrics, DPR 2) — last verified in the final smoke run
  (`innerWidth=430 canvas=430`; narrow screenshot shows the bottom-sheet UI
  with the globe and graticule correctly framed).

## 14. Security and CSP findings

- No CSP change; the document is served only with
  `Content-Security-Policy-Report-Only` (byte-identical to Phase 2). This was
  re-verified from served headers in the final run.
- Violation notes (277 in the final run, informational): (a) "Applying
  inline style" against `style-src 'self'` — Next.js/React/Radix inline
  styles; (b) "Compiling or instantiating a WebAssembly module" — needs
  `wasm-unsafe-eval`/`unsafe-eval` in `script-src`. Neither can block today;
  **if Phase 8 ever flips the policy to enforcing, both must be addressed
  first** (hashes/nonces for styles, `wasm-unsafe-eval` for the WASM
  compiler path). Recorded here so enforcement is not attempted blind.
- Smoke-harness classification fix: violations are now judged from **served
  headers**, never message text — CDP truncates message text (300 chars) and
  had silently cut the "report-only" suffix from long messages, mislabeling
  125–277 non-blocking notes as "blocking". This was an audit-tool bug, not
  an app regression.
- No credentials touched; GIBS allow-list assertion unchanged; no new remote
  origins.

## 15. Performance measurements

- Initial JS: **200,385 B → 200,738 B gzip (196.0 KiB)**, +353 B, budget
  204,800 B unchanged → **PASS** (the Settings row, the hook, and the icon;
  `useGlobeGrid` deliberately owns the default constant so `cesiumConfig.ts`
  stays out of the initial graph — verified by the delta dropping from
  +1,021 B when the import was coupled).
- Cesium lazy chunks (final build): CesiumEarth shell
  `117.*.js` 6,043 B raw / 2,605 B gzip; engine `733.*.js` 4,812,221 B raw /
  1,346,926 B gzip; cesium glue `2ce8b884.*.js` 52,371 B / 14,462 B gzip;
  `widgets.css` 24,440 B / 5,568 B gzip. Cesium remains fully lazy.
- Textures: standard 2.134 MiB file / ~49.2 MiB GPU (MET), high 3.638 MiB /
  ~113.2 MiB (MET) — unchanged from Phase 2.
- Runtime: grid adds one 256-pixel canvas texture shared by all tiles (no
  per-frame cost); MSAA reduction available for low power.

## 16. Test results

- Baseline (pre-Phase-3 test additions): **766/766 green, 80 files**.
- After Phase 3: **782 tests / 81 files. All Phase 3 tests green** (focused
  suites: cesiumConfig 15, CesiumEarth 12, useGlobeGrid 4, SettingsModal 25;
  re-run after the base-color change: 27/27 focused green).
- Full-suite runs recorded **5–7 failures — all of them
  `Test timed out in 5000ms` in the heavy `SentinelApp.*` interaction
  cluster**, with **zero assertion failures**. Root cause characterized:
  CPU contention under file-parallel execution (each affected test passes
  alone; the whole cluster runs **62/62 green with `--no-file-parallelism`**).
  This is the pre-existing Phase 1/2 flake (noted in the backlog for Phase 8),
  not a Phase 3 regression; no unrelated test was modified.
- Known non-fatal noise unchanged: 4–5 jsdom/Radix `inlineSize` uncaught
  exceptions (pre-existing) and the THREE.Clock deprecation warning from the
  legacy WebGL branch.

## 17. Browser verification

Harness: `scripts/browser-smoke.mjs` (`npm run smoke:browser`), zero
dependencies (Node 24 built-ins), headless Edge, isolated profile,
SwiftShader software GL. Final run (production build): **17/17 checks PASS**
— Viewer init, no error veil, drag/zoom frame diffs, resize 1600/1200,
round-trip with exactly one Viewer, **grid preference persists across
reload**, **narrow viewport keeps canvas sized (430/430)**, default dotted
route intact, 0 runtime exceptions, CSP report-only only, assets 30/30 ×
200/304, **GIBS 217/217 × 200**. Screenshot review: grid-on vs grid-off at
the same camera; graticule subtle over real imagery; LIVE USGS data path
rendered with real events in the final run (and the honest error/Retry path
was captured incidentally when the API timed out under load during a weaker
run — both truthful states exercised).

## 18. Production verification

`npm run build` clean; server run via `next start -p 3100`; all smoke runs
executed against the production server (not dev). `/api/health` verified;
Cesium assets served with correct MIME; bundle + texture reports regenerated
from the production `.next` output.

## 19. Known limitations

- Software-GL environment: first render and tile streaming take minutes;
  screenshots taken early in a run can show a black stage or missing tile
  slivers. All final-run programmatic checks passed; this is rendering
  latency, not app behavior. On GPU-backed browsers tiles stream in seconds.
- MODIS global imagery softens at close zoom (product property, documented).
- Cesium `Workers/` requests: 0 in the final runs (workers load lazily only
  when features demand them; Phase 2 already verified worker serving + MIME).
- App-cluster test flake under parallel load (backlog Phase 8).
- `requestRenderMode` not enabled (rationale §8).
- Grid line brightness was reviewed only under software GL; expected GPU
  output is unchanged in principle (same alpha values).

## 20. Deviations from this prompt

- §7.3 asked to keep configuration in a focused module — done via the
  descriptor object; a `GibsProviderDescriptor` type was introduced, no full
  layer registry (§7.3 explicitly bounds this).
- §11.3 camera presets: only the user-selected destination (existing fly-to
  contract) was implemented; no toolbar — allowed ("if useful").
- §9.3 clouds: not implemented (explicitly optional; no verified
  time-semantic source was pursued).
- §8 terrain: retained ellipsoid with documented rationale (§8.2 path).
- The grid default is `false` and its persistence uses `localStorage` (not
  URL) — consistent with the existing preference pattern; the prompt does
  not prescribe a mechanism.

## 21. Remaining risks

- Phase 8 CSP enforcement must implement style handling + `wasm-unsafe-eval`
  or the globe/app breaks (evidence in §14).
- The software-GL-only visual review means fine shading differences (e.g.,
  atmosphere tuning on real GPUs) are unverified here.
- Tile-stream latency masks screenshot timing; future evidence runs should
  capture later frames (the harness waits are tuned but conservative).
- The flaky app cluster grows more expensive as the suite grows; Phase 8
  owns the fix (already in backlog).

## Regenerating evidence

All browser evidence is generated, not stored in-repo:
`npm run build && npm run start -- -p 3100` then
`npm run smoke:browser -- --base-url http://localhost:3100 --out <dir>`.
Reports (`report.json`) and screenshots land in `<dir>`. The final evidence
set used for this report:
`C:\Users\Simra\AppData\Local\Temp\opencode\sentinel-smoke-phase3d\`.
