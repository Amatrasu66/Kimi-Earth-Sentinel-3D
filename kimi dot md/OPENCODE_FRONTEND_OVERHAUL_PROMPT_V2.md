# OpenCode Prompt — Earth Sentinel 3D Frontend Overhaul v2

## IMPORTANT: This prompt supersedes the previous frontend-overhaul prompt

The previous overhaul prompt was written against an older repository state. The current working tree is already a **Next.js 15 App Router application**, with the backend migrated into `src/server/` and same-origin `/api/v1` routes.

Do **not** follow any older instructions that reference:

- `frontend/`
- `frontend/src/App.tsx`
- `frontend/src/App.css`
- `frontend/src/index.css`
- `vite.config.ts`
- Flask backend migration
- moving the backend to Next.js

Those instructions are stale for the current branch.

Use this document as the authoritative implementation brief.

---

# 1. Role

You are the primary agentic coding agent for the **Kimi Earth Sentinel 3D** repository.

Your task is to perform a **frontend visual, UX, component-system, performance, and interaction overhaul** of the existing application while preserving all working Earth Sentinel behavior.

The developer uses:

- **OpenCode Desktop** for agentic coding and repository-wide implementation
- **VS Code** for manual inspection, small manual edits, and final review

You are responsible for implementation, verification, and reporting.

---

# 2. Current Repository Baseline

The current application is:

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

The main application entry flow is currently:

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

The backend is already part of the Next.js application:

```text
src/server/
src/app/api/v1/
```

The API contract is already same-origin and uses `/api/v1`.

There is **no Flask migration task** remaining.

The existing data architecture is already considered stable.

---

# 3. Primary Objective

Transform the current interface into a:

> **premium environmental-intelligence command center built around a living 3D Earth.**

The globe must remain the dominant visual element.

The surrounding UI should feel:

- scientific
- precise
- premium
- restrained
- spatial
- information-dense without being cluttered
- modern
- coherent
- responsive

Avoid generic SaaS-dashboard aesthetics.
Avoid generic glassmorphism.
Avoid turning the interface into a component-library showcase.

---

# 4. HARD PROTECTED BOUNDARY — DO NOT TOUCH THE GLOBE

The following area is effectively frozen during the redesign:

```text
src/components/globe/
src/shaders/atmosphere.ts
src/lib/webgpu.ts
src/lib/geo.ts
```

Preserve all existing globe behavior, including:

- WebGPU probing
- WebGPU/WebGL fallback
- renderer diagnostics
- `?renderer=` override
- watchdog behavior
- lazy loading / SSR isolation
- adaptive DPR
- Earth textures
- night/day rendering
- clouds
- atmosphere
- starfield
- auto rotation
- rotation toggle
- marker instancing
- marker severity colors
- raycast index mapping
- hover detection
- click handling
- drag-vs-click discrimination
- quaternion fly-to behavior
- marker coordinate projection

Do not redesign the globe itself in this pass.

Do not modify globe internals simply to make the UI redesign easier.

The current globe is an intentional placeholder for a future globe replacement.

If a UI requirement appears to require a globe modification, stop and find a solution outside the protected boundary.

---

# 5. HARD PROTECTED BOUNDARY — BACKEND IS OUT OF SCOPE

The backend has already been migrated to Next.js.

Do not:

- migrate Flask
- create Flask files
- move backend files
- redesign provider architecture
- rewrite provider adapters
- alter provider semantics
- rename `/api/v1` routes
- reshape the API payloads
- modify the provenance contract
- expose API keys

Preserve:

```text
src/server/
src/app/api/v1/
src/services/api.ts
src/types/index.ts
```

The current API contract is the compatibility boundary for the frontend.

---

# 6. Data Provenance Is a Product Requirement

The application distinguishes:

```text
live
simulated
stale
unavailable
```

Never visually imply that simulated data is live.

Preserve the semantics and source information already returned by the API.

The redesigned interface should make provenance visible but not visually overwhelming.

Use stronger prominence for abnormal states and subtle prominence for normal live state.

---

# 7. Current UI Components

Current shell:

```text
src/components/panels/TopNav.tsx
src/components/panels/LayerPanel.tsx
src/components/panels/DataPanel.tsx
src/components/panels/BottomBar.tsx
src/components/panels/SettingsModal.tsx
src/components/overlays/Tooltip.tsx
src/components/overlays/DataStatusBanner.tsx
```

The existing logic is generally sound.

Do not rewrite working business logic merely to change visuals.

The objective is to improve composition, hierarchy, visuals, motion, accessibility, and maintainability.

---

# 8. Existing UI Foundation

The repository already has 15 shadcn/Radix-style primitives in:

```text
src/components/ui/
```

Existing primitives include:

```text
alert
badge
button
dialog
empty
input
kbd
label
scroll-area
separator
skeleton
spinner
switch
tabs
tooltip
```

Keep these where they are useful.

The redesign may add missing primitives when justified, especially:

```text
sheet
popover
dropdown-menu
command
card
toggle
```

Do not install large numbers of components just because they are available.

---

# 9. Existing Design System

The current design tokens already live primarily in:

```text
src/app/globals.css
```

There is already a coherent Sentinel token system, including:

- background/surface colors
- panel/elevated surfaces
- text tiers
- accent colors
- live/simulated/stale/unavailable states
- shadcn HSL variables
- radius
- sidebar tokens
- chart tokens
- focus styles
- custom scrollbars
- existing motion keyframes
- reduced-motion support

Build on the existing system.

Do NOT throw it away and rebuild from nothing.

---

# 10. First Design-System Change

The current accent `#FFC31F` is over-applied.

Reduce the amount of yellow used for ordinary UI.

Create semantic accent tokens such as:

```text
--sentinel-accent
--sentinel-accent-soft
--sentinel-accent-hover
--sentinel-accent-border
--sentinel-accent-glow
```

Also consider severity-alpha tokens where useful.

Yellow should communicate meaningful interaction/state, not decorate everything.

Keep semantic status colors distinct:

```text
live        green
simulated   amber
stale       orange
unavailable red
info        blue
neutral     gray
```

---

# 11. Visual Language

Target visual direction:

```text
NASA-style environmental intelligence
+
modern mission control
+
premium dark product UI
+
minimal spatial instrumentation
```

The globe should visually dominate.

The surrounding UI should feel like instrumentation around the globe, not a website layered over it.

Mental model:

```text
GLOBE
  ↓
CURRENT CONTEXT
  ↓
ENVIRONMENTAL DATA
  ↓
CONTROLS
```

---

# 12. Component-Library Strategy

Use the following hierarchy.

## shadcn

Use as the structural UI foundation:

- buttons
- dialogs
- sheets
- command palette
- inputs
- menus
- tabs
- tooltips
- toggles
- cards
- separators
- form primitives

## TweakCN

Use conceptually for theme/token tuning.

TweakCN is not a reason to rebuild the project. Use it to refine the existing token system.

## Aceternity

Use selectively for premium visual effects.

Potential examples:

- spotlight
- focused surface treatment
- subtle visual accents

Do not use Aceternity for every component.

## React Bits

Use selectively for distinct micro-interactions or visual effects.

Prefer copying/adapting isolated components rather than introducing an unnecessary runtime dependency.

## Bklit

Use for analytical charts only after verifying the registry and actual data requirements.

Do not install a chart library until a chart is actually needed.

Start simple:

- CSS/div distributions
- SVG sparklines
- lightweight custom visualization

Graduate to Bklit for actual time-series or analytical charts where justified.

## Motion

Use `motion` as the default animation system for UI transitions.

Install only in the phase where animation work begins.

## Anime.js

Do not install unless a concrete interaction requires timeline/procedural animation that Motion cannot handle appropriately.

---

# 13. Agent Skills

The project already contains project-local skills in:

```text
.agents/skills/
```

The audit reports 12 skill directories.

Relevant skills include:

```text
design-taste-frontend
redesign-existing-projects
vercel-react-best-practices
web-design-guidelines
vercel-composition-patterns
vercel-react-view-transitions
vercel-optimize
```

These are the skills to use during the overhaul.

There is no need to create a parallel `.opencode/skills/` directory merely for this task if OpenCode is already discovering `.agents/skills/` correctly.

Before implementation:

1. inspect `.agents/skills/`
2. inspect `skills-lock.json`
3. verify each relevant `SKILL.md` is present
4. synchronize missing lock entries using the Agent Skills CLI if appropriate
5. verify OpenCode actually discovers the skills

The audit reports that `skills-lock.json` is missing some entries, including:

```text
vercel-optimize
vercel-composition-patterns
web-design-guidelines
```

Fix that before relying on those skills.

Do not blindly install duplicate skills.

---

# 14. Skill Priority

Use the skills in this order of importance:

```text
1. design-taste-frontend
2. redesign-existing-projects
3. web-design-guidelines
4. vercel-react-best-practices
5. vercel-composition-patterns
6. vercel-react-view-transitions
7. vercel-optimize
```

Taste controls visual direction.

Vercel skills control React quality, accessibility, composition, transitions, and performance.

---

# 15. Performance Requirement — Fix Before Heavy Visual Work

The current audit identified an important performance issue.

`SentinelApp` keeps `mousePos` in app-level state and updates it via rAF during globe hover.

That can cause the shell, panels, and `EarthRenderer` subtree to re-render during pointer movement.

This is a priority issue.

Before introducing expensive animation libraries or complex visual effects:

1. isolate the tooltip cursor-follow state
2. keep globe rendering isolated from shell-only hover state
3. memoize stable globe props where useful
4. prevent pointer movement from invalidating the entire application tree

Do not damage marker hover behavior while fixing this.

Verify with React DevTools or another practical render inspection method where available.

---

# 16. Preserve These Performance Optimizations

Do not regress:

- lazy WebGPU chunk
- SSR-disabled globe rendering
- adaptive DPR
- instanced marker rendering
- rAF-throttled marker raycasting
- abort/race guards
- request-id protection
- decomposed hook dependencies
- renderer watchdog
- renderer fallback

---

# 17. Proposed Component Architecture

Prefer minimal reorganization.

The current architecture is already close to the desired structure.

Target:

```text
src/components/
│
├── app/
│   └── SentinelApp.tsx
│
├── globe/                    # FROZEN
│
├── shell/
│   ├── AppHeader.tsx
│   ├── LayerRail.tsx
│   ├── CommandSearch.tsx
│   └── StatusDock.tsx
│
├── intelligence/
│   ├── DataPanel.tsx
│   ├── LayerOverview.tsx
│   ├── EventDetails.tsx
│   ├── MetricCard.tsx
│   └── SeverityFilter.tsx
│
├── charts/
│   └── ...
│
├── effects/
│   └── ...
│
├── overlays/
│   ├── MarkerHoverCard.tsx
│   └── DataStatusBanner.tsx
│
└── ui/
    └── shadcn primitives
```

This is a target, not a mandatory mass-file-move.

Do not reorganize files solely for aesthetics.

Prefer extracting components only when it provides a clear architectural or maintainability benefit.

---

# 18. SentinelApp Rule

`src/components/app/SentinelApp.tsx` should remain the top-level orchestrator.

Do not introduce Redux/Zustand/global state unless an actual requirement appears.

Local React state is currently appropriate.

Potential extraction:

```text
useEventDetail
```

may be worthwhile because the current race-safe request/abort logic is substantial.

Potential extraction:

```text
cursor/tooltip state
```

may be worthwhile for performance.

Do not move state merely to reduce line count.

---

# 19. Shell Redesign

## Header

Turn `TopNav` into a refined command bar.

Preserve:

- search
- debouncing
- keyboard navigation
- `/` shortcut
- result selection
- fly-to behavior
- provenance context
- settings

Visual goals:

- command-palette feel
- stronger hierarchy
- better result rows
- clearer keyboard affordances
- minimal chrome

Potential shadcn primitives:

```text
command
popover
input
kbd
badge
```

---

# 20. Layer Rail

Redesign `LayerPanel` into a compact instrumentation rail.

Preserve:

- `aria-pressed`
- keyboard shortcuts
- toggle behavior
- layer IDs
- mobile functionality

Improve:

- density
- active state
- selected-state animation
- icon semantics
- tooltips
- mobile behavior

For mobile, consider a `Sheet`-based drawer rather than a cramped bottom strip.

Do not reduce discoverability.

---

# 21. Data Panel — Highest Priority

`DataPanel` is the most important redesign target.

Use progressive disclosure.

Preferred hierarchy:

```text
Header
 ↓
Data freshness / provenance
 ↓
Key metrics
 ↓
Severity distribution
 ↓
Analytical visualization when real data exists
 ↓
Event list
 ↓
Event details
```

Preserve existing:

- filtering
- severity filtering
- event list
- event selection
- fallback detail construction
- loading states
- errors
- provenance

Do not dump every field into one giant card.

---

# 22. Charts

There are currently no chart components in the real repo.

Do not pretend that historical data already exists.

Before building time-series charts:

1. inspect available `/api/v1` data
2. inspect the `stats/historical` or equivalent endpoints if present
3. confirm the response supports the intended chart
4. only then create a chart component

First chart target:

```text
severity distribution
```

This can be implemented with zero dependencies using CSS/SVG if appropriate.

For actual analytical time series, verify Bklit before installing anything.

---

# 23. Bottom Status Dock

Redesign `BottomBar` to reduce information duplication.

Current audit indicates provenance is repeated across:

- TopNav
- BottomBar
- DataStatusBanner

Define one primary provenance owner per breakpoint.

Do not remove provenance.

Reduce visual repetition.

Keep useful information such as:

- coordinates
- layer
- count
- UTC time
- renderer state

---

# 24. Settings

Redesign the Settings modal visually.

Preserve the excellent diagnostics content.

Normalize tokens.

Remove repeated hard-coded amber styles.

Keep:

- globe settings
- shortcuts
- diagnostics
- about
- renderer information

Do not rewrite diagnostic logic.

---

# 25. Tooltip / Marker Hover

The current overlay tooltip is different from the Radix tooltip system.

Keep both systems because they have different jobs.

Rename the canvas hover component only if it improves clarity, for example:

```text
MarkerHoverCard
```

Do not replace globe hover with a Radix tooltip.

Ensure hover information remains a complete, non-exclusive UX path because the globe canvas is not keyboard navigable like the event list.

---

# 26. Loading System

There are currently two loading approaches:

- `ui/spinner.tsx`
- `.loading-ring` CSS

Consolidate where practical.

Prefer contextual loading states over generic spinners everywhere.

Examples:

- panel skeletons
- chart skeletons
- result-loading states
- inline status indicators

---

# 27. Accessibility

Preserve existing strengths:

- skip link
- `aria-pressed` layer controls
- search combobox ARIA
- Radix semantics
- focus-visible styles
- reduced motion

Review and improve:

- mobile layer discoverability
- amber contrast on dark surfaces
- severity red/orange contrast
- canvas accessibility semantics
- hover-follower announcement noise
- focus states on all new controls
- keyboard alternatives to visual-only interactions

The event list must remain a complete alternative to globe marker interaction.

Do not add noisy `aria-live` updates to continuously changing coordinates/time.

---

# 28. Responsive Strategy

Desktop remains the primary experience.

Support:

- large desktop
- desktop
- laptop
- tablet
- narrow viewport

At small widths:

- preserve globe visibility
- collapse secondary information
- convert large panels to sheets where appropriate
- maintain critical status
- maintain search
- maintain layer access

Do not simply stack every desktop panel vertically over the globe.

---

# 29. Motion Strategy

Start with existing CSS motion where it is already sufficient.

Install `motion` only when Phase 5 begins.

Use Motion for:

- panel enter/exit
- layout transitions
- selected states
- search results
- list transitions
- hover/focus transitions
- drawer/sheet transitions

Respect reduced motion.

Avoid:

- perpetual decorative motion
- excessive bounce
- expensive animated blur
- animated borders everywhere
- animation on every component

The globe already supplies major motion.

---

# 30. Aceternity / React Bits Policy

Do not use them just because they are available.

Use at most a small number of carefully chosen effects.

Every imported/adapted component must be normalized to:

- project spacing
- project typography
- project colors
- project radius
- project motion
- project accessibility

If a component looks like it came from another product, do not use it unchanged.

---

# 31. Dependency Policy

Before adding any package, evaluate:

```text
Can the existing stack already do this?
Is the dependency necessary?
Does it overlap an existing package?
Does it justify its bundle cost?
Will it increase globe/UI coupling?
```

Explicitly avoid unnecessary additions of:

```text
state libraries
form libraries
zod
cmdk
react-hook-form
date-fns
Anime.js
```

unless a concrete new requirement proves them necessary.

---

# 32. Phase Plan

## Phase 0 — Baseline and Skill Verification

Do not perform the redesign yet.

Inspect:

```text
src/app/page.tsx
src/app/layout.tsx
src/app/globals.css
src/components/app/SentinelApp.tsx
src/components/panels/*
src/components/overlays/*
src/components/ui/*
src/components/globe/*
src/hooks/*
src/services/*
src/types/*
src/server/*
src/app/api/v1/*
package.json
next.config.mjs
tailwind.config.js
vitest.config.ts
.agents/skills/
skills-lock.json
```

Verify the current state against this prompt.

No UI redesign until this audit is complete.

### Phase 0 gate

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

If these scripts do not exist exactly, inspect `package.json` and use the real equivalent commands.

Do not invent npm scripts.

---

## Phase 1 — Design System Foundation

Create/update:

- accent token hierarchy
- semantic status alpha tokens
- spacing/radius consistency
- motion vocabulary
- chart tokens only when needed
- mobile drawer tokens

Do not add major visual effects yet.

Add `components.json` only if doing so is useful for the actual shadcn workflow in this repository.

Do not create a file merely because the old prompt expected it.

### Phase 1 gate

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

## Phase 2 — Shell

Redesign:

```text
TopNav
LayerPanel
BottomBar
search
mobile layer experience
```

Also fix the app-level mouse position performance issue.

### Phase 2 gate

Verify:

- search
- `/` shortcut
- result selection
- fly-to
- settings
- rotation toggle
- layer switching
- mobile layer access
- renderer indicator

---

## Phase 3 — Intelligence

Redesign:

```text
DataPanel
LayerOverview
EventDetails
MetricCard
SeverityFilter
DataStatusBanner
```

Preserve all existing data behavior.

Create contextual loading/error/empty states.

### Phase 3 gate

Review all eight environmental layers across:

```text
live
simulated
stale
unavailable
loading
error
empty
```

---

## Phase 4 — Visualization

Only after confirming actual data availability.

Implement:

- severity distribution
- analytical summaries
- time-series only where real data exists

Verify Bklit before adopting it.

Do not add a heavy chart library for a single simple distribution if SVG/CSS is sufficient.

---

## Phase 5 — Motion

Install:

```bash
npm install motion
```

only if Motion is actually needed after the preceding phases.

Add controlled transitions.

Verify that globe performance remains stable during transitions.

---

## Phase 6 — Premium Polish

Use a small number of carefully selected:

- Aceternity
- React Bits

effects.

Normalize them into the design system.

Remove effects that do not improve comprehension or interaction.

---

## Phase 7 — Final Quality Pass

Run:

```text
TypeScript check
ESLint
Vitest
Next production build
Accessibility review
Responsive review
React render review
Bundle/performance review
```

Use installed Vercel skills where relevant.

---

# 33. Git Strategy

Create a dedicated branch before Phase 1:

```bash
git switch -c feat/ui-overhaul
```

If a differently named active feature branch already exists for this work, do not create a competing branch; inspect first.

Prefer focused commits:

```text
feat(ui): establish sentinel design system
feat(ui): redesign application shell
perf(ui): isolate globe hover state
feat(ui): redesign intelligence panel
feat(ui): add analytical visualizations
feat(ui): add motion system
feat(ui): premium interaction polish
fix(ui): accessibility and responsive issues
```

Do not make a giant opaque commit.

---

# 34. Verification Checklist

## Functionality

- [ ] globe renders
- [ ] WebGPU works
- [ ] WebGL fallback works
- [ ] layer switching works
- [ ] marker rendering works
- [ ] marker hover works
- [ ] marker click works
- [ ] event details work
- [ ] search works
- [ ] fly-to works
- [ ] keyboard shortcuts work
- [ ] settings work
- [ ] refresh works
- [ ] provenance works
- [ ] loading states work
- [ ] error states work

## Design

- [ ] globe remains dominant
- [ ] visual hierarchy is clear
- [ ] yellow accent is controlled
- [ ] semantic colors remain meaningful
- [ ] typography is consistent
- [ ] spacing is consistent
- [ ] panels feel related
- [ ] charts fit the product
- [ ] no generic glassmorphism overload
- [ ] no random component-library styling

## Accessibility

- [ ] keyboard navigation
- [ ] focus-visible states
- [ ] accessible labels
- [ ] dialog semantics
- [ ] search semantics
- [ ] reduced-motion support
- [ ] adequate contrast
- [ ] event-list alternative for globe interaction

## Performance

- [ ] globe is isolated from shell hover state
- [ ] no unnecessary globe re-renders
- [ ] no expensive pointer-driven layout work
- [ ] animations are GPU-friendly
- [ ] dependencies are justified
- [ ] production build succeeds

---

# 35. Agent Behavior Rules

When uncertain:

```text
inspect first
preserve working behavior
make the smallest correct change
test
continue
```

Never:

- hallucinate files
- follow the obsolete Vite/Flask instructions
- rewrite the globe
- modify API contracts without necessity
- claim tests passed without running them
- claim skills are installed without verifying them
- install every available component library
- introduce a global state store without justification
- add decorative motion everywhere

If a requirement conflicts with the real repository, trust the real repository and this prompt over the obsolete prompt.

---

# 36. First Instruction to OpenCode

**Do not start coding immediately.**

First perform the current-repository verification and produce a concise implementation audit containing:

```text
1. Current Next.js architecture
2. Current component structure
3. Current skills discovered under .agents/skills
4. skills-lock discrepancies
5. Current design-token gaps
6. Exact Phase 1 changes
7. Performance change for SentinelApp hover state
8. Dependencies that will NOT be added
9. Dependencies that may be added later
10. Tests/build baseline
11. Any blockers
```

Then begin Phase 1 only after the baseline checks pass or the failures are explicitly documented.

Do not touch:

```text
src/components/globe/
src/shaders/atmosphere.ts
src/lib/webgpu.ts
src/server/
src/app/api/
```

unless a documented build/test issue outside the UI overhaul makes it absolutely necessary.

**The target is not a new application. It is a controlled, high-quality evolution of the existing Earth Sentinel product.**
