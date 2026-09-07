import requests
import time
import random
from flask import current_app

def get_weather_data(metric='temperature', bbox=None, limit=500, min_severity=None):
    """Fetch weather data from Open-Meteo API."""
    try:
        base_url = 'https://api.open-meteo.com/v1'
        
        # Sample grid points around the world
        grid_points = _generate_weather_grid(bbox)
        
        points = []
        metric_map = {
            'temperature': 'temperature_2m',
            'precipitation': 'precipitation',
            'cloudcover': 'cloudcover'
        }
        
        for pt in grid_points[:min(limit, 200)]:
            try:
                resp = requests.get(
                    f'{base_url}/forecast',
                    params={
                        'latitude': pt['lat'],
                        'longitude': pt['lon'],
                        'current': metric_map.get(metric, 'temperature_2m'),
                        'temperature_unit': 'celsius'
                    },
                    timeout=10
                )
                resp.raise_for_status()
                data = resp.json()
                
                current = data.get('current', {})
                val = current.get(metric_map.get(metric, 'temperature_2m'), 0)
                
                severity = 'low'
                if metric == 'temperature':
                    if val > 40 or val < -20:
                        severity = 'high'
                    elif val > 35 or val < -10:
                        severity = 'moderate'
                elif metric == 'precipitation':
                    if val > 50:
                        severity = 'high'
                    elif val > 20:
                        severity = 'moderate'
                elif metric == 'cloudcover':
                    if val > 80:
                        severity = 'high'
                    elif val > 50:
                        severity = 'moderate'
                
                points.append({
                    'id': f"wx-{pt['lat']:.2f}-{pt['lon']:.2f}",
                    'lat': pt['lat'],
                    'lon': pt['lon'],
                    'value': round(val, 1),
                    'severity': severity,
                    'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'unit': _get_unit(metric)
                })
            except:
                continue
        
        return {
            'layer_id': metric,
            'count': len(points),
            'points': points,
            'unit': _get_unit(metric)
        }
    
    except Exception as e:
        current_app.logger.error(f'Open-Meteo API error: {e}')
        return _generate_mock_weather(metric, bbox, limit)

def _generate_weather_grid(bbox=None):
    """Generate a grid of lat/lon points."""
    points = []
    if bbox:
        parts = [float(p) for p in bbox.split(',')]
        lons = [parts[0] + i * (parts[2] - parts[0]) / 10 for i in range(10)]
        lats = [parts[1] + i * (parts[3] - parts[1]) / 10 for i in range(10)]
    else:
        lons = list(range(-180, 180, 30))
        lats = list(range(-60, 75, 15))
    
    for lon in lons:
        for lat in lats:
            points.append({'lat': lat, 'lon': lon})
    return points

def _get_unit(metric):
    return {
        'temperature': 'celsius',
        'precipitation': 'mm',
        'cloudcover': 'percent'
    }.get(metric, 'value')

def _generate_mock_weather(metric, bbox, limit):
    points = []
    grid = _generate_weather_grid(bbox)
    random.seed(42)
    
    for pt in grid[:limit]:
        if metric == 'temperature':
            val = random.uniform(-30, 45)
        elif metric == 'precipitation':
            val = random.uniform(0, 80)
        else:
            val = random.uniform(0, 100)
        
        points.append({
            'id': f"wx-{pt['lat']:.2f}-{pt['lon']:.2f}",
            'lat': pt['lat'],
            'lon': pt['lon'],
            'value': round(val, 1),
            'severity': 'low',
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'unit': _get_unit(metric)
        })
    
    return {
        'layer_id': metric,
        'count': len(points),
        'points': points,
        'unit': _get_unit(metric)
    }
