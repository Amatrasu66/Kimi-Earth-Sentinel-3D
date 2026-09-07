import time
from flask import Blueprint, jsonify, redirect

from ..utils.provenance import success_response
from ..utils.validation import error_response

imagery_bp = Blueprint("imagery", __name__)

GIBS_LAYERS = [
    {
        "id": "MODIS_Terra_CorrectedReflectance_TrueColor",
        "name": "True Color",
        "projection": "geographic",
        "format": "image/jpeg",
        "tilematrixset": "250m",
        "zoom_levels": list(range(9)),
    },
    {
        "id": "VIIRS_SNPP_CorrectedReflectance_TrueColor",
        "name": "VIIRS True Color",
        "projection": "geographic",
        "format": "image/jpeg",
        "tilematrixset": "250m",
        "zoom_levels": list(range(9)),
    },
    {
        "id": "MODIS_Terra_Brightness_Temp_Band31_Day",
        "name": "Temperature",
        "projection": "geographic",
        "format": "image/png",
        "tilematrixset": "1km",
        "zoom_levels": list(range(7)),
    },
]

_ALLOWED_GIBS_IDS = {layer["id"] for layer in GIBS_LAYERS}


@imagery_bp.route("/imagery/gibs/capabilities", methods=["GET"])
def get_gibs_capabilities():
    return jsonify(success_response({"layers": GIBS_LAYERS}))


@imagery_bp.route("/imagery/gibs/tile/<layer>/<int:z>/<int:x>/<int:y>", methods=["GET"])
def get_gibs_tile(layer, z, x, y):
    # Allow-list prevents open-redirect abuse via the layer segment.
    if layer not in _ALLOWED_GIBS_IDS:
        return error_response(f"Imagery layer {layer!r} not found.", code="NOT_FOUND", status=404)
    if not (0 <= z <= 8 and x >= 0 and y >= 0):
        return error_response("Invalid tile coordinates.")
    # Proxy to NASA GIBS with redirect
    gibs_url = (
        "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/"
        f"{layer}/default/{time.strftime('%Y-%m-%d')}/250m/{z}/{y}/{x}.jpeg"
    )
    return redirect(gibs_url, code=302)
