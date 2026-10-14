import { describe, it, expect } from 'vitest';
import { carrierSchema } from '@/features/carriers/lib/validations';

describe('carrierSchema', () => {
  const validData = { code: 'CR-001', name: '運送会社A', status: 'ACTIVE' as const };

  it('有効なデータはパスすること', () => {
    expect(carrierSchema.safeParse(validData).success).toBe(true);
  });

  it('コード必須', () => {
    expect(carrierSchema.safeParse({ ...validData, code: '' }).success).toBe(false);
  });

  it('名前必須', () => {
    expect(carrierSchema.safeParse({ ...validData, name: '' }).success).toBe(false);
  });

  it('無効なステータスは拒否', () => {
    expect(carrierSchema.safeParse({ ...validData, status: 'INVALID' }).success).toBe(false);
  });

  it('emailが空文字列でもパスすること', () => {
    expect(carrierSchema.safeParse({ ...validData, email: '' }).success).toBe(true);
  });

  it('無効なemailは拒否', () => {
    expect(carrierSchema.safeParse({ ...validData, email: 'invalid' }).success).toBe(false);
  });

  it('オプションフィールドは省略可', () => {
    expect(carrierSchema.safeParse(validData).success).toBe(true);
  });
});
