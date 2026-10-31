import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StocktakingForm } from '@/features/stocktakings/components/stocktaking-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import apiClient from '@/lib/api-client';

const mockWarehouses = [
  { id: 1, name: 'テスト倉庫A', code: 'WH-001', status: 'ACTIVE' },
  { id: 2, name: 'テスト倉庫B', code: 'WH-002', status: 'ACTIVE' },
];

const buildDoc = (item: { theoreticalQty: number; actualQty: number | null }) =>
  ({
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
        lineNo: 1,
        productId: 'p1',
        theoreticalQty: item.theoreticalQty,
        actualQty: item.actualQty,
        product: { id: 'p1', name: 'テスト商品', code: 'PRD-001' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  }) as never;

describe('StocktakingForm - インタラクション', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/warehouses') {
        return Promise.resolve({ data: { data: mockWarehouses } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('作成モードが正常にレンダリングされること', () => {
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('棚卸日')).toBeInTheDocument();
    expect(screen.getByText('棚卸登録')).toBeInTheDocument();
  });

  it('倉庫のSelect選択肢が読み込まれること', async () => {
    const user = userEvent.setup();
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/warehouses', expect.anything());
    });

    const warehouseTrigger = screen
      .getAllByRole('button')
      .find((el) => el.getAttribute('aria-haspopup') === 'listbox')!;
    await user.click(warehouseTrigger);

    await waitFor(() => {
      expect(screen.getByText('テスト倉庫A')).toBeInTheDocument();
    });
  });

  it('明細行のアイテムを持つ参照モードで正常に表示されること', () => {
    render(
      <StocktakingForm mode="view" document={buildDoc({ theoreticalQty: 10, actualQty: 8 })} />,
    );

    expect(screen.getByDisplayValue('テスト担当者')).toBeInTheDocument();
    expect(screen.getByText('PRD-001 テスト商品')).toBeInTheDocument();
  });

  it('作成モードで明細行の理論在庫数量を変更できること', async () => {
    const user = userEvent.setup();
    render(<StocktakingForm mode="create" onSubmit={vi.fn()} />);

    const quantityInputs = screen.getAllByRole('spinbutton');
    if (quantityInputs.length > 0) {
      await user.clear(quantityInputs[0]);
      await user.type(quantityInputs[0], '5');
      expect(quantityInputs[0]).toHaveValue(5);
    }
  });

  it('差異がプラスの場合に緑色で表示されること', () => {
    render(
      <StocktakingForm mode="view" document={buildDoc({ theoreticalQty: 5, actualQty: 10 })} />,
    );

    const diffElement = screen.getByText('+5');
    expect(diffElement).toHaveClass('text-success');
  });

  it('差異がマイナスの場合に赤色で表示されること', () => {
    render(
      <StocktakingForm mode="view" document={buildDoc({ theoreticalQty: 10, actualQty: 5 })} />,
    );

    const diffElement = screen.getByText('-5');
    expect(diffElement).toHaveClass('text-destructive');
  });

  it('差異がゼロの場合に「0」を表示すること', () => {
    render(
      <StocktakingForm mode="view" document={buildDoc({ theoreticalQty: 10, actualQty: 10 })} />,
    );

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('actualQtyがnullの場合に「-」を表示すること', () => {
    render(
      <StocktakingForm mode="view" document={buildDoc({ theoreticalQty: 10, actualQty: null })} />,
    );

    const dashElements = screen.getAllByText('-');
    expect(dashElements.length).toBeGreaterThan(0);
  });
});
