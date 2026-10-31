import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import { receivingsListHandler } from '../../mocks/handlers/documents.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import ReceivingsPage from '@/app/dashboard/receivings/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('ReceivingsPage (integration)', () => {
  it('入荷 API のレスポンスを画面に描画する', async () => {
    render(<ReceivingsPage />);

    await waitFor(() => {
      expect(screen.getByText('RC-0001')).toBeInTheDocument();
      expect(screen.getByText('RC-0002')).toBeInTheDocument();
      expect(screen.getByText('仕入先 A')).toBeInTheDocument();
      expect(screen.getByText('仕入先 B')).toBeInTheDocument();
    });
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      receivingsListHandler([
        {
          id: 99,
          receivingNo: 'RC-9999',
          receivingDate: '2026-04-30',
          supplier: { id: 99, name: '上書仕入先' },
        },
      ]),
    );
    render(<ReceivingsPage />);

    await waitFor(() => {
      expect(screen.getByText('RC-9999')).toBeInTheDocument();
      expect(screen.getByText('上書仕入先')).toBeInTheDocument();
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<ReceivingsPage />);

    await waitFor(() => {
      expect(screen.getByText('RC-0001')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<ReceivingsPage />);

    await waitFor(() => {
      expect(screen.getByText('RC-0001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });
});
