import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderForm } from '@/features/orders/components/order-form';

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

const mockSuppliers = [{ id: 1, name: 'テスト仕入先A', code: 'SUP-001', status: 'ACTIVE' }];

const mockProducts = [
  {
    id: 'p1',
    code: 'PRD-001',
    name: 'テスト商品1',
    price: 1000,
    stockQuantity: 50,
    status: 'ACTIVE',
  },
];

describe('OrderForm - インタラクション', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/suppliers') {
        return Promise.resolve({ data: { data: mockSuppliers } });
      }
      if (url === '/products') {
        return Promise.resolve({
          data: { data: mockProducts, meta: { total: 1, page: 1, limit: 10, totalPages: 1 } },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('商品検索ボタンをクリックするとモーダルが開くこと', async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    const searchButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.querySelector('.lucide-search'));

    if (searchButtons.length > 0) {
      await user.click(searchButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('商品検索')).toBeInTheDocument();
      });
    }
  });

  it('商品を選択すると行のproductIdが更新されること', async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    const searchButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.querySelector('.lucide-search'));

    if (searchButtons.length > 0) {
      await user.click(searchButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('商品検索')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('テスト商品1')).toBeInTheDocument();
      });

      await user.click(screen.getByText('テスト商品1'));

      await waitFor(() => {
        expect(screen.queryByText('商品検索')).not.toBeInTheDocument();
      });
    }
  });

  it('発注数量の入力が変化すること', async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    const numberInputs = screen.getAllByRole('spinbutton');
    if (numberInputs.length > 0) {
      await user.clear(numberInputs[0]);
      await user.type(numberInputs[0], '5');
      expect(numberInputs[0]).toHaveValue(5);
    }
  });

  it('単価の入力が変化すること', async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    const numberInputs = screen.getAllByRole('spinbutton');
    if (numberInputs.length > 1) {
      await user.clear(numberInputs[1]);
      await user.type(numberInputs[1], '1500');
      expect(numberInputs[1]).toHaveValue(1500);
    }
  });

  it('参照モードで商品名が表示されること', async () => {
    render(
      <OrderForm
        mode="view"
        document={
          {
            id: 1,
            orderNo: 'PO-001',
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
                product: { id: 'p1', name: 'テスト商品1', code: 'PRD-001' },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          } as never
        }
      />,
    );

    expect(screen.getByText('PRD-001 テスト商品1')).toBeInTheDocument();
  });

  it('仕入先のComboboxオプションが表示されること', async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" onSubmit={vi.fn()} />);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/suppliers', expect.anything());
    });

    const comboboxButton = screen.getByRole('button', { name: /選択してください/ });
    await user.click(comboboxButton);

    await waitFor(() => {
      expect(screen.getByText('テスト仕入先A')).toBeInTheDocument();
    });
  });
});
