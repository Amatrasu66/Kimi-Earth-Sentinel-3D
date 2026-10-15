# Phase 4 — Imagery & Layer Manager

**Project:** Kimi Earth Sentinel 3D  
**Repository:** `https://github.com/Amatrasu66/Kimi-Earth-Sentinel-3D`  
**Phase:** 4  
**Status:** Authorized to begin after verifying the Phase 3 acceptance gate  
**Primary implementation target:** Cesium imagery and scientific layer management  
**Execution agent:** OpenCode  
**Required output:** Tested implementation, architecture documentation, acceptance checklist, and migration backlog update

---

## 1. Mission

Implement Phase 4 of Kimi Earth Sentinel 3D: a robust, extensible imagery and scientific layer manager integrated with the existing globe application.

The feature must allow users to manage supported imagery and overlays through a clear, accessible interface without compromising the existing renderer architecture, geographic correctness, application state, security posture, performance budget, or current functionality.

This is an incremental enhancement of the existing application—not a rewrite.

**The objective is to establish a dependable foundation for scientific visualization.** Do not add a new data-processing platform, invent data providers, or represent unavailable imagery as if it exists.

Work only on Phase 4. Do not begin Phase 5.

## 2. Mandatory authorization and preflight gates

Before modifying source code, inspect the current repository and verify all conditions below.

### 2.1 Verify Phase 3 acceptance

Read and cross-check:

- `docs/architecture/PHASE_1_REPOSITORY_AUDIT.md`
- `docs/architecture/FEATURE_PRESERVATION_MATRIX.md`
- `docs/architecture/CESIUM_TARGET_ARCHITECTURE.md`
- `docs/architecture/CESIUM_COMPATIBILITY_AND_PROVIDERS.md`
- `docs/architecture/CESIUM_MIGRATION_BACKLOG.md`
- `docs/architecture/PHASE_2_IMPLEMENTATION_REPORT.md`
- `docs/architecture/PHASE_2_ACCEPTANCE_CHECKLIST.md`
- `docs/architecture/PHASE_3_IMPLEMENTATION_REPORT.md`
- `docs/architecture/PHASE_3_ACCEPTANCE_CHECKLIST.md`
- Any existing Phase 4 prompt, provider documentation, or smoke-test documentation.

Confirm that Phase 3 is recorded as complete and that the acceptance checklist supports that conclusion.

Verify the Phase 2 browser-smoke gate is documented as passed, including production-server execution, imagery tile responses, a single Cesium Viewer after lifecycle round-trips, renderer preservation, and zero browser exceptions.

If a required report or checklist is missing, contradictory, or does not support the claimed result, stop and report the discrepancy before implementation.

### 2.2 Verify the actual working tree

Inspect:

- Current branch and commit.
- `git status --short`.
- All modified and untracked files.
- Current package scripts and lockfile.
- Current Cesium configuration and layer implementation.
- Current renderer selection and URL-state implementation.
- Existing tests and browser-smoke harness.

The latest Phase 3 report records the working tree at commit `1ba31d5`, with 14 modified files and 5 untracked files. This is historical context, not a guarantee that the current repository has the same state.

**Never assume that uncommitted work belongs to this phase.**

Do not run destructive cleanup, reset the branch, discard changes, overwrite existing files blindly, or delete untracked files. Preserve all existing work. Do not stage or commit changes unless explicitly requested.

### 2.3 Establish a fresh baseline

Use the scripts actually defined in the repository. Determine which baseline checks pass and record existing failures before making changes.

At minimum, identify the commands for:

- TypeScript type checking.
- Linting.
- Relevant unit and integration tests.
- Full test suite.
- Production build.
- Texture or asset checks.
- Initial JavaScript bundle budget.
- Browser smoke tests against a production server.

Do not assume historical results are current results.

If a mandatory gate cannot be run, document why. Never describe an unexecuted check as passed.

### 2.4 Stop conditions

Do not begin Phase 4 implementation if:

- The Phase 3 acceptance gate cannot be verified.
- Existing changes appear to be missing or damaged.
- A required baseline cannot be established and its absence prevents safe implementation.
- The requested scope would require violating a preservation or security constraint.

Report the exact blocker and wait for direction.

---

## 3. Product requirements

Implement a layer-management experience that supports the imagery and overlay capabilities genuinely available in the application.

The interface and implementation should provide the following, where supported by the existing provider and renderer architecture:

1. A clear indication of the active base imagery.
2. Selection among verified, supported base imagery sources.
3. Visibility toggles for supported overlays.
4. Opacity controls for imagery layers that support opacity.
5. Layer ordering where the underlying renderer supports meaningful ordering.
6. Clear loading, unavailable, and error states.
7. Attribution and provider information where required.
8. Predictable persistence of user selections.
9. Correct synchronization with the application's existing URL-state conventions.
10. Accessible controls and keyboard navigation.
11. Safe cleanup when layers are replaced, hidden, or the Cesium Viewer is destroyed.
12. A structure that makes future providers easier to add without coupling the UI to Cesium internals.

Do not expose controls for capabilities that are not implemented.

If a feature is unsupported by the current provider or renderer, either omit it or disable it with a clear explanation. Do not provide controls that appear functional but silently do nothing.

## 4. Preserve the existing architecture

The application currently has multiple renderer paths. Preserve them.

### 4.1 Renderer behavior

Keep the existing renderer selector in `src/components/globe/EarthRenderer.tsx` and the existing renderer branches intact.

Preserve:

- Default dotted Earth rendering.
- WebGL rendering.
- WebGPU rendering.
- Cesium rendering through the existing renderer query parameter.
- Existing fallback and error behavior.
- Lazy loading of the Cesium engine.

The layer manager must not cause Cesium to load on the default dotted renderer path.

Do not make Cesium the default renderer as part of this phase.

### 4.2 Application and data layer

Preserve existing:

- API routes and response envelopes.
- SWR hooks and caching behavior.
- Search, events, statistics, and existing markers.
- Marker hover, click, and fly-to behavior.
- Geographic coordinate validation and picking contracts.
- `data_status` provenance and honesty.
- Reduced-motion and low-power behavior.
- Existing settings and modal conventions.
- Existing URL-state behavior.
- Existing feature-preservation requirements.

Do not move server-only keys into client code. Do not create a second application state system for layer selection if the current state architecture can be extended safely.

### 4.3 Relevant files

Inspect the actual current implementation before editing. Likely relevant files include:

- `src/components/globe/EarthRenderer.tsx`
- `src/components/globe/CesiumEarth.tsx`
- `src/components/globe/cesiumConfig.ts`
- `src/components/shell/GlobeStage.tsx`
- `src/components/globe/dotted/DottedEarth.tsx`
- `src/app/SentinelApp.tsx`
- `src/components/.../SettingsModal.tsx`, or its current equivalent
- Existing URL-state modules.
- Existing layer configuration, data hooks, and tests.
- `scripts/browser-smoke.mjs`
- `package.json`

These are inspection targets, not a mandate to create duplicate modules. Follow the actual repository structure.

---

## 5. Define a typed layer model

Create or extend a typed layer model that separates serializable application metadata from live rendering objects.

The exact structure must fit the repository's conventions, but it should represent concepts such as:

- Stable layer identifier.
- Human-readable name.
- Description.
- Layer category.
- Layer role: base imagery or overlay.
- Provider identifier.
- Availability or support status.
- Default visibility.
- Default opacity, if applicable.
- Whether opacity is configurable.
- Whether ordering is configurable.
- Attribution and source metadata.
- Temporal coverage or timestamp semantics, where relevant.
- Known limitations.
- Any provider-specific options that can be safely represented as configuration.

A conceptual example:

```ts
type LayerRole = "base" | "overlay";

interface LayerDescriptor {
  id: string;
  name: string;
  description: string;
  role: LayerRole;
  providerId: string;
  defaultVisible: boolean;
  defaultOpacity?: number;
  supportsOpacity: boolean;
  supportsReordering: boolean;
  attribution?: string;
}
```

This is illustrative, not a requirement to copy the interface verbatim. Adapt it to the existing type system and avoid redundant or contradictory properties.

### 5.1 Separate metadata from runtime objects

The layer registry must not store live Cesium objects in serializable URL-state or persistent user preferences.

Keep these concerns separate:

- **Registry:** serializable descriptions of supported layers.
- **User state:** selected base layer, overlay visibility, opacity, and supported ordering.
- **Provider implementation:** code that creates or configures a layer.
- **Runtime state:** Cesium imagery-layer instances and their lifecycle.
- **UI:** controls that read and update application state.

Do not serialize a `Cesium.Viewer`, `ImageryLayer`, provider instance, DOM element, or other live object.

### 5.2 Stable identifiers

Layer IDs must be stable, unique, and suitable for URL-state persistence.

Do not use array indices, translated labels, generated random IDs, or provider URLs as the sole identity of a layer.

Changing a display name must not break previously stored user preferences.

### 5.3 Runtime validation

Validate user-controlled layer IDs and numeric settings against the supported registry.

Opacity must be finite and clamped or rejected according to the application's established validation conventions. Its effective range must be 0 through 1.

Do not trust query parameters or local storage to contain valid values.

---

## 6. Provider architecture

Implement a small, practical provider abstraction that fits the existing codebase.

Avoid unnecessary frameworks or elaborate plugin systems.

The architecture should make it possible to create a layer from a verified provider configuration without allowing the UI to depend on provider-specific internals.

A suitable design may include:

- A provider registry.
- A factory or adapter for supported imagery providers.
- A function that resolves a layer descriptor to a runtime imagery provider.
- Centralized validation of supported provider options.
- A clear separation between provider creation and attachment to the Cesium Viewer.

Choose the simplest architecture that meets the requirements.

### 6.1 Verify every provider

Before adding or exposing a provider, verify:

- The endpoint exists and is compatible with the configured protocol.
- Its coordinate reference system and tiling scheme are correct.
- Its supported zoom levels and coverage are understood.
- Authentication requirements are known.
- Attribution and licensing requirements are documented.
- Its temporal behavior is documented.
- Its CORS and browser compatibility are appropriate.
- Its behavior is consistent with the application's security requirements.

Do not infer that a URL is valid because its domain exists.

Do not invent layer names, endpoints, provider capabilities, time coverage, or authentication behavior.

### 6.2 Existing NASA GIBS provider

Preserve the verified base imagery provider:

- NASA GIBS.
- `MODIS_Terra_CorrectedReflectance_TrueColor`.
- EPSG:3857-compatible WMTS configuration.
- JPEG imagery.
- Token-free access, as verified in the current implementation.
- Existing `GoogleMapsCompatible_Level9` matrix-set configuration, if it remains correct in the current code.
- Existing time-selection semantics.

Reinspect the current provider descriptor rather than duplicating its configuration.

Do not change a verified endpoint merely to make it resemble another WMTS implementation.

Do not add a second provider configuration that drifts from the existing one.

### 6.3 Be honest about temporal semantics

The existing imagery's `today` setting refers to the configured mosaic availability date, not live observation of the Earth.

The interface and documentation must not call it:

- Live satellite imagery.
- Real-time Earth.
- Current conditions everywhere.
- A guaranteed same-day observation.

If displaying a timestamp or date, describe what it means and where it comes from. Do not imply a timestamp represents the exact acquisition time of every pixel unless the provider documents that behavior.

### 6.4 Unsupported imagery sources

Do not introduce an unverified global terrain provider or a provider requiring a token that is forbidden by the project's current constraints.

Do not add undocumented commercial services, hard-coded secrets, browser-exposed private credentials, or unaudited remote dependencies.

If a candidate provider is unavailable, requires credentials, has incompatible tiling, or cannot be verified, document it as a future integration rather than presenting it as an operational option.

---

## 7. Base imagery selection

Implement a clear control for selecting the active base imagery.

Requirements:

1. Display the selected base layer clearly.
2. Show only verified and supported choices.
3. Validate a requested selection against the registry.
4. Keep exactly one active base imagery selection unless the existing architecture explicitly supports another model.
5. Avoid a blank globe during ordinary base-layer transitions.
6. Handle provider construction failures without corrupting the active selection.
7. Preserve the previous working base layer if a replacement cannot be initialized safely.
8. Ensure old layers and event handlers are cleaned up correctly.
9. Avoid duplicating the imagery provider on repeated selections.
10. Keep the base imagery separate from independent overlays.

If only one base imagery source is currently verified, do not fabricate additional choices. Build the selection architecture so that another verified source can be added later, and make the UI accurately represent the sources currently available.

If a transition temporarily creates two imagery layers, ensure the old layer is removed when the replacement is ready. Do not leak layers after repeated switches.

### 7.1 Failure behavior

When the selected provider fails:

- Preserve an existing working layer where possible.
- Show a meaningful error or unavailable state.
- Keep the user able to recover or return to a supported selection.
- Avoid automatic infinite retry loops.
- Do not misrepresent stale imagery as fresh imagery.

Use the existing error-reporting conventions.

---

## 8. Overlay visibility controls

Implement overlay controls only for overlays that genuinely exist and have verified implementations.

Each supported overlay should have:

- A stable ID.
- A human-readable label.
- A concise description.
- A visibility toggle.
- An optional opacity control if supported.
- Attribution and source information when required.
- A clear indication of whether the layer is available.

### 8.1 No placeholder functionality

Do not create switches for hypothetical layers such as NDVI, wildfire hotspots, atmospheric pollution, precipitation, or Sentinel-2 imagery unless an operational implementation already exists or is explicitly within the verified scope of this phase.

Do not label an empty provider, placeholder object, or simulated data source as an active scientific layer.

If the only additional overlay available is the existing geographic grid, it may be integrated into the layer-management experience if that does not break its established Settings control and persistence behavior.

### 8.2 Independent visibility

Visibility state must be independent for each overlay where the provider supports it.

Changing overlay visibility must not unexpectedly:

- Replace the base imagery.
- Reset the camera.
- Change the selected renderer.
- Remove markers.
- Clear URL-state.
- Trigger unrelated API requests.
- Reinitialize the entire Cesium Viewer.

### 8.3 Layer ordering

Implement user-controlled layer ordering only if it has meaningful, supported behavior.

Verify the Cesium imagery-layer ordering semantics and ensure the chosen ordering convention is intuitive and documented.

Do not expose drag-and-drop ordering simply because it is a familiar UI pattern. If there is no meaningful ordering choice, omit the control until the feature is supported.

Where ordering is supported:

- Keep base imagery in its intended role.
- Keep overlay ordering deterministic.
- Avoid unstable array-index identities.
- Persist ordering only for known layer IDs.
- Test reorder operations and cleanup.

---

## 9. Opacity behavior

Where a layer supports opacity, provide an accessible control with a valid 0–1 value.

The UI may display this as a 0–100% value if that matches existing design conventions.

Requirements:

- Enforce valid numeric values.
- Update the correct runtime imagery layer.
- Keep application state and rendered opacity synchronized.
- Restore persisted opacity safely.
- Avoid recreating the provider for every slider movement unless technically necessary.
- Avoid expensive React renders or viewer reinitialization during continuous adjustment.
- Ensure the selected opacity applies to the correct layer.
- Restore a documented default when the user resets a layer.
- Ensure a failed layer does not leave orphaned runtime state.

Do not apply opacity to the base imagery when the user intended to adjust an overlay.

Test opacity at minimum, maximum, default, and representative intermediate values.

---

## 10. URL-state and persistence

Integrate layer selection with the existing state architecture.

Inspect the current URL-state implementation before deciding how to represent layer state. Do not create a competing URL-state mechanism.

### 10.1 State to consider

Persist only settings that are meaningful, safe, and useful to restore, such as:

- Selected base layer ID.
- Visibility of supported overlays.
- Opacity for supported layers.
- Layer order where supported.
- Existing grid visibility, using its established persistence behavior unless there is a justified migration.

Use the application's current conventions for URL parameters, defaults, serialization, and restoration.

Do not introduce duplicate parameters representing the same state.

### 10.2 Backward compatibility

Existing URLs must continue to work.

A URL without layer parameters must preserve the established default behavior.

Unknown or removed layer IDs must not crash the application. Fall back safely according to the existing URL-state conventions.

Invalid opacity values, malformed ordering values, and duplicate or unknown IDs must be normalized or rejected.

Do not allow malformed URL-state to trigger arbitrary network requests.

### 10.3 Avoid URL churn

Dragging a slider must not cause excessive history entries or disruptive navigation.

Follow the application's existing distinction between history pushes, replacements, and transient local interaction.

Do not overwrite unrelated query parameters.

Preserve renderer selection, geographic state, search state, and other supported URL-state fields.

### 10.4 Local persistence

If local storage is used, preserve existing defaults and behavior.

For any newly introduced persistent preference:

- Validate the value before using it.
- Handle unavailable or malformed storage safely.
- Avoid reading browser-only storage during server rendering.
- Avoid hydration mismatches.
- Keep the default state deterministic.
- Document precedence between URL parameters and local preferences.

Prefer the established state precedence in the application rather than inventing a new one.

---

## 11. UI and accessibility

Integrate the layer manager into the existing interface and design system.

Use the existing settings, panel, modal, and control conventions where practical. Avoid adding a large UI framework for this feature.

### 11.1 Interaction design

The user should be able to determine:

- Which base imagery is selected.
- Which overlays are enabled.
- Which layers support opacity.
- Which source a layer uses.
- Whether a provider is unavailable or has failed.
- What an attribution or timestamp refers to.

Avoid overwhelming the globe with controls that are rarely used. Group related settings logically and provide short descriptions for scientific layers.

### 11.2 Accessibility requirements

Provide:

- Semantic controls.
- Accessible names and labels.
- Keyboard-operable switches and selectors.
- Visible focus states.
- Appropriate slider labels and values.
- Status and error messages that can be understood by assistive technologies.
- Adequate contrast.
- No reliance on color alone to communicate state.
- Reduced-motion-compatible transitions.

Respect existing modal focus management and keyboard behavior.

Do not introduce nested interactive controls or inaccessible custom sliders.

### 11.3 Responsive layout

Test the interface at desktop, medium, and narrow mobile viewport widths.

Controls must not obscure essential globe interaction or overflow the viewport.

The Phase 3 browser smoke suite already tests widths of 1600, 1200, and 430 pixels. Reuse these dimensions for regression testing and add others only where useful.

---

## 12. Cesium lifecycle and performance

The Cesium Viewer and its imagery layers are long-lived resources. Manage them explicitly.

### 12.1 Lifecycle requirements

Repeatedly switching layers, toggling visibility, opening or closing settings, or remounting the component must not cause:

- Duplicate Viewer instances.
- Duplicate imagery layers.
- Orphaned event listeners.
- Unreleased imagery providers.
- Stale asynchronous updates.
- Unhandled promise rejections.
- React state updates after the relevant component is disposed.
- Viewer destruction while an active layer update still assumes the Viewer exists.

Use the existing lifecycle architecture. Avoid destroying and recreating the whole Viewer when updating an individual layer.

### 12.2 Async safety

If provider initialization is asynchronous:

- Verify the Viewer is still valid before attaching the result.
- Handle provider errors explicitly.
- Avoid attaching results after a renderer switch or unmount.
- Clean up resources created by failed operations.
- Prevent an older request from overwriting a newer user selection.
- Keep the last valid state when an operation fails.

Use cancellation, generation identifiers, or the existing project's equivalent where appropriate.

### 12.3 Rendering cost

Avoid unnecessary re-renders of the Cesium scene.

Do not recreate providers or layer instances on every unrelated React state update.

Maintain the existing lazy-loading boundaries and renderer behavior.

Preserve existing low-power settings, including the established resolution and screen-space-error mappings and the Phase 3 low-power MSAA adjustment.

Respect reduced-motion behavior.

Do not enable expensive rendering options without a measured reason.

### 12.4 Render scheduling

Phase 3 explicitly deferred `requestRenderMode`.

Do not casually change render scheduling in Phase 4 as part of layer-management implementation. If layer updates require render requests, first inspect the current Cesium render-loop behavior and use a compatible, tested approach.

Any broader render-loop optimization must remain within this phase's approved scope and must not regress the smoke suite. If a safe implementation requires a separate architectural decision, document it and stop short of expanding scope.

---

## 13. Security, privacy, and provenance

Preserve the existing security policy and provider restrictions.

### 13.1 Security

- Do not introduce client-side secrets.
- Do not bypass the GIBS allow-list.
- Do not construct arbitrary provider URLs from untrusted user input.
- Do not permit arbitrary remote imagery sources through URL parameters.
- Do not weaken Content Security Policy to make a provider work.
- Do not introduce unsafe HTML for layer descriptions or attribution.
- Do not add new dependencies without a clear technical need.
- Do not alter server-only key handling.
- Do not make unrelated CSP changes.

If a new provider genuinely requires a policy change, stop and document the exact requirement rather than weakening the policy silently.

### 13.2 Provenance and user-facing claims

Provider labels and descriptions must accurately state what the data represents.

Distinguish:

- Provider availability from successful current loading.
- Mosaic date from observation time.
- Layer visibility from data freshness.
- A rendering fallback from real scientific data.
- A global visualization from geographically complete or uniform coverage.

Do not fabricate timestamps, precision, coverage, resolution, source attribution, or scientific validity.

Keep existing `data_status` contracts unchanged.

---

## 14. Testing strategy

Add tests alongside the implementation. Tests must verify actual behavior, not merely component existence.

Use the current test framework and conventions.

### 14.1 Layer registry tests

Test that:

- IDs are unique and stable.
- Required metadata exists.
- Only supported providers are exposed.
- Base layers and overlays are categorized correctly.
- Defaults are valid.
- Unsupported capabilities are not advertised.
- Provider configurations do not expose secrets.

### 14.2 State validation tests

Test:

- Valid and invalid layer IDs.
- Unknown or removed layer IDs.
- Invalid opacity values.
- Boundary opacity values.
- Malformed layer ordering.
- Duplicate IDs.
- Missing parameters.
- Legacy URLs.
- URL parameters containing unrelated state.
- Safe defaults for malformed local storage.
- State restoration without hydration errors.

### 14.3 Provider tests

Test:

- Successful provider construction.
- Correct verified GIBS configuration.
- Correct time and tiling semantics.
- Failure during provider construction.
- Failure during layer attachment.
- Recovery to a previous working layer.
- No arbitrary provider URL construction.
- No unhandled asynchronous errors.

Mock remote dependencies where appropriate for deterministic unit tests. Do not substitute mocked unit tests for required browser-level production verification.

### 14.4 Runtime lifecycle tests

Test:

- Switching base imagery repeatedly.
- Toggling overlays repeatedly.
- Updating opacity repeatedly.
- Reordering supported layers.
- Viewer destruction during provider initialization.
- Renderer switching during an in-flight operation.
- Strict Mode mount and cleanup behavior.
- No duplicate Viewer or imagery-layer instances.
- No leaked event listeners or stale updates.

### 14.5 UI tests

Test:

- Base imagery selection.
- Overlay visibility.
- Opacity controls.
- Disabled or unavailable layers.
- Error and recovery messages.
- Keyboard interaction.
- Accessible labels and values.
- Persistence and restoration.
- Narrow viewport behavior where covered by the current test framework.

### 14.6 Regression tests

Verify that:

- Dotted rendering remains the default.
- WebGL and WebGPU branches still work.
- Cesium remains lazy-loaded.
- Existing globe grid settings still work.
- Geographic picking is unchanged.
- Camera fly-to behavior is unchanged.
- Existing URL-state fields survive layer changes.
- Existing API routes and response envelopes are unchanged.
- Reduced-motion and low-power behavior remain correct.
- Existing CSP policy remains unchanged.
- Existing environmental and marker features still work.

### 14.7 Existing flaky tests

The Phase 3 report describes timeouts in the heavy `SentinelApp` test cluster that pass sequentially and have zero assertion failures.

Do not automatically classify a timeout as harmless. Compare against the baseline, reproduce sequentially when appropriate, and distinguish:

- A pre-existing contention failure.
- A genuine new regression.
- An infrastructure or environment failure.
- An unexecuted test.

Report the evidence and actual test counts. Never weaken assertions or silently skip tests to obtain a green result.

---

## 15. Real-browser production verification

The real-browser smoke suite is a mandatory acceptance gate.

Inspect and reuse `scripts/browser-smoke.mjs` or the current equivalent. Extend it only where necessary.

Run against a production build served through the existing production-start command, not solely through the development server.

### 15.1 Required browser scenarios

Verify:

1. The default dotted renderer remains intact.
2. The Cesium renderer initializes correctly.
3. The current base imagery loads successfully.
4. Base-layer selection works for every exposed choice.
5. Overlay visibility changes are reflected correctly.
6. Opacity changes affect the intended layer.
7. Supported ordering changes render correctly.
8. Settings and layer selections persist as designed.
9. URL-state restoration works after reload.
10. Invalid layer-state parameters recover safely.
11. Repeated layer operations do not create duplicate Viewers.
12. Renderer changes and component unmounts clean up correctly.
13. The globe remains usable after provider failures.
14. No unexpected browser exceptions occur.
15. No new blocking CSP violations occur.
16. The existing GIBS imagery configuration continues to return successful responses for representative tiles.
17. The UI works at 1600, 1200, and 430 pixel viewport widths.
18. The current production health endpoint remains healthy.

Add scenarios for every new supported interaction. Do not report scenarios as passed unless they were executed.

### 15.2 Network verification

Use browser network evidence and the existing smoke harness to distinguish:

- Successful responses.
- HTTP errors.
- CORS failures.
- Blocked requests.
- Requests that were never attempted.
- Lazy requests that have not yet been triggered.

Do not infer that all possible imagery tiles work from one successful tile. Test representative requests across the provider's valid configuration.

Avoid brittle tests that assume every tile request must succeed during transient network failure. Define clear, reproducible acceptance criteria and report environmental limitations honestly.

### 15.3 Browser exceptions and CSP

The Phase 3 report documents a previous audit bug that misclassified report-only CSP messages based on truncated browser output.

Reuse the corrected header-based classification logic.

Distinguish report-only CSP reports from enforced blocking violations. Do not weaken CSP or misreport a warning as a blocking failure.

### 15.4 Smoke test results

Record:

- Production build identity.
- Production server command and port.
- Browser and execution environment.
- Test scenario counts.
- Passed, failed, and skipped scenarios.
- Browser exceptions.
- Relevant imagery network results.
- CSP findings.
- Any environmental limitations.

Do not claim the complete smoke suite passed if only a subset ran.

---

## 16. Bundle budget and dependency constraints

The established initial JavaScript budget is 200 KiB gzip.

The Phase 3 report records an initial JavaScript bundle of 200,738 bytes gzip, reported as 196.0 KiB, against a 200.0 KiB budget.

Treat the budget as a hard acceptance constraint.

### 16.1 Required behavior

- Preserve Cesium's lazy-loading boundary.
- Do not import Cesium into the default dotted-renderer path.
- Do not add a large general-purpose state or UI dependency for a small feature.
- Avoid unnecessary dependencies.
- Use existing components and utilities where possible.
- Keep provider metadata lightweight.
- Avoid bundling server-only modules into the client.
- Do not increase the budget or change its measurement method to hide a regression.

### 16.2 Verification

Run the established bundle-budget script and record its output.

Report:

- Baseline and final initial bundle size.
- Gzip size and the project's actual budget calculation.
- Whether the budget passes.
- Relevant Cesium chunk sizes.
- Any new chunks attributable to this phase.

Do not substitute raw JavaScript size for the required gzip measurement.

If the initial bundle exceeds the budget, stop and optimize the implementation before declaring the phase complete.

---

## 17. Implementation sequence

Use the following order to reduce risk.

### Step A — Audit and baseline

- Verify Phase 3 acceptance.
- Inspect the working tree.
- Establish baseline test and build results.
- Identify existing layer-related code and UI conventions.
- Write a short implementation plan based on the actual repository.

### Step B — Define layer metadata and state

- Create or extend the typed registry.
- Define stable IDs.
- Validate supported layer state.
- Integrate with the existing URL-state architecture.
- Establish defaults and persistence precedence.
- Add focused unit tests.

### Step C — Implement provider integration

- Reuse the verified GIBS provider configuration.
- Implement the minimal provider adapter or factory needed.
- Separate base imagery from overlays.
- Implement safe provider initialization, replacement, and cleanup.
- Add failure handling and lifecycle tests.

### Step D — Implement the interface

- Add base imagery selection.
- Add visibility controls for supported overlays.
- Add opacity controls where supported.
- Add ordering only where supported.
- Display relevant provider metadata and attribution.
- Preserve the existing grid setting and other settings.
- Ensure accessibility and responsive layout.

### Step E — Integrate and regress

- Verify URL-state and local persistence.
- Verify all renderer branches.
- Verify camera and picking contracts.
- Verify reduced-motion and low-power behavior.
- Verify provider errors and recovery.
- Verify no unnecessary Viewer reinitialization.

### Step F — Full validation

Run typecheck, lint, focused tests, full tests, production build, texture checks, bundle-budget checks, and production browser smoke tests.

Compare results with the established baseline.

### Step G — Documentation and handoff

Produce all required documents, review the diff, and report evidence-based results.

Do not begin Phase 5.

---

## 18. Explicitly out of scope

Do not implement the following in Phase 4:

- Sentinel catalogue search.
- STAC discovery or STAC API integration.
- Sentinel-1 or Sentinel-2 ingestion.
- A new raster tile backend.
- NDVI or other derived scientific raster calculations.
- Raster processing or compositing infrastructure.
- A new database or scheduler.
- A new authentication system.
- A terrain-elevation provider requiring an unapproved token.
- Unverified third-party imagery providers.
- New live environmental data integrations.
- A replacement of the existing renderer architecture.
- A redesign of the entire application.
- Broad CSP enforcement changes.
- Phase 5 or later-phase functionality.

If an out-of-scope item appears necessary, document the dependency and ask for authorization rather than expanding the phase.

---

## 19. Required deliverables

Update the repository with the implementation and the following documentation.

### 19.1 Implementation report

Create:

`docs/architecture/PHASE_4_IMPLEMENTATION_REPORT.md`

Include:

1. Executive summary.
2. Phase 3 gate verification.
3. Initial working-tree state.
4. Baseline test/build results.
5. Architecture and design decisions.
6. Layer registry and state model.
7. Provider configurations and evidence.
8. UI behavior and supported capabilities.
9. URL-state and persistence semantics.
10. Lifecycle and error-handling behavior.
11. Security and attribution review.
12. Accessibility and responsive-layout results.
13. Tests added and test results.
14. Production browser smoke results.
15. Bundle-budget measurements.
16. Known limitations.
17. Modified, added, and removed files.
18. Any failures and their evidence-based classification.
19. Acceptance verdict.
20. Explicit confirmation that Phase 5 was not started.

### 19.2 Acceptance checklist

Create:

`docs/architecture/PHASE_4_ACCEPTANCE_CHECKLIST.md`

List each required acceptance criterion individually.

For every item, record:

- Status: Passed, Failed, Blocked, or Not Run.
- Evidence: test name, command, report section, or browser-smoke result.
- Notes or limitations.

Do not mark an item Passed merely because the implementation appears correct by inspection if runtime verification is required.

### 19.3 Provider reference

Create:

`docs/architecture/IMAGERY_LAYER_PROVIDER_REFERENCE.md`

Document:

- Supported provider IDs.
- Layer IDs and roles.
- Verified endpoint and protocol details.
- Tiling scheme and coordinate reference system.
- Supported zoom levels and known resolution limitations.
- Authentication requirements.
- Attribution and licensing.
- Temporal semantics.
- Error handling.
- Provider-specific limitations.
- The process for adding a future provider safely.

Document only providers that are actually supported. Mark prospective providers clearly as unimplemented.

### 19.4 Migration backlog

Update:

`docs/architecture/CESIUM_MIGRATION_BACKLOG.md`

Record:

- Phase 4 outcomes.
- Completed items.
- Deferred items.
- New risks or dependencies.
- Acceptance status.
- A pointer to the Phase 4 report and checklist.
- The next phase's scope, without starting it.

Do not overwrite earlier phase records. Preserve the historical evidence and decision trail.

---

## 20. Acceptance criteria

Phase 4 can be declared complete only when all mandatory criteria below are satisfied.

### A. Authorization and preservation

- [ ] Phase 3 acceptance gate verified.
- [ ] Initial working-tree state recorded and existing changes preserved.
- [ ] All renderer branches remain functional.
- [ ] Dotted renderer remains the default.
- [ ] Existing API, SWR, URL-state, marker, picking, and camera contracts remain intact.

### B. Layer architecture

- [ ] Typed registry implemented or appropriately extended.
- [ ] Stable layer IDs and validated state.
- [ ] Serializable metadata separated from runtime Cesium objects.
- [ ] Only verified, supported layers exposed.
- [ ] Provider initialization and cleanup are safe.

### C. User functionality

- [ ] Base imagery selection works for every exposed choice.
- [ ] Supported overlay visibility controls work.
- [ ] Opacity controls work for supported layers.
- [ ] Ordering works if exposed.
- [ ] Provider errors are visible and recoverable.
- [ ] Attribution and temporal semantics are accurate.
- [ ] Settings and URL-state restoration work as documented.

### D. Accessibility and lifecycle

- [ ] Controls are keyboard-operable and labelled.
- [ ] Responsive layout verified.
- [ ] Repeated interactions do not create duplicate Viewers or layers.
- [ ] Asynchronous failures are handled.
- [ ] Reduced-motion and low-power behavior remain correct.
- [ ] No new unhandled browser exceptions.

### E. Security and provenance

- [ ] No client-side secrets added.
- [ ] GIBS allow-list preserved.
- [ ] No arbitrary user-controlled provider URLs.
- [ ] CSP unchanged unless separately authorized.
- [ ] Provider attribution and temporal semantics documented.
- [ ] No fabricated scientific data or availability claims.

### F. Quality and performance

- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] New focused tests pass.
- [ ] Full tests pass or deviations are explicitly investigated and documented.
- [ ] Production build passes.
- [ ] Texture and asset checks pass.
- [ ] Initial JavaScript gzip budget remains within 200 KiB.
- [ ] Cesium remains lazy-loaded.

### G. Browser verification and documentation

- [ ] Production browser smoke suite passes all mandatory scenarios.
- [ ] Network and CSP results are correctly classified.
- [ ] Phase 4 implementation report is complete.
- [ ] Acceptance checklist contains evidence for every status.
- [ ] Provider reference is complete.
- [ ] Migration backlog is updated.
- [ ] No Phase 5 implementation has begun.

**Do not declare Phase 4 complete if a mandatory criterion is Failed, Blocked, or Not Run.**

If a failure is demonstrably environmental or a documented baseline flake, report the evidence and impact. Do not silently waive the criterion.

---

## 21. Final response format

When implementation and validation are finished, provide a concise, evidence-based report with these headings:

1. **Verdict:** Complete, Incomplete, or Blocked.
2. **Gate verification:** Phase 3 acceptance and working-tree preservation.
3. **Implemented:** Actual capabilities delivered.
4. **Files changed:** Added, modified, and removed files.
5. **Verification:** Commands, test counts, build, asset checks, bundle budget, and production browser results.
6. **Security:** Provider, secret, attribution, and CSP review.
7. **Limitations:** Known issues, unsupported capabilities, and environmental constraints.
8. **Documentation:** Paths to all required reports and checklists.
9. **Acceptance:** Criteria passed, failed, blocked, or not run.
10. **Git status:** Branch, commit, and remaining working-tree changes; confirm no staging or commit was performed unless authorized.
11. **Next action:** Wait for explicit approval before Phase 5.

Include actual numbers and command outcomes wherever available. Clearly distinguish tests that were run from those inferred or skipped.

Do not claim a successful result based only on code inspection.

---

## 22. Final execution instruction

Execute Phase 4 only after verifying the mandatory preflight gates in Section 2.

Make small, reviewable changes. Preserve existing work and behavior. Reuse verified providers and existing state conventions. Do not invent data sources or capabilities. Do not weaken security, tests, or bundle limits to obtain a passing result.

If blocked by a required decision, missing evidence, incompatible provider, security requirement, or failed acceptance gate, stop and report the exact issue.

Complete the Phase 4 implementation, tests, production browser verification, and documentation. Then stop.

**Phase 5 requires separate explicit approval.**
