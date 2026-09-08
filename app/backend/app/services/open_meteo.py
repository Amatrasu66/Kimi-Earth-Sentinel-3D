import random

import requests
from flask import current_app

from ..utils.provenance import LIVE, SIMULATED, utcnow_iso, with_status

SOURCE = "Open-Meteo"

# Validation allows limit up to 2000, but a single layer fetch is bounded
# here to keep upstream request counts small (batched, serial).
MAX_FETCH_POINTS = 200

METRIC_FIELDS = {
    "temperature": "temperature_2m",
    "precipitation": "precipitation",
    "cloudcover": "cloudcover",
    "wind": "windspeed_10m",
}

UNITS = {
    "temperature": "celsius",
    "precipitation": "mm",
    "cloudcover": "percent",
    "wind": "km/h",
}


def _get_unit(metric):
    return UNITS.get(metric, "value")


def _severity_for_value(metric, val):
    if metric == "temperature":
        if val > 40 or val < -20:
            return "high"
        if val > 35 or val < -10:
            return "moderate"
    elif metric == "precipitation":
        if val > 50:
            return "high"
        if val > 20:
            return "moderate"
    elif metric == "cloudcover":
        if val > 80:
            return "high"
        if val > 50:
            return "moderate"
    elif metric == "wind":
        if val > 100:
            return "high"
        if val > 60:
            return "moderate"
    return "low"


_SEVERITY_ORDER = ["low", "moderate", "high", "critical"]


def _meets_min_severity(severity, min_severity):
    if not min_severity:
        return True
    if min_severity not in _SEVERITY_ORDER or severity not in _SEVERITY_ORDER:
        return True
    return _SEVERITY_ORDER.index(severity) >= _SEVERITY_ORDER.index(min_severity)


def _generate_weather_grid(bbox=None):
    """Generate a grid of lat/lon points."""
    points = []
    if bbox:
        parts = [float(p) for p in bbox.split(",")]
        lons = [parts[0] + i * (parts[2] - parts[0]) / 10 for i in range(10)]
        lats = [parts[1] + i * (parts[3] - parts[1]) / 10 for i in range(10)]
    else:
        lons = list(range(-180, 180, 30))
        lats = list(range(-60, 75, 15))

    for lon in lons:
        for lat in lats:
            points.append({"lat": lat, "lon": lon})
    return points


def _fetch_batch(base_url, points, field, timeout):
    """Fetch one chunk of grid points in a single provider request.

    Open-Meteo accepts comma-separated ``latitude``/``longitude`` arrays
    and returns one result object per location, in request order. This
    turns up to ``limit`` serial requests into a handful of batched ones.
    """
    latitudes = ",".join(f"{p['lat']:.4f}" for p in points)
    longitudes = ",".join(f"{p['lon']:.4f}" for p in points)
    resp = requests.get(
        f"{base_url}/forecast",
        params={
            "latitude": latitudes,
            "longitude": longitudes,
            "current": field,
            "temperature_unit": "celsius",
            "windspeed_unit": "kmh",
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    # Single location → object; multiple → array. Normalize to a list.
    if isinstance(data, dict):
        return [data]
    if not isinstance(data, list):
        raise ValueError("Unexpected Open-Meteo response shape")
    return data


def _chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def get_weather_data(metric="temperature", bbox=None, limit=500, min_severity=None, layer_id=None):
    """Fetch weather data from Open-Meteo API (labels provenance).

    ``layer_id`` is the public layer name (e.g. ``clouds``); ``metric`` is
    the Open-Meteo variable (e.g. ``cloudcover``).
    """
    layer = layer_id or metric
    field = METRIC_FIELDS.get(metric, "temperature_2m")
    base_url = current_app.config["OPEN_METEO_URL"]
    timeout = current_app.config["REQUEST_TIMEOUT"]

    try:
        grid_points = _generate_weather_grid(bbox)
    except (ValueError, IndexError, ZeroDivisionError) as e:
        current_app.logger.error(f"Open-Meteo grid generation failed: {e}")
        return with_status(
            _generate_mock_weather(metric, None, limit, layer, min_severity),
            SIMULATED,
            SOURCE,
            "Invalid bounding box — showing simulated fallback data.",
        )

    # Bounded batching: at most BATCH_SIZE locations per upstream request,
    # chunks fetched serially to stay well under provider rate limits.
    BATCH_SIZE = 50
    points = []
    failures = 0
    truncated = len(grid_points) > MAX_FETCH_POINTS
    for chunk in _chunks(grid_points[: min(limit, MAX_FETCH_POINTS)], BATCH_SIZE):
        try:
            results = _fetch_batch(base_url, chunk, field, timeout)
        except (requests.RequestException, ValueError, KeyError) as e:
            failures += len(chunk)
            current_app.logger.debug(f"Open-Meteo batch fetch failed: {e}")
            continue
        for pt, result in zip(chunk, results):
            try:
                current = (result or {}).get("current", {})
                val = current.get(field, 0)
                severity = _severity_for_value(metric, val)
                if not _meets_min_severity(severity, min_severity):
                    continue
                points.append(
                    {
                        "id": f"wx-{pt['lat']:.2f}-{pt['lon']:.2f}",
                        "lat": pt["lat"],
                        "lon": pt["lon"],
                        "value": round(val, 1),
                        "severity": severity,
                        "timestamp": current.get("time", utcnow_iso()),
                        "unit": _get_unit(metric),
                    }
                )
            except (ValueError, KeyError, TypeError, AttributeError) as e:
                failures += 1
                current_app.logger.debug(f"Open-Meteo point parse failed: {e}")
                continue

    if not points:
        current_app.logger.warning("Open-Meteo provider unreachable, using fallback")
        return with_status(
            _generate_mock_weather(metric, bbox, limit, layer, min_severity),
            SIMULATED,
            SOURCE,
            "Open-Meteo unavailable — showing simulated fallback data.",
        )

    payload = {
        "layer_id": layer,
        "count": len(points),
        "points": points,
        "unit": _get_unit(metric),
    }
    warnings = []
    if failures:
        warnings.append(f"{failures} grid points could not be fetched.")
    if truncated or limit > MAX_FETCH_POINTS:
        warnings.append(
            f"Results bounded to {MAX_FETCH_POINTS} grid points per request."
        )
    if warnings:
        payload["warnings"] = warnings
    return with_status(payload, LIVE, SOURCE, fetched_at=utcnow_iso())


def _generate_mock_weather(metric, bbox, limit, layer_id=None, min_severity=None):
    points = []
    grid = _generate_weather_grid(bbox)
    random.seed(42)

    for pt in grid:
        if len(points) >= limit:
            break
        if metric == "temperature":
            val = random.uniform(-30, 45)
        elif metric == "precipitation":
            val = random.uniform(0, 80)
        elif metric == "wind":
            val = random.uniform(0, 120)
        else:
            val = random.uniform(0, 100)

        severity = _severity_for_value(metric, val)
        if not _meets_min_severity(severity, min_severity):
            continue

        points.append(
            {
                "id": f"wx-{pt['lat']:.2f}-{pt['lon']:.2f}",
                "lat": pt["lat"],
                "lon": pt["lon"],
                "value": round(val, 1),
                "severity": severity,
                "timestamp": utcnow_iso(),
                "unit": _get_unit(metric),
            }
        )

    return {
        "layer_id": layer_id or metric,
        "count": len(points),
        "points": points,
        "unit": _get_unit(metric),
    }
