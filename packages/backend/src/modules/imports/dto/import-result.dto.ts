/**
 * 行レベル検証エラー 1 件。`BadRequestException` の payload `details.rows[]` に載る。
 * backend / frontend で同一概念だったため shared 型に一本化した（naming-shape §5）。
 */
export type { ImportRowError } from '@struct-pass/shared';

/**
 * CSV 取込の成功時レスポンス DTO（spec §6.1）。
 * `ok()` ヘルパで `{ success: true, data: ImportResultDto }` の形に包んで返す。
 */
export interface ImportResultDto {
  /** 取込対象キー（例: 'products'）。 */
  target: string;
  /** ドライラン（検証のみ）だったか。 */
  dryRun: boolean;
  /** 新規作成された（dryRun 時は見込み）行数。 */
  created: number;
  /** 更新された（dryRun 時は見込み）行数。 */
  updated: number;
}
