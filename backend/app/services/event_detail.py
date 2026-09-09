"""Live event-detail lookups (application service).

Resolver strategy — provider identity is explicit, never guessed:

* ``eonet-<providerId>`` → NASA EONET individual-event endpoint.
* ``fire-<lat>-<lon>``   → FIRMS observation with no persistent event id.
  There is no reliable individual lookup, so these keep the labelled
  marker-level SIMULATED fallback (never a manufactured "live" event).
* ``usgs-<random>``       → mock marker minted while USGS was unreachable.
  Short-circuited to SIMULATED without wasting an upstream call.
* ``<alphanumeric>``      → USGS detail feed (live marker ids are raw
  provider ids such as ``us7000abcd``).
* anything else           → generic SIMULATED fallback (weather/AQI/etc.
  markers have no event endpoint).

Failure semantics mirror :mod:`app.services.layer_service`:

* LIVE payloads are cached (``event:<provider>:<id>``, ``EVENT_DETAIL_TTL``)
  preserving the original ``fetched_at``; an expired LIVE entry is served
  once more as STALE when a refresh fails.
* Provider unreachable / malformed response → labelled SIMULATED fallback.
* :class:`EventNotFound` propagates so the route can answer 404 — a
  provider-confirmed absence is never disguised as fallback data.
* Any other unexpected exception propagates to the JSON 500 handler.
"""

import re
from datetime import datetime, timezone

import requests
from flask import current_app

from ..utils.provenance import LIVE, SIMULATED, utcnow_iso, with_status
from ..utils.validation import is_valid_coordinate
from .fallback import get_mock_event_detail
from .layer_service import _resolve
from .nasa_eonet import _severity_for_categories
from .usgs import _severity_for_magnitude

PROVIDER_USGS = "usgs"
PROVIDER_EONET = "eonet"

# Event details change slowly (post-review updates, closures); a short TTL
# keeps reopened panels fresh without hammering providers.
EVENT_DETAIL_TTL = 300

_USGS_ID_RE = re.compile(r"^[A-Za-z0-9]{4,64}$")


class EventNotFound(Exception):
    """The provider confirms the event does not exist (maps to HTTP 404)."""


def resolve_provider(event_id):
    """Return ``"usgs"`` / ``"eonet"``, or ``None`` for simulated-only ids."""
    if event_id.startswith("eonet-") and len(event_id) > len("eonet-"):
        return PROVIDER_EONET
    if event_id.startswith("fire-") or event_id.startswith("usgs-"):
        return None
    if _USGS_ID_RE.match(event_id):
        return PROVIDER_USGS
    return None


def event_cache_key(provider, event_id):
    return f"event:{provider}:{event_id}"


def _ms_to_iso(value):
    """USGS epoch-milliseconds → UTC ISO string (None stays None)."""
    if value is None:
        return None
    try:
        ms = float(value)
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# USGS earthquake details
# ---------------------------------------------------------------------------


def _fetch_usgs_event(base_url, event_id, timeout):
    """GET the USGS GeoJSON detail feed for one event.

    Raises :class:`EventNotFound` when USGS confirms the event is absent;
    other transport problems surface as :class:`requests.RequestException`.
    """
    resp = requests.get(
        f"{base_url}/earthquakes/feed/v1.0/detail/{event_id}.geojson",
        timeout=timeout,
    )
    if resp.status_code == 404:
        raise EventNotFound(f"USGS event {event_id!r} not found.")
    resp.raise_for_status()
    return resp.json()


def _normalize_usgs_event(feature, event_id):
    """Normalize a USGS detail Feature. Raises on malformed data."""
    if not isinstance(feature, dict) or not isinstance(feature.get("properties"), dict):
        raise ValueError("Unexpected USGS detail response shape")
    props = feature["properties"]
    geometry = feature.get("geometry") or {}
    coords = geometry.get("coordinates") or []
    if len(coords) < 2:
        raise ValueError("USGS detail has no usable coordinates")
    lon, lat = coords[0], coords[1]
    if not is_valid_coordinate(lat, lon):
        raise ValueError("USGS detail coordinates out of range")

    mag = props.get("mag")
    tsunami = props.get("tsunami")
    return {
        "id": feature.get("id", event_id),
        "layer_id": "earthquakes",
        "provider": "USGS",
        "type": props.get("type", "earthquake"),
        "title": props.get("title")
        or (f"M{mag} earthquake" if mag is not None else "Earthquake"),
        "description": None,
        "lat": lat,
        "lon": lon,
        "depth": coords[2] if len(coords) > 2 else None,
        "timestamp": _ms_to_iso(props.get("time")),
        "updated_at": _ms_to_iso(props.get("updated")),
        "severity": _severity_for_magnitude(mag) if mag is not None else "low",
        "magnitude": mag,
        "magnitude_unit": props.get("magType"),
        "status": props.get("status"),
        "closed_at": None,
        "source": {"name": "USGS", "url": props.get("url") or ""},
        "categories": None,
        "geometry_type": geometry.get("type"),
        "felt": props.get("felt"),
        "alert": props.get("alert"),
        "tsunami": bool(tsunami) if tsunami is not None else None,
        "significance": props.get("sig"),
    }


def _live_usgs_detail(event_id):
    """Fetch + normalize one USGS event, labelled LIVE or SIMULATED."""
    base_url = current_app.config["USGS_API_URL"]
    timeout = current_app.config["REQUEST_TIMEOUT"]
    try:
        feature = _fetch_usgs_event(base_url, event_id, timeout)
    except EventNotFound:
        raise
    except requests.RequestException as e:
        current_app.logger.warning(f"USGS event detail unreachable, using fallback: {e}")
        return with_status(
            get_mock_event_detail(event_id),
            SIMULATED,
            "USGS",
            "USGS event detail unavailable — showing simulated fallback data.",
        )
    try:
        payload = _normalize_usgs_event(feature, event_id)
    except (KeyError, TypeError, ValueError, AttributeError) as e:
        current_app.logger.error(f"USGS event detail normalization failed: {e}")
        return with_status(
            get_mock_event_detail(event_id),
            SIMULATED,
            "USGS",
            "USGS event detail malformed — showing simulated fallback data.",
        )
    return with_status(payload, LIVE, "USGS", fetched_at=utcnow_iso())


# ---------------------------------------------------------------------------
# NASA EONET disaster details
# ---------------------------------------------------------------------------


def _fetch_eonet_event(base_url, eonet_id, timeout):
    """GET one EONET event. 404 → :class:`EventNotFound`."""
    resp = requests.get(f"{base_url}/events/{eonet_id}", timeout=timeout)
    if resp.status_code == 404:
        raise EventNotFound(f"EONET event {eonet_id!r} not found.")
    resp.raise_for_status()
    return resp.json()


def _latest_geometry(geometries):
    """Pick the latest geometry record by date (EONET may return many)."""
    dated = [g for g in geometries if isinstance(g, dict)]
    if not dated:
        return {}
    return max(dated, key=lambda g: g.get("date") or "")


def _normalize_eonet_event(event, marker_id):
    """Normalize an EONET event object. Raises on malformed data."""
    if not isinstance(event, dict) or "id" not in event:
        raise ValueError("Unexpected EONET event response shape")
    categories = event.get("categories") or []
    cat_titles = [c.get("title") for c in categories if isinstance(c, dict) and c.get("title")]
    cat_title = cat_titles[0] if cat_titles else "Unknown"
    raw_sources = event.get("sources") or []
    sources = [
        {"id": s.get("id", "eonet"), "url": s.get("url", "")}
        for s in raw_sources
        if isinstance(s, dict)
    ]
    latest = _latest_geometry(event.get("geometries") or [])
    geom_type = latest.get("type")
    coords = latest.get("coordinates") or []
    lat = lon = None
    if geom_type == "Point" and len(coords) >= 2 and is_valid_coordinate(coords[1], coords[0]):
        lon, lat = coords[0], coords[1]
    closed = event.get("closed")
    return {
        "id": marker_id,
        "layer_id": "disasters",
        "provider": "NASA EONET",
        "type": cat_title.lower().replace(" ", "_"),
        "title": event.get("title", "Unknown Event"),
        "description": event.get("description"),
        "lat": lat,
        "lon": lon,
        "timestamp": latest.get("date"),
        "updated_at": None,
        "severity": _severity_for_categories(categories),
        "magnitude": latest.get("magnitudeValue"),
        "magnitude_unit": latest.get("magnitudeUnit"),
        "status": "closed" if closed else "open",
        "closed_at": closed,
        "source": {"name": "NASA EONET", "url": event.get("link") or ""},
        "categories": cat_titles or None,
        "geometry_type": geom_type,
        "sources": sources,
        "felt": None,
        "alert": None,
        "tsunami": None,
        "significance": None,
    }


def _live_eonet_detail(marker_id):
    """Fetch + normalize one EONET event, labelled LIVE or SIMULATED."""
    eonet_id = marker_id[len("eonet-"):]
    base_url = current_app.config["NASA_EONET_URL"]
    timeout = current_app.config["REQUEST_TIMEOUT"]
    try:
        event = _fetch_eonet_event(base_url, eonet_id, timeout)
    except EventNotFound:
        raise
    except requests.RequestException as e:
        current_app.logger.warning(f"EONET event detail unreachable, using fallback: {e}")
        return with_status(
            get_mock_event_detail(marker_id),
            SIMULATED,
            "NASA EONET",
            "NASA EONET event detail unavailable — showing simulated fallback data.",
        )
    try:
        payload = _normalize_eonet_event(event, marker_id)
    except (KeyError, TypeError, ValueError, AttributeError) as e:
        current_app.logger.error(f"EONET event detail normalization failed: {e}")
        return with_status(
            get_mock_event_detail(marker_id),
            SIMULATED,
            "NASA EONET",
            "NASA EONET event detail malformed — showing simulated fallback data.",
        )
    return with_status(payload, LIVE, "NASA EONET", fetched_at=utcnow_iso())


# ---------------------------------------------------------------------------
# Simulated-only ids (wildfire observations, mock markers, other layers)
# ---------------------------------------------------------------------------


def _simulated_event_detail(event_id):
    """Marker-level fallback detail, always labelled SIMULATED."""
    event = get_mock_event_detail(event_id)
    if event_id.startswith("fire-"):
        # FIRMS markers are brightness observations, not persistent events —
        # say so explicitly instead of implying a live record exists.
        event["layer_id"] = "wildfires"
        event["type"] = "wildfire"
        event["source"] = {
            "name": "NASA FIRMS",
            "url": current_app.config["NASA_FIRMS_URL"],
        }
        return with_status(
            event,
            SIMULATED,
            "NASA FIRMS",
            "No live individual-event lookup for FIRMS fire observations — "
            "showing reference detail for this marker.",
        )
    source = (event.get("source") or {}).get("name", "fallback")
    return with_status(
        event,
        SIMULATED,
        source,
        "No live event lookup for this marker — showing simulated detail.",
    )


def get_event_detail(event_id):
    """Resolve one event id to a detail payload with cache semantics.

    Returns ``(data, cache_hit, stale)``. Raises :class:`EventNotFound`
    when the provider confirms the event does not exist.
    """
    provider = resolve_provider(event_id)
    if provider is None:
        return _simulated_event_detail(event_id), False, False
    key = event_cache_key(provider, event_id)
    if provider == PROVIDER_USGS:
        return _resolve(key, EVENT_DETAIL_TTL, lambda: _live_usgs_detail(event_id))
    return _resolve(key, EVENT_DETAIL_TTL, lambda: _live_eonet_detail(event_id))
