import { useState, useEffect, useCallback } from 'react';

type FetchFn<T> = () => Promise<T>;

export function useApi<T>(fetchFn: FetchFn<T>, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchFn();
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    refetch();
    if (intervalMs) {
      const id = setInterval(refetch, intervalMs);
      return () => clearInterval(id);
    }
  }, [refetch, intervalMs]);

  return { data, loading, error, refetch };
}
