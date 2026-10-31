import { describe, it, expect } from 'vitest';
import { categorySchema } from '@/features/categories/lib/validations';

describe('categorySchema', () => {
  it('有効なデータでパースが成功すること', () => {
    const result = categorySchema.safeParse({
      code: 'CAT-001',
      name: 'テストカテゴリー',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(true);
  });

  it('INACTIVEステータスが有効であること', () => {
    const result = categorySchema.safeParse({
      code: 'CAT-002',
      name: '無効カテゴリー',
      status: 'INACTIVE',
    });
    expect(result.success).toBe(true);
  });

  it('codeが空の場合にバリデーションエラーになること', () => {
    const result = categorySchema.safeParse({
      code: '',
      name: 'テストカテゴリー',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('コードは必須です');
    }
  });

  it('codeが20文字を超える場合にバリデーションエラーになること', () => {
    const result = categorySchema.safeParse({
      code: 'A'.repeat(21),
      name: 'テストカテゴリー',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('コードは20文字以内で入力してください');
    }
  });

  it('nameが空の場合にバリデーションエラーになること', () => {
    const result = categorySchema.safeParse({
      code: 'CAT-001',
      name: '',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('名前は必須です');
    }
  });

  it('nameが100文字を超える場合にバリデーションエラーになること', () => {
    const result = categorySchema.safeParse({
      code: 'CAT-001',
      name: 'あ'.repeat(101),
      status: 'ACTIVE',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('名前は100文字以内で入力してください');
    }
  });

  it('無効なステータスでバリデーションエラーになること', () => {
    const result = categorySchema.safeParse({
      code: 'CAT-001',
      name: 'テストカテゴリー',
      status: 'UNKNOWN',
    });
    expect(result.success).toBe(false);
  });

  it('codeが最大長（20文字）で有効であること', () => {
    const result = categorySchema.safeParse({
      code: 'A'.repeat(20),
      name: 'テストカテゴリー',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(true);
  });

  it('nameが最大長（100文字）で有効であること', () => {
    const result = categorySchema.safeParse({
      code: 'CAT-001',
      name: 'あ'.repeat(100),
      status: 'ACTIVE',
    });
    expect(result.success).toBe(true);
  });
});
