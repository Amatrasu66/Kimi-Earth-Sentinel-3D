import time
import structlog
from apscheduler.schedulers.background import BackgroundScheduler
from flask import current_app

logger = structlog.get_logger()
scheduler = None

def refresh_layer_data(layer_id, source):
    """Refresh data for a specific layer."""
    try:
        logger.info('refreshing_layer', layer_id=layer_id, source=source)
        # Data is fetched on-demand via API endpoints with caching
        # This job can be extended to pre-fetch and warm the cache
    except Exception as e:
        logger.error('layer_refresh_failed', layer_id=layer_id, error=str(e))

def start_scheduler():
    """Start the background scheduler for data refresh."""
    global scheduler
    
    if scheduler and scheduler.running:
        return
    
    scheduler = BackgroundScheduler()
    
    # Schedule layer refresh jobs
    jobs = [
        {'layer_id': 'earthquakes', 'source': 'usgs', 'interval': 300},
        {'layer_id': 'disasters', 'source': 'nasa_eonet', 'interval': 600},
        {'layer_id': 'wildfires', 'source': 'nasa_firms', 'interval': 600},
        {'layer_id': 'temperature', 'source': 'open_meteo', 'interval': 3600},
        {'layer_id': 'precipitation', 'source': 'open_meteo', 'interval': 3600},
        {'layer_id': 'air_quality', 'source': 'airnow', 'interval': 1800},
    ]
    
    for job in jobs:
        scheduler.add_job(
            refresh_layer_data,
            'interval',
            seconds=job['interval'],
            args=[job['layer_id'], job['source']],
            id=f"refresh_{job['layer_id']}",
            replace_existing=True
        )
    
    scheduler.start()
    logger.info('scheduler_started', jobs=len(jobs))

def stop_scheduler():
    """Stop the scheduler."""
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown()
        logger.info('scheduler_stopped')
