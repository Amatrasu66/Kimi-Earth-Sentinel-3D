import requests
import time
from flask import current_app
from ..services.fallback import generate_mock_disasters

def get_eonet_events(bbox=None, limit=500, min_severity=None):
    """Fetch natural disaster events from NASA EONET."""
    try:
        base_url = current_app.config.get('NASA_EONET_URL', 'https://eonet.gsfc.nasa.gov/api/v3')
        
        params = {
            'status': 'open',
            'limit': limit
        }
        
        if bbox:
            params['bbox'] = bbox
        
        resp = requests.get(
            f'{base_url}/events',
            params=params,
            timeout=current_app.config.get('REQUEST_TIMEOUT', 30)
        )
        resp.raise_for_status()
        data = resp.json()
        
        points = []
        for event in data.get('events', [])[:limit]:
            categories = event.get('categories', [])
            cat_title = categories[0]['title'] if categories else 'Unknown'
            
            # Get the most recent geometry
            geometries = event.get('geometries', [])
            if not geometries:
                continue
            
            latest_geo = geometries[-1]
            coords = latest_geo['coordinates']
            
            severity = 'low'
            if any(c['id'] in ['severeStorms', 'volcanoes'] for c in categories):
                severity = 'high'
            elif any(c['id'] in ['floods', 'wildfires'] for c in categories):
                severity = 'moderate'
            
            if min_severity and severity != min_severity and severity not in _get_severity_or_above(min_severity):
                continue
            
            points.append({
                'id': f"eonet-{event['id']}",
                'lat': coords[1] if len(coords) > 1 else coords[0],
                'lon': coords[0] if len(coords) > 1 else coords[1],
                'type': cat_title.lower().replace(' ', '_'),
                'severity': severity,
                'title': event.get('title', 'Unknown Event'),
                'timestamp': latest_geo.get('date', time.strftime('%Y-%m-%dT%H:%M:%SZ')),
                'description': f"{cat_title} event reported by NASA EONET",
                'sources': [s.get('id', 'eonet') for s in event.get('sources', [])],
                'categories': [c['title'] for c in categories]
            })
        
        return {
            'layer_id': 'disasters',
            'count': len(points),
            'points': points
        }
    
    except Exception as e:
        current_app.logger.error(f'NASA EONET API error: {e}')
        return generate_mock_disasters(bbox=bbox, limit=limit)

def _get_severity_or_above(severity):
    order = ['low', 'moderate', 'high', 'critical']
    if severity not in order:
        return order
    idx = order.index(severity)
    return order[idx:]
