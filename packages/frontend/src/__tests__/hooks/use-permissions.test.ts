import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionsProvider } from '@/contexts/permissions-provider';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('@/features/auth/hooks/use-auth', () => {
  const fakeAuth = {
    user: { id: 'u1', name: 'tester', role: 'SYS_ADMIN' },
    loading: false,
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
  return {
    useAuth: () => fakeAuth,
    AuthContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
  };
});

import apiClient from '@/lib/api-client';

const wrapper = PermissionsProvider;

describe('usePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ロード前はcanViewがfalseを返すこと（fail-closed）', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => usePermissions(), { wrapper });

    expect(result.current.loaded).toBe(false);
    expect(result.current.canView('A-1')).toBe(false);
  });

  it('権限データを取得してcanViewが正しく判定すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: {
          permissions: [
            { featureId: 'A-1', canView: true, canCreate: true, canUpdate: true, canDelete: true },
            {
              featureId: 'A-2',
              canView: false,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
            },
          ],
        },
      },
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.canView('A-1')).toBe(true);
    expect(result.current.canView('A-2')).toBe(false);
    expect(result.current.canView('A-99')).toBe(false); // 未定義はfalse（fail-closed）
  });

  it('canCreate/canUpdate/canDeleteが正しく判定すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: {
          permissions: [
            {
              featureId: 'A-1',
              canView: true,
              canCreate: true,
              canUpdate: false,
              canDelete: false,
            },
          ],
        },
      },
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.canCreate('A-1')).toBe(true);
    expect(result.current.canUpdate('A-1')).toBe(false);
    expect(result.current.canDelete('A-1')).toBe(false);
    // 未定義のfeatureIdはcreate/update/deleteでfalse
    expect(result.current.canCreate('A-99')).toBe(false);
    expect(result.current.canUpdate('A-99')).toBe(false);
    expect(result.current.canDelete('A-99')).toBe(false);
  });

  it('エラー時もloadedがtrueになること', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Unauthorized'));

    const { result } = renderHook(() => usePermissions(), { wrapper });

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
  });

  it('エラー時にすべてのcan*メソッドがfalseを返すこと（fail-closed）', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePermissions(), { wrapper });

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.error).toBe(true);
    expect(result.current.canView('A-1')).toBe(false);
    expect(result.current.canCreate('A-1')).toBe(false);
    expect(result.current.canUpdate('A-1')).toBe(false);
    expect(result.current.canDelete('A-1')).toBe(false);
  });
});
