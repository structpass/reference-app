import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentForm } from '@/components/shared/document-form';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh, back: vi.fn() }),
}));

describe('DocumentForm', () => {
  const defaultProps = {
    mode: 'create' as const,
    headerFields: <div data-testid="header">ヘッダー</div>,
    lineItemsNode: <div data-testid="lines">明細</div>,
    backPath: '/dashboard/orders',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('作成モードで登録ボタンを表示すること', () => {
    render(<DocumentForm {...defaultProps} />);

    expect(screen.getByText('登録する')).toBeInTheDocument();
    expect(screen.getByText('一覧へ戻る')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('lines')).toBeInTheDocument();
  });

  it('編集モードで更新ボタンを表示すること', () => {
    render(<DocumentForm {...defaultProps} mode="edit" />);
    expect(screen.getByText('更新する')).toBeInTheDocument();
  });

  it('参照モードで保存ボタンを非表示にすること', () => {
    render(<DocumentForm {...defaultProps} mode="view" />);
    expect(screen.queryByText('登録する')).not.toBeInTheDocument();
    expect(screen.queryByText('更新する')).not.toBeInTheDocument();
  });

  it('伝票番号とステータスを表示すること', () => {
    render(
      <DocumentForm {...defaultProps} mode="view" documentNo="RCV-20260317-0001" status="DRAFT" />,
    );
    expect(screen.getByText('RCV-20260317-0001')).toBeInTheDocument();
  });

  it('DRAFTステータスで編集ボタンを表示すること', async () => {
    const user = userEvent.setup();
    render(
      <DocumentForm {...defaultProps} mode="view" status="DRAFT" editPath="/dashboard/orders/1" />,
    );
    expect(screen.getByText('編集')).toBeInTheDocument();

    await user.click(screen.getByText('編集'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/orders/1');
  });

  it('戻るボタンでbackPathに遷移すること', async () => {
    const user = userEvent.setup();
    render(<DocumentForm {...defaultProps} />);

    await user.click(screen.getByText('一覧へ戻る'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/orders');
  });

  it('submitting中はボタンを無効化すること', () => {
    render(<DocumentForm {...defaultProps} submitting={true} />);
    expect(screen.getByText('保存中...')).toBeDisabled();
  });

  it('ステータスアクションボタンを表示すること', () => {
    const action = {
      label: '確定',
      onAction: vi.fn().mockResolvedValue(true),
      confirmTitle: '確定しますか？',
      confirmDescription: 'この操作は取り消せません。',
    };

    render(<DocumentForm {...defaultProps} mode="view" statusActions={[action]} />);

    expect(screen.getByText('確定')).toBeInTheDocument();
  });
});
