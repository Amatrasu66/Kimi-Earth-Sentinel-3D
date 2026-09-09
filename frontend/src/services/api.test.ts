import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, API_BASE } from './api';

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
});
