import time
from flask import Blueprint, jsonify
from ..services.fallback import get_mock_event_detail

events_bp = Blueprint('events', __name__)

@events_bp.route('/events/<event_id>', methods=['GET'])
def get_event(event_id):
    # Try to get from cache/services, fallback to mock
    event = get_mock_event_detail(event_id)
    return jsonify({
        'success': True,
        'data': event,
        'meta': {'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    })
