# OpenCode Session 4 — Production CORS Fix + Globe Recovery + Final Visual QA

## Repository

**Project:** `Kimi-Earth-Sentinel-3D`

**Repository:** `https://github.com/Amatrasu66/Kimi-Earth-Sentinel-3D`

## Mission

This is a **final integration, production-debugging, browser-validation, and visual-polish session**.

Do NOT treat this as another full frontend redesign.

Sessions 1–3 have already implemented:

- production API configuration hardening
- centralized API client
- Render/Vercel deployment configuration
- backend provider architecture
- WebGPU + TSL Earth renderer
- WebGL/R3F fallback
- Sentinel UI redesign
- shadcn-style UI primitives
- responsive behavior
- accessibility improvements
- provenance/status UI
- Agent Skills-based design audits

Your job now is to:

1. **Fix the actual production CORS failure shown in the user's browser.**
2. **Restore the missing/blank Earth globe in the production frontend.**
3. **Verify the WebGPU Earth and WebGL fallback in a real browser.**
4. **Verify the frontend and backend work together end-to-end.**
5. **Run the installed design/review skills against the actual rendered application.**
6. **Fix anything that is still visually weak or technically broken.**
7. **Re-audit after every meaningful fix.**
8. **Leave the existing architecture intact.**

The screenshot supplied with this task shows the production frontend at:

```text
https://kimi-earth-sentinel-3d.vercel.app/
```

The browser console reports:

```text
Access to fetch at
'https://kimi-earth-sentinel-3d.onrender.com/api/v1/layers'
from origin
'https://kimi-earth-sentinel-3d.vercel.app'
has been blocked by CORS policy:

Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

The page also shows **no visible Earth/globe**.

Treat both as real production defects that must be investigated and fixed.

---

# 1. Existing Architecture — Preserve It

The current intended architecture is:

```text
Vercel
React 19 + TypeScript + Vite
        |
        | HTTPS /api/v1/*
        v
Render
Flask + Gunicorn
        |
        v
Provider adapters
        |
        +-- USGS
        +-- NASA EONET
        +-- NASA FIRMS
        +-- Open-Meteo
        +-- AirNow
        +-- NASA GIBS
```

Frontend:

```text
App
  |
  +-- EarthRenderer
  |      |
  |      +-- WebGPUEarth
  |      |
  |      +-- GlobeScene / WebGL fallback
  |
  +-- TopNav
  +-- LayerPanel
  +-- DataPanel
  +-- BottomBar
  +-- SettingsModal
  +-- Tooltip
```

API:

```text
frontend/src/services/api.ts
```

Backend:

```text
backend/app/__init__.py
backend/app/config.py
backend/app/routes/
backend/app/services/
backend/app/utils/
```

Do NOT replace this architecture.

Do NOT introduce:

- Redux
- Zustand
- another API client
- another backend
- database
- Redis
- PostGIS
- microservices
- proxy server
- serverless API rewrite
- new frontend framework
- another Earth implementation

---

# 2. Baseline — Inspect the Current Repository First

Before changing anything:

```bash
git status
git branch --show-current
git log -5 --oneline
```

Then inspect the current versions of:

```text
frontend/src/App.tsx
frontend/src/services/api.ts

frontend/src/components/globe/EarthRenderer.tsx
frontend/src/components/globe/WebGPUEarth.tsx
frontend/src/components/globe/Globe.tsx
frontend/src/components/globe/GlobeScene.tsx
frontend/src/lib/webgpu.ts

frontend/src/components/panels/TopNav.tsx
frontend/src/components/panels/LayerPanel.tsx
frontend/src/components/panels/DataPanel.tsx
frontend/src/components/panels/BottomBar.tsx
frontend/src/components/panels/SettingsModal.tsx

frontend/src/index.css
frontend/src/App.css

backend/app/__init__.py
backend/app/config.py
render.yaml

frontend/package.json
frontend/vite.config.ts
```

Do not assume the session reports perfectly describe the current working tree.

The repository itself is authoritative.

---

# 3. IMPORTANT — Inspect Uncommitted Work Before Editing

There may be changes from other sessions in the working tree.

Run:

```bash
git status --short
git diff --stat
git diff -- frontend/src/services/api.ts
git diff -- backend/app/config.py
git diff -- backend/app/__init__.py
git diff -- frontend/src/components/globe/EarthRenderer.tsx
git diff -- frontend/src/components/globe/WebGPUEarth.tsx
```

Do not discard another session's work.

Never run:

```bash
git reset --hard
git clean -fd
git checkout .
```

unless the user explicitly instructs you to do so.

---

# 4. Mandatory Agent Skills

The installed Agent Skills are part of this workflow.

Do not skip them.

## Taste Skill

Repository:

```text
https://github.com/Leonxlnx/taste-skill
```

Required relevant skills:

```text
design-taste-frontend
redesign-existing-projects
```

Use `high-end-visual-design` when appropriate.

## Vercel Agent Skills

Repository:

```text
https://github.com/vercel-labs/agent-skills
```

Required relevant skills:

```text
web-design-guidelines
react-best-practices
composition-patterns
```

## Awesome Claude Skills

Repository:

```text
https://github.com/travisvn/awesome-claude-skills
```

Inspect it.

Important:

The repository may not conform to the Agent Skills `SKILL.md` format. If `npx skills add` correctly rejects it, **do not force installation or invent a skill structure**.

Use compatible skills from it only if they are actually installable/usable.

Do not spend the session trying to force an incompatible repository into the project.

---

# 5. Skills Must Be Used Continuously

Use this workflow:

```text
Inspect
  ↓
Run relevant skill audit
  ↓
Implement fix
  ↓
Run browser verification
  ↓
Run skill audit again
  ↓
Fix findings
  ↓
Re-test
```

Do not install the skills and then ignore them.

The final report must state:

```text
Skills installed:
...

Skills used:
...

Findings:
...

Fixes:
...

Final audit:
...
```

---

# 6. PRIORITY 1 — Fix the Production CORS Failure

This is the first blocking issue.

The screenshot proves:

```text
Vercel frontend
        ↓
Render /api/v1/layers
        ↓
OPTIONS preflight
        ↓
NO Access-Control-Allow-Origin
        ↓
Browser blocks request
```

Do not assume the source code is correct merely because `render.yaml` contains a `CORS_ORIGINS` value.

The deployed runtime configuration is what matters.

---

# 7. Investigate CORS End-to-End

Inspect:

```text
backend/app/config.py
backend/app/__init__.py
render.yaml
```

The current intended configuration is approximately:

```python
CORS_ORIGINS = _csv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
)
```

and:

```python
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": app.config.get("CORS_ORIGINS"),
            "methods": ["GET", "OPTIONS"],
            "allow_headers": ["Content-Type"],
        }
    },
)
```

The current Blueprint configuration also contains:

```yaml
CORS_ORIGINS=https://kimi-earth-sentinel-3d.vercel.app
```

But the browser proves that the **deployed service is not returning the required CORS header**.

Therefore investigate the runtime rather than blindly editing frontend code.

---

# 8. Verify the Actual Production Backend

Use direct HTTP verification where possible.

Check:

```text
https://kimi-earth-sentinel-3d.onrender.com/api/health
https://kimi-earth-sentinel-3d.onrender.com/api/v1/health
https://kimi-earth-sentinel-3d.onrender.com/api/v1/layers
```

Also test the preflight request.

Conceptually:

```bash
curl -i -X OPTIONS \
  "https://kimi-earth-sentinel-3d.onrender.com/api/v1/layers" \
  -H "Origin: https://kimi-earth-sentinel-3d.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type"
```

The response must contain the appropriate CORS response header:

```text
Access-Control-Allow-Origin: https://kimi-earth-sentinel-3d.vercel.app
```

and an appropriate allowed-method response.

Do not consider CORS fixed until this has been verified.

---

# 9. Check the Render Runtime Environment

Render environment variables can differ from repository configuration.

Verify the deployed service's actual environment configuration.

The critical value is:

```text
CORS_ORIGINS
```

It must contain the exact production origin:

```text
https://kimi-earth-sentinel-3d.vercel.app
```

No trailing path:

```text
/api/v1
```

No slash:

```text
https://kimi-earth-sentinel-3d.vercel.app/
```

The origin is:

```text
https://kimi-earth-sentinel-3d.vercel.app
```

If the deployed Render environment contains an incorrect or stale value, correct it.

After changing a Render environment variable, ensure the service is actually redeployed/restarted so the running process receives the new value.

Do not assume saving an environment variable automatically changes an already-running process.

---

# 10. Check Render Deployment/Blueprint Drift

Inspect:

```text
render.yaml
```

and compare it with the actual Render service configuration.

Determine:

- deployed branch
- root directory
- build command
- start command
- environment variables
- health check
- running deploy
- latest deploy commit

The repository currently expects:

```text
rootDir: backend
```

and:

```text
gunicorn wsgi:app --bind 0.0.0.0:$PORT ...
```

Do not change these unless there is actual evidence they are wrong.

---

# 11. CORS Should Be Robust, Not Broad

Do NOT solve the problem with:

```text
Access-Control-Allow-Origin: *
```

Do not allow every origin in production.

Keep an explicit allow-list.

Production should allow:

```text
https://kimi-earth-sentinel-3d.vercel.app
```

Development should allow the known local Vite origins:

```text
http://localhost:3000
http://localhost:5173
```

If the implementation needs normalization of whitespace/trailing slash, do that safely.

Do not weaken the security model merely to make the browser request succeed.

---

# 12. Verify OPTIONS Behavior Explicitly

The screenshot says:

```text
Response to preflight request doesn't pass access control check
```

Therefore test:

```text
OPTIONS /api/v1/layers
```

not merely:

```text
GET /api/v1/layers
```

The final validation must confirm both:

```text
OPTIONS /api/v1/layers → valid CORS response
GET /api/v1/layers     → valid JSON + CORS response
```

Also test:

```text
GET /api/v1/health
GET /api/v1/layers
GET /api/v1/layers/earthquakes/data
GET /api/v1/search?q=tokyo
```

from the production frontend origin.

---

# 13. Add a Regression Test for the Exact Production Origin

Add/strengthen backend tests so this exact bug cannot silently return.

Test:

```text
Origin:
https://kimi-earth-sentinel-3d.vercel.app
```

against:

```text
OPTIONS /api/v1/layers
```

and verify:

```text
Access-Control-Allow-Origin
```

is returned correctly.

Also test that an unapproved origin does NOT receive the production allow-origin header.

Do not only test local origins.

---

# 14. PRIORITY 2 — Fix the Missing/Blank Globe

The screenshot shows:

```text
Header visible
Search visible
Layer rail visible
Bottom status visible
Earth/globe NOT visible
```

This is a separate problem from CORS.

Do not assume fixing CORS will automatically fix the globe.

Investigate both independently.

---

# 15. First Determine Which Renderer Is Active

The application already has:

```text
EarthRenderer
  ↓
probeWebGpuSupport()
  ↓
WebGPUEarth
OR
GlobeScene
```

The UI also exposes renderer diagnostics.

Determine what production is actually reporting.

Possible states:

```text
loading
webgpu
webgl
```

If the globe is blank, determine whether:

### Case A

WebGPU probe returns supported but WebGPU initialization fails.

### Case B

WebGPU initializes but the canvas has no visible scene.

### Case C

WebGPU works but textures fail.

### Case D

WebGPU works but the camera/scene/material is incorrect.

### Case E

WebGPU is unavailable and WebGL fallback is not rendering.

### Case F

The globe renders but a UI layer covers it.

### Case G

Canvas exists but has zero/incorrect dimensions.

### Case H

A browser runtime exception stops the renderer.

Do not guess.

---

# 16. Inspect Browser Console for Globe Errors

Use a Chromium browser against the deployed application.

Record all console errors.

Look specifically for:

```text
WebGPU
WebGPURenderer
three/webgpu
three/tsl
GPUDevice
GPUAdapter
TextureLoader
shader
material
canvas
WebGL
context
CORS
```

The current screenshot only shows the CORS error.

There may be another renderer error lower in the console or hidden after the API failure.

Find it.

---

# 17. Inspect the Network Tab

For the production frontend, inspect:

### JavaScript chunks

Confirm the WebGPU chunk loads.

### Earth textures

Confirm:

```text
earth-day.jpg
earth-night.jpg
earth-clouds.png
earth-topology.png
earth-water.png
```

are actually served from the Vercel deployment.

Check their response status.

The application currently builds texture paths using:

```text
import.meta.env.BASE_URL
```

and the Vite config uses:

```text
base: './'
```

Verify this produces correct production URLs.

Do not blindly change the Vite base.

---

# 18. Verify Canvas Geometry

Inspect the actual canvas element.

Verify:

```text
width > 0
height > 0
display = block
position is correct
```

Verify its container has:

```text
position: absolute/fixed
inset: 0
width: 100%
height: 100%
```

Verify UI overlays have appropriate z-index values.

Current intended relationship:

```text
EarthRenderer → z-index 1
UI overlays → above the Earth
```

Do not allow a UI layer to accidentally create an opaque full-screen surface over the Earth.

---

# 19. Verify WebGPU Initialization

Inspect:

```text
frontend/src/components/globe/WebGPUEarth.tsx
frontend/src/lib/webgpu.ts
```

The intended flow is:

```text
probe navigator.gpu
       ↓
requestAdapter
       ↓
WebGPUEarth lazy import
       ↓
new THREE.WebGPURenderer(...)
       ↓
await renderer.init()
       ↓
scene setup
       ↓
textures
       ↓
materials
       ↓
camera
       ↓
animation loop
```

Verify every stage.

If WebGPU initialization fails, the application must automatically switch to:

```text
GlobeScene
```

and render the existing WebGL Earth.

The user must never see a permanently blank Earth.

---

# 20. WebGPU Fallback Requirement

Perform an explicit fallback test.

Run a Chromium browser with WebGPU disabled/unavailable where practical.

Expected result:

```text
WebGPU unavailable
        ↓
WebGL fallback
        ↓
Earth visible
        ↓
markers work
        ↓
rotation works
        ↓
zoom works
        ↓
search fly-to works
```

Do not simply report:

```text
Fallback exists in code.
```

It must be tested.

---

# 21. WebGPU Success Requirement

On a WebGPU-capable browser:

```text
WebGPU Earth
        ↓
day/night texture
        ↓
night lights
        ↓
cloud layer
        ↓
atmosphere
        ↓
stars
        ↓
markers
        ↓
camera controls
```

must render correctly.

The WebGPU version must not merely render a black canvas.

---

# 22. Verify Earth Texture URLs

The WebGPU implementation currently expects local assets under:

```text
frontend/public/textures/
```

Verify these files exist:

```text
earth-day.jpg
earth-night.jpg
earth-clouds.png
earth-topology.png
earth-water.png
```

Then verify their production URLs return HTTP 200.

If they fail:

- fix the asset path
- do not remove the Earth textures
- do not replace them with remote hotlinks unless absolutely necessary
- preserve deterministic production behavior

---

# 23. Verify Three.js Version Compatibility

Current project uses:

```text
three ^0.185.1
```

The WebGPU implementation uses:

```text
three/webgpu
three/tsl
```

Do not upgrade Three.js simply because the official Three.js example has changed.

First verify the current installed version and APIs.

Only upgrade if there is an actual compatibility bug and the entire project can be validated afterward.

Do not introduce an unbounded Three.js version migration during this session.

---

# 24. Compare WebGPU Earth Against Official Example

The WebGPU Earth was ported from the official Three.js Earth example.

Reference:

```text
https://threejs.org/examples/webgpu_tsl_earth.html
```

Use it as a visual/technical reference.

Compare:

- Earth shading
- day/night transition
- night lights
- atmosphere
- clouds
- sun direction
- camera framing
- scale
- visual depth
- background
- overall Earth presentation

But do NOT copy the standalone demo wholesale.

Sentinel-specific functionality must remain:

- markers
- event picking
- fly-to
- rotation
- layer interaction
- search
- provenance
- UI panels

---

# 25. Marker Alignment Audit

Test known geographic points.

At minimum verify:

```text
India
USA
Japan
Europe
```

Markers must appear on the correct continent/region.

Verify:

- latitude
- longitude
- marker altitude
- marker orientation
- no z-fighting
- no marker floating excessively above Earth
- no markers buried inside Earth

The current canonical projection is:

```text
latLonToVector3Into(...)
```

Do not create a second coordinate conversion implementation.

---

# 26. Camera / Fly-To Audit

Test:

```text
Search Tokyo
Search India
Search New York / USA
Search Europe
```

Expected:

```text
search result
    ↓
fly-to
    ↓
Earth rotates smoothly
    ↓
target location faces camera
    ↓
user can immediately interrupt with drag
```

Verify that:

- auto-rotation does not fight fly-to
- manual drag cancels fly-to
- zoom still works
- damping still works
- camera does not jump unexpectedly

---

# 27. Layer/API Recovery Audit

After CORS is fixed, verify every layer.

There are currently 8:

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

For each:

```text
click layer
    ↓
API request
    ↓
data loads
    ↓
status/provenance shown
    ↓
markers render if points exist
    ↓
DataPanel updates
```

Do not require every layer to be live if the backend intentionally labels some providers as simulated.

The important requirement is honest status handling.

---

# 28. Production API Matrix

Verify from the deployed frontend origin:

| Feature | Endpoint | Expected |
|---|---|---|
| Health | `/api/v1/health` | 200 |
| Layers | `/api/v1/layers` | 200 |
| Temperature | `/api/v1/layers/temperature/data` | valid |
| Precipitation | `/api/v1/layers/precipitation/data` | valid |
| Clouds | `/api/v1/layers/clouds/data` | valid |
| Wind | `/api/v1/layers/wind/data` | valid |
| Earthquakes | `/api/v1/layers/earthquakes/data` | valid |
| Disasters | `/api/v1/layers/disasters/data` | valid |
| Air quality | `/api/v1/layers/air_quality/data` | valid/simulated |
| Wildfires | `/api/v1/layers/wildfires/data` | valid/simulated |
| Search | `/api/v1/search?q=tokyo` | valid |
| Event detail | `/api/v1/events/<id>` | valid |
| GIBS capabilities | `/api/v1/imagery/gibs/capabilities` | valid |

Also verify the relevant `OPTIONS` preflight where the browser sends one.

---

# 29. Production Configuration Diagnostic

The existing Settings → Diagnostics surface should tell the truth.

Verify it shows:

```text
API base
API source
production/development
backend health
latency
active layer
data status
WebGPU support
active renderer
texture loading state
```

Never show secrets.

Never show API keys.

If diagnostics says:

```text
API healthy
WebGPU ready
```

while the globe is blank, that is a diagnostic correctness bug that must be fixed.

---

# 30. Fix the Root Cause, Not the Symptom

Examples:

If CORS is caused by a stale Render environment variable:

```text
Fix Render configuration + document it.
```

Do NOT add a Vercel proxy merely to hide the CORS problem.

If the globe is blank because WebGPU initialization fails:

```text
Fix WebGPU initialization or fallback.
```

Do NOT remove WebGPU.

If textures fail because of a relative asset path:

```text
Fix asset resolution.
```

Do NOT replace the Earth with a CSS circle.

If the globe is hidden behind UI:

```text
Fix stacking/layout.
```

Do NOT remove the UI.

---

# 31. Do Not Regress Production API Safety

Preserve the Session 1 behavior:

Production without:

```text
VITE_API_BASE_URL
```

must fail loudly.

It must never silently use:

```text
http://localhost:5001/api/v1
```

Do not undo:

```text
resolveApiConfig(...)
```

or its tests.

---

# 32. Do Not Regress the UI Overhaul

Preserve the Session 2/3 work:

- dark-first shadcn tokens
- responsive layout
- accessible tooltips
- command/search semantics
- provenance
- loading states
- error states
- empty states
- reduced motion
- keyboard shortcuts
- responsive layer rail
- data panel
- settings
- diagnostics

Do not replace the UI with the old prototype.

---

# 33. Final Visual QA

Once CORS and globe rendering work, perform a full visual audit.

Use:

```text
design-taste-frontend
redesign-existing-projects
web-design-guidelines
react-best-practices
```

Review:

### Overall

- Is the Earth visually dominant?
- Does the UI feel like a coherent product?
- Is there too much empty space?
- Is anything visually noisy?

### Header

- Does the search feel integrated?
- Is branding balanced?
- Are status indicators readable?

### Layer rail

- Are active states obvious?
- Are tooltips useful?
- Is the rail too visually heavy?

### Data panel

- Is information easy to scan?
- Are badges meaningful?
- Is there too much text?
- Are important values visually prioritized?

### Bottom bar

- Is it useful rather than decorative?
- Is it too dense?

### Settings

- Are tabs understandable?
- Are all controls real?
- Is diagnostics useful?

### Earth

- Is it visually compelling?
- Is the day/night boundary believable?
- Are clouds visible but restrained?
- Is the atmosphere subtle?
- Are stars distracting?
- Is the globe too large/small?
- Is the lighting visually balanced?

---

# 34. Visual Quality Rule

If something looks bad, **fix it**.

Do not simply mention it in the report.

Examples:

```text
Too much empty space
→ adjust composition

Panel too wide
→ reduce width

Earth too small
→ adjust camera framing

Earth too dark
→ fix lighting/material balance

Earth too bright
→ tune material/light

Search visually disconnected
→ integrate it into header

Layer rail too heavy
→ reduce visual weight

Status bar too busy
→ simplify information hierarchy

Text too small
→ correct typography

Active layer unclear
→ strengthen state treatment

Mobile panel overlaps Earth
→ fix responsive composition
```

Then re-audit.

---

# 35. Real Browser Validation Is Mandatory

Static checks are not enough.

Run:

```bash
npm run dev
```

Then use Chromium.

Test at least:

```text
1920×1080
1440×900
1366×768
768×1024
390×844
```

The exact sizes can vary, but test both desktop and narrow mobile dimensions.

---

# 36. Browser Test Matrix

## Desktop

- [ ] Earth visible
- [ ] Earth rotates
- [ ] Earth zooms
- [ ] Earth can be dragged
- [ ] markers visible
- [ ] marker hover works
- [ ] marker click works
- [ ] event panel works
- [ ] search works
- [ ] fly-to works
- [ ] layer switching works
- [ ] settings works
- [ ] diagnostics works
- [ ] no console errors

## Mobile/narrow

- [ ] Earth remains visible
- [ ] layer strip works
- [ ] bottom sheet works
- [ ] search works
- [ ] settings fits
- [ ] no accidental page scroll
- [ ] touch interactions work
- [ ] no overlay permanently covers Earth

---

# 37. WebGPU Test

On a WebGPU-capable Chromium browser:

Expected:

```text
Settings → Diagnostics
Renderer: WebGPU
```

and:

```text
Earth visible
```

No WebGPU exceptions.

No blank canvas.

---

# 38. WebGL Fallback Test

On a browser/environment without WebGPU:

Expected:

```text
Settings → Diagnostics
Renderer: WebGL
```

and:

```text
Earth visible
```

The application remains functional.

---

# 39. Production Browser Test

After local validation, test the actual deployed frontend:

```text
https://kimi-earth-sentinel-3d.vercel.app/
```

Verify:

```text
CORS fixed
API requests succeed
Earth visible
WebGPU or WebGL renderer visible
layers work
search works
markers work
event details work
settings works
diagnostics works
```

Do not declare success based solely on local development.

---

# 40. Console Cleanliness

At the end of the production browser test:

There should be no application-caused:

```text
CORS errors
Failed to fetch
WebGPU exceptions
WebGL context errors
uncaught React exceptions
failed texture loads
404 texture requests
TypeError
Unhandled Promise rejection
```

Browser extension warnings are not application defects.

Do not chase unrelated browser-extension console noise.

---

# 41. Network Cleanliness

The production frontend must not request:

```text
localhost:5001
localhost:3000
localhost:5173
```

for production API traffic.

The production API should be:

```text
https://kimi-earth-sentinel-3d.onrender.com/api/v1
```

Confirm this in the Network panel.

---

# 42. Performance Audit

Use the installed React/Vercel skills.

Pay attention to:

- unnecessary React renders
- animation causing React state updates
- excessive event listeners
- unnecessary texture reloads
- unnecessary WebGPU initialization
- duplicate renderer initialization under StrictMode
- excessive marker updates
- expensive raycasting
- unnecessary bundle growth

Do not optimize blindly.

Measure/inspect first.

The existing WebGPU implementation intentionally keeps the animation loop outside React state updates.

Preserve that architecture.

---

# 43. WebGPU Bundle Boundary

Preserve the lazy loading strategy:

```text
WebGPU-capable browser
        ↓
load WebGPUEarth chunk

WebGPU unavailable
        ↓
use WebGL
        ↓
do not pay for WebGPU chunk unnecessarily
```

Do not turn the entire WebGPU renderer into the initial bundle without a reason.

---

# 44. Earth Renderer Lifecycle

Pay special attention to:

- React StrictMode
- mount/unmount
- WebGPU initialization cancellation
- texture disposal
- renderer disposal
- OrbitControls disposal
- event listener cleanup
- ResizeObserver cleanup
- animation loop cleanup
- canvas cleanup

The globe must not create multiple canvases after:

```text
React mount
→ unmount
→ remount
```

Test this in development.

---

# 45. Do Not Change the Official Earth Direction

The desired Earth is based on the official Three.js WebGPU/TSL Earth example:

```text
https://threejs.org/examples/webgpu_tsl_earth.html
```

Do not revert to the old Phong-only Earth as the primary renderer.

The old WebGL Earth remains the fallback.

---

# 46. Testing

Run:

```bash
cd frontend
npm run lint
npm test
npm run build
```

Backend:

```bash
cd backend
python -m pytest tests/ -q
```

All existing tests must remain passing.

Add tests for any new production bug fix.

Especially:

### CORS

- approved production origin
- rejected origin
- OPTIONS preflight

### Renderer

- WebGPU probe
- fallback selection
- renderer status

Do not delete tests to make the suite green.

---

# 47. Production Configuration Regression Tests

Add/maintain tests covering:

```text
production + explicit VITE_API_BASE_URL
→ uses configured base

production + no API base
→ configuration error

development + no API base
→ localhost fallback
```

Do not regress Session 1.

---

# 48. Git Safety

Do not:

```bash
git reset --hard
git clean -fd
git checkout -- .
```

Do not discard other session changes.

Before editing:

```bash
git status
```

After editing:

```bash
git diff --stat
git diff
```

Keep changes focused.

---

# 49. Commit Scope

If the repository is being committed during this session, keep changes logically grouped.

Preferred commit categories:

```text
fix(cors): restore production Vercel to Render access
fix(globe): restore production Earth rendering
test(cors): cover production origin preflight
test(globe): cover renderer fallback behavior
fix(ui): polish final production rendering
```

Do not mix unrelated backend refactors into the fix.

---

# 50. Definition of Done

The session is complete only when ALL of the following are true.

## Production CORS

- [ ] Vercel can call Render.
- [ ] `OPTIONS /api/v1/layers` returns valid CORS headers.
- [ ] `GET /api/v1/layers` works from the Vercel origin.
- [ ] exact production origin is allowed.
- [ ] arbitrary origins are not broadly allowed.
- [ ] Render runtime configuration is correct.
- [ ] the fix survives a fresh deployment.

## Globe

- [ ] WebGPU Earth renders on supported Chromium.
- [ ] WebGL Earth renders when WebGPU is unavailable.
- [ ] no blank Earth state.
- [ ] textures load.
- [ ] day/night works.
- [ ] night lights work.
- [ ] atmosphere works.
- [ ] clouds work.
- [ ] stars work.
- [ ] markers render.
- [ ] marker positions are geographically correct.
- [ ] hover works.
- [ ] click works.
- [ ] fly-to works.
- [ ] rotation works.
- [ ] zoom works.
- [ ] drag works.
- [ ] renderer cleanup works.

## API

- [ ] all eight layers can be selected.
- [ ] production API requests succeed.
- [ ] search works.
- [ ] event details work.
- [ ] provenance remains honest.
- [ ] simulated data remains clearly labelled.
- [ ] no production localhost calls.

## UI

- [ ] existing Sentinel UI remains intact.
- [ ] desktop works.
- [ ] narrow/mobile works.
- [ ] settings works.
- [ ] diagnostics works.
- [ ] keyboard shortcuts work.
- [ ] accessibility remains intact.

## Quality

- [ ] Taste Skill audit performed.
- [ ] Vercel web-design audit performed.
- [ ] React best-practice audit performed.
- [ ] meaningful findings fixed.
- [ ] audits repeated after fixes.
- [ ] final visual browser inspection completed.

## Validation

```text
npm run lint       PASS
npm test           PASS
npm run build      PASS
pytest             PASS
production CORS    PASS
production globe   PASS
WebGPU             PASS
WebGL fallback     PASS
visual QA          PASS
```

---

# 51. Final Engineering Report

When finished, provide a concise but evidence-based report.

## 1. Root cause — CORS

State exactly why the production browser was receiving:

```text
No 'Access-Control-Allow-Origin' header
```

Do not say merely:

```text
Fixed CORS.
```

Explain the actual root cause.

## 2. CORS fix

List:

- files changed
- Render configuration changes
- backend changes
- tests added
- production verification

## 3. Root cause — blank globe

State exactly why the Earth was not visible.

Possible examples:

```text
WebGPU initialization failure
texture path
canvas sizing
stacking
runtime exception
fallback bug
production asset path
```

Only report the cause actually discovered.

## 4. Globe fix

List:

- renderer changes
- WebGPU changes
- fallback changes
- asset changes
- lifecycle changes

## 5. Browser verification

Report:

```text
Desktop:
PASS/FAIL

Mobile:
PASS/FAIL

WebGPU:
PASS/FAIL

WebGL fallback:
PASS/FAIL
```

## 6. API verification

Report the endpoints tested.

## 7. Skill audit

Report:

```text
Installed:
...

Used:
...

Findings:
...

Fixed:
...

Final audit:
PASS / remaining justified findings
```

## 8. Tests

Report exact results:

```text
Frontend lint:
Frontend tests:
Frontend build:
Backend tests:
```

## 9. Remaining limitations

Only list real limitations.

Do not hide unresolved production issues.

---

# 52. Final Principle

This is the final integration gate.

The standard is NOT:

> "The code compiles."

The standard is:

> **The deployed Sentinel application must actually work in a real browser and look like a finished environmental-intelligence product.**

The user must be able to open the Vercel URL and see:

```text
              Sentinel
                 |
        ┌────────┴────────┐
        │                 │
   Layer controls      Search
        │                 │
        └───────┬─────────┘
                ↓
        ┌─────────────────┐
        │                 │
        │   3D EARTH      │
        │                 │
        │ WebGPU / WebGL  │
        │                 │
        └─────────────────┘
                │
        environmental data
                │
        event / provenance
```

There must be:

- no CORS failure
- no blank Earth
- no broken production API
- no silent localhost requests
- no fake live-data claims
- no broken markers
- no broken search
- no broken event details
- no broken responsive UI

And if the final rendered interface still looks weak, **do not stop at reporting that fact. Fix it, then re-run the skills and browser validation.**
