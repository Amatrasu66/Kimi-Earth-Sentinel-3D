# Phase 7 Acceptance Checklist (Sentinel scene rendering — tiled imagery)

Verdicts: **Passed (static)** · **Not run** · **Failed** · **Blocked**.
This phase was implemented under an explicit constraint: the implementing
agent executed **no repository tooling** (no typecheck/lint/tests/build/
bundle/smoke). Therefore "Passed (static)" marks only facts provable by
tree inspection (files, contents, greps); anything requiring execution is
**Not run** and must not be read as satisfied. Criteria reference the
backlog ("Phase 7 — Sentinel scene rendering (tiled imagery)" scope and
acceptance clause) and the report
(`PHASE_7_IMPLEMENTATION_REPORT.md`, §-cited per item). Pre-code
authorization is the Phase 7 working constraint set + the Phase 6 Q2
keyless standing rule; the provider substitution is recorded in report §2
and the backlog Phase 7 status entry. Evidence: live read-only provider
probes (report §3); authored suites (report §9); code tree (report §5).

## A. Scope, authorization, and preservation

- [x] Passed (static) — Implemented scope = backlog objective/scope as
  constrained: per-scene layer add/remove, tile service (never raw
  products), acquisition labelling, key secrecy server-side, attribution
  display (report §2, §4, §7).
- [x] Passed (static) — Provider substitution recorded with rationale and
  live evidence; no credentialed or infrastructural path was silently
  introduced (report §2–§3; backlog status entry).
- [x] Passed (static) — No proxy route, no new backend/infrastructure;
  no dependency added; CSP untouched; no credential/token anywhere new
  (report §2, §5, §8).
- [ ] Not run — Backlog task "opacity" and "cost/quota monitoring note":
  opacity deliberately not delivered (recorded, report §2.6);
  quota/cost note n/a on the keyless path with bounds recorded (report
  §2.7); heavy-class rate-limit review carried to Phase 8 (report §8).
- [x] Passed (static) — Out-of-scope items untouched: downloads, NDVI,
  processing, Sentinel Hub, three.js removal, O5/O6, renderer flip;
  Phase 8 not started (report §12).
- [x] Passed (static) — Working tree preserved: no git operations; all
  Phase 7 files present and uncommitted (report §5).

## B. Scientific integrity and provenance (acceptance clause)

Backlog acceptance: "a selected S2 scene renders correctly georeferenced
with acquisition label; quota failure degrades to labelled state, never
blank."

- [ ] Not run — "Renders correctly georeferenced": descriptor bbox
  (`[w,s,e,n]`, `Rectangle.fromDegrees`) + WebMercator XYZ template +
  Cesium `WebMercatorTilingScheme` implemented and unit-authored
  (report §4, §7, §9); **rendering never executed in a browser** —
  georeferencing is asserted by construction, not observed.
- [ ] Not run — Acquisition label in the raster context: sensed time is
  shown from the Phase 6 scene record and the descriptor carries
  rendering/resolution semantics (report §7); browser confirmation
  pending.
- [ ] Not run — Failure degradation ("never blank"): resolve-failure and
  tile-failure states are implemented with distinct alerts, previous-map
  retention, and capped retries (report §4, §7); route honesty mapping
  (STALE/UNAVAILABLE, no fabrication) is authored but unexecuted; no
  outage was (or could honestly be) induced (report §10).
- [x] Passed (static) — No fabricated state anywhere: identity mismatch
  is a failure (never a swapped raster); L1C reports honest
  `unsupported` with the missing-collection reason; antimeridian-
  crossing footprints are rejected rather than misplaced; preview
  labelled as provider preview, never stretched onto the globe
  (report §4, §6, §7).
- [x] Passed (static) — Attribution + citation present: PC rendering
  credit and Copernicus disclosure in payload and panel (report §6, §7;
  provider reference §1b).
- [x] Passed (static) — Temporal honesty: raster pixels are archive
  product data; nothing labels them live; acquisition date governs
  labelling (report §4).

## C. Data contracts and reliability

- [x] Passed (static) — Contract is scene-GUID-only: `parseSceneId`
  strict GUID guard; no names/URLs/bboxes/styles travel from the client;
  descriptor is the only thing that can become a raster URL (report §8).
- [ ] Not run — 400 validation matrix (missing/malformed/injection-
  shaped) with zero upstream calls: authored, unexecuted (report §9).
- [ ] Not run — Cache behavior: positive 900 s / negative 300 s TTLs,
  cache-key normalization, STALE rewrite preserving `fetched_at`,
  no-store on failures: authored, unexecuted (report §9).
- [x] Passed (static) — Envelope conventions preserved
  (`success/data/meta`, `data_status`, `cache_hit`, snake_case):
  mirrors the Phase 6 scenes route (report §6).
- [x] Passed (static) — Provider request shapes pinned to verified
  probes byte-for-byte in code + authored tests (items-not-search,
  unquoted GUID filter, exact rendering queries) (report §3, §6, §9).
- [ ] Not run — Rate/abuse posture under execution (heavy-class decision
  for the new route): carried to Phase 8 (report §8).

## D. Application integration

- [x] Passed (static) — Cesium lifecycle contract held: no Viewer
  rebuild; effect keyed on descriptor identity; add-then-remove; previous
  map retained on failure; teardown drops listener/refs; graticule
  re-raised after attach (report §4).
- [x] Passed (static) — Lazy-chunk discipline: factory uses type-only
  cesium imports and lives in the Cesium chunk only; initial graph gains
  only types + hook + app wiring (report §7; budget re-measure is F.)
- [x] Passed (static) — Toggle accessibility: native button,
  `aria-pressed`, stable harness id; state defaults off; session-only
  (report §7; provider reference §3).
- [x] Passed (static) — Error surfaces separated: resolution failure vs
  tile failure are distinct, parent-owned, never conflated (report §7).
- [ ] Not run — a11y suite on the new control; no-Viewer-leak under
  toggle swaps; pick-routing regression (all require execution;
  report §10).
- [ ] Not run — Browser pass: toggle → raster over AOI → swap/toggle-off
  → CSP report-only PC-host violations observed (expected, matching
  GIBS) (report §10, §12).

## E. Security and performance

- [x] Passed (static) — Injection boundary: GUID regex before any URL
  construction; server-built-only PC filter text; slug-guarded item id
  (report §6, §8).
- [x] Passed (static) — No credentials/tokens introduced; `token=` URLs
  rejected client-side by validation before any Cesium object exists
  (report §8).
- [x] Passed (static) — CSP unchanged; PC host recorded for the Phase 8
  enforcement decision, not silently allowed (report §8; provider
  reference §1b).
- [x] Passed (static) — No new dependencies, env vars (PC timeout is
  optional with default), or config changes (report §5).
- [ ] Not run — Initial-JS budget re-measure. Phase 6 close:
  204,168 / 204,800 B gzip (headroom 632 B); the new hook/types/app
  wiring land in the initial graph — **re-run the bundle check before
  shipping** (report §10, §12).
- [ ] Not run — No-retry/no-polling behavior under real network faults
  (code present; unexecuted) (report §7).

## F. Verification (instrumented checks — all Not run)

- [ ] Not run — `npm run typecheck` (largest unknown: new cross-boundary
  types) (report §12).
- [ ] Not run — `npm run lint`.
- [ ] Not run — `src/server/providers/scene-raster.test.ts` (18 cases
  authored) (report §9).
- [ ] Not run — `src/app/api/v1/scenes/raster/route.test.ts` (8 cases
  authored) (report §9).
- [ ] Not run — `src/components/globe/cesiumSceneRaster.test.ts`
  (10 cases authored) (report §9).
- [ ] Not run — Full suite (Phase 6 close: 92 files / 891 tests) —
  regression status unknown.
- [ ] Not run — Production build + route emission + textures check.
- [ ] Not run — Bundle gate (see E.).
- [ ] Not run — Live route probes: `renderable` + LIVE +
  `cache_hit:true` on repeat; 400 on malformed id (report §12 step 5).
- [ ] Not run — Browser smoke (existing harness untouched; optional
  phase-7 scenario not added) (report §12 step 7).
- [x] Passed (static) — Live provider prerequisites re-verified
  read-only: keyless 200 PNG tiles; exact-name PC filters (L2A + S1);
  `/search` 504 avoided; L1C absent; CDSE unquoted-filter behavior
  (report §3).

## G. Documentation and handoff

- [x] Passed (static) — Implementation report complete (12 sections +
  evidence/regeneration tail; "tests were not run" stated up front and
  in §9–§10).
- [x] Passed (static) — Acceptance checklist (this file) contains honest
  verdicts with pointers.
- [x] Passed (static) — Backlog updated: Phase 7 status entry records
  substitution, delivered pieces, verification status, and not-run
  checks; Phase 8 entry untouched.
- [x] Passed (static) — Provider reference updated: §1b (dynamic raster
  provider), §2 ordering note, §3 session-state note, §4 unimplemented
  list trimmed honestly, §5 dynamic-provider note.
- [x] Passed (static) — Tree status reported accurately (uncommitted;
  exact file list in report §5).
- [x] Passed (static) — Phase 8 not started; O5/O6, downloads, NDVI,
  Sentinel Hub, renderer flip remain deferred/out of scope (report §12).

**Phase 7 verdict: IMPLEMENTED — VERIFICATION PENDING.** All static
criteria are satisfied; every runtime/execution criterion is Not Run by
constraint. The phase may only be marked complete after the user's
verification pass (ordered checklist in
`PHASE_7_IMPLEMENTATION_REPORT.md` §12) executes typecheck, lint, the
three authored suites, full suite, build, bundle gate, live route probes,
and the browser pass — with special attention to the 632 B budget
headroom (E.) and browser CORS/CSP behavior for the Planetary Computer
host (D., E.).
