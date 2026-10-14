import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CarrierForm } from '@/features/carriers/components/carrier-form';

const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const defaultValues = {
  code: 'CR-001',
  name: 'テスト運送',
  status: 'ACTIVE' as const,
};

describe('CarrierForm - base render / mode 別表示', () => {
  it('作成モードで必須フィールドを表示すること', () => {
    render(<CarrierForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/運送会社コード/)).toBeInTheDocument();
    expect(screen.getByLabelText(/運送会社名/)).toBeInTheDocument();
    expect(screen.getByText('マスタ登録')).toBeInTheDocument();
  });

  it('編集モードで「マスタ更新」ボタンを表示すること', () => {
    render(
      <CarrierForm
        mode="edit"
        id={1}
        onSubmit={vi.fn()}
        defaultValues={{ code: 'CR-001', name: 'テスト運送' }}
      />,
    );

    expect(screen.getByDisplayValue('CR-001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('テスト運送')).toBeInTheDocument();
    expect(screen.getByText('マスタ更新')).toBeInTheDocument();
  });

  it('参照モードでフィールドが無効化されること', () => {
    render(
      <CarrierForm mode="view" id={1} defaultValues={{ code: 'CR-001', name: 'テスト運送' }} />,
    );

    expect(screen.getByDisplayValue('CR-001')).toBeDisabled();
    expect(screen.getByDisplayValue('テスト運送')).toBeDisabled();
    expect(screen.getByText('編集')).toBeInTheDocument();
    expect(screen.getByText('戻る')).toBeInTheDocument();
  });

  it('参照モードで編集ボタンをクリックすると編集ページに遷移すること', async () => {
    const user = userEvent.setup();
    mockPush.mockClear();
    render(<CarrierForm mode="view" id={42} defaultValues={defaultValues} />);

    await user.click(screen.getByText('編集'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/carriers/42');
  });

  it('参照モードで戻るボタンをクリックするとrouter.backを呼ぶこと', async () => {
    const user = userEvent.setup();
    mockBack.mockClear();
    render(<CarrierForm mode="view" id={42} defaultValues={defaultValues} />);

    await user.click(screen.getByText('戻る'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('作成モードで「一覧へ戻る」ボタンをクリックすると router.push を呼ぶこと', async () => {
    const user = userEvent.setup();
    mockPush.mockClear();
    render(<CarrierForm mode="create" onSubmit={vi.fn()} defaultValues={defaultValues} />);

    await user.click(screen.getByText('一覧へ戻る'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/carriers');
  });
});
