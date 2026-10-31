import { renderHook, act, waitFor } from '@testing-library/react';
import { useListPage } from '@/hooks/use-list-page';

vi.mock('@/lib/api-client', () => {
  const mockGet = vi.fn();
  const mockDelete = vi.fn();
  return {
    default: {
      get: mockGet,
      post: vi.fn(),
      put: vi.fn(),
      delete: mockDelete,
    },
  };
});

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

describe('useListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 1, name: 'テスト' }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });
  });

  it('初回レンダリングでデータをフェッチすること', async () => {
    const { result } = renderHook(() =>
      useListPage({ tableId: 'products', basePath: '/products', entityName: '商品' }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/products',
      expect.objectContaining({
        params: expect.objectContaining({ page: 1, limit: 50 }),
      }),
    );
    expect(result.current.items).toHaveLength(1);
  });

  it('handleFilterChangeでフィルタを設定しページをリセットすること', async () => {
    const { result } = renderHook(() =>
      useListPage({ tableId: 'products', basePath: '/products', entityName: '商品' }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.handleFilterChange({ search: 'テスト' });
    });

    await waitFor(() => {
      expect(result.current.filters).toEqual({ search: 'テスト' });
    });

    expect(result.current.pagination.page).toBe(1);
  });

  it('initialSortでソートの初期値を設定できること', async () => {
    const { result } = renderHook(() =>
      useListPage({
        tableId: 'products',
        basePath: '/products',
        entityName: '商品',
        initialSort: { sort: 'name', order: 'asc' },
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.pagination.sort).toBe('name');
    expect(result.current.pagination.order).toBe('asc');
  });

  // d789: 0 件の案内を「まだ何も無い」と「条件に合う物が無い」で言い分けるために、
  // 絞り込みが入っているかを画面へ渡す。未選択の undefined を絞り込みと数えない。
  it('絞り込みが無いうちは hasActiveFilters が false であること', async () => {
    const { result } = renderHook(() =>
      useListPage({ tableId: 'products', basePath: '/products', entityName: '商品' }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasActiveFilters).toBe(false);

    act(() => {
      result.current.handleFilterChange({ search: undefined, categoryId: '' });
    });

    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('絞り込みが入ると hasActiveFilters が true になり、クリアで false に戻ること', async () => {
    const { result } = renderHook(() =>
      useListPage({ tableId: 'products', basePath: '/products', entityName: '商品' }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.handleFilterChange({ search: 'りんご' });
    });

    expect(result.current.hasActiveFilters).toBe(true);

    act(() => {
      result.current.handleFilterChange({});
    });

    expect(result.current.hasActiveFilters).toBe(false);
  });

  // d898: 取得中に条件を変えた時、遅れて届いた前の条件の応答で今の表示を上書きしない。
  // 見るのは標準の一覧の経路（差し替えた取得の経路は d832 の試験が受け持つ）。
  it('標準の一覧で、遅れて届いた前の条件の応答を捨てること', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const listResponse = (name: string) => ({
      data: { success: true, data: [{ id: 1, name }], meta: null },
    });
    vi.mocked(apiClient.get)
      .mockImplementationOnce(async () => {
        await firstGate;
        return listResponse('古い');
      })
      .mockImplementation(async () => listResponse('新しい'));

    const { result } = renderHook(() =>
      useListPage<{ id: number; name: string }>({
        tableId: 'products',
        basePath: '/products',
        entityName: '商品',
      }),
    );

    // 1 回目の取得を止めたまま、頁送りで 2 回目の取得を始め、それを先に終わらせる
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      result.current.pagination.setLimit(10);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.items.map((item) => item.name)).toEqual(['新しい']);

    // 止めていた古い取得を遅れて解放する。古い行に戻らないこと
    await act(async () => {
      releaseFirst();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(result.current.items.map((item) => item.name)).toEqual(['新しい']);
    expect(result.current.loading).toBe(false);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});
