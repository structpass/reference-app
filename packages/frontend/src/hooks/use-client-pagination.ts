'use client';

import { useMemo, useState } from 'react';
import type { PaginationMeta } from '@struct-pass/shared';

interface UseClientPaginationOptions {
  pageSize?: number;
}

interface UseClientPaginationResult<T> {
  pageItems: T[];
  meta: PaginationMeta;
  page: number;
  setPage: (page: number) => void;
}

export function useClientPagination<T>(
  items: T[],
  options: UseClientPaginationOptions = {},
): UseClientPaginationResult<T> {
  const pageSize = options.pageSize ?? 20;
  const [page, setPage] = useState(1);

  const total = items.length;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  // items 削減で範囲外になった page を render パス内で吸収（effect の二段 render を避ける）
  const clampedPage = Math.min(Math.max(page, 1), totalPages);

  const pageItems = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, clampedPage, pageSize]);

  const meta = useMemo<PaginationMeta>(
    () => ({ total, page: clampedPage, limit: pageSize, totalPages }),
    [total, clampedPage, pageSize, totalPages],
  );

  return { pageItems, meta, page: clampedPage, setPage };
}
