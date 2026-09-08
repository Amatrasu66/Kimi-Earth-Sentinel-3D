"""Application service for layer payloads (Phase 2 boundary).

Responsibility split:

* **Routes** validate HTTP input and render JSON — no provider logic.
* **Provider adapters** (``usgs``, ``nasa_eonet``, ...) fetch from one
  upstream API and normalize to the canonical payload — no Flask
  ``request`` objects, no cache access.
* **This module** owns everything in between: provider dispatch, cache
  lookup/store, and stale-fallback semantics. It is shared by the HTTP
  routes and the cache-warming scheduler.

Failure semantics (Phase 4):

* Provider unreachable / malformed response → the provider adapter
  returns a payload labelled ``SIMULATED`` (never raises for this).
* This layer caches ``LIVE`` payloads for the layer TTL and ``SIMULATED``
  payloads only briefly (``FALLBACK_TTL``) so recovery is picked up fast.
* If a refresh fails while an expired ``LIVE`` entry exists, the expired
  entry is served with status rewritten to ``STALE`` — honest age via the
  original ``fetched_at``.
* Anything else that raises here is a programming bug: it propagates to
  the JSON 500 handler so it stays visible and testable. This layer must
  NOT convert unexpected exceptions into simulated data.
"""

from ..cache_service import get_cache_service
from ..models.layer import get_layer
from ..utils.provenance import LIVE, SIMULATED, STALE, ttl_for_layer, with_status
from .airnow import get_air_quality_data
from .fallback import generate_mock_layer_data
from .heatmap import get_heatmap
from .nasa_eonet import get_eonet_events
from .nasa_firms import get_fire_data
from .open_meteo import get_weather_data
from .usgs import get_earthquake_data

SERVICE_MAP = {
    "earthquakes": get_earthquake_data,
    "disasters": get_eonet_events,
    "temperature": lambda **kw: get_weather_data(metric="temperature", layer_id="temperature", **kw),
    "precipitation": lambda **kw: get_weather_data(
        metric="precipitation", layer_id="precipitation", **kw
    ),
    "clouds": lambda **kw: get_weather_data(metric="cloudcover", layer_id="clouds", **kw),
    "wind": lambda **kw: get_weather_data(metric="wind", layer_id="wind", **kw),
    "air_quality": get_air_quality_data,
    "wildfires": get_fire_data,
}

# Short TTL for SIMULATED/UNAVAILABLE payloads so provider recovery is
# picked up quickly instead of being pinned for a full layer TTL.
FALLBACK_TTL = 60

HEATMAP_TTL = 3600


def layer_cache_key(layer_id, bbox, limit, min_severity):
    return f"layer:{layer_id}:bbox={bbox or '-'}:limit={limit}:sev={min_severity or '-'}"


def heatmap_cache_key(layer_id, resolution, time_range):
    return f"heatmap:{layer_id}:res={resolution}:range={time_range}"


def _payload_status(data):
    return (data.get("data_status") or {}).get("status") if isinstance(data, dict) else None


def _fetched_at(data):
    return (data.get("data_status") or {}).get("fetched_at") if isinstance(data, dict) else None


def _as_stale(data):
    """Rewrite an expired LIVE payload as STALE, preserving its age."""
    stale = dict(data)
    status = dict(data.get("data_status") or {})
    fetched_at = status.get("fetched_at")
    status["status"] = STALE
    status["message"] = (
        f"Provider refresh failed — showing cached data fetched at {fetched_at}."
        if fetched_at
        else "Provider refresh failed — showing cached data."
    )
    stale["data_status"] = status
    return stale


def _resolve(key, ttl, fetch):
    """Shared fresh-cache → fetch → stale-fallback pipeline.

    Returns ``(data, cache_hit, stale)``. ``fetch`` may return LIVE,
    SIMULATED or UNAVAILABLE payloads; only unexpected exceptions
    propagate (programming bugs stay visible).
    """
    cache = get_cache_service()
    fresh = cache.get(key)
    if fresh is not None:
        return fresh[0], True, False

    data = fetch()
    if _payload_status(data) == LIVE:
        cache.set(key, (data, _fetched_at(data)), timeout=ttl)
        return data, False, False

    expired = cache.get_stale(key)
    if expired is not None and _payload_status(expired[0]) == LIVE:
        return _as_stale(expired[0]), True, True

    cache.set(key, (data, _fetched_at(data)), timeout=min(FALLBACK_TTL, ttl))
    return data, False, False


def get_layer_payload(layer_id, bbox=None, limit=500, min_severity=None):
    """Fetch a layer payload with cache + stale semantics (see module docs)."""
    layer = get_layer(layer_id)
    source = layer.source if layer else layer_id
    key = layer_cache_key(layer_id, bbox, limit, min_severity)

    def fetch():
        service_fn = SERVICE_MAP.get(layer_id)
        if service_fn is None:
            return with_status(
                generate_mock_layer_data(layer_id, bbox=bbox, limit=limit),
                SIMULATED,
                source,
                "No live provider for this layer — showing simulated fallback data.",
            )
        return service_fn(bbox=bbox, limit=limit, min_severity=min_severity)

    return _resolve(key, ttl_for_layer(layer_id), fetch)


def get_heatmap_payload(layer_id, resolution=128, time_range="24h"):
    """Fetch a heatmap payload with cache semantics (see module docs)."""
    key = heatmap_cache_key(layer_id, resolution, time_range)
    return _resolve(
        key, HEATMAP_TTL, lambda: get_heatmap(layer_id, resolution, time_range)
    )
