"""Deployment contract: health checks, CORS allow-list, and offline-safe routes.

Every test here must pass without live providers: health, capabilities,
and validation-error paths never touch upstream APIs.
"""


def test_health_versioned_and_unversioned_agree(client):
    for path in ("/api/health", "/api/v1/health"):
        r = client.get(path)
        assert r.status_code == 200
        body = r.get_json()
        assert body["success"] is True
        data = body["data"]
        assert data["status"] == "ok"
        assert data["service"] == "kimi-earth-sentinel-api"
        assert data["version"] == "1.0.0"
        assert "timestamp" in data


def test_gibs_capabilities_lists_allowlisted_layers(client):
    r = client.get("/api/v1/imagery/gibs/capabilities")
    assert r.status_code == 200
    layers = r.get_json()["data"]["layers"]
    assert len(layers) > 0
    for layer in layers:
        assert {"id", "name", "projection", "format"} <= set(layer)


def test_historical_rejects_invalid_params_without_providers(client):
    assert client.get("/api/v1/stats/historical?metric=nope").status_code == 400
    assert client.get("/api/v1/stats/historical?period=99y").status_code == 400
    assert (
        client.get("/api/v1/stats/historical?aggregation=hourly").status_code == 400
    )


def test_search_rejects_invalid_type(client):
    r = client.get("/api/v1/search?q=tokyo&type=nope")
    assert r.status_code == 400
    assert r.get_json()["success"] is False


def test_reverse_geocode_rejects_garbage(client):
    assert client.get("/api/v1/geocode/reverse?lat=999&lon=0").status_code == 400
    assert client.get("/api/v1/geocode/reverse").status_code == 400


def test_cors_preflight_allows_configured_origin(client):
    r = client.options(
        "/api/v1/layers",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"


def test_cors_preflight_rejects_unknown_origin(client):
    r = client.options(
        "/api/v1/layers",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "Access-Control-Allow-Origin" not in r.headers


PRODUCTION_ORIGIN = "https://kimi-earth-sentinel-3d.vercel.app"


def test_cors_default_allow_list_includes_production_origin(monkeypatch):
    """Session 4 regression: a deploy with no CORS_ORIGINS env var must
    still serve the production Vercel frontend (the live service ran with
    localhost-only defaults, so every Vercel preflight returned no
    Access-Control-Allow-Origin header)."""
    from app import create_app

    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    app = create_app()
    assert PRODUCTION_ORIGIN in app.config["CORS_ORIGINS"]
    with app.test_client() as test_client:
        r = test_client.options(
            "/api/v1/layers",
            headers={
                "Origin": PRODUCTION_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert r.status_code == 200
        assert r.headers.get("Access-Control-Allow-Origin") == PRODUCTION_ORIGIN


def test_cors_production_get_carries_allow_origin(monkeypatch):
    """GET (not just OPTIONS) from the production origin must succeed
    with the allow-origin header present."""
    from app import create_app

    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    app = create_app()
    with app.test_client() as test_client:
        r = test_client.get("/api/v1/layers", headers={"Origin": PRODUCTION_ORIGIN})
        assert r.status_code == 200
        assert r.headers.get("Access-Control-Allow-Origin") == PRODUCTION_ORIGIN


def test_cors_origin_normalization_strips_slash_and_whitespace(monkeypatch):
    """`https://host/` or ` https://host ` in the env var must still match
    the browser-sent `Origin` (which never has a trailing slash)."""
    from app import create_app

    monkeypatch.setenv(
        "CORS_ORIGINS",
        f"  {PRODUCTION_ORIGIN}/ , http://localhost:5173/ ",
    )
    app = create_app()
    assert PRODUCTION_ORIGIN in app.config["CORS_ORIGINS"]
    assert all(not o.endswith("/") for o in app.config["CORS_ORIGINS"])
    with app.test_client() as test_client:
        r = test_client.options(
            "/api/v1/layers",
            headers={
                "Origin": PRODUCTION_ORIGIN,
                "Access-Control-Request-Method": "GET",
            },
        )
        assert r.headers.get("Access-Control-Allow-Origin") == PRODUCTION_ORIGIN


def test_cors_still_rejects_unapproved_origin_by_default(monkeypatch):
    from app import create_app

    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    app = create_app()
    with app.test_client() as test_client:
        r = test_client.options(
            "/api/v1/layers",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "Access-Control-Allow-Origin" not in r.headers
        assert "*" not in str(r.headers)
