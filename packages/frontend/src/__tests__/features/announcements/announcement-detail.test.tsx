import { render, screen, waitFor } from '@testing-library/react';
import { AnnouncementDetail } from '@/features/announcements/components/announcement-detail';
import type { AnnouncementResponse } from '@struct-pass/shared';

// 取得系 API は network 層に依存するため lib/api をモックし、画面の描画分岐
// （loading/エラー/通常・canManage による取得先切替・refreshKey 再取得）を検証する。
vi.mock('@/features/announcements/lib/api', () => ({
  fetchAnnouncement: vi.fn(),
  fetchAnnouncementForManage: vi.fn(),
  downloadAttachment: vi.fn(),
}));

import { fetchAnnouncement, fetchAnnouncementForManage } from '@/features/announcements/lib/api';

const detail: AnnouncementResponse = {
  id: 1,
  title: '夏期休業のお知らせ',
  bodyMarkdown: '## 休業期間\n8/1 〜 8/15',
  isNew: true,
  isImportant: true,
  // 日付は jsdom（UTC）と実ブラウザ（JST）で日付が変わり得るため、タイムゾーン差が
  // 日付を跨がない正午の ISO を使う（2026-08-01T12:00:00+09:00 = UTC 03:00 でも同日）。
  notifiedAt: '2026-08-01T12:00:00+09:00',
  sortOrder: 1,
  roles: [{ groupId: 1, groupCode: 'G1', groupName: '全体告知' }],
  attachments: [],
  creator: { name: 'テスト管理者' },
} as unknown as AnnouncementResponse;

describe('AnnouncementDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAnnouncement).mockResolvedValue(detail);
    vi.mocked(fetchAnnouncementForManage).mockResolvedValue(detail);
  });

  it('読み込み中はスピナーを表示し、取得後にタイトルと本文を表示すること', async () => {
    render(<AnnouncementDetail announcementId={1} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('夏期休業のお知らせ')).toBeInTheDocument();
    expect(screen.getByText('休業期間')).toBeInTheDocument();
  });

  it('取得失敗時はエラーメッセージを表示すること', async () => {
    vi.mocked(fetchAnnouncement).mockRejectedValue(new Error('network error'));
    render(<AnnouncementDetail announcementId={1} />);

    expect(await screen.findByText('掲示板の取得に失敗しました')).toBeInTheDocument();
  });

  it('canManage の時は管理用 API を呼び編集ボタンを表示すること', async () => {
    const onEdit = vi.fn();
    render(<AnnouncementDetail announcementId={1} canManage onEdit={onEdit} />);

    expect(await screen.findByText('夏期休業のお知らせ')).toBeInTheDocument();
    expect(fetchAnnouncementForManage).toHaveBeenCalledWith(1);
    expect(fetchAnnouncement).not.toHaveBeenCalled();

    const user = await import('@testing-library/user-event');
    await user.default.click(screen.getByRole('button', { name: /編集/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('canManage 無しは通常 API を呼び編集ボタンを表示しないこと', async () => {
    render(<AnnouncementDetail announcementId={1} />);

    await screen.findByText('夏期休業のお知らせ');
    expect(fetchAnnouncement).toHaveBeenCalledWith(1);
    expect(fetchAnnouncementForManage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /編集/ })).not.toBeInTheDocument();
  });

  it('通知先グループのチップ・作成者名・重要/New チェックを表示すること', async () => {
    render(<AnnouncementDetail announcementId={1} />);

    expect(await screen.findByText('全体告知')).toBeInTheDocument();
    // 作成者は日付と同じ <p> に結合表示されるため部分一致で検証する
    expect(screen.getByText(/テスト管理者/)).toBeInTheDocument();
    expect(screen.getByText('重要')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /重要/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /New/ })).toBeChecked();
  });

  it('本文が空なら「（本文はありません）」・添付 0 件なら「（添付ファイルなし）」を表示すること', async () => {
    vi.mocked(fetchAnnouncement).mockResolvedValue({ ...detail, bodyMarkdown: '' });
    render(<AnnouncementDetail announcementId={1} />);

    expect(await screen.findByText('（本文はありません）')).toBeInTheDocument();
    expect(screen.getByText('（添付ファイルなし）')).toBeInTheDocument();
  });

  it('refreshKey が変わると再取得されること', async () => {
    const { rerender } = render(<AnnouncementDetail announcementId={1} refreshKey={0} />);
    await screen.findByText('夏期休業のお知らせ');
    expect(fetchAnnouncement).toHaveBeenCalledTimes(1);

    rerender(<AnnouncementDetail announcementId={1} refreshKey={1} />);
    await waitFor(() => expect(fetchAnnouncement).toHaveBeenCalledTimes(2));
  });
});
