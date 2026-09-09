from flask import Blueprint, jsonify, request

from ..services.fallback import search_mock_data
from ..utils.provenance import SIMULATED, success_response, with_status
from ..utils.validation import error_response, parse_limit

search_bp = Blueprint("search", __name__)

SEARCH_TYPES = ("all", "location", "event")
MAX_QUERY_LENGTH = 200


@search_bp.route("/search", methods=["GET"])
def search():
    query = request.args.get("q", "")
    search_type = request.args.get("type", "all")
    limit, limit_err = parse_limit(request.args.get("limit", "20"), default=20, maximum=100)
    if limit_err:
        return error_response(limit_err)

    if search_type not in SEARCH_TYPES:
        return error_response(
            f"Invalid type {search_type!r}: must be one of {', '.join(SEARCH_TYPES)}."
        )

    if len(query) > MAX_QUERY_LENGTH:
        return error_response(f"Query must be at most {MAX_QUERY_LENGTH} characters.")

    if not query or len(query) < 2:
        return jsonify(success_response({"query": query, "results": []}))

    results = search_mock_data(query, search_type, limit)

    # Bundled gazetteer + event index only — labelled simulated.
    payload = with_status(
        {"query": query, "results": results},
        SIMULATED,
        "fallback",
        "Search over a bundled gazetteer and event index — not a live lookup.",
    )
    return jsonify(success_response(payload))
