'use client';

import { useEffect, useState, useCallback } from 'react';
import apiClient from '@/lib/api-client';
import type { FeatureId } from '@struct-pass/shared';

export interface DashboardCountItem {
  featureId: FeatureId;
  count: number;
}

export function useDashboardCounts() {
  const [counts, setCounts] = useState<DashboardCountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/dashboard/counts');
      setCounts(res.data.data.counts ?? []);
    } catch {
      setError('件数の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { counts, loading, error };
}
