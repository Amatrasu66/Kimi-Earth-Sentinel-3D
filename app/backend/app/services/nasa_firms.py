import requests
import time
import random
from flask import current_app

def get_fire_data(bbox=None, limit=500, min_severity=None):
    """Fetch active fire data from NASA FIRMS."""
    try:
        api_key = current_app.config.get('NASA_FIRMS_API_KEY')
        if not api_key:
            return _generate_mock_fires(bbox, limit)
        
        base_url = 'https://firms.modaps.eosdis.nasa.gov/api'
        
        # Get fire data for last 24 hours
        resp = requests.get(
            f'{base_url}/area/csv/VIIRS_NOAA20_NRT/{api_key}/WORLD/1',
            timeout=current_app.config.get('REQUEST_TIMEOUT', 30)
        )
        resp.raise_for_status()
        
        points = []
        lines = resp.text.strip().split('\n')[1:]  # Skip header
        
        for line in lines[:limit]:
            parts = line.split(',')
            if len(parts) < 3:
                continue
            
            try:
                lat = float(parts[0])
                lon = float(parts[1])
                bright = float(parts[2]) if len(parts) > 2 else 300
                
                severity = 'low'
                if bright > 400:
                    severity = 'critical'
                elif bright > 350:
                    severity = 'high'
                elif bright > 320:
                    severity = 'moderate'
                
                points.append({
                    'id': f"fire-{lat}-{lon}",
                    'lat': lat,
                    'lon': lon,
                    'value': round(bright, 1),
                    'severity': severity,
                    'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'unit': 'brightness'
                })
            except (ValueError, IndexError):
                continue
        
        return {
            'layer_id': 'wildfires',
            'count': len(points),
            'points': points,
            'unit': 'brightness'
        }
    
    except Exception as e:
        current_app.logger.error(f'NASA FIRMS API error: {e}')
        return _generate_mock_fires(bbox, limit)

def _generate_mock_fires(bbox=None, limit=500):
    """Generate mock wildfire data."""
    fire_regions = [
        {'lat': 64.8378, 'lon': -147.7164, 'name': 'Alaska'},
        {'lat': 37.7749, 'lon': -122.4194, 'name': 'California'},
        {'lat': -33.8688, 'lon': 150.2093, 'name': 'Australia'},
        {'lat': -15.7975, 'lon': -47.8919, 'name': 'Brazil'},
        {'lat': 1.3521, 'lon': 103.8198, 'name': 'Indonesia'},
        {'lat': 46.8625, 'lon': 103.8467, 'name': 'Mongolia'},
        {'lat': 60.4720, 'lon': 8.4689, 'name': 'Norway'},
        {'lat': 51.2538, 'lon': -85.3232, 'name': 'Canada'},
        {'lat': -1.2921, 'lon': 36.8219, 'name': 'Kenya'},
        {'lat': 20.5937, 'lon': 78.9629, 'name': 'India'},
    ]
    
    random.seed(42)
    points = []
    
    for region in fire_regions:
        for _ in range(random.randint(3, 15)):
            lat = region['lat'] + random.uniform(-5, 5)
            lon = region['lon'] + random.uniform(-5, 5)
            bright = random.uniform(300, 450)
            
            severity = 'low'
            if bright > 400:
                severity = 'critical'
            elif bright > 350:
                severity = 'high'
            elif bright > 320:
                severity = 'moderate'
            
            points.append({
                'id': f"fire-{lat:.4f}-{lon:.4f}",
                'lat': lat,
                'lon': lon,
                'value': round(bright, 1),
                'severity': severity,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'location': region['name'],
                'unit': 'brightness'
            })
    
    return {
        'layer_id': 'wildfires',
        'count': len(points),
        'points': points[:limit],
        'unit': 'brightness'
    }
