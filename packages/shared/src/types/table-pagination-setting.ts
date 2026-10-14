import type { TableId } from '../table-ids';

/**
 * 一覧ごとのページサイズ設定（admin / system scope）。
 * pk = tableId 単独。user 軸を持たない（列幅 = user / pageSize = system の責任分担）。
 * pageSizeOptions は "10,20,50,100" 形式のカンマ区切り文字列。
 */
export interface TablePaginationSetting {
  tableId: TableId;
  defaultPageSize: number;
  pageSizeOptions: string;
  createdAt: string;
  updatedAt: string;
  updatedById?: string | null;
  updatedBy?: { id: string; name: string } | null;
}

/** PUT /list-pagination-settings（一括更新）のリクエスト DTO 1 件分 */
export interface BulkUpdateTablePaginationSettingItem {
  tableId: TableId;
  defaultPageSize: number;
  pageSizeOptions: string;
}
