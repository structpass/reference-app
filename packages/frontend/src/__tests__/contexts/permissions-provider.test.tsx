import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, waitFor, act } from '@testing-library/react';
import { PermissionsProvider, usePermissionsContext } from '@/contexts/permissions-provider';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
  },
}));

// PermissionsProvider は useAuth() を経由して auth 解決を待つ。
// テストでは固定の SYS_ADMIN ユーザーを返して fetch が即座に走る状態を作る。
// IMPORTANT: useAuth() の戻り値オブジェクトは render 間で参照を安定させること。
// 都度 new object を返すと useEffect 依存が変化したと判定され再 fetch される。
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

describe('PermissionsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mount 時に /permissions/my-permissions を 1 回だけ fetch すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: {
          permissions: [
            {
              featureId: 'products',
              canView: true,
              canCreate: true,
              canUpdate: true,
              canDelete: true,
            },
          ],
        },
      },
    });

    const { result } = renderHook(() => usePermissionsContext(), {
      wrapper: PermissionsProvider,
    });

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith('/permissions/my-permissions');
    expect(result.current.permissions).toHaveLength(1);
    expect(result.current.error).toBe(false);
  });

  it('複数 consumer が居ても fetch は 1 回だけ（Context 共有）', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: {
          permissions: [
            {
              featureId: 'products',
              canView: true,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
            },
          ],
        },
      },
    });

    function Consumer() {
      const { loaded } = usePermissionsContext();
      return <span>{loaded ? 'ok' : 'pending'}</span>;
    }

    render(
      <PermissionsProvider>
        <Consumer />
        <Consumer />
        <Consumer />
      </PermissionsProvider>,
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledTimes(1);
    });
  });

  it('refresh() を呼ぶと再 fetch されること（matrix 保存後の用途）', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { permissions: [] } },
    });

    const { result } = renderHook(() => usePermissionsContext(), {
      wrapper: PermissionsProvider,
    });

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('fetch 失敗時は fail-closed（loaded=true / error=true / permissions=[]）', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePermissionsContext(), {
      wrapper: PermissionsProvider,
    });

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.error).toBe(true);
    expect(result.current.permissions).toEqual([]);
  });

  it('refresh() 中の二重呼び出しは 1 リクエストにまとめる（inflight dedup）', async () => {
    // never resolves until we release it
    let resolveFetch: ((v: unknown) => void) | undefined;
    vi.mocked(apiClient.get).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }) as ReturnType<typeof apiClient.get>,
    );

    const { result } = renderHook(() => usePermissionsContext(), {
      wrapper: PermissionsProvider,
    });

    // mount-time fetch is already inflight。連打しても呼び出し回数は増えない
    await act(async () => {
      void result.current.refresh();
      void result.current.refresh();
      void result.current.refresh();
    });

    expect(apiClient.get).toHaveBeenCalledTimes(1);

    // 解放してテスト終端のための後始末
    await act(async () => {
      resolveFetch?.({ data: { data: { permissions: [] } } });
      await Promise.resolve();
    });
  });

  it('Provider 外で usePermissionsContext を呼ぶと throw すること', () => {
    // suppress React's error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => usePermissionsContext())).toThrow(/PermissionsProvider/);
    spy.mockRestore();
  });
});
