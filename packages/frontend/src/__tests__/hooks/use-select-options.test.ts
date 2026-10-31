import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSelectOptions } from '@/hooks/use-select-options';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

describe('useSelectOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('APIからオプションを取得すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [
          { id: 1, name: '倉庫A' },
          { id: 2, name: '倉庫B' },
        ],
      },
    });

    const mapFn = (item: { id: number; name: string }) => ({
      value: String(item.id),
      label: item.name,
    });

    const { result } = renderHook(() => useSelectOptions('/warehouses', mapFn));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.options).toEqual([
      { value: '1', label: '倉庫A' },
      { value: '2', label: '倉庫B' },
    ]);
  });

  it('エラー時に空配列を返すこと', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    const mapFn = (item: { id: number }) => ({
      value: String(item.id),
      label: '',
    });

    const { result } = renderHook(() => useSelectOptions('/warehouses', mapFn));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.options).toEqual([]);
  });
});
