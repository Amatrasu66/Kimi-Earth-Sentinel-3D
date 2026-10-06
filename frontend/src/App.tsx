import { useState, useCallback, useEffect, useRef } from 'react';
import EarthRenderer from '@/components/globe/EarthRenderer';
import type { RendererInfo } from '@/components/globe/EarthRenderer';
import TopNav from '@/components/panels/TopNav';
import LayerPanel from '@/components/panels/LayerPanel';
import DataPanel from '@/components/panels/DataPanel';
import BottomBar from '@/components/panels/BottomBar';
import SettingsModal from '@/components/panels/SettingsModal';
import Tooltip from '@/components/overlays/Tooltip';
import { useLayers, useLayerData } from '@/hooks/useLayers';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
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
  const [rendererInfo, setRendererInfo] = useState<RendererInfo>({
    active: 'loading',
    detail: 'probing WebGPU support…',
    textures: { loaded: 0, total: 0 },
  });
  const { layers } = useLayers();
  const {
    data: layerData,
    loading: layerLoading,
    error: layerError,
    dataStatus,
    refetch,
  } = useLayerData(activeLayer, { limit: 500 });
  const eventRequestId = useRef(0);
  const eventAbortRef = useRef<AbortController | null>(null);
  const flyToKey = useRef(0);

  useEffect(() => {
    return () => {
      eventAbortRef.current?.abort();
    };
  }, []);

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
  const handleLayerToggle = useCallback(
    (layerId: LayerId) => {
      const next = activeLayer === layerId ? null : layerId;
      setActiveLayer(next);
      if (next === null) {
        setAllDataPoints([]);
        setSelectedEvent(null);
        setEventDetail(null);
      }
    },
    [activeLayer],
  );

  // Handle marker click — race-safe: a slower response for event A can
  // never overwrite the details of a newer selection B (Phase 15).
  // In-flight detail fetches are aborted so rapid clicks don't pile up.
  const handleMarkerClick = useCallback(
    async (point: DataPoint) => {
      const id = ++eventRequestId.current;
      eventAbortRef.current?.abort();
      const controller = new AbortController();
      eventAbortRef.current = controller;
      setSelectedEvent(point);
      setEventDetail(null);
      setEventDetailLoading(true);

      try {
        const detail = await api.getEvent(point.id, { signal: controller.signal });
        if (eventRequestId.current !== id || controller.signal.aborted) return;
        setEventDetail(detail);
      } catch (err) {
        if (eventRequestId.current !== id || controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
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
    eventAbortRef.current?.abort();
    setActiveLayer(null);
    setSelectedEvent(null);
    setEventDetail(null);
    setEventDetailLoading(false);
    setAllDataPoints([]);
  }, []);

  // Handle back to layer view
  const handleBackToLayer = useCallback(() => {
    eventRequestId.current += 1;
    eventAbortRef.current?.abort();
    setSelectedEvent(null);
    setEventDetail(null);
    setEventDetailLoading(false);
  }, []);

  // Keyboard shortcuts (ignored while typing in inputs)
  useKeyboardShortcuts({
    shortcutLayers: SHORTCUT_LAYERS,
    toggleLayer: handleLayerToggle,
    backToLayer: handleBackToLayer,
    closePanel: handleClosePanel,
    closeSettings: () => setIsSettingsOpen(false),
    toggleRotation: () => setIsRotating((prev) => !prev),
    hasSelection: selectedEvent !== null,
    hasActiveLayer: activeLayer !== null,
    isSettingsOpen,
  });

  // "?" opens settings (not part of the layer/rotation shortcut map).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="dark h-dvh w-screen overflow-hidden" style={{ background: '#050607' }}>
      {/* Skip link for keyboard users */}
      <a
        href="#sentinel-data-panel"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-16 focus:z-[300] focus:rounded-md focus:bg-[#FFC31F] focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-black"
      >
        Skip to data panel
      </a>
      {/* 3D Globe - Full viewport background (WebGPU Earth, WebGL fallback) */}
      <EarthRenderer
        activeLayer={activeLayer}
        dataPoints={allDataPoints}
        onMarkerClick={handleMarkerClick}
        onMarkerHover={handleMarkerHover}
        isRotating={isRotating}
        flyTo={flyTo}
        onActiveRenderer={setRendererInfo}
      />

      {/* UI Overlays */}
      <TopNav
        onSearchResultClick={handleSearchResultClick}
        onSettingsClick={() => setIsSettingsOpen(true)}
        dataStatus={dataStatus}
        activeLayerName={activeLayerMeta?.name ?? null}
      />

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
        rendererInfo={rendererInfo}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isRotating={isRotating}
        onToggleRotation={() => setIsRotating((prev) => !prev)}
        rendererInfo={rendererInfo}
        activeLayer={activeLayer}
        dataStatus={dataStatus}
      />

      <Tooltip point={hoveredPoint} mousePos={mousePos} activeLayer={activeLayer} />
    </div>
  );
}

export default App;
