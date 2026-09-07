from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

@dataclass
class LayerMetadata:
    id: str
    name: str
    description: str
    icon: str
    source: str
    refresh_interval: int
    enabled: bool = True
    color_scale: Optional[List[str]] = None
    unit: Optional[str] = None
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "source": self.source,
            "refresh_interval": self.refresh_interval,
            "enabled": self.enabled,
            "color_scale": self.color_scale,
            "unit": self.unit
        }

# Predefined layers
LAYERS = [
    LayerMetadata(
        id="earthquakes",
        name="Earthquakes",
        description="Real-time seismic activity from USGS",
        icon="layer-earthquakes",
        source="usgs",
        refresh_interval=300,
        color_scale=["#FFC31F", "#FF8C00", "#FF4500", "#FF0000"]
    ),
    LayerMetadata(
        id="disasters",
        name="Natural Disasters",
        description="Natural disaster events from NASA EONET & GDACS",
        icon="layer-disasters",
        source="nasa_eonet",
        refresh_interval=600
    ),
    LayerMetadata(
        id="wildfires",
        name="Wildfires",
        description="Active fire detections from NASA FIRMS",
        icon="layer-wildfires",
        source="nasa_firms",
        refresh_interval=600,
        color_scale=["#FF6B35", "#FF4500", "#FF0000", "#8B0000"]
    ),
    LayerMetadata(
        id="temperature",
        name="Temperature",
        description="Global temperature anomalies and readings",
        icon="layer-temperature",
        source="open_meteo",
        refresh_interval=3600,
        unit="celsius",
        color_scale=["#0000FF", "#00FFFF", "#00FF00", "#FFFF00", "#FF0000"]
    ),
    LayerMetadata(
        id="precipitation",
        name="Precipitation",
        description="Global precipitation data",
        icon="layer-precipitation",
        source="open_meteo",
        refresh_interval=3600,
        unit="mm",
        color_scale=["#E0F7FA", "#4FC3F7", "#0288D1", "#01579B", "#0D47A1"]
    ),
    LayerMetadata(
        id="air_quality",
        name="Air Quality",
        description="Real-time Air Quality Index",
        icon="layer-airquality",
        source="airnow",
        refresh_interval=1800,
        unit="AQI",
        color_scale=["#00E400", "#FFFF00", "#FF7E00", "#FF0000", "#8F3F97", "#7E0023"]
    ),
    LayerMetadata(
        id="clouds",
        name="Cloud Cover",
        description="Global cloud coverage",
        icon="layer-clouds",
        source="open_meteo",
        refresh_interval=1800,
        unit="%",
        color_scale=["#FFFFFF00", "#FFFFFF40", "#FFFFFF80", "#FFFFFFBF", "#FFFFFFFF"]
    ),
]

def get_layer(layer_id: str) -> Optional[LayerMetadata]:
    for layer in LAYERS:
        if layer.id == layer_id:
            return layer
    return None

def get_all_layers() -> List[LayerMetadata]:
    return LAYERS
