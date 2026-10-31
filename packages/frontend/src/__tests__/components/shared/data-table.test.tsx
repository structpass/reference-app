import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type ColumnDef } from '@/components/shared/data-table';
import {
  __setColumnWidthsForTest,
  __resetColumnWidthsStoreForTest,
} from '@/features/user-table-column-widths/hooks/use-table-column-widths';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/features/user-table-column-widths/api', () => ({
  fetchColumnWidths: vi.fn().mockResolvedValue([]),
  upsertColumnWidth: vi.fn(),
}));

interface TestItem {
  id: number;
  name: string;
  status: string;
}

const columns: ColumnDef<TestItem>[] = [
  { key: 'name', label: '名前' },
  { key: 'status', label: 'ステータス', sortable: true },
];

const testData: TestItem[] = [
  { id: 1, name: '商品A', status: 'ACTIVE' },
  { id: 2, name: '商品B', status: 'INACTIVE' },
];

describe('DataTable', () => {
  it('データを表示すること', () => {
    render(<DataTable data={testData} columns={columns} getRowKey={(item) => item.id} />);
    expect(screen.getByText('商品A')).toBeInTheDocument();
    expect(screen.getByText('商品B')).toBeInTheDocument();
  });

  it('カラムヘッダーを表示すること', () => {
    render(<DataTable data={testData} columns={columns} getRowKey={(item) => item.id} />);
    expect(screen.getByText('名前')).toBeInTheDocument();
    expect(screen.getByText('ステータス')).toBeInTheDocument();
  });

  it('空データ時にemptyMessageを表示すること', () => {
    render(<DataTable data={[]} columns={columns} getRowKey={(item: TestItem) => item.id} />);
    expect(screen.getByText('データが見つかりませんでした')).toBeInTheDocument();
  });

  it('カスタムemptyMessageを表示すること', () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        getRowKey={(item: TestItem) => item.id}
        emptyMessage="該当なし"
      />,
    );
    expect(screen.getByText('該当なし')).toBeInTheDocument();
  });

  // d789: 0 件の案内が「（空だから）無い」のか「条件に合わない」のかを読み手が言い分けられる。
  describe('絞り込み中の 0 件', () => {
    it('既定と同じ文字列でも明示された文言は絞り込みで置き換えないこと', () => {
      render(
        <DataTable
          data={[]}
          columns={columns}
          getRowKey={(item: TestItem) => item.id}
          emptyMessage="データが見つかりませんでした"
          filtered
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent('データが見つかりませんでした');
    });

    it('絞り込みが入っている時は条件に合わなかった旨を出すこと', () => {
      render(
        <DataTable data={[]} columns={columns} getRowKey={(item: TestItem) => item.id} filtered />,
      );
      expect(screen.getByText('条件に合うデータがありませんでした')).toBeInTheDocument();
      expect(screen.queryByText('データが見つかりませんでした')).toBeNull();
    });

    it('絞り込みが入っていない時は従来の空表示のままにすること', () => {
      render(
        <DataTable
          data={[]}
          columns={columns}
          getRowKey={(item: TestItem) => item.id}
          filtered={false}
        />,
      );
      expect(screen.getByText('データが見つかりませんでした')).toBeInTheDocument();
    });

    it('画面が独自の空文言を渡した時は、絞り込み中でもその文言を優先すること', () => {
      render(
        <DataTable
          data={[]}
          columns={columns}
          getRowKey={(item: TestItem) => item.id}
          emptyMessage="商品が見つかりませんでした"
          filtered
        />,
      );
      expect(screen.getByText('商品が見つかりませんでした')).toBeInTheDocument();
    });
  });

  it('ソートカラムクリックでonSortを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <DataTable data={testData} columns={columns} getRowKey={(item) => item.id} onSort={onSort} />,
    );
    await user.click(screen.getByText('ステータス'));
    expect(onSort).toHaveBeenCalledWith('status');
  });

  it('カスタムrender関数を使用すること', () => {
    const columnsWithRender: ColumnDef<TestItem>[] = [
      { key: 'name', label: '名前', render: (item) => <strong>{item.name}</strong> },
    ];
    render(<DataTable data={testData} columns={columnsWithRender} getRowKey={(item) => item.id} />);
    const strong = screen.getByText('商品A');
    expect(strong.tagName).toBe('STRONG');
  });

  describe('リサイザブルテーブル（tableId 指定時）', () => {
    beforeEach(() => {
      __resetColumnWidthsStoreForTest();
    });

    it('table-fixed + width:100% + minWidth:totalWidth + spacer col（Excel 風: 列ドラッグで隣接列が動かず、右端まで伸長）', () => {
      __setColumnWidthsForTest('products', { name: 200, status: 150 });

      const { container } = render(
        <DataTable
          data={testData}
          columns={[
            { key: 'name', label: '名前', minWidth: 100 },
            { key: 'status', label: 'ステータス', minWidth: 100 },
          ]}
          getRowKey={(item) => item.id}
          tableId="products"
        />,
      );

      const table = container.querySelector('table.table-fixed') as HTMLTableElement | null;
      expect(table).not.toBeNull();
      // width:100% でコンテナ右端まで拡張、minWidth:totalWidth(px) で列幅合計を死守。
      // 余剰幅は末尾の spacer <col>（width 未指定）が table-fixed の規則で一手に吸収するため、
      // 既存列の幅は不変（Excel 風 drag 挙動を維持）。
      expect(table?.style.width).toBe('100%');
      expect(table?.style.minWidth).toBe('350px');
      // 各列の colgroup 幅が独立して反映されることを確認
      const cols = container.querySelectorAll('colgroup col');
      expect(cols[0].getAttribute('style')).toContain('width: 200px');
      expect(cols[1].getAttribute('style')).toContain('width: 150px');
      // 末尾 spacer col は width 未指定（余剰幅吸収）。
      // style 属性自体が無いか、あっても width を含まないことを確認（環境差異吸収）
      const spacer = cols[cols.length - 1] as HTMLTableColElement;
      expect(spacer.style.width).toBe('');
      expect(spacer.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('アクション列を表示すること', () => {
    render(
      <DataTable
        data={testData}
        columns={columns}
        getRowKey={(item) => item.id}
        actions={(item) => <button>削除 {item.name}</button>}
      />,
    );
    expect(screen.getByText('削除 商品A')).toBeInTheDocument();
  });
});
