import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WarehouseForm } from '@/features/warehouses/components/warehouse-form';

const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const defaultValues = {
  code: 'WH-001',
  name: 'テスト倉庫',
  status: 'ACTIVE' as const,
};

describe('WarehouseForm - base render / mode 別表示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('作成モードで必須フィールドを表示すること', () => {
    render(<WarehouseForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/倉庫コード/)).toBeInTheDocument();
    expect(screen.getByLabelText(/倉庫名/)).toBeInTheDocument();
    expect(screen.getByText('マスタ登録')).toBeInTheDocument();
  });

  it('編集モードで「マスタ更新」ボタンを表示すること', () => {
    render(
      <WarehouseForm
        mode="edit"
        id={1}
        onSubmit={vi.fn()}
        defaultValues={{ code: 'WH-001', name: 'テスト倉庫' }}
      />,
    );

    expect(screen.getByDisplayValue('WH-001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('テスト倉庫')).toBeInTheDocument();
    expect(screen.getByText('マスタ更新')).toBeInTheDocument();
  });

  it('参照モードでフィールドが無効化されること', () => {
    render(
      <WarehouseForm mode="view" id={1} defaultValues={{ code: 'WH-001', name: 'テスト倉庫' }} />,
    );

    expect(screen.getByDisplayValue('WH-001')).toBeDisabled();
    expect(screen.getByDisplayValue('テスト倉庫')).toBeDisabled();
    expect(screen.getByText('編集')).toBeInTheDocument();
    expect(screen.getByText('戻る')).toBeInTheDocument();
  });

  it('参照モードで編集ボタンをクリックすると編集ページに遷移すること', async () => {
    const user = userEvent.setup();
    render(<WarehouseForm mode="view" id={10} defaultValues={defaultValues} />);

    await user.click(screen.getByText('編集'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/warehouses/10');
  });

  it('参照モードで戻るボタンをクリックするとrouter.backを呼ぶこと', async () => {
    const user = userEvent.setup();
    render(<WarehouseForm mode="view" id={10} defaultValues={defaultValues} />);

    await user.click(screen.getByText('戻る'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('作成モードで「一覧へ戻る」ボタンをクリックすると router.push を呼ぶこと', async () => {
    const user = userEvent.setup();
    render(<WarehouseForm mode="create" onSubmit={vi.fn()} defaultValues={defaultValues} />);

    await user.click(screen.getByText('一覧へ戻る'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/warehouses');
  });
});
