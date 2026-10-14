import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WarehouseForm } from '@/features/warehouses/components/warehouse-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const defaultValues = {
  code: 'WH-001',
  name: 'テスト倉庫',
  status: 'ACTIVE' as const,
  capacity: 100,
};

describe('WarehouseForm - submit 動作', () => {
  it('フォーム送信時にonSubmitを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<WarehouseForm mode="create" onSubmit={onSubmit} defaultValues={defaultValues} />);

    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  it('ステータスのSelectを変更できること', async () => {
    const user = userEvent.setup();
    render(<WarehouseForm mode="create" onSubmit={vi.fn()} defaultValues={defaultValues} />);

    const triggers = screen.getAllByRole('button');
    const selectTrigger = triggers.find((t) => t.getAttribute('aria-haspopup') === 'listbox');
    expect(selectTrigger).toBeDefined();
    if (selectTrigger) {
      await user.click(selectTrigger);
      expect(screen.getByText('無効')).toBeInTheDocument();
    }
  });

  it('Enterキーをテキスト入力フィールドで押してもフォーム送信されないこと', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<WarehouseForm mode="create" onSubmit={onSubmit} defaultValues={defaultValues} />);

    const codeInput = screen.getByLabelText(/倉庫コード/);
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: keyDown は user-event の表現外（ネイティブ event の preventDefault 検証必須）
    fireEvent.keyDown(codeInput, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
