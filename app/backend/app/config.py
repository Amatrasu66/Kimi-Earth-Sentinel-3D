import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    FLASK_ENV = os.environ.get('FLASK_ENV', 'production')
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # Cache
    CACHE_TYPE = os.environ.get('CACHE_TYPE', 'simple')
    CACHE_DEFAULT_TIMEOUT = int(os.environ.get('CACHE_DEFAULT_TIMEOUT', 300))
    REDIS_URL = os.environ.get('REDIS_URL', None)
    
    # API URLs
    USGS_API_URL = os.environ.get('USGS_API_URL', 'https://earthquake.usgs.gov')
    NASA_EONET_URL = os.environ.get('NASA_EONET_URL', 'https://eonet.gsfc.nasa.gov/api/v3')
    NASA_GIBS_URL = os.environ.get('NASA_GIBS_URL', 'https://gibs.earthdata.nasa.gov')
    NOAA_API_URL = os.environ.get('NOAA_API_URL', 'https://api.weather.gov')
    AIRNOW_API_URL = 'https://www.airnowapi.org/aq'
    NASA_FIRMS_URL = 'https://firms.modaps.eosdis.nasa.gov/api'
    GDACS_URL = os.environ.get('GDACS_URL', 'https://www.gdacs.org')
    OPEN_METEO_URL = 'https://api.open-meteo.com/v1'
    
    # API Keys
    AIRNOW_API_KEY = os.environ.get('AIRNOW_API_KEY', None)
    NASA_FIRMS_API_KEY = os.environ.get('NASA_FIRMS_API_KEY', None)
    
    # Timeouts
    REQUEST_TIMEOUT = int(os.environ.get('REQUEST_TIMEOUT', 30))
    
    # Scheduler
    SCHEDULER_API_ENABLED = True
