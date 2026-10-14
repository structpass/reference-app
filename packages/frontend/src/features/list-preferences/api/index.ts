'use client';

import apiClient from '@/lib/api-client';
import type {
  TablePaginationSetting,
  BulkUpdateTablePaginationSettingItem,
  TableId,
} from '@struct-pass/shared';

interface ListPaginationSettingResponse {
  tableId: TableId;
  defaultPageSize: number;
  pageSizeOptions: string;
  createdAt: string;
  updatedAt: string;
  updatedById?: string | null;
  updatedBy?: { id: string; name: string } | null;
}

function toEntity(res: ListPaginationSettingResponse): TablePaginationSetting {
  return {
    tableId: res.tableId,
    defaultPageSize: res.defaultPageSize,
    pageSizeOptions: res.pageSizeOptions,
    createdAt: res.createdAt,
    updatedAt: res.updatedAt,
    updatedById: res.updatedById ?? null,
    updatedBy: res.updatedBy ?? null,
  };
}

export async function fetchListPaginationSettings(): Promise<TablePaginationSetting[]> {
  const res = await apiClient.get<{ data: ListPaginationSettingResponse[] }>(
    '/list-pagination-settings',
  );
  return (res.data.data ?? []).map(toEntity);
}

export async function bulkUpdateListPaginationSettings(
  updates: BulkUpdateTablePaginationSettingItem[],
): Promise<TablePaginationSetting[]> {
  const res = await apiClient.put<{ data: ListPaginationSettingResponse[] }>(
    '/list-pagination-settings',
    { updates },
  );
  return (res.data.data ?? []).map(toEntity);
}
