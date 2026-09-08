import os
import structlog
from flask import Flask, jsonify
from flask_cors import CORS
from .cache_service import InMemoryCache
from .config import Config

logger = structlog.get_logger()


def _is_production(app):
    return app.config.get("FLASK_ENV", "production") != "development"


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    if _is_production(app) and app.config.get("SECRET_KEY") == "dev-secret-key-change-in-production":
        logger.warning("secret_key_default", message="Running with the default SECRET_KEY; set SECRET_KEY.")

    # CORS restricted to the configured allow-list (Phase 17).
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": app.config.get("CORS_ORIGINS"),
                "methods": ["GET", "OPTIONS"],
                "allow_headers": ["Content-Type"],
            }
        },
    )

    # Process-local cache (Phase 5). No database is required: the app
    # visualizes provider data instead of owning a persistent dataset.
    app.extensions["cache_service"] = InMemoryCache(
        default_timeout=app.config.get("CACHE_DEFAULT_TIMEOUT", 300)
    )

    # Register blueprints (versioned API)
    from .routes.layers import layers_bp
    from .routes.events import events_bp
    from .routes.search import search_bp
    from .routes.stats import stats_bp
    from .routes.imagery import imagery_bp
    from .routes.geocode import geocode_bp
    from .routes.health import health_bp, health_payload

    app.register_blueprint(layers_bp, url_prefix="/api/v1")
    app.register_blueprint(events_bp, url_prefix="/api/v1")
    app.register_blueprint(search_bp, url_prefix="/api/v1")
    app.register_blueprint(stats_bp, url_prefix="/api/v1")
    app.register_blueprint(imagery_bp, url_prefix="/api/v1")
    app.register_blueprint(geocode_bp, url_prefix="/api/v1")
    app.register_blueprint(health_bp, url_prefix="/api/v1")

    # Unversioned alias required for deployment checks: GET /api/health
    @app.route("/api/health", methods=["GET"])
    def api_health():
        return jsonify({"success": True, "data": health_payload()})

    # Predictable JSON errors — never leak stack traces in production.
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"success": False, "error": {"code": "NOT_FOUND", "message": "Not found."}}), 404

    @app.errorhandler(405)
    def method_not_allowed(_e):
        return (
            jsonify(
                {"success": False, "error": {"code": "METHOD_NOT_ALLOWED", "message": "Method not allowed."}}
            ),
            405,
        )

    @app.errorhandler(500)
    def internal_error(e):
        if not _is_production(app):
            return (
                jsonify(
                    {"success": False, "error": {"code": "INTERNAL_ERROR", "message": str(e)}}
                ),
                500,
            )
        return (
            jsonify(
                {
                    "success": False,
                    "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred."},
                }
            ),
            500,
        )

    # Start background scheduler (skipped under tests via DISABLE_SCHEDULER=1
    # or SCHEDULER_ENABLED=false). In-process cache warming only — no workers.
    scheduler_enabled = os.environ.get("DISABLE_SCHEDULER") != "1" and app.config.get(
        "SCHEDULER_ENABLED", True
    )
    if scheduler_enabled and (not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true"):
        from .scheduler.jobs import start_scheduler

        start_scheduler(app)

    @app.route("/")
    def index():
        return {
            "name": "Earth Sentinel 3D API",
            "version": "1.0.0",
            "status": "running",
            "docs": "/api/v1/health",
        }

    logger.info(
        "app_started",
        name="Earth Sentinel 3D API",
        version="1.0.0",
        env=app.config.get("FLASK_ENV", "production"),
    )

    return app
