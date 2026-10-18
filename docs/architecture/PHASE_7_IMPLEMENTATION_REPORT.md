# Phase 7 Implementation Report — Sentinel Scene Rendering (tiled imagery)

Spec: backlog "Phase 7 — Sentinel scene rendering (tiled imagery)" section
(`CESIUM_MIGRATION_BACKLOG.md`), executed under the Phase 6 standing rule
("keyless access only") and the Phase 7 working constraints (below).
Predecessors: Phase 1–6 reports and checklists; provider reference
(`IMAGERY_LAYER_PROVIDER_REFERENCE.md`, updated).
Environment: Windows, Node v24.15.0, Next.js 15.5.27, `cesium@1.146.0`
(exact) — same stack as Phase 6.

> **Verification status (read this first).** This phase was implemented
> under an explicit constraint: the implementing agent wrote code and tests
> but executed **no repository tooling** — no `npm test`, no typecheck, no
> lint, no build, no bundle check, no browser smoke. The only live evidence
> collected is a set of **read-only provider probes** (plain HTTP GETs
> against CDSE and Planetary Computer, §3). Every claim about compiled
> code, test results, bundle size, or browser rendering below is marked
> **NOT RUN** and must be produced by the verification pass described in
> §12 and the acceptance checklist. Nothing in this tree was committed.

## 1. Executive summary

The selected-scene rendering slice of Phase 7 is implemented: after a
Sentinel scene is selected in the Phase 6 catalogue panel, the app can
resolve it to a **keyless, georeferenced, tiled raster** and toggle it onto
the Cesium globe as a dedicated overlay layer.

- **Provider path (substitution, recorded)**: the backlog named Sentinel
  Hub Process API proxy or a COG tiling proxy. Both require credentials
  and/or new infrastructure that were not authorized/provisioned. The
  delivered path is the **Microsoft Planetary Computer (PC) Data API**
  (keyless, verified live) — consistent with the Phase 6 Q2 "keyless
  access" standing rule and the Phase 7 constraint set.
- **Server**: new `src/server/providers/scene-raster.ts` + validated route
  `GET /api/v1/scenes/raster?scene=<cdse-guid>`. The client passes only
  the scene GUID; the canonical CDSE product name is re-fetched by id, the
  PC item is located by **exact-name filter**, its identity is
  **re-checked**, and a strictly validated descriptor is returned.
  Renderable → LIVE + `s-maxage=900`; terminal non-renderable answers
  (`unsupported`, `not_found`) → honest UNAVAILABLE envelopes, short
  cached; transport failures → STALE (expired entry) or UNAVAILABLE —
  never a fabricated raster.
- **Client**: `useSceneRaster` (SWR, one request per selection, no
  retries/polling) + `cesiumSceneRaster.ts` (lazy-chunk factory that
  re-validates the descriptor against pinned PC origins before any Cesium
  URL exists) + `CesiumEarth` raster overlay lifecycle (add-then-remove,
  graticule re-raised above the raster, bounded tile retries, single
  honest failure report per layer generation) + an explicit
  **"Show raster on globe"** toggle in `SceneSearchPanel` (default off)
  with provider-rendered preview, rendering description, and attribution.
- **Not implemented (by scope/constraint)**: Sentinel Hub, any proxy
  route, any credential, L1C rendering (no PC collection — honestly
  reported as unsupported), downloads, NDVI, processing pipelines, CSP
  enforcement changes, Phase 8 items.

Live read-only probes verified the PC tile endpoint serves keyless PNG
tiles and both exact-name filters resolve; the full runtime matrix
(tests/typecheck/lint/build/bundle/smoke) is **NOT RUN** (§12).

## 2. Authorization, scope, and deviations

**Binding constraints honored** (from the Phase 7 instruction set):

1. Implementation only — no test/lint/typecheck/build/bundle/smoke
   execution by the agent (except read-only provider probes, which are
   research, not repository tooling).
2. No new backend, proxy, scheduler, database, or infrastructure without
   explicit authorization → tiles are fetched **directly** browser→PC from
   a descriptor resolved server-side; no proxy route was added.
3. No credentials or tokens anywhere new; the delivered path is keyless.
4. CSP untouched (report-only, as shipped in Phase 4; the PC host is
   recorded for the Phase 8 enforcement decision).
5. No claims of runtime verification; all unrun checks are labelled.

**Deviations from the backlog text, each deliberate and recorded:**

1. **Sentinel Hub/COG proxy → Planetary Computer Data API.** The backlog
   lists "(a) Sentinel Hub Process API → server proxy … or (b) COG tiling
   proxy" with prerequisite "credentials provisioned". None were
   provisioned; constraints 2–3 rule both out. PC provides
   server-rendered tiles for Sentinel-2 L2A and Sentinel-1 GRD with no
   credentials, satisfies "tiles through a tile service (never raw
   products)", and is the documented replacement.
2. **No WMTS layer; XYZ `UrlTemplateImageryProvider`.** PC serves
   WebMercatorQuad XYZ tiles (verified scheme: `xyz`, levels 0–24, 256
   px), which map exactly onto Cesium's default `WebMercatorTilingScheme`.
3. **Scene-id-only client contract.** The client never sends product
   names or URLs; the server resolves both and only emits pinned-origin
   templates. This is stricter than the backlog's "allow-list" wording and
   is the security boundary (§8).
4. **Zoom clamp at level 14.** PC advertises maxzoom 24; the descriptor
   clamps to 14 (~10 m native) and says so in `resolution_note`. Beyond
   that, zooming interpolates pixels — presented honestly instead of
   offering 25 m-of-CTA-style fake detail.
5. **Scope trim**: S1 rendering uses PC's default dual-pol composite
   rendering (VV/VH ratio), not custom band math. No NDVI, no custom
   styles, no downloads (all out of scope).
6. **Raster opacity control omitted** (backlog task list mentions
   "add/remove/opacity"): the delivered scene-layer UI is an explicit
   show/hide toggle at full presence. Rationale: the constrained phase
   prioritized honest add/remove + provenance; a second opacity surface
   for a transient per-scene overlay adds UI risk without a verified
   need. Recorded as not delivered (follow-up candidate).
7. **Cost/quota monitoring note is n/a**: the substituted keyless path
   has no credential-linked quota or billing. Upstream load is bounded
   instead by server TTLs (900/300 s), one-scan-per-selection client
   semantics, no polling, and no retry loops (tile retries capped at 2
   then disabled); a heavy-class rate-limit review for both scene routes
   is carried to Phase 8.

## 3. Provider research and live probe evidence

All probes below were plain read-only HTTP GETs performed during the
planning session (no repository tooling executed). They are the basis for
every pinned constant in `scene-raster.ts`.

**3.1 Rejected alternatives (recorded, not implemented).**

- CDSE Sentinel Hub (Process API): requires OAuth2 client credentials —
  not provisioned (Phase 6 §3 decision stands).
- CDSE OData quicklooks: download is gated by a public access token and
  the quicklook carries no documented georeferencing — fails the
  "georeferenced tiles" requirement even with the token.
- Building a COG tiling proxy: forbidden by constraint 2 (new
  infrastructure without authorization).

**3.2 Planetary Computer verification (selected path).**

| Probe | Observed result |
|---|---|
| `GET .../api/data/v1/item/tiles/WebMercatorQuad/6/50/19@1x?collection=sentinel-2-l2a&item=S2A_MSIL2A_20261017T044231_R033_T48VUJ_20261017T070302&assets=visual&asset_bidx=visual%7C1,2,3&nodata=0&format=png` | **HTTP 200 PNG, no SAS token** — keyless rendering confirmed (imagery dated 2026-10-17) |
| `GET .../api/stac/v1/collections/sentinel-2-l2a/items?filter=s2:product_uri = '<S2B_…_N0513_…>.SAFE'&limit=1` | **200**, returns the exact item; L2A item id drops the `_N0513` baseline segment |
| `GET .../api/stac/v1/collections/sentinel-1-grd/items?filter=s1:product_identifier = '<S1C_…_013C8F_653B>'&limit=1` | **200**, returns the exact item; identifier = CDSE name minus `.SAFE` |
| `GET .../api/stac/v1/search?filter=…` | **504 (twice)** — the `/search` endpoint with filters is unusable; the collection-items endpoint is the working shape the code uses |
| `GET .../api/stac/v1/collections/sentinel-2-l1c` | **404** — no L1C collection exists on PC |
| tilejson (`.../item/tilejson.json?collection=…&item=…`) | scheme `xyz`, 256 px, zoom 0–24, `bounds` present; default S1 rendering query captured (`assets=vv&assets=vh&expression=vv;vh;vv%2Fvh&rescale=0,600&rescale=0,270&rescale=0,9&asset_as_band=True&tile_format=png&format=png`) |

**3.3 CDSE by-id verification (used for canonical names).**

| Probe | Observed result |
|---|---|
| `Products?$filter=Id eq <guid>&$select=Name` (unquoted GUID) | **200** with the product `Name` (includes `.SAFE`) |
| `Products?$filter=Id eq '<guid>'` (quoted) | 200 with **empty** value set |
| `Products(<guid>)` entity URL | **404** (with or without `$select`/`$expand`) |

The unquoted form is the only working one — hence the strict GUID shape
guard (`parseSceneId`) before interpolation (§8).

**3.4 What the probes do NOT establish.** CORS acceptance for PC tile
requests from a browser origin, tile pacing under real zooming, and CSP
report content are **browser-runtime questions**. The PC Data API is
designed for browser clients and no credential/token defects were
observed, but per constraint 5 this report treats them as assumptions
until the browser pass runs (§12, checklist §D).

## 4. Architecture and contracts

**Leader flow**: `SceneSearchPanel` selection → `SentinelApp` state →
`useSceneRaster(sceneId)` → `GET /api/v1/scenes/raster?scene=<guid>` →
`resolveSceneRaster` (CDSE by-id → name → classify → PC item by
exact-name filter → identity re-check → descriptor) → panel renders
availability + toggle → toggle on → descriptor flows through
`EarthRenderer` → `CesiumEarth` raster effect → validated provider →
overlay layer.

**Route payload** (`SceneRasterPayload`, snake_case like every wire type):

```
scene_id: string            // the validated GUID (lowercased)
scene_name: string | null   // canonical CDSE name, null only when not found
status: 'renderable' | 'unsupported' | 'not_found' | 'unavailable'
raster: SceneRasterDescriptor | null   // non-null iff 'renderable'
reason: string              // always present, human-explainable
attribution: string         // PC attribution when renderable, else Sentinel
data_status: { status, source, fetched_at, message }
```

**Descriptor** (the only thing that can become a Cesium URL):

```
provider: 'microsoft-planetary-computer'
collection: 'sentinel-2-l2a' | 'sentinel-1-grd'
item_id: string                              // PC STAC item id, slug-guarded
tile_url_template: string                    // pinned PC Data API origin + exact rendering query
preview_url: string | null                   // PC-host URL or dropped
bbox: [west, south, east, north] (degrees)   // from the PC item, sanity-checked
min_zoom: 0, max_zoom: 14
rendering: string                            // e.g. "True color (visual band composite 1–2–3)"
resolution_note: string                      // "~10 m native pixels; zoom beyond 14 interpolates…"
```

**Statuses and provenance mapping**:

| Outcome | HTTP | `data_status` | Cache |
|---|---|---|---|
| Renderable | 200 | LIVE, source PC | in-memory 900 s, `public, s-maxage=900, swr=1800` |
| Unsupported (L1C / unknown class) | 200 | UNAVAILABLE, source CDSE | in-memory 300 s, `no-store` |
| Not found (catalogue or PC mirror) | 200 | UNAVAILABLE, source CDSE | in-memory 300 s, `no-store` |
| Transport/shape failure w/ expired entry | 200 | STALE (rewritten, original `fetched_at` kept) | `no-store` |
| Transport/shape failure, no entry | 200 | UNAVAILABLE, source PC | `no-store` |
| Invalid/missing `scene` | 400 | — | `no-store` |

Identity rule: a PC item whose `s2:product_uri` / `s1:product_identifier`
does not match the CDSE name (after `.SAFE` normalization) is a **failure**
(route → STALE/UNAVAILABLE). Serving the wrong product's pixels is treated
as a data-integrity violation, not a degradation.

**Client lifecycle** (`CesiumEarth` raster effect):

- Descriptor key = `collection|item_id`; same key = no-op (no rebuild).
- Add-then-remove: previous raster removed only after the replacement is
  attached; construction failure keeps the previous map and reports.
- Graticule is `raiseToTop`-ed after every raster attach (reference frame
  stays legible above the raster).
- Tile errors: first failure per generation reports once
  ("… tiles are failing to load. The previous map remains visible.");
  after `SCENE_RASTER_MAX_TILE_RETRIES = 2`, `error.retry = false` — no
  retry loops against a broken endpoint.
- `phase` participates in the effect deps so a descriptor already present
  at mount attaches once the Viewer is ready; teardown detaches the
  listener and drops refs (StrictMode-safe, same contract as the base
  layer and footprints).
- UI toggle defaults **off** and is session state (not persisted, not in
  the URL); the preview image and attribution render in the panel only —
  the preview is never stretched onto the globe.

## 5. Files added, modified, removed

Added (4 source + 3 test + 2 docs):

- `src/server/providers/scene-raster.ts` (+ `scene-raster.test.ts`)
- `src/app/api/v1/scenes/raster/route.ts` (+ `route.test.ts`)
- `src/hooks/useSceneRaster.ts`
- `src/components/globe/cesiumSceneRaster.ts` (+ `cesiumSceneRaster.test.ts`)
- `docs/architecture/PHASE_7_IMPLEMENTATION_REPORT.md` (this file)
- `docs/architecture/PHASE_7_ACCEPTANCE_CHECKLIST.md`

Modified (9 source + 2 docs):

- `src/types/index.ts` — Phase 7 raster types (descriptor, payload, status)
- `src/server/validation.ts` — `parseSceneId` + `isSceneId` (GUID guard)
- `src/server/config.ts` — `PC_STAC_URL` default, `pcStacUrl`,
  `pcTimeoutMs`
- `src/services/api.ts` — `api.fetchSceneRasterPath`
- `src/components/globe/imageryLayers.ts` — `SUPPORTED_IMAGERY_PROVIDERS`
  gains `microsoft-planetary-computer` (dynamic provider note)
- `src/components/globe/CesiumEarth.tsx` — raster props, overlay
  lifecycle effect, teardown
- `src/components/globe/EarthRenderer.tsx` — pass-through props
- `src/components/panels/SceneSearchPanel.tsx` — raster section (toggle,
  preview, rendering/limit text, attribution, error lines)
- `src/components/app/SentinelApp.tsx` — `useSceneRaster` wiring, toggle
  state, error state, renderer/panel props
- `docs/architecture/CESIUM_MIGRATION_BACKLOG.md` — Phase 7 status entry
- `docs/architecture/IMAGERY_LAYER_PROVIDER_REFERENCE.md` — §1b raster
  provider section + unimplemented-list update

Removed: none. No dependency added.

## 6. Server implementation details

- **CDSE by-id** (`buildCdseProductUrl`): `Products?$filter=<enc("Id eq
  <guid>")>&$select=Name` — the verified unquoted form; empty `value` →
  `not_found` terminal.
- **Classification** (`classifySceneName`): `_MSIL2A_` → `sentinel-2-l2a`;
  `_GRD` → `sentinel-1-grd`; everything else → `unsupported` (L1C reason
  text names the missing PC collection explicitly).
- **PC lookup** (`buildPcItemsUrl`): collection-items endpoint with
  `filter` + `limit=1` — **never** `/search` (verified 504). Envelope
  shape violations throw.
- **Identity + geometry checks** (`buildSceneRasterDescriptor`):
  name-identifier match required; bbox required (finite, in-range,
  `west<east`, `south<north`; antimeridian-crossing footprints are
  rejected as unsupported-by-rectangle rather than misplaced).
- **Tile template** (`buildPcTileTemplate`): exact rendering queries
  captured live; item id must match `/^[A-Za-z0-9._-]+$/` before
  interpolation; L2A uses `assets=visual&asset_bidx=visual%7C1,2,3&nodata=0`,
  S1 uses the dual-pol composite query. `token=` never appears.
- **Preview**: only `rendered_preview.href` values on the PC host become
  `preview_url`; anything else is dropped to `null`.
- **Route** mirrors the Phase 6 scenes route: `force-dynamic`, per-instance
  `MemoryCache` keyed `scene-raster:v1:<guid>`, positive/negative TTLs,
  stale rewrite preserving `fetched_at`, `publicCacheControl` only for
  LIVE renderable payloads, `logError` on failure, `internalError` catch.

## 7. Client implementation details

- `useSceneRaster`: canonical path builder doubles as SWR key
  (`/scenes/raster?scene=<guid>`, null for anything but a strict GUID);
  `dedupingInterval 2000`, revalidate-on-reconnect only, no focus/interval
  polling, no retries; returns payload/loading/error/dataStatus/refetch.
- `cesiumSceneRaster.ts` (lazy chunk only; type-only cesium imports):
  - `isValidSceneRasterDescriptor` — provider id, collection, slug item
    id, template prefix `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/`,
    `{z}/{x}/{y}` presence, no `token=`, preview origin, bbox ranges and
    ordering, integer zooms within `0..16`, min ≤ max.
  - `createSceneRasterImageryProvider` — throws
    `UnsupportedSceneRasterError` on invalid input; otherwise a
    `UrlTemplateImageryProvider` with 256 px tiles, `minimumLevel`/
    `maximumLevel` from the descriptor, `Rectangle.fromDegrees(bbox)`,
    `hasAlpha: true`, optional `Credit`.
- `CesiumEarth`: props `sceneRaster`, `sceneRasterCredit`,
  `onSceneRasterError`; refs `rasterLayerRef`, `activeRasterKeyRef`,
  `detachRasterErrorRef`, `rasterErrorCountRef`; effect as described in
  §4; mount teardown detaches the error listener and drops all raster
  refs.
- `SceneSearchPanel`: "Scene raster" block inside the selected-scene
  detail — resolving spinner, resolution failure alert, toggle button
  (`sentinel-scene-raster-toggle`, `aria-pressed`), provider preview
  image, `rendering` + `resolution_note` lines, attribution, and a
  separate tile-failure alert (`layerError`) so resolution failures and
  tile failures are never conflated.
- `SentinelApp`: only `status === 'renderable'` payloads AND an enabled
  toggle produce a descriptor; credit text comes from the payload
  attribution; `sceneRasterLayerError` is parent-owned (same pattern as
  `imageryError`) so the panel and globe never disagree.

## 8. Security posture

- **Input**: the client sends only `scene` (CDSE GUID). `parseSceneId`
  enforces a canonical UUID regex before anything is built; the GUID is
  lowercased for cache-key stability. No names, URLs, bboxes, or styles
  travel from client to provider.
- **Injection**: the GUID is interpolated into the CDSE `$filter` in its
  verified unquoted form — safe precisely because the regex admits only
  `[0-9a-f-]`; CDSE filter text never contains client-controlled strings
  beyond that. PC filter text is built entirely from the server-fetched
  canonical name.
- **Output**: the descriptor is assembled from pinned constants (PC Data
  API origin, rendering queries) and the server-verified item id; the
  client factory independently re-checks the origin prefix and rejects
  `token=` before a Cesium object exists. A compromised payload cannot
  redirect the Viewer.
- **Credentials/tokens**: none introduced; the verified PC path is
  keyless; no SAS/`token=` URL form is used or emitted.
- **CSP**: unchanged (report-only). The PC host will surface in CSP
  reports exactly like the pre-existing direct GIBS tiles; host
  extension is a Phase 8 enforcement decision, not silently smuggled in.
- **Abuse bounds**: 8 s upstream timeouts (env-overridable, capped),
  `limit=1` PC queries, 20/20 page cap inherited from Phase 6, positive
  results cached 900 s / negatives 300 s per instance, SWR with no
  retries and no polling. The route file adds no per-request rate
  limiter of its own; it mirrors the scenes route pattern. A heavy-class
  rate-limit review for both routes is carried to Phase 8 (listed, not
  claimed).

## 9. Tests authored (NOT run)

Three suites, deterministic and offline-safe (stubbed `fetch`, cache
cleared per test), mirroring the Phase 6 test style:

| Suite | Cases | Coverage |
|---|---|---|
| `src/server/providers/scene-raster.test.ts` | 18 | constants pinned; classification matrix; byte-level URL/filter pins (unquoted GUID, `%20`/`%27`, items-not-search, exact templates); happy L2A + S1 resolution; L1C unsupported without a PC call; catalogue not-found; PC not-mirrored; identity mismatch rejection; bbox rejection; HTTP/shape failure throws |
| `src/app/api/v1/scenes/raster/route.test.ts` | 8 | 400 matrix (missing, malformed, injection-shaped) with zero upstream calls; GUID case-insensitive cache key; LIVE renderable + `s-maxage=900`; cache hits; unsupported honest envelope + `no-store` + short cache; STALE rewrite from a seeded expired entry; UNAVAILABLE no-cache envelope |
| `src/components/globe/cesiumSceneRaster.test.ts` | 10 | descriptor validation (forged provider/collection/origin/http/token/bbox/zoom/preview); factory options (256 px, zoom clamp, rectangle args, credit); throws without constructing anything for forged input |

**Tests were not run by the implementing agent.** They were authored
against the pinned verified request shapes; the user's verification pass
(§12) must execute them. Static-analysis risk in unexecuted TypeScript is
acknowledged as **unknown** — see §12.

## 10. Verification actually performed vs not

**Performed (read-only, no repository tooling):** the live provider
probes in §3 — PC keyless tile fetch (HTTP 200 PNG), both exact-name
filters (HTTP 200 exact items), `/search` failure mode (504), L1C 404,
tilejson shape, CDSE unquoted/quoted/entity by-id behavior.

**NOT RUN (explicit):** `npm test`, `npm run typecheck`, `npm run lint`,
`npm run build`, the bundle-size check (`bundle:check`), the texture
checker, `scripts/browser-smoke.mjs`, `npm audit`, and any browser
reproduction of the raster toggle. No screenshot, bundle byte count, or
test count from this phase exists. Code compiles in the sense of "was
written carefully against the existing APIs" — which is **not** a
verification claim.

**Known-unverified assumptions:** (a) PC tile CORS from the deployed
origin; (b) Cesium `UrlTemplateImageryProvider` option interaction for
this exact template shape (options are standard; still unrun); (c) the
new effect's behavior under real React StrictMode double-mount; (d)
initial-JS budget after the additions (types/hook/app wiring add to the
initial graph; the factory stays in the lazy chunk; **204,800 B gzip
ceiling with 632 B headroom at Phase 6 close — re-measure before
shipping**).

## 11. Documentation updates

- This report + `PHASE_7_ACCEPTANCE_CHECKLIST.md` (created).
- `CESIUM_MIGRATION_BACKLOG.md`: Phase 7 entry updated in place with the
  provider substitution, delivered pieces, verification status, and
  explicit "tests NOT run" record; Phase 8 entry untouched.
- `IMAGERY_LAYER_PROVIDER_REFERENCE.md`: new §1b (dynamic raster
  provider), registry-providers list note, unimplemented-list trimmed
  (scene raster rendering moved from "not supported" to §1b; downloads,
  Sentinel Hub, L1C rendering stay unimplemented).

## 12. Acceptance status, unrun checks feed, and next steps

Checklist `PHASE_7_ACCEPTANCE_CHECKLIST.md` maps the backlog acceptance
criterion ("a selected S2 scene renders correctly georeferenced with
acquisition label; quota failure degrades to labelled state, never
blank") to concrete evidence items. Because the verification pass was not
run, its runtime items are marked **Not Run**, and the phase verdict is
**IMPLEMENTED — VERIFICATION PENDING**, not "complete".

Minimum verification pass (owner: user), in order:

1. `npm run typecheck` — the largest risk class (types are new across the
   server/client boundary).
2. `npm run lint` — expect scrutiny of the new `img` usage note and hook
   lint rules.
3. `npm test` — the three new suites (36 cases) plus the full suite.
4. `npm run build` and the existing bundle check — confirm the 200 KiB
   initial-JS gate still passes with the new hook/types/app wiring.
5. `npm run start -- -p 3100` then probe
   `/api/v1/scenes/raster?scene=<a GUID from a live /api/v1/scenes
   result>` — expect `renderable` + LIVE; repeat → `cache_hit:true`;
   probe a malformed id → 400.
6. Green-path browser pass (`?renderer=cesium`): select a scene → raster
   section resolves → toggle on → raster appears over the AOI, grid above
   it, panel shows preview + attribution; toggle off removes it; switch
   scenes swaps it; confirm CSP console shows report-only PC-host
   violations (expected, matching GIBS).
7. Optional: extend `scripts/browser-smoke.mjs` with a phase-7 scenario
   (not done here; the harness was left untouched).

Blocked/remaining (outside this phase): Sentinel Hub or any credentialed
rendering; L1C raster rendering; downloads; custom render styles/NDVI;
CSP enforcement for the PC host; rate-limit class review; Phase 8 gates.
Phase 8 has NOT been started.
