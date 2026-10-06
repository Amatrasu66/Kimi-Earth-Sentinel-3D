import os
from dotenv import load_dotenv

load_dotenv()


def _csv(name, default):
    raw = os.environ.get(name, default)
    origins: list[str] = []
    for item in raw.split(","):
        # Browsers send `Origin` without a trailing slash or whitespace
        # (e.g. `https://app.vercel.app`), so normalize each entry the
        # same way — otherwise `https://app.vercel.app/` in the env var
        # silently never matches and the browser blocks every request.
        normalized = item.strip().rstrip("/")
        if normalized and normalized not in origins:
            origins.append(normalized)
    return origins


# Default CORS allow-list: production Vercel frontend + local Vite dev
# servers. render.yaml pins the production origin explicitly; this is the
# safety net underneath it so a deploy without the env var still serves
# production. Never use "*".
DEFAULT_CORS_ORIGINS = (
    "https://kimi-earth-sentinel-3d.vercel.app,"
    "http://localhost:3000,http://localhost:5173"
)


def resolve_cors_origins() -> list[str]:
    """Read the CORS allow-list from the *live* environment.

    Config class attributes freeze at import time, so the app factory calls
    this at creation time instead — otherwise an env var injected after
    import (tests, containers) would silently have no effect.
    """
    return _csv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)


def _as_bool(raw, default=True):
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


class Config:
    FLASK_ENV = os.environ.get("FLASK_ENV", "production")
    # Single sentinel for the dev placeholder: development may run with it,
    # production must override it (create_app warns on this exact value).
    DEFAULT_SECRET_KEY = "dev-secret-key-change-in-production"
    SECRET_KEY = os.environ.get("SECRET_KEY", DEFAULT_SECRET_KEY)

    # CORS — explicit allow-list (Phase 17). Import-time snapshot; the app
    # factory re-resolves from the live environment via
    # resolve_cors_origins() (Session 4: import-frozen config silently
    # ignored runtime env). Default covers production + local Vite.
    # Never use "*".
    CORS_ORIGINS = _csv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)

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
