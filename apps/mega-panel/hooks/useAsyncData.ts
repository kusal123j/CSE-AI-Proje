'use client';

import { useCallback, useEffect, useState } from 'react';
import { MegaPanelApiError } from '@/lib/api/errors';

export interface AsyncDataState<T> {
  data: T | null;
  loading: boolean;
  error: MegaPanelApiError | Error | null;
  reload: () => Promise<void>;
  setData: (value: T | null) => void;
}

export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<MegaPanelApiError | Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown load error'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
