import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RolePickerDialog } from '@/features/announcements/components/role-picker-dialog';

// グループ一覧は API から取得するため apiClient をモックする（既存流儀に合わせ
// useValue 形式ではなく vi.mock で axios client の get だけを置き換える）。
vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

const groups = {
  data: {
    data: [
      { id: 1, code: 'G1', name: '全体告知' },
      { id: 2, code: 'G2', name: '営業部' },
      { id: 3, code: 'G3', name: '開発部' },
    ],
  },
};

function renderDialog(props: Partial<Parameters<typeof RolePickerDialog>[0]> = {}) {
  const onApply = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <RolePickerDialog
      open
      selectedGroupIds={[]}
      onApply={onApply}
      onOpenChange={onOpenChange}
      {...props}
    />,
  );
  return { onApply, onOpenChange };
}

describe('RolePickerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue(groups);
  });

  it('開くとグループ一覧を取得して表示すること', async () => {
    renderDialog();

    expect(await screen.findByText('営業部')).toBeInTheDocument();
    expect(screen.getByText('全体告知')).toBeInTheDocument();
    expect(screen.getByText('開発部')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/groups', { params: { limit: 500 } });
  });

  it('選択して確定すると onApply に AnnouncementRoleRef の形で渡りダイアログが閉じること', async () => {
    const user = userEvent.setup();
    const { onApply, onOpenChange } = renderDialog();

    await user.click(await screen.findByText('営業部'));
    await user.click(screen.getByRole('button', { name: '確定' }));

    expect(onApply).toHaveBeenCalledWith([{ groupId: 2, groupCode: 'G2', groupName: '営業部' }]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('選択の解除で確定時の onApply から外れること', async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog({ selectedGroupIds: [2] });

    // 既選択状態が初期反映される（チェックマーク表示）
    await user.click(await screen.findByText('営業部')); // 解除
    await user.click(screen.getByRole('button', { name: '確定' }));

    expect(onApply).toHaveBeenCalledWith([]);
  });

  it('クリアで選択が全て外れること', async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog({ selectedGroupIds: [2, 3] });

    await user.click(await screen.findByText('営業部'));
    await user.click(screen.getByRole('button', { name: 'クリア' }));
    await user.click(screen.getByRole('button', { name: '確定' }));

    expect(screen.getByText('選択中: 0 件')).toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith([]);
  });

  it('コード・名前で絞り込みが効くこと', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByPlaceholderText('コード・名前で絞り込み'), '営業');

    expect(screen.getByText('営業部')).toBeInTheDocument();
    expect(screen.queryByText('開発部')).not.toBeInTheDocument();
  });

  it('取得結果が空なら対象グループなしメッセージを表示すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    renderDialog();

    expect(await screen.findByText('対象グループがありません')).toBeInTheDocument();
  });
});
