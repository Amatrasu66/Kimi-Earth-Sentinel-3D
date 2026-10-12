import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  FLY_TO_DURATION_S,
  advanceFlight,
  autoRotateActive,
  easeInOutCubic,
  startFlight,
} from './motion';

// The shared policy both 3D engines call (T3.11). `three` math runs
// headless in jsdom — no GPU, no Canvas — so the exact flight/rotation
// contract is pinned here while the owner verifies pixels in a browser.

function quatFromYaw(deg: number): Quaternion {
  return new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180);
}

describe('globe motion policy (T3.11)', () => {
  it('eases from 0 to 1 monotonically', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const k = easeInOutCubic(t);
      expect(k).toBeGreaterThanOrEqual(prev);
      prev = k;
    }
  });

  it('starts flights at t=0 with the standard duration', () => {
    const from = new Quaternion();
    const to = quatFromYaw(90);
    const flight = startFlight(from, to);
    expect(flight).toEqual({ t: 0, duration: FLY_TO_DURATION_S, from, to });
  });

  it('slerps toward the destination and completes under normal motion', () => {
    const group = { quaternion: new Quaternion() };
    const to = quatFromYaw(90);
    const flight = startFlight(new Quaternion(), to);

    // Halfway through the travel the globe is mid-turn, still in flight.
    const kept = advanceFlight(group.quaternion, flight, FLY_TO_DURATION_S / 2, false);
    expect(kept).not.toBeNull();
    expect(flight.t).toBeCloseTo(0.5, 10);
    expect(group.quaternion.angleTo(to)).toBeCloseTo(Math.PI / 4, 1);

    // Past the duration the flight ends exactly on the destination.
    const done = advanceFlight(group.quaternion, kept!, FLY_TO_DURATION_S, false);
    expect(done).toBeNull();
    expect(group.quaternion.angleTo(to)).toBeCloseTo(0, 10);
  });

  it('snaps to the destination with no travel under reduced motion', () => {
    const group = { quaternion: new Quaternion() };
    const to = quatFromYaw(90);
    const flight = startFlight(new Quaternion(), to);
    const kept = advanceFlight(group.quaternion, flight, 0, true);
    expect(kept).toBeNull();
    expect(group.quaternion.angleTo(to)).toBeCloseTo(0, 10);
  });

  it('a superseded flight never continues toward its obsolete destination', () => {
    const group = { quaternion: new Quaternion() };
    const obsolete = quatFromYaw(90);
    const current = quatFromYaw(-45);

    // An old flight partway to A is dropped when a new flight to B starts —
    // the engine keeps only the latest state object.
    const oldFlight = startFlight(new Quaternion(), obsolete);
    advanceFlight(group.quaternion, oldFlight, FLY_TO_DURATION_S / 2, false);
    const fresh = startFlight(group.quaternion.clone(), current);
    const done = advanceFlight(group.quaternion, fresh, FLY_TO_DURATION_S, false);
    expect(done).toBeNull();
    expect(group.quaternion.angleTo(current)).toBeCloseTo(0, 10);
    expect(group.quaternion.angleTo(obsolete)).toBeGreaterThan(0.1);
  });

  it('auto-rotate needs both the user switch and motion permission', () => {
    expect(autoRotateActive(true, false)).toBe(true);
    expect(autoRotateActive(true, true)).toBe(false);
    expect(autoRotateActive(false, false)).toBe(false);
    expect(autoRotateActive(false, true)).toBe(false);
  });
});
