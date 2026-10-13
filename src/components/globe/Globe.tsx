import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { TEXTURE_URLS, useTextureTier } from './textureTiers';
import { atmosphereVertexShader, atmosphereFragmentShader } from '@/shaders/atmosphere';
import {
  filterValidPoints,
  isValidCoordinate,
  latLonToVector3Into,
  quaternionForLatLon,
} from '@/lib/geo';
import { SEVERITY_COLORS } from '@/types';
import type { DataPoint, SeverityLevel } from '@/types';
import { advanceFlight, autoRotateActive, startFlight } from '@/lib/motion';

interface GlobeProps {
  activeLayer: string | null;
  dataPoints: DataPoint[];
  onMarkerClick: (point: DataPoint) => void;
  onMarkerHover: (point: DataPoint | null) => void;
  rotationSpeed?: number;
  isRotating?: boolean;
  /** Search fly-to target; `key` retriggers. Null = no flight. */
  flyTo?: { lat: number; lon: number; key: number } | null;
  /**
   * OS reduced-motion preference (T3.11, supplied by GlobeScene from the
   * shared subscription). Disables auto-rotate, cloud drift and starfield
   * motion, and turns fly-to into an instant jump. Manual drag/zoom stay
   * available; control damping is interaction feedback, not ambient motion.
   */
  reducedMotion?: boolean;
  /**
   * World-space sun direction (T2.4, real-time UTC position from
   * `useSunDirection`). Drives the directional light so the lit side tracks
   * the real Sun. Defaults to the legacy fixed light when absent.
   */
  sunDirection?: [number, number, number];
}

function Atmosphere({ radius = 5 }: { radius?: number }) {
  // Steel-blue rim at low gain — separation from space without a neon ring.
  // Gain/falloff live in the atmosphere shaders; keep in step with the
  // WebGPU-path rim in WebGPUEarth.
  const uniforms = useMemo(
    () => ({
      color: { value: new THREE.Color(0.36, 0.56, 0.9) },
    }),
    [],
  );

  return (
    <mesh>
      <sphereGeometry args={[radius * 1.04, 32, 32]} />
      <shaderMaterial
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

  // T4.1: tier manifest (2K default, 4K on capable desktops) served from
  // the Next.js public dir (absolute paths). Stable per mount — both sets
  // are never requested together.
  const tier = useTextureTier();
  const [dayMap, nightMap, normalMap, specularMap] = useTexture([
    TEXTURE_URLS[tier].day,
    TEXTURE_URLS[tier].night,
    TEXTURE_URLS[tier].topology,
    TEXTURE_URLS[tier].water,
  ]);

  // Set texture encoding. Mutating the loaded THREE.Texture objects is the
  // documented three.js setup step (not React state), so the hook-mutation
  // lint rule is intentionally bypassed here.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/immutability */
    if (dayMap) dayMap.colorSpace = THREE.SRGBColorSpace;
    /* eslint-disable-next-line react-hooks/immutability */
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

  useEffect(() => {
    return () => {
      earthMaterial.dispose();
    };
  }, [earthMaterial]);

  return (
    <group>
      {/* Main Earth sphere */}
      <mesh ref={meshRef} material={earthMaterial}>
        <sphereGeometry args={[5, 48, 48]} />
      </mesh>

      {/* Night lights overlay */}
      <mesh>
        <sphereGeometry args={[5.002, 48, 48]} />
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

function CloudLayer({ radius = 5, speed = 0.0008, reducedMotion = false }: { radius?: number; speed?: number; reducedMotion?: boolean }) {
  const cloudRef = useRef<THREE.Mesh>(null);

  const tier = useTextureTier();
  const [cloudMap] = useTexture([TEXTURE_URLS[tier].clouds]);

  // Frame-rate independent drift; no per-frame allocation. Suppressed under
  // reduced motion (T3.11) — non-essential ambient movement.
  useFrame((_, delta) => {
    if (!reducedMotion && cloudRef.current) {
      cloudRef.current.rotation.y += speed * delta * 60;
    }
  });

  return (
    <mesh ref={cloudRef}>
      <sphereGeometry args={[radius * 1.006, 48, 48]} />
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

const MARKER_COLORS: Record<SeverityLevel, THREE.Color> = {
  low: new THREE.Color(SEVERITY_COLORS.low),
  moderate: new THREE.Color(SEVERITY_COLORS.moderate),
  high: new THREE.Color(SEVERITY_COLORS.high),
  critical: new THREE.Color(SEVERITY_COLORS.critical),
};

function MarkerSystem({
  points,
  radius = 5,
  onMarkerClick,
  onMarkerHover,
}: {
  points: DataPoint[];
  radius?: number;
  onMarkerClick: (point: DataPoint) => void;
  onMarkerHover: (point: DataPoint | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const { camera, gl } = useThree();

  // Phase 5: ONE canonical valid-points array. Instance index N always
  // maps to validPoints[N] for count, positions, raycast, hover, click.
  const validPoints = useMemo(() => filterValidPoints(points), [points]);

  // Latest callbacks/points via refs so canvas listeners subscribe exactly
  // once. Synced in an effect (never during render).
  const clickRef = useRef(onMarkerClick);
  const hoverRef = useRef(onMarkerHover);
  const pointsRef = useRef(validPoints);
  useEffect(() => {
    clickRef.current = onMarkerClick;
    hoverRef.current = onMarkerHover;
    pointsRef.current = validPoints;
  });

  // Create marker geometry and material (disposed on unmount)
  const [geometry, material] = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.04, 0.15, 6);
    geo.translate(0, 0.075, 0);
    geo.rotateX(Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.9,
    });
    return [geo, mat] as const;
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Position instances + per-severity colors
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.count = validPoints.length;

    validPoints.forEach((point, i) => {
      latLonToVector3Into(tmpVec, point.lat, point.lon, radius * 1.01);
      dummy.position.copy(tmpVec);
      dummy.lookAt(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpColor.copy(MARKER_COLORS[point.severity as SeverityLevel] ?? MARKER_COLORS.low);
      mesh.setColorAt(i, tmpColor);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [validPoints, radius, dummy, tmpColor, tmpVec]);

  // Throttled raycasting: at most one pick per animation frame, stable
  // subscriptions, drag-vs-click discrimination, cursor restore.
  useEffect(() => {
    const canvas = gl.domElement;
    let raf = 0;
    let pending: MouseEvent | null = null;
    let downX = 0;
    let downY = 0;

    const pick = (e: MouseEvent): DataPoint | null => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(ndc, camera);

      const mesh = meshRef.current;
      if (!mesh || pointsRef.current.length === 0) return null;
      const intersects = raycaster.intersectObject(mesh);
      if (intersects.length > 0) {
        const instanceId = intersects[0].instanceId;
        if (instanceId !== undefined) return pointsRef.current[instanceId] ?? null;
      }
      return null;
    };

    const flushHover = () => {
      raf = 0;
      if (!pending) return;
      const hit = pick(pending);
      pending = null;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      hoverRef.current(hit);
    };

    const onPointerMove = (e: MouseEvent) => {
      pending = e;
      if (raf === 0) raf = requestAnimationFrame(flushHover);
    };

    const onPointerDown = (e: MouseEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onClick = (e: MouseEvent) => {
      // Ignore drags ending on a marker (OrbitControls rotate vs click).
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const hit = pick(e);
      if (hit) clickRef.current(hit);
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('click', onClick);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('click', onClick);
      canvas.style.cursor = '';
      hoverRef.current(null);
    };
  }, [camera, gl, raycaster, ndc]);

  if (validPoints.length === 0) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, Math.max(validPoints.length, 1)]}
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
  flyTo = null,
  reducedMotion = false,
  sunDirection,
}: GlobeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const flightRef = useRef<{
    t: number;
    duration: number;
    from: THREE.Quaternion;
    to: THREE.Quaternion;
  } | null>(null);
  const { gl } = useThree();

  // Start a fly-to flight when a new target arrives (Phase 4). Under
  // reduced motion the globe jumps to the destination instead (T3.11).
  useEffect(() => {
    if (!flyTo || !groupRef.current) return;
    if (!isValidCoordinate(flyTo.lat, flyTo.lon)) return;
    if (reducedMotion) {
      groupRef.current.quaternion.copy(quaternionForLatLon(flyTo.lat, flyTo.lon));
      flightRef.current = null;
      return;
    }
    flightRef.current = startFlight(
      groupRef.current.quaternion.clone(),
      quaternionForLatLon(flyTo.lat, flyTo.lon),
    );
  }, [flyTo, reducedMotion]);

  // Interruptible: any user drag on the canvas cancels the flight.
  useEffect(() => {
    const canvas = gl.domElement;
    const cancel = () => {
      flightRef.current = null;
    };
    canvas.addEventListener('pointerdown', cancel);
    canvas.addEventListener('wheel', cancel, { passive: true });
    return () => {
      canvas.removeEventListener('pointerdown', cancel);
      canvas.removeEventListener('wheel', cancel);
    };
  }, [gl]);

  // Rotation animation: slerp flight wins over auto-rotate; delta-based.
  // useFrame re-subscribes on each render, so reading `isRotating` and
  // `reducedMotion` from the closure is correct without a ref. A flight
  // still in progress when the preference flips to reduce lands instantly
  // (advanceFlight) instead of continuing its travel animation.
  useFrame((_, rawDelta) => {
    const group = groupRef.current;
    if (!group) return;
    const delta = Math.min(rawDelta, 0.1);
    const flight = flightRef.current;
    if (flight) {
      flightRef.current = advanceFlight(group.quaternion, flight, delta, reducedMotion);
    } else if (autoRotateActive(isRotating, reducedMotion)) {
      group.rotation.y += rotationSpeed * delta * 60;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Stars background (static under reduced motion — T3.11) */}
      <Stars radius={100} depth={50} count={2500} factor={4} saturation={0} fade speed={reducedMotion ? 0 : 1} />

      {/* Lighting */}
      <ambientLight intensity={0.1} />
      <directionalLight position={sunDirection ?? [10, 5, 10]} intensity={1.5} color="#ffffff" />
      <hemisphereLight args={['#87CEEB', '#000000', 0.3]} />

      {/* Earth */}
      <EarthSphere />

      {/* Clouds */}
      <CloudLayer radius={5} speed={0.0008} reducedMotion={reducedMotion} />

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
