import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import { masterListHandler } from '../../mocks/handlers/masters.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import CarriersPage from '@/app/dashboard/carriers/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('CarriersPage (integration)', () => {
  it('一覧 API のレスポンスを画面に描画する', async () => {
    render(<CarriersPage />);

    await waitFor(() => {
      expect(screen.getByText('C-001')).toBeInTheDocument();
      expect(screen.getByText('ヤマト運輸')).toBeInTheDocument();
      expect(screen.getByText('C-002')).toBeInTheDocument();
      expect(screen.getByText('佐川急便')).toBeInTheDocument();
    });
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      masterListHandler('/carriers', [
        { id: 99, code: 'C-099', name: '上書き運送', status: 'ACTIVE' },
      ]),
    );
    render(<CarriersPage />);

    await waitFor(() => {
      expect(screen.getByText('C-099')).toBeInTheDocument();
      expect(screen.getByText('上書き運送')).toBeInTheDocument();
    });
  });

  it('空の応答でも画面はマウントできる (空状態)', async () => {
    server.use(masterListHandler('/carriers', []));
    render(<CarriersPage />);

    await waitFor(() => {
      expect(screen.getByText('運送会社一覧')).toBeInTheDocument();
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<CarriersPage />);

    await waitFor(() => {
      expect(screen.getByText('C-001')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<CarriersPage />);

    await waitFor(() => {
      expect(screen.getByText('C-001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });
});
