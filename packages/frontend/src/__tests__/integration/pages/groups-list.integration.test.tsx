import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import { groupsListHandler } from '../../mocks/handlers/groups.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import GroupsPage from '@/app/dashboard/groups/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('GroupsPage (integration)', () => {
  it('一覧 API のレスポンスを画面に描画する', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('G-001')).toBeInTheDocument();
      expect(screen.getByText('倉庫オペレーター')).toBeInTheDocument();
      expect(screen.getByText('G-002')).toBeInTheDocument();
      expect(screen.getByText('事務管理')).toBeInTheDocument();
    });
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      groupsListHandler([{ id: 99, code: 'G-999', name: '上書きグループ', role: 'SYS_ADMIN' }]),
    );
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('G-999')).toBeInTheDocument();
      expect(screen.getByText('上書きグループ')).toBeInTheDocument();
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('G-001')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('G-001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });
});
