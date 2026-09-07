import requests
import time
from datetime import datetime, timedelta
from flask import current_app
from ..services.fallback import generate_mock_earthquakes

def get_earthquake_data(bbox=None, limit=500, min_severity=None):
    """Fetch earthquake data from USGS API."""
    try:
        base_url = current_app.config.get('USGS_API_URL', 'https://earthquake.usgs.gov')
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=30)
        
        params = {
            'format': 'geojson',
            'starttime': start_time.strftime('%Y-%m-%d'),
            'endtime': end_time.strftime('%Y-%m-%d'),
            'minmagnitude': 2.5,
            'orderby': 'time',
            'limit': limit
        }
        
        if bbox:
            parts = bbox.split(',')
            if len(parts) == 4:
                params['minlongitude'] = parts[0]
                params['minlatitude'] = parts[1]
                params['maxlongitude'] = parts[2]
                params['maxlatitude'] = parts[3]
        
        if min_severity:
            mag_map = {'low': 2.5, 'moderate': 4.5, 'high': 6.0, 'critical': 7.0}
            params['minmagnitude'] = mag_map.get(min_severity, 2.5)
        
        resp = requests.get(
            f'{base_url}/fdsnws/event/1/query',
            params=params,
            timeout=current_app.config.get('REQUEST_TIMEOUT', 30)
        )
        resp.raise_for_status()
        data = resp.json()
        
        points = []
        severity_counts = {'low': 0, 'moderate': 0, 'high': 0, 'critical': 0}
        max_mag = 0
        
        for feature in data.get('features', [])[:limit]:
            props = feature['properties']
            mag = props.get('mag', 0)
            coords = feature['geometry']['coordinates']
            
            if mag > max_mag:
                max_mag = mag
            
            if mag >= 7.0:
                severity = 'critical'
            elif mag >= 6.0:
                severity = 'high'
            elif mag >= 4.5:
                severity = 'moderate'
            else:
                severity = 'low'
            
            severity_counts[severity] += 1
            
            points.append({
                'id': feature['id'],
                'lat': coords[1],
                'lon': coords[0],
                'magnitude': mag,
                'depth': coords[2] if len(coords) > 2 else 10,
                'severity': severity,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(props.get('time', 0) / 1000)),
                'location': props.get('place', 'Unknown location'),
                'url': props.get('url', '')
            })
        
        return {
            'layer_id': 'earthquakes',
            'count': len(points),
            'points': points,
            'stats': {
                'total_24h': len([p for p in points if p['magnitude'] >= 2.5]),
                'max_magnitude': max_mag,
                'by_severity': severity_counts
            }
        }
    
    except Exception as e:
        current_app.logger.error(f'USGS API error: {e}')
        return generate_mock_earthquakes(bbox=bbox, limit=limit)
