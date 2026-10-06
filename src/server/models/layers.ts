/**
 * Layer metadata — port of backend/app/models/layer.py.
 */
export interface LayerMetadata {
  id: string;
  name: string;
  description: string;
  icon: string;
  source: string;
  refresh_interval: number;
  enabled: boolean;
  color_scale?: string[] | null;
  unit?: string | null;
}

export const LAYERS: LayerMetadata[] = [
  {
    id: "earthquakes",
    name: "Earthquakes",
    description: "Real-time seismic activity from USGS",
    icon: "layer-earthquakes",
    source: "usgs",
    refresh_interval: 300,
    enabled: true,
    color_scale: ["#FFC31F", "#FF8C00", "#FF4500", "#FF0000"],
  },
  {
    id: "disasters",
    name: "Natural Disasters",
    description: "Natural disaster events from NASA EONET & GDACS",
    icon: "layer-disasters",
    source: "nasa_eonet",
    refresh_interval: 600,
    enabled: true,
  },
  {
    id: "wildfires",
    name: "Wildfires",
    description: "Active fire detections from NASA FIRMS",
    icon: "layer-wildfires",
    source: "nasa_firms",
    refresh_interval: 600,
    enabled: true,
    color_scale: ["#FF6B35", "#FF4500", "#FF0000", "#8B0000"],
  },
  {
    id: "temperature",
    name: "Temperature",
    description: "Global temperature anomalies and readings",
    icon: "layer-temperature",
    source: "open_meteo",
    refresh_interval: 3600,
    enabled: true,
    unit: "celsius",
    color_scale: ["#0000FF", "#00FFFF", "#00FF00", "#FFFF00", "#FF0000"],
  },
  {
    id: "precipitation",
    name: "Precipitation",
    description: "Global precipitation data",
    icon: "layer-precipitation",
    source: "open_meteo",
    refresh_interval: 3600,
    enabled: true,
    unit: "mm",
    color_scale: ["#E0F7FA", "#4FC3F7", "#0288D1", "#01579B", "#0D47A1"],
  },
  {
    id: "air_quality",
    name: "Air Quality",
    description: "Real-time Air Quality Index",
    icon: "layer-airquality",
    source: "airnow",
    refresh_interval: 1800,
    enabled: true,
    unit: "AQI",
    color_scale: ["#00E400", "#FFFF00", "#FF7E00", "#FF0000", "#8F3F97", "#7E0023"],
  },
  {
    id: "clouds",
    name: "Cloud Cover",
    description: "Global cloud coverage",
    icon: "layer-clouds",
    source: "open_meteo",
    refresh_interval: 1800,
    enabled: true,
    unit: "%",
    color_scale: ["#FFFFFF00", "#FFFFFF40", "#FFFFFF80", "#FFFFFFBF", "#FFFFFFFF"],
  },
  {
    id: "wind",
    name: "Wind",
    description: "Global wind speed at 10m",
    icon: "layer-wind",
    source: "open_meteo",
    refresh_interval: 1800,
    enabled: true,
    unit: "km/h",
    color_scale: ["#E0F7FA", "#80DEEA", "#26C6DA", "#00838F", "#004D40"],
  },
];

export function getLayer(layerId: string): LayerMetadata | null {
  return LAYERS.find((l) => l.id === layerId) ?? null;
}

export function getAllLayers(): LayerMetadata[] {
  return LAYERS;
}
