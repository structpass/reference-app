import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { PermissionsProvider } from '@/contexts/permissions-provider';

const replaceMock = vi.fn();
const routerMock = { replace: replaceMock };
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

vi.mock('@/lib/api-client', () => ({
  default: { get: vi.fn() },
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

const CHILD_TEST_ID = 'guarded-child';

function renderGuard(props: {
  featureId: Parameters<typeof FeatureGuard>[0]['featureId'];
  action: Parameters<typeof FeatureGuard>[0]['action'];
  fallbackPath?: string;
}) {
  return render(
    <PermissionsProvider>
      <FeatureGuard {...props}>
        <div data-testid={CHILD_TEST_ID}>protected content</div>
      </FeatureGuard>
    </PermissionsProvider>,
  );
}

describe('<FeatureGuard>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceMock.mockClear();
  });

  it('loaded=false のあいだは redirect せず children も描画しないこと', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    renderGuard({ featureId: 'products', action: 'create' });
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId(CHILD_TEST_ID)).toBeNull();
  });

  it('permission=true のときは redirect せず children を描画すること', async () => {
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
    renderGuard({ featureId: 'products', action: 'create' });
    await waitFor(() => {
      expect(screen.getByTestId(CHILD_TEST_ID)).toBeInTheDocument();
    });
    await expect.poll(() => replaceMock.mock.calls.length, { timeout: 100 }).toBe(0);
  });

  it('permission=false のときは一覧へ redirect すること（view）', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: {
          permissions: [
            {
              featureId: 'products',
              canView: false,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
            },
          ],
        },
      },
    });
    renderGuard({ featureId: 'products', action: 'view' });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard/products');
    });
    expect(screen.queryByTestId(CHILD_TEST_ID)).toBeNull();
  });

  it('permission=true のときは children を描画すること（view）', async () => {
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
    renderGuard({ featureId: 'products', action: 'view' });
    await waitFor(() => {
      expect(screen.getByTestId(CHILD_TEST_ID)).toBeInTheDocument();
    });
    await expect.poll(() => replaceMock.mock.calls.length, { timeout: 100 }).toBe(0);
  });

  it('permission=false のときは一覧へ redirect すること（create）', async () => {
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
    renderGuard({ featureId: 'products', action: 'create' });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard/products');
    });
    expect(screen.queryByTestId(CHILD_TEST_ID)).toBeNull();
  });

  it('permission=false のときは一覧へ redirect すること（update）', async () => {
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
    renderGuard({ featureId: 'products', action: 'update' });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard/products');
    });
    expect(screen.queryByTestId(CHILD_TEST_ID)).toBeNull();
  });

  it('permission=false のときは一覧へ redirect すること（delete）', async () => {
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
    renderGuard({ featureId: 'products', action: 'delete' });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard/products');
    });
    expect(screen.queryByTestId(CHILD_TEST_ID)).toBeNull();
  });

  it('error=true のとき fail-closed で redirect し children も描画しないこと', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
    renderGuard({ featureId: 'products', action: 'create' });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard/products');
    });
    expect(screen.queryByTestId(CHILD_TEST_ID)).toBeNull();
  });

  it('fallbackPath を渡すとそこへ redirect すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: {
          permissions: [
            {
              featureId: 'products',
              canView: false,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
            },
          ],
        },
      },
    });
    render(
      <PermissionsProvider>
        <FeatureGuard featureId="products" action="create" fallbackPath="/dashboard">
          <div data-testid={CHILD_TEST_ID}>protected content</div>
        </FeatureGuard>
      </PermissionsProvider>,
    );
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('hyphen featureId は fallback path に正しく反映されること (system-parameters)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: {
          permissions: [
            {
              featureId: 'system-parameters',
              canView: true,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
            },
          ],
        },
      },
    });
    renderGuard({ featureId: 'system-parameters', action: 'create' });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard/system-parameters');
    });
  });

  it('redirect は同じ permission 結果に対して 1 回だけ呼ばれること', async () => {
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
    // wrapper option を使うことで rerender 時に Provider instance が再生成されない
    // （Provider の useEffect / fetch が二度走らない）
    const { rerender } = render(
      <FeatureGuard featureId="products" action="create">
        <div data-testid={CHILD_TEST_ID}>protected content</div>
      </FeatureGuard>,
      { wrapper: PermissionsProvider },
    );
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
    });
    rerender(
      <FeatureGuard featureId="products" action="create">
        <div data-testid={CHILD_TEST_ID}>protected content</div>
      </FeatureGuard>,
    );
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });
});
