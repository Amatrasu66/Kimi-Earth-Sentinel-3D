/**
 * GlobeStage — the visual anchor of the interface (GLOBE-1).
 *
 * The stage cell now hosts the base Earth, not just the drafting frame:
 * in the default renderer mode it mounts `DottedEarth` — the lightweight
 * canvas globe — so a geographic surface is visible before (and without)
 * any event layer. It is deliberately NOT gated on `activeLayer`, on
 * layer loading, or on whether the layer returned points: an empty data
 * layer is not an empty Earth.
 *
 * The two 3D renderers keep their fullscreen fixed canvases behind the
 * shell (see EarthRenderer) and are only selected through `?renderer=`;
 * when either is forced this component falls back to the bare frame.
 *
 * Framing (drafting-notation corner ticks + whisper locator) is
 * subordinate by design and never intercepts globe drag.
 *
 * This component is memoized and its props are referentially stable in
 * SentinelApp, so shell-only re-renders (hover, search typing, panel
 * state) never restart the globe engine.
 */
import { memo } from 'react';
import DottedEarth from '@/components/globe/dotted/DottedEarth';
import { useGlobeMode } from '@/components/globe/rendererMode';
import type { RendererInfo } from '@/components/globe/EarthRenderer';
import type { DataPoint } from '@/types';

interface GlobeStageProps {
  /** Layer points for the base globe's markers — never a render gate. */
  dataPoints?: DataPoint[];
  onMarkerClick?: (point: DataPoint) => void;
  onMarkerHover?: (point: DataPoint | null) => void;
  isRotating?: boolean;
  flyTo?: { lat: number; lon: number; key: number } | null;
  /** Renderer diagnostics for the status dock / settings panel. */
  onActiveRenderer?: (info: RendererInfo) => void;
  /** T4.6 low-power mode: dotted DPR ceiling 1, applied without remount. */
  lowPowerActive?: boolean;
}

function GlobeStage({
  dataPoints,
  onMarkerClick,
  onMarkerHover,
  isRotating,
  flyTo,
  onActiveRenderer,
  lowPowerActive = false,
}: GlobeStageProps) {
  // Deterministic through useSyncExternalStore: SSR/hydration report
  // 'pending' (frame only), the client resolves to 'dotted' unless a
  // `?renderer=` override forces one of the fullscreen 3D paths.
  const mode = useGlobeMode();

  return (
    <>
      {mode === 'dotted' && (
        <DottedEarth
          dataPoints={dataPoints}
          onMarkerClick={onMarkerClick}
          onMarkerHover={onMarkerHover}
          isRotating={isRotating}
          flyTo={flyTo}
          onActiveRenderer={onActiveRenderer}
          lowPower={lowPowerActive}
        />
      )}
      <div className="globe-stage-frame" aria-hidden>
        <span className="globe-stage-tick" data-pos="tl" />
        <span className="globe-stage-tick" data-pos="tr" />
        <span className="globe-stage-tick" data-pos="bl" />
        <span className="globe-stage-tick" data-pos="br" />
        <span className="globe-stage-coords">SENTINEL STAGE · WGS 84</span>
      </div>
    </>
  );
}

export default memo(GlobeStage);
