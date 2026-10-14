import { Injectable } from '@nestjs/common';

/**
 * Excel / Google Sheets が数式として評価しうる先頭文字（CSV formula injection 対策）。
 * frontend の `features/imports/lib/error-csv.ts` と同一定義（shared=types 境界維持のため
 * runtime helper は各 package ローカルに置く。逐語一致は §3 閾値 20 行未満）。
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * `CsvService.parse()` の戻り値。例外を投げず discriminated result で成否を返す。
 * - 成功: `{ ok: true, rows }` — ヘッダー行 + データ行の生文字列二次元配列
 * - 失敗: `{ ok: false, error }` — 引用符が閉じない等の不正 CSV
 */
export type CsvParseResult = { ok: true; rows: string[][] } | { ok: false; error: string };

@Injectable()
export class CsvService {
  generate(headers: string[], rows: string[][]): Buffer {
    const bom = '﻿';
    const headerLine = headers.map((h) => this.escapeField(h)).join(',');
    const dataLines = rows.map((row) => row.map((field) => this.escapeField(field)).join(','));
    const csv = bom + [headerLine, ...dataLines].join('\r\n') + '\r\n';
    return Buffer.from(csv, 'utf-8');
  }

  /**
   * CSV 文字列を二次元配列にパースする。`generate()` と対称。
   *
   * - BOM 除去 / CRLF・LF 両対応 / RFC4180 引用符（`,` `"` `""` エスケープ）対応
   * - 引用フィールド内改行は非対応（仕様）
   * - 型変換・ヘッダー検証・列数検証は行わない（後段の検証層が担う）
   * - 例外は投げず discriminated result を返す
   */
  parse(content: string): CsvParseResult {
    // BOM 除去
    let text = content;
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    // CRLF → LF に正規化（引用フィールド内改行は非対応のため安全）
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (text.length === 0) {
      return { ok: true, rows: [] };
    }

    const rows: string[][] = [];
    let field = '';
    let row: string[] = [];
    let inQuotes = false;

    const pushField = () => {
      row.push(field);
      field = '';
    };
    const pushRow = () => {
      rows.push(row);
      row = [];
    };

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else if (ch === '\n') {
          // 引用フィールド内改行は非対応
          return { ok: false, error: '引用フィールド内の改行は対応していません' };
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"') {
        // 引用はフィールド先頭でのみ開始可能
        if (field.length > 0) {
          return {
            ok: false,
            error: '引用符の位置が不正です（フィールド途中の引用開始）',
          };
        }
        inQuotes = true;
        continue;
      }

      if (ch === ',') {
        pushField();
        continue;
      }

      if (ch === '\n') {
        pushField();
        pushRow();
        continue;
      }

      field += ch;
    }

    if (inQuotes) {
      return { ok: false, error: '引用符が閉じられていません' };
    }

    // 最終行（末尾に改行が無いケース）
    pushField();
    pushRow();

    // 末尾の空行（フィールド 1 つ・空文字）のみ取り除く。
    // 中間の空行は保持し、行番号の整合を保ったまま後段の検証層に委ねる。
    while (
      rows.length > 0 &&
      rows[rows.length - 1].length === 1 &&
      rows[rows.length - 1][0] === ''
    ) {
      rows.pop();
    }

    return { ok: true, rows };
  }

  private escapeField(field: string): string {
    // SEC-H2: 先頭が数式トリガ文字（= + - @ tab CR）の場合は ' を前置し、表計算ソフトでの
    // 数式評価を防ぐ。export には商品名等の DB 値（=ユーザー入力由来）が流れ込むため必須。
    let v = field;
    if (v.length > 0 && FORMULA_TRIGGERS.includes(v[0])) {
      v = `'${v}`;
    }
    // RFC4180: カンマ・ダブルクォート・改行（CR/LF）を含む場合は " で囲み、" は "" に二重化。
    if (/[",\r\n]/.test(v)) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  }
}
