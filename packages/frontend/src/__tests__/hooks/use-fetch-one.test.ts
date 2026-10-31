import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFetchOne } from '@/hooks/use-fetch-one';

describe('useFetchOne', () => {
  it('取得できた時は品目を持ち、失敗の状態は立たないこと', async () => {
    const fetchOne = vi.fn().mockResolvedValue({ id: 1, name: 'item1' });
    const { result } = renderHook(() => useFetchOne(fetchOne, '1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.item).toEqual({ id: 1, name: 'item1' });
    expect(result.current.loadError).toBe(false);
  });

  // d600: 読み取りに失敗すると item は null になる。この状態を「見つからない」と同じに
  // 扱っていたため、障害なのか未登録なのかが画面で分からなかった。
  it('読み取り失敗で loadError が立つこと', async () => {
    const fetchOne = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useFetchOne(fetchOne, '1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.item).toBeNull();
    expect(result.current.loadError).toBe(true);
  });

  it('再試行で取り直し、成功すれば loadError が戻ること', async () => {
    const fetchOne = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ id: 1, name: 'item1' });
    const { result } = renderHook(() => useFetchOne(fetchOne, '1'));

    await waitFor(() => expect(result.current.loadError).toBe(true));

    act(() => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.item).toEqual({ id: 1, name: 'item1' }));
    expect(result.current.loadError).toBe(false);
    expect(fetchOne).toHaveBeenCalledTimes(2);
  });
});
