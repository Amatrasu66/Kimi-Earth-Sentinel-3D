# OpenCode Session 2 — Sentinel Frontend UI/UX Overhaul

## Repository

**Project:** `Kimi-Earth-Sentinel-3D`

**Scope:** Frontend UI/UX only.

This OpenCode session runs **in parallel with another OpenCode session** that is responsible for backend production connectivity, API verification/fixes, and migration of the Earth renderer to the official Three.js WebGPU/TSL Earth implementation.

Your job is to make the Sentinel frontend feel like a polished, professional environmental-intelligence application while preserving the existing application architecture and all functional behavior.

---

# 1. Primary Objective

Transform the existing frontend into a cohesive, production-quality environmental monitoring interface.

The finished application should feel like:

> **A professional environmental intelligence / Earth observation command center built around a high-quality interactive 3D Earth.**

It should NOT feel like:

- a generic SaaS dashboard
- a template copied from a UI library
- an Aceternity showcase
- a collection of unrelated cards
- an over-animated sci-fi HUD
- a completely different application

The **3D Earth remains the visual centerpiece**.

The interface should frame the globe rather than compete with it.

---

# 2. Critical Parallel-Session Boundary

Another OpenCode session is working on:

- Flask backend
- Vercel → Render connectivity
- CORS
- API configuration
- production environment variables
- provider integrations
- API endpoint auditing
- event detail APIs
- search/data APIs
- Three.js WebGPU/TSL Earth migration
- Earth textures/materials
- globe rendering
- globe markers
- globe camera/interaction integration
- backend tests
- production deployment verification

## Do NOT take ownership of those tasks.

Do not rewrite or replace backend architecture.

Do not replace the existing API layer.

Do not create a second API client.

Do not replace the Earth renderer.

Do not create a parallel globe implementation.

Do not revert or overwrite the other session's work.

If the other session changes the globe component while you are working, integrate with the resulting public component interface instead of fighting the change.

---

# 3. Non-Negotiable Functional Preservation

The UI redesign must preserve every currently supported user-facing capability.

Preserve:

- layer selection
- active layer state
- event selection
- event detail loading
- event detail display
- event hover
- tooltips
- search
- search results
- search result selection
- search fly-to
- globe rotation controls
- settings
- keyboard shortcuts
- data status/provenance
- loading states
- error states
- empty states
- backend/API status presentation
- responsive behavior
- existing navigation behavior

A visual redesign is successful only if functionality remains intact.

---

# 4. Inspect Before Editing

Before making changes, inspect the complete frontend.

At minimum inspect:

```text
frontend/
frontend/src/
frontend/src/App.tsx
frontend/src/components/
frontend/src/components/ui/
frontend/src/hooks/
frontend/src/lib/
frontend/src/services/
frontend/src/styles/
frontend/package.json
frontend/vite.config.ts
frontend/tsconfig.json
frontend/components.json
```

Also inspect all components imported by `App.tsx`.

Build a mental map of:

```text
App
 ├── Globe / Earth surface
 ├── Top navigation
 ├── Layer controls
 ├── Data/event panel
 ├── Search
 ├── Settings
 ├── Bottom status bar
 ├── Tooltips
 └── overlays / dialogs / loading states
```

Do not immediately start rewriting components.

First understand what already exists.

---

# 5. UI Technology Strategy

## Primary component foundation: shadcn/ui

Use the existing shadcn-style component system as the primary UI foundation.

Official documentation:

https://ui.shadcn.com/docs

shadcn/ui is intentionally open-code: components are placed in the project and can be customized instead of forcing the application into a fixed visual system.

Prefer existing components from:

```text
frontend/src/components/ui/
```

before creating new primitives.

Use shadcn-style components for:

- Button
- Badge
- Card
- Dialog
- Sheet
- Tabs
- Tooltip
- Popover
- Command
- Input
- Dropdown Menu
- Separator
- Scroll Area
- Skeleton
- Spinner
- Switch
- Slider
- Select
- Alert
- Empty
- Kbd
- Field
- Input Group
- etc.

Only add a component when there is an actual need.

Do not install every available shadcn component.

---

# 6. Secondary Visual Layer: Aceternity UI

Use Aceternity UI selectively for polished motion and visual effects.

Official component library:

https://ui.aceternity.com/components

Aceternity is compatible with React, Tailwind CSS, Motion, and shadcn-style workflows.

Use it where it provides a meaningful visual improvement.

Good candidates include:

- subtle animated borders
- spotlight effects
- floating effects
- premium tooltips
- animated tabs
- selected-state effects
- subtle card effects
- command/search interactions
- restrained background effects
- small micro-interactions

Do NOT use Aceternity merely because it exists.

Do NOT turn the application into an Aceternity demo.

Do NOT add large animated backgrounds behind the Earth.

Do NOT use excessive particle effects.

Do NOT add animation that makes the interface harder to operate.

---

# 7. Design Direction

## Overall aesthetic

Use:

- dark space environment
- deep neutral/near-black surfaces
- subtle translucency
- restrained borders
- subtle elevation
- clean typography
- cool neutral interface colors
- environmental status colors only where semantically meaningful
- small amounts of glow
- high information density without clutter

The Earth should provide most of the visual richness.

UI elements should generally be visually quieter than the globe.

---

# 8. Design Principles

Follow these rules throughout the redesign.

### 8.1 Hierarchy

The user should immediately understand:

1. where they are
2. what environmental layer is active
3. what the Earth is showing
4. whether data is live/available/simulated
5. what event is selected
6. what actions are available

### 8.2 Information density

This is an environmental monitoring application.

Do not make every element huge.

Prefer:

- compact controls
- clear labels
- readable metadata
- small badges
- efficient panels
- meaningful whitespace

### 8.3 Visual restraint

Avoid:

- excessive gradients
- excessive glassmorphism
- huge shadows
- glowing everything
- giant typography
- excessive rounded cards
- unnecessary animations

### 8.4 Consistency

Every control should feel like part of the same design system.

---

# 9. Establish a Frontend Design System

Before polishing individual screens, establish consistent tokens for:

## Typography

Define a clear hierarchy for:

- application title
- section titles
- panel titles
- labels
- body text
- metadata
- timestamps
- status text
- secondary text

Use the existing font stack unless there is a strong reason to change it.

Do not introduce several unrelated fonts.

## Spacing

Use a consistent spacing scale.

## Radius

Use a small number of radius values.

Avoid random border-radius values throughout the application.

## Borders

Use subtle borders for:

- panels
- controls
- separators
- selected states

## Surfaces

Create a clear hierarchy:

```text
background
  ↓
floating surface
  ↓
panel
  ↓
elevated panel
  ↓
active/selected surface
```

## Status colors

Define semantic states such as:

```text
success
warning
danger
info
neutral
live
simulated
offline
loading
```

Do not use arbitrary colors for individual components.

---

# 10. Top Navigation / Header

Redesign the top navigation into a compact professional command header.

It should contain, as appropriate to the current functionality:

- Sentinel branding
- application name
- search
- connection/data status
- settings
- other existing controls

The header should:

- remain visually lightweight
- not obscure the globe
- work on smaller screens
- have proper hover/focus states
- have tooltips for icon-only controls
- maintain keyboard accessibility

Do not invent functionality just to fill space.

---

# 11. Search Experience

The search interface is a major interaction.

Redesign it using shadcn `Command` / related primitives where appropriate.

Desired experience:

```text
User focuses search
       ↓
Search field becomes prominent
       ↓
User types
       ↓
Results appear
       ↓
Keyboard navigation works
       ↓
User selects result
       ↓
Existing fly-to behavior executes
```

Support:

- search loading
- result list
- highlighted result
- keyboard navigation
- Enter selection
- Escape close
- empty results
- error state
- selected state
- clear action where appropriate

Do not change the underlying search API.

Do not fake results.

Do not implement a new geocoding system.

Use whatever results the existing frontend/API provides.

---

# 12. Left Layer Navigation

Redesign the environmental layer controls.

The layer navigation should clearly communicate:

- available layers
- active layer
- unavailable/loading states
- layer identity
- hover information

Each icon-only control must have an accessible tooltip.

Use a polished vertical navigation pattern.

Potential structure:

```text
┌──────────┐
│ Sentinel │
├──────────┤
│ layer 1  │
│ layer 2  │
│ layer 3  │
│ layer 4  │
│ layer 5  │
│ layer 6  │
│ layer 7  │
│ layer 8  │
├──────────┤
│ status   │
└──────────┘
```

Do not force this exact structure if the existing application has better information architecture.

The important requirement is that layer selection remains obvious and easy.

---

# 13. Data / Event Panel

Redesign the selected-event/data panel as a professional information surface.

The panel should prioritize:

1. Event title
2. Event type/category
3. Severity/status
4. timestamp
5. location
6. quantitative values such as magnitude when available
7. description
8. provider/source
9. provenance/data status

Use:

- badges
- compact metadata rows
- separators
- icons where useful
- readable typography
- scrollable content when necessary

Do not display fields that do not exist.

Do not invent values.

Do not label simulated data as live.

Preserve existing provenance indicators.

---

# 14. Event Detail States

Design explicit states for:

## No selection

Example concept:

```text
Select an event
Choose an event on the globe to inspect its details.
```

## Loading

Use a skeleton rather than flashing empty content.

## Loaded

Display real event information.

## Error

Explain that event details could not be loaded and provide retry where the existing architecture supports retry.

## Partial data

Clearly show available fields without creating empty visual clutter.

---

# 15. Bottom Status Bar

Redesign the bottom status area.

Potential information:

- API connection state
- data state
- active layer
- renderer state
- current coordinates if already supported
- provider/provenance state

Keep this compact.

It should never dominate the screen.

---

# 16. Settings Modal

Redesign the settings interface using shadcn Dialog/Sheet components.

Group settings logically.

Example categories:

```text
Display
Globe
Interaction
Data
Keyboard shortcuts
About / diagnostics
```

Only expose settings that already exist or that can be implemented entirely within the frontend without changing backend behavior.

Do not create fake toggles.

Every visible setting must actually affect something.

Use:

- Switch
- Slider
- Select
- Checkbox
- Tabs
- Separator
- Label
- Tooltip

where appropriate.

---

# 17. Keyboard Shortcuts

Preserve the existing keyboard shortcut system.

If shortcuts are already supported, make them discoverable.

A small `Kbd` / shortcut indicator can be used where appropriate.

Do not change shortcut behavior without a strong reason.

Do not introduce shortcut conflicts.

---

# 18. Tooltips

Every icon-only control should have a meaningful tooltip.

Examples:

- Settings
- Rotate
- Layer controls
- Search actions
- Close
- Reset
- Data status

Tooltips should:

- appear quickly
- not block important content
- be keyboard accessible
- use consistent styling

---

# 19. Loading System

Create a coherent loading language.

Use appropriate loading UI for:

### Application

Minimal initial loading state.

### Layer

Small contextual spinner/skeleton.

### Event details

Panel skeleton.

### Search

Inline spinner.

### Settings

Avoid unnecessary loading.

### Globe

Do not cover the entire application with a generic full-screen spinner if the globe can progressively initialize.

The UI should communicate what is loading.

---

# 20. Error System

Create consistent error surfaces.

Errors should communicate:

```text
What happened
Why it matters
What the user can do
```

Examples:

```text
Environmental data unavailable
The selected data source could not be reached.
Try again.
```

Avoid:

```text
TypeError: Cannot read properties of undefined...
```

Do not expose implementation details.

Do not swallow errors silently.

---

# 21. Empty States

Create polished empty states for:

- no search results
- no selected event
- no events for active layer
- unavailable data
- unsupported data
- empty event panel

Use shadcn Empty or a custom composition based on existing primitives.

Keep empty states concise.

---

# 22. Responsive Design

The application must work on:

- large desktop
- standard laptop
- tablet
- narrow viewport

Desktop should preserve the command-center layout.

On smaller screens:

- layer controls should collapse or adapt
- data panel should become a sheet/drawer where appropriate
- search should resize
- bottom status should remain usable
- settings should become a mobile-friendly sheet/dialog
- controls must not cover the globe excessively

Do not simply scale everything down.

Recompose the layout where necessary.

---

# 23. Accessibility

Implement:

- semantic buttons
- keyboard navigation
- visible focus states
- accessible dialogs
- accessible tooltips
- accessible labels
- sensible tab order
- sufficient contrast
- reduced-motion consideration
- screen-reader labels for icon-only controls

Never rely solely on:

- color
- animation
- position

to communicate meaning.

---

# 24. Motion System

Use animation intentionally.

Good animation:

- 150–300ms UI transitions
- subtle panel entrance
- selected-state transition
- hover feedback
- search result transitions
- status changes
- restrained Aceternity effects

Avoid:

- constant movement
- distracting looping animations
- giant background effects
- excessive blur animation
- aggressive parallax
- animation that interferes with globe interaction

Respect `prefers-reduced-motion`.

---

# 25. Globe Integration Rule

The globe is being modified by another session.

Treat the globe as an important rendering surface.

The UI layer may:

- position overlays around it
- provide controls
- provide panels
- provide search
- provide tooltips
- react to selection state
- display renderer status
- display data state

The UI layer must NOT:

- replace the renderer
- rewrite Earth materials
- change WebGPU/TSL implementation
- create a second Earth
- duplicate marker rendering
- duplicate camera controls

If the Earth component API needs a UI-facing prop, coordinate through the existing component boundary and keep the change minimal.

---

# 26. Component Architecture

Refactor only where it improves maintainability.

A desirable structure is approximately:

```text
src/
├── components/
│   ├── ui/
│   │   ├── ...
│   │
│   ├── layout/
│   │   ├── SentinelShell.tsx
│   │   ├── TopNav.tsx
│   │   ├── LayerRail.tsx
│   │   └── BottomStatusBar.tsx
│   │
│   ├── search/
│   │   ├── SearchCommand.tsx
│   │   └── SearchResults.tsx
│   │
│   ├── data/
│   │   ├── DataPanel.tsx
│   │   ├── EventDetails.tsx
│   │   ├── DataStatus.tsx
│   │   └── ...
│   │
│   ├── settings/
│   │   └── SettingsModal.tsx
│   │
│   └── globe/
│       └── existing globe components
│
├── hooks/
├── lib/
├── services/
└── styles/
```

This is a target, not a requirement to reorganize everything.

Do not create unnecessary folders.

---

# 27. Avoid Component Duplication

Before creating a new component:

1. Search `components/ui`.
2. Search existing feature components.
3. Check whether an equivalent primitive already exists.
4. Reuse or extend it when appropriate.

Do not create:

```text
CustomButton.tsx
FancyButton.tsx
PrimaryButton.tsx
ActionButton.tsx
```

when one shadcn Button can handle the use case.

---

# 28. Dependency Policy

Before installing anything:

```bash
npm ls
```

Review existing dependencies.

Prefer:

- existing Radix/shadcn primitives
- existing Lucide icons
- existing Tailwind setup
- existing Motion dependency if already present
- existing utilities

Do not add a new UI framework.

Do not add:

- Material UI
- Chakra UI
- Ant Design
- Mantine
- Bootstrap
- another CSS framework

unless there is an exceptional, explicitly justified requirement.

Avoid unnecessary bundle growth.

The application already has a substantial frontend bundle.

---

# 29. shadcn Installation Policy

If a required shadcn component is missing, prefer adding the official component source using the shadcn CLI or the project's established component workflow.

Example:

```bash
npx shadcn@latest add command
```

Only add components that are actually needed.

Inspect the generated code before committing it.

Do not blindly run:

```bash
npx shadcn@latest add --all
```

---

# 30. Aceternity Integration Policy

If an Aceternity component is useful:

1. Inspect the component implementation.
2. Determine its dependencies.
3. Confirm React/Vite compatibility.
4. Confirm it does not introduce unnecessary bundle cost.
5. Adapt its styling to the Sentinel design system.
6. Keep the effect restrained.

Do not paste an entire Aceternity landing page into the application.

Do not import an effect solely because it looks impressive in isolation.

---

# 31. Visual Quality Bar

The result should satisfy all of these:

### Before

```text
UI controls around a globe
```

### After

```text
A coherent environmental intelligence command interface
centered around a premium interactive Earth
```

The interface should feel intentional at first glance.

There should be:

- clear hierarchy
- consistent spacing
- coherent typography
- consistent controls
- professional states
- polished micro-interactions
- restrained visual effects

---

# 32. Do Not Over-Redesign

Preserve the application's identity.

Do not:

- change the project name
- remove Sentinel branding
- remove environmental layers
- remove the globe
- remove event visualization
- remove data provenance
- remove useful controls
- turn the app into a landing page
- add unrelated dashboard metrics
- add fake analytics
- add fake AI functionality
- add fake alerts
- add fake predictions

This is a product UI improvement, not a product-scope expansion.

---

# 33. Frontend State Integrity

Do not duplicate application state.

If `App.tsx` currently owns:

- active layer
- selected event
- search state
- settings
- rotation
- event loading

do not create another competing state system just for the redesigned UI.

Use the existing state and callbacks.

Do not introduce Redux/Zustand merely for UI polish.

---

# 34. API Boundary Integrity

Do not modify the API service layer unless a UI-only integration bug absolutely requires it.

The other session owns API/production connectivity.

Use the existing:

```text
src/services/api.ts
```

and existing hooks.

Do not create:

```text
src/services/newApi.ts
src/services/uiApi.ts
src/services/backend.ts
```

---

# 35. Production URL Integrity

Do not hardcode:

```text
http://localhost:5001
```

or any production backend URL into UI components.

The API base belongs to the centralized configuration/API layer.

The other session is handling production API configuration.

---

# 36. Data Provenance Integrity

The UI must clearly preserve the distinction between:

- live data
- cached live data
- simulated fallback
- unavailable data

Never visually present simulated fallback as live environmental data.

If the backend already provides provenance/status metadata, surface it cleanly.

Do not remove provenance to make the interface look cleaner.

---

# 37. Testing Requirements

After implementation:

```bash
cd frontend
npm run lint
npm test
npm run build
```

All must pass.

If tests exist for affected components, update them.

Add frontend tests for important new behavior where appropriate.

At minimum verify:

- layer selection still works
- search still works
- search result selection still works
- event selection still works
- settings opens/closes
- keyboard shortcuts still work
- loading states render
- error states render
- responsive classes/layout do not introduce obvious issues

Do not weaken or delete existing tests to make the suite pass.

---

# 38. Manual UI Verification

Run the application locally and inspect it at multiple viewport sizes.

Verify:

## Desktop

- Earth remains dominant.
- Header is aligned.
- Layer rail is usable.
- Data panel is readable.
- Bottom bar does not overlap important controls.
- Search is easy to use.

## Laptop

- No major overlap.
- Panel widths remain reasonable.
- Globe remains visible.

## Tablet / narrow

- Panels adapt.
- Controls remain accessible.
- Search remains usable.
- Dialogs/sheets fit viewport.

## Interaction

Test:

- layer switching
- event hover
- event click
- event details
- search
- fly-to
- settings
- keyboard shortcuts
- tooltips
- close actions
- escape behavior

---

# 39. Do Not Break the Other OpenCode Session

Because two sessions are working concurrently:

Before committing changes:

```bash
git status
git diff
```

Review changed files carefully.

Do not reset the repository.

Do not run destructive commands such as:

```bash
git reset --hard
git clean -fd
```

Do not overwrite files that belong to the other session unless the change is genuinely required for the UI integration.

If a conflict appears, preserve the other session's functional work.

---

# 40. Git Discipline

Keep commits focused.

Prefer commits such as:

```text
feat(ui): redesign sentinel shell
feat(ui): improve layer rail
feat(ui): redesign event data panel
feat(ui): add command search interface
feat(ui): polish settings and status controls
test(ui): cover redesigned interactions
```

Do not mix unrelated backend or deployment changes into UI commits.

---

# 41. Documentation

Update frontend documentation if the UI architecture changes substantially.

Document:

- new component organization
- shadcn components added
- Aceternity components/effects added
- design-system decisions
- major interaction changes
- new frontend dependencies

Do not add documentation for components that were not actually implemented.

---

# 42. Required Final Audit

Before declaring the work complete, inspect:

```bash
git diff --stat
git diff
```

Then verify:

```bash
npm run lint
npm test
npm run build
```

Confirm there are no:

- TypeScript errors
- unused imports
- broken imports
- console errors caused by the UI changes
- accidental backend modifications
- API rewrites
- hardcoded URLs
- fake data
- duplicate UI primitives
- unnecessary dependencies

---

# 43. Definition of Done

This session is complete only when:

## Visual

- [ ] Sentinel has a coherent professional visual system.
- [ ] The Earth remains the visual centerpiece.
- [ ] UI looks polished on desktop and laptop.
- [ ] Responsive behavior is handled.
- [ ] Typography is consistent.
- [ ] Spacing is consistent.
- [ ] Borders/surfaces are consistent.
- [ ] Status colors are semantic.
- [ ] Animations are restrained.

## Components

- [ ] Existing shadcn components are reused.
- [ ] Missing shadcn components are added only when needed.
- [ ] Aceternity is used selectively.
- [ ] No second UI framework was introduced.
- [ ] No unnecessary component duplication exists.

## Functionality

- [ ] Layer controls work.
- [ ] Search works.
- [ ] Search result selection works.
- [ ] Fly-to behavior remains intact.
- [ ] Event selection works.
- [ ] Event details work.
- [ ] Settings work.
- [ ] Keyboard shortcuts work.
- [ ] Tooltips work.
- [ ] Loading states work.
- [ ] Error states work.
- [ ] Empty states work.
- [ ] Provenance/status remains visible.

## Accessibility

- [ ] Keyboard navigation works.
- [ ] Focus states are visible.
- [ ] Icon-only controls have accessible labels/tooltips.
- [ ] Dialogs are accessible.
- [ ] Contrast is acceptable.
- [ ] Reduced-motion behavior is respected.

## Engineering

- [ ] No backend architecture was rewritten.
- [ ] No API layer was duplicated.
- [ ] No production URLs were hardcoded into UI components.
- [ ] No fake functionality was introduced.
- [ ] No destructive git operations were used.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.

---

# 44. Final Report Required From OpenCode

When finished, provide a concise engineering report containing:

## 1. UI audit

What was wrong with the previous frontend.

## 2. Components changed

List major files/components modified.

## 3. New components

List new shadcn/custom/Aceternity components.

## 4. Dependencies

List anything added, removed, or upgraded and why.

## 5. Functional preservation

Confirm:

- layers
- search
- fly-to
- events
- event details
- settings
- shortcuts
- provenance

## 6. Responsive behavior

Explain desktop/tablet/narrow behavior.

## 7. Accessibility

Explain keyboard/focus/ARIA/reduced-motion work.

## 8. Validation

Report exact results of:

```text
npm run lint
npm test
npm run build
```

## 9. Other-session compatibility

Explicitly confirm that the backend/API and Earth renderer owned by the other session were not unnecessarily rewritten.

## 10. Remaining issues

List anything genuinely unresolved.

---

# 45. Final Instruction

Do not optimize for the number of files changed.

Optimize for:

> **A polished, coherent, professional Sentinel UI that makes the existing environmental data and 3D Earth experience substantially better without changing the application's product scope or breaking the work of the parallel OpenCode session.**

Use shadcn/ui as the structural foundation.

Use Aceternity selectively for premium visual details.

Keep the Earth as the hero.

Keep the UI readable.

Keep the data trustworthy.

Keep the architecture intact.

Do not invent functionality.

Do not rewrite unrelated systems.

Start by auditing the existing frontend, then implement the redesign incrementally, testing after each major area.
