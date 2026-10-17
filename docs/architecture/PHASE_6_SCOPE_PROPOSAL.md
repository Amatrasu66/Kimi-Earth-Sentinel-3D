# Phase 6 Scope Proposal — Planning Only (Stage A)

Status: **PLANNING ONLY — awaiting explicit user approval.** No application
source code was modified, no dependencies installed, no providers changed,
no features implemented. The only write in this stage is this document.
Phase 7 not started.

## Approval record (binding decisions Q1–Q6)

Recorded from the user's explicit planning-decision responses (2026-10-16):

1. **Q1 — APPROVED.** Candidate A (Sentinel catalogue discovery: AOI+date
   search, footprint entities, scene detail) as the Phase 6 Stage B scope.
2. **Q2 — Option A.** Catalogue access path = **keyless CDSE OData**
   (verified §4.6–4.7). No credentials, no token infrastructure;
   discovery-only. Authenticated CDSE (B) not approved for this phase.
3. **Q3 — DEFER O5 and O6.** Auto-rotate and home/reset stay out of
   Phase 6 (documented limitations remain as-is).
4. **Q4 — APPROVED.** One new API route `/api/v1/scenes` with
   validation + TTL cache + rate-limit class (§12).
5. **Q5 — Option (a).** If the OData spatial filter proves unusable
   keylessly at Stage B: bounded retrieval + client-side AOI
   pre/post-filtering with clear labeling (never silent).
6. **Q6 — (answered implicitly; standing rule)** finish the approved
   path if external behavior shifts mid-phase; record findings for
   Phase 7.

Approved scope = this proposal §§6–12 and §14–16 as written, with
§8 (out-of-scope) standing unchanged. Stage B may not begin until the
user explicitly authorizes implementation.

## 1. Working-tree state (inspected, preserved)

- Branch `main`, HEAD `85936a4` ("feat(globe): implement observation entity
  sync and interaction handling"). Verified via `git show --stat` that this
  commit contains exactly the Phase 5 Stage B deliverables (proposal,
  report, checklist, backlog update, smoke-harness +3 scenarios,
  `CesiumEarth.tsx`/`CesiumEarth.test.tsx`,
  `cesiumObservations.ts`/`.test.ts`, `CesiumEarthObservations.test.tsx`)
  — the Phase 5 work was committed between sessions, as Phase 4 was.
- `git status`: **clean; nothing to commit.** No uncommitted work exists,
  so nothing needed preserving — and nothing was reset, discarded,
  staged, or committed in this stage.
- Dependencies unchanged: `cesium@1.146.0` exact; scripts unchanged
  (`typecheck`, `lint`, `test`, `textures:report`, `bundle:check`,
  `smoke:browser`, `cesium:assets`); 16 `route.ts` API files unchanged;
  renderer branches unchanged.

## 2. Sources read for this plan

- `CESIUM_MIGRATION_BACKLOG.md` (Phases 2–9 plan + all phase-status
  annotations), `CESIUM_TARGET_ARCHITECTURE.md`,
  `FEATURE_PRESERVATION_MATRIX.md`, `IMAGERY_LAYER_PROVIDER_REFERENCE.md`.
- Phase 1 completion report; Phase 2–5 implementation reports and
  acceptance checklists; `PHASE_5_SCOPE_PROPOSAL.md` (Approval record).
- Actual working tree: `CesiumEarth.tsx`, `cesiumConfig.ts`,
  observation-sync modules, `EarthRenderer`/`Globe`/`WebGPUEarth`/
  `DottedEarth` prop threading, `SentinelApp.tsx`, shell components,
  `src/app/api` route set.
- Live external verification (2026-10-16, PowerShell probes against
  CDSE endpoints only — no project files touched): §4.

## 3. Remaining deferred items (after Phase 5)

| Item | State | Evidence |
|---|---|---|
| O1–O4 observation sync + hover/click/drag parity | DONE | Phase 5 report/checklist all-pass; live click-to-detail proven in production smoke |
| O5 auto-rotate on Cesium | OPEN | `CesiumEarth.tsx:159,175` destructures `isRotating` then `void _isRotating`; the Settings toggle is a documented no-op on this branch (honesty gap) |
| O6 home/reset view control | OPEN | `FEATURE_PRESERVATION_MATRIX.md` A-row "Reset/home view: N" — a gap on **all** four branches, not Cesium-specific |
| O7 STAC/catalogue search + footprints | OPEN | Matrix D-row "Sentinel-1/2 products: N"; backlog's Phase 6 scope |
| O8 Sentinel scene rasters | OPEN, deferred | Backlog Phase 7; unverified tile service, licensing/quota unknowns |
| Default-renderer flip | Deferred, separately gated | Binding Q5 in the Phase 5 Approval record |
| Sun wiring | Out of scope | Contradicts the Phase 3 uniform-lighting decision |
| Timeline/clock | Nothing needs it | Matrix "Time selectors/playback: N, tbd" |

Fly-to parity is NOT a gap: `flyTo {lat, lon, key}` is honored on the
Cesium path through the unit-tested `resolveFlyToView` +
`camera.flyTo` + home-height fallback + reduced-motion jumps
(`CesiumEarth.tsx:506-535`, `cesiumConfig.test.ts:121-179`). The
empty-globe coordinate readout, 6 px drag rule, rAF hover throttle, and
entity/miss pick routing were all verified in Phase 5. **The remaining
observation-interaction parity work is essentially zero; what remains
open is camera behavior (O5/O6) and data-domain expansion (O7/O8).**

## 4. Live verification of the Sentinel catalogue options (2026-10-16)

Keyless PowerShell probes run directly against CDSE (no credentials, no
project files involved; findings feed this plan only):

| # | Probe | Result |
|---|---|---|
| 4.1 | `GET https://stac.dataspace.copernicus.eu/v1/collections` (+pagination) | **HTTP 200 keyless** — 427 collections; `sentinel-1-grd`, `sentinel-2-l1c`, `sentinel-2-l2a`, `sentinel-2-global-mosaics`, `clms_ba_global_300m_daily_v3_cog` present; rich metadata (extents, licenses, providers, per-collection `auth:schemes` OIDC) |
| 4.2 | `GET /v1/search?collections=<sentinel-2-l2a / sentinel-2-l1c / sentinel-1-grd / clms_ba…>&bbox&datetime&limit` (several AOIs and date windows incl. Japan 34.5–37N, Aug–Oct 2026) | **HTTP 200 but `features: 0` every time** |
| 4.3 | `POST /v1/search` (JSON body: `collections+bbox+datetime`, no-datetime, wider bbox) | same: 200, zero features for all collections tried |
| 4.4 | `GET /v1/collections/sentinel-2-l2a/items?limit=3` (unfiltered) | **200, zero features** |
| 4.5 | `GET /v1/search?limit=3` (no `collections` param) | **400** `CollectionInQuerryIsMissingError` — proves the service is up and parsing requests, not simply down |
| 4.6 | `GET https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$top=2&$filter=Collection/Name eq 'SENTINEL-2'` | **HTTP 200 keyless** — real products returned (Id, Name, S3Path, checksums, ContentDate) |
| 4.7 | OData `$top=3` + `$filter=Collection/Name eq 'SENTINEL-2' and contains(Name,'L1C') and ContentDate/Start gt 2026-09-01T00:00:00.000Z` | **HTTP 200 keyless — three real October-2026 Sentinel-2 L1C products** with Name and ContentDate (e.g. `S2B_MSIL1C_20261015T103019_N0513_R108_T34WDS…`) |
| 4.8 | OData spatial clause `OData.CSpatial/intersects(area=geography'SRID=4326;POLYGON((…))')` | **HTTP 400 parse error** in these probes — a syntax/format issue, not an access-gate; CDSE publishes the canonical format in the OData guide. Final syntax is a Stage B first-task; a documented fallback exists (§11.5). |
| 4.9 | `GET https://documentation.dataspace.copernicus.eu/APIs/OData.html` / `APIs/STAC.html` / `UpcomingChanges.html`; `dataspace.copernicus.eu` news | Endpoint URLs confirmed; legacy catalogue endpoints deprecated/decommissioned (legacy STAC 17 Nov 2025; OpenSearch decommissioned 2 Mar 2026); identity-service maintenance notices confirm login-gated CDSE services exist |

Interpretation (conservative): **keyless STAC item search cannot be
verified to return items** (4.2–4.4 consistently empty while 4.1/4.5
prove the service is alive); collections metadata is keyless; **keyless
OData product search is verified working** for collection+name+datetime
filters and returns real 2026 products; the spatial footprint filter on
OData is documented and reachable but not yet syntax-verified in this
environment. Item/asset **download** requires CDSE OIDC credentials per
the collections' own `auth:schemes` and CDSE docs — but this phase needs
only **metadata discovery**, not downloads.

These findings are time-stamped and volatile: CDSE's catalogue APIs are
in documented flux (API decommissions above; identity upgrades
Sept–Oct 2026). Any implementation must re-verify all §4 probes at
Stage B entry and degrade honestly if delivery is no longer keyless
(never silently add auth).

## 5. Candidate comparison

Ranked against the same criteria used in the Phase 5 Stage A ranking
(usefulness, backlog alignment, dependency-readiness, real-data
verifiability, architectural fit, security/licensing risk, perf/ops
complexity, infra needs):

| Rank | Candidate | Assessment |
|---|---|---|
| **1 (recommended)** | **A — Sentinel catalogue discovery (O7): AOI+date scene search, footprint entities, scene detail** | The application is a Sentinel 3D dashboard; this is the flagship capability it currently lacks end to end, and the backlog assigns exactly this scope to Phase 6. Keyless delivery is verified live today via CDSE OData (§4.6–4.7) with zero new dependencies and zero credentials. Offers the strongest end-to-end completeness of the open items (search → footprints on the globe → detail card → provenance), and it does not depend on camera-parity work — footprints reuse the Phase 5 pick machinery as-is. Risks are real but bounded (§11). |
| 2 | B — Same objective via authenticated CDSE (STAC/OData + OIDC) | Same science, but adds OAuth2 client-credential infrastructure (token endpoint, cache/refresh, server-side secret management, log redaction) into an app whose posture has deliberately stayed token-free on the default path. Requires the user to provision CDSE credentials and approve the posture change; deferring never blocks the globe work — Candidate A can be delivered now and B can supersede/extend it later. |
| 3 | C — Camera behavior parity (O5 auto-rotate + O6 home/reset) | Small, real, and cheap — Cesium-side auto-rotate is a lazy-chunk camera driver, and home/reset reuses `resolveFlyToView`/`CESIUM_HOME_VIEW` (both exist and are unit-tested). But scientific value is low relative to A, and the home-reset control lands in the initial JS graph where headroom is only **1,991 B gzip** (202,809/204,800 B) — likely triggering a stop-or-dynamic-import decision. Better as a fast-follow than the flagship phase. |
| — | D — O8 Sentinel rasters | Backlog Phase 7; explicitly out of scope unless approved; unverified tile-service prerequisite; quota/cost unknowns. NOT recommended. |
| — | E — Default-renderer flip | Separately gated on metrics + explicit approval (binding Phase 5 Q5). NOT recommended. |
| — | F — Sun wiring / timeline | Contradicts verified Phase 2/3 decisions. NOT recommended. |

Backlog-alignment note: the backlog's older Phase-4/5 section headings
were superseded by the delivered Phase 4/5 specs (their §annotations say
so explicitly). The next unstarted backlog scope block is the
"Phase 6 — Sentinel catalogue (STAC search + footprints + metadata)"
section. Candidate A is squarely that scope, with the access path
substituted where live verification demanded it (§4).

## 6. Recommended Phase 6 objective (pending Decision Q1/Q2)

**Discover real Sentinel-1/2 scenes by area and date keylessly, draw
their captured footprints as globe entities, and open a real scene-detail
record — with honest provenance when the catalogue is unreachable — using
CDSE's OData catalogue API as verified in §4, without any credentials,
tokens, or downloads.**

Concretely:

1. **Search**: user-supplied AOI + date window + collection selection,
   starting with the verified Sentinel-2 L1C collection
   (`sentinel-2-l1c`); Sentinel-2 L2A (`sentinel-2-l2a`) and Sentinel-1
   GRD (`sentinel-1-grd`) extend only after their own live verification.
2. **Footprints**: results → simplified polygon entities on the Cesium
   globe reusing the existing Phase 5 screen-space pick machinery: hover
   → scene card, click → scene detail; empty-globe click keeps the
   existing `pickEllipsoid` coordinate readout contract.
3. **Scene detail**: acquisition time, product/identifier, orbit/date
   metadata, display-only asset links (never fetched client-side),
   Copernicus citation, envelope `data_status`.
4. **Honesty**: catalogue unreachable / rate-limited / empty results
   are distinguished exactly like today's providers (`UNAVAILABLE` +
   Retry; empty ≠ error; cached results labeled `CACHED`; acquisition
   times never presented as live coverage).

This is scoped as **discovery only** — rendering scene pixels
(O8/rastered imagery) stays Phase 7/backlog and out of scope below.

## 7. User-facing behavior the objective will deliver

With `?renderer=cesium`: the user enters/draws an AOI and a date window;
real Sentinel scenes acquired in that window+area appear as outlined
footprint rectangles on the true-color globe; hovering shows what was
acquired and when; clicking opens a detail card with acquisition time,
product name/ID, real returned metadata fields (never fabricated), the
Copernicus citation, and provenance chips matching the existing
conventions (`LIVE`/`CACHED`/`UNAVAILABLE`); nothing is presented as
today's coverage or real-time data. The dotted/WebGL/WebGPU branches are
untouched (footprint and search UI are renderer-agnostic or Cesium-only
as noted per candidate).

## 8. Explicit out-of-scope items

- Rendering Sentinel scene pixels / WMTS / Sentinel Hub Process API /
  COG tiling proxy (Phase 7 by backlog).
- Scene downloads, S3/credential-gated access, bulk processing — CDSE
  credentials REQUIRED; not pursued without a separate decision.
- O5 auto-rotate, O6 home/reset (stay deferred unless promoted — Q3).
- Default-renderer flip, three.js removal, terrain/ion, sun, timeline,
  CSP enforcement changes, imagery-registry rework, second GIBS base.
- S3 bulk-download UI, openEO/Sentinel Hub processing integration.

## 9. Proposed architecture and data flow

Renderer-agnostic server → client pipeline; only footprints are
Cesium-specific (mirrors the Phase
2–5 layering: server/engine seams stay pure, Cesium stays lazy):

```
User AOI + date window (SceneSearch UI control)
  → Next.js route (NEW, validated): /api/v1/scenes
      ├- validation (bbox, date window, collection allow-list, limit cap)
      ├- rate-limit class (reuse src/server/rate-limit.ts pattern)
      ├- TTL cache + provenance envelope (reuse cache.ts + provenance.ts)
      └- provider (NEW): src/server/providers/cdse-catalogue.ts
            ├- allow-listed CDSE OData base; collection allow-list
            ├- filter-string builder (constants only; no user input in URLs)
            ├- response validation (fixtures captured from the §4 probes)
            └- geometry capture: product GeoFootprint JSON + simplification
  → client SWR hook (NEW useSceneSearch, existing SWR discipline)
  → SentinelApp-scoped state (no new global store)
  → EarthRenderer passthrough (existing threading pattern)
  → CesiumEarth → NEW cesiumFootprints.ts (lazy chunk ONLY)
      ├- PolygonGraphics entities, id-keyed diff (Phase 5 pattern)
      ├- pick routing via the Phase 5 observation handlers (entity vs miss)
      └- disposal on unmount/data change/StrictMode
  → scene-detail rendering (reuse event-detail card patterns)
```

- The provider is server-side only; the browser holds no secrets (there
  are none — keyless path).
- `data_status` semantics extend the existing vocabulary, not replace
  it; catalogue outage → `unavailable` + the existing recoverable-error
  banner; no fabricated state.
- No change to the imagery registry/factory, GIBS allow-lists,
  `CESIUM_BASE_URL`, or asset pipeline.
- Geometry decision: simplified polygons with a documented cap/simplify
  tolerance; bbox-rectangle fallback only if GeoFootprint proves
  unreliable (both would be labeled, not silent).

## 10. Dependencies and infrastructure requirements

- No new npm dependencies for the recommended shape; OData is plain
  REST/JSON; if any response turns out XML-only, a tiny hand-written
  parser is preferred — no client library.
- No database, no scheduler, no auth changes, no `.env` additions for
  the keyless Candidate A; the CDSE base URL is a code constant,
  allow-listed like GIBS.
- Vercel: nothing changes; one additional server route under `/api/v1`.
- Budget: catalogue logic is server + lazy-client-chunk by construction;
  the search UI and detail card touch the initial JS graph — this
  phase's main non-trivial budget risk given the 1,991 B headroom
  (§16 stop rule); dynamic-import of the search dialog
  (`next/dynamic ssr:false`, existing pattern) is the standing
  fallback to keep initial-graph growth near zero.

## 11. Risks

1. **Access-path volatility (HIGH info, MEDIUM impact)** — CDSE
   catalogue endpoints are in documented flux; §4 findings could shift.
   Mitigation: Stage B re-verifies all §4 probes before coding;
   stop-and-report if delivery is no longer keyless; never silently
   add auth.
2. **STAC vs OData (verified)** — the backlog's STAC path requires user
   acceptance of the verified OData path or credentials (Q2).
3. **OData spatial filter syntax** — probes got 400; CDSE documents the
   canonical format. Stage B first task: capture a working polygon
   filter; fallback (Q5): bounded retrieval + client-side AOI
   post-filtering with explicit labeling (documented, not silent).
4. **Rate limits** — no published hard keyless quota; protocol: server
   TTL cache ≥ 10 min, page size cap (≤ 20), one request per user
   action, no auto-polling, middleware rate class, honest throttle
   states.
5. **Initial-bundle headroom (1,991 B gzip)** — search UI + detail card
   measured; dynamic-import fallback; hard stop if `bundle:check`
   fails (no silent rebaseline) with decision recorded.
6. **Scientific honesty** — footprints are acquisition/product footprints,
   never live coverage; no daily-coverage or realtime claims; mosaic-vs-
   scene semantics labeled; missing metadata displayed as missing.
7. **Scope creep** — O5/O6, O8, default-flip, downloads all stay out
   unless explicitly promoted.

## 12. Expected files to add or modify (Candidate A as framed)

Add (server):
- `src/server/providers/cdse-catalogue.ts` (+ `.test.ts` with fixtures
  from the §4 probes) — OData client, allow-lists, filter builder,
  response schema validation.
- `src/app/api/v1/scenes/route.ts` (+ route tests) — validated envelope,
  TTL cache, provenance, rate-limit class, honesty paths.
- Possibly an additions-only scene-schema module under
  `src/server/validation` mirroring the existing layout.

Add (client/globe):
- `src/components/globe/cesiumFootprints.ts` (+ tests, mocked Cesium
  namespace, no WebGL).
- `src/hooks/useSceneSearch.ts` (+ tests, SWR discipline).
- `src/components/shared/SceneSearch.tsx` + scene-detail rendering
  (reuse of existing event-detail card patterns; licenses unchanged).

Modify:
- `src/components/globe/CesiumEarth.tsx` (footprint props threading +
  pick-routing extension following the Phase 5 pattern; no lifecycle
  redesign),
- `src/components/app/SentinelApp.tsx` (scene state + wiring),
- `src/components/globe/EarthRenderer.tsx` (prop passthrough only),
- `scripts/browser-smoke.mjs` (search → footprints → detail scenarios),
- `src/types/index.ts` (additive SceneQuery/SceneSummary types),
- docs: implementation report, acceptance checklist, backlog, and
  `IMAGERY_LAYER_PROVIDER_REFERENCE.md` §4 (extend "Explicitly
  unimplemented" with the now-supported CDSE catalogue entry).

No change: imagery registry/factory, GIBS allow-lists, URL-state scheme
(scene results session-local), renderer branches, package.json/lockfile,
`.env`, `next.config.mjs`.

## 13. Failure, caching, and stale-data behavior (honesty contract)

Same rules as the eight existing providers: bounded retries, TTL cache +
`stale-while-revalidate` headers, `data_status` envelope, retry surface,
empty ≠ error, failures never blank the globe or fabricate data. New
rules: catalogue unreachable → labeled `UNAVAILABLE` with the existing
recoverable-error pattern; throttled/429 → labeled backoff state;
malformed footprint geometry → scene skipped with a count note, never
guessed; results older than the request window labeled `STALE` like
every other provider.

## 14. Provenance and timestamp semantics

- Scene `ContentDate/Start` = acquisition temporal reference, displayed
  as **acquisition time — not live**; publication/fetch/cache times stay
  distinct (per the established §5.1 discipline).
- Citation string: "Contains modified Copernicus Sentinel data [Year]"
  displayed in the detail card and the Settings provenance note.
- License field (`license: other` + ESA/license PDF link captured in
  §4.1) linked, not copied.
- Missing metadata displayed as missing, never defaulted.

## 15. Verification plan (Stage B, after approval)

- Unit: filter-builder determinism + allow-list enforcement (forged
  collection IDs throw pre-fetch); response validation against captured
  §4 fixtures; geometry simplification and cap; date-window parsing.
- Route: validation matrix (bad bbox/datetime/collection/limit → 400
  envelope, never forwarded); cache/TTL/provenance; rate-limit class.
- Component: footprint sync/diff/dispose with a mocked Cesium namespace;
  pick routing; empty vs `UNAVAILABLE` honesty; StrictMode safety.
- UI/regression: full existing suite (established flake rule retained);
  dotted/WebGL/WebGPU untouched-green.
- Production smoke (extended): live AOI+date search returns N footprints
  matching the API count; click opens a real detail with real Copernicus
  fields; offline/throttled paths labeled; `bundle:check` PASS (≤
  204,800 B gzip; §16 stop rule); `/api/health` healthy; 0 new console
  exceptions; CSP report-only.
- Live re-verification: §4 probes repeated and recorded at Stage B entry
  and at close.

## 16. Proposed acceptance checklist skeleton (Stage B sign-off)

- A1 Proposal approved pre-implementation; scope held; O5/O6/O8/
  default-flip untouched; working tree preserved untouched.
- B1 Real catalogue data with live acquisition evidence; provenance
  conventions intact; acquisition-time labels; no fabricated metadata.
- C1 Input validation; provider allow-lists; empty vs error vs throttle
  distinguished; rate discipline enforced; no secrets (keyless); no
  arbitrary URLs.
- D1 No new global store; controls keyboard-accessible; geographic
  correctness (polygon orientation, antimeridian-safe entities);
  Cesium lifecycle safe; footprints lazy-only.
- E1 New-route validation; no user input reaching URLs; CSP unchanged;
  initial JS budget PASS or dynamic-import fallback applied; no new
  dependencies beyond the current baseline.
- F1 Typecheck/lint/focused/full/build/textures/bundle/smoke green
  (flake rule unchanged); live external re-verification documented.
- G1 Report + checklist + backlog + provider reference updated; tree
  honestly reported; Phase 7 not started.

## 17. Questions requiring explicit user decisions (stop here until answered)

- **Q1 (binding):** Approve Candidate A — Sentinel catalogue discovery
  (footprints + scene detail, keyless) as the Phase 6 Stage B scope?
- **Q2 (architecture decision):** Catalogue access path:
  - **A. Keyless CDSE OData** (verified working today, §4.6–4.7;
    recommended — zero credentials, zero dependencies, preserves the
    token-free default posture; discovery-only).
  - **B. Authenticated CDSE (OIDC/OAuth2 client credentials)** —
    unlocks STAC item search and later downloads; adds token
    infrastructure, server-side secret management, redaction, and a
    provider-posture change; requires the user to provision CDSE
    credentials. Recommended deferral until Phase 7 makes it necessary.
  - **C. Defer the catalogue entirely** and run the small camera
    candidate instead (O5 auto-rotate + O6 home/reset), accepting the
    thin initial-budget stop risk on the home control.
- **Q3:** Promote **O5 auto-rotate on Cesium** and/or **O6 home/reset**
  into this phase as supporting changes, or keep both deferred?
  (Recommendation: defer both — single-objective phase; O6's shell
  control would strain the 1,991 B headroom.)
- **Q4 (approval):** Approve adding one new API route
  (`/api/v1/scenes`) with validation + TTL cache + rate-limit class as
  framed in §12? (The backlog says "new route allowed here with
  validation+tests", but every route addition has historically carried
  explicit approval.)
- **Q5:** If the documented OData spatial filter cannot be made to work
  keylessly at Stage B: (a) bounded retrieval + client-side AOI
  pre/post-filtering with clear labeling, or (b) stop-and-report?
  (Recommendation: (a).)
- **Q6:** If CDSE restores keyless STAC item search (or the verified
  state shifts in another way) mid-phase, finish the approved path
  first and record the finding for Phase 7, or switch mid-phase?
  (Recommendation: finish the approved path.)

Outside Phase 6, for context and consistency: the camera-side items O5
(auto-rotate — lazy-chunk driver, no initial-graph cost) and O6
(home/reset — reuses `resolveFlyToView`/`CESIUM_HOME_VIEW`, but its
shell control competes for the 1,991 B initial headroom) remain the two
smallest open gaps and are natural fast-follows if the catalogue decision
is deferred.

**Stage A stop rule honored:** only this document was written; no
application source modified, no dependencies installed, no routes added,
no provider configuration touched, no feature implemented, Phase 7 not
started. Awaiting explicit decisions Q1–Q6 before any Stage B work.
