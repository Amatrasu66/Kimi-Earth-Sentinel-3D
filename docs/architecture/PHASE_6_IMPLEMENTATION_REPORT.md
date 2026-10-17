# Phase 6 Implementation Report — Sentinel Catalogue Discovery (Stage B)

Spec: backlog "Phase 6 — Sentinel catalogue (STAC search + footprints +
metadata)" section, executed per the Stage A proposal:
`docs/architecture/PHASE_6_SCOPE_PROPOSAL.md` (binding Approval record:
Q1 approve Candidate A; Q2 keyless CDSE OData; Q3 defer O5/O6;
Q4 approve one new route; Q5 fallback only if the spatial filter failed).
Predecessors: Phase 1–5 reports and checklists,
`IMAGERY_LAYER_PROVIDER_REFERENCE.md` (updated — new catalogue section).
Environment: Windows, Node v24.15.0, Next.js 15.5.27,
`cesium@1.146.0` (exact), headless Microsoft Edge via
`scripts/browser-smoke.mjs` (extended with 5 Phase 6 scenarios).

## 1. Executive summary

The approved O7 scope is delivered: real Sentinel-1/2 scenes are
discoverable by AOI + date window + collection through a new validated
server route (`/api/v1/scenes`) backed by the keyless CDSE OData
catalogue, and their captured footprints render as Cesium polygon
entities with click-to-detail parity, honest provenance, and no new
credentials, dependencies, or imagery-registry changes. Live evidence:
12 real Sentinel-2 L2A scenes returned for a Tokyo AOI (real product
names/footprints), 12 Sentinel-1 GRD scenes for the same area; cache
cold 1,587 ms → warm 40 ms (`cache_hit:true`); the full error matrix
(collection/bbox/window/span) returns precise 400s; initial JS
**204,168 / 204,800 B gzip PASS**; production smoke **30/30 PASS** with
the complete real-click flow (dock toggle → panel → globe pick → live
search → 20 rows → inline detail). Q5's fallback was **not needed** —
the canonical `OData.CSC.Intersects` spatial filter works keylessly.
O5/O6 remain deferred; STAC, rasters, and downloads untouched.

## 2. Approved scope and authorization evidence

Stage B executed only after the explicit planning decisions recorded in
the proposal's Approval record (Q1–Q6, 2026-10-16). Implemented scope =
proposal §§6–12 and §14–16: discovery only (AOI + date search,
footprint entities, scene detail, provenance), keyless OData access,
one new route, no credentials. Recorded deviations, all inside the
approved envelope:

1. **STAC → OData** (approved by Q2): the backlog's STAC path is
   auth-gated (proposal §4); OData was verified keyless and is the
   implemented provider.
2. **Spatial filter works keylessly** — proposal §4.8 saw a 400 from
   `OData.CSpatial/intersects`; the canonical documented form,
   `OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((…))')`,
   was verified at Stage B entry and is what the provider emits. The
   Q5(a) bounded-retrieval fallback was therefore not activated
   (recorded unchanged for Phase 7 fallback patterns).
3. **Geometry handling = deterministic caps, not geometric
   simplification**: footprints are rendered as returned, guarded by a
   4,096-vertex parse cap (over cap → footprint `null`, scene still
   listed) and entity-side caps (400 entities / 1,024 vertices per
   outer ring). The proposal's "simplify before entity load" option
   was implemented as bounding rather than a hull/Douglas-Peucker
   pass — smaller diff, no geometry library, honest labeling
   preserved. Simplification remains available for Phase 7 if
   rendering perf demands it.
4. File placement: the search UI lives at
   `src/components/panels/SceneSearchPanel.tsx` (+ a tiny
   `sceneCollections.ts` labels module) rather than
   `src/components/shared/SceneSearch.tsx` — `panels/` is where the
   dynamic-imported panel components in this app actually live (DataPanel
   precedent).
5. Panel priority while open: the explicit Scenes toggle now *wins* the
   panel slot over `DataPanel` (closing it restores the previous
   panel). Discovered during browser review: with the default
   earthquake layer active, the toggle would otherwise flip state with
   no visible effect — a silent dead control. No data is lost; the
   layer/event selection is untouched.

No other expansion occurred: no imagery-registry, GIBS allow-list,
URL-state, camera, terrain, or default-renderer changes.

## 3. Working-tree state (preserved)

Branch `main` @ `85936a4` (Phase 5 deliverable commit, verified via
`git show --stat` to contain exactly the Phase 5 Stage B files).
Stage A entry: clean tree; the only write in Stage A was the proposal.
Stage B entry: clean tree + the Stage A proposal (uncommitted). At
close, all Stage B files (and the proposal) are **staged in the index
and uncommitted** — `git status --short` shows exactly the file list in
§17 plus the proposal; nothing was committed, and no pre-existing work
was reset, discarded, or modified outside the approved file set. The
docs this report adds remain unstaged.

## 4. Stage B entry re-verification (live, keyless)

Repeating the proposal's §4 probes at Stage B entry:

| Probe | Result |
|---|---|
| OData `$top=3&$filter=Collection/Name eq 'SENTINEL-2'` | 200 keyless, real 2026 products (unchanged) |
| OData spatial clause `OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((…))')` + `contains(Name,'MSIL1C/2A')` + `ContentDate/Start` bounds | **200 keyless with real products inside the polygon** — the §4.8 400 was a syntax issue (`OData.CSpatial/intersects`), as hypothesized; the documented canonical form works |
| `$select=Id,Name,ContentDate,GeoFootprint,Online,PublicationDate`, `$orderby=ContentDate/Start desc`, `$top` | All supported; `GeoFootprint` is GeoJSON `[lon,lat]` |
| Encoding | spaces→`%20`, quotes→`%27`, parentheses raw — the provider's encoder is test-pinned to reproduce the verified probe filter byte-for-byte after decoding |

Interpretation recorded for Phase 7: the keyless OData path remains
delivery-compatible; STAC item search remains auth-gated; downloads
remain credential-gated.

## 5. Architecture and data flow

As proposed §9, built without rework to existing seams:

```
SceneSearchPanel (draft form + globe-pick AOI; dynamic-imported)
  → SentinelApp: committed sceneQuery owns the SWR key
    → useSceneSearch (SWR: no retries, no focus polling, dedupe 2 s)
      → GET /api/v1/scenes (NEW, validated + TTLCache + rate class)
        → src/server/providers/cdse-catalogue.ts (NEW)
            ├ allow-list: collection → (Collection/Name, Name contains)
            ├ filter/URL builder (constants only; encoder pinned)
            ├ response validation (envelope shape, item shape)
            └ footprint capture (GeoJSON Polygon | MultiPolygon, caps)
  → EarthRenderer passthrough (footprints/selectedSceneId/onSceneSelect)
    → CesiumEarth → cesiumFootprints.ts (lazy chunk ONLY)
        ├ id-keyed entity diff `${sceneId}#${polyIndex}`
        ├ pick routing: observation → footprint → ellipsoid readout
        └ disposal on data/layer/unmount/StrictMode
```

- The provider is server-only; the browser holds nothing secret (there
  is nothing secret — keyless).
- `data_status` extends the existing vocabulary (`live`/`stale`/
  `unavailable`) with no new states.
- No store, no URL-state change (scene results are session-local), no
  imagery-factory involvement.

## 6. Provider details (`src/server/providers/cdse-catalogue.ts`)

| Aspect | Value |
|---|---|
| Endpoint | `https://catalogue.dataspace.copernicus.eu/odata/v1/Products` (constant; env-overridable via `CDSE_ODATA_URL`, timeout via `CDSE_TIMEOUT`) |
| Auth | none (keyless, verified live repeatedly) |
| Source label | `CDSE OData` |
| Collections | `sentinel-2-l1c` (default), `sentinel-2-l2a`, `sentinel-1-grd`; allow-list maps to `Collection/Name` + `contains(Name, …)` pairs; forged ids throw before any fetch |
| Filter | `Collection/Name eq '…' and contains(Name,'…') and OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((…))') and ContentDate/Start gt … lt …` |
| Select/order | `Id,Name,ContentDate,GeoFootprint,Online,PublicationDate`; `ContentDate/Start desc` |
| Limits | `$top` = requested limit (default 20, max 20); response normalized and truncated at the limit |
| TTL | `SCENES_TTL = 900` s (route cache) |
| Attribution | `Contains modified Copernicus Sentinel data [<current year>]` (dynamic year) |
| Validation | envelope shape violation → throws (route delivers honest stale/unavailable); malformed items are skipped, never guessed; footprint vertex cap 4,096 → `footprint: null` + scene kept |

## 7. API route (`/api/v1/scenes`)

`GET /api/v1/scenes?bbox=minLon,minLat,maxLon,maxLat[&collection][&start][&end][&limit]`

- **Validation** (`src/server/validation.ts`): bbox required, strict
  four-number parse; collection ∈ allow-list; window: `start < end`,
  span ≤ `MAX_SCENE_WINDOW_DAYS = 45`, defaults `end = now`,
  `start = end − DEFAULT_SCENE_WINDOW_DAYS (14)`; `limit` parsed with
  `parseLimit(20, 20)`. All failures → 400 `INVALID_PARAMS` envelope,
  never forwarded upstream.
- **Cache**: key `scenes:v1:collection=…:bbox=<trimmed raw>:start=<ISO>:end=<ISO>:limit=…`;
  LIVE hit → `Cache-Control: public, s-maxage=900, stale-while-revalidate=1800`.
- **Honesty paths**: provider failure with an expired LIVE entry →
  rewritten `STALE` (no-store); provider failure without one → empty
  `UNAVAILABLE` payload (no-store); never fabricated scenes. Errors are
  logged server-side (`CDSE OData scene search failed`).
- **Rate limit**: route added to the existing heavy class in
  `src/server/rate-limit.ts`.
- One request per user action; no polling; no client-side fan-out.

## 8. Client pipeline

- **Types** (additive in `src/types/index.ts`): `SceneCollectionId`,
  `SceneFootprint` (Polygon | MultiPolygon union), `SceneSummary`,
  `SceneSearchPayload`. Wire fields are snake_case
  (`content_date`, `publication_date`) matching the existing
  `EventDetail`/`LayerData` convention.
- **API client** (`src/services/api.ts`): `fetchScenesPath` →
  `fetchEnvelope<SceneSearchPayload>` (abort-safe, existing pattern).
- **Hook** (`src/hooks/useSceneSearch.ts`): `buildSceneSearchPath`
  returns the canonical path or `null` for missing/invalid bbox (null =
  SWR fetches nothing → globe drains); `useSceneSearch` enforces no
  retries, no focus polling, `dedupingInterval: 2000`, and exposes
  `payload/scenes/count/attribution/loading/validating/error/dataStatus/cacheHit/refetch`.
- **Panel** (`SceneSearchPanel.tsx`): draft form (bbox, collection,
  from/to date inputs), "Use globe pick" builds a ±0.5° bbox from the
  last picked coordinate, results list (name, sensed date, collection,
  offline badge), inline detail (id, sensed UTC, online, published
  UTC, attribution), provenance chip (LIVE/CACHED/STALE/UNAVAILABLE +
  source), Clear (reset results + footprints) and Close controls.
  Re-seeding on a committed query uses a remount `key`
  (`bbox|start|end|collection`) — deliberately not a setState-in-effect
  (lint-rule-safe and simpler).
- **App wiring** (`SentinelApp.tsx`): dynamic import (`ssr: false`),
  committed `sceneQuery` state owning the SWR key, handlers
  (`handleSceneSearch/Select/Clear/PanelToggle`), panel-slot priority
  (Scenes while open → DataPanel → null), StatusDock + EarthRenderer
  props threaded.
- **Dock** (`StatusDock.tsx`): Satellite-icon "Scenes" toggle,
  Cesium-gated (`rendererInfo?.active === 'cesium'`) and sm+ only,
  `aria-pressed`, tooltip.
- **Globe** (`cesiumFootprints.ts` + `CesiumEarth.tsx`): id-keyed
  entity diff, outer-ring-only raw `hierarchy` Cartesian3 positions,
  fill/outline styling (cyan family; selected variant), selection
  repaint via per-scene flags, deterministic caps, entity-id → owner map
  → scene pick; click routing priority **observation → footprint →
  ellipsoid readout** (the Phase 2 readout contract is preserved);
  footprints get a pointer cursor (no hover card this phase); sync
  effect on `[footprints, selectedSceneId]`; full disposal on
  unmount/StrictMode.

## 9. Provenance and temporal semantics

- `ContentDate/Start` is presented as **sensed/acquisition time**,
  never as live coverage; `PublicationDate` is shown separately or
  "— not reported —"; `Online` is shown as yes/no/unknown, never
  defaulted.
- Attribution `Contains modified Copernicus Sentinel data [2026]` is
  displayed in the panel (results header and detail block) and carried
  in the payload; it is a display string, not a live claim.
- Envelope `data_status` + `cache_hit` drive the same chips as all
  other surfaces (`LIVE`/`CACHED`/`STALE`/`UNAVAILABLE`), and the
  source string (`CDSE OData`) is shown next to the chip.
- Empty results render "No scenes in this area and window." — empty ≠
  error, matching provider conventions.

## 10. Caching and freshness behavior

- Server: 900 s TTL + `stale-while-revalidate=1800`; expired entries
  are retained for stale serving (`MemoryCache.get()` returns null for
  expired; `getStale()` exists; TTL 0 = instantly expired — used by
  route tests to seed expired LIVE entries for STALE mapping).
- Client: SWR `dedupingInterval: 2000`, no revalidation storms; a new
  committed query is a new key (old data is not re-labeled).
- Honesty: provider/network failure never blanks the globe —
  footprints are held by the committed query until the user clears or
  replaces it; the panel shows the honest STALE/UNAVAILABLE state.
- Operational note: when `start`/`end` are omitted, the route defaults
  a *now-based* window per request, so ad-hoc requests each miss the
  cache by design. The client always submits explicit dates, so normal
  app flows cache as intended (verified: repeat identical requests hit
  `cache_hit: true`).

## 11. Geographic correctness

- GeoJSON `[lon, lat]` order preserved end-to-end;
  `Cartesian3.fromDegrees(lon, lat, 0)` in the entity layer.
- Polygon and MultiPolygon accepted; rings rendered as returned
  (outer ring only in Stage B) with the parse/entity caps from §6/§8.
- Vertex cap overflow on parse → `footprint: null` (scene still listed
  with metadata) — explicitly "shown as missing", never guessed or
  substituted with a bbox rectangle.
- Invalid/NaN coordinates cannot enter an entity (parse guards +
  entity-side validation in the lazy module, mirroring
  `cesiumObservations` discipline).
- Not exercised live in Stage B: multi-ring/antimeridian-crossing
  products (none appeared in the verification AOIs). The parser
  preserves rings as returned and the caps bound worst cases; flagged
  for Phase 7/8 review if such products surface.

## 12. Security review

- No secrets, tokens, or credentials anywhere in the feature (keyless
  by decision Q2); no `.env` additions required for the default path.
- No user input reaches upstream URLs as arbitrary values: collection
  ids go through the allow-list (throw otherwise); the bbox is
  numeric-parsed; window values are ISO-normalized; the filter is
  built from constants + validated numerics only; `encodeURIComponent`
  plus apostrophe `→ %27` handling is test-pinned.
- New origin: exactly one allow-listed constant
  (`catalogue.dataspace.copernicus.eu`); no redirects followed from
  user data; no download/asset fetching client-side (display-only).
- CSP posture unchanged (report-only; verified in smoke via served
  headers); no new inline script/style; no `dangerouslySetInnerHTML`.
- Rate discipline: heavy class, one upstream request per user action,
  TTL cache, page cap 20; no auto-polling.
- Error surfaces are generic (`Unexpected CDSE OData response shape`),
  no upstream payload echoes.

## 13. Tests and results

New suites (all green; 41 new tests):

| Suite | Tests | Focus |
|---|---|---|
| `src/server/providers/cdse-catalogue.test.ts` | 16 | filter byte-for-byte vs verified probe (decoded), URL builder, allow-list throw pre-fetch, envelope/item validation, footprint cap, limit truncation, non-200 throw |
| `src/app/api/v1/scenes/route.test.ts` | 10 | validation matrix 400s, cache key, LIVE headers, STALE rewrite (seeded expired entry), UNAVAILABLE empty payload, no-store on failure |
| `src/hooks/useSceneSearch.test.tsx` | 6 | canonical path/null semantics, SWR flags, no retries/polling, envelope consumption |
| `src/components/globe/cesiumFootprints.test.ts` | 9 | id-diff add/remove/repaint, selection flags, cap truncation, pick mapping, destroyed-viewer no-op, dispose |

Full suite: **92 files / 891 tests green** (was 850 at Phase 5 close;
+41). Typecheck and lint clean (lint caught and I fixed: an unused
import, a setState-in-effect pattern replaced by the remount-key
design, and a duplicated handler block ordering).

Known pre-existing issues, verified at HEAD before Phase 6 via a
temporary `git worktree` + `node_modules` junction (worktree removed
afterwards): `SentinelApp.a11y.test.tsx` emits 5 unhandled Radix
`react-use-size` `inlineSize` jsdom errors at HEAD as well — not
introduced by this phase. One isolation-run timeout (a11y focus test,
5000 ms) passed on two re-runs and in the full suite (the known
contention flake; zero assertion failures).

## 14. Live production route verification

Fresh `next start` from the Stage B build; probes with
`Invoke-WebRequest` (evidence:
`C:\Users\Simra\AppData\Local\Temp\scenes-evidence\`):

| Probe | Result |
|---|---|
| `bbox=139,35,140,36&collection=sentinel-2-l2a` | 200, `live`, **12 scenes**, real names (e.g. `S2B_MSIL2A_20261013T012659…T54SVD…`), footprint Polygon ~12+ vertices, `online: true`, attribution `Contains modified Copernicus Sentinel data [2026]`, `Cache-Control: public, s-maxage=900, stale-while-revalidate=1800` |
| same query repeated with explicit window | cold 1,587 ms → warm **40 ms**; raw meta `"cache_hit":true`; `"cached_at"` distinct from `"timestamp"` |
| `collection=sentinel-1-grd` | 200, `live`, 12 scenes (e.g. `S1C_IW_GRDH_1SDV_20261013T083258…`) |
| unknown collection | 400 `Invalid collection "sentinel-3": must be one of sentinel-2-l1c, sentinel-2-l2a, sentinel-1-grd.` |
| `start` after `end` | 400 `Invalid window: start must precede end.` |
| span 78 days | 400 `Invalid window: the start/end span exceeds 45 days.` |
| malformed bbox | 400 `Invalid bbox: expected 'minLon,minLat,maxLon,maxLat'.` |
| missing bbox | 400 `bbox is required: expected 'minLon,minLat,maxLon,maxLat'.` |

The STALE and UNAVAILABLE branches were **not** induced live (no CDSE
outage can be staged honestly); they are covered by the route unit
tests and reuse the existing envelope/cache machinery. Recorded as
such rather than claimed as live.

## 15. Production smoke (real browser)

Extended `scripts/browser-smoke.mjs` with a Phase 6 block (5 scenarios,
all real clicks; plus the harness refinements below). Final run
**30/30 PASS** — evidence `C:\Users\Simra\AppData\Local\Temp\smoke-phase6-final\`
(`report.json` + 18 screenshots):

- Scenes control present on the Cesium path; toggle opens the panel
  (`section[aria-label="Sentinel scene search"]`).
- A real canvas click picks the globe (Africa view in the harness),
  the pick button seeds the bbox (`1.13,13.08,2.13,14.08`), and the
  submitted search resolves against the live catalogue: **20 rows**,
  status chip LIVE (cold) — an earlier repeat run showed **CACHED**
  (warm, within TTL) — zero error banners.
- Row click expands the inline SCENE DETAIL block (id, sensed,
  online, published).
- Screenshots reviewed: panel chrome with chips/attribution, scene
  rows, expanded detail, and the **highlighted footprint quad visible
  on the globe at the searched AOI** (selected-state cyan outline).
- Network accounting: `/api/v1/scenes` responses tallied in
  `report.json`; the final run shows 200s only.

Harness refinements made during smoke work (all documented in-file):

1. **Gate precision fix**: the Phase 3-era final check required *all*
   `wmts.cgi` responses = 200. Investigation of a failing tally proved
   the non-200s were exclusively `request=GetFeatureInfo` probes that
   Cesium issues when picking imagery under clicks — GIBS answers 501
   "Not Implemented" for raster layers that do not implement feature
   info, which Cesium treats as "no features found". The gate now
   hard-checks **GetTile only** (438/438 × 200 in the final run) and
   tallies feature-info informationally (`0/6` × 200 — expected).
2. First-run hint is pre-dismissed in the Phase 6 block so the overlay
   cannot swallow the AOI-seeding click.
3. Stable harness ids added for the new controls
   (`sentinel-scenes-toggle/use-pick/search`), matching the existing
   `sentinel-settings-button` convention.

Run history note (honest): the first fully green scenes run had the
501 tally above; a subsequent re-run and one further attempt failed
because the verification server process died silently mid-run (no
crash trace; restarted; environment classified). The final two runs
were green end-to-end. None of these affected committed code — all
were harness/ops conditions.

## 16. Bundle and performance measurements

- Initial JS: **204,168 / 204,800 B gzip — PASS**, headroom 632 B
  (+1,359 B vs Phase 5 close 202,809 B; +the client hook, types, and
  dock/app wiring that legitimately live in the initial graph).
- The panel is a **lazy chunk** (`static/chunks/29.<hash>.js` via
  `react-loadable-manifest`: `SentinelApp.tsx -> SceneSearchPanel`);
  `bundle:check` counts only the initial route graph, so the panel's
  cost is not in the 200 KiB gate. No budget stop-rule was triggered.
- Textures: both tiers MET (`3.638 MiB`, unchanged paths).
- Runtime: Viewer ready 3.5–4.8 s in smoke runs (Phase 5 baseline
  4.3–6.6 s) — no perf signal from the footprint layer; entity sync is
  diff-based and the lazy module only loads on demand.

## 17. Files added, modified, or removed

Added (6 source + 4 test + 2 docs):

- `src/server/providers/cdse-catalogue.ts` (+ `.test.ts`)
- `src/app/api/v1/scenes/route.ts` (+ `route.test.ts`)
- `src/hooks/useSceneSearch.ts` (+ `.test.tsx`)
- `src/components/globe/cesiumFootprints.ts` (+ `.test.ts`)
- `src/components/panels/SceneSearchPanel.tsx`,
  `src/components/panels/sceneCollections.ts`
- Docs: `PHASE_6_IMPLEMENTATION_REPORT.md` (this file),
  `PHASE_6_ACCEPTANCE_CHECKLIST.md`

Modified (10 + 2 docs):

- `src/types/index.ts` (additive scene types),
  `src/server/config.ts` (`CDSE_ODATA_URL` + timeout),
  `src/server/validation.ts` (scene window parsing + constants),
  `src/server/rate-limit.ts` (heavy class),
  `src/services/api.ts` (`fetchScenesPath`),
  `src/components/globe/CesiumEarth.tsx` (footprint props, pick
  routing, sync/dispose),
  `src/components/globe/EarthRenderer.tsx` (passthrough),
  `src/components/shell/StatusDock.tsx` (Scenes toggle),
  `src/components/app/SentinelApp.tsx` (dynamic panel, state, wiring),
  `scripts/browser-smoke.mjs` (5 scenarios + gate precision fix +
  harness ids),
  `docs/architecture/CESIUM_MIGRATION_BACKLOG.md`,
  `docs/architecture/IMAGERY_LAYER_PROVIDER_REFERENCE.md`.

Removed: none. (`PHASE_6_SCOPE_PROPOSAL.md` — Stage A — is part of the
tree per its own stage; see §3 for the index state.)

## 18. Failed, blocked, or unrun checks

- **Not induced live**: CDSE outage → STALE/UNAVAILABLE paths
  (unit-tested; cannot honestly stage an upstream outage).
- **Not exercised live**: multi-ring/antimeridian products (none in
  the verification AOIs); `$top` > 20 (capped by design);
  simplification (not implemented — see §2.3).
- **Environmental, characterized**: silent verification-server death
  mid-smoke (restarted; no code involvement); first-run 501
  feature-info tally (root-caused and gated precisely); known
  pre-existing Radix unhandled jsdom errors (worktree-verified at
  HEAD); one known contention flake (re-run green).
- No blocked or unrun mandatory check. No gate was weakened: the one
  gate edited (wmts) was *made more precise*, not looser, and the
  imagery still hard-fails on any non-200 GetTile.

## 19. Acceptance verdict

All proposal acceptance items A1–G1 (checklist
`PHASE_6_ACCEPTANCE_CHECKLIST.md`) are satisfied with cited evidence.
Verdict: **COMPLETE** — pending the user's independent manual
verification pass (deferred by explicit instruction).

## 20. Confirmation that Phase 7 was not started

No scene rendering, tiling proxy, WMTS/Process API, COG handling,
downloads, or credential infrastructure exists anywhere in the tree.
O5 (auto-rotate), O6 (home/reset), O8 (rasters), STAC,
Sentinel Hub, and the default-renderer flip remain untouched by
binding decision. Nothing was committed during this phase.

## Regenerating evidence

- Route evidence: `npm run build && npm run start -- -p 3100`, then
  probe `http://localhost:3100/api/v1/scenes?bbox=139,35,140,36&collection=sentinel-2-l2a`
  (any client). Stored samples:
  `C:\Users\Simra\AppData\Local\Temp\scenes-evidence\`.
- Browser evidence: `npm run smoke:browser -- --base-url http://localhost:3100 --out <dir>`;
  final artifacts in `C:\Users\Simra\AppData\Local\Temp\smoke-phase6-final\`
  (report.json + screenshots `01`–`18`, scenes shots are `15`–`16`).
