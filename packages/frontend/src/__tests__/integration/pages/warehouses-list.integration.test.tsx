import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import { masterListHandler } from '../../mocks/handlers/masters.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import WarehousesPage from '@/app/dashboard/warehouses/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('WarehousesPage (integration)', () => {
  it('一覧 API のレスポンスを画面に描画する', async () => {
    render(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('W-001')).toBeInTheDocument();
      expect(screen.getByText('東京倉庫')).toBeInTheDocument();
      expect(screen.getByText('W-002')).toBeInTheDocument();
      expect(screen.getByText('大阪倉庫')).toBeInTheDocument();
    });
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      masterListHandler('/warehouses', [
        { id: 99, code: 'W-099', name: '上書き倉庫', capacity: 50, status: 'ACTIVE' },
      ]),
    );
    render(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('W-099')).toBeInTheDocument();
      expect(screen.getByText('上書き倉庫')).toBeInTheDocument();
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('W-001')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText('W-001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });
});
