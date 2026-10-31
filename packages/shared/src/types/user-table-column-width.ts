import type { TableId } from '../table-ids';

/**
 * ユーザー別テーブル列幅（user scope・pk = tableId + columnKey）。
 * backend UserTableColumnWidthResponseDto / frontend API 返却 shape の単一ソース。
 * userId は自分自身のデータなので API 応答に含めない。
 */
export interface UserTableColumnWidth {
  tableId: TableId;
  columnKey: string;
  width: number;
  updatedAt: string;
}
