# OpenCode Prompt — Earth Sentinel Visual Fix Pass

## Objective

The full frontend overhaul is already complete and has passed the code-level audit.

This task is a **focused visual correction pass**, based on the attached browser screenshots.

Do not perform another broad redesign.

Do not restart the frontend architecture.

Do not change the backend.

Do not change the application's data model.

Do not touch the existing Earth rendering architecture except for the specific visual halo/hue issue described below.

The goal is to fix the concrete visual problems visible in the supplied screenshots while preserving the successful overhaul.

---

# 1. Visual Problems To Fix

The screenshots show four issues that must be fixed.

## Issue A — Remove the blue halo around the Earth

The Earth currently has a strong, bright blue outer glow/halo.

This is visually distracting and makes the globe look like it has a large artificial blue ring around it.

### Required result

The Earth should retain:

- atmospheric depth
- edge definition
- realistic lighting
- the existing globe texture
- cloud layer
- current Earth scale
- current rotation
- current interaction

But it must NOT have the large bright blue rim visible in the screenshots.

The outer edge should become much more restrained.

### Important

Do not replace the globe.

Do not rewrite the globe implementation.

Do not change:

```text
EarthRenderer
WebGPUEarth
Globe
GlobeScene
MarkerSystem
fly-to logic
raycasting
WebGPU/WebGL selection
```

Only identify the existing source of the blue atmospheric/edge effect and reduce or remove the unwanted visual component.

Inspect:

```text
src/components/globe/
src/shaders/atmosphere.ts
```

and determine which existing material/shader/atmosphere layer is producing the blue ring.

Prefer a targeted parameter/token/material correction rather than rewriting the rendering system.

Do not introduce a new globe package.

Do not replace the current Earth implementation.

---

# 2. Issue B — Replace the Existing Chart/Diagram Visuals With Bklit

The current dashboard includes a chart in the data panel.

The chart treatment does not fit the redesigned interface.

One visible problem is the use of an unwanted blue chart color.

## Required direction

Use **Bklit/BKL** for chart and diagram components.

From this point forward:

> Bklit is the preferred charting system for Earth Sentinel.

Do not introduce Recharts.

Do not introduce another charting library.

Do not create a second charting system.

Verify the official Bklit registry/source before adding anything.

Use the project's shadcn/registry workflow where supported.

Only install/add the exact Bklit component(s) needed.

Do not install the entire library unnecessarily.

---

## Chart requirements

Any Bklit chart integrated into the project must inherit the Earth Sentinel design system.

Do NOT use Bklit's default visual palette blindly.

In particular:

- remove the unwanted blue visual seen in the screenshot
- do not use generic dashboard blue unless a data semantic explicitly requires blue
- use existing Sentinel semantic/accent tokens
- use the project's severity/status colors where semantically appropriate
- keep yellow/amber reserved primarily for active/selection/primary states
- keep live/simulated/stale/unavailable colors semantically correct

Charts should visually belong to this application.

They should not look like an imported third-party demo.

---

## Important chart-data rule

Do not fabricate historical environmental data.

Continue to respect the existing data-provenance rules.

Use only data that genuinely exists in the current API payloads.

If a chart represents:

- current temperature distribution
- current event severity
- current point magnitude/value spread
- current layer statistics

that is acceptable.

Do not turn explicitly simulated historical data into a chart that visually implies real historical measurements.

---

# 3. Issue C — Fix Layer Navigation Rail Alignment

The layer navigation rail currently has poor visual alignment.

The supplied screenshots show:

- inconsistent vertical alignment
- awkward positioning relative to the viewport
- spacing that does not feel deliberate
- icon/text alignment that feels slightly off
- the rail and hint/panel relationship feels improvised

The rail should feel like a deliberately designed command-center control surface.

---

## Required result

The desktop rail must have:

- consistent left/right padding
- consistent vertical item spacing
- centered icons
- consistent active-state geometry
- consistent label placement
- visually balanced top and bottom spacing
- clean alignment with the application shell

The active item should not appear to drift relative to the other items.

The layer label at the bottom should align with the same internal grid.

Avoid arbitrary pixel offsets when a Tailwind spacing scale can express the relationship.

---

## Mobile

Also inspect the mobile layer navigation.

Do not fix desktop while breaking the mobile layout.

Preserve:

- touch target sizes
- active layer indication
- keyboard accessibility where relevant
- current layer semantics

Do not turn the mobile strip into an oversized card.

---

# 4. Issue D — Remove Excessive Pill-Shaped UI

This is a major visual correction.

The current implementation uses too many pill-shaped elements.

Examples visible in the screenshots include:

- active layer badge
- status badges
- temperature badge
- other `rounded-full` or capsule-like elements
- unnecessarily rounded controls

The product should NOT look like a collection of pills.

---

# 5. Tail Scale / Tailwind Rule

The user specifically wants the existing **Tail Scale** used for design changes.

Before modifying UI, inspect the repository and determine the exact installed tool/skill/configuration referred to as:

```text
Tail Scale
```

Do not guess.

If "Tail Scale" refers to the project's existing Tailwind design/spacing/radius scale, use that directly.

If there is a project-local skill or design tool with that exact name, use it according to its instructions.

Do not replace it with a different design system.

Do not install a new unrelated styling framework.

The implementation should use the project's existing Tailwind scale and tokens for:

- spacing
- sizing
- radius
- typography
- borders
- layout
- state styling

---

# 6. Radius Strategy

Replace excessive pill styling with the project's normal component radius scale.

Do NOT blindly replace every rounded class.

Instead classify each rounded element:

### Appropriate

Keep normal rounded corners for:

- panels
- cards
- dialogs
- inputs
- search field
- buttons where appropriate
- tooltips
- sheets
- menus

### Inappropriate

Remove pill treatment from:

- non-interactive status labels
- active layer labels
- ordinary metadata
- chart labels
- decorative badges
- elements that do not need capsule geometry

Avoid excessive:

```text
rounded-full
```

Use the project's standard Tailwind radius hierarchy instead.

Prefer existing semantic component classes/tokens over arbitrary per-element values.

---

# 7. Badge Strategy

Badges are allowed where they communicate a real semantic state.

Examples:

```text
LIVE
SIMULATED
STALE
UNAVAILABLE
CRITICAL
HIGH
MODERATE
LOW
```

But badges should not automatically become pills.

Use compact rectangular or softly rounded treatments where appropriate.

For example:

```text
LIVE
```

can be a compact status treatment without becoming a floating capsule.

Do not remove semantic distinction.

Do remove unnecessary capsule styling.

---

# 8. Active Layer Styling

The active layer currently uses strong amber/yellow treatment.

Keep the active-state concept.

But reduce its dependence on:

- large glow
- pill shape
- heavy rounded borders
- excessive yellow fills

The active state should communicate:

> selected

not:

> bright glowing badge

Use the existing Sentinel accent tokens.

---

# 9. Preserve the Existing Design System

Do not throw away the current design system.

Continue using:

```text
--sentinel-*
--status-*
shadcn tokens
Tailwind utilities
existing motion scale
existing dark theme
```

The goal is refinement.

Do not introduce another competing theme.

Do not randomly add new colors.

Do not create isolated one-off visual systems inside individual components.

---

# 10. Components To Inspect

At minimum inspect:

```text
src/components/globe/
src/shaders/atmosphere.ts

src/components/shell/
src/components/intelligence/
src/components/charts/
src/components/overlays/

src/components/ui/

src/app/globals.css
tailwind.config.*
components.json
```

Pay particular attention to:

```text
AppHeader
CommandSearch
LayerRail
LayerHint
StatusDock
DataPanel
LayerOverview
MetricCard
SeverityFilter
SeverityDistribution
ValueHistogram
MarkerHoverCard
```

---

# 11. Do Not Break These Boundaries

Do not alter:

```text
src/server/
src/app/api/
src/services/api.ts
src/types/
```

Do not change API contracts.

Do not modify:

- layer semantics
- provenance semantics
- live/simulated behavior
- event-detail fetching
- search behavior
- keyboard shortcuts
- fly-to behavior
- marker selection
- renderer selection

---

# 12. Globe-Specific Boundary

You may inspect and make the minimum targeted visual adjustment needed to remove the blue halo.

But preserve:

```text
EarthRenderer
WebGPUEarth
Globe
GlobeScene
MarkerSystem
```

and all of their functional behavior.

Do not change:

- marker raycasting
- instance indexing
- fly-to quaternion logic
- rotation
- WebGPU watchdog
- WebGPU/WebGL fallback
- adaptive DPR
- texture loading
- interaction contracts

The globe itself remains the current placeholder.

---

# 13. Chart Implementation Rules

When replacing the chart:

1. Verify Bklit is compatible with the current Next.js/React setup.
2. Verify its official registry/source.
3. Add only the required component(s).
4. Integrate them through the existing design tokens.
5. Remove the current chart implementation if the new Bklit version fully replaces it.
6. Remove unused chart code/imports.
7. Ensure the chart has loading/empty/error behavior if its data can be unavailable.
8. Ensure the chart remains responsive.
9. Ensure the chart does not introduce an unwanted blue default theme.

Do not add Recharts.

Do not add another visualization library.

---

# 14. Screenshot-Based Acceptance Criteria

Use the supplied screenshots as visual references.

## Earth

Before:

```text
Earth
+
large bright blue external halo
```

After:

```text
Earth
+
restrained atmospheric edge
+
no obvious neon-blue ring
```

---

## Data panel

Before:

```text
dark panel
+
generic chart
+
unwanted blue visual
```

After:

```text
dark panel
+
Bklit-based chart
+
Sentinel color system
+
no generic blue default
```

---

## Layer rail

Before:

```text
icons visually misaligned
spacing feels uneven
bottom label relationship feels awkward
```

After:

```text
consistent vertical grid
balanced spacing
centered controls
clean active state
aligned label
```

---

## Overall shape language

Before:

```text
many pills
many rounded capsules
badge-heavy UI
```

After:

```text
structured panels
controlled radius
compact semantic labels
minimal capsule usage
```

---

# 15. Do Not Overcorrect

Do NOT:

- make everything square
- remove all rounded corners
- remove all badges
- remove the accent color
- flatten the entire UI
- remove semantic status indicators
- redesign the entire shell again
- add new visual effects
- add unnecessary gradients
- add another glow
- add blue accents simply to create variety

The goal is:

> restrained command-center UI with strong geometry and hierarchy.

---

# 16. Performance

Do not regress the completed performance work.

Preserve:

- local cursor hover state
- memoized renderer boundary
- stable callbacks
- lazy WebGPU chunk
- adaptive DPR
- instanced markers
- throttled raycasting
- abort/race guards

Do not introduce animation or chart behavior that causes globe rerenders.

The globe should remain isolated from shell-only UI changes.

---

# 17. Accessibility

Preserve:

- visible focus states
- keyboard navigation
- `aria-pressed`
- search `aria-activedescendant`
- result groups
- event-list keyboard alternative
- reduced-motion behavior
- semantic live-state indicators

Do not make visual cleanup remove accessibility semantics.

---

# 18. Verification

After making changes, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

All must pass.

Then run the production smoke check if the project workflow supports it.

Also verify:

```text
search
layer selection
temperature layer
data panel
chart rendering
settings
event details
globe interaction
WebGPU path
WebGL path
```

---

# 19. Browser Verification

Use the actual running application and inspect the result visually.

Test at minimum:

```text
1920 × 1080
1440 × 900
1360 × 768
1280 × 720
1024 × 768
390 × 844
```

The supplied screenshots are approximately:

```text
1360 × 768
```

and the navigation-rail reference is a narrow crop.

Check:

- Earth halo
- chart colors
- rail alignment
- panel alignment
- pill count
- search alignment
- active states
- mobile layout
- clipping
- overflow
- spacing

---

# 20. Final Cleanup

After the visual changes:

- remove dead imports
- remove dead CSS
- remove old chart implementation
- remove old pill-specific styles if no longer used
- remove unused visual tokens
- preserve semantic tokens
- ensure no duplicate styles were introduced
- ensure no console errors
- ensure no warnings from the new code

Do not leave experimental code in production components.

---

# 21. Required Final Report

When complete, report:

## Earth halo

- root cause
- exact file changed
- exact parameter/material/token changed
- confirmation that globe behavior was preserved

## Charts

- Bklit component used
- registry/source used
- files changed
- old chart removed
- explanation of color/token integration
- confirmation that no fake historical data was introduced

## Navigation

- alignment changes
- desktop behavior
- mobile behavior

## Pill cleanup

- number/type of `rounded-full` usages removed or retained
- new radius strategy
- confirmation that semantic badges remain

## Tail Scale / Tailwind

- exact Tail Scale/tool/configuration discovered
- how it was used
- confirmation that no competing styling system was introduced

## Verification

Report actual results:

```text
typecheck:
lint:
tests:
build:
browser:
WebGPU:
WebGL:
```

Do not claim a browser test was performed unless it was actually performed.

---

# 22. Stop Condition

This is a focused visual fix pass.

Once all four requested problems are fixed and verified:

1. stop
2. do not invent additional redesign work
3. do not add extra effects
4. do not refactor unrelated architecture

The target is not "more design."

The target is:

> cleaner Earth rendering, Bklit-based data visualization, correctly aligned navigation, and a disciplined non-pill Tailwind design language.
