"""NASA GIBS imagery URL builder (Phase 2 boundary).

Routes validate HTTP input; all provider URL templating lives here so the
route module never embeds upstream URL shapes. Tile coordinates are
validated against the zoom level (``x, y < 2**z`` for the geographic
profile used here).
"""

from datetime import datetime, timezone

GIBS_LAYERS = [
    {
        "id": "MODIS_Terra_CorrectedReflectance_TrueColor",
        "name": "True Color",
        "projection": "geographic",
        "format": "image/jpeg",
        "tilematrixset": "250m",
        "zoom_levels": list(range(9)),
    },
    {
        "id": "VIIRS_SNPP_CorrectedReflectance_TrueColor",
        "name": "VIIRS True Color",
        "projection": "geographic",
        "format": "image/jpeg",
        "tilematrixset": "250m",
        "zoom_levels": list(range(9)),
    },
    {
        "id": "MODIS_Terra_Brightness_Temp_Band31_Day",
        "name": "Temperature",
        "projection": "geographic",
        "format": "image/png",
        "tilematrixset": "1km",
        "zoom_levels": list(range(7)),
    },
]

_ALLOWED_GIBS_IDS = {layer["id"] for layer in GIBS_LAYERS}
_LAYER_BY_ID = {layer["id"]: layer for layer in GIBS_LAYERS}

_EXTENSION_BY_FORMAT = {
    "image/jpeg": "jpeg",
    "image/png": "png",
}


def is_allowed_layer(layer):
    return layer in _ALLOWED_GIBS_IDS


def is_valid_tile(layer, z, x, y):
    """Check zoom range and per-zoom x/y bounds for the geographic profile."""
    meta = _LAYER_BY_ID.get(layer)
    if meta is None:
        return False
    if z not in meta["zoom_levels"]:
        return False
    if x < 0 or y < 0:
        return False
    # Geographic (epsg4326) tiles double per zoom level in each axis.
    max_index = 2**z
    return x < max_index and y < max_index


def build_tile_url(base_url, layer, z, x, y, date=None):
    """Build the upstream GIBS WMTS URL for an allow-listed layer.

    Uses the layer's own tilematrixset/format (not a hardcoded 250m/jpeg)
    and a UTC date (not server-local time).
    """
    meta = _LAYER_BY_ID.get(layer)
    if meta is None:
        raise ValueError(f"Imagery layer {layer!r} not found.")
    day = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ext = _EXTENSION_BY_FORMAT.get(meta["format"], "jpeg")
    return (
        f"{base_url.rstrip('/')}/wmts/epsg4326/best/"
        f"{layer}/default/{day}/{meta['tilematrixset']}/{z}/{y}/{x}.{ext}"
    )
