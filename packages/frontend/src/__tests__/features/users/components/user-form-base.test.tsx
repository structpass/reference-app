import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveStatus, UserRole } from '@struct-pass/shared';
import { UserForm } from '@/features/users/components/user-form';

const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const defaultValues = {
  name: 'testuser',
  email: 'test@example.com',
  role: UserRole.WH_USER,
  status: ActiveStatus.ACTIVE,
};

describe('UserForm - base render / mode 別表示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('作成モードで主要フィールドとパスワード非表示を確認すること', () => {
    render(<UserForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/名前/)).toBeInTheDocument();
    expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    // SSO 化に伴いパスワードフィールドは廃止。
    expect(screen.queryByLabelText(/パスワード/)).not.toBeInTheDocument();
    expect(screen.getByText('マスタ登録')).toBeInTheDocument();
  });

  it('編集モードで既存値を表示すること', () => {
    render(
      <UserForm
        mode="edit"
        id="uuid-1"
        onSubmit={vi.fn()}
        defaultValues={{ name: 'testuser', email: 'test@example.com' }}
      />,
    );

    expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
    expect(screen.queryByLabelText(/パスワード/)).not.toBeInTheDocument();
    expect(screen.getByText('マスタ更新')).toBeInTheDocument();
  });

  it('参照モードでフィールドが無効化されパスワードが非表示であること', () => {
    render(
      <UserForm
        mode="view"
        id="uuid-1"
        defaultValues={{ name: 'testuser', email: 'test@example.com' }}
      />,
    );

    expect(screen.getByDisplayValue('testuser')).toBeDisabled();
    expect(screen.queryByLabelText(/パスワード/)).not.toBeInTheDocument();
    expect(screen.getByText('編集')).toBeInTheDocument();
  });

  it('isActive=false の defaultValues を受けても render が壊れないこと', () => {
    render(
      <UserForm
        mode="view"
        id="user-1"
        defaultValues={{ name: 'testuser', email: 'test@example.com', isActive: false }}
      />,
    );

    expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
  });

  it('role=null（権限待ち）の defaultValues を受けても render が壊れないこと', () => {
    render(
      <UserForm
        mode="view"
        id="user-1"
        defaultValues={{ name: 'pending-user', email: 'pending@example.com', role: null }}
      />,
    );

    expect(screen.getByDisplayValue('pending-user')).toBeInTheDocument();
  });

  it('参照モードで編集ボタンをクリックすると編集ページに遷移すること', async () => {
    const user = userEvent.setup();
    render(<UserForm mode="view" id="7" defaultValues={defaultValues} />);

    await user.click(screen.getByText('編集'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/users/7');
  });

  it('参照モードで戻るボタンをクリックするとrouter.backを呼ぶこと', async () => {
    const user = userEvent.setup();
    render(<UserForm mode="view" id="7" defaultValues={defaultValues} />);

    await user.click(screen.getByText('戻る'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('作成モードで「一覧へ戻る」ボタンをクリックすると router.push を呼ぶこと', async () => {
    const user = userEvent.setup();
    render(<UserForm mode="create" onSubmit={vi.fn()} defaultValues={defaultValues} />);

    await user.click(screen.getByText('一覧へ戻る'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/users');
  });

  it('onSubmit 未指定でもフォーム送信がクラッシュせず抑止されること', async () => {
    const user = userEvent.setup();
    render(<UserForm mode="create" />);

    await user.click(screen.getByText('マスタ登録'));
    // submit は preventDefault されるだけ（エラーにならない）
    expect(screen.getByText('マスタ登録')).toBeInTheDocument();
  });

  it('名前入力中の Enter キーでフォーム送信が抑止されること', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(<UserForm mode="edit" onSubmit={onSubmit} />);

    await user.click(screen.getByLabelText(/名前/));
    await user.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ロール・ステータスを変更して送信すると onSubmit へ反映されること', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(<UserForm mode="create" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/名前/), 'testuser');
    await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
    await user.click(screen.getByRole('button', { name: '（権限待ち）' }));
    await user.click(await screen.findByText('事務担当（一般）'));
    await user.click(screen.getByRole('button', { name: '有効' }));
    await user.click(await screen.findByText('無効'));
    await user.click(screen.getByText('マスタ登録'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          role: UserRole.OF_USER,
          status: ActiveStatus.INACTIVE,
          isActive: false,
        }),
      ),
    );
  });
});
