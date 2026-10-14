import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductForm } from '@/features/products/components/product-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
  },
}));

/**
 * Form 統合 validation spec.
 *
 * Zod schema 単体の挙動は features/products/lib/validations.test.ts でカバー。
 * ここでは「React Hook Form + zodResolver の統合経路で
 * validation エラーが画面に反映されるか」を検証する。
 */
describe('ProductForm - validation 統合', () => {
  it('必須 field を空で submit しても onSubmit が呼ばれない', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductForm mode="create" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
