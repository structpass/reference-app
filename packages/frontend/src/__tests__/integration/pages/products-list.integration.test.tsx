import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { apiPath } from '../_helpers/api-base';
import { productsListHandler, categoriesListHandler } from '../../mocks/handlers/products.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import ProductsPage from '@/app/dashboard/products/page';

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('ProductsPage (integration)', () => {
  it('一覧 API のレスポンスを画面に描画する', async () => {
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
      expect(screen.getByText('コンデンサ A')).toBeInTheDocument();
      expect(screen.getByText('P-002')).toBeInTheDocument();
      expect(screen.getByText('抵抗 B')).toBeInTheDocument();
    });
  });

  it('カテゴリー API から取得した選択肢を filter bar に渡す', async () => {
    const user = userEvent.setup();
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
    });

    // 現仕様: FilterBar の select は DropdownMenuTrigger（aria-label「カテゴリーで絞り込み」・role="menu"）。
    // ADR 0003 が残した `aria-haspopup="listbox"` 前提は刷新前の古い仕様だったため、name で絞って再開する。
    const categoryTrigger = screen.getByRole('button', { name: /カテゴリーで絞り込み/ });
    expect(categoryTrigger).toBeDefined();
    await user.click(categoryTrigger);

    await waitFor(() => {
      // menu 内の選択肢（menuitem role）。データ行のカテゴリー表示（2 箇所）とは role で区別する。
      expect(screen.getAllByRole('menuitem', { name: '電子部品' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('menuitem', { name: '機械部品' }).length).toBeGreaterThan(0);
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });

  // d600: 500 を「商品が見つかりませんでした」（正常な 0 件）と同じ表示にしていたため、
  // 障害なのか 0 件なのかが画面から分からなかった。失敗は失敗として出し、再試行を添える。
  it('一覧 API が 500 を返したときは失敗の表示と再試行を出し、0 件の表示にはしない', async () => {
    server.use(
      http.get(apiPath('/products'), () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText('商品一覧')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('一覧の取得に失敗しました。')).toBeInTheDocument();
    });
    expect(screen.queryByText(/商品が見つかりませんでした/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });

  it('一覧 API の 500 のあと再試行で取得できれば失敗の表示を消す', async () => {
    // 1 度目だけ 500 を返し、再試行では成功させる。押した時に本当に取り直すか（要求が飛ぶか）も
    // 数える——表示が消えるだけでは、無関係な再描画で通ってしまう（d600 の指摘）。
    let requests = 0;
    server.use(
      http.get(apiPath('/products'), () => {
        requests += 1;
        if (requests === 1) {
          return HttpResponse.json({ message: 'error' }, { status: 500 });
        }
        return HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        });
      }),
    );
    const user = userEvent.setup();
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    const before = requests;
    await user.click(screen.getByRole('button', { name: '再試行' }));

    await waitFor(() => {
      expect(requests).toBe(before + 1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('カテゴリー API が落ちても商品一覧自体は描画される (Promise.allSettled 想定)', async () => {
    server.use(
      http.get(apiPath('/categories'), () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
    });
  });

  it('list API の追加 fixture (override) を per-spec で適用できる', async () => {
    server.use(
      productsListHandler([
        {
          id: 'prod-9',
          code: 'P-999',
          name: '上書きテスト商品',
          categoryId: 1,
          category: { id: 1, name: '電子部品' },
          price: 9999,
          stockQuantity: 1,
          status: 'ACTIVE',
        },
      ]),
      categoriesListHandler(),
    );
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText('P-999')).toBeInTheDocument();
      expect(screen.getByText('上書きテスト商品')).toBeInTheDocument();
    });
  });

  // d789: 0 件の案内が「まだ何も無い」のか「検索して 0 件だった」のかを読み分けられる。
  // 検索語を入れて 0 件の時は検索の結果だと分かる言い方にする。
  it('検索して 0 件の時は「まだ何も無い」のではなく条件に合わなかった旨を出す', async () => {
    const user = userEvent.setup();
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
    });

    server.use(
      http.get(apiPath('/products'), () =>
        HttpResponse.json({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } }),
      ),
    );
    await user.type(screen.getByRole('searchbox', { name: '商品名・コードで検索...' }), 'zzz');

    await waitFor(() => {
      expect(screen.getByText('条件に合う商品がありませんでした')).toBeInTheDocument();
    });
    expect(screen.queryByText('商品が見つかりませんでした')).not.toBeInTheDocument();
  });

  it('絞り込みを入れずに 0 件の時は従来どおり「商品が見つかりませんでした」を出す', async () => {
    server.use(
      http.get(apiPath('/products'), () =>
        HttpResponse.json({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } }),
      ),
    );
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText('商品が見つかりませんでした')).toBeInTheDocument();
    });
    expect(screen.queryByText('条件に合う商品がありませんでした')).toBeNull();
  });

  // d789: 絞り込みを入れた状態で取得に失敗した時も、失敗は失敗として出し、
  // 「条件に合う物が無い」へ読み違えさせない。
  it('絞り込み中に一覧取得が失敗した時も、失敗の表示と再試行を出し0件の案内にはしない', async () => {
    const user = userEvent.setup();
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText('P-001')).toBeInTheDocument();
    });

    server.use(
      http.get(apiPath('/products'), () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );
    await user.type(screen.getByRole('searchbox', { name: '商品名・コードで検索...' }), 'zzz');

    await waitFor(() => {
      expect(screen.getByText('一覧の取得に失敗しました。')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(screen.queryByText('条件に合う商品がありませんでした')).toBeNull();
    expect(screen.queryByText('商品が見つかりませんでした')).toBeNull();
  });
});
