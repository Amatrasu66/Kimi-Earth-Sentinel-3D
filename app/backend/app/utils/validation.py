"""Shared query-parameter validation helpers.

Every helper returns a ``(value, error)`` tuple where ``error`` is a
human-readable message (or ``None`` on success). Routes turn errors into
clean ``400`` JSON responses via :func:`error_response` so malformed input
can never cause a ``500``.
"""

from flask import jsonify

__all__ = [
    "SEVERITIES",
    "TIME_RANGES",
    "MAX_LIMIT",
    "DEFAULT_LIMIT",
    "MAX_HEATMAP_RESOLUTION",
    "DEFAULT_HEATMAP_RESOLUTION",
    "error_response",
    "parse_limit",
    "parse_bbox",
    "bbox_to_string",
    "parse_severity",
    "parse_resolution",
    "parse_time_range",
    "parse_lat_lon",
    "is_valid_coordinate",
]

SEVERITIES = ("low", "moderate", "high", "critical")
TIME_RANGES = ("24h", "48h", "7d", "30d")

MAX_LIMIT = 2000
DEFAULT_LIMIT = 500
MAX_HEATMAP_RESOLUTION = 512
DEFAULT_HEATMAP_RESOLUTION = 128


def error_response(message, code="INVALID_PARAMS", status=400):
    return jsonify({"success": False, "error": {"code": code, "message": message}}), status


def parse_limit(raw, default=DEFAULT_LIMIT, maximum=MAX_LIMIT):
    """Parse an optional ``limit`` query param."""
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, f"Invalid limit {raw!r}: must be an integer between 1 and {maximum}."
    if value < 1 or value > maximum:
        return None, f"Invalid limit {value}: must be between 1 and {maximum}."
    return value, None


def parse_bbox(raw):
    """Parse an optional ``bbox`` query param (minLon,minLat,maxLon,maxLat)."""
    if raw is None or raw == "":
        return None, None
    parts = raw.split(",")
    if len(parts) != 4:
        return None, "Invalid bbox: expected 'minLon,minLat,maxLon,maxLat'."
    try:
        min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
    except ValueError:
        return None, "Invalid bbox: all four values must be numbers."
    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        return None, "Invalid bbox: latitudes must be within -90..90."
    if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180):
        return None, "Invalid bbox: longitudes must be within -180..180."
    if min_lon >= max_lon or min_lat >= max_lat:
        return None, "Invalid bbox: require minLon < maxLon and minLat < maxLat."
    return {"min_lon": min_lon, "min_lat": min_lat, "max_lon": max_lon, "max_lat": max_lat}, None


def bbox_to_string(bbox):
    if not bbox:
        return None
    return f"{bbox['min_lon']},{bbox['min_lat']},{bbox['max_lon']},{bbox['max_lat']}"


def parse_severity(raw):
    if raw is None or raw == "":
        return None, None
    value = raw.lower()
    if value not in SEVERITIES:
        return None, f"Invalid min_severity {raw!r}: must be one of {', '.join(SEVERITIES)}."
    return value, None


def parse_resolution(raw, default=DEFAULT_HEATMAP_RESOLUTION, maximum=MAX_HEATMAP_RESOLUTION):
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, f"Invalid resolution {raw!r}: must be an integer between 1 and {maximum}."
    if value < 1 or value > maximum:
        return None, f"Invalid resolution {value}: must be between 1 and {maximum}."
    return value, None


def parse_time_range(raw, default="24h"):
    if raw is None or raw == "":
        return default, None
    if raw not in TIME_RANGES:
        return None, f"Invalid time_range {raw!r}: must be one of {', '.join(TIME_RANGES)}."
    return raw, None


def parse_lat_lon(lat_raw, lon_raw):
    """Parse and range-check a lat/lon pair. Returns ((lat, lon), error)."""
    try:
        lat = float(lat_raw) if lat_raw is not None else None
        lon = float(lon_raw) if lon_raw is not None else None
    except (TypeError, ValueError):
        return (None, "lat and lon must be numbers.")
    if lat is None or lon is None:
        return (None, "lat and lon are required.")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return (None, "lat must be within -90..90 and lon within -180..180.")
    return ((lat, lon), None)


def is_valid_coordinate(lat, lon):
    """Defensive coordinate check shared by services (NaN/Infinity/range)."""
    if isinstance(lat, bool) or isinstance(lon, bool):
        return False
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return False
    if lat != lat or lon != lon:  # NaN
        return False
    if lat in (float("inf"), float("-inf")) or lon in (float("inf"), float("-inf")):
        return False
    return -90 <= lat <= 90 and -180 <= lon <= 180
