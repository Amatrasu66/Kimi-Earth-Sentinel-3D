# Design audit — Earth Sentinel 3D (as built)

**Method:** code + test inspection only (`src/`, `docs/`, suites). No screenshots
exist and none were taken: automated browser testing was cancelled by owner
decision (`25fba5a`), so nothing below claims a visual inspection. Findings are
sorted into four evidence classes; anything outside them is marked pending, not
guessed.

**Companions:** `docs/design/DESIGN.md` (the token/convention record),
`docs/development.md` (behavior), `docs/audit/phase-3-review-gates.md` (T3.14
matrix), `PRD-earth-sentinel-audit-and-frontend-rework.md` (T3.1/T3.14 criteria).

## 1. What stays (code-verified preservation list)

These are load-bearing and must survive future work (see §6 rules):

- Dark-only workstation shell: `class="dark"` root, `color-scheme: dark`,
  no light theme (`src/components/app/SentinelApp.tsx`, `src/app/globals.css`).
- One-grid shell (`AppShell`: header 56px / workspace rail 68px · stage 1fr ·
  panel 348px / dock 38px; tokens in `globals.css`, stacked mobile layout).
- Token single-sourcing (`--sentinel-accent-rgb`, `--status-*` vars consumed
  by `tailwind.config.js`; pinned by `src/app/globals-css.test.ts`).
- Dotted-Earth default with local geography asset, opt-in `?renderer=webgl` /
  `?renderer=webgpu` plus WebGPU→WebGL fallback (`src/components/globe/`).
- URL-driven state via `src/lib/url-state.ts` + `useAppUrlState` (no
  `useSearchParams`, no RSC refresh); `?renderer=` passthrough preserved.
- Provenance honesty: per-state banner/chips, single `role="status"`
  announcer, never colour-alone, never simulated-as-live
  (`src/lib/provenance.ts`, `src/components/overlays/DataStatusBanner.tsx`).
- Keyboard system: guarded map, `Esc` ownership, single-key off-switch with
  persistence, focus restoration (`src/hooks/useKeyboardShortcuts.ts`,
  `src/components/app/useFocusRestore.ts`).
- Reduced-motion policy shared by CSS kill-switch and all engines
  (`src/lib/motion.ts`, `usePrefersReducedMotion`).
- Five-state data UI (loading / empty / filtered-empty / error+Retry /
  unavailable) reusing one `useLayerData` path.
- SSR/CSP discipline: static shell ships zero inline-style attributes
  (pinned by `src/app/page.test.tsx`); dynamic styles only for
  data-driven values.

## 2. Code-verified findings by area

- **Layout hierarchy:** header (brand · search · status/toggle/settings) →
  rail → stage → panel → dock, all placed by the shell grid; overlays
  (hint `z-40`, search/results/dialogs `z-50`, skip link `z-[300]`) layer
  above without intercepting globe drag (`pointer-events-none` grid +
  per-island `auto`). No fixed-position layout outside overlays.
- **Globe/list presentations:** `GlobeStage` (dotted canvas + drafting frame)
  vs `ListStage` (same `LayerOverview`/`EventDetails`/banner contract as the
  panel, `absolute inset-0` in the stage cell); selection swaps list→detail
  so no row renders twice; panel stands down in list mode
  (`SentinelApp.tsx`, covered by `SentinelApp.view.test.tsx`).
- **Layer rail:** 8 layers, `aria-pressed`, accent gutter + tonal active
  state, desktop vertical / mobile 44px strip, shortcut order shared with
  the keyboard map (`LayerRail.tsx`, `SHORTCUT_LAYERS`).
- **Search:** ARIA combobox, 300 ms debounce, 2-char minimum, grouped
  locations-first results, bounded overlay (`min(320px,50dvh)`), Esc
  ownership, choice flies the globe and closes (`CommandSearch.tsx`).
- **Panels:** flat `intel-section` stacks, title/back/refresh/close rows,
  `LIST_LIMIT = 50` with stated counts (`DataPanel.tsx`, `ListStage.tsx`,
  `EventList.tsx`).
- **Provenance:** 7 kinds with text+wash treatments; CACHED reads only the
  server `meta.cache_hit`; ages derive from real `fetched_at`
  (`DataStatusBanner.tsx`, `provenance.test.ts`).
- **Settings:** Radix `Dialog` on desktop, bottom-sheet `Sheet`
  (`side="bottom"`) on mobile; tabs Globe / Shortcuts / Diagnostics /
  About; diagnostics rows double as the copyable report, never secrets
  (`SettingsModal.tsx`, `SettingsModal.test.tsx`).
- **Responsive:** 1023px (panel 308 / rail 60) and 767px (stacked
  stage/rail/panel, 50dvh stage floor, 52dvh panel cap) breakpoints, `dvh`
  units, `min-w-0` truncation discipline; covered by responsive suites
  (`AppHeader`, `LayerRail`, `DataPanel`, `CommandSearch`, `StatusDock` tests).
- **Motion:** transform/opacity entrances (220/150 ms), live-dot pulse,
  interruptible 1400 ms fly-to, on-demand rAF with hidden-tab idle, DPR
  caps (2 / 1.5 coarse) — all neutralised under reduced motion.
- **CSS conventions:** utilities + `sentinel-*`/`intel-*` layers, shell
  tokens instead of offsets, no per-component `<style>` blocks.

## 3. Previously reported, not independently reverified

From the T3.14 matrix and reconciliation, still standing but requiring the
owner's eyes/hands (no tooling exists to re-prove them headlessly):

- Four-viewport after-shots, long-name clipping and 2000-marker layout
  behaviour (T3.5); `docs/audit/ui-issues.md` was never written.
- Real clipboard-permission flow for diagnostics copy (falls back to a
  status message; failure path unit-tested, OS behaviour not).
- Ingredient/product copy re-read (no recorded systematic pass).
- Contrast ratios, screen-reader flows, GPU frame-rates and pixel parity —
  asserted nowhere by tests (see §5).

## 4. Discrepancies: docs vs implementation (recorded, not fixed here)

1. `tailwind.config.js` maps `status.info` to a nonexistent
   `--status-info-rgb`, referenced nowhere; conversely `status.cached` has
   full CSS vars but no Tailwind mapping. Dead mapping + missing mapping —
   leave both until a task needs them (also noted in `DESIGN.md`).
2. The T3.14 report's z-scale note mentions "loading 1000", but no
   `z-1000`/`z-[1000]` class exists in `src` (observed: canvas 1, shell 10,
   hint 40, search/results/dialogs 50, skip 300).
3. Reconciliation §3 cites a 302-line `SentinelApp.tsx`; post-T3.17/18 it is
   305 lines of pure composition (all orchestration extracted). That Phase-0
   document is historical and stays as-is; current count lives in the
   review-gates addenda.
4. "No bottom sheet" shorthand from T3.9 reviews applies to the **data
   panel** (in-flow capped panel, deliberate). Settings **is** a bottom
   sheet on mobile (`SheetContent side="bottom"`).
5. T3.14's "no globe/list toggle" gap is closed (T3.15 toggle + `ListStage`,
   18 integration tests); the T3.14 text remains historical.

## 5. Owner visual-verification register (manual checks still required)

- [ ] Globe/list toggle appearance, pressed state and behaviour at
  375 / 768 / 1280 / 1920 px.
- [ ] Dotted-Earth rendering; `?renderer=webgl` / `?renderer=webgpu`
  behaviour, fallback and look parity.
- [ ] Search navigation, Back/Forward, preserved URL state in a real browser.
- [ ] Responsive layout at narrow, tablet and desktop widths (rail, stage
  floor, panel cap, hint anchoring, dialog/sheet switch).
- [ ] Keyboard walkthrough, screen-reader flows (single announcement per
  provenance change), visible focus on all controls.
- [ ] Reduced-motion behaviour on all three renderers (stillness, instant
  fly-to, mid-session preference flip).
- [ ] CSP console reports in production and development (report-only policy).
- [ ] Settings diagnostics values + clipboard denial handling.
- [ ] Contrast and other visual-accessibility checks (unmeasured in tests).

## 6. Open design decisions (need an explicit owner ruling)

- Data-panel bottom sheet on mobile vs the current in-flow capped panel.
- Decorative-icon `aria-hidden` pass (documented T3.14 low, never scheduled).
- Sortable/table list alternative (current list suffices unless an a11y
  audit demands more).
- Em-dash microcopy restyle (see `preflight.md`: pre-existing dashes in
  status/error strings; copy change out of scope).
- Renderer retirement, bundle budgets in CI, any Phase-4 visual work
  (all correctly belong to later phases, not this audit).

## 7. Preservation rules for future UI work

Reuse tokens/components from `DESIGN.md`; keep dark-only direction;
preserve provenance honesty and truthful states; keep renderer choice
orthogonal to layer/data state; preserve keyboard, reduced-motion,
focus and responsive behaviour; make targeted changes, never broad
redesigns, without an explicit requirement; validate claims against code
and tests and mark manual verification separately.
