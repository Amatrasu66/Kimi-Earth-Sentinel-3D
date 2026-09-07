from flask_caching import Cache

# Canonical shared cache instance — import this everywhere.
# It is initialized in app/__init__.py::create_app via init_app().
cache = Cache()
