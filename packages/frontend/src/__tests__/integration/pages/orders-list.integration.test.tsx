import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import { ordersListHandler } from '../../mocks/handlers/documents.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import OrdersPage from '@/app/dashboard/orders/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('OrdersPage (integration)', () => {
  it('発注 API のレスポンスを画面に描画する', async () => {
    render(<OrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
      expect(screen.getByText('PO-0002')).toBeInTheDocument();
      expect(screen.getByText('仕入先 A')).toBeInTheDocument();
      // formatNumber 経由 (12,345)
      expect(screen.getByText('12,345')).toBeInTheDocument();
      expect(screen.getByText('67,890')).toBeInTheDocument();
    });
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      ordersListHandler([
        {
          id: 99,
          orderNo: 'PO-9999',
          orderDate: '2026-04-30',
          totalAmount: 555,
          status: 'DRAFT',
          supplier: { id: 99, name: '上書仕入先' },
        },
      ]),
    );
    render(<OrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('PO-9999')).toBeInTheDocument();
      expect(screen.getByText('上書仕入先')).toBeInTheDocument();
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<OrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<OrdersPage />);

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });
});
