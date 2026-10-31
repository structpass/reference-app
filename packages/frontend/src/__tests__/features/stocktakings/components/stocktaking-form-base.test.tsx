// @form-doc-2-split: document 型 form (stocktakings) は明細行・差異理由など
// interactions が複雑なため、master form 3-split ではなく base + interactions の 2-split を維持。
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StocktakingForm } from '@/features/stocktakings/components/stocktaking-form';

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

describe('StocktakingForm', () => {
  it('作成モードでヘッダフィールドを表示すること', () => {
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('棚卸日')).toBeInTheDocument();
    expect(screen.getByText('倉庫')).toBeInTheDocument();
    expect(screen.getByLabelText(/棚卸担当者/)).toBeInTheDocument();
    expect(screen.getByText('棚卸登録')).toBeInTheDocument();
  });

  it('参照モードで入力が無効化されること', () => {
    render(
      <StocktakingForm
        mode="view"
        document={
          {
            id: 1,
            stocktakingDate: '2026-03-17',
            warehouseId: 1,
            stocktaker: 'テスト担当者',
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
    expect(screen.getByDisplayValue('テスト担当者')).toBeDisabled();
  });

  it('明細行に商品・理論在庫・実数量・差異・差異理由を表示すること', () => {
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('商品')).toBeInTheDocument();
    expect(screen.getByText('理論在庫')).toBeInTheDocument();
    expect(screen.getByText('実数量')).toBeInTheDocument();
    expect(screen.getByText('差異')).toBeInTheDocument();
    expect(screen.getByText('差異理由')).toBeInTheDocument();
  });

  it('DRAFTステータスの参照モードで確定ボタンを表示すること', () => {
    render(
      <StocktakingForm
        mode="view"
        document={
          {
            id: 1,
            stocktakingDate: '2026-03-17',
            warehouseId: 1,
            stocktaker: 'テスト担当者',
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

    expect(screen.getByText('確定する')).toBeInTheDocument();
  });

  it('参照モードで差異を色分けで表示すること', () => {
    render(
      <StocktakingForm
        mode="view"
        document={
          {
            id: 1,
            stocktakingDate: '2026-03-17',
            warehouseId: 1,
            stocktaker: 'テスト担当者',
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [
              {
                id: 1,
                stocktakingId: 1,
                productId: 'p1',
                theoreticalQty: 10,
                actualQty: 15,
                differenceReason: '追加入荷',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: 2,
                stocktakingId: 1,
                productId: 'p2',
                theoreticalQty: 20,
                actualQty: 15,
                differenceReason: '破損',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
  });

  it('差異がゼロの場合「0」が表示されること', () => {
    render(
      <StocktakingForm
        mode="view"
        document={
          {
            id: 1,
            stocktakingDate: '2026-03-17',
            warehouseId: 1,
            stocktaker: 'テスト担当者',
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [
              {
                id: 1,
                stocktakingId: 1,
                productId: 'p1',
                theoreticalQty: 10,
                actualQty: 10,
                differenceReason: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('actualQtyがnullの場合、差異セルに「-」が表示されること', () => {
    render(
      <StocktakingForm
        mode="view"
        document={
          {
            id: 1,
            stocktakingDate: '2026-03-17',
            warehouseId: 1,
            stocktaker: 'テスト担当者',
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [
              {
                id: 1,
                stocktakingId: 1,
                productId: 'p1',
                theoreticalQty: 10,
                actualQty: null,
                differenceReason: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    // actualQtyがnullなのでDifferenceCellは「-」を表示し、実数量も「-」と表示
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('行追加ボタンで明細行が増えること', async () => {
    const user = userEvent.setup();
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    await user.click(screen.getByText('行追加'));

    const rows = screen.getAllByText(/^[12]$/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('作成モードで商品未選択時に「商品を選択」プレースホルダーが表示されること', () => {
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('商品を選択')).toBeInTheDocument();
  });

  it('理論在庫の入力値が変わること', async () => {
    const user = userEvent.setup();
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    const spinButtons = screen.getAllByRole('spinbutton');
    await user.clear(spinButtons[0]);
    await user.type(spinButtons[0], '20');
    expect((spinButtons[0] as HTMLInputElement).value).toBe('20');
  });

  it('実数量の入力値が変わること', async () => {
    const user = userEvent.setup();
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    const spinButtons = screen.getAllByRole('spinbutton');
    await user.clear(spinButtons[1]);
    await user.type(spinButtons[1], '18');
    expect((spinButtons[1] as HTMLInputElement).value).toBe('18');
  });

  it('実数量を空にクリアできること', async () => {
    const user = userEvent.setup();
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    const spinButtons = screen.getAllByRole('spinbutton');
    await user.clear(spinButtons[1]);
    expect((spinButtons[1] as HTMLInputElement).value).toBe('');
  });

  it('差異理由の入力値が変わること', async () => {
    const user = userEvent.setup();
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    const textboxes = screen.getAllByRole('textbox');
    const reasonInput = textboxes.find((el) => el.id !== 'stocktaker')!;
    await user.clear(reasonInput);
    await user.type(reasonInput, 'テスト差異理由');
    expect((reasonInput as HTMLInputElement).value).toBe('テスト差異理由');
  });

  it('差異理由を空にクリアできること', async () => {
    const user = userEvent.setup();
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    const textboxes = screen.getAllByRole('textbox');
    const reasonInput = textboxes.find((el) => el.id !== 'stocktaker')!;
    await user.type(reasonInput, '理由');
    await user.clear(reasonInput);
    expect((reasonInput as HTMLInputElement).value).toBe('');
  });

  it('docのitemsからproductNamesRefが初期化されること', () => {
    render(
      <StocktakingForm
        mode="view"
        document={
          {
            id: 1,
            stocktakingDate: '2026-03-17',
            warehouseId: 1,
            stocktaker: 'テスト担当者',
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [
              {
                id: 1,
                stocktakingId: 1,
                productId: 'prod-st1',
                theoreticalQty: 10,
                actualQty: 10,
                differenceReason: null,
                product: { id: 'prod-st1', code: 'ST001', name: '棚卸商品' },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    expect(screen.getByText('ST001 棚卸商品')).toBeInTheDocument();
  });

  it('参照モードでは「行追加」ボタンが表示されないこと', () => {
    render(
      <StocktakingForm
        mode="view"
        document={
          {
            id: 1,
            stocktakingDate: '2026-03-17',
            warehouseId: 1,
            stocktaker: 'テスト担当者',
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

  it('docのstocktakingDateがDate型の場合も正しくスライスされること', () => {
    render(
      <StocktakingForm
        mode="view"
        document={
          {
            id: 1,
            stocktakingDate: new Date('2026-03-17T00:00:00Z'),
            warehouseId: 1,
            stocktaker: 'テスト担当者',
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

  it('参照モードで差異理由がnullの場合「-」が表示されること', () => {
    render(
      <StocktakingForm
        mode="view"
        document={
          {
            id: 1,
            stocktakingDate: '2026-03-17',
            warehouseId: 1,
            stocktaker: 'テスト担当者',
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            items: [
              {
                id: 1,
                stocktakingId: 1,
                productId: 'p1',
                theoreticalQty: 10,
                actualQty: 10,
                differenceReason: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as any
        }
      />,
    );

    // differenceReason が null/空の場合「-」が表示される
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('onSubmitなしで作成モードをレンダリングできること', () => {
    render(<StocktakingForm mode="create" />);
    expect(screen.getByText('棚卸日')).toBeInTheDocument();
  });

  it('CONFIRMEDステータスの参照モードで確定ボタンが表示されないこと', () => {
    render(
      <StocktakingForm
        mode="view"
        document={
          {
            id: 1,
            stocktakingDate: '2026-03-17',
            warehouseId: 1,
            stocktaker: 'テスト担当者',
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

    expect(screen.queryByText('確定する')).not.toBeInTheDocument();
  });
});
