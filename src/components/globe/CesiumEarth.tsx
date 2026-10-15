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
 * reports validated click-to-coordinate picks. Marker/entity sync, sun
 * wiring, and scene detail stay Phase 4+ work (see §18 of the Phase 2
 * prompt): the corresponding props are accepted but intentionally unused
 * here so the shared contract does not fork.
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
  CESIUM_FLY_TO_DURATION_SECONDS,
  CESIUM_HOME_VIEW,
  DEFAULT_MAXIMUM_SCREEN_SPACE_ERROR,
  FULL_RESOLUTION_SCALE,
  GIBS_CREDIT_TEXT,
  GIBS_FORMAT,
  GIBS_LAYER_ID,
  GIBS_MAXIMUM_LEVEL,
  GIBS_STYLE,
  GIBS_TILE_MATRIX_SET_ID,
  GIBS_WMTS_URL,
  LOW_POWER_MAXIMUM_SCREEN_SPACE_ERROR,
  LOW_POWER_RESOLUTION_SCALE,
  buildGibsTimeDimension,
  loadCesiumRuntime,
} from './cesiumConfig';
import type { GlobeMode } from './rendererMode';
import type { DataPoint, LayerId } from '@/types';
import type {
  Cartesian2,
  Cartesian3,
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
  /** Low-power mode: resolution scale + coarser LOD (documented options). */
  lowPowerActive?: boolean;
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
  const cesiumRef = useRef<typeof import('cesium') | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Latest callbacks/flags for async handlers without re-subscribing.
  const callbackRef = useRef({ onActiveRenderer, onCoordinatePick, lowPowerActive });
  useEffect(() => {
    callbackRef.current = { onActiveRenderer, onCoordinatePick, lowPowerActive };
  });

  // Mount-once Viewer lifecycle (StrictMode-safe via `cancelled`).
  useEffect(() => {
    let cancelled = false;
    let viewer: CesiumViewer | null = null;
    let clickHandler: CesiumScreenSpaceHandler | null = null;
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

        viewer.camera.setView({
          destination: cesium.Cartesian3.fromDegrees(
            CESIUM_HOME_VIEW.longitudeDegrees,
            CESIUM_HOME_VIEW.latitudeDegrees,
            CESIUM_HOME_VIEW.heightMeters,
          ),
        });

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

        // Recoverable: tile failures degrade the status line, never destroy
        // a working Viewer or blank the globe.
        removeImageryListener = provider.errorEvent.addEventListener(() => {
          if (!cancelled) setImageryDegraded(true);
        });

        viewerRef.current = viewer;
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
      if (owned && !owned.isDestroyed()) {
        owned.destroy();
      }
    };
    // Mount-once by design: prop sync uses the dedicated effects below.
  }, []);

  // Search fly-to: recenter at the current altitude; reduced motion jumps.
  // Synchronous: the runtime namespace is cached at init, so no second
  // dynamic import (and no flight before the Viewer exists).
  useEffect(() => {
    const viewer = viewerRef.current;
    const cesium = cesiumRef.current;
    if (!viewer || viewer.isDestroyed() || !cesium || !flyTo) return;
    if (!isValidCoordinate(flyTo.lat, flyTo.lon)) return;
    let height = CESIUM_HOME_VIEW.heightMeters;
    try {
      const cartographic = cesium.Cartographic.fromCartesian(viewer.camera.position);
      if (cartographic && Number.isFinite(cartographic.height)) {
        height = cartographic.height;
      }
    } catch {
      // Keep the deterministic fallback height.
    }
    const destination = cesium.Cartesian3.fromDegrees(flyTo.lon, flyTo.lat, height);
    if (reducedMotion) {
      viewer.camera.setView({ destination });
    } else {
      viewer.camera.flyTo({
        destination,
        orientation: {
          heading: 0,
          pitch: cesium.Math.toRadians(-90),
        },
        duration: CESIUM_FLY_TO_DURATION_SECONDS,
      });
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
  }, [lowPowerActive]);

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
