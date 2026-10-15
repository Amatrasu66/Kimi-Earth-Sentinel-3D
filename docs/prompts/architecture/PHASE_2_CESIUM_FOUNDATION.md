# Phase 2 — CesiumJS Foundation, Integration, and Gated Proof of Concept

**Project:** Kimi Earth Sentinel 3D  
**Phase:** 2 of 9  
**Execution agent:** OpenCode  
**Framework:** Next.js App Router, React 19, TypeScript  
**Runtime:** Node.js 24.x  
**Target engine:** CesiumJS  
**Implementation type:** Incremental application change with explicit acceptance gates  
**Primary objective:** Introduce CesiumJS as an optional fourth globe renderer and prove that it can operate safely within the existing application before beginning the full migration.

---

# 1. Mission

Implement a minimal, production-conscious CesiumJS proof of concept in the existing Kimi Earth Sentinel 3D repository.

The project already has a working application and three renderer branches. Phase 1 established that the current globe selector is:

`src/components/globe/EarthRenderer.tsx`

The default renderer path is:

`src/components/shell/GlobeStage.tsx` → `src/components/globe/dotted/DottedEarth.tsx`

Other renderer options include React Three Fiber/WebGL and TSL/WebGPU.

The application also has an existing `SentinelApp`, URL-driven state, SWR data fetching, eight hooks, 14 API routes, environmental data services, event and marker interactions, performance modes, and a bundle budget.

**Do not replace the application or migrate all of its globe functionality in this phase.**

Add CesiumJS as an isolated fourth renderer, selectable using:

`?renderer=cesium`

The existing renderer options must continue to function. The default renderer must remain unchanged.

The outcome must demonstrate that CesiumJS can initialize, display an interactive Earth, load its required assets, support basic geographic interaction, and clean up correctly without breaking the current application.

This is a gated proof of concept. Completing the implementation does not automatically authorize Phase 3.

---

# 2. Mandatory source-of-truth documents

Before editing code, read these Phase 1 deliverables:

- `docs/architecture/PHASE_1_REPOSITORY_AUDIT.md`
- `docs/architecture/FEATURE_PRESERVATION_MATRIX.md`
- `docs/architecture/CESIUM_TARGET_ARCHITECTURE.md`
- `docs/architecture/CESIUM_COMPATIBILITY_AND_PROVIDERS.md`
- `docs/architecture/CESIUM_MIGRATION_BACKLOG.md`
- `docs/architecture/PHASE_1_COMPLETION_REPORT.md`
- `docs/prompts/PHASE_1_REPOSITORY_AUDIT.md`, if present

Inspect the actual current source files rather than relying exclusively on the reports.

If a report conflicts with the checked-out code, the actual code and reproducible observations take precedence. Document the discrepancy.

At minimum, inspect:

- `package.json`
- The active package lockfile.
- `src/components/globe/EarthRenderer.tsx`
- `src/components/shell/GlobeStage.tsx`
- The relevant renderer implementations.
- `SentinelApp` and its renderer-selection logic.
- URL state parsing and serialization.
- Existing reduced-motion and low-power behavior.
- Current CSP and security headers.
- `next.config.*`
- `tsconfig.json`
- `scripts/bundle-budget.mjs`
- Existing tests for renderer selection and globe behavior.
- Existing renderer lazy-loading and SSR-disabled patterns.

Use the exact paths found in the repository. Do not assume every path or configuration detail from this prompt is unchanged.

---

# 3. Operating rules

## 3.1 Preserve the current application

The following are mandatory invariants.

1. The existing default renderer must remain the default.
2. Existing renderer URL parameters must retain their documented behavior.
3. The new `renderer=cesium` value must not break parsing or serialization of other URL state.
4. Existing search, layers, events, statistics, and dashboard interactions must remain intact.
5. Existing SWR hooks and data-fetching behavior must not be replaced.
6. Existing API routes, response envelopes, and `data_status` provenance semantics must not change.
7. Existing GIBS allow-list discipline must remain in force.
8. Server-only credentials must remain server-only.
9. Reduced-motion and low-power behavior must be preserved.
10. Existing WebGL and WebGPU renderer functionality must not be removed.
11. Existing texture and bundle-budget checks must remain meaningful.
12. Existing Three.js dependencies must not be removed in this phase.

Do not redesign the dashboard or change unrelated components.

## 3.2 Protect user work

Before making any change:

- Inspect `git status`.
- Record the current branch.
- Record the latest commit.
- Identify tracked modifications and untracked files.
- Identify the Phase 1 documents that are already present.
- Preserve every pre-existing user modification.

Do not reset, clean, stash, overwrite, stage, or commit user changes.

Do not run destructive Git commands.

Do not stage or commit files unless explicitly requested.

## 3.3 No speculative rewrites

Implement only the changes required for the Phase 2 PoC.

Do not:

- Rewrite the globe selector.
- Replace existing application state management.
- Replace SWR.
- Introduce a new global store.
- Replace all existing imagery.
- Implement a complete Sentinel catalogue client.
- Build a tile-processing backend.
- Implement a new dashboard.
- Remove existing renderers.
- Upgrade Next.js or React.
- Update unrelated dependencies.
- Disable security controls to make Cesium load.
- Add a large abstraction framework before it is needed.

Prefer small, reversible changes.

## 3.4 Verify rather than assume

Verify CesiumJS package compatibility, APIs, asset layout, provider behavior, and bundler requirements using official documentation and the actual installed package.

Do not blindly copy examples written for older CesiumJS versions.

If the proposed version or provider is incompatible, stop and report the evidence before selecting an alternative.

---

# 4. Step 1 — Establish the Phase 2 baseline

Before changing dependencies or source code, capture the current state.

## 4.1 Working tree baseline

Record:

- Branch.
- Latest commit.
- Modified files.
- Untracked files.
- Current package manager.
- Lockfile path.
- Existing Phase 1 artifacts.

Ensure that later changes can be distinguished from pre-existing modifications.

## 4.2 Run baseline validation

Use the scripts already defined by the repository.

Run, where dependencies and the environment permit:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run textures:report`
- `npm run bundle:check`

Record the results before making changes.

Phase 1 recorded a flaky accessibility test in `SentinelApp.a11y.test.tsx:302` and five jsdom/Radix `use-size` unhandled errors. Verify whether these remain present in the current checkout.

Do not automatically attribute every subsequent test failure to Phase 1. Compare the actual errors and identify whether the Cesium changes introduced any new failures.

Do not repair unrelated baseline failures during this phase.

If a baseline check cannot run, record the blocker and continue only when the affected implementation can be safely assessed.

---

# 5. Step 2 — Verify the CesiumJS package and provider strategy

Do not install the dependency until the compatibility checks have been completed.

## 5.1 Dependency verification

The Phase 1 recommendation was to evaluate a pinned `cesium@1.146` release.

Verify that this exact release is available and appropriate for the project before installing it.

Inspect:

- The package's published version.
- Its `engines` metadata.
- Its TypeScript declarations.
- Its browser runtime requirements.
- Its supported bundler configuration.
- Its static asset layout.
- Its official installation instructions.
- Any known Next.js or React integration constraints.

The project's runtime is Node.js 24.x. A package engine warning must be investigated, not ignored.

Distinguish a package installation warning from an actual runtime incompatibility. If compatibility cannot be established, document the issue and stop before making a speculative version change.

Use an exact version rather than a floating version range for the initial PoC. Keep the package manager's lockfile consistent with the manifest.

Do not introduce Resium in this phase unless the existing architecture provides a compelling, documented reason. Prefer the imperative CesiumJS Viewer API to minimize dependencies and simplify lifecycle management.

Do not introduce additional globe engines.

## 5.2 Verify the default imagery provider

The intended initial PoC should not require a Cesium ion access token.

Investigate whether the current NASA GIBS imagery source supports the required Cesium imagery interface using a documented WMTS configuration or a supported provider adapter.

Verify:

- The actual imagery endpoint.
- Tile matrix or matrix-set configuration.
- Geographic projection.
- Tile dimensions.
- Zoom-level constraints.
- Layer identifier.
- Time dimension, if required.
- Required attribution.
- Cross-origin behavior.
- Availability of the chosen imagery product.
- Whether the selected product is permitted for the intended use.

Use the existing GIBS allow-list discipline. Do not add arbitrary URL fetching or unrestricted user-supplied tile URLs.

Do not assume that every GIBS layer uses the same WMTS matrix set or is available at every zoom level.

Do not invent a WMTS URL or provider option. Confirm the exact configuration from the provider documentation.

If a suitable token-free GIBS layer cannot be verified, use a documented, legal, token-free fallback for the initial globe and record the deviation. Do not silently introduce a paid provider.

The default PoC must not require a paid Cesium ion account.

## 5.3 Terrain strategy

Start with Cesium's ellipsoid terrain.

Do not make a terrain API token mandatory for the initial PoC.

Terrain elevation, advanced global terrain, and 3D terrain providers are future capabilities unless they are essential to proving the initial renderer.

The application must not fail merely because optional terrain data is unavailable.

---

# 6. Step 3 — Install CesiumJS safely

After the compatibility and provider checks pass:

1. Install the verified CesiumJS version.
2. Update the correct lockfile.
3. Confirm the installed version.
4. Inspect the package's actual distribution structure.
5. Confirm TypeScript can resolve its types.
6. Confirm the existing application still type-checks before integrating the Viewer.
7. Record any package-engine warnings and their disposition.

Do not update unrelated dependencies.

Do not remove Three.js, React Three Fiber, Drei, or any existing rendering dependency.

Do not install Resium or a new global state library as part of the baseline PoC.

If installation fails or reveals an unresolved runtime compatibility problem, stop and report the issue rather than attempting a broad dependency upgrade.

---

# 7. Step 4 — Configure Cesium static assets and workers

Cesium requires static assets in addition to its JavaScript modules.

Create a repeatable asset-serving strategy that is compatible with the actual Next.js configuration.

## 7.1 Required investigation

Inspect the installed Cesium package and determine the actual location and contents of the directories required by that version.

Investigate the requirements for:

- `Workers`
- `ThirdParty`
- `Assets`
- `Widgets`
- `CESIUM_BASE_URL`
- Worker script resolution.
- Widget CSS.
- Production asset paths.
- Static file copying.
- Development server behavior.
- Build and deployment behavior.

Do not blindly assume a directory structure based on an older Cesium release.

## 7.2 Asset-copy strategy

If static asset copying is required, implement a deterministic script that:

- Copies from the installed package.
- Copies only the required documented asset directories.
- Uses the correct source and destination paths.
- Can be run repeatedly without creating duplicate nested directories.
- Fails with a clear error when the source package is missing.
- Reports what it copied.
- Does not modify source files.
- Does not depend on a globally installed package.
- Works in the repository's documented Node.js environment.

Prefer an existing asset-management convention if the project already has one.

If a script is added, document when it must run and how it participates in the build.

Avoid committing generated assets unless that is consistent with the repository's deployment strategy. Respect `.gitignore` and the actual host's build behavior.

## 7.3 Asset URL configuration

Configure the base URL using the mechanism supported by the installed CesiumJS version.

Ensure the base URL is established before Cesium code needs to resolve workers or assets.

Avoid a fragile sequence in which modules access browser globals before configuration is applied.

If the installed Cesium version requires a specific build-time replacement, plugin, or bundler configuration, verify that requirement and implement the smallest supported change.

## 7.4 Verify asset requests

In the browser, verify that required assets resolve successfully.

Inspect the network panel for:

- Worker scripts.
- Required Cesium assets.
- Widget resources.
- Imagery tiles.
- Failed requests.
- Incorrect relative paths.
- MIME-type errors.
- Cross-origin errors.
- Unexpected redirects.

A successful TypeScript build alone is not evidence that the asset pipeline works.

---

# 8. Step 5 — Add Cesium as a fourth renderer branch

## 8.1 Renderer-selection requirements

Modify `src/components/globe/EarthRenderer.tsx` only as much as necessary to add the Cesium renderer.

Preserve the existing selector structure and renderer-selection conventions.

The intended renderer values are:

- Existing default renderer.
- Existing WebGL renderer.
- Existing WebGPU renderer.
- New `cesium` renderer.

Use the actual existing renderer types and URL-state conventions found in the source code.

Do not rename existing query parameters or change their serialization.

Do not change the default renderer.

Do not allow an invalid renderer query value to crash the application.

If the existing URL-state contract supports normalization or fallback behavior, follow it.

## 8.2 Lazy-loading requirements

The Cesium branch must be loaded only when the Cesium renderer is selected.

Follow the repository's existing lazy-loading and `ssr: false` pattern.

Requirements:

- Cesium must not be imported eagerly into the default renderer path.
- Cesium must not be imported eagerly into the WebGL or WebGPU paths.
- The initial application route must not acquire the complete Cesium runtime simply because the code exists.
- The existing renderers must remain functional when Cesium is unavailable.
- A Cesium loading state must be displayed while the branch initializes.
- Initialization errors must be visible and recoverable.
- The user must be able to return to a supported existing renderer.

If dynamic import boundaries cause the Cesium library to enter an unexpected initial bundle, investigate and document the reason.

Do not claim that lazy loading is successful without examining the generated production build or bundle report.

## 8.3 Existing globe prop contract

The Cesium renderer must integrate through the existing globe component's prop contract wherever practical.

Inspect the actual prop types before implementing the adapter.

Preserve existing props related to:

- Geographic selection.
- Marker or event data.
- Search target.
- Fly-to behavior.
- Active layer state.
- Reduced motion.
- Low-power mode.
- Selection callbacks.
- Any existing renderer-specific options.

Do not invent new prop names that duplicate existing concepts.

If Cesium requires a different internal representation, create a small adapter at the renderer boundary.

Do not change the shared contract unnecessarily.

## 8.4 Renderer fallback

The application must remain usable if Cesium fails to initialize.

Implement a clear, controlled fallback path consistent with existing application behavior.

Do not silently change the URL to a different renderer unless the existing application already has an explicit normalization convention for failures.

The fallback must:

- Preserve the rest of the URL state.
- Explain that Cesium could not initialize.
- Offer a way to return to an existing renderer.
- Avoid an infinite retry loop.
- Avoid repeatedly constructing failed Viewer instances.
- Avoid hiding a real error behind a permanently empty canvas.

Record whether the fallback is automatic or user-initiated and justify the choice.

---

# 9. Step 6 — Implement the minimal Cesium Viewer

Create a dedicated Cesium renderer component in the repository's existing globe-component organization.

Use the path conventions discovered during the audit. Do not create a duplicate globe host if an existing abstraction is suitable.

The component must be a client-side component.

## 9.1 Initial Viewer configuration

The PoC must provide:

- A valid Cesium Viewer.
- A globe rendered within the existing application layout.
- Interactive camera controls.
- A visible Earth surface.
- An initial camera position showing the whole Earth.
- Lighting and atmosphere where supported.
- A token-free initial provider configuration.
- A visible loading state.
- A visible initialization error state.
- Responsive resizing.
- Correct teardown.

Disable unnecessary widgets to fit the existing dashboard design, while retaining a clear way to reset or navigate the globe if that capability already exists in the application.

Do not build the final dashboard UI in this phase.

## 9.2 Terrain

Use ellipsoid terrain for the initial PoC.

Do not add a required external terrain token.

Do not make terrain-provider failure a fatal application error when the ellipsoid remains usable.

## 9.3 Initial imagery

Use the verified token-free imagery configuration.

If the imagery provider fails, report the failure and provide the safest supported fallback.

Do not mask imagery errors by displaying a blank globe and claiming initialization succeeded.

Do not use an arbitrary imagery URL.

## 9.4 Visual scope

The initial renderer needs to establish a reliable Earth visualization, not the final scientific appearance.

Basic globe rendering, navigation, and lighting are in scope.

The following are not required for this phase:

- Custom cloud shaders.
- Advanced atmosphere shaders.
- Full satellite imagery catalogues.
- Custom elevation shading.
- Advanced temporal composites.
- Full environmental overlays.
- Advanced satellite footprints.
- Photorealistic volumetric clouds.
- A complete layer-management interface.

These belong in later phases.

---

# 10. Step 7 — Implement correct Viewer lifecycle management

Cesium's Viewer is an imperative object with its own WebGL resources and event handlers. React must not accidentally create multiple instances.

## 10.1 Initialization

Create the Viewer in the appropriate client-side lifecycle.

Requirements:

- Initialize only after the host DOM element exists.
- Avoid browser-only APIs during server rendering.
- Prevent duplicate Viewer instances.
- Prevent initialization from proceeding after the component has unmounted.
- Handle initialization errors.
- Ensure event handlers are registered only after the Viewer is available.
- Avoid stale React callbacks.

## 10.2 React Strict Mode

Test behavior under React Strict Mode.

The implementation must not leave an orphaned Viewer after React performs development-mode setup and cleanup cycles.

Do not disable Strict Mode to hide lifecycle bugs.

## 10.3 Cleanup

On unmount:

- Remove registered Cesium event handlers.
- Cancel or invalidate pending initialization where possible.
- Remove subscriptions or observers.
- Destroy the Viewer exactly once.
- Release any resources explicitly owned by the component.
- Clear stale references.
- Avoid updating React state after unmount.

Do not manually dispose of resources still owned by the Viewer in a way that conflicts with Cesium's own cleanup.

## 10.4 Resize handling

The globe must resize with its parent container.

Prefer Cesium's built-in resize behavior where suitable.

If a `ResizeObserver` or custom resize handler is necessary, clean it up reliably.

Test resizing the viewport and changing the containing layout.

## 10.5 Error handling

Distinguish at least:

- Package or module loading failure.
- Viewer initialization failure.
- Static asset failure.
- Imagery-provider failure.
- Interaction failure.
- Browser WebGL limitations.

Provide useful error messages without exposing secrets, internal tokens, or sensitive request information.

A recoverable imagery failure must not necessarily destroy a working Viewer.

---

# 11. Step 8 — Implement minimal geographic interaction

Phase 2 needs enough interaction to prove that Cesium can participate in the existing application contract.

Do not implement the complete geographic search system yet.

## 11.1 Click-to-coordinate

When the user clicks an appropriate location on the globe, obtain the geographic position.

Requirements:

- Use the installed Cesium version's documented picking APIs.
- Correctly convert radians to degrees when needed.
- Return latitude and longitude in the application's established coordinate format.
- Avoid returning invalid values when the click does not intersect the globe.
- Distinguish a globe-surface click from a click on an unrelated UI element.
- Do not allow the globe click handler to interfere with existing dashboard controls.

Use the existing selection callback if it represents the same action.

If the existing prop contract does not support a compatible event, document the smallest justified extension.

## 11.2 Geographic accuracy

Test known geographic positions.

Account for the fact that an ellipsoid pick differs from a terrain-surface pick.

Do not report terrain elevation as available when only the ellipsoid is configured.

Preserve the application's longitude convention and coordinate validation rules.

## 11.3 Interaction scope

The PoC must demonstrate basic coordinate selection and, where supported by the existing contract, basic navigation to a selected location.

Full marker migration, search-provider integration, geographic filtering, and observation inspection remain future work unless they are necessary to prove the existing prop contract.

Do not implement duplicate search or data fetching inside the Cesium component.

---

# 12. Step 9 — Preserve reduced-motion and low-power modes

The Phase 1 audit identified reduced-motion and low-power behavior as features that must be preserved.

Inspect their current implementation and map the relevant state to Cesium behavior.

## 12.1 Reduced motion

Respect the existing reduced-motion preference and application settings.

Where appropriate:

- Avoid unnecessary automatic camera flights.
- Avoid gratuitous animation.
- Use immediate camera changes when requested.
- Respect existing user-triggered navigation behavior.
- Do not introduce a permanently rotating globe.

Do not globally disable all interactive camera behavior simply because reduced motion is enabled.

## 12.2 Low-power mode

Determine how the existing low-power mode changes rendering behavior.

Apply equivalent supported Cesium settings where appropriate, such as reducing unnecessary render work or visual effects.

Do not invent unsupported Cesium options.

Do not degrade the entire application or alter other renderers to accommodate Cesium.

Document any difference between the existing renderers and the new Cesium implementation.

---

# 13. Step 10 — Configure CSP and external requests safely

The audit identified CSP and tile-host configuration as critical risks.

Inspect the current security-header implementation before making changes.

## 13.1 Least-privilege policy

Determine which additional resource types and hosts are actually required by the chosen Cesium configuration.

Investigate the need for:

- Worker script execution.
- Blob-backed workers, if required.
- Worker connections.
- Image and tile requests.
- Terrain requests.
- Static Cesium assets.
- Cross-origin requests.

Do not assume every CSP directive requires the same changes.

## 13.2 No blanket weakening

Do not:

- Disable CSP.
- Replace a restrictive policy with `*`.
- Add broad wildcards for all imagery providers.
- Add `unsafe-eval` without verified necessity and explicit justification.
- Add `unsafe-inline` as a blanket fix.
- Allow arbitrary user-provided tile URLs.
- Expose private credentials.
- weaken unrelated security headers.

Use the narrowest compatible policy.

If the installed Cesium version or selected provider requires a relaxation, document the exact requirement and why it is necessary.

If the policy cannot be updated safely in this phase, report the blocker rather than silently weakening it.

## 13.3 GIBS allow-list

Preserve the existing GIBS allow-list.

Any new GIBS configuration must use an explicitly approved source and supported layer configuration.

Do not bypass existing URL validation or source restrictions.

## 13.4 Verification

Test actual browser requests with the configured CSP.

Inspect console and network errors.

Confirm that blocked requests are either resolved through a justified minimal policy change or documented as blockers.

---

# 14. Step 11 — Protect the initial JavaScript budget

The existing production bundle check reported approximately 194.6 KiB against a 200 KiB initial-JavaScript budget.

This leaves very little room for a large globe library to enter the initial route.

## 14.1 Required architecture

Cesium must be lazy-loaded only when the user selects the Cesium renderer.

The initial renderer must not import the complete Cesium runtime through an unintended shared dependency.

Inspect the dependency graph and production bundle output.

## 14.2 Required measurements

Run the existing bundle-budget check before and after implementation.

Record:

- Initial JavaScript size before the change.
- Initial JavaScript size after the change.
- The exact measurement method.
- Any relevant shared-chunk changes.
- Cesium-specific lazy chunk size.
- Whether Cesium assets are included in the initial route.
- Whether the budget script counts only JavaScript or other resources.
- Whether the existing budget check passes.

Do not change the budget threshold to make the implementation pass.

Do not exclude Cesium from measurement in a way that hides an initial-bundle regression.

## 14.3 Acceptance rule

The existing 200 KiB initial-JavaScript budget must continue to pass without increasing its configured limit.

If the new Cesium code causes the initial bundle to exceed the budget:

1. Investigate import boundaries.
2. Check whether the dynamic branch is genuinely isolated.
3. Inspect the production build.
4. Correct the lazy-loading implementation if possible.
5. If the budget still fails, stop and report the evidence.

Do not begin later phases until the issue is resolved or the user explicitly approves a documented change in scope.

A large Cesium-specific lazy chunk is expected; a large Cesium dependency in the initial route is not.

---

# 15. Step 12 — Add automated tests

Add tests following the existing Vitest and Testing Library conventions.

Do not introduce a new testing framework.

Do not make every test depend on a real WebGL context.

## 15.1 Renderer-selection tests

Test that:

- The existing default remains the default.
- Existing WebGL selection still works.
- Existing WebGPU selection still works.
- `renderer=cesium` selects the Cesium branch.
- Invalid values follow the existing fallback rules.
- Other URL parameters are preserved.
- Cesium is not selected when its renderer parameter is absent.
- The URL-state contract remains stable.

Use the actual parameter names and conventions from the code.

## 15.2 Loading and error tests

Test:

- Cesium loading placeholder.
- Successful component mounting using appropriate mocks.
- Initialization failure.
- Missing or failed provider resources.
- Error display.
- Recovery or renderer fallback.
- No repeated infinite initialization.

## 15.3 Lifecycle tests

Using a mocked Viewer where appropriate, test:

- Viewer creation.
- Event-handler registration.
- Viewer destruction on unmount.
- Cleanup of subscriptions.
- Duplicate-initialization prevention.
- Stale callback prevention.
- Cleanup after initialization failure.
- React Strict Mode behavior.

Ensure the Viewer is not destroyed multiple times in a way that causes errors.

## 15.4 Coordinate tests

Test:

- Valid coordinate selection.
- Correct conversion to degrees.
- Latitude and longitude conventions.
- No callback for invalid or absent globe picks.
- Safe handling of missing intersection results.

Test the application's own coordinate contracts rather than reproducing Cesium internals unnecessarily.

## 15.5 Regression tests

Re-run relevant existing tests for:

- `EarthRenderer`.
- `GlobeStage`.
- `SentinelApp`.
- URL-state handling.
- Accessibility.
- Reduced motion.
- Low-power behavior.
- Layer controls.
- Search and event selection.

The Phase 1 flaky accessibility test must be tracked separately. Do not modify or delete it merely to obtain a passing result.

---

# 16. Step 13 — Perform a manual browser verification

A successful unit test is not enough to validate CesiumJS.

Run the application locally and manually verify the following.

## 16.1 Default application

- Open the application without a renderer query parameter.
- Confirm the original default renderer appears.
- Confirm the page does not download the Cesium runtime unnecessarily.
- Confirm existing search, events, layers, and statistics still behave as before.

## 16.2 Existing renderer branches

Open the existing WebGL and WebGPU renderer selections.

Verify that:

- Each renderer initializes as before.
- No Cesium initialization is triggered unnecessarily.
- URL state remains correct.
- Existing interactions still work.

If a WebGPU renderer cannot run on the current browser or hardware, document the environment limitation and verify its selection and fallback behavior separately.

## 16.3 Cesium branch

Open the application with:

`?renderer=cesium`

Verify:

- The Cesium Viewer appears.
- The Earth is visible.
- Camera rotation, pan, zoom, and tilt work.
- The initial camera position is reasonable.
- The selected imagery provider works.
- Required assets load successfully.
- No unexpected worker or CSP errors appear.
- Clicking the globe reports correct geographic coordinates.
- Resizing the browser preserves the globe.
- Switching away from Cesium cleans up its Viewer.
- Returning to Cesium creates exactly one working Viewer.
- Initialization errors are recoverable.
- Reduced-motion and low-power behavior remain appropriate.

Test with and without the relevant external provider available when feasible.

## 16.4 Production behavior

A development-only success is insufficient.

Run the production build and start the production application locally when feasible.

Verify that:

- Static Cesium assets are present.
- Worker URLs resolve correctly.
- Imagery loads.
- The initial bundle budget passes.
- No development-only asset path is required.
- The globe works through the actual production build.

Do not claim production readiness if the production behavior has not been tested.

---

# 17. Step 14 — Documentation changes

Update or create the following documents.

## 17.1 Phase 2 implementation report

Create:

`docs/architecture/PHASE_2_IMPLEMENTATION_REPORT.md`

Include:

- Summary of the implemented PoC.
- Files created.
- Files modified.
- Dependency and lockfile changes.
- Selected CesiumJS version and compatibility evidence.
- Imagery provider configuration and evidence.
- Asset-copy strategy.
- Worker configuration.
- CSP changes, if any.
- Renderer-selection changes.
- Lifecycle design.
- Geographic interaction behavior.
- Reduced-motion and low-power behavior.
- Test results.
- Bundle measurements before and after.
- Production build findings.
- Known limitations.
- Deviations from this prompt.
- Unresolved issues.

## 17.2 Phase 2 acceptance checklist

Create:

`docs/architecture/PHASE_2_ACCEPTANCE_CHECKLIST.md`

Include each acceptance criterion from this prompt and mark it:

- Passed.
- Failed.
- Blocked.
- Not run.

Include supporting evidence for each result.

## 17.3 Update the migration backlog

Update `docs/architecture/CESIUM_MIGRATION_BACKLOG.md` only where necessary to reflect verified PoC findings.

Do not rewrite the entire backlog.

Keep later-phase tasks separate from Phase 2.

---

# 18. Out of scope

The following features must not be implemented in Phase 2 unless a minimal subset is strictly necessary to validate the Cesium integration.

## Full scientific rendering

- Advanced terrain elevation.
- Custom cloud systems.
- Custom atmosphere shaders.
- Advanced lighting simulations.
- Full satellite footprint visualization.
- Full environmental data overlays.

## Satellite data systems

- Full Sentinel-1 catalogue integration.
- Full Sentinel-2 catalogue integration.
- STAC search implementation.
- Sentinel Hub processing pipelines.
- Backend raster tiling services.
- Full time-series imagery.
- NDVI or other derived scientific products.
- Automated ingestion pipelines.

## Geographic interaction

- Full geocoding integration.
- Complete observation inspection panels.
- Advanced coordinate search.
- Full event-marker migration.
- Advanced geographic filtering.
- Complex multi-selection tools.

## Application redesign

- Dashboard redesign.
- Global state-management replacement.
- API response schema changes.
- Replacing the existing default renderer.
- Removing the existing renderer branches.
- Replacing the entire application with Cesium-specific components.

These belong in subsequent phases.

---

# 19. Mandatory acceptance criteria

Phase 2 is complete only when the criteria below have been evaluated and the results reported honestly.

## A. Dependency and compatibility

- [ ] CesiumJS version is verified and pinned.
- [ ] Node.js 24 compatibility has been investigated.
- [ ] The dependency installs without unresolved compatibility blockers.
- [ ] The lockfile matches the package manifest.
- [ ] No unrelated dependency upgrades occurred.
- [ ] Three.js and existing rendering dependencies remain installed.

## B. Architecture and renderer selection

- [ ] Cesium is a fourth renderer branch.
- [ ] `?renderer=cesium` selects the new branch.
- [ ] The existing default renderer is unchanged.
- [ ] WebGL and WebGPU selections continue to work.
- [ ] Existing URL-state behavior is preserved.
- [ ] Cesium is lazy-loaded.
- [ ] Existing globe prop contracts are preserved or minimally adapted.
- [ ] A recoverable error/fallback path exists.

## C. Assets and Viewer

- [ ] The Viewer initializes in the client.
- [ ] Cesium static assets are served from the intended path.
- [ ] Worker loading works.
- [ ] Required widget CSS loads.
- [ ] The globe renders and supports camera interaction.
- [ ] Resize behavior works.
- [ ] Cleanup works.
- [ ] React Strict Mode does not leave duplicate Viewers.
- [ ] Initialization failures are handled visibly.

## D. Imagery and interaction

- [ ] A token-free initial imagery source has been verified.
- [ ] The default terrain does not require an external token.
- [ ] Provider failures are handled without silently claiming success.
- [ ] GIBS allow-list discipline is preserved.
- [ ] Geographic picking works.
- [ ] Coordinates follow the application's conventions.

## E. Existing functionality

- [ ] Existing renderer branches remain functional.
- [ ] Existing APIs are unchanged.
- [ ] Existing SWR behavior is unchanged.
- [ ] Existing data provenance behavior is unchanged.
- [ ] Reduced-motion behavior is respected.
- [ ] Low-power behavior is respected.
- [ ] Existing search, layers, events, and statistics continue to work.

## F. Security and performance

- [ ] CSP changes are minimal and justified.
- [ ] No private token is exposed.
- [ ] No unrestricted tile-source mechanism was introduced.
- [ ] The existing initial bundle budget remains unchanged.
- [ ] The existing bundle-budget check passes.
- [ ] Cesium-specific lazy chunks are measured.
- [ ] The production build does not require development-only asset paths.

## G. Testing and documentation

- [ ] Type checking has been evaluated.
- [ ] Linting has been evaluated.
- [ ] Tests have been evaluated.
- [ ] Production build has been evaluated.
- [ ] Texture reporting has been evaluated.
- [ ] Bundle-budget validation has been evaluated.
- [ ] Manual browser verification has been completed or blockers documented.
- [ ] Phase 2 implementation report exists.
- [ ] Phase 2 acceptance checklist exists.
- [ ] Deviations and unresolved issues are documented.

A blocked criterion must not be marked as passed.

---

# 20. Stop conditions

Stop implementation and report the blocker if any of the following occurs:

1. The selected CesiumJS version has an unresolved runtime compatibility issue.
2. The required static assets cannot be served reliably.
3. The new renderer cannot be isolated from the initial JavaScript bundle.
4. The existing 200 KiB initial-JavaScript budget is exceeded and cannot be restored without a design decision.
5. A CSP change would require unjustified broad weakening of the security policy.
6. The selected imagery provider cannot be configured using a verified, permitted source.
7. Existing URL-state or renderer behavior would need a breaking change.
8. Existing API contracts would need to change.
9. The Viewer cannot be cleaned up reliably.
10. The new renderer introduces significant unexplained regressions.
11. Required acceptance checks cannot be completed and no safe substitute verification exists.

When a stop condition occurs:

- Preserve all user work.
- Do not attempt a broad rewrite.
- Record the evidence.
- Identify the smallest possible resolution.
- Explain the impact on subsequent phases.
- Wait for user approval if a scope or architecture decision is required.

---

# 21. Required final response from OpenCode

When implementation and verification are complete, report:

1. Whether the Cesium PoC was implemented.
2. The exact CesiumJS version used.
3. The new renderer component and modified files.
4. The exact renderer URL to test.
5. How static assets and workers are served.
6. Which imagery source was configured and how it was verified.
7. Whether a Cesium ion token is required.
8. The Viewer lifecycle and cleanup strategy.
9. Whether coordinate picking works.
10. Whether CSP was modified.
11. Initial JavaScript bundle size before and after.
12. Cesium-specific lazy chunk measurements.
13. Typecheck, lint, test, build, texture, and bundle-budget results.
14. Manual browser and production-build verification results.
15. Existing test failures and whether any new failures were introduced.
16. All unresolved issues and deviations.
17. Paths to the Phase 2 report and acceptance checklist.
18. The current working-tree status.
19. A clear statement of whether Phase 3 acceptance gates have been satisfied.

Do not describe untested behavior as working.

Do not claim that satellite data is integrated merely because the globe displays a basemap.

Do not proceed to Phase 3 automatically.

---

# Definition of success

Phase 2 succeeds when Kimi Earth Sentinel 3D can load CesiumJS as an isolated fourth renderer, display a working Earth using a verified token-free configuration, support basic geographic interaction, clean up resources reliably, preserve the existing application's behavior, and pass the defined compatibility, security, and performance gates.

**Begin with the baseline audit. Verify compatibility before installing CesiumJS. Implement only the Phase 2 proof of concept. Stop after reporting the results and wait for explicit approval before starting Phase 3.**