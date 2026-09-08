import random
import time

import requests
from flask import current_app

from ..utils.provenance import LIVE, SIMULATED, utcnow_iso, with_status
from ..utils.validation import is_valid_coordinate

SOURCE = "AirNow"


def _severity_for_aqi(aqi):
    if aqi > 300:
        return "critical"
    if aqi > 200:
        return "high"
    if aqi > 150:
        return "moderate"
    return "low"


def _fetch_from_provider(base_url, api_key, timeout):
    """Provider call isolated from normalization (Phase 7)."""
    # AirNow is US-only; query a central-US point with a wide radius.
    # Documented endpoint: GET /aq/observation/latLong/current/
    resp = requests.get(
        f"{base_url}/latLong/current/",
        params={
            "format": "application/json",
            "latitude": 39.0,
            "longitude": -98.5,
            "distance": 500,
            "API_KEY": api_key,
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        raise ValueError("Unexpected AirNow response shape")
    return data


def _normalize(items, limit):
    points = []
    for item in items[:limit]:
        lat = item.get("Latitude", 39.0)
        lon = item.get("Longitude", -98.5)
        if not is_valid_coordinate(lat, lon):
            continue
        aqi = item.get("AQI", 0)
        points.append(
            {
                "id": f"aqi-{lat}-{lon}",
                "lat": lat,
                "lon": lon,
                "value": aqi,
                "severity": _severity_for_aqi(aqi),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "location": item.get("ReportingArea", "Unknown"),
                "parameter": item.get("ParameterName", "PM2.5"),
            }
        )
    return {"layer_id": "air_quality", "count": len(points), "points": points, "unit": "AQI"}


def get_air_quality_data(bbox=None, limit=500, min_severity=None):
    """Fetch air quality data from AirNow API (labels provenance)."""
    api_key = current_app.config.get("AIRNOW_API_KEY")
    if not api_key:
        return with_status(
            _generate_mock_aqi(bbox, limit),
            SIMULATED,
            SOURCE,
            "No AirNow API key configured — showing simulated fallback data.",
        )

    try:
        airnow_url = current_app.config.get(
            "AIRNOW_API_URL", "https://www.airnowapi.org/aq/observation"
        )
        items = _fetch_from_provider(
            airnow_url,
            api_key,
            current_app.config.get("REQUEST_TIMEOUT", 15),
        )
    except (requests.RequestException, ValueError) as e:
        current_app.logger.warning(f"AirNow provider unreachable, using fallback: {e}")
        return with_status(
            _generate_mock_aqi(bbox, limit),
            SIMULATED,
            SOURCE,
            "AirNow unavailable — showing simulated fallback data.",
        )

    try:
        payload = _normalize(items, limit)
    except (KeyError, TypeError, AttributeError) as e:
        current_app.logger.error(f"AirNow response normalization failed: {e}")
        return with_status(
            _generate_mock_aqi(bbox, limit),
            SIMULATED,
            SOURCE,
            "AirNow response malformed — showing simulated fallback data.",
        )

    return with_status(payload, LIVE, SOURCE, fetched_at=utcnow_iso())


def _generate_mock_aqi(bbox=None, limit=500):
    """Generate mock AQI data for global coverage."""
    cities = [
        {"name": "Beijing", "lat": 39.9042, "lon": 116.4074, "aqi": 165},
        {"name": "Delhi", "lat": 28.6139, "lon": 77.2090, "aqi": 189},
        {"name": "Lagos", "lat": 6.5244, "lon": 3.3792, "aqi": 142},
        {"name": "Sao Paulo", "lat": -23.5505, "lon": -46.6333, "aqi": 78},
        {"name": "Mexico City", "lat": 19.4326, "lon": -99.1332, "aqi": 134},
        {"name": "Los Angeles", "lat": 34.0522, "lon": -118.2437, "aqi": 95},
        {"name": "London", "lat": 51.5074, "lon": -0.1278, "aqi": 45},
        {"name": "Tokyo", "lat": 35.6762, "lon": 139.6503, "aqi": 52},
        {"name": "Jakarta", "lat": -6.2088, "lon": 106.8456, "aqi": 156},
        {"name": "Cairo", "lat": 30.0444, "lon": 31.2357, "aqi": 178},
        {"name": "Mumbai", "lat": 19.0760, "lon": 72.8777, "aqi": 167},
        {"name": "Bangkok", "lat": 13.7563, "lon": 100.5018, "aqi": 112},
        {"name": "Seoul", "lat": 37.5665, "lon": 126.9780, "aqi": 88},
        {"name": "Paris", "lat": 48.8566, "lon": 2.3522, "aqi": 38},
        {"name": "New York", "lat": 40.7128, "lon": -74.0060, "aqi": 42},
        {"name": "Sydney", "lat": -33.8688, "lon": 151.2093, "aqi": 28},
        {"name": "Moscow", "lat": 55.7558, "lon": 37.6173, "aqi": 72},
        {"name": "Istanbul", "lat": 41.0082, "lon": 28.9784, "aqi": 98},
        {"name": "Dubai", "lat": 25.2048, "lon": 55.2708, "aqi": 125},
        {"name": "Singapore", "lat": 1.3521, "lon": 103.8198, "aqi": 55},
    ]

    random.seed(42)
    points = []
    for city in cities[:limit]:
        aqi = max(0, min(500, city["aqi"] + random.randint(-20, 20)))

        points.append(
            {
                "id": f"aqi-{city['lat']}-{city['lon']}",
                "lat": city["lat"],
                "lon": city["lon"],
                "value": aqi,
                "severity": _severity_for_aqi(aqi),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "location": city["name"],
                "parameter": "PM2.5",
            }
        )

    return {"layer_id": "air_quality", "count": len(points), "points": points, "unit": "AQI"}
