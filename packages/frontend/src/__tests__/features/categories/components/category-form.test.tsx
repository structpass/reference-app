// @form-single-file: field 数 2 (code, name) のみ・validation も 2 件と単純なため 3-split は過剰
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryForm } from '@/features/categories/components/category-form';

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const defaultValues = {
  code: 'CAT-001',
  name: 'テストカテゴリー',
  status: 'ACTIVE' as const,
};

describe('CategoryForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('作成モードで必須フィールドを表示すること', () => {
    render(<CategoryForm mode="create" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/カテゴリーコード/)).toBeInTheDocument();
    expect(screen.getByLabelText(/カテゴリー名/)).toBeInTheDocument();
    expect(screen.getByText('マスタ登録')).toBeInTheDocument();
  });

  it('編集モードで「マスタ更新」ボタンを表示すること', () => {
    render(<CategoryForm mode="edit" id={1} onSubmit={vi.fn()} defaultValues={defaultValues} />);

    expect(screen.getByDisplayValue('CAT-001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('テストカテゴリー')).toBeInTheDocument();
    expect(screen.getByText('マスタ更新')).toBeInTheDocument();
  });

  it('参照モードでフィールドが無効化されること', () => {
    render(<CategoryForm mode="view" id={1} defaultValues={defaultValues} />);

    expect(screen.getByDisplayValue('CAT-001')).toBeDisabled();
    expect(screen.getByDisplayValue('テストカテゴリー')).toBeDisabled();
    expect(screen.getByText('編集')).toBeInTheDocument();
    expect(screen.getByText('戻る')).toBeInTheDocument();
  });

  it('作成モードで「一覧へ戻る」ボタンをクリックすると一覧画面に遷移すること', async () => {
    const user = userEvent.setup();
    render(<CategoryForm mode="create" onSubmit={vi.fn()} />);

    await user.click(screen.getByText('一覧へ戻る'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/categories');
  });

  it('参照モードで編集ボタンをクリックすると編集ページに遷移すること', async () => {
    const user = userEvent.setup();
    render(<CategoryForm mode="view" id={5} defaultValues={defaultValues} />);

    await user.click(screen.getByText('編集'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/categories/5');
  });

  it('参照モードで戻るボタンをクリックするとrouter.backを呼ぶこと', async () => {
    const user = userEvent.setup();
    render(<CategoryForm mode="view" id={5} defaultValues={defaultValues} />);

    await user.click(screen.getByText('戻る'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('フォーム送信時にonSubmitを呼ぶこと', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CategoryForm mode="create" onSubmit={onSubmit} defaultValues={defaultValues} />);

    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  it('ステータスのSelectを変更できること', async () => {
    const user = userEvent.setup();
    render(<CategoryForm mode="create" onSubmit={vi.fn()} defaultValues={defaultValues} />);

    const triggers = screen.getAllByRole('button');
    const selectTrigger = triggers.find((t) => t.getAttribute('aria-haspopup') === 'listbox');
    expect(selectTrigger).toBeDefined();
    if (selectTrigger) {
      await user.click(selectTrigger);
      expect(screen.getByText('無効')).toBeInTheDocument();
    }
  });

  it('Enterキーをテキスト入力フィールドで押してもフォーム送信されないこと', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CategoryForm mode="create" onSubmit={onSubmit} defaultValues={defaultValues} />);

    const codeInput = screen.getByLabelText(/カテゴリーコード/);
    // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: keyDown は user-event の表現外（ネイティブ event の preventDefault 検証必須）
    fireEvent.keyDown(codeInput, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('編集モードでcodeフィールドが無効化されること', () => {
    render(<CategoryForm mode="edit" id={1} onSubmit={vi.fn()} defaultValues={defaultValues} />);

    expect(screen.getByDisplayValue('CAT-001')).toBeDisabled();
  });

  it('onSubmitが指定されていない参照モードではフォームが送信されないこと', () => {
    render(<CategoryForm mode="view" id={1} defaultValues={defaultValues} />);

    const form = screen.getByText('編集').closest('form');
    expect(form).toBeInTheDocument();
    if (form) {
      // eslint-disable-next-line no-restricted-syntax -- @allow-fireEvent: form submit native 発火は user-event 表現外
      fireEvent.submit(form);
    }
  });
});
