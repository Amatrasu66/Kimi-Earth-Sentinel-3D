# OpenCode Master Prompt — Kimi Earth Sentinel 3D Full Frontend Overhaul

## IMPORTANT — EXECUTION MODE

You are the primary agentic coding agent for the **Kimi Earth Sentinel 3D** repository.

The developer is using:

- **OpenCode Desktop** for repository-wide agentic implementation
- **VS Code** for manual inspection and small manual edits

Your task is to **implement the complete frontend overhaul across every phase in this document in one continuous execution**, rather than stopping after each phase and waiting for a separate instruction.

A later audit will review the completed implementation. Do not stop merely because a phase is complete.

You may checkpoint internally after each phase, run the required verification, fix regressions, and continue automatically to the next phase.

Only stop early for a genuine blocking condition that makes safe continuation impossible. Do not ask for confirmation between phases.

Use best engineering judgment within the constraints below.

---

# 1. AUTHORITATIVE REPOSITORY STATE

The current repository is already:

```text
Next.js 15 App Router
React 19
TypeScript
Three.js
React Three Fiber
Drei
Tailwind CSS 3.4
Radix UI primitives
Lucide React
Vitest
```

The current application flow is:

```text
src/app/page.tsx
    ↓
src/components/app/SentinelApp.tsx
    ↓
TopNav
LayerPanel
DataPanel
BottomBar
SettingsModal
Tooltip
EarthRenderer
```

The backend is already migrated into the Next.js application:

```text
src/server/
src/app/api/v1/
```

The frontend talks to same-origin `/api/v1` routes through `src/services/api.ts`.

There is no remaining Flask-to-Next.js migration task.

## Stale instructions you must ignore

Do not follow any older prompt or instruction that assumes:

```text
frontend/
frontend/src/App.tsx
frontend/src/App.css
frontend/src/index.css
vite.config.ts
Flask backend migration
```

The real tree is the source of truth.

---

# 2. PRIMARY OBJECTIVE

Transform the current frontend into a:

> **premium environmental-intelligence command center built around a living 3D Earth.**

The visual hierarchy should be:

```text
                    GLOBE
                      ↓
               CURRENT CONTEXT
                      ↓
             ENVIRONMENTAL DATA
                      ↓
                  CONTROLS
```

The globe remains the dominant visual object.

The interface should feel:

- scientific
- precise
- premium
- restrained
- spatial
- data-driven
- information-dense without being cluttered
- modern
- responsive
- coherent

Do not turn the product into a generic SaaS dashboard.

Do not turn it into a glassmorphism showcase.

Do not make every element glow.

Do not make every element animated.

Do not blindly copy Aceternity, React Bits, TweakCN, or other component-library demos.

Everything must look like it was designed as one product.

---

# 3. ABSOLUTE PROTECTED BOUNDARY — GLOBE

Treat the following as frozen infrastructure for this overhaul:

```text
src/components/globe/
src/shaders/atmosphere.ts
src/lib/webgpu.ts
src/lib/geo.ts
```

Preserve all existing behavior, including:

- WebGPU probing
- WebGPU/WebGL fallback
- renderer diagnostics
- `?renderer=` override
- watchdog behavior
- lazy loading / SSR isolation
- adaptive DPR
- Earth textures
- day/night rendering
- clouds
- atmosphere
- starfield
- auto rotation
- rotation toggle
- marker instancing
- marker severity coloring
- raycast index mapping
- marker hover detection
- marker click handling
- drag-vs-click discrimination
- quaternion fly-to behavior
- coordinate projection

Do not modify globe internals merely to make a UI redesign easier.

The current globe is an intentional placeholder until a future globe replacement is selected.

If a UI requirement appears to require changing the globe, solve the requirement outside the protected boundary.

---

# 4. ABSOLUTE PROTECTED BOUNDARY — BACKEND AND DATA CONTRACT

Do not modify backend architecture as part of this task.

Do not:

- create Flask code
- migrate anything to Next.js
- rewrite provider adapters
- change provider semantics
- rename `/api/v1` endpoints
- reshape `DataPoint`
- reshape `EventDetail`
- alter `DataStatus`
- expose API keys
- modify API authentication/configuration
- rewrite server caching unless a build/test issue makes a tiny compatibility fix absolutely necessary

Treat these as protected:

```text
src/server/
src/app/api/
src/services/api.ts
src/types/index.ts
```

The existing API contract is the compatibility boundary.

---

# 5. FUNCTIONALITY THAT MUST SURVIVE

Preserve all currently working behavior:

- layer selection
- layer deselection
- marker rendering
- marker hover
- marker click
- event detail retrieval
- search
- search result navigation
- globe fly-to
- automatic globe rotation
- rotation toggle
- settings
- renderer diagnostics
- keyboard shortcuts
- refresh
- event filtering
- severity filtering
- data count
- coordinate/status information
- loading states
- error states
- empty states
- live/simulated/stale/unavailable semantics

Do not remove functionality simply because it complicates the redesign.

---

# 6. DATA PROVENANCE IS A PRODUCT REQUIREMENT

Preserve the existing distinction:

```text
live
simulated
stale
unavailable
```

Never make simulated data look like live data.

Never remove the source/freshness information already provided by the system.

Use subtle status UI for normal live data and stronger prominence for abnormal states.

---

# 7. DESIGN / AGENT SKILLS

The project uses project-local Agent Skills under:

```text
.agents/skills/
```

Do not create `.opencode/skills/` unless the repository itself already requires it for a concrete reason.

The relevant skills include:

```text
design-taste-frontend
high-end-visual-design
redesign-existing-projects
vercel-react-best-practices
vercel-composition-patterns
vercel-react-view-transitions
vercel-optimize
web-design-guidelines
```

Before implementation, verify the skills are readable.

Synchronize `skills-lock.json` using the Agent Skills CLI if the lock is behind the installed skill set.

Do not duplicate skills.

Use the skills as implementation guidance, not as permission to overwrite project architecture.

## Skill hierarchy

### Taste Skill

Primary art direction and anti-generic design guidance.

Use especially for:

- existing-project redesign
- composition
- visual hierarchy
- density
- visual variance
- motion direction
- premium polish

### Vercel React best practices

Use for:

- render isolation
- component architecture
- bundle/performance decisions
- data and state patterns

### Web Design Guidelines

Use for:

- accessibility
- focus behavior
- keyboard behavior
- interaction design
- animation accessibility
- typography
- responsive behavior

### Composition Patterns

Use for:

- reducing prop complexity
- extracting subcomponents
- maintaining reusable UI architecture

### React View Transitions

Consider where it provides a genuine benefit, but do not force it into the app if ordinary Motion/CSS transitions are more appropriate.

### Vercel Optimize

Use during the final performance/bundle review.

---

# 8. COMPONENT/LIBRARY STRATEGY

Use resources according to this hierarchy.

## shadcn

Foundation for structural UI primitives.

Prefer it for:

- buttons
- inputs
- dialogs
- sheets
- command/search primitives
- popovers
- tabs
- toggles
- separators
- badges
- tooltips
- cards
- standard controls

Do not invent duplicate primitives when an appropriate project-native primitive exists.

## TweakCN

Use as the theme/token direction for the shadcn-compatible visual system.

Do not treat TweakCN as a dependency that must be embedded in runtime code.

The project should be easy to retheme through CSS variables.

## Motion

Primary animation system.

Install/use only when Phase 5 begins.

Use for:

- panel transitions
- layout transitions
- list transitions
- selected-state transitions
- drawer/sheet transitions
- hover/focus micro-interactions
- contextual loading
- interruptible UI transitions

## Anime.js

Do not add by default.

Use only if a specific complex timeline/SVG/procedural animation cannot be handled cleanly with Motion/CSS.

## Bklit

Use for charts only after verifying the actual registry/component compatibility and after verifying that the backend has useful historical/statistical data to visualize.

Do not install an entire chart system for one small visual.

## Aceternity

Use selectively for premium visual effects such as a restrained spotlight or special interaction surface.

Do not use as the primary structural UI library.

## React Bits

Use selectively for distinctive micro-interactions or visual effects.

Do not install a runtime dependency just to use a small component when copying/adapting source is sufficient and compatible with the repository.

## MetalForge

Treat as a design/component reference until its package/registry interface is independently verified.

Do not invent an installation command or dependency.

---

# 9. DEPENDENCY DISCIPLINE

Do not add dependencies merely because they were mentioned in a previous prompt.

At the beginning, the following should NOT be added:

```text
zustand
redux
react-hook-form
zod
cmdk
date-fns
animejs
Aceternity runtime packages
React Bits runtime packages
chart libraries
motion
```

They can be considered later only when a specific phase requires them.

### Possible later dependency

```text
motion
```

Phase 5 only.

### Chart solution

Phase 4 only.

Default preference:

1. zero-dependency SVG/CSS visualization where sufficient
2. Bklit if registry and data support justify it
3. another chart library only if there is a clear technical reason

Defend the current route-size baseline.

---

# 10. PERFORMANCE BASELINE

Current build baseline to defend:

```text
Typecheck: pass
Lint: pass
Tests: 75/75
Build: pass
Route size: approximately 320 kB
First load: approximately 423 kB
```

Do not add large dependencies without justification.

Do not regress globe smoothness.

A major known issue exists in the current architecture:

```text
SentinelApp
  ↓
mousePos state
  ↓
rAF mousemove
  ↓
whole App rerender
  ↓
shell + panels + EarthRenderer rerender
```

This must be addressed during Phase 2.

Move cursor-follow behavior into the hover UI or an appropriate ref/subscription mechanism so pointer movement does not invalidate the entire application tree.

Preserve marker raycasting behavior.

Stabilize the renderer subtree and callbacks where appropriate.

Do not solve this by introducing a global state library.

---

# 11. PHASED EXECUTION — COMPLETE ALL PHASES

You must implement all phases below in order during this run.

Do not wait for a separate user message after any phase.

After each phase:

1. run the relevant checks
2. fix failures
3. inspect the result
4. continue automatically

Do not declare the project finished until all phases are complete.

---

# PHASE 0 — BASELINE / SAFETY CHECK

The repository has already been audited, but perform a lightweight execution preflight.

Verify:

- current branch/state
- working tree
- Next.js architecture
- protected paths
- skill availability
- current package.json
- current design token file

Create the branch:

```text
feat/ui-overhaul
```

Do not perform destructive resets.

If uncommitted user work exists, preserve it and work around it.

Run the baseline verification:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Do not proceed with known failing baseline checks unless the failure is clearly pre-existing and unrelated and you have documented it.

---

# PHASE 1 — DESIGN SYSTEM FOUNDATION

Goal: strengthen the existing design system without intentionally changing the interface yet.

## 1.1 Token hierarchy

Extend `src/app/globals.css` with an explicit accent hierarchy such as:

```text
--sentinel-accent
--sentinel-accent-soft
--sentinel-accent-hover
--sentinel-accent-border
--sentinel-accent-glow
```

Add reusable semantic alpha tokens where useful for:

```text
live
simulated
stale
unavailable
info
severity
```

## 1.2 Amber cleanup

Find duplicated hard-coded amber/yellow values such as:

```text
#FFC31F
rgba(255,195,31,...)
```

Replace repeated stylistic uses with centralized variables where appropriate.

Do not alter semantic colors merely for tokenization.

The goal is consistency, not a visible redesign.

## 1.3 Motion vocabulary

Document the existing baseline motion scale:

```text
150ms — micro interaction
220ms — normal UI transition
300ms — larger state/panel transition
```

Preserve the current reduced-motion kill-switch.

Do not install Motion yet.

## 1.4 shadcn configuration

Inspect whether `components.json` is required for the actual workflow.

If useful, add it accurately.

If it is unnecessary, do not add it merely to satisfy a template.

Do not add unnecessary primitives yet.

## Phase 1 gate

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Fix failures before continuing.

---

# PHASE 2 — APPLICATION SHELL + PERFORMANCE

Goal: redesign the UI surrounding the globe and fix the App-level hover rendering issue.

## 2.1 Header

Transform `TopNav` into the new `AppHeader` concept.

Preserve:

- search functionality
- `/` shortcut
- result keyboard navigation
- settings
- active-layer context
- provenance

Visually improve:

- brand hierarchy
- search command-bar treatment
- active state
- status placement
- spacing
- mobile behavior

## 2.2 Search / CommandSearch

Extract search from the monolithic header if this improves architecture.

Create a dedicated `CommandSearch` or equivalent.

Preserve existing ARIA combobox behavior.

Prefer project-native shadcn primitives and accessible composition.

Do not install `cmdk` just because the component is called CommandSearch.

## 2.3 Layer rail

Transform `LayerPanel` into a refined `LayerRail`.

Preserve:

- active layer
- toggle behavior
- shortcuts
- `aria-pressed`
- mobile operation

Improve:

- active-state hierarchy
- icon presentation
- tooltips
- density
- hover/focus
- semantic status color usage

Do not make every icon yellow.

## 2.4 Mobile shell

Introduce a sheet/drawer implementation if it materially improves mobile behavior.

Add the required shadcn-style source component rather than installing a giant UI dependency.

Preserve the globe as much as possible on narrow screens.

## 2.5 Status dock

Transform `BottomBar` into `StatusDock`.

Reduce redundant information.

Decide clearly which viewport owns provenance information.

Preserve:

- coordinates
- count/layer context
- UTC time
- renderer information

## 2.6 CRITICAL PERFORMANCE FIX

Refactor `SentinelApp` so pointer movement does not cause the entire app tree to render continuously.

Specifically:

- move cursor-follow coordinates into the hover card or an appropriate ref/subscription mechanism
- keep selected/hovered data state only where needed
- stabilize `EarthRenderer` props/callbacks
- memoize expensive renderer boundaries where appropriate
- do not alter globe internals
- do not add global state libraries

Verify with React DevTools/appropriate profiling or a strong code-level render isolation review.

## Phase 2 gate

Verify:

- header
- search
- keyboard shortcuts
- layer rail
- settings
- mobile shell
- status dock
- rotation
- globe smoothness

Then run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Fix regressions before continuing.

---

# PHASE 3 — INTELLIGENCE / DATA UI

Goal: transform the current data panel into a premium environmental intelligence surface.

Current `DataPanel` logic should be preserved while its visual structure is improved.

Aim for:

```text
Layer identity
    ↓
Data/provenance state
    ↓
Key metrics
    ↓
Severity distribution
    ↓
Analytical section
    ↓
Event list
    ↓
Event details
```

## 3.1 Split conceptual responsibilities

Create components such as:

```text
LayerOverview
MetricCard
SeverityFilter
EventList
EventDetails
```

Use names that match the actual architecture.

Do not over-fragment components.

## 3.2 Metrics

Create compact, information-dense metric surfaces.

Use tabular numerals where appropriate.

Avoid generic KPI-dashboard styling.

## 3.3 Severity

Maintain semantic severity mapping.

Use color as information, not decoration.

Do not rely solely on color.

## 3.4 Event list

Improve:

- hierarchy
- scanability
- selection state
- timestamps
- severity communication
- interaction feedback

Preserve the existing list as a complete alternative to globe-only interaction.

## 3.5 Event details

Improve progressive disclosure and readability.

Preserve race-safe loading and API behavior.

## 3.6 All data states

Every relevant panel must support:

```text
loading
empty
error
live
simulated
stale
unavailable
```

Do not use giant generic spinners.

## Phase 3 gate

Review all 8 layer types against the state model.

Then run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

# PHASE 4 — DATA VISUALIZATION

Goal: add useful analytical visualizations without unnecessary bundle growth.

## 4.1 Verify available data first

Inspect existing server/API types and endpoints for statistical or historical data.

Do not invent historical data.

Do not fabricate time-series values.

If useful historical data is unavailable for a chart, use an honest current-state visualization or do not add the chart.

## 4.2 Severity distribution

Start with zero-dependency CSS/SVG visualization where sufficient.

## 4.3 Time series

Only add time-series charts where the actual API data supports them.

## 4.4 Bklit

Before integrating Bklit:

1. verify the current registry/source
2. verify its compatibility with the current app
3. verify the data shape required
4. install only the necessary component(s)
5. normalize styles to Sentinel tokens

Do not install an entire chart library for a single simple graphic.

## 4.5 Chart language

Charts must share:

- typography
- spacing
- semantic colors
- tooltip treatment
- surface treatment
- dark theme
- reduced visual noise

Avoid excessive gridlines and decoration.

## Phase 4 gate

Check bundle impact.

Compare route/build size against the baseline.

Then run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

# PHASE 5 — MOTION SYSTEM

Goal: add polished, intentional UI motion.

Only now evaluate/install Motion.

If CSS can do an animation adequately, do not add Motion merely for novelty.

If Motion is justified, install the appropriate current package and use its React API.

## Motion targets

- panel enter/exit
- panel layout transitions
- list additions/removals
- search result transitions
- layer selection
- sheet/drawer transitions
- hover/focus emphasis
- status changes
- contextual loading

## Motion principles

Use the existing vocabulary:

```text
150ms
220ms
300ms
```

Use interruptible transitions where appropriate.

Keep the globe's motion visually dominant.

Avoid:

- constant decorative animation
- bounce everywhere
- expensive animated blur
- layout thrashing
- multiple animation libraries for the same job

Respect `prefers-reduced-motion`.

Do not add Anime.js unless there is a concrete, documented need.

## Phase 5 gate

Profile critical transitions and ensure there is no obvious globe jank.

Then run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

# PHASE 6 — PREMIUM VISUAL POLISH

Goal: make the product feel deliberate and distinctive.

Use Taste Skill as the final art-direction reference.

## Aceternity

Use only a few carefully selected effects, for example:

- restrained spotlight
- special active surface
- premium contextual visual

Do not turn every panel into an Aceternity card.

## React Bits

Use only where a micro-interaction adds clear product value.

Prefer adapted source over a runtime dependency when practical.

## TweakCN

Use the token system to normalize visual output.

Tune:

- surfaces
- borders
- radius
- typography
- shadows
- accent intensity
- chart colors

## Visual restraint

After adding an effect, ask:

```text
Does this improve comprehension?
Does this improve hierarchy?
Does this improve feedback?
Does this help the user understand environmental intelligence?
```

If the answer is no, remove it.

Do not make the product look like a collection of demos.

## Phase 6 gate

Perform a visual consistency pass across:

- header
- rail
- data panel
- status dock
- dialogs
- tooltips
- charts
- mobile surfaces

Normalize everything to the same design language.

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

# PHASE 7 — RESPONSIVE + ACCESSIBILITY HARDENING

This is part of the implementation, not merely a later audit.

## Accessibility

Verify:

- keyboard navigation
- visible focus states
- semantic buttons/links
- ARIA labels
- combobox semantics
- dialog semantics
- tooltip behavior
- sheet behavior
- readable status announcements
- reduced motion
- contrast

Keep the event list as the accessible alternative to globe marker interaction.

Review whether canvas semantics need improvement without breaking Three.js interaction.

## Responsive

Verify:

- large desktop
- desktop/laptop
- tablet
- narrow viewport

At smaller widths:

- preserve globe visibility
- collapse secondary information
- use sheets/drawers where appropriate
- maintain essential status/context
- keep touch targets usable

Do not simply stack everything vertically.

## Phase 7 gate

Fix all meaningful accessibility/responsive issues discovered during implementation.

---

# PHASE 8 — FINAL ENGINEERING QA / SELF-REVIEW

Before declaring the task complete, perform a full implementation verification.

This is a self-check before the later external audit.

## Functional checklist

Verify:

- [ ] globe renders
- [ ] WebGPU path works
- [ ] WebGL fallback remains intact
- [ ] layer switching works
- [ ] markers render
- [ ] marker hover works
- [ ] marker click works
- [ ] event details load
- [ ] search works
- [ ] search keyboard navigation works
- [ ] fly-to works
- [ ] rotation works
- [ ] settings work
- [ ] refresh works
- [ ] provenance is visible
- [ ] loading states work
- [ ] empty states work
- [ ] error states work
- [ ] live/simulated/stale/unavailable remain distinguishable

## Architecture checklist

Verify:

- [ ] globe protected boundary remains untouched or only modified when explicitly unavoidable
- [ ] backend/API contract remains unchanged
- [ ] no unnecessary global state introduced
- [ ] no unnecessary duplicated component systems
- [ ] shell/data responsibilities are clearer
- [ ] App-level hover rerender problem is addressed
- [ ] expensive globe subtree remains isolated

## Dependency checklist

Verify every new dependency is justified.

Remove dependencies that were introduced during implementation but are no longer needed.

Do not leave experimental libraries installed merely because they were evaluated.

## Performance checklist

Compare against the baseline.

Check:

- route size
- first-load size
- render behavior
- animation behavior
- chart cost
- large dependency cost
- globe responsiveness

If performance regressed materially:

1. identify why
2. reduce the regression
3. only retain the regression if there is a strong product reason
4. document it clearly

## Final automated checks

Run all of:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

If the repository contains other documented validation scripts, run them too when relevant.

Do not claim success without actual results.

---

# 12. GIT / CHANGE MANAGEMENT

Work from:

```text
feat/ui-overhaul
```

Do not rewrite or force-reset unrelated user work.

Prefer logical commits after major phases, for example:

```text
feat(ui): establish sentinel design system
feat(ui): redesign application shell
perf(ui): isolate globe hover rendering
feat(ui): redesign intelligence panel
feat(ui): add environmental visualizations
feat(ui): add motion system
feat(ui): polish visual language
fix(ui): accessibility and responsive hardening
```

Use whatever commit wording fits the actual change, but keep commits understandable.

Do not squash away useful history unnecessarily.

---

# 13. IMPLEMENTATION DECISION RULES

When uncertain, use this order:

```text
1. Preserve working behavior
2. Preserve API contracts
3. Preserve the globe
4. Reuse existing architecture where sound
5. Prefer project-native components
6. Prefer centralized tokens
7. Prefer the smallest dependency set
8. Prefer CSS/SVG for simple visuals
9. Prefer Motion for real UI transitions
10. Use external component libraries selectively
11. Test before moving to the next phase
```

Do not ask the developer to choose between trivial implementation options.

Choose the option that best satisfies this brief.

Only stop for a genuine blocker such as:

- missing essential repository data
- destructive conflict with uncommitted work
- an irreconcilable build/runtime problem
- a dependency or API requirement that cannot be safely resolved

When a blocker occurs, report:

```text
blocker
why it blocks safe continuation
what was completed
what remains
```

Otherwise continue automatically.

---

# 14. FINAL REPORT FORMAT

At the end of the full implementation, provide a concise but complete report with:

## Summary

What changed across all phases.

## Architecture

What components were added, extracted, renamed, or preserved.

## Design system

What tokens/theme rules were added or changed.

## Motion

What animation system was used and where.

## Visualization

What charts/analytical visuals were added and where their data came from.

## Performance

What was done to isolate globe rendering and what the final build-size impact was.

## Accessibility

What meaningful accessibility improvements were implemented.

## Dependencies

Every dependency added, removed, or deliberately rejected.

## Protected boundaries

Confirm that globe/backend/API contracts were preserved.

## Verification

Report actual results for:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

Include test counts and build-size observations where available.

## Remaining issues

List only genuine remaining issues.

Do not invent issues.

## Completion status

Use one of:

```text
COMPLETE
COMPLETE WITH NON-BLOCKING ISSUES
BLOCKED
```

Do not say COMPLETE if core functionality is broken or required phases were skipped.

---

# 15. MOST IMPORTANT INSTRUCTION

**Implement the entire overhaul, not just the first phase.**

Do not stop after the audit.

Do not stop after the design-token work.

Do not wait for the developer between phases.

Do not replace the globe.

Do not migrate the backend.

Do not blindly install every library mentioned in the brief.

Do not sacrifice existing functionality for visual polish.

Do not claim work was completed unless it was actually implemented and verified.

The expected final result is a cohesive, premium environmental-intelligence command center in which the existing Earth remains the central visual anchor and the surrounding interface becomes significantly more polished, information-rich, performant, accessible, and coherent.
