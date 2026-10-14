import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupForm } from '@/features/groups/components/group-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// v2-427: ロール選択肢の絞り込みに呼び出し元ロールを使うため useAuth を固定する。
vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'tester', role: 'SYS_ADMIN' } }),
}));

/**
 * Form 統合 validation spec.
 * Zod schema 単体は features/groups/lib/validations.test.ts でカバー。
 */
describe('GroupForm - validation 統合', () => {
  it('必須 field を空で submit しても onSubmit が呼ばれない', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GroupForm mode="create" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
