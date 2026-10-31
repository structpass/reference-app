import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/features/imports/lib/api', () => ({
  runImport: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { runImport } from '@/features/imports/lib/api';
import toast from 'react-hot-toast';
import { useImport } from '@/features/imports/hooks/use-import';

function makeFile(): File {
  return new File(['x'], 'products.csv', { type: 'text/csv' });
}

describe('useImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初期状態は feedback null / running false', () => {
    const { result } = renderHook(() => useImport());
    expect(result.current.feedback).toBeNull();
    expect(result.current.running).toBe(false);
  });

  it('成功時に feedback を success として設定すること', async () => {
    vi.mocked(runImport).mockResolvedValue({
      ok: true,
      result: { target: 'products', dryRun: true, created: 4, updated: 2 },
    });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.execute('products', makeFile(), true);
    });

    expect(result.current.feedback).toEqual({
      kind: 'success',
      result: { target: 'products', dryRun: true, created: 4, updated: 2 },
    });
    expect(result.current.running).toBe(false);
  });

  it('検証エラー時に feedback を validation として設定すること', async () => {
    vi.mocked(runImport).mockResolvedValue({
      ok: false,
      validation: { message: '検証失敗', rows: [{ row: 1, column: '価格', message: 'NG' }] },
    });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.execute('products', makeFile(), false);
    });

    expect(result.current.feedback).toEqual({
      kind: 'validation',
      error: { message: '検証失敗', rows: [{ row: 1, column: '価格', message: 'NG' }] },
    });
  });

  it('想定外例外時は toast.error を出し feedback は null のままにすること', async () => {
    vi.mocked(runImport).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.execute('products', makeFile(), false);
    });

    expect(result.current.feedback).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('取込処理に失敗しました');
  });

  it('reset で feedback をクリアすること', async () => {
    vi.mocked(runImport).mockResolvedValue({
      ok: true,
      result: { target: 'products', dryRun: false, created: 1, updated: 0 },
    });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.execute('products', makeFile(), false);
    });
    expect(result.current.feedback).not.toBeNull();

    act(() => {
      result.current.reset();
    });
    expect(result.current.feedback).toBeNull();
  });
});
