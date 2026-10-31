// d600: 「再試行」が本当に取り直すかを見る試験（一覧フックの再取得と、共通カードへの配線）。
// 表示が消えることだけでは、無関係な再描画で通ってしまうため、要求が飛んだかを数える。
import { screen, waitFor, within } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

const getCalls: string[] = [];

vi.mock('@/lib/api-client', () => {
  const mockGet = vi.fn(async (url: string) => {
    getCalls.push(url);
    throw new Error('offline');
  });
  return {
    default: { get: mockGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { render } from '../_helpers/render-page';
import { useListPage } from '@/hooks/use-list-page';
import { DataTableCard } from '@/components/shared/data-table-card';
import type { ColumnDef } from '@/components/shared/data-table';

interface Item {
  id: number;
  name: string;
}

const columns: ColumnDef<Item>[] = [{ key: 'name', label: '名前' }];

const originalError = console.error;
beforeAll(() => {
  // 失敗を見せる試験なので、失敗由来の既定の雑音は落とす。
  console.error = () => {};
});
afterAll(() => {
  console.error = originalError;
});

describe('一覧の取得失敗からの再試行 (d600)', () => {
  it('同じ引数でもフックの retryLoad は取り直す', async () => {
    const { result } = renderHook(() =>
      useListPage({ tableId: 'products', basePath: '/products', entityName: '商品' }),
    );
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const before = getCalls.length;

    await act(async () => {
      result.current.retryLoad();
    });

    await waitFor(() => {
      expect(getCalls.length).toBe(before + 1);
    });
  });

  it('再試行を押すと一覧を取り直す（1 ページ目の失敗でも要求が飛ぶ）', async () => {
    const user = userEvent.setup();
    function Harness() {
      const { items, meta, loading, initialized, loadError, pagination, retryLoad } =
        useListPage<Item>({ tableId: 'products', basePath: '/products', entityName: '商品' });
      // 同じ引数でも取り直せることが要点なので、再取得が外部依存で止まらないよう、
      // 「押した時に誰が何をするか」は渡した値で見る（ページを渡し直す経路ではない）。
      return (
        <DataTableCard<Item>
          data={items}
          columns={columns}
          initialized={initialized}
          loading={loading}
          loadError={loadError}
          onRetry={retryLoad}
          meta={meta}
          onPageChange={pagination.setPage}
          getRowKey={(item) => item.id}
        />
      );
    }
    render(<Harness />);

    const box = await screen.findByRole('alert');
    await waitFor(() => {
      expect(within(box).getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });
    const before = getCalls.length;

    await user.click(within(box).getByRole('button', { name: '再試行' }));

    await waitFor(() => {
      expect(getCalls.length).toBe(before + 1);
    });
  });
});
