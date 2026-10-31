/**
 * CSV 取込の行レベル検証エラー 1 件（spec §6.1 `details.rows[]`）。
 * backend dto（`RowError`）と frontend api（`ImportRowError`）で同一概念が
 * 別名定義されていたため、shared 型として一本化する（naming-shape §5）。
 *
 * `row` は CSV のデータ行番号（ヘッダー除く 1 始まり）。
 */
export interface ImportRowError {
  /** データ行番号（ヘッダー除く 1 始まり）。 */
  row: number;
  /** エラー対象の列ヘッダー（日本語）。行全体に関わるエラーは省略可。 */
  column?: string;
  /** エラー内容。 */
  message: string;
}
