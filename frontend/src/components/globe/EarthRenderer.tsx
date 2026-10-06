/**
 * Earth renderer selector — progressive enhancement boundary.
 *
 *   probe WebGPU support
 *        ├─ available → <WebGPUEarth/> (WebGPU + TSL day/night Earth)
 *        └─ missing/fails → <GlobeScene/> (existing WebGL/R3F globe)
 *
 * Both branches expose the identical Sentinel contract (markers, hover,
 * click, fly-to, rotation), so the rest of the app never knows which
 * renderer is active. The active renderer is reported via
 * `onActiveRenderer` for the Settings → Diagnostics panel.
 *
 * The app is never left with a blank viewport: the WebGL globe is always
 * available as a fallback, and a loading veil covers only the brief
 * probe/initialization window.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import GlobeScene from './GlobeScene';
import WebGpuErrorBoundary from './WebGpuErrorBoundary';
import type { EarthStatus } from './earthConfig';
import { probeWebGpuSupport, getForcedRenderer, decideRendererMode } from '@/lib/webgpu';

// Lazy: `three/webgpu` + TSL nodes ship in a separate chunk that only
// downloads on WebGPU-capable browsers. The WebGL fallback never pays
// for it, and Suspense keeps the viewport covered while it loads.
const WebGPUEarth = lazy(() => import('./WebGPUEarth'));
import type { RendererKind } from '@/lib/webgpu';
import type { DataPoint, LayerId } from '@/types';

export interface RendererInfo {
  active: RendererKind | 'loading';
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
  sunDirection?: [number, number, number];
  onActiveRenderer?: (info: RendererInfo) => void;
}

export default function EarthRenderer({
  activeLayer,
  dataPoints,
  onMarkerClick,
  onMarkerHover,
  isRotating = true,
  flyTo = null,
  sunDirection,
  onActiveRenderer,
}: EarthRendererProps) {
  // Session 5 A/B test: `?renderer=webgl` / `?renderer=webgpu` resolves
  // synchronously at mount (no probe, no cascading render).
  // Test B: https://kimi-earth-sentinel-3d.vercel.app/?renderer=webgl
  const [mode, setMode] = useState<'pending' | RendererKind>(() => getForcedRenderer() ?? 'pending');
  const [webgpuStatus, setWebgpuStatus] = useState<EarthStatus | null>(null);
  const callbackRef = useRef(onActiveRenderer);
  useEffect(() => {
    callbackRef.current = onActiveRenderer;
  });

  useEffect(() => {
    // A forced `?renderer=` value is already the mounted mode — only probe
    // when the URL leaves the choice to capability detection.
    if (getForcedRenderer()) return;
    let cancelled = false;
    probeWebGpuSupport().then((support) => {
      if (cancelled) return;
      setMode(decideRendererMode(null, support));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleWebgpuStatus = useCallback((status: EarthStatus) => {
    setWebgpuStatus(status);
    if (status.phase === 'error') {
      // Degrade gracefully — never a blank page.
      setMode('webgl');
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
    setMode('webgl');
  }, []);

  // Watchdog: if WebGPU hasn't reported ready within the budget (hung
  // adapter init, stalled texture fetch — neither rejects nor emits an
  // error), fall back to WebGL instead of holding a black canvas forever.
  useEffect(() => {
    if (mode !== 'webgpu') return;
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
      setMode((prev) => (prev === 'webgpu' ? 'webgl' : prev));
    }, 30_000);
    return () => clearTimeout(timer);
  }, [mode, webgpuStatus?.phase]);

  useEffect(() => {
    const forced = getForcedRenderer();
    const source: RendererInfo['source'] = forced ? 'forced' : 'automatic';
    const forcedSuffix = forced ? ` (forced ?renderer=${forced})` : '';
    const info: RendererInfo =
      mode === 'pending'
        ? { active: 'loading', detail: 'probing WebGPU support…', textures: { loaded: 0, total: 0 }, source }
        : mode === 'webgpu'
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
              detail: forced === 'webgl' ? 'forced WebGL (?renderer=webgl)' : 'fallback active',
              textures: { loaded: 0, total: 0 },
              source,
            };
    callbackRef.current?.(info);
  }, [mode, webgpuStatus]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
      {mode === 'webgpu' ? (
        <Suspense
          fallback={
            <div
              role="status"
              aria-label="Loading WebGPU Earth renderer"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#020202',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 13,
                letterSpacing: '0.02em',
              }}
            >
              Loading WebGPU Earth…
            </div>
          }
        >
          <WebGpuErrorBoundary onError={handleWebgpuCrash}>
            <WebGPUEarth
              dataPoints={dataPoints}
              onMarkerClick={onMarkerClick}
              onMarkerHover={onMarkerHover}
              isRotating={isRotating}
              rotationSpeed={0.0003}
              flyTo={flyTo}
              sunDirection={sunDirection}
              onStatus={handleWebgpuStatus}
            />
          </WebGpuErrorBoundary>
        </Suspense>
      ) : mode === 'webgl' ? (
        <GlobeScene
          activeLayer={activeLayer}
          dataPoints={dataPoints}
          onMarkerClick={onMarkerClick}
          onMarkerHover={onMarkerHover}
          isRotating={isRotating}
          flyTo={flyTo}
        />
      ) : (
        <div
          role="status"
          aria-label="Initializing Earth renderer"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#020202',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 13,
            letterSpacing: '0.02em',
          }}
        >
          Initializing Earth renderer…
        </div>
      )}
    </div>
  );
}
