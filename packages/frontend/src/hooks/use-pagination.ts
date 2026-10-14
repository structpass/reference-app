'use client';

import { useState, useCallback } from 'react';

export interface PaginationState {
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
}

/**
 * useListPage で per-table 設定 (TablePaginationSetting) が取得できなかった場合の最終 fallback。
 * 通常運用では list-preferences の設定値が用いられるためこの定数は使用されない。
 */
export const DEFAULT_PAGE_SIZE = 50;

export function usePagination(initial?: Partial<PaginationState>) {
  const [state, setState] = useState<PaginationState>({
    page: 1,
    limit: initial?.limit ?? DEFAULT_PAGE_SIZE,
    sort: 'createdAt',
    order: 'desc',
    ...initial,
  });

  const setPage = useCallback((page: number) => {
    setState((prev) => ({ ...prev, page }));
  }, []);

  const setSort = useCallback((sort: string) => {
    setState((prev) => ({
      ...prev,
      sort,
      order: prev.sort === sort && prev.order === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  }, []);

  const setLimit = useCallback((limit: number) => {
    setState((prev) => ({ ...prev, limit, page: 1 }));
  }, []);

  const resetPage = useCallback(() => {
    setState((prev) => ({ ...prev, page: 1 }));
  }, []);

  return { ...state, setPage, setSort, setLimit, resetPage };
}
