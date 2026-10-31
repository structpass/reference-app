import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoadFailed } from '@/components/shared/load-failed';

// d942: 再試行を押した直後、失敗の表示がそのまま止まって見えると「押せていないのか
// 取り直しているのか」が分からない。処理中は処理中と分かるようにする。
describe('LoadFailed', () => {
  it('busy でない時は失敗の文言と押せる再試行を出すこと', () => {
    render(<LoadFailed message="一覧の取得に失敗しました。" onRetry={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('一覧の取得に失敗しました。');
    expect(screen.getByRole('button', { name: '再試行' })).toBeEnabled();
    // 処理中の案内は出さない（失敗しただけの状態で「読み込み直しています」と言わない）
    expect(screen.queryByText('読み込み直しています…')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveAttribute('aria-busy', 'false');
  });

  it('busy の間は処理中と分かる表示を出し、再試行を押せなくすること', () => {
    render(<LoadFailed message="一覧の取得に失敗しました。" onRetry={vi.fn()} busy />);

    expect(screen.getByText('読み込み直しています…')).toBeInTheDocument();
    // スピナーは飾り。外側の alert（live region）の内側に別の live region を重ねない
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再試行' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveAttribute('aria-busy', 'true');
  });

  it('busy の間は押しても onRetry を呼ばないこと', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<LoadFailed message="一覧の取得に失敗しました。" onRetry={onRetry} busy />);

    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('押すと onRetry を 1 回呼ぶこと', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<LoadFailed message="一覧の取得に失敗しました。" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
