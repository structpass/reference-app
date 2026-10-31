import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupForm } from '@/features/groups/components/group-form';

const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

// v2-427: ロール選択肢の絞り込みに呼び出し元ロールを使うため useAuth を固定する。
const mockUseAuth = vi.fn();
vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

const defaultValues = {
  code: 'GRP-001',
  name: 'テストグループ',
  role: 'WH_USER' as const,
  status: 'ACTIVE' as const,
};

describe('GroupForm - base render / mode 別表示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1', name: 'tester', role: 'SYS_ADMIN' } });
  });

  it('作成モードで必須フィールドを表示すること', () => {
    render(<GroupForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/グループコード/)).toBeInTheDocument();
    expect(screen.getByLabelText(/グループ名/)).toBeInTheDocument();
    expect(screen.getByText('マスタ登録')).toBeInTheDocument();
  });

  it('編集モードで「マスタ更新」ボタンを表示すること', () => {
    render(
      <GroupForm
        mode="edit"
        id={1}
        onSubmit={vi.fn()}
        defaultValues={{ code: 'GRP-001', name: 'テストグループ' }}
      />,
    );

    expect(screen.getByDisplayValue('GRP-001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('テストグループ')).toBeInTheDocument();
    expect(screen.getByText('マスタ更新')).toBeInTheDocument();
  });

  it('参照モードでフィールドが無効化されること', () => {
    render(
      <GroupForm mode="view" id={1} defaultValues={{ code: 'GRP-001', name: 'テストグループ' }} />,
    );

    expect(screen.getByDisplayValue('GRP-001')).toBeDisabled();
    expect(screen.getByDisplayValue('テストグループ')).toBeDisabled();
    expect(screen.getByText('編集')).toBeInTheDocument();
  });

  it('参照モードで編集ボタンをクリックすると編集ページに遷移すること', async () => {
    const user = userEvent.setup();
    render(<GroupForm mode="view" id={3} defaultValues={defaultValues} />);

    await user.click(screen.getByText('編集'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/groups/3');
  });

  it('参照モードで戻るボタンをクリックするとrouter.backを呼ぶこと', async () => {
    const user = userEvent.setup();
    render(<GroupForm mode="view" id={3} defaultValues={defaultValues} />);

    await user.click(screen.getByText('戻る'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('作成モードで「一覧へ戻る」ボタンをクリックすると router.push を呼ぶこと', async () => {
    const user = userEvent.setup();
    render(<GroupForm mode="create" onSubmit={vi.fn()} defaultValues={defaultValues} />);

    await user.click(screen.getByText('一覧へ戻る'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/groups');
  });
});
