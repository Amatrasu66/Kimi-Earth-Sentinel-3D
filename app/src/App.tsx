import { useState, useCallback, useEffect } from 'react';
import GlobeScene from '@/components/globe/GlobeScene';
import TopNav from '@/components/panels/TopNav';
import LayerPanel from '@/components/panels/LayerPanel';
import DataPanel from '@/components/panels/DataPanel';
import BottomBar from '@/components/panels/BottomBar';
import SettingsModal from '@/components/panels/SettingsModal';
import Tooltip from '@/components/overlays/Tooltip';
import { useLayers, useLayerData } from '@/hooks/useLayers';
import { api } from '@/services/api';
import type { DataPoint, LayerId, EventDetail } from '@/types';
import './App.css';

function App() {
  const [activeLayer, setActiveLayer] = useState<LayerId | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<DataPoint | null>(null);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(true);
  const [allDataPoints, setAllDataPoints] = useState<DataPoint[]>([]);
  const { layers } = useLayers();
  const { data: layerData, loading: layerLoading, refetch } = useLayerData(activeLayer, { limit: 500 });

  const activeLayerMeta = layers.find(l => l.id === activeLayer) || null;

  // Update data points when layer data changes
  useEffect(() => {
    if (layerData?.points) {
      setAllDataPoints(layerData.points);
    } else {
      setAllDataPoints([]);
    }
  }, [layerData]);

  // Handle layer toggle
  const handleLayerToggle = useCallback((layerId: LayerId) => {
    setActiveLayer(prev => {
      const next = prev === layerId ? null : layerId;
      if (next === null) {
        setAllDataPoints([]);
        setSelectedEvent(null);
      }
      return next;
    });
  }, []);

  // Handle marker click
  const handleMarkerClick = useCallback(async (point: DataPoint) => {
    setSelectedEvent(point);
    
    // Fetch event details
    try {
      const detail = await api.getEvent(point.id);
      setEventDetail(detail);
    } catch {
      // If API fails, create detail from point data
      setEventDetail({
        id: point.id,
        layer_id: activeLayer || 'unknown',
        type: point.type || activeLayer || 'event',
        title: point.title || 'Unknown Event',
        lat: point.lat,
        lon: point.lon,
        timestamp: point.timestamp,
        description: point.description || '',
        severity: point.severity,
        magnitude: point.magnitude,
        depth: point.depth,
      });
    }
  }, [activeLayer]);

  // Handle marker hover
  const handleMarkerHover = useCallback((point: DataPoint | null) => {
    setHoveredPoint(point);
  }, []);

  // Handle mouse move for tooltip positioning
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Handle search result click
  const handleSearchResultClick = useCallback((lat: number, lon: number) => {
    // This will be handled by the GlobeScene - we'll implement camera fly
    // For now, just log it
    console.log('Fly to:', lat, lon);
  }, []);

  // Handle close data panel
  const handleClosePanel = useCallback(() => {
    setActiveLayer(null);
    setSelectedEvent(null);
    setEventDetail(null);
    setAllDataPoints([]);
  }, []);

  // Handle back to layer view
  const handleBackToLayer = useCallback(() => {
    setSelectedEvent(null);
    setEventDetail(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Number keys 1-7 for layers
      if (e.key >= '1' && e.key <= '7') {
        const layerIds: LayerId[] = ['temperature', 'precipitation', 'clouds', 'wind', 'earthquakes', 'disasters', 'air_quality'];
        const idx = parseInt(e.key) - 1;
        if (layerIds[idx]) {
          handleLayerToggle(layerIds[idx]);
        }
      }
      
      // ESC to close
      if (e.key === 'Escape') {
        if (selectedEvent) {
          handleBackToLayer();
        } else if (activeLayer) {
          handleClosePanel();
        } else if (isSettingsOpen) {
          setIsSettingsOpen(false);
        }
      }
      
      // Space to pause rotation
      if (e.key === ' ') {
        e.preventDefault();
        setIsRotating(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLayer, selectedEvent, isSettingsOpen, handleLayerToggle, handleBackToLayer, handleClosePanel]);

  return (
    <div className="w-screen h-screen overflow-hidden" style={{ background: '#020202' }}>
      {/* 3D Globe - Full viewport background */}
      <GlobeScene
        activeLayer={activeLayer}
        dataPoints={allDataPoints}
        onMarkerClick={handleMarkerClick}
        onMarkerHover={handleMarkerHover}
        isRotating={isRotating}
      />

      {/* UI Overlays */}
      <TopNav 
        onSearchResultClick={handleSearchResultClick}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <LayerPanel 
        activeLayer={activeLayer}
        onLayerToggle={handleLayerToggle}
      />

      <DataPanel
        activeLayer={activeLayer}
        layerMeta={activeLayerMeta}
        dataPoints={allDataPoints}
        selectedEvent={selectedEvent}
        eventDetail={eventDetail}
        loading={layerLoading}
        onClose={handleClosePanel}
        onBackToLayer={handleBackToLayer}
        onEventSelect={handleMarkerClick}
        onRefresh={refetch}
      />

      <BottomBar 
        coordinates={hoveredPoint ? { lat: hoveredPoint.lat, lon: hoveredPoint.lon } : null}
        activeLayer={activeLayer}
        dataCount={allDataPoints.length}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isRotating={isRotating}
        onToggleRotation={() => setIsRotating(prev => !prev)}
      />

      <Tooltip point={hoveredPoint} mousePos={mousePos} />
    </div>
  );
}

export default App;
