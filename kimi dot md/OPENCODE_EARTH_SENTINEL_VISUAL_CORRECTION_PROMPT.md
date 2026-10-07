# OpenCode Prompt — Earth Sentinel Visual Correction Pass

## Role

You are working on the already-completed **Kimi Earth Sentinel 3D frontend overhaul**.

This is **not a new frontend overhaul**.

The previous overhaul is complete on branch:

```text
feat/ui-overhaul
```

The application has already passed the major engineering gates:

- TypeScript: passing
- ESLint: passing
- Tests: 83/83 passing
- Production build: passing
- Production smoke: passing
- API contracts: preserved
- Globe implementation: preserved
- Backend: preserved

Your task is now a **focused visual correction and refinement pass** based on a real-browser review.

Do not rebuild the application.

Do not undo the completed architecture.

Do not introduce a new design language.

The purpose of this task is to fix the specific visual problems identified below and then perform a restrained visual consistency pass.

---

# 1. Primary Visual Problems To Fix

There are four explicit problems.

## Problem A — Blue halo around the Earth

The current 3D Earth has a very strong blue/cyan atmospheric glow around its outer edge.

This is visible in the supplied browser screenshots.

The current effect looks like:

```text
        BLUE / CYAN HALO
       *****************
     ***               ***
    **       EARTH        **
     ***               ***
       *****************
```

This glow is currently too strong and visually dominates the Earth.

### Required result

Remove the visually distracting blue halo.

The Earth should retain:

- depth
- atmosphere where appropriate
- edge separation from the black space
- subtle realism

But it must NOT have a thick bright blue/cyan ring surrounding the entire planet.

The desired appearance is:

```text
black space
     ↓
subtle atmospheric edge
     ↓
realistic Earth texture
```

NOT:

```text
black space
     ↓
bright blue neon ring
     ↓
Earth
```

### Critical implementation rule

Do NOT rewrite the Earth renderer.

Do NOT replace the globe.

Do NOT change:

- marker instancing
- raycasting
- fly-to
- rotation
- camera behavior
- WebGPU/WebGL selection
- renderer probing
- textures
- cloud system
- Earth interaction contracts

First identify exactly where the visible blue halo is produced.

Inspect the existing:

```text
src/components/globe/
src/shaders/atmosphere.ts
src/lib/webgpu.ts
```

and determine which existing visual layer creates the excessive blue edge.

Then make the **smallest possible visual adjustment**.

Prefer adjusting existing:

- atmosphere intensity
- opacity
- falloff
- color contribution
- Fresnel/rim strength
- blending
- scale

over introducing a new rendering implementation.

### Important

The protected-globe rule from the previous overhaul means:

> Preserve globe behavior and architecture, but a narrowly scoped visual parameter adjustment to remove the clearly identified bad halo is allowed.

Do not use this requirement as justification for a globe rewrite.

### Acceptance criteria

The Earth should:

- no longer have a thick cyan/blue ring
- remain clearly separated from the black background
- retain realistic visual depth
- retain clouds and texture
- retain all interaction behavior
- look substantially closer to the supplied screenshots' intended restrained command-center aesthetic

Verify both:

```text
?renderer=webgpu
?renderer=webgl
```

if the implementation supports both.

---

# 2. Chart Problem — Replace the Current Histogram/Chart Treatment

The current intelligence panel contains a chart titled approximately:

```text
Temperature spread
```

The current chart uses a basic internal SVG/bar treatment and has visual elements that feel inconsistent with the new design system.

The screenshots show a chart with a highlighted yellow bar and neutral gray bars.

The current implementation is functional, but the visual quality is not at the level desired for the product.

## Required direction

Use **Bklit** for chart/diagram components.

The user explicitly wants Bklit to be the charting source for this project.

Before implementing anything:

1. Verify the official Bklit registry/integration available to this project.
2. Verify the exact chart component required.
3. Verify that it is compatible with the existing Next.js/React/Tailwind/shadcn setup.
4. Do not invent a registry URL.
5. Do not install an entire chart ecosystem unnecessarily.

If Bklit provides a suitable component through its official registry, use it.

Prefer the smallest Bklit component needed for the actual visualization.

Do NOT install:

```text
recharts
chart.js
visx
nivo
another chart library
```

unless there is an unavoidable, documented reason.

Do NOT use a fake Bklit implementation.

If Bklit cannot be reliably integrated, stop and report the exact blocker rather than pretending it was used.

However, before declaring it blocked, inspect the official Bklit documentation/registry thoroughly.

---

# 3. Chart Visual Requirements

The chart must belong to the same Earth Sentinel design system.

Avoid:

- generic dashboard chart styling
- random blue chart colors
- excessive gradients
- thick borders
- oversized rounded cards
- decorative chart effects
- unrelated component-library aesthetics

The chart should communicate the data first.

Use semantic colors.

The user's screenshot specifically shows an unwanted blue visual element.

Remove any non-semantic blue accent from this chart.

Do NOT introduce blue simply because the chart library's default theme uses blue.

Use the existing Sentinel design tokens.

The current palette should remain restrained.

Possible semantic palette:

```text
primary/selected → Sentinel accent
neutral → neutral gray
live → green
simulated → amber
stale → orange
unavailable → red
info → blue only when semantically appropriate
```

Blue must NOT be the chart's default decorative color.

---

# 4. Chart Data Integrity

Do not fabricate data.

The previous audit established that:

```text
/api/v1/stats/historical
```

contains simulated/mock historical data.

Therefore:

- do not create a historical time-series from that endpoint
- do not label simulated historical data as live
- do not invent historical values
- do not create fake trends

The existing current-point distribution/histogram data can be visualized because it comes from the current dataset.

Preserve the provenance semantics.

If the Bklit component requires data transformation, transform the existing real point data only.

---

# 5. Layer Navigation Rail — Fix Alignment

The current layer navigation rail has poor visual alignment.

The supplied screenshot shows the vertical navigation as:

```text
┌─────────┐
│ LAYERS  │
│         │
│   icon  │
│   icon  │
│   icon  │
│   icon  │
│   icon  │
│   icon  │
│   icon  │
│─────────│
│  TEMP   │
└─────────┘
```

but the internal icon spacing/alignment does not feel deliberate.

The rail currently feels like a group of independently positioned icons rather than one coherent navigation component.

## Required result

Redesign the geometry of the rail without changing its functionality.

Requirements:

- consistent horizontal centering
- consistent vertical spacing
- consistent hitbox dimensions
- clear separation between title and controls
- clear separation between controls and active layer label
- active item centered inside its hitbox
- no drifting icons
- no uneven gaps
- no accidental asymmetry
- consistent padding
- consistent alignment between desktop and mobile representations

The rail should feel engineered.

---

# 6. Rail Geometry

Do not solve the alignment problem by randomly changing margins until the screenshot looks approximately correct.

Define a deliberate layout system.

For example:

```text
Rail
 ├── header
 │    └── LAYERS
 │
 ├── layer navigation
 │    ├── fixed-size button
 │    ├── fixed-size button
 │    ├── fixed-size button
 │    ├── fixed-size button
 │    ├── fixed-size button
 │    ├── fixed-size button
 │    └── fixed-size button
 │
 └── active layer label
```

Use:

- flex/grid
- fixed hitbox dimensions
- consistent gap tokens
- consistent padding
- `items-center`
- `justify-center`

where appropriate.

Do not use absolute positioning for individual icons unless there is a compelling reason.

---

# 7. Desktop + Mobile Rail

The alignment fix must work at both:

```text
desktop
mobile
```

Do not fix desktop by breaking mobile.

The rail currently has different desktop/mobile behavior.

Preserve that behavior while improving its internal alignment.

Verify:

- desktop vertical rail
- mobile layer navigation
- active state
- layer label
- keyboard interaction
- `aria-pressed`
- touch targets

---

# 8. Remove Excessive Pill UI

This is a major design correction.

The current UI has accumulated too many pill-shaped elements.

Examples include:

- active layer labels
- badges
- status elements
- counts
- chips
- filters
- controls

The result is beginning to look like a generic AI-generated dashboard.

Do NOT continue that direction.

## Explicit design instruction

Use the **Taste Skill** as the primary visual authority for this correction.

The project already has:

```text
.agents/skills/design-taste-frontend/
.agents/skills/redesign-existing-projects/
.agents/skills/high-end-visual-design/
```

Read and use the relevant `SKILL.md` instructions before modifying the visual system.

Do not merely mention the Taste Skill.

Actually follow it.

---

# 9. Taste Skill Design Direction

Use Taste Skill to determine where the UI should use:

- text
- separators
- subtle borders
- square/low-radius surfaces
- restrained cards
- typography hierarchy
- whitespace
- contextual grouping
- minimal badges
- structural alignment

The goal is:

```text
intentional interface
```

not:

```text
collection of pills
```

Avoid:

```text
[ Temperature ]
[ LIVE ]
[ 108 ]
[ Low ]
[ Moderate ]
[ High ]
```

when simple typography, spacing, separators, or compact indicators would communicate the same information better.

---

# 10. Pill Replacement Rules

Do NOT remove all rounded corners.

That would be another overcorrection.

Instead use a hierarchy:

### Pills

Reserve primarily for:

- compact status indicators
- truly categorical tags
- live state where a compact badge is useful
- controls where pill geometry has functional meaning

### Structural UI

Prefer:

- subtle radius
- low-radius panels
- square-ish controls
- separators
- typography
- spacing
- understated borders

### Numbers

For things like:

```text
108
0
105
3
```

do not automatically wrap the number in a pill.

Use typography and layout.

### Active layer

Do not make the entire active layer label look like a pill simply because it is selected.

Use:

- accent text
- accent rule
- subtle background
- active rail state
- typography

as appropriate.

---

# 11. Header Cleanup

Inspect the current header for unnecessary pill shapes.

The header should communicate:

```text
Earth Sentinel
current context
search
status
settings
```

without looking like a row of badges.

The active layer indicator can remain compact, but redesign it according to Taste Skill rather than default badge/pill conventions.

---

# 12. Data Panel Cleanup

Inspect the data panel for excessive rounded containers.

Do not remove useful grouping.

Instead distinguish:

```text
panel
section
metric
status
filter
data visualization
```

through:

- spacing
- typography
- separators
- subtle surface changes
- semantic color

rather than wrapping everything in rounded cards.

The panel should feel like a scientific instrument interface.

---

# 13. Do Not Introduce Random New Effects

Do NOT add:

- glow
- neon
- particles
- animated gradients
- excessive blur
- floating cards
- animated backgrounds
- decorative spotlight effects

unless Taste Skill specifically identifies a concrete reason.

The user explicitly wants the existing UI refined, not another effects-heavy redesign.

---

# 14. Preserve the Existing Architecture

Do not undo:

```text
src/components/shell/
src/components/intelligence/
src/components/charts/
src/components/overlays/
src/components/ui/
```

Do not restore:

```text
panels/TopNav
panels/LayerPanel
panels/BottomBar
panels/DataPanel
overlays/Tooltip
```

The completed architecture is intentional.

---

# 15. Preserve Functionality

Do not break:

- layer switching
- keyboard shortcuts
- search
- grouped search results
- search keyboard navigation
- Enter selection
- `aria-activedescendant`
- fly-to
- event selection
- event details
- severity filtering
- provenance
- loading states
- error states
- empty states
- settings
- rotation
- renderer selection
- WebGPU
- WebGL

The recent search regression was already fixed.

Do not reintroduce it.

---

# 16. Protected Backend Boundaries

Do not modify:

```text
src/server/
src/app/api/
src/services/api.ts
src/types/
```

The backend/API contract is already stable.

This task is visual/UI focused.

---

# 17. Globe Boundary

The following are protected:

```text
src/components/globe/
src/lib/webgpu.ts
src/lib/geo.ts
```

and:

```text
src/shaders/atmosphere.ts
```

has a narrow exception:

> You may modify only the minimum existing atmosphere visual parameters necessary to remove the excessive blue halo.

Do not change the renderer architecture.

Do not change globe interaction behavior.

Do not change data-point mapping.

Do not change raycasting.

Do not change fly-to math.

Do not change WebGPU probing.

Do not change renderer fallback.

---

# 18. Use the Taste Skill Correctly

Before making visual changes:

1. Read the Taste Skill.
2. Read `redesign-existing-projects`.
3. Read `high-end-visual-design`.
4. Inspect the existing Earth Sentinel visual system.
5. Identify where the current UI violates the design principles.
6. Apply only changes relevant to this correction pass.

The Taste Skill is the **visual design authority**.

Do not substitute your own generic "modern dashboard" assumptions.

---

# 19. Do Not Add New Runtime Dependencies Unless Required

Preferred:

```text
existing Tailwind
existing shadcn primitives
existing CSS
existing SVG
existing Lucide
Bklit for charts
```

Do not install:

```text
motion
animejs
recharts
chart.js
nivo
visx
zustand
redux
cmdk
react-bits runtime
aceternity runtime
```

unless the specific implementation proves an existing requirement cannot be met otherwise.

For Bklit, verify the official registry first.

---

# 20. Implementation Order

Execute in this order.

## Step 1 — Inspect

Read:

```text
.agents/skills/design-taste-frontend/SKILL.md
.agents/skills/redesign-existing-projects/SKILL.md
.agents/skills/high-end-visual-design/SKILL.md
```

Inspect:

```text
src/components/globe/
src/shaders/atmosphere.ts
src/components/shell/
src/components/intelligence/
src/components/charts/
src/components/ui/
src/app/globals.css
package.json
components.json
```

Identify:

- atmosphere source
- chart implementation
- rail implementation
- pill-heavy elements
- existing design tokens

Do not edit before understanding them.

---

## Step 2 — Fix Earth halo

Make the smallest visual change necessary.

Test:

```text
WebGPU
WebGL
```

Preserve all functionality.

---

## Step 3 — Replace chart with Bklit

Verify the official Bklit integration.

Implement the appropriate Bklit component.

Keep real current-point data.

Remove the existing chart implementation if it is replaced.

Ensure no unwanted blue decorative styling remains.

---

## Step 4 — Fix LayerRail

Refactor the rail geometry.

Use a consistent grid/flex structure.

Test desktop and mobile.

---

## Step 5 — Taste-driven visual cleanup

Systematically inspect:

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
SeverityBadge
SeverityDistribution
ValueHistogram / replacement chart
EventList
EventDetails
Settings
MarkerHoverCard
```

Remove unnecessary pills.

Do not remove functional status badges.

Normalize radius, spacing, borders, and typography according to Taste Skill.

---

## Step 6 — Browser verification

Actually run the application.

Inspect at minimum:

```text
1920 × 1080
1440 × 900
1280 × 720
1024 × 768
768 × 1024
390 × 844
```

Test:

```text
default state
temperature layer
another environmental layer
search
event selection
settings
mobile navigation
```

Test:

```text
?renderer=webgpu
?renderer=webgl
```

where supported.

---

# 21. Visual Acceptance Criteria

## Earth

- [ ] no thick blue/cyan halo
- [ ] Earth remains visually separated from space
- [ ] texture remains intact
- [ ] clouds remain intact
- [ ] atmosphere remains subtle
- [ ] no globe behavior regression

## Charts

- [ ] Bklit used for the chart where supported
- [ ] no generic blue default styling
- [ ] no decorative blue elements
- [ ] chart uses Sentinel design tokens
- [ ] data remains real/current
- [ ] no fabricated history
- [ ] chart is legible
- [ ] chart fits panel density

## Layer rail

- [ ] icons aligned
- [ ] equal spacing
- [ ] equal hitboxes
- [ ] title aligned
- [ ] active state aligned
- [ ] label aligned
- [ ] desktop correct
- [ ] mobile correct

## Design language

- [ ] unnecessary pills removed
- [ ] excessive rounded cards reduced
- [ ] typography does more of the hierarchy work
- [ ] separators used where appropriate
- [ ] spacing is intentional
- [ ] no generic AI-dashboard aesthetic
- [ ] Taste Skill principles are evident
- [ ] globe remains the dominant visual

---

# 22. Engineering Verification

After implementation run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

All must pass.

Then run a production smoke test.

Verify:

```text
/api/health
/
/api/v1/layers
```

and at least:

- search
- one live event
- one environmental layer

---

# 23. Regression Protection

Add or update tests if any functional behavior is touched.

Especially protect:

```text
CommandSearch
LayerRail
chart data transformations
```

Do not reduce the existing:

```text
83/83
```

test baseline.

---

# 24. Git Rules

Work on:

```text
feat/ui-overhaul
```

unless the branch has already been merged and a new correction branch is required.

Prefer a focused commit for this correction pass.

Suggested:

```text
fix(ui): refine globe halo charts and navigation
```

Do not modify unrelated files.

---

# 25. Final Report

At completion report:

## Visual fixes

- atmosphere/halo change
- chart replacement
- rail alignment changes
- pill reductions
- Taste Skill changes

## Dependencies

List:

```text
added
removed
unchanged
```

If Bklit was not integrated, explain exactly why and what was verified.

Do not claim Bklit was used unless it is actually present in the implementation.

## Verification

Report:

```text
typecheck
lint
tests
build
production smoke
browser viewport review
WebGPU
WebGL
```

## Files changed

Give the exact file list.

## Remaining issues

Only list genuine remaining issues.

Do not invent polish work.

---

# 26. Final Design Principle

The final interface should feel like:

> A restrained environmental intelligence instrument surrounding a living Earth.

Not:

> A generic AI dashboard assembled from rounded cards, pills, gradients, and component-library demos.

The globe is the hero.

The UI is instrumentation.

Data is the content.

Motion is feedback.

Color is semantic.

Typography and spacing create hierarchy.

Taste Skill governs the visual decisions.

Make the smallest changes necessary to reach that standard, and do not introduce unnecessary effects or architecture changes.
