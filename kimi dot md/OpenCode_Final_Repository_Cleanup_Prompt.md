# OpenCode Prompt — Final Repository Cleanup & Vercel-Ready Preparation

## Project

Repository: `Kimi-Earth-Sentinel-3D`

## Objective

The project has completed two major migrations:

1. Python/Flask backend → Next.js/TypeScript backend
2. Vite React frontend → root Next.js frontend

The application is now intended to be a single Next.js application deployed as one Vercel project.

The old architecture:

```text
Vite frontend → Render Flask backend
```

has been replaced by:

```text
Single Next.js application
├── React/Three.js frontend
└── Next.js Route Handlers
    └── TypeScript server/provider layer
```

The frontend migration has already been verified:

- `npm run lint` passes
- TypeScript passes
- 75/75 Vitest tests pass
- `next build` passes
- live production-server verification passes
- `/api/v1/*` works
- Earth UI renders
- textures load
- WebGPU remains lazy-loaded
- no Render/localhost references were found in the production application
- frontend and backend now run from the root Next.js application

The old `frontend/` and `backend/` directories were deliberately preserved during migration.

## YOUR TASK NOW

Perform the **final repository cleanup and Vercel-readiness preparation**.

This task is NOT a feature-development task.

Do not redesign the application.
Do not rewrite application logic.
Do not modify the Earth rendering architecture.
Do not modify provider behavior unless a cleanup operation requires it.
Do not deploy to Vercel yet.

The goal is to remove obsolete infrastructure and clutter while proving that the resulting root Next.js application still works.

---

# NON-NEGOTIABLE RULES

## Rule 1 — Audit before deletion

Do not immediately delete `frontend/` or `backend/`.

First inspect every file and search the entire repository for references.

A directory is safe to delete only after confirming that the active application, tests, configuration, CI, scripts, and documentation no longer depend on it.

## Rule 2 — Protect the Earth renderer

Do NOT rewrite or simplify:

- `WebGPUEarth`
- `EarthRenderer`
- `GlobeScene`
- WebGPU initialization
- WebGL fallback
- Three.js scene creation
- camera
- OrbitControls
- atmosphere
- clouds
- stars
- markers
- animation loop
- renderer selection
- WebGPU capability detection
- texture loading logic

If cleanup requires changing one of these files, stop and explain why before making the change.

## Rule 3 — Preserve API contracts

Do not change endpoint names, HTTP methods, response envelopes, provider normalization, provenance semantics, error codes, timeout semantics, or cache semantics.

Cleanup must not become another backend rewrite.

## Rule 4 — Do not blindly remove dependencies

For every dependency that appears unused:

1. Search active source files.
2. Search tests.
3. Search configuration.
4. Search scripts.
5. Search imports.
6. Confirm whether it is genuinely unused.
7. Only then remove it.

## Rule 5 — Generated files are different from source files

Generated/local artifacts may be removed once confirmed unnecessary:

```text
.next/
dist/
node_modules/
.pytest_cache/
__pycache__/
*.pyc
```

Do not commit generated artifacts.

---

# PHASE 0 — SAFETY CHECK

Before any modification:

```bash
git status
git branch --show-current
git log -5 --oneline
```

Determine whether the frontend migration has already been committed.

If unexpected uncommitted changes exist, report them before proceeding.

Then verify the current application baseline:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Use the actual scripts in `package.json` if names differ.

If the current root Next.js application does not build or tests fail before cleanup, STOP and report the failure. Do not begin deletion.

---

# PHASE 1 — FULL REPOSITORY INVENTORY

Before deleting anything, inspect the repository tree.

Identify:

```text
Root files
Root configuration
src/
src/app/
src/server/
src/components/
src/hooks/
src/lib/
src/services/
src/types/
src/shaders/
public/
tests/
docs/
.github/
frontend/
backend/
```

Also identify hidden/generated/local directories such as:

```text
.next/
node_modules/
.pytest_cache/
__pycache__/
.venv/
dist/
```

Create an internal inventory:

| Path | Type | Active? | Referenced? | Generated? | Candidate Action |
|---|---|---:|---:|---:|---|
| ... | ... | ... | ... | ... | KEEP/DELETE/MOVE/REVIEW |

Do not delete anything during this inventory stage.

---

# PHASE 2 — SEARCH FOR LEGACY ARCHITECTURE REFERENCES

Search the entire repository for:

```text
Render
render.com
render.yaml
Flask
flask
Gunicorn
gunicorn
Python
python
requirements.txt
requirements-dev.txt
APScheduler
Vite
vite
vite.config
VITE_
import.meta.env
localhost:5001
localhost:8000
localhost:3000
backend/
frontend/
```

For every result classify it:

```text
ACTIVE
TEST
DOCUMENTATION
HISTORICAL
GENERATED
OBSOLETE
```

Do not delete documentation simply because it contains historical references. Current setup instructions must not instruct users to use the retired architecture.

---

# PHASE 3 — VERIFY THE ROOT NEXT.JS APPLICATION

Confirm the actual production architecture.

Expected structure:

```text
repository/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/
│   │   │   └── v1/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   ├── types/
│   ├── shaders/
│   └── server/
│       ├── providers/
│       ├── services/
│       ├── cache/
│       └── models/
│
├── public/
│   └── textures/
│
├── package.json
├── package-lock.json
├── next.config.*
├── tsconfig.json
├── eslint.config.*
├── vitest.config.*
├── tailwind.config.*
├── postcss.config.*
├── .env.example
├── .gitignore
└── README.md
```

This is a target shape, not a requirement to move files unnecessarily.

---

# PHASE 4 — AUDIT THE OLD FRONTEND DIRECTORY

Inspect `frontend/`.

Confirm nothing active imports from `frontend/src/`.

Search for references such as:

```text
frontend/src
frontend/public
frontend/vite.config.ts
frontend/package.json
```

Inspect:

```text
frontend/package.json
frontend/package-lock.json
frontend/vite.config.ts
frontend/index.html
frontend/vitest.config.ts
frontend/next.config.*
frontend/next-env.d.ts
frontend/vercel.json
```

Determine whether any are referenced by CI, scripts, documentation, root package.json, tests, or deployment.

If the root Next.js app is fully independent and no active references remain, delete the entire `frontend/` directory. Do not preserve it as a second application.

---

# PHASE 5 — AUDIT THE OLD PYTHON BACKEND

Inspect `backend/`.

The Python backend has been replaced by:

```text
src/app/api/
src/server/
```

Confirm no active source imports the Python backend.

Search for:

```text
backend/app
backend/
from app
from backend
Flask
gunicorn
wsgi
```

Be careful with generic imports such as `from app`; classify them using repository context.

Inspect:

```text
backend/app/
backend/tests/
backend/wsgi.py
backend/requirements.txt
backend/requirements-dev.txt
backend/runtime.txt
backend/README.md
backend/.env
backend/.venv/
backend/__pycache__/
backend/.pytest_cache/
```

If `backend/.env` exists, do NOT print its contents. Do not commit or copy secrets.

If the TypeScript backend is fully verified and no active references remain, delete the obsolete Python backend and its local/generated infrastructure.

Do not retain a second backend implementation merely as a backup; Git history provides rollback.

---

# PHASE 6 — REMOVE GENERATED CLUTTER

Inspect and remove generated/local-only artifacts where appropriate:

```text
.next/
dist/
node_modules/
.pytest_cache/
__pycache__/
*.pyc
coverage/
.cache/
.turbo/
.vercel/
```

Do not delete user-authored source files.

Do not delete `public/`, `src/`, `docs/`, or `.github/` as part of generated-file cleanup.

---

# PHASE 7 — FIX `.gitignore`

Ensure `.gitignore` covers relevant generated/local artifacts, including where applicable:

```gitignore
node_modules/
.next/
dist/
coverage/
.vercel/
.pytest_cache/
__pycache__/
*.pyc
.venv/
.env
.env.local
.env.*.local
```

Merge missing rules into the existing file; do not blindly replace useful existing rules.

`.env.example` should remain tracked.
Real `.env` files containing secrets must not be committed.

---

# PHASE 8 — DEPENDENCY AUDIT

Inspect root `package.json` and compare every dependency with actual usage.

Previously identified possible unused packages include:

```text
recharts
vaul
day-picker
zod
date-fns
```

These are only candidates.

For every candidate:

```text
Search source
Search tests
Search config
Search scripts
Search imports
```

Classify:

```text
USED → KEEP
UNUSED → REMOVE
INDIRECT/REQUIRED → KEEP
UNCERTAIN → KEEP and report
```

Also identify packages that existed only for Vite and remove them if no longer needed.

Do not perform major-version upgrades. This is cleanup, not modernization.

---

# PHASE 9 — UI COMPONENT AUDIT

Inspect:

```text
src/components/ui/
```

For every UI component, search repository-wide imports and classify:

```text
USED
UNUSED
UNKNOWN
```

Delete only confirmed unused components.

Then reassess dependencies used exclusively by those components.

Do not delete components based only on visual inspection of the file tree.

---

# PHASE 10 — CONFIGURATION CLEANUP

Audit:

```text
package.json
next.config.*
tsconfig.json
eslint.config.*
vitest.config.*
tailwind.config.*
postcss.config.*
vercel.json
.env.example
.gitignore
```

Remove obsolete configuration associated with:

```text
Vite
Flask
Render
Gunicorn
Python
APScheduler
```

Do not remove valid Next.js configuration.

Do not change React strict mode or WebGPU bundling configuration without a concrete reason and verification.

---

# PHASE 11 — API CLIENT VERIFICATION

Confirm `src/services/api.ts` uses a same-origin API base such as:

```ts
const API_BASE = "/api/v1";
```

There must be no production dependency on:

```text
VITE_API_BASE_URL
VITE_API_URL
Render URL
localhost:5001
localhost:8000
```

Preserve timeout, AbortController, cancellation, error handling, response parsing, and API paths.

---

# PHASE 12 — ENVIRONMENT VARIABLE AUDIT

Inspect `.env.example`.

Keep only variables actually required by the root Next.js server/application.

Server-only secrets such as:

```text
AIRNOW_API_KEY
NASA_FIRMS_API_KEY
```

must remain server-only and must not become `NEXT_PUBLIC_*` variables.

Remove retired variables only after confirming they are no longer referenced, including:

```text
VITE_API_BASE_URL
VITE_API_URL
FLASK_ENV
SECRET_KEY
PORT
CORS_ORIGINS
SCHEDULER_ENABLED
```

---

# PHASE 13 — README / DOCUMENTATION CLEANUP

Update the main README to describe the current architecture.

It must not instruct users to use:

```text
cd frontend
python ...
flask run
gunicorn ...
Render
```

The current development flow should be approximately:

```bash
npm install
npm run dev
```

Document the current:

- Next.js frontend
- React / Three.js / React Three Fiber
- WebGPU + WebGL fallback
- Next.js API Route Handlers
- TypeScript server/provider layer
- environmental data providers
- environment variables
- Vercel deployment

Historical migration information can remain in `docs/` if useful, but current instructions must be unambiguous.

---

# PHASE 14 — CI AUDIT

Inspect `.github/` workflows.

Find workflows that still:

- install Python
- install requirements.txt
- run pytest against `backend/`
- build Vite
- use `frontend/` as working directory
- deploy Render

The final CI should operate on the root Next.js application, approximately:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Use the actual scripts from package.json.

Do not create duplicate CI pipelines.

---

# PHASE 15 — VERCEL CONFIGURATION AUDIT

Inspect:

```text
vercel.json
next.config.*
package.json
```

The final project must deploy from the repository root.

There must not be configuration telling Vercel to use `frontend/` as the application root.

There must not be Render deployment configuration.

If `vercel.json` is unnecessary, determine whether it can be removed. Do not remove it if it contains valid required configuration.

---

# PHASE 16 — SEARCH FOR STALE URLS

Search for:

```text
onrender.com
render.com
localhost:5001
localhost:8000
localhost:3000
VITE_API_URL
VITE_API_BASE_URL
```

Classify every occurrence.

The active application must not make backend requests to Render or localhost.

---

# PHASE 17 — VERIFY DATA PROVIDER REFERENCES

Confirm active server code still contains the provider architecture for:

```text
USGS
NASA EONET
NASA FIRMS
Open-Meteo
AirNow
NASA GIBS
geocode/timezone fallback
```

Confirm provider environment variables are still wired correctly.

Do not change provider URLs or behavior as part of cleanup.

---

# PHASE 18 — VERIFY PROVENANCE

The application must continue preserving the exact current provenance states, such as:

```text
LIVE
STALE
SIMULATED
DEMO
UNAVAILABLE
```

Do not remove provenance metadata.

---

# PHASE 19 — FULL TEST AFTER CLEANUP

After cleanup run:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Do not weaken or delete tests to make them pass.

If a test fails, determine whether cleanup caused it, fix only the relevant issue, and rerun the complete suite.

---

# PHASE 20 — LOCAL RUNTIME TEST

Start:

```bash
npm run dev
```

Verify the browser application.

## Page

`/` must load without hydration errors, React crashes, blank screen, or missing CSS/textures.

## Earth

Verify:

- Earth appears
- Earth is not black
- rotation works
- zoom works
- OrbitControls work
- atmosphere works
- clouds work
- stars work
- markers work
- layer switching works
- WebGPU path works where available
- WebGL fallback works

Do not rely only on HTTP 200.

---

# PHASE 21 — API RUNTIME TEST

Verify representative routes:

```text
GET /api/health
GET /api/v1/health
GET /api/v1/layers
GET /api/v1/layers/{layerId}/data
GET /api/v1/layers/{layerId}/heatmap
GET /api/v1/events/{eventId}
GET /api/v1/search
GET /api/v1/stats
GET /api/v1/stats/historical
GET /api/v1/geocode/reverse
GET /api/v1/geocode/timezones
GET /api/v1/imagery/gibs/capabilities
```

Also verify representative invalid requests and preserve the current response/error contract.

---

# PHASE 22 — BROWSER NETWORK CHECK

Open browser developer tools and verify API requests use:

```text
/api/v1/...
```

There must be no active requests to:

```text
onrender.com
localhost:5001
localhost:8000
```

The application must operate entirely through the root Next.js application.

---

# PHASE 23 — BUILD OUTPUT CHECK

Inspect the Next.js build output.

Confirm:

- API routes are present
- `/` exists
- WebGPU remains lazy-loaded
- no Python/Vite build process is required
- no Render build configuration is required

Do not perform unrelated bundle optimization.

---

# PHASE 24 — FINAL REPOSITORY SEARCH

Search for:

```text
backend/
frontend/
Flask
flask
Python
python
requirements.txt
Gunicorn
gunicorn
APScheduler
Render
render.com
render.yaml
Vite
vite
vite.config
VITE_
import.meta.env
localhost:5001
localhost:8000
```

Classify every remaining result:

```text
ACTIVE
TEST
DOCUMENTATION
HISTORICAL
GENERATED
FALSE POSITIVE
```

The final active application must have no dependency on Python, Flask, Gunicorn, Render, Vite, or old VITE API variables.

---

# PHASE 25 — REVIEW GIT DIFF

Run:

```bash
git status
git diff --stat
git diff -- package.json
git diff -- .gitignore
git diff -- README.md
```

Then inspect all other changed files.

The cleanup must not contain accidental modifications to:

- WebGPU renderer
- WebGL renderer
- Earth scene
- provider adapters
- API contracts
- UI behavior
- data normalization
- provenance logic

Investigate and revert unrelated changes.

---

# PHASE 26 — DO NOT DEPLOY YET

Do NOT deploy to Vercel in this task.

Do NOT automatically make the final production deployment.

At the end, report deployment readiness.

---

# FINAL REPORT

Produce a detailed report with:

## 1. Cleanup Summary

What was removed and why.

## 2. Deleted Directories

List every deleted directory, separating source deletion from generated-file deletion.

## 3. Deleted Files

List important deleted files.

## 4. Dependency Cleanup

Use:

| Package | Action | Reason |
|---|---|---|
| ... | Removed/Kept | ... |

## 5. Configuration Cleanup

Explain changes to package.json, TypeScript, Next.js, ESLint, Vitest, Tailwind, PostCSS, Vercel, .gitignore, and environment configuration.

## 6. Documentation Cleanup

Explain README/docs changes.

## 7. CI Cleanup

Explain workflow changes.

## 8. Legacy Reference Search

Use:

| Reference | Remaining Occurrences | Classification |
|---|---:|---|
| Python | ... | ... |
| Flask | ... | ... |
| Render | ... | ... |
| Vite | ... | ... |
| VITE_ | ... | ... |

## 9. Tests

Report exact results for:

```text
Lint:
Typecheck:
Vitest:
Production build:
```

## 10. Runtime Verification

Report:

```text
Home page:
Earth rendering:
WebGPU:
WebGL:
Textures:
Layers:
Events:
Search:
Stats:
Imagery:
Geocode:
```

## 11. Final Repository Tree

Show the important final structure.

## 12. Vercel Readiness

Answer explicitly:

```text
Is the root repository ready to deploy as one Vercel Next.js project?
YES / NO
```

If NO, list exactly what remains.

## 13. Remaining Manual Steps

List only actions that must be performed outside this cleanup task, such as Vercel project root configuration, environment variables, domain configuration, production deployment, and production smoke testing.

Do not claim deployment is complete.

---

# DEFINITION OF DONE

This task is complete only when:

- [ ] old `frontend/` removed after reference verification
- [ ] old `backend/` removed after reference verification
- [ ] Python runtime infrastructure removed
- [ ] Flask removed
- [ ] Gunicorn removed
- [ ] Render configuration removed
- [ ] Vite infrastructure removed
- [ ] generated clutter ignored/removed
- [ ] unused dependencies removed after verification
- [ ] unused UI components removed after verification
- [ ] README describes current Next.js architecture
- [ ] CI describes current Next.js architecture
- [ ] environment configuration is clean
- [ ] no Render API URL remains in active code
- [ ] no VITE API variables remain in active code
- [ ] API remains `/api/v1/*`
- [ ] backend API contracts remain unchanged
- [ ] provider behavior remains unchanged
- [ ] provenance remains intact
- [ ] Earth renderer remains intact
- [ ] WebGPU remains intact
- [ ] WebGL fallback remains intact
- [ ] lint passes
- [ ] typecheck passes
- [ ] all tests pass
- [ ] production build passes
- [ ] local UI verification passes
- [ ] local API verification passes
- [ ] final repository search completed
- [ ] final Git diff reviewed
- [ ] Vercel readiness assessed
- [ ] no Vercel deployment performed yet

# FINAL INSTRUCTION

The project has already undergone the difficult architectural migrations.

Do not treat this as an opportunity to redesign the codebase.

Your job is now:

```text
AUDIT
  ↓
VERIFY
  ↓
REMOVE OBSOLETE INFRASTRUCTURE
  ↓
PRUNE CONFIRMED DEAD CODE
  ↓
CLEAN CONFIGURATION
  ↓
CLEAN DOCUMENTATION
  ↓
RUN COMPLETE TEST SUITE
  ↓
RUN PRODUCTION BUILD
  ↓
VERIFY THE ACTUAL EARTH UI
  ↓
VERIFY ALL API ROUTES
  ↓
FINAL REPOSITORY SEARCH
  ↓
REPORT VERCEL READINESS
```

The desired final result is a clean repository containing **one Next.js application** with:

```text
Next.js frontend
        +
Next.js Route Handlers
        +
TypeScript server services
        +
provider adapters
        +
Three.js/WebGPU/WebGL Earth renderer
```

There must be no production dependency on the old:

```text
Vite frontend
Python backend
Flask
Render
Gunicorn
APScheduler
```

Do not deploy yet.
