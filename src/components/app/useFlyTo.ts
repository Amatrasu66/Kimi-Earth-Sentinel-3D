import { useState, useCallback, useRef } from 'react';
import { isValidCoordinate } from '@/lib/geo';

export interface FlyToTarget {
  lat: number;
  lon: number;
  /** Bumps every flight so identical destinations retrigger the globe. */
  key: number;
}

export interface FlyToApi {
  flyTo: FlyToTarget | null;
  /** Validate + dispatch a camera flight (search-result selection). */
  flyToLocation: (lat: number, lon: number) => void;
}

/**
 * Camera flight destination (Phase 4 search fly-to, extracted T3.17).
 *
 * Owns the `flyTo` target the globe renderers consume: invalid
 * coordinates are dropped before they can move the camera, and the key
 * retriggers flights to an already-centered destination. Null = no flight.
 */
export function useFlyTo(): FlyToApi {
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const flyToKey = useRef(0);

  const flyToLocation = useCallback((lat: number, lon: number) => {
    if (!isValidCoordinate(lat, lon)) return;
    flyToKey.current += 1;
    setFlyTo({ lat, lon, key: flyToKey.current });
  }, []);

  return { flyTo, flyToLocation };
}
