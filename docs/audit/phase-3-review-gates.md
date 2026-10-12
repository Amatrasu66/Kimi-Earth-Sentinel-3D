# Phase 3 Review Gates (T3.14)

**Date:** 2026-10-12 · **Base commit:** `080346f` (`T3.13: complete settings and diagnostics`)
**Method:** code + test inspection only — no commit messages trusted, no browser automation
(owner decision `25fba5a`: all browser, screenshot, responsive and GPU verification is owner-manual).
**Companions (not overwritten):** `PRD-earth-sentinel-audit-and-frontend-rework.md`,
`docs/audit/current-state-reconciliation.md` (authoritative plan, owner decisions §13),
`docs/development.md`.

**Disposition: NOT COMPLETE** — code-complete on most tasks with documented deviations,
but PRD closure criteria requiring screenshots/Playwright/Axe/DESIGN.md cannot be met
without owner-manual verification and two small outstanding work items (§5). Unit tests
and build passing is explicitly NOT counted as completion (§7 records the 613-test baseline).

Status vocabulary: `COMPLETE` · `PARTIAL` · `DEFERRED` (explicit owner/plan decision) ·
`OWNER VERIFICATION REQUIRED` (implemented + unit-tested, needs human eyes/hands).

---

## 1. Requirement matrix

### T3.1 Audit, direction, tokens — PARTIAL
- **PRD:** `docs/design/audit.md`, `docs/design/DESIGN.md` (dark + light unless dark-only),
  tokens as CSS vars + Tailwind mapping, color-blind-safe severity scale always paired.
- **Implementation:** token system in `src/app/globals.css` + `tailwind.config.js`
  (T3.12-pruned); dark-only per owner decision (reconciliation §13.4); severity colors
  (`src/types/index.ts:172-177`, yellow→red sequential) paired with text/counts everywhere
  (`SeverityBadge`, `SeverityDistribution`, `EventList`, legend).
- **Evidence:** `src/app/globals-css.test.ts` (tokens present, amber single-sourced);
  banner/dock tests (text-plus-colour).
- **Remaining:** `docs/design/` does not exist — neither `audit.md` nor `DESIGN.md` was
  ever written (reconciliation P2-2 was sequenced after screenshots that were then
  cancelled). Follow-up: author `DESIGN.md` from the existing tokens (no screenshots needed).

### T3.2 Server shell and client islands — PARTIAL
- **PRD:** no `force-dynamic` on page, meaningful initial HTML, no component > 250 lines,
  `react-best-practices` checked.
- **Implementation:** `src/app/page.tsx:15-21` deliberately static; shell HTML pinned by
  `src/app/page.test.tsx`; render-decomposed islands (`AppShell`, shell, intelligence).
- **Evidence:** `page.test.tsx` (static export, SSR landmarks, determinism, no inline styles).
- **Remaining:** `src/components/app/SentinelApp.tsx` is **600 lines** (URL machinery, focus
  restoration and first-run logic grew it past the 302 lines reconciliation P1-13 cited) —
  the ≤250-line criterion is unmet. No behavior is broken; follow-up is an extraction
  refactor (`useAppUrlState`, focus-restore helper), not a re-scaffold. Best-practices
  review is recorded in §2 below (done by this task).

### T3.3 URL-driven state — PARTIAL
- **PRD:** `?layer/event/q/sev/view`, reload restore, back closes panel/event, Playwright
  deep-link test, `useSearchParams`.
- **Implementation:** `src/lib/url-state.ts` + `SentinelApp` restore/sync/popstate;
  `view=globe|list` parses/serializes; `?renderer=` passthrough preserved.
- **Evidence:** `src/components/app/SentinelApp.url.test.tsx` (7 tests); search/firstrun suites.
- **Deviations (justified, recorded):** `useSearchParams` deliberately NOT used — direct
  `window.history` push/replace avoids RSC refetch loops (`docs/development.md` documents why);
  Playwright deep-link test replaced by the vitest URL suite after owner cancellation `25fba5a`.
- **Remaining:** no globe/list toggle control exists (`setView` only runs in the restore
  path — verified by grep) — the `view` param restores compatibly but has no UI. Needs an
  owner decision (add toggle vs. retire the param), then a follow-up task.

### T3.4 Composition refactor — COMPLETE (adapted)
- **PRD:** compound components, ≤4 boolean props, one test per compound component.
- **Implementation:** decomposed `shell/` + `intelligence/` + `globe/` + `panels/` with
  Testing-Library coverage per component; boolean-prop count verified by inspection —
  worst cases are `SettingsModal` (3: `isOpen`, `isRotating`, `singleKeyShortcuts`) and
  `Globe` (2): none exceeds 4.
- **Evidence:** per-component suites (`AppShell`, `LayerRail`, `DataPanel`, `EventList`,
  `Severity*`, `CommandSearch`, `SettingsModal`, …).
- **Note:** the formal compound-component pattern was not adopted; decomposition plus the
  `SentinelApp` state-owner split (see T3.2 caveat) is the adapted substance. No further
  refactor is recommended for abstract reasons.

### T3.5 Layout and alignment system — COMPLETE (code) + OWNER VERIFICATION REQUIRED (viewports)
- **PRD:** grid shell, safe areas, spacing/z scales, `ui-issues.md` closure, after-shots at
  four viewports, long-name + 2000-marker checks.
- **Implementation:** one `sentinel-shell` grid (`globals.css`), bounded search overlay,
  truncate/min-w-0 discipline (`13e3484`, `f89239d`).
- **Evidence:** `CommandSearch.test.tsx` (bounds/scroll), `AppShell.test.tsx`,
  `SentinelApp.search.test.tsx` (globe stays mounted).
- **Remaining:** `docs/audit/ui-issues.md` and `screens/after/` cannot exist — automated
  screenshots were owner-cancelled. Long names are handled in code; 2000-marker layout and
  all four viewports need owner-manual verification.

### T3.6 Client data layer — COMPLETE (adapted)
- **PRD:** SWR typed `useLayerData`, dedupe, abort-on-switch (tested), backoff retry,
  SWR revalidation, idle prefetch, five-state UI, no hand-built URLs.
- **Implementation/evidence:** `src/hooks/useLayers.ts` + `useLayers.test.tsx`
  (abort-on-switch, retry caps, 429 pacing); `docs/development.md` documents the contract.
- **Deviation (documented):** idle prefetch covers exactly one candidate (default
  `earthquakes`), not plural "next-likely layers" — a deliberate quota-safe bound.

### T3.7 Provenance UI — COMPLETE + OWNER VERIFICATION REQUIRED (visual)
- **PRD:** persistent per-layer chip (LIVE/CACHED/STALE/SIMULATED/UNAVAILABLE, icon+text,
  source, `fetched_at`), loud SIMULATED, `aria-live="polite"`, true age, never "real-time",
  per-state screenshots.
- **Implementation/evidence:** `resolveProvenance` (`src/lib/provenance.ts`), `DataStatusBanner`
  (single `role="status"` announcer), header/dock sr-only copies; grep confirms no
  "real-time" claim in any `.tsx`; `provenance.test.ts`, `DataStatusBanner.test.tsx`,
  `DataPanel.test.tsx`. Screenshots impossible (cancelled) → owner visual check only.

### T3.8 First-run experience — COMPLETE
- **PRD:** default layer, one-time dismissible hint, skeleton boot.
- **Evidence:** `DEFAULT_FIRST_RUN_LAYER = 'earthquakes'`, persisted hint flag,
  panel skeletons; `SentinelApp.firstrun.test.tsx`, `LayerHint.test.tsx`.

### T3.9 Responsive and mobile — PARTIAL + OWNER VERIFICATION REQUIRED
- **PRD:** bottom sheets <768px, ≥44px targets, no hover-only, low-power mode (T4.6).
- **Implementation/evidence:** stacked workspace, 50dvh stage floor, 44px mobile rail
  strip, dvh caps, hint repositioning; `AppShell/LayerRail/DataPanel/StatusDock/AppHeader/LayerHint/ValueHistogram/SeverityFilter` responsive suites.
- **Deviations/gaps:** the data panel is an in-flow capped panel, **not** a bottom sheet
  (deliberate T3.9 choice preserving globe visibility — recorded, not silently changed);
  dense 28–32px controls (panel icon buttons, tabs, filter segments) remain below 44px;
  tooltips stay hover-only (documented since T3.10); low-power mode does not exist
  (correctly belongs to Phase 4 T4.6, not started). All viewports need owner verification.

### T3.10 Accessibility pass — PARTIAL + OWNER VERIFICATION REQUIRED
- **PRD:** input guard + off/remap, list/table alternative (sortable, keyboard-navigable,
  row-select flies), focus/landmarks/skip, reduced motion, Axe zero serious/critical.
- **Implementation/evidence:** input guard + `Esc` ownership + single-key off-switch
  (satisfies "off **or** remapped"), `EventList` keyboard alternative, landmarks/skip link,
  focus restoration, reduced motion via T3.11; `keyboard.test`, `useKeyboardShortcuts.test`,
  `SentinelApp.a11y.test` (17 tests), `CommandSearch`/`StatusDock` guard tests.
- **Gaps:** list is not sortable, is not a table, and row selection opens detail without
  flying; Axe was never run (no tooling — owner-cancelled automation; no equivalent exists).
  Screen-reader behavior and contrast need owner-manual checks.

### T3.11 Motion — COMPLETE (substance) + OWNER VERIFICATION REQUIRED (GPU pixels)
- **PRD:** `react-view-transitions` transitions ≤300ms, compositor-friendly, reduced-motion
  off-switch, interruptible camera easing.
- **Implementation/evidence:** shared `usePrefersReducedMotion` + pure `src/lib/motion.ts`
  (`advanceFlight`/`autoRotateActive`/`startFlight`) consumed by dotted/WebGL/WebGPU;
  entrances use transform/opacity ≤220ms; kill-switch verified; flights interruptible by
  drag; `motion.test.ts` (6), `usePrefersReducedMotion.test.tsx` (5), dotted integration (4).
- **Deviation (deliberate):** no new `react-view-transitions` dependency was added; the
  substance (short, compositor-friendly, interruptible, reduced-motion-off) is fully met
  without it. Real GPU stillness needs owner browser verification.

### T3.12 Styling stack cleanup — COMPLETE
- **PRD:** remove Vite-era dead CSS + unused Radix/shadcn, stay on Tailwind v3.
- **Evidence:** `f569108` (`globals.css` 709→569 lines; 13 dead selectors, 3 dead keyframes,
  9 dead tokens, sidebar/accordion/caret config pruned); every `ui/*` primitive verified
  imported somewhere; `globals-css.test.ts` guards the contracts; Tailwind v3 kept.
- **Note:** `sentinel-panel` + `bg-sentinel-panel` on dialogs only looks duplicated — the
  utilities-layer order makes the solid override load-bearing (verified, left intact).

### T3.13 Settings and diagnostics — COMPLETE + OWNER VERIFICATION REQUIRED (browser bits)
- **PRD:** diagnostics (base, health+latency, layer provenance, WebGPU, renderer, no secrets);
  About credits (Visible Earth, GIBS, USGS, EONET, FIRMS, Open-Meteo, AirNow).
- **Evidence:** `080346f`; `SettingsModal.test.tsx` (16 tests: rows, motion/cache states,
  copy success/failure, secret-free report, FIRMS/GIBS credits).
- **Remaining:** visual layout + real clipboard-permission flow need owner browser checks.

### T3.14 Frontend review gate — THIS DOCUMENT
- **PRD:** `web-design-guidelines` zero critical/high, `react-best-practices` zero critical,
  `docs/design/preflight.md` ticked.
- **Outcome:** both skill reviews executed against the current tree and recorded in §2
  (no critical/high findings; lows documented). `docs/design/preflight.md` cannot be
  ticked — `docs/design/` was never created (see T3.1 gap); creating a preflight against
  a nonexistent `DESIGN.md` would be box-ticking, so it is recommended as follow-up work
  instead (see §5).

---

## 2. Shared quality-gate review (T3.14)

Gates verified working and consistent: `npm run lint` (`eslint src`), `npm run typecheck`
(`tsc --noEmit`), `npm test` (`vitest run`, jsdom single project), `npm run build`
(`next build`); CI (`.github/workflows/ci.yml`) runs `npm ci → lint → typecheck → test → build`
on Node 24, matching `.nvmrc`, `engines: 24.x`, and CI `node-version: 24`. No `NEXT_PUBLIC_`
secrets in `src`; `.env.example` valueless; CSP Middleware + report-only policy intact
(untouched since `3c953d8`; page SSR test still asserts zero inline-style attributes).
`{success,data,meta}` envelopes, `data_status`/`cache_hit` semantics, and `?renderer=`
selection are unchanged and covered by existing suites.

### web-design-guidelines pass (fetched 2026-10-12, applied to shell/panel/search/settings)
No critical or high findings. Lows/advisories recorded, none fixed in this audit task:
- `transition-all` in shadcn `button`/`switch`/`scroll-area` (upstream defaults on
  micro-controls; neutralized under reduced motion by the kill-switch).
- No `<h1>` (brand is a span; panels/dialogs use `h2`/`h3`) — accepted product voice,
  consistent hierarchy below it.
- Decorative lucide icons lack `aria-hidden` in several labelled buttons (e.g. the dock
  `Cpu` icon); practically skipped inside labelled controls but not guaranteed — 
...[truncated 3580 chars]

---

## 3. Addendum — T3.16 design documentation (follow-up, original record above untouched)

- **New file:** `docs/design/DESIGN.md` (created by T3.16 at the PRD T3.1
  path) — an evidence-based record of the design system as built: dark-only
  direction, colour/semantic/provenance/severity tokens with values,
  typography conventions, shell regions (incl. the T3.15 view toggle) and
  responsive rules, component/interaction conventions, globe and renderer
  behaviour, motion and accessibility handling, CSS/SSR-CSP rules, and
  contributor guidelines. No styling, tokens, or behaviour were changed to
  write it; it duplicates neither `docs/development.md` nor this report.
- **T3.1 reassessed against the PRD acceptance criteria:** `DESIGN.md` now
  exists; tokens-as-CSS-vars plus Tailwind mapping and the paired
  severity scale were already complete (T3.12, `globals-css.test.ts`).
  Still open: `docs/design/audit.md` was never written (sequenced after the
  cancelled T0.3 screenshots), and `docs/design/preflight.md` remains
  unticked for the same reason — a preflight still has no owner-verified
  visual baseline to check against.
- **Documentation is not verification:** the new document marks
  code-established behaviour apart from owner-manual checks (GPU pixels,
  viewports, screen reader, contrast, Axe) throughout. Phase 3 as a whole
  is still **NOT complete** — this addendum closes the design-documentation
  gap only; the T3.14 disposition and every other §1 remainder stand.

---

## 4. Addendum — T3.17 SentinelApp decomposition (follow-up, original record above untouched)

- **What changed:** `src/components/app/SentinelApp.tsx` (661 → **305 lines**)
  is now a composition root. All orchestration moved to cohesive,
  explicitly-typed hooks in `src/components/app/`, each with its own
  lifecycle and no new dependencies:
  - `useAppUrlState` — URL↔state sync, first-run default, push/replace
    conventions, popstate (pure parsing still in `src/lib/url-state.ts`).
  - `useEventSelection` — selected marker + race-safe, abortable detail
    fetch (stable opener identity preserves the memoized renderer).
  - `usePendingEventResolution` — deep-link id resolved against fresh layer
    data or dropped, never fabricated.
  - `useFocusRestore` — focus request/apply lifecycle + surface checks.
  - `useFirstRunHint` / `useSingleKeyShortcuts` — persisted client-only
    flags. `useFlyTo` — validated flight destination + retrigger key.
  - `SHORTCUT_LAYERS` order moved to its owner, `src/hooks/useKeyboardShortcuts.ts`.
- **Tests:** the URL/search/firstrun/a11y/view/keyboard/renderer/SSR suites
  (45+ integration tests) pass unchanged against the new boundaries —
  they cover the extracted URL lifecycle through its consumer. New focused
  suites pin each lifecycle directly: `useEventSelection` (race, abort,
  failure fallback, unmount), `usePendingEventResolution` (resolve, drop,
  stale-wait, selection-wins), `useFocusRestore` (targets, fallbacks,
  containment), `useFirstRunHint` + `useSingleKeyShortcuts` (persistence,
  hydration restore, storage-failure degradation), `useFlyTo`
  (validation, retrigger key). Full suite: 660/660 across 71 files;
  `lint`, `typecheck`, `next build` green.
- **Reassessment:** the ≤250-line criterion is **NOT met** (305 lines, 55
  over — 251 even excluding blanks/comments). Blocker, precisely: the
  remaining file is imports (24, one per consumed region/hook), hook
  composition + five local states + data-presentation wiring, four thin
  navigation handlers, keyboard wiring, and ~130 lines of region JSX for
  eight shell regions. Reaching 250 would require splitting presentational
  composition into prop-drilled components, a single oversized controller
  hook, or comment/formatting compression — all explicitly rejected by the
  task's own avoid-list. No behaviour changed; no visual equivalence is
  claimed from unit tests (owner-manual browser verification still
  required). Phase 3 disposition unchanged.