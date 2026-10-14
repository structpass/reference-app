/**
 * TablePaginationSetting の API レスポンス DTO。
 * Prisma Entity を直返ししない（architecture-invariants §1）。
 * Date は ISO 文字列に正規化、リレーション updatedBy は { id, name } のみ展開。
 */
export class TablePaginationSettingResponseDto {
  tableId!: string;
  defaultPageSize!: number;
  pageSizeOptions!: string;
  createdAt!: string;
  updatedAt!: string;
  updatedById?: string | null;
  updatedBy?: { id: string; name: string } | null;
}
