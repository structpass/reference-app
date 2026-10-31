import { describe, it, expect, vi } from 'vitest';
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
    it('ISO日時文字列から日本時間の日付（YYYY-MM-DD）を返す', () => {
      // 2026-04-17 23:59Z = 2026-04-18 08:59 JST（UTC のまま読むと前日になる）
      expect(formatISODate('2026-04-17T23:59:59.000Z')).toBe('2026-04-18');
    });

    it('date-only文字列はそのまま返す', () => {
      expect(formatISODate('2026-04-17')).toBe('2026-04-17');
    });

    // d644: 実行環境（サーバー・ブラウザ）の時計に従わず、日本時間の日付で返す。
    it('ISO日時文字列は日本時間の日付を返す（UTCのまま読まない）', () => {
      // 2026-03-16 15:05Z = 2026-03-17 00:05 JST
      expect(formatISODate('2026-03-16T15:05:00.000Z')).toBe('2026-03-17');
    });

    it('Dateオブジェクトも日本時間の日付で返す', () => {
      const d = new Date('2026-04-17T10:00:00.000Z');
      expect(formatISODate(d)).toBe('2026-04-17');
      expect(formatISODate(new Date('2026-04-17T15:00:00.000Z'))).toBe('2026-04-18');
    });
  });

  describe('todayISODate', () => {
    it('YYYY-MM-DD形式を返す', () => {
      expect(todayISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    // d644: 日本時間の早朝（UTC の前日）に、前日の日付を返さない。
    it('日本時間の 0:05 はその日の日付を返す（UTC の前日にならない）', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-03-16T15:05:00.000Z'));
        expect(todayISODate()).toBe('2026-03-17');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
