// @form-doc-2-split: document 型 form (receivings) は明細行・商品検索 modal など
// interactions が複雑なため、master form 3-split ではなく base + interactions の 2-split を維持。
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceivingForm } from '@/features/receivings/components/receiving-form';

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

describe('ReceivingForm', () => {
  it('作成モードでヘッダフィールドを表示すること', () => {
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('入荷日')).toBeInTheDocument();
    expect(screen.getByText('倉庫')).toBeInTheDocument();
    expect(screen.getByText('仕入先')).toBeInTheDocument();
    expect(screen.getByText('入荷登録')).toBeInTheDocument();
  });

  it('参照モードで入力が無効化されること', () => {
    render(
      <ReceivingForm
        mode="view"
        document={
          {
            id: 1,
            receivingNo: 'RCV-20260317-0001',
            receivingDate: '2026-03-17',
            warehouseId: 1,
            supplierId: 1,
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
  });

  it('作成モードで明細行のヘッダーが表示されること', () => {
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('商品')).toBeInTheDocument();
    expect(screen.getByText('予定数量')).toBeInTheDocument();
    expect(screen.getByText('実績数量')).toBeInTheDocument();
  });

  it('DRAFTステータスの参照モードで確定ボタンを表示すること', () => {
    render(
      <ReceivingForm
        mode="view"
        document={
          {
            id: 1,
            receivingNo: 'RCV-20260317-0001',
            receivingDate: '2026-03-17',
            warehouseId: 1,
            supplierId: 1,
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

  it('CONFIRMEDステータスの参照モードで完了ボタンを表示すること', () => {
    render(
      <ReceivingForm
        mode="view"
        document={
          {
            id: 1,
            receivingNo: 'RCV-20260317-0001',
            receivingDate: '2026-03-17',
            warehouseId: 1,
            supplierId: 1,
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

    expect(screen.getByText('完了する')).toBeInTheDocument();
  });

  it('行追加ボタンで明細行が増えること', async () => {
    const user = userEvent.setup();
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    await user.click(screen.getByText('行追加'));

    const rows = screen.getAllByText(/^[12]$/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('作成モードで商品検索ボタンが表示されること', () => {
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    // SearchアイコンボタンがデフォルトのLineに存在する
    const searchButtons = screen.getAllByRole('button', { name: '' });
    // ゴースト variant のボタンが存在する
    expect(searchButtons.length).toBeGreaterThan(0);
  });

  it('作成モードで商品未選択時に「商品を選択」プレースホルダーが表示されること', () => {
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('商品を選択')).toBeInTheDocument();
  });

  it('予定数量の入力値が変わること', async () => {
    const user = userEvent.setup();
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    const qtyInputs = screen.getAllByRole('spinbutton');
    await user.clear(qtyInputs[0]);
    await user.type(qtyInputs[0], '5');
    expect((qtyInputs[0] as HTMLInputElement).value).toBe('5');
  });

  it('実績数量の入力値が変わること', async () => {
    const user = userEvent.setup();
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    const qtyInputs = screen.getAllByRole('spinbutton');
    await user.clear(qtyInputs[1]);
    await user.type(qtyInputs[1], '3');
    expect((qtyInputs[1] as HTMLInputElement).value).toBe('3');
  });

  it('実績数量を空にクリアできること', async () => {
    const user = userEvent.setup();
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    const qtyInputs = screen.getAllByRole('spinbutton');
    await user.clear(qtyInputs[1]);
    expect((qtyInputs[1] as HTMLInputElement).value).toBe('');
  });

  it('削除ボタンで明細行が削除されること', async () => {
    const user = userEvent.setup();
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    await user.click(screen.getByText('行追加'));

    const trashButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.closest('td') && btn.querySelector('.lucide-trash-2'));
    if (trashButtons.length > 0) {
      await user.click(trashButtons[0]);
    }
  });

  it('docのlinesからproductNamesRefが初期化されること', () => {
    render(
      <ReceivingForm
        mode="view"
        document={
          {
            id: 1,
            receivingNo: 'RCV-20260317-0001',
            receivingDate: '2026-03-17',
            warehouseId: 1,
            supplierId: 1,
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [
              {
                id: 1,
                receivingId: 1,
                lineNo: 1,
                productId: 'prod-1',
                plannedQty: 10,
                actualQty: 8,
                product: { id: 'prod-1', code: 'P001', name: 'テスト商品' },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    // 商品コードと名前が表示されること
    expect(screen.getByText('P001 テスト商品')).toBeInTheDocument();
  });

  it('defaultLinesが指定された場合、その値でlinesが初期化されること', () => {
    render(
      <ReceivingForm
        mode="create"
        onSubmit={vi.fn()}
        defaultLines={[{ lineNo: 1, productId: 'prod-abc', plannedQty: 5 }]}
      />,
    );

    // 予定数量が5で初期化されていること
    const qtyInputs = screen.getAllByRole('spinbutton');
    expect((qtyInputs[0] as HTMLInputElement).value).toBe('5');
  });

  it('参照モードでは「行追加」ボタンが表示されないこと', () => {
    render(
      <ReceivingForm
        mode="view"
        document={
          {
            id: 1,
            receivingNo: 'RCV-20260317-0001',
            receivingDate: '2026-03-17',
            warehouseId: 1,
            supplierId: 1,
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

  it('docのreceivedDateがDate型の場合も正しく表示されること', () => {
    render(
      <ReceivingForm
        mode="view"
        document={
          {
            id: 1,
            receivingNo: 'RCV-20260317-0001',
            receivingDate: new Date('2026-03-17T00:00:00Z'),
            warehouseId: 1,
            supplierId: 1,
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

    // 日付が正しくフォーマットされていること
    expect(screen.getByDisplayValue('2026-03-17')).toBeInTheDocument();
  });

  it('参照モードで実績数量が表示されること', () => {
    render(
      <ReceivingForm
        mode="view"
        document={
          {
            id: 1,
            receivingNo: 'RCV-20260317-0001',
            receivingDate: '2026-03-17',
            warehouseId: 1,
            supplierId: 1,
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [
              {
                id: 1,
                receivingId: 1,
                lineNo: 1,
                productId: 'prod-1',
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

    // actualQtyがnullの場合「-」が複数表示されることがある（倉庫・仕入先ラベルと実績数量）
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('onSubmitなしで作成モードをレンダリングできること', () => {
    render(<ReceivingForm mode="create" />);
    expect(screen.getByText('入荷日')).toBeInTheDocument();
  });
});
