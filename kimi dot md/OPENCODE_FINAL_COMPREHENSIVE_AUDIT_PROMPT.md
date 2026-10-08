# OpenCode Prompt — Final Comprehensive Audit of Kimi Earth Sentinel 3D

## Mission

Perform a fresh, evidence-based final audit of the current Kimi Earth Sentinel 3D repository.

The project has already completed:
- frontend overhaul
- visual correction pass
- hydration fix
- runtime/development remediation
- Bklit integration and bundle split
- API provider lazy-loading
- Node 24 standardization

Do not assume previous reports are correct. Verify the current tree, runtime, tests, build, API behavior, and browser behavior independently.

This is an audit first. Do not perform another redesign.

---

## 1. Ground truth

First inspect:

```text
git status
git branch --show-current
git log --oneline -10
node -v
npm -v
npm ls next
npm ls react
npm ls react-dom
```

Inspect:

```text
package.json
package-lock.json
.nvmrc
next.config.mjs
tsconfig.json
eslint.config.mjs
components.json
README.md
docs/
```

Report:
- branch/commit
- clean/dirty working tree
- runtime versions
- framework versions
- lockfile consistency
- engine/documentation/CI consistency

---

## 2. Dependency integrity

Run:

```bash
npm ls
npm outdated
```

Do not upgrade packages simply because updates exist.

Audit especially:

```text
@bklit/bar-chart
@visx/*
motion
d3-array
Three.js
Drei
Radix
```

Check:
- duplicates
- invalid peers
- extraneous packages
- unused direct dependencies
- missing packages
- unexpected version drift

Verify the previous removal of `@number-flow/react`.

---

## 3. Node_modules corruption / Windows stability

The previous P0 was a corrupted file inside `node_modules` on a OneDrive-synced Windows worktree.

Verify current dependency integrity without unnecessarily deleting the working installation.

If practical, scan JS/TS/JSON files under `node_modules` for NUL bytes.

If an existing NUL-scan script exists, inspect and reuse it.

Report:
- scan scope
- files scanned
- corrupt files found
- result

Do not claim a clean environment without evidence.

---

## 4. Development server audit

Run:

```bash
npm run dev
```

Record:
- startup time
- `/` compile time
- `/api/v1/layers` compile time
- request latency
- process stability
- stderr
- approximate memory

Exercise:

```text
/
 /api/health
 /api/v1/health
 /api/v1/layers
 /api/v1/layers/temperature/data
 /api/v1/layers/earthquakes/data
 /api/v1/search?q=tokyo
```

Test the supported Next dev bundler paths if available.

If a native crash reappears, stop and capture:
- full stderr
- Node version
- Next version
- active bundler
- route compiling
- memory
- `node --report` or equivalent if practical

Do not suppress the failure.

---

## 5. Production build/runtime

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Verify:

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

Also verify:
- event detail
- invalid layer
- invalid route/method behavior
- no secret leakage
- no production stack-trace leakage

---

## 6. API/data integrity audit

Inspect:

```text
src/app/api/
src/server/
src/services/api.ts
src/types/
```

Verify:
- response envelopes
- HTTP status codes
- provider mappings
- validation
- timeout handling
- cache behavior
- stale fallback
- provenance

Specifically confirm:

```text
LIVE        = real provider data
SIMULATED   = fallback/mock data
STALE       = expired live data served after failed refresh
UNAVAILABLE = no usable data
```

Critical cases:
- empty live response must remain LIVE
- provider failure must not look live
- stale cache must be labeled STALE
- unknown layer must fail correctly

---

## 7. Provider audit

Inspect:

```text
src/server/providers/
src/server/services/
src/server/cache.ts
```

Verify:
- provider timeouts
- batching
- normalization
- fallback behavior
- cache TTL
- stale behavior
- memory behavior

Verify development diagnostics do not log credentials or full payloads.

Measure representative provider latency if possible.

---

## 8. Server module graph

Verify that the lazy-provider refactor in the layer service is actually working.

Inspect:

```text
src/server/services/layers.ts
```

Confirm `/api/v1/layers` does not eagerly load unrelated providers.

Look for:
- barrel imports
- circular imports
- client imports in server modules
- unnecessarily shared utilities
- accidental provider coupling

Do not chase an arbitrary module-count target. Explain the actual architectural improvement.

---

## 9. Frontend architecture

Inspect:

```text
src/components/app/
src/components/shell/
src/components/intelligence/
src/components/charts/
src/components/overlays/
src/components/ui/
src/hooks/
src/lib/
src/services/
```

Verify:
- SentinelApp remains an appropriate orchestrator
- local state remains reasonable
- no unnecessary global store
- memoization boundaries are intentional
- search/event/hover state is isolated appropriately

Do not redesign the structure.

---

## 10. Globe/performance boundary

Protected:

```text
src/components/globe/
src/shaders/atmosphere.ts
src/lib/webgpu.ts
src/lib/geo.ts
```

Verify previous behavior:
- WebGPU probing
- WebGL fallback
- marker instancing
- raycast mapping
- fly-to
- rotation
- renderer watchdog
- adaptive DPR
- atmosphere behavior

Check that `StableEarthRenderer`/memo boundaries and stable callbacks still prevent shell hover/search/typing from forcing scene rerenders.

Use React Profiler if actually available. If not, say so explicitly.

---

## 11. Hydration audit

Search for render-time dynamic values:

```text
Date.now()
new Date()
Math.random()
window
document
navigator
performance.now()
localStorage
sessionStorage
matchMedia
```

Classify each as safe, effect-only, event-only, or dangerous.

Pay particular attention to `StatusDock`.

Verify:
- initial SSR/client markup is deterministic
- UTC clock begins after hydration
- no `suppressHydrationWarning` workaround
- `aria-live="off"` remains
- hard refresh does not produce hydration errors

Use a real browser where possible.

---

## 12. Visual system audit

Read the local Taste Skill instructions:

```text
.agents/skills/design-taste-frontend/SKILL.md
.agents/skills/redesign-existing-projects/SKILL.md
.agents/skills/high-end-visual-design/SKILL.md
```

Do not redesign.

Audit the finished design for:
- unnecessary pills
- excessive rounded cards
- excessive glow/blur
- blue used decoratively
- yellow overuse
- inconsistent radius
- inconsistent spacing
- typography hierarchy
- header alignment
- layer rail alignment
- status dock alignment
- panel hierarchy

The globe remains the visual hero.

---

## 13. Globe visual audit

Verify both:

```text
WebGPU
WebGL
```

Check:
- excessive blue/cyan halo is gone
- atmosphere remains subtle
- Earth depth is preserved
- clouds/textures remain correct
- renderer parity is reasonable
- no interaction regression

Do not retune parameters unless the browser review demonstrates a real remaining defect.

---

## 14. Bklit chart audit

Inspect:

```text
src/components/charts/ValueHistogram.tsx
src/components/charts/
components.json
```

Verify:
- official Bklit integration
- current real data only
- no fabricated historical data
- no unwanted blue defaults
- correct Sentinel token overrides
- dynamic loading still works
- loading state works
- reduced motion works
- narrow viewport works
- tooltip remains usable

Do not rewrite Bklit vendor code just to avoid the existing lint exemption unless there is a real defect.

---

## 15. Shell/navigation audit

Inspect:

```text
AppHeader
CommandSearch
LayerRail
LayerHint
StatusDock
```

Verify:

### AppHeader
- alignment
- search width
- active context
- settings
- no unnecessary pills

### CommandSearch
- grouping
- ArrowUp/ArrowDown
- Enter
- Escape
- `aria-activedescendant`
- display order matches keyboard order
- regression tests still pass

### LayerRail
- consistent 40px-ish hitboxes
- even spacing
- correct active marker geometry
- desktop/mobile alignment
- `aria-pressed`

### StatusDock
- deterministic hydration
- UTC
- post-mount ticking
- no unnecessary pill styling

---

## 16. Responsive audit

Use real browser sizes if possible:

```text
1920×1080
1440×900
1280×720
1024×768
768×1024
390×844
```

Inspect:
- header
- search
- rail
- hint
- panel
- settings
- chart
- event detail
- dock
- clipping
- overflow
- overlap
- truncation
- touch targets

Mark each viewport PASS / FAIL / UNVERIFIED.

---

## 17. Accessibility audit

Check:
- keyboard navigation
- focus-visible
- ARIA semantics
- combobox/listbox/group behavior
- dialogs/sheets/tabs/switches
- touch targets
- reduced motion
- contrast
- severity not conveyed by color alone
- clock `aria-live="off"`
- keyboard-accessible event-list alternative for globe markers

Use `web-design-guidelines` if available.

---

## 18. Performance audit

Measure where possible:

### Development
- startup
- `/`
- `/api/v1/layers`
- representative data route

### Production
- build time
- route size
- first-load JS
- chart chunk

### Runtime
- memory growth
- React rerenders
- chart cost
- provider latency
- cache latency

Compare to the previous verified baseline where available:

```text
route ≈ 322 kB
first load ≈ 425 kB
tests = 90/90
```

Explain any meaningful regression.

Do not optimize blindly.

---

## 19. Dependency/bundle audit

Verify:
- Bklit is still justified
- Visx closure is minimal enough
- Motion is actually used
- no dead chart/animation libraries
- dynamic chart loading still provides the intended bundle benefit

Do not remove required dependencies merely to improve a benchmark.

---

## 20. Documentation/CI audit

Search for stale references to:

```text
Flask
Render
Vite
frontend/
backend/
VITE_API
CORS_ORIGINS
Gunicorn
APScheduler
old deployment URLs
```

Confirm the docs match the current single-Next.js architecture.

Inspect `.github/workflows/ci.yml` and ensure Node 24, `npm ci`, lint, typecheck, tests, and build agree with the repository.

---

## 21. OneDrive risk audit

Report whether the current checkout is inside OneDrive.

Check:
- working-tree status
- node_modules location
- `.next` location
- obvious sync/locking risk

Do not move or delete files automatically.

Provide a recommendation only.

---

## 22. Issue severity

Classify every finding:

### P0
Blocks development, production, data correctness, or core functionality.

### P1
Serious runtime, hydration, renderer, accessibility, responsive, or performance issue.

### P2
Moderate engineering/design/maintainability issue.

### P3
Minor polish or documentation issue.

Do not inflate severity.

---

## 23. Fix policy

This is an audit, not a redesign.

Only fix a P0/P1 issue if:
1. it is reproducible,
2. the cause is known,
3. the fix is small and safe.

For P2/P3:
- document it
- recommend it
- do not automatically expand scope

If you make a fix, rerun:
```bash
npm run typecheck
npm run lint
npm test
npm run build
```

and rerun the affected runtime check.

---

## 24. Final report

Return exactly:

### Executive Result
`PASS` / `PASS WITH FIXES` / `BLOCKED`

### Repository State
- branch
- commit
- clean/dirty
- Node
- npm
- Next
- React

### Runtime Stability
- dev server
- native crash result
- bundler results
- integrity scan

### Architecture
- frontend
- API
- providers
- cache
- globe
- shell
- intelligence
- charts

### Data Integrity
- live
- simulated
- stale
- unavailable
- empty-live
- provider failure

### Visual Audit
- halo
- chart
- header
- rail
- pills
- spacing
- typography

Clearly separate browser-verified and code-only findings.

### Accessibility
Actual results and limitations.

### Responsive
For each viewport:
`PASS / FAIL / UNVERIFIED`

### Performance
Measured startup, compile, build, bundle, provider/cache timing.

### Dependencies
Meaningful additions/removals/justifications.

### Verification
Exact results for typecheck, lint, tests, build, smoke, and browser checks.

### Issues Found

Use:

| Priority | Issue | Evidence | Status |
|---|---|---|---|

### Fixes Made During Audit
Only actual changes.

### Remaining Issues
Only genuine remaining issues.

### Final Recommendation

Choose exactly one:
- `READY TO MERGE`
- `READY FOR HUMAN BROWSER REVIEW`
- `NEEDS ANOTHER ENGINEERING PASS`
- `BLOCKED`

---

## Final Constraint

Do not start another redesign.

Do not add new libraries.

Do not upgrade the framework.

Do not chase cosmetic perfection.

The purpose of this audit is to establish the current truth of the repository after all previous implementation and remediation work.
Measure, verify, classify, and report.
