# OpenCode Implementation Task — Earth Sentinel 3D Production Integration + Three.js WebGPU Earth Migration

You are working inside the existing repository:

`Kimi-Earth-Sentinel-3D`

Repository:
`https://github.com/Amatrasu66/Kimi-Earth-Sentinel-3D`

This is an existing production-oriented React + Three.js + Flask application. Do NOT rebuild it from scratch.

This task has TWO major goals:

1. Make the currently hosted application actually communicate with its Flask backend and make every existing UI capability that is already represented in the code work end-to-end.
2. Replace the current Earth/globe renderer with the current Three.js WebGPU/TSL Earth implementation represented by:
   `https://threejs.org/examples/webgpu_tsl_earth.html`

The new Earth renderer must become the visual foundation of Earth Sentinel without destroying the existing environmental markers, click/hover behavior, search fly-to behavior, rotation controls, UI overlays, or data architecture.

============================================================
0. IMPORTANT PROJECT RULES
============================================================

DO NOT:

- rewrite the project from scratch
- replace React
- replace Flask
- replace the existing REST API architecture
- add Redux, Zustand, MobX, or another global state library
- add PostgreSQL
- add PostGIS
- add Redis
- add Supabase
- add Celery
- add RabbitMQ
- add Kafka
- add microservices
- introduce a new backend framework
- create a second API architecture
- hardcode production URLs inside React components
- hardcode provider API keys into frontend code
- fake live data
- silently turn SIMULATED data into LIVE data
- remove provenance/data_status
- remove existing tests just to make CI pass
- remove existing event-detail functionality
- remove the existing centralized API client
- replace Three.js with another 3D engine
- redesign the whole application UI
- change the visual identity of the surrounding Sentinel UI unless necessary for integration
- blindly copy an old Three.js example without checking the installed Three.js version

The current application already has useful architecture. Preserve it.

The task is integration + implementation, not a rewrite.

============================================================
1. CURRENT ARCHITECTURE YOU MUST PRESERVE
============================================================

Current structure:

Kimi-Earth-Sentinel-3D/
├── frontend/
├── backend/
├── docs/
├── .github/
├── README.md
├── render.yaml
└── .gitignore

Frontend:

React 19
TypeScript
Vite
Three.js 0.185.x
React Three Fiber
Drei
Tailwind CSS
Radix/shadcn-style components

Backend:

Python 3.12
Flask
Gunicorn
Requests
Flask-CORS
APScheduler
structlog

Current intended runtime:

USER
  ↓
Vercel React frontend
  ↓ HTTPS
Flask API on Render
  ↓
application/service layer
  ↓
provider adapters
  ↓
USGS / NASA EONET / NASA FIRMS / Open-Meteo / AirNow / NASA GIBS

The frontend already has:

- App.tsx
- GlobeScene
- Globe
- LayerPanel
- DataPanel
- TopNav
- BottomBar
- SettingsModal
- DataStatusBanner
- useLayers
- useSearch
- useKeyboardShortcuts
- centralized services/api.ts
- typed frontend models

The backend already has:

- Flask app factory
- versioned `/api/v1`
- layer routes
- event routes
- search route
- stats routes
- geocode routes
- imagery routes
- health route
- provider adapters
- event detail service
- process-local cache
- provenance system
- validation helpers
- tests

DO NOT recreate any of these systems.

============================================================
2. FIRST TASK — FULL PRODUCTION CONNECTIVITY AUDIT
============================================================

Before changing code, inspect the entire repository.

Pay special attention to:

frontend/src/services/api.ts
frontend/src/hooks/useLayers.ts
frontend/src/hooks/useSearch.ts
frontend/src/App.tsx
frontend/src/components/globe/*
frontend/src/components/panels/*
frontend/.env.example
frontend/package.json
frontend/vite.config.ts

backend/app/__init__.py
backend/app/config.py
backend/app/routes/*
backend/app/services/*
backend/app/utils/*
backend/wsgi.py
backend/.env.example
backend/requirements.txt
render.yaml

Also inspect:

.github/workflows/ci.yml
README.md
docs/development.md

The current API client contains:

VITE_API_BASE_URL
VITE_API_URL legacy fallback
localhost fallback

This is acceptable for local development but dangerous in production if the Vercel environment variable is missing.

Determine exactly what happens in the deployed frontend.

============================================================
3. FIX THE HOSTED FRONTEND → BACKEND CONNECTION
============================================================

The production frontend must NEVER accidentally call:

http://localhost:5001/api/v1

when running on Vercel.

Implement a safe production configuration.

Required behavior:

Development:

VITE_API_BASE_URL=http://localhost:5001/api/v1

Production:

VITE_API_BASE_URL=https://<actual-render-backend>/api/v1

Use the repository's actual Render service URL if it exists.

DO NOT hardcode the URL inside App.tsx or individual components.

Keep the centralized API boundary.

Recommended behavior:

- In development, localhost fallback is allowed.
- In production, if VITE_API_BASE_URL is missing, fail loudly with a clear configuration error rather than silently calling localhost.
- The production build should make the configured API base visible through a safe diagnostic mechanism if needed, but never expose secrets.

Add a small API configuration diagnostic if useful.

For example:

GET /api/v1/health

must be testable from the deployed frontend.

Do not expose environment secrets.

============================================================
4. FIX RENDER BACKEND DEPLOYMENT
============================================================

Inspect `render.yaml`.

Verify:

- rootDir is `backend`
- Python runtime is correct
- build command installs backend requirements
- start command uses Gunicorn
- `$PORT` is respected
- health check uses `/api/health`
- scheduler is disabled in production
- required environment variables are documented
- no frontend-only configuration is being expected by Flask

The backend must respond to:

GET /api/health

and:

GET /api/v1/health

Then verify:

GET /api/v1/layers

If the hosted backend cannot be reached, determine whether this is:

- Render service not deployed
- service sleeping
- bad start command
- missing dependency
- application crash
- environment variable problem
- CORS problem
- wrong frontend URL
- wrong API base path
- route mismatch

Fix the actual root cause.

Do not hide the issue with frontend mock data.

============================================================
5. FIX PRODUCTION CORS
============================================================

Inspect:

backend/app/config.py
backend/app/__init__.py

CORS must allow the actual Vercel production origin.

For example:

https://kimi-earth-sentinel-3d.vercel.app

If the repository has a different current Vercel URL, use that actual value.

CORS must NOT become:

*

unless there is an extremely specific reason.

Preserve the explicit allow-list architecture.

Support local development:

http://localhost:3000
http://localhost:5173

and the real production frontend origin.

If Vercel preview deployments need support, document the intended approach rather than allowing arbitrary origins.

============================================================
6. VERIFY EVERY EXISTING API ENDPOINT
============================================================

Do not assume the endpoint list is correct.

Inspect every frontend API call and every backend route.

Create a mapping:

Frontend function
    ↓
HTTP method
    ↓
URL
    ↓
Backend route
    ↓
Provider/service
    ↓
Expected response shape

At minimum verify:

GET /api/v1/health

GET /api/v1/layers

GET /api/v1/layers/<layer_id>/data

GET /api/v1/layers/<layer_id>/heatmap

GET /api/v1/events/<id>

GET /api/v1/search

GET /api/v1/stats

GET /api/v1/stats/historical

GET /api/v1/geocode/reverse

GET /api/v1/timezones

GET /api/v1/imagery/gibs/capabilities

GET /api/v1/imagery/gibs/tile/<layer>/<z>/<x>/<y>

Fix any route mismatch.

Do not add duplicate endpoints if an existing endpoint can be corrected.

============================================================
7. MAKE ALL CURRENT UI CONTROLS FUNCTIONAL
============================================================

Audit every visible interactive control.

Layer buttons:

Temperature
Precipitation
Clouds
Wind
Earthquakes
Disasters
Air Quality
Wildfires

When clicked:

1. frontend updates active layer
2. API request is sent
3. backend responds
4. data is normalized
5. markers are rendered
6. DataPanel opens/updates
7. provenance is displayed

If a provider is unavailable:

show SIMULATED or STALE honestly.

Do not make the button appear broken.

============================================================
8. SEARCH MUST WORK END-TO-END
============================================================

The current search endpoint is intentionally simulated/bundled.

That is acceptable for this phase if the backend is connected.

The important requirement is:

Search box
 ↓
frontend API
 ↓
/api/v1/search
 ↓
backend
 ↓
results
 ↓
dropdown
 ↓
click result
 ↓
lat/lon
 ↓
globe fly-to

Verify that this entire path works in production.

Do not implement a real geocoding provider in this task unless the existing architecture makes it trivial and safe.

The goal here is connectivity, not a new provider.

Do not falsely label the current bundled search as live geocoding.

============================================================
9. EVENT DETAILS MUST WORK
============================================================

Preserve the existing live event architecture.

Earthquake:

frontend
 ↓
GET /api/v1/events/<USGS ID>
 ↓
USGS
 ↓
canonical EventDetail
 ↓
DataPanel

EONET:

frontend
 ↓
GET /api/v1/events/eonet-<id>
 ↓
NASA EONET
 ↓
canonical EventDetail
 ↓
DataPanel

Preserve:

- abort handling
- stale request protection
- event cache
- LIVE status
- STALE status
- SIMULATED fallback
- source attribution

Do not regress this.

============================================================
10. IMPORTANT — REPLACE THE GLOBE
============================================================

The current globe is implemented through:

frontend/src/components/globe/Globe.tsx
frontend/src/components/globe/GlobeScene.tsx

Replace the current Earth surface/rendering implementation with the visual approach from:

https://threejs.org/examples/webgpu_tsl_earth.html

The official example currently uses:

- Three.js WebGPU renderer
- `three/webgpu`
- `three/tsl`
- `MeshStandardNodeMaterial`
- TSL node-based shader logic
- day Earth texture
- night Earth texture
- bump/roughness/cloud texture
- Fresnel atmosphere
- directional sun lighting
- OrbitControls
- animated day/night appearance

Use the official current example as the reference.

Do NOT blindly copy the HTML example.

The application is React + Vite, so the implementation must be converted into a reusable React-compatible rendering component.

Reference:
https://threejs.org/examples/webgpu_tsl_earth.html

============================================================
11. IMPORTANT — DO NOT THROW AWAY THE SENTINEL FEATURES
============================================================

The new Earth must NOT be a standalone Three.js demo.

It must remain the Earth inside Earth Sentinel.

Preserve:

- environmental markers
- marker instancing
- marker severity colors
- marker click
- marker hover
- tooltip
- selected event
- layer filtering
- active layer
- search fly-to
- automatic rotation
- rotation toggle
- keyboard shortcuts
- camera behavior
- responsive sizing
- adaptive DPR/performance protections
- UI overlays
- DataPanel
- TopNav
- LayerPanel
- BottomBar
- SettingsModal

Only the Earth rendering foundation is being replaced.

============================================================
12. WEBGPU INTEGRATION STRATEGY
============================================================

Inspect the installed Three.js version before implementation.

Current dependency is Three.js 0.185.x.

Determine the correct APIs available in that installed version.

Use imports compatible with the installed package, likely along the lines of:

import * as THREE from 'three/webgpu';
import {
  ...
} from 'three/tsl';

Do NOT assume an API exists just because it exists in a newer/older example.

Use the official example corresponding to the installed Three.js version where possible.

If WebGPU renderer initialization is asynchronous in the installed version, handle it correctly.

Do not block the React UI while the renderer initializes.

Provide:

loading state
initialization failure handling
cleanup on unmount

============================================================
13. WEBGL FALLBACK
============================================================

Do not make the entire application unusable on browsers without WebGPU.

Inspect Three.js capabilities and determine a safe fallback strategy.

Preferred:

WebGPU Earth renderer
        ↓
if unsupported/fails
        ↓
existing WebGL/R3F renderer or compatible fallback

The fallback must preserve:

- Earth
- markers
- controls
- interactions
- data visualization

Do not make a second completely separate application.

If maintaining a fallback requires keeping parts of the current Globe implementation, do so.

The goal is progressive enhancement:

WebGPU when available
WebGL fallback when necessary

============================================================
14. REFACTOR GLOBE ARCHITECTURE IF NECESSARY
============================================================

The existing Globe component currently mixes:

- Earth mesh
- atmosphere
- marker rendering
- interaction
- picking
- rotation
- fly-to

Separate these concerns if needed.

A sensible architecture could be:

GlobeScene
 ├── EarthRenderer
 │    ├── WebGPUEarth
 │    └── WebGLEarthFallback
 │
 ├── EnvironmentalMarkers
 │
 ├── Atmosphere
 │
 └── InteractionController

Do not create excessive abstraction.

Only split components where it improves correctness.

============================================================
15. EARTH MATERIAL
============================================================

Implement the visual behavior from the Three.js Earth example.

The Earth should support:

DAY TEXTURE
+
NIGHT CITY LIGHTS
+
CLOUD INFORMATION
+
BUMP / SURFACE DETAIL
+
ROUGHNESS
+
SUN-ORIENTED DAY/NIGHT TRANSITION
+
FRESNEL ATMOSPHERE

The official example derives atmospheric color from sun orientation and Fresnel behavior.

Preserve that visual concept.

Do not create a flat blue sphere.

The target should visually resemble the provided Three.js Earth:

- realistic dark oceans
- detailed continents
- visible night lights
- cloud coverage
- atmospheric blue edge
- subtle twilight transition
- physically convincing lighting

============================================================
16. SUN / TIME
============================================================

The Earth should have a configurable sun direction.

Initially it is acceptable to preserve the current visual orientation.

Do not introduce a complicated astronomical simulation in this task.

However, structure the Earth renderer so sun orientation can later be connected to:

- current UTC
- geographic solar position
- timeline playback

Do not implement those future features now unless trivial.

============================================================
17. TEXTURES
============================================================

Determine whether the repository already contains suitable textures.

Existing textures include Earth day/night/cloud/topology/water assets.

Compare them with the requirements of the new TSL material.

The official example uses:

earth_day_4096.jpg
earth_night_4096.jpg
earth_bump_roughness_clouds_4096.jpg

Do not blindly download huge assets into the repository.

If existing assets can be reused, adapt them.

If new assets are genuinely required:

- use legally appropriate/publicly available assets
- keep file sizes reasonable
- document their source
- place them under frontend/public/textures
- do not embed giant base64 blobs in source code

The official example states that its Earth textures come from Solar System Scope. Respect the source/licensing requirements when selecting assets.

============================================================
18. MARKER INTEGRATION WITH THE NEW EARTH
============================================================

This is critical.

The environmental markers must be positioned correctly on the new Earth sphere.

Use the same canonical geographic conversion:

latitude/longitude
        ↓
3D sphere coordinates

Verify orientation against the new Earth texture.

Test known locations:

- India
- USA
- Japan
- Europe

Make sure markers appear over the correct continents.

Do not silently reverse longitude/latitude.

============================================================
19. MARKER DEPTH / Z-FIGHTING
============================================================

The Earth surface is now a more detailed material.

Markers must remain visually above the surface.

Use a small configurable marker altitude/offset.

Avoid:

- z-fighting
- markers disappearing behind Earth
- markers floating obviously far above the surface

The offset should be small relative to the Earth radius.

============================================================
20. RAYCASTING / PICKING
============================================================

The new Earth renderer must not break marker picking.

Existing behavior:

hover marker
 ↓
Tooltip

click marker
 ↓
EventDetail

Preserve it.

If WebGPU changes the picking approach, implement a robust compatible solution.

Do not remove marker hover simply because the renderer changed.

Test:

- hover
- click
- drag globe
- click empty globe
- click marker while rotating
- click marker after fly-to

============================================================
21. CAMERA / ORBIT CONTROLS
============================================================

Preserve the existing Sentinel camera experience.

Requirements:

- orbit
- damping
- zoom
- pan behavior if currently supported
- automatic rotation
- pause rotation
- search fly-to
- responsive aspect ratio

Do not copy the example's camera settings blindly.

Adapt the camera to the current Earth Sentinel layout.

The globe must still fit behind the existing UI.

============================================================
22. PERFORMANCE
============================================================

Do not regress performance.

Preserve or improve:

- adaptive DPR
- marker instancing
- throttled picking
- delta-based animation
- memoization
- reasonable texture anisotropy
- disposal on unmount

Do not run unnecessary React state updates every animation frame.

The WebGPU Earth should ideally improve visual quality without making the entire application significantly heavier.

Measure build size if practical.

============================================================
23. CLEANUP
============================================================

The renderer must clean up on unmount.

Dispose:

- renderer
- geometry
- materials
- textures where appropriate
- controls
- event listeners
- animation loop

Do not leave WebGPU/WebGL contexts running after route/component destruction.

React StrictMode should not cause duplicate renderers.

============================================================
24. RESPONSIVE BEHAVIOR
============================================================

Test:

- desktop
- laptop
- tablet-width browser
- mobile-width browser

The existing UI must continue to overlay correctly.

The Earth should resize correctly.

Do not assume `window.innerWidth` is the only relevant sizing source.

Use the actual canvas/container dimensions where appropriate.

============================================================
25. DATA STATUS MUST REMAIN VISIBLE
============================================================

Do not remove:

DataStatusBanner

The globe replacement must not alter the data trust model.

Example:

LIVE
USGS
Updated 2 minutes ago

SIMULATED
NASA FIRMS unavailable
Showing fallback data

STALE
USGS
Provider refresh failed; showing cached live data

These semantics must remain.

============================================================
26. API ERROR HANDLING
============================================================

When the backend is unavailable:

Do NOT silently show fake live data.

The UI should display an actionable state:

"Backend unavailable"

or equivalent.

If the application intentionally has a simulated fallback for a provider, display:

SIMULATED

not LIVE.

The distinction is essential.

============================================================
27. ADD A PRODUCTION DIAGNOSTIC
============================================================

Add a lightweight diagnostic capability.

Possible implementation:

Settings → Diagnostics

or a development-only diagnostic panel.

It should show:

Frontend API base
Backend health
API latency
Last successful request
Current layer
Current data status
Provider source
WebGPU supported/unsupported
Active renderer: WebGPU/WebGL
Texture loading status

Do not expose:

- API keys
- secrets
- server environment variables

This will make production debugging much easier.

Keep it subtle and appropriate to the existing UI.

============================================================
28. TESTING — BACKEND
============================================================

Add/fix tests for:

- health endpoint
- layer listing
- layer data
- validation
- CORS configuration
- provider failure
- fallback status
- stale cache
- event detail
- search endpoint
- stats endpoint
- geocode endpoint
- imagery capability endpoint

Do not make tests depend on external live providers.

Mock provider requests.

============================================================
29. TESTING — FRONTEND
============================================================

Add/fix tests for:

- API base configuration
- production API configuration behavior
- layer selection
- layer data loading
- layer errors
- search
- event detail
- keyboard shortcuts
- data status rendering
- marker interaction where practical

For the new Earth renderer:

test at least the non-WebGL/non-WebGPU logic where practical.

Do not force Vitest/jsdom to execute an actual GPU renderer.

Use mocks for:

- WebGPURenderer
- canvas
- WebGPU capability checks
- texture loading

The real renderer should be validated manually in a browser.

============================================================
30. MANUAL PRODUCTION VERIFICATION
============================================================

After implementation, run the frontend and backend locally.

Then verify production.

Local backend:

cd backend
python wsgi.py

Local frontend:

cd frontend
npm run dev

Verify:

GET /api/health
GET /api/v1/health
GET /api/v1/layers

Then:

1. Open application
2. Select Temperature
3. Verify markers/data
4. Select Precipitation
5. Select Clouds
6. Select Wind
7. Select Earthquakes
8. Select Disasters
9. Select Air Quality
10. Select Wildfires
11. Search a location
12. Click a search result
13. Click an earthquake marker
14. Open event detail
15. Verify live USGS data where available
16. Open an EONET disaster
17. Verify EONET detail
18. Open settings
19. Toggle rotation
20. Test keyboard shortcuts
21. Test marker hover
22. Test marker click
23. Test globe drag
24. Test globe zoom
25. Test search fly-to
26. Refresh the browser
27. Repeat a layer request
28. Verify cache behavior

Then test the deployed Vercel application.

The deployed browser must make requests to Render, NOT localhost.

============================================================
31. WEBGPU MANUAL VERIFICATION
============================================================

On a modern Chromium browser:

Verify:

- WebGPU renderer initializes
- Earth renders
- day/night transition appears
- night lights appear
- clouds/surface detail appear
- atmosphere appears
- globe rotates
- orbit controls work
- marker rendering works
- marker hover works
- marker click works
- search fly-to works

Then test a browser/device without WebGPU support if available.

Verify WebGL fallback.

If WebGPU fails:

the application must not become a blank page.

============================================================
32. BUILD / LINT / TEST
============================================================

Run:

cd frontend
npm run lint
npm test
npm run build

Then:

cd backend
python -m pytest tests/ -q

Do not stop after build succeeds.

Fix:

- TypeScript errors
- ESLint errors
- test failures
- runtime exceptions
- CORS errors
- API connection errors
- WebGPU initialization errors
- React lifecycle errors

============================================================
33. GIT / CI
============================================================

Do not break CI.

The existing workflow uses:

Node 24
Python 3.12

Preserve that.

After changes verify:

- frontend CI
- backend CI

If a dependency must change for WebGPU/TSL compatibility, update package-lock.json correctly.

Do not use `npm audit fix` blindly.

Do not upgrade unrelated dependencies.

============================================================
34. DOCUMENTATION
============================================================

Update:

README.md
docs/development.md
frontend/README.md if necessary
backend/README.md if necessary

Document:

1. Current architecture
2. Production frontend URL
3. Production backend URL
4. Required Vercel environment variable
5. Required Render environment variables
6. CORS configuration
7. WebGPU Earth renderer
8. WebGL fallback
9. Three.js / TSL usage
10. Texture sources
11. Current live providers
12. Simulated capabilities
13. How to test locally
14. How to diagnose API connectivity

Do not claim capabilities that are not actually working.

============================================================
35. IMPORTANT — DO NOT IMPLEMENT FUTURE ROADMAP FEATURES
============================================================

Do NOT implement:

- real global geocoding
- real historical database
- PostGIS
- Redis
- alert system
- notifications
- AI prediction
- machine learning
- multi-user accounts
- authentication
- real historical ingestion
- advanced analytics

Those are future phases.

This task is specifically:

PRODUCTION CONNECTIVITY
+
CURRENT FEATURE COMPLETION
+
THREE.JS WEBGPU EARTH MIGRATION

============================================================
36. DEFINITION OF DONE
============================================================

The task is complete only when ALL of the following are true:

PRODUCTION:

[ ] Vercel frontend calls Render backend
[ ] No production API request goes to localhost
[ ] Render backend health endpoint works
[ ] CORS works
[ ] /api/v1/layers works
[ ] Layer buttons work
[ ] Layer data appears
[ ] Search works
[ ] Search fly-to works
[ ] Event detail works
[ ] DataPanel works
[ ] Settings works
[ ] Keyboard shortcuts work
[ ] Provenance remains accurate
[ ] Simulated data remains labelled

EARTH:

[ ] Current globe implementation is replaced
[ ] New Earth resembles official Three.js WebGPU/TSL Earth
[ ] Day texture works
[ ] Night lights work
[ ] Cloud/surface texture works
[ ] Bump/roughness behavior works
[ ] Atmosphere works
[ ] Sun orientation works
[ ] Globe rotation works
[ ] Orbit controls work
[ ] Search fly-to works
[ ] Markers remain functional
[ ] Marker coordinates are correct
[ ] Marker hover works
[ ] Marker click works
[ ] Event detail works
[ ] WebGPU initialization is robust
[ ] WebGL fallback works if implemented/required
[ ] Renderer cleanup works

QUALITY:

[ ] npm run lint passes
[ ] npm test passes
[ ] npm run build passes
[ ] pytest passes
[ ] CI passes
[ ] No new console errors
[ ] No CORS errors
[ ] No React lifecycle warnings
[ ] No leaked renderer/animation loops
[ ] Documentation updated

============================================================
37. FINAL REPORT REQUIRED FROM OPENCODE
============================================================

At the end, provide a structured report:

# Implementation Report

## 1. Production connectivity problems found

List every real problem.

For each:

- file
- cause
- fix

## 2. API audit

Table:

Frontend feature | Endpoint | Status | Fix

## 3. Deployment changes

List:

- Vercel changes
- Render changes
- CORS changes
- environment variables

## 4. Globe migration

Explain:

- old renderer
- new renderer
- WebGPU implementation
- TSL implementation
- WebGL fallback
- marker integration
- camera integration

## 5. Files changed

List every changed file and why.

## 6. Tests

Report:

- frontend lint
- frontend tests
- frontend build
- backend tests
- CI

## 7. Manual verification

Report what was actually tested.

Do NOT claim production verification unless you actually performed it.

## 8. Remaining limitations

Be explicit.

============================================================
38. FINAL ENGINEERING PRINCIPLE
============================================================

The result should NOT be:

"the app looks good but still uses mocks."

The result should be:

"the existing Earth Sentinel architecture is connected end-to-end, existing features actually communicate with the backend, and the Earth renderer has been upgraded to the modern Three.js WebGPU/TSL implementation without destroying Sentinel's environmental data system."

The architectural boundary must remain:

React UI
 ↓
centralized API client
 ↓
Flask API
 ↓
service layer
 ↓
provider adapters
 ↓
external APIs

And the rendering boundary should become:

GlobeScene
 ↓
Earth renderer
 ├── WebGPU + TSL Earth
 └── WebGL fallback
 ↓
environmental markers
 ↓
interaction/picking
 ↓
React application state

Do not merge data-fetching logic into the renderer.

Do not merge backend logic into the globe.

Keep the rendering system and environmental intelligence system separate.
