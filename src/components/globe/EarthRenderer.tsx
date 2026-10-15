/**
 * Earth renderer selector — progressive enhancement boundary (GLOBE-1).
 *
 *   default                 → <DottedEarth/> mounted in the GlobeStage cell
 *   ?renderer=webgpu        → <WebGPUEarth/> (WebGPU + TSL day/night Earth)
 *   ?renderer=webgl         → <GlobeScene/>  (existing WebGL/R3F globe)
 *   ?renderer=cesium        → <CesiumEarth/> (CesiumJS proof of concept, Phase 2)
 *
 * The dotted canvas Earth is the default because it is the only path that
 * can guarantee a visible geographic base layer: no GPU probe, no 2.1 MB
 * lazy chunk, no adapter handshake, no texture downloads. It is mounted by
 * `GlobeStage` (inside the stage grid cell, not here), so when the default
 * mode is active this component renders nothing — the fullscreen
 * container below belongs to the two opt-in 3D paths only.
 *
 * All three branches expose the identical Sentinel contract (markers,
 * hover, click, fly-to, rotation), so the rest of the app never knows
 * which renderer is active. The active renderer is reported via
 * `onActiveRenderer` for the Settings → Diagnostics panel; in the default
 * mode that report comes from GlobeStage/DottedEarth.
 *
 * The app is never left with a blank viewport: the stage-mounted base
 * globe needs no GPU at all, and the WebGL globe remains the fallback for
 * a failed/hung WebGPU init.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import WebGpuErrorBoundary from './WebGpuErrorBoundary';
import type { EarthStatus } from './earthConfig';
import { getForcedRenderer } from '@/lib/webgpu';
import { useGlobeMode } from './rendererMode';
import type { GlobeMode } from './rendererMode';

// Lazy + client-only: `three/webgpu` + TSL nodes ship in a separate chunk
// that only downloads on WebGPU-capable browsers — and `ssr: false`
// guarantees the WebGPU module graph is never evaluated on the server.
// The WebGL fallback never pays for it, and Suspense keeps the viewport
// covered while it loads.
const WebGPUEarth = dynamic(() => import('./WebGPUEarth'), { ssr: false });
// T4.5: the WebGL/R3F globe (`three`, fiber, drei) is a lazy client-only
// chunk for the same reason — the default dotted Earth is the initial
// route and must not download three.js on first load. Both 3D renderers
// are opt-in (`?renderer=` / WebGPU→WebGL fallback), so they load on
// demand behind a veil; the dotted default is unaffected.
const GlobeScene = dynamic(() => import('./GlobeScene'), { ssr: false });
// Phase 2: the CesiumJS proof of concept is a fourth lazy client-only
// chunk on the same pattern — it loads only for `?renderer=cesium` and the
// Cesium runtime never enters the server graph or the initial route.
const CesiumEarth = dynamic(() => import('./CesiumEarth'), { ssr: false });
import type { DataPoint, LayerId } from '@/types';

export interface RendererInfo {
  active: GlobeMode | 'loading';
  /** 'ok' when the active renderer is ready, otherwise a short reason. */
  detail: string;
  textures: { loaded: number; total: number };
  /**
   * Frames submitted by the WebGPU loop. `undefined` before the first
   * frame or on the WebGL path. Session 5: the badge must reflect actual
   * rendering, never init alone.
   */
  frames?: number;
  /**
   * Session 6: how the active renderer was chosen. `'forced'` means a
   * `?renderer=` URL override decided it; `'automatic'` means probe /
   * fallback logic decided. Makes `?renderer=webgl` recognition obvious.
   */
  source: 'forced' | 'automatic';
}

interface EarthRendererProps {
  activeLayer: LayerId | null;
  dataPoints: DataPoint[];
  onMarkerClick: (point: DataPoint) => void;
  onMarkerHover: (point: DataPoint | null) => void;
  isRotating?: boolean;
  /** Search fly-to target; `key` retriggers. Null = no flight. */
  flyTo?: { lat: number; lon: number; key: number } | null;
  /**
   * Authoritative world-space sun direction (T2.4, one tuple shared by both
   * renderer paths: WebGPU day/night blend + light, WebGL directional light).
   */
  sunDirection?: [number, number, number];
  /**
   * T4.6 low-power mode (Settings → Globe). Texture tier, DPR ceiling and
   * the cloud shell follow it; the 3D branch remounts when it flips so the
   * old texture set releases through the existing teardown before the new
   * set allocates (never a mid-life texture swap).
   */
  lowPowerActive?: boolean;
  onActiveRenderer?: (info: RendererInfo) => void;
  /**
   * Phase 2 PoC extension: validated globe-surface picks from the Cesium
   * branch. Optional so the legacy branches and existing callers are
   * untouched; wired to the dock coordinate readout in `SentinelApp`.
   */
  onCoordinatePick?: (lat: number, lon: number) => void;
}

export default function EarthRenderer({
  activeLayer,
  dataPoints,
  onMarkerClick,
  onMarkerHover,
  isRotating = true,
  flyTo = null,
  sunDirection,
  lowPowerActive = false,
  onActiveRenderer,
  onCoordinatePick,
}: EarthRendererProps) {
  // Session 5 A/B test: `?renderer=webgl` / `?renderer=webgpu` resolves
  // synchronously at mount (no probe, no cascading render).
  // Test B: https://kimi-earth-sentinel-3d.vercel.app/?renderer=webgl
  // Default (no override): 'pending' for the SSR/hydration pass, then the
  // stage-mounted dotted Earth (GLOBE-1). Reading the URL via
  // useSyncExternalStore keeps SSR markup deterministic and avoids the
  // async GPU probe entirely — geography shows on the first client frame
  // instead of a black veil.
  const mode = useGlobeMode();
  // Runtime degradation of the WebGPU branch (chunk failure, GPU error,
  // hung init → watchdog). Layered on top of the URL-resolved mode so the
  // existing graceful WebGPU→WebGL fallback is preserved unchanged.
  const [webgpuDegraded, setWebgpuDegraded] = useState(false);
  const activeMode: 'pending' | GlobeMode =
    webgpuDegraded && mode === 'webgpu' ? 'webgl' : mode;
  const [webgpuStatus, setWebgpuStatus] = useState<EarthStatus | null>(null);
  const callbackRef = useRef(onActiveRenderer);
  useEffect(() => {
    callbackRef.current = onActiveRenderer;
  });

  const handleWebgpuStatus = useCallback((status: EarthStatus) => {
    setWebgpuStatus(status);
    if (status.phase === 'error') {
      // Degrade gracefully — never a blank page.
      setWebgpuDegraded(true);
    }
  }, []);

  const handleWebgpuCrash = useCallback(() => {
    // Lazy-chunk load failure or render throw: same graceful fallback.
    setWebgpuStatus({
      phase: 'error',
      renderer: 'webgpu',
      textures: { loaded: 0, total: 0 },
      error: 'WebGPU chunk failed to load',
    });
    setWebgpuDegraded(true);
  }, []);

  // Watchdog: if WebGPU hasn't reported ready within the budget (hung
  // adapter init, stalled texture fetch — neither rejects nor emits an
  // error), fall back to WebGL instead of holding a black canvas forever.
  useEffect(() => {
    if (activeMode !== 'webgpu') return;
    if (webgpuStatus?.phase === 'ready' || webgpuStatus?.phase === 'error') return;
    const timer = setTimeout(() => {
      setWebgpuStatus((prev) => {
        if (prev?.phase === 'ready' || prev?.phase === 'error') return prev;
        return {
          phase: 'error',
          renderer: 'webgpu',
          textures: prev?.textures ?? { loaded: 0, total: 0 },
          error: 'WebGPU initialization timed out',
        };
      });
      setWebgpuDegraded(true);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [activeMode, webgpuStatus?.phase]);

  useEffect(() => {
    // The default dotted branch reports its own geography status from
    // GlobeStage/DottedEarth — never overwrite it with a generic message.
    // The Cesium branch likewise reports its own init/ready/error status.
    if (activeMode === 'dotted' || activeMode === 'cesium') return;
    const forced = getForcedRenderer();
    const source: RendererInfo['source'] = forced ? 'forced' : 'automatic';
    const forcedSuffix = forced ? ` (forced ?renderer=${forced})` : '';
    const info: RendererInfo =
      activeMode === 'pending'
        ? { active: 'loading', detail: 'starting globe…', textures: { loaded: 0, total: 0 }, source }
        : activeMode === 'webgpu'
          ? {
              active: 'webgpu',
              detail:
                webgpuStatus?.phase === 'ready'
                  ? `ready · ${webgpuStatus.frames ?? 0} frames${forcedSuffix}`
                  : webgpuStatus?.phase === 'error'
                    ? (webgpuStatus.error ?? 'initialization failed')
                    : `initializing…${forcedSuffix}`,
              textures: webgpuStatus?.textures ?? { loaded: 0, total: 0 },
              frames: webgpuStatus?.frames,
              source,
            }
          : {
              active: 'webgl',
              detail: webgpuDegraded
                ? 'WebGPU unavailable — WebGL fallback'
                : forced === 'webgl'
                  ? 'forced WebGL (?renderer=webgl)'
                  : 'fallback active',
              textures: { loaded: 0, total: 0 },
              source,
            };
    callbackRef.current?.(info);
  }, [activeMode, webgpuStatus, webgpuDegraded]);

  // Default mode (GLOBE-1): the base globe is mounted by GlobeStage inside
  // the stage grid cell, so this fullscreen container stays unmounted —
  // the dotted canvas is the only Earth on screen, and it never sits
  // behind a blank renderer.
  if (activeMode === 'dotted') return null;

  // T4.6: the 3D branch remounts when low-power mode flips — tier, DPR and
  // clouds all resolve once at init, and the existing teardown (textures,
  // materials, listeners, GPU resources) runs before the fresh mount.
  const qualityKey = lowPowerActive ? 'low-power' : 'full';

  return (
    // CSP-1: static fullscreen geometry as classes (see WebGPUEarth note).
    <div className="fixed left-0 top-0 z-[1] h-full w-full">
      {activeMode === 'webgpu' ? (
        <Suspense
          fallback={
            <div
              role="status"
              aria-label="Loading WebGPU Earth renderer"
              // CSP-1: static veil styling as classes (no style attribute).
              className="absolute inset-0 flex items-center justify-center bg-[#020202] text-[13px] tracking-[0.02em] text-white/50"
            >
              Loading WebGPU Earth…
            </div>
          }
        >
          <WebGpuErrorBoundary onError={handleWebgpuCrash}>
            <WebGPUEarth
              key={qualityKey}
              dataPoints={dataPoints}
              onMarkerClick={onMarkerClick}
              onMarkerHover={onMarkerHover}
              isRotating={isRotating}
              rotationSpeed={0.0003}
              flyTo={flyTo}
              sunDirection={sunDirection}
              lowPowerActive={lowPowerActive}
              onStatus={handleWebgpuStatus}
            />
          </WebGpuErrorBoundary>
        </Suspense>
      ) : activeMode === 'cesium' ? (
        <Suspense
          fallback={
            <div
              role="status"
              aria-label="Loading Cesium Earth renderer"
              // CSP-1: static veil styling as classes (no style attribute).
              className="absolute inset-0 flex items-center justify-center bg-[#020202] text-[13px] tracking-[0.02em] text-white/50"
            >
              Loading Cesium Earth…
            </div>
          }
        >
          <CesiumEarth
            key={qualityKey}
            activeLayer={activeLayer}
            dataPoints={dataPoints}
            onMarkerClick={onMarkerClick}
            onMarkerHover={onMarkerHover}
            isRotating={isRotating}
            flyTo={flyTo}
            sunDirection={sunDirection}
            lowPowerActive={lowPowerActive}
            onActiveRenderer={onActiveRenderer}
            onCoordinatePick={onCoordinatePick}
          />
        </Suspense>
      ) : activeMode === 'webgl' ? (
        <Suspense
          fallback={
            <div
              role="status"
              aria-label="Loading WebGL Earth renderer"
              // CSP-1: static veil styling as classes (no style attribute).
              className="absolute inset-0 flex items-center justify-center bg-[#020202] text-[13px] tracking-[0.02em] text-white/50"
            >
              Loading WebGL Earth…
            </div>
          }
        >
          <GlobeScene
            key={qualityKey}
            activeLayer={activeLayer}
            dataPoints={dataPoints}
            onMarkerClick={onMarkerClick}
            onMarkerHover={onMarkerHover}
            isRotating={isRotating}
            flyTo={flyTo}
            sunDirection={sunDirection}
            lowPowerActive={lowPowerActive}
          />
        </Suspense>
      ) : (
          <div
            role="status"
            aria-label="Initializing Earth renderer"
            // CSP-1: static veil styling as classes (no style attribute).
            className="absolute inset-0 flex items-center justify-center bg-[#020202] text-[13px] tracking-[0.02em] text-white/50"
          >
          Initializing Earth renderer…
        </div>
      )}
    </div>
  );
}
