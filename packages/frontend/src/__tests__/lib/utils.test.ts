import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatDate, formatISODate, todayISODate } from '@/lib/utils';

describe('utils', () => {
  describe('cn', () => {
    it('クラスを結合すること', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('Tailwindの競合を解決すること', () => {
      expect(cn('px-2', 'px-4')).toBe('px-4');
    });

    it('falsy値を無視すること', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
    });
  });

  describe('formatCurrency', () => {
    it('カンマ区切りでフォーマットすること', () => {
      const result = formatCurrency(1000);
      expect(result).toContain('1,000');
    });

    it('0をフォーマットすること', () => {
      const result = formatCurrency(0);
      expect(result).toContain('0');
    });
  });

  describe('formatDate', () => {
    it('Dateオブジェクトをフォーマットすること', () => {
      const result = formatDate(new Date('2026-03-16T10:30:00'));
      expect(result).toContain('2026');
      expect(result).toContain('03');
      expect(result).toContain('16');
    });

    it('文字列の日付をフォーマットすること', () => {
      expect(formatDate('2026-03-16T10:30:00')).toBe('2026/03/16');
    });

    it('ISO日時文字列はUTCの日付部分を抽出する(TZシフト回避)', () => {
      expect(formatDate('2026-03-16T23:59:59.000Z')).toBe('2026/03/16');
    });

    it('date-only文字列もそのまま抽出する', () => {
      expect(formatDate('2026-04-17')).toBe('2026/04/17');
    });
  });

  describe('formatISODate', () => {
    it('ISO日時文字列からYYYY-MM-DDを返す', () => {
      expect(formatISODate('2026-04-17T23:59:59.000Z')).toBe('2026-04-17');
    });

    it('date-only文字列はそのまま返す', () => {
      expect(formatISODate('2026-04-17')).toBe('2026-04-17');
    });

    it('DateオブジェクトからUTC日付を返す', () => {
      const d = new Date('2026-04-17T10:00:00.000Z');
      expect(formatISODate(d)).toBe('2026-04-17');
    });
  });

  describe('todayISODate', () => {
    it('YYYY-MM-DD形式を返す', () => {
      expect(todayISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
