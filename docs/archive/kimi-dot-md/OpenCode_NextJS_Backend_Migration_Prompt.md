# OpenCode Prompt — Full Python/Flask → Next.js Backend Migration

## Role

You are OpenCode working inside the repository:

`https://github.com/Amatrasu66/Kimi-Earth-Sentinel-3D`

Your task is to **fully migrate the existing Python/Flask backend to a production-ready Next.js/Node.js backend**, while preserving the existing frontend contract and application behavior as closely as possible.

The final deployment target is:

- **Frontend:** Vercel
- **Backend:** Vercel, inside the same Next.js application
- **Render:** completely removed from the deployment architecture
- **Python backend:** completely retired after migration
- **Preferred runtime:** Node.js / TypeScript through Next.js Route Handlers

---

# CRITICAL OPERATING RULES

## Rule 1 — AUDIT BEFORE EDITING

**Do not edit any code immediately.**

Before making any changes, perform a complete repository audit.

You must inspect:

- every top-level directory
- every frontend directory
- every backend directory
- every backend Python file
- every backend configuration file
- every provider/service module
- every route
- every cache implementation
- every scheduler/background-task implementation
- every test
- every deployment file
- every environment/configuration file
- frontend API clients/hooks that communicate with the backend
- package manifests
- Vite configuration
- TypeScript configuration
- Render configuration
- Vercel configuration if present
- README/documentation relevant to architecture
- `.agents` / OpenCode documentation if present
- historical migration/debugging documentation if it helps explain current behavior

Do not rely only on the README.

Use the actual source code as the source of truth.

---

# PHASE 0 — PRODUCE AN AUDIT REPORT FIRST

Before modifying files, create an internal migration map.

Your audit must identify:

### Frontend → Backend communication

Determine:

- where API requests originate
- the API base URL mechanism
- every backend endpoint currently called
- HTTP methods
- query parameters
- request bodies
- response shapes
- error shapes
- timeout behavior
- cancellation behavior
- retry behavior
- loading/error handling
- environment variables used by the frontend

Pay particular attention to:

- `/api/health`
- `/api/layers`
- `/api/events`
- `/api/search`
- `/api/stats`
- `/api/imagery`
- `/api/geocode`
- event-detail related endpoints
- any additional endpoint discovered during the audit

Do not assume the list above is exhaustive.

---

# PHASE 1 — COMPLETE BACKEND INVENTORY

Inspect and document the current Python backend.

The current architecture is expected to contain concepts such as:

- Flask application factory
- configuration
- CORS
- cache service
- routes
- provider adapters
- USGS integration
- NASA EONET integration
- NASA FIRMS integration
- Open-Meteo integration
- AirNow integration
- NASA GIBS/imagery integration
- geocoding
- search
- statistics
- event details
- health endpoint
- scheduler/cache warming
- tests
- Gunicorn/Render deployment configuration

However, these are only hypotheses.

**Verify everything from the repository.**

For every Python module, determine:

1. What it does.
2. Who imports it.
3. What data it consumes.
4. What data it returns.
5. Which external API/provider it communicates with.
6. How errors are handled.
7. How timeouts are handled.
8. How caching works.
9. Whether it has side effects.
10. Whether the functionality is required in production.
11. Its frontend dependencies.
12. Its equivalent implementation required in Node.js/Next.js.

---

# PHASE 2 — MAP THE EXISTING API CONTRACT

Before rewriting anything, construct a complete API compatibility table.

For every existing endpoint record:

| Existing Endpoint | Method | Query/Body | Response | Errors | Provider(s) | Cache |
|---|---|---|---|---|---|---|

The migration must preserve the frontend-facing contract wherever practical.

The goal is:

> **Change the backend implementation, not the application's behavior.**

Do not arbitrarily rename endpoints.

Do not arbitrarily change response JSON structures.

Do not remove fields because they appear unused.

If an endpoint has legacy fields, preserve them unless there is a concrete technical reason not to.

---

# PHASE 3 — MAP ALL EXTERNAL PROVIDERS

Identify every external service used by the current backend.

Expected examples include:

- USGS
- NASA EONET
- NASA FIRMS
- Open-Meteo
- AirNow
- NASA GIBS
- geocoding providers
- any additional API discovered in the source code

For each provider document:

- base URL
- endpoint paths
- HTTP method
- authentication requirements
- API keys
- required headers
- query parameters
- request payload
- response structure
- normalization logic
- error behavior
- timeout behavior
- caching behavior
- rate-limit concerns
- fallback behavior
- whether data is LIVE, STALE, SIMULATED, DEMO, etc.

Do not invent providers.

---

# PHASE 4 — UNDERSTAND DATA PROVENANCE

This application distinguishes between real and non-real data.

Preserve the existing provenance semantics.

If the current system uses concepts such as:

- `LIVE`
- `STALE`
- `SIMULATED`
- `DEMO`
- `UNAVAILABLE`

or equivalent values, preserve them.

Do **not** silently turn simulated/mock data into something that appears live.

Do **not** silently fabricate environmental data.

If a real provider fails, preserve the existing intended fallback semantics, but make the source status explicit.

---

# PHASE 5 — DESIGN THE NEW NEXT.JS BACKEND

Only after completing the audit should you design the replacement backend.

Use:

- Next.js
- TypeScript
- App Router
- Route Handlers
- native `fetch` where appropriate
- server-only modules
- Zod or equivalent runtime validation where useful

The new architecture should conceptually look like:

```text
src/
├── app/
│   ├── api/
│   │   └── ...
│   ├── layout.tsx
│   └── page.tsx
│
├── server/
│   ├── providers/
│   │   ├── usgs.ts
│   │   ├── nasa-eonet.ts
│   │   ├── nasa-firms.ts
│   │   ├── open-meteo.ts
│   │   ├── airnow.ts
│   │   └── nasa-gibs.ts
│   │
│   ├── services/
│   │   ├── layers.ts
│   │   ├── events.ts
│   │   ├── event-detail.ts
│   │   ├── search.ts
│   │   ├── stats.ts
│   │   ├── imagery.ts
│   │   └── geocode.ts
│   │
│   ├── cache/
│   ├── validation/
│   ├── models/
│   └── config/
│
└── ...
```

This is a target architecture, not a command to blindly create every file.

Adapt the structure to the actual repository.

---

# PHASE 6 — NEXT.JS ROUTE HANDLERS

Convert Flask routes into Next.js App Router Route Handlers.

Example:

```text
GET /api/health
GET /api/layers
GET /api/events
GET /api/search
GET /api/stats
GET /api/imagery
GET /api/geocode
```

The actual list must come from the audit.

Use:

```text
app/api/<endpoint>/route.ts
```

or an appropriate nested structure.

Each route should:

1. validate input
2. call a server-side service
3. call provider adapters through services
4. normalize the result
5. return the expected JSON contract
6. return appropriate HTTP status codes
7. avoid exposing secrets
8. handle upstream failures safely
9. respect request cancellation where practical
10. avoid leaking internal stack traces

Do not put large provider implementations directly inside `route.ts`.

---

# PHASE 7 — PROVIDER ADAPTER MIGRATION

Translate each Python provider adapter into a TypeScript server-only provider module.

Do not merely mechanically translate syntax.

Preserve the underlying behavior.

For each provider:

```text
Provider API
    ↓
Provider adapter
    ↓
Normalized internal model
    ↓
Service layer
    ↓
Route Handler
    ↓
Frontend
```

The provider layer must isolate external APIs from application logic.

Example conceptual interface:

```ts
interface EnvironmentalProvider<T> {
  fetch(options: ProviderOptions): Promise<T>;
}
```

Use concrete interfaces/types appropriate to the actual project.

---

# PHASE 8 — RUNTIME VALIDATION

Use runtime validation for external API responses where it provides meaningful protection.

Prefer Zod or an equivalent lightweight validation library.

External APIs must not be trusted blindly.

For important provider responses:

```text
unknown external JSON
        ↓
schema validation
        ↓
normalized application model
```

If validation fails:

- log useful server-side diagnostic information
- return a safe application error
- do not leak sensitive information to the browser

Do not over-engineer schemas for trivial values.

---

# PHASE 9 — CACHING

The old Python backend uses an in-memory cache.

**Do not blindly port the Python in-memory cache to Vercel.**

Vercel server instances are ephemeral and can be distributed across multiple instances.

Therefore:

```ts
const cache = new Map(...)
```

must not be treated as a reliable global production cache.

Use Next.js/Vercel-compatible caching where appropriate.

Possible approaches include:

- Next.js `fetch` caching
- `revalidate`
- cache tags
- appropriate route-level caching
- a shared external cache only if genuinely necessary

Do not add Redis/Upstash merely because it is popular.

First determine whether Next.js/Vercel caching is sufficient for this project's actual workload.

Preserve existing TTL behavior as closely as practical.

Document any unavoidable caching behavior differences.

---

# PHASE 10 — SCHEDULER MIGRATION

The current backend may contain APScheduler or another background warming mechanism.

Do not mechanically port it.

A traditional always-running Python process can execute background jobs continuously.

A Vercel serverless deployment should not depend on a permanently running Node process.

Audit the existing scheduler and determine exactly what it accomplishes.

Then choose the simplest Vercel-compatible architecture.

Possible options:

1. Remove the scheduler if it is unnecessary.
2. Replace it with request-time caching.
3. Use Vercel Cron only if scheduled execution is genuinely required.
4. Use another external worker only if the workload cannot reasonably run in Vercel.

Do not create an infinite loop or long-running background process.

If Vercel Cron is required, create the appropriate configuration and secure the cron endpoint.

---

# PHASE 11 — TIMEOUTS AND ABORT SIGNALS

Preserve the current backend's timeout behavior.

Use `AbortController` / `AbortSignal` with `fetch` where appropriate.

Avoid requests that can hang indefinitely.

Example pattern:

```ts
const controller = new AbortController();

const timeout = setTimeout(
  () => controller.abort(),
  timeoutMs
);

try {
  const response = await fetch(url, {
    signal: controller.signal,
  });

  // ...
} finally {
  clearTimeout(timeout);
}
```

Use a reusable utility rather than duplicating this everywhere.

If the runtime already provides an appropriate timeout mechanism, use it instead.

---

# PHASE 12 — ERROR HANDLING

Create a consistent server-side error model.

Distinguish:

- invalid client input
- provider timeout
- provider unavailable
- provider returned malformed data
- rate limiting
- internal application errors

Use appropriate HTTP statuses.

Examples:

```text
400 — invalid request
404 — resource not found
408/504 — timeout/upstream timeout
429 — rate limited
502 — upstream provider failure
503 — service unavailable
500 — unexpected internal error
```

Do not expose:

- API keys
- internal file paths
- stack traces
- provider secrets
- unnecessary infrastructure details

---

# PHASE 13 — CORS

The new backend will live in the same Next.js/Vercel application as the frontend.

Therefore the existing Flask CORS configuration should no longer be necessary for normal browser requests.

Do not blindly port Flask-CORS.

Instead:

- use same-origin `/api/...` requests
- eliminate unnecessary cross-origin configuration
- preserve CORS only if the audit discovers an external client that genuinely requires it

---

# PHASE 14 — ENVIRONMENT VARIABLES

Audit every existing environment variable.

Create a migration table:

| Old Variable | Used By | Purpose | New Variable | Public/Server |
|---|---|---|---|---|

Important:

Server-only secrets must **not** use the `NEXT_PUBLIC_` prefix.

For example:

```env
NASA_API_KEY=
FIRMS_API_KEY=
AIRNOW_API_KEY=
```

should remain server-side variables unless the actual provider requires otherwise.

Never expose provider API keys to the browser.

Do not commit `.env` files containing secrets.

Update `.env.example` with safe placeholders.

---

# PHASE 15 — PACKAGE AND DEPENDENCY MIGRATION

Inspect:

- `backend/requirements.txt`
- Python package configuration
- frontend `package.json`
- lockfiles
- build configuration

Determine which Python dependencies are actually needed.

Remove backend Python dependencies from the final architecture.

Add only the Node dependencies genuinely required.

Avoid dependency bloat.

Prefer built-in Node/Next.js functionality when it is sufficient.

---

# PHASE 16 — TEST MIGRATION

Audit all existing Python tests.

For every test determine:

- what behavior it verifies
- whether it is still relevant
- how it maps to the TypeScript implementation

Recreate important backend tests in the Node/TypeScript environment.

At minimum test:

### Health

```text
GET /api/health
```

### Provider normalization

Each provider's important response transformations.

### Endpoint behavior

Each backend endpoint.

### Validation

Invalid query/body input.

### Error handling

Provider timeout/failure.

### Cache behavior

Where caching is important.

### Data provenance

Ensure simulated/stale/live states remain correct.

---

# PHASE 17 — DO NOT BREAK THE FRONTEND CONTRACT

This migration is backend-focused.

The frontend should continue receiving the same data shapes wherever practical.

Do not rewrite the React/Three.js application.

Do not modify:

- WebGPU renderer
- WebGL renderer
- Three.js scene
- globe rendering
- UI components
- frontend feature logic

unless absolutely necessary to make the migrated backend contract work.

If a frontend change is technically required, **do not silently make it.**

Instead:

1. identify the required frontend change
2. document the exact file
3. explain the required modification
4. preferably preserve backward compatibility so the frontend can be switched later

The migration should prioritize backend-only editing.

---

# PHASE 18 — FRONTEND API URL TRANSITION

The final architecture should use same-origin API requests.

The desired production model is:

```text
Vercel
│
├── Next.js frontend
│
└── /api/*
    └── Next.js Route Handlers
```

Instead of:

```text
Vercel frontend
      │
      ▼
Render Flask backend
```

The final frontend should eventually call:

```text
/api/layers
/api/events
/api/search
/api/stats
/api/imagery
/api/geocode
```

rather than a Render URL.

However, because this task is specifically a backend migration:

**Do not unnecessarily edit the frontend during the migration.**

At the end, produce a precise list of frontend files that must change to switch from the old Render URL to same-origin `/api`.

If possible, make the backend compatible with the existing API paths so the frontend transition is minimal.

---

# PHASE 19 — RENDER MUST BE REMOVED

The final architecture must not depend on Render.

Search the entire repository for:

```text
render.com
Render
render.yaml
gunicorn
wsgi.py
Flask
APScheduler
Python backend references
```

Determine which references are deployment-critical.

The final backend must not require:

- Render
- Gunicorn
- Flask
- Python
- a persistent Python process

Do not immediately delete files if doing so would make rollback impossible.

First complete the migration.

Then remove obsolete backend/deployment files after confirming they are no longer referenced.

Examples of files that may become obsolete:

```text
backend/
render.yaml
backend/wsgi.py
requirements.txt
Flask-specific configuration
APScheduler configuration
```

But **do not assume these exact files should be deleted**.

Only remove files after confirming through repository-wide references that they are obsolete.

---

# PHASE 20 — VERCEL DEPLOYMENT

The final application must be deployable as one Vercel project.

The intended architecture is:

```text
GitHub Repository
        │
        ▼
      Vercel
        │
        ├── Next.js frontend
        │
        └── Next.js API Route Handlers
```

Do not create a second backend deployment.

Do not create an Express server that requires a persistent process unless there is a compelling reason and it is compatible with the chosen Vercel architecture.

Prefer native Next.js Route Handlers.

Verify:

- production build
- TypeScript compilation
- route discovery
- environment variables
- server-only imports
- provider requests
- caching
- error handling
- Vercel compatibility

---

# PHASE 21 — SECURITY REVIEW

Before declaring the migration complete, audit:

### Secrets

- no API keys committed
- no server secrets imported into client modules
- no `NEXT_PUBLIC_` secrets

### Inputs

- query parameters validated
- request bodies validated
- numeric limits enforced
- URL construction protected against unsafe user input where applicable

### External requests

- only expected provider URLs are contacted
- no arbitrary user-controlled URL fetching unless explicitly intended
- timeouts exist

### Errors

- no stack traces exposed
- no environment variables exposed

### CORS

- unnecessary CORS removed

### Rate limiting

Determine whether existing rate limiting exists.

If none exists, document it as a production consideration rather than introducing a large unrelated infrastructure system.

---

# PHASE 22 — OBSERVABILITY

Preserve useful server-side logging.

Logs should help diagnose:

- provider failures
- timeouts
- malformed responses
- unexpected application errors

Avoid logging:

- API keys
- authorization headers
- sensitive user data
- complete external payloads if unnecessarily large

Use structured logs where practical.

---

# PHASE 23 — PERFORMANCE

Do not blindly optimize.

Measure the current architecture from source code and preserve important performance behavior.

Pay attention to:

- provider request count
- Open-Meteo batching
- NASA FIRMS parsing
- event normalization
- cache TTLs
- large JSON responses
- duplicate provider calls
- unnecessary sequential requests

If the Python backend currently batches requests, preserve the batching.

If the Python backend currently limits data, preserve those limits.

Do not increase data volume just because Node.js can process it.

---

# PHASE 24 — NASA FIRMS CSV PARSING

Pay special attention to the current NASA FIRMS parsing implementation.

If the Python backend manually splits CSV rows with:

```python
line.split(",")
```

do not reproduce the same fragile behavior in TypeScript.

Use a proper CSV parser or implement robust CSV parsing appropriate to the actual data.

Verify:

- quoted fields
- commas inside values
- missing fields
- malformed rows
- headers
- numeric conversion

Do not change the normalized output contract unnecessarily.

---

# PHASE 25 — GEOLOCATION / GEOCODING / TIMEZONE LOGIC

Audit the existing:

- reverse geocoding
- geocoding
- timezone calculation
- longitude-based approximations
- geographic helper logic

Determine which are real provider calls and which are approximations.

Preserve behavior during migration.

Do not accidentally turn an approximation into a claim of exact geolocation.

---

# PHASE 26 — SEARCH / SIMULATED DATA

Audit the existing search implementation.

If it currently uses bundled/mock data and is intentionally labeled simulated:

- preserve that behavior
- preserve the provenance label
- do not pretend it is a live search provider

If the application has a future real-search architecture, keep the provider boundary clean.

---

# PHASE 27 — HEALTH ENDPOINT

The health endpoint should be useful in production.

It should indicate at minimum:

- application is running
- backend version/build identifier if available
- optionally provider health information if that is already part of the existing design

Do not make `/api/health` dependent on every external provider.

A provider being down should not necessarily make the entire application report itself as dead.

---

# PHASE 28 — IMPLEMENTATION ORDER

Follow this order:

## Step 1

Audit repository.

## Step 2

Produce internal API/provider/dependency map.

## Step 3

Inspect frontend API consumers.

## Step 4

Design Next.js server architecture.

## Step 5

Create or adapt Next.js server structure.

## Step 6

Port shared models/types.

## Step 7

Port provider adapters one by one.

Recommended order:

1. health/config infrastructure
2. USGS
3. NASA EONET
4. NASA FIRMS
5. Open-Meteo
6. AirNow
7. NASA GIBS/imagery
8. geocoding
9. search
10. statistics
11. event detail

Use the actual repository dependency order if different.

## Step 8

Implement service layer.

## Step 9

Implement route handlers.

## Step 10

Implement validation.

## Step 11

Implement Vercel-compatible caching.

## Step 12

Handle scheduler/background functionality.

## Step 13

Port tests.

## Step 14

Run type checking.

## Step 15

Run tests.

## Step 16

Run production build.

## Step 17

Search for stale Python/Render references.

## Step 18

Remove obsolete backend infrastructure.

## Step 19

Run final repository audit.

---

# PHASE 29 — VALIDATION REQUIREMENTS

Do not declare success simply because:

```text
npm run build
```

passes.

The following must be verified.

### Static verification

- TypeScript passes
- lint passes if configured
- tests pass
- production build passes

### Endpoint verification

Every migrated endpoint must be exercised.

For each endpoint verify:

- status code
- response JSON
- required fields
- error behavior
- provider failure behavior

### Provider verification

Where live API keys are unavailable:

- mock the external provider
- verify normalization
- verify error handling
- verify validation

Do not fabricate successful live-provider results.

### Deployment verification

Verify that the resulting architecture is compatible with Vercel.

---

# PHASE 30 — FINAL REPOSITORY SEARCH

Before finishing, run repository-wide searches for:

```text
from flask
import flask
Flask(
gunicorn
wsgi
APScheduler
render.com
render.yaml
requirements.txt
VITE_API_URL
localhost:5000
localhost:8000
NEXT_PUBLIC_*
Python backend references
```

For every match, classify it:

```text
REQUIRED
OBSOLETE
DOCUMENTATION
TEST
FRONTEND MIGRATION REQUIRED
```

Do not blindly delete documentation references if they are historical.

But the actual production application must no longer depend on Render or Python.

---

# FILE MODIFICATION POLICY

## You MAY edit

Backend migration files required to replace the Python backend with Next.js/Node.

Examples:

- Next.js server files
- API route handlers
- provider adapters
- service modules
- server models
- server validation
- server configuration
- server tests
- package dependencies
- Vercel/Next.js deployment configuration
- environment example files
- obsolete backend deployment files when confirmed safe to remove

## You SHOULD NOT edit

Frontend application behavior.

Avoid changing:

- React UI
- Three.js globe
- WebGPU renderer
- WebGL renderer
- frontend state management
- frontend visualization logic
- styling

unless the migration cannot work without a specific frontend adjustment.

If such an adjustment is required, document it separately rather than hiding it inside the migration.

---

# IMPORTANT ARCHITECTURAL CONSTRAINT

Do NOT create this:

```text
Next.js
   ↓
Express
   ↓
Node server
```

unless the repository audit proves that a custom server is genuinely necessary.

Prefer:

```text
Next.js App Router
        ↓
Route Handlers
        ↓
Services
        ↓
Provider adapters
        ↓
External APIs
```

This keeps the application naturally compatible with Vercel.

---

# IMPORTANT VERCEL CONSTRAINT

Do not assume that a Vercel function behaves like the old Render Gunicorn process.

Do not depend on:

- persistent process memory
- permanent background loops
- local filesystem persistence
- long-running workers
- process-local cache as the source of truth

Design the migrated backend for serverless execution.

---

# TARGET ARCHITECTURE

The desired final architecture is:

```text
                     ┌───────────────────────────────┐
                     │            Vercel             │
                     │                               │
Browser ────────────►│ Next.js App                   │
                     │                               │
                     │ ┌───────────────────────────┐ │
                     │ │ React Frontend             │ │
                     │ └─────────────┬─────────────┘ │
                     │               │               │
                     │               ▼               │
                     │ ┌───────────────────────────┐ │
                     │ │ /api/* Route Handlers     │ │
                     │ └─────────────┬─────────────┘ │
                     │               │               │
                     │               ▼               │
                     │ ┌───────────────────────────┐ │
                     │ │ Server Service Layer      │ │
                     │ └─────────────┬─────────────┘ │
                     │               │               │
                     │               ▼               │
                     │ ┌───────────────────────────┐ │
                     │ │ Provider Adapters         │ │
                     │ └─────────────┬─────────────┘ │
                     └───────────────┼───────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
           NASA APIs              USGS                 Open-Meteo
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     ▼
                               AirNow / others
```

There must be **no Render dependency** in the final architecture.

---

# FINAL DELIVERABLE

When implementation is complete, provide a final migration report containing:

## 1. Audit Summary

What the original backend actually contained.

## 2. Architecture

What the new Next.js backend contains.

## 3. Endpoint Migration Table

| Endpoint | Old Flask Implementation | New Next.js Route | Status |
|---|---|---|---|

## 4. Provider Migration Table

| Provider | Old Python Module | New TypeScript Module | Status |
|---|---|---|---|

## 5. Environment Variables

| Variable | Purpose | Server-only? | Status |
|---|---|---|---|

## 6. Removed Infrastructure

List everything removed, especially:

- Flask
- Gunicorn
- Render configuration
- Python backend
- APScheduler if no longer required
- obsolete dependencies

## 7. Frontend Changes Required

Because this migration is backend-focused, explicitly list any frontend files that still need modification.

Example:

```text
frontend/src/lib/api.ts
```

and explain exactly what must change.

Do not claim the migration is completely production-ready if the frontend still points at the old Render URL.

## 8. Testing

Report:

- typecheck
- lint
- unit tests
- API tests
- production build
- any tests that could not be executed

## 9. Vercel Deployment

Explain exactly what remains to configure in Vercel.

## 10. Known Limitations

Be honest about:

- external provider rate limits
- API keys
- caching differences
- serverless execution constraints
- simulated data
- unavailable live-provider tests

---

# DEFINITION OF DONE

The migration is complete only when all of the following are true:

- [ ] Entire repository audited before implementation
- [ ] Every backend endpoint identified
- [ ] Every provider identified
- [ ] Every frontend backend dependency identified
- [ ] Flask backend replaced
- [ ] Python backend no longer required
- [ ] Next.js Route Handlers implemented
- [ ] Provider adapters implemented in TypeScript
- [ ] Service layer implemented
- [ ] Runtime validation implemented where appropriate
- [ ] Error handling implemented
- [ ] Timeouts implemented
- [ ] Vercel-compatible caching implemented
- [ ] Background scheduler handled correctly
- [ ] Secrets remain server-side
- [ ] CORS dependency removed where unnecessary
- [ ] Existing API contract preserved
- [ ] Tests migrated/added
- [ ] Production build passes
- [ ] Render dependency removed
- [ ] Obsolete Python deployment files removed or explicitly archived
- [ ] Repository-wide stale-reference search completed
- [ ] Frontend migration requirements documented
- [ ] Vercel deployment requirements documented
- [ ] Final audit completed

---

# MOST IMPORTANT INSTRUCTION

**Do not rush into coding.**

The first job is to understand the existing system.

The migration should be:

```text
AUDIT
  ↓
MAP
  ↓
DESIGN
  ↓
MIGRATE
  ↓
TEST
  ↓
VERIFY
  ↓
REMOVE RENDER/PYTHON
  ↓
FINAL AUDIT
```

Not:

```text
Start translating Python files immediately
```

The existing application already contains important behavior around environmental data, provider fallbacks, provenance, caching, request handling, and frontend expectations.

**Preserve that behavior unless there is a documented reason to change it.**

The goal is not merely to make a Next.js backend that compiles.

The goal is to produce a **functionally equivalent, cleaner, Vercel-native backend for the existing Earth Sentinel application.**
