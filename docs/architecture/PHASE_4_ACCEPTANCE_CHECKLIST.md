# Phase 4 Acceptance Checklist

Verdicts: **Passed** · **Failed** · **Blocked** · **Not run**.
No blocked item is marked passed. Evidence: focused suites
(`imageryLayers`, `useImageryOpacity`, `cesiumImageryProviders`,
`CesiumEarthLayers`, `useAppUrlState.imagery`, `SettingsModal`,
`url-state`, `CesiumEarth`, `cesiumConfig`, `EarthRenderer`), full-suite
log (`phase4-tests.log`: 813/825, 6 timeouts characterized) with isolated
re-runs (`phase4-a11y.log` 17/17, `phase4-urlcluster.log` 23/23), final
smoke evidence `sentinel-smoke-phase4c/` (regenerate with
`npm run smoke:browser -- --base-url http://localhost:3100 --out <dir>`).
All criteria reference `PHASE_4_IMAGERY_LAYER_MANAGER.md` §20.A–G.

## A. Authorization and preservation

- [x] Passed — Phase 3 acceptance gate verified (report + checklist read;
  all §§20.A–G passed; Phase 2 browser gate documented passed; user
  authorization explicit; report §2).
- [x] Passed — Initial working-tree state recorded and existing changes
  preserved (branch `main` @ `dd18093`; one pre-existing untracked prompt
  doc; no reset/discard/stage/commit; report §3).
- [x] Passed — All renderer branches remain functional (selector +
  branch tests green; smoke: dotted, webgl, cesium all render).
- [x] Passed — Dotted renderer remains the default (`DEFAULT_GLOBE_MODE`
  untouched; smoke `default renderer renders` PASS; `13-default-dotted.png`
  reviewed).
- [x] Passed — Existing API, SWR, URL-state, marker, picking, and camera
  contracts intact (no `src/app/api`/`src/server`/hook changes; picking +
  fly-to suites green; legacy URLs serialize byte-identically).

## B. Layer architecture

- [x] Passed — Typed registry implemented (`imageryLayers.ts`: roles,
  stable ids, defaults, attribution, temporal notes, limitations; 14
  registry tests green).
- [x] Passed — Stable layer IDs and validated state (`resolveBaseLayerId`,
  `parseImageryUrlValue`, opacity validators; URL + storage suites green).
- [x] Passed — Serializable metadata separated from runtime Cesium
  objects (registry holds no Viewer/layer/provider/DOM instances;
  factory-test asserts construction only from constants).
- [x] Passed — Only verified, supported layers exposed (exactly
  `gibs-modis-truecolor` + `cesium-graticule`; no placeholder switches).
- [x] Passed — Provider initialization and cleanup are safe
  (`CesiumEarthLayers` suite: factory-built init, add-then-remove,
  bottom pin, orphan-free sequential switches, StrictMode Viewer count
  in the existing suite).

## C. User functionality

- [x] Passed — Base imagery selection works for every exposed choice
  (single verified choice radiogroup checked; `?imagery=` production
  scenario PASS; URL/hook/factory suites green).
- [x] Passed — Supported overlay visibility controls work (existing grid
  switch preserved + suite green; production screenshot shows graticule
  rendered over imagery with pref on).
- [x] Passed — Opacity controls work for supported layers (both sliders
  labelled/report 0–1; live-`alpha` effects without rebuild; production
  screenshot shows faded base at 25% + persisted 25/75 restored).
- [x] Passed — Ordering works if exposed (not exposed by design:
  `supportsReordering: false` everywhere with recorded rationale; base
  pinned via `lowerToBottom`, verified in test).
- [x] Passed — Provider errors are visible and recoverable (failure
  preserves previous layer; Settings `role=status` + diagnostics detail;
  recovery clears; suites + production invalid-param scenario green).
- [x] Passed — Attribution and temporal semantics are accurate (GIBS
  credit in provider + UI; daily-composite/not-live wording in registry,
  UI, reference; screenshots reviewed).
- [x] Passed — Settings and URL-state restoration work as documented
  (grid pref + opacities survive reload in production; `?imagery=`
  restores; unknown ids canonicalize away).

## D. Accessibility and lifecycle

- [x] Passed — Controls are keyboard-operable and labelled (native radio
  + ranges, `aria-labelledby`/`htmlFor`, `aria-valuetext`, failure
  `role=status`; modal suites green incl. mobile Sheet branch).
- [x] Passed — Responsive layout verified (1600/1200/430 canvas tracking
  in production; tab scroll container; screenshots `12-cesium-narrow.png`
  + manager shots reviewed).
- [x] Passed — Repeated interactions do not create duplicate Viewers or
  layers (round-trip = 1 Viewer; re-select no-op; sequential switches
  leave overlay + latest base only; layer-ops step = 1 Viewer).
- [x] Passed — Asynchronous failures are handled (sync construction —
  no unhandled paths; tile errors degrade; switch failures preserve +
  report; teardown-during-replacement drops orphans).
- [x] Passed — Reduced-motion and low-power behavior remain correct
  (mappings untouched; suites green; no new render loop).
- [x] Passed — No new unhandled browser exceptions (production: 0; only
  the known THREE.Clock deprecation warning).

## E. Security and provenance

- [x] Passed — No client-side secrets added (registry asserted free of
  credential-shaped content and URLs).
- [x] Passed — GIBS allow-list preserved (`isAllowedLayer` assertions;
  factory endpoint is the pinned constant).
- [x] Passed — No arbitrary user-controlled provider URLs (forged ids
  throw before construction; invalid `?imagery=` never fetches).
- [x] Passed — CSP unchanged unless separately authorized (report-only,
  header-judged in production; no new origins).
- [x] Passed — Provider attribution and temporal semantics documented
  (registry + UI + `IMAGERY_LAYER_PROVIDER_REFERENCE.md`).
- [x] Passed — No fabricated scientific data or availability claims
  (single-provider honesty; limitations stated; `data_status` untouched).

## F. Quality and performance

- [x] Passed — Typecheck passes (`npm run typecheck` clean).
- [x] Passed — Lint passes (`npm run lint` clean).
- [x] Passed — New focused tests pass (43 new; 103/103 across the 9
  affected files).
- [x] Passed — Full tests pass or deviations are explicitly investigated
  and documented (813/825; 6 timeouts characterized as pre-existing
  contention with isolated green re-runs and zero assertion failures;
  report §13/§18).
- [x] Passed — Production build passes (exit 0; one transient
  `0xC0000005` attempt classified environmental with identical-tree
  retry evidence).
- [x] Passed — Texture and asset checks pass (both tiers MET; Cesium
  assets 60/60 × 200/304 in production).
- [x] Passed — Initial JavaScript gzip budget remains within 200 KiB
  (202,809 B / 198.1 KiB PASS, +2,071 B documented).
- [x] Passed — Cesium remains lazy-loaded (shell+factory lazy chunk;
  engine raw byte-identical; default HTML has no Cesium refs).

## G. Browser verification and documentation

- [x] Passed — Production browser smoke suite passes all mandatory
  scenarios (22/22 in `sentinel-smoke-phase4c/`, incl. 5 new Phase 4
  scenarios; invalid stale-server run discarded, not salvaged).
- [x] Passed — Network and CSP results are correctly classified
  (323/323 GIBS × 200; header-based CSP judgement; no inference from
  single tiles).
- [x] Passed — Phase 4 implementation report is complete
  (`PHASE_4_IMPLEMENTATION_REPORT.md`, 20 sections).
- [x] Passed — Acceptance checklist contains evidence for every status
  (this file).
- [x] Passed — Provider reference is complete
  (`IMAGERY_LAYER_PROVIDER_REFERENCE.md`).
- [x] Passed — Migration backlog is updated (Phase 4 section appended;
  history preserved).
- [x] Passed — No Phase 5 implementation has begun (diff contains only
  Phase 4 files; report §20).

**Phase 4 acceptance verdict: all criteria satisfied.**
