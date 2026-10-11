/**
 * Dotted Earth — the always-visible base globe (GLOBE-1).
 *
 * A 2D-canvas orthographic Earth rendered inside the real application
 * stage. It is the default renderer because it needs no GPU probe, no
 * WebGL/WebGPU context and no multi-megabyte textures: the ocean disc and
 * graticule draw on the first frame, and the land dots + coastline appear
 * the moment the *local* geography asset resolves. Layer data is never a
 * precondition — markers simply add on top when they arrive, and the
 * sphere stays drawn while data is loading, empty or errored.
 *
 * Visual treatment (per the wireframe dotted-globe brief): dark ocean,
 * evenly spaced grey dots on land, a restrained coastline stroke, a faint
 * graticule and a quiet limb ring. No aura, no glow, no gradient wash.
 *
 * Performance discipline:
 * - land point-in-polygon work runs ONCE per session (`buildLandDotField`),
 *   never inside the frame loop;
 * - the rAF loop only runs while there is something to animate (drag,
 *   fly-to flight, or enabled auto-rotation) and never while the tab is
 *   hidden; otherwise the globe is drawn on demand and then goes idle;
 * - `prefers-reduced-motion` disables auto-rotation and makes fly-to
 *   jump instead of ease;
 * - dot/marker projection writes into caller-owned objects (no per-frame
 *   allocation), and the canvas backing store is capped at DPR 2 with the
 *   transform reset on every resize.
 *
 * Failure honesty: if the geography asset cannot be loaded the component
 * still renders the ocean + graticule sphere (so the stage is never
 * blank) but reports `geography unavailable` — it never claims the Earth
 * rendered correctly.
 */
import { memo, useEffect, useRef } from 'react';
import { geoGraticule, geoOrthographic, geoPath } from 'd3-geo';
import { filterValidPoints } from '@/lib/geo';
import { SEVERITY_COLORS } from '@/types';
import type { DataPoint, SeverityLevel } from '@/types';
import type { RendererInfo } from '../EarthRenderer';
import { loadLandAsset } from './landGeo';
import type { LandAsset } from './landGeo';
import { buildLandDotField, dotFieldCount } from './dotField';
import {
  MIN_ZOOM,
  clampTilt,
  interpolateView,
  projectInto,
  viewFor,
  wrapLongitude,
  zoomFromWheel,
} from './globeProjection';
import type { GlobeView, ProjectedImage } from './globeProjection';

/** Globe disc diameter as a fraction of the smaller stage dimension. */
const GLOBE_FRACTION = 0.42;
/** Ambient rotation rate — a full revolution every six minutes. */
const AUTO_ROTATE_DEG_PER_SEC = 1;
/** Degrees of rotation per pointer pixel at zoom 1. */
const DRAG_SENSITIVITY_DEG_PER_PX = 0.28;
const FLY_DURATION_MS = 1400;
/** Screen-space pick radius for markers (px). */
const PICK_RADIUS_PX = 10;
const MARKER_RADIUS_PX = 3.2;
/** A pointer travel above this distance is a drag, never a click. */
const DRAG_THRESHOLD_PX = 6;

const OCEAN_FILL = '#070a0e';
const LIMB_STROKE = 'rgba(255, 255, 255, 0.16)';
const LAND_DOT_FILL = 'rgba(226, 230, 235, 0.72)';
const COASTLINE_STROKE = 'rgba(255, 255, 255, 0.3)';
const GRATICULE_STROKE = 'rgba(255, 255, 255, 0.06)';
const MARKER_RING_STROKE = 'rgba(8, 10, 14, 0.85)';
const TAU = Math.PI * 2;

const GRATICULE = geoGraticule().step([15, 15])();

export interface DottedEarthStatus {
  phase: 'loading' | 'ready' | 'error';
  detail: string;
}

interface DottedEarthProps {
  dataPoints?: DataPoint[];
  onMarkerClick?: (point: DataPoint) => void;
  onMarkerHover?: (point: DataPoint | null) => void;
  isRotating?: boolean;
  /** Search fly-to target; `key` retriggers. Null = no flight. */
  flyTo?: { lat: number; lon: number; key: number } | null;
  onActiveRenderer?: (info: RendererInfo) => void;
}

function getPixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  const coarse =
    window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768;
  return Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
}

function prefersReducedMotion(): boolean {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

function DottedEarth({
  dataPoints,
  onMarkerClick = () => {},
  onMarkerHover = () => {},
  isRotating = true,
  flyTo = null,
  onActiveRenderer,
}: DottedEarthProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Latest props via refs: the engine subscribes once and never re-renders
  // for prop changes, so hover/selection in the shell stays free.
  const callbacksRef = useRef({ onMarkerClick, onMarkerHover, onActiveRenderer });
  useEffect(() => {
    callbacksRef.current = { onMarkerClick, onMarkerHover, onActiveRenderer };
  });

  const controlRef = useRef({ isRotating });
  useEffect(() => {
    controlRef.current = { isRotating };
  }, [isRotating]);

  // Engine handles filled by the mount effect; these are the only two
  // props that legitimately need to poke the engine from React effects.
  const requestDrawRef = useRef<() => void>(() => {});
  const requestFlightRef = useRef<(target: { lat: number; lon: number }) => void>(() => {});

  const pointsRef = useRef<DataPoint[]>([]);
  useEffect(() => {
    pointsRef.current = filterValidPoints(dataPoints ?? []);
    requestDrawRef.current();
  }, [dataPoints]);

  const lastFlyKey = useRef<number | null>(null);
  useEffect(() => {
    if (!flyTo) return;
    if (lastFlyKey.current === flyTo.key) return;
    lastFlyKey.current = flyTo.key;
    requestFlightRef.current({ lat: flyTo.lat, lon: flyTo.lon });
  }, [flyTo]);

  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let cancelled = false;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }

    // ---- view state (owned by the loop, never React state) ----
    let lon = 0;
    let lat = 12;
    let zoom = 1;
    let baseRadius = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    const view: GlobeView = { lon, lat, scale: 0, cx: 0, cy: 0 };
    const image: ProjectedImage = { x: 0, y: 0 };
    let land: LandAsset | null = null;
    let dots: Float32Array = new Float32Array(0);
    const markerHits: Array<{ x: number; y: number; point: DataPoint }> = [];

    let raf = 0;
    let lastStep = performance.now();
    const flight: { t: number; from: { lon: number; lat: number }; to: { lon: number; lat: number } } | null =
      { t: 0, from: { lon, lat }, to: { lon, lat } };
    let flightActive = false;
    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let travel = 0;

    reducedMotionRef.current = prefersReducedMotion();

    const emit = (phase: DottedEarthStatus['phase'], detail: string) => {
      if (cancelled) return;
      callbacksRef.current.onActiveRenderer?.({
        active: 'dotted',
        detail,
        textures: { loaded: 0, total: 0 },
        source: 'automatic',
      });
    };

    emit('loading', 'loading geography…');

    // ---- projection + path helpers ----
    // A fresh instance per mount so Strict Mode remounts never share
    // mutated scale/translate/rotate state.
    const projection = geoOrthographic();
    const path = geoPath(projection).context(ctx);

    const shouldAnimate = (): boolean => {
      if (typeof document !== 'undefined' && document.hidden) return false;
      if (flightActive) return true;
      if (pointerId !== null) return true;
      return controlRef.current.isRotating && !reducedMotionRef.current;
    };

    const step = (now: number) => {
      const delta = Math.min((now - lastStep) / 1000, 0.1);
      lastStep = now;
      if (flightActive) {
        flight.t += (delta * 1000) / FLY_DURATION_MS;
        const k = Math.min(1, flight.t);
        const eased = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
        const next = interpolateView(flight.from, flight.to, eased);
        lon = next.lon;
        lat = next.lat;
        if (k >= 1) flightActive = false;
      } else if (controlRef.current.isRotating && !reducedMotionRef.current) {
        lon = wrapLongitude(lon + AUTO_ROTATE_DEG_PER_SEC * delta);
      }
    };

    const draw = () => {
      if (!ctx || width <= 0 || height <= 0) return;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      view.lon = lon;
      view.lat = lat;
      view.scale = baseRadius * zoom;
      view.cx = width / 2;
      view.cy = height / 2;
      const radius = view.scale;
      if (radius <= 0) return;

      projection
        .scale(radius)
        .translate([view.cx, view.cy])
        .rotate([-view.lon, -view.lat]);

      // Ocean disc — the geographic base is present before any data exists.
      ctx.beginPath();
      ctx.arc(view.cx, view.cy, radius, 0, TAU);
      ctx.fillStyle = OCEAN_FILL;
      ctx.fill();

      ctx.save();
      ctx.clip();

      ctx.beginPath();
      path(GRATICULE);
      ctx.strokeStyle = GRATICULE_STROKE;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      if (land) {
        ctx.beginPath();
        path(land);
        ctx.strokeStyle = COASTLINE_STROKE;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      if (dots.length > 0) {
        const dotRadius = Math.min(1.7, Math.max(0.85, radius / 210));
        ctx.beginPath();
        for (let i = 0; i < dots.length; i += 2) {
          if (!projectInto(view, dots[i + 1] as number, dots[i] as number, image)) continue;
          ctx.moveTo(image.x + dotRadius, image.y);
          ctx.arc(image.x, image.y, dotRadius, 0, TAU);
        }
        ctx.fillStyle = LAND_DOT_FILL;
        ctx.fill();
      }

      ctx.restore();

      ctx.beginPath();
      ctx.arc(view.cx, view.cy, radius, 0, TAU);
      ctx.strokeStyle = LIMB_STROKE;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Markers — same canonical valid-points array as picking, so rendered
      // marker N is always data point N.
      markerHits.length = 0;
      for (const point of pointsRef.current) {
        if (!projectInto(view, point.lat, point.lon, image)) continue;
        markerHits.push({ x: image.x, y: image.y, point });
        ctx.beginPath();
        ctx.arc(image.x, image.y, MARKER_RADIUS_PX, 0, TAU);
        ctx.fillStyle = SEVERITY_COLORS[point.severity as SeverityLevel] ?? SEVERITY_COLORS.low;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = MARKER_RING_STROKE;
        ctx.stroke();
      }
    };

    const tick = () => {
      raf = 0;
      step(performance.now());
      draw();
      if (shouldAnimate()) raf = requestAnimationFrame(tick);
    };

    const requestDraw = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    requestDrawRef.current = requestDraw;

    requestFlightRef.current = (target) => {
      const next = viewFor(target.lat, target.lon);
      if (reducedMotionRef.current) {
        lon = next.lon;
        lat = next.lat;
        flightActive = false;
        requestDraw();
        return;
      }
      flight.t = 0;
      flight.from = { lon, lat };
      flight.to = next;
      flightActive = true;
      requestDraw();
    };

    // ---- sizing ----
    const applySize = (nextWidth: number, nextHeight: number) => {
      const w = Math.max(0, Math.floor(nextWidth));
      const h = Math.max(0, Math.floor(nextHeight));
      const dpr = getPixelRatio();
      if (w === width && h === height && dpr === pixelRatio) return;
      width = w;
      height = h;
      pixelRatio = dpr;
      baseRadius = Math.min(w, h) * GLOBE_FRACTION;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      // CSS sizing stays in the stylesheet (width/height: 100%) — the
      // backing-store attributes above are what change here, so the
      // transform must be rebuilt on every draw (done in `draw`).
      requestDraw();
    };

    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) applySize(rect.width, rect.height);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (!entry) return;
            const box = entry.contentRect;
            applySize(box.width, box.height);
          })
        : null;
    resizeObserver?.observe(container);

    // ---- geography (local asset, one request, never per frame) ----
    loadLandAsset()
      .then((asset) => {
        if (cancelled) return;
        land = asset;
        dots = buildLandDotField(asset);
        emit('ready', `ready · ${dotFieldCount(dots)} land dots`);
        requestDraw();
      })
      .catch(() => {
        if (cancelled) return;
        // Bare sphere + graticule still render; never claim success.
        emit('error', 'geography unavailable — local land asset failed to load');
        requestDraw();
      });

    // ---- interaction ----
    const cancelFlight = () => {
      flightActive = false;
    };

    const pick = (clientX: number, clientY: number): DataPoint | null => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const limit = PICK_RADIUS_PX * PICK_RADIUS_PX;
      let best: DataPoint | null = null;
      let bestDistance = limit;
      for (const hit of markerHits) {
        const dx = hit.x - x;
        const dy = hit.y - y;
        const distance = dx * dx + dy * dy;
        if (distance <= bestDistance) {
          bestDistance = distance;
          best = hit.point;
        }
      }
      return best;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      travel = 0;
      cancelFlight();
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort (e.g. jsdom) */
      }
      lastStep = performance.now();
      requestDraw();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== null && event.pointerId === pointerId) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        travel += Math.abs(dx) + Math.abs(dy);
        const sensitivity = DRAG_SENSITIVITY_DEG_PER_PX / Math.max(MIN_ZOOM, zoom);
        lon = wrapLongitude(lon - dx * sensitivity);
        lat = clampTilt(lat + dy * sensitivity);
        requestDraw();
        return;
      }
      if (pointerId !== null) return;
      const hit = pick(event.clientX, event.clientY);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      callbacksRef.current.onMarkerHover(hit);
    };

    const endPointer = (event: PointerEvent, allowClick: boolean) => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* best-effort */
      }
      pointerId = null;
      if (allowClick && travel <= DRAG_THRESHOLD_PX) {
        const hit = pick(event.clientX, event.clientY);
        if (hit) callbacksRef.current.onMarkerClick(hit);
      }
      lastStep = performance.now();
      requestDraw();
    };

    const onPointerUp = (event: PointerEvent) => endPointer(event, true);
    const onPointerCancel = (event: PointerEvent) => endPointer(event, false);

    const onPointerLeave = () => {
      if (pointerId !== null) return;
      canvas.style.cursor = '';
      callbacksRef.current.onMarkerHover(null);
    };

    const onWheel = (event: WheelEvent) => {
      // Scoped to the globe: panel/list scrolling is untouched because the
      // shell islands sit above this canvas and own their own wheel events.
      event.preventDefault();
      cancelFlight();
      zoom = zoomFromWheel(zoom, event.deltaY);
      requestDraw();
    };

    const onDoubleClick = () => {
      zoom = MIN_ZOOM;
      requestDraw();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.style.cursor = 'grab';

    const onVisibility = () => {
      if (document.hidden) {
        if (raf !== 0) cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      lastStep = performance.now();
      requestDraw();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const motionQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const onMotionChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
      requestDraw();
    };
    motionQuery?.addEventListener?.('change', onMotionChange);

    // Initial frame (static when reduced motion, spinning otherwise).
    requestDraw();

    return () => {
      cancelled = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      resizeObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery?.removeEventListener?.('change', onMotionChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.style.cursor = '';
      markerHits.length = 0;
      callbacksRef.current.onMarkerHover(null);
      requestDrawRef.current = () => {};
      requestFlightRef.current = () => {};
    };
    // Mount-once engine: prop changes flow through the refs/effects above.
  }, []);

  const setContainerRef = containerRef;

  return (
    <div ref={setContainerRef} className="dotted-earth">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Interactive dotted Earth basemap"
      />
      <p className="sr-only">
        Drag the globe to rotate it and scroll to zoom. Event markers drawn on
        the globe are also listed in the data panel.
      </p>
    </div>
  );
}

export default memo(DottedEarth);
