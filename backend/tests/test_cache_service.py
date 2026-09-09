"""CacheService unit tests: TTL, stale reads, bounds, isolation."""

import time

from app.cache_service import InMemoryCache, get_cache_service


def test_set_get_roundtrip():
    cache = InMemoryCache()
    assert cache.get("missing") is None
    cache.set("k", {"v": 1}, timeout=60)
    assert cache.get("k") == {"v": 1}


def test_expired_entries_miss_but_remain_stale_readable():
    cache = InMemoryCache()
    cache.set("k", "value", timeout=0)
    assert cache.get("k") is None
    assert cache.get_stale("k") == "value"


def test_default_timeout_applies():
    cache = InMemoryCache(default_timeout=60)
    cache.set("k", 1)
    assert cache.get("k") == 1


def test_delete_and_clear():
    cache = InMemoryCache()
    cache.set("a", 1)
    cache.set("b", 2)
    cache.delete("a")
    assert cache.get("a") is None
    assert cache.get("b") == 2
    cache.clear()
    assert cache.get("b") is None
    assert cache.get_stale("b") is None


def test_max_entries_bounds_memory():
    cache = InMemoryCache(max_entries=5)
    for i in range(20):
        cache.set(f"k{i}", i, timeout=60)
    assert len(cache._store) <= 5


def test_expiry_is_time_based():
    cache = InMemoryCache()
    cache.set("k", 1, timeout=3600)
    real_monotonic = time.monotonic
    try:
        time.monotonic = lambda: real_monotonic() + 7200
        assert cache.get("k") is None
        assert cache.get_stale("k") == 1
    finally:
        time.monotonic = real_monotonic


def test_get_cache_service_prefers_app_instance(app):
    with app.app_context():
        service = get_cache_service()
        assert service is app.extensions["cache_service"]


def test_get_cache_service_falls_back_without_app():
    assert isinstance(get_cache_service(), InMemoryCache)
