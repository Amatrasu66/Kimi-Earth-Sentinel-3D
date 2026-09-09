import re

from flask import Blueprint, jsonify

from ..services.event_detail import EventNotFound, get_event_detail
from ..utils.provenance import success_response
from ..utils.validation import error_response

events_bp = Blueprint("events", __name__)

# Provider ids are alphanumeric (USGS) plus -, _, . (EONET/marker ids).
_EVENT_ID_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


@events_bp.route("/events/<event_id>", methods=["GET"])
def get_event(event_id):
    if not event_id or not event_id.strip():
        return error_response("event_id must not be empty.")
    if len(event_id) > 128:
        return error_response("event_id must be at most 128 characters.")
    if not _EVENT_ID_RE.match(event_id):
        return error_response(
            f"Invalid event_id {event_id!r}: must match [A-Za-z0-9_.-]."
        )
    # Live USGS/EONET lookup with labelled SIMULATED fallback (see
    # services/event_detail.py). A provider-confirmed absence is a 404 —
    # never disguised as fallback data. Unexpected exceptions propagate
    # to the JSON 500 handler (programming bugs stay visible).
    try:
        data, cache_hit, stale = get_event_detail(event_id)
    except EventNotFound as e:
        return error_response(str(e), code="NOT_FOUND", status=404)
    return jsonify(success_response(data, cache_hit=cache_hit, stale=stale))
