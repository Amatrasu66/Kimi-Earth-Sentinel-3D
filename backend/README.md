# Kimi Earth Sentinel — backend

Flask API that aggregates live environmental data (USGS, NASA EONET/FIRMS/GIBS, Open-Meteo, AirNow) with clearly-labelled simulated fallbacks. See the repository-root `README.md` for the full architecture and `docs/development.md` for the practical dev guide.

## Layout

```
backend/
├── wsgi.py              # Gunicorn entrypoint (`wsgi:app`, honours $PORT)
├── app/
│   ├── __init__.py      # App factory: CORS allow-list, JSON errors, /api/health
│   ├── config.py        # Central config — all URLs/keys/timeouts come from env
│   ├── cache_service.py # CacheService interface + InMemoryCache (process-local)
│   ├── routes/          # Thin HTTP controllers (validate → service → JSON)
│   ├── services/        # Application + provider adapters (no Flask request objects)
│   ├── models/          # Layer metadata
│   ├── utils/           # validation (400s) + provenance (data_status)
│   └── scheduler/       # Opt-in dev cache warming (disabled in production)
└── tests/               # pytest contract + unit tests
```

Boundaries: routes validate input and render JSON; `services/layer_service.py` owns dispatch, caching, and stale-fallback; provider adapters fetch one upstream API and normalize to the canonical payload. Individual event lookup (`services/event_detail.py`) resolves an event id to the USGS detail feed or the EONET event endpoint, caches live details briefly (`event:<provider>:<id>`, 5 min TTL), and falls back to labelled simulated detail when the provider is unreachable or the marker has no event endpoint (FIRMS fire observations). Programming bugs propagate to the JSON 500 handler — they are never converted into simulated data.

## Run

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate | macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env        # or: cp .env.example .env
python wsgi.py                # http://localhost:5001
```

## Test

```bash
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests/ -q
```

## Caching (V1)

Process-local in-memory cache, no database or Redis required (see root README → *Current caching model*). Production runs with `SCHEDULER_ENABLED=false` — request-time cache + stale fallback need no warming.
