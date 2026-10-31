import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DEFAULT_PAGE_SIZE, usePagination } from '@/hooks/use-pagination';

describe('usePagination', () => {
  it('デフォルト値で初期化されること', () => {
    const { result } = renderHook(() => usePagination());
    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(DEFAULT_PAGE_SIZE);
    expect(result.current.sort).toBe('createdAt');
    expect(result.current.order).toBe('desc');
  });

  it('カスタム初期値（page/limit/sort/order）で初期化されること', () => {
    const { result } = renderHook(() =>
      usePagination({ page: 3, limit: 50, sort: 'name', order: 'asc' }),
    );
    expect(result.current.page).toBe(3);
    expect(result.current.limit).toBe(50);
    expect(result.current.sort).toBe('name');
    expect(result.current.order).toBe('asc');
  });

  it('setPage でページを変更できること', () => {
    const { result } = renderHook(() => usePagination());

    act(() => {
      result.current.setPage(5);
    });

    expect(result.current.page).toBe(5);
  });

  it('setSort で同じカラムをソートすると順序が反転し page が 1 にリセットされること', () => {
    const { result } = renderHook(() => usePagination({ sort: 'name', order: 'asc' }));

    act(() => {
      result.current.setPage(3);
    });
    act(() => {
      result.current.setSort('name');
    });

    expect(result.current.sort).toBe('name');
    expect(result.current.order).toBe('desc');
    expect(result.current.page).toBe(1);
  });

  it('setSort で同じカラムを連続トグルすると asc/desc を往復すること', () => {
    const { result } = renderHook(() => usePagination());

    act(() => result.current.setSort('createdAt'));
    expect(result.current.order).toBe('asc');

    act(() => result.current.setSort('createdAt'));
    expect(result.current.order).toBe('desc');
  });

  it('setSort で異なるカラムをソートすると asc になり page が 1 にリセットされること', () => {
    const { result } = renderHook(() => usePagination({ sort: 'name', order: 'desc' }));

    act(() => {
      result.current.setPage(3);
    });
    act(() => {
      result.current.setSort('code');
    });

    expect(result.current.sort).toBe('code');
    expect(result.current.order).toBe('asc');
    expect(result.current.page).toBe(1);
  });

  it('resetPage でページを 1 にリセットすること', () => {
    const { result } = renderHook(() => usePagination());

    act(() => {
      result.current.setPage(10);
    });
    expect(result.current.page).toBe(10);

    act(() => {
      result.current.resetPage();
    });
    expect(result.current.page).toBe(1);
  });
});
