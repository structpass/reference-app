import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar, type FilterField } from '@/components/shared/filter-bar';

describe('FilterBar', () => {
  const searchField: FilterField = {
    key: 'search',
    label: '商品名',
    type: 'search',
    placeholder: '商品名で検索...',
  };

  const selectField: FilterField = {
    key: 'category',
    label: 'カテゴリー',
    type: 'select',
    options: [
      { value: 'electronics', label: '電子機器' },
      { value: 'food', label: '食品' },
    ],
  };

  it('検索フィールドを表示すること', () => {
    render(<FilterBar fields={[searchField]} onFilterChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('商品名で検索...')).toBeInTheDocument();
  });

  it('セレクトフィールドを表示すること', () => {
    render(<FilterBar fields={[selectField]} onFilterChange={vi.fn()} />);
    // select は DropdownMenuTrigger（aria-label「カテゴリーで絞り込み」）。クリアボタンと併存するため name で絞る。
    expect(screen.getByRole('button', { name: /カテゴリーで絞り込み/ })).toBeInTheDocument();
  });

  it('検索入力で値を変更できること', async () => {
    const user = userEvent.setup();
    render(<FilterBar fields={[searchField]} onFilterChange={vi.fn()} />);

    const input = screen.getByPlaceholderText('商品名で検索...');
    await user.type(input, 'テスト');

    expect(input).toHaveValue('テスト');
  });

  it('セレクトフィールドの値を変更できること', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(<FilterBar fields={[selectField]} onFilterChange={onFilterChange} />);

    const trigger = screen.getByRole('button', { name: /カテゴリーで絞り込み/ });
    await user.click(trigger);

    expect(screen.getByText('電子機器')).toBeInTheDocument();
    // 選択肢を選ぶと値が反映され、onFilterChange に category=electronics が渡る（ref-0082 review）。
    await user.click(screen.getByText('電子機器'));
    await vi.waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith({ category: 'electronics' });
    });
  });

  it('複数フィールドを同時に表示できること', () => {
    render(<FilterBar fields={[searchField, selectField]} onFilterChange={vi.fn()} />);

    expect(screen.getByPlaceholderText('商品名で検索...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /カテゴリーで絞り込み/ })).toBeInTheDocument();
  });
});
