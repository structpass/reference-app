import { render, screen, waitFor, within } from '@testing-library/react';
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

// v2-424: 追加候補の判定に「自分自身」を使うため useAuth を固定する。
const mockUseAuth = vi.fn();
vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// v2-462: 編成の範囲は「呼び出し元の系統 × グループの系統」で決まる。
// 既定は同じ WH 系統（呼び出し元 WH_ADMIN・グループ role=WH_USER）。
const GROUP_WH = UserRole.WH_USER;
const GROUP_OF = UserRole.OF_USER;
const GROUP_SYS = UserRole.SYS_ADMIN;

const mockMembers = [
  {
    id: 'm1',
    userId: 'u1',
    user: { id: 'u1', name: 'member1', role: 'WH_USER' },
  },
];

const mockUsers = [
  { id: 'u1', name: 'member1', role: 'WH_USER' },
  { id: 'u-self', name: '自分自身', role: 'WH_ADMIN' },
  { id: 'u-sys', name: 'システム管理者', role: 'SYS_ADMIN' },
  { id: 'u2', name: 'user2', role: 'WH_USER' },
];

describe('GroupMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u-self', name: '自分自身', role: 'WH_ADMIN' } });
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/members')) {
        return Promise.resolve({ data: { data: mockMembers } });
      }
      return Promise.resolve({ data: { data: mockUsers } });
    });
  });

  it('読み込み中表示を経てメンバー一覧を表示すること', async () => {
    render(<GroupMembers groupId={1} groupRole={GROUP_WH} />);

    expect(screen.getByText('読み込み中...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('member1')).toBeInTheDocument();
    });
  });

  it('メンバー一覧のタイトルを表示すること', async () => {
    render(<GroupMembers groupId={1} groupRole={GROUP_WH} />);

    await waitFor(() => {
      expect(screen.getByText('メンバー一覧')).toBeInTheDocument();
    });
  });

  it('readonlyモードで追加ボタンと削除ボタンが非表示であること', async () => {
    render(<GroupMembers groupId={1} groupRole={GROUP_WH} readonly />);

    await waitFor(() => {
      expect(screen.getByText('member1')).toBeInTheDocument();
    });

    expect(screen.queryByText('追加')).not.toBeInTheDocument();
  });

  it('メンバーが0人の場合メッセージを表示すること', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/members')) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({ data: { data: mockUsers } });
    });

    render(<GroupMembers groupId={1} groupRole={GROUP_WH} />);

    await waitFor(() => {
      expect(screen.getByText('メンバーが登録されていません')).toBeInTheDocument();
    });
  });

  it('追加可能なユーザーのドロップダウンに既存メンバーが含まれないこと', async () => {
    render(<GroupMembers groupId={1} groupRole={GROUP_WH} />);

    await waitFor(() => {
      expect(screen.getByText('member1')).toBeInTheDocument();
    });

    // The add section should exist with available users (user2 only)
    expect(screen.getByText('追加')).toBeInTheDocument();
  });

  // v2-424: 選ぶと必ず 403 になる候補（自分自身・SYS_ADMIN ロール）を提示しない。
  it('追加候補に自分自身とSYS_ADMINロールのユーザーが含まれないこと', async () => {
    const user = userEvent.setup();
    render(<GroupMembers groupId={1} groupRole={GROUP_WH} />);

    await waitFor(() => {
      expect(screen.getByText('member1')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '追加するユーザーを選択' }));

    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['user2 (倉庫担当（一般）)']);
  });

  it('呼び出し元がSYS_ADMINでもSYS_ADMINロールのユーザーを候補に出さないこと', async () => {
    // 呼び出し元 = SYS_ADMIN ロールのユーザー自身。API は SYS_ADMIN に SYS_ADMIN の所属変更を
    // 許すが、要求（v2-424）は候補に出さない側なので、自分自身（u-sys）も SYS_ADMIN の
    // ユーザーも候補に残らない。
    mockUseAuth.mockReturnValue({
      user: { id: 'u-sys', name: 'システム管理者', role: 'SYS_ADMIN' },
    });
    const user = userEvent.setup();
    render(<GroupMembers groupId={1} groupRole={GROUP_WH} />);

    await waitFor(() => {
      expect(screen.getByText('member1')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '追加するユーザーを選択' }));

    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      '自分自身 (倉庫担当（管理者）)',
      'user2 (倉庫担当（一般）)',
    ]);
  });

  // v2-462: 系統違いのグループでは編成そのものが 403 になるため、追加候補と追加 UI を出さない。
  describe('編成できない系統のグループ（v2-462）', () => {
    it('OF_ADMINがWH系統のグループを開いた時、追加候補と追加ボタンを出さず理由を示すこと', async () => {
      mockUseAuth.mockReturnValue({ user: { id: 'u-of', name: '事務 管理子', role: 'OF_ADMIN' } });
      render(<GroupMembers groupId={1} groupRole={GROUP_WH} />);

      await waitFor(() => {
        expect(screen.getByText('member1')).toBeInTheDocument();
      });

      expect(
        screen.queryByRole('button', { name: '追加するユーザーを選択' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '追加' })).not.toBeInTheDocument();
      expect(
        screen.getByText(
          '担当系統の異なるグループは編成できません（このグループは倉庫担当のグループで、倉庫担当の管理者が編成します）。変更が必要な場合はシステム管理者へご依頼ください',
        ),
      ).toBeInTheDocument();
    });

    it('WH_ADMINがOF系統のグループを開いた時、追加候補と追加ボタンを出さず理由を示すこと', async () => {
      mockUseAuth.mockReturnValue({ user: { id: 'u-self', name: '自分自身', role: 'WH_ADMIN' } });
      render(<GroupMembers groupId={1} groupRole={GROUP_OF} />);

      await waitFor(() => {
        expect(screen.getByText('member1')).toBeInTheDocument();
      });

      expect(
        screen.queryByRole('button', { name: '追加するユーザーを選択' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          '担当系統の異なるグループは編成できません（このグループは事務担当のグループで、事務担当の管理者が編成します）。変更が必要な場合はシステム管理者へご依頼ください',
        ),
      ).toBeInTheDocument();
    });

    it('同じ系統（OF_ADMIN × OF系統）では従来どおり追加できること', async () => {
      mockUseAuth.mockReturnValue({ user: { id: 'u-of', name: '事務 管理子', role: 'OF_ADMIN' } });
      render(<GroupMembers groupId={1} groupRole={GROUP_OF} />);

      await waitFor(() => {
        expect(screen.getByText('member1')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: '追加するユーザーを選択' })).toBeInTheDocument();
      expect(
        screen.queryByText(/担当系統の異なるグループは編成できません/),
      ).not.toBeInTheDocument();
    });

    it('SYS_ADMINは系統にかかわらず追加できること', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u-sys', name: 'システム管理者', role: 'SYS_ADMIN' },
      });
      render(<GroupMembers groupId={1} groupRole={GROUP_OF} />);

      await waitFor(() => {
        expect(screen.getByText('member1')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: '追加するユーザーを選択' })).toBeInTheDocument();
    });

    it('グループのroleが未取得の時は追加候補を出さないこと', async () => {
      render(<GroupMembers groupId={1} />);

      await waitFor(() => {
        expect(screen.getByText('member1')).toBeInTheDocument();
      });

      expect(
        screen.queryByRole('button', { name: '追加するユーザーを選択' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '追加' })).not.toBeInTheDocument();
    });

    it('readonlyでは系統違いの理由文も出さないこと', async () => {
      mockUseAuth.mockReturnValue({ user: { id: 'u-of', name: '事務 管理子', role: 'OF_ADMIN' } });
      render(<GroupMembers groupId={1} groupRole={GROUP_WH} readonly />);

      await waitFor(() => {
        expect(screen.getByText('member1')).toBeInTheDocument();
      });

      expect(
        screen.queryByText(/担当系統の異なるグループは編成できません/),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'メンバー削除' })).not.toBeInTheDocument();
    });
  });
});
