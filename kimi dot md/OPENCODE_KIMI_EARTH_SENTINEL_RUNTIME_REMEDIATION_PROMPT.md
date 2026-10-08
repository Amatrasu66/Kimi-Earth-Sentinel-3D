# OpenCode Master Remediation Prompt — Kimi Earth Sentinel 3D Runtime, Build, and Performance Fix

## Role

You are the primary agentic coding engineer for:

https://github.com/Amatrasu66/Kimi-Earth-Sentinel-3D

The app is a Next.js 15 + React 19 + TypeScript environmental-intelligence app with a Three.js/R3F globe, WebGPU + WebGL fallback, Next.js API routes, live providers, simulated fallbacks, shadcn-style UI, and Bklit chart integration.

A frontend overhaul and a visual-correction pass have already been completed. This task is **not another redesign**. It is a runtime-stability, development-server, module-graph, dependency, startup-performance, provider-diagnostics, and verification pass.

After this task is complete, the repository will receive a separate fresh audit.

---

# 1. Current Failure

Local Windows development currently behaves like:

```text
npm run dev
→ next dev
→ Starting... ~30s
→ Compiling / ~39s
→ GET / ~78s
→ Compiling /api/v1/layers ~14s
→ ~3,600+ modules
→ native Node/V8 stacktrace
→ process exits
```

Observed native failure:

```text
Stacktrace:
ptr0=...
ptr1=...
ptr2=...
ptr3=...
ptr4=...
ptr5=...
failure_message_object=...
```

There is no ordinary JavaScript exception. Treat this as a native Node/V8 or development-toolchain stability problem until proven otherwise. Do not start by rewriting the `/api/v1/layers` handler.

---

# 2. Primary Goals

Complete all of these:

1. Stabilize the local Node/Next runtime.
2. Standardize Node 24 across local setup, package metadata, README, and CI.
3. Reproduce and isolate the native dev-server crash.
4. Determine whether the crash is tied to the Next.js development bundler/runtime path.
5. Reduce unnecessary server-side module graph expansion.
6. Reduce development startup and route compilation time materially.
7. Audit the Bklit/Visx dependency graph.
8. Audit Motion usage and remove it if not genuinely needed.
9. Keep Bklit if it remains a real project requirement and the integration is correct.
10. Add useful development-only provider/route timing diagnostics.
11. Preserve all API contracts and provenance semantics.
12. Preserve the globe architecture and behavior.
13. Preserve the completed visual overhaul.
14. Run complete engineering verification.
15. Leave the project ready for a later independent audit.

---

# 3. Critical Rules

## No visual redesign

Do not perform another frontend redesign. Preserve the current shell, intelligence, chart, overlay, and UI architecture.

Do not reintroduce old `panels/*` or `overlays/Tooltip` architecture merely to simplify code.

## Globe protected

Do not modify the globe architecture in:

```text
src/components/globe/
src/shaders/atmosphere.ts
src/lib/webgpu.ts
src/lib/geo.ts
```

Do not change renderer selection, WebGPU probing, WebGL fallback, textures, clouds, marker instancing, raycasting, fly-to behavior, camera behavior, rotation, renderer watchdog, or adaptive DPR.

## Backend/data contract protected

Do not change endpoint paths, response envelopes, `DataPoint`, `EventDetail`, `DataStatus`, severity semantics, provenance, or fallback semantics in:

```text
src/app/api/
src/server/
src/services/api.ts
src/types/
```

Preserve:

```text
LIVE
SIMULATED
STALE
UNAVAILABLE
```

exactly as currently defined.

---

# 4. Phase 1 — Runtime Standardization

Current inconsistency:

```text
package.json: Node >=20
README: Node 24+
CI: Node 24
local runtime: unknown
```

Standardize on **Node 24.x**.

Tasks:

1. Inspect actual local Node and npm versions.
2. Inspect installed Next version and lockfile state.
3. Add `.nvmrc` with the supported Node 24 line.
4. Change `package.json` `engines.node` to a bounded Node 24 range consistent with CI.
5. Update README/local-development instructions to match.
6. Keep CI aligned.

Do not perform broad framework upgrades.

---

# 5. Phase 2 — Clean Dependency Installation

Before reinstalling, record the existing dependency state and current baseline.

Then clean only what is necessary:

```text
node_modules
.next
```

Prefer `npm ci` with the committed lockfile.

Do not casually delete or regenerate `package-lock.json`.

Verify:

```bash
node -v
npm -v
npm ls next
npm ls react
npm ls react-dom
```

Check for duplicate/conflicting versions.

---

# 6. Phase 3 — Reproduce and Isolate the Native Crash

Do not change application architecture yet.

Run `npm run dev` and record:

- startup time
- `/` compile time
- `/` request time
- `/api/v1/layers` compile time
- whether the process exits
- exact error output

Then test the supported alternate Next development bundler path from the installed Next version. Use `next dev --help` if needed to identify the correct flag.

Determine whether the failure is tied to:

```text
Turbopack
or
Webpack
```

Also request independently:

```text
/
/api/health
/api/v1/health
/api/v1/layers
```

Determine the first request that triggers failure.

Before changing architecture, record a diagnosis:

```text
Observed crash trigger:
Bundler/runtime:
First failing route:
Likely module family:
Evidence:
```

Do not guess.

---

# 7. Phase 4 — Reduce API Module-Graph Coupling

The `/api/v1/layers` route is tiny, yet development compilation reports ~3,600+ modules. Investigate the import graph.

Trace:

```text
route
→ service
→ provider
→ utility
→ dependency
```

Look for:

- barrel exports
- eager provider imports
- accidental cross-imports
- client/UI modules leaking into server modules
- utilities that import unrelated providers
- broad shared modules

Goal:

```text
/api/v1/layers
→ models/layers + minimal route helpers
```

It should not unnecessarily pull USGS, Open-Meteo, EONET, FIRMS, AirNow, heatmap, imagery, or unrelated provider code.

Use narrow imports and, where justified, lazy server imports for providers needed only by specific layer requests.

Do not change behavior, caching, provenance, or error handling.

Measure route compile/module-count impact before and after.

---

# 8. Phase 5 — Development API / Provider Diagnostics

Add development-only timing instrumentation for:

```text
route total
cache lookup
provider fetch
provider normalization
fallback generation
serialization
```

For provider-backed layers, produce compact logs such as:

```text
[layer:temperature]
total: 1840ms
cache: 2ms
Open-Meteo: 1720ms
normalize: 25ms
status: LIVE
```

Requirements:

- no secrets
- no API keys
- no full payload dumps
- no per-point logging
- disabled or minimized in production
- preserve existing logging/error conventions

---

# 9. Phase 6 — Audit Bklit / Visx Dependency Weight

Bklit is a user-mandated chart source. Do not remove it blindly.

Audit:

1. Which Bklit components are used?
2. Which vendored chart files are actually required?
3. Which `@visx/*` packages are actually required?
4. Whether unused Bklit/Visx code is entering client bundles.
5. Whether imports can be narrowed.
6. Whether the chart can be dynamically loaded when needed.
7. Whether client chart modules are leaking into server graphs.

Prefer:

```text
narrow imports
component boundaries
dynamic import
tree-shaking
removing unused vendored modules
```

over rewriting Bklit internals.

Measure:

```text
route bundle
first-load JS
chart chunk
build time
dev compile time
```

Do not replace Bklit with Recharts, Chart.js, Nivo, direct Visx, or another chart library.

---

# 10. Phase 7 — Audit Motion

Search the repository for all uses of:

```text
motion
motion/react
```

Classify each use:

```text
essential
CSS-replaceable
utility-replaceable
unused
```

If Motion is only used for functionality replaceable by a small reduced-motion hook or existing CSS media-query behavior, remove the dependency.

If Motion is genuinely required by the final UI, keep it.

Do not remove it solely to make bundle numbers smaller.

Measure before/after bundle, build, dev compilation, behavior, and accessibility.

---

# 11. Phase 8 — Review `force-dynamic`

Inspect:

```text
src/app/page.tsx
```

which currently uses `dynamic = "force-dynamic"`.

Do not blindly remove it.

Test whether it is necessary with the current client-only globe boundary.

If removing it is safe and produces a measurable benefit, keep the removal. Otherwise keep it and document why.

Verify metadata, build behavior, client boundaries, and runtime behavior.

---

# 12. Phase 9 — Provider Performance Audit

Measure Open-Meteo and other provider behavior before changing it.

Inspect:

- batch counts
- batch latency
- total provider latency
- failure rates
- fallback rates
- cache hit rates

Do not change batch size or concurrency blindly.

Only optimize if measurements show a safe improvement while respecting provider rate limits.

---

# 13. Phase 10 — Provider/Fallback Integrity

Audit all eight layers:

```text
temperature
precipitation
clouds
wind
earthquakes
disasters
air_quality
wildfires
```

Verify correct semantics for:

```text
live
simulated
stale
unavailable
empty-live
provider failure
missing key
timeout
malformed response
```

An empty valid live dataset must not automatically become simulated.

A failed provider must never be presented as live.

Do not alter semantics unless a real bug is found.

---

# 14. Phase 11 — Development Startup Optimization

After the crash is understood, optimize:

- Next dev startup
- page compilation
- `/api/v1/layers` compilation
- server module graph
- chart module graph
- Three.js client graph
- duplicate dependencies
- eager imports

Do not optimize from dependency count alone. Measure actual impact.

---

# 15. Phase 12 — Dependency Hygiene

Inspect `package.json` and `package-lock.json` for:

- unused direct dependencies
- duplicate versions
- obsolete packages
- inconsistent version ranges
- unnecessary chart dependencies
- unnecessary animation dependencies
- stale packages from the old Vite/Flask architecture

Do not perform wholesale upgrades.

---

# 16. Phase 13 — Static Quality Review

Search for stale references and debris:

```text
TODO
FIXME
console.log
Vite references
Flask references
Render references
old frontend/backend paths
stale comments
unused imports
old architecture references
```

Only remove clearly incorrect/stale material.

Do not rewrite working docs unnecessarily.

---

# 17. Phase 14 — Regression Tests

Add focused tests for runtime fixes actually introduced, especially:

- service/provider selection if touched
- module/refactor behavior
- cache/fallback semantics if touched
- runtime helpers if introduced
- chart imports/data transforms if changed

Do not add artificial tests simply to increase coverage.

---

# 18. Phase 15 — Full Verification

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Then:

```bash
npm start
```

Smoke test:

```text
/
/api/health
/api/v1/health
/api/v1/layers
/api/v1/layers/temperature/data
/api/v1/layers/earthquakes/data
/api/v1/layers/wind/data
/api/v1/search?q=tokyo
```

Also verify an event detail route with a real event id when available, plus an intentional bad request/error path.

---

# 19. Runtime Matrix

Verify and report:

```text
Node 24
Next 15
React 19
```

and the supported Next development bundler paths.

Record exact versions used.

---

# 20. Browser Smoke Test

After server stability is fixed, manually inspect in a Chromium-based browser.

Verify:

- page loads
- globe loads
- WebGPU path
- WebGL fallback
- header
- layer rail
- search
- panel
- Bklit chart
- settings
- event details
- clock
- no hydration errors
- no runtime crashes in console

Do not redesign the UI during this phase.

---

# 21. Performance Verification

Compare before/after where possible:

```text
Next dev startup
/
/api/v1/layers compile
production build
route bundle
first-load JS
chart chunk
```

Also record cold/warm behavior when practical.

Correctness comes before benchmark chasing.

---

# 22. Success Criteria

The remediation succeeds only when:

### Runtime
- native Node process crash eliminated
- `npm run dev` stays alive
- `/` loads repeatedly
- `/api/v1/layers` loads repeatedly
- health routes work
- no recurring native V8 stacktrace

### Toolchain
- Node 24 is the enforced/documented runtime
- package metadata and CI agree
- `.nvmrc` exists
- lockfile remains deterministic

### Development performance
- startup materially improved
- API compile materially improved
- simple API routes no longer pull unrelated provider graphs
- no large server dependency regression

### Dependency health
- Bklit remains correct if required
- unused Visx/Bklit pieces removed where safe
- Motion kept only if justified
- no duplicate chart/animation libraries

### Data integrity
- provenance semantics unchanged
- simulated data remains labeled
- stale fallback remains correct
- provider failures remain honest

### Existing app behavior
- globe unchanged
- search unchanged
- keyboard shortcuts unchanged
- data panel behavior unchanged
- chart works
- responsive behavior preserved

### Engineering
- typecheck passes
- lint passes
- tests pass
- production build passes
- production smoke passes

---

# 23. Do Not Do These Things

Never:

- rewrite the globe
- rewrite the backend architecture
- replace Bklit without evidence
- add Recharts/Chart.js/Nivo/another chart framework
- add Redux/Zustand
- add another animation library
- perform another UI redesign
- change API contracts
- weaken provenance semantics
- weaken tests to get green
- suppress errors instead of fixing causes
- use `suppressHydrationWarning` as a generic runtime fix
- randomly upgrade all dependencies
- delete the lockfile without reason
- optimize without measuring
- declare the native crash fixed without reproducing it multiple times

---

# 24. Change Management

Work on the existing feature branch if appropriate:

```text
feat/ui-overhaul
```

Prefer focused commits such as:

```text
fix(runtime): pin and standardize Node 24
fix(dev): isolate native dev crash path
refactor(server): reduce API module graph coupling
perf(charts): reduce Bklit/Visx client graph
perf(ui): remove unnecessary Motion dependency
perf(dev): add provider timing diagnostics
perf(dev): optimize provider/module startup
chore(deps): clean unused dependencies
test(runtime): add regression coverage
```

Do not combine unrelated changes into one giant commit.

---

# 25. Final Report

Produce:

## Executive result

```text
PASS
PASS WITH FIXES
or
BLOCKED
```

## Crash diagnosis

Explain the exact trigger, runtime/bundler, root cause, and evidence.

## Runtime changes

List Node version, `.nvmrc`, package engine changes, and relevant Next configuration changes.

## Module-graph changes

Explain the cause of the large module graph and the measured improvement.

## Dependency changes

Show before/after for Bklit, Visx, Motion, and any other relevant package.

## Performance

Provide measured before/after results for startup, `/`, `/api/v1/layers`, production build, and client/chart bundle size where available.

## Provider diagnostics

Summarize what was instrumented and what the measurements showed.

## Data integrity

Confirm provenance and fallback behavior are preserved.

## Verification

Report typecheck, lint, tests, build, production smoke, and browser smoke.

## Remaining issues

Only list genuine remaining issues.

---

# 26. Stop Condition

Do not start another visual redesign after this remediation.

The goal is:

```text
STABILIZE
→ MEASURE
→ REDUCE
→ VERIFY
→ STOP
```

Leave the application with the same product behavior and visual architecture, but with a stable local runtime, reduced unnecessary development coupling, a cleaner dependency graph where possible, useful diagnostics, and reproducible engineering verification.

After this task completes, stop. The next task will be a fresh independent audit.
