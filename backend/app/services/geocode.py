"""Coarse timezone approximation (Phase 2 boundary).

This is NOT a real timezone provider: it derives a UTC offset label from
longitude only, with no DST or political-boundary handling. It exists so
the frontend has a stable placeholder shape; the payload is always
labelled SIMULATED and must never be presented as an authoritative
timezone lookup.
"""

from ..utils.provenance import utcnow_iso

# Offset hours -> representative IANA name. Offsets are floor-divided
# from longitude (15 degrees per hour), clamped to [-12, +12].
TZ_NAMES = {
    -12: "Etc/GMT+12",
    -11: "Pacific/Pago_Pago",
    -10: "Pacific/Honolulu",
    -9: "America/Anchorage",
    -8: "America/Los_Angeles",
    -7: "America/Denver",
    -6: "America/Chicago",
    -5: "America/New_York",
    -4: "America/Halifax",
    -3: "America/Sao_Paulo",
    -2: "America/Noronha",
    -1: "Atlantic/Azores",
    0: "UTC",
    1: "Europe/Berlin",
    2: "Europe/Athens",
    3: "Europe/Moscow",
    4: "Asia/Dubai",
    5: "Asia/Karachi",
    6: "Asia/Dhaka",
    7: "Asia/Bangkok",
    8: "Asia/Shanghai",
    9: "Asia/Tokyo",
    10: "Australia/Sydney",
    11: "Pacific/Noumea",
    12: "Pacific/Auckland",
}


def get_timezone_info(lat, lon):
    """Return an approximate timezone payload for ``(lat, lon)``."""
    # Longitude-only approximation; latitude intentionally unused.
    offset_hours = int((lon + 180) // 15) - 12
    offset_hours = max(-12, min(12, offset_hours))
    sign = "+" if offset_hours >= 0 else "-"
    return {
        "timezone": TZ_NAMES.get(offset_hours, "UTC"),
        "offset": f"UTC{sign}{abs(offset_hours):02d}:00",
        "local_time": utcnow_iso(),
        "approximate": True,
    }
