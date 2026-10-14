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
});
