import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, API_BASE, buildLayerDataPath, resolveApiConfig } from './api';

const ok = <T,>(data: T) =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const err = (status: number, message: string, code = 'INVALID_PARAMS') =>
  new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('api client boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('builds versioned URLs from the centralized base and returns data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ layers: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await api.getLayers();
    expect(data).toEqual({ layers: [] });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${API_BASE}/layers`);
  });

  it('surfaces backend error messages instead of status text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(400, 'Invalid limit x')));
    await expect(api.getLayerData('earthquakes', { limit: 5 })).rejects.toThrow('Invalid limit x');
  });

  it('normalizes network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(api.getLayers()).rejects.toThrow('Network error');
  });

  it('times out slow responses', async () => {
    vi.useFakeTimers();
    // Like a real hung fetch, the mock only settles when aborted.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        });
      }),
    );
    const pending = api.getLayers();
    const assertion = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  describe('same-origin API base resolution', () => {
    it('always resolves to the same-origin /api/v1 base', () => {
      expect(API_BASE).toBe('/api/v1');
      expect(resolveApiConfig()).toEqual({
        base: '/api/v1',
        source: 'same-origin',
        error: null,
      });
    });

    it('ignores legacy env inputs (no Render/localhost configuration exists)', () => {
      const resolved = resolveApiConfig(
        { baseUrl: 'https://x.onrender.com/api/v1', legacyUrl: 'https://legacy.example/api/v1' },
        true,
      );
      expect(resolved).toEqual({ base: '/api/v1', source: 'same-origin', error: null });
    });
  });

  it('builds GIBS tile URLs from the centralized base without fetching', () => {
    expect(api.gibsTileUrl('BlueMarble', 2, 1, 1)).toBe(
      `${API_BASE}/imagery/gibs/tile/BlueMarble/2/1/1`,
    );
  });

  it('honours caller abort signals silently-ish (named AbortError)', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        });
      }),
    );
    const pending = api.search('tokyo', undefined, undefined, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  describe('T3.6 envelope + typed errors', () => {
    it('preserves meta (server cache_hit) through the envelope method', async () => {
      const body = {
        success: true,
        data: { layer_id: 'earthquakes', count: 0, points: [] },
        meta: { timestamp: '2026-10-11T00:00:00Z', cache_hit: true, cached_at: '2026-10-11T00:00:00Z', stale: false, source: 'USGS', data_status: 'live' },
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
      const out = await api.getLayerDataEnvelope('earthquakes', { limit: 500 });
      expect(out.data).toEqual({ layer_id: 'earthquakes', count: 0, points: [] });
      expect(out.meta.cache_hit).toBe(true);
    });

    it('throws ApiError carrying status/code on error envelopes (message preserved)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(err(400, 'Invalid limit x')));
      const caught = await api.getLayerDataEnvelope('earthquakes', { limit: 5 }).catch((e) => e);
      expect(caught).toBeInstanceOf(ApiError);
      expect(caught.message).toBe('Invalid limit x');
      expect(caught.status).toBe(400);
      expect(caught.code).toBe('INVALID_PARAMS');
    });

    it('parses Retry-After seconds (and caps absurd values) on 429', async () => {
      const rateLimited = (retryAfter: string) =>
        new Response(JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: 'Slow down.' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfter },
        });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimited('7')));
      const small = await api.getLayerDataEnvelope('earthquakes', {}).catch((e) => e);
      expect(small).toBeInstanceOf(ApiError);
      expect(small.status).toBe(429);
      expect(small.retryAfterSec).toBe(7);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimited('3600')));
      const capped = await api.getLayerDataEnvelope('earthquakes', {}).catch((e) => e);
      expect(capped.retryAfterSec).toBe(60);
    });

    it('builds one canonical layer-data path (key and URL cannot diverge)', () => {
      expect(buildLayerDataPath('earthquakes', { limit: 500 })).toBe('/layers/earthquakes/data?limit=500');
      expect(buildLayerDataPath('wind', { bbox: '1,2,3,4', limit: 100, min_severity: 'high' })).toBe(
        '/layers/wind/data?bbox=1%2C2%2C3%2C4&limit=100&min_severity=high',
      );
      expect(buildLayerDataPath('earthquakes')).toBe('/layers/earthquakes/data');
    });
  });
});
