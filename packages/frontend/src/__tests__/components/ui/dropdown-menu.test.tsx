import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

describe('DropdownMenu', () => {
  it('初期状態でメニューが表示されないこと', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>メニュー</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>項目1</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('トリガーをクリックでメニューが開くこと', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>メニュー</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>項目1</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByText('メニュー'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('項目1')).toBeInTheDocument();
  });

  it('メニューアイテムをクリックでメニューが閉じること', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>メニュー</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={onClick}>項目1</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByText('メニュー'));
    await user.click(screen.getByText('項目1'));
    expect(onClick).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('ラベルとセパレータが表示されること', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>メニュー</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>ラベル</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>項目1</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByText('メニュー'));
    expect(screen.getByText('ラベル')).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('aria-expanded属性が正しく設定されること', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>メニュー</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>項目1</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = screen.getByText('メニュー');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('Escapeキーでメニューが閉じること', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>メニュー</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>項目1</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByText('メニュー'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: document に対する keyDown native event。userEvent.keyboard はフォーカス要素に dispatch するため document level の listener 検証には不適
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('外部クリックでメニューが閉じること', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <div data-testid="outside">外部</div>
        <DropdownMenu>
          <DropdownMenuTrigger>メニュー</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>項目1</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>,
    );
    await user.click(screen.getByText('メニュー'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: click-outside 検出は document level の mousedown listener。userEvent.click は対象要素に click を dispatch するが mousedown listener が capture/bubble する経路の検証としては fireEvent.mouseDown が直接的
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('menuitem roleが設定されていること', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>メニュー</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>項目1</DropdownMenuItem>
          <DropdownMenuItem>項目2</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByText('メニュー'));
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });
});
