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

  it('一覧 API が 500 を返したときも画面はマウントできる (toast 経由でエラー通知)', async () => {
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
      expect(screen.getByText(/商品が見つかりませんでした/)).toBeInTheDocument();
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
});
