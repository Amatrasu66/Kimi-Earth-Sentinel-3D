import time
from datetime import datetime, timedelta

import requests
from flask import current_app

from ..services.fallback import generate_mock_earthquakes
from ..utils.provenance import LIVE, SIMULATED, utcnow_iso, with_status
from ..utils.validation import is_valid_coordinate

SOURCE = "USGS"

_SEVERITY_FLOORS = {"low": 2.5, "moderate": 4.5, "high": 6.0, "critical": 7.0}


def _severity_for_magnitude(mag):
    if mag >= 7.0:
        return "critical"
    if mag >= 6.0:
        return "high"
    if mag >= 4.5:
        return "moderate"
    return "low"


def _fetch_from_provider(base_url, params, timeout):
    """Provider call isolated from normalization (Phase 7)."""
    resp = requests.get(f"{base_url}/fdsnws/event/1/query", params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _normalize(data, limit):
    """Normalize a USGS GeoJSON payload. Raises on malformed data."""
    points = []
    severity_counts = {"low": 0, "moderate": 0, "high": 0, "critical": 0}
    max_mag = 0

    for feature in data.get("features", [])[:limit]:
        props = feature["properties"]
        mag = props.get("mag")
        if mag is None:
            continue
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates") or []
        if len(coords) < 2:
            continue
        lon, lat = coords[0], coords[1]
        if not is_valid_coordinate(lat, lon):
            continue

        if mag > max_mag:
            max_mag = mag
        severity = _severity_for_magnitude(mag)
        severity_counts[severity] += 1

        points.append(
            {
                "id": feature.get("id", f"usgs-{len(points)}"),
                "lat": lat,
                "lon": lon,
                "magnitude": mag,
                "depth": coords[2] if len(coords) > 2 else 10,
                "severity": severity,
                "timestamp": time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime(props.get("time", 0) / 1000)
                ),
                "location": props.get("place", "Unknown location"),
                "url": props.get("url", ""),
            }
        )

    return {
        "layer_id": "earthquakes",
        "count": len(points),
        "points": points,
        "stats": {
            "total_24h": len([p for p in points if p["magnitude"] >= 2.5]),
            "max_magnitude": round(max_mag, 1),
            "by_severity": severity_counts,
        },
    }


def get_earthquake_data(bbox=None, limit=500, min_severity=None):
    """Fetch earthquake data from USGS API (labels provenance)."""
    timeout = current_app.config.get("REQUEST_TIMEOUT", 15)
    base_url = current_app.config.get("USGS_API_URL", "https://earthquake.usgs.gov")
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=30)

    params = {
        "format": "geojson",
        "starttime": start_time.strftime("%Y-%m-%d"),
        "endtime": end_time.strftime("%Y-%m-%d"),
        "minmagnitude": 2.5,
        "orderby": "time",
        "limit": limit,
    }

    if bbox:
        parts = bbox.split(",")
        if len(parts) == 4:
            params["minlongitude"] = parts[0]
            params["minlatitude"] = parts[1]
            params["maxlongitude"] = parts[2]
            params["maxlatitude"] = parts[3]

    if min_severity:
        params["minmagnitude"] = _SEVERITY_FLOORS.get(min_severity, 2.5)

    try:
        data = _fetch_from_provider(base_url, params, timeout)
    except requests.RequestException as e:
        current_app.logger.warning(f"USGS provider unreachable, using fallback: {e}")
        fallback = generate_mock_earthquakes(bbox=bbox, limit=limit)
        return with_status(
            fallback, SIMULATED, SOURCE, "USGS unavailable — showing simulated fallback data."
        )

    try:
        payload = _normalize(data, limit)
    except (KeyError, TypeError, ValueError) as e:
        current_app.logger.error(f"USGS response normalization failed: {e}")
        fallback = generate_mock_earthquakes(bbox=bbox, limit=limit)
        return with_status(
            fallback, SIMULATED, SOURCE, "USGS response malformed — showing simulated fallback data."
        )

    return with_status(payload, LIVE, SOURCE, fetched_at=utcnow_iso())
