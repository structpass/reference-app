import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTableCard } from '@/components/shared/data-table-card';
import type { ColumnDef } from '@/components/shared/data-table';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

interface Item {
  id: number;
  name: string;
}

const columns: ColumnDef<Item>[] = [{ key: 'name', label: '名前', sortable: true }];

describe('DataTableCard', () => {
  it('対象名と絞り込み状態を表へ渡し、条件を解除すると通常の空案内へ戻ること', () => {
    const props = {
      data: [] as Item[],
      columns,
      initialized: true,
      loading: false,
      meta: null,
      onPageChange: vi.fn(),
      getRowKey: (item: Item) => item.id,
      emptySubject: '商品',
    };
    const { rerender } = render(<DataTableCard {...props} filtered />);
    expect(screen.getByRole('status')).toHaveTextContent('条件に合う商品がありませんでした');
    rerender(<DataTableCard {...props} filtered={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('商品が見つかりませんでした');
    rerender(<DataTableCard {...props} filtered emptyMessage="専用の案内" />);
    expect(screen.getByRole('status')).toHaveTextContent('専用の案内');
  });

  it('initialized=false の時はスピナーを表示しテーブルを描画しないこと', () => {
    render(
      <DataTableCard<Item>
        data={[]}
        columns={columns}
        initialized={false}
        loading={false}
        meta={null}
        onPageChange={vi.fn()}
        getRowKey={(item) => item.id}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('initialized=true でデータを表示すること', () => {
    render(
      <DataTableCard<Item>
        data={[{ id: 1, name: 'りんご' }]}
        columns={columns}
        initialized={true}
        loading={false}
        meta={null}
        onPageChange={vi.fn()}
        getRowKey={(item) => item.id}
      />,
    );
    expect(screen.getByText('りんご')).toBeInTheDocument();
  });

  it('meta が null の場合は Pagination を描画しないこと', () => {
    render(
      <DataTableCard<Item>
        data={[{ id: 1, name: 'りんご' }]}
        columns={columns}
        initialized={true}
        loading={false}
        meta={null}
        onPageChange={vi.fn()}
        getRowKey={(item) => item.id}
      />,
    );
    expect(screen.queryByText(/全 \d+ 件/)).toBeNull();
  });

  it('meta があれば Pagination 帯を描画すること', () => {
    render(
      <DataTableCard<Item>
        data={[{ id: 1, name: 'りんご' }]}
        columns={columns}
        initialized={true}
        loading={false}
        meta={{ page: 1, limit: 10, total: 1, totalPages: 1 }}
        onPageChange={vi.fn()}
        getRowKey={(item) => item.id}
      />,
    );
    expect(screen.getByText(/全 1 件/)).toBeInTheDocument();
  });

  it('sp-line-warm 枠と sp-card 背景でラップされていること', () => {
    const { container } = render(
      <DataTableCard<Item>
        data={[]}
        columns={columns}
        initialized={false}
        loading={false}
        meta={null}
        onPageChange={vi.fn()}
        getRowKey={(item) => item.id}
      />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/border-\[var\(--sp-line-warm\)\]/);
    expect(card.className).toMatch(/bg-\[var\(--sp-card\)\]/);
  });

  // d600: 取得に失敗した時に「データがありません」を出すと、障害なのか本当に 0 件なのかが
  // 分からない。失敗は失敗として出し、再試行の導線を添える。
  describe('loadError', () => {
    it('失敗している間は空一覧の文言ではなく失敗の表示を出すこと', () => {
      render(
        <DataTableCard<Item>
          data={[]}
          columns={columns}
          initialized={true}
          loading={false}
          loadError={true}
          meta={null}
          onPageChange={vi.fn()}
          getRowKey={(item) => item.id}
          emptyMessage="商品が見つかりませんでした"
        />,
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('一覧の取得に失敗しました。')).toBeInTheDocument();
      expect(screen.queryByText('商品が見つかりませんでした')).toBeNull();
    });

    it('再試行を押すと onRetry を呼ぶこと', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      render(
        <DataTableCard<Item>
          data={[]}
          columns={columns}
          initialized={true}
          loading={false}
          loadError={true}
          onRetry={onRetry}
          meta={null}
          onPageChange={vi.fn()}
          getRowKey={(item) => item.id}
        />,
      );
      await user.click(screen.getByRole('button', { name: '再試行' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('onRetry が無ければ現在のページを渡して取り直すこと', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      render(
        <DataTableCard<Item>
          data={[]}
          columns={columns}
          initialized={true}
          loading={false}
          loadError={true}
          meta={{ page: 3, limit: 10, total: 0, totalPages: 0 }}
          onPageChange={onPageChange}
          getRowKey={(item) => item.id}
        />,
      );
      await user.click(screen.getByRole('button', { name: '再試行' }));
      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('失敗していなければ通常の一覧を出すこと', () => {
      render(
        <DataTableCard<Item>
          data={[{ id: 1, name: 'りんご' }]}
          columns={columns}
          initialized={true}
          loading={false}
          loadError={false}
          meta={null}
          onPageChange={vi.fn()}
          getRowKey={(item) => item.id}
        />,
      );
      expect(screen.getByText('りんご')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('取得前（initialized=false）は失敗の表示よりスピナーを優先すること', () => {
      render(
        <DataTableCard<Item>
          data={[]}
          columns={columns}
          initialized={false}
          loading={true}
          loadError={true}
          meta={null}
          onPageChange={vi.fn()}
          getRowKey={(item) => item.id}
        />,
      );
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('striped が既定で false（sp-paper-2 背景が当たらない）こと', () => {
    render(
      <DataTableCard<Item>
        data={[{ id: 1, name: 'りんご' }]}
        columns={columns}
        initialized={true}
        loading={false}
        meta={null}
        onPageChange={vi.fn()}
        getRowKey={(item) => item.id}
      />,
    );
    // pilot 仕様化により striped default は false。sp-paper-2 背景は付かない
    const headers = document.querySelectorAll('.bg-\\[var\\(--sp-paper-2\\)\\]');
    expect(headers.length).toBe(0);
  });
});
