import time
from flask import Blueprint, request, jsonify
from ..services.fallback import search_mock_data

search_bp = Blueprint('search', __name__)

@search_bp.route('/search', methods=['GET'])
def search():
    query = request.args.get('q', '')
    search_type = request.args.get('type', 'all')
    limit = min(int(request.args.get('limit', 20)), 100)
    
    if not query or len(query) < 2:
        return jsonify({
            'success': True,
            'data': {'query': query, 'results': []}
        })
    
    results = search_mock_data(query, search_type, limit)
    
    return jsonify({
        'success': True,
        'data': {
            'query': query,
            'results': results
        },
        'meta': {'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    })
