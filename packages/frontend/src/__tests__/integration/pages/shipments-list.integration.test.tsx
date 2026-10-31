import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import { shipmentsListHandler } from '../../mocks/handlers/documents.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import ShipmentsPage from '@/app/dashboard/shipments/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('ShipmentsPage (integration)', () => {
  it('出荷 API のレスポンスを画面に描画する', async () => {
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('SH-0001')).toBeInTheDocument();
      expect(screen.getByText('SH-0002')).toBeInTheDocument();
      expect(screen.getByText('東京物流センター')).toBeInTheDocument();
      expect(screen.getByText('大阪倉庫')).toBeInTheDocument();
    });
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      shipmentsListHandler([
        {
          id: 99,
          shipmentNo: 'SH-9999',
          shipmentDate: '2026-04-30',
          destination: '上書出荷先',
        },
      ]),
    );
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('SH-9999')).toBeInTheDocument();
      expect(screen.getByText('上書出荷先')).toBeInTheDocument();
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('SH-0001')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('SH-0001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });
});
