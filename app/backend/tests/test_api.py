"""API contract tests: health, validation, layer lookup, provenance."""


def test_health_unversioned(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.get_json()
    assert body["success"] is True
    data = body["data"]
    assert data["status"] == "ok"
    assert data["service"] == "kimi-earth-sentinel-api"
    assert "timestamp" in data
    assert "version" in data
    assert "SECRET" not in str(data).upper()


def test_health_versioned(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.get_json()["data"]["status"] == "ok"


def test_layers_list(client):
    r = client.get("/api/v1/layers")
    assert r.status_code == 200
    ids = {layer["id"] for layer in r.get_json()["data"]["layers"]}
    assert {"earthquakes", "disasters", "wildfires", "temperature", "precipitation", "clouds", "wind", "air_quality"} <= ids


def test_unknown_layer_404(client):
    r = client.get("/api/v1/layers/nope/data")
    assert r.status_code == 404
    body = r.get_json()
    assert body["success"] is False
    assert body["error"]["code"] == "NOT_FOUND"


def test_invalid_limit_rejected(client):
    for bad in ["abc", "0", "-5", "5000"]:
        r = client.get(f"/api/v1/layers/earthquakes/data?limit={bad}")
        assert r.status_code == 400, bad
        assert r.get_json()["success"] is False


def test_invalid_bbox_rejected(client):
    for bad in ["1,2,3", "a,b,c,d", "-200,0,0,10", "0,0,0,0", "10,10,5,5"]:
        r = client.get(f"/api/v1/layers/earthquakes/data?bbox={bad}")
        assert r.status_code == 400, bad


def test_invalid_severity_rejected(client):
    r = client.get("/api/v1/layers/earthquakes/data?min_severity=bogus")
    assert r.status_code == 400


def test_layer_data_carries_provenance(client):
    r = client.get("/api/v1/layers/air_quality/data?limit=5")
    assert r.status_code == 200
    data = r.get_json()["data"]
    status = data.get("data_status")
    assert status is not None
    assert status["status"] in ("live", "simulated", "stale", "unavailable")
    assert status["source"]
    assert status["fetched_at"]


def test_heatmap_validation_and_schema(client):
    bad = client.get("/api/v1/layers/temperature/heatmap?resolution=9999")
    assert bad.status_code == 400
    bad_range = client.get("/api/v1/layers/temperature/heatmap?time_range=1y")
    assert bad_range.status_code == 400

    r = client.get("/api/v1/layers/temperature/heatmap?resolution=8&time_range=24h")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["resolution"] == 8
    assert data["grid"]
    assert data["data_status"]["status"] == "simulated"


def test_heatmap_unknown_layer_404(client):
    r = client.get("/api/v1/layers/nope/heatmap")
    assert r.status_code == 404


def test_event_detail_labelled(client):
    r = client.get("/api/v1/events/usgs-test123")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["id"] == "usgs-test123"
    assert data["data_status"]["status"] == "simulated"


def test_search_validation(client):
    r = client.get("/api/v1/search?q=a&type=bogus")
    assert r.status_code == 400
    r = client.get("/api/v1/search?q=a&limit=500")
    assert r.status_code == 400
    r = client.get("/api/v1/search?q=tokyo")
    assert r.status_code == 200
    assert r.get_json()["data"]["query"] == "tokyo"


def test_geocode_validation(client):
    assert client.get("/api/v1/geocode/reverse").status_code == 400
    assert client.get("/api/v1/geocode/reverse?lat=200&lon=0").status_code == 400
    r = client.get("/api/v1/geocode/reverse?lat=35.6&lon=139.6")
    assert r.status_code == 200


def test_json_404_for_unknown_routes(client):
    r = client.get("/api/v1/definitely-not-here")
    assert r.status_code == 404
    assert r.get_json()["success"] is False
