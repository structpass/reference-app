import { describe, it, expect, vi } from 'vitest';
import { render, renderWithRole, screen } from '../_helpers/render-page';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { apiPath } from '../_helpers/api-base';
import { usersDetailHandler, type UserFixture } from '../../mocks/handlers/users.handlers';
import EditUserPage from '@/app/dashboard/users/[id]/page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'user-1' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const unlinkedUser: UserFixture = {
  id: 1,
  name: 'tanaka',
  email: 'tanaka@example.com',
  role: 'OF_USER',
  isActive: true,
  oidcLinked: false,
  allowOidcLink: false,
};

describe('EditUserPage (SSO 連携・ref-0066)', () => {
  it('未連携ユーザーには「未連携」バッジと「SSO 連携を許可」ボタンが表示されること', async () => {
    server.use(usersDetailHandler(unlinkedUser));
    render(<EditUserPage />);

    expect(await screen.findByText('未連携')).toBeInTheDocument();
    expect(
      screen.getByText(
        'このユーザーは SSO でログインできません。ログインを許可する場合は以下のボタンを押してください。',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SSO 連携を許可' })).toBeInTheDocument();
  });

  it('「SSO 連携を許可」クリックで allowOidcLink: true の更新が送信され「許可済み」表示へ変わること', async () => {
    const user = userEvent.setup();
    let capturedBody: { allowOidcLink?: boolean } | null = null;
    server.use(
      usersDetailHandler(unlinkedUser),
      http.put(apiPath('/users/:id'), async ({ request }) => {
        capturedBody = (await request.json()) as { allowOidcLink?: boolean };
        return HttpResponse.json({ data: { success: true } });
      }),
    );
    render(<EditUserPage />);

    await user.click(await screen.findByRole('button', { name: 'SSO 連携を許可' }));

    expect(await screen.findByText('許可済み')).toBeInTheDocument();
    expect(capturedBody).toEqual({ allowOidcLink: true });
    // 許可後はボタンが消える（再許可不可・使い切り）
    expect(screen.queryByRole('button', { name: 'SSO 連携を許可' })).not.toBeInTheDocument();
  });

  it('SSO 連携済みユーザーには「連携済み」バッジが表示され許可ボタンは出ないこと', async () => {
    server.use(usersDetailHandler({ ...unlinkedUser, oidcLinked: true }));
    render(<EditUserPage />);

    expect(await screen.findByText('連携済み')).toBeInTheDocument();
    expect(screen.getByText('このユーザーは SSO でログインできます。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'SSO 連携を許可' })).not.toBeInTheDocument();
  });

  it('許可済み（未消費）の未連携ユーザーには「許可済み」バッジが表示され許可ボタンは出ないこと', async () => {
    server.use(usersDetailHandler({ ...unlinkedUser, allowOidcLink: true }));
    render(<EditUserPage />);

    expect(await screen.findByText('許可済み')).toBeInTheDocument();
    expect(
      screen.getByText('許可済みです。次回 SSO ログイン時に自動で連携されます。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'SSO 連携を許可' })).not.toBeInTheDocument();
  });

  it('既存のマスタ更新フォームが従来どおり表示されること（後退なし）', async () => {
    server.use(usersDetailHandler(unlinkedUser));
    render(<EditUserPage />);

    expect(await screen.findByLabelText(/名前/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('tanaka@example.com')).toBeInTheDocument();
  });

  // v2-426: SSO 連携の許可は SYS_ADMIN のみ。users:update だけを持つ管理者には
  // 押すと必ず 403 になるボタンを見せない。
  it('非 SYS_ADMIN（WH_ADMIN）には「SSO 連携を許可」ボタンが出ないこと', async () => {
    server.use(usersDetailHandler(unlinkedUser));
    renderWithRole('WH_ADMIN', <EditUserPage />);

    expect(await screen.findByText('未連携')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'SSO 連携を許可' })).not.toBeInTheDocument();
  });

  it('非 SYS_ADMIN（OF_ADMIN）にも「SSO 連携を許可」ボタンが出ないこと', async () => {
    server.use(usersDetailHandler(unlinkedUser));
    renderWithRole('OF_ADMIN', <EditUserPage />);

    expect(await screen.findByText('未連携')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'SSO 連携を許可' })).not.toBeInTheDocument();
  });

  it('SYS_ADMIN には従来どおり「SSO 連携を許可」ボタンが出ること', async () => {
    server.use(usersDetailHandler(unlinkedUser));
    renderWithRole('SYS_ADMIN', <EditUserPage />);

    expect(await screen.findByRole('button', { name: 'SSO 連携を許可' })).toBeInTheDocument();
  });
});
