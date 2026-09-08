import os
from dotenv import load_dotenv

load_dotenv()


def _csv(name, default):
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _as_bool(raw, default=True):
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


class Config:
    FLASK_ENV = os.environ.get("FLASK_ENV", "production")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

    # CORS — explicit allow-list (Phase 17). Development default covers Vite.
    CORS_ORIGINS = _csv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")

    # Cache (Phase 5): process-local in-memory cache. CACHE_DEFAULT_TIMEOUT
    # is the fallback TTL; per-layer TTLs live in utils/provenance.py.
    # No database is required (see README: architecture).
    CACHE_DEFAULT_TIMEOUT = int(os.environ.get("CACHE_DEFAULT_TIMEOUT", 300))

    # API URLs
    USGS_API_URL = os.environ.get("USGS_API_URL", "https://earthquake.usgs.gov")
    NASA_EONET_URL = os.environ.get("NASA_EONET_URL", "https://eonet.gsfc.nasa.gov/api/v3")
    NASA_GIBS_URL = os.environ.get("NASA_GIBS_URL", "https://gibs.earthdata.nasa.gov")
    OPEN_METEO_URL = os.environ.get("OPEN_METEO_URL", "https://api.open-meteo.com/v1")
    AIRNOW_API_URL = os.environ.get(
        "AIRNOW_API_URL", "https://www.airnowapi.org/aq/observation"
    )
    NASA_FIRMS_URL = os.environ.get(
        "NASA_FIRMS_URL", "https://firms.modaps.eosdis.nasa.gov/api"
    )

    # API Keys (server-side only — never sent to the frontend)
    AIRNOW_API_KEY = os.environ.get("AIRNOW_API_KEY", None)
    NASA_FIRMS_API_KEY = os.environ.get("NASA_FIRMS_API_KEY", None)

    # Outbound HTTP timeout (seconds) for provider calls
    REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", 15))

    # Real gridded heatmap providers plug in here per layer (Phase 9).
    # Example: HEATMAP_PROVIDERS["temperature"] = my_gridded_provider
    HEATMAP_PROVIDERS = {}

    # In-process cache-warming scheduler (Phase 6). No workers involved;
    # set SCHEDULER_ENABLED=false to disable.
    SCHEDULER_ENABLED = _as_bool(os.environ.get("SCHEDULER_ENABLED"), True)
