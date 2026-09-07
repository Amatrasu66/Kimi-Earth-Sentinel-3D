from flask import Blueprint, jsonify, request

from ..services.fallback import search_mock_data
from ..utils.provenance import success_response
from ..utils.validation import error_response, parse_limit

search_bp = Blueprint("search", __name__)

SEARCH_TYPES = ("all", "location", "event")


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

    if not query or len(query) < 2:
        return jsonify(success_response({"query": query, "results": []}))

    results = search_mock_data(query, search_type, limit)

    return jsonify(success_response({"query": query, "results": results}))
