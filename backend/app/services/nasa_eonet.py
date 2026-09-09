import requests
from flask import current_app

from ..services.fallback import generate_mock_disasters
from ..utils.provenance import LIVE, SIMULATED, utcnow_iso, with_status
from ..utils.validation import is_valid_coordinate

SOURCE = "NASA EONET"

_SEVERITY_ORDER = ["low", "moderate", "high", "critical"]


def _severity_for_categories(categories):
    ids = {c.get("id") for c in categories}
    if ids & {"severeStorms", "volcanoes"}:
        return "high"
    if ids & {"floods", "wildfires"}:
        return "moderate"
    return "low"


def _meets_min_severity(severity, min_severity):
    if not min_severity:
        return True
    if min_severity not in _SEVERITY_ORDER or severity not in _SEVERITY_ORDER:
        return True
    return _SEVERITY_ORDER.index(severity) >= _SEVERITY_ORDER.index(min_severity)


def _fetch_from_provider(base_url, params, timeout):
    """Provider call isolated from normalization (Phase 7)."""
    resp = requests.get(f"{base_url}/events", params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _normalize(data, limit, min_severity):
    """Normalize an EONET payload. Raises on malformed data."""
    points = []
    for event in data.get("events", [])[:limit]:
        categories = event.get("categories", [])
        cat_title = categories[0].get("title", "Unknown") if categories else "Unknown"

        geometries = event.get("geometries", [])
        if not geometries:
            continue
        latest_geo = geometries[-1]
        coords = latest_geo.get("coordinates") or []
        if len(coords) < 2:
            continue
        # EONET geometries may be Point [lon, lat] — guard ordering.
        lon, lat = coords[0], coords[1]
        if not is_valid_coordinate(lat, lon):
            continue

        severity = _severity_for_categories(categories)
        if not _meets_min_severity(severity, min_severity):
            continue

        points.append(
            {
                "id": f"eonet-{event.get('id', len(points))}",
                "lat": lat,
                "lon": lon,
                "type": cat_title.lower().replace(" ", "_"),
                "severity": severity,
                "title": event.get("title", "Unknown Event"),
                "timestamp": latest_geo.get("date") or utcnow_iso(),
                "description": f"{cat_title} event reported by NASA EONET",
                "sources": [s.get("id", "eonet") for s in event.get("sources", [])],
                "categories": [c.get("title", "") for c in categories],
            }
        )
    return {"layer_id": "disasters", "count": len(points), "points": points}


def get_eonet_events(bbox=None, limit=500, min_severity=None):
    """Fetch natural disaster events from NASA EONET (labels provenance)."""
    timeout = current_app.config["REQUEST_TIMEOUT"]
    base_url = current_app.config["NASA_EONET_URL"]

    params = {"status": "open", "limit": limit}
    if bbox:
        params["bbox"] = bbox

    try:
        data = _fetch_from_provider(base_url, params, timeout)
    except requests.RequestException as e:
        current_app.logger.warning(f"EONET provider unreachable, using fallback: {e}")
        fallback = generate_mock_disasters(bbox=bbox, limit=limit)
        return with_status(
            fallback, SIMULATED, SOURCE, "NASA EONET unavailable — showing simulated fallback data."
        )

    try:
        payload = _normalize(data, limit, min_severity)
    except (KeyError, TypeError, ValueError, AttributeError) as e:
        current_app.logger.error(f"EONET response normalization failed: {e}")
        fallback = generate_mock_disasters(bbox=bbox, limit=limit)
        return with_status(
            fallback,
            SIMULATED,
            SOURCE,
            "NASA EONET response malformed — showing simulated fallback data.",
        )

    return with_status(payload, LIVE, SOURCE, fetched_at=utcnow_iso())
