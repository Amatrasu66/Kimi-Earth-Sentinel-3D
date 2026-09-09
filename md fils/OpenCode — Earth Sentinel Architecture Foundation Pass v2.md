You are working on:

Kimi-Earth-Sentinel-3D

This is a React + TypeScript + Three.js frontend and Flask/Python backend in a single Git repository.

The repository has already completed a foundation/architecture hardening pass.

IMPORTANT:
This task is a controlled restructuring and cleanup pass.

DO NOT start building new product features.
DO NOT add a database.
DO NOT add Redis.
DO NOT add Supabase.
DO NOT add workers.
DO NOT add microservices.
DO NOT replace React, Three.js, or Flask.

The goal is to establish the clean repository structure we will use for all future development.

==================================================
1. RESTRUCTURE THE REPOSITORY
==================================================

Current structure is approximately:

Kimi-Earth-Sentinel-3D/
├── README.md
├── render.yaml
├── .github/
└── app/
    ├── frontend files
    ├── src/
    └── backend/
        ├── wsgi.py
        ├── app/
        └── tests/

Change this to:

Kimi-Earth-Sentinel-3D/
├── frontend/
├── backend/
├── docs/
├── .github/
├── README.md
└── render.yaml

Frontend:

frontend/
├── src/
├── public/
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig*.json
├── eslint.config.js
├── postcss.config.js
├── components.json
├── .env.example
├── .gitignore
└── README.md

Backend:

backend/
├── app/
│   ├── routes/
│   ├── services/
│   ├── models/
│   ├── utils/
│   ├── scheduler/
│   ├── cache_service.py
│   ├── config.py
│   └── __init__.py
├── tests/
├── wsgi.py
├── requirements.txt
├── requirements-dev.txt
├── runtime.txt
├── .env.example
└── README.md

Do not unnecessarily rename internal modules.

Preserve the existing source organization inside frontend/src and backend/app.

==================================================
2. MOVE FILES CAREFULLY
==================================================

Move the current frontend application from:

app/

to:

frontend/

Move the current backend from:

app/backend/

to:

backend/

The resulting paths must NOT become:

frontend/backend/

or:

backend/frontend/

The frontend and backend must be siblings.

Preserve Git history where possible by using normal filesystem moves rather than deleting and recreating files.

==================================================
3. UPDATE ALL PATH REFERENCES
==================================================

After moving files, search the ENTIRE repository for references to:

app/
app/backend
app/src
app/package.json
app/package-lock.json
app/.env
app/backend/
app/backend/app
app/backend/tests

Update every legitimate reference.

Pay particular attention to:

- README.md
- render.yaml
- .github/workflows/ci.yml
- Vite config
- TypeScript config
- frontend scripts
- backend startup scripts
- test configuration
- documentation
- comments that describe paths

Do not blindly replace strings. Verify each reference.

==================================================
4. UPDATE RENDER DEPLOYMENT
==================================================

The backend is now:

backend/

Update render.yaml.

Use:

rootDir: backend

The build command should execute correctly from the backend root.

The Gunicorn entrypoint should continue using:

wsgi:app

The health check must remain:

/api/health

Preserve:

- PORT handling
- Gunicorn workers/threads
- timeout
- provider environment variables
- CORS configuration

Do not change unrelated deployment settings unless necessary.

==================================================
5. UPDATE VERCEL / FRONTEND ROOT
==================================================

The frontend is now:

frontend/

Update documentation and configuration so Vercel uses:

Root Directory = frontend

Build command:

npm run build

Output:

dist

The frontend must continue using:

VITE_API_BASE_URL

and the legacy VITE_API_URL fallback only if it is already required.

Do not hardcode a production backend URL into source code.

==================================================
6. UPDATE CI
==================================================

Update .github/workflows/ci.yml.

Frontend working directory:

frontend

Backend working directory:

backend

Frontend CI must continue running:

npm ci
npm run lint
npm test
npm run build

Backend CI must continue running:

pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests/ -q

Preserve:

- Node 20
- Python 3.12
- caching
- concurrency cancellation
- job timeout

Update cache dependency paths appropriately:

frontend/package-lock.json

backend/requirements*.txt

==================================================
7. CLEAN UP ROOT DOCUMENTATION
==================================================

Create:

docs/

Inside it create:

docs/prompts/

Move:

OpenCode — Earth Sentinel Architecture Foundation Pass.md

to:

docs/prompts/foundation-architecture-pass.md

Do not leave the OpenCode prompt in the repository root.

Do NOT move README.md out of the root.

==================================================
8. CLEAN UP FRONTEND DEAD CODE
==================================================

Audit the frontend for code that is genuinely unused.

Known candidates include:

- useStats
- useIsMobile
- nightBlend.ts

Do NOT remove them automatically.

Verify all imports and references first.

If genuinely unused:
- remove the dead source file
- remove associated tests if they only test deleted functionality
- remove imports
- remove dependencies that become unnecessary

Do not remove code simply because it is not imported from App.tsx; check the complete dependency graph.

==================================================
9. AUDIT FRONTEND DEPENDENCIES
==================================================

Inspect package.json and determine whether dependencies are actually used.

Pay particular attention to:

- react-router
- tailwindcss-animate
- tw-animate-css
- other template-generated packages

Do NOT upgrade packages in this task.

Do NOT blindly delete dependencies.

Only remove a dependency when repository-wide inspection confirms it is unused.

After removals, regenerate package-lock.json correctly with npm.

==================================================
10. SECRET KEY CONFIGURATION CONSISTENCY
==================================================

There is currently a mismatch between the SECRET_KEY placeholder/default and the production warning logic.

Make them consistent.

Requirements:

- development can use a clearly-marked placeholder
- production should not silently accept the placeholder
- warning/error behavior should use exactly the same sentinel value
- do not expose secrets

Prefer the simplest implementation.

==================================================
11. CORS REVIEW
==================================================

Review CORS configuration after the restructuring.

The backend must continue using an explicit allow-list.

Do NOT use:

*

Do not weaken CORS security.

Ensure the README clearly explains that production deployment should provide the Vercel frontend origin(s).

Do not invent preview-domain wildcard behavior unless the current CORS implementation explicitly supports it safely.

==================================================
12. AIRNOW BBOX SEMANTICS
==================================================

The AirNow provider cannot genuinely honor an arbitrary global bbox because its current upstream data source is US-oriented.

Do not silently ignore bbox.

If bbox is supplied for the AirNow-backed layer and cannot be honored:

Return a clear API validation error with an appropriate 400-level response and machine-readable error code such as:

UNSUPPORTED_PARAM

Only implement this if it matches the current backend architecture cleanly.

Do not affect layers that genuinely support bbox.

Add a test for this behavior.

==================================================
13. SCHEDULER DECISION
==================================================

Review the current APScheduler implementation in:

backend/app/scheduler/

The current application uses:

- Gunicorn with multiple workers
- process-local in-memory cache
- in-process scheduler

This means multiple workers can maintain separate schedulers and separate caches.

For this V1 architecture, do NOT introduce Redis or a worker service.

Preferred solution:

DISABLE the scheduler in production for now unless there is a strong reason it is required.

The request-time cache and stale fallback should remain fully functional without scheduler warming.

If the scheduler is retained:
- document clearly that it is process-local
- ensure production behavior is deliberate
- do not claim it provides globally shared cache warming
- ensure it does not create problematic duplicate provider traffic

Do NOT overengineer this.

The desired V1 behavior is:

request
→ process-local cache
→ provider on miss
→ cache result

No persistent background infrastructure.

Update README/render/configuration accordingly.

==================================================
14. REVIEW CACHE IMPLEMENTATION
==================================================

Keep:

CacheService
    ↓
InMemoryCache

Do not add Redis.

Verify that:

- TTL behavior is correct
- stale values remain available when intended
- cache size is bounded
- thread safety remains intact
- tests cover fresh hit/miss and stale retrieval

Do not replace this architecture.

==================================================
15. VERIFY PROVIDER BOUNDARIES
==================================================

Do a final audit of:

backend/app/routes/
backend/app/services/

Ensure routes:

- validate input
- call application services
- produce HTTP responses

Ensure services:

- contain application/data logic
- do not depend on Flask request objects unnecessarily
- maintain provenance semantics

Ensure provider implementations do not become coupled to HTTP concerns.

Do not perform another large abstraction rewrite.

==================================================
16. REVIEW APP.TSX, BUT DO NOT REWRITE IT
==================================================

App.tsx is becoming a central orchestration point.

For this task:

- inspect it
- identify obvious duplication or unnecessary state
- fix only clear low-risk issues

Do NOT introduce:
- Redux
- Zustand
- MobX
- another global state library

Do NOT split the entire application during this restructuring pass.

We will handle product-level state architecture later.

==================================================
17. VERIFY OPEN-METEO IMPLEMENTATION
==================================================

Keep the current batched Open-Meteo approach.

Verify:

- provider-supported batching
- bounded batch size
- configured REQUEST_TIMEOUT
- partial failure handling
- MAX_FETCH_POINTS behavior
- min_severity filtering
- correct provider timestamps

Do not add aggressive parallelism.

Do not increase upstream request volume.

Only fix concrete correctness problems discovered.

==================================================
18. VERIFY DATA STATUS INTEGRITY
==================================================

Every synthetic/fallback endpoint must remain clearly labelled.

Allowed statuses remain:

LIVE
SIMULATED
STALE
UNAVAILABLE

Ensure restructuring does not break provenance.

Do not make simulated data look live.

Known simulated functionality must remain explicitly documented:

- event detail
- historical statistics
- search where applicable
- reverse geocoding
- heatmaps
- provider fallbacks

==================================================
19. UPDATE PROJECT DOCUMENTATION
==================================================

Rewrite repository paths throughout README.md.

The project structure section must reflect:

frontend/
backend/
docs/
.github/

Local development should become:

Backend:

cd backend

Frontend:

cd frontend

Deployment documentation should reflect:

Vercel → frontend/

Render → backend/

Update architecture diagrams/path references accordingly.

==================================================
20. ADD A TOP-LEVEL DEVELOPMENT GUIDE
==================================================

Create:

docs/development.md

Document:

- repository structure
- how to start backend
- how to start frontend
- environment files
- test commands
- build commands
- deployment overview
- where provider integrations live
- where frontend API integration lives
- current caching approach
- explicit statement that no database or Redis is required for V1

Keep it practical rather than excessively verbose.

==================================================
21. VALIDATION
==================================================

After restructuring, run:

Frontend:

cd frontend
npm ci
npm run lint
npm test
npm run build

Backend:

cd backend
python -m pytest tests/ -q

Also run the backend locally and verify:

GET /api/health
GET /api/v1/health
GET /api/v1/layers
GET /api/v1/layers/earthquakes/data?limit=3
GET /api/v1/layers/wildfires/data?limit=3

Verify frontend startup.

Check for:

- broken imports
- TypeScript errors
- Vite errors
- missing assets
- bad alias resolution
- CORS failures
- failed API requests
- runtime React errors
- Three.js errors

==================================================
22. GIT / CHANGE SAFETY
==================================================

Do not reset, revert, or discard unrelated existing work.

Do not rewrite Git history.

Do not create a new repository.

Do not make unrelated product/UI changes.

The objective is to transform:

app/
├── frontend
└── backend

into:

frontend/
backend/

while preserving behavior.

==================================================
23. FINAL ACCEPTANCE CRITERIA
==================================================

The task is complete only when:

[ ] frontend/ exists and contains the React/Vite application

[ ] backend/ exists and contains the Flask application

[ ] no frontend files remain under app/

[ ] no backend files remain nested under frontend/

[ ] render.yaml points to backend/

[ ] CI points to frontend/ and backend/

[ ] README paths are correct

[ ] docs/development.md exists

[ ] foundation prompt is moved into docs/prompts/

[ ] no database added

[ ] no Redis added

[ ] no worker infrastructure added

[ ] scheduler behavior is deliberate and documented

[ ] unused dependencies are cleaned only when verified

[ ] genuinely dead code is removed only when verified

[ ] SECRET_KEY behavior is consistent

[ ] AirNow bbox behavior is explicit

[ ] all existing tests continue passing

[ ] frontend lint passes

[ ] frontend tests pass

[ ] frontend build passes

[ ] backend tests pass

[ ] application runs locally

[ ] deployment configuration remains valid

==================================================
24. FINAL REPORT
==================================================

At the end, provide:

1. Final repository tree
2. Files/directories moved
3. Files changed
4. Dead code removed
5. Dependencies removed, if any
6. Deployment configuration changes
7. Scheduler decision
8. API behavior changes
9. Tests/results
10. Remaining known limitations

Do not begin implementing new environmental intelligence features after finishing this task.

This pass establishes the final repository foundation.

The next phase will be product/data development.