import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox } from '@/components/ui/combobox';

// scrollIntoView is not available in jsdom
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const options = [
  { value: 'opt1', label: 'オプション1' },
  { value: 'opt2', label: 'オプション2' },
  { value: 'opt3', label: 'オプション3' },
];

describe('Combobox', () => {
  it('プレースホルダーを表示すること', () => {
    render(<Combobox options={options} placeholder="選択してください" />);

    expect(screen.getByText('選択してください')).toBeInTheDocument();
  });

  it('選択中の値のラベルを表示すること', () => {
    render(<Combobox options={options} value="opt1" />);

    expect(screen.getByText('オプション1')).toBeInTheDocument();
  });

  it('ボタンをクリックするとオプションリストが開くこと', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('オプション1')).toBeInTheDocument();
    expect(screen.getByText('オプション2')).toBeInTheDocument();
    expect(screen.getByText('オプション3')).toBeInTheDocument();
  });

  it('オプションを選択するとonValueChangeを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox options={options} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button'));

    const option = screen.getByText('オプション2');
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: option の選択は mouseDown listener で発火する設計（onMouseDown による blur 前選択確定）。userEvent.click は click のみ dispatch するため mouseDown ハンドラには届かない
    fireEvent.mouseDown(option);

    expect(onValueChange).toHaveBeenCalledWith('opt2');
  });

  it('検索入力でオプションをフィルタリングすること', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('検索...');
    await user.type(searchInput, 'オプション1');

    expect(screen.getByText('オプション1')).toBeInTheDocument();
    expect(screen.queryByText('オプション2')).not.toBeInTheDocument();
    expect(screen.queryByText('オプション3')).not.toBeInTheDocument();
  });

  it('フィルタリング結果が0件のとき「該当なし」を表示すること', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('検索...');
    await user.type(searchInput, '存在しない値');

    expect(screen.getByText('該当なし')).toBeInTheDocument();
  });

  it('Escapeキーでドロップダウンが閉じること', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('オプション1')).toBeInTheDocument();

    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: document に対する keyDown native event。userEvent.keyboard はフォーカス要素に dispatch するため document level の listener 検証には不適
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('オプション1')).not.toBeInTheDocument();
  });

  it('ArrowDownキーでハイライトが下に移動すること', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('検索...');
    searchInput.focus();
    await user.keyboard('{ArrowDown}');

    const optionElements = screen.getAllByRole('option');
    expect(optionElements[1]).toHaveClass('bg-[var(--sp-select-hover)]');
  });

  it('ArrowUpキーでハイライトが上に移動すること', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('検索...');
    searchInput.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');

    const optionElements = screen.getAllByRole('option');
    expect(optionElements[1]).toHaveClass('bg-[var(--sp-select-hover)]');
  });

  it('Enterキーでハイライト中のオプションを選択すること', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox options={options} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('検索...');
    searchInput.focus();
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onValueChange).toHaveBeenCalledWith('opt2');
  });

  it('disabledのとき操作できないこと', () => {
    render(<Combobox options={options} disabled />);

    const trigger = screen.getByRole('button');
    expect(trigger).toBeDisabled();
  });

  it('マウスホバーでハイライトが変わること', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);

    await user.click(screen.getByRole('button'));

    const optionElements = screen.getAllByRole('option');
    await user.hover(optionElements[2]);

    expect(optionElements[2]).toHaveClass('bg-[var(--sp-select-hover)]');
  });

  it('選択中の値に対してaria-selectedがtrueであること', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} value="opt1" />);

    await user.click(screen.getByRole('button'));

    const selectedOption = screen.getAllByRole('option')[0];
    expect(selectedOption).toHaveAttribute('aria-selected', 'true');
  });

  it('searchPlaceholderが指定された場合に使用されること', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} searchPlaceholder="カスタム検索..." />);

    await user.click(screen.getByRole('button'));

    expect(screen.getByPlaceholderText('カスタム検索...')).toBeInTheDocument();
  });

  it('同じボタンを再度クリックするとドロップダウンが閉じること', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);

    const trigger = screen.getByRole('button');
    await user.click(trigger);
    expect(screen.getByText('オプション1')).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByText('オプション1')).not.toBeInTheDocument();
  });

  it('空のオプションリストで「該当なし」を表示すること', async () => {
    const user = userEvent.setup();
    render(<Combobox options={[]} />);

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('該当なし')).toBeInTheDocument();
  });

  it('Enterキーでオプションが空のときonValueChangeを呼ばないこと', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox options={[]} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('検索...');
    searchInput.focus();
    await user.keyboard('{Enter}');

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('ArrowDownで最後のオプションを超えないこと', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('検索...');
    searchInput.focus();
    // 最後まで移動 + 超えようとする
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');

    const optionElements = screen.getAllByRole('option');
    expect(optionElements[2]).toHaveClass('bg-[var(--sp-select-hover)]');
  });

  it('ArrowUpで最初のオプションより上に行かないこと', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} />);

    await user.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('検索...');
    searchInput.focus();
    // 0番目から上に移動しようとしても0のまま
    await user.keyboard('{ArrowUp}');

    const optionElements = screen.getAllByRole('option');
    expect(optionElements[0]).toHaveClass('bg-[var(--sp-select-hover)]');
  });
});
