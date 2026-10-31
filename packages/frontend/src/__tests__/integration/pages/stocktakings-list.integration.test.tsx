import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import { stocktakingsListHandler } from '../../mocks/handlers/documents.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import StocktakingsPage from '@/app/dashboard/stocktakings/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('StocktakingsPage (integration)', () => {
  it('棚卸 API のレスポンスを画面に描画する', async () => {
    render(<StocktakingsPage />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
      expect(screen.getByText('山田 太郎')).toBeInTheDocument();
      expect(screen.getByText('佐藤 花子')).toBeInTheDocument();
      expect(screen.getByText('W-001 - 東京倉庫')).toBeInTheDocument();
    });
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      stocktakingsListHandler([
        {
          id: 99,
          stocktakingDate: '2026-04-30',
          status: 'DRAFT',
          stocktaker: '上書 担当',
          warehouse: { id: 99, code: 'W-099', name: '上書倉庫' },
        },
      ]),
    );
    render(<StocktakingsPage />);

    await waitFor(() => {
      expect(screen.getByText('#99')).toBeInTheDocument();
      expect(screen.getByText('上書 担当')).toBeInTheDocument();
      expect(screen.getByText('W-099 - 上書倉庫')).toBeInTheDocument();
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<StocktakingsPage />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<StocktakingsPage />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });
});
