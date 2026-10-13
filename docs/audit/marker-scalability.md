# T4.3 Marker Scalability — Measure-First Audit

**Date:** 2026-10-13 · **Base commit:** `2ca4e1e` (`T4.2: improve render-loop discipline`)
**Task commit:** `T4.3: measure and optimise marker scalability` (recorded on commit)
**Method:** code inspection + deterministic unit tests only — no browser
automation (owner-cancelled), no device captures available to the agent.

**Disposition: code work COMPLETE; performance acceptance OWNER MEASUREMENT REQUIRED.**
No frame-rate number in this document was measured by the agent. Every
table in §5 is empty until the owner supplies real-device captures.

---

## 1. Cost chain (traced in source)

Response points → `filterValidPoints` → projection → marker write →
loop invalidation → pointer picking → selection → list presentation.

| Stage | Evidence | Cost at 2,000 points |
|---|---|---|
| Server `limit` | `src/server/validation.ts:23,50-57` (`MAX_LIMIT = 2000`); every provider slices to `limit` (`usgs.ts:41`, `nasa-eonet.ts:57`, `nasa-firms.ts:215`, `open-meteo.ts:99`, `open-meteo-aq.ts:95`) | 2,000 supported end-to-end; default request limit is 500 (`useLayers.ts:80-83`), so the 2,000 scenario needs an explicit `limit=2000` (see §3) |
| Validation/filtering | `src/lib/geo.ts:17-19`, consumed once per data change in all three renderers (`Globe.tsx:210`, `WebGPUEarth.tsx:168`, `DottedEarth.tsx:129`) | O(N) per fetch, never per frame — trivial |
| WebGL marker write | `Globe.tsx` MarkerSystem → `markerSync.ts:writeMarkersToInstancedMesh`; single `InstancedMesh` (one draw call), caller-owned scratch, `count` tracks valid length | O(N) per data change; zero per-frame allocation |
| WebGPU marker write | `WebGPUEarth.tsx:syncMarkersRef` → same shared writer; preallocated `MARKER_CAPACITY` (§2) | O(N) per data change; one presented frame per update via the T4.2 wake gate |
| Dotted marker draw | `DottedEarth.tsx:294-305` canvas arcs + `markerHits` rebuild per draw; projection is allocation-free (`globeProjection.ts:74-103`) | O(land dots ~1,000–1,200 + N) per frame *while animating only*; idle globe draws nothing (T4.2) |
| Loop invalidation | T4.2 demand mode (`Globe.tsx:370-387`, WebGPU `ensureLoop`, dotted `requestDraw`) | Marker updates earn exactly one frame when idle; no permanent loop |
| Picking (WebGL/WebGPU) | rAF-throttled hover + drag-discriminated click (`Globe.tsx:267-329`, `WebGPUEarth.tsx:517-573`); three.js per-instance raycast with geometry bounding-sphere early-out | O(instances) per hover frame at most, zero when the pointer is still |
| Picking (dotted) | Screen-space nearest-hit within 10 px (`DottedEarth.tsx:388-405`), hover only when not dragging | O(N) distance checks per hover event — trivial |
| Selection | `useEventSelection` opens detail; markers are not rewritten on selection | O(1) |
| List | `EventList.tsx:34` renders ≤50 rows; `LayerOverview.tsx:118-124` passes `totalCount={filteredPoints.length}`; over-limit shows truthful "Showing 50 of N" (`EventList.tsx:71-73`) | DOM bounded at 50 rows at any N; counts truthful |

No duplicate markers, no per-frame allocation, and no fabricated counts
were found on any path.

## 2. Implemented fix (proven bottleneck, not speculation)

**Root cause:** `WebGPUEarth.tsx` allocated its marker store as
`new THREE.InstancedMesh(geometry, material, 1)` and then set
`count = points.length`. Writes past index 0 land outside the allocated
instance buffer (typed-array out-of-bounds writes are silently ignored)
while the mesh claims to draw N instances — so the WebGPU path could not
correctly render more than one marker, let alone 2,000. Provable from
code alone; no FPS measurement needed to justify the fix.

**Change (this task):**
- New `src/components/globe/markerSync.ts`: `MARKER_CAPACITY`
  (mirrors server `MAX_LIMIT`, pinned by test) and
  `writeMarkersToInstancedMesh` — one canonical writer for both 3D
  paths (instance N ↔ validPoints[N], shared projection, severity
  colors with low fallback, clamp to allocated capacity).
- `WebGPUEarth.tsx`: preallocates `MARKER_CAPACITY` once, initial
  `count = 0`, syncs through the shared writer.
- `Globe.tsx` MarkerSystem: same writer, same mapping; no behavior
  change (its capacity already tracked payload length).
- New `src/components/globe/markerSync.test.ts` (7 tests): capacity
  contract, full 2,000-point mapping (position + color spot-checks),
  invalid-record exclusion with stable order, over-capacity clamp,
  empty input, severity fallback. Deterministic fixture, offline.

**Deliberately NOT done:** clustering, thinning, or downsampling,
or any "Showing N of M" globe notice — the code audit found no bottleneck
that justifies them, and the plan forbids speculative thinning. The list
already caps at 50 rendered rows with a truthful count.

## 3. Reproducible 2,000-marker scenario (for owner captures)

Primary scenario — real provider data, no fixtures:
1. Production build served locally (`npm run build && npm start`) or the
   deployed preview; note which.
2. Open `/` with `?renderer=` set per run (`webgl`, `webgpu`, or default
   dotted). Keep `?layer=earthquakes`.
3. Request the 2,000-point payload:
   `GET /api/v1/layers/earthquakes/data?limit=2000&time_range=30d`
   (verify `data.points.length` and `data_status` in the response; record
   whether the payload is `live` or labelled fallback — never call
   fallback data live).
4. If the provider returns fewer than 2,000 points, record the actual
   count honestly. Do NOT pad the live experience with synthetic points.
   A clearly labelled local-only fixture (e.g. the deterministic
   generator in `markerSync.test.ts`) may be used for profiling only.

Per run, record: device model/class, OS, browser/version, power mode,
viewport, DPR, renderer requested vs actually active (diagnostics panel),
texture tier, reduced-motion on/off, first usable frame, average + p95
frame time where DevTools exposes it, observed FPS, CPU load, memory
where exposed. Three repeat runs per cell under comparable conditions.

Suggested DevTools procedure: open the Rendering panel → Frame Rendering
Stats; rotate the globe continuously for 20 s; record median FPS; hover
across dense marker regions for 10 s and note picking responsiveness;
repeat with auto-rotation paused (idle stillness check from T4.2).

## 4. Targets (PRD)

- Desktop: ≥55 FPS at 2,000 markers.
- Representative mid-range mobile: ≥30 FPS.
- Picking stays rAF-throttled; keyboard list selection stays available.

## 5. Owner measurement tables (empty — pending captures)

### Desktop (target ≥55 FPS)

| Renderer | Device / browser / DPR | Points (live?) | Runs | Median FPS | p95 frame | Notes |
|---|---|---|---|---|---|---|
| dotted | — | — | — | — | — | — |
| webgl | — | — | — | — | — | — |
| webgpu | — | — | — | — | — | — |

### Mid-range mobile (target ≥30 FPS)

| Renderer | Device / browser / DPR | Points (live?) | Runs | Median FPS | p95 frame | Notes |
|---|---|---|---|---|---|---|
| dotted | — | — | — | — | — | — |
| webgl | — | — | — | — | — | — |
| webgpu | — | — | — | — | — | — |

## 6. Verdict

- Code audit: COMPLETE (this document + committed fix + tests).
- WebGPU >1-marker correctness: FIXED and regression-tested.
- Clustering/thinning: NOT JUSTIFIED — explicitly deferred unless owner
  measurements in §5 show a real miss.
- Performance acceptance (55/30 FPS at 2,000): **OWNER MEASUREMENT
  REQUIRED** — no mocked test, build log, or code review satisfies it.
- Feeds T4.4: the §5 captures double as WebGL/WebGPU comparison input.
