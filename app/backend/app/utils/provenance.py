"""Data-provenance helpers.

Every layer payload carries a ``data_status`` block so the frontend can
tell the user exactly what they are looking at::

    data_status: {
        "status": "live" | "simulated" | "stale" | "unavailable",
        "source": "USGS",
        "fetched_at": "2026-…Z",
        "message": "optional human-readable note"
    }

* ``live`` — returned directly from the upstream provider.
* ``simulated`` — development/demo fallback data (never real measurements).
* ``stale`` — previously cached live data served after a provider failure.
* ``unavailable`` — no data could be produced at all.
"""

import time
from datetime import datetime, timezone

LIVE = "live"
SIMULATED = "simulated"
STALE = "stale"
UNAVAILABLE = "unavailable"


def utcnow_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_status(status, source, message=None, fetched_at=None):
    return {
        "status": status,
        "source": source,
        "fetched_at": fetched_at or utcnow_iso(),
        "message": message,
    }


def with_status(payload, status, source, message=None, fetched_at=None):
    """Attach a ``data_status`` block to a layer payload dict."""
    payload = dict(payload)
    payload["data_status"] = make_status(status, source, message, fetched_at)
    return payload


def success_response(data, cache_hit=False, cached_at=None):
    """Standard ``{success, data, meta}`` envelope (existing API style)."""
    status = (data.get("data_status") or {}) if isinstance(data, dict) else {}
    return {
        "success": True,
        "data": data,
        "meta": {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "cache_hit": cache_hit,
            "cached_at": cached_at,
            "source": status.get("source"),
            "data_status": status.get("status"),
        },
    }


# Per-layer cache TTLs (seconds) — chosen to match how fast each
# phenomenon actually changes. See Phase 16.
LAYER_TTLS = {
    "earthquakes": 300,
    "disasters": 600,
    "wildfires": 600,
    "temperature": 3600,
    "precipitation": 3600,
    "clouds": 1800,
    "wind": 1800,
    "air_quality": 1800,
}

DEFAULT_TTL = 600


def ttl_for_layer(layer_id):
    return LAYER_TTLS.get(layer_id, DEFAULT_TTL)
