'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  TableId,
  TablePaginationSetting,
  BulkUpdateTablePaginationSettingItem,
} from '@struct-pass/shared';
import { bulkUpdateListPaginationSettings, fetchListPaginationSettings } from '../api';
import { useListPreferences } from './use-list-preferences';

/**
 * 管理画面 (/dashboard/list-preferences) 専用の編集フック。
 * fetch 結果と bulkUpdate を持つ。保存後は Provider の cache も reload。
 */
export function useListPreferencesEditor() {
  const [settings, setSettings] = useState<TablePaginationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { reload: reloadProvider } = useListPreferences();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchListPaginationSettings();
      setSettings(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const bulkUpdate = useCallback(
    async (updates: BulkUpdateTablePaginationSettingItem[]) => {
      await bulkUpdateListPaginationSettings(updates);
      await reload();
      // dashboard 全画面で参照中の Provider cache も更新（即時反映）
      await reloadProvider();
    },
    [reload, reloadProvider],
  );

  /** updateByTableId をローカル state に反映（保存前の draft 用ではなく既存値を更新するヘルパ） */
  const updateLocal = useCallback(
    (
      tableId: TableId,
      partial: Partial<Pick<TablePaginationSetting, 'defaultPageSize' | 'pageSizeOptions'>>,
    ) => {
      setSettings((prev) => prev.map((s) => (s.tableId === tableId ? { ...s, ...partial } : s)));
    },
    [],
  );

  return { settings, loading, error, reload, bulkUpdate, updateLocal };
}
