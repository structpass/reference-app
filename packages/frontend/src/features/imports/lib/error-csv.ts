import type { ImportRowError } from './api';

/** Excel 互換のため CSV 先頭に付与する UTF-8 BOM。 */
const BOM = '﻿';

/** Excel が数式として評価しうる先頭文字（CSV formula injection 対策）。 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * RFC4180 に従い 1 フィールドをエスケープする。
 * - カンマ・ダブルクォート・改行（CR/LF）を含む場合は `"` で囲み、`"` は `""` に二重化する。
 * - 先頭が数式トリガ文字（`= + - @` 等）の場合は `'` を前置し、Excel での数式評価を防ぐ。
 *   エラー CSV のセルには取込ファイル由来のユーザー入力値が流れ込むため必須。
 */
function escapeField(value: string): string {
  let v = value;
  if (v.length > 0 && FORMULA_TRIGGERS.includes(v[0])) {
    v = `'${v}`;
  }
  if (/[",\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/**
 * 取込検証エラー（行レベル）を Excel 互換の CSV 文字列に変換する。
 *
 * - 先頭に UTF-8 BOM を付与（Excel が文字コードを誤判定しないため）。
 * - 改行は CRLF（RFC4180）。
 * - 専用エンドポイントは設けず、backend が返した `details.rows` 配列からフロント生成する
 *   （spec §8.3 で承認済 2026-05-20）。
 */
export function buildErrorCsv(rows: ImportRowError[]): string {
  const header = ['行番号', '列', '理由'].map(escapeField).join(',');
  const lines = rows.map((r) =>
    [String(r.row), r.column ?? '', r.message].map(escapeField).join(','),
  );
  return BOM + [header, ...lines].join('\r\n');
}
