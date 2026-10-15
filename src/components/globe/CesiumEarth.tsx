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
 * low-power MSAA mapping, and a unit-tested fly-to resolver. Marker/entity
 * sync and sun wiring stay Phase 4+ work (see §18 of the Phase 2 prompt):
 * the corresponding props are accepted but intentionally unused here so
 * the shared contract does not fork.
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
  CESIUM_GRID_CELLS,
  CESIUM_GRID_GLOW_COLOR,
  CESIUM_GRID_LINE_ALPHA,
  CESIUM_GRID_LINE_COLOR,
  CESIUM_HOME_VIEW,
  CESIUM_SCENE_BACKGROUND_COLOR,
  DEFAULT_MAXIMUM_SCREEN_SPACE_ERROR,
  FULL_MSAA_SAMPLES,
  FULL_RESOLUTION_SCALE,
  GIBS_CREDIT_TEXT,
  GIBS_FORMAT,
  GIBS_LAYER_ID,
  GIBS_MAXIMUM_LEVEL,
  GIBS_STYLE,
  GIBS_TILE_MATRIX_SET_ID,
  GIBS_WMTS_URL,
  GLOBE_ENABLE_LIGHTING,
  LOW_POWER_MAXIMUM_SCREEN_SPACE_ERROR,
  LOW_POWER_MSAA_SAMPLES,
  LOW_POWER_RESOLUTION_SCALE,
  buildGibsTimeDimension,
  loadCesiumRuntime,
  resolveFlyToView,
} from './cesiumConfig';
import type { GlobeMode } from './rendererMode';
import type { DataPoint, LayerId } from '@/types';
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
  dataPoints: _dataPoints,
  onMarkerClick: _onMarkerClick,
  onMarkerHover: _onMarkerHover,
  isRotating: _isRotating = true,
  flyTo = null,
  sunDirection: _sunDirection,
  lowPowerActive = false,
  globeGridVisible = false,
  onActiveRenderer,
  onCoordinatePick,
}: CesiumEarthProps) {
  void _activeLayer;
  void _dataPoints;
  void _onMarkerClick;
  void _onMarkerHover;
  void _isRotating;
  void _sunDirection;

  const [phase, setPhase] = useState<CesiumPhase>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageryDegraded, setImageryDegraded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const gridLayerRef = useRef<CesiumImageryLayer | null>(null);
  const cesiumRef = useRef<typeof import('cesium') | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Latest callbacks/flags for async handlers without re-subscribing.
  const callbackRef = useRef({
    onActiveRenderer,
    onCoordinatePick,
    lowPowerActive,
    globeGridVisible,
  });
  useEffect(() => {
    callbackRef.current = {
      onActiveRenderer,
      onCoordinatePick,
      lowPowerActive,
      globeGridVisible,
    };
  });

  // Mount-once Viewer lifecycle (StrictMode-safe via `cancelled`).
  useEffect(() => {
    let cancelled = false;
    let viewer: CesiumViewer | null = null;
    let clickHandler: CesiumScreenSpaceHandler | null = null;
    let gridLayer: CesiumImageryLayer | null = null;
    let removeImageryListener: (() => void) | null = null;

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

        const provider = new cesium.WebMapTileServiceImageryProvider({
          url: GIBS_WMTS_URL,
          layer: GIBS_LAYER_ID,
          style: GIBS_STYLE,
          format: GIBS_FORMAT,
          tileMatrixSetID: GIBS_TILE_MATRIX_SET_ID,
          maximumLevel: GIBS_MAXIMUM_LEVEL,
          dimensions: buildGibsTimeDimension(),
          credit: new cesium.Credit(GIBS_CREDIT_TEXT),
        });

        viewer = new cesium.Viewer(container, {
          // Token-free base: explicit GIBS layer instead of the default
          // ion world imagery (which would require an access token).
          baseLayer: new cesium.ImageryLayer(provider),
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

        // Click-to-coordinate: canvas-only handler, so dashboard controls
        // never reach it. Empty-space clicks yield no pick and no callback.
        clickHandler = new cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        const activeViewer = viewer;
        clickHandler.setInputAction(
          (movement: { position?: Cartesian2 }) => {
            const pick = callbackRef.current.onCoordinatePick;
            if (!pick || !movement?.position) return;
            // Camera-space pick against the ellipsoid (terrain is not
            // configured in this PoC, so ellipsoid height is never claimed).
            const cartesian: Cartesian3 | undefined =
              activeViewer.camera.pickEllipsoid(
                movement.position,
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
          cesium.ScreenSpaceEventType.LEFT_CLICK,
        );

        // Phase 3 §10: graticule as a native imagery layer — created once
        // per Viewer (never per render); `show` is the visibility toggle,
        // and `viewer.destroy()` disposes the layer with the Viewer.
        const gridProvider = new cesium.GridImageryProvider({
          cells: CESIUM_GRID_CELLS,
          color: cesium.Color.fromCssColorString(CESIUM_GRID_LINE_COLOR).withAlpha(
            CESIUM_GRID_LINE_ALPHA,
          ),
          glowColor: cesium.Color.fromCssColorString(CESIUM_GRID_GLOW_COLOR),
          backgroundColor: cesium.Color.TRANSPARENT,
        });
        gridLayer = viewer.imageryLayers.addImageryProvider(gridProvider);
        gridLayer.show = callbackRef.current.globeGridVisible;

        // Recoverable: tile failures degrade the status line, never destroy
        // a working Viewer or blank the globe.
        removeImageryListener = provider.errorEvent.addEventListener(() => {
          if (!cancelled) setImageryDegraded(true);
        });

        viewerRef.current = viewer;
        gridLayerRef.current = gridLayer;
        if (!cancelled) {
          setPhase('ready');
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
        clickHandler?.destroy();
      } catch {
        // Teardown must never throw; a half-initialized handler is dropped.
      }
      try {
        removeImageryListener?.();
      } catch {
        // Listener removal is best-effort during unmount.
      }
      const owned = viewer;
      viewer = null;
      viewerRef.current = null;
      gridLayerRef.current = null;
      if (owned && !owned.isDestroyed()) {
        owned.destroy();
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

  // Diagnostics reporting (same callback contract as the legacy branches).
  const forced = getForcedRenderer();
  const source = forced === 'cesium' ? 'forced' : 'automatic';
  const detail =
    phase === 'ready'
      ? imageryDegraded
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
