"""Live event-detail tests: USGS + EONET normalization, resolver,
fallback honesty, error visibility, and event-detail caching.

Upstream providers are mocked — the suite never touches live APIs.
"""

import requests

import app.services.event_detail as event_detail
from app.services.event_detail import (
    EventNotFound,
    event_cache_key,
    resolve_provider,
)
from app.cache_service import get_cache_service


class FakeResp:
    def __init__(self, payload=None, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


USGS_FEATURE = {
    "id": "us7000abcd",
    "type": "Feature",
    "properties": {
        "mag": 6.2,
        "place": "120 km SSE of Testville",
        "time": 1700000000000,
        "updated": 1700000600000,
        "tz": None,
        "url": "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
        "detail": "https://example.invalid/detail",
        "felt": 42,
        "cdi": 5.1,
        "mmi": 6.0,
        "alert": "yellow",
        "status": "reviewed",
        "tsunami": 1,
        "sig": 590,
        "net": "us",
        "code": "7000abcd",
        "magType": "mww",
        "type": "earthquake",
        "title": "M 6.2 - 120 km SSE of Testville",
    },
    "geometry": {"type": "Point", "coordinates": [140.5, 35.6, 42.0]},
    "bbox": [],
}

EONET_EVENT = {
    "id": "EONET_1234",
    "title": "Wildfire - Test Region",
    "description": "A real provider description.",
    "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1234",
    "closed": None,
    "categories": [{"id": "wildfires", "title": "Wildfires"}],
    "sources": [{"id": "FIRMS", "url": "https://firms.modaps.eosdis.nasa.gov/"}],
    "geometries": [
        {
            "date": "2026-01-01T00:00:00Z",
            "type": "Point",
            "coordinates": [10.0, 20.0],
        },
        {
            "date": "2026-01-03T00:00:00Z",
            "type": "Point",
            "coordinates": [11.0, 21.0],
            "magnitudeValue": 340.5,
            "magnitudeUnit": "brightness",
        },
    ],
}


def _usgs_ok(*args, **kwargs):
    return FakeResp(dict(USGS_FEATURE))


def _eonet_ok(*args, **kwargs):
    import copy

    return FakeResp(copy.deepcopy(EONET_EVENT))


# ---------------------------------------------------------------------------
# Resolver
# ---------------------------------------------------------------------------


def test_resolver_routes_ids_to_providers():
    assert resolve_provider("eonet-EONET_1234") == "eonet"
    assert resolve_provider("us7000abcd") == "usgs"
    assert resolve_provider("ak025abc1234") == "usgs"


def test_resolver_marks_simulated_only_ids():
    assert resolve_provider("fire-37.77--122.41") is None
    assert resolve_provider("usgs-a1b2c3d4") is None
    assert resolve_provider("wx-35.00-139.00") is None
    assert resolve_provider("aqi-39.0--98.5") is None


# ---------------------------------------------------------------------------
# USGS details
# ---------------------------------------------------------------------------


def test_usgs_detail_success_is_live(client, monkeypatch):
    monkeypatch.setattr("app.services.event_detail.requests.get", _usgs_ok)
    r = client.get("/api/v1/events/us7000abcd")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["data_status"]["status"] == "live"
    assert data["data_status"]["source"] == "USGS"
    assert data["magnitude"] == 6.2
    assert data["magnitude_unit"] == "mww"
    assert data["depth"] == 42.0
    assert data["lat"] == 35.6
    assert data["lon"] == 140.5
    assert data["felt"] == 42
    assert data["alert"] == "yellow"
    assert data["tsunami"] is True
    assert data["significance"] == 590
    assert data["status"] == "reviewed"
    assert data["source"]["url"].endswith("us7000abcd")
    # Epoch-ms normalized to UTC ISO, not echoed raw.
    assert data["timestamp"] == "2023-11-14T22:13:20Z"
    assert data["updated_at"] == "2023-11-14T22:23:20Z"


def test_usgs_detail_not_found_is_404(client, monkeypatch):
    def gone(*args, **kwargs):
        return FakeResp(None, status=404)

    monkeypatch.setattr("app.services.event_detail.requests.get", gone)
    r = client.get("/api/v1/events/us00000000")
    assert r.status_code == 404
    body = r.get_json()
    assert body["success"] is False
    assert body["error"]["code"] == "NOT_FOUND"
    assert "data_status" not in body


def test_usgs_detail_provider_failure_stays_simulated(client, monkeypatch):
    def down(*args, **kwargs):
        raise requests.ConnectionError("network down")

    monkeypatch.setattr("app.services.event_detail.requests.get", down)
    r = client.get("/api/v1/events/us7000abcd")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["data_status"]["status"] == "simulated"
    assert "unavailable" in (data["data_status"]["message"] or "").lower()


def test_usgs_detail_malformed_response_stays_simulated(client, monkeypatch):
    def weird(*args, **kwargs):
        return FakeResp({"unexpected": "shape"})

    monkeypatch.setattr("app.services.event_detail.requests.get", weird)
    r = client.get("/api/v1/events/us7000abcd")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["data_status"]["status"] == "simulated"
    assert "malformed" in (data["data_status"]["message"] or "").lower()


def test_usgs_detail_programming_bug_is_visible_500(live_client, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("simulated programming bug")

    monkeypatch.setattr(event_detail, "_normalize_usgs_event", broken)
    monkeypatch.setattr("app.services.event_detail.requests.get", _usgs_ok)
    r = live_client.get("/api/v1/events/us7000abcd")
    assert r.status_code == 500
    body = r.get_json()
    assert body["success"] is False
    assert "data_status" not in body


# ---------------------------------------------------------------------------
# EONET details
# ---------------------------------------------------------------------------


def test_eonet_detail_success_picks_latest_geometry(client, monkeypatch):
    monkeypatch.setattr("app.services.event_detail.requests.get", _eonet_ok)
    r = client.get("/api/v1/events/eonet-EONET_1234")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["data_status"]["status"] == "live"
    assert data["data_status"]["source"] == "NASA EONET"
    assert data["id"] == "eonet-EONET_1234"
    assert data["title"] == "Wildfire - Test Region"
    assert data["description"] == "A real provider description."
    # Latest of the two geometry records wins.
    assert (data["lat"], data["lon"]) == (21.0, 11.0)
    assert data["timestamp"] == "2026-01-03T00:00:00Z"
    assert data["magnitude"] == 340.5
    assert data["magnitude_unit"] == "brightness"
    assert data["status"] == "open"
    assert data["closed_at"] is None
    assert data["categories"] == ["Wildfires"]
    assert data["sources"] == [
        {"id": "FIRMS", "url": "https://firms.modaps.eosdis.nasa.gov/"}
    ]


def test_eonet_detail_non_point_geometry_has_no_coords(client, monkeypatch):
    import copy

    poly = copy.deepcopy(EONET_EVENT)
    poly["geometries"] = [
        {
            "date": "2026-01-02T00:00:00Z",
            "type": "Polygon",
            "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 0.0]]],
        }
    ]

    monkeypatch.setattr(
        "app.services.event_detail.requests.get", lambda *a, **k: FakeResp(poly)
    )
    r = client.get("/api/v1/events/eonet-EONET_1234")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["data_status"]["status"] == "live"
    assert data["lat"] is None
    assert data["lon"] is None
    assert data["geometry_type"] == "Polygon"


def test_eonet_detail_closed_event(client, monkeypatch):
    import copy

    closed = copy.deepcopy(EONET_EVENT)
    closed["closed"] = "2026-02-01T00:00:00Z"

    monkeypatch.setattr(
        "app.services.event_detail.requests.get", lambda *a, **k: FakeResp(closed)
    )
    r = client.get("/api/v1/events/eonet-EONET_1234")
    data = r.get_json()["data"]
    assert data["status"] == "closed"
    assert data["closed_at"] == "2026-02-01T00:00:00Z"


def test_eonet_detail_missing_optionals(client, monkeypatch):
    bare = {"id": "EONET_9", "title": "Bare Event"}

    monkeypatch.setattr(
        "app.services.event_detail.requests.get", lambda *a, **k: FakeResp(bare)
    )
    r = client.get("/api/v1/events/eonet-EONET_9")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["data_status"]["status"] == "live"
    assert data["lat"] is None
    assert data["description"] is None
    assert data["categories"] is None
    assert data["magnitude"] is None


def test_eonet_detail_failure_stays_simulated(client, monkeypatch):
    def down(*args, **kwargs):
        raise requests.Timeout("timed out")

    monkeypatch.setattr("app.services.event_detail.requests.get", down)
    r = client.get("/api/v1/events/eonet-EONET_1234")
    assert r.status_code == 200
    assert r.get_json()["data"]["data_status"]["status"] == "simulated"


# ---------------------------------------------------------------------------
# Simulated-only ids + validation
# ---------------------------------------------------------------------------


def test_wildfire_marker_stays_simulated_with_explicit_message(client, monkeypatch):
    def must_not_call(*args, **kwargs):
        raise AssertionError("no upstream lookup for FIRMS observations")

    monkeypatch.setattr("app.services.event_detail.requests.get", must_not_call)
    r = client.get("/api/v1/events/fire-37.7749--122.4194")
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["data_status"]["status"] == "simulated"
    assert data["data_status"]["source"] == "NASA FIRMS"
    assert "no live individual-event lookup" in (data["data_status"]["message"] or "").lower()


def test_mock_marker_id_short_circuits_without_http(client, monkeypatch):
    def must_not_call(*args, **kwargs):
        raise AssertionError("mock ids must not trigger provider calls")

    monkeypatch.setattr("app.services.event_detail.requests.get", must_not_call)
    r = client.get("/api/v1/events/usgs-a1b2c3d4")
    assert r.status_code == 200
    assert r.get_json()["data"]["data_status"]["status"] == "simulated"


def test_invalid_event_id_rejected(client):
    r = client.get("/api/v1/events/bad%20id!")
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Event-detail cache
# ---------------------------------------------------------------------------


def test_live_event_detail_cached_with_fetched_at(client, monkeypatch):
    calls = []

    def counting(*args, **kwargs):
        calls.append(1)
        return FakeResp(dict(USGS_FEATURE))

    monkeypatch.setattr("app.services.event_detail.requests.get", counting)
    first = client.get("/api/v1/events/us7000abcd")
    assert first.status_code == 200
    assert first.get_json()["meta"]["cache_hit"] is False

    second = client.get("/api/v1/events/us7000abcd")
    assert second.status_code == 200
    assert second.get_json()["meta"]["cache_hit"] is True
    assert len(calls) == 1
    assert (
        second.get_json()["data"]["data_status"]["fetched_at"]
        == first.get_json()["data"]["data_status"]["fetched_at"]
    )


def test_expired_live_event_served_as_stale(app, monkeypatch):
    from app.utils.provenance import LIVE, with_status

    with app.test_client() as client:
        with app.app_context():
            cache = get_cache_service()
            key = event_cache_key("usgs", "us7000abcd")
            cached = with_status(
                {"id": "us7000abcd", "layer_id": "earthquakes"},
                LIVE,
                "USGS",
                fetched_at="2026-01-01T00:00:00Z",
            )
            cache.set(key, (cached, "2026-01-01T00:00:00Z"), timeout=0)

        def down(*args, **kwargs):
            raise requests.ConnectionError("network down")

        monkeypatch.setattr("app.services.event_detail.requests.get", down)
        r = client.get("/api/v1/events/us7000abcd")
        assert r.status_code == 200
        body = r.get_json()
        assert body["data"]["data_status"]["status"] == "stale"
        assert body["data"]["data_status"]["fetched_at"] == "2026-01-01T00:00:00Z"
        assert body["meta"]["stale"] is True


def test_event_not_found_exception_type():
    assert issubclass(EventNotFound, Exception)
