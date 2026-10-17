# Phase 6 Acceptance Checklist (Stage B — approved Candidate A scope)

Verdicts: **Passed** · **Failed** · **Blocked** · **Not run**.
No blocked item is marked passed. Criteria reference the proposal's
acceptance skeleton (`PHASE_6_SCOPE_PROPOSAL.md` §16, items A1–G1) and
the report (`PHASE_6_IMPLEMENTATION_REPORT.md`, §-cited per item).
Evidence: focused suites (cdse-catalogue 16, scenes route 10,
useSceneSearch 6, cesiumFootprints 9), full suite 92 files / 891 tests
green, live route probes
(`…\AppData\Local\Temp\scenes-evidence\`), final smoke
(`…\AppData\Local\Temp\smoke-phase6-final\`, 30/30 PASS, 18
screenshots). Approval: proposal Approval record (Q1 A approved;
Q2 keyless OData; Q3 O5/O6 deferred; Q4 route approved; Q5 fallback
not triggered; Q6 standing rule).

## A. Scope and preservation (A1)

- [x] Passed — Proposal exists and was explicitly approved pre-code
  (Approval record Q1–Q6; report §2).
- [x] Passed — Implemented scope = approved §§6–12/14–16 as written;
  recorded deviations are inside the approval envelope (OData per Q2;
  caps instead of geometric simplification; file placement; panel
  priority fix — report §2).
- [x] Passed — O5/O6/O8/STAC/downloads/default-flip untouched (report
  §20; diff contains no camera/raster/credential code).
- [x] Passed — Working tree preserved: no reset/discard; only the
  approved file set changed; all Phase 6 files staged and uncommitted
  (report §3, §17).
- [x] Passed — Existing renderers/branches intact (smoke re-runs the
  dotted/WebGL/Cesium matrix; 30/30 PASS; globe suites green).

## B. Scientific integrity (B1)

- [x] Passed — Real catalogue data only: live S2 L2A + S1 GRD products
  with real names/dates/footprints (report §14); smoke searched the
  live route through real clicks and rendered 20 real rows
  (report §15).
- [x] Passed — Acquisition time (`ContentDate/Start`) labeled as
  sensed/acquisition, never live; publication time shown separately
  (report §9; panel shows "Sensed … UTC" / "Published … UTC").
- [x] Passed — Copernicus attribution present (`Contains modified
  Copernicus Sentinel data [2026]`) in payload and panel (report §9).
- [x] Passed — Missing metadata shown as missing: `online` unknown
  case, "— not reported —" publication, footprint `null` on cap
  overflow keeps the scene with metadata (report §9–§11).
- [x] Passed — Empty ≠ error ≠ unavailable distinguished (distinct
  panel states; unit-tested).
- [x] Passed — No fabricated state: malformed items skipped, envelope
  violations throw → honest STALE/UNAVAILABLE (report §6–§7);
  no rectangle substitution for missing footprints (report §11).

## C. Data contracts and reliability (C1)

- [x] Passed — Input validation tested and live-verified (bbox,
  collection, window, span, limit; exact 400 messages; report §7,
  §14).
- [x] Passed — Provider allow-lists enforced pre-fetch (forged
  collection throws; filter built from constants + validated
  numerics; encoder test-pinned to the verified probe; report §6,
  §12).
- [x] Passed — Envelope contract matches app conventions
  (`success/data/meta`, `data_status`, `cache_hit`; snake_case wire
  fields; report §8, §10).
- [x] Passed — Caching bounded and honest: TTL 900 s, SWR 1800 s,
  STALE rewrite on expired-LIVE + failure, empty UNAVAILABLE
  otherwise, no-store on failures; cold 1,587 ms → warm 40 ms with
  `"cache_hit":true` live (report §7, §10, §14).
- [x] Passed — Rate discipline: heavy class, one request per action,
  page cap 20, no polling (report §7, §12).
- [x] Passed — Failure recovery unit-tested (STALE/UNAVAILABLE
  mapping); no failed smoke step left the globe blank (smoke §15).
- [x] Passed — No secrets (keyless) and no secret exposure paths; no
  credential infrastructure added (report §12).

## D. Application integration (D1)

- [x] Passed — No new global store: committed query + SWR key +
  parent-owned props only (report §5, §8).
- [x] Passed — Controls keyboard-accessible: native buttons with
  `aria-pressed`/`aria-label`s; panel reuses established
  focus/close patterns; full a11y suite green (pre-existing Radix
  jsdom noise characterized at HEAD, report §13).
- [x] Passed — Geographic correctness: lon/lat order preserved,
  `fromDegrees(lon,lat,0)`, parse/entity caps, pick mapping via
  entity id → owner (report §11; unit-tested).
- [x] Passed — Cesium lifecycle safe: no Viewer rebuilds; sync on
  `[footprints, selectedSceneId]`; disposal on unmount/StrictMode;
  one Viewer in every smoke scenario (report §8, §15).
- [x] Passed — Footprints lazy-only: module imported solely by the
  Cesium branch; panel dynamic chunk (report §16).
- [x] Passed — Pick-routing contract preserved: observation →
  footprint → ellipsoid readout; empty-globe readout unchanged
  (report §8; smoke clicked safely on every branch).
- [x] Passed — No new unhandled browser exceptions (final smoke: 0;
  report §15).

## E. Security and performance (E1)

- [x] Passed — New-route validation complete (400 matrix; nothing
  forwarded; report §7).
- [x] Passed — No user input reaches URLs beyond allow-listed
  constants + validated numerics; single allow-listed upstream origin
  (report §12).
- [x] Passed — CSP unchanged (report-only, judged from served
  headers in smoke; 0 enforcing; report §15).
- [x] Passed — Initial JS within 200 KiB gzip: **204,168 / 204,800 B
  PASS** (report §16); no stop-rule decision needed; panel provably
  lazy.
- [x] Passed — No new dependencies, env vars, infra, or config
  changes (report §6, §12).
- [x] Passed — Rate/abuse posture intact (heavy class + TTL + page
  cap; report §7).

## F. Verification (F1)

- [x] Passed — Typecheck clean; lint clean (plus lint-driven fixes
  applied, report §13).
- [x] Passed — New focused tests green (41 tests in 4 suites; report
  §13).
- [x] Passed — Full suite documented: 92 files / 891 green; known
  pre-existing Radix unhandled-error noise and one contention flake
  re-run green; nothing weakened (report §13).
- [x] Passed — Production build green; route emitted as dynamic
  (`ƒ /api/v1/scenes`); textures both tiers MET (report §16).
- [x] Passed — Bundle gate PASS with recorded headroom (632 B; report
  §16).
- [x] Passed — Production smoke covers the full flow with live data
  and reviewed screenshots (footprint quad on globe; LIVE/CACHED
  chips; expanded detail; report §15).
- [x] Passed — Live external re-verification recorded (entry probes +
  final route probes; Q5 fallback not needed; report §4, §14).
- [x] Passed — Environmental limits distinguished from code failures
  (501-tally root-cause → precise gate; server death; pre-existing
  jsdom noise; report §15, §18).

## G. Documentation and handoff (G1)

- [x] Passed — Implementation report complete
  (`PHASE_6_IMPLEMENTATION_REPORT.md`, 20 sections + evidence paths).
- [x] Passed — Acceptance checklist contains evidence (this file).
- [x] Passed — Migration backlog updated (Phase 6 status annotation
  with delivered/verified/deferred facts).
- [x] Passed — Provider reference updated (new CDSE catalogue section;
  "explicitly unimplemented" list corrected — catalogue discovery now
  supported via keyless OData; rasters/downloads/auth STAC still
  not).
- [x] Passed — Working-tree status reported accurately (staged,
  uncommitted, exact list; report §3, §17).
- [x] Passed — Phase 7 not started (no rendering/raster/credential
  code; O5/O6 remain deferred; report §20).

**Phase 6 acceptance verdict: all criteria satisfied (pending the
user's independent manual verification pass, deferred by explicit
instruction).**
