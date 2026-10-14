/**
 * UserTableColumnWidth の API レスポンス DTO。
 * Prisma Entity を直返ししない（architecture-invariants §1）。
 * userId は自分自身のデータなので冗長のため含めない。
 * Date は ISO 文字列に正規化してフロントへ届ける。
 */
export class UserTableColumnWidthResponseDto {
  tableId!: string;
  columnKey!: string;
  width!: number;
  updatedAt!: string;
}
