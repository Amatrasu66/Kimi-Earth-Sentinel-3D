/**
 * Phase 6 footprint entity-sync tests. Same fake-Viewer/fake-runtime seam as
 * cesiumObservations.test.ts — no WebGL, no Cesium import at runtime.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  FOOTPRINT_ENTITY_CAP,
  FOOTPRINT_FILL,
  FOOTPRINT_FILL_SELECTED,
  createFootprintSyncState,
  disposeFootprintEntities,
  pickFootprintAt,
  syncFootprintEntities,
} from './cesiumFootprints';
import type { FootprintRuntime } from './cesiumFootprints';
import type { SceneSummary } from '@/types';

const POLY = [
  [
    [139.9, 35.0],
    [141.2, 35.0],
    [141.2, 36.1],
    [139.9, 36.1],
    [139.9, 35.0],
  ],
];

function makeScene(overrides: Partial<SceneSummary> = {}): SceneSummary {
  return {
    id: 'scene-1',
    name: 'S2C_MSIL2A_20261015T011651.SAFE',
    collection: 'sentinel-2-l2a',
    content_date: '2026-10-15T01:16:51.024Z',
    publication_date: null,
    online: true,
    footprint: { type: 'Polygon', coordinates: POLY },
    ...overrides,
  };
}

function fakeViewer() {
  const entities = new Map<string, { id: string; options: Record<string, unknown> }>();
  return {
    _entities: entities,
    entities: {
      add: vi.fn((options: { id: string } & Record<string, unknown>) => {
        const entity = { id: options.id, options };
        entities.set(options.id, entity);
        return entity;
      }),
      remove: vi.fn((entity: { id: string }) => entities.delete(entity.id)),
    },
    scene: {
      pick: vi.fn((): unknown => undefined),
    },
    isDestroyed: vi.fn(() => false),
  };
}

type FakeViewer = ReturnType<typeof fakeViewer>;

function fakeCesium(): FootprintRuntime {
  return {
    Cartesian3: {
      fromDegrees: vi.fn((lon: number, lat: number, height = 0) => ({ lon, lat, height })),
    },
    Color: {
      fromCssColorString: vi.fn((css: string) => ({ css })),
    },
  } as unknown as FootprintRuntime;
}

function sync(viewer: FakeViewer, scenes: SceneSummary[], selectedId: string | null = null) {
  const state = createFootprintSyncState();
  return {
    state,
    result: syncFootprintEntities({
      viewer: viewer as never,
      cesium: fakeCesium(),
      state,
      scenes,
      selectedId,
    }),
  };
}

describe('footprint entity sync (Phase 6)', () => {
  it('creates one polygon entity per footprint polygon with stable keys', () => {
    const viewer = fakeViewer();
    const scenes = [
      makeScene({ id: 'a' }),
      makeScene({ id: 'b', footprint: { type: 'MultiPolygon', coordinates: [POLY, POLY] } }),
    ];
    const { state } = sync(viewer, scenes);
    expect(viewer._entities.size).toBe(3);
    expect([...state.entities.keys()].sort()).toEqual(['a#0', 'b#0', 'b#1']);
    const entity = viewer._entities.get('a#0');
    const polygon = entity?.options.polygon as { hierarchy: { lon: number }[]; material: { css: string } };
    expect(polygon.hierarchy[0]).toEqual({ lon: 139.9, lat: 35.0, height: 0 });
    expect(polygon.material.css).toBe(FOOTPRINT_FILL);
  });

  it('renders no entities for missing/invalid footprints (scene still tracked)', () => {
    const viewer = fakeViewer();
    const { state } = sync(viewer, [
      makeScene({ id: 'bare', footprint: null }),
      makeScene({ id: 'bad', footprint: { type: 'Polygon', coordinates: 'bogus' as never } }),
    ]);
    expect(viewer._entities.size).toBe(0);
    expect(state.scenes.has('bare')).toBe(true);
  });

  it('highlights the selected scene and repaints on selection change', () => {
    const viewer = fakeViewer();
    const state = createFootprintSyncState();
    const cesium = fakeCesium();
    const scenes = [makeScene({ id: 'a' }), makeScene({ id: 'b' })];
    const args = { viewer: viewer as never, cesium, state, scenes };
    syncFootprintEntities({ ...args, selectedId: null });
    expect((viewer._entities.get('a#0')?.options.polygon as { material: { css: string } }).material.css).toBe(
      FOOTPRINT_FILL,
    );
    // Selection flip repaints without changing the entity set.
    syncFootprintEntities({ ...args, selectedId: 'b' });
    expect(viewer._entities.size).toBe(2);
    expect((viewer._entities.get('b#0')?.options.polygon as { material: { css: string } }).material.css).toBe(
      FOOTPRINT_FILL_SELECTED,
    );
    expect((viewer._entities.get('a#0')?.options.polygon as { material: { css: string } }).material.css).toBe(
      FOOTPRINT_FILL,
    );
  });

  it('is a no-op on identical re-syncs (no churn)', () => {
    const viewer = fakeViewer();
    const scenes = [makeScene({ id: 'a' })];
    const { state } = sync(viewer, scenes, 'a');
    const addsBefore = viewer.entities.add.mock.calls.length;
    const removesBefore = viewer.entities.remove.mock.calls.length;
    syncFootprintEntities({
      viewer: viewer as never,
      cesium: fakeCesium(),
      state,
      scenes,
      selectedId: 'a',
    });
    expect(viewer.entities.add.mock.calls.length).toBe(addsBefore);
    expect(viewer.entities.remove.mock.calls.length).toBe(removesBefore);
  });

  it('removes vanished scenes and prunes pick state', () => {
    const viewer = fakeViewer();
    const { state } = sync(viewer, [makeScene({ id: 'a' }), makeScene({ id: 'b' })]);
    expect(viewer._entities.size).toBe(2);
    syncFootprintEntities({
      viewer: viewer as never,
      cesium: fakeCesium(),
      state,
      scenes: [makeScene({ id: 'a' })],
      selectedId: null,
    });
    expect(viewer._entities.size).toBe(1);
    expect(state.entities.has('a#0')).toBe(true);
    expect(state.entities.has('b#0')).toBe(false);
  });

  it('respects the deterministic entity cap', () => {
    const viewer = fakeViewer();
    const scenes = Array.from({ length: FOOTPRINT_ENTITY_CAP }, (_, i) =>
      makeScene({ id: `s${i}` }),
    );
    const { state } = sync(viewer, scenes);
    expect(viewer._entities.size).toBe(FOOTPRINT_ENTITY_CAP);
    expect(state.entities.size).toBe(FOOTPRINT_ENTITY_CAP);
  });

  it('returns state untouched on a destroyed viewer', () => {
    const viewer = fakeViewer();
    const { state, result } = sync(viewer, [makeScene({ id: 'a' })]);
    viewer.isDestroyed.mockReturnValue(true);
    const next = syncFootprintEntities({
      viewer: viewer as never,
      cesium: fakeCesium(),
      state: result,
      scenes: [makeScene({ id: 'zzz' })],
      selectedId: null,
    });
    expect(next).toBe(state);
    expect(state.entities.size).toBe(1);
  });

  it('resolves picks to the owning scene (non-entity hits miss)', () => {
    const viewer = fakeViewer();
    const scenes = [makeScene({ id: 'a' }), makeScene({ id: 'b' })];
    const { state } = sync(viewer, scenes, 'b');
    viewer.scene.pick.mockReturnValue({ id: { id: 'b#0' } });
    expect(pickFootprintAt(viewer as never, state, { x: 1, y: 2 })?.id).toBe('b');
    viewer.scene.pick.mockReturnValue({ id: { id: 'nonexistent' } });
    expect(pickFootprintAt(viewer as never, state, { x: 1, y: 2 })).toBeNull();
    viewer.scene.pick.mockReturnValue({ primitive: 'globe' });
    expect(pickFootprintAt(viewer as never, state, { x: 1, y: 2 })).toBeNull();
    expect(pickFootprintAt(viewer as never, state, null)).toBeNull();
    viewer.isDestroyed.mockReturnValue(true);
    expect(pickFootprintAt(viewer as never, state, { x: 1, y: 2 })).toBeNull();
  });

  it('dispose clears every entity and the pick state', () => {
    const viewer = fakeViewer();
    const { state } = sync(viewer, [makeScene({ id: 'a' }), makeScene({ id: 'b' })]);
    disposeFootprintEntities(viewer as never, state);
    expect(viewer._entities.size).toBe(0);
    expect(state.entities.size).toBe(0);
    expect(state.scenes.size).toBe(0);
    expect(state.owners.size).toBe(0);
    expect(state.selectedFlags.size).toBe(0);
  });
});
