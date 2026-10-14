import { describe, it, expect } from 'vitest';
import { groupSchema } from '@/features/groups/lib/validations';

describe('groupSchema', () => {
  const validData = {
    code: 'GRP-001',
    name: 'グループA',
    role: 'WH_USER' as const,
    status: 'ACTIVE' as const,
  };

  it('有効なデータはパスすること', () => {
    expect(groupSchema.safeParse(validData).success).toBe(true);
  });

  it('コード必須', () => {
    expect(groupSchema.safeParse({ ...validData, code: '' }).success).toBe(false);
  });

  it('名前必須', () => {
    expect(groupSchema.safeParse({ ...validData, name: '' }).success).toBe(false);
  });

  it('descriptionはオプション', () => {
    expect(groupSchema.safeParse({ ...validData, description: 'テスト' }).success).toBe(true);
  });
});
