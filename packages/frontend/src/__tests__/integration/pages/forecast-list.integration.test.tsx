import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import {
  forecastListHandler,
  defaultForecasts,
  type ForecastFixture,
} from '../../mocks/handlers/stocks.handlers';
import { deniedPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import ForecastPage from '@/app/dashboard/forecast/page';

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: replaceMock,
    refresh: vi.fn(),
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('ForecastPage (integration)', () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });
  it('予測在庫 API のレスポンスが描画され、forecast 固有の符号付き列が出る', async () => {
    render(<ForecastPage />);

    await waitFor(() => {
      // 倉庫 / 商品
      expect(screen.getByText('東京倉庫')).toBeInTheDocument();
      expect(screen.getByText('コンデンサ A')).toBeInTheDocument();
      // 入荷予定: 正の値は + 符号付きで描画
      expect(screen.getByText('+30')).toBeInTheDocument();
      // 出荷予定: 正の値は - 符号付きで描画
      expect(screen.getByText('-60')).toBeInTheDocument();
      // 予測在庫: 0 以下はそのまま負の値で描画
      expect(screen.getByText('-15')).toBeInTheDocument();
      // 現在庫
      expect(screen.getByText('120')).toBeInTheDocument();
    });
  });

  it('ゼロの入荷/出荷は 0 表示で符号が付かない', async () => {
    render(<ForecastPage />);

    await waitFor(() => {
      // defaultForecasts の 2 件目は incomingQty=0、1 件目は outgoingQty=0
      expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('予測在庫 0 以下の行は強調（font-semibold text-destructive）される', async () => {
    render(<ForecastPage />);

    await waitFor(() => {
      const minus15 = screen.getByText('-15');
      expect(minus15).toHaveClass('font-semibold');
      expect(minus15).toHaveClass('text-destructive');
    });
  });

  it('権限なし（denied）では FeatureGuard が /dashboard へリダイレクトする（ref-0070・fallbackPath 修正）', async () => {
    server.use(deniedPermissionsHandler);
    render(<ForecastPage />);

    // ref-0070: forecast ページに fallbackPath="/dashboard" を明示したため、権限なしユーザーは
    // 兄弟ページ（permissions / system-settings 等）と同じく /dashboard へ戻る。旧仕様（fallbackPath 未指定で
    // 自分自身の forecast ページへ戻る＝白画面）を解消する。
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    const override: ForecastFixture[] = [
      {
        id: 99,
        warehouseId: 9,
        productId: 'prod-99',
        quantity: 100,
        warehouse: { id: 9, code: 'W-099', name: '上書倉庫' },
        product: { id: 'prod-99', code: 'P-099', name: '上書商品', unit: '本' },
        incomingQty: 50,
        outgoingQty: 20,
        forecastQty: 130,
        alert: 'normal',
      },
    ];
    server.use(forecastListHandler(override));
    render(<ForecastPage />);

    await waitFor(() => {
      expect(screen.getByText('上書倉庫')).toBeInTheDocument();
      expect(screen.getByText('上書商品')).toBeInTheDocument();
      expect(screen.getByText('+50')).toBeInTheDocument();
      expect(screen.getByText('-20')).toBeInTheDocument();
      expect(screen.getByText('130')).toBeInTheDocument();
    });
  });
});
