import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

function TestSelect({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="選択してください" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">選択肢A</SelectItem>
        <SelectItem value="b">選択肢B</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe('Select', () => {
  it('プレースホルダーを表示すること', () => {
    render(<TestSelect />);
    expect(screen.getByText('選択してください')).toBeInTheDocument();
  });

  it('トリガーをクリックでドロップダウンを開くこと', async () => {
    const user = userEvent.setup();
    render(<TestSelect />);
    const trigger = screen.getByRole('button');
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('選択肢A')).toBeInTheDocument();
    expect(screen.getByText('選択肢B')).toBeInTheDocument();
  });

  it('アイテムをクリックでonValueChangeを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TestSelect onValueChange={onChange} />);

    await user.click(screen.getByRole('button'));
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: Select option の選択は mouseDown listener で発火する設計。userEvent.click は click のみ dispatch するため Radix-style な mouseDown ハンドラには届かない
    fireEvent.mouseDown(screen.getByText('選択肢A'));

    expect(onChange).toHaveBeenCalledWith('a');
    // v2-461 の非回帰: 文字列の children は変更前と同じ文言が選択欄に出る（一般化で表示を変えない）。
    expect(screen.getByRole('button')).toHaveTextContent('選択肢A');
  });

  it('disabledの場合にクリックできないこと', () => {
    render(
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="選択" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toBeDisabled();
  });

  // v2-461: 文字列以外（JSX）の children でも選択済みの表示にラベルが出る。
  it('JSXの子を持つアイテムを選ぶと、選択欄に UUID ではなくその描画テキストを表示すること', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select onValueChange={onChange}>
        <SelectTrigger aria-label="対象を選択">
          <SelectValue placeholder="選択してください" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="u-1">
            <span>山田 太郎</span> (倉庫担当（一般）)
          </SelectItem>
          <SelectItem value="u-2">
            <span>鈴木 花子</span> (事務担当（一般）)
          </SelectItem>
        </SelectContent>
      </Select>,
    );

    await user.click(screen.getByRole('button', { name: '対象を選択' }));
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: Select option の選択は mouseDown listener で発火する設計
    fireEvent.mouseDown(screen.getByText('鈴木 花子'));

    expect(onChange).toHaveBeenCalledWith('u-2');
    expect(screen.getByRole('button', { name: '対象を選択' })).toHaveTextContent(
      '鈴木 花子 (事務担当（一般）)',
    );
    expect(screen.getByRole('button', { name: '対象を選択' })).not.toHaveTextContent('u-2');
  });
});
