'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { AnnouncementListItem } from '@struct-pass/shared';
import { fetchAllAnnouncements, fetchMyAnnouncements } from '../lib/api';

export function useAnnouncements(mode: 'mine' | 'manage') {
  const [items, setItems] = useState<AnnouncementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = mode === 'manage' ? await fetchAllAnnouncements() : await fetchMyAnnouncements();
      setItems(data);
    } catch {
      setError(true);
      toast.error('掲示板の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, setItems, loading, error, reload: load };
}
