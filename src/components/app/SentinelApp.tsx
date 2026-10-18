"use client";

// Earth Sentinel 3D composition root (T3.17): focused app hooks (URL
// state, selection, focus, hint, shortcuts, fly-to, pending resolution)
// wired into the shell regions. Client-only; rendered by the server page.
// Data-fetch effects below sync API data into render state (the standard
// fetch-in-effect pattern) — exempt from set-state-in-effect.
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import dynamic from 'next/dynamic';
import EarthRenderer from '@/components/globe/EarthRenderer';
import type { RendererInfo } from '@/components/globe/EarthRenderer';
import AppShell from '@/components/shell/AppShell';
import AppHeader from '@/components/shell/AppHeader';
import LayerRail from '@/components/shell/LayerRail';
import GlobeStage from '@/components/shell/GlobeStage';
import ListStage from '@/components/shell/ListStage';
import LayerHint from '@/components/shell/LayerHint';
import StatusDock from '@/components/shell/StatusDock';
import DataPanel from '@/components/intelligence/DataPanel';
import SettingsModal from '@/components/panels/SettingsModal';
import MarkerHoverCard from '@/components/overlays/MarkerHoverCard';
import { useLayers, useLayerData, useIdlePrefetchLayer } from '@/hooks/useLayers';
import { useSceneSearch } from '@/hooks/useSceneSearch';
import { useSceneRaster } from '@/hooks/useSceneRaster';
import { useSunDirection } from '@/hooks/useSunDirection';
import { useKeyboardShortcuts, SHORTCUT_LAYERS } from '@/hooks/useKeyboardShortcuts';
import { useAppUrlState } from '@/components/app/useAppUrlState';
import { useEventSelection } from '@/components/app/useEventSelection';
import { useFocusRestore } from '@/components/app/useFocusRestore';
import { useFirstRunHint } from '@/components/app/useFirstRunHint';
import { useSingleKeyShortcuts } from '@/components/app/useSingleKeyShortcuts';
import { useLowPowerMode } from '@/components/app/useLowPowerMode';
import { useGlobeGrid } from '@/components/app/useGlobeGrid';
import { useImageryOpacity } from '@/components/app/useImageryOpacity';
import { useFlyTo } from '@/components/app/useFlyTo';
import { usePendingEventResolution } from '@/components/app/usePendingEventResolution';
import type { DataPoint, LayerId, SceneSummary } from '@/types';
import type { CommittedSceneQuery } from '@/components/panels/SceneSearchPanel';

// Phase 6: the scene-search panel is a lazy client-only chunk — the form +
// results UI leaves the initial route graph (200 KiB budget protection) and
// loads only when the user opens Scenes on the Cesium branch.
const SceneSearchPanel = dynamic(
  () => import('@/components/panels/SceneSearchPanel'),
  { ssr: false },
);

// Memoized renderer boundary so shell-only state (hover, search typing)
// never re-renders the 3D scene; the selection callbacks stay stable.
const StableEarthRenderer = memo(EarthRenderer);

function SentinelApp() {
  const { requestFocus, focusInDataSurface, focusWithin } = useFocusRestore();
  const { singleKeyShortcuts, setSingleKeyShortcuts } = useSingleKeyShortcuts();
  // T4.6: persisted Auto/On/Off preference; the resolved boolean fans out
  // to the dotted stage, the 3D selector (which remounts its branch on
  // flips), and the Settings Globe tab + diagnostics.
  const {
    preference: lowPowerPreference,
    setPreference: setLowPowerPreference,
    lowPowerActive,
  } = useLowPowerMode();
  // Phase 3 §10: persisted geographic-grid preference; only the Cesium
  // branch consumes it (the legacy renderers ignore the prop).
  const { globeGridVisible, setGlobeGridVisible } = useGlobeGrid();
  // Phase 4: persisted layer opacities (local-storage display preference;
  // the URL owns only the discrete base-layer selection below).
  const {
    baseOpacity,
    gridOpacity,
    setBaseOpacity,
    setGridOpacity,
  } = useImageryOpacity();
  const { hintDismissed, dismissHint } = useFirstRunHint(requestFocus);
  const { flyTo, flyToLocation } = useFlyTo();

  // Layer shared with selection (see useEventSelection): kept fresh every
  // commit so the failure fallback observes the current layer — even when
  // a deep-link resolves in the same flush — while the opener stays
  // stable. Declared here (not in render) and ordered before
  // usePendingEventResolution below so the mirror applies first.
  const activeLayerRef = useRef<LayerId | null>(null);
  const { selectedEvent, eventDetail, eventDetailLoading, selectEvent, clearSelection } =
    useEventSelection(activeLayerRef);

  const {
    activeLayer,
    searchQuery,
    severityFilter,
    view,
    pendingEventId,
    baseImagery,
    setActiveLayer,
    setSearchQuery,
    setSeverityFilter,
    setView,
    setBaseImagery,
    clearPendingEvent,
    dropPendingEventFromUrl,
  } = useAppUrlState({
    selectedEventId: selectedEvent?.id ?? null,
    clearEventSelection: clearSelection,
  });

  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  // Phase 2: last validated Cesium globe-surface pick (`?renderer=cesium`
  // only). Readout-only — it never selects an event; hover wins while set.
  const [pickedCoord, setPickedCoord] = useState<{ lat: number; lon: number } | null>(null);
  const handleCoordinatePick = useCallback((lat: number, lon: number) => {
    setPickedCoord({ lat, lon });
  }, []);
  // Phase 4: latest base-layer failure from the Cesium branch (`null` on
  // recovery). Display-only — the Viewer already kept the previous layer.
  const [imageryError, setImageryError] = useState<string | null>(null);
  const handleLayerError = useCallback((message: string | null) => {
    setImageryError(message);
  }, []);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(true);
  const [allDataPoints, setAllDataPoints] = useState<DataPoint[]>([]);
  // Phase 6: Sentinel scene search. The committed query owns the SWR key
  // (fantype changes fetch); the panel keeps its own draft form state.
  const [sceneSearchOpen, setSceneSearchOpen] = useState(false);
  const [sceneQuery, setSceneQuery] = useState<CommittedSceneQuery | null>(null);
  const [selectedScene, setSelectedScene] = useState<SceneSummary | null>(null);
  const sceneSearch = useSceneSearch(
    sceneQuery
      ? { bbox: sceneQuery.bbox, start: sceneQuery.start, end: sceneQuery.end, collection: sceneQuery.collection }
      : { bbox: null },
  );
  // Phase 7: raster availability resolves per selected scene (single
  // request, no polling); the explicit toggle below is the only way a
  // raster ever appears on the globe.
  const sceneRaster = useSceneRaster(selectedScene?.id ?? null);
  const [sceneRasterEnabled, setSceneRasterEnabled] = useState(false);
  const [sceneRasterLayerError, setSceneRasterLayerError] = useState<string | null>(null);
  const handleSceneRasterError = useCallback((message: string | null) => {
    setSceneRasterLayerError(message);
  }, []);
  const handleSceneRasterToggle = useCallback(() => {
    setSceneRasterEnabled((prev) => !prev);
  }, []);
  // Only a validated renderable resolution becomes a globe layer, and only
  // while the toggle is on (default off).
  const sceneRasterDescriptor =
    sceneRasterEnabled && sceneRaster.payload?.status === 'renderable'
      ? sceneRaster.payload.raster
      : null;

  // Phase 6 handlers: commit a search, resolve a footprint pick, clear.
  const handleSceneSearch = useCallback((query: CommittedSceneQuery) => {
    setSceneSearchOpen(true);
    setSceneQuery(query);
    setSelectedScene(null);
  }, []);
  const handleSceneSelect = useCallback((scene: SceneSummary) => {
    setSelectedScene(scene);
    setSceneSearchOpen(true);
  }, []);
  const handleSceneClear = useCallback(() => {
    // Committed query goes null → the hook fetches nothing → the globe
    // drains its footprint entities (and the SWR cache stays harmless).
    setSceneQuery(null);
    setSelectedScene(null);
  }, []);
  const handleScenePanelToggle = useCallback(() => {
    setSceneSearchOpen((prev) => !prev);
  }, []);
  const [rendererInfo, setRendererInfo] = useState<RendererInfo>({
    active: 'loading',
    detail: 'starting globe…',
    textures: { loaded: 0, total: 0 },
    source: 'automatic',
  });

  const { layers } = useLayers();
  const sunDirection = useSunDirection();
  const {
    data: layerData,
    loading: layerLoading,
    error: layerError,
    dataStatus,
    meta: layerDataMeta,
    refetch,
  } = useLayerData(activeLayer, { limit: 500 });
  // Server L1 bit for the provenance strip/chips (T3.7: CACHED reads only
  // this envelope bit — never SWR/client caching).
  const layerCacheHit = layerDataMeta.cacheHit;
  useIdlePrefetchLayer(activeLayer);
  const activeLayerMeta = layers.find((l) => l.id === activeLayer) || null;

  useEffect(() => {
    setAllDataPoints(layerData?.points ?? []);
  }, [layerData]);

  // Mirror the URL-owned layer for selection's failure fallback. Effect
  // (not render): runs every commit, ordered before the resolution hook
  // below so same-flush deep-link resolution observes the current layer.
  useEffect(() => {
    activeLayerRef.current = activeLayer;
  });

  // Deep-link event id resolves against loaded layer data (or drops).
  usePendingEventResolution({
    pendingEventId,
    selectedEventId: selectedEvent?.id ?? null,
    activeLayer,
    layerData,
    layerLoading,
    layerError,
    resolveEvent: selectEvent,
    clearPendingEvent,
    dropPendingEventFromUrl,
  });

  // Layer change clears the event selection: detail belonging to another
  // layer must never linger (T3.3 conflict rule). Points stay until fresh
  // data arrives (existing fetch behavior).
  const handleLayerToggle = useCallback(
    (layerId: LayerId) => {
      const next = activeLayer === layerId ? null : layerId;
      setActiveLayer(next);
      clearSelection();
      setPickedCoord(null);
      if (next === null) {
        setAllDataPoints([]);
      }
    },
    [activeLayer, setActiveLayer, clearSelection],
  );

  const handleClosePanel = useCallback(() => {
    const restoreFocus = focusInDataSurface();
    setActiveLayer(null);
    clearSelection();
    setPickedCoord(null);
    setAllDataPoints([]);
    if (restoreFocus) requestFocus('workspace');
  }, [focusInDataSurface, setActiveLayer, clearSelection, requestFocus]);

  const handleBackToLayer = useCallback(() => {
    const restoreFocus = focusInDataSurface();
    clearSelection();
    if (restoreFocus) requestFocus('panel');
  }, [focusInDataSurface, clearSelection, requestFocus]);

  // Settings is a controlled dialog with no Trigger, so Radix has nothing
  // to restore to — closing returns focus to the opener explicitly.
  const handleCloseSettings = useCallback(() => {
    const restoreFocus = focusWithin('[role="dialog"], [role="alertdialog"]');
    setIsSettingsOpen(false);
    if (restoreFocus) requestFocus('settings');
  }, [focusWithin, requestFocus]);

  // Shared layer-presentation contract: ListStage mirrors DataPanel's
  // props by design (T3.15), so one bundle feeds whichever surface is
  // active — globe panel or list stage. Drift between the two interfaces
  // fails typechecking here instead of rendering silently wrong props.
  const layerPresentationProps = {
    activeLayer,
    layerMeta: activeLayerMeta,
    dataPoints: allDataPoints,
    selectedEvent,
    eventDetail,
    eventDetailLoading,
    loading: layerLoading,
    error: layerError ? layerError.message : null,
    dataStatus,
    cacheHit: layerCacheHit,
    severityFilter,
    onSeverityChange: setSeverityFilter,
    onEventSelect: selectEvent,
    onRefresh: refetch,
    onClose: handleClosePanel,
    onBackToLayer: handleBackToLayer,
  };

  // Keyboard shortcuts (ignored while typing; owned by the hook).
  useKeyboardShortcuts({
    shortcutLayers: SHORTCUT_LAYERS,
    toggleLayer: handleLayerToggle,
    backToLayer: handleBackToLayer,
    closePanel: handleClosePanel,
    closeSettings: handleCloseSettings,
    openSettings: () => setIsSettingsOpen(true),
    toggleRotation: () => setIsRotating((prev) => !prev),
    hasSelection: selectedEvent !== null,
    hasActiveLayer: activeLayer !== null,
    isSettingsOpen,
    singleKeyShortcuts,
  });

  return (
    <div className="dark h-dvh w-screen overflow-hidden bg-[var(--sentinel-bg)]">
      {/* Skip link targets the primary data surface of the active view. */}
      <a
        href={view === 'list' ? '#sentinel-list-stage' : '#sentinel-data-panel'}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-16 focus:z-[300] focus:rounded-md focus:bg-sentinel-accent focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-black"
      >
        {view === 'list' ? 'Skip to event list' : 'Skip to data panel'}
      </a>
      {/* Globe renderers unmount in list mode (no hidden canvas in the
          accessibility tree); `?renderer=` is preserved and re-applies. */}
      {view === 'globe' && (
        <StableEarthRenderer
          activeLayer={activeLayer}
          dataPoints={allDataPoints}
          onMarkerClick={selectEvent}
          onMarkerHover={setHoveredPoint}
          isRotating={isRotating}
          flyTo={flyTo}
          sunDirection={sunDirection}
          lowPowerActive={lowPowerActive}
          globeGridVisible={globeGridVisible}
          baseLayerId={baseImagery}
          baseOpacity={baseOpacity}
          gridOpacity={gridOpacity}
          onActiveRenderer={setRendererInfo}
          onCoordinatePick={handleCoordinatePick}
          onLayerError={handleLayerError}
          layerError={imageryError}
          footprints={sceneSearch.scenes}
          selectedSceneId={selectedScene?.id ?? null}
          onSceneSelect={handleSceneSelect}
          sceneRaster={sceneRasterDescriptor}
          sceneRasterCredit={
            sceneRaster.payload?.status === 'renderable' ? sceneRaster.payload.attribution : null
          }
          onSceneRasterError={handleSceneRasterError}
        />
      )}

      {/* Composition grid: header / rail+stage+panel / status share one system */}
      <AppShell
        header={
          <AppHeader
            onSearchResultClick={flyToLocation}
            onSettingsClick={() => setIsSettingsOpen(true)}
            dataStatus={dataStatus}
            cacheHit={layerCacheHit}
            activeLayerName={activeLayerMeta?.name ?? null}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            singleKeyShortcuts={singleKeyShortcuts}
            view={view}
            onViewChange={setView}
          />
        }
        rail={
          <LayerRail
            activeLayer={activeLayer}
            onLayerToggle={handleLayerToggle}
            shortcutLayers={singleKeyShortcuts ? SHORTCUT_LAYERS : []}
          />
        }
        stage={
          view === 'list' ? (
            <ListStage {...layerPresentationProps} />
          ) : (
            <GlobeStage
              dataPoints={allDataPoints}
              onMarkerClick={selectEvent}
              onMarkerHover={setHoveredPoint}
              isRotating={isRotating}
              flyTo={flyTo}
              onActiveRenderer={setRendererInfo}
              lowPowerActive={lowPowerActive}
            />
          )
        }
        panel={
          // List mode: the stage is the primary presentation, so the panel
          // stands down entirely and no row is ever rendered twice. Phase 6:
          // the explicit Scenes toggle wins while it is open (otherwise a
          // pre-opened layer would swallow the click with no feedback);
          // closing it restores whichever panel was showing before.
          view === 'list'
            ? null
            : sceneSearchOpen ? (
            <SceneSearchPanel
              // Remount per committed query: a fresh search re-seeds the
              // draft form; ordinary re-renders keep the user's edits.
              key={
                sceneQuery
                  ? `${sceneQuery.bbox}|${sceneQuery.start ?? ''}|${sceneQuery.end ?? ''}|${sceneQuery.collection}`
                  : 'draft'
              }
              pickedCoord={pickedCoord}
              committedQuery={sceneQuery}
              results={{
                payload: sceneSearch.payload,
                loading: sceneSearch.loading,
                validating: sceneSearch.validating,
                error: sceneSearch.error ? sceneSearch.error.message : null,
                dataStatus: sceneSearch.dataStatus,
                cacheHit: sceneSearch.cacheHit,
              }}
              selectedScene={selectedScene}
              raster={{
                enabled: sceneRasterEnabled,
                // Only the selected scene's resolution is relevant; the hook
                // key is the selection, so a stale payload cannot leak.
                resolution: selectedScene ? sceneRaster.payload : null,
                loading: selectedScene ? sceneRaster.loading : false,
                error:
                  selectedScene && sceneRaster.error ? sceneRaster.error.message : null,
                layerError: sceneRasterLayerError,
                onToggle: handleSceneRasterToggle,
              }}
              onSearch={handleSceneSearch}
              onSelect={handleSceneSelect}
              onClear={handleSceneClear}
              onClose={() => setSceneSearchOpen(false)}
            />
            ) : activeLayer || selectedEvent ? (
          <DataPanel {...layerPresentationProps} />
            ) : null
        }
        status={
          <StatusDock
            coordinates={
              hoveredPoint ? { lat: hoveredPoint.lat, lon: hoveredPoint.lon } : pickedCoord
            }
            activeLayer={activeLayer}
            dataCount={allDataPoints.length}
            dataStatus={dataStatus}
            cacheHit={layerCacheHit}
            rendererInfo={rendererInfo}
            sceneSearchOpen={sceneSearchOpen}
            onToggleSceneSearch={handleScenePanelToggle}
          />
        }
      />

      {!hintDismissed && (
        <LayerHint
          onDismiss={dismissHint}
          activeLayerName={activeLayer ? (activeLayerMeta?.name ?? 'Live data') : null}
          singleKeyShortcuts={singleKeyShortcuts}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        isRotating={isRotating}
        onToggleRotation={() => setIsRotating((prev) => !prev)}
        rendererInfo={rendererInfo}
        activeLayer={activeLayer}
        dataStatus={dataStatus}
        cacheHit={layerCacheHit}
        singleKeyShortcuts={singleKeyShortcuts}
        onSingleKeyShortcutsChange={setSingleKeyShortcuts}
        lowPowerPreference={lowPowerPreference}
        onLowPowerPreferenceChange={setLowPowerPreference}
        lowPowerActive={lowPowerActive}
        globeGrid={globeGridVisible}
        onGlobeGridChange={setGlobeGridVisible}
        baseImagery={baseImagery}
        onBaseImageryChange={setBaseImagery}
        baseOpacity={baseOpacity}
        onBaseOpacityChange={setBaseOpacity}
        gridOpacity={gridOpacity}
        onGridOpacityChange={setGridOpacity}
        imageryError={imageryError}
      />

      <MarkerHoverCard point={hoveredPoint} activeLayer={activeLayer} />
    </div>
  );
}

export default SentinelApp;
