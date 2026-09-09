"""Process-local cache behind a small interface (Phase 5).

Architecture::

    routes / application services
        ↓ (CacheService interface)
    InMemoryCache  — process-local, thread-safe TTL store (current)

No database is required: the application visualizes data fetched from
external providers rather than maintaining a persistent user-owned
dataset, so a short-lived process-local cache is sufficient.

If traffic or multi-instance deployment ever requires shared caching,
implement ``CacheService`` on top of Redis and swap the construction
site in :func:`app.create_app` — no route or service code changes.
"""

import threading
import time
from abc import ABC, abstractmethod


class CacheService(ABC):
    """Minimal cache contract used by the application layer."""

    @abstractmethod
    def get(self, key):
        """Return the fresh value for ``key``, or ``None`` on miss/expiry."""

    @abstractmethod
    def get_stale(self, key):
        """Return the value for ``key`` even if expired, or ``None``."""

    @abstractmethod
    def set(self, key, value, timeout=None):
        """Store ``value`` for ``timeout`` seconds (default TTL if None)."""

    @abstractmethod
    def delete(self, key):
        """Remove ``key`` if present."""

    @abstractmethod
    def clear(self):
        """Remove all entries (tests, admin)."""


class InMemoryCache(CacheService):
    """Thread-safe in-memory TTL cache with a bounded entry count."""

    def __init__(self, default_timeout=300, max_entries=2000):
        self._default_timeout = default_timeout
        self._max_entries = max_entries
        self._lock = threading.RLock()
        self._store = {}  # key -> (value, expires_at_monotonic)

    def get(self, key):
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if expires_at <= time.monotonic():
                # Leave the entry in place: get_stale() can still serve it
                # labelled STALE. Eviction is bounded by max_entries.
                return None
            return value

    def get_stale(self, key):
        with self._lock:
            entry = self._store.get(key)
            return entry[0] if entry is not None else None

    def set(self, key, value, timeout=None):
        ttl = self._default_timeout if timeout is None else timeout
        with self._lock:
            if len(self._store) >= self._max_entries and key not in self._store:
                # Drop a single arbitrary entry; insertion order is oldest-first.
                self._store.pop(next(iter(self._store)))
            self._store[key] = (value, time.monotonic() + max(ttl, 0))

    def delete(self, key):
        with self._lock:
            self._store.pop(key, None)

    def clear(self):
        with self._lock:
            self._store.clear()


# Module-level default for contexts without a Flask app (scheduler
# bootstrap, scripts). Request handling always uses the app-bound
# instance via :func:`get_cache_service`.
_default_cache = InMemoryCache()


def get_cache_service():
    """Return the app-bound cache, or the module default outside requests."""
    try:
        from flask import current_app, has_app_context

        if has_app_context():
            service = current_app.extensions.get("cache_service")
            if service is not None:
                return service
    except RuntimeError:
        pass
    return _default_cache
