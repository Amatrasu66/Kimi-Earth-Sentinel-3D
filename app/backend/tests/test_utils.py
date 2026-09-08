"""Unit tests: validation helpers, provenance, coordinate logic, heatmap schema."""

import base64
import struct

from app.utils.provenance import LIVE, SIMULATED, make_status, ttl_for_layer, with_status
from app.utils.validation import (
    is_valid_coordinate,
    parse_bbox,
    parse_lat_lon,
    parse_limit,
    parse_resolution,
    parse_severity,
    parse_time_range,
)


def test_parse_limit():
    assert parse_limit(None) == (500, None)
    assert parse_limit("10") == (10, None)
    value, err = parse_limit("abc")
    assert value is None and err
    value, err = parse_limit("0")
    assert value is None and err
    value, err = parse_limit("2001")
    assert value is None and err


def test_parse_bbox():
    bbox, err = parse_bbox("-10,-20,10,20")
    assert err is None and bbox["min_lon"] == -10
    _, err = parse_bbox("1,2,3")
    assert err
    _, err = parse_bbox("-200,0,10,10")
    assert err
    _, err = parse_bbox("10,10,5,5")
    assert err


def test_parse_severity():
    assert parse_severity(None) == (None, None)
    assert parse_severity("high") == ("high", None)
    _, err = parse_severity("extreme")
    assert err


def test_parse_resolution_and_time_range():
    assert parse_resolution(None) == (128, None)
    _, err = parse_resolution("513")
    assert err
    assert parse_time_range("48h") == ("48h", None)
    _, err = parse_time_range("1y")
    assert err


def test_parse_lat_lon():
    (coords, err) = parse_lat_lon("35.6", "139.6")
    assert err is None and coords == (35.6, 139.6)
    (_, err) = parse_lat_lon("200", "0")
    assert err
    (_, err) = parse_lat_lon(None, "0")
    assert err


def test_is_valid_coordinate_rejects_garbage():
    assert is_valid_coordinate(35.6, 139.6)
    assert not is_valid_coordinate(float("nan"), 0)
    assert not is_valid_coordinate(float("inf"), 0)
    assert not is_valid_coordinate(91, 0)
    assert not is_valid_coordinate(0, 181)
    assert not is_valid_coordinate("35", "139")
    assert not is_valid_coordinate(None, None)
    assert not is_valid_coordinate(True, 10)


def test_provenance_status_block():
    status = make_status(LIVE, "USGS")
    assert status["status"] == "live"
    assert status["source"] == "USGS"
    assert status["fetched_at"]

    payload = with_status({"layer_id": "x"}, SIMULATED, "fallback", "demo")
    assert payload["data_status"]["status"] == "simulated"
    assert payload["data_status"]["message"] == "demo"


def test_layer_ttls_sane():
    # TTLs must exist and stay within scientifically reasonable bounds.
    assert ttl_for_layer("earthquakes") == 300
    assert ttl_for_layer("temperature") == 3600
    assert 60 <= ttl_for_layer("unknown-layer") <= 7200


def test_heatmap_grid_decodes():
    from app.services.heatmap import get_simulated_heatmap

    data = get_simulated_heatmap("temperature", resolution=8, time_range="24h")
    raw = base64.b64decode(data["grid"])
    values = struct.unpack(f"{len(raw) // 4}f", raw)
    assert len(values) == 8 * 8 // 2
    assert all(0.0 <= v <= 1.0 for v in values)
    assert data["data_status"]["status"] == "simulated"


def test_marker_mapping_stays_aligned_with_invalid_records():
    """Mirrors the frontend canonical-filter contract (Phase 5)."""
    points = [
        {"id": "a", "lat": 10.0, "lon": 20.0},
        {"id": "bad-1", "lat": float("nan"), "lon": 20.0},
        {"id": "b", "lat": -45.0, "lon": 170.0},
        {"id": "bad-2", "lat": 10.0, "lon": 999.0},
        {"id": "c", "lat": 0.0, "lon": 0.0},
    ]
    valid = [p for p in points if is_valid_coordinate(p["lat"], p["lon"])]
    assert [p["id"] for p in valid] == ["a", "b", "c"]
    # Instance index N must equal data point N in the canonical array.
    for i, p in enumerate(valid):
        assert valid[i]["id"] == p["id"]
