# OpenCode Master Prompt — Earth Sentinel 3D UI Redesign V2

## Mission

You are working on the existing **Kimi Earth Sentinel 3D** application.

The previous engineering/audit passes are complete. The application is functionally healthy, but the **frontend visual composition is still not good enough**.

The current UI feels assembled from independent components rather than designed as one coherent interface. The globe, left layer rail, top navigation, right intelligence panel, and bottom status bar do not share strong alignment anchors. There are too many rounded containers, too many nested cards, inconsistent visual weights, and too much UI chrome competing with the globe.

Your task is to **redesign and implement the frontend composition from the ground up**, while preserving all existing application behavior, backend/data contracts, globe implementation, and performance protections.

This is a **visual/product-quality redesign**, not a framework migration and not an opportunity to rewrite working infrastructure.

---

# 1. Design References

Use these as references, not as templates to copy literally:

- Aceternity UI: https://ui.aceternity.com/
- Aceternity components: https://ui.aceternity.com/components
- Aceternity navigation/sidebar patterns: https://ui.aceternity.com/components/sidebar
- Aceternity floating dock: https://ui.aceternity.com/components/floating-dock
- Aceternity card spotlight: https://ui.aceternity.com/components/card-spotlight
- Aceternity grid / background treatments: https://ui.aceternity.com/components/grid
- Taste Skill: https://github.com/Leonxlnx/taste-skill

The visual target is the **level of composition, hierarchy, restraint, spatial confidence, typography, alignment, and interaction polish** visible in strong Aceternity work, filtered through the anti-slop rules of Taste Skill.

Do not copy Aceternity landing-page patterns into a data application. This is an environmental intelligence console. Adapt the principles:

- strong composition
- clear visual hierarchy
- intentional negative space
- restrained effects
- excellent typography
- asymmetric but controlled layout
- purposeful motion
- strong active/focus states
- premium micro-interactions

Taste Skill is the governing design discipline.

---

# 2. Mandatory Taste Skill Usage

Before changing UI code:

1. Inspect the installed Taste Skill files in `.agents/skills/` or wherever the repository stores agent skills.
2. Use the current `design-taste-frontend` version by default.
3. Also use the redesign-specific guidance (`redesign-existing-projects`) if installed.
4. Read the relevant high-end visual/design guidance if installed.
5. Do not merely mention Taste Skill in the report. Apply its rules to the actual implementation.
6. Run the Taste Skill pre-flight/redesign audit before finalizing.

Current Taste Skill direction should be interpreted approximately as:

- **Design variance:** 7–8
- **Motion intensity:** 4–5
- **Visual density:** 4–5

The result should feel distinctive and authored, not chaotic.

Avoid generic AI-dashboard patterns.

---

# 3. Screenshot Diagnosis — Problems That Must Be Fixed

The current browser screenshot shows these concrete problems:

### A. Composition is fragmented

The left rail, header, globe, right panel, and bottom bar each appear to belong to slightly different design systems.

Fix this by establishing explicit global alignment anchors:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ GLOBAL HEADER / COMMAND STRIP                                               │
├──────┬───────────────────────────────────────────────┬───────────────────────┤
│      │                                               │                       │
│ LAYER│                                               │   INTELLIGENCE PANEL  │
│ RAIL │                  GLOBE STAGE                  │                       │
│      │                                               │                       │
│      │                                               │                       │
├──────┴───────────────────────────────────────────────┴───────────────────────┤
│ STATUS / SYSTEM DOCK                                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

This is an alignment model, not necessarily an implementation technique.

Every major element must visually relate to the same page grid.

### B. Globe placement is weak

The globe currently feels like a large object dropped into empty black space.

It must become the visual anchor of the entire interface.

The globe should:

- occupy the visual center of the available stage
- remain centered relative to the actual usable globe area, not the entire browser width
- have consistent breathing room around it
- never feel accidentally pushed by the right panel
- preserve the existing 3D rendering implementation
- retain the restrained atmosphere treatment already tuned
- avoid the large blue halo seen in older screenshots

Do not rewrite the globe renderer/shaders merely for styling.

Only adjust layout, surrounding UI, and approved atmosphere parameters where necessary.

### C. Too many rounded cards

The existing UI places panels inside cards inside panels.

Stop doing this.

Use **fewer containers with stronger hierarchy**.

The right intelligence area should feel like one composed instrument panel, not a stack of unrelated cards.

Use borders, spacing, section rules, typography, and background shifts to create hierarchy instead of wrapping every section in a rounded rectangle.

### D. The left layer rail feels detached

The rail should read as a deliberate navigation instrument.

Do not make it look like a floating pill-shaped toolbar.

Use:

- one coherent vertical rail
- clear active state
- small but precise iconography
- subtle separators
- a single alignment axis
- consistent hit areas
- restrained active indicator

The active state can have a thin accent line/marker and a quiet tonal shift, but do not use a large glowing capsule.

### E. Header alignment is weak

The current header visually contains several unrelated islands.

Recompose it into three deliberate zones:

```text
LEFT                    CENTER                         RIGHT
Brand / active layer    Command search                 system state / controls
```

These zones must share the same vertical rhythm and baseline.

The search field should feel integrated into the header, not like a random centered form.

### F. Right panel is too visually heavy

The intelligence panel currently dominates because nearly every subsection has its own border/radius.

Make it feel like a high-quality data instrument:

- one panel shell
- thin outer border
- restrained background elevation
- compact title row
- clear section hierarchy
- mostly flat sections
- dividers rather than repeated cards
- metrics arranged deliberately
- chart areas integrated into the information hierarchy

The information should remain dense enough for a monitoring application, but not visually noisy.

### G. Typography lacks hierarchy

Current labels, section headings, metadata and values are too similar.

Create a deliberate type scale:

- product identity
- current layer name
- section labels
- primary values
- supporting metadata
- system telemetry

Use weight and size before color.

Do not solve hierarchy by making everything bright white.

### H. Status indicators are overused

Keep semantic status indicators such as LIVE and severity labels where they communicate state.

Do not wrap ordinary UI labels in pills merely for decoration.

### I. Effects need restraint

The current interface should NOT become:

- neon sci-fi
- excessive glassmorphism
- excessive gradients
- blue/purple AI slop
- glowing borders everywhere
- animated particles everywhere

Use effects only where they establish focus or depth.

---

# 4. New Visual Direction

## Concept

Design the application as a **quiet environmental command center**.

Think:

- scientific workstation
- satellite operations console
- premium geospatial intelligence interface
- editorial data visualization
- cinematic black canvas
- extremely precise information architecture

Not:

- gaming HUD
- crypto dashboard
- generic SaaS dashboard
- cyberpunk control panel
- template marketplace dashboard

The globe is the hero.
The surrounding interface should frame and support it.

---

# 5. Global Layout System

Create one explicit responsive layout system.

Use CSS Grid for the top-level shell where appropriate.

Recommended conceptual structure:

```text
AppShell
├── Header
├── Workspace
│   ├── LayerRail
│   ├── GlobeStage
│   └── IntelligencePanel
└── StatusDock
```

Do not allow every component to invent its own positioning system.

The shell owns:

- header height
- rail width
- panel width
- workspace offsets
- status dock height
- z-index hierarchy
- responsive breakpoints

Children should consume layout variables instead of guessing offsets.

Create shared CSS variables/tokens for:

```text
--header-height
--rail-width
--panel-width
--status-height
--workspace-gap
--shell-padding
--panel-padding
--hairline
--surface-0
--surface-1
--surface-2
--text-primary
--text-secondary
--text-muted
--accent
```

Do not scatter magic numbers across components.

---

# 6. Header Redesign

Rebuild the header as a single composed system.

### Left

Earth Sentinel 3D brand:

- small precise globe mark
- strong but compact wordmark
- understated subtitle
- current layer separated through typography rather than a random pill

### Center

Search/command input.

Use a wide but controlled command field.

The search field should include:

- search icon
- placeholder
- keyboard shortcut hint
- focus state
- subtle inner contrast

Avoid an oversized rounded capsule.

### Right

System state:

- LIVE indicator
- settings/control actions
- only essential utilities

Avoid decorative buttons.

### Header rules

- one baseline
- consistent vertical centering
- no accidental 1–2px visual drift
- no oversized radius
- no unnecessary shadows

Use Motion only for deliberate interaction states, not continuous decoration.

---

# 7. Layer Rail Redesign

The layer rail must become one of the strongest visual anchors.

Structure:

```text
LAYER

[temperature]
[wind]
[cloud]
[precipitation]
[event]
[alert]
...

────────
TEMP
```

Use the actual existing layer data.

Do not invent new features.

Each item should have:

- icon
- tooltip
- active/inactive state
- keyboard focus state

Active layer:

- restrained accent
- thin indicator line
- subtle background shift
- no giant glowing capsule

Inactive layer:

- muted icon
- quiet hover

Use an Aceternity-style sidebar/floating-navigation philosophy, but keep the actual layout appropriate for a monitoring console.

---

# 8. Globe Stage Redesign

The globe is the primary visual object.

Create a dedicated `GlobeStage` layout container.

Requirements:

- globe is centered inside the stage
- stage understands available width after rail/panel allocation
- globe scales using available height and width
- globe never overlaps the header or status dock
- right panel does not arbitrarily push the globe
- mobile/tablet behavior is intentional

Add subtle contextual framing if it improves the composition:

- faint radial grid
- very subtle coordinate/crosshair system
- tiny locator marks
- extremely restrained star field already present in the project

Do NOT add all of these merely because they exist in component libraries.

Use at most one or two contextual effects.

Aceternity inspiration is useful here for:

- subtle spotlight
- grid background
- focus effects

but the globe must remain visually dominant.

---

# 9. Intelligence Panel Redesign

Rebuild the right panel as a single high-quality data surface.

Conceptual structure:

```text
┌──────────────────────────────────┐
│ TEMPERATURE                 108  │
│                                ↻│
├──────────────────────────────────┤
│ LIVE  Open-Meteo · Updated now   │
├──────────────────────────────────┤
│ Global temperature anomalies     │
│ and readings                     │
│                                  │
│ SEVERITY SCALE                   │
│ ───────────────────────────────  │
│ Low                         High │
├──────────────────────────────────┤
│ 108 EVENTS             0 CRITICAL│
├──────────────────────────────────┤
│ SEVERITY DISTRIBUTION             │
│ ──────────────────────────────── │
│ low 105 · moderate 3 · high 0   │
├──────────────────────────────────┤
│ TEMPERATURE SPREAD          108  │
│                                  │
│          chart                   │
│                                  │
└──────────────────────────────────┘
```

Do not literally copy this wireframe; use it as a hierarchy reference.

Important:

- sections should not all be cards
- use one panel surface
- use hairline dividers
- use typography to separate regions
- use compact metrics
- charts should feel integrated
- values should be visually prominent
- metadata should recede

The panel should feel designed, not assembled.

---

# 10. Metrics

Replace generic stacked statistic cards with more intentional compositions.

For example:

```text
EVENTS          CRITICAL
108             0
```

Two-column metric line with a divider may be more elegant than two individual cards.

Use actual existing values only.

Never fabricate historical data.

---

# 11. Charts

Keep the existing Bklit implementation and real data.

However, rework chart composition so that the chart itself feels integrated into the panel.

Rules:

- neutral/default tones unless data meaning requires color
- no generic saturated blue chart
- no unnecessary chart border
- minimal grid
- typography aligned to the panel
- chart title/value aligned to the same content edge as adjacent sections
- tooltip visually consistent with the new panel
- motion only when useful

Use Bklit registry components where already present and proven.

Do not install another chart framework.

---

# 12. Aceternity Usage Rules

Aceternity is a reference and component source, not a license to add effects everywhere.

Use only components that materially improve the interface.

Potentially useful references:

- Sidebar
- Floating Dock
- Grid
- Card Spotlight
- Spotlight
- Animated Tooltip
- Glowing Effect
- Moving Border only for one truly important control, if appropriate

Do NOT add:

- multiple animated gradients
- hero-style beams
- giant spotlights
- excessive glowing borders
- decorative background animations
- multiple floating cards

The application already has a strong visual object: the 3D Earth.

The supporting UI must stay quiet enough to make it feel premium.

---

# 13. Motion System

Motion is allowed and encouraged, but only when it communicates interaction.

Use the existing `motion` dependency where useful.

Allowed:

- layer selection transition
- panel open/close
- tooltip entrance
- hover emphasis
- chart reveal
- command search focus
- status state transition

Avoid:

- constant UI movement
- autonomous floating objects
- decorative perpetual animations
- animation that moves layout dimensions

Prefer transform/opacity.

Respect `prefers-reduced-motion`.

---

# 14. Color System

Keep the application dark.

The visual language should be approximately:

- near-black canvas
- slightly lighter structural surfaces
- graphite panel surfaces
- cool-neutral borders
- soft white primary text
- subdued gray secondary text
- one principal Sentinel accent
- semantic severity colors only when needed

Avoid making blue the dominant UI color.

The Earth itself already contains blue/white atmospheric and geographic color.

The UI should contrast against it rather than compete with it.

Do not introduce purple/pink gradients just to create visual interest.

---

# 15. Geometry and Radius System

The current implementation feels overly pill-shaped.

Reduce radius diversity.

Use a restrained system such as:

- shell surfaces: small radius
- major panel: medium radius
- controls: small-to-medium radius
- pills: only semantic/status elements

Avoid huge 16–24px radii on every object.

Cards should look engineered, not bubbly.

Use consistent borders and spacing.

---

# 16. Alignment Rules

This is a critical requirement.

Every visible major element must align to an explicit grid edge.

Check:

- header content edges
- search center
- layer rail centerline
- panel left edge
- panel content edge
- panel title edge
- chart edge
- status dock text edge
- globe center
- viewport center

Do not accept “looks close enough.”

Use browser screenshots to verify pixel-level alignment.

---

# 17. Responsive Redesign

Do not merely shrink desktop.

### Large desktop

Full layout:

```text
Header
Rail | Globe | Intelligence
Status
```

### Tablet

Reduce panel width and rail spacing.

The globe remains dominant.

### Mobile

Transform the right panel into a bottom sheet / expandable intelligence surface.

Transform the layer rail into a compact horizontal/floating control.

The globe must remain fully usable.

Do not allow controls to cover critical globe interaction.

Touch targets remain at least 40px where practical.

---

# 18. Component Architecture

Refactor UI components if required for the redesign.

Recommended conceptual structure:

```text
src/components/app/
  SentinelApp.tsx

src/components/shell/
  AppShell.tsx
  AppHeader.tsx
  LayerRail.tsx
  GlobeStage.tsx
  IntelligencePanel.tsx
  StatusDock.tsx

src/components/intelligence/
  LayerOverview.tsx
  EventDetails.tsx
  EventList.tsx
  MetricRow.tsx
  SeverityScale.tsx
  SeverityDistribution.tsx

src/components/charts/
  ValueHistogram.tsx

src/components/overlays/
  MarkerHoverCard.tsx
```

Do not blindly create files merely to match this list.

Use the current repository architecture where sensible.

The important requirement is that the shell owns composition and content components own information.

---

# 19. Protected Architecture

Do NOT break or rewrite:

- `src/components/globe/`
- existing Three.js / React Three Fiber globe implementation
- `src/shaders/atmosphere.ts`
- `src/lib/webgpu.ts`
- `src/lib/geo.ts`
- `src/server/`
- `src/app/api/`
- `src/services/api.ts`
- `src/types/`
- provider contracts
- layer API behavior
- live/simulated provider semantics
- cache/fallback behavior

Do not move the application back to Vite or Flask.

Do not change the framework.

Do not upgrade Next.js just for this task.

Do not rewrite APIs for cosmetic reasons.

---

# 20. Performance Rules

The previous audit established good performance boundaries.

Preserve them.

Do not:

- reintroduce app-level mouse state that rerenders the entire shell
- render large chart components eagerly if already code-split
- create new client components unnecessarily
- add large animation libraries
- add duplicate icon libraries without need
- introduce continuous animation loops in the UI

Any new interactive component must be checked for unnecessary rerenders.

The globe renderer must remain isolated from unrelated UI updates.

---

# 21. Dependency Discipline

Prefer existing dependencies.

Before installing anything:

1. Check `package.json`.
2. Check whether the capability already exists.
3. Prefer existing `motion`, shadcn primitives, Bklit, and current icon infrastructure.
4. If Aceternity provides a required component through its official registry, use the registry only after verifying its implementation/dependencies.
5. Do not add an entire package for one cosmetic effect.

No dependency bloat.

---

# 22. Implementation Process

## Phase 0 — Inspect

Read:

- current app shell
- current screenshot-like UI components
- globals.css
- shadcn configuration
- Taste Skill files
- package.json
- current component tree

Produce an internal diagnosis before editing.

## Phase 1 — Rebuild the shell

Fix:

- global grid
- header
- rail
- globe stage
- intelligence panel
- status dock

Do this before polishing individual charts.

## Phase 2 — Rebuild information hierarchy

Fix:

- panel structure
- typography
- metric rows
- section dividers
- severity scale
- chart composition

## Phase 3 — Interaction polish

Add carefully selected:

- hover states
- active transitions
- command input focus
- tooltips
- sheet/panel transitions

## Phase 4 — Responsive pass

Verify desktop/tablet/mobile separately.

## Phase 5 — Visual QA

Take screenshots at minimum:

- 1366 × 768
- 1440 × 900
- 1280 × 720
- 1024 × 768
- 768 × 1024
- 390 × 844

Compare them against the intended composition.

Fix actual issues rather than stopping after the first successful render.

## Phase 6 — Final audit

Run:

- typecheck
- lint
- tests
- production build
- production smoke test
- existing runtime integrity checks
- Taste Skill pre-flight

---

# 23. Browser Validation Is Mandatory

If Playwright, browser tooling, or another screenshot-capable browser is available, use it.

The previous audit could not complete visual verification; this pass is specifically intended to close that gap.

For each viewport verify:

### Composition

- Does the globe feel centered?
- Does the right panel feel integrated?
- Does the rail feel anchored?
- Does the header have one visual baseline?
- Does the status dock feel intentional?

### Visual polish

- Are borders subtle?
- Are radii consistent?
- Are text weights intentional?
- Are there unnecessary pills?
- Are there random floating containers?
- Is blue UI chrome dominating?
- Are there excessive glows?

### Interaction

- layer selection
- search focus
- panel refresh
- event hover/click
- panel close/open
- keyboard navigation

### Responsive

Check that nothing:

- overlaps
- clips
- disappears unexpectedly
- becomes too small to use
- pushes the globe off-center

---

# 24. Critical Anti-Patterns

Reject the implementation if it contains any of these:

- every section inside a card
- giant pill controls everywhere
- blue/purple gradient UI
- excessive glassmorphism
- decorative glowing borders around every component
- random floating widgets
- inconsistent left edges
- arbitrary absolute positioning
- typography with no clear hierarchy
- dashboard-template repetition
- generic “AI command center” visual clichés
- unnecessary new dependencies
- fabricated data
- fake charts
- changes to backend contracts
- changes to globe rendering architecture for convenience

---

# 25. Definition of Done

The redesign is complete only when all are true:

### Visual

- [ ] The application looks like one coherent product.
- [ ] The globe is clearly the primary visual anchor.
- [ ] Header/rail/globe/panel/status all share one layout system.
- [ ] Right panel no longer looks like a stack of unrelated cards.
- [ ] Unnecessary pills are removed.
- [ ] Typography has clear hierarchy.
- [ ] UI blue is restrained.
- [ ] Effects are subtle and purposeful.
- [ ] The UI has a premium, authored feel.

### Interaction

- [ ] Layer navigation feels deliberate.
- [ ] Hover/focus states are clear.
- [ ] Motion is subtle and meaningful.
- [ ] Reduced motion works.

### Responsive

- [ ] Desktop works.
- [ ] Tablet works.
- [ ] Mobile works.
- [ ] Globe remains usable at all breakpoints.

### Technical

- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Tests pass.
- [ ] Production build passes.
- [ ] Existing API behavior is unchanged.
- [ ] Existing live/simulated semantics are unchanged.
- [ ] Globe architecture is preserved.
- [ ] No unnecessary dependency additions.

---

# 26. Final Report Format

When finished, provide:

## Executive Result

PASS / PASS WITH FIXES / NEEDS ANOTHER PASS / BLOCKED

## What Changed

List the actual visual/system changes.

## Architecture Changes

Only list meaningful component restructuring.

## Dependency Changes

List additions/removals, or explicitly state none.

## Visual QA

For every required viewport:

- PASS / FAIL
- major observations
- remaining visual issues

## Functional Verification

- typecheck
- lint
- tests
- build
- smoke

## Performance

Report route bundle size and any notable render/rerender findings.

## Remaining Issues

Separate real defects from subjective refinements.

## Final Recommendation

Choose exactly one:

- READY TO MERGE
- READY FOR HUMAN BROWSER REVIEW
- NEEDS ANOTHER ENGINEERING PASS
- BLOCKED

---

# 27. Most Important Instruction

Do not interpret this as “make the current UI slightly prettier.”

The current implementation has already received multiple cosmetic passes and still feels visually assembled.

This task requires a **composition-first redesign**.

The shell, spacing system, hierarchy, alignment, typography and information density must be reconsidered as one system.

Use Aceternity for inspiration and selectively for proven interaction patterns.
Use Taste Skill as the design-quality guardrail.

The final result should make the existing globe and real environmental data feel like the centerpiece of a polished professional product.

Do not stop when the code compiles.

Stop only when the interface looks deliberately designed.
