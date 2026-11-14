import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentViewActions } from '@/components/shared/detail-page-actions';

const mockPush = vi.fn();
const mockBack = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, refresh: mockRefresh }),
}));

describe('DocumentViewActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('戻るボタンで router.back を呼ぶこと', async () => {
    const user = userEvent.setup();
    render(<DocumentViewActions />);

    await user.click(screen.getByText('戻る'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('editHref があるときだけ編集ボタンを出し、押すと編集画面へ遷移すること', async () => {
    const user = userEvent.setup();
    render(<DocumentViewActions editHref="/dashboard/receivings/1" />);

    await user.click(screen.getByText('編集'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/receivings/1');
  });

  it('editHref が無ければ編集ボタンを出さないこと', () => {
    render(<DocumentViewActions />);
    expect(screen.queryByText('編集')).not.toBeInTheDocument();
  });

  it('状態遷移は確認ダイアログを挟み、キャンセルでは実行しないこと', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(true);
    render(
      <DocumentViewActions
        statusActions={[
          {
            label: '確定する',
            onAction,
            confirmTitle: '入荷を確定',
            confirmDescription: '入荷を確定すると在庫が加算されます。よろしいですか？',
          },
        ]}
      />,
    );

    await user.click(screen.getByText('確定する'));
    expect(screen.getByText('入荷を確定')).toBeInTheDocument();

    await user.click(screen.getByText('キャンセル'));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('遷移中は状態遷移ボタンを不活性にすること', () => {
    render(
      <DocumentViewActions
        transitioning
        statusActions={[
          {
            label: '確定する',
            onAction: vi.fn(),
            confirmTitle: '入荷を確定',
            confirmDescription: '',
          },
        ]}
      />,
    );

    expect(screen.getByText('確定する').closest('button')).toBeDisabled();
  });
});
