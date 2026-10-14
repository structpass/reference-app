import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type ColumnDef } from '@/components/shared/data-table';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

interface TestItem {
  id: number;
  name: string;
  status: string;
}

const columns: ColumnDef<TestItem>[] = [
  { key: 'name', label: '名前', sortable: true },
  { key: 'status', label: 'ステータス', sortable: true },
];

const testData: TestItem[] = [
  { id: 1, name: '商品A', status: 'ACTIVE' },
  { id: 2, name: '商品B', status: 'INACTIVE' },
];

describe('DataTable - インタラクション', () => {
  it('rowHrefを指定した場合にクリックでrouter.pushを呼ぶこと', async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        data={testData}
        columns={columns}
        getRowKey={(item) => item.id}
        rowHref={(item) => `/products/${item.id}`}
      />,
    );

    await user.click(screen.getByText('商品A'));
    expect(mockPush).toHaveBeenCalledWith('/products/1');
  });

  it('onRowClickを指定した場合にクリックでコールバックを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable
        data={testData}
        columns={columns}
        getRowKey={(item) => item.id}
        onRowClick={onRowClick}
      />,
    );

    await user.click(screen.getByText('商品A'));
    expect(onRowClick).toHaveBeenCalledWith(testData[0]);
  });

  it('sortConfigにascを設定した場合にArrowUpアイコンを表示すること', () => {
    const onSort = vi.fn();
    render(
      <DataTable
        data={testData}
        columns={columns}
        getRowKey={(item) => item.id}
        onSort={onSort}
        sortConfig={{ sort: 'name', order: 'asc' }}
      />,
    );

    expect(screen.getByText('名前')).toBeInTheDocument();
  });

  it('sortConfigにdescを設定した場合にArrowDownアイコンを表示すること', () => {
    const onSort = vi.fn();
    render(
      <DataTable
        data={testData}
        columns={columns}
        getRowKey={(item) => item.id}
        onSort={onSort}
        sortConfig={{ sort: 'name', order: 'desc' }}
      />,
    );

    expect(screen.getByText('名前')).toBeInTheDocument();
  });

  it('sortConfigが別フィールドの場合にArrowUpDownアイコンを表示すること', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <DataTable
        data={testData}
        columns={columns}
        getRowKey={(item) => item.id}
        onSort={onSort}
        sortConfig={{ sort: 'status', order: 'asc' }}
      />,
    );

    await user.click(screen.getByText('名前'));
    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('アクションセルのクリックで行クリックイベントが伝播しないこと', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable
        data={testData}
        columns={columns}
        getRowKey={(item) => item.id}
        onRowClick={onRowClick}
        actions={(item) => <button>削除 {item.name}</button>}
      />,
    );

    await user.click(screen.getByText('削除 商品A'));
  });
});
