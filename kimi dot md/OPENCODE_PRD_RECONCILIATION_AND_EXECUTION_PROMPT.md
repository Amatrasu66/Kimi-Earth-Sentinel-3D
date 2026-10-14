# OpenCode Master Execution Prompt
## Kimi Earth Sentinel 3D — PRD Reconciliation, Safe Execution, and Engineering Plan

### Purpose

You are working on the repository:

`https://github.com/Amatrasu66/Kimi-Earth-Sentinel-3D`

The user will provide a separate PRD named:

`PRD-earth-sentinel-audit-and-frontend-rework.md`

That PRD is the **source specification and backlog** for the next stage of engineering work.

However, the PRD was produced from an earlier audit and therefore MUST NOT be treated as proof that every finding is still true.

Your first responsibility is to reconcile the PRD against the **current repository state** before making product changes.

---

# 0. Absolute Rules

## 0.1 Reconciliation before implementation

Do NOT begin implementing the PRD immediately.

First determine the current truth of the repository.

Every PRD finding/task must be classified as exactly one of:

- `CONFIRMED`
- `REFUTED`
- `ALREADY FIXED`
- `STILL RELEVANT`
- `NOT VERIFIABLE`

For every classification provide concrete evidence:

`file → symbol/line → observed behavior → evidence`

Do not preserve a task merely because it exists in the PRD.

Do not delete a task merely because it sounds outdated.

Verify it.

---

## 0.2 Preserve already-completed work

The current repository has already undergone substantial engineering and frontend work.

Before changing anything, verify whether the repository already contains these categories of completed work:

- AppShell/grid-based shell composition
- current shell/intelligence separation
- GlobeStage/stage framing
- current rail/header/status-dock geometry
- current intelligence panel architecture
- Bklit chart integration
- chart code-splitting
- lazy provider loading
- server/provider caching and stale fallback behavior
- hydration-safe clock/status rendering
- WebGPU/WebGL renderer parity work
- atmosphere/halo tuning
- globe scale tuning
- hover isolation/performance work
- current responsive fixes
- Node/npm/version alignment
- dependency cleanup
- runtime/node_modules integrity remediation
- current test suite and regression tests
- current production-build verification

These are NOT assumptions to blindly trust.

Inspect the repository and confirm what exists.

Once confirmed, treat those implementations as protected unless a new reproducible defect requires modification.

---

## 0.3 Do not regress the visual system

The frontend has already gone through multiple visual correction passes.

Do NOT start another broad redesign.

Do NOT replace the current AppShell.

Do NOT replace the current globe.

Do NOT introduce a different design system.

Do NOT add new visual libraries merely to make the UI look different.

Do NOT undo the current alignment/grid work.

Do NOT turn the current application into a generic SaaS dashboard.

Visual changes should happen only when:

1. the PRD contains a still-relevant requirement,
2. the current implementation fails that requirement,
3. the failure is reproducible,
4. the proposed change has a clear acceptance criterion.

---

## 0.4 Protected architecture

Unless a concrete defect forces otherwise, preserve:

- `src/components/globe/`
- renderer implementation
- WebGPU/TSL infrastructure
- WebGL fallback
- shader architecture
- `src/lib/webgpu.ts`
- `src/lib/geo.ts`
- `src/server/`
- `src/app/api/`
- `src/services/api.ts`
- `src/types/`
- current provider contracts
- current API envelope
- current `data_status` semantics
- current provenance semantics

Do not rewrite these simply because the PRD describes an earlier architecture.

---

## 0.5 Data honesty rule

Never represent simulated, unavailable, stale, or fallback data as live.

Preserve:

```text
data_status
source
fetched_at
cache semantics
fallback semantics
provenance
```

Any provider improvement must preserve truthful status.

A feature becoming "more realistic" is not permission to remove a `SIMULATED`, `STALE`, or `UNAVAILABLE` state when it still applies.

---

## 0.6 API compatibility

Do not change:

```text
{ success, data, meta }
```

or the existing `data_status` shape unless:

- the PRD explicitly requires it,
- all affected types are updated,
- tests are updated,
- documentation is updated,
- compatibility impact is documented.

Never silently change response shapes.

---

## 0.7 No placeholder implementation

Do not:

- add TODO stubs
- create fake providers
- invent historical data
- fabricate statistics
- create decorative "real-time" claims
- leave incomplete components
- ship disabled buttons with no behavior
- add pseudo-implementations just to satisfy a checklist

If a PRD task cannot be fully implemented safely, stop that task and document why.

---

# 1. Skills Protocol

Before any UI/design implementation:

1. Discover available skills.
2. Read the relevant `SKILL.md` files.
3. Read them before changing the UI.
4. Use the actual installed skill names rather than inventing names.

At minimum, when available and relevant, inspect:

- Taste Skill redesign/audit skill
- `design-taste-frontend`
- `output-skill`
- one Taste style skill, preferably the PRD default
- Vercel `react-best-practices`
- Vercel `composition-patterns`
- Vercel `web-design-guidelines`
- Vercel `react-view-transitions`
- Vercel `vercel-optimize` only if project metrics are actually available

Do not stack multiple Taste style systems unnecessarily.

For frontend work, preserve the current visual direction unless the reconciliation proves it is incompatible with a still-relevant PRD requirement.

---

# 2. Phase 0 — Mandatory Current-State Reconciliation

This is the ONLY implementation phase you are initially authorized to execute.

Do not move into T1/T2/T3/T4/T5 yet.

## T0-A — Repository truth

Inspect:

- current branch
- git status
- recent commits
- package.json
- lockfile
- tsconfig
- Next config
- Tailwind config
- app/layout
- app/page
- API route tree
- provider/service tree
- shell tree
- globe tree
- tests
- CI
- docs
- skill configuration

Run the current verification gates.

At minimum:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Record the actual results.

Do not modify product code merely to obtain a clean baseline.

If a baseline gate fails:

- identify the failure,
- determine whether it is pre-existing,
- do not silently "fix" unrelated code during reconciliation.

---

## T0-B — Reconcile every PRD finding

Take every finding from the PRD and produce a table:

| ID | Original claim | Current status | Evidence | Task consequence |
|---|---|---|---|---|
| S-01 | ... | CONFIRMED | file/symbol | keep T1.3 |
| U-03 | ... | ALREADY FIXED | AppShell/... | skip T3.5 |
| P-05 | ... | NOT VERIFIABLE | reason | investigate later |
| B-01 | ... | REFUTED | package.json | remove task |

Use the exact PRD IDs.

Do not omit any `[V]` finding.

---

## T0-C — Verify all `[V]` findings

The PRD explicitly requires verification of its `[V]` findings.

Inspect source to answer at minimum:

- how Open-Meteo layers are sampled
- request counts/fan-out
- whether GIBS imagery is actually used
- whether keyboard shortcuts are suppressed in input fields
- where application state currently lives
- whether provider URLs can leak API keys
- whether provider failures are truthfully represented
- whether cache semantics match the PRD claims
- whether the app is still one client monolith
- whether `force-dynamic` is still present
- whether the current shell already has server/client boundaries
- whether current UI alignment issues still exist
- whether current accessibility mechanisms already solve reported problems
- whether render-loop/DPR/visibility optimizations already exist
- whether the two renderers are actually both required
- whether current API responses have security protections already added

---

# 3. Required Special Reconciliation — Frontend

The PRD contains a large frontend rework section.

Treat that section as HIGH RISK for obsolete assumptions.

Before touching the frontend, explicitly verify:

### Current architecture

Determine:

- Is `SentinelApp` still a monolith?
- What does `src/app/page.tsx` currently render?
- Is `AppShell` already present?
- Is `GlobeStage` already present?
- Is the intelligence panel already decomposed?
- Are current panels client islands?
- Which shell components can remain server-rendered?
- Is `force-dynamic` still required?
- Is URL-driven state already partially implemented?
- Is there already an existing typed fetch layer?
- Is there already request cancellation/deduplication?
- Are current accessibility alternatives already present?

### Current visual system

Inspect the current implementation for:

- shell grid
- rail alignment
- header alignment
- stage spacing
- panel alignment
- status dock
- mobile layout
- typography hierarchy
- token system
- radius discipline
- pill/card usage
- globe scale
- atmosphere
- stage decorations
- responsive breakpoints

Do NOT assume the PRD's old UI findings are still valid.

---

# 4. Required Special Reconciliation — Globe and Rendering

Before executing T4 tasks:

Inspect:

- WebGPU renderer
- WebGL renderer
- shared camera configuration
- atmosphere values
- globe scale
- render loop
- DPR
- hidden-tab behavior
- pointer/picking isolation
- marker rendering
- texture loading
- texture sizes
- resource disposal
- current renderer fallback strategy

If T4.4 proposes removing a renderer, do not remove one merely to reduce maintenance.

Require evidence from:

- actual code
- bundle impact
- runtime behavior
- at least one real testable environment if available

A renderer decision requires data.

---

# 5. Required Special Reconciliation — Data and Provider Layer

Inspect every layer/provider.

Create a current matrix:

| Layer | Provider | Live | Partial | Simulated fallback | Cache | Timeout | Provenance |
|---|---|---:|---:|---:|---|---|---|

Verify:

- earthquake data
- disaster data
- temperature
- precipitation
- cloud
- wind
- air quality
- wildfire
- event details
- heatmaps
- search
- reverse geocoding
- timezone
- stats
- historical stats
- satellite/GIBS
- day/night

Do not implement any "replace simulated with real provider" task until the current implementation has been verified.

For each provider, document:

- source
- authentication
- geographic coverage
- rate limits if known
- request pattern
- cache behavior
- failure behavior
- user-facing provenance

---

# 6. Required Special Reconciliation — Security

The PRD has several P0/P1 security findings.

Audit these carefully before changing anything:

### Secrets

Search for:

- `NEXT_PUBLIC_`
- provider keys
- API tokens
- URLs containing credentials
- console logging of provider URLs
- thrown errors containing upstream request URLs

Never print actual secrets.

### Validation

Inspect:

- query length limits
- path parameter validation
- numeric ranges
- allow-lists
- error envelope consistency

### Security headers

Inspect current:

- CSP
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- frame protection

If absent, determine whether adding them is safe for:

- WebGPU
- WebGL
- textures
- workers
- blob/data URLs
- NASA/GIBS origins
- APIs

Do not blindly enable an enforcing CSP before testing the application.

### Rate limiting

Do not blindly add an in-process token bucket to a serverless app.

First evaluate:

- deployment platform
- execution model
- whether an external/Vercel-native rate limit is already available
- whether the application can safely use IP-derived controls
- whether the user has a paid/available provider plan

Document tradeoffs before implementation.

---

# 7. Phase Selection After Reconciliation

When T0 is complete, create:

```text
docs/audit/current-state-reconciliation.md
```

It must contain:

1. baseline gates
2. repository architecture
3. current frontend architecture
4. provider matrix
5. security findings
6. dependency findings
7. performance findings
8. PRD finding reconciliation
9. obsolete task list
10. still-relevant task list
11. already-fixed task list
12. recommended execution order

Then stop.

Do NOT implement T1/T2/T3/T4/T5 in the same run unless the user explicitly instructs you to continue after reviewing the reconciliation.

---

# 8. How to Construct the Revised Execution Plan

After reconciliation, reorder the surviving tasks.

Use this priority:

## P0

Security or correctness issue that could:

- expose a secret
- break production
- allow significant API abuse
- corrupt data semantics
- misrepresent live/simulated state

## P1

Important engineering issue affecting:

- production reliability
- performance
- major accessibility failure
- data correctness
- significant API robustness
- deployment safety

## P2

Useful improvement affecting:

- maintainability
- developer experience
- minor performance
- documentation
- polish

## P3

Optional cleanup.

Do not spend time on P2/P3 work while a verified P0/P1 remains.

---

# 9. Implementation Protocol After User Approval

Once the user approves the reconciled plan:

## One task = one commit

Use:

```text
T<id>: <short summary>
```

Examples:

```text
T1.4: redact provider secrets from logs
T2.4: compute real subsolar point
T5.3: add dependency audit to CI
```

Do not combine unrelated tasks into one commit.

---

# 10. Verification After Every Implemented Task

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For changes affecting runtime behavior, additionally run:

```bash
npm run start
```

and test the affected route/function.

For API work, verify:

- success response
- failure response
- invalid input
- timeout
- provider failure
- fallback
- provenance
- cache metadata

For UI work, verify:

- desktop
- tablet
- mobile
- keyboard
- focus
- reduced motion
- loading
- empty
- unavailable
- simulated
- stale
- live

---

# 11. E2E / Browser Work

If Playwright is not installed and the PRD requires visual/e2e verification:

1. Determine whether adding it is justified.
2. Add it only if required by an approved task.
3. Do not treat source inspection as equivalent to visual verification.
4. Capture actual screenshots when visual acceptance is required.
5. Store evidence under the locations specified by the PRD.

Visual validation must be based on rendered output.

---

# 12. Avoid Unnecessary Dependency Expansion

Before adding a dependency:

Answer:

1. Why is it needed?
2. Can the current stack implement the requirement?
3. Does it increase bundle size?
4. Does it duplicate an existing capability?
5. Is it compatible with current Next/React/Node versions?
6. Is it required by the PRD?
7. Can the dependency be lazy-loaded?

Do not add:

- another state library
- another UI library
- another chart library
- another animation library

unless the approved task genuinely needs it.

---

# 13. Performance Rules

Preserve the project's current performance work.

Do not optimize based on theory alone.

Measure:

- route size
- first-load JS
- API latency
- provider latency
- render behavior
- marker count behavior
- texture loading
- DPR
- hidden-tab behavior

For any major performance claim, provide evidence.

Do not remove WebGPU or WebGL support merely because maintaining both is inconvenient.

---

# 14. Documentation Rules

Whenever behavior changes, update documentation in the same task where appropriate.

Keep accurate:

- README
- development docs
- API docs
- environment variable documentation
- provider/provenance documentation
- agent instructions

Do not leave stale architecture diagrams or old directory maps.

If the PRD's old documentation conflicts with current implementation, the current repository behavior wins after verification.

---

# 15. Final Report Format

At the end of reconciliation or an implementation phase, report:

## Executive Result

`RECONCILIATION COMPLETE` / `PASS WITH FIXES` / `BLOCKED`

## Repository State

- branch
- commit
- working tree
- Node
- npm
- Next
- React
- package integrity

## PRD Reconciliation

Table:

| ID | Status | Evidence | Action |
|---|---|---|---|

## Already Completed

List work that was already present and therefore protected.

## Obsolete Tasks

List PRD tasks that should NOT be executed and why.

## Remaining Tasks

List the approved tasks in recommended order.

## Risks

Only verified risks.

## Verification

```text
lint
typecheck
tests
build
runtime
e2e
visual
```

## Recommendation

One of:

- `READY TO IMPLEMENT APPROVED TASKS`
- `NEEDS OWNER DECISION`
- `BLOCKED`
- `READY FOR FINAL QA`

---

# 16. Explicit Stop Conditions

STOP and report instead of making changes when:

- a task conflicts with protected architecture
- the PRD assumption is proven false
- a security change could break the globe/runtime
- a provider's usage terms cannot be verified
- a requested dependency creates unnecessary duplication
- a visual change cannot be evaluated because browser tooling is unavailable
- an implementation would require inventing behavior
- a task requires owner approval according to the PRD
- a production secret may be involved

Do not improvise around these constraints.

---

# 17. What You Should Do Right Now

The user is providing the PRD separately.

Your first run must therefore do exactly this:

### Step 1
Read the complete PRD.

### Step 2
Read the current repository.

### Step 3
Load relevant installed skills and confirm availability.

### Step 4
Run the baseline gates.

### Step 5
Reconcile every PRD finding.

### Step 6
Create:

```text
docs/audit/current-state-reconciliation.md
```

### Step 7
Commit ONLY the reconciliation/audit artifacts if they are appropriate to commit.

### Step 8
STOP.

Do not automatically execute T1/T2/T3/T4/T5.

Do not redesign the frontend.

Do not rewrite the globe.

Do not change the API.

Do not add dependencies.

Do not "fix" findings until the current-state reconciliation is complete and the user has approved the surviving task list.

---

# Final Principle

The PRD tells you:

> "Here is what the project needs according to the previous audit."

The repository tells you:

> "Here is what the project actually is now."

The repository wins after verification.

Your job is to reconcile the two without destroying work that is already correct.

**First establish truth. Then establish priority. Then implement only the verified work.**
