import { describe, it, expect } from 'vitest';
import {
  userCreateSchema,
  userEditSchema,
  PENDING_ROLE_VALUE,
} from '@/features/users/lib/validations';

describe('userCreateSchema', () => {
  const validData = {
    name: 'testuser',
    email: 'test@example.com',
    role: 'WH_USER' as const,
    status: 'ACTIVE',
  };

  it('有効なデータはパスすること', () => {
    expect(userCreateSchema.safeParse(validData).success).toBe(true);
  });

  it('名前必須', () => {
    expect(userCreateSchema.safeParse({ ...validData, name: '' }).success).toBe(false);
  });

  it('メール形式チェック', () => {
    expect(userCreateSchema.safeParse({ ...validData, email: 'invalid' }).success).toBe(false);
  });

  it('role 未選択（権限待ち = 空文字）も有効', () => {
    expect(userCreateSchema.safeParse({ ...validData, role: PENDING_ROLE_VALUE }).success).toBe(
      true,
    );
  });

  it('全ロールが有効', () => {
    for (const role of ['WH_USER', 'WH_ADMIN', 'OF_USER', 'OF_ADMIN', 'SYS_ADMIN']) {
      expect(userCreateSchema.safeParse({ ...validData, role }).success).toBe(true);
    }
  });

  it('未知の role は無効', () => {
    expect(userCreateSchema.safeParse({ ...validData, role: 'UNKNOWN' }).success).toBe(false);
  });
});

describe('userEditSchema', () => {
  const validData = {
    name: 'testuser',
    email: 'test@example.com',
    role: 'WH_USER' as const,
    status: 'ACTIVE',
  };

  it('有効なデータはパスすること', () => {
    expect(userEditSchema.safeParse(validData).success).toBe(true);
  });

  it('role 未選択（権限待ち）も有効', () => {
    expect(userEditSchema.safeParse({ ...validData, role: PENDING_ROLE_VALUE }).success).toBe(true);
  });
});
