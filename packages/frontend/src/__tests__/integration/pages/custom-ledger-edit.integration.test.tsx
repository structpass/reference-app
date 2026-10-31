import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import userEvent from '@testing-library/user-event';
import { server } from '../../mocks/server';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import { customRecordErrorHandler } from '../../mocks/handlers/object-types.handlers';
import EditCustomRecordPage from '@/app/dashboard/custom/[key]/[id]/edit/page';

// 一覧 page と同じく Next 15.5 の Promise params を同期解決させる（ref-0083）。
function resolvedParams<T extends object>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  p.status = 'fulfilled';
  p.value = value;
  return p;
}

const { replaceMock, pushMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    back: vi.fn(),
    replace: replaceMock,
    refresh: vi.fn(),
  }),
  useParams: () => ({ key: 'supplier-score', id: '51' }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const renderEdit = (key: string, id: string) =>
  render(<EditCustomRecordPage params={resolvedParams({ key, id })} />);

describe('EditCustomRecordPage (integration, 編集直行)', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    pushMock.mockClear();
  });

  it('2ページ目（51件目）の編集URLを直接開くと、画面内キャッシュ無しで内容がフォームに出る', async () => {
    renderEdit('supplier-score', '51');

    await waitFor(() => {
      expect(screen.getByText('仕入先評価のレコードを編集')).toBeInTheDocument();
    });
    // 一覧の先頭50件の窓を経由しない単体取得で解決している
    expect(screen.getByLabelText(/仕入先名/)).toHaveValue('仕入先51');
  });

  it('再読み込み相当（アンマウント→再マウント）でも同じレコードが出る', async () => {
    const first = renderEdit('supplier-score', '51');
    await waitFor(() => expect(screen.getByLabelText(/仕入先名/)).toHaveValue('仕入先51'));
    first.unmount();

    renderEdit('supplier-score', '51');
    await waitFor(() => expect(screen.getByLabelText(/仕入先名/)).toHaveValue('仕入先51'));
  });

  it('別台帳のキーでは同じ id でも見つからない扱いになる（所属境界）', async () => {
    renderEdit('vendor-audit', '51');

    await waitFor(() => {
      expect(
        screen.getByText('指定された台帳またはレコードが見つかりませんでした。'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/取引先名/)).not.toBeInTheDocument();
  });

  it('存在しないレコード id は見つからない扱いになる', async () => {
    renderEdit('supplier-score', '999');

    await waitFor(() => {
      expect(
        screen.getByText('指定された台帳またはレコードが見つかりませんでした。'),
      ).toBeInTheDocument();
    });
  });

  it('単体取得が失敗した時は「見つかりません」と断定せず、読み込み失敗と再試行を出す', async () => {
    server.use(customRecordErrorHandler);
    renderEdit('supplier-score', '51');

    await waitFor(() => {
      expect(screen.getByText('レコードの読み込みに失敗しました。')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(
      screen.queryByText('指定された台帳またはレコードが見つかりませんでした。'),
    ).not.toBeInTheDocument();
  });

  it('読み込み失敗のあと再試行するとフォームが出る', async () => {
    server.use(customRecordErrorHandler);
    renderEdit('supplier-score', '51');
    await waitFor(() =>
      expect(screen.getByText('レコードの読み込みに失敗しました。')).toBeInTheDocument(),
    );

    server.resetHandlers();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '再試行' }));

    await waitFor(() => expect(screen.getByLabelText(/仕入先名/)).toHaveValue('仕入先51'));
    expect(screen.queryByText('レコードの読み込みに失敗しました。')).not.toBeInTheDocument();
  });

  it('プリセット台帳（product）のレコード編集URLは「見つかりません」になる（専用分岐を持たない）', async () => {
    renderEdit('product', '1');

    await waitFor(() => {
      expect(
        screen.getByText('指定された台帳またはレコードが見つかりませんでした。'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();
  });

  it('保存すると一覧（/dashboard/custom/<key>）へ戻る', async () => {
    renderEdit('supplier-score', '51');
    await waitFor(() => expect(screen.getByLabelText(/仕入先名/)).toHaveValue('仕入先51'));

    const user = userEvent.setup();
    const nameInput = screen.getByLabelText(/仕入先名/);
    await user.clear(nameInput);
    await user.type(nameInput, '仕入先51改');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/dashboard/custom/supplier-score');
    });
  });

  it('更新権限がないと /dashboard へ戻し、フォームを描画しない', async () => {
    server.use(viewOnlyPermissionsHandler);
    renderEdit('supplier-score', '51');

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    });
    expect(screen.queryByLabelText(/仕入先名/)).not.toBeInTheDocument();
  });
});
