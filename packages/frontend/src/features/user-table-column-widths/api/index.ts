import type { TableId, UserTableColumnWidth } from '@struct-pass/shared';
import apiClient from '@/lib/api-client';

/**
 * 列幅の shape は shared の UserTableColumnWidth が単一ソース
 * （backend UserTableColumnWidthResponseDto も同型・手同期は不要）。
 * 既存利用箇所の後方互換のためここから再 export する。
 */
export type { UserTableColumnWidth };

const BASE = '/user-table-column-widths';

export async function fetchColumnWidths(tableId: TableId): Promise<UserTableColumnWidth[]> {
  const res = await apiClient.get(`${BASE}/${tableId}`);
  return res.data.data ?? [];
}

export async function upsertColumnWidth(
  tableId: TableId,
  columnKey: string,
  width: number,
): Promise<UserTableColumnWidth> {
  const res = await apiClient.put(`${BASE}/${tableId}/${encodeURIComponent(columnKey)}`, {
    width,
  });
  // backend は ok(dto) で包む → res.data.data が DTO 本体（getMine と同じ平坦 shape）
  return res.data.data as UserTableColumnWidth;
}
