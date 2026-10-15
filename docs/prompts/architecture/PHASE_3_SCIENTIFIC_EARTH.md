# Phase 3 — Scientific Earth Rendering and Geospatial Visualization

**Project:** Kimi Earth Sentinel 3D  
**Phase:** 3 of 9  
**Execution agent:** OpenCode  
**Framework:** Next.js App Router, React 19, TypeScript  
**Runtime:** Node.js 24.x  
**Globe engine:** CesiumJS 1.146.0, subject to verification against the installed package  
**Implementation type:** Gated, incremental enhancement of the existing Cesium renderer  
**Primary objective:** Upgrade the existing Cesium globe into a polished scientific Earth visualization with appropriate terrain, imagery, lighting, atmospheric rendering, geographic references, and camera controls.

---

# 1. Mission

Enhance the CesiumJS renderer introduced in Phase 2 of Kimi Earth Sentinel 3D.

The application already supports three original globe renderers and a fourth Cesium renderer selected using:

`?renderer=cesium`

The Cesium implementation is located in the existing globe component structure. Phase 2 added a dedicated `CesiumEarth.tsx`, Cesium configuration, static assets, coordinate picking, renderer selection, and tests.

Phase 3 must improve the scientific rendering quality and geographic usability of this Cesium renderer while preserving the application's existing architecture.

The intended outcome is an interactive scientific globe suitable for an Earth observation and environmental intelligence application.

The globe should provide:

1. A coherent, high-quality global Earth appearance.
2. Appropriate satellite or global imagery.
3. A documented terrain strategy with graceful fallback.
4. Improved lighting and atmospheric rendering.
5. Accurate geographic orientation and reference information.
6. Consistent camera navigation and useful geographic views.
7. Reliable interaction with the existing dashboard.
8. Performance-aware rendering.
9. Accessibility, reduced-motion, and low-power support.
10. Automated verification and documented acceptance criteria.

**This is a rendering and visualization phase, not a complete satellite data integration phase.**

Do not implement the Sentinel catalogue, raster processing services, complete imagery-layer manager, or new environmental ingestion pipelines here.

---

# 2. Mandatory Phase 2 acceptance gate

Before modifying any application code, read:

- `docs/architecture/PHASE_2_IMPLEMENTATION_REPORT.md`
- `docs/architecture/PHASE_2_ACCEPTANCE_CHECKLIST.md`
- `docs/architecture/CESIUM_TARGET_ARCHITECTURE.md`
- `docs/architecture/CESIUM_COMPATIBILITY_AND_PROVIDERS.md`
- `docs/architecture/FEATURE_PRESERVATION_MATRIX.md`
- `docs/architecture/CESIUM_MIGRATION_BACKLOG.md`
- `docs/architecture/PHASE_1_REPOSITORY_AUDIT.md`

Inspect the current implementation and verify that the report accurately describes the checked-out code.

## 2.1 Required Phase 2 gate

Phase 2 reported two blocked acceptance criteria:

- Real-browser verification of the Cesium renderer.
- Manual verification of the running browser application.

The Phase 3 implementation gate is not satisfied until those criteria are verified or explicitly resolved.

Before proceeding, determine whether a real browser environment is now available.

Suitable verification can use an existing browser automation setup or a real browser with developer tools. Use the repository's established conventions. Do not install a large new testing framework merely to bypass this gate.

The minimum required browser smoke test must demonstrate:

1. The application opens at `/?renderer=cesium`.
2. The Cesium Viewer initializes in a real browser.
3. The Earth is visibly rendered.
4. The selected imagery provider loads successfully.
5. Camera interaction works.
6. Static assets and worker requests succeed.
7. No fatal CSP, worker, or WebGL errors prevent rendering.
8. The globe resizes with its container.
9. Switching to another renderer and returning to Cesium does not create duplicate Viewers or break the page.
10. The default renderer remains functional.

Record the actual browser, environment, steps, and results.

A successful server-side HTTP response, mocked Viewer test, or production asset probe is useful supporting evidence but does not prove that the Earth renders correctly in a browser.

**If a real-browser verification environment is unavailable, stop before implementation.** Produce a concise blocker report identifying the exact remaining verification steps and the minimum environment needed. Do not mark the Phase 2 gate as passed.

If the gate passes, continue with the remainder of this prompt.

## 2.2 Approval requirement

The user must explicitly approve proceeding with Phase 3.

If approval is absent, do not edit application code.

If this prompt is being executed after explicit Phase 3 approval, continue once the browser gate is satisfied.

---

# 3. Repository and implementation baseline

The Phase 2 report identifies the following changes:

- `src/components/globe/CesiumEarth.tsx`
- `src/components/globe/cesiumConfig.ts`
- `src/components/globe/rendererMode.ts`
- `src/components/globe/EarthRenderer.tsx`
- `src/app/SentinelApp.tsx`
- `src/components/globe` tests.
- `src/types/cesium-assets.d.ts`, or the actual equivalent path.
- `scripts/copy-cesium-assets.mjs`
- `package.json`
- `package-lock.json`
- `.gitignore`

The exact paths must be verified against the current repository.

The reported configuration includes:

- CesiumJS pinned to `1.146.0`.
- Static assets copied to `public/cesium/`.
- `CESIUM_BASE_URL` configured for the Cesium runtime.
- A token-free initial globe configuration.
- NASA GIBS `MODIS_Terra_CorrectedReflectance_TrueColor` imagery using the verified EPSG:3857-compatible endpoint.
- Ellipsoid terrain.
- Coordinate picking and a dashboard coordinate readout.
- An unchanged existing 200 KiB initial-JavaScript budget.
- A reported initial bundle size of 200,381 bytes gzip, approximately 195.7 KiB.
- A reported Cesium lazy chunk of approximately 4.81 MB raw and 1.35 MB gzip.

Treat these as Phase 2 findings, not proof that the current checkout or deployment still behaves identically.

Re-run relevant checks and measure the actual current state before making changes.

---

# 4. Mandatory operating rules

## 4.1 Preserve existing behavior

The following are non-negotiable:

1. Keep the original default renderer.
2. Keep the existing WebGL renderer.
3. Keep the existing WebGPU renderer.
4. Keep Cesium selected through the existing `renderer=cesium` contract.
5. Preserve unrelated URL parameters.
6. Preserve existing API routes and response envelopes.
7. Preserve `data_status` provenance semantics.
8. Preserve existing SWR hooks and data-fetching behavior.
9. Preserve existing search, event, layer, and statistics behavior.
10. Preserve the existing GIBS allow-list.
11. Preserve server-only credential handling.
12. Preserve reduced-motion and low-power behavior.
13. Preserve the 200 KiB initial-JavaScript budget.
14. Preserve existing test and bundle-budget infrastructure.
15. Do not remove Three.js, React Three Fiber, or Drei in this phase.
16. Do not redesign the entire dashboard.
17. Do not implement future phases prematurely.

## 4.2 Protect the working tree

Before any edits:

- Record the current branch and commit.
- Inspect `git status`.
- Identify pre-existing changes.
- Identify untracked files.
- Preserve the existing Phase 1 and Phase 2 reports.
- Do not overwrite user work.
- Do not stage or commit changes.
- Do not run destructive Git commands.

Only modify files required by Phase 3.

## 4.3 Evidence-driven implementation

Verify CesiumJS APIs and provider configuration against the installed package and official documentation.

Do not copy outdated examples without checking compatibility.

Do not invent provider capabilities, imagery URLs, terrain endpoints, camera options, or shader behavior.

Clearly distinguish verified features from assumptions.

## 4.4 Minimal and reversible changes

Prefer changes to the existing Cesium renderer and small supporting modules.

Do not create a second globe engine or duplicate Viewer.

Do not introduce an unnecessary abstraction framework.

Do not add new dependencies unless they are justified, compatible, and explicitly documented.

---

# 5. Step 1 — Establish the current baseline

Run the existing project checks where practical:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run textures:report`
- `npm run bundle:check`

Record the command, result, and any failure.

Phase 1 reported a flaky accessibility test around `SentinelApp.a11y.test.tsx:302`, as well as jsdom/Radix `use-size` errors. Phase 2 reported that failure identity varied between runs.

Re-evaluate these failures in the current environment.

Do not automatically classify new errors as pre-existing.

Do not repair unrelated tests during this phase.

Record the current:

- Initial JavaScript size.
- Cesium lazy chunk sizes.
- Existing imagery configuration.
- Existing terrain configuration.
- Existing Viewer lifecycle.
- Current CSP configuration.
- Current renderer selection.
- Current coordinate-picking behavior.

Do not increase the bundle-budget threshold.

---

# 6. Step 2 — Define the target scientific appearance

Before changing rendering settings, inspect the current Cesium globe in a real browser.

Record the existing visual issues with evidence.

Examples of issues to investigate include:

- Globe imagery appearing too dark or washed out.
- Poor contrast between oceans and land.
- Incorrect initial camera framing.
- Unnecessary visual clutter.
- Inconsistent geographic orientation.
- Weak atmospheric appearance.
- Excessive or insufficient lighting.
- Low-resolution appearance at normal viewing distances.
- Camera movement that feels inconsistent with the application.
- Terrain that is visually misleading.
- Unnecessary rendering activity while idle.

Do not assume that every issue exists.

## 6.1 Visual design goals

The target should feel like a scientific Earth observation application, not a decorative space animation.

Use the following principles:

- Keep Earth geography legible.
- Maintain clear contrast between land and ocean.
- Use restrained atmospheric effects.
- Keep coordinate references subtle.
- Avoid excessive glow, bloom, and saturated effects.
- Preserve a neutral and scientifically useful visual baseline.
- Avoid automatically spinning the globe.
- Keep important geographic features visible at the default zoom.
- Use smooth, predictable camera transitions.
- Maintain a clear separation between the base Earth and future scientific overlays.

## 6.2 Scope boundaries

The following are not required for this phase:

- A complete dashboard redesign.
- A full imagery-layer manager.
- Full satellite catalogue search.
- Sentinel product rendering.
- Environmental marker migration.
- Time-series analysis.
- Custom volumetric cloud rendering.
- Advanced custom atmosphere shaders.
- Photorealistic 3D buildings.
- A full scientific visualization shader pipeline.

Prefer built-in Cesium capabilities before custom rendering code.

---

# 7. Step 3 — Improve the base Earth imagery

Inspect `src/components/globe/cesiumConfig.ts` and `src/components/globe/CesiumEarth.tsx` before changing the imagery configuration.

## 7.1 Existing imagery provider

The Phase 2 renderer uses a token-free NASA GIBS true-color MODIS layer through the EPSG:3857-compatible WMTS endpoint.

Verify that:

- The layer is still allow-listed.
- The layer identifier is correct.
- The WMTS endpoint is valid.
- The matrix set is compatible.
- The requested zoom levels are supported.
- The selected time dimension is valid.
- Attribution is correct.
- Cross-origin requests work.
- The provider is configured using the installed Cesium version's supported API.

Do not change to an incompatible geographic WMTS endpoint.

Do not remove the existing allow-list or permit arbitrary remote imagery sources.

## 7.2 Imagery quality

Evaluate the current global imagery at:

- Full-Earth view.
- Continental view.
- Regional view.
- Close geographic view.

Determine whether the current imagery supports the intended viewing levels.

If the existing MODIS product becomes visibly pixelated at close zoom, document that limitation.

Do not claim that a global MODIS basemap provides high-resolution local satellite imagery.

## 7.3 Provider configuration

Keep imagery configuration in a focused module rather than embedding provider URLs and layer options throughout the Viewer component.

The configuration should document:

- Provider name.
- Product identifier.
- Endpoint.
- Projection or matrix set.
- Time dimension.
- Attribution.
- Supported zoom range.
- Authentication requirements.
- Fallback behavior.

Use types and abstractions that fit the existing project. Do not build a full layer registry in Phase 3.

## 7.4 Time handling

The current imagery configuration uses a UTC-based `today` dimension.

Verify how that value is constructed and whether the selected GIBS product accepts it.

Handle date boundaries and provider responses correctly.

Do not label imagery as real-time or current satellite observation merely because the request uses today's date.

Document the product's actual temporal meaning and update availability where verified.

## 7.5 Fallback behavior

If imagery fails:

- Preserve the Viewer when possible.
- Report the failure.
- Avoid an indefinitely blank globe.
- Use a documented fallback only if it is permitted and compatible.
- Preserve attribution and licensing.
- Do not silently switch to an unverified or unauthorized provider.

Do not make a temporary provider outage a reason to destroy an otherwise working Viewer.

---

# 8. Step 4 — Evaluate and implement terrain

The Phase 2 implementation intentionally uses ellipsoid terrain.

Phase 3 must evaluate whether terrain elevation should be enabled and, if feasible, implement an appropriate terrain option.

## 8.1 Terrain provider assessment

Evaluate:

1. Ellipsoid terrain.
2. A suitable global terrain provider.
3. Cesium ion-hosted terrain.
4. Other supported providers with documented licensing and access requirements.

For each option, record:

- Data source.
- Geographic coverage.
- Resolution or level-of-detail characteristics.
- Authentication requirements.
- Licensing.
- Usage limits.
- Network dependencies.
- Expected performance impact.
- Offline or fallback behavior.

Do not assume that a terrain provider is free, unlimited, or available without authentication.

## 8.2 Default behavior

The base application must remain usable without a mandatory paid token.

If an appropriate token-free terrain provider is not verified, retain ellipsoid terrain as the default and document the available upgrade path.

Do not add an undocumented credential requirement.

## 8.3 Terrain implementation

If a suitable provider is approved and verified:

- Implement it through a focused configuration or provider abstraction.
- Handle asynchronous initialization.
- Handle network failure.
- Preserve the ellipsoid fallback.
- Avoid repeatedly replacing the terrain provider on React renders.
- Avoid duplicate terrain requests caused by unnecessary Viewer reinitialization.
- Preserve camera behavior.
- Validate geographic picking behavior with the selected terrain configuration.

## 8.4 Coordinate picking and elevation

The current PoC uses ellipsoid-based picking.

Determine whether the existing coordinate callback is used only for latitude and longitude or also assumes ellipsoid intersection.

If terrain is enabled, distinguish:

- Ellipsoid intersection.
- Terrain-surface intersection.
- Rendered feature picking.

Do not silently change the coordinate-picking contract.

If the application needs only latitude and longitude, preserve that behavior unless there is a verified reason to change it.

Do not report elevation unless a valid terrain or elevation source provides it.

---

# 9. Step 5 — Configure scientific lighting and atmosphere

Inspect the installed Cesium version's documented scene, globe, lighting, and sky-atmosphere capabilities.

Prefer built-in Cesium features before adding custom shaders.

## 9.1 Lighting

Evaluate the existing lighting configuration.

If supported and appropriate, configure:

- Globe lighting.
- A sensible sun-related illumination model.
- Clear land/ocean contrast.
- Stable appearance across camera orientations.
- A consistent initial visual state.

Avoid excessive darkening that makes continents unreadable.

Avoid a lighting configuration that creates a false impression of real-time Earth observation.

## 9.2 Atmosphere

Evaluate the existing sky-atmosphere settings.

If necessary, tune:

- Atmosphere visibility.
- Intensity and visual prominence.
- Ground-atmosphere interaction.
- Visual appearance near the horizon.
- Appearance when zooming in and out.

Use supported public APIs.

Do not modify private Cesium internals.

Do not introduce custom shader injection unless built-in capabilities demonstrably cannot meet a required visual goal and the user explicitly approves the additional complexity.

## 9.3 Clouds

Clouds are not a mandatory deliverable for Phase 3.

Do not add decorative cloud textures that imply live weather or current cloud conditions without an appropriate data source.

If cloud imagery is evaluated:

- Document its source.
- Verify licensing.
- Verify its time semantics.
- Distinguish static cloud imagery from current observations.
- Assess blending and visual artifacts.
- Measure rendering and network costs.

Do not add a cloud layer solely to make screenshots look more impressive.

## 9.4 Visual acceptance

Compare the original and improved renderer using consistent:

- Camera positions.
- Viewport sizes.
- Imagery sources.
- Browser settings.

Record concrete improvements and any trade-offs.

Do not claim photorealistic rendering without evidence.

---

# 10. Step 6 — Add a geographic reference grid

Evaluate adding an optional latitude/longitude reference grid to the Cesium globe.

The grid should improve geographic orientation without overwhelming the base imagery.

## 10.1 Requirements

If implemented, the grid must:

- Use accurate geographic coordinates.
- Follow the globe surface.
- Remain aligned with the Earth.
- Have a restrained visual style.
- Remain legible at appropriate zoom levels.
- Avoid excessive line density.
- Avoid obvious z-fighting.
- Avoid covering the globe with bright lines.
- Support visibility toggling.
- Be cleaned up correctly when the Viewer is destroyed.

## 10.2 Implementation options

Evaluate the most appropriate approach for the installed Cesium version.

Potential options include:

- Cesium-native graticule support where available.
- A supported geographic grid primitive.
- A small custom primitive or entity-based implementation.

Do not assume that a Three.js line-based graticule can be reused directly in Cesium.

Prefer native geographic primitives or an existing supported implementation.

Avoid creating thousands of independent entities if a more efficient approach is available.

## 10.3 Grid visibility

If a grid is added:

- Expose it as an optional feature.
- Keep the default appearance visually restrained.
- Integrate with existing UI conventions.
- Avoid introducing a second, competing layer-state system.
- Preserve reduced-motion and low-power behavior.

A full layer manager is out of scope. A small toggle or existing settings integration is sufficient.

If the grid cannot be implemented without disproportionate complexity or performance costs, document the reason and defer it.

---

# 11. Step 7 — Improve camera navigation

Inspect the current Cesium camera behavior and the application's existing navigation conventions.

## 11.1 Default camera

Choose an initial camera position that clearly displays the Earth and makes the global imagery legible.

The default must:

- Show the whole globe.
- Avoid starting inside the surface.
- Avoid a confusing polar or horizon view.
- Preserve the existing application layout.
- Work on desktop and smaller screens.

Do not change the default renderer or the existing URL-state contract.

## 11.2 Camera controls

Evaluate:

- Rotation.
- Zoom.
- Pan.
- Tilt.
- Look controls.
- Reset/home behavior.
- Camera limits.
- Camera sensitivity.
- Mouse-wheel behavior.
- Touch behavior.

Tune only where necessary.

Do not disable useful Cesium controls merely to imitate a different engine's interaction model.

Avoid camera settings that make the globe difficult to operate.

## 11.3 Camera presets

If useful and compatible with the existing application, provide a small set of camera destinations or presets, such as:

- Global overview.
- Regional view.
- A user-selected geographic location.

Do not add a large navigation toolbar or redesign the dashboard.

Use the existing coordinate or fly-to contracts where available.

## 11.4 Fly-to behavior

The Phase 2 report indicates that mocked fly-to tests exist.

Inspect the actual camera-navigation contract and preserve its behavior.

If the current application supports a selected search target, verify that the Cesium renderer can respond through the existing props.

Use documented camera APIs.

Respect reduced-motion preferences when choosing whether to animate a camera flight.

Do not introduce automatic rotation or unsolicited camera movement.

---

# 12. Step 8 — Preserve geographic correctness

Scientific visualization must not misrepresent geographic locations.

## 12.1 Orientation

Verify:

- North/south orientation.
- Longitude alignment.
- Prime meridian behavior.
- Latitude/longitude conversion.
- Camera framing.
- Marker alignment where existing marker support is relevant.

Do not change the application's coordinate conventions without documenting the reason and impact.

## 12.2 Geographic reference tests

Use known reference locations to validate the globe.

Include a small representative set of locations across different hemispheres and latitudes.

Verify that:

- Coordinates resolve to the expected geographic location.
- The camera flies to the intended destination.
- Picking returns valid longitude and latitude.
- Longitude normalization matches the application's contract.
- The selected imagery aligns with the geography.

Avoid treating a successful camera movement as proof that the underlying coordinates are accurate.

## 12.3 Terrain interaction

If terrain is enabled, verify whether existing coordinate picking still behaves correctly.

Document any difference between ellipsoid and terrain picking.

Do not claim terrain-level coordinate accuracy when the implementation only intersects the ellipsoid.

---

# 13. Step 9 — Respect performance modes

Phase 2 reported an initial JavaScript size of approximately 200,381 bytes gzip, within the unchanged 200 KiB budget.

The budget is a hard acceptance criterion.

## 13.1 Lazy loading

Cesium must remain isolated behind the existing lazy renderer branch.

Do not:

- Import Cesium into the default renderer path.
- Move the Viewer into the global application shell.
- Introduce a shared module that eagerly imports the Cesium runtime.
- Add heavy rendering dependencies to the initial bundle.

Verify the production bundle after changes.

## 13.2 Rendering work

Evaluate whether the globe needs to render continuously.

Inspect the installed Cesium version's documented render-loop options.

If an on-demand or reduced-rendering mode is considered:

- Verify support in the actual version.
- Ensure camera interactions still update the scene.
- Ensure imagery and terrain updates render correctly.
- Ensure time-dependent changes are not silently frozen.
- Test marker and layer changes where supported.
- Preserve correct Viewer lifecycle behavior.

Do not introduce a rendering optimization without testing its consequences.

## 13.3 Low-power mode

Map the existing low-power preference to appropriate Cesium behavior.

Potential areas to evaluate include:

- Resolution or device-pixel-ratio settings.
- Unnecessary effects.
- Render frequency.
- Optional grid visibility.
- Resource loading.

Use documented APIs and avoid introducing a large settings framework.

Do not claim that a setting improves performance without measurement or a justified technical explanation.

## 13.4 Reduced motion

Preserve reduced-motion behavior.

- Do not add automatic globe spinning.
- Avoid unsolicited camera flights.
- Use immediate camera changes where appropriate.
- Keep user-requested navigation available.
- Respect the existing preference and state contract.

## 13.5 Memory and resource management

Inspect for:

- Duplicate Viewer instances.
- Repeated provider initialization.
- Excessive entities.
- Repeated grid creation.
- Unreleased event handlers.
- Unnecessary imagery reloads.
- Unbounded animation loops.
- Repeated React-triggered Viewer recreation.

Ensure new visualization objects are removed or cleaned up through the correct Cesium lifecycle.

---

# 14. Step 10 — Accessibility and interface integration

Phase 3 should improve the globe itself without redesigning the full application.

## 14.1 Preserve existing controls

Inspect how the globe is embedded within the dashboard.

Preserve:

- Existing shell layout.
- Existing coordinate readout.
- Existing layer controls.
- Existing search and selection behavior.
- Existing error and loading conventions.

Do not create duplicate panels or a separate dashboard inside the Cesium component.

## 14.2 Keyboard and screen-reader behavior

Ensure:

- Any new grid toggle is accessible.
- Controls have meaningful accessible names.
- Focus indicators remain visible.
- Loading and error states are understandable.
- The canvas does not unexpectedly trap keyboard focus.
- Any new control follows existing Radix/UI conventions where appropriate.

Do not claim that the 3D globe is fully accessible to all users. Document practical limitations and available alternatives.

## 14.3 Responsive behavior

Test the globe at:

- A normal desktop viewport.
- A narrower tablet-like viewport.
- A mobile viewport where supported.

Verify that:

- The globe remains visible.
- The camera does not become unusable.
- The container resizes correctly.
- Controls do not overlap critical dashboard content.
- No horizontal overflow is introduced.
- Touch navigation remains practical.

Do not redesign unrelated application regions to accommodate the globe.

---

# 15. Step 11 — Security and provider discipline

Inspect the existing CSP, GIBS allow-list, and provider configuration.

## 15.1 Credentials

Do not add a mandatory Cesium ion token.

Do not expose private provider keys.

If an optional provider requires authentication:

- Document the requirement.
- Keep private credentials on the server.
- Use only provider-approved public-token patterns.
- Document restrictions for any client-visible token.
- Do not commit secrets.

## 15.2 Provider restrictions

Do not add arbitrary imagery or terrain URLs.

Do not bypass the existing GIBS allow-list.

Verify licensing and attribution for any new provider.

Do not add a new third-party dependency or remote service without a documented need.

## 15.3 CSP

Do not weaken CSP simply to make a visual feature work.

Phase 2 left the existing CSP unchanged.

If a new rendering feature introduces a resource requirement:

1. Identify the exact blocked request.
2. Identify the responsible directive.
3. Verify whether the request is required.
4. Determine the narrowest permitted fix.
5. Document the security implications.

If a broad policy change is necessary, stop and request approval.

---

# 16. Step 12 — Automated testing

Use the existing Vitest and Testing Library setup.

Do not introduce a new testing framework solely for Phase 3.

## 16.1 Configuration tests

Test any newly introduced:

- Terrain configuration.
- Imagery configuration.
- Grid visibility state.
- Camera preset configuration.
- Reduced-motion mapping.
- Low-power mapping.

Use deterministic test inputs.

## 16.2 Viewer integration tests

Where appropriate, test:

- Viewer initialization.
- Provider configuration.
- Terrain fallback.
- Imagery failure handling.
- Grid creation and removal.
- Camera navigation.
- Resize behavior.
- Resource cleanup.
- Initialization cancellation.

Mock Cesium where appropriate rather than requiring a real WebGL context for every test.

## 16.3 Geographic tests

Test:

- Known geographic destinations.
- Coordinate conversion.
- Coordinate validation.
- Longitude normalization.
- Selection behavior.
- Picking behavior where the current test architecture supports it.

Do not duplicate Cesium's own mathematical implementation unnecessarily.

## 16.4 Regression tests

Run relevant tests for:

- `EarthRenderer`.
- `CesiumEarth`.
- `rendererMode`.
- `SentinelApp`.
- URL state.
- Coordinate readout.
- Layer selection.
- Reduced motion.
- Low-power mode.
- Accessibility.

Do not remove flaky tests or weaken assertions to achieve a green test suite.

Record pre-existing and newly introduced failures separately.

---

# 17. Step 13 — Real-browser and production verification

A working build is not enough to establish that the globe is usable.

## 17.1 Real-browser tests

Use the available real browser or existing browser automation environment.

Verify:

- The Cesium branch loads.
- The globe is visible.
- Imagery loads correctly.
- The camera behaves as expected.
- Terrain works if enabled.
- Grid lines align correctly if implemented.
- The default camera view is appropriate.
- Geographic interaction remains correct.
- The globe resizes correctly.
- Renderer switching cleans up the Viewer.
- The default, WebGL, and WebGPU branches still work.
- No fatal browser console errors occur.

Record the browser, viewport, and actual results.

## 17.2 Production build

Run:

- Type checking.
- Linting.
- Unit tests.
- Production build.
- Texture report.
- Bundle-budget check.

Start the production application locally where feasible and verify that Cesium assets and imagery still work.

Inspect the network requests and generated bundle.

Do not rely exclusively on development mode.

## 17.3 Visual comparison

Record the same representative views before and after the change.

Use consistent:

- Viewport dimensions.
- Camera positions.
- Imagery source.
- Browser settings.

Document the improvements and any remaining limitations.

---

# 18. Required deliverables

## Deliverable A — Phase 3 implementation report

Create:

`docs/architecture/PHASE_3_IMPLEMENTATION_REPORT.md`

Include:

1. Executive summary.
2. Phase 2 gate results.
3. Files inspected.
4. Files changed.
5. Rendering improvements.
6. Imagery provider configuration.
7. Terrain assessment and implementation.
8. Lighting and atmosphere configuration.
9. Grid implementation, if any.
10. Camera-navigation changes.
11. Geographic correctness findings.
12. Reduced-motion and low-power behavior.
13. Accessibility and responsive behavior.
14. Security and CSP findings.
15. Performance measurements.
16. Test results.
17. Browser verification.
18. Production verification.
19. Known limitations.
20. Deviations from this prompt.
21. Remaining risks.

Clearly identify features that were evaluated but not implemented.

## Deliverable B — Phase 3 acceptance checklist

Create:

`docs/architecture/PHASE_3_ACCEPTANCE_CHECKLIST.md`

For every acceptance criterion, record:

- Passed.
- Failed.
- Blocked.
- Not run.

Include supporting evidence.

Do not mark blocked criteria as passed.

## Deliverable C — Backlog update

Update:

`docs/architecture/CESIUM_MIGRATION_BACKLOG.md`

Reflect the actual completion state of Phase 3 and any verified changes to later-phase dependencies.

Do not begin Phase 4 work.

---

# 19. Out of scope

Do not implement the following in Phase 3:

- Full satellite imagery layer manager.
- Full Sentinel-1 catalogue integration.
- Full Sentinel-2 catalogue integration.
- STAC search.
- Sentinel Hub processing workflows.
- Raster tile generation backend.
- NDVI or derived raster products.
- Environmental event ingestion changes.
- New API routes.
- New database.
- New scheduler.
- Complete geographic search redesign.
- Full observation inspector redesign.
- Replacement of existing renderer branches.
- Removal of Three.js dependencies.
- Full dashboard redesign.
- Advanced volumetric cloud rendering.
- Unverified paid terrain services.

These belong to later phases.

---

# 20. Acceptance criteria

Phase 3 is complete only when all required criteria have been evaluated.

## A. Phase gate and baseline

- [ ] Phase 2 documentation was reviewed.
- [ ] The real-browser Phase 2 gate was verified.
- [ ] User approval was established.
- [ ] Working-tree changes were preserved.
- [ ] Baseline validation results were recorded.

## B. Scientific rendering

- [ ] The existing Cesium renderer remains the same primary component.
- [ ] The Earth has a verified and appropriate imagery configuration.
- [ ] Imagery source and temporal limitations are documented.
- [ ] Lighting and atmosphere are configured appropriately.
- [ ] No unsupported rendering API is used.
- [ ] No misleading claims of live imagery are introduced.

## C. Terrain and geography

- [ ] Terrain options and trade-offs are documented.
- [ ] Ellipsoid fallback remains available.
- [ ] No mandatory paid token was introduced for the basic globe.
- [ ] Geographic orientation is verified.
- [ ] Coordinate-picking behavior remains correct.
- [ ] Camera navigation uses documented Cesium APIs.

## D. Geographic references

- [ ] The grid was implemented and tested, or its deferral was documented.
- [ ] Any grid is aligned with the Earth.
- [ ] The grid does not introduce excessive visual clutter.
- [ ] New controls follow accessibility conventions.

## E. Performance and lifecycle

- [ ] Cesium remains lazy-loaded.
- [ ] The 200 KiB initial-JavaScript budget passes unchanged.
- [ ] Resource cleanup remains correct.
- [ ] Resize behavior works.
- [ ] Reduced-motion behavior is preserved.
- [ ] Low-power behavior is preserved.
- [ ] No unnecessary continuous-rendering loop was introduced.

## F. Regression and security

- [ ] The default renderer remains unchanged.
- [ ] WebGL and WebGPU branches still work.
- [ ] Existing URL-state behavior is preserved.
- [ ] Existing APIs and data provenance are unchanged.
- [ ] GIBS allow-list discipline is preserved.
- [ ] No private credentials are exposed.
- [ ] CSP was not weakened without justification.
- [ ] Relevant tests pass or failures are documented.

## G. Production readiness

- [ ] Type checking was evaluated.
- [ ] Linting was evaluated.
- [ ] Unit tests were evaluated.
- [ ] Production build was evaluated.
- [ ] Texture report was evaluated.
- [ ] Bundle-budget check passed.
- [ ] Real-browser rendering was verified.
- [ ] Production asset behavior was verified where feasible.
- [ ] Implementation report exists.
- [ ] Acceptance checklist exists.
- [ ] Migration backlog reflects the actual state.

---

# 21. Stop conditions

Stop and report the blocker if:

1. The Phase 2 real-browser gate is still unresolved.
2. User approval for Phase 3 is missing.
3. The installed Cesium APIs differ materially from the assumptions in this prompt.
4. A provider cannot be verified.
5. A new terrain provider requires an unapproved credential or cost.
6. The rendering changes break geographic correctness.
7. The initial bundle exceeds the existing budget.
8. The Viewer lifecycle becomes unreliable.
9. CSP must be weakened broadly.
10. Existing renderer behavior regresses.
11. A required browser test cannot be performed.
12. The implementation requires an unapproved architectural change.

When a stop condition occurs:

- Preserve the working tree.
- Do not bypass the gate.
- Do not expand scope.
- Record the evidence.
- Identify the smallest safe resolution.
- Wait for user approval when required.

---

# 22. Final response from OpenCode

When Phase 3 is complete, report:

1. Whether the Phase 2 gate passed.
2. Whether implementation was authorized.
3. The exact files modified.
4. The imagery source and its limitations.
5. Whether terrain elevation was enabled.
6. Lighting and atmosphere changes.
7. Whether a geographic grid was added.
8. Camera and navigation improvements.
9. Geographic correctness test results.
10. Reduced-motion and low-power verification.
11. Initial JavaScript size before and after.
12. Cesium lazy-chunk measurements.
13. Typecheck, lint, test, build, texture, and bundle results.
14. Real-browser verification results.
15. Production verification results.
16. Existing and newly introduced test failures.
17. Security and CSP changes.
18. Remaining limitations.
19. Paths to the implementation report and acceptance checklist.
20. Current Git working-tree status.
21. A clear statement of whether Phase 3 acceptance criteria have been satisfied.

Do not claim a visual feature works without verifying it.

Do not claim that Sentinel data is integrated simply because the globe displays imagery.

Do not proceed to Phase 4 automatically.

---

# Definition of success

Phase 3 succeeds when the existing Cesium renderer presents a scientifically useful, visually coherent Earth with verified imagery, appropriate lighting, reliable geographic navigation, and optional terrain/reference features where justified.

The result must preserve the existing application architecture, performance budget, URL-state contract, security boundaries, and original renderer branches.

**First verify the Phase 2 browser gate and user approval. If either is missing, stop. Otherwise, implement only Phase 3, document the evidence, and wait for explicit approval before beginning Phase 4.**