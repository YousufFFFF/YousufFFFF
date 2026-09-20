import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@rival/api-client';

/**
 * Data fetching with the three states every screen needs.
 *
 * Small on purpose: the app has no server-state library, and every screen needs
 * the same loading / error / empty handling, so this is the one hook that
 * provides it (plus pull-to-refresh, which is how people actually reload a
 * competitive screen).
 */

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  setData: (updater: (current: T | null) => T | null) => void;
}

export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Kept in a ref so `run` does not change identity on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (mounted.current) setData(result);
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof ApiError ? cause.message : 'Could not load that. Check your connection.');
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => run(false),
    refresh: () => run(true),
    setData: (updater) => setData((current) => updater(current)),
  };
}
