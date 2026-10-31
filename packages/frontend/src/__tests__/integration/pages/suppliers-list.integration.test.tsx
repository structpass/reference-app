import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import { masterListHandler } from '../../mocks/handlers/masters.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import SuppliersPage from '@/app/dashboard/suppliers/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('SuppliersPage (integration)', () => {
  it('一覧 API のレスポンスを画面に描画する', async () => {
    render(<SuppliersPage />);

    await waitFor(() => {
      expect(screen.getByText('S-001')).toBeInTheDocument();
      expect(screen.getByText('仕入先 A')).toBeInTheDocument();
      expect(screen.getByText('S-002')).toBeInTheDocument();
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<SuppliersPage />);

    await waitFor(() => {
      expect(screen.getByText('S-001')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      masterListHandler('/suppliers', [
        { id: 50, code: 'S-050', name: '上書き仕入先', status: 'ACTIVE' },
      ]),
    );
    render(<SuppliersPage />);

    await waitFor(() => {
      expect(screen.getByText('S-050')).toBeInTheDocument();
      expect(screen.getByText('上書き仕入先')).toBeInTheDocument();
    });
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<SuppliersPage />);

    await waitFor(() => {
      expect(screen.getByText('S-001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });
});
