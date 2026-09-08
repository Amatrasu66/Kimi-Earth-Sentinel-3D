from flask import Blueprint, current_app, jsonify, redirect

from ..services.imagery import (
    GIBS_LAYERS,
    build_tile_url,
    is_allowed_layer,
    is_valid_tile,
)
from ..utils.provenance import success_response
from ..utils.validation import error_response

imagery_bp = Blueprint("imagery", __name__)


@imagery_bp.route("/imagery/gibs/capabilities", methods=["GET"])
def get_gibs_capabilities():
    return jsonify(success_response({"layers": GIBS_LAYERS}))


@imagery_bp.route("/imagery/gibs/tile/<layer>/<int:z>/<int:x>/<int:y>", methods=["GET"])
def get_gibs_tile(layer, z, x, y):
    # Allow-list prevents open-redirect abuse via the layer segment.
    if not is_allowed_layer(layer):
        return error_response(f"Imagery layer {layer!r} not found.", code="NOT_FOUND", status=404)
    if not is_valid_tile(layer, z, x, y):
        return error_response("Invalid tile coordinates.")
    # Provider URL shape lives in the imagery service (Phase 2 boundary);
    # the base URL comes from central config (no hardcoded endpoint here).
    gibs_url = build_tile_url(current_app.config["NASA_GIBS_URL"], layer, z, x, y)
    return redirect(gibs_url, code=302)
