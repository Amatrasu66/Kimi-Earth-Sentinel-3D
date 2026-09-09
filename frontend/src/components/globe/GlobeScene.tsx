import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import Globe from './Globe';
import type { DataPoint, LayerId } from '@/types';

interface GlobeSceneProps {
  activeLayer: LayerId | null;
  dataPoints: DataPoint[];
  onMarkerClick: (point: DataPoint) => void;
  onMarkerHover: (point: DataPoint | null) => void;
  isRotating?: boolean;
  /** Search fly-to target; `key` retriggers. Null = no flight. */
  flyTo?: { lat: number; lon: number; key: number } | null;
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
}: GlobeSceneProps) {
  const dpr = getAdaptiveDpr();

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
      <Canvas
        camera={{ position: [0, 0, 14], fov: 45, near: 0.1, far: 1000 }}
        dpr={dpr}
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
