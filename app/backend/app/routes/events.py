from flask import Blueprint, jsonify

from ..services.fallback import get_mock_event_detail
from ..utils.provenance import SIMULATED, success_response, with_status
from ..utils.validation import error_response

events_bp = Blueprint("events", __name__)


@events_bp.route("/events/<event_id>", methods=["GET"])
def get_event(event_id):
    if not event_id or not event_id.strip():
        return error_response("event_id must not be empty.")
    # NOTE: event detail is currently served from the local fallback
    # generator (no upstream single-event endpoint is wired up). It is
    # always labelled SIMULATED so it is never mistaken for live data.
    # Extension point: resolve live USGS/EONET events by id here first.
    event = get_mock_event_detail(event_id)
    data = with_status(
        event,
        SIMULATED,
        (event.get("source") or {}).get("name", "fallback"),
        "Event detail is simulated in this build — not a live provider record.",
    )
    return jsonify(success_response(data))
