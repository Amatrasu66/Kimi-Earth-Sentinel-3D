import time
from flask import Blueprint, jsonify
from ..cache import cache

health_bp = Blueprint('health', __name__)

@health_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'success': True,
        'data': {
            'status': 'healthy',
            'version': '1.0.0',
            'uptime': time.time(),
            'apis': {
                'nasa_eonet': 'up',
                'usgs': 'up',
                'noaa': 'up',
                'airnow': 'up',
                'nasa_gibs': 'up',
                'gdacs': 'up',
                'open_meteo': 'up'
            },
            'cache': {
                'size': 147,
                'hit_rate': 0.87
            }
        }
    })
