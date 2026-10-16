# Phase 5 Implementation Report — Scientific Observation Integration (Stage B)

Spec: `docs/prompts/architecture/PHASE_5_SCIENTIFIC_OBSERVATION_INTEGRATION.md`.
Scope proposal: `docs/architecture/PHASE_5_SCOPE_PROPOSAL.md` (Stage A;
binding Stage B decisions recorded in its Approval record — Q1 approve
O1–O4, Q2/Q3 defer O5/O6, Q4 `BillboardGraphics`, Q5 defer STAC/flip,
Q6 escalation ladder).
Predecessors: Phase 1–4 reports, checklists, and
`IMAGERY_LAYER_PROVIDER_REFERENCE.md` (unchanged — no provider change).
Environment: Windows, Node v24.15.0, Next.js 15.5.27, `cesium@1.146.0`
(exact), headless Microsoft Edge via `scripts/browser-smoke.mjs`
(extended with 3 Phase 5 scenarios).

## 1. Executive summary

The approved O1–O4 scope is delivered: the Cesium globe now renders the
active layer's real observations as severity-colored billboard entities
with hover-card and click-to-detail parity, reusing the existing SWR →
props → `selectEvent` pipeline untouched. No new API routes, data
sources, dependencies, credentials, or camera behavior. The initial
JavaScript budget is byte-identical (198.1 KiB), Cesium stays fully
lazy, and the extended production smoke suite passes 25/25 — including a
real canvas click that opened a live event's detail and a deep-linked
live event resolving on the Cesium path. O5, O6, STAC, and the
default-renderer flip remain deferred by explicit decision. Q6 step 1
(lifecycle optimization) sufficed — no cap or fallback was needed.

## 2. Approved scope and authorization evidence

Stage B executed only after the user's explicit authorization message
approving Candidate A (O1–O4) with six binding decisions (Q1–Q6),
recorded verbatim in the proposal's Approval record before any code was
touched. Implemented scope = proposal §§6–7, 9–12 (entity sync,
severity coloring, hover/click parity, existing pipeline), minus
explicitly deferred O5/O6. No expansion occurred: the diff contains no
API, server, hook, URL-state, imagery, camera, or provider changes.

## 3. Initial working-tree state

Branch `main`, HEAD `8ad1ae3` (Phase 4 commit — the uncommitted Phase 4
work was committed between sessions; verified via `git show --stat` to
contain exactly the Phase 4 deliverables). `git status --short` at Stage
B entry: two untracked docs only (Phase 5 prompt + Stage A proposal).
No modified files. Nothing was reset, discarded, staged, or committed
at any point; the final tree holds only the Stage B files below, all
uncommitted.

## 4. Baseline verification results (pre-change, re-measured)

| Check | Result |
|---|---|
| Typecheck / lint | clean |
| Full tests | 801/825 — 13 `Test timed out in 5000ms` in the `SentinelApp.*` cluster, 0 assertion failures; affected files re-run with `--no-file-parallelism` (43/44, then the single remaining timeout re-run alone 4/4 green) → pre-existing contention flake on the unmodified tree |
| Production build | 2 attempts crashed in V8 (`0xC0000005`, then `0x80000003`) during type-check/static phases + 1 spawn failure, all on the unmodified tree → environmental (8 GB RAM, ~2.9 GB free, no stray processes); existing Phase 4 `.next` verified current via `bundle:check` |
| Textures | both tiers MET |
| Bundle | 202,809 B gzip (198.1 KiB) PASS |
| Smoke | Phase 4 evidence (22/22) stands on the identical tree; not re-run pre-change |

## 5. Backlog item addressed

Backlog Phase 4-section items **O1–O4** (observation sync + interaction
parity), carried open by the Phase 4 report: O1 entity sync, O2 hover
anchor, O3 click→`selectEvent`, O4 drag discrimination + hover throttle.
O5 (auto-rotate), O6 (home/reset), O7 (STAC), O8 (rasters), and the
default flip are NOT addressed — deferred by binding decision (see §17).

## 6. Architecture and data flow

Unchanged pipeline, one new last mile (proposal §9 as approved):

```
useLayerData → SentinelApp → EarthRenderer (untouched threading)
  → CesiumEarth → NEW cesiumObservations.ts (lazy chunk only)
```

- `cesiumObservations.ts`: pure sync/pick/dispose + sprite factory. The
  Cesium namespace arrives as a parameter (Phase 4 factory seam pattern);
  `cesium` imports are type-only. Id-keyed `Map<string, Entity>` +
  `Map<string, DataPoint>` state (never serialized). `sync` diffs by
  stable `point.id` (add unknown, remove vanished, replace on
  lat/lon/severity change, keep untouched stable — zero churn on
  identical re-renders), truncates deterministically at
  `OBSERVATION_ENTITY_CAP` (2000, test-pinned `=== MARKER_CAPACITY`).
- `CesiumEarth`: previously voided `dataPoints`/`onMarkerClick`/
  `onMarkerHover` are now live (via the existing `callbackRef` mirror);
  `_activeLayer`/`_isRotating`/`_sunDirection` stay voided with updated
  comments (O5 deferred, sun out of scope). New data effect syncs on
  every `dataPoints` change without touching the Viewer. Mount creates
  one shared sprite + empty sync state + initial sync; unmount disposes
  entities, cancels hover rAF, destroys the handler, clears hover, nulls
  refs (StrictMode-safe).
- Pick routing: `LEFT_DOWN`/`LEFT_UP` with the legacy 6 px rule (a drag
  is never a click — replaces bare `LEFT_CLICK`; taps behave
  identically); entity hit → `onMarkerClick(point)` (= `selectEvent`);
  entity miss → existing `pickEllipsoid` coordinate readout (Phase 2
  contract preserved). Hover: `MOUSE_MOVE` rAF-throttled (≤1 pick/frame,
  WebGL parity), hit → `onMarkerHover(point)`, miss → `null`, cursor
  `pointer`/`grab` with restore on cleanup/leave (both branches' parity).
- No new store, routes, envelope, URL params, or state system.

## 7. Provider details and verification

No new provider. All markers come from the eight existing validated
routes through the existing envelope (USGS/EONET/FIRMS/Open-Meteo/AirNow
unchanged). Entity positions originate from API payload coordinates
gated by the existing `isValidCoordinate` discipline
(`filterValidPoints`); no user input, URLs, or arbitrary geometry enter
the scene. `IMAGERY_LAYER_PROVIDER_REFERENCE.md` required no update.

## 8. API and data-contract changes

**None.** No routes added or modified; response envelopes, validation,
pagination (`limit: 500` client), `data_status` semantics, and error
model all untouched. `DataPoint` consumed as-is (id/lat/lon/severity/
timestamp + optionals).

## 9. Provenance and temporal semantics

Unchanged end to end. Markers carry provider `timestamp`
(observation time); envelopes carry `data_status` + cache bits; the
existing detail panel renders both identically regardless of branch —
proven in production (screenshot `14-cesium-event-detail.png`: M3.1
Puerto Rico with magnitude, depth, 21h-ago time, USGS source, provider
details, `LIVE` detail fetch alongside `CACHED` layer chips). Missing
metadata stays missing; simulated fallbacks keep `SIMULATED` labels;
the GIBS mosaic claim is untouched. Time concepts (§5.1) remain
distinguished; nothing is presented as real-time beyond provider
evidence.

## 10. Caching and freshness behavior

Reused, not reinvented: SWR bounds, per-layer TTLs,
stale-while-revalidate, honest `STALE`/`UNAVAILABLE` + Retry, and
`dropPendingEventFromUrl` all unchanged. Entity-layer rules: outage →
last-good entities stay until fresh data arrives (failed refresh never
blanks the globe, never presented as current); empty result → empty
entity set + existing empty-panel state (zero observations ≠ error);
malformed points skipped pre-entity; cap overflow keeps the first
`MARKER_CAPACITY` deterministically with legacy-identical ordering.

## 11. Geographic correctness

- CRS/order: `Cartesian3.fromDegrees(lon, lat, 0)` — app lat/lon
  convention preserved (unit-asserted: lon 139.6/lat 35.6 land
  correctly); `CLAMP_TO_GROUND` placement on the ellipsoid (verified
  member of the installed `HeightReference`).
- Identity is `point.id` (never indices, labels, or URLs).
- Occlusion correct in production (screenshot: no far-side bleed).
- Invalid/NaN/out-of-range coordinates never become entities (tested:
  lat 500, lon 181, NaN); matching legacy validity behavior exactly
  (see §parity below). No antimeridian/polar special-casing needed —
  points, not polygons (footprints remain O7/deferred).

## 12. Parity differences (inspected pre-implementation, documented)

From direct reads of `DottedEarth.tsx`, `Globe.tsx`, `markerSync.ts`,
and `useEventSelection.ts`:

| Behavior | Dotted / WebGL | Cesium (this phase) |
|---|---|---|
| Marker set | all `filterValidPoints` (no severity filter) | identical (verified: no divergence — severity filter affects panels on every branch, never globe markers) |
| Colors | `SEVERITY_COLORS` exact | identical vocabulary, unit-asserted per severity |
| Sizes | fixed (3.2 px dots / fixed cones; magnitude ignored) | fixed uniform billboards (magnitude ignored); world-attenuated like WebGL (dotted dots are screen-fixed — inherent renderer difference, documented) |
| Drag rule | 6 px both | 6 px exact (test-pinned; replaces bare `LEFT_CLICK` — taps identical, drags now suppressed like legacy) |
| Hover | per-move (dotted) / rAF-throttled (WebGL); miss clears; cursor pointer/grab + restore | rAF-throttled (WebGL parity); miss clears; cursor + restore incl. unmount |
| Click hit | `onMarkerClick` → `selectEvent` | identical (`selectEvent` untouched incl. abort/race safety + point-data fallback) |
| Click miss | nothing | **coordinate readout (intentional, preserved Phase 2 contract)** |
| Hover card | cursor-following `MarkerHoverCard` (self-positioning) | same component, zero anchor work needed |
| Auto-rotate / sun | honored / tracked | **no-ops (O5 deferred / out of scope — explicit, not silent)** |

## 13. Security review

No secrets, no new origins, no CSP change (report-only, header-judged
in smoke), no unsafe HTML, no arbitrary URLs, no new fetching of any
kind (client renders data it already holds), allow-lists and the imagery
factory untouched, no credentials or env changes, server-only key
handling untouched. No SSRF surface (no new server requests).

## 14. Tests and actual results

New: `cesiumObservations.test.ts` (15: validation, cap + determinism,
severity colors, position convention, id-diff/no-churn, replace-on-
change, empty, destroyed-Viewer, dispose, pick hit/miss/unknown/throw,
sprite fallback, capacity + drag-rule pins) and
`CesiumEarthObservations.test.tsx` (9: mount sync, invalid skip +
empty, id-diff update, 500-point payload, entity click → exact point
(no readout fall-through), miss → readout (no selection), rAF hover +
clear + cursor, unmount disposal + hover clear, StrictMode single live
Viewer + single entity set). Modified: `CesiumEarth.test.tsx` picking
suite reworked for down/up (+ new drag-suppression test).

Focused: all globe/app suites green (75/75 across 7 files at last
focused run; typecheck + lint clean — typecheck caught and fixed one
real defect pre-commit: an undefined threshold import, plus two test
mock typings). Full suite: **850 tests — 845 passed, 5 failed, 0
assertion failures** (all 5 `Test timed out in 5000ms` in the known
`SentinelApp.*` cluster); sequential re-run **44/44 green** (exit code
from the 5 pre-existing jsdom/Radix `inlineSize` unhandled errors, as in
every baseline). Classification: pre-existing contention flake — varying
identities across runs, isolated greens, zero assertions; no test
weakened, skipped, or retimed.

## 15. Production verification

Fresh `next start` from the Stage B build (page-chunk hash verified;
stale-port check clean). Extended harness: **25/25 PASS**
(`sentinel-smoke-phase5/`):

- All 22 legacy + Phase 4 checks intact (dotted, WebGL, Cesium init,
  drag/zoom/resize, round-trip 1 Viewer, grid, imagery selection,
  invalid-imagery recovery, manager UI, opacity persistence, widths,
  health).
- **P5a** observations boot with the default layer (Viewer ready 5.7 s
  with ~500 entities — comparable to 4.3–6.6 s baselines without
  entities; no perf signal); screenshot `12-cesium-observations.png`
  reviewed: ~500 severity-colored markers in real geographic
  distribution, correct occlusion, sane sizes, honest CACHED/USGS
  provenance.
- **P5b** real canvas click: `detail=true`, 1 Viewer, no veil, 0 new
  exceptions — a center click **hit a live marker and opened its
  detail** (stronger than the safety disjunction: actual click-to-detail
  in production).
- **P5c** deep-linked live event `pr71536748` (id fetched at runtime
  from the prod API, not a fixture) resolves to full detail on the
  Cesium path; screenshot `14-cesium-event-detail.png` reviewed
  (magnitude/depth/time/location/source + provider details; markers
  render independently of tile streaming).
- Network/CSP: 324/324 GIBS × 200; 0 exceptions (only the known
  THREE.Clock deprecation warning); CSP report-only via served headers;
  73 Cesium asset requests × 200/304.

## 16. Bundle and performance measurements

- Initial JS: **202,809 B gzip (198.1 KiB) — PASS, byte-identical to
  baseline** (all entity code in the lazy chunk; prop threading is
  primitives + stable callbacks). Headroom still 1,991 B.
- Lazy isolation preserved (default HTML has no Cesium refs; observation
  module imported only by `CesiumEarth`).
- Textures: both tiers MET (unchanged paths).
- Q6 verdict: step 1 sufficed — id-diffed updates (no rebuilds),
  rAF-throttled hover, 500-entity production run with baseline-
  comparable timing. No low-power cap, no point-primitive fallback, no
  functionality reduction. Steps 2–3 not triggered.

## 17. Files added, modified, or removed

Added (3): `src/components/globe/cesiumObservations.ts`,
`src/components/globe/cesiumObservations.test.ts`,
`src/components/globe/CesiumEarthObservations.test.tsx` (+ this report,
checklist; proposal updated with the Approval record pre-implementation).
Modified (3): `src/components/globe/CesiumEarth.tsx` (entity wiring,
down/up/hover handlers, sync effect, disposal),
`src/components/globe/CesiumEarth.test.tsx` (picking-contract rework +
drag test), `scripts/browser-smoke.mjs` (+3 scenarios, header docs).
Removed: none. No API/server/hook/URL-state/imagery/camera/provider
files touched.

## 18. Failed, blocked, or unrun checks

- Full-suite 5 timeouts → investigated per the flake rule (sequential
  44/44 green, zero assertions, varying identities) — documented, not
  waived.
- Baseline build attempts crashed in V8 on the unmodified tree
  (environmental: 8 GB RAM); Stage B build exited 0 first try.
- No blocked or unrun mandatory checks. No gates weakened (one real
  defect found by typecheck was fixed, not suppressed).

## 19. Acceptance verdict

O1–O4 delivered with cited runtime evidence for every behavior;
proposal acceptance items A1–G1 (checklist
`PHASE_5_ACCEPTANCE_CHECKLIST.md`) all pass. Verdict: **COMPLETE**.

## 20. Confirmation that Phase 6 was not started

No STAC, catalogue, footprint, ingestion, rendering, or database work
exists anywhere in the tree. O5, O6, STAC, and the default-renderer flip
remain deferred by binding decision. `git status` shows only Stage B
files; nothing staged or committed. Awaiting explicit approval before
Phase 6.

## Regenerating evidence

`npm run build && npm run start -- -p 3100` then
`npm run smoke:browser -- --base-url http://localhost:3100 --out <dir>`.
Final evidence: `C:\Users\Simra\AppData\Local\Temp\opencode\sentinel-smoke-phase5\`
(report.json + 16 screenshots). Suite logs: `phase5-tests.log`
(845/5-timeout), `phase5-cluster.log` (44/44).
