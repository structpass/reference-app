'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import type { TableId } from '@struct-pass/shared';
import { useTablePaginationPreference } from '@/features/list-preferences';
import { useCrudApi } from './use-crud-api';
import { usePagination, type PaginationState } from './use-pagination';

/** "10,20,50,100" → [10,20,50,100]。不正値は除外し空配列返却 */
function parsePageSizeOptions(csv: string | undefined): number[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

interface UseListPageOptions {
  /** TABLE_IDS のいずれか。per-table のページサイズ設定取得に使用 */
  tableId: TableId;
  basePath: string;
  entityName: string;
  initialSort?: Partial<PaginationState>;
}

/**
 * 一覧ページの基本フック。
 * tableId は必須。dashboard layout で ListPreferencesProvider が loaded まで render を gate
 * しているため、本フックが動く時点で preference は揃っている前提（無ければ DEFAULT_PAGE_SIZE）。
 */
export function useListPage<T>(options: UseListPageOptions) {
  const { tableId, basePath, entityName, initialSort } = options;
  const crud = useCrudApi<T>(basePath, entityName);
  const preference = useTablePaginationPreference(tableId);
  const pagination = usePagination({
    ...initialSort,
    ...(preference ? { limit: preference.defaultPageSize } : {}),
  });
  const pageSizeOptions = useMemo(
    () => parsePageSizeOptions(preference?.pageSizeOptions),
    [preference?.pageSizeOptions],
  );
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});

  const { fetchAll } = crud;
  const { page, limit, sort, order, resetPage } = pagination;

  const load = useCallback(() => {
    const cleanFilters: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value) cleanFilters[key] = value;
    }
    fetchAll({ page, limit, sort, order, ...cleanFilters });
  }, [fetchAll, page, limit, sort, order, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFilterChange = useCallback(
    (newFilters: Record<string, string | undefined>) => {
      setFilters(newFilters);
      resetPage();
    },
    [resetPage],
  );

  return {
    items: crud.items,
    meta: crud.meta,
    loading: crud.loading,
    initialized: crud.initialized,
    pagination,
    pageSizeOptions,
    filters,
    handleFilterChange,
    reload: load,
    remove: crud.remove,
  };
}
