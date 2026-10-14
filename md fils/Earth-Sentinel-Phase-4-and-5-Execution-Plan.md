# Kimi Earth Sentinel 3D — Remaining Phase 4 & Phase 5 Execution Plan

**Purpose:** A master execution plan for the remaining rendering-performance, supply-chain, testing, documentation and repository-delivery work. Use this document with OpenCode across sequential tasks, then conduct one final whole-project audit after implementation work and owner-required measurements are complete.

**Repository:** <https://github.com/Amatrasu66/Kimi-Earth-Sentinel-3D>

**Known latest completed work at plan creation:**
- `d6024bf` — `T4.1: optimise globe texture pipeline`
- `2ca4e1e` — `T4.2: improve render-loop discipline`

**Last reported test baseline:** 682 tests across 73 files after T4.2. Re-check the actual checkout before relying on this number; later work may have changed it.

**Important:** This plan describes remaining work based on the available task reports and repository audit documents. It is not proof that every item is still outstanding. OpenCode must inspect the current working tree, relevant files, task reports and current CI before each task. Later completion reports supersede older, stale rows in historical audit documents, but historical audit entries must not be erased.

---

## 1. Operating Contract for OpenCode

Treat this file as the execution contract for Phase 4 and Phase 5. Work through the tasks in dependency order. Keep one coherent task per commit, preserve existing functionality, and run that task's verification gates before committing.

### 1.1 Execution model

1. Begin every task by checking the current branch, working tree, latest commit, PRD acceptance criteria, `docs/audit/current-state-reconciliation.md`, `docs/audit/phase-3-review-gates.md`, and relevant current code. Do not overwrite uncommitted owner work or assume historical inventories are current.
2. Implement one task at a time and make **one commit per task**. Do not combine T4.3, T4.4, T4.5, T4.6, or T5.x into a single large code diff.
3. Run `npm run lint`, `npm run typecheck`, `npm test -- --minWorkers=1 --maxWorkers=2` when the machine needs constrained Vitest workers, and `npm run build` after each implementation task. Also run `npm run textures:report` after changes that could affect texture tiers, shipped textures or texture selection.
4. Do not modify the original PRD or erase historical audit records. Add follow-up notes with dates/commit references and evidence instead.
5. Do not treat successful tests, a build, HTTP smoke checks, a code review or a mocked GPU test as evidence of visual equivalence, browser accessibility, real frame rate or real GPU memory use.
6. Report what was measured separately from what was inferred or verified only by code/tests.
7. Stop a specific decision that requires owner measurements or explicit approval; do not fabricate the missing evidence. Continue with independent tasks if possible, but do not falsely mark a blocked acceptance criterion complete.
8. After implementation subtasks are complete, run the final audit in Section 12. Do not turn each implementation task into a premature “whole project complete” audit.

### 1.2 Browser-testing restriction — binding

The repository owner performs browser tests, screenshot capture, responsive inspection, screen-reader verification, WebGL/WebGPU visual verification, GPU checks and manual performance captures.

**Do not install or run Playwright or alternative browser automation. Do not add browser E2E tests, automated screenshots, visual-baseline tooling, Lighthouse CI or Axe automation.** Do not replace a cancelled browser test with another browser test framework. Unit/component tests, static checks, build checks, Node scripts, HTTP smoke checks and manually operated browser DevTools are permitted.

This supersedes older plan text and earlier owner decisions that approved browser tooling before browser testing was later cancelled. T5.1 remains cancelled. Browser-audit requirements in T5.2 must remain owner-manual unless the owner explicitly changes this decision in a future task.

### 1.3 Product and architecture constraints

- Keep Next.js App Router, React 19, TypeScript, Tailwind v3, SWR, and the current `@visx/*` chart system. Do not replace Bklit/visx or add a competing state-management library.
- Node is pinned to 24.x through the existing project configuration; keep `.nvmrc`, `package.json` engines and CI consistent.
- No paid infrastructure, Redis, database, workers, separate backend, Render service or runtime CDN asset dependency.
- Keep the dotted Earth as the default, lightweight geography-first renderer. It must remain independent of the 3D texture assets and remain visible while data loads or is unavailable.
- Preserve `?renderer=webgl` and `?renderer=webgpu`, the current WebGPU-to-WebGL fallback, texture-tier logic, camera/projection/shader contracts and marker picking unless a separate owner-approved decision explicitly authorizes a change.
- Preserve the URL-state contract (`layer`, `event`, `q`, `sev`, `view`, `renderer` and supported passthrough parameters), browser Back/Forward behaviour and static shell.
- Keep the API envelope `{success,data,meta}`, `data_status`, `source`, `fetched_at`, `meta.cache_hit`, caching headers and `Retry-After` meanings unchanged.
- Never represent simulated/fallback data as live. Never invent source names, timestamps, measurements, event counts or provider health.
- Do not expose credentials or key-bearing URLs in diagnostics, logs, copied reports or CI output.
- Keep changes targeted; do not undertake another broad frontend redesign.

---

## 2. Current Phase Status and Work Ledger

| Task | Topic | Status at plan creation | Required disposition |
|---|---|---|---|
| T4.1 | Texture pipeline | **Reported complete** (`d6024bf`) | Preserve the texture report and tier contracts; re-run checks only when relevant. Owner must still verify visual quality. |
| T4.2 | Render-loop discipline | **Reported complete** (`2ca4e1e`) | Preserve per-renderer idle/visibility contracts; owner must still manually verify actual GPU stillness and interaction feel. |
| T4.3 | Marker scalability | **Remaining; measure-first** | Assess up to 2,000 markers against target frame rates. Optimise only if measurements justify it. Owner capture required. |
| T4.4 | Renderer decision | **Remaining; evidence-dependent** | Create evidence-backed comparison for WebGL/WebGPU on at least two devices. Keep both renderers until evidence and owner sign-off permit a decision. |
| T4.5 | Bundle budget in CI | **Remaining** | Add accurate static build-output accounting and a hard CI budget for initial-route JavaScript. Exclude only the explicitly allowed lazy globe chunk. |
| T4.6 | Low-power mode | **Remaining** | Implement a useful auto/manual low-power preference across supported renderers, respecting the existing texture tier and lifecycle constraints. |
| T5.1 | Browser E2E | **Cancelled by owner** | Do not implement, reinstall tooling or substitute browser automation. Record cancellation honestly. |
| T5.2 | Lighthouse/browser CI | **Browser portion cancelled / owner-manual** | Do not implement Lighthouse, browser or Axe automation. Static budget enforcement belongs to T4.5. Manual Web Vitals remain owner work. |
| T5.3 | Supply-chain hardening | **Remaining** | Audit current advisories, add a high-severity audit gate and weekly grouped Dependabot/Renovate configuration, resolving safe fixes without blind major upgrades. |
| T5.4 | Test coverage and offline test discipline | **Cross-cutting; audit and close gaps** | Continue tests with every task, then verify specific security/provider/cache areas and the absence of accidental live-network test dependencies. Do not add redundant tests just to create files. |
| T5.5 | Documentation, licence and repo hygiene | **Remaining / re-verify existence** | Bring README/developer guidance up to current truth; add approved MIT licence and `AGENTS.md` if still absent; carefully audit/archive old materials if still present. |
| Final audit | Full repository assessment | **Not started** | Run only after eligible Phase 4/5 tasks and owner-required measurements are complete or explicitly recorded as blocked/deferred. |

### Phase 4 acceptance targets

- **T4.3:** PRD targets up to 2,000 markers, at least 55 FPS on desktop and 30 FPS on a representative mid-range mobile device. These require real owner device measurements; mocked tests do not satisfy them.
- **T4.4:** comparison evidence on at least two devices covering frame time, memory where measurable, bundle contribution, load/readiness behaviour and visual parity. No renderer is removed without owner sign-off.
- **T4.5:** initial-route JavaScript no more than **200 KiB gzip**, excluding only the defined lazy globe chunk, measured reproducibly from a production build. If the baseline is over budget, do not introduce a fake/passing gate: reduce the budgeted payload safely or report the unmet target honestly.
- **T4.6:** automatic and manual low-power behaviour must be real, persisted/understandable where appropriate, consistent between WebGL/WebGPU and safe with the texture pipeline. Reduced motion is a distinct preference and must not be conflated with low-power mode.

### Task ordering and dependencies

1. T4.3 measurement-first audit and any justified marker optimisation.
2. T4.4 renderer evidence report. Owner device data may be a checkpoint; no renderer retirement while evidence is incomplete.
3. T4.5 static bundle budget and CI enforcement. It can proceed even while T4.4 awaits device results.
4. T4.6 low-power mode, reusing the texture tier and loop controls instead of duplicating them.
5. T5.3 supply-chain protections.
6. T5.4 focused coverage/offline-test audit after implementation tasks; add regression tests continuously throughout.
7. T5.5 contributor documentation, MIT licence and safe repository hygiene.
8. Section 12 final audit after work is complete and owner evidence is available.

T5.1 remains cancelled. T5.2 does not mean reintroducing browser automation; static gates are implemented by T4.5 and manual browser metrics stay owner-owned.

---

# Phase 4 — Rendering Performance and Device Adaptation

## 3. T4.3 — Marker Scalability (Measure First)

### Objective

Determine whether the current marker-rendering and picking path handles up to 2,000 markers at the PRD's performance targets. Improve only the actual bottleneck, not imagined ones.

### Audit before implementation

Inspect:
- `src/components/globe/Globe.tsx`
- `src/components/globe/GlobeScene.tsx`
- `src/components/globe/WebGPUEarth.tsx`
- `src/components/globe/dotted/DottedEarth.tsx`
- Marker mapping/filtering and event selection code
- Existing `filterValidPoints`, rAF-throttled picking and disposal behaviour
- T4.1 texture tier and T4.2 frame-loop changes
- `EventList`, `ListStage`, selection/highlight and marker status display

Trace the full cost chain: response points → validation/filtering → coordinate projection → marker creation/update → render-loop invalidation → pointer picking → selected-event presentation. Identify repeated per-frame allocation, per-point React churn, duplicate marker creation, expensive material changes or picking loops that can be proven from code.

### Baseline measurements

Before changing rendering behaviour, document:
- The exact scenario and how 2,000 points are supplied.
- Whether points are actual provider data or a **clearly labelled local-only performance fixture**. Synthetic fixture points may be used for profiling only; never inject them into the production/live experience or call them live data.
- Device model/class, browser/version, OS, power mode, viewport, DPR, renderer, texture tier and whether reduced motion is enabled.
- First frame/usable render, average and p95 frame time if available, observed FPS, CPU load and memory information where the platform exposes it.
- At least three repeat runs under comparable conditions, if the owner can supply the captures.

Use manually operated browser DevTools for real-device captures. Do not add browser automation, automated screenshots or E2E tools. OpenCode must not claim it captured device FPS if it did not run a real browser.

### Performance targets and optimisation rules

- Desktop: target at least 55 FPS at the 2,000-marker scenario.
- Representative mid-range mobile: target at least 30 FPS.
- Keep existing rAF-throttled picking unless measurements show a specific defect.
- Do not render duplicate markers or fabricate counts.
- Introduce clustering/thinning **only if the measurements show a need**.
- If clustering or thinning is justified, preserve access to real events, keep click/selection mapping correct, and display an explicit truthful notice such as “Showing N of M”; never imply all M are currently drawn.
- Keep keyboard list selection as a usable alternative.
- Do not change the globe projection, camera, textures, shaders or default renderer merely to improve a benchmark.

### Tests

Add focused tests for any implemented algorithm, including coordinate mapping, grouping boundaries, stable IDs, selection mapping, handling of invalid points and truthful `N of M` counts where applicable. Keep the tests deterministic and offline. Avoid meaningless tests that claim to prove FPS.

### Owner checkpoint

The task can complete its code audit and prepare a reproducible measurement procedure without device captures. If the targets cannot be honestly evaluated, mark the performance acceptance as **OWNER MEASUREMENT REQUIRED** and do not apply speculative thinning. Independent tasks may proceed.

### Commit

`T4.3: measure and optimise marker scalability`

---

## 4. T4.4 — WebGL/WebGPU Renderer Decision Study

### Objective

Create `docs/audit/renderer-decision.md` containing an evidence-backed comparison of both 3D renderers. This is a study and decision record first, not a mandate to remove a renderer.

### Evidence to collect

Audit the current code paths, then record comparable observations for WebGL and WebGPU on **at least two physical devices** when the owner supplies captures. Include:
- Device, OS, browser/version, GPU information where available, viewport and DPR.
- Renderer requested and renderer actually active, including fallback reason when relevant.
- Initialisation/first-usable-frame timings.
- Median/p95 frame time or observed frame rate under the same scenario, including the T4.3 marker scenario where possible.
- Asset and JavaScript bundle contribution with methodology.
- Memory readings or estimates with the measurement method clearly labelled; do not pretend browser-independent GPU-memory data exists where it does not.
- Texture-tier selection, fallback paths and failure modes.
- Visual parity for surface/night lights/clouds/atmosphere, markers, selection, fly-to, reduced motion, pointer interaction and responsiveness.
- Developer complexity, failure recovery and maintenance implications, backed by code references.

Keep automated build/asset statistics separate from owner-measured browser/GPU data.

### Decision policy

- Keep WebGPU and WebGL while evidence is missing, ambiguous or one-sided.
- Do not decide that WebGPU is universally better solely because it is newer, or that WebGL is better solely because it loads sooner on one machine.
- Do not remove either renderer, its query parameter or fallback until the evidence supports it and the owner explicitly signs off.
- If evidence favours keeping both, record the fallback contract and add/retain parity regression tests.
- If evidence suggests retiring one, prepare the evidence and recommendation first; **do not execute removal in the same task without explicit owner sign-off**.

### Tests

Only test code-level contracts and fallback policy that can be tested deterministically. No test can claim visual parity or real device performance. Keep existing `?renderer=webgl|webgpu` query handling stable throughout the study.

### Owner checkpoint

Without manual results from two devices, create a structured report with static/code evidence and clearly marked empty measurement rows. The decision remains **PENDING OWNER MEASUREMENTS**; do not fill the gaps with estimates and do not block independent tasks such as T4.5.

### Commit

`T4.4: document renderer trade-offs`

---

## 5. T4.5 — Static Bundle Budget and CI Enforcement

### Objective

Enforce a reproducible limit for initial-route JavaScript without using browser-based tooling.

**Budget:** initial-route JavaScript ≤200 KiB gzip, excluding only the specifically identified lazy globe chunk, as defined in the original plan. Confirm whether the PRD defines “gzip” and the exclusion more precisely before coding the measurement.

### Audit and baseline

Inspect:
- `next build` output and build manifests
- Next.js app/build manifests and emitted static chunks
- Dynamic import boundaries for the globe renderers, `ValueHistogram`, charts, panels and settings
- `.github/workflows/ci.yml`
- Current npm scripts and Node 24 CI configuration

Capture a reproducible pre-change baseline listing every included JavaScript asset, raw size, gzip size and why it belongs in the initial route. Identify the globe chunk to exclude by a deterministic manifest/import mapping, **not** a loose filename substring that could accidentally exclude shared application code.

### Measurement implementation

Create a Node script or equally reproducible tooling that:
- Runs against production build output after `next build`.
- Resolves the real `/` route entrypoint and its initial JavaScript chunks using Next's generated manifests.
- Measures gzip bytes using a documented compression method/level.
- Excludes only the agreed lazy globe payload, while continuing to count shared framework, application, search, controls and other initial-route JavaScript.
- Prints per-file and total bytes in clear units.
- Exits nonzero when files/manifests are missing or the budget is exceeded.
- Does not include source maps, development-only code, CSS, images or API response payloads in a JavaScript budget.
- Produces the same result for the same lockfile/build output and is verified in CI.

If the installed Next version's manifest does not make a chunk's boundary unambiguous, fail safely and document the issue rather than undercounting.

### Remediation if the baseline is over budget

Profile the imports and code splits. Use existing Next dynamic boundaries where they preserve behaviour. Consider lazy-loading heavy chart code, settings content and nonessential panel functionality only when it does not degrade basic interaction or create visual/hydration problems.

Do not lazy-load the initial shell, search, essential layer selection or provenance in a way that makes the app unusable. Do not break first-run default, query restore or globe fallbacks.

Do not introduce a bundle analyzer if a small script over existing build manifests can measure the contractual budget robustly. If an analyzer is actually necessary, justify its cost and confirm it is a static build tool, not browser automation.

### CI behaviour

Add the bundle budget step after the build in `.github/workflows/ci.yml` (or in the right existing place so manifests exist). Ensure Node 24 and npm lockfile consistency remain intact.

If the budget remains unmet, do not make the check pass by raising the threshold without approval or excluding additional shared chunks. Document the breach, work needed and accurate gate status.

### Tests

Test the size-accounting logic using small deterministic fixture manifests or fixture files, covering correct inclusion/exclusion, missing files, stable gzip calculation and threshold failure. Do not add browser tests.

### Commit

`T4.5: enforce initial bundle budget`

---

## 6. T4.6 — Automatic and Manual Low-Power Mode

### Objective

Implement the low-power capability described by the responsive/product plan: an automatic option and a user-controlled option that reduce expensive rendering effects, prefer the 2K texture tier and reduce rendering resolution/DPR where safe.

This is separate from `prefers-reduced-motion`. Reduced motion is an accessibility preference; low-power is a rendering-quality/performance choice. They must compose rather than override each other.

### Audit before designing controls

Inspect current Settings tabs, preference persistence, texture tiers, DPR handling in WebGL and WebGPU, T4.2 frame-loop lifecycle and renderer diagnostics. Reuse current preferences/state patterns.

Establish current maximum DPR rules (previously capped at 2 for fine-pointer/desktop and 1.5 for coarse-pointer paths) and the exact standard texture-tier selection. Avoid another independent capability detector if the existing shared functions provide the information.

### Expected preference model

Implement a compact persisted mode consistent with existing Settings UI. A sensible starting model is:
- **Auto:** apply low-power settings when reliable signals indicate a constrained device or data-saving condition.
- **Off:** retain the existing normal quality policy.
- **On:** force the low-power quality policy.

Confirm the PRD's exact required control semantics before implementing. If the PRD specifies a different set of controls, follow that contract. Explain the current mode and resulting status in a user-readable way.

Automatic detection may use only real, available signals (for example Save-Data, coarse pointer, a known `deviceMemory` signal, screen/DPR and render capability already detected). Unknown values must not be converted into invented hardware values. Do not make an opaque claim like “GPU is weak” without evidence.

### Low-power policy

Define and document an explicit policy shared by both 3D renderers where practical. It should include:
- Prefer the existing `standard` 2K texture tier.
- Reduce maximum DPR relative to normal mode, within an explicitly tested cap.
- Reduce or disable optional decorative effects only where code proves they are optional and their reduction will not break data or selection functionality.
- Pause/limit ambient motion when appropriate without overriding the reduced-motion preference.
- Preserve correct markers, picking, fly-to, event selection, data provenance and accessible list presentation.
- Report the current preference/mode accurately in Settings diagnostics.

Do not invent texture tiers beyond those already implemented unless a measurement proves they are needed. Do not change `textureTiers.ts` in a way that allows the normal and high-resolution texture sets to remain allocated simultaneously without a specific reason.

### Runtime changes and resource safety

Determine how preference changes should affect already-mounted renderers. If applying a new tier or DPR requires renderer reconfiguration, ensure the old resources are properly released before allocating replacement resources. Avoid duplicate 2K+4K allocations and unnecessary full-page reloads. If a safe dynamic texture downgrade is not feasible, document a precise behaviour and do not misleadingly claim it is immediate.

Persist the selected mode using the existing guarded browser-preference mechanism. Preserve deterministic SSR defaults and avoid hydration mismatches.

### Tests

Cover:
- Auto / Off / On preference persistence and hydration safety.
- Correct handling of missing capability signals.
- Texture-tier selection under each mode.
- DPR cap selection for both WebGL and WebGPU.
- Reduced-motion and low-power preferences composing without conflict.
- Mode changes while a renderer is mounted, where supported.
- No duplicate texture allocation or renderer lifecycle leaks, to the extent testable without real GPU hardware.
- Diagnostics display the selected policy truthfully.

Mocked tests must not claim to prove GPU temperature, actual battery savings, frame rates or real device memory.

### Owner verification

Manually check the normal and low-power modes on desktop and a representative mobile device, in WebGL and WebGPU where supported. Compare visual clarity, smoothness, layer interaction, markers and texture quality. Record device/browser and observations.

### Commit

`T4.6: add low-power rendering mode`

---

# Phase 5 — Reliability, Supply Chain, Test Discipline and Delivery

## 7. T5.1 — Browser E2E Testing: Cancelled

**Status: CANCELLED by explicit owner decision. Do not implement.**

Do not install/reintroduce Playwright, Cypress or alternative browser automation. Do not create browser E2E specs, browser-generated screenshots, automated visual baselines, Axe runs or a substitute browser testing stack.

Preserve ordinary Vitest unit/component/integration tests and programmatic HTTP checks. Manual browser QA belongs to the owner. If this task appears as pending in an older plan, update a later audit addendum to show `CANCELLED BY OWNER`, with the cancellation commit/reference if known, rather than treating cancellation as a defect.

There is no implementation commit required for the cancelled browser-test suite.

---

## 8. T5.2 — Quality Gates Without Browser Automation

### Scope

The historical plan listed Lighthouse CI thresholds (performance, accessibility, best practices and CLS), but browser-based audits and automated screenshots were cancelled by the owner. **Do not implement Lighthouse CI, Axe CI, browser performance CI or an alternative browser automation tool.**

Split the requirement honestly:
- Static bundle-size enforcement belongs to T4.5.
- `lint`, `typecheck`, `test`, `build`, texture budget and `npm audit` checks are non-browser CI gates.
- Live Web Vitals, accessibility scores, CLS and responsive/visual QA remain owner-manual unless the owner explicitly changes the policy.

### Required actions

1. Inspect CI and avoid duplicating checks already executed in `.github/workflows/ci.yml`.
2. Ensure T4.5's bundle-budget step runs against a fresh production build and fails clearly on a breach.
3. Ensure T5.3's dependency audit gate is placed where it can be made reliable and its policy is documented.
4. Keep Node 24, `npm ci`, lint, typecheck, Vitest and build steps consistent.
5. Document the owner-manual Web Vitals procedure without inventing current scores or claiming a Lighthouse run.
6. In the final audit, mark browser metrics as `OWNER VERIFICATION REQUIRED`, not `COMPLETE`.

### Commit

There is no standalone browser-CI implementation. Any genuinely needed non-browser gate must be committed with the relevant task (T4.5 or T5.3). Update status documentation under T5.5 or the final audit.

---

## 9. T5.3 — Supply-Chain Hardening

### Objective

Add repeatable dependency security checking and routine update visibility, without blindly applying major dependency upgrades or weakening a failing gate.

### Audit the current dependency state

Run a fresh `npm audit` (including JSON output for analysis if useful) against the current lockfile. Historical findings such as the earlier 16 advisories are not the current count until reverified.

Classify each current vulnerability by:
- Severity and advisory identifier.
- Direct vs transitive dependency.
- Production/runtime vs development/build/test exposure.
- Installed and patched versions.
- Whether a semver-compatible patch/minor update exists.
- Whether remediation causes breaking changes or conflicts with Next.js 15, React 19, Tailwind v3, Vitest or the alpha-pinned visx packages.
- Residual risk and proposed action.

Inspect `npm ls` for invalid/duplicate dependency trees and verify React/Next/Node compatibility. Keep `@visx/*` pinned as currently approved; do not swap chart libraries or do a broad unrelated dependency refresh.

### Safe remediation policy

- Apply focused compatible security patches where safe, update the lockfile, and run the full quality gates.
- Do not use `npm audit fix --force` or accept breaking major changes just to eliminate warnings.
- For unfixable or high-risk advisories, report the evidence and whether the vulnerable package reaches production code.
- Do not silently suppress audit results or lower the threshold to get a green build.
- If a high/critical advisory has no safe fix, make the CI policy's actual state explicit; do not claim the supply-chain task complete while a required gate is knowingly red. A temporary exception requires explicit owner approval, expiry/rationale and a narrow scope.

### CI audit gate

Add `npm audit --audit-level=high` at a point in CI that has a clean `npm ci` install. Ensure output is useful but does not expose secrets. Verify the step actually fails when presented with a controlled failure result where feasible, without modifying the real production lockfile to simulate a vulnerability.

Document the audit command and handling policy in `docs/development.md` and `AGENTS.md` when created.

### Weekly grouped dependency updates

Add `.github/dependabot.yml` if no equivalent configuration exists. Use npm ecosystem and GitHub Actions ecosystems as relevant, weekly scheduling, and grouped updates that minimise unmanageable PR noise. Use supported Dependabot syntax, check YAML validity and avoid a configuration that silently ignores security updates. Do not add duplicate Dependabot and Renovate configs without an explicit owner decision.

### Verification

- `npm audit --audit-level=high` and a summary of remaining advisories.
- `npm ls` / dependency consistency checks.
- `npm run lint`, `npm run typecheck`, constrained `npm test` if needed, `npm run build`.
- CI workflow/configuration inspection.

### Commit

`T5.3: add dependency security gates`

---

## 10. T5.4 — Test Coverage, Regression Discipline and Offline Safety

### Objective

Ensure the completed security, provider, caching, motion and rendering work has meaningful automated coverage and that the ordinary test suite does not depend on live external provider services.

This is a quality task, not a requirement to create redundant tests for every file or to inflate test counts.

### Audit the current tests

Verify that real tests (not merely report claims) cover the implemented contracts for:
- Secret redaction in errors/logging, including provider URLs and key values.
- Input validation for limits, bounding boxes, severity, search queries, event IDs, geocoding and imagery/GIBS parameters.
- Rate limiting, 429 response envelopes and `Retry-After` behaviour.
- Cache headers and the difference between server cache hits and client SWR caching.
- Timeouts, bounded concurrency and partial provider failures.
- Solar-position calculation and shared renderer direction.
- Real provider normalisation and transparent unavailable/simulated fallback handling.
- Heatmap data and the 250 KB gzip/request budget.
- Texture-tier choice, fallback, asset existence and the 6 MB payload budget.
- Render-loop lifecycle contracts and preference handling from T4.2.
- Marker algorithms only if T4.3 actually changes them.
- Low-power mode only after T4.6 is implemented.

Do not duplicate existing tests merely to add a new test file. Update a test when it is stale, incorrect or misses a newly changed behaviour.

### Offline/fixture discipline

Inspect provider and integration tests for unexpected real outbound network calls. Existing tests should use deterministic fixtures and mock/stub fetch at the correct boundary.

If a test can reach the public internet unexpectedly, isolate it or make the network dependency explicit and opt-in; do not make the default CI suite flaky or quota-dependent. Any global network guard must be assessed carefully so it does not break tests that deliberately provide mocked fetch implementations or local test servers.

Do not claim “zero live network dependence” based solely on a grep. Confirm through test setup and relevant execution paths. If technically feasible without a new large dependency, add a narrow test guard for unmocked outbound requests. Otherwise document the exact limitation rather than claiming network isolation.

### Coverage report

Inspect available Vitest coverage support first. Produce a coverage summary only if the required provider is already installed or a small justified tooling addition is accepted by the existing plan. Do not add browser tooling or a large dependency just to get coverage percentages. Do not invent a universal coverage threshold unless it is specified in the PRD.

Prioritise untested risky contracts over line coverage alone.

### Exit criteria

- Relevant implemented contracts have clear passing tests.
- Tests use deterministic fixtures and do not require a live provider by default.
- CI command remains stable on Node 24.
- No tests are removed merely because a refactor made them inconvenient.
- Remaining gaps are listed by severity and scope.

### Commit

`T5.4: strengthen offline regression coverage`

---

## 11. T5.5 — README, AGENTS.md, MIT License and Repository Hygiene

### Objective

Make contributor and user documentation match the final implementation and perform safe hygiene on leftover repository material.

### README truth pass

Read the entire current README and reconcile it against code, tests and the latest task reports. Update inaccuracies about:
- Application architecture and deployment (single Next.js app, same-origin `/api/v1`).
- Supported layers, sources and key requirements.
- Which data is live, partial, simulated or unavailable.
- Server cache, HTTP cache, retries, timeouts and rate limits.
- Search/geocoding/timezone limitations.
- Stats/history and heatmap data semantics/budget.
- Dotted Earth and WebGL/WebGPU renderer paths/fallbacks.
- Texture tiers and measured texture payload budget.
- Render-loop visibility/idle behaviour.
- Low-power mode once T4.6 is implemented.
- URL parameters including `layer`, `event`, `q`, `sev`, `view` and `renderer`.
- Environment variables and safe deployment instructions.
- Current testing commands, CI checks and manual-only browser validation policy.

Do not state a feature is live if the code only returns simulated/fallback data. Keep limitations and key-gated providers explicit. Do not publish credentials, key-bearing URLs or sensitive environment values.

### Create `AGENTS.md` if absent

Before writing, confirm the file does not exist in the current branch. Provide concise, actionable contributor instructions:
- Node 24 and npm setup.
- Install/build/test/lint/typecheck/texture-report/audit commands.
- One task per commit and scoped diffs.
- Never present simulated data as live; preserve `data_status`, `source`, `fetched_at` and server `meta.cache_hit` semantics.
- Keep API envelope and URL contracts stable.
- Preserve default dotted renderer, WebGL/WebGPU fallback and texture-tier contracts.
- Test render-loop lifecycle cleanup.
- No browser automation, screenshots, Lighthouse or E2E tools under the current owner decision; browser/GPU/responsive testing is performed manually by the owner.
- Do not introduce paid infrastructure, external runtime CDNs or competing chart/state libraries without approval.
- Run `npm run textures:report` if texture assets/tier configuration change.

Keep the file short enough to be used by a coding agent; do not copy the entire PRD into it.

### Add the approved MIT `LICENSE` if absent

The repository reconciliation records an explicit owner decision to use MIT. Confirm no root license exists and review repository metadata for the appropriate copyright holder. Use a verified repository/owner identifier if a legal name has not been provided; do not invent a person's full legal name. Use the standard MIT text and the actual current year at creation.

### Developer documentation

Update `docs/development.md` with the completed Phase 4 strategy, bundle budget, low-power preference, supply-chain checks, test boundaries and any limitations. Remove stale statements only when the current implementation disproves them; preserve useful historical context and link to the execution/decision records.

### Repository hygiene

The earlier reconciliation reported `kimi dot md/`, `md fils/` and `docs/prompts/` material with spaces or legacy prompts. Check whether those paths still exist and whether they are tracked before acting.

If they remain:
- Enumerate all files and read each file before moving it.
- Determine whether each file is an active instruction, referenced source, historical prompt or obsolete duplicate.
- Archive historical material under an unambiguous `docs/archive/` structure while preserving contents and references.
- Do not delete files blindly or archive `AGENTS.md`, active developer documentation, licences, current audit plans or the PRD.
- Fix links affected by path changes and ensure no tracked paths with spaces remain if that is still an accepted requirement.
- Include a move map in the completion report.

Do not tidy paths that no longer exist. Do not make speculative file moves purely to satisfy a historical inventory.

### Verification

Review links and examples in README/docs, ensure they match existing routes and filenames, then run lint/typecheck/tests/build and relevant static checks. Documentation-only portions should not change test counts unless actual tests change for a justified reason.

### Commit

`T5.5: finalise docs and repository guidance`

---

## 12. Final Whole-Project Audit (Run After Eligible Work Is Implemented)

Do not run this until T4.3–T4.6 and T5.3–T5.5 have been attempted and each has an honest disposition. T5.1 remains cancelled and T5.2 browser automation remains prohibited. Manual data-dependent gates may remain pending and must be called out.

Create or update an end-of-project audit document, preferably `docs/audit/final-project-audit.md`, without overwriting earlier audit documents.

### 12.1 Audit scope

Review the entire repository and the authoritative history of completed tasks, including:
- Architecture, server/client boundaries, URL state and composition.
- Every API route, provider, validation, timeout/concurrency rule, cache layer and data-provenance transition.
- Security headers/CSP, redaction, rate limiting and secret hygiene.
- Globe default, WebGL/WebGPU paths, fallback, texture tiers, frame-loop controls, marker scalability and low-power mode.
- Search, event selection, globe/list presentation and URL/back-forward correctness.
- Settings, diagnostics, accessibility contracts and responsive structure.
- Tests, CI gates, dependency audits, bundle budgets and texture budgets.
- README, `AGENTS.md`, `LICENSE`, design documentation, preflight and remaining audit records.
- Build output, generated artifacts, ignored files and repository hygiene.

### 12.2 Required evidence matrix

For every Phase 4 and Phase 5 task, state:
- Task ID and committed implementation reference, if any.
- Acceptance criteria and evidence paths.
- Current status: COMPLETE, PARTIAL, CANCELLED BY OWNER, DEFERRED, OWNER VERIFICATION REQUIRED, BLOCKED or NOT IMPLEMENTED.
- Automated tests and commands actually run.
- Local HTTP/runtime evidence, where applicable.
- Owner measurements or visual results supplied, where available.
- Remaining risk and next action.

Also reconcile the older Phase 3 review matrix. Later task addenda supersede stale matrix text, but preserve history and do not silently rewrite the old findings.

### 12.3 Full verification gates

Run and report the actual result of:
- `npm ci` in a clean, disposable checkout/environment if the owner's workflow permits it; do not delete or disrupt the active working tree.
- `npm run lint`
- `npm run typecheck`
- `npm test -- --minWorkers=1 --maxWorkers=2` when required by the machine's memory budget.
- `npm run build`
- `npm run textures:report`
- The implemented static bundle-budget command.
- `npm audit --audit-level=high`
- Relevant local HTTP smoke checks for the root shell, API index/health/layers and new/static asset paths. Stop servers and verify ports are released.

Do not run browser tests or automated browser-audit tools. Do not describe a check as passing unless it was actually run and its result observed.

### 12.4 Owner evidence that must not be fabricated

Leave the following owner-dependent work pending until evidence is provided:
- Actual visual comparison of texture tiers and renderer paths.
- Manual FPS/frame-time capture with 2,000 markers on desktop and mobile.
- WebGL/WebGPU measurements on at least two devices for T4.4.
- Low-power visual/performance behaviour on representative devices.
- Manual viewport and interaction verification.
- Screen-reader/contrast and clipboard permission behaviour.
- Manual Web Vitals if required by the project acceptance criteria.

Do not create fake screenshots, synthetic “real-device” results or invented performance numbers.

### 12.5 Final disposition

Choose exactly one, with reasoning:
- **COMPLETE:** all required criteria are satisfied with evidence; owner-only criteria have actual owner evidence or were not required.
- **COMPLETE WITH DOCUMENTED DEFERRALS:** remaining work has explicit owner-approved deferrals and the project criteria permit this disposition.
- **NOT COMPLETE:** required work, decision, evidence or verification remains outstanding.

The fact that every planned implementation commit exists is not enough to declare the project complete. Preserve the prior explicit Phase 3 concern about the `SentinelApp.tsx` 250-line criterion unless the owner formally re-scopes it; do not silently change the original PRD.

### Final audit commit

`T5.6: audit final project readiness`

T5.6 is a final audit deliverable, not a new application feature. If the established project numbering convention reserves T5.6, use a clearly named non-feature audit commit instead and document the naming choice.

Stop after the final audit report. Do not automatically start new work that the audit discovers; prioritise it in a separate backlog with evidence.

---

## 13. Phase 3 Items That Remain Open During This Plan

Phase 3 was last recorded as **NOT COMPLETE**. Phase 4/5 work does not close it automatically. Reconcile it honestly during the final audit.

Known items to re-check against the latest code and owner decisions:
- **T3.2:** `SentinelApp.tsx` remains 305 physical lines / 251 code-only lines. T3.18 found no clean way to meet the literal ≤250 rule; retain the partial status unless the owner formally approves a re-scoped criterion.
- **T3.5/T3.9:** owner visual checks for 375/768/1280/1920 px, long-name and 2,000-marker layouts, touch targets, mobile panel policy and hint/search overlap.
- **T3.7/T3.13:** provenance/status visual distinction, Settings diagnostics layout and real clipboard-permission failure handling.
- **T3.10:** keyboard-only path, screen reader announcements, focus ring and contrast. The automated browser/Axe path remains cancelled; manual checks are not cancelled.
- **T3.11:** reduced-motion state, mid-flight preference changes, hidden-tab behaviour and actual GPU stillness in dotted/WebGL/WebGPU modes.
- **T3.15:** globe/list toggle, Back/Forward and renderer-parameter preservation across desktop/tablet/mobile widths.
- **T3.1/T3.14:** `DESIGN.md`, `audit.md` and `preflight.md` now exist, but the preflight explicitly includes owner-verification, a not-complete copy item and documented N/A/deferred items. Do not convert all checklist boxes into checked boxes to make the file look complete.
- Any remaining owner design decisions in `docs/design/audit.md` §6 and `docs/design/preflight.md`.

Use an owner-manual checklist and collect the results before making a final project-completion claim.

---

## 14. Cross-Task Quality Rules

### Truthful data
- Every live claim must be supported by the actual provider/API status.
- `simulated`, `stale` and `unavailable` are not synonyms for live success.
- Empty live results are valid and must not be treated as errors merely because the count is zero.
- Timestamps and sources must originate from real metadata; no substitute fetch timestamp is allowed.

### API and cache stability
- Preserve `{success,data,meta}`.
- Server `meta.cache_hit` is not SWR/client-cache state.
- Keep `source`, `fetched_at`, `data_status`, TTL and `Cache-Control` semantics stable.
- Preserve request validation, timeouts, provider concurrency and retry budgets.

### Renderer and resource safety
- Keep the dotted Earth independent from 3D texture assets.
- Do not remove a renderer or fallback without evidence and explicit approval.
- Clean up every event listener, frame callback, timer, texture and GPU resource created by a task.
- Preserve texture-budget checks and report download bytes separately from GPU-memory estimates.
- Respect reduced motion and low power as separate but compatible preferences.

### CI and commit discipline
- One task = one commit with the task ID in the message.
- Node 24 and npm lockfile remain consistent.
- No hidden network requirements in the default test suite.
- No secret values in committed examples, console output or reports.
- Keep CI results and local results distinct in completion reports.
- Do not commit unrelated pre-existing user files.

### Required format for each task completion report

1. Commit hash and exact message.
2. Root-cause/audit findings.
3. What changed and why.
4. Files changed.
5. Acceptance criteria status, including anything blocked by owner data.
6. Exact lint/typecheck/test/build/asset/bundle/audit results applicable to the task.
7. What was measured, what was only inferred, and what was not measured.
8. Owner-manual checks still required.
9. Confirmation that scope restrictions and cancellation decisions were respected.

---

## 15. Final Checklist for the Repository Owner

Use this as a readiness tracker; do not mark owner-only items complete until personally verified.

### Phase 4
- [ ] T4.2 idle/hidden-tab/pause/resume behaviour manually verified in all applicable renderers.
- [ ] T4.3 2,000-marker scenario manually measured on desktop and representative mobile; target results recorded.
- [ ] T4.4 WebGL/WebGPU comparison collected on at least two physical devices; renderer decision explicitly recorded and owner-approved.
- [ ] T4.5 bundle budget calculation reviewed for correctness; CI gate has been demonstrated to fail on a controlled over-budget fixture.
- [ ] T4.6 low-power mode tested in both 3D renderers where supported; preference, texture tier, DPR, interaction and reduced-motion composition verified.
- [ ] Texture report still passes; visual texture quality and failure fallbacks manually checked.

### Phase 5
- [ ] T5.1 cancellation documented; no browser test tooling was reintroduced.
- [ ] T5.2 manual Web Vitals/accessibility limitations documented; no Lighthouse/browser CI added.
- [ ] T5.3 current advisories reviewed; npm audit CI gate and weekly grouped dependency updates configured; unresolved high/critical items documented honestly.
- [ ] T5.4 tests cover implemented security/provider/cache/rendering contracts; unexpected live internet dependence is investigated.
- [ ] T5.5 README, `AGENTS.md`, MIT `LICENSE`, developer docs and archival hygiene verified against the current codebase.
- [ ] Final whole-project audit completed with a truthful disposition and all evidence linked.

### Owner-only validation
- [ ] Globe renderer, texture and marker visual checks.
- [ ] Viewport, search, list, settings and interaction checks.
- [ ] Reduced-motion and low-power checks with actual browser/device behaviour.
- [ ] Screen-reader, keyboard, focus and contrast checks.
- [ ] Clipboard permission and diagnostics checks.
- [ ] CSP console and production deployment checks.
- [ ] Web Vitals / real device performance captures where required.

---

## 16. Recommended First Prompt to OpenCode

> Read `Earth-Sentinel-Phase-4-and-5-Execution-Plan.md` as the master execution plan. The latest reported completed tasks are T4.1 (`d6024bf`) and T4.2 (`2ca4e1e`); verify the actual current checkout before relying on those references. Start with T4.3 only. Follow the plan's one-task/one-commit discipline, owner-manual browser/GPU restrictions, data/API invariants and task gates. Do not implement browser automation or claim device performance without owner captures. Finish T4.3 with an evidence-based report, then pause at any required owner-measurement checkpoint while allowing independent tasks to proceed in later runs. Do not perform the final whole-project audit until all eligible Phase 4/5 tasks have been attempted and the relevant owner evidence has been collected or explicitly recorded as pending.
