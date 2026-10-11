/**
 * Local base-geography loader (GLOBE-1).
 *
 * The dotted Earth must never depend on a third-party host at runtime, so
 * the land boundaries are a bundled static asset served from the same
 * origin (`public/geo/land-110m.json` — see `public/geo/NOTICE.md` for the
 * Natural Earth source and public-domain terms).
 *
 * Exactly ONE request is issued per session:
 * - concurrent callers (Strict Mode double-mount, multiple remounts)
 *   share the same in-flight promise, so a remount never duplicates the
 *   request;
 * - a settled success is cached forever;
 * - a failure is *not* cached, so a later mount may retry after a genuine
 *   transient error, while callers of the failed promise receive the
 *   rejection and fall back to the bare-sphere state.
 *
 * Shape validation runs before the value escapes, so a corrupt or
 * HTML-error asset rejects instead of poisoning the projection with
 * something that merely looks like GeoJSON.
 */
import type { FeatureCollection, Geometry } from 'geojson';

/** Same-origin asset path — intentionally relative (no external origin). */
export const LAND_ASSET_URL = '/geo/land-110m.json';

export type LandAsset = FeatureCollection<Geometry>;

let pending: Promise<LandAsset> | null = null;

function isGeometry(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/**
 * Reject anything that is not a usable FeatureCollection. Deliberately
 * strict about the two members the projection actually consumes.
 */
export function assertLandAsset(value: unknown): asserts value is LandAsset {
  if (typeof value !== 'object' || value === null) {
    throw new Error('geography asset is not an object');
  }
  const candidate = value as { type?: unknown; features?: unknown };
  if (candidate.type !== 'FeatureCollection') {
    throw new Error('geography asset is not a FeatureCollection');
  }
  if (!Array.isArray(candidate.features) || candidate.features.length === 0) {
    throw new Error('geography asset has no features');
  }
  for (const feature of candidate.features) {
    const geometry = (feature as { geometry?: unknown } | null)?.geometry;
    if (!isGeometry(geometry)) {
      throw new Error('geography asset feature has no geometry');
    }
  }
}

/** Fetch + validate the local land asset, with per-session request dedupe. */
export function loadLandAsset(): Promise<LandAsset> {
  if (!pending) {
    pending = (async () => {
      const response = await fetch(LAND_ASSET_URL);
      if (!response.ok) {
        throw new Error(`geography asset unavailable (HTTP ${response.status})`);
      }
      const json: unknown = await response.json();
      assertLandAsset(json);
      return json;
    })().catch((error: unknown) => {
      // Never cache a failure — a later mount may retry once.
      pending = null;
      throw error;
    });
  }
  return pending;
}

/** Test seam: drop the cached promise so each test starts clean. */
export function resetLandAssetCache(): void {
  pending = null;
}
