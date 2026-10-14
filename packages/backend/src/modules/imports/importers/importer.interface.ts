import { ImportRowError } from '../dto/import-result.dto';

/**
 * 取込対象の検証結果。
 * - 失敗: `{ errors }` に行レベルエラーを 1 件以上収集（validated は無し）
 * - 成功: `{ errors: [], validated }` に commit / dryRun で使う正規化済み行を保持
 *
 * 検証エラーは値として収集する（try/catch を散らさない — architecture-invariants §4）。
 */
export interface ImportValidationResult<TRow> {
  errors: ImportRowError[];
  validated: TRow[];
}

/**
 * 取込対象（products / 将来は warehouses 等）を抽象化する interface。
 *
 * 2 モジュール目の追加で逐語コピペが発生しないよう、初回から取込対象を抽象化する
 * （architecture-invariants §3）。`product.importer.ts` がこの interface の最初の実装。
 *
 * `TRow` は検証を通過した正規化済み行の型。`ImportsService` は `TRow` の中身を知らず、
 * importer に validate → (commit | dryRunCounts) を委譲するだけのオーケストレーションに留まる。
 */
export interface ImportTarget<TRow = unknown> {
  /** URL パラメータ `:target` と照合するキー（例: 'products'）。 */
  readonly key: string;

  /** テンプレート / 取込ファイルの期待ヘッダー（日本語、列順厳守）。 */
  readonly templateHeaders: readonly string[];

  /**
   * パース済みデータ行（ヘッダー除く生文字列配列）を行レベル検証する。
   * カテゴリー存在確認などで DB を引くため async。
   * 列数がヘッダーと不一致の行は行レベルエラーとして扱う（ファイル全体は中断しない）。
   */
  validate(dataRows: string[][]): Promise<ImportValidationResult<TRow>>;

  /**
   * 検証済み行を単一トランザクションで upsert する（all-or-nothing）。
   * `$transaction` は Repository 層が所有する（architecture-invariants §2）。
   */
  commit(rows: TRow[], userId: string): Promise<{ created: number; updated: number }>;

  /**
   * commit せず、新規 / 更新の見込み件数を算出する（dryRun=true 用）。
   */
  dryRunCounts(rows: TRow[]): Promise<{ created: number; updated: number }>;
}
