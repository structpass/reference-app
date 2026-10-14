import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceivingForm } from '@/features/receivings/components/receiving-form';

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

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const mockWarehouses = [
  { id: 1, name: 'テスト倉庫A', code: 'WH-001', status: 'ACTIVE' },
  { id: 2, name: 'テスト倉庫B', code: 'WH-002', status: 'ACTIVE' },
];

const mockSuppliers = [{ id: 1, name: 'テスト仕入先A', code: 'SUP-001', status: 'ACTIVE' }];

describe('ReceivingForm - インタラクション', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/warehouses') {
        return Promise.resolve({ data: { data: mockWarehouses } });
      }
      if (url === '/suppliers') {
        return Promise.resolve({ data: { data: mockSuppliers } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('作成モードが正常にレンダリングされること', () => {
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('入荷日')).toBeInTheDocument();
    expect(screen.getByText('入荷登録')).toBeInTheDocument();
  });

  it('倉庫のSelect選択肢が読み込まれること', async () => {
    const user = userEvent.setup();
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

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

  it('明細行のデータを持つ参照モードで正常に表示されること', () => {
    render(
      <ReceivingForm
        mode="view"
        document={
          {
            id: 1,
            receivingNo: 'RCV-001',
            receivingDate: '2026-03-17',
            warehouseId: 1,
            supplierId: 1,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [
              {
                id: 1,
                receivingId: 1,
                lineNo: 1,
                productId: 'p1',
                plannedQty: 5,
                actualQty: 3,
                product: { id: 'p1', name: 'テスト商品', code: 'PRD-001' },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as never
        }
      />,
    );

    expect(screen.getByDisplayValue('2026-03-17')).toBeInTheDocument();
    expect(screen.getByText('PRD-001 テスト商品')).toBeInTheDocument();
  });

  it('作成モードで明細行の予定数量を変更できること', async () => {
    const user = userEvent.setup();
    render(<ReceivingForm mode="create" onSubmit={vi.fn()} />);

    const quantityInputs = screen.getAllByRole('spinbutton');
    if (quantityInputs.length > 0) {
      await user.clear(quantityInputs[0]);
      await user.type(quantityInputs[0], '15');
      expect(quantityInputs[0]).toHaveValue(15);
    }
  });

  it('CONFIRMEDステータスで完了ボタンが表示されること', async () => {
    render(
      <ReceivingForm
        mode="view"
        document={
          {
            id: 1,
            receivingNo: 'RCV-001',
            receivingDate: '2026-03-17',
            warehouseId: 1,
            supplierId: 1,
            status: 'CONFIRMED',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [],
          } as never
        }
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('完了する')).toBeInTheDocument();
    });
  });
});
