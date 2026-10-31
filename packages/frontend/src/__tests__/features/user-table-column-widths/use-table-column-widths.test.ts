import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import apiClient from '@/lib/api-client';
import toast from 'react-hot-toast';
import {
  useTableColumnWidths,
  resetColumnWidthsStore,
  __setColumnWidthsForTest,
} from '@/features/user-table-column-widths/hooks/use-table-column-widths';

const TABLE_ID = 'products' as const;

describe('useTableColumnWidths', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.put).mockReset();
    vi.mocked(toast.error).mockReset();
    resetColumnWidthsStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初期 mount で revalidate が走り、widths が取得されること', async () => {
    vi.useRealTimers();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [
          { tableId: TABLE_ID, columnKey: 'name', width: 240, updatedAt: 'x' },
          { tableId: TABLE_ID, columnKey: 'code', width: 120, updatedAt: 'x' },
        ],
      },
    });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });

    expect(result.current.widths).toEqual({ name: 240, code: 120 });
    expect(apiClient.get).toHaveBeenCalledWith('/user-table-column-widths/products');
  });

  it('setWidth は store を即時更新する（楽観更新）', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { data: { width: 300 } } });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setWidth('name', 300);
    });

    expect(result.current.widths.name).toBe(300);
  });

  it('setWidth の連続呼び出しは 300ms debounce で 1 回だけ PUT される', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { data: { width: 300 } } });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setWidth('name', 200);
      result.current.setWidth('name', 250);
      result.current.setWidth('name', 300);
    });

    expect(apiClient.put).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect(apiClient.put).toHaveBeenCalledWith('/user-table-column-widths/products/name', {
      width: 300,
    });
  });

  it('PUT 失敗時は toast.error を呼んで revalidate でロールバック', async () => {
    vi.useRealTimers();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: [{ tableId: TABLE_ID, columnKey: 'name', width: 100, updatedAt: 'x' }] },
    });
    vi.mocked(apiClient.put).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });

    act(() => {
      result.current.setWidth('name', 999);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    // ロールバック後、name は元の 100 に戻る
    await waitFor(() => {
      expect(result.current.widths.name).toBe(100);
    });
  });

  it('別 columnKey の setWidth は独立した debounce timer を持つ', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { data: { width: 0 } } });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setWidth('name', 200);
      result.current.setWidth('code', 150);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(apiClient.put).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(apiClient.put).mock.calls;
    const urls = calls.map((c) => c[0]).sort();
    expect(urls).toEqual([
      '/user-table-column-widths/products/code',
      '/user-table-column-widths/products/name',
    ]);
  });

  it('resetColumnWidthsStore で全 state が初期化される', async () => {
    __setColumnWidthsForTest(TABLE_ID, { name: 200 });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.widths.name).toBe(200);

    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    act(() => {
      resetColumnWidthsStore();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.widths).toEqual({});
  });

  it('小数の width は store 即時更新時に整数へ丸められる（PointerEvent.clientX 対策）', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { data: { width: 124 } } });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setWidth('code', 123.7);
    });

    expect(result.current.widths.code).toBe(124);
  });

  it('小数の width は debounced PUT でも整数で送信される', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { data: { width: 200 } } });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setWidth('code', 200.4);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect(apiClient.put).toHaveBeenCalledWith('/user-table-column-widths/products/code', {
      width: 200,
    });
  });

  it('特殊文字を含む columnKey は URL エンコードされる', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { data: { width: 0 } } });

    const { result } = renderHook(() => useTableColumnWidths(TABLE_ID));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setWidth('order/date', 200);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const urls = vi.mocked(apiClient.put).mock.calls.map((c) => c[0]);
    expect(urls[0]).toBe('/user-table-column-widths/products/order%2Fdate');
  });
});
