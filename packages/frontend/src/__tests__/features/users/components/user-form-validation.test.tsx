import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserForm } from '@/features/users/components/user-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

/**
 * Form 統合 validation spec.
 * Zod schema 単体は features/users/lib/validations.test.ts でカバー。
 */
describe('UserForm - validation 統合', () => {
  it('必須 field を空で submit しても onSubmit が呼ばれない', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<UserForm mode="create" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
