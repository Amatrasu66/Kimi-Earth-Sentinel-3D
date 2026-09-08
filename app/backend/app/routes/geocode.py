import time

from flask import Blueprint, jsonify, request

from ..services.fallback import reverse_geocode_mock
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

    _, lon = coords

    # Simple timezone lookup based on longitude
    offset_hours = int(lon / 15)
    offset_str = f"{offset_hours:+03d}:00"

    tz_names = {
        -12: "Pacific/Auckland",
        -11: "Pacific/Pago_Pago",
        -10: "Pacific/Honolulu",
        -9: "America/Anchorage",
        -8: "America/Los_Angeles",
        -7: "America/Denver",
        -6: "America/Chicago",
        -5: "America/New_York",
        -4: "America/Halifax",
        -3: "America/Sao_Paulo",
        -2: "America/Noronha",
        -1: "Atlantic/Azores",
        0: "UTC",
        1: "Europe/London",
        2: "Europe/Paris",
        3: "Europe/Moscow",
        4: "Asia/Dubai",
        5: "Asia/Karachi",
        6: "Asia/Dhaka",
        7: "Asia/Bangkok",
        8: "Asia/Shanghai",
        9: "Asia/Tokyo",
        10: "Australia/Sydney",
        11: "Pacific/Noumea",
        12: "Pacific/Auckland",
    }

    closest_offset = max(-12, min(12, offset_hours))
    tz_name = tz_names.get(closest_offset, "UTC")

    return jsonify(
        success_response(
            {
                "timezone": tz_name,
                "offset": offset_str,
                "local_time": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
        )
    )
