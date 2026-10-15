# Phase 4 Implementation Report — Imagery & Layer Manager

Spec: `docs/prompts/architecture/PHASE_4_IMAGERY_LAYER_MANAGER.md`.
Predecessors: `PHASE_2_IMPLEMENTATION_REPORT.md`,
`PHASE_2_ACCEPTANCE_CHECKLIST.md`, `PHASE_3_IMPLEMENTATION_REPORT.md`,
`PHASE_3_ACCEPTANCE_CHECKLIST.md`. Companion:
`PHASE_4_ACCEPTANCE_CHECKLIST.md`, `IMAGERY_LAYER_PROVIDER_REFERENCE.md`.
Environment: Windows, Node v24.15.0, Next.js 15.5.27, `cesium@1.146.0`
(exact), headless Microsoft Edge via the zero-dependency CDP script
(`scripts/browser-smoke.mjs`, extended with 5 Phase 4 scenarios).

## 1. Executive summary

Phase 4 adds a typed imagery layer registry, a validated provider
factory, safe base-layer replacement with failure preservation, per-layer
opacity controls, and a Settings-based layer manager — without inventing
providers, without touching the renderer architecture, and without
weakening security, tests, or budgets. Only the two genuinely available
layers are exposed: the verified NASA GIBS true-color base
(`gibs-modis-truecolor`) and the Cesium-native graticule overlay
(`cesium-graticule`). No ordering UI (no meaningful choice exists with one
base pinned to the bottom and one overlay above it), no placeholder
layers, no live-imagery claims. The initial JavaScript budget still
passes (198.1 KiB of 200.0 KiB, +2,071 B), Cesium stays fully lazy, and
the extended production smoke suite passes 22/22 with 323/323 GIBS tile
responses HTTP 200 and zero runtime exceptions.

## 2. Phase 3 gate verification

Before any edit, the Phase 3 acceptance gate was verified against the
documents (not assumed):

- `PHASE_3_IMPLEMENTATION_REPORT.md` records Phase 3 complete (21
  sections): scientific baseline, documented GIBS descriptor, optional
  grid, ellipsoid retention rationale, 17/17 final smoke, 217/217 tiles.
- `PHASE_3_ACCEPTANCE_CHECKLIST.md`: every criterion `Passed`
  (§§20.A–G), verdict "all criteria satisfied".
- `PHASE_2_ACCEPTANCE_CHECKLIST.md` sections C/G now record the
  real-browser gate as `Passed` (CDP harness, Viewer init, 130/130 tiles,
  one Viewer after round-trip, 0 exceptions) — the items blocked in the
  original Phase 2 run were closed during Phase 3 and the checklist was
  updated accordingly.
- Supporting docs (`PHASE_1_REPOSITORY_AUDIT.md`,
  `FEATURE_PRESERVATION_MATRIX.md`, `CESIUM_TARGET_ARCHITECTURE.md`,
  `CESIUM_COMPATIBILITY_AND_PROVIDERS.md`, `CESIUM_MIGRATION_BACKLOG.md`,
  `PHASE_1_COMPLETION_REPORT.md`, `PHASE_2_IMPLEMENTATION_REPORT.md`)
  all present and mutually consistent; no contradictions found.
- Authorization: Phase 4 execution was explicitly authorized by the user
  together with the Phase 3 completion statement.

Gate verdict: Phase 3 acceptance verified; Phase 4 entry permitted.

## 3. Initial working-tree state

- Branch `main`, HEAD `dd18093` ("feat: implement geographic grid
  preference in Cesium globe" — the Phase 3 commit; the prompt's
  `1ba31d5` reference is its parent, a documentation-only delta).
- `git status --short` at entry: exactly one untracked file, the Phase 4
  prompt itself (`docs/prompts/architecture/PHASE_4_IMAGERY_LAYER_MANAGER.md`).
  No modified files — the Phase 3 work the prompt describes as
  "uncommitted" had already been committed as `dd18093`.
- Nothing was reset, discarded, overwritten, staged, or committed by the
  agent. The prompt doc remains untracked and untouched.

## 4. Baseline test/build results (pre-change, re-measured)

| Check | Command | Baseline result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| Full tests | `npm test` | run 1: 779/782 (3 `Test timed out in 5000ms`, identities not retained); run 2: **782/782 green**, 81/81 files, 5 pre-existing jsdom/Radix `inlineSize` unhandled errors |
| Production build | `npm run build` | clean (exit 0) |
| Textures | `npm run textures:report` | both tiers MET |
| Bundle | `npm run bundle:check` | **200,738 B gzip (196.0 KiB) PASS** |
| Browser smoke | `npm run smoke:browser` (prod server, fresh build) | **17/17 PASS**, 208/208 GIBS × 200, 0 exceptions, CSP report-only |

The two full-suite samples (779 → 782 with zero assertion failures and
varying identities) reproduce the documented pre-existing CPU-contention
flake (Phase 3 report §16); the second sample is the recorded baseline.

## 5. Architecture and design decisions

- **Registry is pure and tiny.** `imageryLayers.ts` has no `cesium`
  import and no browser APIs at module scope, so `url-state.ts` (initial
  graph) can validate `?imagery=` against it without pulling the Cesium
  runtime into the first load. Runtime construction lives in
  `cesiumImageryProviders.ts`, imported exclusively by the lazy
  `CesiumEarth` chunk. Serializable metadata and live Cesium objects never
  mix (spec §5.1).
- **One validated base, honestly presented.** Only
  `gibs-modis-truecolor` is exposed. The selection architecture (stable
  ids, radiogroup, URL param, factory switch with a throwing default
  branch) accepts a second verified source without redesign, but no
  second choice is fabricated (§7: "do not fabricate additional
  choices").
- **Grid keeps its established behavior.** Visibility stays in
  `useGlobeGrid` under `sentinel:globe-grid:v1` (localStorage, default
  off); the registry only gives the overlay a stable identity
  (`cesium-graticule`) and the manager reuses the existing Settings
  switch untouched (§8.1, §10.1).
- **URL owns the discrete selection; storage owns continuous display
  state.** `?imagery=` is a validated 6th canonical param (null =
  default = omitted, so legacy URLs are byte-identical). Opacities live
  in validated localStorage keys, so slider drags never write history
  (§10.3). Precedence is documented, not invented: URL for the base
  selection (shareable, like `?layer=`), local preferences for display
  (like grid/low-power/shortcuts).
- **No ordering UI.** Base pinned to index 0 via `lowerToBottom`; single
  overlay above. `supportsReordering: false` on every descriptor with the
  rationale recorded here and in the registry — exposing drag-and-drop
  would be decoration without semantics (§8.3).
- **Parent-owned error state.** The layer failure string lives in
  `SentinelApp` (`imageryError`), is reported up via `onLayerError`, and
  flows back down as the `layerError` prop for the diagnostics detail
  text — one source of truth, and the switch effect never calls setState
  synchronously (lint-clean by construction).
- **No async gap, no generation guard.** Provider construction is
  synchronous, so each selection completes before the next effect can
  run; the code comments record that an async initializer must add a
  generation guard first (§12.2 documented, not silently waived).

## 6. Layer registry and state model

`src/components/globe/imageryLayers.ts`:

| Layer | Role | Provider | Default | Opacity | Reorder | Attribution |
|---|---|---|---|---|---|---|
| `gibs-modis-truecolor` | base | `nasa-gibs` | visible, α=1 | yes | no | Imagery © NASA EOSDIS GIBS |
| `cesium-graticule` | overlay | `cesium-native` | hidden, α=1 | yes | no | none required |

Validation helpers: `isSupportedBaseLayerId`,
`resolveBaseLayerId` (unknown → verified default, never a crash, never a
request), `parseImageryUrlValue` (unknown → `null`), `clampLayerOpacity`
(0–1, fallback on garbage), `parseLayerOpacity` (missing → layer
default; out-of-range/non-numeric → layer default, never a surprising
clamp). IDs are URL-safe slugs; display names are never identities.

Persistence: `?imagery=` (URL, validated) · `sentinel:globe-grid:v1`
(existing, unchanged) · `sentinel:imagery-base-opacity:v1` +
`sentinel:imagery-grid-opacity:v1` (new, validated, hydration-safe via
`useImageryOpacity`, SSR deterministic on registry defaults).

## 7. Provider configurations and evidence

- Reused verbatim: GIBS `MODIS_Terra_CorrectedReflectance_TrueColor`,
  EPSG:3857 WMTS KVP endpoint, `GoogleMapsCompatible_Level9`, JPEG,
  `Time=<today UTC>`, token-free, existing credit. The factory consumes
  the `cesiumConfig` constants directly (no second configuration exists to
  drift); the registry describes them and `imageryLayers.test.ts` pins
  description ↔ constants ↔ server allow-list together.
- Verified against the installed `cesium@1.146.0` source (not assumed):
  `ImageryLayerCollection.{addImageryProvider, remove, contains,
  lowerToBottom}`, `ImageryLayer.alpha` (default 1.0), `GridImageryProvider`
  option names. No private APIs.
- `today` semantics preserved and surfaced: "daily composite keyed by UTC
  calendar day (mosaic availability date). It is not live satellite
  observation." The UI, registry, and provider reference all state this;
  `data_status` contracts untouched.
- Unsupported sources: no terrain provider, no ion token, no commercial
  endpoints, no credentials. The factory has no code path from user input
  to URL (tested: forged ids/URLs throw `UnsupportedImageryLayerError`
  before any construction). Documented futures live only in the provider
  reference as unimplemented.

## 8. UI behavior and supported capabilities

Settings → Globe (existing tab, no new framework, native radio + range
inputs, same card/switch/label conventions):

1. **Base imagery section**: radiogroup with the single verified choice
   (checked), description, attribution, temporal note, 0–100% opacity
   slider (`aria-valuetext` percent), failure status (`role=status`) when
   the provider reports one.
2. **Geographic grid**: existing switch byte-for-byte preserved, plus a
   grid-opacity slider that is **disabled while the grid is off** (with
   the reason inline) so it can never look functional while doing
   nothing.
3. No ordering controls (see §5); no switches for NDVI, fire, pollution,
   precipitation, or Sentinel-2 (no operational implementations exist).

## 9. URL-state and persistence semantics

- Canonical state gains `imagery: string | null` (`null` = default).
  Fixed param order appends `?imagery=` after `view`; defaults omitted;
  passthrough (`renderer`, etc.) preserved verbatim after known params.
  `parse→serialize` remains a fixed point (extended test vectors
  included).
- `useAppUrlState` owns `baseImagery`/`setBaseImagery` with the standard
  push-vs-replace conventions (discrete selection pushes; mount/popstate
  canonicalization replaces). Unknown ids never reach state.
- Backward compatibility: URLs without `?imagery=` parse to `null` and
  re-serialize byte-identically (tested). Unknown/removed ids fall back
  to the default in place (tested in unit + production smoke).
- Opacity/visibility never enter the URL (no slider history spam, no
  unrelated-param clobbering).

## 10. Lifecycle and error-handling behavior

- Mount: initial base built through the same validated factory (unknown →
  default, never a veil); base `alpha` + grid `show`/`alpha` applied at
  init; error listener attached per current provider and tracked in a ref.
- Replacement: add-then-remove (globe never blank), new base pinned with
  `lowerToBottom`, old removed only after attach, error listener
  re-attached, `activeBaseId` updated, failure reported. Construction or
  attachment failure → previous working layer kept, message surfaced in
  Settings status + diagnostics detail, no retry loop, no stale-as-fresh
  misrepresentation. Re-selecting the working layer clears a stale
  failure (acknowledged recovery).
- Opacity/visibility: pure `alpha`/`show` flag flips — no provider
  recreation, no Viewer reinitialization, no extra renders of the scene.
- Teardown: click handler destroyed, error listener detached, Viewer
  destroyed exactly once; refs nulled. StrictMode-safe via the existing
  `cancelled` flag (mount) and synchronous switch effects.
- Reduced motion: untouched (fly-to resolver). Low power: untouched
  mappings (resolutionScale, maxSSE, MSAA). `requestRenderMode` still
  deferred (Phase 3 rationale stands; out of scope).

## 11. Security and attribution review

- No client-side secrets added; serialized registry asserted free of
  credential-shaped content and URLs (test).
- GIBS allow-list preserved: factory endpoint is the pinned constant;
  `isAllowedLayer(GIBS_LAYER_ID)` asserted in tests; no user-controlled
  provider URLs exist anywhere in the flow.
- CSP: unchanged (report-only, byte-identical policy; smoke judges from
  served headers — 8 report-only headers, 403 informational notes, 0
  enforcing). No `unsafe-html`; descriptions render as text.
- Attribution: GIBS credit on the provider + visible in the manager;
  temporal semantics honest everywhere; no fabricated coverage,
  resolution, freshness, or scientific-validity claims.

## 12. Accessibility and responsive-layout results

- Native radio + range inputs: keyboard-operable, labelled
  (`aria-labelledby`/`htmlFor`), `aria-valuetext` percent announcements,
  `role=status` failure text, existing focus-visible styling,
  `accent-sentinel-accent` (no color-alone state: radio check + % text +
  explicit notes).
- Reduced-motion-compatible (no animated transitions added); existing
  modal focus management untouched.
- Responsive: existing `55dvh` scroll container; slider rows full-width.
  Production-verified at 1600, 1200, and 430 px widths (canvas tracks at
  all three; narrow-sheet screenshot reviewed for the modal path via the
  shared Settings component tests at both breakpoints in
  `SettingsModal.test.tsx`).

## 13. Tests added and test results

New/affected suites (43 new tests):

| Suite | Tests | Covers |
|---|---|---|
| `imageryLayers.test.ts` (new) | 14 | ids, metadata, categorization, no unsupported caps, config consistency, no secrets/URLs, validation/clamping |
| `useImageryOpacity.test.tsx` (new) | 6 | defaults, round-trip, hydration restore, malformed storage, clamping, reset, storage failure |
| `cesiumImageryProviders.test.ts` (new) | 5 | GIBS config correctness, TIME semantics, throw on unknown/forged/overlay, no URL from input, graticule unchanged |
| `CesiumEarthLayers.test.tsx` (new) | 4 | factory-built init + opacity-without-rebuild, add-then-remove + bottom pin, failure preserves previous + visible + recoverable, sequential switches leak-free |
| `useAppUrlState.imagery.test.tsx` (new) | 4 | mount restore, unknown canonicalized away, push sync, unknown setter → default |
| `SettingsModal.test.tsx` (+5) | 30 total | base selected + honest semantics, unknown→default display, sliders report 0–1, grid slider disabled-off, failure status |
| `url-state.test.ts` (+5) | 21 total | imagery parse/round-trip/canonicalization/legacy-identity/fixed-point |

Focused runs: all green (103/103 across the 9 directly affected files;
typecheck clean; lint clean).

Full suite: **825 tests / 86 files — 813 passed, 6 failed, 0 assertion
failures**. All 6 are `Test timed out in 5000ms` in the heavy
`SentinelApp.*` cluster (a11y×2, firstrun×1, search×1, url×1, view×1) +
the 5 pre-existing jsdom/Radix `inlineSize` unhandled errors.
Classification (evidence, not assumption): the failing identities vary
run to run; the same files/timeouts appear in the Phase 1–3 baselines
(5–7 timeouts documented in Phase 3 §16; this run's own pre-change
baseline showed 3 then 0); every affected file passes in isolation or
small groups afterward (a11y 17/17; firstrun+url 23/23; search+view green
in the sequential run) with zero assertion failures. Verdict:
pre-existing CPU-contention flake, unchanged in character by Phase 4 — no
test was weakened, skipped, or modified to obtain green.

## 14. Production browser smoke results

Harness `scripts/browser-smoke.mjs` extended (+5 Phase 4 scenarios, +2
robustness fixes so denied storage fails a step instead of aborting the
suite without a report). Production server: `next start -p 3100` from the
Phase 4 build (build identity verified by page-chunk hash; a stale
pre-existing server on the port was found, killed, and replaced — the
first Phase 4 smoke run against the stale server is recorded as invalid
and was re-run, not salvaged).

Final run `sentinel-smoke-phase4c/`: **22/22 checks PASS**

- Default dotted renderer intact; Cesium initializes (~6.6 s software
  GL); no failure veil; drag/zoom frame diffs; resize 1600/1200; WebGL
  branch renders; round-trip leaves exactly one Viewer.
- `?imagery=gibs-modis-truecolor` keeps the verified base
  (`?layer=earthquakes&imagery=gibs-modis-truecolor&renderer=cesium`).
- `?imagery=sentinel-2` recovers: viewer boots, URL canonicalizes to
  `?layer=earthquakes&renderer=cesium`, no veil.
- Layer manager (CDP-driven Settings open): base radio
  `gibs-modis-truecolor` checked, sliders 100/100, grid slider enabled
  (grid pref on) — screenshot `10-layer-manager.png` reviewed: selected
  choice, attribution, daily-composite/not-live note all visible over
  real GIBS imagery with honest CACHED USGS provenance in the panels.
- Opacity persistence: stored 25/75 restored into both sliders after
  reload — screenshot `11-layer-manager-persisted.png` reviewed: graticule
  visible over faded (25%) imagery, i.e. the overlay toggle and both
  opacities demonstrably affect the live scene.
- Exactly one Viewer after all layer operations; narrow viewport
  430/430; 0 runtime exceptions (only the known THREE.Clock deprecation
  warning); CSP report-only only (header-judged); Cesium assets 60/60 ×
  200/304; **GIBS 323/323 × 200**; `/api/health` 200.

An intermediate run showed a transient WebGL-branch timeout under load
that passed on re-run against the same build — recorded as environmental
(the branch is untouched by Phase 4; see §18).

## 15. Bundle-budget measurements

- Baseline: 200,738 B gzip (196.0 KiB). Final: **202,809 B gzip
  (198.1 KiB) — PASS** (budget 204,800 B; headroom 1,991 B).
  Delta +2,071 B: registry + URL param + opacity hook + Settings manager
  UI. No new dependencies; no threshold or method change.
- Lazy isolation preserved: engine `733.*.js` 4,812,221 raw (byte-same
  as Phase 3) / 1,351,838 gzip; CesiumEarth shell+factory `456.*.js`
  8,041 raw / 3,225 gzip (was 6,043/2,605); glue `2ce8b884.*.js` 52,371
  raw / 14,516 gzip. Default route HTML contains no Cesium references
  (probed); the layer manager never imports the Cesium runtime on the
  dotted path.
- Textures: standard 2.134 MiB / ~49.2 MiB GPU, high 3.638 MiB /
  ~113.2 MiB GPU — both tiers MET (unchanged code paths).

## 16. Known limitations

1. Single verified base: with one choice, the radio→URL change path
   cannot fire in the DOM (a checked single radio emits no change) —
   covered by URL/hook/factory tests and the production URL scenarios
   instead; it activates with the second verified provider.
2. No user-controlled ordering (by design — no meaningful choice).
3. MODIS softness at close zoom, software-GL tile latency in screenshots,
   flaky app-cluster timeouts, and Phase 8 CSP-enforcement prerequisites
   all carry over unchanged from Phase 3.
4. `requestRenderMode` still deferred; provider init still synchronous
   (generation guard documented as a prerequisite for any async future).

## 17. Modified, added, and removed files

Modified (9): `scripts/browser-smoke.mjs` (+5 scenarios, +2 hardening),
`src/components/app/SentinelApp.tsx` (imagery wiring),
`src/components/app/useAppUrlState.ts` (`baseImagery` state/sync),
`src/components/globe/CesiumEarth.tsx` (factory init, replacement,
alpha/show effects, parent-owned error, mount-clear),
`src/components/globe/EarthRenderer.tsx` (prop threading),
`src/components/panels/SettingsModal.tsx` (manager UI),
`src/components/panels/SettingsModal.test.tsx` (+5),
`src/lib/url-state.ts` (`imagery` param), `src/lib/url-state.test.ts`
(+5). Removed: none.

Added (8): `imageryLayers.ts`, `imageryLayers.test.ts`,
`cesiumImageryProviders.ts`, `cesiumImageryProviders.test.ts`,
`CesiumEarthLayers.test.tsx`, `useImageryOpacity.ts`,
`useImageryOpacity.test.tsx`, `useAppUrlState.imagery.test.tsx`
(+ this report, the checklist, and the provider reference).

## 18. Any failures and their evidence-based classification

1. **Full-suite 6 timeouts** → pre-existing contention flake (§13;
   isolated re-runs green, zero assertion failures, identities vary).
2. **First production-build attempt crashed** (`0xC0000005` during
   chunk optimization, before any emit) → environmental: no code changed
   before the retry, which exited 0 on the identical tree.
3. **First Phase 4 smoke run fully red** → invalid evidence: EADDRINUSE
   in the server log proved the run hit a stale pre-existing server, not
   the Phase 4 build; discarded and re-run after replacing the server
   (build hash verified).
4. **Intermediate smoke WebGL-branch timeout** → transient under load:
   passed on re-run against the same build; the branch is untouched by
   this phase's diff.
5. No deviations from the prompt's scope; no out-of-scope items
   implemented; no gates weakened.

## 19. Acceptance verdict

Phase 4 acceptance criteria (§20.A–G, detailed per-item in
`PHASE_4_ACCEPTANCE_CHECKLIST.md`): all mandatory items pass with cited
runtime evidence, except the full-suite timeouts which are explicitly
investigated, isolated-verified, and documented per the prompt's
flake-handling rule (never silently waived). Verdict: **COMPLETE**.

## 20. Explicit confirmation that Phase 5 was not started

No Phase 5 scope (dashboard default-flip, imagery switcher beyond this
phase, STAC/catalogue, Sentinel rendering, legacy retirement) was
implemented, scaffolded, or branched. `git status` shows only Phase 4
files; no staging or commits were performed. Awaiting explicit approval
before Phase 5.

## Regenerating evidence

`npm run build && npm run start -- -p 3100` then
`npm run smoke:browser -- --base-url http://localhost:3100 --out <dir>`.
Final evidence: `C:\Users\Simra\AppData\Local\Temp\opencode\sentinel-smoke-phase4c\`
(report.json + 13 screenshots).
Full-suite log: `C:\Users\Simra\AppData\Local\Temp\opencode\phase4-tests.log`;
sequential app-cluster log: `phase4-appcluster.log`; isolated re-runs:
`phase4-a11y.log`, `phase4-urlcluster.log`.
