# OpenCode Prompt — Post-Overhaul Audit & Hardening

## Role

You are auditing the completed **Kimi Earth Sentinel 3D** frontend overhaul.

The implementation has already been completed on branch:

```text
feat/ui-overhaul
```

Do **not** restart or redesign the application from scratch.

Your job is to perform a rigorous **post-overhaul audit, visual/UX hardening pass, performance review, accessibility review, and final cleanup** against the implementation that is already present.

The previous implementation report claims that all phases 0–8 are complete and that the code/build/test gates pass. Treat those claims as a baseline to verify, not as facts that exempt you from checking.

The main objective is:

> Verify that the finished frontend is actually production-quality in the running application, not merely correct in source code.

---

# 1. Current implementation baseline

The completed implementation reportedly contains:

```text
src/components/shell/
  AppHeader
  CommandSearch
  LayerRail
  LayerHint
  StatusDock

src/components/intelligence/
  DataPanel
  LayerOverview
  EventDetails
  EventList
  MetricCard
  SeverityFilter
  SeverityDistribution

src/components/charts/
  ValueHistogram

src/components/overlays/
  MarkerHoverCard

src/components/ui/
  existing shadcn/Radix primitives
  sheet.tsx

components.json
```

The old panel structure was reportedly removed:

```text
panels/TopNav
panels/LayerPanel
panels/BottomBar
panels/DataPanel
overlays/Tooltip
```

The implementation reportedly preserved the globe and backend/data boundaries.

---

# 2. Protected boundaries

DO NOT modify these unless the audit identifies a genuine correctness bug that cannot be fixed elsewhere:

```text
src/components/globe/
src/shaders/atmosphere.ts
src/lib/webgpu.ts
src/lib/geo.ts
src/server/
src/app/api/
src/services/api.ts
src/types/
```

Do not redesign the globe.

Do not replace the Earth renderer.

Do not rewrite the backend.

Do not change API contracts.

Do not change `DataPoint`, `EventDetail`, layer identifiers, or provenance semantics.

The globe is the protected visual centerpiece.

---

# 3. Audit philosophy

Do not assume that:

- a successful build means the UI is visually correct
- passing unit tests means interactions are correct
- a component that compiles is architecturally good
- a responsive CSS rule works correctly on real viewport sizes
- WebGPU and WebGL behave identically
- a design token is actually used consistently

The code must be inspected **and the running application must be tested**.

Prefer evidence over assumptions.

When possible, use:

- local dev server
- production build + `next start`
- browser/devtools
- screenshots
- viewport resizing
- accessibility inspection
- performance profiler
- network inspection
- console inspection

If browser tooling is available, use it.

If browser tooling is not available, perform the strongest possible source-level and runtime smoke audit and clearly record what could not be visually verified.

---

# 4. Start with a clean baseline

Before changing code:

1. Inspect the git status.
2. Inspect the current branch.
3. Review the diff against `main`.
4. Confirm the overhaul commits are present.
5. Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Do not make changes before collecting the baseline results.

Record the actual results.

---

# 5. Audit order

Perform the audit in this exact priority order:

```text
1. Runtime correctness
2. Visual fidelity
3. UX / interaction
4. Responsive behavior
5. WebGPU / WebGL behavior
6. Accessibility
7. Performance
8. Design-system consistency
9. Data/provenance correctness
10. Code architecture / maintainability
11. Cleanup
12. Final verification
```

Do not optimize bundle size before verifying visible correctness.

Do not polish animation before verifying interaction correctness.

---

# 6. Runtime correctness audit

Launch the application and verify the main route.

Check:

- page loads without runtime exceptions
- no red console errors
- no hydration issues
- no unexpected blank regions
- globe initializes
- UI shell initializes
- data layer controls initialize
- settings initializes
- search initializes

Test all eight layers:

```text
Temperature
Precipitation
Clouds
Wind
Earthquakes
Disasters
Air Quality
Wildfires
```

For each layer verify:

- selection
- deselection
- loading state
- populated state
- empty/unavailable state where applicable
- provenance/status
- marker rendering where applicable
- panel content
- refresh behavior

Do not fabricate expected provider results. Verify against the actual API responses.

---

# 7. Search audit

Test the full search flow.

Verify:

- `/` focuses search
- debouncing behaves correctly
- results appear
- result grouping works
- keyboard navigation works
- Arrow Up / Arrow Down work
- Enter selects a result
- Escape closes search / removes focus appropriately
- clear button works
- outside click closes the result surface where intended
- selecting a location still triggers globe fly-to
- rapid searches do not display stale results

Check the visual hierarchy of search results.

Search should feel like a command interface, not a generic input dropdown.

---

# 8. Layer rail audit

Verify:

- every layer is reachable
- active state is obvious
- `aria-pressed` remains correct
- keyboard access works
- tooltips do not block interaction
- touch targets are adequate
- mobile behavior is usable
- first-run `LayerHint` does not become annoying or permanently obstructive

Check whether the rail visually competes with the globe.

It should remain subordinate to the Earth visualization.

---

# 9. Data panel / intelligence surface audit

Inspect the new intelligence architecture:

```text
DataPanel
LayerOverview
MetricCard
SeverityFilter
SeverityDistribution
EventList
EventDetails
```

The intended hierarchy is:

```text
Layer identity
↓
Data state / freshness
↓
Key metrics
↓
Severity distribution
↓
Analytical visualization
↓
Event list
↓
Detailed event
```

Verify that this hierarchy actually exists in the rendered UI.

Look for:

- duplicated information
- excessive scrolling
- weak headings
- excessive card nesting
- poor density
- unclear primary value
- unnecessary decorative elements
- poor empty states
- inconsistent loading states
- inconsistent status treatment

The panel should feel like an intelligence surface rather than a stack of unrelated cards.

---

# 10. Data provenance audit

This is critical.

Verify the distinction between:

```text
live
simulated
stale
unavailable
```

The following must never look semantically identical when their meaning differs.

Check:

- status badge
- status dot
- provenance copy
- timestamps
- simulated/fallback messaging
- loading state
- stale behavior

Particularly verify that simulated data is never visually presented as live data.

Do not weaken the existing provenance contract merely for aesthetics.

---

# 11. Event interaction audit

Test:

- marker hover
- marker click
- event selection
- event detail loading
- event detail fallback
- back navigation
- panel close
- rapid selection changes
- abort/race behavior
- event list selection

Verify that:

```text
marker click A
→ marker click B
```

does not cause event A's data to overwrite event B.

Verify that the event list remains a complete keyboard-accessible alternative to canvas-only markers.

---

# 12. MarkerHoverCard audit

The old canvas hover tooltip was replaced by:

```text
MarkerHoverCard
```

Verify:

- it positions correctly
- it stays within viewport bounds where intended
- it does not flicker
- it does not interfere with pointer interaction
- it does not cause excessive React renders
- it disappears correctly
- it is not noisy for assistive technology
- it does not intercept pointer events unintentionally

Check the leaf-local animation/frame handling carefully.

---

# 13. Settings audit

Test all settings sections:

```text
Globe
Shortcuts
Diagnostics
About
```

Verify:

- desktop dialog behavior
- mobile sheet behavior
- focus trapping
- focus return
- Escape behavior
- tab navigation
- close button
- renderer information
- diagnostics information
- rotation toggle

Do not remove the diagnostics content.

---

# 14. Responsive audit

Test at actual viewport sizes, not just CSS inspection.

Minimum targets:

```text
1440 × 900
1280 × 720
1024 × 768
768 × 1024
430 × 932
390 × 844
```

Look specifically for:

- overlapping UI
- clipped search
- oversized panels
- unusable layer controls
- inaccessible settings
- obscured globe
- text truncation
- unexpected scrollbars
- broken drawers/sheets
- touch target problems
- status information being duplicated or lost

At narrow widths, the globe should still remain usable and visually important.

Do not simply stack every panel vertically.

---

# 15. WebGPU / WebGL audit

The application supports both renderer paths.

Test the normal automatic path.

Where supported, explicitly test WebGPU.

Also test the WebGL fallback.

If the implementation supports the existing renderer override/debug mechanism, use it for verification only.

Verify:

- same UI overlays work in both paths
- marker interaction works in both
- fly-to works in both
- auto-rotation works in both
- UI does not depend on renderer-specific DOM assumptions
- renderer status remains truthful
- fallback does not break layout
- no new console/runtime errors appear

Do not change renderer internals merely because the UI looks different around them.

---

# 16. Accessibility audit

Use the existing Vercel web-design guidelines skill where appropriate.

Check:

- keyboard navigation
- focus-visible styling
- dialog semantics
- sheet semantics
- tab semantics
- search combobox semantics
- button semantics
- `aria-pressed`
- accessible names
- contrast
- reduced motion
- status announcements
- screen-reader noise
- touch target size

Pay special attention to:

- amber text on dark backgrounds
- severity colors
- live-status colors
- the hover card
- dynamically changing UTC time
- search results
- mobile controls

Severity must not rely on color alone.

---

# 17. Performance audit

This is a 3D application. Performance is a first-class requirement.

The completed implementation already moved cursor-follow state out of `SentinelApp` and memoized the renderer boundary.

Verify that this actually worked.

Use React DevTools / browser profiling where available.

Check whether:

- globe renders unnecessarily during hover
- pointer movement causes shell rerenders
- opening panels triggers globe rerenders
- search typing affects the globe unnecessarily
- animations create jank
- chart rendering causes frame drops
- event lists trigger excessive renders
- unstable props defeat memoization

Do not optimize based on guesswork.

Measure first where possible.

---

# 18. Bundle and dependency audit

The current implementation reportedly added zero runtime dependencies.

Verify this.

Check `package.json` and lockfile.

Confirm that the following were not introduced unnecessarily:

```text
motion
animejs
recharts
zustand
redux
react-hook-form
zod
cmdk
Aceternity runtime packages
React Bits runtime packages
```

Do not install a package merely because it appears in the original design brief.

The finished product should remain lean.

---

# 19. Design-system consistency audit

Review `globals.css`, Tailwind tokens, and component classes.

Check that:

- accent hierarchy is actually used
- hard-coded amber duplication is gone or justified
- semantic status colors remain centralized
- surfaces follow a coherent hierarchy
- border usage is restrained
- radius usage is consistent
- typography is consistent
- spacing is consistent
- motion durations follow the documented scale
- reduced-motion remains respected

Watch for library leakage:

```text
shadcn-looking component
+
random Aceternity-looking component
+
random React Bits-looking component
+
custom Tailwind component
```

All of these must still look like one product.

The final interface must not look like a component-library collage.

---

# 20. Visual hierarchy audit

The visual hierarchy must remain:

```text
GLOBE
↓
CURRENT CONTEXT
↓
ENVIRONMENTAL DATA
↓
CONTROLS
```

Check whether any new component competes with the globe unnecessarily.

Specifically inspect:

- header prominence
- rail prominence
- data panel prominence
- status dock prominence
- search prominence
- chart prominence
- decorative effects

Remove visual effects that are attractive but distracting.

Do not add more glow simply because the interface is dark.

---

# 21. Chart audit

Current charts are intentionally zero-dependency.

Verify:

### SeverityDistribution

- based on real current point data
- totals are correct
- labels/counts are accurate
- not color-only
- responsive

### ValueHistogram

- bins are mathematically correct
- bin labels/summary match the underlying values
- peak highlighting is truthful
- empty data behaves correctly
- `role="img"` summary is meaningful

Do NOT add time-series charts unless real historical data exists.

The API currently exposes simulated historical placeholders, and those must not be presented as real history.

Do not reintroduce Bklit merely to increase visual richness.

---

# 22. Motion audit

The completed implementation reportedly uses CSS and `tailwindcss-animate` rather than Motion.

Evaluate whether that is sufficient.

Do not install Motion automatically.

Only introduce Motion if the audit finds a real interaction requirement that CSS cannot provide without creating poor behavior.

Check:

- animation timing
- consistency
- interruption behavior
- reduced motion
- hover behavior
- panel enter/exit
- list entry
- search result transitions

Avoid animation churn from rapid typing or frequently changing data.

---

# 23. Mobile sheet audit

The settings dialog reportedly becomes a sheet on smaller viewports.

Verify:

- sizing
- scrolling
- safe spacing
- close behavior
- focus handling
- keyboard behavior
- touch behavior

Check the implementation against the actual rendered narrow viewport.

---

# 24. Code architecture audit

Review the new architecture:

```text
shell/
intelligence/
charts/
effects/
overlays/
ui/
```

Do not reorganize files for aesthetics alone.

Look for:

- unnecessary abstractions
- duplicate components
- dead code
- unused exports
- unused CSS
- unnecessary prop drilling
- unstable callbacks
- avoidable coupling
- components that are too large
- components that should be pure

Keep `SentinelApp` as the orchestrator unless a real architectural problem remains.

Do not introduce a global state library.

---

# 25. Cleanup audit

Find and remove where justified:

- unused legacy styles
- unused imports
- dead panel CSS
- obsolete tooltip references
- obsolete component references
- redundant loading styles
- redundant accent definitions
- console debugging
- temporary TODOs that are no longer relevant

Do not remove code merely because it is not currently visible if it supports a required code path.

---

# 26. Fix strategy

When issues are discovered:

1. classify the issue
2. determine its severity
3. fix the smallest correct layer
4. avoid touching protected boundaries
5. run focused checks
6. continue the audit

Severity levels:

```text
P0 — broken app / data correctness / severe accessibility failure
P1 — major UX, responsive, runtime, or performance defect
P2 — visual inconsistency or moderate maintainability issue
P3 — polish / minor cleanup
```

Fix all P0 and P1 issues.

Fix P2 issues when they are local and safe.

Do not spend excessive effort on P3 issues if doing so risks regressions.

---

# 27. Changes that are prohibited during this audit

Do not:

- redesign the globe
- rewrite the backend
- change API payloads
- change provider logic
- replace the Next.js architecture
- add a global store
- replace working data hooks
- fabricate historical data
- add a heavy chart library without evidence
- add animation libraries without necessity
- remove provenance messaging
- remove keyboard alternatives
- weaken accessibility for aesthetics
- make the interface more visually busy just to appear "premium"

---

# 28. Final verification gate

After all fixes, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Then, where possible:

```bash
npm run start
```

and perform a production smoke test.

Verify:

- `/` returns 200
- `/api/health` works
- layer data works
- search works
- globe renders
- shell renders

If available, test both development and production behavior.

---

# 29. Git requirements

Do not modify `main`.

All audit fixes must remain on:

```text
feat/ui-overhaul
```

Use focused commits for meaningful fixes where practical.

Suggested format:

```text
fix(ui): correct mobile layer rail behavior
fix(perf): isolate marker hover rerenders
fix(a11y): improve status and search semantics
fix(visual): normalize accent token usage
fix(ui): correct data panel hierarchy
chore(ui): remove obsolete styles
```

Do not squash or rewrite existing implementation commits unless there is a strong reason.

---

# 30. Final report

At the end, produce a detailed **Post-Overhaul Audit Report** containing:

## Executive result

State:

```text
PASS
PASS WITH FIXES
or
FAIL
```

## Runtime

List the actual runtime findings.

## Visual

List the strongest visual findings.

## UX

List interaction findings.

## Responsive

List viewport-specific findings.

## WebGPU/WebGL

Report each renderer path tested.

## Accessibility

List findings and fixes.

## Performance

Include:

- render observations
- profiler observations if available
- bundle-size results
- whether globe rerenders during hover

## Data integrity

Confirm provenance semantics and chart-data correctness.

## Architecture

List any remaining code-quality concerns.

## Files changed

Provide the exact list.

## Verification

Report actual results for:

```text
Typecheck
Lint
Tests
Build
Production smoke
Browser/runtime checks
```

## Remaining issues

Separate:

```text
blocking
non-blocking
future polish
```

Do not hide known limitations.

---

# 31. Completion condition

The audit is complete only when:

- the application works at runtime
- the visual hierarchy is coherent
- the globe remains dominant
- the new shell feels intentional rather than assembled
- all major interactions work
- mobile layouts are usable
- WebGPU/WebGL paths remain functional
- provenance semantics remain truthful
- no major accessibility failures remain
- no P0/P1 issues remain
- typecheck passes
- lint passes
- tests pass
- production build passes

Do not stop at "the code looks good".

The objective is a verified, production-ready frontend.
