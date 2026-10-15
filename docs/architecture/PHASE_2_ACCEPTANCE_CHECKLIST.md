# Phase 2 Acceptance Checklist

Verdicts: **Passed** · **Failed** · **Blocked** · **Not run**.
Evidence paths are repo-relative unless noted. No blocked item is marked passed.

## A. Dependency and compatibility

- [x] Passed — CesiumJS version is verified and pinned (`cesium: 1.146.0` exact in `package.json`; `npm view` + on-disk dist + types verified pre-install; §4 of implementation report).
- [x] Passed — Node.js 24 compatibility investigated (`engines: >=22.0.0`; install with zero engine warnings; typecheck/build/test run on v24.15.0).
- [x] Passed — Installs without unresolved blockers (`npm ls cesium` → 1.146.0).
- [x] Passed — Lockfile matches manifest (+277 additive lines, zero deletions; `git diff --stat`).
- [x] Passed — No unrelated dependency upgrades (lockfile diff contains only cesium subtree).
- [x] Passed — Three.js/R3F/Drei remain installed (untouched `package.json` entries; WebGL/WebGPU branches intact).

## B. Architecture and renderer selection

- [x] Passed — Cesium is a fourth renderer branch (`EarthRenderer.tsx` cesium branch + `CesiumEarth.tsx`).
- [x] Passed — `?renderer=cesium` selects it (unit: `webgpu.test.ts`, `EarthRenderer.test.tsx` cesium block).
- [x] Passed — Default renderer unchanged (`DEFAULT_GLOBE_MODE = 'dotted'`; default-URL test asserts empty container).
- [x] Passed — WebGL/WebGPU selections continue to work (existing + extended selector tests; branches untouched).
- [x] Passed — URL-state behavior preserved (`url-state` 16/16; renderer-preservation app test passes; invalid values still fall back).
- [x] Passed — Lazy-loaded (separate `117.*` shell + `733.*` engine chunks; default HTML has no cesium refs, production-probed).
- [x] Passed — Prop contracts preserved; one minimal optional addition (`onCoordinatePick`, documented).
- [x] Passed — Recoverable error/fallback path (alert veil + hint; imagery degradation without destroy; no silent URL rewrite).

## C. Assets and Viewer

- [x] Passed — Viewer initializes in the client (dynamic import post-`CESIUM_BASE_URL`; unit-tested with fake runtime).
- [x] Passed — Static assets served from `/cesium` (copy script; 4/4 production probes 200 with correct MIME).
- [x] Passed — Worker loading path configured (same-origin `/cesium/Workers` under existing `worker-src 'self'`; sample worker 200 `application/javascript`).
- [x] Passed — Widget CSS loads (copied + verified 200 `text/css`; imported inside the client-only chunk).
- [x] Passed — Globe renders and camera interaction verified in a real browser (gate run `sentinel-smoke/`: Viewer init, 130/130 wmts × 200, drag frame-diff, wheel zoom; screenshots reviewed during Phase 3).
- [x] Passed — Resize strategy verified (built-in behavior; 1200-width + 1600 + 430 narrow checks all show canvas == viewport; no custom observer to leak).
- [x] Passed — Cleanup works (unmount destroys once; StrictMode leaves exactly one live Viewer; tested).
- [x] Passed — StrictMode leaves no duplicates (tested).
- [x] Passed — Init failures handled visibly (module + construction failures → alert veil; tested).

## D. Imagery and interaction

- [x] Passed — Token-free imagery verified (GIBS WMTS KVP probes 200 + CORS `*` at L0–L9; no ion token anywhere; `Ion` never referenced in new code).
- [x] Passed — Default terrain needs no token (explicit `EllipsoidTerrainProvider`; verified default in installed source).
- [x] Passed — Provider failures handled honestly (imagery `errorEvent` → degraded status line; viewer survives).
- [x] Passed — GIBS allow-list discipline preserved (layer id asserted against `isAllowedLayer`; endpoint deviation documented with grid-math proof).
- [x] Passed — Geographic picking works per contract (canvas handler → ellipsoid → degrees → `isValidCoordinate`; empty/invalid picks silent; tested incl. degree conversion).
- [x] Passed — Coordinates follow app conventions (degrees, lat/lon order, `isValidCoordinate` shared with legacy code).

## E. Existing functionality

- [x] Passed — Renderer branches remain functional (selector + branch tests; view/firstrun suites pass in isolation).
- [x] Passed — APIs unchanged (no `src/app/api` or `src/server` modification; layers probe 8/8 in prod).
- [x] Passed — SWR behavior unchanged (no hook modification).
- [x] Passed — Provenance behavior unchanged (no provenance/cache modification).
- [x] Passed — Reduced motion respected (instant `setView`; no ambient rotation introduced).
- [x] Passed — Low power respected (resolutionScale 1→0.5, maxSSE 2→4, no remount; tested).
- [x] Passed — Search/layers/events/statistics continue to work (API + hook + panel suites green; 67-file non-app run fully green).

## F. Security and performance

- [x] Passed — CSP changes: none (report-only preserved byte-identical; justification + future additions documented).
- [x] Passed — No private token exposed (no ion token exists; FIRMS/AirNow untouched server-side; error messages contain no secrets).
- [x] Passed — No unrestricted tile source (single pinned layer URL + allow-list assertion; no user-supplied URLs).
- [x] Passed — Budget threshold unchanged (204,800 B).
- [x] Passed — Budget check passes (195.7 KiB; method: repo script).
- [x] Passed — Lazy chunks measured (engine 1.35 MB gzip, shell 2.3 KB gzip; reported, not hidden).
- [x] Passed — No dev-only asset paths (single `/cesium` constant; production-probed).

## G. Testing and documentation

- [x] Passed — Typecheck evaluated (clean).
- [x] Passed — Lint evaluated (clean).
- [x] Passed — Tests evaluated (22 new, all green; non-app 666/666; app-cluster flake characterized with isolated-run evidence; zero assertion regressions).
- [x] Passed — Production build evaluated (clean; routes + chunks verified).
- [x] Passed — Texture reporting evaluated (both tiers MET).
- [x] Passed — Bundle-budget validation evaluated (before/after recorded).
- [x] Passed — Manual browser verification (CDP smoke harness `scripts/browser-smoke.mjs` created; full gate run on production build passed with `hardChecksPassed: true`; evidence in `sentinel-smoke/` + report §2).
- [x] Passed — Implementation report exists (companion file).
- [x] Passed — Acceptance checklist exists (this file).
- [x] Passed — Deviations and unresolved issues documented (report §§15–17).
