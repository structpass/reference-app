// @form-doc-2-split: document 型 form (orders) は明細行・商品検索 modal など
// interactions が複雑なため、master form 3-split ではなく base + interactions の 2-split を維持。
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderForm } from '@/features/orders/components/order-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('OrderForm', () => {
  it('作成モードでヘッダフィールドを表示すること', () => {
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('発注日')).toBeInTheDocument();
    expect(screen.getByText('仕入先')).toBeInTheDocument();
    expect(screen.getByText('希望納期')).toBeInTheDocument();
    expect(screen.getByText('発注登録')).toBeInTheDocument();
  });

  it('参照モードで入力が無効化されること', () => {
    render(
      <OrderForm
        mode="view"
        document={
          {
            id: 1,
            orderNo: 'PO-20260317-001',
            orderDate: '2026-03-17',
            supplierId: 1,
            desiredDeliveryDate: null,
            totalAmount: 0,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [],
          } as any
        }
      />,
    );

    expect(screen.getByDisplayValue('2026-03-17')).toBeDisabled();
  });

  it('明細行に商品・発注数量・単価・金額を表示すること', () => {
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('商品')).toBeInTheDocument();
    expect(screen.getByText('発注数量')).toBeInTheDocument();
    expect(screen.getByText('単価')).toBeInTheDocument();
    expect(screen.getByText('金額')).toBeInTheDocument();
  });

  it('DRAFTステータスの参照モードで発注確定ボタンを表示すること', () => {
    render(
      <OrderForm
        mode="view"
        document={
          {
            id: 1,
            orderNo: 'PO-20260317-001',
            orderDate: '2026-03-17',
            supplierId: 1,
            desiredDeliveryDate: null,
            totalAmount: 0,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [],
          } as any
        }
      />,
    );

    expect(screen.getByText('発注確定')).toBeInTheDocument();
  });

  it('合計行が表示されること', () => {
    render(
      <OrderForm
        mode="view"
        document={
          {
            id: 1,
            orderNo: 'PO-20260317-001',
            orderDate: '2026-03-17',
            supplierId: 1,
            desiredDeliveryDate: null,
            totalAmount: 5000,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [
              {
                id: 1,
                orderId: 1,
                lineNo: 1,
                productId: 'p1',
                orderQty: 10,
                unitPrice: 500,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    expect(screen.getByText('合計')).toBeInTheDocument();
  });

  it('行追加ボタンで明細行が増えること', async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    await user.click(screen.getByText('行追加'));

    const rows = screen.getAllByText(/^[12]$/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('作成モードで商品未選択時に「商品を選択」プレースホルダーが表示されること', () => {
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('商品を選択')).toBeInTheDocument();
  });

  it('発注数量の入力値が変わること', async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    const spinButtons = screen.getAllByRole('spinbutton');
    await user.clear(spinButtons[0]);
    await user.type(spinButtons[0], '10');
    expect((spinButtons[0] as HTMLInputElement).value).toBe('10');
  });

  it('単価の入力値が変わること', async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    const spinButtons = screen.getAllByRole('spinbutton');
    await user.clear(spinButtons[1]);
    await user.type(spinButtons[1], '1500');
    expect((spinButtons[1] as HTMLInputElement).value).toBe('1500');
  });

  it('docのitemsからproductNamesRefが初期化されること', () => {
    render(
      <OrderForm
        mode="view"
        document={
          {
            id: 1,
            orderNo: 'PO-20260317-001',
            orderDate: '2026-03-17',
            supplierId: 1,
            desiredDeliveryDate: null,
            totalAmount: 5000,
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [
              {
                id: 1,
                orderId: 1,
                lineNo: 1,
                productId: 'prod-o1',
                orderQty: 10,
                unitPrice: 500,
                product: { id: 'prod-o1', code: 'O001', name: '発注商品' },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    expect(screen.getByText('O001 発注商品')).toBeInTheDocument();
  });

  it('defaultItemsが指定された場合、その値でitemsが初期化されること', () => {
    render(
      <OrderForm
        mode="create"
        onSubmit={vi.fn()}
        defaultItems={[{ lineNo: 1, productId: 'prod-o1', orderQty: 8, unitPrice: 200 }]}
      />,
    );

    const spinButtons = screen.getAllByRole('spinbutton');
    expect((spinButtons[0] as HTMLInputElement).value).toBe('8');
    expect((spinButtons[1] as HTMLInputElement).value).toBe('200');
  });

  it('参照モードでは「行追加」ボタンが表示されないこと', () => {
    render(
      <OrderForm
        mode="view"
        document={
          {
            id: 1,
            orderNo: 'PO-20260317-001',
            orderDate: '2026-03-17',
            supplierId: 1,
            desiredDeliveryDate: null,
            totalAmount: 0,
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [],
          } as any
        }
      />,
    );

    expect(screen.queryByText('行追加')).not.toBeInTheDocument();
  });

  it('参照モードで金額が計算されて表示されること', () => {
    render(
      <OrderForm
        mode="view"
        document={
          {
            id: 1,
            orderNo: 'PO-20260317-001',
            orderDate: '2026-03-17',
            supplierId: 1,
            desiredDeliveryDate: null,
            totalAmount: 3000,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [
              {
                id: 1,
                orderId: 1,
                lineNo: 1,
                productId: 'p1',
                orderQty: 3,
                unitPrice: 1000,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    // 金額 = 3 * 1000 = 3000
    expect(screen.getAllByText('3,000').length).toBeGreaterThanOrEqual(1);
  });

  it('合計金額がuseMemoで正しく計算されること', () => {
    render(
      <OrderForm
        mode="create"
        onSubmit={vi.fn()}
        defaultItems={[
          { lineNo: 1, productId: 'p1', orderQty: 2, unitPrice: 500 },
          { lineNo: 2, productId: 'p2', orderQty: 3, unitPrice: 200 },
        ]}
      />,
    );

    // 合計 = 2*500 + 3*200 = 1600
    expect(screen.getByText('1,600')).toBeInTheDocument();
  });

  it('docのorderDateがDate型の場合も正しくスライスされること', () => {
    render(
      <OrderForm
        mode="view"
        document={
          {
            id: 1,
            orderNo: 'PO-20260317-001',
            orderDate: new Date('2026-03-17T00:00:00Z'),
            supplierId: 1,
            desiredDeliveryDate: null,
            totalAmount: 0,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [],
          } as any
        }
      />,
    );

    expect(screen.getByDisplayValue('2026-03-17')).toBeInTheDocument();
  });

  it('desiredDeliveryDateがDate型の場合も正しくスライスされること', () => {
    render(
      <OrderForm
        mode="view"
        document={
          {
            id: 1,
            orderNo: 'PO-20260317-001',
            orderDate: '2026-03-17',
            supplierId: 1,
            desiredDeliveryDate: new Date('2026-04-01T00:00:00Z'),
            totalAmount: 0,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [],
          } as any
        }
      />,
    );

    expect(screen.getByDisplayValue('2026-04-01')).toBeInTheDocument();
  });

  it('onSubmitなしで作成モードをレンダリングできること', () => {
    render(<OrderForm mode="create" />);
    expect(screen.getByText('発注日')).toBeInTheDocument();
  });
});
