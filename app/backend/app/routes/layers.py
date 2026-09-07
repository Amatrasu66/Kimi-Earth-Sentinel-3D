import time

from flask import Blueprint, jsonify, request

from ..cache import cache
from ..models.layer import get_all_layers, get_layer
from ..services.airnow import get_air_quality_data
from ..services.fallback import generate_mock_layer_data
from ..services.heatmap import get_heatmap
from ..services.nasa_eonet import get_eonet_events
from ..services.nasa_firms import get_fire_data
from ..services.open_meteo import get_weather_data
from ..services.usgs import get_earthquake_data
from ..utils.provenance import SIMULATED, success_response, ttl_for_layer, with_status
from ..utils.validation import (
    error_response,
    parse_bbox,
    parse_limit,
    parse_resolution,
    parse_severity,
    parse_time_range,
)

layers_bp = Blueprint("layers", __name__)

SERVICE_MAP = {
    "earthquakes": get_earthquake_data,
    "disasters": get_eonet_events,
    "temperature": lambda **kw: get_weather_data(metric="temperature", layer_id="temperature", **kw),
    "precipitation": lambda **kw: get_weather_data(
        metric="precipitation", layer_id="precipitation", **kw
    ),
    "clouds": lambda **kw: get_weather_data(metric="cloudcover", layer_id="clouds", **kw),
    "wind": lambda **kw: get_weather_data(metric="wind", layer_id="wind", **kw),
    "air_quality": get_air_quality_data,
    "wildfires": get_fire_data,
}


@layers_bp.route("/layers", methods=["GET"])
def list_layers():
    layers = [layer.to_dict() for layer in get_all_layers()]
    return jsonify(
        {
            "success": True,
            "data": {"layers": layers},
            "meta": {"timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
        }
    )


def _cache_key(layer_id, bbox, limit, min_severity):
    return f"layer:{layer_id}:bbox={bbox or '-'}:limit={limit}:sev={min_severity or '-'}"


@layers_bp.route("/layers/<layer_id>/data", methods=["GET"])
def get_layer_data(layer_id):
    layer = get_layer(layer_id)
    if not layer:
        return error_response(f"Layer {layer_id!r} not found.", code="NOT_FOUND", status=404)

    bbox_raw = request.args.get("bbox")
    bbox, bbox_err = parse_bbox(bbox_raw)
    if bbox_err:
        return error_response(bbox_err)
    limit, limit_err = parse_limit(request.args.get("limit"))
    if limit_err:
        return error_response(limit_err)
    min_severity, sev_err = parse_severity(request.args.get("min_severity"))
    if sev_err:
        return error_response(sev_err)

    # Manual cache so we can report provenance honestly (Phase 16).
    key = _cache_key(layer_id, bbox_raw, limit, min_severity)
    cached = cache.get(key)
    if cached is not None:
        data, cached_at = cached
        return jsonify(success_response(data, cache_hit=True, cached_at=cached_at))

    service_fn = SERVICE_MAP.get(layer_id)
    try:
        if service_fn:
            data = service_fn(bbox=bbox_raw, limit=limit, min_severity=min_severity)
        else:  # pragma: no cover — every known layer has a service
            data = with_status(
                generate_mock_layer_data(layer_id, bbox=bbox_raw, limit=limit),
                SIMULATED,
                layer.source,
                "No live provider for this layer — showing simulated fallback data.",
            )
    except Exception as e:  # noqa: BLE001 — last-resort guard, still labelled
        from flask import current_app

        current_app.logger.exception(f"Layer pipeline failed for {layer_id}: {e}")
        data = with_status(
            generate_mock_layer_data(layer_id, bbox=bbox_raw, limit=limit),
            SIMULATED,
            layer.source,
            "Layer pipeline failed — showing simulated fallback data.",
        )

    fetched_at = (data.get("data_status") or {}).get("fetched_at")
    cache.set(key, (data, fetched_at), timeout=ttl_for_layer(layer_id))
    return jsonify(success_response(data, cache_hit=False))


@layers_bp.route("/layers/<layer_id>/heatmap", methods=["GET"])
def get_layer_heatmap(layer_id):
    layer = get_layer(layer_id)
    if not layer:
        return error_response(f"Layer {layer_id!r} not found.", code="NOT_FOUND", status=404)

    resolution, res_err = parse_resolution(request.args.get("resolution"))
    if res_err:
        return error_response(res_err)
    time_range, range_err = parse_time_range(request.args.get("time_range"))
    if range_err:
        return error_response(range_err)

    key = f"heatmap:{layer_id}:res={resolution}:range={time_range}"
    cached = cache.get(key)
    if cached is not None:
        data, cached_at = cached
        return jsonify(success_response(data, cache_hit=True, cached_at=cached_at))

    data = get_heatmap(layer_id, resolution=resolution, time_range=time_range)
    fetched_at = (data.get("data_status") or {}).get("fetched_at")
    cache.set(key, (data, fetched_at), timeout=3600)
    return jsonify(success_response(data, cache_hit=False))
