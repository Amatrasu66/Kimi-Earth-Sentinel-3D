import random
import time
import uuid
from datetime import datetime, timedelta, timezone

# ===== Earthquake Mock Data =====

def generate_mock_earthquakes(bbox=None, limit=500):
    """Generate realistic mock earthquake data."""
    seismic_regions = [
        # Pacific Ring of Fire
        {'name': 'Japan Trench', 'lat_range': (35, 42), 'lon_range': (140, 150)},
        {'name': 'San Andreas', 'lat_range': (32, 38), 'lon_range': (-122, -115)},
        {'name': 'Chile Trench', 'lat_range': (-45, -18), 'lon_range': (-80, -68)},
        {'name': 'Indonesia', 'lat_range': (-8, 8), 'lon_range': (95, 140)},
        {'name': 'Philippines', 'lat_range': (5, 20), 'lon_range': (120, 135)},
        {'name': 'New Zealand', 'lat_range': (-45, -35), 'lon_range': (165, 180)},
        {'name': 'Aleutian', 'lat_range': (50, 55), 'lon_range': (-180, -150)},
        {'name': 'Peru-Chile', 'lat_range': (-20, -5), 'lon_range': (-80, -65)},
        {'name': 'Mediterranean', 'lat_range': (35, 42), 'lon_range': (12, 30)},
        {'name': 'Himalaya', 'lat_range': (27, 36), 'lon_range': (70, 90)},
        {'name': 'Iceland', 'lat_range': (63, 67), 'lon_range': (-25, -13)},
        {'name': 'Turkey', 'lat_range': (36, 42), 'lon_range': (26, 45)},
        {'name': 'Mexico', 'lat_range': (15, 25), 'lon_range': (-105, -95)},
        {'name': 'Alaska', 'lat_range': (55, 65), 'lon_range': (-165, -140)},
        {'name': 'Tonga', 'lat_range': (-25, -15), 'lon_range': (-180, -173)},
    ]
    
    random.seed(42)
    points = []
    severity_counts = {'low': 0, 'moderate': 0, 'high': 0, 'critical': 0}
    max_mag = 0
    
    now = datetime.now(timezone.utc)
    
    for _ in range(min(limit, 500)):
        region = random.choice(seismic_regions)
        lat = random.uniform(*region['lat_range'])
        lon = random.uniform(*region['lon_range'])
        
        # Magnitude distribution: mostly small, few large
        r = random.random()
        if r < 0.7:
            mag = random.uniform(2.5, 4.0)
        elif r < 0.9:
            mag = random.uniform(4.0, 5.5)
        elif r < 0.97:
            mag = random.uniform(5.5, 7.0)
        else:
            mag = random.uniform(7.0, 8.5)
        
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
        
        hours_ago = random.uniform(0, 720)  # Up to 30 days
        timestamp = now - timedelta(hours=hours_ago)
        
        points.append({
            'id': f"usgs-{uuid.uuid4().hex[:8]}",
            'lat': round(lat, 4),
            'lon': round(lon, 4),
            'magnitude': round(mag, 1),
            'depth': round(random.uniform(5, 700), 1),
            'severity': severity,
            'timestamp': timestamp.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'location': f"{random.randint(10, 200)}km {random.choice(['N', 'S', 'E', 'W'])} of {region['name']}",
            'url': ''
        })
    
    # Sort by recency
    points.sort(key=lambda x: x['timestamp'], reverse=True)
    
    return {
        'layer_id': 'earthquakes',
        'count': len(points),
        'points': points,
        'stats': {
            'total_24h': len([p for p in points if (now - datetime.strptime(p['timestamp'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)).days < 1]),
            'max_magnitude': round(max_mag, 1),
            'by_severity': severity_counts
        }
    }

# ===== Disaster Mock Data =====

def generate_mock_disasters(bbox=None, limit=500):
    """Generate realistic mock disaster data."""
    disaster_types = [
        ('flood', 'Severe Flooding', 0.25),
        ('wildfire', 'Wildfire', 0.20),
        ('storm', 'Severe Storm', 0.20),
        ('drought', 'Drought', 0.15),
        ('landslide', 'Landslide', 0.10),
        ('volcano', 'Volcanic Activity', 0.05),
        ('cyclone', 'Tropical Cyclone', 0.05),
    ]
    
    regions = [
        {'name': 'Southeast Asia', 'lat': (5, 20), 'lon': (95, 140)},
        {'name': 'East Africa', 'lat': (-10, 10), 'lon': (30, 50)},
        {'name': 'Central America', 'lat': (8, 20), 'lon': (-105, -75)},
        {'name': 'Mediterranean', 'lat': (35, 45), 'lon': (-10, 35)},
        {'name': 'South Asia', 'lat': (8, 30), 'lon': (70, 90)},
        {'name': 'Australia', 'lat': (-35, -15), 'lon': (115, 150)},
        {'name': 'West Africa', 'lat': (0, 20), 'lon': (-20, 20)},
        {'name': 'Amazon', 'lat': (-10, 5), 'lon': (-75, -50)},
        {'name': 'Caribbean', 'lat': (10, 25), 'lon': (-85, -60)},
        {'name': 'Pacific Islands', 'lat': (-20, 20), 'lon': (140, -140)},
    ]
    
    random.seed(42)
    points = []
    now = datetime.now(timezone.utc)
    
    for _ in range(min(limit, 200)):
        dtype, label, weight = random.choices(
            disaster_types,
            weights=[d[2] for d in disaster_types],
            k=1
        )[0]
        
        region = random.choice(regions)
        lat = random.uniform(*region['lat'])
        lon = random.uniform(*region['lon'])
        
        severity = random.choices(
            ['low', 'moderate', 'high', 'critical'],
            weights=[0.4, 0.35, 0.2, 0.05]
        )[0]
        
        days_ago = random.uniform(0, 60)
        timestamp = now - timedelta(days=days_ago)
        
        points.append({
            'id': f"eonet-{uuid.uuid4().hex[:8]}",
            'lat': round(lat, 4),
            'lon': round(lon, 4),
            'type': dtype,
            'severity': severity,
            'title': f"{label} - {region['name']}",
            'timestamp': timestamp.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'description': f"{label} event reported in {region['name']}. Monitoring ongoing.",
            'sources': ['GDACS', 'NASA EONET'],
            'categories': [dtype, 'natural_disaster']
        })
    
    points.sort(key=lambda x: x['timestamp'], reverse=True)
    
    return {
        'layer_id': 'disasters',
        'count': len(points),
        'points': points
    }

# ===== Generic Mock Data =====

def generate_mock_layer_data(layer_id, bbox=None, limit=500):
    """Generate mock data for any layer."""
    if layer_id == 'earthquakes':
        return generate_mock_earthquakes(bbox, limit)
    elif layer_id == 'disasters':
        return generate_mock_disasters(bbox, limit)
    elif layer_id == 'wildfires':
        from .nasa_firms import _generate_mock_fires
        return _generate_mock_fires(bbox, limit)
    elif layer_id in ['temperature', 'precipitation', 'clouds']:
        from .open_meteo import _generate_mock_weather
        return _generate_mock_weather(layer_id, bbox, limit)
    elif layer_id == 'air_quality':
        from .airnow import _generate_mock_aqi
        return _generate_mock_aqi(bbox, limit)
    else:
        return {
            'layer_id': layer_id,
            'count': 0,
            'points': [],
            'message': 'No data available for this layer'
        }

# ===== Event Detail Mock =====

def get_mock_event_detail(event_id):
    """Generate detailed mock event data."""
    random.seed(hash(event_id) % 10000)
    
    # Determine event type from ID prefix
    if event_id.startswith('usgs') or 'eq' in event_id.lower():
        event_type = 'earthquake'
        mag = round(random.uniform(3.0, 8.2), 1)
        severity = 'critical' if mag >= 7.0 else 'high' if mag >= 6.0 else 'moderate' if mag >= 4.5 else 'low'
        
        return {
            'id': event_id,
            'layer_id': 'earthquakes',
            'type': 'earthquake',
            'title': f'M{mag} Earthquake',
            'lat': round(random.uniform(-60, 70), 4),
            'lon': round(random.uniform(-180, 180), 4),
            'magnitude': mag,
            'depth': round(random.uniform(5, 300), 1),
            'timestamp': (datetime.now(timezone.utc) - timedelta(hours=random.uniform(1, 72))).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'description': f'Earthquake of magnitude {mag} detected at a depth of {random.uniform(5, 300):.0f}km. Shaking was felt across a wide area.',
            'severity': severity,
            'source': {'name': 'USGS', 'url': f'https://earthquake.usgs.gov/earthquakes/eventpage/{event_id}'},
            'impact': {
                'population_exposed': f"{random.randint(100000, 50000000):,}",
                'mmi_max': random.randint(3, 9),
                'alert_level': random.choice(['green', 'yellow', 'orange', 'red'])
            },
            'related_events': [
                {'id': f'{event_id}-aftershock-1', 'title': f'M{round(mag-1.5, 1)} Aftershock', 
                 'timestamp': (datetime.now(timezone.utc) - timedelta(hours=random.uniform(0.5, 24))).strftime('%Y-%m-%dT%H:%M:%SZ')}
            ],
            'geometry': {'type': 'Point', 'coordinates': [round(random.uniform(-180, 180), 4), round(random.uniform(-60, 70), 4), round(random.uniform(5, 300), 1)]}
        }
    
    else:
        disaster_types = ['flood', 'wildfire', 'storm', 'drought', 'landslide', 'volcano']
        event_type = random.choice(disaster_types)
        severity = random.choice(['low', 'moderate', 'high', 'critical'])
        
        descriptions = {
            'flood': 'Severe flooding has affected the region, causing widespread damage to infrastructure and displacing local residents.',
            'wildfire': 'Active wildfire burning with significant smoke production. Evacuation orders may be in effect for nearby communities.',
            'storm': 'Severe storm system with heavy rainfall, strong winds, and potential for hail and tornado activity.',
            'drought': 'Extended period of below-normal precipitation leading to water shortages and agricultural impacts.',
            'landslide': 'Ground failure event triggered by heavy rainfall or seismic activity. Roads and structures may be affected.',
            'volcano': 'Volcanic unrest detected with elevated seismicity and potential for eruption.',
        }
        
        return {
            'id': event_id,
            'layer_id': 'disasters',
            'type': event_type,
            'title': f'{event_type.title()} Event',
            'lat': round(random.uniform(-60, 70), 4),
            'lon': round(random.uniform(-180, 180), 4),
            'timestamp': (datetime.now(timezone.utc) - timedelta(hours=random.uniform(1, 168))).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'description': descriptions.get(event_type, 'Natural disaster event detected.'),
            'severity': severity,
            'source': {'name': 'NASA EONET', 'url': f'https://eonet.gsfc.nasa.gov/api/v3/events/{event_id}'},
            'impact': {
                'affected_area': f"{random.randint(10, 5000):,} km²",
                'population_affected': f"{random.randint(1000, 1000000):,}"
            },
            'related_events': [],
            'geometry': {'type': 'Point', 'coordinates': [round(random.uniform(-180, 180), 4), round(random.uniform(-60, 70), 4), 0]}
        }

# ===== Search Mock =====

def search_mock_data(query, search_type='all', limit=20):
    """Search through mock data."""
    query = query.lower()
    results = []
    
    major_cities = [
        {'name': 'Tokyo', 'country': 'Japan', 'lat': 35.6762, 'lon': 139.6503, 'pop': 37400000},
        {'name': 'Delhi', 'country': 'India', 'lat': 28.6139, 'lon': 77.2090, 'pop': 32900000},
        {'name': 'Shanghai', 'country': 'China', 'lat': 31.2304, 'lon': 121.4737, 'pop': 28500000},
        {'name': 'Sao Paulo', 'country': 'Brazil', 'lat': -23.5505, 'lon': -46.6333, 'pop': 22400000},
        {'name': 'Mexico City', 'country': 'Mexico', 'lat': 19.4326, 'lon': -99.1332, 'pop': 22200000},
        {'name': 'Cairo', 'country': 'Egypt', 'lat': 30.0444, 'lon': 31.2357, 'pop': 21300000},
        {'name': 'Mumbai', 'country': 'India', 'lat': 19.0760, 'lon': 72.8777, 'pop': 21200000},
        {'name': 'Beijing', 'country': 'China', 'lat': 39.9042, 'lon': 116.4074, 'pop': 21000000},
        {'name': 'Dhaka', 'country': 'Bangladesh', 'lat': 23.8103, 'lon': 90.4125, 'pop': 21000000},
        {'name': 'Osaka', 'country': 'Japan', 'lat': 34.6937, 'lon': 135.5023, 'pop': 19000000},
        {'name': 'New York', 'country': 'USA', 'lat': 40.7128, 'lon': -74.0060, 'pop': 18800000},
        {'name': 'Karachi', 'country': 'Pakistan', 'lat': 24.8607, 'lon': 67.0011, 'pop': 17200000},
        {'name': 'Buenos Aires', 'country': 'Argentina', 'lat': -34.6037, 'lon': -58.3816, 'pop': 16200000},
        {'name': 'Istanbul', 'country': 'Turkey', 'lat': 41.0082, 'lon': 28.9784, 'pop': 15600000},
        {'name': 'Kolkata', 'country': 'India', 'lat': 22.5726, 'lon': 88.3639, 'pop': 15100000},
        {'name': 'Manila', 'country': 'Philippines', 'lat': 14.5995, 'lon': 120.9842, 'pop': 14400000},
        {'name': 'Lagos', 'country': 'Nigeria', 'lat': 6.5244, 'lon': 3.3792, 'pop': 14300000},
        {'name': 'Rio de Janeiro', 'country': 'Brazil', 'lat': -22.9068, 'lon': -43.1729, 'pop': 13500000},
        {'name': 'Los Angeles', 'country': 'USA', 'lat': 34.0522, 'lon': -118.2437, 'pop': 12400000},
        {'name': 'Moscow', 'country': 'Russia', 'lat': 55.7558, 'lon': 37.6173, 'pop': 12500000},
    ]
    
    for city in major_cities:
        if query in city['name'].lower() or query in city['country'].lower():
            results.append({
                'id': f"loc-{city['lat']}-{city['lon']}",
                'type': 'location',
                'name': city['name'],
                'country': city['country'],
                'lat': city['lat'],
                'lon': city['lon'],
                'population': city['pop'],
                'snippet': f"{city['name']}, {city['country']} - Population: {city['pop']:,}"
            })
    
    # Add mock events
    if search_type in ['all', 'event']:
        if 'quake' in query or 'earth' in query or 'seismic' in query:
            results.append({
                'id': 'usgs-12345',
                'type': 'event',
                'layer': 'earthquakes',
                'name': 'M5.2 Earthquake',
                'lat': 35.6762,
                'lon': 139.6503,
                'timestamp': (datetime.now(timezone.utc) - timedelta(hours=12)).strftime('%Y-%m-%dT%H:%M:%SZ'),
                'snippet': '35km ESE of Tokyo, depth 45km'
            })
        if 'fire' in query or 'wild' in query:
            results.append({
                'id': 'fire-001',
                'type': 'event',
                'layer': 'wildfires',
                'name': 'Wildfire - California',
                'lat': 37.7749,
                'lon': -122.4194,
                'timestamp': (datetime.now(timezone.utc) - timedelta(hours=48)).strftime('%Y-%m-%dT%H:%M:%SZ'),
                'snippet': 'Active fire, 5,000 acres burned'
            })
        if 'flood' in query:
            results.append({
                'id': 'flood-001',
                'type': 'event',
                'layer': 'disasters',
                'name': 'Severe Flooding',
                'lat': -6.2088,
                'lon': 106.8456,
                'timestamp': (datetime.now(timezone.utc) - timedelta(hours=72)).strftime('%Y-%m-%dT%H:%M:%SZ'),
                'snippet': 'Jakarta region, 50,000 affected'
            })
    
    return results[:limit]

# ===== Stats Mock =====

def get_mock_stats():
    """Generate global statistics."""
    return {
        'global': {
            'active_events': random.randint(30, 80),
            'earthquakes_24h': random.randint(80, 200),
            'avg_temperature_anomaly': round(random.uniform(-0.5, 2.5), 1),
            'precipitation_status': random.choice(['above_average', 'below_average', 'normal']),
            'air_quality_avg': random.randint(40, 120),
            'wildfire_count': random.randint(10, 50),
            'severe_weather_alerts': random.randint(5, 30)
        },
        'by_region': {
            'asia': {
                'events': random.randint(10, 30),
                'severity_index': round(random.uniform(2, 8), 1),
                'top_threat': random.choice(['earthquake', 'flood', 'cyclone'])
            },
            'europe': {
                'events': random.randint(3, 15),
                'severity_index': round(random.uniform(1, 5), 1),
                'top_threat': random.choice(['flood', 'heatwave', 'storm'])
            },
            'north_america': {
                'events': random.randint(5, 25),
                'severity_index': round(random.uniform(2, 7), 1),
                'top_threat': random.choice(['wildfire', 'hurricane', 'tornado'])
            },
            'south_america': {
                'events': random.randint(2, 10),
                'severity_index': round(random.uniform(1, 4), 1),
                'top_threat': random.choice(['landslide', 'flood', 'drought'])
            },
            'africa': {
                'events': random.randint(2, 12),
                'severity_index': round(random.uniform(1, 5), 1),
                'top_threat': random.choice(['drought', 'flood', 'cyclone'])
            },
            'oceania': {
                'events': random.randint(1, 8),
                'severity_index': round(random.uniform(1, 4), 1),
                'top_threat': random.choice(['cyclone', 'bushfire', 'earthquake'])
            }
        },
        'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    }

def get_mock_historical_data(metric, period, aggregation):
    """Generate historical data for charts."""
    random.seed(42)
    
    days = {'7d': 7, '30d': 30, '1y': 365}.get(period, 30)
    values = []
    
    now = datetime.now(timezone.utc)
    for i in range(days):
        date = now - timedelta(days=days - i - 1)
        
        if metric == 'earthquakes':
            count = random.randint(80, 200)
            avg_mag = round(random.uniform(2.5, 4.0), 1)
            max_mag = round(random.uniform(4.0, 7.5), 1)
            values.append({'date': date.strftime('%Y-%m-%d'), 'count': count, 'avg_magnitude': avg_mag, 'max_magnitude': max_mag})
        elif metric == 'temperature':
            anomaly = round(random.uniform(-1.5, 2.5), 1)
            global_avg = round(14.0 + anomaly, 1)
            values.append({'date': date.strftime('%Y-%m-%d'), 'anomaly': anomaly, 'global_avg': global_avg})
        else:
            count = random.randint(5, 50)
            values.append({'date': date.strftime('%Y-%m-%d'), 'count': count})
    
    return {
        'metric': metric,
        'period': period,
        'aggregation': aggregation,
        'values': values
    }

# ===== Geocode Mock =====

def reverse_geocode_mock(lat, lon):
    """Simple reverse geocode based on coordinates."""
    # Very simplified - just return coordinate info
    regions = [
        {'name': 'North America', 'lat_range': (15, 75), 'lon_range': (-170, -50)},
        {'name': 'South America', 'lat_range': (-60, 15), 'lon_range': (-90, -30)},
        {'name': 'Europe', 'lat_range': (35, 75), 'lon_range': (-15, 45)},
        {'name': 'Africa', 'lat_range': (-40, 40), 'lon_range': (-20, 55)},
        {'name': 'Asia', 'lat_range': (5, 80), 'lon_range': (45, 180)},
        {'name': 'Oceania', 'lat_range': (-50, 0), 'lon_range': (110, 180)},
    ]
    
    region_name = 'Unknown Region'
    for region in regions:
        if (region['lat_range'][0] <= lat <= region['lat_range'][1] and 
            region['lon_range'][0] <= lon <= region['lon_range'][1]):
            region_name = region['name']
            break
    
    return {
        'lat': round(lat, 4),
        'lon': round(lon, 4),
        'name': f'Location ({lat:.2f}, {lon:.2f})',
        'country': 'Unknown',
        'country_code': 'XX',
        'region': region_name,
        'timezone': 'UTC'
    }
