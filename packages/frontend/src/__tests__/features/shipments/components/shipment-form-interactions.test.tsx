import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShipmentForm } from '@/features/shipments/components/shipment-form';

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

const mockCarriers = [{ id: 1, name: 'テスト運送A', code: 'CR-001', status: 'ACTIVE' }];

describe('ShipmentForm - インタラクション', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/warehouses') {
        return Promise.resolve({ data: { data: mockWarehouses } });
      }
      if (url === '/carriers') {
        return Promise.resolve({ data: { data: mockCarriers } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('作成モードが正常にレンダリングされること', () => {
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByText('出荷日')).toBeInTheDocument();
    expect(screen.getByText('出荷登録')).toBeInTheDocument();
  });

  it('倉庫のSelect選択肢が読み込まれること', async () => {
    const user = userEvent.setup();
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

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

  it('運送会社のSelect選択肢が読み込まれること', async () => {
    const user = userEvent.setup();
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/carriers', expect.anything());
    });

    const selectTriggers = screen
      .getAllByRole('button')
      .filter((el) => el.getAttribute('aria-haspopup') === 'listbox');
    const carrierTrigger = selectTriggers[1];
    await user.click(carrierTrigger);

    await waitFor(() => {
      expect(screen.getByText('テスト運送A')).toBeInTheDocument();
    });
  });

  it('明細行のデータを持つ参照モードで正常に表示されること', () => {
    render(
      <ShipmentForm
        mode="view"
        document={
          {
            id: 1,
            shipmentNo: 'SHP-001',
            shipmentDate: '2026-03-17',
            warehouseId: 1,
            destination: 'テスト出荷先',
            carrierId: null,
            status: 'DRAFT',
            createdById: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            lines: [
              {
                id: 1,
                shipmentId: 1,
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

    expect(screen.getByDisplayValue('テスト出荷先')).toBeInTheDocument();
    expect(screen.getByText('PRD-001 テスト商品')).toBeInTheDocument();
  });

  it('作成モードで明細行に数量入力ができること', async () => {
    const user = userEvent.setup();
    render(<ShipmentForm mode="create" onSubmit={vi.fn()} />);

    const quantityInputs = screen.getAllByRole('spinbutton');
    if (quantityInputs.length > 0) {
      await user.clear(quantityInputs[0]);
      await user.type(quantityInputs[0], '10');
      expect(quantityInputs[0]).toHaveValue(10);
    }
  });

  it('CONFIRMEDステータスで出荷完了ボタンが表示されること', () => {
    render(
      <ShipmentForm
        mode="view"
        document={
          {
            id: 1,
            shipmentNo: 'SHP-001',
            shipmentDate: '2026-03-17',
            warehouseId: 1,
            destination: 'テスト出荷先',
            carrierId: 1,
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

    expect(screen.getByText('出荷完了')).toBeInTheDocument();
  });
});
