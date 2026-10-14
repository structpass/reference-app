import { BadRequestException } from '@nestjs/common';
import { validateCustomRecordData, isValidCalendarDate } from './custom-record.validation';

describe('isValidCalendarDate', () => {
  it.each([
    ['実在日', '2026-08-01', true],
    ['月末', '2026-03-31', true],
    ['閏年の 2/29', '2024-02-29', true],
    ['非閏年の 2/29', '2025-02-29', false],
    ['存在しない月', '2026-13-01', false],
    ['月 00', '2026-00-10', false],
    ['存在しない日', '2026-02-30', false],
    ['4 月に 31 日', '2026-04-31', false],
    ['日 00', '2026-08-00', false],
    ['形式違い', '2026/08/01', false],
  ])('%s %s -> %s', (_label, input, expected) => {
    expect(isValidCalendarDate(input)).toBe(expected);
  });
});

describe('validateCustomRecordData', () => {
  const defs = [
    { key: 'name', type: 'TEXT' as const, required: true },
    { key: 'rating', type: 'NUMBER' as const, required: false },
    { key: 'reviewedOn', type: 'DATE' as const, required: false },
    { key: 'status', type: 'SELECT' as const, required: false },
    { key: 'active', type: 'BOOLEAN' as const, required: false },
  ];

  it('全フィールドが FieldDef に整合する時は通す', () => {
    expect(() =>
      validateCustomRecordData(defs, {
        name: '仕入先01',
        rating: 80,
        reviewedOn: '2026-08-01',
        status: 'active',
        active: true,
      }),
    ).not.toThrow();
  });

  it('data が null でないオブジェクト以外なら 400', () => {
    expect(() =>
      validateCustomRecordData(defs, null as unknown as Record<string, unknown>),
    ).toThrow(BadRequestException);
    expect(() => validateCustomRecordData(defs, [] as unknown as Record<string, unknown>)).toThrow(
      BadRequestException,
    );
  });

  it('未知キーを 400 で拒否する', () => {
    expect(() => validateCustomRecordData(defs, { name: 'x', unknown: 1 })).toThrow(
      BadRequestException,
    );
  });

  it('required フィールドの欠落を 400 で拒否する', () => {
    expect(() => validateCustomRecordData(defs, { rating: 80 })).toThrow(BadRequestException);
  });

  it('required フィールドが null の場合も 400 で拒否する', () => {
    expect(() => validateCustomRecordData(defs, { name: null })).toThrow(BadRequestException);
  });

  it.each([
    ['TEXT に number', { name: 123 }],
    ['NUMBER に string', { rating: 'high' }],
    ['DATE に number', { reviewedOn: 20260801 }],
    ['DATE に非 YYYY-MM-DD string', { reviewedOn: '2026/08/01' }],
    ['DATE に実在しない日付', { reviewedOn: '2026-02-30' }],
    ['DATE に実在しない月', { reviewedOn: '2026-13-01' }],
    ['SELECT に number', { status: 1 }],
    ['BOOLEAN に string', { active: 'yes' }],
  ])('型不一致を 400 で拒否する: %s', (_label, data) => {
    // data はそのまま渡す（name:'x' の上書きはせず、data 内の型不一致をそのまま検証）
    expect(() => validateCustomRecordData(defs, data)).toThrow(BadRequestException);
  });

  it('NUMBER の非有限値（NaN/Infinity）を 400 で拒否する', () => {
    expect(() => validateCustomRecordData(defs, { name: 'x', rating: NaN })).toThrow(
      BadRequestException,
    );
  });
});
