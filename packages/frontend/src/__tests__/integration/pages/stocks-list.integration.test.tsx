import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import { stocksListHandler } from '../../mocks/handlers/stocks.handlers';
import StocksPage from '@/app/dashboard/stocks/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('StocksPage (integration)', () => {
  it('在庫 API のレスポンスが warehouse + product のピボットで描画される', async () => {
    render(<StocksPage />);

    await waitFor(() => {
      // 倉庫コード列 (filter には現れない値で検証)
      expect(screen.getByText('W-001')).toBeInTheDocument();
      expect(screen.getByText('W-002')).toBeInTheDocument();
      // 商品
      expect(screen.getByText('コンデンサ A')).toBeInTheDocument();
      expect(screen.getByText('抵抗 B')).toBeInTheDocument();
      // 在庫数 (formatNumber 経由で千区切り)
      expect(screen.getByText('120')).toBeInTheDocument();
      expect(screen.getByText('45')).toBeInTheDocument();
    });
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      stocksListHandler([
        {
          id: 99,
          warehouseId: 99,
          productId: 'prod-99',
          quantity: 9999,
          warehouse: { id: 99, code: 'W-099', name: '上書倉庫' },
          product: {
            id: 'prod-99',
            code: 'P-099',
            name: '上書商品',
            unit: '本',
            category: { id: 9, name: '機械部品' },
          },
        },
      ]),
    );
    render(<StocksPage />);

    await waitFor(() => {
      expect(screen.getByText('上書倉庫')).toBeInTheDocument();
      expect(screen.getByText('上書商品')).toBeInTheDocument();
      expect(screen.getByText('9,999')).toBeInTheDocument();
    });
  });

  it('空の応答でも画面はマウントできる (空状態)', async () => {
    server.use(stocksListHandler([]));
    render(<StocksPage />);

    await waitFor(() => {
      expect(screen.getByText('倉庫別在庫一覧')).toBeInTheDocument();
    });
  });
});
