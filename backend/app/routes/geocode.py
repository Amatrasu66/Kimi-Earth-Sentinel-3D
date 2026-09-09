from flask import Blueprint, jsonify, request

from ..services.fallback import reverse_geocode_mock
from ..services.geocode import get_timezone_info
from ..utils.provenance import SIMULATED, success_response, with_status
from ..utils.validation import error_response, parse_lat_lon

geocode_bp = Blueprint("geocode", __name__)


@geocode_bp.route("/geocode/reverse", methods=["GET"])
def reverse_geocode():
    (coords, err) = parse_lat_lon(request.args.get("lat"), request.args.get("lon"))
    if err:
        return error_response(err)

    lat, lon = coords
    # NOTE: coarse region lookup only — labelled simulated.
    result = with_status(
        reverse_geocode_mock(lat, lon),
        SIMULATED,
        "fallback",
        "Coarse region lookup, not a geocoding provider result.",
    )
    return jsonify(success_response(result))


@geocode_bp.route("/timezones", methods=["GET"])
def get_timezone():
    (coords, err) = parse_lat_lon(request.args.get("lat"), request.args.get("lon"))
    if err:
        return error_response(err)

    lat, lon = coords
    # Coarse longitude-only approximation — labelled simulated, never live.
    result = with_status(
        get_timezone_info(lat, lon),
        SIMULATED,
        "fallback",
        "Approximate timezone from longitude only — not an authoritative lookup.",
    )
    return jsonify(success_response(result))
