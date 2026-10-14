import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupForm } from '@/features/groups/components/group-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// v2-427: ロール選択肢の絞り込みに呼び出し元ロールを使うため useAuth を固定する。
vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'tester', role: 'SYS_ADMIN' } }),
}));

const defaultValues = {
  code: 'GRP-001',
  name: 'テストグループ',
  role: 'WH_USER' as const,
  status: 'ACTIVE' as const,
};

describe('GroupForm - submit 動作', () => {
  it('フォーム送信時にonSubmitを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GroupForm mode="create" onSubmit={onSubmit} defaultValues={defaultValues} />);

    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  it('Select 群を開くと option が表示されること', async () => {
    const user = userEvent.setup();
    render(<GroupForm mode="create" onSubmit={vi.fn()} defaultValues={defaultValues} />);

    const triggers = screen.getAllByRole('button');
    const selectTriggers = triggers.filter((t) => t.getAttribute('aria-haspopup') === 'listbox');
    expect(selectTriggers.length).toBeGreaterThan(0);
    if (selectTriggers.length > 1) {
      await user.click(selectTriggers[1]);
      expect(screen.getByText('無効')).toBeInTheDocument();
    }
  });

  it('Enterキーをテキスト入力フィールドで押してもフォーム送信されないこと', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GroupForm mode="create" onSubmit={onSubmit} defaultValues={defaultValues} />);

    const codeInput = screen.getByLabelText(/グループコード/);
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: keyDown は user-event の表現外（ネイティブ event の preventDefault 検証必須）
    fireEvent.keyDown(codeInput, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
