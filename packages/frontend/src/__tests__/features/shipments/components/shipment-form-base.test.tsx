// @form-doc-2-split: document 型 form (shipments) は明細行・倉庫/運送会社 select など
// interactions が複雑なため、master form 3-split ではなく base + interactions の 2-split を維持。
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShipmentForm } from '@/features/shipments/components/shipment-form';

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

describe('ShipmentForm', () => {
  it('作成モードでヘッダフィールドを表示すること', () => {
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('出荷日')).toBeInTheDocument();
    expect(screen.getByLabelText(/出荷先/)).toBeInTheDocument();
    expect(screen.getByText('出荷登録')).toBeInTheDocument();
  });

  it('参照モードで入力が無効化されること', () => {
    render(
      <ShipmentForm
        mode="view"
        document={
          {
            id: 1,
            shipmentNo: 'SHP-20260317-0001',
            shipmentDate: '2026-03-17',
            warehouseId: 1,
            destination: 'テスト出荷先',
            carrierId: null,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [],
          } as any
        }
      />,
    );

    expect(screen.getByDisplayValue('2026-03-17')).toBeDisabled();
    expect(screen.getByDisplayValue('テスト出荷先')).toBeDisabled();
  });

  it('明細行のヘッダーが表示されること', () => {
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('商品')).toBeInTheDocument();
    expect(screen.getByText('予定数量')).toBeInTheDocument();
    expect(screen.getByText('実績数量')).toBeInTheDocument();
  });

  it('DRAFTステータスの参照モードで確定ボタンを表示すること', () => {
    render(
      <ShipmentForm
        mode="view"
        document={
          {
            id: 1,
            shipmentNo: 'SHP-20260317-0001',
            shipmentDate: '2026-03-17',
            warehouseId: 1,
            destination: 'テスト出荷先',
            carrierId: null,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [],
          } as any
        }
      />,
    );

    expect(screen.getByText('確定する')).toBeInTheDocument();
  });

  it('CONFIRMEDステータスの参照モードで出荷完了ボタンを表示すること', () => {
    render(
      <ShipmentForm
        mode="view"
        document={
          {
            id: 1,
            shipmentNo: 'SHP-20260317-0001',
            shipmentDate: '2026-03-17',
            warehouseId: 1,
            destination: 'テスト出荷先',
            carrierId: null,
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [],
          } as any
        }
      />,
    );

    expect(screen.getByText('出荷完了')).toBeInTheDocument();
  });

  it('行追加ボタンで明細行が増えること', async () => {
    const user = userEvent.setup();
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

    await user.click(screen.getByText('行追加'));

    const rows = screen.getAllByText(/^[12]$/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('作成モードで商品未選択時に「商品を選択」プレースホルダーが表示されること', () => {
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('商品を選択')).toBeInTheDocument();
  });

  it('予定数量の入力値が変わること', async () => {
    const user = userEvent.setup();
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

    const qtyInputs = screen.getAllByRole('spinbutton');
    await user.clear(qtyInputs[0]);
    await user.type(qtyInputs[0], '7');
    expect((qtyInputs[0] as HTMLInputElement).value).toBe('7');
  });

  it('実績数量の入力値が変わること', async () => {
    const user = userEvent.setup();
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

    const qtyInputs = screen.getAllByRole('spinbutton');
    await user.clear(qtyInputs[1]);
    await user.type(qtyInputs[1], '4');
    expect((qtyInputs[1] as HTMLInputElement).value).toBe('4');
  });

  it('実績数量を空にクリアできること', async () => {
    const user = userEvent.setup();
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

    const qtyInputs = screen.getAllByRole('spinbutton');
    await user.clear(qtyInputs[1]);
    expect((qtyInputs[1] as HTMLInputElement).value).toBe('');
  });

  it('docのlinesからproductNamesRefが初期化されること', () => {
    render(
      <ShipmentForm
        mode="view"
        document={
          {
            id: 1,
            shipmentNo: 'SHP-20260317-0001',
            shipmentDate: '2026-03-17',
            warehouseId: 1,
            destination: 'テスト出荷先',
            carrierId: null,
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [
              {
                id: 1,
                shipmentId: 1,
                lineNo: 1,
                productId: 'prod-s1',
                plannedQty: 5,
                actualQty: 5,
                product: { id: 'prod-s1', code: 'S001', name: '出荷商品' },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    expect(screen.getByText('S001 出荷商品')).toBeInTheDocument();
  });

  it('defaultLinesが指定された場合、その値でlinesが初期化されること', () => {
    render(
      <ShipmentForm
        mode="create"
        onSubmit={vi.fn()}
        defaultLines={[{ lineNo: 1, productId: 'prod-s1', plannedQty: 3 }]}
      />,
    );

    const qtyInputs = screen.getAllByRole('spinbutton');
    expect((qtyInputs[0] as HTMLInputElement).value).toBe('3');
  });

  it('参照モードでは「行追加」ボタンが表示されないこと', () => {
    render(
      <ShipmentForm
        mode="view"
        document={
          {
            id: 1,
            shipmentNo: 'SHP-20260317-0001',
            shipmentDate: '2026-03-17',
            warehouseId: 1,
            destination: 'テスト出荷先',
            carrierId: null,
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [],
          } as any
        }
      />,
    );

    expect(screen.queryByText('行追加')).not.toBeInTheDocument();
  });

  it('docのshipmentDateがDate型の場合も正しくスライスされること', () => {
    render(
      <ShipmentForm
        mode="view"
        document={
          {
            id: 1,
            shipmentNo: 'SHP-20260317-0001',
            shipmentDate: new Date('2026-03-17T00:00:00Z'),
            warehouseId: 1,
            destination: 'テスト出荷先',
            carrierId: null,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [],
          } as any
        }
      />,
    );

    expect(screen.getByDisplayValue('2026-03-17')).toBeInTheDocument();
  });

  it('参照モードで実績数量がnullの場合「-」が表示されること', () => {
    render(
      <ShipmentForm
        mode="view"
        document={
          {
            id: 1,
            shipmentNo: 'SHP-20260317-0001',
            shipmentDate: '2026-03-17',
            warehouseId: 1,
            destination: 'テスト出荷先',
            carrierId: null,
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [
              {
                id: 1,
                shipmentId: 1,
                lineNo: 1,
                productId: 'prod-s2',
                plannedQty: 10,
                actualQty: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    // actualQtyがnullの場合「-」が複数表示されることがある（倉庫・運送会社ラベルと実績数量）
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('onSubmitなしで作成モードをレンダリングできること', () => {
    render(<ShipmentForm mode="create" />);
    expect(screen.getByText('出荷日')).toBeInTheDocument();
  });
});
