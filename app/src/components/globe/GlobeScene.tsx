import { Suspense, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import Globe from './Globe';
import type { DataPoint, LayerId } from '@/types';

interface GlobeSceneProps {
  activeLayer: LayerId | null;
  dataPoints: DataPoint[];
  onMarkerClick: (point: DataPoint) => void;
  onMarkerHover: (point: DataPoint | null) => void;
  isRotating?: boolean;
}

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[5, 32, 32]} />
      <meshBasicMaterial color="#1a1a2e" wireframe />
    </mesh>
  );
}

export default function GlobeScene({
  activeLayer,
  dataPoints,
  onMarkerClick,
  onMarkerHover,
  isRotating = true,
}: GlobeSceneProps) {
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const handleCreated = useCallback(({ gl, camera }: { gl: THREE.WebGLRenderer; camera: THREE.Camera }) => {
    cameraRef.current = camera as THREE.PerspectiveCamera;
    gl.setClearColor('#020202');
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }, []);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
      <Canvas
        camera={{ position: [0, 0, 14], fov: 45, near: 0.1, far: 1000 }}
        gl={{ 
          antialias: true, 
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={handleCreated}
      >
        <Suspense fallback={<LoadingFallback />}>
          <Globe
            activeLayer={activeLayer}
            dataPoints={dataPoints}
            onMarkerClick={onMarkerClick}
            onMarkerHover={onMarkerHover}
            isRotating={isRotating}
            rotationSpeed={0.0003}
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
