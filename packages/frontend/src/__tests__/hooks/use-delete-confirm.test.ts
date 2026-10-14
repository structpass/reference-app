import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeleteConfirm } from '@/hooks/use-delete-confirm';

interface Item {
  id: number;
  name: string;
}

describe('useDeleteConfirm', () => {
  let mockRemove: ReturnType<typeof vi.fn>;
  let mockOnSuccess: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRemove = vi.fn();
    mockOnSuccess = vi.fn();
  });

  it('初期状態で deleteTarget が null であること', () => {
    const { result } = renderHook(() =>
      useDeleteConfirm<Item>({ remove: mockRemove, onSuccess: mockOnSuccess }),
    );

    expect(result.current.deleteTarget).toBeNull();
  });

  it('setDeleteTarget で対象を設定できること', () => {
    const { result } = renderHook(() =>
      useDeleteConfirm<Item>({ remove: mockRemove, onSuccess: mockOnSuccess }),
    );

    const item: Item = { id: 1, name: 'アイテム' };
    act(() => {
      result.current.setDeleteTarget(item);
    });

    expect(result.current.deleteTarget).toEqual(item);
  });

  it('deleteTarget が null の場合 handleDelete は何もしないこと', async () => {
    const { result } = renderHook(() =>
      useDeleteConfirm<Item>({ remove: mockRemove, onSuccess: mockOnSuccess }),
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('削除成功時に onSuccess が呼ばれ、ダイアログが閉じること', async () => {
    mockRemove.mockResolvedValue(true);
    const { result } = renderHook(() =>
      useDeleteConfirm<Item>({ remove: mockRemove, onSuccess: mockOnSuccess }),
    );

    act(() => {
      result.current.setDeleteTarget({ id: 1, name: 'アイテム' });
    });

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockRemove).toHaveBeenCalledWith(1);
    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    expect(mockOnSuccess).toHaveBeenCalledWith(1);
    expect(result.current.deleteTarget).toBeNull();
  });

  it('削除失敗時は onSuccess が呼ばれず、ダイアログは閉じること', async () => {
    mockRemove.mockResolvedValue(false);
    const { result } = renderHook(() =>
      useDeleteConfirm<Item>({ remove: mockRemove, onSuccess: mockOnSuccess }),
    );

    act(() => {
      result.current.setDeleteTarget({ id: 2, name: '別アイテム' });
    });

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockRemove).toHaveBeenCalledWith(2);
    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(result.current.deleteTarget).toBeNull();
  });

  it('onSuccess が未指定でも削除成功が正常に動作すること', async () => {
    mockRemove.mockResolvedValue(true);
    const { result } = renderHook(() => useDeleteConfirm<Item>({ remove: mockRemove }));

    act(() => {
      result.current.setDeleteTarget({ id: 3, name: 'アイテム3' });
    });

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockRemove).toHaveBeenCalledWith(3);
    expect(result.current.deleteTarget).toBeNull();
  });
});
