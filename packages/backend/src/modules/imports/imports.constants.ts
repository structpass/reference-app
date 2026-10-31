/**
 * CSV 取込の上限定数。announcements の `MAX_UPLOAD_BYTES` パターンに倣い env var にはしない。
 * spec §7.4 — 開発統括確定 / spec review 承認済（2026-05-20）。
 */

/** 1 ファイルの絶対サイズ上限（10 MB）。multer 側で hard limit を掛ける。 */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** 取込可能なデータ行数の上限（ヘッダー除く）。 */
export const MAX_IMPORT_ROWS = 10000;

/** CSV 取込検証エラーの error code。新規 code は追加せず VALIDATION_ERROR を流用（spec §6.1）。 */
export const IMPORT_VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';
