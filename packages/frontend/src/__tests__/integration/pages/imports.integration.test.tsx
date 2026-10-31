import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor } from '../_helpers/render-page';
import userEvent from '@testing-library/user-event';
import { server } from '../../mocks/server';
import {
  importsSuccessHandler,
  importsValidationErrorHandler,
} from '../../mocks/handlers/imports.handlers';
import { viewOnlyPermissionsHandler } from '../../mocks/handlers/permissions.handlers';
import ImportsPage from '@/app/dashboard/imports/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// useFileDownload は blob を `URL.createObjectURL` 経由で DOM に流すが、jsdom には未実装。
// テンプレート/エラー CSV ダウンロード導線をクリックしても落ちないよう stub する。
beforeAll(() => {
  Object.defineProperty(window.URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:mock'),
    writable: true,
  });
  Object.defineProperty(window.URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
});
afterAll(() => {
  vi.restoreAllMocks();
});

/** CSV ファイルを選択した状態を作るヘルパ。 */
async function selectCsvFile(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByLabelText('CSV ファイル') as HTMLInputElement;
  const file = new File(['code,name,price\nP-1,商品,100\n'], 'products.csv', { type: 'text/csv' });
  await user.upload(input, file);
  return file;
}

describe('ImportsPage (integration)', () => {
  it('取込対象セレクタとテンプレートダウンロードボタンを描画する', async () => {
    render(<ImportsPage />);

    await waitFor(() => {
      expect(screen.getByText('ファイル取込')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('取込対象')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /テンプレート CSV をダウンロード/ }),
    ).toBeInTheDocument();
  });

  it('ファイル未選択時は検証/取込ボタンが disabled', async () => {
    render(<ImportsPage />);

    await waitFor(() => {
      expect(screen.getByText('ファイル取込')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /検証のみ/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /取込実行/ })).toBeDisabled();
  });

  it('ファイルを選択するとファイル名がプレビュー表示され、ボタンが有効になる', async () => {
    const user = userEvent.setup();
    render(<ImportsPage />);

    await waitFor(() => {
      expect(screen.getByText('ファイル取込')).toBeInTheDocument();
    });

    await selectCsvFile(user);

    expect(screen.getByText('products.csv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /検証のみ/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /取込実行/ })).toBeEnabled();
  });

  it('検証のみ（ドライラン）で成功結果パネルが表示される', async () => {
    server.use(importsSuccessHandler({ created: 5, updated: 2 }));
    const user = userEvent.setup();
    render(<ImportsPage />);

    await waitFor(() => {
      expect(screen.getByText('ファイル取込')).toBeInTheDocument();
    });

    await selectCsvFile(user);
    await user.click(screen.getByRole('button', { name: /検証のみ/ }));

    await waitFor(() => {
      expect(
        screen.getByText('検証が完了しました（取込は実行されていません）'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/新規 5 件 \/ 更新 2 件/)).toBeInTheDocument();
  });

  it('取込実行で成功結果パネルが表示される', async () => {
    server.use(importsSuccessHandler({ created: 3, updated: 0 }));
    const user = userEvent.setup();
    render(<ImportsPage />);

    await waitFor(() => {
      expect(screen.getByText('ファイル取込')).toBeInTheDocument();
    });

    await selectCsvFile(user);
    await user.click(screen.getByRole('button', { name: /取込実行/ }));

    await waitFor(() => {
      expect(screen.getByText('取込が完了しました')).toBeInTheDocument();
    });
    expect(screen.getByText(/新規 3 件 \/ 更新 0 件/)).toBeInTheDocument();
  });

  it('行レベル検証エラー時はエラーテーブルとエラー CSV ダウンロード導線が表示される', async () => {
    server.use(
      importsValidationErrorHandler([
        { row: 2, column: 'price', message: '数値で入力してください' },
        { row: 3, column: 'code', message: '必須項目です' },
      ]),
    );
    const user = userEvent.setup();
    render(<ImportsPage />);

    await waitFor(() => {
      expect(screen.getByText('ファイル取込')).toBeInTheDocument();
    });

    await selectCsvFile(user);
    await user.click(screen.getByRole('button', { name: /検証のみ/ }));

    await waitFor(() => {
      expect(screen.getByText('検証に失敗しました（0 件取込）')).toBeInTheDocument();
    });
    expect(screen.getByText('数値で入力してください')).toBeInTheDocument();
    expect(screen.getByText('必須項目です')).toBeInTheDocument();
    expect(screen.getByText('エラー 2 件')).toBeInTheDocument();

    // エラー CSV ダウンロード（クリックしても createObjectURL stub で落ちない）
    const csvBtn = screen.getByRole('button', { name: /エラー CSV ダウンロード/ });
    expect(csvBtn).toBeInTheDocument();
    await user.click(csvBtn);
    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it('create 権限が無い場合は取込実行ボタンが描画されず、検証のみは利用できる', async () => {
    server.use(viewOnlyPermissionsHandler);
    const user = userEvent.setup();
    render(<ImportsPage />);

    await waitFor(() => {
      expect(screen.getByText('ファイル取込')).toBeInTheDocument();
    });

    await selectCsvFile(user);

    // 検証のみ（view 権限の範疇）は表示される
    expect(screen.getByRole('button', { name: /検証のみ/ })).toBeInTheDocument();
    // 取込実行（create gate）は PermissionGate で隠れる
    expect(screen.queryByRole('button', { name: /取込実行/ })).not.toBeInTheDocument();
  });
});
