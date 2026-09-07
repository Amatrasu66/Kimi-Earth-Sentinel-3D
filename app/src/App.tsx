import { useState, useCallback, useEffect, useRef } from 'react';
import GlobeScene from '@/components/globe/GlobeScene';
import TopNav from '@/components/panels/TopNav';
import LayerPanel from '@/components/panels/LayerPanel';
import DataPanel from '@/components/panels/DataPanel';
import BottomBar from '@/components/panels/BottomBar';
import SettingsModal from '@/components/panels/SettingsModal';
import Tooltip from '@/components/overlays/Tooltip';
import { useLayers, useLayerData } from '@/hooks/useLayers';
import { api } from '@/services/api';
import { isValidCoordinate } from '@/lib/geo';
import type { DataPoint, LayerId, EventDetail } from '@/types';
import './App.css';

// Keyboard shortcut order (1-8). Preserved from the prototype, extended
// with wildfires now that the backend serves it.
const SHORTCUT_LAYERS: LayerId[] = [
  'temperature',
  'precipitation',
  'clouds',
  'wind',
  'earthquakes',
  'disasters',
  'air_quality',
  'wildfires',
];

function App() {
  const [activeLayer, setActiveLayer] = useState<LayerId | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<DataPoint | null>(null);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [eventDetailLoading, setEventDetailLoading] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(true);
  const [allDataPoints, setAllDataPoints] = useState<DataPoint[]>([]);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; key: number } | null>(null);
  const { layers } = useLayers();
  const {
    data: layerData,
    loading: layerLoading,
    error: layerError,
    dataStatus,
    refetch,
  } = useLayerData(activeLayer, { limit: 500 });
  const eventRequestId = useRef(0);
  const flyToKey = useRef(0);

  const activeLayerMeta = layers.find((l) => l.id === activeLayer) || null;

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
    setActiveLayer((prev) => {
      const next = prev === layerId ? null : layerId;
      if (next === null) {
        setAllDataPoints([]);
        setSelectedEvent(null);
        setEventDetail(null);
      }
      return next;
    });
  }, []);

  // Handle marker click — race-safe: a slower response for event A can
  // never overwrite the details of a newer selection B (Phase 15).
  const handleMarkerClick = useCallback(
    async (point: DataPoint) => {
      const id = ++eventRequestId.current;
      setSelectedEvent(point);
      setEventDetail(null);
      setEventDetailLoading(true);

      try {
        const detail = await api.getEvent(point.id);
        if (eventRequestId.current !== id) return;
        setEventDetail(detail);
      } catch {
        if (eventRequestId.current !== id) return;
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
      } finally {
        if (eventRequestId.current === id) setEventDetailLoading(false);
      }
    },
    [activeLayer],
  );

  // Handle marker hover
  const handleMarkerHover = useCallback((point: DataPoint | null) => {
    setHoveredPoint(point);
  }, []);

  // Tooltip position: throttle window mousemove through rAF so hovering
  // the globe doesn't re-render the whole app on every pointer event.
  useEffect(() => {
    let raf = 0;
    let latest = { x: 0, y: 0 };
    const flush = () => {
      raf = 0;
      setMousePos(latest);
    };
    const handleMouseMove = (e: MouseEvent) => {
      latest = { x: e.clientX, y: e.clientY };
      if (raf === 0) raf = requestAnimationFrame(flush);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Handle search result click — fly the globe to the location (Phase 4).
  const handleSearchResultClick = useCallback((lat: number, lon: number) => {
    if (!isValidCoordinate(lat, lon)) return;
    flyToKey.current += 1;
    setFlyTo({ lat, lon, key: flyToKey.current });
  }, []);

  // Handle close data panel
  const handleClosePanel = useCallback(() => {
    eventRequestId.current += 1; // invalidate any in-flight detail fetch
    setActiveLayer(null);
    setSelectedEvent(null);
    setEventDetail(null);
    setEventDetailLoading(false);
    setAllDataPoints([]);
  }, []);

  // Handle back to layer view
  const handleBackToLayer = useCallback(() => {
    eventRequestId.current += 1;
    setSelectedEvent(null);
    setEventDetail(null);
    setEventDetailLoading(false);
  }, []);

  // Keyboard shortcuts (ignored while typing in inputs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) {
        if (e.key === 'Escape') (target as HTMLElement).blur();
        return;
      }

      // Number keys 1-8 for layers
      if (e.key >= '1' && e.key <= '8') {
        const idx = parseInt(e.key) - 1;
        if (SHORTCUT_LAYERS[idx]) {
          handleLayerToggle(SHORTCUT_LAYERS[idx]);
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
        setIsRotating((prev) => !prev);
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
        flyTo={flyTo}
      />

      {/* UI Overlays */}
      <TopNav onSearchResultClick={handleSearchResultClick} onSettingsClick={() => setIsSettingsOpen(true)} />

      <LayerPanel activeLayer={activeLayer} onLayerToggle={handleLayerToggle} shortcutLayers={SHORTCUT_LAYERS} />

      <DataPanel
        activeLayer={activeLayer}
        layerMeta={activeLayerMeta}
        dataPoints={allDataPoints}
        selectedEvent={selectedEvent}
        eventDetail={eventDetail}
        eventDetailLoading={eventDetailLoading}
        loading={layerLoading}
        error={layerError}
        dataStatus={dataStatus}
        onClose={handleClosePanel}
        onBackToLayer={handleBackToLayer}
        onEventSelect={handleMarkerClick}
        onRefresh={refetch}
      />

      <BottomBar
        coordinates={hoveredPoint ? { lat: hoveredPoint.lat, lon: hoveredPoint.lon } : null}
        activeLayer={activeLayer}
        dataCount={allDataPoints.length}
        dataStatus={dataStatus}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isRotating={isRotating}
        onToggleRotation={() => setIsRotating((prev) => !prev)}
      />

      <Tooltip point={hoveredPoint} mousePos={mousePos} activeLayer={activeLayer} />
    </div>
  );
}

export default App;
