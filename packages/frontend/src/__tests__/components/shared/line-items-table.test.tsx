import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LineItemsTable, type LineColumn } from '@/components/shared/line-items-table';

interface TestLine {
  lineNo: number;
  name: string;
}

const columns: LineColumn<TestLine>[] = [
  {
    key: 'name',
    label: '名前',
    render: (line, index, onChange) => (
      <input
        data-testid={`name-${index}`}
        value={line.name}
        onChange={(e) => onChange(index, { ...line, name: e.target.value })}
      />
    ),
  },
];

const createEmptyLine = (lineNo: number): TestLine => ({ lineNo, name: '' });

describe('LineItemsTable', () => {
  it('空の状態でメッセージを表示すること', () => {
    render(
      <LineItemsTable
        lines={[]}
        columns={columns}
        onChange={vi.fn()}
        createEmptyLine={createEmptyLine}
      />,
    );

    expect(
      screen.getByText('明細行がありません。「行追加」で追加してください。'),
    ).toBeInTheDocument();
  });

  it('明細行を表示すること', () => {
    const lines = [
      { lineNo: 1, name: 'テスト1' },
      { lineNo: 2, name: 'テスト2' },
    ];

    render(
      <LineItemsTable
        lines={lines}
        columns={columns}
        onChange={vi.fn()}
        createEmptyLine={createEmptyLine}
      />,
    );

    expect(screen.getByDisplayValue('テスト1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('テスト2')).toBeInTheDocument();
  });

  it('行追加ボタンで新しい行が追加されること', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const lines = [{ lineNo: 1, name: 'テスト1' }];

    render(
      <LineItemsTable
        lines={lines}
        columns={columns}
        onChange={onChange}
        createEmptyLine={createEmptyLine}
      />,
    );

    await user.click(screen.getByText('行追加'));

    expect(onChange).toHaveBeenCalledWith([
      { lineNo: 1, name: 'テスト1' },
      { lineNo: 2, name: '' },
    ]);
  });

  it('行削除ボタンで行が削除されlineNoが振り直されること', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const lines = [
      { lineNo: 1, name: 'A' },
      { lineNo: 2, name: 'B' },
    ];

    render(
      <LineItemsTable
        lines={lines}
        columns={columns}
        onChange={onChange}
        createEmptyLine={createEmptyLine}
      />,
    );

    const deleteButtons = screen.getAllByRole('button', { name: '行を削除' });
    await user.click(deleteButtons[0]);

    expect(onChange).toHaveBeenCalledWith([{ lineNo: 1, name: 'B' }]);
  });

  it('readonlyモードで行追加・削除ボタンが非表示であること', () => {
    render(
      <LineItemsTable
        lines={[{ lineNo: 1, name: 'テスト' }]}
        columns={columns}
        onChange={vi.fn()}
        createEmptyLine={createEmptyLine}
        readonly
      />,
    );

    expect(screen.queryByText('行追加')).not.toBeInTheDocument();
  });

  it('カラムヘッダーを表示すること', () => {
    render(
      <LineItemsTable
        lines={[]}
        columns={columns}
        onChange={vi.fn()}
        createEmptyLine={createEmptyLine}
      />,
    );

    expect(screen.getByText('#')).toBeInTheDocument();
    expect(screen.getByText('名前')).toBeInTheDocument();
  });

  it('行の値を変更できること', () => {
    const onChange = vi.fn();
    const lines = [{ lineNo: 1, name: 'before' }];

    render(
      <LineItemsTable
        lines={lines}
        columns={columns}
        onChange={onChange}
        createEmptyLine={createEmptyLine}
      />,
    );

    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: controlled input prop test。state を更新しない静的 props 検証で userEvent.type は文字毎の累積反映ができず不適
    fireEvent.change(screen.getByTestId('name-0'), { target: { value: 'after' } });

    expect(onChange).toHaveBeenCalledWith([{ lineNo: 1, name: 'after' }]);
  });
});
