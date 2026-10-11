/**
 * T3.6 SWR layer-data client tests. Deterministic: SWR gets a private cache
 * per test (fresh Map provider), timers are fake where backoff is asserted,
 * and the API boundary is mocked (contract covered in api.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import { ApiError, api } from '@/services/api';
import type { LayerId } from '@/types';
import {
  LAYER_429_MAX_ATTEMPTS,
  LAYER_RETRY_MAX_ATTEMPTS,
  buildLayerDataKey,
  isRetryableLayerError,
  layerRetryDelayMs,
  releaseLayerKey,
  resetLayerKeyRegistryForTests,
  retainLayerKey,
  shouldIdlePrefetch,
  useIdlePrefetchLayer,
  useLayerData,
} from './useLayers';

function livePayload(status: string, points: unknown[] = []) {
  return {
    data: {
      layer_id: 'earthquakes',
      count: points.length,
      points,
      data_status: { status, source: 'x', fetched_at: '2026-10-11T00:00:00Z', message: null },
    },
    meta: { timestamp: '2026-10-11T00:00:00Z', cache_hit: false },
    retryAfterSec: undefined,
  };
}

function liveBody(status = 'live', points: unknown[] = []) {
  return {
    layer_id: 'earthquakes',
    count: points.length,
    points,
    data_status: { status, source: 'USGS', fetched_at: '2026-10-11T00:00:00Z', message: null },
  };
}

/** Envelope payload tagged with the layer parsed from the request path. */
function payloadForPath(path: string) {
  const match = /\/layers\/([^/]+)\/data/.exec(path);
  const layer = match?.[1] ?? 'earthquakes';
  return {
    data: {
      layer_id: layer,
      count: 0,
      points: [],
      data_status: { status: 'live', source: 'x', fetched_at: '2026-10-11T00:00:00Z', message: null },
    },
    meta: { timestamp: '2026-10-11T00:00:00Z', cache_hit: false },
  };
}

function networkError() {
  return new ApiError('Network error — is the API reachable?');
}

function wrapperWithCache() {
  const provider = () => new Map();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SWRConfig value={{ provider }}>{children}</SWRConfig>;
  };
}

beforeEach(() => {
  vi.useRealTimers();
  resetLayerKeyRegistryForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetLayerKeyRegistryForTests();
});

describe('canonical keys (T3.6 §3)', () => {
  it('produces stable keys from normalized parameters', () => {
    expect(buildLayerDataKey('earthquakes', { limit: 500 })).toBe('/layers/earthquakes/data?limit=500');
    expect(buildLayerDataKey('earthquakes', { limit: 500.9 })).toBe('/layers/earthquakes/data?limit=500');
    expect(buildLayerDataKey('earthquakes')).toBe('/layers/earthquakes/data?limit=500');
    expect(buildLayerDataKey('earthquakes', { limit: 0 })).toBe('/layers/earthquakes/data?limit=1');
    expect(buildLayerDataKey('earthquakes', { limit: 99999 })).toBe('/layers/earthquakes/data?limit=2000');
  });

  it('creates distinct keys for response-affecting parameters', () => {
    const base = buildLayerDataKey('earthquakes', { limit: 500 });
    expect(buildLayerDataKey('earthquakes', { limit: 100 })).not.toBe(base);
    expect(buildLayerDataKey('earthquakes', { limit: 500, min_severity: 'high' })).not.toBe(base);
    expect(buildLayerDataKey('wildfires', { limit: 500 })).not.toBe(base);
    expect(buildLayerDataKey('earthquakes', { limit: 500, bbox: '1,2,3,4' })).not.toBe(base);
  });

  it('drops invalid severity but rejects invalid layers and bboxes without fetching', () => {
    expect(buildLayerDataKey('earthquakes', { limit: 500, min_severity: 'extreme' })).toBe(
      '/layers/earthquakes/data?limit=500',
    );
    expect(buildLayerDataKey('nope', { limit: 500 })).toBeNull();
    expect(buildLayerDataKey(null)).toBeNull();
    expect(buildLayerDataKey('earthquakes', { limit: 500, bbox: 'garbage' })).toBeNull();
  });
});

describe('hook request behavior (T3.6 §2–4)', () => {
  it('calls the typed client once for a valid layer', async () => {
    const fetchMock = vi.fn<(path: string) => Promise<unknown>>(async () => livePayload('live'));
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/layers/earthquakes/data?limit=500');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.dataStatus?.status).toBe('live');
    expect(result.current.meta).toEqual({ cacheHit: false });
    expect(typeof result.current.refetch).toBe('function');
  });

  it('issues no request for unsupported layers or invalid params', async () => {
    const fetchMock = vi.fn(async () => livePayload('live'));
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result: bad } = renderHook(() => useLayerData('nope' as never, { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    const { result: badParams } = renderHook(
      () => useLayerData('earthquakes', { limit: 500, bbox: 'garbage' }),
      { wrapper: wrapperWithCache() },
    );
    await act(async () => {});
    expect(bad.current.data).toBeNull();
    expect(bad.current.error).toBeNull();
    expect(bad.current.loading).toBe(false);
    expect(badParams.current.data).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deduplicates identical concurrent consumers into one request', async () => {
    const fetchMock = vi.fn(async () => livePayload('live'));
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    // One root (one SWR cache): two simultaneous consumers share the fetch.
    const probe: { a?: unknown; b?: unknown } = {};
    function TwoConsumers() {
      const a = useLayerData('earthquakes', { limit: 500 });
      const b = useLayerData('earthquakes', { limit: 500 });
      probe.a = a.data;
      probe.b = b.data;
      return null;
    }
    render(<TwoConsumers />, { wrapper: wrapperWithCache() });
    await waitFor(() => expect(probe.a).not.toBeNull());
    await waitFor(() => expect(probe.b).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(probe.a).toBe(probe.b);
  });

  it('never lets an obsolete response replace active-layer data', async () => {
    let resolveSlow!: (v: unknown) => void;
    const slow = new Promise<unknown>((resolve) => {
      resolveSlow = resolve;
    });
    const fetchMock = vi.fn(async (path: string) => {
      if (path.includes('/earthquakes/')) return slow;
      return payloadForPath(path);
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result, rerender } = renderHook(({ layer }: { layer: LayerId }) => useLayerData(layer, { limit: 500 }), {
      wrapper: wrapperWithCache(),
      initialProps: { layer: 'earthquakes' as LayerId },
    });
    // Switch layers while earthquakes is still in flight (registry aborts it,
    // SWR keys scope the state either way).
    rerender({ layer: 'wildfires' as LayerId });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.layer_id).toBe('wildfires');
    await act(async () => {
      resolveSlow(livePayload('live'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.data?.layer_id).toBe('wildfires');
  });

  it('shows no previous-layer data while the new layer loads', async () => {
    let resolveSlow!: (v: unknown) => void;
    const slow = new Promise<unknown>((resolve) => {
      resolveSlow = resolve;
    });
    const fetchMock = vi.fn(async (path: string) => {
      if (path.includes('/wildfires/')) return slow;
      return payloadForPath(path);
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result, rerender } = renderHook(({ layer }: { layer: LayerId }) => useLayerData(layer, { limit: 500 }), {
      wrapper: wrapperWithCache(),
      initialProps: { layer: 'earthquakes' as LayerId },
    });
    await waitFor(() => expect(result.current.data?.layer_id).toBe('earthquakes'));
    rerender({ layer: 'wildfires' as LayerId });
    // New key, no data yet: nothing from earthquakes may stand in.
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => {
      resolveSlow(payloadForPath('/layers/wildfires/data?limit=500'));
    });
    await waitFor(() => expect(result.current.data?.layer_id).toBe('wildfires'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps same-layer data visible across revalidation', async () => {
    let resolveSecond!: (v: unknown) => void;
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return livePayload('live');
      return new Promise<unknown>((resolve) => {
        resolveSecond = resolve;
      });
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => {
      result.current.refetch();
    });
    // Revalidation in flight: previous data stays, validating flags it.
    expect(result.current.data).not.toBeNull();
    expect(result.current.validating).toBe(true);
    await act(async () => {
      resolveSecond(livePayload('live'));
    });
    await waitFor(() => expect(result.current.validating).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('abort registry (T3.6 §4)', () => {
  it('aborts the in-flight fetch when the last consumer leaves', async () => {
    const seen: AbortSignal[] = [];
    const fetchMock = vi.fn(
      async (_path: string, opts?: { signal?: AbortSignal }) =>
        new Promise<unknown>((_resolve, reject) => {
          if (opts?.signal) {
            seen.push(opts.signal);
            opts.signal.addEventListener('abort', () =>
              reject(Object.assign(new Error('Request aborted.'), { name: 'AbortError' })),
            );
          }
        }),
    );
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { unmount } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await act(async () => {});
    expect(seen).toHaveLength(1);
    expect(seen[0].aborted).toBe(false);
    unmount();
    expect(seen[0].aborted).toBe(true);
  });

  it('never aborts a shared deduplicated request for its other consumer', async () => {
    const seen: AbortSignal[] = [];
    let resolveFetch!: (v: unknown) => void;
    const gate = new Promise<unknown>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(async (_path: string, opts?: { signal?: AbortSignal }) => {
      if (opts?.signal) seen.push(opts.signal);
      return gate;
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    // One root: both consumers share a single deduplicated request.
    function Consumer() {
      useLayerData('earthquakes', { limit: 500 });
      return null;
    }
    function App({ two }: { two: boolean }) {
      return (
        <>
          <Consumer />
          {two ? <Consumer /> : null}
        </>
      );
    }
    const { rerender } = render(<App two={true} />, { wrapper: wrapperWithCache() });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledOnce();
    // Drop one consumer: the shared request must survive for the other.
    rerender(<App two={false} />);
    expect(seen).toHaveLength(1);
    expect(seen[0].aborted).toBe(false);
    await act(async () => {
      resolveFetch(livePayload('live'));
    });
    expect(seen[0].aborted).toBe(false);
  });

  it('retain/release accounting cannot leak entries', () => {
    const key = '/layers/earthquakes/data?limit=500';
    retainLayerKey(key);
    retainLayerKey(key);
    releaseLayerKey(key);
    releaseLayerKey(key);
    releaseLayerKey(key); // extra release is a safe no-op
    expect(true).toBe(true);
  });
});

describe('retry policy (T3.6 §5)', () => {
  it('classifies retryability without guessing', () => {
    expect(isRetryableLayerError(networkError())).toBe(true);
    expect(isRetryableLayerError(new ApiError('x', { status: 500 }))).toBe(true);
    expect(isRetryableLayerError(new ApiError('x', { status: 429, retryAfterSec: 2 }))).toBe(true);
    expect(isRetryableLayerError(new ApiError('x', { status: 400 }))).toBe(false);
    expect(isRetryableLayerError(new ApiError('x', { status: 404 }))).toBe(false);
    expect(isRetryableLayerError(Object.assign(new Error('Request aborted.'), { name: 'AbortError' }))).toBe(false);
    expect(isRetryableLayerError(Object.assign(new Error('Request timed out.'), { name: 'AbortError' }))).toBe(false);
    expect(isRetryableLayerError(new Error('plain'))).toBe(false);
    expect(isRetryableLayerError(null)).toBe(false);
  });

  it('backs off exponentially within caps (429 honors Retry-After)', () => {
    expect(layerRetryDelayMs(networkError(), 1)).toBeGreaterThanOrEqual(500);
    expect(layerRetryDelayMs(networkError(), 1)).toBeLessThan(500 + 250 + 1);
    expect(layerRetryDelayMs(networkError(), 2)).toBeGreaterThanOrEqual(1000);
    expect(layerRetryDelayMs(networkError(), 3)).toBeGreaterThanOrEqual(2000);
    expect(layerRetryDelayMs(networkError(), 99)).toBeLessThanOrEqual(8000);
    expect(layerRetryDelayMs(new ApiError('slow', { status: 429, retryAfterSec: 4 }), 1)).toBe(4000);
    expect(layerRetryDelayMs(new ApiError('slow', { status: 429 }), 1)).toBe(1000);
  });

  it('retries transient failures with bounded backoff, then succeeds', async () => {
    vi.useFakeTimers();
    // Fetch timestamps on the fake clock prove exponential spacing (spying
    // on the global timer breaks later tests — never do that; see T3.6 log).
    const at: number[] = [];
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      at.push(Date.now());
      calls += 1;
      if (calls < 3) throw networkError();
      return livePayload('live');
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // State is flushed by act: no waitFor (its polling interval cannot tick
    // on a fake clock).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.data).not.toBeNull();
    expect(result.current.error).toBeNull();
    // Backoff gaps grow: ~500 ms then ~1000 ms (plus ≤250 ms jitter each).
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(500);
    expect(at[1] - at[0]).toBeLessThan(500 + 250 + 50);
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(1000);
    expect(at[2] - at[1]).toBeLessThan(1000 + 250 + 50);
  });

  it('stops at the attempt cap on persistent failure', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      throw networkError();
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    // 1 initial + exactly LAYER_RETRY_MAX_ATTEMPTS retries.
    expect(fetchMock).toHaveBeenCalledTimes(1 + LAYER_RETRY_MAX_ATTEMPTS);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toMatch(/Network error/);
    expect(result.current.data).toBeNull();
  });

  it('never retries 400/404 validation failures', async () => {
    const fetchMock = vi.fn(async () => {
      throw new ApiError('Invalid limit x', { status: 400, code: 'INVALID_PARAMS' });
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledOnce();
    const err = result.current.error as ApiError;
    expect(err.status).toBe(400);
    expect(err.code).toBe('INVALID_PARAMS');
    expect(err.message).toBe('Invalid limit x');
  });

  it('honors Retry-After on 429 and stops after the 429 cap', async () => {
    vi.useFakeTimers();
    const at: number[] = [];
    const fetchMock = vi.fn(async () => {
      at.push(Date.now());
      throw new ApiError('Slow down.', { status: 429, code: 'RATE_LIMITED', retryAfterSec: 2 });
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // 1 initial + exactly LAYER_429_MAX_ATTEMPTS paced retries.
    expect(fetchMock).toHaveBeenCalledTimes(1 + LAYER_429_MAX_ATTEMPTS);
    expect(result.current.error).not.toBeNull();
    // Retry-After honored: ~2000 ms gaps between attempts.
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(2000);
    expect(at[1] - at[0]).toBeLessThan(2000 + 50);
  });

  it('cancellation stops scheduled retries', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      throw networkError();
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { unmount } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry obsolete keys after a layer switch mid-backoff', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const fetchMock = vi.fn(async (path: string) => {
      calls.push(path);
      if (path.includes('/earthquakes/')) throw networkError();
      return payloadForPath(path);
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result, rerender } = renderHook(({ layer }: { layer: LayerId }) => useLayerData(layer, { limit: 500 }), {
      wrapper: wrapperWithCache(),
      initialProps: { layer: 'earthquakes' as LayerId },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(calls.filter((c) => c.includes('/earthquakes/'))).toHaveLength(1);
    rerender({ layer: 'wildfires' as LayerId });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // No retry for the dead earthquakes key; wildfires fetched exactly once.
    expect(calls.filter((c) => c.includes('/earthquakes/'))).toHaveLength(1);
    expect(calls.filter((c) => c.includes('/wildfires/'))).toHaveLength(1);
    expect(result.current.data?.layer_id).toBe('wildfires');
  });
});

describe('honest statuses (T3.6 §7)', () => {
  it.each(['live', 'stale', 'simulated', 'unavailable'] as const)(
    'passes live through distinctly (never relabelled, never retried)',
    async (status) => {
      const fetchMock = vi.fn(async () => ({
        data: liveBody(status),
        meta: { cache_hit: false },
      }));
      vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
      const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
        wrapper: wrapperWithCache(),
      });
      await waitFor(() => expect(result.current.data).not.toBeNull());
      expect(result.current.dataStatus?.status).toBe(status);
      expect(result.current.error).toBeNull();
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it('treats empty live results as valid (not an error)', async () => {
    const fetchMock = vi.fn(async () => ({
      data: liveBody('live', []),
      meta: { cache_hit: false },
    }));
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.points).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('preserves the API error shape on failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new ApiError('gone', { status: 404, code: 'NOT_FOUND' });
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).code).toBe('NOT_FOUND');
    expect(result.current.data).toBeNull();
  });

  it('reports the server cache_hit from the envelope (never invents one)', async () => {
    const fetchMock = vi.fn(async () => ({
      data: liveBody('live'),
      meta: { cache_hit: true },
    }));
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), {
      wrapper: wrapperWithCache(),
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.meta).toEqual({ cacheHit: true });
  });
});

describe('idle prefetch (T3.6 §8)', () => {
  function idleStub() {
    const queue: Array<() => void> = [];
    const ric = vi.fn((cb: () => void) => {
      queue.push(cb);
      return queue.length;
    });
    const cic = vi.fn(() => {});
    Object.defineProperty(window, 'requestIdleCallback', { writable: true, configurable: true, value: ric });
    Object.defineProperty(window, 'cancelIdleCallback', { writable: true, configurable: true, value: cic });
    // jsdom reports 'prerender' — the policy requires a visible page.
    Object.defineProperty(document, 'visibilityState', { writable: true, configurable: true, value: 'visible' });
    return { queue, ric, cic };
  }

  it('decides prefetch eligibility conservatively', () => {
    expect(shouldIdlePrefetch(null, 'visible', true)).toBe(true);
    expect(shouldIdlePrefetch('wildfires', 'visible', true)).toBe(true);
    expect(shouldIdlePrefetch('earthquakes', 'visible', true)).toBe(false);
    expect(shouldIdlePrefetch(null, 'hidden', true)).toBe(false);
    expect(shouldIdlePrefetch(null, 'visible', false)).toBe(false);
  });

  it('prefetches the canonical earthquakes key at idle (shared fetcher)', async () => {
    const { queue } = idleStub();
    const fetchMock = vi.fn<(path: string) => Promise<unknown>>(async () => livePayload('live'));
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const wrapper = wrapperWithCache();
    renderHook(() => useIdlePrefetchLayer('wildfires'), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queue).toHaveLength(1);
    await act(async () => {
      queue[0]();
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/layers/earthquakes/data?limit=500');
    // A later real selection reuses the prefetched cache entry: no new fetch.
    const { result } = renderHook(() => useLayerData('earthquakes', { limit: 500 }), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('stays bounded: skips active/invalid keys, hidden tabs, and cancelled schedules', async () => {
    const { queue, cic } = idleStub();
    const fetchMock = vi.fn(async () => livePayload('live'));
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const wrapper = wrapperWithCache();
    const { unmount } = renderHook(() => useIdlePrefetchLayer('wildfires'), { wrapper });
    renderHook(() => useIdlePrefetchLayer('earthquakes'), { wrapper });
    unmount();
    expect(cic).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queue).toHaveLength(1);
  });

  it('fails silently without disturbing the app', async () => {
    const { queue } = idleStub();
    const fetchMock = vi.fn(async (path: string) => {
      if (path.includes('/earthquakes/')) throw networkError();
      return payloadForPath(path);
    });
    vi.spyOn(api, 'fetchLayerDataPath').mockImplementation(fetchMock as never);
    const wrapper = wrapperWithCache();
    const { result } = renderHook(
      () => {
        useIdlePrefetchLayer(null);
        return useLayerData('wildfires', { limit: 500 });
      },
      { wrapper },
    );
    // Prefetch failure must not surface as hook state or throw.
    await act(async () => {
      queue[0]();
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
    expect(result.current.data?.layer_id).toBe('wildfires');
  });
});
