import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import PendingPage from '@/app/pending/page';

const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import apiClient from '@/lib/api-client';

describe('PendingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pending(role=null) ユーザーに承認待ち画面とログアウトを表示すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { id: '1', name: 'pending-user', role: null } },
    });

    render(<PendingPage />);

    await waitFor(() => {
      expect(screen.getByText('アカウント承認待ち')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /ログアウト/ })).toBeInTheDocument();
  });

  it('ログアウトボタンで POST /auth/logout を呼ぶこと', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { id: '1', name: 'pending-user', role: null } },
    });
    vi.mocked(apiClient.post).mockResolvedValue({});

    render(<PendingPage />);

    await waitFor(() => {
      expect(screen.getByText('アカウント承認待ち')).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByRole('button', { name: /ログアウト/ }).click();
    });

    expect(apiClient.post).toHaveBeenCalledWith('/auth/logout');
  });

  it('role 付与済ユーザーは /home へ redirect すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { id: '1', name: 'admin', role: 'SYS_ADMIN' } },
    });

    render(<PendingPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
    expect(screen.queryByText('アカウント承認待ち')).not.toBeInTheDocument();
  });
});
