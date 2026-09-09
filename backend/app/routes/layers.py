"""Layer routes — thin HTTP controllers (Phase 2 boundary).

Validation of query params lives here; provider dispatch, caching and
stale-fallback live in :mod:`app.services.layer_service`. No
provider-specific logic in this module.
"""

from flask import Blueprint, jsonify, request

from ..models.layer import get_all_layers, get_layer
from ..services.layer_service import get_heatmap_payload, get_layer_payload
from ..utils.provenance import success_response
from ..utils.validation import (
    check_supported_params,
    error_response,
    parse_bbox,
    parse_limit,
    parse_resolution,
    parse_severity,
    parse_time_range,
)

layers_bp = Blueprint("layers", __name__)


@layers_bp.route("/layers", methods=["GET"])
def list_layers():
    layers = [layer.to_dict() for layer in get_all_layers()]
    return jsonify(success_response({"layers": layers}))


@layers_bp.route("/layers/<layer_id>/data", methods=["GET"])
def get_layer_data(layer_id):
    layer = get_layer(layer_id)
    if not layer:
        return error_response(f"Layer {layer_id!r} not found.", code="NOT_FOUND", status=404)

    bbox_raw = request.args.get("bbox")
    _, bbox_err = parse_bbox(bbox_raw)
    if bbox_err:
        return error_response(bbox_err)
    limit, limit_err = parse_limit(request.args.get("limit"))
    if limit_err:
        return error_response(limit_err)
    min_severity, sev_err = parse_severity(request.args.get("min_severity"))
    if sev_err:
        return error_response(sev_err)
    unsupported = check_supported_params(layer_id, bbox_raw)
    if unsupported:
        return error_response(unsupported, code="UNSUPPORTED_PARAM")

    # No broad except here by design: provider failures are already
    # converted to labelled SIMULATED/STALE payloads inside the service
    # layer. An unexpected exception is a programming bug and must reach
    # the JSON 500 handler visibly.
    data, cache_hit, stale = get_layer_payload(
        layer_id, bbox=bbox_raw, limit=limit, min_severity=min_severity
    )
    return jsonify(success_response(data, cache_hit=cache_hit, stale=stale))


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

    data, cache_hit, stale = get_heatmap_payload(
        layer_id, resolution=resolution, time_range=time_range
    )
    return jsonify(success_response(data, cache_hit=cache_hit, stale=stale))
