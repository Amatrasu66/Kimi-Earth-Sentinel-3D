"""Opt-in in-process cache warming (disabled in production for V1).

No workers, no queues, no additional infrastructure: when enabled,
APScheduler runs inside the Flask process and pre-fetches the default
view of every layer so user requests rarely pay for a cold provider call.

V1 DECISION: ``SCHEDULER_ENABLED`` is ``false`` in production
(``render.yaml``). With multiple Gunicorn workers each process would run
its own scheduler against its own process-local cache — duplicate
provider traffic with no shared benefit. The request-time cache plus
stale fallback in :mod:`app.services.layer_service` remain fully
functional without warming, so the desired V1 behavior is simply::

    request → process-local cache → provider on miss → cache result

Enable the scheduler only for single-process deployments (local dev)
where warming one shared-in-that-process cache is genuinely useful.

* Jobs run at each layer's TTL, so entries are refreshed just as they
  would otherwise expire.
* A warm job is a no-op when the cache entry is still fresh — no
  unnecessary provider calls.
* Only ``LIVE`` payloads are stored. Provider failures leave the previous
  cache untouched; the route layer then serves it labelled ``STALE``.
* Jobs never overlap (``max_instances=1``) and coalesce on misfire.
* With multiple gunicorn workers each process warms its own local cache.
  That duplication is accepted while the cache is process-local (see
  README: no shared cache required yet).
"""

import structlog
from apscheduler.schedulers.background import BackgroundScheduler

from ..models.layer import get_all_layers
from ..utils.provenance import ttl_for_layer

logger = structlog.get_logger()
scheduler = None


def warm_layer(app, layer_id):
    """Fetch one layer's default view into the cache. Never raises."""
    try:
        with app.app_context():
            # Imported here so the scheduler module stays importable
            # without pulling the whole service graph at module load.
            from ..services.layer_service import get_layer_payload

            data, cache_hit, stale = get_layer_payload(layer_id)
            status = (data.get("data_status") or {}).get("status", "unknown")
            logger.info(
                "layer_warmed",
                layer_id=layer_id,
                status=status,
                points=data.get("count"),
                cache_hit=cache_hit,
                stale=stale,
            )
    except Exception as e:  # noqa: BLE001 — warming must never kill the scheduler
        logger.error("layer_warm_failed", layer_id=layer_id, error=str(e))


def start_scheduler(app):
    """Start the background cache-warming scheduler for ``app``."""
    global scheduler

    if scheduler and scheduler.running:
        return scheduler

    scheduler = BackgroundScheduler()

    for layer in get_all_layers():
        interval = ttl_for_layer(layer.id)
        scheduler.add_job(
            warm_layer,
            "interval",
            seconds=interval,
            args=[app, layer.id],
            id=f"warm_{layer.id}",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=60,
        )

    scheduler.start()
    logger.info("scheduler_started", jobs=len(get_all_layers()))
    return scheduler


def stop_scheduler():
    """Stop the scheduler."""
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown()
        logger.info("scheduler_stopped")
