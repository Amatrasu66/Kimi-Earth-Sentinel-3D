import time
import base64
import struct
import random
from flask import Blueprint, request, jsonify, current_app
from ..cache import cache
from ..models.layer import get_all_layers, get_layer
from ..services.usgs import get_earthquake_data
from ..services.nasa_eonet import get_eonet_events
from ..services.open_meteo import get_weather_data
from ..services.airnow import get_air_quality_data
from ..services.nasa_firms import get_fire_data
from ..services.fallback import generate_mock_layer_data

layers_bp = Blueprint('layers', __name__)

SERVICE_MAP = {
    'earthquakes': get_earthquake_data,
    'disasters': get_eonet_events,
    'temperature': lambda **kw: get_weather_data(metric='temperature', **kw),
    'precipitation': lambda **kw: get_weather_data(metric='precipitation', **kw),
    'air_quality': get_air_quality_data,
    'wildfires': get_fire_data,
    'clouds': lambda **kw: get_weather_data(metric='cloudcover', **kw),
}

@layers_bp.route('/layers', methods=['GET'])
def list_layers():
    layers = [layer.to_dict() for layer in get_all_layers()]
    return jsonify({
        'success': True,
        'data': {'layers': layers},
        'meta': {'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    })

@layers_bp.route('/layers/<layer_id>/data', methods=['GET'])
def get_layer_data(layer_id):
    layer = get_layer(layer_id)
    if not layer:
        return jsonify({
            'success': False,
            'error': {'code': 'NOT_FOUND', 'message': f'Layer {layer_id} not found'}
        }), 404
    
    bbox = request.args.get('bbox')
    limit = min(int(request.args.get('limit', 500)), 2000)
    min_severity = request.args.get('min_severity')
    
    service_fn = SERVICE_MAP.get(layer_id)
    try:
        if service_fn:
            data = service_fn(bbox=bbox, limit=limit, min_severity=min_severity)
        else:
            data = generate_mock_layer_data(layer_id, bbox=bbox, limit=limit)
    except Exception as e:
        current_app.logger.error(f'Layer data fetch failed for {layer_id}: {e}')
        data = generate_mock_layer_data(layer_id, bbox=bbox, limit=limit)
    
    return jsonify({
        'success': True,
        'data': data,
        'meta': {
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'cache_hit': False,
            'source': layer.source
        }
    })

@layers_bp.route('/layers/<layer_id>/heatmap', methods=['GET'])
def get_layer_heatmap(layer_id):
    resolution = min(int(request.args.get('resolution', 256)), 512)
    time_range = request.args.get('time_range', '24h')
    
    # Generate synthetic heatmap data
    grid = []
    for i in range(resolution * resolution // 2):
        val = random.random()
        grid.append(val)
    
    grid_bytes = struct.pack(f'{len(grid)}f', *grid)
    grid_b64 = base64.b64encode(grid_bytes).decode('utf-8')
    
    layer = get_layer(layer_id)
    unit_map = {
        'temperature': 'celsius',
        'precipitation': 'mm',
        'air_quality': 'AQI',
        'clouds': 'percent'
    }
    
    return jsonify({
        'success': True,
        'data': {
            'layer_id': layer_id,
            'resolution': resolution,
            'grid': grid_b64,
            'min_value': -40.5,
            'max_value': 48.2,
            'unit': unit_map.get(layer_id, 'value'),
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        },
        'meta': {'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    })
