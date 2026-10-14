'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import React from 'react';
import type { TableId, TablePaginationSetting } from '@struct-pass/shared';
import { fetchListPaginationSettings } from '../api';

/**
 * 一覧ごとのページサイズ設定 = system scope (admin only にて編集)。
 * dashboard 配下で 1 度だけ取得し context に持たせる（N+1 回避）。
 */
interface ListPreferencesContextValue {
  settings: Map<TableId, TablePaginationSetting>;
  loaded: boolean;
  reload: () => Promise<void>;
}

const ListPreferencesContext = createContext<ListPreferencesContextValue>({
  settings: new Map(),
  loaded: false,
  reload: async () => {},
});

function useListPreferencesLoader(): ListPreferencesContextValue {
  const [settings, setSettings] = useState<Map<TableId, TablePaginationSetting>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await fetchListPaginationSettings();
      const next = new Map<TableId, TablePaginationSetting>();
      for (const item of list) next.set(item.tableId, item);
      setSettings(next);
    } catch {
      // fallback: 空の Map のまま。useListPage 側で DEFAULT_PAGE_SIZE が効く。
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { settings, loaded, reload };
}

export function ListPreferencesProvider({ children }: { children: ReactNode }) {
  const value = useListPreferencesLoader();
  return React.createElement(ListPreferencesContext.Provider, { value }, children);
}

export function useListPreferences() {
  return useContext(ListPreferencesContext);
}

/** 単一 tableId の設定を取得。未取得 / 該当なしは undefined。 */
export function useTablePaginationPreference(tableId: TableId): TablePaginationSetting | undefined {
  const { settings } = useListPreferences();
  return settings.get(tableId);
}
