import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { apiPath } from '../_helpers/api-base';
import { categoriesListHandler } from '../../mocks/handlers/products.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import CategoriesPage from '@/app/dashboard/categories/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('CategoriesPage (integration)', () => {
  it('一覧 API のレスポンスを画面に描画する', async () => {
    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('CAT-001')).toBeInTheDocument();
      expect(screen.getByText('電子部品')).toBeInTheDocument();
      expect(screen.getByText('CAT-002')).toBeInTheDocument();
      expect(screen.getByText('機械部品')).toBeInTheDocument();
    });
  });

  it('一覧 API が 500 を返したときも画面はマウントできる', async () => {
    server.use(
      http.get(apiPath('/categories'), () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );
    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('カテゴリー一覧')).toBeInTheDocument();
    });
  });

  it('per-spec override で fixture を差し替えられる', async () => {
    server.use(
      categoriesListHandler([{ id: 99, code: 'CAT-099', name: 'override カテ', status: 'ACTIVE' }]),
    );
    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('CAT-099')).toBeInTheDocument();
      expect(screen.getByText('override カテ')).toBeInTheDocument();
    });
  });

  it('権限付き状態では新規登録ボタンが描画される', async () => {
    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('CAT-001')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeInTheDocument();
  });

  it('権限がない場合は新規登録ボタンが描画されない', async () => {
    server.use(viewOnlyPermissionsHandler);
    render(<CategoriesPage />);

    await waitFor(() => {
      expect(screen.getByText('CAT-001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /新規登録/ })).not.toBeInTheDocument();
  });
});
