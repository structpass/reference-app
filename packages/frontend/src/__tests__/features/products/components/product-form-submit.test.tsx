import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductForm } from '@/features/products/components/product-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn().mockRejectedValue(new Error('Network error')),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
}));

const defaultValues = {
  code: 'P-001',
  name: 'テスト商品',
  categoryId: 1,
  unit: '個',
  price: 100,
  stockQuantity: 10,
  status: 'ACTIVE' as const,
};

describe('ProductForm - submit 動作', () => {
  it('ステータスのSelectを変更できること', async () => {
    const user = userEvent.setup();
    render(<ProductForm mode="create" onSubmit={vi.fn()} defaultValues={defaultValues as never} />);

    const triggers = screen.getAllByRole('button');
    const selectTrigger = triggers.find((t) => t.getAttribute('aria-haspopup') === 'listbox');
    expect(selectTrigger).toBeDefined();
    if (selectTrigger) {
      await user.click(selectTrigger);
      expect(screen.getByText('無効')).toBeInTheDocument();
    }
  });

  it('onSubmitなしの場合にフォーム送信をpreventDefaultすること', () => {
    render(<ProductForm mode="create" defaultValues={defaultValues as never} />);

    const form = screen.getByText('マスタ登録').closest('form')!;
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    const prevented = !form.dispatchEvent(submitEvent);
    expect(prevented).toBe(true);
  });

  it('Enterキーをテキスト入力フィールドで押してもフォーム送信されないこと', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductForm
        mode="create"
        onSubmit={onSubmit}
        defaultValues={{ code: 'PRD-001', name: 'テスト商品', status: 'ACTIVE' } as never}
      />,
    );

    const codeInput = screen.getByLabelText(/商品コード/);
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: keyDown は user-event の表現外（ネイティブ event の preventDefault 検証必須）
    fireEvent.keyDown(codeInput, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('APIエラー時にカテゴリーが空でもマウントできること', () => {
    render(<ProductForm mode="create" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/商品コード/)).toBeInTheDocument();
  });
});
