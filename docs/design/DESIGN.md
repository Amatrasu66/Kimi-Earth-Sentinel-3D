# DESIGN.md — Earth Sentinel 3D design system (as built)

**Status:** descriptive record of the implementation, not a proposal.
Every value below was read from the current tree (`src/app/globals.css`,
`tailwind.config.js`, the components cited). Where no convention exists in
code, this document says so instead of inventing one. Visual, GPU,
screen-reader and contrast verification remain **owner-manual** (no
Playwright, screenshots, Axe or Lighthouse in CI by owner decision) — a
passing unit test is not a visual sign-off.

Related: `docs/development.md` (behavior, API, caching), `docs/audit/phase-3-review-gates.md`
(requirement matrix), `PRD-earth-sentinel-audit-and-frontend-rework.md` (Phase 3, T3.1).

---

## 1. Design principles (existing conventions)

- **Dark-only scientific workstation.** The app renders under `class="dark"`
  always (`SentinelApp` root, `layout.tsx`); there is no light theme and no
  theme switch (owner decision, reconciliation §13.4).
- **Earth-first.** The geographic stage is the dominant object; chrome is
  translucent (`--sentinel-chrome`) so the globe reads through at the edges.
- **Dense but readable.** 11–13 px control type, tabular numerals for data,
  hierarchy carried by weight/size rather than brightness.
- **Real geography + layer data.** A persistent local base Earth carries the
  selected layer's real observations as markers; an empty data layer is
  never an empty Earth.
- **Restrained surfaces.** Flat hairline-divided sections, never nested
  cards; one 7 px control radius family; pills reserved for semantic status;
  fixed overlays banned — the `AppShell` grid places every major element.

## 2. Colour and semantic tokens

Single source: `:root` in `src/app/globals.css`. Tailwind consumes the vars
(`tailwind.config.js`); nothing hardcodes a palette hex in components except
the fixed globe-canvas paints (§7) and the severity map below.

| Role | Token | Value |
|---|---|---|
| Page background | `--sentinel-bg` | `#050607` |
| Floating chrome (header/dock) | `--sentinel-chrome` | `rgba(5,6,7,0.72)` + 20px blur |
| Panel surface | `--sentinel-panel` / `--sentinel-panel-solid` | `rgba(13,15,19,0.82)` / `#0d0f13` |
| Elevated (search results, menus) | `--sentinel-elev` | `rgba(20,23,29,0.92)` |
| Hairline / strong border | `--sentinel-border` / `--sentinel-border-strong` | `rgba(255,255,255,0.08)` / `0.14` |
| Primary text / secondary / tertiary | `--sentinel-text` / `-text-2` / `-text-3` | `#f4f5f6` / 62% / 38% |
| **Accent (amber, single source)** | `--sentinel-accent-rgb` | `255 195 31` (`#FFC31F`) |
| Accent derivatives | `--sentinel-accent-soft/-hover/-border/-glow/-ring` | 12/16/30/18/70% alpha washes |
| Focus ring | `:focus-visible` | `2px solid var(--sentinel-accent-ring)`, offset 2px |

The old `--sentinel-accent` hex twin was removed (T3.12); Tailwind
`sentinel.accent` resolves `rgb(var(--sentinel-accent-rgb) / <alpha-value>)`
so every `bg-sentinel-accent/[0.1]`-style wash traces to the one triplet
(pinned by `globals-css.test.ts`).

### Provenance states (T3.7)

API `data_status` (`live|stale|simulated|unavailable`) plus client-derived
`cached` (live + server `meta.cache_hit`, never SWR-implied), `error`
(failed, no payload) and `unknown` (no payload, no failure) —
`src/lib/provenance.ts`. Each kind owns a base, an `-rgb` triplet, a 7%
`-bg` wash and a 30% `-border` spine (`DataStatusBanner`); abnormal states
carry stronger washes so simulated can never read as live:

| Kind | Base |
|---|---|
| `live` | `#34d399` |
| `cached` | `#2dd4bf` |
| `simulated` | `#ffc31f` (== accent amber) |
| `stale` | `#fb923c` |
| `unavailable` / `error` | `#f87171` |
| `unknown` / neutral | `#9ca3af` |

Status is **never colour-alone**: every badge/chip/banner pairs the dot
with a text label (plus counts where meaningful).

### Severity scale

`SEVERITY_COLORS` (`src/types/index.ts`): `low #FFC31F → moderate #FF8C00 →
high #FF4500 → critical #FF0000` — a yellow→red sequential scale, always
paired with text/counts (`SeverityBadge`, `SeverityDistribution`,
`EventList`, legend). `SeverityBadge` renders the label plus a dot via
`color-mix` washes (dynamic per-severity values — a sanctioned inline-style
exception, §9).

### shadcn + chart tokens

Dark-first shadcn vars drive Button/Badge/Dialog/Sheet/Tabs/Tooltip
(`--primary: 45 100% 56%` amber, `--ring` same hue, `--radius: 0.625rem`).
Chart tokens (`--chart-1…5`, `--chart-scale-01…05`, grid/crosshair/tooltip/
marker) are oklch grey ramps supporting the visx `ValueHistogram`
(code-split, `ssr:false`, ~80 kB, loaded only with a numeric layer panel).

### Known token gaps (not conventions — do not use)

- `tailwind.config.js` maps `status.info` to `var(--status-info-rgb)`,
  but **no such variable exists** and no class references it: dead mapping.
- Conversely `status.cached` has full CSS vars (used by the banner via
  `var()` directly) but **no Tailwind mapping**. Prefer the CSS vars for
  any new provenance usage and leave the mapping alone until a task needs it.

## 3. Typography and visual hierarchy

Font stack (body): `'Instrument Sans', 'Inter', -apple-system,
BlinkMacSystemFont, 'Segoe UI', sans-serif`; numerals:
`sentinel-mono` (tabular-nums, `ui-monospace, 'SF Mono', 'JetBrains Mono',
Menlo, monospace`). **There is no formal type scale** — the working
hierarchy is these utility classes in `globals.css`:

| Class | Use |
|---|---|
| `sentinel-app-title` 14px/650 | product identity |
| `sentinel-layer-name` 13px/550 | active layer |
| `sentinel-metric-value` 22px/650 | primary values (`MetricRow`) |
| `sentinel-section-title` 13px/600 | panel/stage headings |
| `sentinel-label` 11px/500, uppercase, 0.04em, tertiary | section labels |
| `sentinel-micro` 11px tertiary | metadata, hints, counts |
| Controls/rows | 11–13px (`text-[11px]` segments, `text-[13px]` rows/input) |

Long names truncate (`truncate` + `min-w-0` discipline, `title` tooltips on
the layer/dock readouts).

## 4. Application layout and component roles

One grid owns all composition (`AppShell`, `sentinel-shell`):
rows `56px / 1fr / 38px` (header / workspace / status); workspace columns
`68px / 1fr / 348px` (rail / stage / panel), gap 12, padding 12. The grid is
`pointer-events-none`; each island re-enables interaction. Geometry tokens
(`--header-height`, `--rail-width`, `--panel-width`, `--status-height`,
`--workspace-gap`, `--shell-padding`, `--panel-padding`) are the single
source — children never guess offsets. z-order observed in code: canvas
`z-[1]` → shell `z-10` → hint `z-40` → search/results/dialogs `z-50` →
skip link `z-[300]`. (No `z-1000` class exists in `src`.)

- **Header** (`AppHeader`, 3-zone grid `1fr / minmax(0,420px) / 1fr`):
  brand + active layer | command search | provenance chip (≥`md`), `View`
  toggle (T3.15), settings opener (`#sentinel-settings-button`,
  `aria-haspopup="dialog"`). Rail-safe inset at ≥`md` aligns brand to the
  stage edge.
- **Layer rail** (`LayerRail`): 8 layers, `role="toolbar"`,
  `aria-pressed` buttons, accent gutter line + tonal shift for active
  (never a glowing capsule). Desktop: vertical instrument (≥`md`); mobile:
  in-flow horizontal strip with 44px targets. Shortcut order
  temperature→wildfires maps to keys 1–8; tooltips carry hints + `Kbd`.
- **Globe stage** (`GlobeStage` + `DottedEarth`, §7): the visual anchor;
  drafting-notation corner ticks + `SENTINEL STAGE · WGS 84` locator,
  `pointer-events-none` so drag always reaches the globe.
- **Intelligence panel** (`DataPanel`): `intel-shell` (`--radius-panel`
  12px, hairline, 16/48px shadow), title row (back / heading + count /
  refresh / close), provenance strip, then skeleton | error+Retry |
  `EventDetails` | `LayerOverview` (description → legend → metrics →
  distribution → histogram → severity filter → `EventList`, `LIST_LIMIT=50`
  with “N shown” / “Showing 50 of M”).
- **List presentation** (`ListStage`, T3.15): the same panel grammar
  (title row, banner, skeleton/error/detail/list) mounted `absolute
  inset-0` in the **stage cell** when `?view=list`. Same hook payload, same
  severity filter state, same selection/detail components — no second data
  path; the panel stands down so no row renders twice.
- **Status dock** (`StatusDock`, 38px footer): cursor coords · layer+count ·
  provenance chip (≥`md`, visual copy) · UTC clock (client-only,
  `aria-live="off"`) · renderer badge (text + dot via `data-renderer-dot`,
  never `style`).
- **Settings** (`SettingsModal`): Radix `Dialog` on desktop, `Sheet` on
  mobile (`useIsMobile`); tabs Globe (rotation), Shortcuts (single-key
  master switch), Diagnostics (API base/health+latency, provenance, server
  cache, motion, WebGPU, renderer — never secrets; copyable report built
  from the same rows), About (data + texture credits).
- **First-run guidance** (`LayerHint`): quiet rail annotation
  (`role="note"`), “Getting started” once the default layer applies,
  one-time persisted dismissal (`sentinel:first-run-hint-dismissed:v1`);
  below `md` anchored under the header so it never covers rail/panel.

### Responsive behaviour (as implemented, T3.9)

≤1023px: panel 308px, rail 60px. <768px: workspace stacks
stage / rail / panel (`overflow-y: auto`), stage floor `50dvh`, panel cap
`max-md:max-h-[52dvh]`, `dvh` units throughout for mobile chrome; header
collapses brand text (`min-[400px]`, `lg:` variants), layer name ≥`sm`,
provenance chip ≥`md`. **Deliberate deviations recorded, not defects:**
the panel is an in-flow capped panel, not a bottom sheet; dense 28–32px
panel controls stay below 44px; tooltips are hover-only; low-power mode
belongs to Phase 4. All viewports need owner-manual verification.

## 5. Component and interaction conventions

- **Segmented controls:** hairline container (`border-white/[0.07]
  bg-white/[0.02] p-0.5 rounded-[7px]`) + `aria-pressed` segments
  (`rounded-[5px]`, active `bg-sentinel-accent/[0.12–0.13]
  text-sentinel-accent`). Instances: `SeverityFilter` (5: all/critical/
  high/moderate/low + counts, wraps on narrow panels), `ViewToggle`
  (Globe/List, labels collapse to icons below `sm`).
- **Icon buttons:** ghost `h-7`/`h-8`, `rounded-[6px]/[7px]`,
  `text-white/60 → hover white`, explicit `aria-label`s
  (“Close panel”, “Refresh layer data”, “Back to layer view”,
  “Dismiss getting started hint”); tooltips (`delayDuration` 100–200,
  `bg-sentinel-elev`) document + occasionally shortcut `Kbd`.
- **Search** (`CommandSearch`): ARIA combobox (`listbox`/`option`,
  `aria-activedescendant`), 300 ms debounce, 2-char minimum, grouped
  Locations-first results, ↑↓/Enter/Esc, clear button, bounded overlay
  (`max-h-[min(320px,50dvh)]`, list `min(224px,36dvh)` + inner scroll);
  choice flies the globe and closes without re-searching; typing never
  navigates.
- **Selection:** rail toggles layer (clears conflicting event); marker or
  list row opens detail via the race-safe `handleMarkerClick`
  (request-id + abort, fallback detail from point data on API failure);
  Esc backs out selection → panel; layer switches never show stale points
  (`keepPreviousData: false`).
- **States:** loading skeleton (`role="status"`, “Fetching …”, no
  empty-flash); genuine empty (“No events right now”) vs filtered empty
  (“No matching events”); error (`Alert` destructive + Retry → `refetch`);
  `unavailable` keeps banner + empty, never synthesised rows.
- **Provenance banner** (`DataStatusBanner`): spine + washed surface,
  `role="status"` with a tick-stable `aria-label` (absolute fetch time;
  ticking age `aria-hidden`, 30 s cadence, client-only clock for SSR
  determinism). **The single announcer** — header/dock chips are visual
  copies with `sr-only` text; hover cards carry no live region.
- **Keyboard:** `1–8` layers, `Space` rotation (stands down on activatable
  targets), `?` settings, `/` search; guard order typing → repeat → modal
  → modifiers → map → Esc; Settings → Shortcuts switches the whole
  character map off together (persisted
  `sentinel:single-key-shortcuts:v1`; rail/hint/search hints follow).
  Focus restoration: panel close → workspace; detail→list → panel section
  (or list stage in list mode); hint dismiss → workspace; settings close →
  opener button. Skip link targets the active data surface.

## 6. Globe and renderer conventions

- **Default: dotted Earth** (`DottedEarth`, `DEFAULT_GLOBE_MODE =
  'dotted'`): 2D-canvas orthographic globe, no GPU probe, no textures.
  Ocean `#070a0e`, land dots `rgba(226,230,235,0.72)`, coastline stroke
  `0.3`, graticule `0.06`, limb ring `0.16` — no aura/glow/gradient.
  Mounted in the stage cell by `GlobeStage`; never gated on layer, loading
  or points. Canvas is `role="img"` with `sr-only` drag/zoom instructions;
  the panel list is the pointer/keyboard alternative.
- **Geography asset:** `public/geo/land-110m.json` (Natural Earth
  `ne_110m_land`, 127 polygons, 126 KB, same-origin; source/terms in
  `public/geo/NOTICE.md`), fetched once per session (shared in-flight
  promise, failures never cached). Dot field built once (Fibonacci sphere
  + `geoContains`, 3600 candidates ≈ 1000 land dots), never in the frame
  loop. Asset failure still draws ocean + graticule and reports
  `geography unavailable` — never a blank stage, never a false claim.
- **Interaction constants:** globe Ø 42% of stage min-dimension; ambient
  rotation 1°/s; drag 0.28°/px with 6px click/drag discrimination;
  10px pick radius, 3.2px markers; fly-to 1400ms interruptible easing
  (search + selection destinations); wheel zoom clamped (`MIN_ZOOM`…);
  DPR capped 2 desktop / 1.5 coarse; on-demand rAF (idle + hidden-tab
  pause). Markers pass through `filterValidPoints` — rendered N is always
  data N.
- **Renderer selection** (`rendererMode.ts`, `EarthRenderer`): SSR reports
  `pending` (loading veil); client resolves `?renderer=` override or
  `dotted`. The fullscreen fixed container mounts **only** for
  `?renderer=webgpu` (lazy `ssr:false` three/webgpu + TSL chunk) or
  `?renderer=webgl` (R3F fallback); default mode returns `null` so the
  stage globe is the only Earth. WebGPU → WebGL degrades on chunk failure,
  engine error, or a 30 s init watchdog. `onActiveRenderer` reports
  `{active, detail, textures, frames?, source: forced|automatic}` to the
  dock/diagnostics. One shared 60 s sun-direction tuple feeds both 3D
  paths (T2.4). **Owner-manual:** no renderer has been visually verified
  in this programme — parity, frame-rate and look claims rest on code
  inspection and jsdom unit tests only.

## 7. Motion and accessibility

- **Reduced motion:** global CSS kill-switch (`prefers-reduced-motion:
  reduce` zeroes durations/iterations) plus the shared
  `usePrefersReducedMotion` subscription feeding every engine through the
  pure policy in `src/lib/motion.ts` (`advanceFlight` /
  `autoRotateActive` / `startFlight`): auto-rotate, cloud drift and
  starfield stop; fly-to becomes an instant jump (including mid-flight
  flips); mid-session OS changes apply without remount. Entrances are
  transform/opacity only (`panel-enter` 220ms, `row-enter` 150ms, live-dot
  2s pulse); camera easing is interruptible by drag.
- **Focus/landmarks:** `main#sentinel-workspace` (focusable), `header`,
  `footer` status bar, `role="search"`, `role="toolbar"` rails;
  focus-visible ring everywhere (no resets); truthful naming via `sr-only`
  text (never `aria-label` on generic spans).
- **Status honesty:** text + icon/count everywhere; `aria-live` limited to
  the one banner, renderer badge, transient loading, and search's own
  regions; never “real-time”, ages from real `fetched_at` only.
- **Explicitly not established:** no Axe run (zero serious/critical
  unproven), no contrast audit, tooltips hover-only, rail uses Tab (no
  roving tabindex), globe drag/zoom pointer-only, list is not sortable and
  not a table, row selection opens detail without flying. Do not claim
  WCAG conformance from unit tests.

## 8. CSS and implementation conventions

- Tokens are single-sourced in `globals.css` `:root`; Tailwind maps them
  (never the reverse). Component files use utilities + the
  `sentinel-*`/`intel-*`/`layer-rail`/`globe-stage-*`/`dotted-earth`
  layers; no per-component `<style>`, no magic offsets (shell tokens),
  no new z-indexes (use the §4 scale).
- **SSR/CSP discipline** (pinned by `page.test.tsx`): static shell markup
  contains zero `style="…"` attributes. Inline `style` is allowed only
  where the value is genuinely dynamic *and* client-rendered: provenance
  dot/text colours, `SeverityBadge` per-severity `color-mix`, search-result
  icon washes, hover-card cursor position. Prefer existing component
  conventions (banner, badge, segmented control, `intel-section` stack)
  over new abstractions; the T3.12 cleanup removed 13 dead selectors, 3
  dead keyframes and 9 dead tokens — check `globals-css.test.ts` before
  adding anything back.
- State lives in focused app hooks (`useAppUrlState`, `useEventSelection`,
  `usePendingEventResolution`, `useFocusRestore`, `useFirstRunHint`,
  `useSingleKeyShortcuts`, `useFlyTo`) composed by `SentinelApp`, plus
  `useLayerData`/`useSearch`/`useKeyboardShortcuts`/`useSunDirection`; URL is the shareable state
  (`src/lib/url-state.ts`, history push/replace, no `useSearchParams`, no
  RSC refresh); renderer choice (`?renderer=`) stays orthogonal to
  layer/data state.

## 9. Change guidelines for future UI work

1. Reuse tokens and components above; do not invent palette, type or
   radius values — and do not revive T3.12-removed dead code.
2. Keep the dark scientific-workstation direction; no light mode, no
   rebrand, no new visual libraries without an owner decision.
3. Preserve provenance and truthful states: every payload keeps its
   `data_status`, simulated stays loud, unavailable stays empty.
4. Keep renderer implementation separate from layer/data state; `view`
   selects presentation, `?renderer=` selects the globe engine.
5. Preserve keyboard map + off-switch, reduced-motion behaviour,
   focus restoration, and the responsive rules (no horizontal overflow,
   controls reachable at 375px).
6. Make targeted changes; broad redesigns (bottom sheet, icon pass,
   safe-area rework, sortable list/table) need their own evidence-based
   tasks — several are recorded as known gaps, not standards.
7. Validate claims against code and tests; mark anything needing eyes,
   ears or GPUs as **owner-manual** in the change description.
