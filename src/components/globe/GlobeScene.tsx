import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import Globe from './Globe';
import { DEFAULT_CAMERA_DISTANCE } from './earthConfig';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { DataPoint, LayerId } from '@/types';

interface GlobeSceneProps {
  activeLayer: LayerId | null;
  dataPoints: DataPoint[];
  onMarkerClick: (point: DataPoint) => void;
  onMarkerHover: (point: DataPoint | null) => void;
  isRotating?: boolean;
  /** Search fly-to target; `key` retriggers. Null = no flight. */
  flyTo?: { lat: number; lon: number; key: number } | null;
  /** World-space sun direction (T2.4); forwarded to the WebGL globe light. */
  sunDirection?: [number, number, number];
}

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[5, 32, 32]} />
      <meshBasicMaterial color="#1a1a2e" wireframe />
    </mesh>
  );
}

// Lower-end / mobile fallback: cap pixel ratio and rely on the reduced
// geometry budgets in Globe (48-seg spheres, 32-seg atmosphere).
function getAdaptiveDpr(): [number, number] {
  if (typeof window === 'undefined') return [1, 2];
  const coarse =
    window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768;
  const max = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
  return [1, Math.max(1, max)];
}

export default function GlobeScene({
  activeLayer,
  dataPoints,
  onMarkerClick,
  onMarkerHover,
  isRotating = true,
  flyTo = null,
  sunDirection,
}: GlobeSceneProps) {
  const dpr = getAdaptiveDpr();
  // T3.11: shared reduced-motion subscription, forwarded into the Canvas.
  // A preference flip re-renders (no remount, no renderer reset); the globe
  // reads it in its frame loop and flight effect.
  const reducedMotion = usePrefersReducedMotion();

  return (
    // CSP-1: static fullscreen geometry as classes (see WebGPUEarth note).
    <div className="fixed left-0 top-0 z-[1] h-full w-full">
      <Canvas
        camera={{ position: [0, 0, DEFAULT_CAMERA_DISTANCE], fov: 45, near: 0.1, far: 1000 }}
        dpr={dpr}
        // T4.2 on-demand: render only on invalidate (interaction via drei,
        // prop/state/resize/visibility via Globe) instead of every rAF.
        // Hidden tabs pause by platform gating; resume paints one frame.
        frameloop="demand"
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#020202');
        }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <Globe
            activeLayer={activeLayer}
            dataPoints={dataPoints}
            onMarkerClick={onMarkerClick}
            onMarkerHover={onMarkerHover}
            isRotating={isRotating}
            rotationSpeed={0.0003}
            flyTo={flyTo}
            reducedMotion={reducedMotion}
            sunDirection={sunDirection}
          />
        </Suspense>

        <OrbitControlsWrapped />
      </Canvas>
    </div>
  );
}

// Separate component for OrbitControls to avoid R3F context issues
import { OrbitControls } from '@react-three/drei';

function OrbitControlsWrapped() {
  return (
    <OrbitControls
      enablePan={false}
      enableZoom={true}
      enableRotate={true}
      minDistance={7}
      maxDistance={30}
      zoomSpeed={0.5}
      rotateSpeed={0.5}
      dampingFactor={0.05}
      enableDamping={true}
      autoRotate={false}
    />
  );
}
