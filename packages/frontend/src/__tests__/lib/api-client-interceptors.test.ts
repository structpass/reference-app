import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('api-client interceptors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('withCredentials: trueが設定されていること', async () => {
    const { default: apiClient } = await import('@/lib/api-client');
    expect(apiClient.defaults.withCredentials).toBe(true);
  });

  it('401レスポンス時にAuthorizationヘッダーが存在しないこと', async () => {
    const { default: apiClient } = await import('@/lib/api-client');
    // リクエストインターセプターが存在しないことを確認
    const handlers = (
      apiClient.interceptors.request as unknown as {
        handlers: Array<{ fulfilled: unknown } | null>;
      }
    ).handlers.filter(Boolean);
    // Authorizationヘッダーを注入するインターセプターは存在しない
    expect(handlers.length).toBe(0);
  });

  it('レスポンスインターセプターが登録されていること', async () => {
    const { default: apiClient } = await import('@/lib/api-client');
    const handlers = (
      apiClient.interceptors.response as unknown as {
        handlers: Array<{ fulfilled: unknown } | null>;
      }
    ).handlers.filter(Boolean);
    expect(handlers.length).toBeGreaterThan(0);
  });
});
