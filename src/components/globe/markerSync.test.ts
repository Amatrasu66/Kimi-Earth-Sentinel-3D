/**
 * T4.3 marker-scalability regression tests (deterministic, offline).
 *
 * What these tests prove (code-level contracts only):
 * - the shared 3D marker writer upholds instance-N ↔ validPoints[N]
 *   mapping at the full 2,000-point server limit;
 * - marker capacity mirrors the server `limit` contract (`MAX_LIMIT`);
 * - invalid records are excluded by the canonical filter before writing,
 *   with stable order for the survivors (so picking stays correct);
 * - over-capacity input clamps instead of writing outside the buffers;
 * - unknown severities fall back to the low color instead of crashing.
 *
 * What these tests do NOT prove: frame rates, GPU memory, or visual
 * parity — those need real owner device captures (see
 * `docs/audit/marker-scalability.md`). No timing assertions live here;
 * a 2,000-point sync is asserted for correctness, not speed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { filterValidPoints } from '@/lib/geo';
import { latLonToVec3 } from '@/lib/geo';
import { MAX_LIMIT } from '@/server/validation';
import { SEVERITY_COLORS } from '@/types';
import type { DataPoint, SeverityLevel } from '@/types';
import { MARKER_CAPACITY, writeMarkersToInstancedMesh } from './markerSync';
import type { MarkerScratch } from './markerSync';

const SEVERITIES: SeverityLevel[] = ['low', 'moderate', 'high', 'critical'];

/** Deterministic PRNG (mulberry32) — stable fixture across runs. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Local-only performance fixture: `count` deterministic valid points
 * with cycling severities. Never live data, never shipped to the app —
 * it exists only to exercise the writer at the server limit.
 */
function buildPerfFixture(count: number): DataPoint[] {
  const rand = mulberry32(0x43b3);
  const points: DataPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    points.push({
      id: `perf-${i}`,
      lat: rand() * 180 - 90,
      lon: rand() * 360 - 180,
      severity: SEVERITIES[i % SEVERITIES.length],
      timestamp: '2026-10-13T00:00:00.000Z',
    });
  }
  return points;
}

const liveMeshes: THREE.InstancedMesh[] = [];

function makeMesh(capacity: number): THREE.InstancedMesh {
  const geometry = new THREE.ConeGeometry(0.04, 0.15, 6);
  geometry.translate(0, 0.075, 0);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(capacity, 1));
  liveMeshes.push(mesh);
  return mesh;
}

function makeScratch(): MarkerScratch {
  return { dummy: new THREE.Object3D(), color: new THREE.Color(), vec: new THREE.Vector3() };
}

afterEach(() => {
  while (liveMeshes.length > 0) {
    const mesh = liveMeshes.pop();
    mesh?.geometry.dispose();
    const material = mesh?.material as THREE.Material | undefined;
    material?.dispose();
  }
});

function matrixPosition(mesh: THREE.InstancedMesh, index: number): THREE.Vector3 {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3(matrix.elements[12], matrix.elements[13], matrix.elements[14]);
}

function instanceColor(mesh: THREE.InstancedMesh, index: number): THREE.Color {
  const color = new THREE.Color();
  mesh.getColorAt(index, color);
  return color;
}

/**
 * Instance colors round-trip through a Float32Array GPU buffer, so exact
 * `Color.equals` is too strict — compare channels with float tolerance.
 */
function expectInstanceColor(mesh: THREE.InstancedMesh, index: number, hex: string): void {
  const expected = new THREE.Color(hex);
  const actual = instanceColor(mesh, index);
  expect(actual.r).toBeCloseTo(expected.r, 4);
  expect(actual.g).toBeCloseTo(expected.g, 4);
  expect(actual.b).toBeCloseTo(expected.b, 4);
}

describe('MARKER_CAPACITY (server-limit contract)', () => {
  it('mirrors the server MAX_LIMIT so the store holds a full-limit payload', () => {
    expect(MAX_LIMIT).toBe(2000);
    expect(MARKER_CAPACITY).toBe(MAX_LIMIT);
    expect(MARKER_CAPACITY).toBeGreaterThanOrEqual(2000);
  });
});

describe('writeMarkersToInstancedMesh at the 2,000-point limit', () => {
  it('draws all 2,000 valid points with stable index mapping', () => {
    const mesh = makeMesh(MARKER_CAPACITY);
    const points = buildPerfFixture(2000);
    const valid = filterValidPoints(points);
    expect(valid).toHaveLength(2000);

    const drawn = writeMarkersToInstancedMesh(mesh, valid, 5.05, makeScratch());

    expect(drawn).toBe(2000);
    expect(mesh.count).toBe(2000);
    // `needsUpdate` is a setter-only accessor on BufferAttribute — the
    // observable effect is the bumped buffer version awaiting GPU upload.
    expect(mesh.instanceMatrix.version).toBeGreaterThan(0);
    expect(mesh.instanceColor?.version).toBeGreaterThan(0);
    // Spot-check first / middle / last: position matches the shared
    // projection and severity color matches the scale.
    for (const i of [0, 999, 1999]) {
      const expected = latLonToVec3(valid[i].lat, valid[i].lon, 5.05);
      const actual = matrixPosition(mesh, i);
      expect(actual.x).toBeCloseTo(expected.x, 5);
      expect(actual.y).toBeCloseTo(expected.y, 5);
      expect(actual.z).toBeCloseTo(expected.z, 5);
      expect(actual.length()).toBeCloseTo(5.05, 4);
      expectInstanceColor(mesh, i, SEVERITY_COLORS[valid[i].severity]);
    }
  });

  it('covers every severity level in the fixture', () => {
    const mesh = makeMesh(MARKER_CAPACITY);
    const points = buildPerfFixture(8);
    writeMarkersToInstancedMesh(mesh, points, 5.05, makeScratch());
    for (let i = 0; i < 4; i += 1) {
      expectInstanceColor(mesh, i, SEVERITY_COLORS[SEVERITIES[i]]);
    }
  });
});

describe('invalid points and picking alignment', () => {
  it('excludes invalid records and keeps survivor order stable', () => {
    const mesh = makeMesh(8);
    const raw = [
      { id: 'a', lat: 10, lon: 20, severity: 'low' },
      { id: 'bad-1', lat: Number.NaN, lon: 20, severity: 'high' },
      { id: 'b', lat: -45, lon: 170, severity: 'critical' },
      { id: 'bad-2', lat: 10, lon: 999, severity: 'low' },
      { id: 'c', lat: 0, lon: 0, severity: 'moderate' },
    ] as DataPoint[];
    const valid = filterValidPoints(raw);
    expect(valid.map((p) => p.id)).toEqual(['a', 'b', 'c']);

    const drawn = writeMarkersToInstancedMesh(mesh, valid, 5.05, makeScratch());

    // Rendered instance N === validPoints[N]: picking code that resolves
    // `validPoints[instanceId]` stays correct.
    expect(drawn).toBe(3);
    expect(mesh.count).toBe(3);
    expectInstanceColor(mesh, 1, SEVERITY_COLORS.critical);
    expectInstanceColor(mesh, 2, SEVERITY_COLORS.moderate);
  });

  it('falls back to the low color for unknown severities', () => {
    const mesh = makeMesh(4);
    const points = [{ id: 'x', lat: 5, lon: 5, severity: 'bogus' }] as unknown as DataPoint[];
    const drawn = writeMarkersToInstancedMesh(mesh, points, 5.05, makeScratch());
    expect(drawn).toBe(1);
    expectInstanceColor(mesh, 0, SEVERITY_COLORS.low);
  });
});

describe('capacity and empty handling', () => {
  it('clamps over-capacity input to the allocated buffers in order', () => {
    const mesh = makeMesh(4);
    const points = buildPerfFixture(6);
    const drawn = writeMarkersToInstancedMesh(mesh, points, 5.05, makeScratch());
    expect(drawn).toBe(4);
    expect(mesh.count).toBe(4);
    // First four in input order — never a silent reshuffle.
    const first = latLonToVec3(points[0].lat, points[0].lon, 5.05);
    const actual = matrixPosition(mesh, 0);
    expect(actual.x).toBeCloseTo(first.x, 5);
    expect(actual.y).toBeCloseTo(first.y, 5);
    expect(actual.z).toBeCloseTo(first.z, 5);
  });

  it('handles an empty point list without touching color buffers', () => {
    const mesh = makeMesh(8);
    const drawn = writeMarkersToInstancedMesh(mesh, [], 5.05, makeScratch());
    expect(drawn).toBe(0);
    expect(mesh.count).toBe(0);
    expect(mesh.instanceColor).toBeNull();
  });
});
