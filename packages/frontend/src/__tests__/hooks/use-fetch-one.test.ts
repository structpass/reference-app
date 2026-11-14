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

  // d1039: 読み込みが成功している時に reload を呼んでも retrying は立たない。
  // 立つと、失敗の表示を「loadError または retrying」で出すページが、成功しているのに
  // 失敗の表示へ切り替わってしまう。
  it('読み込みが成功している時の reload では retrying が立たないこと', async () => {
    const fetchOne = vi
      .fn()
      .mockResolvedValueOnce({ id: 1, name: 'item1' })
      .mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderHook(() => useFetchOne(fetchOne, '1'));

    await waitFor(() => expect(result.current.item).toEqual({ id: 1, name: 'item1' }));
    expect(result.current.loadError).toBe(false);

    act(() => {
      result.current.reload();
    });

    await new Promise((r) => setTimeout(r, 50));
    // 成功していたので、失敗の表示へ切り替わる根拠（retrying）は立たない。
    expect(result.current.retrying).toBe(false);
    expect(result.current.loadError).toBe(false);
  });

  // d1039: 失敗の表示から再試行した時、その場で処理中を示す印（retrying）が立つこと。
  // これが立たないと、呼び元の `if (loading) return <ローダー>` が先に効いて失敗の表示が
  // 消え、押した位置から画面が入れ替わる（押せたのか・読み直しているのか分からない）。
  it('失敗の表示からの再試行では retrying が立ち、終わると降りること', async () => {
    let resolveSecond: (v: { id: number }) => void = () => {};
    const fetchOne = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementationOnce(
        () =>
          new Promise<{ id: number }>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const { result } = renderHook(() => useFetchOne(fetchOne, '1'));

    await waitFor(() => expect(result.current.loadError).toBe(true));
    // 失敗の表示が出ている間は、処理中の印は立っていない。
    expect(result.current.retrying).toBe(false);

    act(() => {
      result.current.reload();
    });

    // 読み直している最中は立っている（ここでローダーへ戻さない）。
    await waitFor(() => expect(result.current.retrying).toBe(true));

    await act(async () => {
      resolveSecond({ id: 1 });
    });
    await waitFor(() => expect(result.current.retrying).toBe(false));
    expect(result.current.item).toEqual({ id: 1 });
  });

  // 初回の読み込みでは retrying を立てない（まだ失敗の表示が出ていないので、ローダーのまま）。
  it('初回の読み込みでは retrying が立たないこと', async () => {
    let resolveFirst: (v: { id: number }) => void = () => {};
    const fetchOne = vi.fn().mockImplementationOnce(
      () =>
        new Promise<{ id: number }>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { result } = renderHook(() => useFetchOne(fetchOne, '1'));

    expect(result.current.retrying).toBe(false);
    await act(async () => {
      resolveFirst({ id: 1 });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.retrying).toBe(false);
  });

  // d1039 の独立の目の指摘: fetchOne が同期的に throw すると、素直な呼び方では例外が effect の
  // 外へ抜けて finally が走らず、処理中の印が立ったまま残る（画面が「読み込み直しています…」で
  // 固まる）。同期の失敗も拾って、失敗の表示へ戻ること。
  it('取得が同期的に throw しても、処理中の印が残らず失敗として扱うこと', async () => {
    let syncThrow = false;
    const fetchOne = vi.fn().mockImplementation(() => {
      if (syncThrow) throw new Error('sync boom');
      return Promise.reject(new Error('first fails'));
    });
    const { result } = renderHook(() => useFetchOne(fetchOne, '1'));

    await waitFor(() => expect(result.current.loadError).toBe(true));

    syncThrow = true;
    act(() => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.retrying).toBe(false));
    expect(result.current.loading).toBe(false);
    expect(result.current.loadError).toBe(true);
  });

  // d1039 の再判定の指摘: 再試行の最中に id が変わると、前の回の finally は cleanup で
  // active=false になり印を外さない。新しい id の取得が終わらない間、印が立ったまま残ると、
  // 「loadError または retrying」で失敗の表示を出すページが disabled のまま固まる。
  it('再試行の最中に id が変わったら、処理中の印を引きずらないこと', async () => {
    // 1 回目（id=1）は失敗、2 回目（再試行）と 3 回目（id=2）は決して終わらない。
    const fetchOne = vi.fn().mockImplementation(() => new Promise(() => {}));
    fetchOne.mockRejectedValueOnce(new Error('fail 1'));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useFetchOne(fetchOne, id), {
      initialProps: { id: '1' },
    });

    await waitFor(() => expect(result.current.loadError).toBe(true));

    act(() => {
      result.current.reload();
    });
    await waitFor(() => expect(result.current.retrying).toBe(true));

    // 再試行の最中に別の品目へ移る（新しい取得は終わらない）。
    rerender({ id: '2' });

    await waitFor(() => expect(result.current.retrying).toBe(false));
    // 新しい品目はまだ取り終えていない（失敗として扱わない）。
    expect(result.current.loadError).toBe(false);
    expect(fetchOne).toHaveBeenCalledWith('2');
  });
});
