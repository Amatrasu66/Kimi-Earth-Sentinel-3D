# Phase 1 — Repository Audit and CesiumJS Migration Blueprint

**Project:** Kimi Earth Sentinel 3D  
**Phase:** 1 of 9  
**Execution environment:** OpenCode  
**Application stack:** Next.js App Router, React, TypeScript, Node.js 24  
**Target globe engine:** CesiumJS  
**Phase type:** Discovery, audit, architecture, and planning  
**Implementation policy:** Read-only audit of the existing application; documentation-only changes are permitted after approval.

---

## 1. Role and mission

Act as a senior geospatial software architect, Next.js engineer, CesiumJS specialist, and technical auditor.

Your task is to audit the existing Kimi Earth Sentinel 3D repository and produce an evidence-based migration blueprint for upgrading its existing interactive Earth globe to CesiumJS.

The application is an Earth observation and environmental intelligence platform. The intended result is a cohesive scientific visualization application that preserves the useful existing features while introducing CesiumJS as the primary 3D geographic rendering engine.

The intended capabilities across the complete project include:

1. Realistic Earth rendering, terrain, atmospheric effects, lighting, and geographic navigation.
2. Switchable satellite imagery, map layers, environmental overlays, opacity controls, and legends.
3. Integration of actual Sentinel-1 and Sentinel-2 products, environmental datasets, observation footprints, and acquisition metadata.
4. Geographic search, coordinate picking, clickable observations, camera navigation, and inspection panels.
5. Preservation of the existing dashboard, API routes, environmental intelligence functionality, and useful UI components.
6. Production-grade testing, performance, accessibility, security, deployment, and documentation.

**Your responsibility in this phase is to discover what exists, determine what needs to change, and document how to change it safely. Do not implement the migration during this phase.**

---

## 2. Repository context

The repository is:

`https://github.com/Amatrasu66/Kimi-Earth-Sentinel-3D`

Work against the actual checked-out repository available in the current OpenCode workspace. Do not assume that the remote repository, the deployed application, and the local working tree are identical.

The supplied `package.json` identifies the following baseline.

### Runtime and application

- Package name: `kimi-earth-sentinel-3d`
- Version: `1.0.0`
- Node.js engine: `24.x`
- Next.js: `^15.3.0`
- React: `^19.2.0`
- React DOM: `^19.2.0`
- TypeScript: `~5.9.3`

### Existing visualization dependencies

- `three`: `^0.185.1`
- `@react-three/fiber`: `^9.6.1`
- `@react-three/drei`: `^10.7.7`

CesiumJS is not listed in the supplied dependency manifest.

### Other relevant dependencies

- `swr`: `2.5.1`
- Radix UI packages
- `lucide-react`
- `motion`
- D3 and Visx visualization packages
- Vitest
- Testing Library
- ESLint and TypeScript tooling

### Existing scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run textures:report`
- `npm run bundle:check`

Treat this information as the supplied baseline, not as proof of the repository's current state. Verify the actual manifest, lockfile, source files, installed packages, and available scripts.

Do not change dependencies during Phase 1.

---

## 3. Mandatory operating rules

Follow these rules throughout the audit.

### 3.1 Inspect before making assumptions

- Read the actual source code.
- Inspect the project structure and relevant configuration.
- Trace the current globe implementation from its entry point to its supporting components.
- Inspect the existing API routes and data-fetching logic.
- Review the existing tests.
- Identify the current deployment configuration.
- Reference actual file paths and exported functions or components in your findings.
- Distinguish verified facts from hypotheses and recommendations.

Never claim that a feature exists solely because it was mentioned in a previous conversation or in the project description.

### 3.2 No implementation during this phase

Do not:

- Install CesiumJS.
- Remove Three.js, React Three Fiber, or Drei.
- Rewrite the globe.
- Create a replacement globe component.
- Modify the existing dashboard.
- Change API routes or response schemas.
- Modify dependencies or lockfiles.
- Rename files or reorganize the application.
- Replace the existing imagery provider.
- Change environment variables.
- Modify deployment settings.
- Run automated code formatters over the repository.
- Make unrelated refactors.

The purpose of this phase is to produce a reliable implementation plan before making application changes.

If a command or diagnostic tool creates files or modifies repository state, do not run it unless its effects are understood and approved.

### 3.3 Preserve user changes

Before doing anything, inspect:

- `git status`
- The current branch
- The latest commit
- Existing uncommitted changes
- Untracked files

Never discard, overwrite, stage, or commit existing user work.

Do not reset the repository, switch branches, or perform destructive Git operations.

### 3.4 Verify external technical assumptions

When external documentation or network access is available, consult official documentation for:

- CesiumJS installation and version compatibility.
- CesiumJS asset serving and worker configuration.
- CesiumJS terrain and imagery providers.
- Next.js client components and dynamic imports.
- React lifecycle and resource cleanup.
- Cesium ion authentication and access-token restrictions.
- Relevant satellite data provider APIs and licensing.

Prefer official documentation and version-specific references.

Do not invent API names, configuration options, or package compatibility claims. If external access is unavailable, clearly identify which conclusions require later verification.

### 3.5 Report uncertainty explicitly

Use these evidence categories:

- **Verified:** directly established from the repository or a reproducible check.
- **Inferred:** strongly suggested by code or configuration but not conclusively established.
- **Unknown:** cannot be determined from the available evidence.
- **Recommended:** a proposed design or action, not an existing fact.

When information is missing, document the gap rather than fabricating an answer.

---

## 4. Step 0 — Establish a safe baseline

Before inspecting implementation details, establish the repository's initial state.

### 4.1 Git and working tree

Inspect:

- Current working directory.
- Current branch.
- Latest commit hash and message.
- Tracked changes.
- Untracked files.
- Existing repository conventions.
- Relevant project documentation.

Record any pre-existing modifications so that the audit can distinguish them from later documentation changes.

### 4.2 Repository structure

Generate or inspect a directory listing covering at least:

- `src/`
- `src/app/`
- `src/components/`
- `src/components/globe/`, if present.
- `src/components/app/`, if present.
- `src/app/api/`, if present.
- `public/`
- `public/textures/`, if present.
- `scripts/`
- `tests/` or equivalent test directories.
- Configuration files.
- Documentation.
- Deployment-related files.

Do not dump the entire repository indiscriminately. Exclude generated output, dependency directories, caches, and large binary assets unless a specific diagnostic requires them.

### 4.3 Baseline configuration

Inspect:

- `package.json`
- The package lockfile actually used by the project.
- `tsconfig.json`
- `next.config.*`
- ESLint configuration.
- PostCSS and Tailwind configuration.
- Vitest configuration.
- `.gitignore`
- Environment variable examples, if present.
- Deployment configuration.
- Existing build and bundle-budget scripts.

Record the current scripts and identify which checks can be run safely.

### 4.4 Baseline verification

Where practical, run the existing read-only or non-destructive validation commands:

- Type checking.
- Linting.
- Unit tests.
- Production build.
- Existing bundle-budget or texture-report checks where appropriate.

Use the repository's existing package manager and lockfile.

Do not install or update dependencies merely to make the checks run. If dependencies are unavailable, report that limitation.

Record each result as:

- Passed.
- Failed.
- Blocked.
- Not run.

For failures, include the relevant command, a concise error summary, and whether the failure appears to be pre-existing or remains undetermined.

Do not repair failures during this phase.

---

## 5. Step 1 — Audit the existing globe implementation

This is the most important technical investigation in Phase 1.

### 5.1 Find the globe entry point

Identify the exact file or files responsible for rendering the existing Earth.

Search for:

- Three.js `WebGLRenderer`.
- `THREE.Scene`.
- `THREE.PerspectiveCamera` or `THREE.OrthographicCamera`.
- `THREE.Mesh`.
- `SphereGeometry`.
- `Canvas` from React Three Fiber.
- `useFrame`.
- `useThree`.
- `OrbitControls`.
- `TextureLoader`.
- `useTexture`.
- Earth-specific components and texture utilities.

Do not assume that all globe functionality resides in one file.

Produce a call graph or dependency outline showing how the globe is initialized and how its child components are connected.

### 5.2 Document the rendering architecture

Determine:

- Whether the globe uses vanilla Three.js, React Three Fiber, or both.
- How the renderer is created.
- Where the scene and camera are created.
- How the Earth mesh and materials are constructed.
- Which components own camera controls.
- How resizing is handled.
- How rendering is scheduled.
- Whether device pixel ratio is limited.
- How textures are loaded and cached.
- How asynchronous resources are cleaned up.
- Whether the renderer supports multiple globes or scenes.
- Whether the current globe is mounted through a client-only boundary.

Reference exact files and functions for every verified finding.

### 5.3 Inventory all current globe functionality

Inspect the code for each of the following:

- Base Earth texture.
- Day/night shading.
- Terrain or elevation displacement.
- Cloud layers.
- Atmospheric glow.
- Sun direction and lighting.
- Stars or background environment.
- Country boundaries.
- Latitude and longitude grids.
- Geographic markers.
- Event markers.
- Satellite tracks or footprints.
- Geographic labels.
- Search and fly-to behavior.
- Zoom, pan, rotate, and tilt controls.
- Globe reset or home view.
- Coordinate picking.
- Selection and hover effects.
- Tooltips and inspection panels.
- Imagery-layer controls.
- Environmental overlays.
- Time-based visualization.
- Loading indicators.
- Empty states.
- Error handling.
- Responsive behavior.
- Mobile interaction.
- Accessibility support.

For each feature, classify it as:

1. Implemented and verified.
2. Partially implemented.
3. Present in the UI but not connected to functional data.
4. Not found.
5. Unable to verify.

Do not interpret the presence of a button or component as proof that its intended behavior works.

### 5.4 Inspect Earth textures and assets

Investigate:

- Texture filenames and formats.
- Resolution and approximate memory footprint.
- Geographic projection.
- UV mapping.
- Whether the texture is a complete global map or a partial regional image.
- Texture-loading and fallback behavior.
- Whether textures are bundled locally or loaded remotely.
- Whether imagery is static, tiled, time-dependent, or dynamically generated.
- Existing texture optimization scripts.
- Licensing and attribution information where available.

Determine whether existing Earth textures can be reused in the CesiumJS application or whether equivalent data needs to be sourced separately.

Do not assume a Three.js sphere texture can be inserted directly into CesiumJS without conversion or an appropriate imagery provider.

### 5.5 Audit coordinate systems

Determine:

- How latitude and longitude are converted into 3D coordinates.
- Which axis represents geographic north.
- Which longitude is aligned with the front of the globe.
- Whether the globe uses degrees or radians in each relevant function.
- Whether coordinates are transformed for marker placement.
- Whether terrain altitude is supported.
- Whether marker positions remain correct as the camera moves.
- Whether there are coordinate-picking tests.

Record any orientation or coordinate assumptions that must be preserved during migration.

### 5.6 Audit performance and resource management

Inspect for:

- Repeated texture allocations.
- Unnecessary React re-renders.
- Duplicate renderer instances.
- Excessive marker meshes.
- Missing geometry or material disposal.
- Unbounded animation loops.
- Expensive per-frame computations.
- Large texture payloads.
- Unoptimized imagery loading.
- Missing loading states.
- WebGL context-loss handling.
- Mobile memory concerns.

Record confirmed issues separately from potential risks.

---

## 6. Step 2 — Audit the application and dashboard

Identify the main application entry point and the components responsible for the surrounding interface.

Inspect:

- Main dashboard composition.
- Sidebar and navigation.
- Layer controls.
- Search components.
- Observation inspector.
- Environmental event panels.
- Filters and time selectors.
- Status and metric cards.
- Dialogs and popovers.
- Map legends.
- Loading and error states.
- Responsive layout.
- Shared design tokens and styles.

Determine how the globe communicates with these components.

### 6.1 State management

Document whether the application uses:

- React state.
- Context providers.
- URL query parameters.
- SWR.
- A global state library.
- Server component props.
- Other shared stores.

Identify the current sources of truth for:

- Selected location.
- Search query.
- Active layer.
- Layer visibility.
- Selected event.
- Selected satellite scene.
- Observation time range.
- Camera or viewport state.

Do not propose a second global state management system unless the existing architecture clearly requires one.

### 6.2 Data flow

Trace at least one complete data flow for each existing feature that is found:

1. UI action.
2. State update or request.
3. API or data service.
4. Data transformation.
5. Globe or panel rendering.
6. Loading, success, and error behavior.

Highlight any globe functionality that currently bypasses the application's normal data layer.

### 6.3 UI preservation requirements

Identify which components can remain unchanged during the Cesium migration.

Classify each relevant component as:

- Reusable without changes.
- Reusable with a small adapter.
- Requires modification.
- Requires replacement.
- Cannot yet be classified.

The objective is to preserve working application features, not to redesign the entire dashboard.

---

## 7. Step 3 — Audit APIs and environmental data services

Inspect the existing `src/app/api/` directory and every relevant API route.

### 7.1 API inventory

For each route, record:

- HTTP method.
- Route path.
- Purpose.
- Input parameters.
- Validation rules.
- Response schema.
- Error response behavior.
- External providers called.
- Authentication or authorization requirements.
- Caching behavior.
- Rate-limit behavior, if implemented.
- Timeout and retry behavior.
- Relevant tests.

Inspect supporting server-side service modules and shared schemas.

### 7.2 Data-provider inventory

Search for references to:

- NASA.
- Copernicus.
- Sentinel-1.
- Sentinel-2.
- Earth observation services.
- Satellite imagery APIs.
- Environmental event feeds.
- Weather or climate providers.
- Geocoding services.
- Terrain services.
- Cesium ion.
- Tile services such as WMS, WMTS, XYZ, or other supported formats.

For every identified provider, document:

- The actual endpoint or SDK in use.
- The data product.
- Authentication requirements.
- Whether credentials are server-only.
- Data freshness.
- Spatial coverage.
- Temporal coverage.
- Supported output formats.
- Attribution and licensing.
- Current error-handling behavior.

Do not claim that a provider is integrated just because a dependency, environment variable, or unused configuration entry exists.

### 7.3 Identify existing functionality to preserve

Create an explicit list of API contracts and service behaviors that must not change without justification.

Where possible, identify existing consumers of each API route.

Do not change the backend during this audit.

---

## 8. Step 4 — Evaluate CesiumJS integration requirements

Assess how CesiumJS should be introduced into this specific Next.js application.

Do not install it during Phase 1.

### 8.1 Version and compatibility research

Determine the current stable CesiumJS release or the most appropriate supported version using official documentation.

Evaluate compatibility with:

- Node.js 24.
- Next.js 15 App Router.
- React 19.
- TypeScript 5.9.
- The existing bundler and build configuration.
- Existing lint and type-check settings.
- The production deployment platform.

Distinguish documented compatibility from assumptions.

Recommend an explicit versioning strategy. Avoid automatically choosing an unpinned version without reviewing compatibility and lockfile behavior.

### 8.2 Client-only rendering

Determine how to isolate CesiumJS from server-side rendering.

Assess:

- Client component boundaries.
- Dynamic imports.
- Browser-only global objects.
- DOM-dependent initialization.
- Hydration risks.
- Cesium widgets CSS.
- Error boundaries.
- Loading placeholders.
- Initialization failure states.

Propose an architecture that prevents browser-dependent Cesium code from executing in the server-rendering path.

Do not assume that adding `"use client"` alone solves every SSR or bundling issue.

### 8.3 Static assets and workers

Investigate the version-appropriate requirements for serving Cesium assets.

Evaluate:

- Worker scripts.
- Third-party assets.
- Cesium assets.
- Widget assets.
- `CESIUM_BASE_URL`.
- Public asset directory layout.
- Build and deployment copying.
- Development behavior.
- Production behavior.
- Asset caching.
- Content Security Policy implications, if applicable.

Recommend a deterministic, repeatable asset strategy.

Do not create asset-copy scripts or modify Next.js configuration during this phase.

### 8.4 Globe lifecycle and resource cleanup

Design the lifecycle for:

- Viewer initialization.
- Asynchronous initialization.
- Component unmounting.
- React Strict Mode behavior.
- Event listener registration.
- Screen-space event handlers.
- Viewer destruction.
- Imagery and data-source removal.
- Error recovery.
- Reinitialization.

The blueprint must explicitly address how to prevent duplicate viewers, memory leaks, stale callbacks, and asynchronous initialization completing after unmount.

### 8.5 Terrain and imagery providers

Evaluate the differences between:

- Ellipsoid terrain.
- Cesium terrain providers.
- Cesium ion-hosted terrain.
- Third-party terrain services.
- Built-in imagery options.
- Cesium ion imagery.
- External imagery tile services.
- Georeferenced raster imagery.

For each proposed source, document access requirements, licensing, coverage, costs where known, and fallback behavior.

Do not require a paid service if a suitable alternative meets the project's needs.

### 8.6 CesiumJS and Three.js coexistence

Determine whether any existing Three.js functionality should be retained during migration.

Classify existing components as:

- CesiumJS replacement.
- Independent Three.js visualization that may remain.
- UI or business logic independent of either engine.
- Unused or redundant functionality.
- Requires further investigation.

Assess whether the project can temporarily support both engines behind a feature flag or fallback switch.

Avoid running two full Earth renderers simultaneously by default, since this may significantly increase GPU and memory usage.

Do not remove existing visualization dependencies until the later migration phases prove they are no longer required.

---

## 9. Step 5 — Define the target CesiumJS architecture

Produce a proposed architecture based on the actual repository structure.

Do not force the project into an arbitrary directory convention. Recommend a structure that follows the existing conventions wherever practical.

The architecture should address the following logical responsibilities.

### 9.1 Globe host

Responsible for:

- Rendering the globe in the existing dashboard.
- Loading CesiumJS on the client.
- Managing viewer lifecycle.
- Exposing a controlled interface to the application.
- Reporting initialization errors.
- Providing a loading state.

### 9.2 Globe controller

Responsible for:

- Camera navigation.
- Fly-to operations.
- Reset or home view.
- Geographic coordinate picking.
- Selection events.
- Safe communication with React components.

Avoid exposing the entire Cesium Viewer to unrelated application components unless there is a clear technical reason.

### 9.3 Imagery and terrain services

Responsible for:

- Provider configuration.
- Terrain selection.
- Imagery layer registration.
- Layer visibility.
- Layer ordering.
- Opacity.
- Provider attribution.
- Provider errors and loading status.

### 9.4 Observation and event layers

Responsible for rendering supported data types such as:

- Point observations.
- Environmental events.
- Geographic footprints.
- Satellite coverage.
- Observation locations.
- Other geospatial overlays supported by actual data.

Use a consistent data contract for geographic features wherever practical.

### 9.5 Application integration

Responsible for connecting the globe to:

- Existing dashboard state.
- Search and geocoding.
- API routes.
- Existing observation panels.
- Filters.
- Time selectors.
- Selection and highlighting.

### 9.6 Shared geospatial types

Recommend appropriate TypeScript types for:

- Geographic coordinates.
- Bounding boxes.
- Observation identifiers.
- Observation timestamps.
- Imagery layer configuration.
- Feature metadata.
- Provider status.
- Geographic selection events.

Use existing types and schemas where possible. Avoid duplicating data contracts already defined in the application.

---

## 10. Step 6 — Define the four feature systems

For each feature system, document the existing implementation, target behavior, required dependencies, data flow, risks, and tests.

### 10.1 Feature system A: Realistic scientific Earth

Target capabilities:

- Interactive globe.
- Smooth camera rotation, pan, zoom, and tilt.
- Terrain elevation where configured.
- Appropriate Earth imagery.
- Atmospheric rendering.
- Lighting and optional day/night effects where supported.
- Global navigation and regional fly-to.
- Accurate geographic coordinate handling.
- Responsive canvas resizing.
- Graceful initialization and error states.

Separate baseline CesiumJS functionality from features that require external data or additional configuration.

Do not promise volumetric clouds, photorealistic terrain, or high-resolution imagery without identifying a viable data source and implementation approach.

### 10.2 Feature system B: Satellite imagery and layers

Target capabilities:

- A centralized layer registry.
- Named and categorized layers.
- Enable/disable controls.
- Opacity controls.
- Layer ordering.
- Loading and error indicators.
- Legends and units.
- Source attribution.
- Temporal controls where the data supports time selection.
- Provider-specific configuration.
- Suitable fallbacks.

Document how layers are created, updated, removed, and disposed of without recreating the entire globe.

### 10.3 Feature system C: Sentinel and environmental data

Target capabilities:

- Search for supported Sentinel-1 and Sentinel-2 products.
- Geographic or area-of-interest filtering.
- Date-range filtering.
- Acquisition metadata.
- Product footprints.
- Selected-scene details.
- Rendering supported imagery formats.
- Integration with existing environmental endpoints.
- Data provenance and source attribution.
- Clear distinctions between historical observations and current conditions.

Investigate whether the existing application already retrieves suitable imagery or only metadata.

Do not assume that a catalogue API automatically provides renderable raster imagery.

Document the processing or tile-service steps required when raw products cannot be rendered directly by CesiumJS.

### 10.4 Feature system D: Geographic interaction

Target capabilities:

- Click-to-coordinate.
- Geographic search.
- Camera fly-to.
- Coordinate input and validation.
- Marker selection.
- Observation inspection.
- Geographic filtering.
- Synchronization between the globe and dashboard.
- Selection clearing.
- Empty, loading, and error states.

Document the difference between picking the ellipsoid, picking terrain, and picking rendered objects. Determine which behavior each feature requires.

---

## 11. Step 7 — Define testing and quality gates

Inspect existing testing conventions and propose a testing strategy that fits the current project.

### 11.1 Unit tests

Plan tests for:

- Coordinate validation and conversion.
- Geographic bounding boxes.
- Layer configuration.
- Data transformations.
- Provider configuration.
- API response validation.
- Selection and filter state.
- Error-handling logic.

### 11.2 Component tests

Plan tests for:

- Globe loading state.
- Initialization errors.
- Layer controls.
- Layer visibility state.
- Observation selection.
- Coordinate output.
- Empty data.
- API failures.
- Component unmounting.

Use mocks for CesiumJS and browser-only APIs where appropriate. Do not require every component test to initialize a real WebGL context.

### 11.3 Integration and browser tests

Recommend appropriate browser-level validation for:

- Actual Cesium asset loading.
- Globe initialization.
- Camera interaction.
- Terrain and imagery providers.
- Geographic picking.
- Marker selection.
- Layer switching.
- Responsive resizing.
- Production build behavior.

Identify whether a browser automation framework already exists. If it does not, recommend whether one should be introduced in a later phase; do not install it now.

### 11.4 Regression requirements

Existing tests and API contracts must continue to work unless a change is explicitly approved.

Identify all tests that should be run before and after each migration phase.

---

## 12. Step 8 — Security, privacy, and licensing audit

Review the repository for security considerations relevant to the migration.

Inspect:

- Environment variable names and usage.
- Accidentally committed credentials.
- Client-side versus server-side secrets.
- Cesium ion token handling.
- Third-party imagery access.
- API route authentication.
- Input validation.
- URL and tile-source validation.
- Cross-origin behavior.
- Provider terms of use.
- Data licensing.
- Attribution requirements.
- Logging of sensitive information.
- Content Security Policy and related deployment settings.

Do not print secret values in the audit report.

If a possible secret is found, report its file location and the type of concern without exposing the value.

Do not rotate credentials or change security settings during this phase.

Explicitly distinguish public browser tokens intended for client-side use from private credentials that must remain server-side. Document the required restrictions and provider guidance for public tokens.

---

## 13. Step 9 — Performance and deployment assessment

Assess the existing project and the likely impact of CesiumJS.

### 13.1 Performance

Investigate:

- Current bundle-size constraints.
- Existing bundle-budget scripts.
- Texture sizes.
- Initial JavaScript payload.
- Dynamic-import opportunities.
- Cesium asset loading.
- WebGL resource usage.
- Marker counts.
- Imagery requests.
- Terrain requests.
- Browser memory usage.
- Mobile device support.

Recommend performance budgets where they can be justified by the existing project. Do not invent benchmark measurements that have not been collected.

### 13.2 Deployment

Inspect the actual deployment configuration.

Evaluate:

- Next.js build behavior.
- Static asset paths.
- Public Cesium asset availability.
- Worker loading.
- Environment variables.
- Provider credentials.
- Production URL configuration.
- Hosting constraints.
- Cache headers.
- Content Security Policy.
- Production error visibility.

Do not assume Vercel is the deployment target unless repository configuration or project documentation supports that conclusion.

---

## 14. Required deliverables

At the end of Phase 1, produce the following documentation.

Use `docs/architecture/` and `docs/prompts/` if they fit the existing project conventions. If those directories do not exist, recommend creating them as documentation-only additions.

### Deliverable A — Repository audit

File:

`docs/architecture/PHASE_1_REPOSITORY_AUDIT.md`

Include:

1. Executive summary.
2. Verified technology stack.
3. Repository structure.
4. Existing globe architecture.
5. Existing globe feature inventory.
6. Dashboard and state-management architecture.
7. API and data-provider inventory.
8. Texture and geospatial asset inventory.
9. Existing tests and baseline results.
10. Deployment and build configuration.
11. Confirmed technical debt.
12. Unknowns and unresolved questions.
13. Evidence references using repository-relative paths.

### Deliverable B — Feature preservation matrix

File:

`docs/architecture/FEATURE_PRESERVATION_MATRIX.md`

Create a table containing:

- Feature.
- Current implementation status.
- Evidence.
- Existing file or component.
- Data source.
- Dependencies.
- Target CesiumJS behavior.
- Migration strategy.
- Regression test.
- Priority.
- Risk.

Include every relevant existing feature found in the repository, not just the four high-level feature systems.

### Deliverable C — Target architecture

File:

`docs/architecture/CESIUM_TARGET_ARCHITECTURE.md`

Include:

- Architecture overview.
- Component responsibilities.
- Proposed module boundaries.
- Data-flow diagrams.
- State-management strategy.
- Cesium viewer lifecycle.
- Imagery and terrain provider abstractions.
- Observation-layer architecture.
- Geographic interaction contracts.
- Next.js integration strategy.
- Asset and worker configuration strategy.
- Error-handling strategy.
- Testing strategy.
- Security boundaries.

Use Mermaid diagrams where useful.

### Deliverable D — CesiumJS compatibility and provider assessment

File:

`docs/architecture/CESIUM_COMPATIBILITY_AND_PROVIDERS.md`

Include:

- Recommended CesiumJS version and evidence.
- Next.js integration requirements.
- Static asset and worker requirements.
- Browser-only rendering constraints.
- Terrain options.
- Imagery options.
- Sentinel data access options.
- Authentication requirements.
- Provider licensing and attribution.
- Performance implications.
- Known incompatibilities.
- Items that require a proof of concept.

Clearly label verified compatibility versus proposed or unverified compatibility.

### Deliverable E — Migration backlog

File:

`docs/architecture/CESIUM_MIGRATION_BACKLOG.md`

Break the remaining work into Phases 2–9.

For every phase, define:

- Objective.
- Scope.
- Prerequisites.
- Tasks and subtasks.
- Expected files or modules to change.
- Dependencies on previous phases.
- Risks.
- Testing requirements.
- Acceptance criteria.
- Explicit out-of-scope items.

Identify tasks that must happen before other tasks.

Do not duplicate entire phase prompts in the backlog. Provide enough detail to guide subsequent implementation prompts.

### Deliverable F — Phase 1 completion report

File:

`docs/architecture/PHASE_1_COMPLETION_REPORT.md`

Include:

- Audit summary.
- Commands executed.
- Results of each validation.
- Files inspected.
- Documentation files created.
- Pre-existing issues.
- Remaining unknowns.
- Implementation risks.
- Confirmation that no application code, dependencies, lockfiles, environment settings, or deployment configuration were modified.
- Recommended next step.

If any implementation-related file was accidentally modified, do not hide it. Report the exact change and stop further modifications.

---

## 15. Acceptance criteria for Phase 1

Phase 1 is complete only when all of the following are satisfied.

### Repository understanding

- [ ] The current branch and working tree have been recorded.
- [ ] The actual package manifest and lockfile have been inspected.
- [ ] The real globe entry point has been identified, or the inability to identify it is documented.
- [ ] The globe's rendering architecture has been mapped.
- [ ] Existing features have been inventoried with evidence.
- [ ] Dashboard state and data flow have been inspected.
- [ ] API routes and external providers have been inventoried.
- [ ] Existing tests and validation scripts have been evaluated.
- [ ] Deployment and Cesium asset requirements have been investigated.

### Migration design

- [ ] The CesiumJS integration strategy is documented.
- [ ] Next.js client-side rendering and asset requirements are documented.
- [ ] The viewer lifecycle and cleanup strategy are documented.
- [ ] Terrain and imagery provider options are assessed.
- [ ] Sentinel data access and rendering requirements are assessed.
- [ ] Existing Three.js functionality is classified for migration or retention.
- [ ] A feature-preservation matrix exists.
- [ ] A target architecture exists.
- [ ] The remaining phases have explicit acceptance criteria.
- [ ] Known risks and unresolved questions are documented.

### Safety and quality

- [ ] No dependency was installed or removed.
- [ ] No lockfile was modified.
- [ ] No application code was changed.
- [ ] No API behavior was changed.
- [ ] No environment or deployment configuration was changed.
- [ ] No user work was overwritten.
- [ ] Validation results are reported accurately.
- [ ] All claims are supported by evidence or explicitly labeled as assumptions.
- [ ] The next implementation phase has clear entry criteria.

A deliverable that cannot be completed because information is unavailable must document the blocker and the evidence needed to resolve it. Do not fabricate completion.

---

## 16. Execution workflow for OpenCode

Follow this sequence.

### Step A — Inspect

Read the repository documentation and inspect the working tree.

Do not modify files.

### Step B — Map

Trace the globe, dashboard, APIs, state management, assets, tests, and deployment configuration.

Produce concise working notes with exact paths.

### Step C — Verify

Run appropriate baseline checks where safe. Investigate version compatibility and provider requirements using available official documentation.

### Step D — Design

Produce the feature-preservation matrix, target architecture, compatibility assessment, and migration backlog.

### Step E — Report

Summarize what was discovered, list the documentation created, state the validation results, and identify the remaining uncertainties.

### Step F — Stop

Do not begin Phase 2 automatically.

Wait for explicit approval before installing CesiumJS or modifying application code.

---

## 17. Final response required from OpenCode

When finished, respond with:

1. A concise summary of the existing application architecture.
2. The actual file that currently renders the globe.
3. The most important existing features that must be preserved.
4. The recommended CesiumJS integration strategy.
5. Any critical technical or compatibility risks.
6. Baseline validation results.
7. Links or paths to all Phase 1 documentation deliverables.
8. A list of unresolved questions or blockers.
9. Confirmation of whether the working tree contains any changes beyond the approved documentation.
10. A clear recommendation on whether the project is ready to begin Phase 2.

**Do not start Phase 2 until the audit is complete and the user explicitly approves the next phase.**

---

## Definition of success

At the end of this phase, the project should have a trustworthy, repository-specific blueprint for replacing the existing Earth rendering engine with CesiumJS while preserving the existing application's useful capabilities.

The result must be an evidence-based plan, not a speculative rewrite.

**Begin with the repository audit. Do not install packages or modify application code.**