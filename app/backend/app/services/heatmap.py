"""Heatmap providers (Phase 9).

Clean separation between gridded-data providers behind one schema:

* :func:`get_simulated_heatmap` — deterministic pseudo-random grid for
  development. Always labelled ``simulated``; never presented as a
  measured environmental field.
* :func:`get_heatmap` — dispatcher. When a real gridded dataset becomes
  available for a layer, wire it here and return ``live`` without any
  frontend change (same schema, ``data_status`` distinguishes them).

Schema (shared by both providers)::

    {
        "layer_id": str,
        "resolution": int,          # grid is resolution x resolution/2 (equirectangular 2:1)
        "grid": str,                # base64 little-endian float32 array
        "min_value": float,
        "max_value": float,
        "unit": str,
        "timestamp": str,           # ISO-8601 UTC
        "data_status": {...},       # live | simulated | unavailable
    }
"""

import base64
import hashlib
import random
import struct

from flask import current_app

from ..utils.provenance import SIMULATED, UNAVAILABLE, utcnow_iso, with_status

SOURCE = "Simulated grid"

UNIT_MAP = {
    "temperature": "celsius",
    "precipitation": "mm",
    "air_quality": "AQI",
    "clouds": "percent",
    "wind": "km/h",
    "wildfires": "brightness",
    "earthquakes": "magnitude",
    "disasters": "count",
}

BOUNDS_MAP = {
    "temperature": (-40.5, 48.2),
    "precipitation": (0.0, 80.0),
    "air_quality": (0.0, 300.0),
    "clouds": (0.0, 100.0),
    "wind": (0.0, 120.0),
    "wildfires": (300.0, 450.0),
    "earthquakes": (2.5, 8.5),
    "disasters": (0.0, 10.0),
}


def _seed_for(layer_id, resolution, time_range):
    digest = hashlib.sha256(f"{layer_id}:{resolution}:{time_range}".encode()).digest()
    return int.from_bytes(digest[:8], "little")


def get_simulated_heatmap(layer_id, resolution=128, time_range="24h"):
    """Deterministic simulated grid (development only — labelled)."""
    size = resolution * resolution // 2
    rng = random.Random(_seed_for(layer_id, resolution, time_range))
    grid = [rng.random() for _ in range(size)]

    grid_bytes = struct.pack(f"{len(grid)}f", *grid)
    min_value, max_value = BOUNDS_MAP.get(layer_id, (0.0, 1.0))

    payload = {
        "layer_id": layer_id,
        "resolution": resolution,
        "grid": base64.b64encode(grid_bytes).decode("utf-8"),
        "min_value": min_value,
        "max_value": max_value,
        "unit": UNIT_MAP.get(layer_id, "value"),
        "timestamp": utcnow_iso(),
    }
    return with_status(
        payload,
        SIMULATED,
        SOURCE,
        "Simulated heatmap grid for development — not measured environmental data.",
    )


def get_heatmap(layer_id, resolution=128, time_range="24h"):
    """Dispatcher: real gridded providers plug in here per layer."""
    # No real gridded dataset is wired up yet for any layer, so every
    # layer currently resolves to the simulated provider. The frontend
    # already handles the ``data_status`` distinction.
    real_providers = current_app.config.get("HEATMAP_PROVIDERS", {}) if current_app else {}
    provider = real_providers.get(layer_id)
    if provider is not None:
        try:
            return provider(layer_id=layer_id, resolution=resolution, time_range=time_range)
        except Exception as e:  # noqa: BLE001 — provider isolation, fall through to simulated
            if current_app:
                current_app.logger.error(f"Heatmap provider failed for {layer_id}: {e}")
    if layer_id not in BOUNDS_MAP:
        payload = {
            "layer_id": layer_id,
            "resolution": resolution,
            "grid": "",
            "min_value": 0.0,
            "max_value": 0.0,
            "unit": "value",
            "timestamp": utcnow_iso(),
        }
        return with_status(
            payload, UNAVAILABLE, SOURCE, f"No heatmap available for layer {layer_id!r}."
        )
    return get_simulated_heatmap(layer_id, resolution, time_range)
