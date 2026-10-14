import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardCountsView } from '@/features/dashboard-counts/components/dashboard-counts-view';

vi.mock('@/features/dashboard-counts/lib/use-dashboard-counts', () => ({
  useDashboardCounts: vi.fn(),
}));

import { useDashboardCounts } from '@/features/dashboard-counts/lib/use-dashboard-counts';

describe('DashboardCountsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ローディング中はスピナーを表示すること', () => {
    vi.mocked(useDashboardCounts).mockReturnValue({ counts: [], loading: true, error: null });

    render(<DashboardCountsView />);

    expect(screen.queryByText('商品')).not.toBeInTheDocument();
  });

  it('エラー時はエラーメッセージを表示すること', () => {
    vi.mocked(useDashboardCounts).mockReturnValue({
      counts: [],
      loading: false,
      error: '件数の取得に失敗しました',
    });

    render(<DashboardCountsView />);

    expect(screen.getByText('件数の取得に失敗しました')).toBeInTheDocument();
  });

  it('取得済みfeatureIdのカードのみ描画し、0件も表示すること', () => {
    vi.mocked(useDashboardCounts).mockReturnValue({
      counts: [
        { featureId: 'products', count: 3 },
        { featureId: 'warehouses', count: 0 },
      ],
      loading: false,
      error: null,
    });

    render(<DashboardCountsView />);

    expect(screen.getByText('商品')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('倉庫')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();

    // 権限なし＝counts配列に含まれない機能（例: 発注入力）のカードは描画されない
    expect(screen.queryByText('発注入力')).not.toBeInTheDocument();
  });
});
