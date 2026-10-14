import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import userEvent from '@testing-library/user-event';
import { server } from '../../mocks/server';
import { deniedPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import {
  objectTypesRecordsErrorHandler,
  objectTypesRecordsGatedHandler,
} from '../../mocks/handlers/object-types.handlers';
import CustomLedgerPage from '@/app/dashboard/custom/[key]/page';

// Next 15.5 で page の params が Promise になった（ref-0083 でビルド追随）。テストでは React use() が
// 同期解決できる fulfilled 済み thenable を渡す（素の Promise だと root が Suspense 境界なしで
// サスペンドしたまま waitFor が尽きる）。
function resolvedParams<T extends object>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  p.status = 'fulfilled';
  p.value = value;
  return p;
}

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: replaceMock,
    refresh: vi.fn(),
  }),
  useParams: () => ({ key: 'supplier-score' }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('CustomLedgerPage (integration, ref-0078)', () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it('台帳の項目定義どおりの列でデータ一覧が描画される', async () => {
    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() => {
      // 列見出しは項目定義の label
      expect(screen.getByText('仕入先名')).toBeInTheDocument();
      expect(screen.getByText('評価点')).toBeInTheDocument();
      expect(screen.getByText('評価日')).toBeInTheDocument();
    });
    // データ行（seed 51 件のうち 1 ページ目 50 件）
    await waitFor(() => {
      expect(screen.getByText('仕入先01')).toBeInTheDocument();
      expect(screen.getByText('仕入先02')).toBeInTheDocument();
    });
  });

  it('データ 51 件は 2 ページに分かれ、件数セレクタが出ない', async () => {
    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() => {
      expect(screen.getByText('全 51 件')).toBeInTheDocument();
    });
    // criteria 3: 件数を選ぶ欄は出さない
    expect(screen.queryByText('明細件数')).not.toBeInTheDocument();
    // 2 ページ目へ遷移できる（ナビが有効）
    expect(screen.getByLabelText('次のページ')).toBeEnabled();
  });

  it('ページ送りで次のページへ移動し、並び順が安定している（ref-0078 criteria 3）', async () => {
    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);
    await waitFor(() => expect(screen.getByText('全 51 件')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('次のページ'));
    await waitFor(() => {
      // 2 ページ目は 51 件目（仕入先51）が先頭に来る（id asc の安定順）
      expect(screen.getByText('仕入先51')).toBeInTheDocument();
      expect(screen.getByText('2 / 2 page')).toBeInTheDocument();
    });
    // 1 ページ目の先頭は消えている
    expect(screen.queryByText('仕入先01')).not.toBeInTheDocument();
  });

  it('データ 0 件の台帳は「データがありません」と空表示になる（ref-0078 criteria 2）', async () => {
    render(<CustomLedgerPage params={resolvedParams({ key: 'vendor-audit' })} />);

    await waitFor(() => {
      // ページタイトル（台帳名）と emptyMessage が出ていれば、空であることが分かる
      expect(screen.getByText('取引先監査')).toBeInTheDocument();
      expect(screen.getByText('データがありません')).toBeInTheDocument();
    });
    // 0 件なのでページング帯は「全 0 件」のみ（ナビは無効）
    expect(screen.getByText('全 0 件')).toBeInTheDocument();
  });

  it('一覧取得が失敗した時は「データがありません」と断定せず、取得失敗と再試行を出す', async () => {
    server.use(objectTypesRecordsErrorHandler);
    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() => {
      expect(screen.getByText('一覧の取得に失敗しました。')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    // 実データがある（51 件）のに空台帳と同じ文言を出さない
    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();
  });

  it('取得失敗のあと再試行すると一覧が表示される（失敗と正常な空を混同しない）', async () => {
    server.use(objectTypesRecordsErrorHandler);
    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);
    await waitFor(() => expect(screen.getByText('一覧の取得に失敗しました。')).toBeInTheDocument());

    server.resetHandlers();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '再試行' }));

    await waitFor(() => {
      expect(screen.getByText('仕入先01')).toBeInTheDocument();
      expect(screen.getByText('全 51 件')).toBeInTheDocument();
    });
    expect(screen.queryByText('一覧の取得に失敗しました。')).not.toBeInTheDocument();
  });

  it('再試行中は再試行ボタンが無効で、連打しても一覧 API を重複取得しない', async () => {
    server.use(objectTypesRecordsErrorHandler);
    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);
    await waitFor(() => expect(screen.getByText('一覧の取得に失敗しました。')).toBeInTheDocument());

    const gated = objectTypesRecordsGatedHandler();
    server.resetHandlers();
    server.use(gated.handler);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '再試行' }));

    // 処理中の再試行は押せない（押しても再取得が重ならない）
    await waitFor(() => expect(screen.getByRole('button', { name: '再試行' })).toBeDisabled());
    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(gated.calls()).toBe(1);

    gated.release();
    await waitFor(() => expect(screen.getByText('仕入先01')).toBeInTheDocument());
    expect(gated.calls()).toBe(1);
  });

  it('プリセット台帳（product）は専用画面への案内を出し、表を出さない', async () => {
    render(<CustomLedgerPage params={resolvedParams({ key: 'product' })} />);

    await waitFor(() => {
      expect(screen.getByText('この台帳は専用画面からご利用ください。')).toBeInTheDocument();
    });
    expect(screen.queryByText('仕入先名')).not.toBeInTheDocument();
  });

  it('存在しないキーは本体を mount せず /dashboard へリダイレクトする', async () => {
    render(<CustomLedgerPage params={resolvedParams({ key: 'missing' })} />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    });
    expect(screen.queryByText('指定された台帳は見つかりませんでした。')).not.toBeInTheDocument();
  });

  it('権限なしでは FeatureGuard が /dashboard へリダイレクトする（fallbackPath 明示）', async () => {
    server.use(deniedPermissionsHandler);
    render(<CustomLedgerPage params={resolvedParams({ key: 'supplier-score' })} />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    });
  });
});
