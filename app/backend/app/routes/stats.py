from flask import Blueprint, jsonify, request

from ..services.fallback import get_mock_historical_data, get_mock_stats
from ..utils.provenance import SIMULATED, success_response, with_status
from ..utils.validation import error_response

stats_bp = Blueprint("stats", __name__)

METRICS = ("earthquakes", "temperature", "disasters", "wildfires", "air_quality")
PERIODS = ("7d", "30d", "1y")
AGGREGATIONS = ("daily", "weekly", "monthly")


@stats_bp.route("/stats", methods=["GET"])
def get_stats():
    # NOTE: global stats are currently aggregated from simulated data.
    data = with_status(
        get_mock_stats(),
        SIMULATED,
        "fallback",
        "Global stats are simulated in this build.",
    )
    return jsonify(success_response(data, cache_hit=False))


@stats_bp.route("/stats/historical", methods=["GET"])
def get_historical():
    metric = request.args.get("metric", "earthquakes")
    period = request.args.get("period", "30d")
    aggregation = request.args.get("aggregation", "daily")

    if metric not in METRICS:
        return error_response(f"Invalid metric {metric!r}: must be one of {', '.join(METRICS)}.")
    if period not in PERIODS:
        return error_response(f"Invalid period {period!r}: must be one of {', '.join(PERIODS)}.")
    if aggregation not in AGGREGATIONS:
        return error_response(
            f"Invalid aggregation {aggregation!r}: must be one of {', '.join(AGGREGATIONS)}."
        )

    # NOTE: historical series are simulated placeholders (no fake history
    # is presented as measured). Extension point for real archives.
    data = with_status(
        get_mock_historical_data(metric, period, aggregation),
        SIMULATED,
        "fallback",
        "Historical series are simulated placeholders, not measured history.",
    )
    return jsonify(success_response(data))
