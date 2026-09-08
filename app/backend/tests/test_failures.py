"""Failure-semantics tests: provider vs normalization vs programming bugs,
cache hits, stale fallback, and scheduler warming.

Contract under test (Phase 3/4):

* provider unreachable  → 200 + SIMULATED (explicit, labelled)
* provider malformed    → 200 + SIMULATED (explicit, labelled)
* programming bug       → 500 JSON (visible, never fake data)
"""

import requests

import app.services.layer_service as layer_service
from app.cache_service import get_cache_service
from app.services.layer_service import layer_cache_key
from app.utils.provenance import LIVE, with_status


def _live_payload():
    return with_status(
        {"layer_id": "earthquakes", "count": 1, "points": []},
        LIVE,
        "USGS",
        fetched_at="2026-01-01T00:00:00Z",
    )


def test_provider_failure_returns_labelled_simulated(client, monkeypatch):
    def boom(*args, **kwargs):
        raise requests.ConnectionError("network down")

    monkeypatch.setattr("app.services.usgs.requests.get", boom)
    r = client.get("/api/v1/layers/earthquakes/data?limit=5")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["data_status"]["status"] == "simulated"
    assert "unavailable" in (data["data_status"]["message"] or "").lower()


def test_normalization_failure_returns_labelled_simulated(client, monkeypatch):
    # Provider responds, but with a shape the normalizer cannot use.
    monkeypatch.setattr(
        "app.services.usgs._fetch_from_provider",
        lambda *a, **k: {"features": [{"properties": None, "geometry": None}]},
    )
    r = client.get("/api/v1/layers/earthquakes/data?limit=5")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["data_status"]["status"] == "simulated"
    assert "malformed" in (data["data_status"]["message"] or "").lower()


def test_programming_bug_is_visible_500_not_fake_data(live_client, monkeypatch):
    def broken(**kwargs):
        raise RuntimeError("simulated programming bug")

    monkeypatch.setitem(layer_service.SERVICE_MAP, "earthquakes", broken)
    r = live_client.get("/api/v1/layers/earthquakes/data?limit=5")
    assert r.status_code == 500
    body = r.get_json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert "data_status" not in body


def test_repeated_request_is_cache_hit(client):
    first = client.get("/api/v1/layers/air_quality/data?limit=3")
    assert first.status_code == 200
    assert first.get_json()["meta"]["cache_hit"] is False

    second = client.get("/api/v1/layers/air_quality/data?limit=3")
    assert second.status_code == 200
    meta = second.get_json()["meta"]
    assert meta["cache_hit"] is True
    assert meta["cached_at"]
    assert second.get_json()["data"] == first.get_json()["data"]


def test_expired_live_cache_served_as_stale_on_provider_failure(app, monkeypatch):
    with app.test_client() as client:
        with app.app_context():
            cache = get_cache_service()
            key = layer_cache_key("earthquakes", None, 500, None)
            cache.set(key, (_live_payload(), "2026-01-01T00:00:00Z"), timeout=0)

        def failing_fetch(*args, **kwargs):
            raise requests.ConnectionError("network down")

        monkeypatch.setattr("app.services.usgs.requests.get", failing_fetch)
        r = client.get("/api/v1/layers/earthquakes/data?limit=500")
        assert r.status_code == 200
        body = r.get_json()
        assert body["data"]["data_status"]["status"] == "stale"
        assert body["data"]["data_status"]["fetched_at"] == "2026-01-01T00:00:00Z"
        assert body["meta"]["cache_hit"] is True
        assert body["meta"]["stale"] is True


def test_simulated_result_cached_briefly_not_full_ttl(app, monkeypatch):
    import time as _time

    with app.test_client() as client:
        def boom(*args, **kwargs):
            raise requests.ConnectionError("network down")

        monkeypatch.setattr("app.services.usgs.requests.get", boom)
        r = client.get("/api/v1/layers/earthquakes/data?limit=5")
        assert r.get_json()["data"]["data_status"]["status"] == "simulated"

        with app.app_context():
            cache = get_cache_service()
            key = layer_cache_key("earthquakes", None, 5, None)
            assert cache.get(key) is not None  # present, but only briefly ...
            _, expires_at = cache._store[key]
            assert expires_at <= _time.monotonic() + 60


def test_scheduler_warming_populates_live_cache(app, monkeypatch):
    from app.scheduler.jobs import warm_layer

    monkeypatch.setitem(
        layer_service.SERVICE_MAP, "air_quality", lambda **k: _live_payload()
    )
    warm_layer(app, "air_quality")
    with app.app_context():
        cache = get_cache_service()
        key = layer_cache_key("air_quality", None, 500, None)
        assert cache.get(key) is not None


def test_scheduler_warming_never_raises(app, monkeypatch):
    from app.scheduler.jobs import warm_layer

    def broken(**kwargs):
        raise RuntimeError("boom")

    monkeypatch.setitem(layer_service.SERVICE_MAP, "air_quality", broken)
    warm_layer(app, "air_quality")  # must not raise
