import { useState, useEffect, useRef } from 'react';
import { api } from '@/services/api';

export function useSearch() {
  const [results, setResults] = useState<import('@/types').SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Abort in-flight searches and ignore stale responses so a slow
  // earlier query can never overwrite newer results.
  const inflight = useRef<AbortController | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    return () => {
      inflight.current?.abort();
    };
  }, []);

  const search = async (query: string) => {
    if (query.length < 2) {
      inflight.current?.abort();
      setResults([]);
      return;
    }

    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    const id = ++requestId.current;

    setLoading(true);
    setError(null);

    try {
      const data = await api.search(query, undefined, undefined, { signal: controller.signal });
      if (requestId.current !== id) return;
      setResults(data.results);
    } catch (err: unknown) {
      if (requestId.current !== id) return;
      // Aborted (superseded) requests are silent by design.
      if (err instanceof Error && err.name === 'AbortError') return;
      const error = err as Error;
      setError(error.message);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  };

  return { results, loading, error, search };
}
