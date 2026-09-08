import random
import time

import requests
from flask import current_app

from ..utils.provenance import LIVE, SIMULATED, utcnow_iso, with_status
from ..utils.validation import is_valid_coordinate

SOURCE = "NASA FIRMS"


def _severity_for_brightness(bright):
    if bright > 400:
        return "critical"
    if bright > 350:
        return "high"
    if bright > 320:
        return "moderate"
    return "low"


def _fetch_from_provider(base_url, api_key, timeout):
    """Provider call isolated from normalization (Phase 7)."""
    resp = requests.get(
        f"{base_url}/area/csv/VIIRS_NOAA20_NRT/{api_key}/WORLD/1",
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.text


def _normalize(csv_text, limit):
    """Normalize a FIRMS CSV payload. Raises on malformed data."""
    points = []
    lines = csv_text.strip().split("\n")[1:]  # Skip header

    for line in lines[:limit]:
        parts = line.split(",")
        if len(parts) < 3:
            continue
        try:
            lat = float(parts[0])
            lon = float(parts[1])
            bright = float(parts[2]) if len(parts) > 2 else 300
        except (ValueError, IndexError):
            continue
        if not is_valid_coordinate(lat, lon):
            continue

        points.append(
            {
                "id": f"fire-{lat}-{lon}",
                "lat": lat,
                "lon": lon,
                "value": round(bright, 1),
                "severity": _severity_for_brightness(bright),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "unit": "brightness",
            }
        )
    return {"layer_id": "wildfires", "count": len(points), "points": points, "unit": "brightness"}


def get_fire_data(bbox=None, limit=500, min_severity=None):
    """Fetch active fire data from NASA FIRMS (labels provenance)."""
    api_key = current_app.config.get("NASA_FIRMS_API_KEY")
    if not api_key:
        return with_status(
            _generate_mock_fires(bbox, limit),
            SIMULATED,
            SOURCE,
            "No NASA FIRMS API key configured — showing simulated fallback data.",
        )

    try:
        firms_url = current_app.config.get(
            "NASA_FIRMS_URL", "https://firms.modaps.eosdis.nasa.gov/api"
        )
        csv_text = _fetch_from_provider(
            firms_url,
            api_key,
            current_app.config.get("REQUEST_TIMEOUT", 15),
        )
    except requests.RequestException as e:
        current_app.logger.warning(f"FIRMS provider unreachable, using fallback: {e}")
        return with_status(
            _generate_mock_fires(bbox, limit),
            SIMULATED,
            SOURCE,
            "NASA FIRMS unavailable — showing simulated fallback data.",
        )

    try:
        payload = _normalize(csv_text, limit)
    except (ValueError, IndexError, AttributeError) as e:
        current_app.logger.error(f"FIRMS response normalization failed: {e}")
        return with_status(
            _generate_mock_fires(bbox, limit),
            SIMULATED,
            SOURCE,
            "NASA FIRMS response malformed — showing simulated fallback data.",
        )

    return with_status(payload, LIVE, SOURCE, fetched_at=utcnow_iso())


def _generate_mock_fires(bbox=None, limit=500):
    """Generate mock wildfire data."""
    fire_regions = [
        {"lat": 64.8378, "lon": -147.7164, "name": "Alaska"},
        {"lat": 37.7749, "lon": -122.4194, "name": "California"},
        {"lat": -33.8688, "lon": 150.2093, "name": "Australia"},
        {"lat": -15.7975, "lon": -47.8919, "name": "Brazil"},
        {"lat": 1.3521, "lon": 103.8198, "name": "Indonesia"},
        {"lat": 46.8625, "lon": 103.8467, "name": "Mongolia"},
        {"lat": 60.4720, "lon": 8.4689, "name": "Norway"},
        {"lat": 51.2538, "lon": -85.3232, "name": "Canada"},
        {"lat": -1.2921, "lon": 36.8219, "name": "Kenya"},
        {"lat": 20.5937, "lon": 78.9629, "name": "India"},
    ]

    random.seed(42)
    points = []

    for region in fire_regions:
        for _ in range(random.randint(3, 15)):
            lat = region["lat"] + random.uniform(-5, 5)
            lon = region["lon"] + random.uniform(-5, 5)
            bright = random.uniform(300, 450)

            points.append(
                {
                    "id": f"fire-{lat:.4f}-{lon:.4f}",
                    "lat": lat,
                    "lon": lon,
                    "value": round(bright, 1),
                    "severity": _severity_for_brightness(bright),
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "location": region["name"],
                    "unit": "brightness",
                }
            )

    return {
        "layer_id": "wildfires",
        "count": len(points),
        "points": points[:limit],
        "unit": "brightness",
    }
