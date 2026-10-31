'use client';

import { useState, useEffect, useCallback } from 'react';
import apiClient from '@/lib/api-client';
import type { SystemSetting } from '@struct-pass/shared';

interface BulkUpdateItem {
  key: string;
  value: string;
}

export function useSystemSettings() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/system-settings');
      setSettings(res.data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'システム設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const bulkUpdate = useCallback(
    async (updates: BulkUpdateItem[]) => {
      const res = await apiClient.put('/system-settings', { updates });
      await fetch();
      return res.data;
    },
    [fetch],
  );

  return { settings, loading, error, reload: fetch, bulkUpdate };
}
