/**
 * Cesium footprint-entity sync (Phase 6).
 *
 * Lazy-chunk only: this module is imported exclusively by `CesiumEarth`,
 * which itself loads behind the `?renderer=cesium` dynamic boundary — never
 * import it from the initial route graph. The `cesium` imports below are
 * type-only and erased at runtime; the live namespace arrives as a
 * parameter (same seam as `cesiumObservations`, so tests substitute a fake
 * without WebGL).
 *
 * Rendering contract:
 * - One entity per footprint polygon (outer ring only — holes are not
 *   visualized; documented simplification).
 * - Entity identity is `${scene.id}#${polygonIndex}` (stable across syncs).
 * - Ground-clamped fill (ellipsoid terrain, so height 0 IS the surface);
 *   the selected scene gets a stronger fill.
 * - Deterministic entity cap (search returns ≤20 scenes; the cap guards
 *   against future callers, mirroring the observation entity cap).
 */
import type {
  Cartesian3,
  Color as CesiumColor,
  Entity as CesiumEntity,
  Viewer as CesiumViewer,
} from 'cesium';
import type { SceneFootprint, SceneSummary } from '@/types';

/** The slice of the Cesium namespace footprint sync needs (test seam). */
export interface FootprintRuntime {
  Cartesian3: typeof Cartesian3;
  Color: typeof CesiumColor;
}

/**
 * Entity capacity. One page is 20 scenes; S-class footprints are 1–10
 * polygons each, so the cap has generous headroom while remaining a hard
 * bound (deterministic truncation in array order, like the marker writer).
 */
export const FOOTPRINT_ENTITY_CAP = 400;

/** Per-entity coordinate guard (pathological rings never freeze the globe). */
export const FOOTPRINT_RING_VERTEX_CAP = 1024;

export const FOOTPRINT_FILL = 'rgba(34, 211, 238, 0.14)';
export const FOOTPRINT_FILL_SELECTED = 'rgba(34, 211, 238, 0.32)';
export const FOOTPRINT_OUTLINE = 'rgba(34, 211, 238, 0.85)';
export const FOOTPRINT_OUTLINE_SELECTED = 'rgba(103, 232, 249, 1)';

/** Live sync state owned by the component (never serialized). */
export interface FootprintSyncState {
  /** Entity per rendered `${sceneId}#${polygonIndex}` key. */
  entities: Map<string, CesiumEntity>;
  /** Scene per rendered scene id (pick resolution). */
  scenes: Map<string, SceneSummary>;
  /** Scene id per entity key (pick resolution to the owning scene). */
  owners: Map<string, string>;
  /** Selection flag as last rendered, per scene id (material diff). */
  selectedFlags: Map<string, boolean>;
}

export function createFootprintSyncState(): FootprintSyncState {
  return { entities: new Map(), scenes: new Map(), owners: new Map(), selectedFlags: new Map() };
}

/** Outer rings of a footprint, normalized to a polygon list. */
function footprintPolygons(footprint: SceneFootprint | null): number[][][][] {
  if (!footprint) return [];
  return footprint.type === 'Polygon' ? [footprint.coordinates] : footprint.coordinates;
}

function isValidRing(ring: unknown): ring is number[][] {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  return ring.every(
    (pt) =>
      Array.isArray(pt) &&
      pt.length >= 2 &&
      typeof pt[0] === 'number' &&
      typeof pt[1] === 'number' &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1]),
  );
}

/**
 * Id-diffed entity sync. Adds unknown keys, removes vanished keys, and
 * replaces entities whose scene object or selection state changed —
 * untouched entities stay stable across calls (no churn on re-renders with
 * identical data). Truncates deterministically at the cap. On a destroyed
 * Viewer it returns the previous state untouched (teardown owns disposal).
 */
export function syncFootprintEntities(args: {
  viewer: CesiumViewer;
  cesium: FootprintRuntime;
  state: FootprintSyncState;
  scenes: SceneSummary[];
  selectedId: string | null;
}): FootprintSyncState {
  const { viewer, cesium, state, scenes, selectedId } = args;
  if (viewer.isDestroyed()) return state;

  // Deterministic truncation at the entity cap (polygon-level).
  const wanted = new Map<string, { scene: SceneSummary; selected: boolean; ring: number[][] }>();
  budget: for (const scene of scenes) {
    const polygons = footprintPolygons(scene.footprint);
    for (let i = 0; i < polygons.length; i += 1) {
      if (wanted.size >= FOOTPRINT_ENTITY_CAP) break budget;
      const ring = polygons[i][0];
      if (!isValidRing(ring)) continue;
      wanted.set(`${scene.id}#${i}`, {
        scene,
        selected: scene.id === selectedId,
        ring: ring.slice(0, FOOTPRINT_RING_VERTEX_CAP),
      });
    }
  }
  const wantedScenes = new Set(scenes.map((scene) => scene.id));

  for (const [key, entity] of state.entities) {
    if (!wanted.has(key)) {
      try {
        viewer.entities.remove(entity);
      } catch {
        // Removal is best-effort; Viewer destroy disposes the rest.
      }
      state.entities.delete(key);
      state.owners.delete(key);
    }
  }
  for (const sceneId of state.scenes) {
    if (!wantedScenes.has(sceneId[0])) {
      state.scenes.delete(sceneId[0]);
      state.selectedFlags.delete(sceneId[0]);
    }
  }

  for (const [key, spec] of wanted) {
    const prevOwner = state.owners.get(key);
    const renderedSelected = state.selectedFlags.get(spec.scene.id);
    if (
      prevOwner === spec.scene.id &&
      state.scenes.get(spec.scene.id) === spec.scene &&
      renderedSelected === spec.selected &&
      state.entities.has(key)
    ) {
      continue;
    }
    const existing = state.entities.get(key);
    if (existing) {
      try {
        viewer.entities.remove(existing);
      } catch {
        // Best-effort; Viewer destroy disposes the rest.
      }
      state.entities.delete(key);
    }
    const positions = spec.ring.map(([lon, lat]) =>
      cesium.Cartesian3.fromDegrees(lon, lat, 0),
    );
    // `hierarchy` accepts a raw Cartesian3[] ring (Cesium wraps it in a
    // PolygonHierarchy internally) — no PolygonHierarchy needed at runtime.
    const entity = viewer.entities.add({
      id: key,
      polygon: {
        hierarchy: positions,
        material: cesium.Color.fromCssColorString(
          spec.selected ? FOOTPRINT_FILL_SELECTED : FOOTPRINT_FILL,
        ),
        height: 0,
        outline: true,
        outlineColor: cesium.Color.fromCssColorString(
          spec.selected ? FOOTPRINT_OUTLINE_SELECTED : FOOTPRINT_OUTLINE,
        ),
        outlineWidth: spec.selected ? 2 : 1,
      },
    });
    state.entities.set(key, entity);
    state.owners.set(key, spec.scene.id);
  }
  for (const scene of scenes) {
    state.scenes.set(scene.id, scene);
    state.selectedFlags.set(scene.id, scene.id === selectedId);
  }

  return state;
}

/**
 * Resolve a canvas position to a scene (`null` on any miss). `scene.pick`
 * returns the Entity under the cursor; non-entity hits resolve to null so
 * the caller can fall through to the observation/ellipsoid path.
 */
export function pickFootprintAt(
  viewer: CesiumViewer,
  state: FootprintSyncState,
  position: unknown,
): SceneSummary | null {
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
  const sceneId = state.owners.get(entityId);
  if (sceneId === undefined) return null;
  return state.scenes.get(sceneId) ?? null;
}

/**
 * Remove every synced footprint entity (teardown / unmount). Never touches
 * imagery layers, observation entities, or the Viewer itself.
 */
export function disposeFootprintEntities(
  viewer: CesiumViewer,
  state: FootprintSyncState,
): void {
  for (const [, entity] of state.entities) {
    try {
      viewer.entities.remove(entity);
    } catch {
      // Best-effort; Viewer destroy disposes the rest.
    }
  }
  state.entities.clear();
  state.scenes.clear();
  state.owners.clear();
  state.selectedFlags.clear();
}
