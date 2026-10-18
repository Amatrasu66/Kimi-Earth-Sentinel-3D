'use client';

/**
 * CesiumJS Earth — fourth renderer branch, Phase 2 proof of concept.
 *
 * Selected with `?renderer=cesium` (see `rendererMode.ts`); mounted only
 * through `EarthRenderer`'s `next/dynamic(..., { ssr: false })` boundary, so
 * the Cesium runtime never enters the server graph or the initial route.
 *
 * Contract: accepts the shared globe props (same names as the legacy
 * branches) plus one documented PoC extension, `onCoordinatePick`, which
 * reports validated click-to-coordinate picks. Phase 3 adds the
 * scientific-visual baseline (uniform lighting, theme background/base
 * color), the optional geographic reference grid (one native
 * `GridImageryProvider` layer, toggled by `show` — never rebuilt), the
 * low-power MSAA mapping, and a unit-tested fly-to resolver. Phase 4 adds
 * the imagery layer manager (registry, provider factory, base replacement,
 * opacity). Phase 5 syncs the active layer's observations as billboard
 * entities with hover/click parity (the corresponding props are now live;
 * `isRotating` and `sunDirection` stay intentionally unused — auto-rotate
 * and sun wiring are deferred, not silently broken). Phase 6 draws Sentinel
 * catalogue footprints as ground-polygon entities with click-to-select
 * routing (observations outrank footprints; both outrank the ellipsoid
 * coordinate readout). Phase 7 adds the resolved scene-raster overlay —
 * one per-scene tiled layer from Microsoft Planetary Computer, validated
 * before construction, swapped add-then-remove, with bounded tile retries.
 *
 * Lifecycle guarantees:
 * - `cesium` is imported dynamically inside the mount effect, after
 *   `window.CESIUM_BASE_URL` is set — never at module scope.
 * - A per-mount `cancelled` flag drops late async completions (StrictMode
 *   double-mount creates exactly one Viewer; the abandoned pass builds
 *   nothing and destroys nothing).
 * - Teardown destroys the ScreenSpaceEventHandler, removes the imagery
 *   error listener, and destroys the Viewer exactly once.
 * - Imagery failure is recoverable and never destroys a working Viewer;
 *   it surfaces through `onActiveRenderer` detail text instead.
 */
import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { isValidCoordinate } from '@/lib/geo';
import { getForcedRenderer } from '@/lib/webgpu';
import {
  CESIUM_BASE_URL,
  CESIUM_GLOBE_BASE_COLOR,
  CESIUM_HOME_VIEW,
  CESIUM_SCENE_BACKGROUND_COLOR,
  DEFAULT_MAXIMUM_SCREEN_SPACE_ERROR,
  FULL_MSAA_SAMPLES,
  FULL_RESOLUTION_SCALE,
  GLOBE_ENABLE_LIGHTING,
  LOW_POWER_MAXIMUM_SCREEN_SPACE_ERROR,
  LOW_POWER_MSAA_SAMPLES,
  LOW_POWER_RESOLUTION_SCALE,
  loadCesiumRuntime,
  resolveFlyToView,
} from './cesiumConfig';
import {
  createBaseImageryProvider,
  createGraticuleProvider,
} from './cesiumImageryProviders';
import {
  OBSERVATION_CLICK_DRAG_THRESHOLD_PX,
  createMarkerSprite,
  createObservationSyncState,
  disposeObservationEntities,
  pickObservationAt,
  syncObservationEntities,
} from './cesiumObservations';
import type { ObservationSyncState } from './cesiumObservations';
import {
  createFootprintSyncState,
  disposeFootprintEntities,
  pickFootprintAt,
  syncFootprintEntities,
} from './cesiumFootprints';
import type { FootprintSyncState } from './cesiumFootprints';
import {
  clampLayerOpacity,
  resolveBaseLayerId,
} from './imageryLayers';
import {
  SCENE_RASTER_MAX_TILE_RETRIES,
  createSceneRasterImageryProvider,
} from './cesiumSceneRaster';
import type { GlobeMode } from './rendererMode';
import type { DataPoint, LayerId, SceneRasterDescriptor, SceneSummary } from '@/types';
import type {
  Cartesian2,
  Cartesian3,
  ImageryLayer as CesiumImageryLayer,
  Viewer as CesiumViewer,
  ScreenSpaceEventHandler as CesiumScreenSpaceHandler,
} from 'cesium';

export interface CesiumEarthProps {
  activeLayer: LayerId | null;
  dataPoints: DataPoint[];
  onMarkerClick: (point: DataPoint) => void;
  onMarkerHover: (point: DataPoint | null) => void;
  isRotating?: boolean;
  /** Search fly-to target; `key` retriggers. Null = no flight. */
  flyTo?: { lat: number; lon: number; key: number } | null;
  /**
   * Authoritative world-space sun direction (shared contract). Accepted for
   * contract parity; not wired to the Cesium sun in this PoC (Phase 4+).
   */
  sunDirection?: [number, number, number];
  /** Low-power mode: resolution scale + coarser LOD + MSAA off. */
  lowPowerActive?: boolean;
  /**
   * Phase 3 §10: optional geographic reference grid on the Cesium globe
   * (persisted preference; ignored by the legacy branches).
   */
  globeGridVisible?: boolean;
  /**
   * Phase 4: validated base-imagery selection (`null` = established
   * default). Unknown ids resolve to the default; only supported,
   * verified layers are ever constructed.
   */
  baseLayerId?: string | null;
  /**
   * Phase 4: effective base-imagery opacity (0–1). Applied to the live
   * layer's `alpha` without recreating the provider.
   */
  baseOpacity?: number;
  /**
   * Phase 4: effective graticule opacity (0–1). Applied to the live
   * layer's `alpha` without recreating the provider.
   */
  gridOpacity?: number;
  onActiveRenderer?: (info: {
    active: GlobeMode | 'loading';
    detail: string;
    textures: { loaded: number; total: number };
    frames?: number;
    source: 'forced' | 'automatic';
  }) => void;
  /**
   * PoC extension (Phase 2 §11.1): validated globe-surface picks in the
   * application's lat/lon convention. Empty-space clicks and invalid picks
   * never invoke it.
   */
  onCoordinatePick?: (lat: number, lon: number) => void;
  /**
   * Phase 4: base-layer failure reports (`null` on recovery). The Viewer
   * keeps the previous working layer; this message feeds the Settings
   * layer-manager status so the failure is visible and recoverable.
   */
  onLayerError?: (message: string | null) => void;
  /**
   * Phase 4: parent-owned layer error (mirrors the latest `onLayerError`
   * report). Owned by the caller — not component state — so the Settings
   * status and the diagnostics detail text can never disagree, and the
   * switch effect below never calls setState synchronously.
   */
  layerError?: string | null;
  /**
   * Phase 6: Sentinel catalogue footprints to draw as ground polygons
   * (id-diffed sync; empty array clears them). Ignored before init.
   */
  footprints?: SceneSummary[];
  /** Phase 6: scene whose footprint is highlighted (`null` = none). */
  selectedSceneId?: string | null;
  /**
   * Phase 6: footprint pick from a click on a drawn footprint (after the
   * observation-priority rule misses). Absent/undefined = no routing.
   */
  onSceneSelect?: (scene: SceneSummary) => void;
  /**
   * Phase 7: resolved scene-raster descriptor to draw as a dedicated
   * overlay layer (`null` = none). Added above the base imagery, below the
   * graticule; the previous raster stays until the replacement is
   * attached. Descriptors are re-validated before construction — an
   * invalid one reports and keeps the previous map.
   */
  sceneRaster?: SceneRasterDescriptor | null;
  /** Phase 7: display attribution for the raster's Cesium credit. */
  sceneRasterCredit?: string | null;
  /**
   * Phase 7: scene-raster failure reports (`null` on recovery or when the
   * raster is removed). Tile failures are reported once per layer
   * generation; the previous map remains visible.
   */
  onSceneRasterError?: (message: string | null) => void;
}

type CesiumPhase = 'loading' | 'ready' | 'error';

const VEIL_CLASS =
  'absolute inset-0 flex items-center justify-center bg-[#020202] text-[13px] tracking-[0.02em] text-white/50';

function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}

export default function CesiumEarth({
  activeLayer: _activeLayer,
  dataPoints,
  onMarkerClick,
  onMarkerHover,
  isRotating: _isRotating = true,
  flyTo = null,
  sunDirection: _sunDirection,
  lowPowerActive = false,
  globeGridVisible = false,
  baseLayerId = null,
  baseOpacity = 1,
  gridOpacity = 1,
  onActiveRenderer,
  onCoordinatePick,
  onLayerError,
  layerError = null,
  footprints = [],
  selectedSceneId = null,
  onSceneSelect,
  sceneRaster = null,
  sceneRasterCredit = null,
  onSceneRasterError,
}: CesiumEarthProps) {
  void _activeLayer;
  // Phase 5 defers O5 auto-rotate parity: the toggle stays a no-op on this
  // path by explicit decision (not silent breakage).
  void _isRotating;
  void _sunDirection;

  const [phase, setPhase] = useState<CesiumPhase>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageryDegraded, setImageryDegraded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const gridLayerRef = useRef<CesiumImageryLayer | null>(null);
  // Phase 5: live observation-entity sync state (id → entity/point).
  // Owned here, never serialized, disposed on unmount.
  const obsStateRef = useRef<ObservationSyncState | null>(null);
  // Phase 6: live footprint-entity sync state (same ownership contract).
  const footprintStateRef = useRef<FootprintSyncState | null>(null);
  const spriteRef = useRef<HTMLCanvasElement | string | null>(null);
  // Phase 4: live base layer + the id it was built for. Replacements are
  // add-then-remove (never a blank globe) keyed off these refs.
  const baseLayerRef = useRef<CesiumImageryLayer | null>(null);
  const activeBaseIdRef = useRef<string | null>(null);
  const detachBaseErrorRef = useRef<(() => void) | null>(null);
  // Phase 7: live scene-raster layer + its generation key, same
  // add-then-remove contract as the base layer.
  const rasterLayerRef = useRef<CesiumImageryLayer | null>(null);
  const activeRasterKeyRef = useRef<string | null>(null);
  const detachRasterErrorRef = useRef<(() => void) | null>(null);
  const rasterErrorCountRef = useRef(0);
  const cesiumRef = useRef<typeof import('cesium') | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Latest callbacks/flags for async handlers without re-subscribing.
  const callbackRef = useRef({
    onActiveRenderer,
    onCoordinatePick,
    onMarkerClick,
    onMarkerHover,
    onLayerError,
    onSceneSelect,
    onSceneRasterError,
    lowPowerActive,
    globeGridVisible,
    baseLayerId,
    baseOpacity,
    gridOpacity,
    dataPoints,
    footprints,
    selectedSceneId,
  });
  useEffect(() => {
    callbackRef.current = {
      onActiveRenderer,
      onCoordinatePick,
      onMarkerClick,
      onMarkerHover,
      onLayerError,
      onSceneSelect,
      onSceneRasterError,
      lowPowerActive,
      globeGridVisible,
      baseLayerId,
      baseOpacity,
      gridOpacity,
      dataPoints,
      footprints,
      selectedSceneId,
    };
  });

  // Mount-once Viewer lifecycle (StrictMode-safe via `cancelled`).
  useEffect(() => {
    let cancelled = false;
    let viewer: CesiumViewer | null = null;
    let clickHandler: CesiumScreenSpaceHandler | null = null;
    let gridLayer: CesiumImageryLayer | null = null;
    let baseImageryLayer: CesiumImageryLayer | null = null;
    // Hover-throttle frame id (effect scope so unmount can cancel it).
    let hoverRaf = 0;

    (async () => {
      try {
        // Base URL before the Cesium module evaluates worker/asset paths.
        (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL =
          CESIUM_BASE_URL;
        const cesium = await loadCesiumRuntime();
        if (cancelled) return;
        cesiumRef.current = cesium;
        const container = containerRef.current;
        if (!container) return;

        // Phase 4: the initial base goes through the same validated
        // factory as later replacements (unknown ids resolve to the
        // verified default — never a veil, never an arbitrary URL).
        const initialBaseId = resolveBaseLayerId(callbackRef.current.baseLayerId);
        const baseProvider = createBaseImageryProvider(cesium, initialBaseId);
        baseImageryLayer = new cesium.ImageryLayer(baseProvider);
        baseImageryLayer.alpha = clampLayerOpacity(callbackRef.current.baseOpacity);

        viewer = new cesium.Viewer(container, {
          // Token-free base: explicit GIBS layer instead of the default
          // ion world imagery (which would require an access token).
          baseLayer: baseImageryLayer,
          // Ellipsoid terrain: no external token, never fatal when optional
          // terrain data is unavailable.
          terrainProvider: new cesium.EllipsoidTerrainProvider(),
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          projectionPicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          vrButton: false,
          infoBox: false,
          selectionIndicator: false,
        });

        const lowPower = callbackRef.current.lowPowerActive;
        viewer.resolutionScale = lowPower
          ? LOW_POWER_RESOLUTION_SCALE
          : FULL_RESOLUTION_SCALE;
        viewer.scene.globe.maximumScreenSpaceError = lowPower
          ? LOW_POWER_MAXIMUM_SCREEN_SPACE_ERROR
          : DEFAULT_MAXIMUM_SCREEN_SPACE_ERROR;
        viewer.scene.msaaSamples = lowPower
          ? LOW_POWER_MSAA_SAMPLES
          : FULL_MSAA_SAMPLES;

        viewer.camera.setView({
          destination: cesium.Cartesian3.fromDegrees(
            CESIUM_HOME_VIEW.longitudeDegrees,
            CESIUM_HOME_VIEW.latitudeDegrees,
            CESIUM_HOME_VIEW.heightMeters,
          ),
        });

        // Phase 3 §9 visual baseline: uniform lighting (no day/night
        // terminator — legibility first, and no implied real-time sun),
        // app-matched space background, and a neutral base color instead
        // of Cesium's default navy for not-yet-streamed imagery.
        viewer.scene.globe.enableLighting = GLOBE_ENABLE_LIGHTING;
        viewer.scene.backgroundColor = cesium.Color.fromCssColorString(
          CESIUM_SCENE_BACKGROUND_COLOR,
        );
        viewer.scene.globe.baseColor = cesium.Color.fromCssColorString(
          CESIUM_GLOBE_BASE_COLOR,
        );

        // Phase 5: observation entities. One shared sprite (tinted per
        // severity by the billboard color), id-keyed sync state, initial
        // sync from the latest props.
        spriteRef.current = createMarkerSprite();
        obsStateRef.current = createObservationSyncState();
        syncObservationEntities({
          viewer,
          cesium,
          sprite: spriteRef.current,
          state: obsStateRef.current,
          points: callbackRef.current.dataPoints,
        });

        // Phase 6: catalogue footprints — same ownership contract as the
        // observation sync (created once here, prop-synced below).
        footprintStateRef.current = createFootprintSyncState();
        syncFootprintEntities({
          viewer,
          cesium,
          state: footprintStateRef.current,
          scenes: callbackRef.current.footprints,
          selectedId: callbackRef.current.selectedSceneId,
        });

        // Click, hover, and coordinate picking: canvas-only handlers, so
        // dashboard controls never reach them.
        // - Phase 5 parity: LEFT_DOWN/LEFT_UP with the legacy 6 px drag
        //   rule (a drag is never a click); entity hit → selection,
        //   entity miss → ellipsoid coordinate readout (Phase 2 contract).
        // - Hover is rAF-throttled like the WebGL branch (at most one
        //   pick per frame); a miss clears the hover like both branches.
        clickHandler = new cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        const activeViewer = viewer;
        let downPosition: Cartesian2 | null = null;
        let hoverPending: Cartesian2 | null = null;
        const flushHover = () => {
          hoverRaf = 0;
          const position = hoverPending;
          hoverPending = null;
          if (!position || !obsStateRef.current) return;
          const hovered = pickObservationAt(
            activeViewer,
            obsStateRef.current,
            position,
          );
          // Footprints get pointer feedback too (no hover card — selection
          // is click-driven, so only the cursor changes).
          let footprintHovered = false;
          if (!hovered) {
            const fpState = footprintStateRef.current;
            footprintHovered = fpState
              ? pickFootprintAt(activeViewer, fpState, position) !== null
              : false;
          }
          try {
            activeViewer.scene.canvas.style.cursor =
              hovered || footprintHovered ? 'pointer' : 'grab';
          } catch {
            // Canvas styling is best-effort during teardown.
          }
          callbackRef.current.onMarkerHover(hovered);
        };
        clickHandler.setInputAction(
          (movement: { position?: Cartesian2 }) => {
            downPosition = movement?.position ?? null;
          },
          cesium.ScreenSpaceEventType.LEFT_DOWN,
        );
        clickHandler.setInputAction(
          (movement: { position?: Cartesian2 }) => {
            const up = movement?.position ?? null;
            const down = downPosition;
            downPosition = null;
            if (!up || !down) return;
            if (
              Math.hypot(up.x - down.x, up.y - down.y) >
              OBSERVATION_CLICK_DRAG_THRESHOLD_PX
            ) {
              return;
            }
            const syncState = obsStateRef.current;
            const observed = syncState
              ? pickObservationAt(activeViewer, syncState, up)
              : null;
            if (observed) {
              callbackRef.current.onMarkerClick(observed);
              return;
            }
            // Phase 6 priority: observations outrank footprints, footprints
            // outrank the ellipsoid readout (each hit short-circuits).
            const footprintState = footprintStateRef.current;
            const footprint = footprintState
              ? pickFootprintAt(activeViewer, footprintState, up)
              : null;
            if (footprint) {
              callbackRef.current.onSceneSelect?.(footprint);
              return;
            }
            const pick = callbackRef.current.onCoordinatePick;
            if (!pick) return;
            // Camera-space pick against the ellipsoid (terrain is not
            // configured, so ellipsoid height is never claimed).
            const cartesian: Cartesian3 | undefined =
              activeViewer.camera.pickEllipsoid(
                up,
                activeViewer.scene.globe.ellipsoid,
              );
            if (!cartesian) return;
            const cartographic = cesium.Cartographic.fromCartesian(cartesian);
            if (!cartographic) return;
            const lat = cesium.Math.toDegrees(cartographic.latitude);
            const lon = cesium.Math.toDegrees(cartographic.longitude);
            if (!isValidCoordinate(lat, lon)) return;
            pick(lat, lon);
          },
          cesium.ScreenSpaceEventType.LEFT_UP,
        );
        clickHandler.setInputAction(
          (movement: { position?: Cartesian2 }) => {
            hoverPending = movement?.position ?? null;
            if (hoverRaf !== 0) return;
            if (typeof requestAnimationFrame === 'function') {
              hoverRaf = requestAnimationFrame(flushHover);
            } else {
              // Non-rAF environments (unit tests): synchronous parity path.
              flushHover();
            }
          },
          cesium.ScreenSpaceEventType.MOUSE_MOVE,
        );

        // Phase 3 §10: graticule as a native imagery layer — created once
        // per Viewer (never per render); `show` is the visibility toggle,
        // and `viewer.destroy()` disposes the layer with the Viewer.
        // (Phase 4: construction lives in the provider factory.)
        const gridProvider = createGraticuleProvider(cesium);
        gridLayer = viewer.imageryLayers.addImageryProvider(gridProvider);
        gridLayer.show = callbackRef.current.globeGridVisible;
        gridLayer.alpha = clampLayerOpacity(callbackRef.current.gridOpacity);

        // Recoverable: tile failures degrade the status line, never destroy
        // a working Viewer or blank the globe. Tracked in a ref so base
        // replacements re-attach it to the current provider.
        detachBaseErrorRef.current?.();
        detachBaseErrorRef.current = baseProvider.errorEvent.addEventListener(() => {
          if (!cancelled) setImageryDegraded(true);
        });

        viewerRef.current = viewer;
        gridLayerRef.current = gridLayer;
        baseLayerRef.current = baseImageryLayer;
        activeBaseIdRef.current = initialBaseId;
        if (!cancelled) {
          setPhase('ready');
          // A fresh Viewer is healthy until proven otherwise: clear any
          // stale failure carried over from a previous mount.
          callbackRef.current.onLayerError?.(null);
        } else {
          viewer.destroy();
          viewerRef.current = null;
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(describeError(err));
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      cesiumRef.current = null;
      try {
        if (hoverRaf !== 0 && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(hoverRaf);
        }
      } catch {
        // Frame cancellation is best-effort during unmount.
      }
      hoverRaf = 0;
      try {
        clickHandler?.destroy();
      } catch {
        // Teardown must never throw; a half-initialized handler is dropped.
      }
      try {
        detachBaseErrorRef.current?.();
      } catch {
        // Listener removal is best-effort during unmount.
      }
      detachBaseErrorRef.current = null;
      try {
        detachRasterErrorRef.current?.();
      } catch {
        // Listener removal is best-effort during unmount.
      }
      detachRasterErrorRef.current = null;
      const owned = viewer;
      viewer = null;
      viewerRef.current = null;
      gridLayerRef.current = null;
      baseLayerRef.current = null;
      activeBaseIdRef.current = null;
      rasterLayerRef.current = null;
      activeRasterKeyRef.current = null;
      rasterErrorCountRef.current = 0;
      // Phase 5: entities outlive nothing — dispose before destroy, then
      // drop the state so a remount starts empty (StrictMode-safe).
      try {
        if (owned && !owned.isDestroyed() && obsStateRef.current) {
          disposeObservationEntities(owned, obsStateRef.current);
        }
      } catch {
        // Disposal is best-effort; Viewer destroy disposes the rest.
      }
      obsStateRef.current = null;
      spriteRef.current = null;
      // Phase 6: footprints obey the same ownership contract.
      try {
        if (owned && !owned.isDestroyed() && footprintStateRef.current) {
          disposeFootprintEntities(owned, footprintStateRef.current);
        }
      } catch {
        // Disposal is best-effort; Viewer destroy disposes the rest.
      }
      footprintStateRef.current = null;
      if (owned && !owned.isDestroyed()) {
        owned.destroy();
      }
      // Hover parity (WebGL branch): leaving the globe clears the card.
      try {
        callbackRef.current.onMarkerHover(null);
      } catch {
        // Callbacks must never throw teardown.
      }
    };
    // Mount-once by design: prop sync uses the dedicated effects below.
  }, []);

  // Search fly-to: recenter at the current altitude; reduced motion jumps.
  // The camera plan is resolved by the pure, unit-tested `resolveFlyToView`
  // helper (Phase 3 §11.4). Synchronous: the runtime namespace is cached at
  // init, so no second dynamic import (and no flight before the Viewer
  // exists).
  useEffect(() => {
    const viewer = viewerRef.current;
    const cesium = cesiumRef.current;
    if (!viewer || viewer.isDestroyed() || !cesium || !flyTo) return;
    let currentHeightMeters = CESIUM_HOME_VIEW.heightMeters;
    try {
      const cartographic = cesium.Cartographic.fromCartesian(viewer.camera.position);
      if (cartographic && Number.isFinite(cartographic.height)) {
        currentHeightMeters = cartographic.height;
      }
    } catch {
      // Keep the deterministic fallback height.
    }
    const plan = resolveFlyToView({ target: flyTo, currentHeightMeters, reducedMotion });
    if (!plan) return;
    const destination = cesium.Cartesian3.fromDegrees(
      plan.longitudeDegrees,
      plan.latitudeDegrees,
      plan.heightMeters,
    );
    if (plan.animate) {
      viewer.camera.flyTo({
        destination,
        orientation: {
          heading: 0,
          pitch: cesium.Math.toRadians(-90),
        },
        duration: plan.durationSeconds,
      });
    } else {
      viewer.camera.setView({ destination });
    }
  }, [flyTo, reducedMotion]);

  // Low-power rendering policy (documented options only).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.resolutionScale = lowPowerActive
      ? LOW_POWER_RESOLUTION_SCALE
      : FULL_RESOLUTION_SCALE;
    viewer.scene.globe.maximumScreenSpaceError = lowPowerActive
      ? LOW_POWER_MAXIMUM_SCREEN_SPACE_ERROR
      : DEFAULT_MAXIMUM_SCREEN_SPACE_ERROR;
    // MSAA off in low power — `Scene.msaaSamples` is consumed by the
    // render loop's framebuffer creation (verified in 1.146.0).
    viewer.scene.msaaSamples = lowPowerActive
      ? LOW_POWER_MSAA_SAMPLES
      : FULL_MSAA_SAMPLES;
  }, [lowPowerActive]);

  // Phase 3 §10.3: grid visibility flips the existing layer's `show` flag —
  // never a second provider for a toggle.
  useEffect(() => {
    const layer = gridLayerRef.current;
    if (layer) layer.show = globeGridVisible;
  }, [globeGridVisible]);

  // Phase 5 (O1): observation sync. Every data change re-diffs entities by
  // stable point id — additions, removals, layer switches, and filter
  // updates all flow through here without touching the Viewer itself.
  // No-op before init and after destroy.
  useEffect(() => {
    const viewer = viewerRef.current;
    const cesium = cesiumRef.current;
    const syncState = obsStateRef.current;
    const sprite = spriteRef.current;
    if (!viewer || viewer.isDestroyed() || !cesium || !syncState || !sprite) return;
    syncObservationEntities({
      viewer,
      cesium,
      sprite,
      state: syncState,
      points: dataPoints,
    });
  }, [dataPoints]);

  // Phase 6: footprint sync — same id-diff pattern as observations. A
  // selection change repaints only the affected scenes' materials.
  useEffect(() => {
    const viewer = viewerRef.current;
    const cesium = cesiumRef.current;
    const syncState = footprintStateRef.current;
    if (!viewer || viewer.isDestroyed() || !cesium || !syncState) return;
    syncFootprintEntities({
      viewer,
      cesium,
      state: syncState,
      scenes: footprints,
      selectedId: selectedSceneId,
    });
  }, [footprints, selectedSceneId]);

  // Phase 7: scene-raster overlay lifecycle. Same add-then-remove contract
  // as the base layer: the previous raster is removed only after the
  // replacement is attached (never a blank globe), and any construction
  // failure keeps the previous map. The graticule is raised back above the
  // raster so the reference frame stays legible. Tile failures are
  // reported once per layer generation; after a bounded retry budget the
  // failing tile stops retrying (`error.retry = false`) so a broken
  // endpoint can never loop forever. `phase` participates in the deps so a
  // descriptor present at mount attaches once the Viewer is ready.
  useEffect(() => {
    const viewer = viewerRef.current;
    const cesium = cesiumRef.current;
    if (!viewer || viewer.isDestroyed() || !cesium) return;
    const report = callbackRef.current.onSceneRasterError;
    const want = sceneRaster;
    const key = want ? `${want.collection}|${want.item_id}` : null;
    if (key === activeRasterKeyRef.current) {
      // Same generation — nothing to swap. Recovery is acknowledged by a
      // real change (new scene or an off/on toggle), never by a re-render.
      return;
    }
    const previous = rasterLayerRef.current;

    const detach = () => {
      try {
        detachRasterErrorRef.current?.();
      } catch {
        // Listener removal is best-effort during replacement.
      }
      detachRasterErrorRef.current = null;
    };

    if (want === null) {
      detach();
      if (previous) {
        try {
          if (viewer.imageryLayers.contains(previous)) {
            viewer.imageryLayers.remove(previous, true);
          }
        } catch {
          // Removal is best-effort; the Viewer owns disposal on destroy.
        }
      }
      rasterLayerRef.current = null;
      activeRasterKeyRef.current = null;
      rasterErrorCountRef.current = 0;
      report?.(null);
      return;
    }

    let nextLayer: CesiumImageryLayer;
    try {
      const provider = createSceneRasterImageryProvider(
        cesium,
        want,
        sceneRasterCredit,
      );
      nextLayer = viewer.imageryLayers.addImageryProvider(provider);
      if (viewer.isDestroyed()) {
        // Torn down mid-replacement: drop the orphan so the swap cannot
        // leak a layer past the Viewer.
        try {
          if (viewer.imageryLayers.contains(nextLayer)) {
            viewer.imageryLayers.remove(nextLayer, true);
          }
        } catch {
          // Best-effort orphan cleanup during teardown.
        }
        return;
      }
      const grid = gridLayerRef.current;
      if (grid && viewer.imageryLayers.contains(grid)) {
        viewer.imageryLayers.raiseToTop(grid);
      }
      detach();
      rasterErrorCountRef.current = 0;
      detachRasterErrorRef.current = provider.errorEvent.addEventListener(
        (tileError) => {
          const err = tileError as { retry?: boolean; timesRetried?: number };
          if (
            typeof err.timesRetried === 'number' &&
            err.timesRetried >= SCENE_RASTER_MAX_TILE_RETRIES &&
            typeof err.retry === 'boolean'
          ) {
            err.retry = false;
          }
          rasterErrorCountRef.current += 1;
          if (rasterErrorCountRef.current === 1) {
            report?.(
              'Sentinel scene raster tiles are failing to load. The previous map remains visible.',
            );
          }
        },
      );
    } catch (err) {
      report?.(err instanceof Error ? err.message : 'Scene raster unavailable.');
      return;
    }
    if (previous && previous !== nextLayer) {
      try {
        if (viewer.imageryLayers.contains(previous)) {
          viewer.imageryLayers.remove(previous, true);
        }
      } catch {
        // Removal is best-effort; the Viewer owns disposal on destroy.
      }
    }
    rasterLayerRef.current = nextLayer;
    activeRasterKeyRef.current = key;
    report?.(null);
  }, [sceneRaster, sceneRasterCredit, phase]);

  // Phase 4: base-imagery replacement. Add-then-remove keeps the globe
  // covered during ordinary transitions (no blank frame); the old layer is
  // removed once the replacement is attached. Any construction or
  // attachment failure preserves the previous working layer and reports —
  // it never destroys the Viewer, never retries in a loop, and never
  // misrepresents stale imagery as fresh.
  useEffect(() => {
    const viewer = viewerRef.current;
    const cesium = cesiumRef.current;
    if (!viewer || viewer.isDestroyed() || !cesium) return;
    const wantedId = resolveBaseLayerId(baseLayerId);
    if (wantedId === activeBaseIdRef.current) {
      // Re-selecting the working layer acknowledges recovery: a stale
      // failure clears once the known-good selection is chosen again.
      // (Provider construction below is synchronous, so no generation
      // guard is needed — each selection completes before the next effect
      // can run. If initialization ever becomes asynchronous, a
      // generation guard must be added here first.)
      // Reporting (not setState): the error is parent-owned, so the
      // Settings status and this detail text stay consistent.
      callbackRef.current.onLayerError?.(null);
      return;
    }
    const report = callbackRef.current.onLayerError;

    let nextProvider: ReturnType<typeof createBaseImageryProvider>;
    try {
      nextProvider = createBaseImageryProvider(cesium, wantedId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Base imagery unavailable';
      report?.(message);
      return;
    }

    try {
      const next = viewer.imageryLayers.addImageryProvider(nextProvider);
      if (viewer.isDestroyed()) {
        // Torn down mid-replacement: drop the orphan so the switch
        // cannot leak a layer past the Viewer.
        try {
          if (viewer.imageryLayers.contains(next)) {
            viewer.imageryLayers.remove(next, true);
          }
        } catch {
          // Best-effort orphan cleanup during teardown.
        }
        return;
      }
      // The base stays at the bottom by construction; overlays render above.
      viewer.imageryLayers.lowerToBottom(next);
      next.alpha = clampLayerOpacity(callbackRef.current.baseOpacity);
      const previous = baseLayerRef.current;
      try {
        detachBaseErrorRef.current?.();
      } catch {
        // Best-effort during replacement.
      }
      detachBaseErrorRef.current = nextProvider.errorEvent.addEventListener(() => {
        setImageryDegraded(true);
      });
      if (previous && previous !== next) {
        try {
          if (viewer.imageryLayers.contains(previous)) {
            viewer.imageryLayers.remove(previous, true);
          }
        } catch {
          // Removal is best-effort; the Viewer owns disposal on destroy.
        }
      }
      baseLayerRef.current = next;
      activeBaseIdRef.current = wantedId;
      report?.(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Base imagery unavailable';
      report?.(message);
    }
  }, [baseLayerId]);

  // Phase 4: opacity follows the live layer's `alpha` — no provider
  // recreation for slider movement, no Viewer reinitialization.
  useEffect(() => {
    const layer = baseLayerRef.current;
    if (layer) layer.alpha = clampLayerOpacity(baseOpacity);
  }, [baseOpacity]);

  useEffect(() => {
    const layer = gridLayerRef.current;
    if (layer) layer.alpha = clampLayerOpacity(gridOpacity);
  }, [gridOpacity]);

  // Diagnostics reporting (same callback contract as the legacy branches).
  const forced = getForcedRenderer();
  const source = forced === 'cesium' ? 'forced' : 'automatic';
  const detail =
    phase === 'ready'
      ? layerError !== null
        ? `ready · ${layerError}`
        : imageryDegraded
          ? 'ready · GIBS imagery degraded (tile errors)'
          : 'ready · GIBS true-color (no token)'
      : phase === 'error'
        ? (errorMessage ?? 'initialization failed')
        : `initializing…${forced === 'cesium' ? ' (forced ?renderer=cesium)' : ''}`;
  const reportRef = useRef(onActiveRenderer);
  useEffect(() => {
    reportRef.current = onActiveRenderer;
  });
  useEffect(() => {
    reportRef.current?.({
      active: 'cesium',
      detail,
      textures: { loaded: 0, total: 0 },
      source: source as 'forced' | 'automatic',
    });
  }, [detail, source]);

  if (phase === 'error') {
    return (
      <div className="fixed left-0 top-0 z-[1] h-full w-full">
        <div role="alert" aria-label="Cesium Earth failed to initialize" className={VEIL_CLASS}>
          <div className="max-w-[320px] px-4 text-center">
            <p className="font-medium text-white/80">Cesium Earth unavailable</p>
            <p className="mt-1 break-words text-white/50">{errorMessage}</p>
            <p className="mt-2 text-white/40">
              Remove ?renderer=cesium from the URL to return to the default globe.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    // CSP-1: static fullscreen geometry as classes (same as legacy branches).
    <div className="fixed left-0 top-0 z-[1] h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {phase === 'loading' && (
        <div
          role="status"
          aria-label="Loading Cesium Earth renderer"
          className={VEIL_CLASS}
        >
          Loading Cesium Earth…
        </div>
      )}
    </div>
  );
}
