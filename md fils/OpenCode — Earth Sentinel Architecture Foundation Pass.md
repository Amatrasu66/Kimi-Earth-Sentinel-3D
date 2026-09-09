You are working on the repository:

Kimi-Earth-Sentinel-3D

This is a React + TypeScript + Three.js frontend with a Flask backend that aggregates environmental data from external providers.

IMPORTANT ARCHITECTURE DECISION:

For this phase, DO NOT introduce any database.

Do NOT add:
- PostgreSQL
- PostGIS
- Supabase
- Redis
- Celery
- RabbitMQ
- Kafka
- Kubernetes
- Microservices
- A separate worker service
- Any other unnecessary infrastructure

The application should remain:

Vercel
  ↓ HTTPS
React + TypeScript + Three.js frontend
  ↓
Render
Flask + Gunicorn backend
  ↓
External environmental data providers

Use the existing in-memory cache for now.

The objective of this task is NOT to add major new product features.

The objective is to establish a clean, reliable, maintainable foundation so that we can build and polish the product on top of it in later phases.

==================================================
PHASE 1 — FULL REPOSITORY AUDIT
==================================================

Before changing code:

1. Inspect the entire repository.
2. Understand the current frontend/backend architecture.
3. Identify duplicated logic, dead code, incorrect abstractions, fragile error handling, unnecessary complexity, and architectural inconsistencies.
4. Inspect:
   - frontend API layer
   - React state management
   - Three.js/R3F components
   - Flask app factory
   - routes
   - services
   - provider adapters
   - caching
   - validation
   - provenance/status handling
   - scheduler
   - configuration
   - tests
   - deployment configuration
   - environment handling
5. Do not blindly rewrite working code.
6. Preserve existing functionality unless there is a concrete reason to change it.

After the audit, implement the improvements below.

==================================================
PHASE 2 — ESTABLISH THE ARCHITECTURAL BOUNDARIES
==================================================

Keep the existing repository structure unless restructuring is genuinely necessary.

The important thing is to enforce these logical boundaries:

FRONTEND

UI
↓
Application/state logic
↓
API client
↓
Backend API

BACKEND

HTTP routes/controllers
↓
Application/service layer
↓
Provider adapters
↓
External APIs

Routes should NOT contain provider-specific business logic.

Provider implementations should NOT know about Flask request objects.

Frontend components should NOT construct arbitrary backend URLs themselves.

Keep provider-specific implementation details isolated behind service/provider boundaries.

Do not create abstractions purely for the sake of abstraction.

==================================================
PHASE 3 — FIX THE CURRENT BACKEND ARCHITECTURE
==================================================

Review and improve the Flask backend.

1. Keep the Flask application factory.

2. Keep versioned API routes under:

   /api/v1/*

3. Keep the health endpoint.

4. Keep JSON error handling.

5. Ensure configuration is centralized.

6. Ensure external provider URLs and configuration values come from configuration/environment variables where appropriate.

7. Remove hardcoded provider URLs when configuration already exists for them.

8. Fix the NASA FIRMS implementation so it uses the configured NASA FIRMS URL instead of duplicating a hardcoded endpoint.

9. Fix any remaining deprecated datetime usage.

In particular, search the entire backend for:

   datetime.utcnow()

Replace it with timezone-aware UTC datetime handling.

10. Review all provider adapters and ensure they have a consistent responsibility:

   external request
   ↓
   provider response
   ↓
   normalization
   ↓
   canonical application data

11. Provider failures should be distinguishable from application/programming errors.

12. Do NOT use broad:

   except Exception:

as a mechanism to silently convert programming errors into simulated data.

This is especially important in routes.

A programming bug must remain visible and testable.

Use narrow exception handling where appropriate.

If the application intentionally falls back to simulated data when an upstream provider is unavailable, make that fallback explicit and preserve the correct provenance/status.

==================================================
PHASE 4 — DATA STATUS / PROVENANCE
==================================================

Keep the existing data-status concept:

LIVE
SIMULATED
STALE
UNAVAILABLE

Make sure it is applied consistently.

The UI must never imply that simulated data is live.

Review:

- provider failures
- normalization failures
- cache hits
- stale cache
- simulated fallback
- unavailable data

Make the semantics consistent across all layer endpoints.

Do not invent new statuses unless genuinely necessary.

==================================================
PHASE 5 — CACHE ARCHITECTURE
==================================================

Keep the existing in-memory cache.

Do NOT install Redis.

However, make the cache boundary clean enough that Redis could be introduced later without rewriting the application.

Prefer a small cache abstraction such as:

CacheService
    ↓
InMemoryCache

The abstraction must remain lightweight.

Do NOT over-engineer it.

The purpose is simply to prevent application/service code from becoming tightly coupled to Flask-Caching implementation details.

Document that the current cache is process-local and that shared Redis caching can be introduced later if traffic or multi-instance deployment requires it.

==================================================
PHASE 6 — FIX THE SCHEDULER
==================================================

Inspect the current APScheduler implementation.

The current scheduler appears to register refresh jobs but does not actually perform meaningful cache warming.

Do one of the following:

A. Implement genuine cache warming correctly, including:
   - fetching the required data
   - updating the cache
   - handling failures
   - avoiding unnecessary provider calls

OR

B. If the scheduler is not currently required by the application, remove/disable the misleading scheduler implementation and document it as future functionality.

Do NOT leave a scheduler that appears operational but only logs that it refreshed data.

Prefer the simplest correct solution.

Remember:

No worker infrastructure should be introduced in this phase.

==================================================
PHASE 7 — OPEN-METEO REQUEST ARCHITECTURE
==================================================

Review the current Open-Meteo implementation carefully.

The current implementation makes individual requests for many grid points.

This can create significant request amplification.

Improve this implementation where possible.

Prefer batching/provider-supported requests rather than making one HTTP request per grid point when the provider API supports it.

Requirements:

- preserve the resulting application data format
- preserve graceful partial-failure handling
- respect configured request timeouts
- avoid unnecessarily large upstream request counts
- avoid serial network requests where safe
- do not introduce unnecessary concurrency that could cause provider rate-limit problems

Use a sensible bounded approach.

==================================================
PHASE 8 — FRONTEND API BOUNDARY
==================================================

Review the frontend API implementation.

There should be one clear API client boundary responsible for backend communication.

Ensure:

- API base URL handling is centralized
- VITE_API_BASE_URL is supported
- the legacy VITE_API_URL fallback remains only if still necessary
- request timeout behavior is consistent
- errors are normalized consistently
- requests can be cancelled/ignored safely when components unmount or requests become stale

React components should not contain duplicated fetch logic.

==================================================
PHASE 9 — FRONTEND STATE ARCHITECTURE
==================================================

Review App.tsx and surrounding components.

Do NOT introduce Zustand, Redux, or another state library unless there is a demonstrated need.

For the current single-active-layer architecture, React state is acceptable.

However:

- separate UI state from data-fetching concerns where practical
- keep API/data logic outside visual components
- avoid unnecessary prop drilling
- avoid duplicated state
- avoid effects that can cause request loops
- preserve the existing race-safe fetching behavior

Do not prematurely architect for features that do not exist yet.

The future roadmap may eventually include:

- multiple active layers
- timeline/history
- layer composition
- persistent historical data

But do NOT implement those features now.

Simply ensure the current code will not make those features unnecessarily difficult later.

==================================================
PHASE 10 — THREE.JS / PERFORMANCE REVIEW
==================================================

Do a focused performance review of the globe.

Preserve the current InstancedMesh approach.

Check for:

- unnecessary object creation inside animation loops
- unnecessary React re-renders
- unnecessary Three.js allocations
- duplicated event listeners
- expensive mouse/picking operations
- unnecessary geometry recreation
- unnecessary material recreation
- inefficient state updates

Preserve the existing optimizations such as:

- instancing
- adaptive DPR
- delta-based animation
- throttled picking
- memoization

Only change them if the audit identifies an actual issue.

Do not rewrite the rendering architecture.

==================================================
PHASE 11 — ENVIRONMENT / CONFIGURATION CLEANUP
==================================================

Review all configuration files.

Check:

- .env.example
- backend environment variables
- frontend environment variables
- render.yaml
- Vite configuration
- Python version configuration
- package.json
- requirements.txt

Make configuration naming consistent.

Remove obsolete environment variables if they are genuinely unused.

Do not remove variables merely because they are not used in one file; verify the whole project first.

Ensure production deployment configuration matches the actual application.

==================================================
PHASE 12 — TESTING
==================================================

Expand the existing tests where useful.

At minimum, test:

Backend:
- health endpoint
- layer validation
- invalid bounding boxes
- invalid limits
- invalid severity values
- provider failure fallback
- normalization failure handling
- cache behavior
- data status/provenance
- event endpoint behavior
- JSON error responses

Frontend:
- API error behavior where practical
- layer data loading/error states
- search behavior
- keyboard shortcuts
- important data-status rendering

Do not chase arbitrary test coverage percentages.

Prioritize tests around architectural boundaries and failure cases.

==================================================
PHASE 13 — ADD CI
==================================================

There currently does not appear to be a proper GitHub Actions CI workflow.

Add a minimal CI workflow.

It should run on pull requests and pushes to the main branch.

At minimum:

Frontend:
- npm install/ci
- lint
- build

Backend:
- install dependencies
- run pytest

Use the repository's actual versions/configuration.

Do not introduce unnecessary CI complexity.

==================================================
PHASE 14 — DOCUMENT THE ARCHITECTURE
==================================================

Update README.md so it accurately reflects the final architecture after this pass.

Document:

1. High-level architecture

   Vercel
      ↓
   React + Three.js
      ↓
   Render / Flask
      ↓
   Provider adapters
      ↓
   External environmental APIs

2. Current caching model:
   in-memory/process-local

3. Explicitly state:

   No database is currently required.

4. Explain why:
   The application currently retrieves environmental data from external providers and visualizes it rather than maintaining a persistent user-owned dataset.

5. Document future infrastructure only as future possibilities:

   Redis:
   shared cache if required

   PostgreSQL/PostGIS:
   persistent historical/geospatial data if required

   Worker:
   background ingestion if required

Do not present those as current dependencies.

==================================================
PHASE 15 — DO NOT FAKE FEATURES
==================================================

This is critical.

Do not silently convert unfinished functionality into something that looks production-live.

Current simulated areas should remain explicitly labelled if they cannot yet be backed by real provider data.

Pay particular attention to:

- event details
- historical statistics
- historical series
- search
- reverse geocoding
- heatmaps
- any other simulated fallback

Do not remove the SIMULATED status merely to make the UI look more impressive.

The goal is trustworthy environmental intelligence, not fake completeness.

==================================================
PHASE 16 — VALIDATION
==================================================

After making changes, run the complete validation suite.

Frontend:

npm run lint
npm run build

Backend:

pytest

Also run the Flask application locally and verify:

GET /api/health

and representative:

GET /api/v1/layers
GET /api/v1/layers/<layer>/data

Verify that the frontend can communicate with the backend.

Check browser console for:

- runtime errors
- React warnings
- Three.js warnings
- failed requests
- CORS errors

==================================================
PHASE 17 — FINAL REPORT
==================================================

At the end, provide a concise engineering report containing:

1. Files changed
2. Architectural changes
3. Bugs fixed
4. Performance improvements
5. Tests added
6. CI added
7. Commands executed
8. Test/build/lint results
9. Any remaining limitations
10. Any issues that should be addressed in the NEXT phase

Do not start implementing future roadmap features.

==================================================
IMPORTANT CONSTRAINTS
==================================================

Do NOT:

- add a database
- add Redis
- add Supabase
- add workers
- rewrite the entire application
- replace React
- replace Three.js
- replace Flask
- introduce unnecessary state-management libraries
- introduce microservices
- fake live data
- remove provenance labels
- hide errors behind simulated fallback
- perform unrelated visual redesigns
- add features from the future roadmap

This is the FOUNDATION / ARCHITECTURE HARDENING PASS.

The desired final state is:

Clean architecture
+
Reliable provider handling
+
Correct caching boundary
+
Correct error semantics
+
Lower upstream request amplification
+
Maintainable frontend boundaries
+
Basic CI
+
Accurate documentation
+
Passing tests/build/lint

Only after this phase is complete should we move on to product-level refinement and new features.