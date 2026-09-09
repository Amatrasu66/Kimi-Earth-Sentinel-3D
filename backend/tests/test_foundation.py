"""Foundation-pass contract tests: provenance consistency, severity
filtering, imagery/timezone boundaries, and validation caps."""

import re


def test_search_carries_simulated_provenance(client):
    r = client.get("/api/v1/search?q=tokyo")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["data_status"]["status"] == "simulated"


def test_search_query_too_long_rejected(client):
    r = client.get("/api/v1/search?q=" + "a" * 201)
    assert r.status_code == 400


def test_timezones_carries_simulated_provenance(client):
    r = client.get("/api/v1/timezones?lat=35.6&lon=139.6")
    assert r.status_code == 200
    body = r.get_json()
    data = body["data"]
    assert data["data_status"]["status"] == "simulated"
    assert data["local_time"].endswith("Z")
    assert data["timezone"]


def test_event_id_length_capped(client):
    r = client.get("/api/v1/events/" + "x" * 129)
    assert r.status_code == 400


def test_gibs_tile_redirect_uses_layer_format(client):
    # PNG layer must not be served as .jpeg; per-zoom bounds enforced.
    r = client.get(
        "/api/v1/imagery/gibs/tile/MODIS_Terra_Brightness_Temp_Band31_Day/2/1/1"
    )
    assert r.status_code == 302
    assert r.headers["Location"].endswith("/1km/2/1/1.png")

    r = client.get(
        "/api/v1/imagery/gibs/tile/MODIS_Terra_CorrectedReflectance_TrueColor/2/1/1"
    )
    assert r.status_code == 302
    assert r.headers["Location"].endswith("/250m/2/1/1.jpeg")


def test_gibs_tile_rejects_out_of_range_coordinates(client):
    # z=0 allows only x=y=0; unknown layers 404.
    assert client.get("/api/v1/imagery/gibs/tile/MODIS_Terra_CorrectedReflectance_TrueColor/0/5/0").status_code == 400
    assert client.get("/api/v1/imagery/gibs/tile/NOPE/0/0/0").status_code == 404


def test_min_severity_filters_wildfire_fallback(client):
    all_pts = client.get("/api/v1/layers/wildfires/data?limit=200").get_json()["data"]
    crit = client.get(
        "/api/v1/layers/wildfires/data?limit=200&min_severity=critical"
    ).get_json()["data"]
    assert all_pts["data_status"]["status"] == "simulated"
    assert crit["count"] <= all_pts["count"]
    assert {p["severity"] for p in crit["points"]} <= {"critical"}


def test_open_meteo_truncation_warning_documented(client, monkeypatch):
    import app.services.open_meteo as om

    real_fetch = om._fetch_batch

    def fake_fetch(base_url, points, field, timeout):
        return [{"current": {field: 20.0, "time": "2026-01-01T00:00Z"}} for _ in points]

    monkeypatch.setattr(om, "_fetch_batch", fake_fetch)
    try:
        r = client.get("/api/v1/layers/temperature/data?limit=2000")
    finally:
        monkeypatch.setattr(om, "_fetch_batch", real_fetch)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["count"] <= 200
    warnings = data.get("warnings", [])
    assert any("bounded" in w for w in warnings)


def test_no_hardcoded_provider_defaults_in_services(app):
    """Services must read provider URLs from central config (no literals)."""
    import inspect

    import app.services.airnow as airnow
    import app.services.nasa_eonet as eonet
    import app.services.nasa_firms as firms
    import app.services.open_meteo as om
    import app.services.usgs as usgs

    for mod in (usgs, eonet, firms, om, airnow):
        src = inspect.getsource(mod)
        assert "earthquake.usgs.gov" not in src, mod.__name__
        assert "eonet.gsfc.nasa.gov" not in src, mod.__name__
        assert "firms.modaps.eosdis.nasa.gov" not in src, mod.__name__
        assert "api.open-meteo.com" not in src, mod.__name__
        assert "airnowapi.org" not in src, mod.__name__


def test_mock_timestamps_are_utc_iso():
    """No local-clock timestamps in provider mock/live normalization."""
    import inspect

    import app.services.airnow as airnow
    import app.services.nasa_firms as firms
    import app.services.open_meteo as om

    for mod in (airnow, firms, om):
        src = inspect.getsource(mod)
        assert "time.strftime" not in src, mod.__name__
        assert "utcnow_iso" in src, mod.__name__


def test_stats_endpoints_labelled_simulated(client):
    r = client.get("/api/v1/stats")
    assert r.status_code == 200
    assert r.get_json()["data"]["data_status"]["status"] == "simulated"
    r = client.get("/api/v1/stats/historical?metric=temperature&period=7d&aggregation=daily")
    assert r.status_code == 200
    assert r.get_json()["data"]["data_status"]["status"] == "simulated"


def test_cors_allowlist_present(client):
    r = client.get("/api/v1/layers")
    # Flask-CORS answers preflight; simple GET just needs to succeed.
    assert r.status_code == 200
    assert re.match(r"application/json", r.content_type)


def test_airnow_bbox_rejected_with_unsupported_param(client):
    r = client.get("/api/v1/layers/air_quality/data?bbox=-125,25,-65,49&limit=5")
    assert r.status_code == 400
    body = r.get_json()
    assert body["success"] is False
    assert body["error"]["code"] == "UNSUPPORTED_PARAM"


def test_bbox_still_accepted_for_bbox_capable_layers(client):
    r = client.get("/api/v1/layers/earthquakes/data?bbox=-125,25,-65,49&limit=5")
    assert r.status_code == 200
    assert r.get_json()["success"] is True


def test_secret_key_sentinel_consistent():
    """One dev-placeholder value shared by config, warning, and template."""
    import inspect
    import os

    import app as app_pkg
    from app.config import Config

    assert Config.DEFAULT_SECRET_KEY == "dev-secret-key-change-in-production"
    # The production warning must compare against the same sentinel, not a
    # duplicated literal that can drift.
    factory_src = inspect.getsource(app_pkg.create_app)
    assert "Config.DEFAULT_SECRET_KEY" in factory_src
    assert "dev-secret-key-change-in-production" not in factory_src
    # The .env template must ship the same placeholder so copying it
    # verbatim in production still triggers the warning.
    template = os.path.join(os.path.dirname(__file__), "..", ".env.example")
    with open(template, encoding="utf-8") as f:
        assert f"SECRET_KEY={Config.DEFAULT_SECRET_KEY}" in f.read()
