import os
import structlog
from flask import Flask
from flask_cors import CORS
from flask_caching import Cache
from .config import Config

logger = structlog.get_logger()

cache = Cache()

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # Enable CORS for all origins in development
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })
    
    # Initialize cache
    cache.init_app(app, config={
        'CACHE_TYPE': app.config.get('CACHE_TYPE', 'simple'),
        'CACHE_DEFAULT_TIMEOUT': app.config.get('CACHE_DEFAULT_TIMEOUT', 300),
        'CACHE_REDIS_URL': app.config.get('REDIS_URL', None)
    })
    
    # Register blueprints
    from .routes.layers import layers_bp
    from .routes.events import events_bp
    from .routes.search import search_bp
    from .routes.stats import stats_bp
    from .routes.imagery import imagery_bp
    from .routes.geocode import geocode_bp
    from .routes.health import health_bp
    
    app.register_blueprint(layers_bp, url_prefix='/api/v1')
    app.register_blueprint(events_bp, url_prefix='/api/v1')
    app.register_blueprint(search_bp, url_prefix='/api/v1')
    app.register_blueprint(stats_bp, url_prefix='/api/v1')
    app.register_blueprint(imagery_bp, url_prefix='/api/v1')
    app.register_blueprint(geocode_bp, url_prefix='/api/v1')
    app.register_blueprint(health_bp, url_prefix='/api/v1')
    
    # Start background scheduler
    if not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        from .scheduler.jobs import start_scheduler
        start_scheduler()
    
    @app.route('/')
    def index():
        return {
            'name': 'Earth Sentinel 3D API',
            'version': '1.0.0',
            'status': 'running',
            'docs': '/api/v1/health'
        }
    
    logger.info('app_started', 
                name='Earth Sentinel 3D API',
                version='1.0.0',
                env=app.config.get('FLASK_ENV', 'production'))
    
    return app
