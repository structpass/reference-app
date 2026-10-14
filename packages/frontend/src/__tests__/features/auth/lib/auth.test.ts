import { describe, it, expect } from 'vitest';
import { AUTH_COOKIE_NAME } from '@/features/auth/lib/auth';

describe('auth', () => {
  it('AUTH_COOKIE_NAMEがエクスポートされていること', () => {
    expect(AUTH_COOKIE_NAME).toBe('sp_access_token');
  });
});
