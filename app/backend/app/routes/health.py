import time

from flask import Blueprint, jsonify

health_bp = Blueprint("health", __name__)

SERVICE = "kimi-earth-sentinel-api"
VERSION = "1.0.0"
_started_at = time.time()


def health_payload():
    """Honest liveness payload — no fabricated per-provider claims."""
    return {
        "status": "ok",
        "service": SERVICE,
        "version": VERSION,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "uptime_seconds": round(time.time() - _started_at, 1),
    }


@health_bp.route("/health", methods=["GET"])
def health_check():
    return jsonify({"success": True, "data": health_payload()})
