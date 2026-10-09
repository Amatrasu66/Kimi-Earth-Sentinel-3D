# Current-State Reconciliation — Kimi Earth Sentinel 3D

**Phase 0 output. No product code changed. No T1–T5 started.**
**Rev.2 (2026-10-08):** counts corrected (CONFIRMED = 20, total 30 — see §8 totals block), owner decisions recorded (§13), revised execution plan with dependencies + per-task verification (§10 rewritten, authoritative).
**Date:** 2026-10-08 · **Working dir:** `C:\Users\Simra\OneDrive\Desktop\Kimi Earth Sentinel 3D`
**PRD:** `PRD-earth-sentinel-audit-and-frontend-rework.md` (audit date 2026-10-08)
**Policy:** `OPENCODE_PRD_RECONCILIATION_AND_EXECUTION_PROMPT.md`
**Owner constraint honored:** no git commands run, nothing committed (git-dependent checks marked NOT VERIFIABLE).

Status vocabulary: `CONFIRMED` · `REFUTED` · `ALREADY FIXED` · `STILL RELEVANT` · `NOT VERIFIABLE`
Evidence format: `file → symbol/line → observed behavior`.

---

## 1. Baseline gates (2026-10-08, Node v24.15.0, npm 11.14.1)

| Gate | Command | Result |
|---|---|---|
| install | `npm ci` | SKIPPED (deliberate: `node_modules/` present, lockfile consistent — proven by green build below; full reinstall would churn the tree for no signal) |
| lint | `npm run lint` (`eslint src`) | **PASS** — clean, zero output |
| typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS** — clean, zero output |
| test | `npm test` (`vitest run`) | **PASS** — 16 files, **90/90 tests green** (87s; CJS-deprecation warning from Vite only, non-blocking) |
| build | `npm run build` (`next build`, Next 15.5.27) | **PASS** — compiled in 12.9s. `/` = 322 kB / first-load 425 kB. All 15 API routes `ƒ` dynamic. One warning only: "Next.js plugin was not detected in ESLint configuration" (flat-config detection nit, non-blocking) |

No gate failed, so no root-cause analysis was needed. No product code was touched to get green.

### Route sizes (from build output)

`/` 322 kB / 425 kB first-load · `/_not-found` 995 B · every `/api/*` 158 B · shared first-load JS 103 kB (46.5 + 54.2 + 2.11 kB chunks).
T4.5 budget (≤200 kB gzip initial excl. globe chunk) cannot be judged from these numbers alone — needs bundle-analyzer (not installed, see §7).

### Textures (`public/textures/`)

`earth-day.jpg` 1.39 MB · `earth-night.jpg` 698 KB · `earth-clouds.png` 809 KB · `earth-topology.png` 369 KB · `earth-water.png` 420 KB → **total ~3.7 MB**. No KTX2/WebP, no mip tuning (see §7).

### Lighthouse / bundle-analyzer / Playwright

None installed or configured (no `lighthouse`, no `@next/bundle-analyzer`, no `playwright.config.*`, no `lighthouserc`). T0.1's Lighthouse + analyzer + T0.3 screenshots are **not runnable** without adding dev tooling — flagged as decision item in §12.

---

## 2. Repository architecture (verified)

- **Stack:** Next.js `^15.3.0` App Router + React 19 + TS `~5.9.3` (`package.json:40-42,64`) · Tailwind `^3.4.19` (`package.json:62`) · three `^0.185.1`, R3F `^9.6.1`, drei `^10.7.7` (`package.json:26,41,44`) · visx `4.0.1-alpha.0` + `d3-array` (`package.json:28-34,37`) · Vitest `^2.1.0`, jsdom `^30`, jest-dom `^7`, Testing Library React 16 (`package.json:49-50,60,66`).
- **Single app:** `src/` is UI + API. No Flask/Render/CORS leftovers in code (README documents retirement, `README.md:210`; `src/services/api.ts:4-10` same-origin `/api/v1`).
- **API tree (15 routes, no `/api/v1` index):** `api/health`, `api/[...rest]`, `api/v1/[...rest]`, `api/v1/health`, `api/v1/layers`, `api/v1/layers/[layerId]/data`, `api/v1/layers/[layerId]/heatmap`, `api/v1/events/[eventId]`, `api/v1/search`, `api/v1/stats`, `api/v1/stats/historical`, `api/v1/geocode/reverse`, `api/v1/timezones`, `api/v1/imagery/gibs/capabilities`, `api/v1/imagery/gibs/tile/[layer]/[z]/[x]/[y]`. Unknown paths → JSON `NOT_FOUND` (`v1/[...rest]/route.ts:7-8`).
- **Server:** `src/server/config.ts` (server-only, `AIRNOW_API_KEY`/`NASA_FIRMS_API_KEY` only secrets, `REQUEST_TIMEOUT:15`, `CACHE_DEFAULT_TIMEOUT:300`), `cache.ts` (per-instance `MemoryCache`, max 2000, stale re-serve), `http.ts` (timeout + caller-signal merge, generic loggers), `route-helpers.ts` (`ok` = bare `NextResponse.json`, **no Cache-Control**), `validation.ts` (limits/bbox/resolution/latlon), `provenance.ts` (envelope `{success,data,meta}` + `data_status live|simulated|stale|unavailable` + `LAYER_TTLS`), `health.ts` (`STARTED_AT` module-load, `uptime_seconds` 0.1s resolution), `services/layers.ts` (**lazy dynamic-import dispatch** + stale-fallback), `services/event-detail.ts` (USGS/EONET live, FIRMS → simulated), `models/layers.ts` (8 layers), `providers/` (usgs, nasa-eonet, nasa-firms, open-meteo, airnow, geocode, imagery, heatmap, fallback).
- **Envelope:** lives in `src/server/provenance.ts:63-84`, **not** `src/types` (`src/types/index.ts` has `DataPoint/LayerData/HeatmapData/EventDetail` but no envelope type — minor doc-reality gap, harmless).
- **CI:** `.github/workflows/ci.yml` — single job `npm ci → lint → typecheck → test → build`, Node 24, 15-min timeout. No audit/Dependabot/e2e/size gates.
- **Hygiene (visible without git):** `kimi dot md/` (17 files), `md fils/` (3 files), `docs/prompts/foundation-architecture-pass.md` all present. No `AGENTS.md`. No `LICENSE`. No Dependabot. `.env.example` clean (no values), `.gitignore` covers `.env*` except example.
- **Skills installed (`.agents/skills/`, 12):** `deploy-to-vercel, design-taste-frontend, high-end-visual-design, redesign-existing-projects, vercel-cli-with-tokens, vercel-composition-patterns, vercel-optimize, vercel-react-best-practices, vercel-react-native-skills, vercel-react-view-transitions, web-design-guidelines, writing-guidelines`. `skills-lock.json` pins 7. Mapping to PRD §6 in §11 below.

---

## 3. Current frontend architecture (the PRD's §5-U / T3 picture is stale)

The app is **no longer "one client monolith with no architecture"**. It is a **client-composed shell with real decomposition**:

- `src/app/page.tsx:18` — `dynamic = "force-dynamic"`, thin server wrapper returning `<SentinelApp/>`. `layout.tsx` server metadata + `class="dark"`.
- `src/components/app/SentinelApp.tsx` (302 lines) — composition root + state owner (all UI state: activeLayer/selection/detail/hover/settings/rotation/points/flyTo/rendererInfo, `:53-68`), race-safe detail fetch (`eventRequestId+AbortController`, `:123-159`), input-focus keyboard guard (`:209-221`). It **owns state** (U-02's "owns all state" half is true) but **renders through** `AppShell` + islands — it is not a render monolith.
- `src/components/shell/` — `AppShell.tsx` (33-line grid `header/workspace/rail|stage|panel/status`, `:23-31`), `GlobeStage.tsx` (decorative frame only), `AppHeader.tsx` (3-zone grid, provenance badge `sm+`), `LayerRail.tsx` (8 layers, `aria-pressed`, tooltips, desktop vertical + mobile horizontal), `StatusDock.tsx` (**hydration-safe clock**: `useState<Date|null>(null)` + mount effect, `:28-38`, `aria-live=off`), `CommandSearch.tsx` (debounced combobox with full ARIA, keyboard nav, retry/empty states).
- `src/components/intelligence/` (9 components, decomposed) — `DataPanel` (shell), `EventDetails` (progressive disclosure, live-only fields), `EventList` (**keyboard-accessible list alternative**, `LIST_LIMIT=50`, "Showing 50 of N"), `LayerOverview` (identity→metrics→distribution→filter→list; **ValueHistogram code-split** `dynamic ssr:false ~80 kB`), `MetricCard/Row`, `SeverityBadge/Filter/Distribution`.
- `src/components/globe/` — `EarthRenderer.tsx` (WebGPU/WebGL selector: probe, `?renderer=` force, 30s watchdog, `RendererInfo`), `WebGPUEarth.tsx` (785-line imperative WebGPU/TSL: timeouts, debug stats, full disposal), `Globe.tsx` (WebGL/R3F: rAF-throttled picking, drag-discrimination, fly-to, auto-rotate), `GlobeScene.tsx` (adaptive DPR), `earthConfig.ts` (`EARTH_RADIUS=5`, camera 16.4, sun `[6,2.5,4]`), `WebGpuErrorBoundary`.
- `src/hooks/` — `useLayers` (abort + requestId race guard + nonce refetch), `useSearch` (abort + stale-ignore), `useKeyboardShortcuts` (**ignores INPUT/TEXTAREA/contentEditable**, Esc blurs).
- `src/services/api.ts` — typed same-origin client (`fetchApi<T>`, `ApiResponse<T>`, 15 s timeout, signal merge, error normalization). **No dedupe/retry/cache** — retries are per-button.
- `src/app/globals.css` — dark-only token system (layout/radius/accent `#ffc31f`/status colors/motion), hardcoded z (canvas 1, shell 10, hint 40, search 50, skip 300, loading 1000), global `:focus-visible`, `prefers-reduced-motion` kill-switch, skip-link target `#sentinel-data-panel`.
- **URL state:** only `?renderer=webgl|webgpu` (`src/lib/webgpu.ts:71-81`). No `?layer/event/q/sev/view`, no `useSearchParams` for app state.
- **What the PRD gets wrong about the frontend:** AppShell/GlobeStage rail/header/dock geometry, intelligence decomposition, client islands, provenance chips, hydration-safe clock, keyboard guard, list alternative, lazy chart, lazy providers, stale-fallback cache, hover throttling, DPR caps, disposal — **all already exist**. T3 must be a *surgical delta*, never a re-scaffold.

---

## 4. Provider matrix (verified in source)

| Layer | Provider | Live | Partial | SIM fallback | Cache TTL | Timeout | Provenance |
|---|---|---|---|---|---|---|---|
| earthquakes | USGS FDSNWS, no key (`providers/usgs.ts:84-109`) | ✅ live | — | ✅ on unreachable/malformed (`:112-125`) | 300 s | 15 s shared | `live`/`SIMULATED`, source `USGS` |
| earthquake detail | USGS detail feed (`services/event-detail.ts:52-60`) | ✅ live | — | ✅ on failure; 404 → `EventNotFound` | 300 s | 15 s | `LIVE`/`SIMULATED`, source `USGS` |
| disasters | NASA EONET, no key (`nasa-eonet.ts:80`) | ✅ live | — | ✅ (`:86-98`) | 600 s | 15 s | `LIVE`/`SIMULATED`, source `NASA EONET` |
| disaster detail (`eonet-*`) | EONET event endpoint (`:134-139`) | ✅ live | — | ✅; 404 → `EventNotFound` | 300 s | 15 s | `LIVE`/`SIMULATED` |
| temperature / precipitation / cloud / wind | Open-Meteo, no key (`open-meteo.ts`) | ✅ live | partial gaps w/ `warnings` | ✅ when zero points (`:119-127`) | 3600/3600/1800/1800 s | 15 s per batch | `LIVE` + `warnings[]`, source `Open-Meteo` |
| air_quality | AirNow, key, fixed central-US point (`airnow.ts:54-64`); bbox rejected at route | — | ✅ US-only w/ key | ✅ no-key/failure (`:45-51,:68-87`) | 1800 s | 15 s | `LIVE`/`SIMULATED`, source `AirNow` |
| wildfire markers | NASA FIRMS VIIRS NOAA20 NRT, key in path (`nasa-firms.ts:124-127`) | ✅ w/ key | ✅ key-gated | ✅ no-key/failure (`:114-120,:130-150`) | 600 s | 15 s | `LIVE`/`SIMULATED`, source `NASA FIRMS` |
| wildfire detail (`fire-*`) | none — forced simulated (`event-detail.ts:238-250`) | — | — | ✅ always (labelled, FIRMS-named) | n/a | n/a | `SIMULATED`, source `NASA FIRMS` |
| heatmaps (all) | seeded deterministic grids (`heatmap.ts:9,39-54`) | — | — | ✅ always (`SIMULATED`); unknown layer → `UNAVAILABLE` | 3600 s | n/a (local) | `SIMULATED`/`UNAVAILABLE`, source `Simulated grid` |
| search | bundled gazetteer + event index (`search/route.ts:29`) | — | — | ✅ always labelled | n/a | n/a | `SIMULATED`, source `fallback` |
| reverse geocode | coarse region boxes (`fallback.ts:633-658`) | — | — | ✅ always labelled | n/a | n/a | `SIMULATED`, source `fallback` |
| timezone | longitude-only approx (`geocode.ts:35-45`) | — | — | ✅ always labelled (`approximate:true`) | n/a | n/a | `SIMULATED`, source `fallback` |
| `/stats` | `getMockStats()` (`stats/route.ts:10-15`, `Math.random` in fallback `:581`) | — | — | ✅ always labelled | none | n/a | `SIMULATED`, source `fallback` |
| `/stats/historical` | placeholder series (same file family) | — | — | ✅ always labelled | none | n/a | `SIMULATED`, source `fallback` |
| satellite/GIBS | 3-layer allow-list, 302 redirect (`imagery.ts:13-38`, tile route `:24-25`) | ✅ endpoint live | — | n/a | none | n/a | catalogue + redirect; **UI never calls it** (`gibsTileUrl` only referenced in `api.test.ts:81-83`) |
| day/night | static `DEFAULT_SUN_DIRECTION=[6,2.5,4]` (`earthConfig.ts:25`) | — | — | n/a (static, unwired) | n/a | n/a | prop-through both renderers, no UTC wiring |
| clouds | drifting static texture (`Globe.tsx:112-137`, `WebGPUEarth.tsx:393-405`) | — | — | n/a (decorative) | n/a | n/a | decorative, unlabeled as such in UI |
| textures | NASA Blue Marble family, static | — | — | n/a (art) | n/a | 25 s per-texture timeout | static art |

Sampling answers (T0.2 explicit): Open-Meteo grid = `generateWeatherGrid` → 108 pts global (12×9) or 100 pts bbox (10×10), sliced to `min(limit,200)`, chunks of 50, **serial `for..of await`** (`open-meteo.ts:87-95`) — bounded fan-out, no concurrency. GIBS **not used by UI**. Keyboard handler **does guard inputs**. State lives in `SentinelApp` + three hooks. Provider URLs/keys **never logged** (only `String(e)`). Cache = per-instance memory + stale re-serve, **no `Cache-Control`**. App = client-composed shell (not "one monolith" for rendering, but state is centralized). `force-dynamic` on page + all 15 API routes. Server/client boundary = thin (page wrapper only).

---

## 5. Security findings (re-verified)

- **S-01 rate limiting — CONFIRMED, still absent.** No `rate-limit.ts`, no 429/`Retry-After`/bucket anywhere in `src`. Only serial-chunk politeness in `open-meteo.ts:4`. Execution-prompt rule applies: evaluate Vercel Firewall vs in-process tradeoffs before building; do not blindly add a serverless-local bucket.
- **S-02 secret hygiene — PARTIALLY CONFIRMED, downgraded.** Keys travel outbound server-side only (FIRMS key in path `nasa-firms.ts:125`, AirNow `API_KEY` query `airnow.ts:61`), never to the client. No `console.warn/error` prints URLs or keys — all provider catches log `String(e)` only; `http.ts:82-88` and `layers.ts:179-186` log generic/dev-timing lines. `redact()` helper does **not** exist, so the *hardening* task survives, but there is **no active leak** in source. Git-history key scan **NOT VERIFIABLE** (owner no-git rule) — must be run by the owner (`git log -p -S"api_key" --all`).
- **S-03 headers/CSP — CONFIRMED.** `next.config.mjs:1-5` = only `reactStrictMode` + `poweredByHeader:false`. No `headers()`, no `middleware.ts`, no CSP/HSTS/XCTO/Referrer/Permissions/frame guards. CSP must stay report-only-first (WebGPU/WebGL/blob/data/workers/GIBS origins at risk).
- **S-04 validation — PARTIALLY CONFIRMED (weaker than PRD implies).** Present: `q` length cap (but **200**, not 100 — `search/route.ts:11,23-24`), `limit` 1–2000/100, `resolution` 1–512, bbox ranges, severity/time allow-lists, GIBS allow-list + `isValidTile`, `air_quality` bbox rejection, `eventId` length ≤128 + charset. Missing: `q` trim/control-char rejection/charset caps, `q` empty-vs-short semantics (`<2` returns empty success), event-id strict per-provider patterns (generic `[A-Za-z0-9_.-]+` at route; strictness lives one layer down in `resolveProvider`/`USGS_ID_RE`). Task survives narrowed.
- **Secrets posture (good, protected):** zero `NEXT_PUBLIC_` uses in `src` (only a never-comment in `config.ts:3`), `.env.example` has no values, `.gitignore:15-17` covers `.env*` except example, README uses `/api/v1` + server-only language throughout.

---

## 6. Dependency findings (re-verified)

- **B-01 CONFIRMED:** `@next/eslint-plugin-next ^16.3.8` (`package.json:48`) vs `next ^15.3.0` (`package.json:40`) — major mismatch, still shipped. (Build warns about ESLint plugin detection; lint itself passes.)
- **B-02 CONFIRMED (with nuance):** `@types/node ^20` vs `engines 24.x` (`.nvmrc` = `24`, CI = 24 — runtime aligned, types lagging); `eslint-plugin-react-refresh` present (Vite leftover, though config now scopes exemptions for app/server); `vitest ^2` + `jsdom ^30` + `jest-dom ^7` **proven compatible** (90/90 green) — no compat fire, just drift.
- **S-05 CONFIRMED:** `@visx/* 4.0.1-alpha.0` in production deps; no `npm audit` script, no Dependabot/Renovate, no audit gate in CI.
- **Correction to execution-prompt §0.2:** "Bklit chart integration" is **not present** — charts are **visx** (`@visx/scale/event/responsive/shape/grid/pattern` across `components/charts/*`, 42 files; zero `bklit` matches in `src`). `components.json` references a `@bklit` registry and `eslint.config.mjs:43-60` mentions "vendored Bklit" exemptions, but no vendored Bklit code exists. Treat Bklit claims as void; visx is the protected chart stack.

---

## 7. Performance findings (re-verified)

- **P-01 CONFIRMED:** per-instance memory cache only (`cache.ts:5-9` says so explicitly), stale re-serve exists (`layers.ts:107-142`), but **zero `Cache-Control`/CDN headers** (`route-helpers.ts:8-19`). `meta.cache_hit`/`fetched_at` semantics tested (`cache-provenance.test.ts`).
- **P-02 CONFIRMED (narrowed):** `REQUEST_TIMEOUT` default **15 s** both server (`config.ts:14,56-61`) and client (`api.ts:43`); **no `maxDuration`** on any route; weather fan-out is serially bounded (200 pts / 50-per-batch) so the "fan-out" risk is smaller than the PRD suggests — task = lower timeout + per-route `maxDuration` + partial-failure message (partial-failure `warnings[]` already exist in `open-meteo.ts:135-140`).
- **P-03 CONFIRMED:** client-only first paint (`page.tsx:18` force-dynamic; initial HTML ≈ shell + `Initializing Earth renderer…` + `— —` clock skeletons). LCP hostage to JS + renderer boot.
- **P-04 MIXED (protection + gap):** DONE already — DPR caps (≤2 desktop/≤1.5 coarse, both renderers), explicit disposal (WebGPU teardown `:693-737`, WebGL material/geometry disposal), rAF-throttled picking, drag-discrimination, instanced markers. STILL MISSING — hidden-tab pause (zero `visibilitychange` hits), on-demand loop (both loops always-on), texture diet (3.7 MB, no KTX2/WebP/mip tuning), atmosphere parity gap (WebGPU rim pow 4.5/gain 0.45/`1.05×` vs WebGL pow 3.0/gain 0.5/`1.04×` — visually close, numerically different).
- **P-05 INVESTIGATE (no deletion without data):** both renderers required today (WebGPU primary + WebGL fallback with probe/force/watchdog). `renderer-decision.md` data (frame time, memory, bundle, visuals, ≥2 devices) does not exist.
- **P-06 CONFIRMED:** heatmap = base64 LE float32, `resolution` capped 512 default 128 (`validation.ts:16-17`) → worst case ≈ 512 KB raw (~683 KB base64). No quantization/compression/budget.
- **P-07 CONFIRMED:** `api.ts` has timeout + abort + normalization, **no dedupe/abort-on-switch/retry/cache/prefetch** (abort exists per-hook, not as a layer).

---

## 8. Full PRD finding reconciliation (every §5 row)

### Finding totals — CORRECTED (Rev.2)

30 PRD findings, each with exactly one classification. Verified by enumerating every §5 ID:

- **CONFIRMED (20):** S-01, S-03, S-05, B-01, B-02, B-04, B-05, B-06, B-07, B-08, P-01, P-02, P-03, P-06, P-07, U-01, U-07, R-01, R-02, R-03
- **STILL RELEVANT (5, narrowed/partial):** S-02, S-04, P-04, P-05, U-02
- **ALREADY FIXED (1):** U-04 (input-focus guard half; WCAG/remap remainder survives under T3.10)
- **REFUTED (2):** B-03, U-05
- **NOT VERIFIABLE (2):** U-03, U-06 (both need screenshots; Playwright now owner-approved, see §13)

Arithmetic: 20 + 5 + 1 + 2 + 2 = **30**. Cross-check: Security 5 + Bugs 8 + Performance 7 + Frontend 7 + Hygiene 3 = 30. Every ID below appears exactly once.

### Security

| ID | Original claim | Status | Evidence | Consequence |
|---|---|---|---|---|
| S-01 | No rate limiting; cold misses burn key quota | CONFIRMED | `glob src/server/rate-limit.ts` → none; no 429/bucket in `src` | keep T1.3 (platform-evaluated) |
| S-02 | FIRMS key in URL; structured logs may leak it | STILL RELEVANT (downgraded) | key in path `nasa-firms.ts:125`, query `airnow.ts:61`; all catches log `String(e)` only; no URL logging found | keep narrowed T1.4 (redact + scans; owner runs git-history scan) |
| S-03 | No CSP/headers, only strictMode + poweredByHeader | CONFIRMED | `next.config.mjs:1-5`; no `middleware.ts`/`headers()` | keep T1.2 (report-only first) |
| S-04 | Query validation needs caps verified | STILL RELEVANT (narrowed) | `q` cap 200 not 100, no trim/control-char rules `search/route.ts:11-28`; GIBS/id/bbox caps exist | keep narrowed T1.5 |
| S-05 | Alpha prod deps; no audit/Dependabot | CONFIRMED | `package.json:28-34`; no audit script/CI/dependabot | keep T1.1 (part) + T5.3 |

### Bugs & correctness

| ID | Claim | Status | Evidence | Consequence |
|---|---|---|---|---|
| B-01 | eslint-plugin-next 16 vs next 15 | CONFIRMED | `package.json:40,48` | keep T1.1 |
| B-02 | types/node 20 vs node 24; react-refresh leftover; vitest/jsdom compat | CONFIRMED (nuance) | `package.json:51,58,60,66`, `.nvmrc:1`, `eslint.config.mjs:4`; compat proven by 90/90 green | keep T1.1 |
| B-03 | README health `{status:"ok"}` vs live envelope | REFUTED | `README.md:218` documents `{success,data,meta}` envelope; `:222` shows inner payload shape — drift is cosmetic | drop T1.7-health-half; keep README-touch only if T2.9 changes health |
| B-04 | README "Backend API" URL returns 404 | CONFIRMED | no `api/v1/route.ts`; `[...rest]:7-8` → NOT_FOUND; README `:18-19,275-276` lists `…/api/v1` | keep T2.9 (index) + T1.7 link fix |
| B-05 | `uptime_seconds` 0 on serverless | CONFIRMED | `server/health.ts:5,14` per-instance `STARTED_AT` | keep T2.9 (started_at/note) |
| B-06 | Fixed sun direction | CONFIRMED | `earthConfig.ts:25`; no subsolar calc anywhere | keep T2.4 |
| B-07 | AQI effectively US-only | CONFIRMED | `airnow.ts:39-64` fixed point + bbox reject `validation.ts:65-74` | keep T2.5 |
| B-08 | Wildfire detail simulated despite real fields | CONFIRMED | `event-detail.ts:238-250` forces simulated for `fire-*` | keep T2.3 |

### Performance

| ID | Claim | Status | Evidence | Consequence |
|---|---|---|---|---|
| P-01 | Per-instance cache, no CDN caching | CONFIRMED | `cache.ts:5-9`; `route-helpers.ts:8-19` no headers | keep T2.1 |
| P-02 | 15 s timeout, no maxDuration, fan-out | CONFIRMED (narrowed) | `config.ts:14`; zero `maxDuration`; serial chunks `open-meteo.ts:87` | keep narrowed T2.2 |
| P-03 | Empty HTML, force-dynamic, JS-bound LCP | CONFIRMED | `page.tsx:18`; `EarthRenderer:213-231`; `StatusDock:112` | keep T3.2-shell-half |
| P-04 | Texture weight, DPR, always-on loop, no tab pause | STILL RELEVANT (partially fixed) | DPR/disposal/throttle done; missing pause/on-demand/KTX2; ~3.7 MB textures | keep narrowed T4.1/T4.2 |
| P-05 | Two renderers double surface | STILL RELEVANT (investigate) | `EarthRenderer.tsx:1-16` parity contract; no decision data | keep T4.4 as study-first |
| P-06 | Base64 float32 heatmap unbounded | CONFIRMED | `heatmap.ts:39-49`; cap 512 | keep T2.8-budget-half |
| P-07 | No client fetch layer beyond thin api.ts | CONFIRMED | `services/api.ts:1-234` (no dedupe/retry/cache) | keep T3.6 |

### Frontend / UI

| ID | Claim | Status | Evidence | Consequence |
|---|---|---|---|---|
| U-01 | Empty globe + "Select layer", no default | CONFIRMED | `SentinelApp:53` `null` default; `LayerHint.tsx:8-21` | keep T3.8 |
| U-02 | One `"use client"` monolith, no URL state | STILL RELEVANT (halved) | state centralized `SentinelApp:53-68`; no `?layer/event` state; but shell/islands/hooks/typed client exist | keep narrowed T3.2/T3.3 (no re-scaffold) |
| U-03 | Alignment/spacing/z-overlap suspected | NOT VERIFIABLE | no Playwright, no screenshots runnable; grid/tokens exist `globals.css:20-39` | T0.3 first (tooling decision), then T3.5 scoped to its output |
| U-04 | 1–8/Space/Esc WCAG risk + input conflict | ALREADY FIXED (half) | guard + Esc-blur `useKeyboardShortcuts.ts:39-48`, tested | keep remap/off half of T3.10 only |
| U-05 | Canvas-only, no list/table alternative | REFUTED | `EventList.tsx:10-12,34,71` list alternative w/ count | drop list-build; keep table-only-if-a11y-audit-demands |
| U-06 | Settings/legends/provenance inconsistent | NOT VERIFIABLE | `DataStatusBanner`, header/dock chips, Diagnostics exist; visual consistency needs screenshots | scope T3.7/T3.13 to T0.3 output |
| U-07 | Dark-only `#050607` | CONFIRMED | `layout.tsx:18`, `globals.css:7,211-213` | owner decision (default: add light w/ parity) → T3.1 |

### Repo hygiene

| ID | Claim | Status | Evidence | Consequence |
|---|---|---|---|---|
| R-01 | `kimi dot md` + `md fils` spaces; `docs/prompts` old briefs | CONFIRMED | root listing; 17 + 3 files; `docs/prompts/` single brief | keep narrowed T1.6 (archive, never delete unread) |
| R-02 | No license | CONFIRMED | no `LICENSE` at root | owner decision; agent must not choose |
| R-03 | No AGENTS.md | CONFIRMED | `Test-Path AGENTS.md=False`; root `*.md` = README only | keep T5.5 |

### [V]-verification answers (T0.2 explicit questions)

1. Open-Meteo sampling: 108-pt global / 100-pt bbox grid → `≤200`, 50-chunks, serial — `open-meteo.ts:72-95`, `fallback.ts:289-303`. 2. Request fan-out: ≤4 serial batch requests, no parallelism. 3. GIBS used by UI: **no**. 4. Keyboard-in-input: **guarded** (blurs on Esc). 5. State home: `SentinelApp` + `useLayers/useSearch/useKeyboardShortcuts`. 6. Key/URL leaks: **none in source**. 7. Failure honesty: **truthful** (`SIMULATED`/`STALE`/`UNAVAILABLE` + messages everywhere). 8. Cache semantics: per-instance TTL + stale re-serve, matches code comments. 9. Monolith: render-decomposed, state-centralized. 10. `force-dynamic`: page + all API routes. 11. Server/client boundary: thin wrapper only. 12. Alignment: not verifiable headless. 13. A11y mechanisms: guard, list, focus, reduced-motion, skip link, skeletons — present; remap/off, table, axe-zero — absent. 14. Loop/DPR/visibility: DPR + throttle + disposal present; pause + on-demand absent. 15. Two renderers: both required today (probe + fallback + watchdog). 16. API security: validation + envelope consistent; headers/rate-limit absent.

---

## 9. Obsolete / do-not-execute tasks (with reason)

- **T1.7-health-half (B-03):** envelope already documented (`README.md:218`). Only revisit if T2.9 changes health.
- **T3.2 "remove SentinelApp monolith / re-scaffold":** refuted as framed — shell/islands already exist. Replace with surgical delta (server skeleton, drop `force-dynamic` on page, split 302-line root below 250).
- **T3.5 as written (blind alignment rewrite):** blocked on T0.3 screenshots; grid + tokens already exist.
- **T3.10 list-view build (U-05):** `EventList` already the accessible alternative. Keep a11y hardening only.
- **T4.4 renderer removal:** forbidden without `renderer-decision.md` data + ≥2-device evidence.
- **Any "Bklit" work:** no Bklit code exists; visx is the chart stack.
- **Chart-system protection (owner decision, §13):** the current `@visx/*` system stays. Do NOT replace it with Bklit (or any other library) on the basis of earlier project discussions. A chart-library replacement is a separate owner-approved product decision, not part of this plan.
- **Architecture protection (owner decision, §13):** no WebGPU/WebGL removal without measured evidence; no frontend-architecture redesign except where a surviving task below specifically requires it and the current implementation is proven insufficient; dark-only, no light mode.
- **U-04 input-guard fix:** already fixed + tested; keep only remap/off setting.
- **Broad redesign / new design system / new visual libraries:** explicitly out (execution-prompt §0.3) — no reproducible visual defect demonstrated headless.

---

## 10. Revised execution plan — AUTHORITATIVE (surviving tasks only, Rev.2)

Only tasks surviving reconciliation are listed. Dropped tasks are in §9 with reasons.
Owner-locked choices applied throughout: **SWR** (fetch lib) · **earthquakes** default layer · **250 KB gzip** heatmap budget · **dark-only** (no light mode) · **MIT** license · **Vercel-native** rate limiting preferred, no paid infra · **UNAVAILABLE over simulated** for reverse-geocode · no renderer removal without evidence · no architecture redesign beyond what tasks below require.
Skills to load for UI work: `design-taste-frontend` (direction) + `high-end-visual-design` (style) + `redesign-existing-projects` (audit-first); `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`, `vercel-react-view-transitions`; `vercel-optimize` only with real project metrics.
One task = one commit (`T<id>: <summary>`). Gates after every task: `lint + typecheck + test + build`.

### P0 — security / correctness (in execution order)

| Order | Task | Depends on | Verification |
|---|---|---|---|
| P0-1 | **T1.4 secret hygiene (narrowed).** Add central `redact()` for `api_key/key/token` + configured key values before any log; unit test proves a FIRMS/AirNow key in an error/URL emits `[REDACTED]`; grep proves no `NEXT_PUBLIC_` secret, `.env.example` valueless, `.gitignore` correct. Owner runs git-history scan separately. | none | `redact` unit test green; `grep NEXT_PUBLIC_ src` empty of secrets; gates green |
| P0-2 | **T1.2 security headers + CSP.** `headers()` in `next.config.mjs`: CSP **Report-Only first** (self + `blob:`/`data:` for textures/workers + NASA/GIBS image origins, no unchecked inline scripts), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` deny list, `X-Frame-Options: DENY`/`frame-ancestors 'none'`. Enforce only after zero violations. | none (coordinate with T4.1 texture origins) | header presence test on `/` + `/api/*`; globe renders WebGPU + WebGL with zero report-only violations; documented in `docs/development.md` |
| P0-3 | **T1.3 rate limiting.** FIRST verify current Vercel deployment/plan capabilities; prefer Vercel-native (Firewall) rule where available and document exact rule; in-process token bucket (`src/server/rate-limit.ts`) only if it is honest on the deployed execution model. `429` + standard envelope + `Retry-After`; stricter limits on layers-data/heatmap/search/geocode/imagery. No paid infra. | Vercel-plan check (owner may need to confirm plan) | bucket unit tests (refill, `429` shape, `Retry-After`); limits documented in README |

### P1 — reliability / data / performance (in execution order)

| Order | Task | Depends on | Verification |
|---|---|---|---|
| P1-1 | **T1.1 dependency alignment.** `@next/eslint-plugin-next` ↔ next 15 major; `@types/node` ↔ `engines 24.x`; remove `eslint-plugin-react-refresh` + config unless a documented Next-valid reason exists; pin `@visx/*` alpha exact with comment (no library swap — §9). `npm ls` peer-clean; gates green. | none (do first: everything builds on it) | `npm ls` clean; 90/90 tests green; gates green |
| P1-2 | **T1.5 validation hardening (narrowed).** `q`: trim + keep 200 cap, reject control chars; GIBS allow-list + `z/x/y` ranges (exists — add regression tests); `eventId` per-provider strictness where route is generic. All reject `400` + boundary tests. | P1-1 | boundary unit tests (over-long `q`, control chars, bad tile coords, bad ids → `400`); gates green |
| P1-3 | **T0.3 visual baseline — SKIPPED (cancelled 2026-10-09, owner decision).** Automated browser testing is cancelled: no Playwright (or alternative automation), no automated screenshots, no automated visual-baseline reports. Browser QA, responsive inspection, and visual verification are performed manually by the repository owner. | — | manual QA only; no automated artifacts |
| P1-4 | **T2.9 API index + health.** `GET /api/v1` index (version + links) in standard envelope; `uptime_seconds` → `started_at` + doc note. Fold in T1.7 README link fix (same commit may touch README rows). | P1-1 | `curl /api/v1` 200 envelope; health shape test; README rows match |
| P1-5 | **T2.1 real caching.** `Cache-Control: public, s-maxage=<ttl>, stale-while-revalidate=<2×ttl>` on cacheable GETs; keep memory cache as L2; `meta.cache_hit`/`fetched_at` semantics unchanged + tested; TTL table in docs. | P1-4 (index lists cacheable routes) | header assertions per route in tests; stale-fallback test; gates green |
| P1-6 | **T2.2 timeouts + limits.** Upstream default ≤ 8 s + per-provider env override; explicit `maxDuration` on heavy routes per Vercel plan; weather fan-out keeps serial bound + partial-failure `warnings` message (exists — extend + test timeout → `SIMULATED`/`STALE` path). | P1-1 | timeout unit tests (mock slow upstream → labelled fallback); `maxDuration` present on heavy routes |
| P1-7 | **T2.5 global air quality.** Open-Meteo Air Quality as global no-key provider; AirNow stays optional US source; drop `bbox` rejection for the global provider; `data_status.source` names actual provider + model-vs-station note. | P1-6 (timeout pattern) | non-US live AQ without key (fixture test); both-provider + fallback-order tests |
| P1-8 | **T2.4 real subsolar point.** Pure client util (unit-tested vs 2026-03-20 / 06-21 / 12-21 12:00 UTC, ≤1° terminator) feeding `sunDirection` in both renderers; ≤1/min refresh. Optional manual-time control only if clearly labelled simulated. | P1-1 | vector test cases green; night side matches UTC in browser check |
| P1-9 | **T2.3 wildfire detail from real fields.** Build detail from FIRMS observation (date/time, satellite/instrument, brightness, FRP, confidence, day/night); add missing fields to marker payload; `GET /api/v1/events/<wildfire id>` → `live` when marker live; recorded FIRMS CSV fixture test. | P1-1 | fixture test green; no simulated text in live wildfire detail |
| P1-10 | **T2.6 search / reverse-geocode / timezone.** Search: Open-Meteo Geocoding merged with live event index. Timezone: offline/lat-lon lookup, no fake precision. Reverse-geocode: real provider **only if terms permit, else `UNAVAILABLE`** (owner rule — never simulated). Debounce + T1.3 limits respected; terms noted in docs. Fixture-only tests. | P0-3 (limits), P1-6 | fixture tests; no `SIMULATED` where free real provider works; UNAVAILABLE path tested |
| P1-11 | **T2.7 real stats + history.** `/stats` from live quakes/EONET/FIRMS; `/stats/historical` real for quakes/disasters (USGS/EONET ranges, 24h/7d/30d); archiveless metrics → `unavailable` (never fabricated); each series carries `data_status`; UI empty-state for `unavailable`. | P1-6 | no fabricated series (code review + tests); `unavailable` UI state exists |
| P1-12 | **T2.8 heatmap + imagery decision.** Per-layer record in `docs/audit/heatmap-decision.md` (GIBS raster vs Open-Meteo sampling vs `unavailable`); enforce **250 KB gzip/request** (owner budget) via resolution cap + quantization; decorative cloud layer labelled "Illustrative" unless replaced. | P1-3 (visual check for imagery), P1-6 | decision doc; payload-size test ≤ budget; zero silent-SIM heatmaps |
| P1-13 | **T3.2 server-shell delta (surgical, no re-scaffold).** Remove `force-dynamic` from `page.tsx` (API stays dynamic); server-render static shell (title, rail/panel skeletons) so first HTML is meaningful; split `SentinelApp` (302 lines) below 250/component; `react-best-practices` waterfall/bundle check. | P1-3 (before-shots), §10-P1-12 unaffected | initial HTML contains shell (curl check); no component >250 lines; gates green |
| P1-14 | **T3.3 URL-driven state.** `?layer/event/q/sev/view` via `useSearchParams` (no new dep); reload restores view; back closes panel/event first; deep-link Playwright test. Must not break `?renderer=`. | P1-13, P1-3 (Playwright now present) | Playwright deep-link spec green; back-button behavior verified |
| P1-15 | **T3.6 SWR data layer (owner: SWR).** Typed `useLayerData` on SWR: dedupe, abort on switch (test), backoff retry, SWR/stale-while-revalidate, idle-prefetch; designed UI for loading/error/empty/`unavailable`/`simulated`; no component hand-builds URLs. | P1-13, P1-5 (cache semantics) | abort-on-switch test; all five states screenshotted; gates green |
| P1-16 | **T3.7 provenance UI polish.** Persistent chip per layer (LIVE · CACHED+age · STALE · SIMULATED · UNAVAILABLE, icon+text, source + `fetched_at`); SIMULATED stays loud; `aria-live="polite"` on change; never "real-time". Scoped by T0.3 output — polish, not redesign. | P1-3 (before-shots define scope) | per-state regression screenshots; aria-live announcement test |
| P1-17 | **T3.8 first-run.** Default layer **`earthquakes`** (owner); one-time dismissible hint; skeleton (not text) during renderer boot. | P1-13 | fresh-load shows earthquakes; hint dismiss persists; skeleton screenshot |
| P1-18 | **T3.10 accessibility remainder.** Shortcut remap/off in Settings (guard itself already fixed+tested); `web-design-guidelines` pass; `prefers-reduced-motion`, focus-visible, landmarks/skip-link kept; list/table: `EventList` suffices unless the a11y audit demands a table; Axe zero serious/critical on `/`. | P1-3 (Playwright+Axe) | Axe spec green; remap/off works; reduced-motion stops rotation/easing |
| P1-19 | **T4.2 render-loop discipline.** Idle/on-demand loop when paused + no interaction; pause on `document.hidden`; DPR caps already exist (keep); disposal already exists (keep + leak test: 20 layer switches, heap note). | P1-1 | hidden-tab test (visibility mock); heap-snapshot note; fps unchanged |
| P1-20 | **T4.1 texture diet.** Resize/compress (WebP/JPEG fallback; KTX2 only if measured win), mipmaps, 2K default / 4K capable-desktop; before/after payload table; default ≤ 6 MB total (adjust with justification); visual parity at default zoom. | P0-2 (CSP origins for new formats), P1-3 (parity shots) | payload table; parity screenshots; ≤6 MB default |
| P1-21 | **T4.3 marker scalability (measure-first).** 2000 markers ≥55 fps desktop / ≥30 fps mid-mobile (Chrome capture); clustering/thinning only if measured need + visible "showing N of M"; picking stays rAF-throttled (exists — verify in profiler). | P1-20 | perf captures recorded; thinning notice if applied |
| P1-22 | **T4.4 renderer decision (study, no removal).** `docs/audit/renderer-decision.md`: frame time, memory, bundle, visual diffs WebGPU vs WebGL on ≥2 devices. Implement: keep both (fallback parity tests) or retire one **only with owner sign-off on the data**. | P1-21 (measurements feed it) | decision doc with device data; parity tests if both kept |
| P1-23 | **T5.1 e2e.** Playwright specs (Chromium headless, CI): load, 8 layers, hover/click marker, event detail, search fly-to, shortcuts + input-guard, deep link, list view, mocked-provider-failure → simulated banner. Network-layer mocks only. | P1-3, P1-14, P1-18 | full suite green in CI |
| P1-24 | **T5.2 gates.** Lighthouse CI thresholds (shell: perf ≥80 mobile/≥90 desktop, a11y ≥95, best-practices ≥95, CLS <0.1) + bundle-size CI check per T4.5 budget. | P1-20, P1-23 | CI fails on breach (demonstrated by threshold config) |
| P1-25 | **T5.4 coverage for new work.** Tests for rate limiter, redaction, validators, sun position, new providers, cache headers. Fixtures only, zero live-internet dependence. | each P-task above | coverage report; no test hits live internet (CI offline-proof) |

### P2 — maintainability / docs / polish (after P0+P1)

| Order | Task | Depends on | Verification |
|---|---|---|---|
| P2-1 | **T1.6 repo hygiene.** Move `kimi dot md/`, `md fils/`, `docs/prompts/` → `docs/archive/` (read before moving; never delete unread); zero spaces in tracked paths. | none (do anytime P0 is done) | `glob` shows no spaced paths; archive listing in PR body |
| P2-2 | **T3.1 tokens + DESIGN.md (dark-only).** `redesign-existing-projects` audit-first → `docs/design/audit.md`, then `design-taste-frontend` + `high-end-visual-design` → `docs/design/DESIGN.md` (dark-only per owner; severity scale color-blind-safe + icon/text). Tokens as CSS vars + Tailwind mapping. No rebrand, no new libraries. | P1-3 (audit screenshots) | `DESIGN.md` + preflight ticked; tokens single-sourced; contrast check |
| P2-3 | **T3.4 composition.** Compound `Panel/LayerRail/Dock/Legend/EventCard`; ≤4 boolean props/component; Testing-Library test per compound component. (SentinelApp split in P1-13 counts toward this.) | P1-13 | prop-count lint/review; tests green |
| P2-4 | **T3.5 alignment (scoped).** Close every `ui-issues.md` item or explicitly reject with reason; after-shots at 4 viewports; long-name + 2000-marker checks. CSS-grid shell stays. | P1-3 (issue list), P2-2 (tokens) | before/after shots; zero open unaddressed items |
| P2-5 | **T3.9 responsive + T4.6 low-power.** Bottom-sheet panels <768 px; ≥44 px targets; no hover-only; auto + manual low-power (fewer effects, 2K, lower DPR). | P2-4 | viewport + touch-target checks; low-power toggle test |
| P2-6 | **T3.11 motion.** `vercel-react-view-transitions` panel/route transitions ≤300 ms, compositor-friendly, interruptible camera easing, disabled under reduced motion. | P1-18 | reduced-motion test; timing audit |
| P2-7 | **T3.12 styling cleanup.** Remove Vite-era dead CSS + unused Radix/shadcn; stay on Tailwind v3 (v4 = separate future task). | P2-2 | dead-code diff; gates green; visual parity shots |
| P2-8 | **T3.13 settings/diagnostics.** Diagnostics: API base, health+latency, provenance, WebGPU support, active renderer — never secrets. About: data + texture credits. | P1-4 | manual review + screenshot; secret-grep clean |
| P2-9 | **T3.14 review gates.** `web-design-guidelines` zero critical/high; `react-best-practices` zero critical; Taste pre-flight ticked in `docs/design/preflight.md`. | P2-2…P2-8 | gate checklists in `preflight.md` |
| P2-10 | **T4.5 bundle budgets in CI.** Initial route JS ≤200 KB gzip excl. lazy globe chunk; charts/panels/settings lazy; CI enforcement. | P1-24 | CI size check wired + green |
| P2-11 | **T5.3 supply chain.** `npm audit --audit-level=high` in CI; Dependabot/Renovate weekly grouped; Node pinned consistently (`.nvmrc`/engines/CI already 24). | P1-1 | CI audit step green; config file present |
| P2-12 | **T5.5 docs + MIT license.** README rewritten to reality (updated real/partial/sim table, endpoints, limits, env vars); `AGENTS.md` (stack, commands, "never simulated-as-live", skills); `docs/development.md` (headers, CSP, limits, TTLs, provider terms); add MIT `LICENSE` (owner chose MIT). | all behavior tasks (docs match behavior) | docs-vs-behavior review; LICENSE present |

No P3 items remain — every surviving task is P0–P2. Do not start T3-style visual work before P1-3 screenshots exist; do not spend on P2 while a verified P0/P1 is open.

**P1-3 cancellation (2026-10-09, owner decision):** automated browser testing is cancelled and its artifacts were removed (`playwright.config.ts`, `e2e/`, `test-results/`, `e2e-*.log`, `docs/audit/screens/`, Playwright devDeps + `e2e` script). Browser QA, responsive inspection, and visual verification are performed manually by the repository owner — do not reinstall or reintroduce automated browser testing without a new owner decision.

---

## 11. Already-fixed / protected work (do not regress)

AppShell grid composition · GlobeStage framing · rail/header/dock geometry · intelligence decomposition (`DataPanel/EventList/EventDetails/LayerOverview`) · visx charts + ValueHistogram code-split · lazy provider dispatch · per-instance cache + stale fallback · hydration-safe clock · WebGPU/WebGL parity contract + probe/force/watchdog · atmosphere values (both renderers) · globe scale (R=5, cam 16.4) · rAF-throttled picking + drag discrimination · DPR caps · disposal paths · keyboard input guard · EventList alternative · focus-visible + reduced-motion + skip link + skeletons · Node 24 alignment (`.nvmrc`/engines/CI) · 90-test suite · production-build green · truthful `data_status`/provenance everywhere · `{success,data,meta}` envelope + error shape · `src/components/globe/`, `src/lib/webgpu.ts`, `src/lib/geo.ts`, `src/server/`, `src/app/api/`, `src/services/api.ts`, `src/types/` contracts.

---

## 12. Risks (verified only) + recommendation

**Risks:** adding enforcing CSP blindly breaks WebGPU/WebGL/textures/workers/GIBS (report-only first); in-process rate limit on serverless gives false safety (evaluate Vercel Firewall first); renderer removal without device data; T2.6 provider terms unverified; `?renderer=` is the only URL state — T3.3 must not break it; heatmap budget needs owner sign-off (default 250 KB gzip); visual work without Playwright risks churn (tooling decision first).
**Blocked verifications:** screenshots/axe/Lighthouse/bundle numbers (tooling now APPROVED — see P1-3/P1-23/P1-24); git-history secret scan (owner performs separately); live-site/API claims (audit was README/config-based; headless run could not reach prod).

## Executive result (Rev.2)

**`RECONCILIATION COMPLETE` — `READY TO IMPLEMENT APPROVED TASKS` on owner go-ahead.**

All §13 decisions are recorded; the §10 plan is self-contained. Start at P0-1 and proceed in order — one task = one commit (`T<id>: <summary>`), gates after every task. No product code was changed in Phase 0/Rev.2.

## 13. Owner decisions log (2026-10-08 — binding)

| # | Decision | Ruling |
|---|---|---|
| 1 | Finding counts | Corrected: CONFIRMED 20 · STILL RELEVANT 5 · ALREADY FIXED 1 · REFUTED 2 · NOT VERIFIABLE 2 = 30 (§8) |
| 2 | Chart system | `@visx/*` stays; no Bklit replacement without a separate owner-approved product decision |
| 3 | Playwright / Lighthouse | Both APPROVED (dev/tooling only) |
| 4 | Theme | DARK-ONLY — no light mode |
| 5 | Skills | Direction `design-taste-frontend` · style `high-end-visual-design` · audit `redesign-existing-projects` (`minimalist-skill`/`output-skill` absent — do not invent) |
| 6 | Client data lib | SWR |
| 7 | Default first layer | `earthquakes` |
| 8 | Heatmap budget | 250 KB gzip/request |
| 9 | Rate limiting | Verify Vercel plan first; prefer Vercel-native; no paid infra |
| 10 | Reverse geocode | Real provider only if terms permit; otherwise `UNAVAILABLE`, never simulated |
| 11 | License | MIT (agent adds `LICENSE` under P2-12) |
| 12 | Renderers | No WebGPU/WebGL removal without measured evidence (§10 P1-22) |
| 13 | Architecture | No frontend-architecture redesign beyond what surviving tasks require with proven insufficiency |
| 14 | Git | Owner runs history secret scan; agent uses no git commands and commits nothing |
| 15 | Automated browser testing (P1-3) | CANCELLED 2026-10-09 — no automated browser testing (no Playwright or alternatives, no automated screenshots, no automated baseline reports); browser QA, responsive inspection, and visual verification are owner-manual |

**Recommendation: `READY TO IMPLEMENT APPROVED TASKS` — awaiting owner's go-ahead for P0-1.**
