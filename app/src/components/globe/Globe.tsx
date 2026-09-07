import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { atmosphereVertexShader, atmosphereFragmentShader } from '@/shaders/atmosphere';
import type { DataPoint } from '@/types';

interface GlobeProps {
  activeLayer: string | null;
  dataPoints: DataPoint[];
  onMarkerClick: (point: DataPoint) => void;
  onMarkerHover: (point: DataPoint | null) => void;
  rotationSpeed?: number;
  isRotating?: boolean;
}

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function Atmosphere({ radius = 5 }: { radius?: number }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    color: { value: new THREE.Color(0.3, 0.6, 1.0) }
  }), []);

  return (
    <mesh>
      <sphereGeometry args={[radius * 1.04, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={atmosphereVertexShader}
        fragmentShader={atmosphereFragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function EarthSphere() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Load textures from local paths
  const [dayMap, nightMap, normalMap, specularMap] = useTexture([
    './textures/earth-day.jpg',
    './textures/earth-night.jpg',
    './textures/earth-topology.png',
    './textures/earth-water.png',
  ]);

  // Set texture encoding
  useEffect(() => {
    if (dayMap) dayMap.colorSpace = THREE.SRGBColorSpace;
    if (nightMap) nightMap.colorSpace = THREE.SRGBColorSpace;
  }, [dayMap, nightMap]);

  const earthMaterial = useMemo(() => {
    return new THREE.MeshPhongMaterial({
      map: dayMap,
      normalMap: normalMap,
      specularMap: specularMap,
      specular: new THREE.Color(0.333, 0.333, 0.333),
      shininess: 15,
    });
  }, [dayMap, normalMap, specularMap]);

  return (
    <group>
      {/* Main Earth sphere */}
      <mesh ref={meshRef} material={earthMaterial}>
        <sphereGeometry args={[5, 64, 64]} />
      </mesh>
      
      {/* Night lights overlay */}
      <mesh>
        <sphereGeometry args={[5.002, 64, 64]} />
        <meshBasicMaterial
          map={nightMap}
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          side={THREE.FrontSide}
        />
      </mesh>
    </group>
  );
}

function CloudLayer({ radius = 5, speed = 0.0008 }: { radius?: number; speed?: number }) {
  const cloudRef = useRef<THREE.Mesh>(null);
  
  const [cloudMap] = useTexture([
    './textures/earth-clouds.png',
  ]);

  useFrame(() => {
    if (cloudRef.current) {
      cloudRef.current.rotation.y += speed;
    }
  });

  return (
    <mesh ref={cloudRef}>
      <sphereGeometry args={[radius * 1.006, 64, 64]} />
      <meshPhongMaterial
        map={cloudMap}
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function MarkerSystem({ 
  points, 
  radius = 5, 
  onMarkerClick, 
  onMarkerHover 
}: { 
  points: DataPoint[];
  radius?: number;
  onMarkerClick: (point: DataPoint) => void;
  onMarkerHover: (point: DataPoint | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const mouse = useMemo(() => new THREE.Vector2(), []);
  const { camera, gl } = useThree();
  
  // Track which point corresponds to which instance
  const pointMap = useMemo(() => points, [points]);
  
  // Create marker geometry and material
  const [geometry, material] = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.04, 0.15, 6);
    geo.translate(0, 0.075, 0);
    geo.rotateX(Math.PI / 2);
    
    const mat = new THREE.MeshBasicMaterial({
      color: 0xFFC31F,
      transparent: true,
      opacity: 0.9,
    });
    return [geo, mat];
  }, []);

  // Position instances
  useEffect(() => {
    if (!meshRef.current) return;
    
    const validPoints = pointMap.filter(p => 
      typeof p.lat === 'number' && 
      typeof p.lon === 'number' &&
      !isNaN(p.lat) && 
      !isNaN(p.lon)
    );
    
    meshRef.current.count = validPoints.length;
    
    validPoints.forEach((point, i) => {
      const pos = latLonToVector3(point.lat, point.lon, radius * 1.01);
      dummy.position.copy(pos);
      dummy.lookAt(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [pointMap, radius, dummy]);

  // Raycasting for hover
  useEffect(() => {
    const canvas = gl.domElement;
    
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, camera);
      
      if (meshRef.current) {
        const intersects = raycaster.intersectObject(meshRef.current);
        if (intersects.length > 0) {
          const instanceId = intersects[0].instanceId;
          if (instanceId !== undefined && pointMap[instanceId]) {
            canvas.style.cursor = 'pointer';
            onMarkerHover(pointMap[instanceId]);
            return;
          }
        }
      }
      canvas.style.cursor = 'grab';
      onMarkerHover(null);
    };
    
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, camera);
      
      if (meshRef.current) {
        const intersects = raycaster.intersectObject(meshRef.current);
        if (intersects.length > 0) {
          const instanceId = intersects[0].instanceId;
          if (instanceId !== undefined && pointMap[instanceId]) {
            onMarkerClick(pointMap[instanceId]);
          }
        }
      }
    };
    
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onClick);
    
    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
    };
  }, [camera, gl, raycaster, mouse, pointMap, onMarkerClick, onMarkerHover]);

  if (points.length === 0) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, points.length]}
        frustumCulled={false}
      />
    </group>
  );
}

export default function Globe({
  dataPoints,
  onMarkerClick,
  onMarkerHover,
  rotationSpeed = 0.0003,
  isRotating = true,
}: GlobeProps) {
  const groupRef = useRef<THREE.Group>(null);
  
  // Rotation animation
  useFrame(() => {
    if (groupRef.current && isRotating) {
      groupRef.current.rotation.y += rotationSpeed;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Stars background */}
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
      
      {/* Lighting */}
      <ambientLight intensity={0.1} />
      <directionalLight
        position={[10, 5, 10]}
        intensity={1.5}
        color="#ffffff"
      />
      <hemisphereLight
        args={['#87CEEB', '#000000', 0.3]}
      />
      
      {/* Earth */}
      <EarthSphere />
      
      {/* Clouds */}
      <CloudLayer radius={5} speed={0.0008} />
      
      {/* Atmosphere */}
      <Atmosphere radius={5} />
      
      {/* Markers */}
      <MarkerSystem
        points={dataPoints}
        radius={5}
        onMarkerClick={onMarkerClick}
        onMarkerHover={onMarkerHover}
      />
    </group>
  );
}

export { latLonToVector3 };
