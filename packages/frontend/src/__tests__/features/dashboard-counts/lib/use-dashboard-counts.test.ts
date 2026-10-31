import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardCounts } from '@/features/dashboard-counts/lib/use-dashboard-counts';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

describe('useDashboardCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('取得成功時にcountsへ反映されること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: {
          counts: [
            { featureId: 'products', count: 3 },
            { featureId: 'warehouses', count: 0 },
          ],
        },
      },
    });

    const { result } = renderHook(() => useDashboardCounts());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.counts).toEqual([
      { featureId: 'products', count: 3 },
      { featureId: 'warehouses', count: 0 },
    ]);
  });

  it('取得失敗時にerrorが設定されloadingがfalseになること', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDashboardCounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('件数の取得に失敗しました');
    expect(result.current.counts).toEqual([]);
  });
});
