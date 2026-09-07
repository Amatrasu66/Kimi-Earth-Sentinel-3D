import time
from flask import Blueprint, request, jsonify
from ..services.fallback import get_mock_stats, get_mock_historical_data

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/stats', methods=['GET'])
def get_stats():
    data = get_mock_stats()
    return jsonify({
        'success': True,
        'data': data,
        'meta': {
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'cache_hit': False
        }
    })

@stats_bp.route('/stats/historical', methods=['GET'])
def get_historical():
    metric = request.args.get('metric', 'earthquakes')
    period = request.args.get('period', '30d')
    aggregation = request.args.get('aggregation', 'daily')
    
    data = get_mock_historical_data(metric, period, aggregation)
    return jsonify({
        'success': True,
        'data': data,
        'meta': {'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    })
