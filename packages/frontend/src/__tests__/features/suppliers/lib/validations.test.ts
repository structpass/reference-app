import { describe, it, expect } from 'vitest';
import { supplierSchema } from '@/features/suppliers/lib/validations';

describe('supplierSchema', () => {
  it('有効なデータでパースが成功すること', () => {
    const result = supplierSchema.safeParse({
      code: 'SUP-001',
      name: 'テスト仕入先',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(true);
  });

  it('INACTIVEステータスが有効であること', () => {
    const result = supplierSchema.safeParse({
      code: 'SUP-002',
      name: '無効仕入先',
      status: 'INACTIVE',
    });
    expect(result.success).toBe(true);
  });

  it('任意フィールドが存在しなくても有効であること', () => {
    const result = supplierSchema.safeParse({
      code: 'SUP-001',
      name: 'テスト仕入先',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(true);
  });

  it('すべての任意フィールドを含んでも有効であること', () => {
    const result = supplierSchema.safeParse({
      code: 'SUP-001',
      name: 'テスト仕入先',
      address: '東京都千代田区1-1',
      phone: '03-1234-5678',
      contactPerson: '担当者名',
      email: 'test@example.com',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(true);
  });

  it('codeが空の場合にバリデーションエラーになること', () => {
    const result = supplierSchema.safeParse({
      code: '',
      name: 'テスト仕入先',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('コードは必須です');
    }
  });

  it('nameが空の場合にバリデーションエラーになること', () => {
    const result = supplierSchema.safeParse({
      code: 'SUP-001',
      name: '',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('名前は必須です');
    }
  });

  it('無効なメールアドレスでバリデーションエラーになること', () => {
    const result = supplierSchema.safeParse({
      code: 'SUP-001',
      name: 'テスト仕入先',
      email: 'invalid-email',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('有効なメールアドレスを入力してください');
    }
  });

  it('空文字メールアドレスは有効であること', () => {
    const result = supplierSchema.safeParse({
      code: 'SUP-001',
      name: 'テスト仕入先',
      email: '',
      status: 'ACTIVE',
    });
    expect(result.success).toBe(true);
  });

  it('無効なステータスでバリデーションエラーになること', () => {
    const result = supplierSchema.safeParse({
      code: 'SUP-001',
      name: 'テスト仕入先',
      status: 'UNKNOWN',
    });
    expect(result.success).toBe(false);
  });
});
