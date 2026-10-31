import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRole } from '@struct-pass/shared';
import { GroupMembers } from '@/features/groups/components/group-members';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/api-client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const mockUseAuth = vi.fn();
vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

import toast from 'react-hot-toast';

const mockMembers = [
  {
    id: 'm1',
    userId: 'u1',
    user: { id: 'u1', name: 'admin', role: 'SYS_ADMIN' },
  },
];

const mockUsers = [
  { id: 'u1', name: 'admin', role: 'SYS_ADMIN' },
  { id: 'u2', name: 'user2', role: 'WH_USER' },
];

/** API のエラー応答（axios の error 形状）を作る。 */
const apiError = (status: number, message: string) => ({
  response: { status, data: { error: { message } } },
});

describe('GroupMembers - アクション', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u-sys', name: 'admin', role: 'SYS_ADMIN' } });
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/members')) {
        return Promise.resolve({ data: { data: mockMembers } });
      }
      return Promise.resolve({ data: { data: mockUsers } });
    });
    mockPost.mockResolvedValue({ data: {} });
    mockDelete.mockResolvedValue({ data: {} });
  });

  it('メンバー削除ボタンをクリックすると削除APIを呼ぶこと', async () => {
    const user = userEvent.setup();
    render(<GroupMembers groupId={1} groupRole={UserRole.WH_USER} />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    const allButtons = screen.getAllByRole('button');
    const trashButton = allButtons.find((btn) => btn.getAttribute('aria-label') === 'メンバー削除');
    expect(trashButton).toBeDefined();
    if (trashButton) {
      await user.click(trashButton);
      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('/groups/1/members/u1');
      });
    }
  });

  it('メンバー取得エラー時にトーストを表示すること', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/members')) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ data: { data: mockUsers } });
    });

    render(<GroupMembers groupId={1} groupRole={UserRole.WH_USER} />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('メンバー一覧の取得に失敗しました');
    });
  });

  it('ユーザー取得エラー時にトーストを表示すること', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/members')) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject(new Error('Network error'));
    });

    render(<GroupMembers groupId={1} groupRole={UserRole.WH_USER} />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('ユーザー一覧の取得に失敗しました');
    });
  });

  // v2-424: 追加が 403 で拒否された時、汎用文言ではなく API の理由を出す。
  it('メンバー追加が403で拒否された時にAPIの理由をトーストに表示すること', async () => {
    const user = userEvent.setup();
    mockPost.mockRejectedValue(
      apiError(
        403,
        '担当系統の異なるグループは編成できません（このグループは倉庫担当（管理者）が編成します）。',
      ),
    );

    render(<GroupMembers groupId={1} groupRole={UserRole.WH_USER} />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '追加するユーザーを選択' }));
    await user.click(screen.getByRole('option', { name: /user2/ }));
    // name の文字列指定は完全一致（正規表現だと「追加するユーザーを選択」にも当たる）
    await user.click(screen.getByRole('button', { name: '追加' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        '担当系統の異なるグループは編成できません（このグループは倉庫担当（管理者）が編成します）。',
      );
    });
  });

  it('メンバー削除が403で拒否された時にAPIの理由をトーストに表示すること', async () => {
    const user = userEvent.setup();
    mockDelete.mockRejectedValue(
      apiError(403, 'システム管理者の所属変更はシステム管理者のみ実行できます'),
    );

    render(<GroupMembers groupId={1} groupRole={UserRole.WH_USER} />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    const allButtons = screen.getAllByRole('button');
    const trashButton = allButtons.find((btn) => btn.getAttribute('aria-label') === 'メンバー削除');
    expect(trashButton).toBeDefined();
    if (trashButton) {
      await user.click(trashButton);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'システム管理者の所属変更はシステム管理者のみ実行できます',
        );
      });
    }
  });

  it('メンバー削除エラー時にトーストを表示すること', async () => {
    const user = userEvent.setup();
    mockDelete.mockRejectedValue(new Error('Error'));

    render(<GroupMembers groupId={1} groupRole={UserRole.WH_USER} />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    const allButtons = screen.getAllByRole('button');
    const trashButton = allButtons.find((btn) => btn.getAttribute('aria-label') === 'メンバー削除');
    expect(trashButton).toBeDefined();
    if (trashButton) {
      await user.click(trashButton);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('メンバーの削除に失敗しました');
      });
    }
  });
});
