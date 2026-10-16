/**
 * Cesium observation-entity sync (Phase 5, O1–O4).
 *
 * Lazy-chunk only: this module (and the `cesium` runtime it drives) is
 * imported exclusively by `CesiumEarth`, which itself loads behind the
 * `?renderer=cesium` dynamic boundary. Never import it from the initial
 * route graph. The `cesium` imports below are type-only and erased at
 * runtime — the live namespace arrives as a parameter (same seam as the
 * Phase 4 provider factory, so tests substitute a fake without WebGL).
 *
 * Parity contract (mirrors the dotted/WebGL branches — see the Phase 5
 * implementation report §parity):
 * - Markers render every *valid* point (`filterValidPoints`); neither
 *   legacy branch filters by severity, so neither does this module.
 * - Colors come from the shared `SEVERITY_COLORS` vocabulary (exact).
 * - Sizes are uniform (legacy marker sizes ignore magnitude too).
 * - Entity identity is the stable `point.id` (never an array index).
 * - Empty-globe picks are NOT entities: the component falls through to
 *   the existing `pickEllipsoid` coordinate readout (Phase 2 contract).
 */
import type {
  Cartesian3,
  Color as CesiumColor,
  Entity as CesiumEntity,
  HeightReference as CesiumHeightReference,
  Viewer as CesiumViewer,
} from 'cesium';
import { filterValidPoints } from '@/lib/geo';
import { SEVERITY_COLORS } from '@/types';
import type { DataPoint, SeverityLevel } from '@/types';

/** The slice of the Cesium namespace entity sync needs (test seam). */
export interface ObservationRuntime {
  Cartesian3: typeof Cartesian3;
  Color: typeof CesiumColor;
  HeightReference: typeof CesiumHeightReference;
}

/**
 * Entity capacity. Mirrors the legacy instanced-marker capacity
 * (`MARKER_CAPACITY`, itself `MAX_LIMIT` = 2000) — pinned by
 * `cesiumObservations.test.ts` so the two can never drift. Truncation is
 * deterministic (array order, like the legacy instance writer).
 */
export const OBSERVATION_ENTITY_CAP = 2000;

/**
 * Click/drag discrimination (px of pointer travel). Mirrors the dotted
 * (`DRAG_THRESHOLD_PX`) and WebGL (`> 6`) branches exactly — a wider
 * travel is a camera drag, never a selection. Pinned by test.
 */
export const OBSERVATION_CLICK_DRAG_THRESHOLD_PX = 6;

/** Live sync state owned by the component (never serialized). */
export interface ObservationSyncState {
  /** Entity per rendered point id. */
  entities: Map<string, CesiumEntity>;
  /** Point per rendered point id (pick resolution). */
  points: Map<string, DataPoint>;
}

export function createObservationSyncState(): ObservationSyncState {
  return { entities: new Map(), points: new Map() };
}

function severityColorCss(severity: DataPoint['severity']): string {
  return (
    SEVERITY_COLORS[severity as SeverityLevel] ?? SEVERITY_COLORS.low
  );
}

/**
 * Build one shared marker sprite (white disc, transparent surround).
 * Per-severity color comes from the billboard `color` tint, so a single
 * image serves every layer. Created once per Viewer by the component and
 * injected here (tests substitute a stub — pixels are not behavior).
 */
export function createMarkerSprite(
  doc: Document = document,
  diameter = 24,
): HTMLCanvasElement {
  const canvas = doc.createElement('canvas');
  canvas.width = diameter;
  canvas.height = diameter;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const r = diameter / 2;
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  return canvas;
}

/**
 * Id-diffed entity sync. Adds unknown ids, removes vanished ids,
 * replaces entities whose coordinates or severity changed, and keeps
 * untouched entities stable across calls (no churn on re-renders with
 * identical data). Truncates deterministically at the cap. Invalid
 * coordinates never become entities (`filterValidPoints`). Safe to call
 * with the same array twice (second call is a no-op). Returns the new
 * state; on a destroyed Viewer it returns the previous state untouched
 * (teardown owns disposal — sync never destroys the Viewer).
 */
export function syncObservationEntities(args: {
  viewer: CesiumViewer;
  cesium: ObservationRuntime;
  sprite: HTMLCanvasElement | string;
  state: ObservationSyncState;
  points: DataPoint[];
}): ObservationSyncState {
  const { viewer, cesium, sprite, state, points } = args;
  if (viewer.isDestroyed()) return state;
  const valid = filterValidPoints(points).slice(0, OBSERVATION_ENTITY_CAP);
  const wanted = new Set(valid.map((point) => point.id));

  for (const [id, entity] of state.entities) {
    if (!wanted.has(id)) {
      try {
        viewer.entities.remove(entity);
      } catch {
        // Removal is best-effort; Viewer destroy disposes the rest.
      }
      state.entities.delete(id);
      state.points.delete(id);
    }
  }

  for (const point of valid) {
    const prev = state.points.get(point.id);
    const existing = state.entities.get(point.id);
    if (
      existing &&
      prev &&
      prev.lat === point.lat &&
      prev.lon === point.lon &&
      prev.severity === point.severity
    ) {
      continue;
    }
    if (existing) {
      try {
        viewer.entities.remove(existing);
      } catch {
        // Best-effort; Viewer destroy disposes the rest.
      }
      state.entities.delete(point.id);
    }
    const entity = viewer.entities.add({
      id: point.id,
      position: cesium.Cartesian3.fromDegrees(point.lon, point.lat, 0),
      billboard: {
        image: sprite,
        color: cesium.Color.fromCssColorString(severityColorCss(point.severity)),
        heightReference: cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    state.entities.set(point.id, entity);
    state.points.set(point.id, point);
  }

  return state;
}

/**
 * Resolve a canvas position to an observation (`null` on any miss).
 * `scene.pick` returns the Entity under the cursor for entity hits; globe,
 * imagery, or empty-space picks carry no string entity id and resolve to
 * `null` so the caller can fall through to the ellipsoid readout.
 */
export function pickObservationAt(
  viewer: CesiumViewer,
  state: ObservationSyncState,
  position: unknown,
): DataPoint | null {
  if (viewer.isDestroyed() || !position) return null;
  let picked: unknown;
  try {
    picked = viewer.scene.pick(position as never);
  } catch {
    return null;
  }
  const entity = (picked as { id?: unknown } | null | undefined)?.id as
    | { id?: unknown }
    | undefined;
  const entityId = entity?.id;
  if (typeof entityId !== 'string') return null;
  return state.points.get(entityId) ?? null;
}

/**
 * Remove every synced entity (layer teardown / unmount). Never touches
 * imagery layers, handlers, or the Viewer itself.
 */
export function disposeObservationEntities(
  viewer: CesiumViewer,
  state: ObservationSyncState,
): void {
  for (const [, entity] of state.entities) {
    try {
      viewer.entities.remove(entity);
    } catch {
      // Best-effort; Viewer destroy disposes the rest.
    }
  }
  state.entities.clear();
  state.points.clear();
}
