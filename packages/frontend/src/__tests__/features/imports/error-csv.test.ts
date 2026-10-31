import { describe, it, expect } from 'vitest';
import { buildErrorCsv } from '@/features/imports/lib/error-csv';
import type { ImportRowError } from '@/features/imports/lib/api';

describe('buildErrorCsv', () => {
  it('BOM 付き UTF-8 のヘッダー行を生成すること', () => {
    const csv = buildErrorCsv([]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('行番号,列,理由');
  });

  it('行エラーを CSV 行に変換すること', () => {
    const rows: ImportRowError[] = [
      { row: 3, column: '価格', message: '数値として解釈できません' },
      { row: 7, column: 'カテゴリーコード', message: "カテゴリーコード 'CAT-999' が存在しません" },
    ];
    const csv = buildErrorCsv(rows);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('行番号,列,理由');
    expect(lines[1]).toBe('3,価格,数値として解釈できません');
    expect(lines[2]).toBe("7,カテゴリーコード,カテゴリーコード 'CAT-999' が存在しません");
  });

  it('カンマ・ダブルクォート・改行を含むフィールドを RFC4180 でエスケープすること', () => {
    const rows: ImportRowError[] = [
      { row: 1, column: '商品名', message: 'a,b' },
      { row: 2, column: '説明', message: 'he said "hi"' },
      { row: 3, column: 'メモ', message: 'line1\nline2' },
    ];
    const csv = buildErrorCsv(rows).replace('﻿', '');
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('1,商品名,"a,b"');
    expect(lines[2]).toBe('2,説明,"he said ""hi"""');
    expect(lines[3]).toBe('3,メモ,"line1\nline2"');
  });

  it('空配列でもヘッダー行のみ返すこと', () => {
    const csv = buildErrorCsv([]).replace('﻿', '');
    expect(csv).toBe('行番号,列,理由');
  });
});
