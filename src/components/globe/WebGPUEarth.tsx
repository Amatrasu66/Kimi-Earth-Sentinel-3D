/**
 * WebGPU + TSL Earth renderer (Three.js 0.185.x).
 *
 * Visual foundation ported from the official `webgpu_tsl_earth` example
 * into a React-compatible imperative component:
 *
 * - `three/webgpu` WebGPURenderer (async init, never blocks React UI)
 * - `three/tsl` node material: day texture × night city-lights blended by
 *   a sun-oriented smoothstep transition, Fresnel atmosphere shell
 * - directional sun + deep-space starfield + drifting cloud layer
 *
 * Sentinel behavior is preserved, not reimplemented: markers use the same
 * canonical lat/lon → sphere projection (`@/lib/geo`), the same severity
 * colors, the same hover/click picking contract, the same fly-to
 * quaternion math, and the same rotation model as the WebGL globe — so
 * this component is a drop-in Earth foundation behind `EarthRenderer`.
 *
 * Textures are the existing local assets under `public/textures`
 * (NASA Visible Earth Blue Marble family, see README → Texture sources).
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  dot,
  float,
  mix,
  normalWorld,
  normalize,
  positionWorld,
  pow,
  saturate,
  smoothstep,
  texture as tslTexture,
  uniform,
  vec3,
} from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  filterValidPoints,
  latLonToVector3Into,
  quaternionForLatLon,
} from '@/lib/geo';
import { SEVERITY_COLORS } from '@/types';
import type { DataPoint, SeverityLevel } from '@/types';

import { DEFAULT_CAMERA_DISTANCE, DEFAULT_SUN_DIRECTION, EARTH_RADIUS } from './earthConfig';
import type { EarthStatus } from './earthConfig';

/** Marker lift above the surface — small vs. radius, avoids z-fighting. */
const MARKER_ALTITUDE = EARTH_RADIUS * 1.012;

interface WebGPUEarthProps {
  dataPoints: DataPoint[];
  onMarkerClick: (point: DataPoint) => void;
  onMarkerHover: (point: DataPoint | null) => void;
  rotationSpeed?: number;
  isRotating?: boolean;
  /** Search fly-to target; `key` retriggers. Null = no flight. */
  flyTo?: { lat: number; lon: number; key: number } | null;
  /** Configurable sun direction (world space). Defaults to DEFAULT_SUN_DIRECTION. */
  sunDirection?: [number, number, number];
  onStatus?: (status: EarthStatus) => void;
}

const EASE_IN_OUT = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/**
 * Rejects if `promise` neither resolves nor rejects within `ms`.
 * Three.js GPU init / texture fetches can hang indefinitely on blocklisted
 * GPUs or stalled networks (no rejection, no error) — without this the
 * viewport would hold a black canvas forever instead of falling back to
 * WebGL. The loser of the race is left to settle harmlessly; unmount
 * disposal still runs via the `cancelled` flag.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

interface Flight {
  t: number;
  duration: number;
  from: THREE.Quaternion;
  to: THREE.Quaternion;
}

/** Deterministic pseudo-random for a stable starfield (no per-mount flicker). */
function makeStarPositions(count: number, inner: number, outer: number): Float32Array {
  const positions = new Float32Array(count * 3);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < count; i += 1) {
    const r = inner + rand() * (outer - inner);
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  return positions;
}

export default function WebGPUEarth({
  dataPoints,
  onMarkerClick,
  onMarkerHover,
  rotationSpeed = 0.0003,
  isRotating = true,
  flyTo = null,
  sunDirection = DEFAULT_SUN_DIRECTION,
  onStatus,
}: WebGPUEarthProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Latest props via refs — the engine loop subscribes once and reads
  // these, so animation never triggers React state updates per frame.
  const callbacksRef = useRef({ onMarkerClick, onMarkerHover, onStatus });
  useEffect(() => {
    callbacksRef.current = { onMarkerClick, onMarkerHover, onStatus };
  });

  const controlRef = useRef({ isRotating, rotationSpeed });
  useEffect(() => {
    controlRef.current = { isRotating, rotationSpeed };
  }, [isRotating, rotationSpeed]);

  const pointsRef = useRef<DataPoint[]>([]);
  const sunRef = useRef(sunDirection);
  useEffect(() => {
    sunRef.current = sunDirection;
  }, [sunDirection]);

  const flyToRef = useRef(flyTo);
  useEffect(() => {
    flyToRef.current = flyTo;
  }, [flyTo]);

  // ---- Marker sync handle (populated by the engine effect) ----
  const syncMarkersRef = useRef<(points: DataPoint[]) => void>(() => {});
  const requestFlightRef = useRef<(target: { lat: number; lon: number }) => void>(() => {});
  const setSunRef = useRef<(dir: [number, number, number]) => void>(() => {});

  // Keep the canonical valid-points array in ONE place: instance index N
  // always maps to validPoints[N] for count, positions and picking.
  useEffect(() => {
    pointsRef.current = filterValidPoints(dataPoints);
    syncMarkersRef.current(pointsRef.current);
  }, [dataPoints]);

  useEffect(() => {
    setSunRef.current(sunDirection);
  }, [sunDirection]);

  const lastFlyKey = useRef<number | null>(null);
  useEffect(() => {
    if (!flyTo) return;
    if (lastFlyKey.current === flyTo.key) return;
    lastFlyKey.current = flyTo.key;
    requestFlightRef.current({ lat: flyTo.lat, lon: flyTo.lon });
  }, [flyTo]);

  // ---- Engine lifecycle (mount once) ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let renderer: THREE.WebGPURenderer | null = null;
    let raf = 0;
    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(resource: T): T => {
      disposables.push(resource);
      return resource;
    };

    const emit = (status: EarthStatus) => {
      if (!cancelled) callbacksRef.current.onStatus?.(status);
    };

    const totalTextures = 5;
    let loadedTextures = 0;
    const bumpTextures = () => {
      loadedTextures += 1;
      if (loadedTextures < totalTextures) {
        emit({ phase: 'loading', renderer: 'webgpu', textures: { loaded: loadedTextures, total: totalTextures } });
      }
    };

    emit({ phase: 'loading', renderer: 'webgpu', textures: { loaded: 0, total: totalTextures } });

    // Mutable per-frame state owned by the loop (never React state).
    const flight: { current: Flight | null } = { current: null };
    const clock = { last: performance.now() };

    requestFlightRef.current = (target) => {
      const group = groupRef.current;
      if (!group) return;
      try {
        flight.current = {
          t: 0,
          duration: 1.4,
          from: group.quaternion.clone(),
          to: quaternionForLatLon(target.lat, target.lon),
        };
      } catch {
        flight.current = null;
      }
    };

    const groupRef: { current: THREE.Group | null } = { current: null };
    const markerMeshRef: { current: THREE.InstancedMesh | null } = { current: null };
    const markerDummy = new THREE.Object3D();
    const markerColor = new THREE.Color();
    const markerVec = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let sunVec = new THREE.Vector3(...sunRef.current).normalize();
    let sunLight: THREE.DirectionalLight | null = null;
    let sunUniform: { value: THREE.Vector3 } | null = null;

    setSunRef.current = (dir) => {
      sunVec = new THREE.Vector3(...dir).normalize();
      if (sunLight) sunLight.position.copy(sunVec).multiplyScalar(10);
      if (sunUniform) sunUniform.value.copy(sunVec);
    };

    syncMarkersRef.current = (points) => {
      const mesh = markerMeshRef.current;
      if (!mesh) return;
      mesh.count = points.length;
      points.forEach((point, i) => {
        latLonToVector3Into(markerVec, point.lat, point.lon, MARKER_ALTITUDE);
        markerDummy.position.copy(markerVec);
        markerDummy.lookAt(0, 0, 0);
        markerDummy.scale.setScalar(1);
        markerDummy.updateMatrix();
        mesh.setMatrixAt(i, markerDummy.matrix);
        markerColor.set(SEVERITY_COLORS[point.severity as SeverityLevel] ?? SEVERITY_COLORS.low);
        mesh.setColorAt(i, markerColor);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    const init = async () => {
      const canvas = document.createElement('canvas');
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);

      // Session 6: install the debug handle EARLY — before adapter init
      // and texture loads — so `window.__SENTINEL_WEBGPU__` exists whenever
      // the WebGPU component is mounted, even mid-initialization. The full
      // stats (frames, camera, frustum) replace this stub once the loop
      // starts. Diagnostic-only; never touches rendering.
      const installDebugHandle = (stats: () => Record<string, unknown>) => {
        try {
          (window as unknown as { __SENTINEL_WEBGPU__?: unknown }).__SENTINEL_WEBGPU__ = {
            stats,
          };
        } catch {
          /* debug handle is best-effort */
        }
      };
      const canvasStats = (extra?: Record<string, unknown>) => ({
        phase: 'initializing',
        framesSubmitted: 0,
        canvas: {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
          isConnected: canvas.isConnected,
        },
        ...(extra ?? {}),
      });
      installDebugHandle(() => canvasStats());

      // Textures are served from the Next.js public dir (absolute paths).
      const tex = (file: string) => `/textures/${file}`;
      const loader = new THREE.TextureLoader();

      renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
      if (typeof renderer.init === 'function') {
        // Adapter/device acquisition can hang (no rejection) on
        // blocklisted or busy GPUs — bound it so we fall back to WebGL.
        await withTimeout(renderer.init(), 15_000, 'WebGPU renderer.init()');
      }
      if (cancelled) return;
      const activeRenderer = renderer;

      const coarse =
        window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768;
      activeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
      activeRenderer.setClearColor(new THREE.Color('#020202'));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(0, 0, DEFAULT_CAMERA_DISTANCE);

      const controls = track(
        new OrbitControls(camera, canvas),
      );
      controls.enablePan = false;
      controls.enableZoom = true;
      controls.enableRotate = true;
      controls.minDistance = 7;
      controls.maxDistance = 30;
      controls.zoomSpeed = 0.5;
      controls.rotateSpeed = 0.5;
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      // Interruptible flights: any user drag cancels the slerp.
      const cancelFlight = () => {
        flight.current = null;
      };
      canvas.addEventListener('pointerdown', cancelFlight);
      canvas.addEventListener('wheel', cancelFlight, { passive: true });

      // ---- Textures (existing local assets) ----
      // Each fetch is bounded: a stalled texture must reject (→ WebGL
      // fallback) rather than leave the canvas black indefinitely.
      const loadTex = (file: string) =>
        withTimeout(loader.loadAsync(tex(file)), 25_000, `texture ${file}`);
      const [dayMap, nightMap, cloudMap, topologyMap, waterMap] = await Promise.all([
        loadTex('earth-day.jpg').then((t) => { bumpTextures(); return t; }),
        loadTex('earth-night.jpg').then((t) => { bumpTextures(); return t; }),
        loadTex('earth-clouds.png').then((t) => { bumpTextures(); return t; }),
        loadTex('earth-topology.png').then((t) => { bumpTextures(); return t; }),
        loadTex('earth-water.png').then((t) => { bumpTextures(); return t; }),
      ]);
      if (cancelled) return;
      dayMap.colorSpace = THREE.SRGBColorSpace;
      nightMap.colorSpace = THREE.SRGBColorSpace;
      cloudMap.colorSpace = THREE.SRGBColorSpace;
      disposables.push(
        { dispose: () => dayMap.dispose() },
        { dispose: () => nightMap.dispose() },
        { dispose: () => cloudMap.dispose() },
        { dispose: () => topologyMap.dispose() },
        { dispose: () => waterMap.dispose() },
      );

      // ---- Earth: TSL day/night blend driven by sun orientation ----
      const group = new THREE.Group();
      groupRef.current = group;
      scene.add(group);

      sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
      sunLight.position.copy(sunVec).multiplyScalar(10);
      scene.add(sunLight);
      const ambient = new THREE.AmbientLight(0xffffff, 0.35);
      scene.add(ambient);

      const sunDirectionUniform = uniform(sunVec.clone());
      sunUniform = sunDirectionUniform as unknown as { value: THREE.Vector3 };

      const dayNode = tslTexture(dayMap);
      const nightNode = tslTexture(nightMap);
      // Sun-facing factor in world space → smooth twilight transition.
      const facing = dot(normalize(normalWorld), normalize(sunDirectionUniform));
      const dayMix = smoothstep(float(-0.12), float(0.35), facing);

      const earthMaterial = track(
        new THREE.MeshStandardNodeMaterial(),
      );
      // Day continents on the sun side, city lights on the dark side.
      earthMaterial.colorNode = mix(nightNode.mul(float(1.5)), dayNode, dayMix);
      // Guaranteed night-lights glow (emissive ignores scene lighting).
      earthMaterial.emissive = new THREE.Color(0xffffff);
      earthMaterial.emissiveMap = nightMap;
      earthMaterial.emissiveIntensity = 0.9;
      earthMaterial.roughnessMap = waterMap;
      earthMaterial.roughness = 1.0;
      earthMaterial.bumpMap = topologyMap;
      earthMaterial.bumpScale = 0.6;

      const earthGeometry = track(new THREE.SphereGeometry(EARTH_RADIUS, 96, 96));
      const earth = new THREE.Mesh(earthGeometry, earthMaterial);
      group.add(earth);

      // ---- Clouds: independent slow drift shell ----
      const cloudMaterial = track(
        new THREE.MeshBasicMaterial({
          map: cloudMap,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const cloudGeometry = track(new THREE.SphereGeometry(EARTH_RADIUS * 1.008, 64, 64));
      const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
      group.add(clouds);

      // ---- Atmosphere: TSL Fresnel rim shell (BackSide, additive) ----
      // Physical planetary edge, not a glow: tight falloff (pow 4.5),
      // low gain (0.45), close shell (1.05×) — edge separation from space.
      // See src/shaders/atmosphere.ts for the matching WebGL-path params.
      const atmosphereMaterial = track(new THREE.MeshBasicNodeMaterial());
      {
        const viewDir = normalize(cameraPosition.sub(positionWorld));
        const rim = pow(saturate(float(1).sub(dot(normalize(normalWorld), viewDir))), float(4.5));
        atmosphereMaterial.colorNode = vec3(0.36, 0.56, 0.9).mul(rim).mul(float(0.45));
        atmosphereMaterial.transparent = true;
        atmosphereMaterial.blending = THREE.AdditiveBlending;
        atmosphereMaterial.side = THREE.BackSide;
        atmosphereMaterial.depthWrite = false;
      }
      const atmosphereGeometry = track(new THREE.SphereGeometry(EARTH_RADIUS * 1.05, 64, 64));
      const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
      // Atmosphere stays camera-facing: added to the scene, not the group,
      // so globe rotation never carries the rim with it.
      scene.add(atmosphere);

      // ---- Starfield ----
      {
        const starGeometry = track(new THREE.BufferGeometry());
        starGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(makeStarPositions(1800, 60, 120), 3),
        );
        const starMaterial = track(
          new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.4,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
          }),
        );
        const stars = new THREE.Points(starGeometry, starMaterial);
        stars.frustumCulled = false;
        scene.add(stars);
      }

      // ---- Environmental markers (instanced, same contract as WebGL) ----
      {
        const markerGeometry = track(new THREE.ConeGeometry(0.04, 0.15, 6));
        markerGeometry.translate(0, 0.075, 0);
        markerGeometry.rotateX(Math.PI / 2);
        const markerMaterial = track(
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }),
        );
        const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, 1);
        markers.frustumCulled = false;
        markerMeshRef.current = markers;
        group.add(markers);
        syncMarkersRef.current(pointsRef.current);
      }

      // ---- Picking: rAF-throttled hover, drag-discriminated click ----
      const pick = (e: MouseEvent): DataPoint | null => {
        const rect = canvas.getBoundingClientRect();
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const mesh = markerMeshRef.current;
        if (!mesh || pointsRef.current.length === 0) return null;
        const hits = raycaster.intersectObject(mesh);
        if (hits.length > 0) {
          const id = hits[0].instanceId;
          if (id !== undefined) return pointsRef.current[id] ?? null;
        }
        return null;
      };

      let pending: MouseEvent | null = null;
      let downX = 0;
      let downY = 0;
      const flushHover = () => {
        raf = 0;
        if (!pending) return;
        const hit = pick(pending);
        pending = null;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        callbacksRef.current.onMarkerHover(hit);
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
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
        const hit = pick(e);
        if (hit) callbacksRef.current.onMarkerClick(hit);
      };
      const onPointerLeave = () => {
        pending = null;
        callbacksRef.current.onMarkerHover(null);
      };
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('click', onClick);
      canvas.addEventListener('pointerleave', onPointerLeave);

      // ---- Resize from the actual container, not window ----
      const resize = () => {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        activeRenderer.setSize(w, h);
      };
      resize();
      const resizeObserver =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
      resizeObserver?.observe(container);

      // Late-arriving fly-to requested before init finished.
      const pendingFly = flyToRef.current;
      if (pendingFly) {
        try {
          flight.current = {
            t: 0,
            duration: 1.4,
            from: group.quaternion.clone(),
            to: quaternionForLatLon(pendingFly.lat, pendingFly.lon),
          };
        } catch {
          flight.current = null;
        }
      }

      // Surface asynchronous GPU failures (shader/pipeline compile errors,
      // bind-group mistakes, device loss) as status errors so EarthRenderer
      // can fall back to WebGL instead of holding a black canvas. Three.js
      // invokes these hooks; without them failures are silent console noise.
      const fail = (message: string) => {
        emit({
          phase: 'error',
          renderer: 'webgpu',
          textures: { loaded: loadedTextures, total: totalTextures },
          error: message,
        });
      };
      try {
        const hooks = activeRenderer as unknown as {
          onError?: (info: unknown) => void;
          onDeviceLost?: (info: unknown) => void;
        };
        const prevOnError = hooks.onError;
        const prevOnDeviceLost = hooks.onDeviceLost;
        hooks.onError = (info) => {
          // Preserve the default console logging; the defaults are
          // installed unbound, so rebind to the renderer instance.
          try {
            prevOnError?.call(activeRenderer, info);
          } catch {
            /* keep surfacing even if the previous hook throws */
          }
          const detail =
            info && typeof info === 'object'
              ? String(
                  (info as { message?: unknown }).message ??
                    (info as { type?: unknown }).type ??
                    'unknown GPU error',
                )
              : 'unknown GPU error';
          fail(`WebGPU render error: ${detail}`);
        };
        hooks.onDeviceLost = (info) => {
          // Same rebinding note as above; the default also records
          // `_isDeviceLost` on the renderer, which must be preserved.
          try {
            prevOnDeviceLost?.call(activeRenderer, info);
          } catch {
            /* keep surfacing even if the previous hook throws */
          }
          const detail =
            info && typeof info === 'object'
              ? String(
                  (info as { message?: unknown }).message ??
                    (info as { reason?: unknown }).reason ??
                    'device lost',
                )
              : 'device lost';
          fail(`WebGPU device lost: ${detail}`);
        };
      } catch {
        /* hook installation is best-effort; the watchdog still applies */
      }

      // ---- Frame loop: flight slerp wins over auto-rotate; delta-based ----
      // Session 5 root cause: this loop previously updated transforms and
      // controls but never called `renderer.render(scene, camera)`, so the
      // canvas held its clear color (black) forever while status reported
      // "ready". The render call below is the actual frame submission —
      // without it nothing is ever displayed.
      let framesSubmitted = 0;
      let readyEmitted = false;
      activeRenderer.setAnimationLoop(() => {
        if (cancelled) return;
        const now = performance.now();
        const delta = Math.min((now - clock.last) / 1000, 0.1);
        clock.last = now;

        const current = flight.current;
        if (current) {
          current.t += delta / current.duration;
          const k = EASE_IN_OUT(Math.min(current.t, 1));
          group.quaternion.slerpQuaternions(current.from, current.to, k);
          if (current.t >= 1) flight.current = null;
        } else if (controlRef.current.isRotating) {
          group.rotation.y += controlRef.current.rotationSpeed * delta * 60;
        }
        clouds.rotation.y += 0.0008 * delta * 60;
        controls.update();
        try {
          activeRenderer.render(scene, camera);
        } catch (err) {
          // Stop the dead loop immediately; the error status below makes
          // EarthRenderer swap in the WebGL fallback.
          activeRenderer.setAnimationLoop(null);
          fail(
            `WebGPU frame render failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          );
          return;
        }
        framesSubmitted += 1;
        // 'ready' means the loop has actually submitted frames — never
        // merely that `renderer.init()` resolved.
        if (!readyEmitted) {
          readyEmitted = true;
          emit({
            phase: 'ready',
            renderer: 'webgpu',
            textures: { loaded: totalTextures, total: totalTextures },
            frames: framesSubmitted,
          });
        }
      });

      // Live debug handle for real-browser A/B inspection (Session 5+6):
      // `__SENTINEL_WEBGPU__.stats()` returns frame count, canvas geometry,
      // camera state and scene child count without noisy per-frame logging.
      // Upgrades the early initializing stub installed at mount.
      installDebugHandle(() => ({
        phase: readyEmitted ? 'ready' : 'running',
        framesSubmitted,
        readyEmitted,
        canvas: {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
          isConnected: canvas.isConnected,
          rect: canvas.getBoundingClientRect().toJSON(),
          computedStyle: {
            display: getComputedStyle(canvas).display,
            visibility: getComputedStyle(canvas).visibility,
            opacity: getComputedStyle(canvas).opacity,
          },
        },
        renderer: {
          width: activeRenderer.domElement?.width ?? null,
          height: activeRenderer.domElement?.height ?? null,
        },
        camera: {
          position: camera.position.toArray(),
          near: camera.near,
          far: camera.far,
          aspect: camera.aspect,
        },
        sceneChildren: scene.children.length,
        earthInFrustum: new THREE.Frustum()
          .setFromProjectionMatrix(
            new THREE.Matrix4().multiplyMatrices(
              camera.projectionMatrix,
              camera.matrixWorldInverse,
            ),
          )
          .intersectsObject(earth),
      }));

      // Teardown for THIS successful init (overwrites the outer cleanup).
      teardown.current = () => {
        activeRenderer.setAnimationLoop(null);
        try {
          delete (window as unknown as { __SENTINEL_WEBGPU__?: unknown }).__SENTINEL_WEBGPU__;
        } catch {
          /* best-effort */
        }
        resizeObserver?.disconnect();
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('click', onClick);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('pointerdown', cancelFlight);
        canvas.removeEventListener('wheel', cancelFlight);
        try {
          controls.dispose();
        } catch {
          /* controls already disposed */
        }
        for (const resource of disposables) {
          try {
            resource.dispose();
          } catch {
            /* best-effort disposal */
          }
        }
        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry && !disposables.includes(mesh.geometry as unknown as { dispose: () => void })) {
            try {
              mesh.geometry.dispose();
            } catch {
              /* best-effort */
            }
          }
        });
        try {
          activeRenderer.dispose();
        } catch {
          /* best-effort */
        }
        canvas.remove();
        groupRef.current = null;
        markerMeshRef.current = null;
      };
    };

    const teardown: { current: () => void } = {
      current: () => {
        if (raf !== 0) cancelAnimationFrame(raf);
      },
    };

    init().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'WebGPU renderer failed to initialize.';
      emit({ phase: 'error', renderer: 'webgpu', textures: { loaded: loadedTextures, total: totalTextures }, error: message });
    });

    return () => {
      cancelled = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      try {
        teardown.current();
      } catch {
        /* unmount must never throw */
      }
      // Always drop the debug handle on unmount — including the init-failure
      // path where the success teardown never installed its own cleanup.
      try {
        delete (window as unknown as { __SENTINEL_WEBGPU__?: unknown }).__SENTINEL_WEBGPU__;
      } catch {
        /* best-effort */
      }
      syncMarkersRef.current = () => {};
      requestFlightRef.current = () => {};
      setSunRef.current = () => {};
      try {
        renderer?.dispose();
      } catch {
        /* best-effort */
      }
    };
    // Mount-once engine: prop changes flow through refs/effects above.
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      aria-hidden
    />
  );
}
