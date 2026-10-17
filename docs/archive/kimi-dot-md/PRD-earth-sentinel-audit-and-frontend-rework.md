# PRD: Earth Sentinel 3D — Audit Remediation and Frontend Rework

**Repo:** https://github.com/Amatrasu66/Kimi-Earth-Sentinel-3D
**Live:** https://kimi-earth-sentinel-3d.vercel.app
**Audience:** OpenCode agent (executes tasks), repo owner (reviews)
**Date of audit:** 2026-10-08

---

## 0. Rules for the agent (read first)

1. Work **phase by phase, task by task**. One task = one commit, message `T<id>: <summary>`.
2. Before touching UI code, **read the installed skills' `SKILL.md` files** (see section 6). Do not skip this.
3. After every task run the gates: `npm run lint && npm run typecheck && npm test && npm run build`. A task is not done if any gate fails.
4. **Never present simulated data as live.** Every payload keeps its `data_status` block and the UI keeps showing it. Replacing a simulated feature with a real one is good; removing the label from a still-simulated one is a bug.
5. **No placeholders, no TODO stubs, no skipped sections** in delivered code.
6. Do not change the API envelope `{ success, data, meta }` or the `data_status` shape without updating `src/types`, tests, and docs in the same commit.
7. Findings tagged **[V]** were inferred from the README or config and **must be verified in source first** (Task T0.2). If a finding is refuted, record that and skip its fix tasks.
8. Do not choose a license. Do not add paid services. Do not add a database or Redis.

**Evidence tags:** **[C]** = confirmed from `package.json`, `next.config.mjs`, the live site, or the live API. **[V]** = from README only, verify in source.

---

## 1. Goals and non-goals

### Goals
- G1. Every feature is honest: clear split between real, partial, and simulated, with simulated features replaced by real ones where a free provider exists.
- G2. Close security gaps around the public API and the NASA FIRMS / AirNow keys.
- G3. Fast first paint and smooth 3D on mid-range laptops and phones.
- G4. Full frontend redesign on Next.js App Router with a clean architecture, a coherent design system, URL-driven state, and accessibility.
- G5. CI that prevents regressions (e2e, bundle size, audit).

### Non-goals
- No new backend infrastructure (no DB, Redis, workers, Render).
- No multi-layer compositing or timeline playback in this pass (kept on roadmap), except where listed in tasks.
- No auth or user accounts.

---

## 2. Audit method and limits

**Read during audit:** README, `package.json`, `next.config.mjs`, the live HTML shell, `GET /api/health`, `GET /api/v1`, and the public pages of both skill sets.
**Not readable during audit:** the `src/` tree (GitHub blocked automated tree browsing) and the rendered UI (no screenshots). So component-level, alignment, and runtime-performance findings are written as **[V]** and are covered by Phase 0 verification tasks. If the owner wants specific alignment bugs listed, attach screenshots and add them to section 5.

---

## 3. Current state snapshot

| Area | Fact |
|---|---|
| Framework | Next.js `^15.3.0` App Router, React 19, TypeScript ~5.9 **[C]** |
| 3D | three `^0.185.1`, R3F `^9.6.1`, drei `^10.7.7`; WebGPU+TSL renderer with WebGL/R3F fallback **[C/V]** |
| Styling | Tailwind `^3.4.19`, Radix primitives, shadcn-style `ui/`, `tailwindcss-animate`, `motion ^14` **[C]** |
| Charts | `@visx/*` at `4.0.1-alpha.0` + `d3-array` **[C]** |
| State | Local `useState` + hooks; single `SentinelApp` (`"use client"`) shell **[V]** |
| API | Next Route Handlers under `src/app/api/v1/*`, in-memory per-instance cache **[V]** |
| Tests | Vitest (node + jsdom); no e2e **[C/V]** |
| Live shell | HTML contains only "Initializing Earth renderer…", "Select layer — choose a layer from the rail, or press 1–8" **[C]** |
| Health | `/api/health` returns `{success,data:{status,service,version,timestamp,uptime_seconds:0}}` **[C]** |

---

## 4. Real vs simulated feature matrix

Legend: **REAL** = live upstream data. **PARTIAL** = real only with key / region / success. **SIM** = simulated, labelled.

| Feature | Provider / source | Status today | Target |
|---|---|---|---|
| Earthquake markers | USGS FDSNWS (no key) | REAL, SIM on failure | keep |
| Earthquake detail | USGS detail feed | REAL | keep |
| Disaster markers | NASA EONET (no key) | REAL, SIM on failure | keep |
| Disaster detail (`eonet-*`) | EONET event endpoint | REAL | keep |
| Temperature / precipitation / cloud / wind markers | Open-Meteo (no key) | REAL, SIM on failure | keep; verify sampling method (T0.2) |
| Air quality | AirNow (key, **US only**, no bbox) | PARTIAL: empty/SIM outside US | **T2.5** global via Open-Meteo Air Quality; AirNow optional for US |
| Wildfire markers | NASA FIRMS (key) | PARTIAL: REAL with key, else SIM | keep |
| Wildfire detail | none | **SIM** even when marker is live | **T2.3** build from the real observation fields |
| Heatmaps | seeded deterministic grids | **SIM (all layers)** | **T2.8** real raster/grid per layer |
| Search | bundled gazetteer + event index | **SIM** | **T2.6** real geocoding |
| Reverse geocode | coarse region lookup | **SIM** | **T2.6** |
| Timezone | longitude-only approximation | **SIM** | **T2.6** offline tz lookup |
| Global stats `/stats` | placeholder | **SIM** | **T2.7** compute from live layers |
| Historical stats | placeholder series | **SIM** | **T2.7** real for quakes/disasters, else `unavailable` |
| Satellite imagery | NASA GIBS tile redirect | REAL (is it used by the UI? verify) | **T2.8** |
| Day/night terminator | static `sunDirection` prop | **NOT real-time** (README: reserved for UTC wiring) | **T2.4** real subsolar point |
| Clouds | drifting static texture | decorative, not data | label as decorative or replace via GIBS (T2.8) |
| Earth textures | NASA Blue Marble family | static art | keep, optimize (T4.1) |

---

## 5. Findings

Severity: **P0** fix first · **P1** fix in this pass · **P2** nice to have.

### Security
| ID | Sev | Tag | Finding | Fix task |
|---|---|---|---|---|
| S-01 | P0 | V | No rate limiting or abuse protection on public API routes; every miss on a cold serverless instance hits NASA/AirNow and burns key quota | T1.3 |
| S-02 | P0 | V | FIRMS key is part of the upstream URL; structured `console.warn/error` may log URLs or error objects containing it | T1.4 |
| S-03 | P1 | C | `next.config.mjs` only sets `reactStrictMode` and `poweredByHeader:false`: no CSP, no `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, framing protection | T1.2 |
| S-04 | P1 | V | Query validation exists, but string params (`q`, GIBS `<layer>/<z>/<x>/<y>`, `id`) need length/charset/range caps verified | T1.5 |
| S-05 | P2 | C | Alpha dependencies in production (`@visx/* 4.0.1-alpha.0`); no `npm audit` or Dependabot in CI | T1.1, T5.3 |

### Bugs and correctness
| ID | Sev | Tag | Finding | Fix task |
|---|---|---|---|---|
| B-01 | P1 | C | `@next/eslint-plugin-next ^16.3.8` vs `next ^15.3.0` (major mismatch) | T1.1 |
| B-02 | P2 | C | `@types/node ^20` vs `engines.node 24.x`; `eslint-plugin-react-refresh` is a Vite leftover; `vitest ^2` with `jsdom ^30` / `jest-dom ^7` needs compatibility check | T1.1 |
| B-03 | P2 | C | README says `/api/health` returns `{status:"ok",…}`; live returns the `{success,data}` envelope | T1.7 |
| B-04 | P2 | C | README lists `https://…/api/v1` as "Backend API" URL; it returns 404 | T2.9 |
| B-05 | P2 | C | `uptime_seconds` is `0` on serverless; meaningless | T2.9 |
| B-06 | P1 | V | Day/night uses a fixed sun direction, so the night side does not match actual UTC time | T2.4 |
| B-07 | P1 | V | Global AQI layer is effectively US-only | T2.5 |
| B-08 | P2 | V | Wildfire "details" are simulated although the observation itself carries real fields (brightness, FRP, confidence, date/time, satellite) | T2.3 |

### Performance
| ID | Sev | Tag | Finding | Fix task |
|---|---|---|---|---|
| P-01 | P1 | V | Per-instance in-memory cache has a low hit rate on serverless; no `Cache-Control` / CDN caching on API responses | T2.1 |
| P-02 | P1 | V | Upstream `REQUEST_TIMEOUT` default 15 s and no explicit route `maxDuration`; multi-point weather layers may fan out | T2.2 |
| P-03 | P1 | C/V | Live HTML has no content (client-only render), page is `force-dynamic`; LCP depends entirely on JS + renderer boot | T3.2 |
| P-04 | P1 | V | Texture weight, DPR, render loop always running, no hidden-tab pause | T4.1, T4.2 |
| P-05 | P1 | V | Two renderers (WebGPU + WebGL fallback) double the maintenance and bundle surface | T4.4 |
| P-06 | P2 | V | Heatmap endpoint ships base64 float32 grids; payload size unbounded by resolution | T2.8 |
| P-07 | P2 | V | No client-side fetch layer (dedupe, abort, retry, cache) beyond a thin `api.ts` | T3.6 |

### Frontend / UI
| ID | Sev | Tag | Finding | Fix task |
|---|---|---|---|---|
| U-01 | P1 | C | First load shows an empty globe and "Select layer"; no default layer, no immediate value | T3.8 |
| U-02 | P1 | V | Whole app is one `"use client"` monolith (`SentinelApp`); no route/URL state, so layer/event/search cannot be linked or restored | T3.2, T3.3 |
| U-03 | P1 | V | Alignment, spacing, z-index, and panel overlap issues suspected; not verifiable without screenshots | T0.3, T3.5 |
| U-04 | P1 | V | Single-character shortcuts (1–8, Space, Esc) risk WCAG 2.1.4 failure and conflict with typing in search | T3.10 |
| U-05 | P1 | V | Canvas-only data: no list/table alternative for keyboard and screen-reader users | T3.10 |
| U-06 | P2 | V | Settings/Diagnostics, legends, and provenance banners are visually inconsistent | T3.7, T3.13 |
| U-07 | P2 | C | Dark-only theme color (`#050607`); dual-mode not confirmed | T3.1 |

### Repo hygiene
| ID | Sev | Tag | Finding | Fix task |
|---|---|---|---|---|
| R-01 | P2 | C | Root folders `kimi dot md` and `md fils` (typo, spaces); `docs/prompts` holds old briefs | T1.6 |
| R-02 | P2 | C | No license ("currently unspecified") | owner decision (section 10) |
| R-03 | P2 | C | No `AGENTS.md` describing conventions for coding agents | T5.5 |

---

## 6. Skills protocol (OpenCode)

Skills are already installed. In Phase 0 the agent must list what it can load and read each relevant `SKILL.md` (also check `.agents/skills` and `skills-lock.json` in the repo).

| Skill | Source | Use for |
|---|---|---|
| `redesign-skill` | Taste Skill | **First** step of Phase 3: visual audit of the existing UI before any redesign |
| `design-taste-frontend` (taste-skill v2, default) | Taste Skill | Design direction, tokens, typography, spacing, color, motion, pre-flight check |
| `output-skill` | Taste Skill | Enforce complete output, no placeholders |
| **one** style skill: `minimalist-skill` (default) or `brutalist-skill` / `soft-skill` | Taste Skill | Visual language. Pick one, never stack them |
| `react-best-practices` | Vercel | Waterfalls, bundle size, server/client split, re-renders (Phase 3, 4) |
| `composition-patterns` | Vercel | Compound components, kill boolean-prop sprawl (T3.4) |
| `web-design-guidelines` | Vercel | Accessibility/UX review gate (T3.10, T3.14) |
| `react-view-transitions` | Vercel | Panel and route transitions (T3.11) |
| `vercel-optimize` | Vercel | Needs Vercel project metrics; only if the owner connects the project; otherwise skip |

Skip: `react-native-guidelines`, `writing-guidelines` (except README review in T5.5), `vercel-deploy-claimable`, image-gen skills, `image-to-code-skill`.

---

## 7. Phases and tasks

Every acceptance criterion (AC) is a checkbox the agent must tick with evidence (test name, command output, or screenshot path) in the PR/commit body.

### Phase 0: Baseline and verification (no product changes)

**T0.1 Baseline gates and metrics**
Run `npm ci`, lint, typecheck, test, build. Run `next build` output review, a bundle analysis (`@next/bundle-analyzer` as a dev-only script), and Lighthouse (mobile + desktop) against `npm start`.
- [ ] `docs/audit/baseline.md` created with gate results, route sizes, first-load JS per route, Lighthouse scores, texture file sizes (`public/textures`)
- [ ] Any failing gate listed with root cause (do not fix yet unless it blocks the build)

**T0.2 Verify every [V] finding**
For each [V] row in section 5, open the code and mark CONFIRMED / REFUTED with `file:line`. Also answer: how are Open-Meteo layers sampled (grid? point count? requests per call)? Is GIBS imagery actually used by the UI? Does the keyboard handler ignore keys while an input is focused? Does `SentinelApp` own all state? Are provider URLs/keys ever logged?
- [ ] Table appended to `docs/audit/baseline.md`
- [ ] Refuted findings are struck from the task list below with a note

**T0.3 Visual baseline**
Add Playwright (dev dependency) and a script that screenshots: empty state, each of 8 layers, marker hover, event detail open, search open, settings open, at 375×812, 768×1024, 1280×800, 1920×1080.
- [ ] Screenshots saved under `docs/audit/screens/before/`
- [ ] `docs/audit/ui-issues.md` lists every misalignment, overlap, clipped text, inconsistent spacing, and contrast problem with screenshot reference and viewport

**T0.4 Skill readiness**
- [ ] `docs/audit/skills.md` lists each skill from section 6 as available/missing and the exact name used to load it
- [ ] Missing skills reported to the owner (do not substitute silently)

---

### Phase 1: Foundations (security, deps, hygiene)

**T1.1 Dependency alignment** (B-01, B-02, S-05)
- [ ] `@next/eslint-plugin-next` matches the installed `next` major
- [ ] `@types/node` matches `engines.node`
- [ ] `eslint-plugin-react-refresh` removed (and its config) unless a Next-valid reason is documented
- [ ] `vitest`, `jsdom`, `@testing-library/*` versions verified compatible; tests green
- [ ] `@visx/*` alpha packages either pinned to exact versions with a comment in `docs/development.md`, or replaced by a stable alternative if charts get redesigned
- [ ] `npm ls` shows no peer-dependency errors; all four gates pass

**T1.2 Security headers and CSP** (S-03)
In `next.config.mjs` add `headers()`: `Content-Security-Policy-Report-Only` first (allow self, `blob:`/`data:` for textures and workers, required NASA/GIBS image origins, no inline script without nonce/hash), plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (deny camera, mic, geolocation unless used), `X-Frame-Options: DENY` or `frame-ancestors 'none'`.
- [ ] Headers present on `/` and `/api/*` (test via a vitest fetch of `next start` or a Playwright response check)
- [ ] Globe renders in WebGPU and WebGL modes with CSP report-only producing no violations
- [ ] CSP switched to enforcing only after zero violations across all layers; documented in `docs/development.md`

**T1.3 Rate limiting and abuse control** (S-01)
Use a Vercel Firewall rate-limit rule (document the exact rule in `docs/development.md`; verify plan limits first) **plus** an in-process token bucket per client IP in a shared `src/server/rate-limit.ts` used by all `/api/v1` handlers. Return `429` with the standard error envelope and `Retry-After`.
- [ ] Unit tests: bucket refills, `429` shape, `Retry-After` set
- [ ] Heavy routes (layers data, heatmap, search, geocode, imagery tile) have stricter limits than health
- [ ] Documented limits in README API section

**T1.4 Secret hygiene** (S-02)
- [ ] Central `redact()` helper strips `api_key`, `key`, `token`, and the configured key values from URLs and error messages before any log
- [ ] Unit test: logging an error whose message contains the FIRMS/AirNow key emits `[REDACTED]`
- [ ] Grep proves no `NEXT_PUBLIC_` env var holds a secret; `.env.example` has no real values; `.gitignore` covers `.env*` (except example)
- [ ] `git log -p -S` scan for committed keys reported in `docs/audit/baseline.md`; if any found, report to owner for rotation (agent never prints the key)

**T1.5 Input validation hardening** (S-04)
- [ ] `q` max length (e.g. 100), trimmed, control characters rejected
- [ ] GIBS `layer` from allow-list only; `z`, `x`, `y` integers within valid ranges for the zoom
- [ ] `id` params match strict patterns (`eonet-…`, USGS id pattern)
- [ ] Each rejects with `400` and tests cover boundary values

**T1.6 Repo hygiene** (R-01)
- [ ] Move or delete `kimi dot md` and `md fils` (ask the owner in the PR description if unsure what they contain; do not delete unread content; move to `docs/archive/`)
- [ ] `docs/prompts` moved under `docs/archive/`
- [ ] No spaces in any tracked path

**T1.7 Documentation drift** (B-03)
- [ ] README health example matches the real envelope
- [ ] README "Backend API" row points to an existing URL (see T2.9)

---

### Phase 2: Data layer, honesty, and caching

**T2.1 Real caching** (P-01)
Add `Cache-Control: public, s-maxage=<layer ttl>, stale-while-revalidate=<2× ttl>` to cacheable GET responses; use Next `fetch` `revalidate` for upstream calls where it fits. Keep the in-memory cache only as a second layer.
- [ ] Response headers verified by test for layers, event detail, imagery capabilities
- [ ] `meta.cache_hit` and `fetched_at` semantics unchanged and tested
- [ ] Documented TTL table in `docs/development.md`

**T2.2 Timeouts and function limits** (P-02)
- [ ] Upstream timeout lowered (default ≤ 8 s) and per-provider override via env
- [ ] Explicit `export const maxDuration` on heavy routes, consistent with the Vercel plan
- [ ] Multi-point weather fan-out uses bounded concurrency and a hard cap; on partial failure returns the successful subset with `data_status.message` stating the gap
- [ ] Tests for timeout → `SIMULATED`/`STALE` fallback behavior

**T2.3 Wildfire detail from real observation fields** (B-08)
Replace the simulated wildfire detail with a card built from the FIRMS observation itself (acquisition date/time, satellite/instrument, brightness, FRP, confidence, day/night). Add those fields to the marker payload if missing.
- [ ] `GET /api/v1/events/<wildfire id>` returns `data_status.status = "live"` when the marker was live
- [ ] No simulated text remains in wildfire detail unless the upstream failed
- [ ] Test with a recorded FIRMS CSV fixture

**T2.4 Real day/night terminator** (B-06)
Compute the subsolar point from UTC (client util, pure function, unit-tested against known solstice/equinox values) and feed `sunDirection` in both renderers. Update every UTC tick at low frequency (≤ once/min).
- [ ] Night side matches real time within 1° of terminator
- [ ] Test vectors for 2026-03-20, 2026-06-21, 2026-12-21 at 12:00 UTC
- [ ] Optional "simulated sun / manual time" control clearly labelled if added

**T2.5 Global air quality** (B-07)
Add Open-Meteo Air Quality as the global provider (no key); keep AirNow as optional US observation source. Remove the `bbox` rejection for the global provider.
- [ ] `air_quality` returns live data outside the US without any key
- [ ] `data_status.source` names the actual provider; model-based vs station-based is stated in `message`
- [ ] Tests for both providers and fallback ordering

**T2.6 Real search, reverse geocode, timezone**
- Search: Open-Meteo Geocoding API (no key) merged with the live event index.
- Timezone: offline lookup (lat/lon → IANA zone) with a small dependency or Open-Meteo `timezone=auto`; no network call needed for the common case.
- Reverse geocode: use a provider whose terms allow this usage; if none is acceptable, return `unavailable` instead of a fake region.
- [ ] No endpoint in this task returns `SIMULATED` while a free real provider works
- [ ] Debounce and rate limits respected (T1.3); provider terms noted in `docs/development.md`
- [ ] Tests with recorded fixtures

**T2.7 Real stats and history**
- `/stats`: counts and maxima from live earthquake (24 h), EONET open events, FIRMS detections (if key).
- `/stats/historical`: earthquakes (USGS date-range queries) and disasters (EONET date range) for 24 h / 7 d / 30 d. Metrics without a real archive return `unavailable`, never a fabricated series.
- [ ] No fabricated history anywhere
- [ ] Each series carries `data_status` and source
- [ ] UI shows `unavailable` as an explicit empty state

**T2.8 Heatmaps and imagery**
Evaluate NASA GIBS raster tiles (use the existing capabilities endpoint) for precipitation, cloud, and fire-adjacent layers; use Open-Meteo gridded sampling (bounded resolution) for temperature and wind. Cap `resolution` and compress or quantize grids to cut payload.
- [ ] `docs/audit/heatmap-decision.md` records per-layer choice with justification
- [ ] Every layer's heatmap is either REAL with provenance or `unavailable`; none silently SIM
- [ ] Payload size per heatmap request documented and ≤ agreed budget (default 250 KB gzip)
- [ ] The decorative cloud layer is labelled "Illustrative" in the UI unless replaced by real imagery

**T2.9 API index and health** (B-04, B-05)
- [ ] `GET /api/v1` returns an index (version, links to layers, health) in the standard envelope
- [ ] `uptime_seconds` removed or replaced by `started_at` per instance with a doc note

---

### Phase 3: Frontend rework (Next.js App Router, skills-driven)

> Framework note: the app is already on Next.js 15 App Router. The migration work is **architecture**: move from one client monolith to server shell + client islands, route/URL state, and a new design system. Do not re-scaffold the project.

**T3.1 Audit, direction, tokens**
Using `redesign-skill` (audit-first) then `design-taste-frontend` plus the chosen style skill:
- [ ] `docs/design/audit.md`: what stays, what changes, preservation rules, from T0.3 screenshots
- [ ] `docs/design/DESIGN.md`: brand direction, type scale, spacing scale, color tokens (dark + light with contrast parity unless the owner chose dark-only), radius, elevation, motion rules, z-index scale
- [ ] Tokens implemented as CSS variables + Tailwind theme mapping (single source of truth)
- [ ] Severity color scale is color-blind safe and always paired with an icon or text

**T3.2 Server shell and client islands** (U-02, P-03)
Target tree:
```
app/layout.tsx            server: fonts, metadata, theme
app/page.tsx              server: static shell (header, rail skeleton, panel skeleton), NOT force-dynamic
components/globe/GlobeStage.tsx      "use client": next/dynamic(..., {ssr:false}) lives HERE
components/shell/*        server where possible, client only for interactivity
components/panels/*       client islands, lazy-loaded
```
- [ ] `force-dynamic` removed from `page.tsx` (API stays dynamic)
- [ ] Initial HTML contains meaningful content (title, layer rail, skeletons), not only "Initializing…"
- [ ] `SentinelApp` monolith removed; no component > 250 lines
- [ ] `react-best-practices` waterfall and bundle rules checked; findings fixed

**T3.3 URL-driven state** (U-02)
`?layer=earthquakes&event=<id>&q=<text>&sev=<level>&view=globe|list` using `useSearchParams` (no new dependency). Back/forward works; a shared link reproduces the view.
- [ ] Reload restores layer, selected event, filters, search
- [ ] Browser back closes panel/event before leaving the page
- [ ] Playwright test covers deep link → correct layer and open event

**T3.4 Composition refactor**
Apply `composition-patterns`: compound components for `Panel`, `LayerRail`, `Dock`, `Legend`, `EventCard`; state lifted into small providers; no boolean-prop explosions.
- [ ] No component with more than 4 boolean props
- [ ] Storybook-free: each compound component has a vitest + Testing Library test

**T3.5 Layout and alignment system** (U-03)
CSS grid app shell with named areas; safe-area insets; one spacing scale; one z-index scale; no magic pixel offsets; resize-safe overlays.
- [ ] Every issue in `docs/audit/ui-issues.md` closed or explicitly rejected with reason
- [ ] After-screenshots in `docs/audit/screens/after/` at all four viewports; no overlap, clipping, or off-grid alignment
- [ ] Layout verified with long location names and 2000-marker load

**T3.6 Client data layer** (P-07)
Add `swr` (or TanStack Query) with a typed `useLayerData(layerId, params)`: dedupe, abort on layer switch, retry with backoff, stale-while-revalidate, prefetch next-likely layers on idle.
- [ ] Switching layers cancels in-flight requests (test)
- [ ] Loading, error, empty, `unavailable`, and `simulated` states all have designed UI
- [ ] No component builds a URL; all go through the typed client

**T3.7 Provenance UI** (U-06)
Persistent status chip per layer: LIVE · CACHED with age · STALE · SIMULATED · UNAVAILABLE, each with icon + text, plus source and `fetched_at`. SIMULATED stays visually loud.
- [ ] `aria-live="polite"` announcement on status change
- [ ] Never claims "real-time"; shows true age
- [ ] Visual regression screenshot for each state

**T3.8 First-run experience** (U-01)
- [ ] Default layer selected on first load (default `earthquakes`; owner may change)
- [ ] One-time dismissible hint for shortcuts and search
- [ ] Skeleton, not text, while the renderer boots

**T3.9 Responsive and mobile**
- [ ] Panels become bottom sheets under 768 px; rail becomes a bottom bar or sheet
- [ ] Touch targets ≥ 44 px; no hover-only functionality
- [ ] Low-power mode honored (T4.6)

**T3.10 Accessibility pass** (U-04, U-05)
Run `web-design-guidelines`.
- [ ] Single-character shortcuts are disabled while any input/textarea/contenteditable is focused, and can be turned off or remapped in Settings
- [ ] **List/table view** of all current markers (sortable, keyboard-navigable) as an alternative to the canvas; selecting a row flies to the marker
- [ ] Visible `:focus-visible` everywhere; semantic landmarks; labelled controls; skip link kept
- [ ] `prefers-reduced-motion` stops auto-rotate and camera easing
- [ ] Axe (via Playwright) reports zero serious/critical violations on `/`

**T3.11 Motion**
Use `react-view-transitions` for panel/route transitions; keep 3D camera easing interruptible.
- [ ] Transitions ≤ 300 ms, compositor-friendly, disabled under reduced motion

**T3.12 Styling stack cleanup**
- [ ] Remove dead CSS ported from the Vite era (`index.css` / `App.css` leftovers) and unused Radix/shadcn components
- [ ] Keep Tailwind v3 in this pass (v4 migration is a separate P2 item, section 10)

**T3.13 Settings and Diagnostics redesign** (U-06)
- [ ] Diagnostics shows API base, health + latency, current layer provenance, WebGPU support, active renderer, never secrets
- [ ] About lists data credits and texture credits (NASA Visible Earth, GIBS, USGS, EONET, FIRMS, Open-Meteo, AirNow)

**T3.14 Frontend review gate**
- [ ] `web-design-guidelines` review: zero critical, zero high open
- [ ] `react-best-practices` review: zero critical (waterfalls, bundle) open
- [ ] Taste Skill pre-flight checklist fully ticked in `docs/design/preflight.md`

---

### Phase 4: 3D and runtime performance

**T4.1 Texture pipeline** (P-04)
- [ ] Textures resized/compressed (KTX2 with WebP/JPEG fallback), mipmapped, with 2K default and 4K only on capable desktop
- [ ] Total texture payload before/after recorded; default load ≤ 6 MB (adjust with justification)
- [ ] Visual parity check at default zoom

**T4.2 Render loop discipline** (P-04)
- [ ] Frame loop idles (on-demand rendering) when paused and no interaction/animation
- [ ] Pauses when `document.hidden`
- [ ] Device-pixel-ratio capped (≤ 2 desktop, ≤ 1.5 mobile)
- [ ] Geometries, materials, textures disposed on unmount; no leak after 20 layer switches (heap snapshot noted)

**T4.3 Marker scalability**
- [ ] 2000 markers sustain ≥ 55 fps desktop and ≥ 30 fps mid-range mobile in Chrome performance capture
- [ ] Above a threshold, clustering or severity-based thinning with a visible "showing N of M" notice
- [ ] Picking stays rAF-throttled; no per-frame allocation (checked in profiler)

**T4.4 Renderer decision** (P-05)
- [ ] `docs/audit/renderer-decision.md`: frame time, memory, bundle size, visual differences for WebGPU vs WebGL on at least 2 devices
- [ ] Decision implemented: keep both (fallback parity tests) **or** retire one with a migration of its unique features
- [ ] Marker, hover, click, fly-to, and sun-direction behavior identical in whichever renderers remain

**T4.5 Bundle budgets**
- [ ] Initial route JS ≤ 200 KB gzip excluding the lazy globe chunk
- [ ] Charts (`visx`), panels, and settings lazy-loaded
- [ ] Budget enforced in CI (T5.2)

**T4.6 Low-power mode**
- [ ] Auto-detect (small screens, `navigator.hardwareConcurrency`, battery saver where available) plus manual toggle: fewer clouds/atmosphere effects, 2K textures, lower DPR

---

### Phase 5: QA, CI, documentation

**T5.1 End-to-end tests**
Playwright specs: load, select each layer, hover and click a marker, open event detail, search and fly-to, keyboard shortcuts (and the input-focus guard), deep link, list view, simulated-banner appears when a provider is mocked to fail.
- [ ] All specs pass in CI headless Chromium
- [ ] Provider failures mocked at the network layer

**T5.2 Lighthouse and size gates**
- [ ] Lighthouse CI on `/` with thresholds: performance ≥ 80 mobile / ≥ 90 desktop for the shell, accessibility ≥ 95, best-practices ≥ 95, CLS < 0.1
- [ ] Bundle-size check fails CI when the T4.5 budget is exceeded

**T5.3 Supply chain**
- [ ] `npm audit --audit-level=high` in CI
- [ ] Dependabot or Renovate config added (weekly, grouped)
- [ ] Node version consistent across `.nvmrc`, `engines`, CI

**T5.4 Unit/integration coverage for new work**
- [ ] Tests exist for rate limiter, redaction, validators, sun position, each new provider, cache headers
- [ ] No test depends on live internet (fixtures only)

**T5.5 Docs and agent guide** (R-03)
- [ ] README rewritten to reflect reality: real/partial/simulated table from section 4 (updated), new endpoints, limits, env vars
- [ ] `AGENTS.md` at repo root: stack, commands, conventions, "never present simulated as live", skills to load for UI work
- [ ] `docs/development.md` updated (headers, CSP, rate limits, caching TTLs, provider terms)

---

## 8. Global quality gates (definition of done)

- [ ] All four gates green: lint, typecheck, test, build
- [ ] Playwright e2e green
- [ ] No layer or endpoint returns simulated data without a visible label
- [ ] No secret in client bundle, logs, or git history (reported)
- [ ] Targets: LCP of static shell < 2.0 s on throttled mobile; INP < 200 ms; CLS < 0.1; globe ≥ 55 fps desktop / ≥ 30 fps mid mobile
- [ ] Axe: zero serious/critical
- [ ] Docs match behavior

---

## 9. Suggested prompts for OpenCode

**Phase 0**
> Read `PRD-earth-sentinel-audit-and-frontend-rework.md` sections 0, 2 and Phase 0. Execute T0.1 to T0.4 only. Do not change product code. Report CONFIRMED/REFUTED for every [V] finding.

**Phase 3 (start)**
> Load `redesign-skill`, `design-taste-frontend`, `output-skill`, `minimalist-skill`, `react-best-practices`, `composition-patterns`, `web-design-guidelines`. Read PRD Phase 3 and `docs/audit/ui-issues.md`. Execute T3.1 first; stop and show me `docs/design/DESIGN.md` before T3.2.

**Any later task**
> Execute PRD task T<id> exactly as written, tick each acceptance criterion with evidence, run all gates, one commit.

---

## 10. Open decisions (defaults assumed unless the owner overrides)

| Decision | Default | Owner action |
|---|---|---|
| License | **None chosen; agent must not add one** | Pick one (e.g. MIT) and add `LICENSE` |
| Theme | Dark + light with contrast parity | Say "dark-only" to skip light |
| Style skill | `minimalist-skill` | Choose `brutalist-skill` or `soft-skill` instead |
| Client fetch lib | `swr` | Prefer TanStack Query? say so |
| Tailwind v3 → v4 | Stay on v3 this pass | Approve as separate P2 task after Phase 3 |
| Default first layer | `earthquakes` | Change if preferred |
| Renderer strategy | Decided by T4.4 data | Override if you want WebGL-only |
| Reverse geocoding provider | Real provider only if terms allow, else `unavailable` | Approve provider |

---

## 11. Appendix: verification commands

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run build
npm start &                       # then:
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/v1
curl -i "http://localhost:3000/api/v1/layers/earthquakes/data?limit=50"
git log -p -S"api_key" --all --oneline | head      # secret scan (do not print values)
```
