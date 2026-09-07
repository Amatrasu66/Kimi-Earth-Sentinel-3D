from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime

@dataclass
class EventPoint:
    id: str
    lat: float
    lon: float
    layer_id: str
    timestamp: str
    severity: str = "low"
    title: str = ""
    description: str = ""
    value: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self):
        return {
            "id": self.id,
            "lat": self.lat,
            "lon": self.lon,
            "layer_id": self.layer_id,
            "timestamp": self.timestamp,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "value": self.value,
            **self.metadata
        }

@dataclass
class EventDetail:
    id: str
    layer_id: str
    type: str
    title: str
    lat: float
    lon: float
    timestamp: str
    description: str = ""
    severity: str = "low"
    source: Dict[str, str] = field(default_factory=dict)
    impact: Dict[str, Any] = field(default_factory=dict)
    related_events: List[Dict[str, str]] = field(default_factory=list)
    geometry: Optional[Dict[str, Any]] = None
    
    def to_dict(self):
        return {
            "id": self.id,
            "layer_id": self.layer_id,
            "type": self.type,
            "title": self.title,
            "lat": self.lat,
            "lon": self.lon,
            "timestamp": self.timestamp,
            "description": self.description,
            "severity": self.severity,
            "source": self.source,
            "impact": self.impact,
            "related_events": self.related_events,
            "geometry": self.geometry
        }
