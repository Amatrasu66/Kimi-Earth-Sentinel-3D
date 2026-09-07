import requests
import time
import random
from flask import current_app

def get_air_quality_data(bbox=None, limit=500, min_severity=None):
    """Fetch air quality data from AirNow API."""
    try:
        api_key = current_app.config.get('AIRNOW_API_KEY')
        if not api_key:
            return _generate_mock_aqi(bbox, limit)
        
        base_url = 'https://www.airnowapi.org/aq/current'
        
        # AirNow is US-only, so we use representative coordinates
        resp = requests.get(
            f'{base_url}/observationByLatLon/?format=application/json',
            params={
                'latitude': 39.0,
                'longitude': -98.5,
                'distance': 500,
                'API_KEY': api_key
            },
            timeout=current_app.config.get('REQUEST_TIMEOUT', 30)
        )
        resp.raise_for_status()
        data = resp.json()
        
        points = []
        for item in data[:limit]:
            aqi = item.get('AQI', 0)
            
            severity = 'low'
            if aqi > 300:
                severity = 'critical'
            elif aqi > 200:
                severity = 'high'
            elif aqi > 150:
                severity = 'moderate'
            
            points.append({
                'id': f"aqi-{item.get('Latitude', 0)}-{item.get('Longitude', 0)}",
                'lat': item.get('Latitude', 39.0),
                'lon': item.get('Longitude', -98.5),
                'value': aqi,
                'severity': severity,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'location': item.get('ReportingArea', 'Unknown'),
                'parameter': item.get('ParameterName', 'PM2.5')
            })
        
        return {
            'layer_id': 'air_quality',
            'count': len(points),
            'points': points,
            'unit': 'AQI'
        }
    
    except Exception as e:
        current_app.logger.error(f'AirNow API error: {e}')
        return _generate_mock_aqi(bbox, limit)

def _generate_mock_aqi(bbox=None, limit=500):
    """Generate mock AQI data for global coverage."""
    cities = [
        {'name': 'Beijing', 'lat': 39.9042, 'lon': 116.4074, 'aqi': 165},
        {'name': 'Delhi', 'lat': 28.6139, 'lon': 77.2090, 'aqi': 189},
        {'name': 'Lagos', 'lat': 6.5244, 'lon': 3.3792, 'aqi': 142},
        {'name': 'Sao Paulo', 'lat': -23.5505, 'lon': -46.6333, 'aqi': 78},
        {'name': 'Mexico City', 'lat': 19.4326, 'lon': -99.1332, 'aqi': 134},
        {'name': 'Los Angeles', 'lat': 34.0522, 'lon': -118.2437, 'aqi': 95},
        {'name': 'London', 'lat': 51.5074, 'lon': -0.1278, 'aqi': 45},
        {'name': 'Tokyo', 'lat': 35.6762, 'lon': 139.6503, 'aqi': 52},
        {'name': 'Jakarta', 'lat': -6.2088, 'lon': 106.8456, 'aqi': 156},
        {'name': 'Cairo', 'lat': 30.0444, 'lon': 31.2357, 'aqi': 178},
        {'name': 'Mumbai', 'lat': 19.0760, 'lon': 72.8777, 'aqi': 167},
        {'name': 'Bangkok', 'lat': 13.7563, 'lon': 100.5018, 'aqi': 112},
        {'name': 'Seoul', 'lat': 37.5665, 'lon': 126.9780, 'aqi': 88},
        {'name': 'Paris', 'lat': 48.8566, 'lon': 2.3522, 'aqi': 38},
        {'name': 'New York', 'lat': 40.7128, 'lon': -74.0060, 'aqi': 42},
        {'name': 'Sydney', 'lat': -33.8688, 'lon': 151.2093, 'aqi': 28},
        {'name': 'Moscow', 'lat': 55.7558, 'lon': 37.6173, 'aqi': 72},
        {'name': 'Istanbul', 'lat': 41.0082, 'lon': 28.9784, 'aqi': 98},
        {'name': 'Dubai', 'lat': 25.2048, 'lon': 55.2708, 'aqi': 125},
        {'name': 'Singapore', 'lat': 1.3521, 'lon': 103.8198, 'aqi': 55},
    ]
    
    random.seed(42)
    points = []
    for city in cities[:limit]:
        aqi = city['aqi'] + random.randint(-20, 20)
        aqi = max(0, min(500, aqi))
        
        severity = 'low'
        if aqi > 300:
            severity = 'critical'
        elif aqi > 200:
            severity = 'high'
        elif aqi > 150:
            severity = 'moderate'
        
        points.append({
            'id': f"aqi-{city['lat']}-{city['lon']}",
            'lat': city['lat'],
            'lon': city['lon'],
            'value': aqi,
            'severity': severity,
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'location': city['name'],
            'parameter': 'PM2.5'
        })
    
    return {
        'layer_id': 'air_quality',
        'count': len(points),
        'points': points,
        'unit': 'AQI'
    }
