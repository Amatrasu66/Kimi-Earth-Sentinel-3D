import time
from flask import Blueprint, jsonify

imagery_bp = Blueprint('imagery', __name__)

@imagery_bp.route('/imagery/gibs/capabilities', methods=['GET'])
def get_gibs_capabilities():
    return jsonify({
        'success': True,
        'data': {
            'layers': [
                {
                    'id': 'MODIS_Terra_CorrectedReflectance_TrueColor',
                    'name': 'True Color',
                    'projection': 'geographic',
                    'format': 'image/jpeg',
                    'tilematrixset': '250m',
                    'zoom_levels': list(range(9))
                },
                {
                    'id': 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
                    'name': 'VIIRS True Color',
                    'projection': 'geographic',
                    'format': 'image/jpeg',
                    'tilematrixset': '250m',
                    'zoom_levels': list(range(9))
                },
                {
                    'id': 'MODIS_Terra_Brightness_Temp_Band31_Day',
                    'name': 'Temperature',
                    'projection': 'geographic',
                    'format': 'image/png',
                    'tilematrixset': '1km',
                    'zoom_levels': list(range(7))
                }
            ]
        }
    })

@imagery_bp.route('/imagery/gibs/tile/<layer>/<int:z>/<int:x>/<int:y>', methods=['GET'])
def get_gibs_tile(layer, z, x, y):
    # Proxy to NASA GIBS with redirect
    from flask import redirect
    gibs_url = f'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{layer}/default/{time.strftime("%Y-%m-%d")}/250m/{z}/{y}/{x}.jpeg'
    return redirect(gibs_url, code=302)
