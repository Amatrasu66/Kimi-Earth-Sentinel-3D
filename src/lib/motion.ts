/**
 * Shared globe-motion policy (T3.11) — pure, renderer-agnostic, headless-testable.
 *
 * The WebGL (`Globe`) and WebGPU (`WebGPUEarth`) engines previously
 * duplicated the same fly-to/rotation math with no reduced-motion handling.
 * Both now call these helpers so the preference behaves identically on
 * every path, and the dotted engine's equivalent lat/lon logic follows the
 * same rules (no auto-rotate, no travel animation, destination still
 * reached). No React, no `window`, no GPU — safe to import anywhere,
 * including unit tests.
 */

/** Search fly-to travel time (seconds) under normal motion. */
export const FLY_TO_DURATION_S = 1.4;

/** Cubic ease-in-out shared by every globe flight path. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Minimal structural surface both `three` and `three/webgpu` quaternions satisfy. */
export interface SlerpTarget<Q> {
  copy(source: Q): unknown;
  slerpQuaternions(a: Q, b: Q, t: number): void;
}

export interface FlightState<Q> {
  t: number;
  duration: number;
  from: Q;
  to: Q;
}

/** A fresh flight from `from` to `to`. Starting one always supersedes any
 *  in-progress flight — the engine drops the old state object, so an
 *  obsolete destination is never continued toward. */
export function startFlight<Q>(from: Q, to: Q, duration: number = FLY_TO_DURATION_S): FlightState<Q> {
  return { t: 0, duration, from, to };
}

/**
 * Advance one flight by `deltaSec`. Returns the flight to keep, or `null`
 * when it finished. Under reduced motion there is no travel animation: the
 * globe lands on the destination immediately. That is also the path for a
 * preference flip mid-flight — the obsolete travel never continues, and
 * the requested destination is still reached.
 */
export function advanceFlight<Q, G extends SlerpTarget<Q>>(
  target: G,
  flight: FlightState<Q>,
  deltaSec: number,
  reducedMotion: boolean,
): FlightState<Q> | null {
  if (reducedMotion) {
    target.copy(flight.to);
    return null;
  }
  flight.t += deltaSec / flight.duration;
  const k = easeInOutCubic(Math.min(flight.t, 1));
  target.slerpQuaternions(flight.from, flight.to, k);
  return flight.t >= 1 ? null : flight;
}

/** Automatic rotation runs only when enabled by the user AND the OS
 *  preference allows motion. Manual drag/zoom are unaffected. */
export function autoRotateActive(isRotating: boolean, reducedMotion: boolean): boolean {
  return isRotating && !reducedMotion;
}

/** Frame-scheduling policy for the on-demand loops (T4.2). */
export interface FrameActivity {
  /** A fly-to flight is interpolating toward its destination. */
  flightActive: boolean;
  /** A pointer drag is in progress. */
  dragging: boolean;
  isRotating: boolean;
  reducedMotion: boolean;
}

/**
 * Whether the next frame is earned. Flights and drags always are;
 * ambient rotation only when enabled by the user AND allowed by the OS
 * preference. Anything else (hover sweeps, prop commits without visual
 * change) must schedule an explicit single frame instead of running the
 * loop. All three engines share this gate so idle means idle everywhere.
 */
export function frameLoopActive(activity: FrameActivity): boolean {
  if (activity.flightActive) return true;
  if (activity.dragging) return true;
  return autoRotateActive(activity.isRotating, activity.reducedMotion);
}
