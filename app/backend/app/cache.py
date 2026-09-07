from flask_caching import Cache
from flask import current_app

cache = Cache()

def get_cache():
    """Get the cache instance from current app context."""
    if hasattr(current_app, 'extensions') and 'cache' in current_app.extensions:
        return current_app.extensions['cache'][cache]
    return cache
