import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * d1039: 詳細（[id]/view）と編集（[id]）の画面で、失敗の表示から再試行した時に
 * 「読み込み直しています…」が出ること。
 *
 * useFetchOne が返す retrying を、各ページが
 *   ① ローダーの条件（loading && !retrying）に使い
 *   ② LoadFailed の busy に渡す
 * ことをページ単位で縛る。hook の試験（use-fetch-one.test.ts）だけでは、ページ側が
 * busy={loading} へ戻っても気づけない（実際にそうなっていて d1039 が起きた）。
 */

const { pushMock, replaceMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useParams: () => ({ id: '1' }),
}));

const { fetchProductMock } = vi.hoisted(() => ({ fetchProductMock: vi.fn() }));

vi.mock('@/features/products', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/features/products');
  return {
    ...actual,
    // fetchProduct は本物と同じく同じ関数を返し続ける（毎回新しい関数を返すと、
    // useFetchOne の effect が再実行されて、再試行の状態が観測できなくなる）。
    useProducts: () => ({
      fetchProduct: fetchProductMock,
      updateProduct: vi.fn().mockResolvedValue(true),
    }),
  };
});

vi.mock('@/components/shared/feature-guard', () => ({
  FeatureGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import ViewProductPage from '@/app/dashboard/products/[id]/view/page';

describe('詳細画面の再試行中の表示 (d1039)', () => {
  beforeEach(() => {
    fetchProductMock.mockReset();
  });

  it('失敗の表示から再試行を押すと、その場で「読み込み直しています…」が出る', async () => {
    let resolveRetry: (v: unknown) => void = () => {};
    fetchProductMock.mockRejectedValueOnce(new Error('boom')).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRetry = resolve;
        }),
    );

    render(<ViewProductPage />);

    // まず失敗の表示が出る（再試行ボタンが在る）。
    const retry = await screen.findByRole('button', { name: '再試行' });
    // この時点では処理中の文言は出ていない。
    expect(screen.queryByText('読み込み直しています…')).not.toBeInTheDocument();

    // 失敗の表示が出ている間は、処理中ではない（busy は偽）。
    // busy に loading を渡していると、ここは loading=false なので同じく偽になるが、
    // 再試行中は loading=true になり、以降の判定が busy={loading} でも通ってしまう。
    // そこで「失敗の表示の間は稼働（aria-busy=false）」「再試行中だけ稼働」の対で縛る。
    expect(screen.getByRole('alert')).toHaveAttribute('aria-busy', 'false');
    expect(retry).not.toBeDisabled();

    await userEvent.click(retry);

    // 再試行の間は、失敗の表示がその場に残ったまま処理中を示す。
    // （ここが d1039 の要: ローダーへ入れ替わって失敗の表示ごと消えない）
    expect(await screen.findByText('読み込み直しています…')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '再試行' })).toBeDisabled();

    resolveRetry({ id: 1, code: 'P1', name: '商品', status: 'ACTIVE', price: 100 });
    await waitFor(() =>
      expect(screen.queryByText('読み込み直しています…')).not.toBeInTheDocument(),
    );

    // 再試行が終わった後は、失敗の表示ではなく中身が出ている（busy は立っていない）。
    expect(await screen.findByDisplayValue('商品')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
  });

  // busy に loading を渡しても、再試行中は loading が true なので見た目は同じになってしまう。
  // 違いが出るのは「再試行がもう一度失敗して、失敗の表示に戻った後」。loading は false に戻るが、
  // busy={loading} だと aria-busy が false でも「再試行中」の文言が残るかどうかが実装次第になる。
  // ここでは、失敗の表示に戻ったら処理中の表示が消えていることを縛る。
  it('再試行がまた失敗したら、失敗の表示に戻り処理中の表示は消える', async () => {
    fetchProductMock
      .mockRejectedValueOnce(new Error('boom1'))
      .mockRejectedValueOnce(new Error('boom2'));

    render(<ViewProductPage />);

    const retry = await screen.findByRole('button', { name: '再試行' });
    await userEvent.click(retry);

    // 失敗が返った後は、処理中の表示が消えて再試行できる状態に戻る。
    await waitFor(() =>
      expect(screen.queryByText('読み込み直しています…')).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('button', { name: '再試行' })).not.toBeDisabled();
    expect(screen.getByRole('alert')).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByText('記載の情報を読み込めませんでした。')).toBeInTheDocument();
  });

  it('初回の読み込みではローダーを出し、失敗の表示は出さない', async () => {
    fetchProductMock.mockImplementationOnce(() => new Promise(() => {}));
    const { container } = render(<ViewProductPage />);

    // ローダーだけが出ていて、失敗の表示（再試行ボタン）は無い。
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
    expect(screen.queryByText('読み込み直しています…')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('記載の情報を読み込めませんでした。');
  });
});
