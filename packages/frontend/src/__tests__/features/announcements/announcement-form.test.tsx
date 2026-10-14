import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnnouncementForm } from '@/features/announcements/components/announcement-form';
import type { AnnouncementFormData } from '@/features/announcements/lib/validations';
import type { AnnouncementResponse } from '@struct-pass/shared';

// 添付系フックは API を叩くため、フォーム単体の検証に不要な部分をモックする。
// attachment-uploader.test.tsx と同様、react-hot-toast もモックしておく。
vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/features/announcements/hooks/use-announcement-attachments', () => ({
  useAnnouncementAttachmentConfig: () => ({
    maxSizeMB: 20,
    maxFiles: 4,
    allowedExtensions: [],
  }),
  useAnnouncementAttachments: () => ({
    uploading: false,
    progress: null,
    upload: vi.fn(async () => true),
    remove: vi.fn(async () => true),
  }),
}));

// Label（タイトル/内容）は for 属性で form control に関連付けられていない
// （<Label> は表示用・Input は register で name 属性のみ持つ）。そのため
// getByLabelText は使えず、title は RHF の name 属性、body は MarkdownTabs の
// placeholder で特定する。
function titleInput(container: HTMLElement): HTMLInputElement {
  const el = container.querySelector('input[name="title"]');
  if (!el) throw new Error('title input not found');
  return el as HTMLInputElement;
}

// RolePickerDialog は自前のテスト（role-picker-dialog.test.tsx）で実物を検証する。
// フォーム側の観点は「選択がフォーム値へ反映される」境界なので、ここでは
// open になったら onApply を発火できるスタブを置き、handleApplyRoles の検証に絞る。
vi.mock('@/features/announcements/components/role-picker-dialog', () => ({
  RolePickerDialog: ({
    open,
    onApply,
  }: {
    open: boolean;
    onApply: (roles: { groupId: number; groupCode: string; groupName: string }[]) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => onApply([{ groupId: 1, groupCode: 'G1', groupName: '全体告知' }])}
      >
        apply-roles
      </button>
    ) : null,
}));

const onSaveMock = vi.fn<() => Promise<AnnouncementResponse | null>>(async () => null);

const baseProps = {
  mode: 'create' as const,
  attachments: [],
  onSave: onSaveMock as unknown as (
    data: AnnouncementFormData,
  ) => Promise<AnnouncementResponse | null>,
  onCancel: vi.fn(),
  onAttachmentsChanged: vi.fn(),
  saving: false,
};

function makeAnnouncement(overrides: Partial<AnnouncementResponse> = {}): AnnouncementResponse {
  return {
    id: 1,
    title: '既存タイトル',
    bodyMarkdown: '既存本文',
    isNew: false,
    isImportant: true,
    notifiedAt: '2026-08-01T00:00:00+09:00',
    sortOrder: 1,
    roles: [{ groupId: 1, groupCode: 'G1', groupName: '全体告知' }],
    attachments: [],
    ...overrides,
  } as AnnouncementResponse;
}

describe('AnnouncementForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('タイトルが空のまま送信すると必須エラーを表示し onSave を呼ばないこと', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => null);
    render(<AnnouncementForm {...baseProps} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByText('タイトルは必須です')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('タイトルが 200 文字を超えると上限エラーを表示すること', async () => {
    const user = userEvent.setup();
    const { container } = render(<AnnouncementForm {...baseProps} />);

    await user.type(titleInput(container), 'あ'.repeat(201));
    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByText('200文字以内で入力してください')).toBeInTheDocument();
  });

  it('編集モードでは既存値が初期値として展開されること', () => {
    const { container } = render(
      <AnnouncementForm
        {...baseProps}
        mode="edit"
        announcement={makeAnnouncement()}
        attachments={[]}
      />,
    );

    expect(titleInput(container)).toHaveValue('既存タイトル');
    expect(screen.getByPlaceholderText('Markdown で入力できます')).toHaveValue('既存本文');
    expect(screen.getByRole('checkbox', { name: '重要' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'New' })).not.toBeChecked();
  });

  it('＋追加から選択を適用するとチップ表示とフォーム値（roleGroupIds）へ反映されること', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => null);
    const { container } = render(<AnnouncementForm {...baseProps} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: '＋追加' }));
    await user.click(screen.getByRole('button', { name: 'apply-roles' }));

    // 選択したグループ名がチップとして表示される
    expect(screen.getByText('全体告知')).toBeInTheDocument();

    // 送信データに roleGroupIds が含まれる（新規/編集で同形）
    await user.type(titleInput(container), '新規お知らせ');
    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '新規お知らせ',
        roleGroupIds: [1],
        isNew: true,
        isImportant: false,
      }),
    );
  });

  it('送信データは新規・編集で同じ形（AnnouncementFormData）で onSave へ渡ること', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(data: AnnouncementFormData) => Promise<null>>(async () => null);
    const { container } = render(<AnnouncementForm {...baseProps} onSave={onSave} />);

    await user.type(titleInput(container), '通常お知らせ');
    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const data = onSave.mock.calls[0][0];
    expect(data).toMatchObject({
      title: '通常お知らせ',
      bodyMarkdown: '',
      isNew: true,
      isImportant: false,
      roleGroupIds: [],
    });
    expect(typeof data.notifiedAt).toBe('undefined');
  });

  it('キャンセルボタンで onCancel が呼ばれること', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<AnnouncementForm {...baseProps} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
