import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CarrierForm } from '@/features/carriers/components/carrier-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

/**
 * Form 統合 validation spec.
 *
 * Zod schema 単体の挙動は features/carriers/lib/validations.test.ts でカバー。
 * ここでは「React Hook Form + zodResolver の統合経路で
 * validation エラーが onSubmit 抑止に反映されるか」を検証する。
 */
describe('CarrierForm - validation 統合', () => {
  it('必須 field を空で submit しても onSubmit が呼ばれない', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CarrierForm mode="create" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
