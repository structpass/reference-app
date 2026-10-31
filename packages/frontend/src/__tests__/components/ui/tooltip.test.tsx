import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

describe('Tooltip', () => {
  it('初期状態でツールチップコンテンツが非表示であること', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>ホバー対象</TooltipTrigger>
          <TooltipContent>ヒントテキスト</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.getByText('ホバー対象')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('マウスホバーでツールチップを表示すること', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger data-testid="trigger">ホバー対象</TooltipTrigger>
          <TooltipContent>ヒントテキスト</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.hover(screen.getByTestId('trigger'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('ヒントテキスト')).toBeInTheDocument();
  });

  it('マウスアウトでツールチップを非表示にすること', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger data-testid="trigger">ホバー対象</TooltipTrigger>
          <TooltipContent>ヒントテキスト</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.hover(screen.getByTestId('trigger'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.unhover(screen.getByTestId('trigger'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('フォーカスでツールチップを表示すること', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger data-testid="trigger">ホバー対象</TooltipTrigger>
          <TooltipContent>ヒントテキスト</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const trigger = screen.getByTestId('trigger');
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: TooltipTrigger は非フォーカス可能要素として描画される（tabIndex なし）。.focus() の呼び出しでは jsdom が focus event を dispatch しないため、focus listener の検証には fireEvent.focus が必須
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: 同上 — blur listener の検証
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('side指定でポジションクラスを適用すること', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger data-testid="trigger">対象</TooltipTrigger>
          <TooltipContent side="bottom">下部ヒント</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.hover(screen.getByTestId('trigger'));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.className).toContain('top-full');
  });
});
