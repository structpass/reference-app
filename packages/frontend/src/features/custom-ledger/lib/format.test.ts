import { describe, it, expect } from 'vitest';
import { formatFieldValue } from './format';

describe('formatFieldValue（ref-0078 criteria 7）', () => {
  it('null / undefined は空欄', () => {
    expect(formatFieldValue(null, 'TEXT')).toBe('');
    expect(formatFieldValue(undefined, 'NUMBER')).toBe('');
  });

  it('TEXT は文字列のまま', () => {
    expect(formatFieldValue('あいう', 'TEXT')).toBe('あいう');
    expect(formatFieldValue(123, 'TEXT')).toBe('123');
  });

  it('NUMBER は文字列化', () => {
    expect(formatFieldValue(42, 'NUMBER')).toBe('42');
  });

  it('DATE は日付部分のみ', () => {
    expect(formatFieldValue('2026-08-15T00:00:00.000Z', 'DATE')).toBe('2026-08-15');
  });

  it('BOOLEAN は はい / いいえ', () => {
    expect(formatFieldValue(true, 'BOOLEAN')).toBe('はい');
    expect(formatFieldValue(false, 'BOOLEAN')).toBe('いいえ');
  });

  it('未知型・オブジェクト値は文字列化（JSON.stringify）', () => {
    expect(formatFieldValue({ a: 1 }, 'SELECT')).toBe('{"a":1}');
    expect(formatFieldValue('raw', 'SELECT')).toBe('raw');
  });
});
