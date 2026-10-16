# Phase 5 Scope Proposal — Scientific Observation Integration (Stage A)

Spec: `docs/prompts/architecture/PHASE_5_SCIENTIFIC_OBSERVATION_INTEGRATION.md`
(Stage A only — no source code was modified, no dependencies installed, no
feature implemented; the only write in this stage is this proposal).
Status: **APPROVED FOR STAGE B — binding decisions recorded below (user
authorization). O1–O4 only. O5, O6, STAC, and the default-renderer flip
remain deferred and separately gated. Phase 6 not started.**

## Approval record (binding Stage B decisions)

Recorded from the user's explicit Stage B authorization:

1. **Q1 — APPROVED.** Candidate A, backlog items O1–O4: Cesium
   observation markers, severity coloring, hover-card parity, and
   click-to-detail parity using the existing SWR → props → `selectEvent`
   pipeline.
2. **Q2 — DEFER O5.** Auto-rotate parity deferred (Settings toggle
   remains a no-op on the Cesium path; documented limitation, not
   silent breakage).
3. **Q3 — DEFER O6.** Home/reset parity deferred.
4. **Q4 — `BillboardGraphics`** as the initial implementation, subject to
   performance and interaction verification.
5. **Q5 — DEFERRED AND SEPARATELY GATED.** STAC integration and any
   default-renderer change stay out of Phase 5.
6. **Q6 — Performance escalation ladder:** (1) optimize entity lifecycle
   and updates first; (2) then evaluate a justified low-power cap or a
   point-primitive implementation that preserves required interaction
   semantics; (3) if acceptance criteria cannot be met, stop and report.
   No silent functionality reduction.

Approved scope = proposal §§6–7, 9–12 as written, minus O5/O6 (deferred
above). Out-of-scope list (§8) stands unchanged and now additionally
covers O5, O6, STAC, and the default-renderer flip by explicit decision.

## 1. Summary of the current architecture

Single Next.js 15 App Router app (React 19, TypeScript 5.9): thin server
page → client `SentinelApp` composition root → shell regions + one of four
globe renderer branches selected by `?renderer=` (dotted-2D default, WebGL
R3F, WebGPU TSL, Cesium lazy chunk). Dashboard, URL-state, SWR data layer
(16 API routes under `/api`), per-layer TTL cache, and honest
`data_status` provenance are engine-agnostic and unchanged since Phase 1.

Data flow (verified in source): layer select → `useLayerData(activeLayer,
{ limit: 500 })` → `/api/v1/layers/[id]/data` envelope
(`{success, data:{points: DataPoint[]}, meta:{data_status, cache_hit…}}`)
→ `SentinelApp` mirrors `points` to markers + provenance UI. `DataPoint`
(`src/types/index.ts:11-27`): stable string `id`, `lat`/`lon`,
`severity` (`low|moderate|high|critical`), `timestamp`, optional
magnitude/depth/title/description/location/type/unit/url.
`SEVERITY_COLORS` (same file:172-177) is the shared severity-to-color
vocabulary; `MARKER_CAPACITY = MAX_LIMIT = 2000`
(`markerSync.ts:32`, via `@/server/validation`).

The critical Stage A finding: on the Cesium path (`?renderer=cesium`)
**no observation data reaches the globe**. `CesiumEarth.tsx:161-166`
explicitly voids `dataPoints`, `onMarkerClick`, `onMarkerHover`,
`isRotating`, `sunDirection`, and `activeLayer` ("accepted but
intentionally unused… marker/entity sync and sun wiring stay Phase 4+
work"). A repo-wide grep confirms zero entity infrastructure — no
`Entity`, `BillboardGraphics`, `PointPrimitiveCollection`,
`viewer.entities`, or `CustomDataSource` anywhere in `src/`. The Cesium
globe therefore renders imagery, grid, camera, and coordinate readout,
but none of the application's environmental observations. The dotted,
WebGL, and WebGPU branches all render severity-colored markers with
hover cards and click-to-detail.

## 2. Relevant Phase 1–4 decisions and constraints

- **Phase 1**: dashboard/API/state/preservation targets frozen; globe host
  + projection math are the replaceable seam; Cesium enters only as a
  fourth lazy branch, never the default; GIBS WMTS is API-only until a
  phase wires it (done in Phase 2).
- **Phase 2**: token-free GIBS + ellipsoid; `pickEllipsoid` coordinate
  contract; StrictMode-safe lifecycle; lazy isolation (budget survives
  only if Cesium stays out of the initial graph).
- **Phase 3**: uniform lighting (no real-time sun implication — sun wiring
  would contradict this unless re-justified); ellipsoid retained (no
  token-free global terrain); `requestRenderMode` deferred;
  reduced-motion/low-power mappings are the performance contract.
- **Phase 4**: typed imagery registry + validated factory (no arbitrary
  provider URLs, allow-list preserved); URL owns discrete selection,
  storage owns display prefs; budget now **202,809 B gzip (198.1 KiB),
  headroom 1,991 B** (re-measured this stage — hard constraint);
  smoke harness extended (22/22); full-suite contention flake documented
  (timeout-only, zero assertion failures, isolated re-runs green).
- **Prompt-path discrepancy** (recorded per §2): the Phase 5 prompt §2
  lists `docs/prompts/PHASE_4_IMAGERY_LAYER_MANAGER.md`, which does not
  exist. The actual file is
  `docs/prompts/architecture/PHASE_4_IMAGERY_LAYER_MANAGER.md` (likewise
  for this prompt). Content took precedence; no assumption substituted.
  All 13 other listed documents were present and reconciled.

## 3. Current working-tree state (inspected, preserved)

- Branch `main`, HEAD `8ad1ae3` ("feat: implement imagery layer
  management and URL state handling") — the Phase 4 work left
  uncommitted at the end of the last session has since been committed;
  nothing is outstanding from Phase 4.
- `git status --short`: exactly one untracked file, the Phase 5 prompt
  itself. No modified files. No staging, no commits, no resets, no
  cleanup performed in this stage.
- Dependencies unchanged (`cesium 1.146.0` exact; no installs in Stage
  A). Scripts unchanged (`typecheck`, `lint`, `test`,
  `textures:report`, `bundle:check`, `smoke:browser`, `cesium:assets`).
- API routes: 16 `route.ts` files (unchanged set). Hooks: `useLayers` /
  `useLayerData` / `useEventSelection` (`selectEvent(point)`),
  `useAppUrlState`, `useFlyTo`, all unchanged. `data_status`
  (`live|simulated|stale|unavailable`) + envelope conventions unchanged.
  URL-state: `?layer=&event=&q=&sev=&view=` + `?imagery=` + `renderer`
  passthrough. GIBS allow-list + factory constraints intact. Smoke
  harness present with Phase 4 scenarios. Bundle re-measured: 202,809 B
  PASS (see §1 headroom note).

## 4. Outstanding observation-synchronization items

Source: `CESIUM_MIGRATION_BACKLOG.md` Phase 4 section (old plan, carried
forward by the Phase 4 report as open requirements) + preservation
matrix + target architecture:

1. **O1 — `DataPoint[]` → Cesium entities** (≤2000, severity colors,
   filter-aware). OPEN — the Stage A finding above. Blocks all Cesium
   observation value; prerequisite for any default-flip discussion.
2. **O2 — Hover card anchor on Cesium** (`MOUSE_MOVE` pick → existing
   card). OPEN (hover prop voided).
3. **O3 — Click → `selectEvent` on Cesium** (`LEFT_CLICK` entity pick →
   existing detail flow). OPEN (click prop voided). Requires pick
   routing: entity hit → selection; empty globe → coordinate readout
   (existing Phase 2 contract preserved).
4. **O4 — Drag-vs-click discrimination + hover throttle parity** (legacy:
   rAF-throttled raycast, ~6 px drag rule). OPEN on Cesium.
5. **O5 — `isRotating` (auto-rotate) on Cesium.** OPEN (prop voided;
   Settings toggle silently does nothing on this path — minor honesty
   gap). Cesium has no built-in auto-rotate; needs an explicit camera
   driver + reduced-motion handling.
6. **O6 — Home/reset view control.** OPEN (matrix lists Reset/home as N;
   fills a current gap on all branches, not Cesium-specific).
7. **O7 — STAC catalogue search + footprints** (backlog Phase 6). OPEN
   but explicitly NOT Phase 5 by default: needs a new server provider,
   new routes, geometry simplification, and answers on CDSE rate limits,
   credentials posture, and quota/cost that Stage A cannot verify from
   the repo alone.
8. **O8 — Sentinel scene rendering / second imagery / derived rasters.**
   OPEN, explicitly out-of-scope unless approved (unverified endpoints,
   tile-service prerequisite, licensing/quota unknowns).

## 5. Ranked candidate deliverables

Scored against prompt §2.3 criteria (usefulness, backlog alignment,
end-to-end completeness, real-data verifiability, architectural fit,
security/licensing risk, perf/ops complexity, infra needs):

| Rank | Candidate | Assessment |
|---|---|---|
| **1 (recommended)** | **A — Cesium observation sync + selection parity (O1–O4)** | Real USGS/EONET/FIRMS observations end to end on the existing SWR-to-props path; zero new endpoints/deps/tokens/CSP; fits the lazy chunk; backlog-explicit; verifiable with live data in smoke (500-quake payload already renders on dotted). The only honest gap-closer available without new infrastructure. |
| 2 | B — O5 auto-rotate parity (supporting, needs decision) | Tiny, same interaction-parity theme; directly observable honesty fix. Propose as optional in-scope supporting change (§21 Q2). |
| 3 | C — O6 home/reset control | Small and useful, but branch-agnostic UI work, not observation sync; defer to keep the phase minimal. |
| — | D — O7 STAC catalogue | High value, wrong phase: new provider + routes + rate/credential/quota unknowns violate "smallest complete capability"; backlog assigns it to Phase 6. NOT recommended. |
| — | E — O8 second imagery / rasters | Unverified sources, tile-service prerequisite, licensing unknowns; explicitly out-of-scope unless approved. NOT recommended. |
| — | F — default-renderer flip | Premature without parity; separately gated on metrics + approval. NOT recommended. |
| — | G — sun wiring / timeline | Contradicts the Phase 3 uniform-lighting decision; nice-to-have. NOT recommended. |

## 6. Recommended Phase 5 objective

**Render the active layer's real observations as severity-colored Cesium
entities with hover and click-to-detail parity, reusing the existing data
pipeline, selection flow, and provenance end to end.**

Concretely: `DataPoint[]` (as already delivered to `CesiumEarth` props)
→ id-keyed entity sync (diff by stable `point.id`; cap at
`min(fetched, MARKER_CAPACITY)` = 500 today) using `BillboardGraphics`
entities with the shared `SEVERITY_COLORS`; `MOUSE_MOVE` rAF-throttled
hover → existing `onMarkerHover` (existing `MarkerHoverCard`, no new
card); `LEFT_CLICK` entity pick → existing `selectEvent(point)`
(existing detail panel + provenance, unchanged); entity miss → existing
`pickEllipsoid` coordinate readout (Phase 2 contract preserved);
drag-vs-click discrimination matching the legacy ~6 px rule;
reduced-motion instant behavior and low-power mappings respected; entity
disposal on layer change / filter change / unmount without Viewer
rebuild; no API, envelope, URL-state, or `data_status` changes.

## 7. User-facing behavior the objective will deliver

On `?renderer=cesium` with any environmental layer active: colored
observation markers appear on the true-color globe (same data, colors,
and counts as the dotted branch); hovering a marker shows the existing
hover card; clicking opens the existing event detail with its real
provenance (`LIVE`/`CACHED`/`SIMULATED` chips unchanged); clicking empty
ocean still reports coordinates; dragging never misfires selection;
toggling layers/filters updates markers without rebooting the Viewer.

## 8. Explicit out-of-scope items

STAC/catalogue search, footprints, Sentinel-1/2 ingestion, raster tile
backend, NDVI/derived products, new database/scheduler/auth, terrain
changes, second imagery provider, default-renderer flip, sun wiring,
timeline/clock, three.js removal, broad CSP changes, Phase 6 work.
Home/reset control (O6) is deferred unless the user promotes it (§21 Q3).

## 9. Proposed architecture and data flow

User → layer select (existing) → SWR `useLayerData` (existing) →
`/api/v1/layers/[id]/data` envelope (existing, validated, cached,
provenance-labelled) → `SentinelApp` (existing mirror to
`allDataPoints`) → `EarthRenderer` (unchanged threading) →
`CesiumEarth` → **NEW `cesiumObservations.ts` (lazy chunk only)**:
`syncEntities(viewer, points)` (id-diffed add/update/remove),
pick routing (entity → selection; miss → ellipsoid readout), hover
throttle (rAF) + drag discrimination, `dispose()` on layer change /
unmount. Callbacks out through the existing props (`onMarkerClick`,
`onMarkerHover`, `onCoordinatePick`); selection/detail/provenance reuse
`useEventSelection` + `DataPanel` untouched.

No new global store (viewer stays in a host-local ref, per target arch);
no new API routes; no new state system. The entity module takes the
Cesium namespace as a parameter (same test seam as the Phase 4 factory)
and is imported exclusively inside the lazy chunk — the initial bundle
is untouched by construction.

## 10. Candidate data source and suitability

**No new source needed** — the strongest option under prompt §6. The
eight existing layers (USGS, EONET, FIRMS, Open-Meteo, AirNow, geocoding,
timezones) already flow through validated, cached, provenance-labelled
routes exercised live in every smoke run (e.g. 500 real earthquakes,
CACHED/USGS, in the Phase 4 screenshots). Suitability evidence: existing
provider tests, route tests, and production smoke runs; no endpoint,
auth, quota, licensing, or CORS question is open. This satisfies "a
working data-source integration" with zero integration risk.

## 11. API and state changes required

**None expected.** Consumes `DataPoint[]` props already threaded to
`CesiumEarth`; reports through existing
`onMarkerClick`/`onMarkerHover`/`onCoordinatePick`; selection/detail/
provenance reuse `useEventSelection` and `DataPanel` untouched. If Stage
B discovers a missing field, the fallback is to extend (never break) the
existing envelope with approval.

## 12. Expected files to add or modify

- ADD `src/components/globe/cesiumObservations.ts` (+
  `cesiumObservations.test.ts`): sync/pick/dispose logic with namespace
  seam; lazy-chunk only.
- MODIFY `src/components/globe/CesiumEarth.tsx`: wire the voided props
  into the sync module, route entity-vs-ellipsoid picks, cleanup; no
  lifecycle redesign.
- ADD component tests (observations suite with fake runtime:
  sync/count/severity, id-diffing, pick routing, drag discrimination,
  disposal, StrictMode).
- MODIFY `scripts/browser-smoke.mjs`: entity scenarios (markers present,
  click selects, hover path, no duplicate entities after toggles).
- Docs (Stage B only): implementation report, acceptance checklist,
  backlog update; provider reference untouched (no provider change).

## 13. Dependencies and infrastructure requirements

None. No new npm packages (Cesium entity API ships in the pinned
`cesium@1.146.0` already in the lazy chunk), no new services, no
scheduler, no database, no credentials, no environment variables, no
Vercel plan change. Operational cost: zero beyond existing hosting.

## 14. Authentication, licensing, attribution, security assessment

- Authentication: none (existing keyless/keyed-server-side providers
  flow through unchanged server routes; browser holds no new secrets).
- Licensing/attribution: unchanged data credits (USGS/EONET/FIRMS/
  Open-Meteo/AirNow as today); GIBS credit untouched; no redistribution
  change.
- Security: allow-lists (GIBS, imagery factory) untouched; no arbitrary
  URLs (entity positions come from validated API payloads through the
  existing `isValidCoordinate` discipline); no CSP change; no unsafe
  HTML (hover card reuse); no new remote origins; no secrets in logs.
- SSRF/proxy: none — no new server fetching; client renders data the app
  already holds.

## 15. Provenance and timestamp semantics

Unchanged end to end. Each marker's `DataPoint` already carries
`timestamp` (acquisition per provider), `type`, `url`, and the envelope
carries `data_status` + `cache_hit`; the detail panel shows them today
on other branches and will show the identical content from Cesium
picks. Time concepts stay distinguished per prompt §5.1:
`timestamp` = provider observation time; `fetched_at`/`cached_at` =
retrieval; mosaic `Time` remains the GIBS availability date (claim
unchanged). Missing metadata stays missing (nullable display, never
fabricated). Simulated fallbacks keep their `SIMULATED` labels.

## 16. Failure, caching, and stale-data behavior

Reuse, don't reinvent: existing SWR retry bounds, per-layer TTLs,
`stale-while-revalidate` headers, honest `STALE`/`UNAVAILABLE` + Retry
path, and `dropPendingEventFromUrl` semantics all stay. Entity-layer
additions: provider outage → existing banner + markers from last good
payload remain until fresh data arrives (never blanked by a failed
refresh, never presented as current); empty result → empty entity set +
existing empty-panel state (a successful query with zero observations is
not an error); malformed points (bad coords) → skipped by the existing
`isValidCoordinate` gate before entity creation; cap overflow → first
`MARKER_CAPACITY` kept deterministically with a count note (matches
legacy instancing capacity).

## 17. Testing and production verification plan

- Unit: id-diffing, severity mapping, cap truncation, invalid-point
  skipping, pick-routing (entity vs miss vs invalid), drag threshold,
  disposal completeness — fake Cesium namespace, no WebGL.
- Component: mount sync, layer/filter updates without Viewer rebuild,
  hover/click callbacks, unmount destroys entities + handlers, StrictMode
  single-Viewer + single-entity-set.
- UI/regression: full existing suite; dotted default, WebGL/WebGPU,
  lazy Cesium, Phase 4 imagery/opacity/grid, URL compat, reduced-motion/
  low-power, CSP unchanged.
- Production smoke (extended harness, `next start`): valid layer shows
  N entities matching the API count; click selects the event detail;
  hover path; empty-globe readout; layer toggles leave no duplicate
  entities; invalid/empty layers honest; 22 existing checks intact;
  `/api/health` healthy. Real USGS live data asserted in-browser (not
  mocks alone). Flake rule from Phases 1–4 applies unchanged.
- Budget: `bundle:check` must stay ≤204,800 B gzip (entity code lives in
  the lazy chunk; initial-graph additions ~zero).

## 18. Performance impact and bundle-budget considerations

- Initial bundle: ~zero by construction (new module lazy-only; prop
  threading is primitive values + stable callbacks). Hard gate: repo
  script, unchanged method; headroom is 1,991 B and this proposal spends
  essentially none of it.
- Runtime: ≤500 entities (today's fetch limit) against a 2000-tested
  pattern; billboard entities are the documented norm at this scale
  (target arch). No per-frame work except the existing render loop +
  rAF-throttled hover (same as legacy); low-power mappings
  (resolutionScale, maxSSE, MSAA) apply to entities automatically as
  scene content. Disposal on layer change prevents accumulation.
- Risk: low-end software-GL frame cost with 500 billboards — measured in
  smoke (frame-diff + interaction timing), not assumed; `PointPrimitive`
  fallback noted only if measurement demands it (decision for Stage B
  evidence, default stays billboards per target arch).

## 19. Risks and unresolved decisions

1. **Pick-behavior parity** (medium-low): Cesium `pick` vs legacy
   raycast may differ at marker edges/overlap; mitigated by same
   thresholds + hemisphere/antimeridian test points + screenshot review.
2. **Hover-card anchoring** (low): card is screen-space; anchor from pick
   position each move — verify no jitter in smoke; fallback is
   click-only parity (decision for Stage B if jitter appears).
3. **Filter semantics** (low): confirm whether dotted markers respect the
   severity filter pre-sync and mirror exactly — Stage B first check;
   any divergence is a reported decision, not silent drift.
4. **Scope creep toward O5/O6** (process): auto-rotate and home/reset are
   adjacent temptations; contract is O1–O4 (+O5 only if Q2 approved).
5. **Bundle headroom** (low): 1,991 B is thin but this scope needs ~none;
   any surprise initial-graph import fails the gate loudly (by design).

## 20. Proposed acceptance checklist (for Stage B sign-off)

- A1 Scope proposal approved before implementation; no expansion without
  approval; renderers + Phase 4 intact.
- B1 Real layer data renders as entities (count matches API payload,
  severity colors match `SEVERITY_COLORS`, cap honored).
- B2 Hover shows the existing card; click opens the existing detail with
  unchanged provenance; empty click keeps coordinate readout.
- B3 No live/real-time/coverage claims beyond provider evidence;
  missing metadata shown as missing; stale/empty states honest.
- C1 Invalid points skipped; empty vs error distinguished; envelope +
  `data_status` unchanged; no secrets.
- D1 No new state system; URL compatible; keyboard/a11y preserved;
  fly-to/picking/grid/opacity unaffected; no leaks; no new exceptions.
- E1 Allow-lists/CSP intact; no arbitrary URLs; budget passes; Cesium
  lazy; no new deps/infra.
- F1 Typecheck/lint/focused/full (flake rule)/build/textures/bundle
  green; production smoke covers entities with live data; env limits
  distinguished.
- G1 Report + checklist + backlog updated; provider ref untouched (or
  extended if applicable); tree accurately reported; Phase 6 not started.

## 21. Questions requiring explicit user decisions

- **Q1 (binding):** Approve Candidate A (O1–O4 observation sync +
  selection parity) as the Phase 5 Stage B scope?
- **Q2:** Include O5 auto-rotate parity as a supporting change in the
  same phase, or defer it? (Recommendation: include only if it stays a
  small camera driver with reduced-motion handling; otherwise defer.)
- **Q3:** Promote O6 home/reset control into this phase, or defer?
  (Recommendation: defer — branch-agnostic UI, not observation sync.)
- **Q4:** Confirm `BillboardGraphics` entities (per-point color/scale,
  ≤2000 norm, target-arch recommendation) over `PointPrimitiveCollection`?
  (Recommendation: billboards; fallback only on measured cause.)
- **Q5:** Confirm STAC/footprints (O7) stay explicitly deferred to their
  own phase, and the default-renderer flip stays separately gated?
- **Q6:** If Stage B measurement shows entity cost problems on weak GPUs,
  prefer (a) `PointPrimitive` fallback, (b) reduced entity cap on
  low-power, or (c) stop-and-report? (Recommendation: (c) first, then (b)
  — no silent degradation.)

**Stage A stop rule honored:** no application source modified, no
dependencies installed, no routes added, no behavior changed, no provider
configuration touched, Phase 6 not started. This proposal is unstaged
and uncommitted. Awaiting explicit approval before Stage B.
