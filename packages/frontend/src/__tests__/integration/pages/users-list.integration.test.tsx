import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { server } from '../../mocks/server';
import { usersListHandler } from '../../mocks/handlers/users.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import UsersPage from '@/app/dashboard/users/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('UsersPage (integration)', () => {
  it('一覧 API のレスポンスを画面に描画する', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      expect(screen.getByText('wh-admin')).toBeInTheDocument();
      expect(screen.getByText('of-user')).toBeInTheDocument();
    });
  });

  it('isActive の状態が Badge で描画される (有効 / 無効)', async () => {
    const { container } = render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    // filter の select option ではなく Badge component (data-table 内) のみを対象に数える
    const badges = container.querySelectorAll('table [class*="badge"], table .inline-flex');
    const badgeTexts = Array.from(badges).map((el) => el.textContent?.trim());
    const activeCount = badgeTexts.filter((t) => t === '有効').length;
    const inactiveCount = badgeTexts.filter((t) => t === '無効').length;
    expect(activeCount).toBe(2);
    expect(inactiveCount).toBe(1);
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      usersListHandler([
        {
          id: 99,
          name: 'override-user',
          email: 'override@example.com',
          role: 'OF_ADMIN',
          isActive: true,
          oidcLinked: false,
          allowOidcLink: false,
        },
      ]),
    );
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('override-user')).toBeInTheDocument();
      expect(screen.getByText('override@example.com')).toBeInTheDocument();
    });
  });

  it('role=null（権限待ち）ユーザーは「権限待ち」と表示される', async () => {
    server.use(
      usersListHandler([
        {
          id: 100,
          name: 'pending-user',
          email: 'pending@example.com',
          role: null,
          isActive: true,
          oidcLinked: false,
          allowOidcLink: false,
        },
      ]),
    );
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('pending-user')).toBeInTheDocument();
      expect(screen.getByText('権限待ち')).toBeInTheDocument();
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });
});
