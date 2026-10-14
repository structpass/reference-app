import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider } from '@/features/auth/components/auth-provider';
import { useAuth } from '@/features/auth/hooks/use-auth';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';
import toast from 'react-hot-toast';

function TestConsumer() {
  const { user, loading, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{loading ? 'true' : 'false'}</span>
      <span data-testid="user">{user ? user.name : 'null'}</span>
      <button onClick={logout}>ログアウト</button>
    </div>
  );
}

describe('AuthProvider', () => {
  let hrefSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        set href(value: string) {
          hrefSetter(value);
        },
      },
    });
  });

  it('クッキーがない場合(GET /auth/me失敗)にloadingがfalseになること', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Unauthorized'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('マウント時に常にGET /auth/meを呼び出すこと', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { id: 1, name: 'admin', role: 'SYS_ADMIN' } },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('admin');
    });
    expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
  });

  it('GET /auth/meが成功した場合にユーザー情報をセットすること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { id: 1, name: 'admin', role: 'SYS_ADMIN' } },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('admin');
    });
  });

  it('GET /auth/me が pending(role=null) を返してもユーザーをセットすること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { id: 2, name: 'pending-user', role: null } },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('pending-user');
    });
  });

  it('ログアウト時にPOST /auth/logoutを呼び出しrete側ログイン画面へ遷移すること（ref-0031）', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(apiClient.post).mockResolvedValue({});

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    await act(async () => {
      screen.getByText('ログアウト').click();
    });

    expect(apiClient.post).toHaveBeenCalledWith('/auth/logout');
    expect(toast.success).toHaveBeenCalledWith('ログアウトしました');
    expect(hrefSetter).toHaveBeenCalledWith('http://localhost:3010/login');
  });
});
