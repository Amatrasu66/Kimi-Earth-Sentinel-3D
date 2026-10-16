# Phase 5 — Scientific Observation Integration

**Project:** Kimi Earth Sentinel 3D  
**Repository:** `https://github.com/Amatrasu66/Kimi-Earth-Sentinel-3D`  
**Phase:** 5  
**Status:** Scope proposal required before implementation  
**Execution agent:** OpenCode  
**Primary objective:** Deliver one reliable, verifiable scientific observation capability selected from the existing migration backlog  
**Required outcome:** Evidence-based scope approval, implementation, tests, production verification, and documentation

---

## 1. Mission

Advance Kimi Earth Sentinel 3D from a reliable globe and imagery-layer manager toward a scientifically trustworthy Earth-observation application.

Phase 4 established the imagery-layer registry, validated provider factory, base-layer selection, overlay visibility and opacity controls, URL-state integration, and production smoke verification.

Phase 5 must build on those foundations by addressing the highest-priority outstanding observation-synchronization item identified in the existing migration backlog.

**Do not assume that Phase 5 automatically means implementing STAC, Sentinel-2 ingestion, NDVI, a raster tile backend, or a new database.**

First establish what the repository already supports, identify the outstanding work, and propose the smallest complete capability that creates meaningful scientific value.

The selected capability must be verifiable end to end. A working data-source integration is preferable to an expansive architecture that cannot demonstrate actual data retrieval, provenance, and useful application behavior.

Phase 5 has two gated stages:

1. **Stage A — Scope discovery and proposal.** Inspect the repository, identify the outstanding work, and produce a documented implementation proposal. Do not modify application source code during this stage.
2. **Stage B — Implementation and verification.** Begin only after the scope proposal has been documented and explicitly approved by the user.

Do not begin Phase 6.

---

## 2. Mandatory Stage A: repository and backlog audit

Before changing source code, inspect the actual current repository.

Read and reconcile the following documents where present:

- `docs/architecture/PHASE_1_REPOSITORY_AUDIT.md`
- `docs/architecture/FEATURE_PRESERVATION_MATRIX.md`
- `docs/architecture/CESIUM_TARGET_ARCHITECTURE.md`
- `docs/architecture/CESIUM_COMPATIBILITY_AND_PROVIDERS.md`
- `docs/architecture/CESIUM_MIGRATION_BACKLOG.md`
- `docs/architecture/PHASE_2_IMPLEMENTATION_REPORT.md`
- `docs/architecture/PHASE_2_ACCEPTANCE_CHECKLIST.md`
- `docs/architecture/PHASE_3_IMPLEMENTATION_REPORT.md`
- `docs/architecture/PHASE_3_ACCEPTANCE_CHECKLIST.md`
- `docs/architecture/PHASE_4_IMPLEMENTATION_REPORT.md`
- `docs/architecture/PHASE_4_ACCEPTANCE_CHECKLIST.md`
- `docs/architecture/IMAGERY_LAYER_PROVIDER_REFERENCE.md`
- `docs/prompts/PHASE_4_IMAGERY_LAYER_MANAGER.md`
- Existing observation, synchronization, catalogue, and environmental-data documentation.

If a listed document does not exist, identify that fact rather than silently substituting assumptions.

### 2.1 Inspect the current repository state

Record:

- Current branch and commit.
- `git status --short`.
- All modified and untracked files.
- Current dependencies and package scripts.
- Existing API routes and their response envelopes.
- Existing observation, event, environmental, and satellite-data hooks.
- Existing `data_status` and provenance conventions.
- Existing URL-state handling.
- Existing provider allow-list and security restrictions.
- Existing production browser-smoke infrastructure.
- Current initial JavaScript bundle size and budget.

The Phase 4 report records a working tree with 10 modified files and 12 untracked files. This is historical information; inspect the actual current state.

**Preserve all existing work.** Never reset the branch, discard changes, clean untracked files, overwrite files blindly, stage changes, or commit without explicit authorization.

### 2.2 Identify outstanding observation-synchronization work

Inspect every backlog item related to:

- Observation synchronization.
- Scientific data freshness.
- Satellite acquisition times.
- Data-source provenance.
- Observation coverage and footprints.
- Environmental data alignment.
- Provider metadata.
- Stale, cached, unavailable, or incomplete observations.
- Data consistency between API responses and globe visualization.

Identify which items remain open, their dependencies, and whether they are prerequisites for other planned work.

Do not reassign old items to Phase 5 without examining their original rationale and dependencies.

### 2.3 Produce a priority assessment

Rank candidate deliverables using:

1. Scientific usefulness.
2. Alignment with existing backlog commitments.
3. Completeness of the end-to-end path.
4. Ability to verify real data and provenance.
5. Compatibility with existing application architecture.
6. Security and licensing risk.
7. Performance and operational complexity.
8. Dependency and infrastructure requirements.

Choose one primary deliverable and, at most, a small number of directly necessary supporting changes.

Avoid combining unrelated data sources or scientific products into one phase.

---

## 3. Stage A deliverable: scope proposal

Create:

`docs/architecture/PHASE_5_SCOPE_PROPOSAL.md`

This file is required before implementation begins.

It must contain:

1. Summary of the current architecture.
2. Relevant Phase 1–4 decisions and constraints.
3. Current working-tree state.
4. Outstanding observation-synchronization items.
5. Ranked candidate deliverables.
6. Recommended Phase 5 objective.
7. User-facing behavior the objective will deliver.
8. Explicit out-of-scope items.
9. Proposed architecture and data flow.
10. Candidate data source and evidence of suitability, if a new source is needed.
11. API and state changes required.
12. Expected files to add or modify.
13. Dependencies and infrastructure requirements.
14. Authentication, licensing, attribution, and security assessment.
15. Provenance and timestamp semantics.
16. Failure, caching, and stale-data behavior.
17. Testing and production verification plan.
18. Performance impact and bundle-budget considerations.
19. Risks and unresolved decisions.
20. Proposed acceptance checklist.
21. Questions requiring explicit user decisions.

For the recommended scope, prefer an existing supported data source and architecture when that can satisfy the objective honestly.

If the best candidate requires a major architectural decision, do not make that decision unilaterally. Present the alternatives and wait for the user.

### Stage A stop rule

After creating the proposal:

- Do not implement the feature.
- Do not install dependencies.
- Do not add new API routes.
- Do not change application behavior.
- Do not modify provider configuration.
- Do not start Phase 6.

Return the proposal path, the recommended objective, the evidence supporting the recommendation, and any decisions requiring user input. Then wait for explicit approval.

Creating or updating the proposal and other scope-only documentation is permitted. Do not stage or commit it.

---

## 4. Stage B: implementation authorization

Proceed to Stage B only after the user explicitly approves the proposed Phase 5 scope.

Treat the approved scope as a binding implementation contract.

If the user requests a different scope, update the proposal and acceptance checklist first, then obtain approval for the revised proposal.

Before implementation:

1. Re-read the approved proposal.
2. Confirm the current working tree still matches the inspected state or identify intervening changes.
3. Recheck required dependencies and data-source availability.
4. Confirm that no newly discovered constraint invalidates the design.
5. Establish the current test and build baseline.

If material new risks appear, stop and request direction.

---

## 5. Scientific data integrity requirements

The selected capability must represent real, traceable data.

Every observation displayed or returned by the new feature must be associated with the provenance information available from its source.

Depending on the selected data source, this may include:

- Stable observation or product identifier.
- Provider or originating agency.
- Product type or observation category.
- Acquisition time or observation interval.
- Publication or ingestion time, if distinct.
- Geographic footprint or coverage.
- Spatial resolution, if known.
- Processing level or product version, if provided.
- Source URL or reference.
- Cloud coverage, if provided and meaningful for the selected product.
- Cache status and last successful retrieval time.
- Limitations or missing metadata.

Do not fabricate missing metadata to satisfy a schema.

Use nullable or explicitly unavailable fields when appropriate.

### 5.1 Distinguish important time concepts

Do not conflate:

- Observation or acquisition time.
- Product publication time.
- API response time.
- Cache retrieval time.
- Data refresh time.
- Mosaic availability date.

If the provider supplies only a date, do not invent a precise time of day.

If a product is a composite or mosaic, describe its temporal semantics accurately.

The existing NASA GIBS `MODIS_Terra_CorrectedReflectance_TrueColor` imagery remains a dated mosaic, not live satellite imagery. Do not change this claim.

### 5.2 No invented scientific claims

Do not describe a source as real-time unless its documented behavior supports that statement.

Do not infer that an observation exists at a location merely because a layer is visible.

Do not claim complete geographic coverage, uniform resolution, current freshness, or scientific certainty without evidence.

Do not label simulated, placeholder, or test-fixture data as real observations.

---

## 6. Data-source selection and provider verification

If the approved scope needs a new external data source, verify its suitability before integration.

Evaluate:

- Official provider documentation.
- Endpoint availability.
- API stability and versioning.
- Data coverage.
- Temporal coverage and latency.
- Authentication requirements.
- Rate limits and quotas.
- Licensing and redistribution rights.
- Attribution requirements.
- CORS requirements, if browser requests are involved.
- Server-side access requirements.
- Pagination and response-size behavior.
- Error semantics.
- Caching and freshness recommendations.
- Geographic and temporal query support.
- Whether the provider supplies metadata only, downloadable products, map tiles, or rendered imagery.

Prefer authoritative provider documentation.

Do not choose a source merely because a URL appears to work in a browser.

Do not introduce a source whose terms prohibit the intended use.

### 6.1 Credentials

Never expose server-only credentials to the browser.

If credentials are required:

- Identify the necessary environment variables.
- Follow existing server-only configuration conventions.
- Ensure secrets are excluded from client bundles and logs.
- Document setup requirements.
- Provide safe behavior when credentials are absent.
- Do not invent a token or silently use a personal credential.

Do not add a new credential-dependent provider without explicit approval if doing so materially changes deployment requirements.

### 6.2 Provider restrictions

Preserve the existing GIBS allow-list and provider factory constraints.

Do not allow arbitrary provider URLs to enter the system through user input, API parameters, local storage, or URL-state.

If the approved scope needs an additional provider, extend the registry through a reviewed, explicit configuration rather than allowing unrestricted endpoint construction.

---

## 7. End-to-end data flow

The approved feature must have a clearly documented data flow.

Where relevant, follow the existing architecture:

1. User requests a geographic area, time range, or observation.
2. Application validates input.
3. Server-side API or existing data layer requests the provider.
4. Provider response is validated and normalized.
5. Application preserves provenance and status information.
6. Results are cached according to appropriate provider semantics.
7. Client consumes the existing or newly approved API envelope.
8. UI displays the result, its time semantics, and any limitations.
9. If applicable, the globe highlights the real observation footprint or activates a supported layer.
10. Failures and stale data are represented honestly.

Do not add every step if the selected scope does not need it. Explain omissions in the scope proposal.

Do not duplicate an existing API or hook when the current implementation can be extended safely.

Do not create a second state-management system.

---

## 8. API and data contracts

If the approved scope requires an API change, extend the current API conventions.

Before changing a response, inspect its existing consumers and tests.

Requirements:

- Preserve existing response envelopes unless a justified, approved change is required.
- Preserve current status and error semantics.
- Validate query parameters and request bodies.
- Validate external provider responses.
- Bound pagination and response sizes.
- Avoid returning secrets or internal implementation details.
- Return meaningful errors without exposing sensitive information.
- Maintain backwards compatibility for existing consumers.
- Add tests for valid, invalid, empty, unavailable, and malformed provider responses.
- Keep `data_status` semantics consistent with the established application.

Do not silently transform a provider failure into a successful empty result.

Distinguish:

- A successful query with no observations.
- A provider timeout.
- Authentication failure.
- Rate limiting.
- Invalid provider data.
- Stale cached results.
- Partial coverage.
- An internal application error.

Use the existing error model where possible.

---

## 9. Caching, freshness, and synchronization

If the approved scope involves synchronization or caching, define its behavior explicitly.

Document:

- Cache key and its dimensions.
- Geographic and temporal query normalization.
- Cache lifetime.
- Provider freshness semantics.
- Stale-while-revalidate behavior, if supported.
- Retry policy.
- Rate-limit handling.
- Pagination behavior.
- Cache invalidation.
- Duplicate observation handling.
- Failure behavior when stale data is available.
- Last successful refresh time, if known.

Avoid unbounded caching or repeated requests triggered by normal UI interaction.

Do not add a background scheduler, persistent database, or ingestion service unless the approved scope specifically requires it and the user authorizes the architectural change.

Prefer the existing SWR and API architecture for client-side data fetching when appropriate.

Do not confuse SWR cache freshness with source observation freshness.

A recently fetched response can contain an old observation.

### 9.1 Failure handling

When the provider fails:

- Preserve previously valid results if safe.
- Clearly indicate stale data when appropriate.
- Avoid claiming that stale observations are current.
- Avoid infinite retries.
- Respect rate limits.
- Make recovery possible.
- Avoid unhandled promise rejections.
- Do not erase useful existing data merely because a refresh failed.

---

## 10. Geographic correctness

If the feature uses geographic coordinates, observation footprints, or raster products, verify their geographic semantics.

Requirements depend on the approved scope, but must consider:

- Coordinate reference system.
- Coordinate ordering.
- Longitude normalization.
- Latitude bounds.
- Antimeridian-crossing footprints.
- Geographic bounding boxes.
- Projection transformations.
- Empty or malformed geometries.
- Partial or irregular coverage.
- Polar regions and projection limits where relevant.

Reuse existing coordinate validation and globe picking contracts.

Do not approximate an observation footprint with an arbitrary point unless the product genuinely represents a point observation.

If the provider uses projected coordinates, transform them correctly before rendering or comparing them with geographic coordinates.

Test representative locations across hemispheres and, when applicable, across the antimeridian.

---

## 11. UI and scientific usability

Keep the interface aligned with existing application conventions.

The selected capability should communicate:

- What the data represents.
- Where it comes from.
- When it was observed or produced.
- Whether it is current, cached, stale, unavailable, or incomplete.
- What geographic area it covers.
- What its principal limitations are.

Provide clear loading, empty, error, and success states.

Use accessible controls and meaningful keyboard behavior.

Do not add controls for features that are not implemented.

Do not create placeholder cards for nonexistent observations or unimplemented satellite missions.

If the selected scope introduces observation selection, ensure that selecting a result has a clear and tested outcome, such as showing its metadata or focusing on its verified geographic footprint.

If it introduces map imagery, verify that the product is actually renderable through an approved and supported path.

Metadata discovery alone must not be represented as successful imagery rendering.

---

## 12. Cesium and renderer preservation

Preserve the current renderer architecture.

The feature must not:

- Make Cesium the default renderer.
- Force Cesium to load on the dotted renderer path.
- Break WebGL or WebGPU modes.
- Reinitialize the Viewer unnecessarily.
- Break picking or fly-to behavior.
- Leak imagery layers or event listeners.
- Bypass the approved imagery registry.
- Insert unverified imagery providers directly into the Viewer.
- Break grid visibility or opacity settings.

If the approved feature requires a new Cesium imagery layer, integrate it through the existing typed layer registry and provider factory where appropriate.

If it requires a new non-Cesium visualization, use the existing renderer architecture and preserve renderer-specific boundaries.

Ensure cleanup works during layer changes, renderer switches, component unmounts, and asynchronous provider failures.

---

## 13. Security and privacy

Preserve the current security posture.

- Do not expose secrets.
- Do not weaken Content Security Policy.
- Do not introduce unsafe HTML.
- Do not permit arbitrary provider URLs.
- Do not log sensitive request details or credentials.
- Do not add unnecessary third-party dependencies.
- Do not create an unrestricted server-side URL fetcher.
- Do not permit users to proxy arbitrary internal or external endpoints.
- Do not weaken input validation.
- Do not bypass source allow-lists.
- Do not change unrelated authentication or authorization behavior.

If the selected integration requires proxying external data, validate the destination against an explicit allow-list and prevent server-side request forgery.

Handle redirects, URL parsing, response sizes, content types, and timeouts safely.

If a security-policy change is required, stop and request approval before making it.

---

## 14. Performance and dependency constraints

The established initial JavaScript gzip budget is 200 KiB.

The Phase 4 report recorded 202,809 bytes gzip, reported as 198.1 KiB, leaving approximately 1,991 bytes of headroom under the project's reported budget.

Treat the initial JavaScript budget as a hard constraint.

Before adding a dependency, explain why the existing stack cannot reasonably provide the required capability.

Prefer server-side provider access and lightweight client interfaces when appropriate.

Requirements:

- Keep Cesium lazy-loaded.
- Do not import large scientific-processing libraries into the initial client bundle.
- Avoid unnecessary state-management libraries.
- Avoid fetching large products merely to display metadata.
- Bound result counts and response sizes.
- Avoid redundant requests and expensive render loops.
- Preserve existing reduced-motion and low-power behavior.
- Keep asset and texture checks intact.
- Measure the final bundle using the existing script and methodology.

If the approved feature requires substantial server-side processing, document the infrastructure and operational cost before proceeding.

Do not increase or redefine the budget to hide a regression.

If the budget fails, optimize the implementation or report the blocker.

---

## 15. Testing strategy

Build tests around the approved scope. Test actual data contracts and observable behavior.

### 15.1 Unit tests

Where relevant, test:

- Input validation.
- Query normalization.
- Stable observation identifiers.
- Provider response parsing.
- Missing or malformed metadata.
- Time-zone and timestamp handling.
- Geographic bounds and footprints.
- Cache key construction.
- Freshness semantics.
- Status and error normalization.
- Provider allow-list enforcement.
- Safe URL and parameter handling.

### 15.2 API and integration tests

Where relevant, test:

- Valid provider responses.
- Empty observation results.
- Provider timeouts.
- Authentication failures.
- Rate limits.
- Malformed provider payloads.
- Partial results.
- Stale cache behavior.
- Pagination and bounded result counts.
- Correct API response envelopes.
- Correct `data_status` values.
- No secrets in responses or logs.

Mock remote dependencies for deterministic tests, but retain separate verification of real provider behavior where required.

### 15.3 UI tests

Test:

- Loading state.
- Empty state.
- Error state and recovery.
- Provenance and timestamp display.
- User interaction.
- Accessible labels.
- Geographic selection or fly-to behavior, if implemented.
- Correct handling of invalid or stale state.
- Responsive behavior where relevant.

### 15.4 Regression tests

Verify:

- Dotted renderer remains the default.
- WebGL and WebGPU modes remain functional.
- Cesium remains lazy-loaded.
- Phase 4 imagery selection and opacity still work.
- Grid visibility and persistence still work.
- Existing URLs remain compatible.
- Existing API response contracts remain intact.
- Existing environmental, marker, search, and statistics features remain functional.
- Reduced-motion and low-power behavior remain correct.
- No new browser exceptions or lifecycle leaks occur.

### 15.5 Existing test flakes

Previous reports identify intermittent timeouts in the heavy `SentinelApp` test cluster.

Do not assume a new timeout is harmless.

Compare results against the baseline, rerun sequentially when appropriate, and record evidence that distinguishes existing contention from new regressions.

Never weaken assertions, increase timeouts solely to conceal failures, or silently skip tests to obtain a green result.

---

## 16. Production verification

Run the relevant smoke tests against a verified production build.

Reuse the existing production smoke harness, including `scripts/browser-smoke.mjs` or its current equivalent.

Do not rely only on development-server behavior.

Verify the new capability end to end:

1. Application initializes.
2. Existing renderer behavior remains intact.
3. A valid user request produces the expected result.
4. Data provenance and time semantics are displayed correctly.
5. Geographic information is interpreted correctly.
6. Empty results are handled correctly.
7. Provider failures are handled correctly.
8. Invalid inputs are rejected safely.
9. Existing Phase 4 layer controls remain functional.
10. No duplicate Viewers, layers, or event listeners appear.
11. No new unhandled browser exceptions occur.
12. No new blocking CSP violations occur.
13. Existing health and API checks continue to pass.
14. Performance and bundle-budget checks pass.

Use actual runtime evidence for all claimed results.

If external services are unavailable, distinguish a provider outage from an implementation defect and record what was actually verified.

Do not claim that a real external integration works based solely on mocked tests.

---

## 17. Stage B implementation sequence

After the scope proposal is approved, follow this sequence.

### Step A — Revalidate the approved scope

Confirm the working tree, dependencies, baseline, provider assumptions, and approval.

### Step B — Implement the minimal data contract

Create or extend only the types and API contracts necessary for the approved capability.

### Step C — Implement provider access

Use verified provider documentation, bounded requests, validation, safe caching, and explicit error handling.

### Step D — Integrate application state

Reuse the existing hooks, URL-state conventions, and API envelope.

### Step E — Integrate the user interface

Expose the approved capability with accurate provenance, time semantics, and error states.

### Step F — Integrate geographic visualization if required

Use existing globe and imagery architecture. Do not add a visualization layer if the selected scope does not require it.

### Step G — Validate

Run typecheck, lint, focused tests, full tests, production build, asset checks, bundle-budget checks, and the production browser smoke suite.

### Step H — Document

Update the implementation report, acceptance checklist, and migration backlog.

### Step I — Stop

Return the final evidence-based report and wait for explicit approval before Phase 6.

---

## 18. Explicitly out of scope unless separately approved

Do not automatically implement:

- Full STAC catalogue integration.
- A general-purpose satellite catalogue browser.
- Sentinel-1 ingestion.
- Sentinel-2 ingestion.
- Automated ingestion pipelines.
- NDVI or other derived raster calculations.
- A new raster tile server.
- A new database.
- A scheduler or background processing service.
- A new authentication system.
- A terrain provider requiring a forbidden or unapproved token.
- Arbitrary user-configured imagery endpoints.
- Broad Content Security Policy changes.
- A complete redesign of the application.
- Phase 6 or later phases.

A narrowly scoped STAC or Sentinel capability is not categorically prohibited, but it may only be selected if the backlog audit demonstrates that it is the right next deliverable, the scope proposal explicitly describes it, and the user approves it.

If it requires a major infrastructure decision, stop and ask.

---

## 19. Required implementation deliverables

After approved implementation, create or update the following.

### 19.1 Scope proposal

`docs/architecture/PHASE_5_SCOPE_PROPOSAL.md`

Create this during Stage A. Update it only when the approved scope changes or implementation reveals a material constraint.

### 19.2 Implementation report

`docs/architecture/PHASE_5_IMPLEMENTATION_REPORT.md`

Include:

1. Executive summary.
2. Approved scope and authorization evidence.
3. Initial working-tree state.
4. Baseline verification results.
5. Backlog item addressed.
6. Architecture and data flow.
7. Provider details and verification.
8. API and data-contract changes.
9. Provenance and temporal semantics.
10. Caching and freshness behavior.
11. Geographic correctness.
12. Security review.
13. Tests and actual results.
14. Production verification.
15. Bundle and performance measurements.
16. Files added, modified, or removed.
17. Known limitations.
18. Failed, blocked, or unrun checks.
19. Acceptance verdict.
20. Confirmation that Phase 6 was not started.

### 19.3 Acceptance checklist

`docs/architecture/PHASE_5_ACCEPTANCE_CHECKLIST.md`

For each acceptance criterion, record:

- Passed.
- Failed.
- Blocked.
- Not Run.

Attach evidence such as a test name, command output, report section, or browser-smoke result.

Do not mark unverified behavior as passed.

### 19.4 Migration backlog

Update:

`docs/architecture/CESIUM_MIGRATION_BACKLOG.md`

Record:

- The backlog item addressed.
- Completed work.
- Deferred work.
- New dependencies.
- New risks.
- Acceptance status.
- Links to the Phase 5 proposal, report, and checklist.
- The next phase's proposed scope, without implementing it.

Preserve the history of earlier phases.

### 19.5 Provider reference

If Phase 5 introduces or materially changes a provider, update:

`docs/architecture/IMAGERY_LAYER_PROVIDER_REFERENCE.md`

Document actual endpoints, protocols, authentication, attribution, temporal semantics, coverage, limitations, and verification evidence.

Do not create duplicate provider references if the existing document can be extended appropriately.

---

## 20. Acceptance criteria

Phase 5 is complete only when the approved scope and all applicable mandatory criteria below are satisfied.

### A. Scope and preservation

- [ ] Scope proposal exists and was explicitly approved.
- [ ] Backlog item addressed is identified.
- [ ] Working-tree changes were preserved.
- [ ] Scope did not expand without approval.
- [ ] Existing renderers and Phase 4 functionality remain intact.

### B. Scientific integrity

- [ ] Real data or a clearly identified metadata source is used as specified.
- [ ] Provenance is preserved.
- [ ] Observation and publication times are distinguished when applicable.
- [ ] Missing metadata is not fabricated.
- [ ] Freshness and cache status are honest.
- [ ] Geographic coverage is represented correctly.
- [ ] No unsupported real-time or scientific claims are introduced.

### C. Data contracts and reliability

- [ ] Input validation is tested.
- [ ] Provider responses are validated.
- [ ] Empty results and provider errors are distinguished.
- [ ] API compatibility is preserved or explicitly approved.
- [ ] Cache and retry behavior is bounded.
- [ ] Failure recovery is tested.
- [ ] No secrets are exposed.

### D. Application integration

- [ ] Existing state conventions are preserved.
- [ ] URL-state remains compatible.
- [ ] UI states are accessible.
- [ ] Geographic behavior is correct for the approved feature.
- [ ] Cesium lifecycle remains safe if applicable.
- [ ] Existing Phase 4 layer controls still work.
- [ ] No new unhandled browser exceptions.

### E. Security and performance

- [ ] Provider restrictions remain intact.
- [ ] No arbitrary URL fetching is introduced.
- [ ] CSP remains unchanged unless separately approved.
- [ ] Initial JavaScript remains within the 200 KiB gzip budget.
- [ ] Cesium remains lazy-loaded.
- [ ] No unnecessary dependencies or unapproved infrastructure are introduced.

### F. Verification

- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] New focused tests pass.
- [ ] Full tests are investigated and documented.
- [ ] Production build passes.
- [ ] Asset and texture checks pass.
- [ ] Production browser smoke tests cover the approved capability.
- [ ] Real external behavior is verified where required.
- [ ] Environmental limitations are distinguished from code failures.

### G. Documentation and handoff

- [ ] Implementation report is complete.
- [ ] Acceptance checklist contains evidence.
- [ ] Migration backlog is updated.
- [ ] Provider documentation is updated if applicable.
- [ ] Working-tree status is reported accurately.
- [ ] Phase 6 has not been started.

A mandatory criterion that is Failed, Blocked, or Not Run prevents an unconditional completion verdict. Explain any unresolved issue and wait for direction.

---

## 21. Final report format

When Stage B is complete, return:

1. **Verdict:** Complete, Incomplete, or Blocked.
2. **Approved scope:** Exact deliverable implemented.
3. **Backlog:** Item addressed and remaining open items.
4. **Data integrity:** Provenance, temporal semantics, freshness, and coverage.
5. **Implementation:** Actual behavior delivered.
6. **Files changed:** Added, modified, and removed.
7. **Verification:** Commands, counts, build, smoke tests, and bundle measurements.
8. **Security:** Credentials, allow-lists, CSP, and external request handling.
9. **Limitations:** Known issues and unverified behavior.
10. **Acceptance:** Passed, Failed, Blocked, and Not Run criteria.
11. **Documentation:** Paths to reports and checklists.
12. **Git status:** Branch, commit, and remaining changes; confirm no staging or commit unless authorized.
13. **Next action:** Wait for explicit approval before Phase 6.

Do not claim success based only on code inspection. Include actual evidence and distinguish executed checks from assumptions.

---

## 22. Final execution instructions

**Start with Stage A only.**

Inspect the current repository, verify the Phase 1–4 documentation, identify the outstanding observation-synchronization work, and create `docs/architecture/PHASE_5_SCOPE_PROPOSAL.md`.

Do not modify application source code, add dependencies, change provider configurations, or implement the proposed feature until the user explicitly approves the documented scope.

After approval, implement only the agreed deliverable, validate it against the mandatory gates, document the evidence, and stop.

Preserve all existing work. Do not weaken tests, security restrictions, or the bundle budget to obtain a passing result.

**Phase 6 requires separate explicit approval.**
