import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
