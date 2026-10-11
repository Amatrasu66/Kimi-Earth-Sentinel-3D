"use client";

// Earth Sentinel 3D app shell — ported from the Vite frontend (frontend/src/App.tsx).
// Runs entirely on the client: globe renderers, hooks, and panels all depend
// on browser APIs. Rendered by the server-component page at src/app/page.tsx.
//
// Data-fetch/subscription effects below sync external API data into render
// state (the standard fetch-in-effect pattern) — exempt from
// set-state-in-effect, which targets derived-state syncs.
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import EarthRenderer from '@/components/globe/EarthRenderer';
import type { RendererInfo } from '@/components/globe/EarthRenderer';
import AppShell from '@/components/shell/AppShell';
import AppHeader from '@/components/shell/AppHeader';
import LayerRail from '@/components/shell/LayerRail';
import GlobeStage from '@/components/shell/GlobeStage';
import LayerHint from '@/components/shell/LayerHint';
import StatusDock from '@/components/shell/StatusDock';
import DataPanel from '@/components/intelligence/DataPanel';
import SettingsModal from '@/components/panels/SettingsModal';
import MarkerHoverCard from '@/components/overlays/MarkerHoverCard';
import { useLayers, useLayerData, useIdlePrefetchLayer } from '@/hooks/useLayers';
import { useSunDirection } from '@/hooks/useSunDirection';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { api } from '@/services/api';
import { isValidCoordinate } from '@/lib/geo';
import {
  parseAppUrl,
  serializeAppState,
  DEFAULT_FIRST_RUN_LAYER,
} from '@/lib/url-state';
import type { AppView } from '@/lib/url-state';
import type { DataPoint, LayerId, EventDetail } from '@/types';
import type { SeverityFilterValue } from '@/components/intelligence/SeverityFilter';
// (Global styles live in src/app/globals.css — App Router allows global CSS
// imports only from the root layout, so the old './App.css' import is gone;
// its contents were merged into globals.css verbatim.)

// T3.8 first-run hint dismissal persistence: one small versioned flag in
// browser storage, read/written only on the client (never during SSR).
// Failures (private mode, blocked storage) degrade to session-only memory.
const FIRST_RUN_HINT_STORAGE_KEY = 'sentinel:first-run-hint-dismissed:v1';

function readFirstRunHintDismissed(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(FIRST_RUN_HINT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFirstRunHintDismissed(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(FIRST_RUN_HINT_STORAGE_KEY, '1');
  } catch {
    /* storage unavailable — dismissal lasts for this session only */
  }
}

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

// Memoized renderer boundary: hover/selection state in this shell must never
// re-render the 3D scene. Props are referentially stable (data array identity
// only changes when fetched layer data changes; callbacks below are stable),
// so GlobeScene/WebGPUEarth skip re-renders on shell-only state updates.
const StableEarthRenderer = memo(EarthRenderer);

function SentinelApp() {
  const [activeLayer, setActiveLayer] = useState<LayerId | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<DataPoint | null>(null);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [eventDetailLoading, setEventDetailLoading] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(true);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [allDataPoints, setAllDataPoints] = useState<DataPoint[]>([]);
  // T3.3 URL-driven state: search text, severity display filter ('all' =
  // unfiltered default), and globe/list view ('globe' default; `list` shares
  // the same panel list — no dedicated toggle control yet, see docs).
  // Initial values are deterministic SSR-safe constants; the live URL is
  // applied once after mount (see the restore effect below).
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilterValue>('all');
  const [view, setView] = useState<AppView>('globe');
  // Validated event id awaiting resolvable layer data (mount + popstate set
  // it; the data-ready effect consumes it). State (not a ref) so arrival of
  // data reliably retriggers resolution.
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; key: number } | null>(null);
  const [rendererInfo, setRendererInfo] = useState<RendererInfo>({
    active: 'loading',
    detail: 'starting globe…',
    textures: { loaded: 0, total: 0 },
    source: 'automatic',
  });
  const { layers } = useLayers();
  // T2.4: one authoritative real-time sun direction (single 60 s client
  // timer inside the hook) shared by both renderer paths. The tuple identity
  // only changes once per minute, so the memoized renderer stays settled.
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
  // T3.6: conservative idle prefetch of the default-layer candidate (single
  // key, silent, cancelled on layer change — see useIdlePrefetchLayer).
  useIdlePrefetchLayer(activeLayer);
  const eventRequestId = useRef(0);
  const eventAbortRef = useRef<AbortController | null>(null);
  const flyToKey = useRef(0);
  // T3.3 URL machinery (all client-only; SSR never touches window/history):
  // - passthroughRef: unknown params (notably `renderer`) preserved verbatim.
  // - syncArmedRef/lastDiscreteRef: the sync effect skips its very first run
  //   (mount commit still holds pre-restore defaults — writing then would
  //   wipe the URL it is about to restore). Afterwards discrete navigations
  //   (layer/event/sev/view) push Back-restorable entries while query typing
  //   only replaces.
  const passthroughRef = useRef<[string, string][]>([]);
  const lastDiscreteRef = useRef('');
  const syncArmedRef = useRef(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    return () => {
      eventAbortRef.current?.abort();
    };
  }, []);

  const activeLayerMeta = layers.find((l) => l.id === activeLayer) || null;

  // Update data points when layer data changes (syncing fetched API data
  // into render state — the documented exception to set-state-in-effect).
  useEffect(() => {
    if (layerData?.points) {
      setAllDataPoints(layerData.points);
    } else {
      setAllDataPoints([]);
    }
  }, [layerData]);

  // Handle layer toggle. Any layer change clears the event selection:
  // detail belonging to another layer must never linger (T3.3 conflict
  // rule). Points stay until fresh data arrives (existing fetch behavior).
  const handleLayerToggle = useCallback(
    (layerId: LayerId) => {
      const next = activeLayer === layerId ? null : layerId;
      setActiveLayer(next);
      eventRequestId.current += 1;
      eventAbortRef.current?.abort();
      setSelectedEvent(null);
      setEventDetail(null);
      setEventDetailLoading(false);
      if (next === null) {
        setAllDataPoints([]);
      }
    },
    [activeLayer],
  );

  // Handle marker click — race-safe: a slower response for event A can
  // never overwrite the details of a newer selection B (Phase 15).
  // In-flight detail fetches are aborted so rapid clicks don't pile up.
  // Stable identity (activeLayer via ref) so the memoized renderer subtree
  // never re-renders just because this callback was recreated.
  const activeLayerRef = useRef(activeLayer);
  useEffect(() => {
    activeLayerRef.current = activeLayer;
  }, [activeLayer]);

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
          layer_id: activeLayerRef.current || 'unknown',
          type: point.type || activeLayerRef.current || 'event',
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
    [],
  );

  // Handle marker hover — hovered data stays in shell state (status dock
  // coordinates + hover card content); cursor-follow position now lives
  // inside MarkerHoverCard so pointer movement never re-renders this tree.
  const handleMarkerHover = useCallback((point: DataPoint | null) => {
    setHoveredPoint(point);
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

  // T3.8: one-time first-run hint dismissal, persisted client-only.
  const handleHintDismiss = useCallback(() => {
    setHintDismissed(true);
    writeFirstRunHintDismissed();
  }, []);

  // ---- T3.3 URL-driven state (client-only; SSR output stays deterministic) ----

  // Apply one parsed URL to state. Runs once at mount and on every popstate
  // (browser Back/Forward). Invalid values never reach state (parseAppUrl
  // drops them); a validated event id becomes pending until loaded layer
  // data can resolve it to a real point — or it is dropped, never fabricated.
  //
  // T3.8: on the initial mount only (`applyDefaultLayer`), an absent or
  // invalid `?layer=` resolves to the owner-locked default (earthquakes)
  // through this same path, so rail, title, panel, URL, dock and markers
  // stay consistent and data loads via the existing useLayerData hook.
  // Popstate restores exactly what the URL says (null stays null) so an
  // explicit close/panel-dismiss is never resurrected by history travel.
  const applyUrlState = useCallback((search: string, opts?: { applyDefaultLayer?: boolean }) => {
    const parsed = parseAppUrl(search);
    passthroughRef.current = parsed.passthrough;
    const layer = parsed.state.layer ?? (opts?.applyDefaultLayer ? DEFAULT_FIRST_RUN_LAYER : null);
    setActiveLayer(layer);
    setSearchQuery(parsed.state.q);
    setSeverityFilter(parsed.state.sev);
    setView(parsed.state.view);
    eventRequestId.current += 1;
    eventAbortRef.current?.abort();
    setSelectedEvent(null);
    setEventDetail(null);
    setEventDetailLoading(false);
    setPendingEventId(parsed.state.event);
    // Canonicalize invalid leftovers without history spam (mount junk URLs
    // and hand-edited addresses collapse to the valid subset in place).
    // With the first-run default this also records `?layer=earthquakes`
    // for a bare entry URL via replace (no extra history entry, no loop:
    // re-serializing the applied state is a fixed point).
    const canonical = serializeAppState({ ...parsed.state, layer }, parsed.passthrough);
    if (canonical !== search) {
      window.history.replaceState(null, '', canonical || window.location.pathname);
    }
  }, []);

  // Mount-only restore: the live URL is external state, so it is read here —
  // never during render — keeping SSR markup deterministic (same exemption
  // as StatusDock's clock and the T2.4 sun hook). The persisted hint
  // dismissal is read here for the same reason (no storage during SSR).
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    applyUrlState(window.location.search, { applyDefaultLayer: true });
    if (readFirstRunHintDismissed()) {
      setHintDismissed(true);
    }
  }, [applyUrlState]);

  // Resolve a pending event id once its layer's data can answer it. An
  // explicit user selection always wins over a pending restore. Resolution
  // reads the payload for THIS layer only: right after a layer switch the
  // previous layer's payload is still present while the new fetch is in
  // flight (layer_id mismatch), and that must wait — never resolve-or-drop
  // against stale points.
  useEffect(() => {
    if (!pendingEventId || selectedEvent) {
      return;
    }
    if (!activeLayer || layerLoading) return;
    const fresh = layerData && layerData.layer_id === activeLayer ? layerData : null;
    if (!fresh && !layerError) return;
    const point = (fresh?.points ?? []).find((p) => p.id === pendingEventId) ?? null;
    setPendingEventId(null);
    if (point) {
      void handleMarkerClick(point);
    } else {
      // Unresolvable (stale id, wrong layer, unavailable data): drop it from
      // the URL with a replace so history stays honest — never fabricate.
      const canonical = serializeAppState(
        { layer: activeLayer, event: null, q: searchQuery, sev: severityFilter, view },
        passthroughRef.current,
      );
      window.history.replaceState(null, '', canonical || window.location.pathname);
    }
  }, [pendingEventId, selectedEvent, activeLayer, layerData, layerError, layerLoading, handleMarkerClick, searchQuery, severityFilter, view]);

  // Synchronize state back to the URL (shareable, restorable). Writes only
  // when the canonical form differs from the live URL — after popstate the
  // state was just derived from the URL, so this skips and cannot loop.
  // Discrete navigations push (Back-restorable) while query typing replaces.
  useEffect(() => {
    const eventId = selectedEvent?.id ?? pendingEventId;
    const discrete = `${activeLayer ?? ''}|${eventId ?? ''}|${severityFilter}|${view}`;
    if (!syncArmedRef.current) {
      syncArmedRef.current = true;
      lastDiscreteRef.current = discrete;
      return;
    }
    const canonical = serializeAppState(
      { layer: activeLayer, event: eventId, q: searchQuery, sev: severityFilter, view },
      passthroughRef.current,
    );
    const current = window.location.search;
    if (canonical === current) {
      lastDiscreteRef.current = discrete;
      return;
    }
    const push = discrete !== lastDiscreteRef.current;
    lastDiscreteRef.current = discrete;
    const target = canonical || window.location.pathname;
    if (push) window.history.pushState(null, '', target);
    else window.history.replaceState(null, '', target);
  }, [activeLayer, selectedEvent, pendingEventId, searchQuery, severityFilter, view]);

  // Browser Back/Forward: re-apply the URL that the browser navigated to.
  // pushState/replaceState above never fire popstate, so this only runs for
  // genuine history traversals — no cycles with the sync effect.
  useEffect(() => {
    const onPopState = () => {
      applyUrlState(window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyUrlState]);

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
    <div className="dark h-dvh w-screen overflow-hidden" style={{ background: 'var(--sentinel-bg)' }}>
      {/* Skip link for keyboard users */}
      <a
        href="#sentinel-data-panel"
         className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-16 focus:z-[300] focus:rounded-md focus:bg-sentinel-accent focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-black"
      >
        Skip to data panel
      </a>
      {/* 3D Globe - Full viewport background (WebGPU Earth, WebGL fallback) */}
      <StableEarthRenderer
        activeLayer={activeLayer}
        dataPoints={allDataPoints}
        onMarkerClick={handleMarkerClick}
        onMarkerHover={handleMarkerHover}
        isRotating={isRotating}
        flyTo={flyTo}
        sunDirection={sunDirection}
        onActiveRenderer={setRendererInfo}
      />

      {/* Composition grid: header / rail+stage+panel / status share one system */}
      <AppShell
        header={
          <AppHeader
            onSearchResultClick={handleSearchResultClick}
            onSettingsClick={() => setIsSettingsOpen(true)}
            dataStatus={dataStatus}
            cacheHit={layerCacheHit}
            activeLayerName={activeLayerMeta?.name ?? null}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        }
        rail={<LayerRail activeLayer={activeLayer} onLayerToggle={handleLayerToggle} shortcutLayers={SHORTCUT_LAYERS} />}
        stage={
          <GlobeStage
            dataPoints={allDataPoints}
            onMarkerClick={handleMarkerClick}
            onMarkerHover={handleMarkerHover}
            isRotating={isRotating}
            flyTo={flyTo}
            onActiveRenderer={setRendererInfo}
          />
        }
        panel={
          activeLayer || selectedEvent ? (
          <DataPanel
            activeLayer={activeLayer}
            layerMeta={activeLayerMeta}
            dataPoints={allDataPoints}
            selectedEvent={selectedEvent}
            eventDetail={eventDetail}
            eventDetailLoading={eventDetailLoading}
            loading={layerLoading}
            error={layerError ? layerError.message : null}
            dataStatus={dataStatus}
            cacheHit={layerCacheHit}
            onClose={handleClosePanel}
            onBackToLayer={handleBackToLayer}
            onEventSelect={handleMarkerClick}
            onRefresh={refetch}
            severityFilter={severityFilter}
            onSeverityChange={setSeverityFilter}
          />
          ) : null
        }
        status={
          <StatusDock
            coordinates={hoveredPoint ? { lat: hoveredPoint.lat, lon: hoveredPoint.lon } : null}
            activeLayer={activeLayer}
            dataCount={allDataPoints.length}
            dataStatus={dataStatus}
            cacheHit={layerCacheHit}
            rendererInfo={rendererInfo}
          />
        }
      />

      {!hintDismissed && (
        <LayerHint
          onDismiss={handleHintDismiss}
          activeLayerName={activeLayer ? (activeLayerMeta?.name ?? 'Live data') : null}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isRotating={isRotating}
        onToggleRotation={() => setIsRotating((prev) => !prev)}
        rendererInfo={rendererInfo}
        activeLayer={activeLayer}
        dataStatus={dataStatus}
        cacheHit={layerCacheHit}
      />

      <MarkerHoverCard point={hoveredPoint} activeLayer={activeLayer} />
    </div>
  );
}

export default SentinelApp;
