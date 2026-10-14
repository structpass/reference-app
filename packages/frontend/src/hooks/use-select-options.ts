'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import apiClient from '@/lib/api-client';

export interface SelectOption {
  value: string;
  label: string;
}

export function useSelectOptions<T>(
  path: string,
  mapFn: (item: T) => SelectOption,
): { options: SelectOption[]; loading: boolean } {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const mapFnRef = useRef(mapFn);
  useEffect(() => {
    mapFnRef.current = mapFn;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(path, { params: { limit: 999 } });
      const data: T[] = res.data.data ?? res.data;
      setOptions(data.map((item) => mapFnRef.current(item)));
    } catch (e) {
      console.error(`[useSelectOptions] Failed to load ${path}:`, e);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { options, loading };
}
