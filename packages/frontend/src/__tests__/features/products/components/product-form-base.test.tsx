import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductForm } from '@/features/products/components/product-form';

const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
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

describe('ProductForm - base render / mode 別表示', () => {
  it('作成モードでフィールドを表示すること', () => {
    render(<ProductForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/商品コード/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^商品名/)).toBeInTheDocument();
    expect(screen.getByText('マスタ登録')).toBeInTheDocument();
  });

  it('編集モードで「マスタ更新」ボタンを表示すること', () => {
    render(
      <ProductForm
        mode="edit"
        id="uuid-1"
        onSubmit={vi.fn()}
        defaultValues={{ code: 'PRD-001', name: 'テスト商品' }}
      />,
    );

    expect(screen.getByDisplayValue('PRD-001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('テスト商品')).toBeInTheDocument();
    expect(screen.getByText('マスタ更新')).toBeInTheDocument();
  });

  it('参照モードでフィールドが無効化されること', () => {
    render(
      <ProductForm
        mode="view"
        id="uuid-1"
        defaultValues={{ code: 'PRD-001', name: 'テスト商品' }}
      />,
    );

    expect(screen.getByDisplayValue('PRD-001')).toBeDisabled();
    expect(screen.getByDisplayValue('テスト商品')).toBeDisabled();
    expect(screen.getByText('編集')).toBeInTheDocument();
  });

  it('参照モードで編集ボタンをクリックすると編集ページに遷移すること', async () => {
    const user = userEvent.setup();
    mockPush.mockClear();
    render(<ProductForm mode="view" id="5" defaultValues={defaultValues as never} />);

    await user.click(screen.getByText('編集'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/products/5');
  });

  it('参照モードで戻るボタンをクリックするとrouter.backを呼ぶこと', async () => {
    const user = userEvent.setup();
    mockBack.mockClear();
    render(<ProductForm mode="view" id="5" defaultValues={defaultValues as never} />);

    await user.click(screen.getByText('戻る'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('作成モードで「一覧へ戻る」ボタンをクリックすると一覧へ遷移すること', async () => {
    const user = userEvent.setup();
    mockPush.mockClear();
    render(<ProductForm mode="create" onSubmit={vi.fn()} defaultValues={defaultValues as never} />);

    await user.click(screen.getByText('一覧へ戻る'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/products');
  });
});
