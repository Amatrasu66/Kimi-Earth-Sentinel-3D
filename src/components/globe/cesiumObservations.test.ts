import { describe, expect, it, vi } from 'vitest';
import { MARKER_CAPACITY } from '@/components/globe/markerSync';
import { SEVERITY_COLORS } from '@/types';
import type { DataPoint } from '@/types';
import {
  OBSERVATION_CLICK_DRAG_THRESHOLD_PX,
  OBSERVATION_ENTITY_CAP,
  createMarkerSprite,
  createObservationSyncState,
  disposeObservationEntities,
  pickObservationAt,
  syncObservationEntities,
} from './cesiumObservations';
import type { ObservationRuntime } from './cesiumObservations';

interface FakeEntity {
  id: string;
  options: Record<string, unknown>;
}

function makePoint(overrides: Partial<DataPoint> = {}): DataPoint {
  return {
    id: 'p1',
    lat: 35.6,
    lon: 139.6,
    severity: 'high',
    timestamp: '2026-10-15T00:00:00Z',
    ...overrides,
  };
}

function fakeViewer() {
  const entities = new Map<string, FakeEntity>();
  return {
    _entities: entities,
    entities: {
      add: vi.fn((options: { id: string } & Record<string, unknown>) => {
        const entity: FakeEntity = { id: options.id, options };
        entities.set(options.id, entity);
        return entity;
      }),
      remove: vi.fn((entity: FakeEntity) => entities.delete(entity.id)),
    },
    scene: {
      pick: vi.fn((): unknown => undefined),
    },
    isDestroyed: vi.fn(() => false),
  };
}

type FakeViewer = ReturnType<typeof fakeViewer>;

function fakeCesium(): ObservationRuntime {
  return {
    Cartesian3: {
      fromDegrees: vi.fn((lon: number, lat: number, height = 0) => ({ lon, lat, height })),
    },
    Color: {
      fromCssColorString: vi.fn((css: string) => ({ css })),
    },
    HeightReference: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND' },
  } as unknown as ObservationRuntime;
}

function sync(viewer: FakeViewer, points: DataPoint[], state = createObservationSyncState()) {
  return syncObservationEntities({
    viewer: viewer as never,
    cesium: fakeCesium(),
    sprite: 'test-sprite',
    state,
    points,
  });
}

describe('observation entity sync (Phase 5)', () => {
  it('shares the legacy marker capacity (no divergent cap)', () => {
    expect(OBSERVATION_ENTITY_CAP).toBe(MARKER_CAPACITY);
    expect(OBSERVATION_ENTITY_CAP).toBe(2000);
  });

  it('shares the legacy 6 px click/drag rule (dotted + WebGL parity)', () => {
    expect(OBSERVATION_CLICK_DRAG_THRESHOLD_PX).toBe(6);
  });

  it('creates one billboard per valid point with severity colors', () => {
    const viewer = fakeViewer();
    const points = [
      makePoint({ id: 'a', severity: 'low' }),
      makePoint({ id: 'b', severity: 'moderate' }),
      makePoint({ id: 'c', severity: 'high' }),
      makePoint({ id: 'd', severity: 'critical' }),
    ];
    const state = sync(viewer, points);
    expect(viewer._entities.size).toBe(4);
    expect(state.points.size).toBe(4);
    for (const point of points) {
      const entity = viewer._entities.get(point.id);
      expect(entity).toBeDefined();
      const billboard = entity?.options.billboard as { color: { css: string } };
      expect(billboard.color.css).toBe(SEVERITY_COLORS[point.severity]);
    }
    // Positions follow the app lat/lon convention (lon first for Cesium).
    const entity = viewer._entities.get('a');
    const position = entity?.options.position as { lon: number; lat: number };
    expect(position.lon).toBe(139.6);
    expect(position.lat).toBe(35.6);
  });

  it('skips invalid coordinates (never entities)', () => {
    const viewer = fakeViewer();
    const state = sync(viewer, [
      makePoint({ id: 'ok' }),
      makePoint({ id: 'bad-lat', lat: 500 }),
      makePoint({ id: 'bad-lon', lon: 181 }),
      makePoint({ id: 'nan', lat: NaN }),
    ]);
    expect(viewer._entities.size).toBe(1);
    expect(state.points.has('ok')).toBe(true);
  });

  it('truncates deterministically at the capacity', () => {
    const viewer = fakeViewer();
    const points = Array.from({ length: OBSERVATION_ENTITY_CAP + 5 }, (_, i) =>
      makePoint({ id: `p${i}`, lat: (i % 170) - 85, lon: (i % 360) - 180 }),
    );
    const state = sync(viewer, points);
    expect(viewer._entities.size).toBe(OBSERVATION_ENTITY_CAP);
    expect(state.points.size).toBe(OBSERVATION_ENTITY_CAP);
    // Array order wins (first N kept, like the legacy instance writer).
    expect(state.points.has('p0')).toBe(true);
    expect(state.points.has(`p${OBSERVATION_ENTITY_CAP + 4}`)).toBe(false);
  });

  it('diffs by stable id across updates (no duplicates, no churn)', () => {
    const viewer = fakeViewer();
    const first = [makePoint({ id: 'a' }), makePoint({ id: 'b' })];
    const state = sync(viewer, first);
    const entityA = viewer._entities.get('a');
    expect(viewer.entities.add).toHaveBeenCalledTimes(2);

    // Re-sync identical data: no-op.
    sync(viewer, first, state);
    expect(viewer.entities.add).toHaveBeenCalledTimes(2);
    expect(viewer.entities.remove).not.toHaveBeenCalled();

    // b leaves, c arrives, a is untouched.
    const second = [makePoint({ id: 'a' }), makePoint({ id: 'c' })];
    sync(viewer, second, state);
    expect(viewer.entities.add).toHaveBeenCalledTimes(3);
    expect(viewer._entities.has('b')).toBe(false);
    expect(viewer._entities.get('a')).toBe(entityA);
    expect(state.points.has('b')).toBe(false);
  });

  it('replaces entities whose coordinates or severity changed', () => {
    const viewer = fakeViewer();
    const state = sync(viewer, [makePoint({ id: 'a', severity: 'low' })]);
    const before = viewer._entities.get('a');

    sync(viewer, [makePoint({ id: 'a', severity: 'critical' })], state);
    const after = viewer._entities.get('a');
    expect(after).not.toBe(before);
    const billboard = after?.options.billboard as { color: { css: string } };
    expect(billboard.color.css).toBe(SEVERITY_COLORS.critical);
  });

  it('empties the globe when the layer has no points', () => {
    const viewer = fakeViewer();
    const state = sync(viewer, [makePoint({ id: 'a' })]);
    expect(viewer._entities.size).toBe(1);
    sync(viewer, [], state);
    expect(viewer._entities.size).toBe(0);
    expect(state.points.size).toBe(0);
  });

  it('does nothing on a destroyed Viewer', () => {
    const viewer = fakeViewer();
    viewer.isDestroyed.mockReturnValue(true);
    const state = sync(viewer, [makePoint({ id: 'a' })]);
    expect(viewer._entities.size).toBe(0);
    expect(state.points.size).toBe(0);
  });

  it('disposes every entity without touching anything else', () => {
    const viewer = fakeViewer();
    const state = sync(viewer, [makePoint({ id: 'a' }), makePoint({ id: 'b' })]);
    disposeObservationEntities(viewer as never, state);
    expect(viewer._entities.size).toBe(0);
    expect(state.entities.size).toBe(0);
    expect(state.points.size).toBe(0);
    expect(viewer.entities.remove).toHaveBeenCalledTimes(2);
  });
});

describe('observation picking (Phase 5)', () => {
  it('resolves entity hits to points by stable id', () => {
    const viewer = fakeViewer();
    const point = makePoint({ id: 'quake-1' });
    const state = sync(viewer, [point]);
    const entity = viewer._entities.get('quake-1');
    viewer.scene.pick.mockReturnValue({ id: entity });
    expect(pickObservationAt(viewer as never, state, { x: 1, y: 2 })).toBe(point);
  });

  it('returns null for globe, imagery, and empty-space picks', () => {
    const viewer = fakeViewer();
    const state = sync(viewer, [makePoint({ id: 'a' })]);
    // Globe/ellipsoid pick objects carry no string entity id.
    viewer.scene.pick.mockReturnValue({ id: { radii: 'wgs84' } });
    expect(pickObservationAt(viewer as never, state, { x: 1, y: 2 })).toBeNull();
    viewer.scene.pick.mockReturnValue(undefined);
    expect(pickObservationAt(viewer as never, state, { x: 1, y: 2 })).toBeNull();
    viewer.scene.pick.mockReturnValue(null);
    expect(pickObservationAt(viewer as never, state, { x: 1, y: 2 })).toBeNull();
  });

  it('returns null for unknown entity ids and missing positions', () => {
    const viewer = fakeViewer();
    const state = sync(viewer, [makePoint({ id: 'a' })]);
    viewer.scene.pick.mockReturnValue({ id: { id: 'removed-elsewhere' } });
    expect(pickObservationAt(viewer as never, state, { x: 1, y: 2 })).toBeNull();
    expect(pickObservationAt(viewer as never, state, null)).toBeNull();
    expect(pickObservationAt(viewer as never, state, undefined)).toBeNull();
  });

  it('returns null when the Viewer is destroyed or pick throws', () => {
    const viewer = fakeViewer();
    const state = sync(viewer, [makePoint({ id: 'a' })]);
    viewer.isDestroyed.mockReturnValue(true);
    expect(pickObservationAt(viewer as never, state, { x: 1, y: 2 })).toBeNull();
    viewer.isDestroyed.mockReturnValue(false);
    viewer.scene.pick.mockImplementation(() => {
      throw new Error('context lost');
    });
    expect(pickObservationAt(viewer as never, state, { x: 1, y: 2 })).toBeNull();
  });
});

describe('marker sprite (Phase 5)', () => {
  it('falls back to an empty canvas when 2d context is unavailable', () => {
    const canvas = { width: 0, height: 0, getContext: () => null };
    const doc = { createElement: () => canvas } as unknown as Document;
    const sprite = createMarkerSprite(doc, 24);
    expect(sprite.width).toBe(24);
    expect(sprite.height).toBe(24);
  });
});
