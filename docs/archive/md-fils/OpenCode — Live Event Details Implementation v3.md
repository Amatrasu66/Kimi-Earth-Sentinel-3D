You are working on the Kimi-Earth-Sentinel-3D repository.

The repository has already completed:

1. Foundation / architecture hardening
2. Frontend/backend repository restructuring
3. Final cleanup and CI setup

Current repository structure:

Kimi-Earth-Sentinel-3D/
├── frontend/
├── backend/
├── docs/
├── .github/
├── README.md
└── render.yaml

DO NOT restructure the repository again during this task.

DO NOT add:
- PostgreSQL
- PostGIS
- Supabase
- Redis
- Celery
- RabbitMQ
- background worker infrastructure
- microservices
- a new state-management library

This is the FIRST PRODUCT/DATA IMPLEMENTATION PASS.

==================================================
OBJECTIVE
==================================================

Replace the current simulated event-detail implementation with genuine live event lookups wherever the existing provider supports them.

The desired flow is:

User clicks marker
        ↓
Frontend api.getEvent(id)
        ↓
Flask /api/v1/events/<id>
        ↓
Determine event/provider
        ↓
Query the appropriate upstream provider
        ↓
Normalize provider response
        ↓
Return canonical EventDetail
        ↓
Frontend renders live event details

If the upstream provider is unavailable, the event does not exist, or the event cannot be resolved:

fall back to the existing labelled SIMULATED behavior.

Never make simulated data appear to be live.

==================================================
PHASE 1 — AUDIT EXISTING EVENT FLOW
==================================================

Before modifying anything, inspect:

backend/app/routes/events.py
backend/app/services/nasa_eonet.py
backend/app/services/usgs.py
backend/app/services/layer_service.py
backend/app/services/fallback.py
backend/app/utils/provenance.py

Frontend:

frontend/src/services/api.ts
frontend/src/types/
frontend/src/App.tsx
frontend/src/components/panels/DataPanel.tsx
frontend/src/components/panels/*
frontend/src/components/overlays/DataStatusBanner.tsx

Determine exactly how event IDs are currently generated for:

- earthquakes
- disasters
- wildfires
- other event-like layers

Do not assume every DataPoint ID maps directly to every provider's ID.

Create a clear event-provider mapping strategy.

==================================================
PHASE 2 — DEFINE THE CANONICAL EVENT MODEL
==================================================

Keep the existing EventDetail model if it is already sufficient.

If necessary, extend it minimally.

The canonical event model should support, where available:

- id
- layer_id
- provider
- title
- type
- description
- latitude
- longitude
- timestamp
- updated_at
- severity
- magnitude
- magnitude_unit
- depth
- status
- closed_at
- source_url
- source_name
- categories
- affected_area or geometry information when practical
- alert
- tsunami
- felt
- confidence/quality information if available
- data_status

Do NOT force every provider to supply every field.

Use nullable/optional fields for provider-specific information.

Do not fabricate values.

==================================================
PHASE 3 — IMPLEMENT LIVE USGS EARTHQUAKE DETAILS
==================================================

USGS is the primary provider for the earthquakes layer.

Implement a dedicated provider-level event lookup.

Prefer the USGS GeoJSON detail endpoint or the FDSN event query using the known event ID.

The known USGS event identifier should be passed as the event identifier.

Use the provider's actual response.

Normalize:

USGS Feature
    ↓
canonical EventDetail

At minimum, support:

- event ID
- place
- magnitude
- magnitude type
- timestamp
- updated timestamp
- longitude
- latitude
- depth
- felt reports
- alert level
- tsunami indicator
- significance
- status
- USGS event URL

Do not expose the entire raw USGS payload to the frontend.

Store only normalized fields required by the application.

Ensure timestamps remain timezone-aware UTC ISO strings.

==================================================
PHASE 4 — IMPLEMENT LIVE NASA EONET EVENT DETAILS
==================================================

NASA EONET is the primary provider for the disasters layer.

Use the individual EONET event endpoint for a known event ID.

Normalize:

EONET Event
    ↓
canonical EventDetail

Support where available:

- event ID
- title
- description
- categories
- source information
- current/latest geometry
- geometry timestamp
- magnitude value
- magnitude unit
- open/closed state
- closed timestamp
- source link
- EONET event link

EONET geometry may contain multiple records.

Select the most appropriate/latest geometry for the primary event location while preserving the event's temporal information where useful.

Do NOT assume every event is a Point.

If the geometry is not suitable for the current point-detail UI, retain the canonical event information without inventing a coordinate.

==================================================
PHASE 5 — EVENT PROVIDER RESOLUTION
==================================================

The frontend currently calls:

GET /api/v1/events/<id>

The backend must determine which provider should handle that ID.

Implement the simplest reliable mechanism.

Acceptable approaches include:

1. Prefix-based IDs where provider identity is encoded
2. Layer-aware IDs if the route can receive layer information
3. A small provider resolver
4. A lookup strategy that checks known provider ID formats

Prefer an explicit resolver rather than guessing.

Example conceptual architecture:

EventResolver
    ↓
USGS event provider
NASA EONET event provider
other provider-specific handlers

Do NOT create an elaborate plugin framework.

==================================================
PHASE 6 — WILDFIRE EVENT DETAILS
==================================================

Do not pretend that every wildfire marker automatically has a live individual-event endpoint.

Inspect how the current NASA FIRMS wildfire IDs are constructed.

Determine whether a marker maps cleanly to a persistent provider identifier.

If a reliable individual lookup is possible:

implement it.

If not:

keep the existing marker-level fallback detail, but ensure:

data_status.status = "simulated"

and make the message explicit that a live individual wildfire detail endpoint is not currently available through the selected provider path.

Do not manufacture a "live wildfire event" from a point that only represents an observation.

==================================================
PHASE 7 — FALLBACK SEMANTICS
==================================================

The existing provenance architecture must remain intact.

For successfully retrieved provider details:

data_status.status = "live"

For cached live detail:

remain honest about the original fetched_at.

For provider unavailable:

data_status.status = "simulated"

For an expired live detail that can still be served:

data_status.status = "stale"

Never convert a provider/API programming error into simulated data.

Narrow exception handling only.

Unexpected programming exceptions should reach the application's existing 500 handling.

==================================================
PHASE 8 — CACHE EVENT DETAILS
==================================================

Use the existing CacheService.

Do not add Redis.

Add an event-detail cache key, for example conceptually:

event:<provider>:<event_id>

Use a sensible TTL.

Do not cache invalid requests.

Do not cache arbitrary error responses as successful live data.

Cached event data must preserve the original provider timestamp/fetched_at.

==================================================
PHASE 9 — FRONTEND EVENT DISPLAY
==================================================

Inspect the current DataPanel event-detail UI.

Do NOT redesign the entire application.

Improve the event detail presentation so live information is visibly useful.

For earthquakes, show appropriate fields such as:

- magnitude
- location/place
- depth
- occurrence time
- updated time
- alert
- tsunami
- felt reports
- source

For EONET disasters, show:

- event title
- category/type
- description
- event status
- latest observation time
- source
- source link
- magnitude when available

Only render fields that actually exist.

Do not render empty placeholders such as:

"N/A"

for every missing field.

Prefer conditionally rendered sections.

==================================================
PHASE 10 — SOURCE / ATTRIBUTION
==================================================

Every live event detail should clearly expose its source.

Examples:

USGS
NASA EONET

Provide a source link when the upstream provider supplies one.

Do not obscure attribution.

Do not invent source URLs.

Make external source links safe to open.

==================================================
PHASE 11 — LOADING / ERROR UX
==================================================

Review the current event loading behavior in:

frontend/src/App.tsx

The existing code already aborts stale event requests.

Preserve that behavior.

Ensure:

- clicking event A then B cannot display A's details for B
- closing the panel cancels the request
- aborted requests do not create visible errors
- network failure results in an appropriate fallback
- a genuinely missing event is communicated clearly

Do not introduce race conditions.

==================================================
PHASE 12 — EVENT NOT FOUND VS PROVIDER FAILURE
==================================================

Distinguish:

1. Event not found
2. Provider unavailable
3. Invalid event ID
4. Unexpected server failure

Use meaningful API behavior.

For example:

404:
known-format event ID but provider confirms the event does not exist

502/503 or appropriate provider-related response:
provider unavailable

400:
malformed/invalid event identifier

500:
unexpected application bug

Do not use HTTP 200 for every failure.

However, preserve the application's existing fallback behavior where the product intentionally shows simulated details after a provider failure.

Document the chosen behavior clearly.

==================================================
PHASE 13 — TESTS
==================================================

Add backend tests for:

USGS:
- successful detail normalization
- provider timeout/failure
- malformed provider response
- event not found
- timestamp normalization

EONET:
- successful detail normalization
- multiple geometry records
- provider failure
- missing optional fields
- closed/open event handling

Resolver:
- earthquake ID resolves to USGS
- EONET ID resolves to EONET
- unsupported ID is handled safely

Fallback:
- provider failure remains SIMULATED
- live event remains LIVE
- unexpected programming errors are not silently converted to SIMULATED

Cache:
- live event detail cached
- cached response preserves fetched_at
- stale behavior remains honest

Frontend:
- successful detail rendering
- optional fields render conditionally
- loading state
- aborted request
- fallback state

Use mocking for upstream providers.

Do NOT depend on live external APIs for the test suite.

==================================================
PHASE 14 — PROVIDER HTTP IMPLEMENTATION
==================================================

Use the existing centralized provider configuration.

Do not hardcode provider URLs.

Use:

current_app.config[...]

for backend provider base URLs.

Use the existing configured REQUEST_TIMEOUT.

Do not introduce a new HTTP client dependency unless genuinely necessary.

Use the same requests-based approach as the existing provider adapters.

==================================================
PHASE 15 — DOCUMENTATION
==================================================

Update:

README.md
docs/development.md
backend/README.md

Document that:

- earthquake event details are retrieved from USGS when available
- disaster event details are retrieved from NASA EONET when available
- unsupported individual event lookups remain simulated
- provider failures fall back honestly
- no database is required for event lookup
- event details are cached temporarily in process-local memory

Remove any outdated statement saying that event details are purely simulated if live lookups now exist.

==================================================
PHASE 16 — DO NOT IMPLEMENT OTHER FEATURES
==================================================

Do NOT implement during this task:

- real search
- real reverse geocoding
- real heatmaps
- historical timeline
- multi-layer compositing
- database persistence
- user accounts
- alerts
- notifications

This is specifically the LIVE EVENT DETAILS pass.

==================================================
PHASE 17 — VALIDATION
==================================================

Run:

Backend:

python -m pytest tests/ -q

Frontend:

npm run lint
npm test
npm run build

Also run the Flask backend locally.

Verify:

GET /api/health
GET /api/v1/health
GET /api/v1/layers

Then manually test:

1. Select earthquakes
2. Click a real earthquake marker
3. Confirm event details come from USGS
4. Confirm provenance says LIVE
5. Refresh/reopen the event and confirm cache behavior
6. Test a nonexistent event
7. Test provider failure/fallback
8. Select disasters
9. Click a real EONET event marker
10. Confirm event details come from EONET
11. Confirm provenance is accurate

Do not claim a live integration works unless it has actually been tested.

==================================================
PHASE 18 — FINAL REPORT
==================================================

Return:

1. Files changed
2. New provider/event architecture
3. USGS implementation
4. EONET implementation
5. Wildfire decision
6. Event caching behavior
7. Frontend changes
8. Tests added
9. Commands executed
10. Test/lint/build results
11. Manual verification results
12. Remaining simulated functionality
13. Any issues for the next phase

IMPORTANT FINAL RULE:

Do not move on to search, geocoding, heatmaps, historical data, or database work after this task.

Stop after the live event-detail capability is implemented and validated.