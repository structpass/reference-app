/**
 * 一覧ページサイズ設定の編集ドラフト型とバリデーション述語。
 *
 * ページ側（保存ボタンの活性判定 = invalidKeys 算出）とフォーム側（行ごとの
 * aria-invalid 表示）の両方が同じ規則を参照するため、ここを SSOT とする
 * （architecture-invariants §3: コピペ禁止）。
 */

/** 1〜10000 の正の整数のカンマ区切り（最大 10 個）。外部からは述語関数経由で参照する。 */
const PAGE_SIZE_OPTIONS_RE = /^[1-9]\d{0,4}(,[1-9]\d{0,4}){0,9}$/;

export type PageSizeDraft = { defaultPageSize: number; pageSizeOptions: string };

/** デフォルト件数が 1〜10000 の整数か。 */
export function isDefaultPageSizeValid(size: number): boolean {
  return Number.isInteger(size) && size >= 1 && size <= 10000;
}

/** 表示件数選択肢がカンマ区切り正整数列か。 */
export function isPageSizeOptionsValid(options: string): boolean {
  return PAGE_SIZE_OPTIONS_RE.test(options);
}

/** ドラフト 1 行が無効（保存不可）か。 */
export function isPageSizeDraftInvalid(draft: PageSizeDraft): boolean {
  return (
    !isDefaultPageSizeValid(draft.defaultPageSize) || !isPageSizeOptionsValid(draft.pageSizeOptions)
  );
}
