import {
  fetchMyAnnouncements,
  fetchAllAnnouncements,
  fetchAnnouncement,
  fetchAnnouncementForManage,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  reorderAnnouncements,
  fetchAttachmentConfig,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
} from '@/features/announcements/lib/api';

// lib/api は薄い axios ラッパーのため、apiClient をモックして
// 各関数が正しい URL / payload / 戻り値変換で呼ばれることを検証する。
vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

describe('announcements lib/api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // downloadAttachment テストが URL / rAF / createElement をスタブするため、
  // 失敗時も後続テストへ漏れないよう必ず解除する
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetchMyAnnouncements は一覧を取得して data を返すこと', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [{ id: 1 }] } });

    const result = await fetchMyAnnouncements();

    expect(apiClient.get).toHaveBeenCalledWith('/announcements');
    expect(result).toEqual([{ id: 1 }]);
  });

  it('fetchAllAnnouncements は管理用一覧（/manage）を取得すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [{ id: 2 }] } });

    const result = await fetchAllAnnouncements();

    expect(apiClient.get).toHaveBeenCalledWith('/announcements/manage');
    expect(result).toEqual([{ id: 2 }]);
  });

  it('fetchAnnouncement は個別取得（/announcements/:id）すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { id: 3 } } });

    const result = await fetchAnnouncement(3);

    expect(apiClient.get).toHaveBeenCalledWith('/announcements/3');
    expect(result).toEqual({ id: 3 });
  });

  it('fetchAnnouncementForManage は管理用個別取得（/manage/:id）すること', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { id: 4 } } });

    const result = await fetchAnnouncementForManage(4);

    expect(apiClient.get).toHaveBeenCalledWith('/announcements/manage/4');
    expect(result).toEqual({ id: 4 });
  });

  it('createAnnouncement は payload を POST して作成結果を返すこと', async () => {
    const payload = {
      title: '新規',
      bodyMarkdown: '',
      isNew: true,
      isImportant: false,
      roleGroupIds: [],
    };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { id: 5 } } });

    const result = await createAnnouncement(payload);

    expect(apiClient.post).toHaveBeenCalledWith('/announcements', payload);
    expect(result).toEqual({ id: 5 });
  });

  it('updateAnnouncement は payload を PUT（/announcements/:id）すること', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: { data: { id: 6 } } });

    const result = await updateAnnouncement(6, { title: '更新' });

    expect(apiClient.put).toHaveBeenCalledWith('/announcements/6', { title: '更新' });
    expect(result).toEqual({ id: 6 });
  });

  it('deleteAnnouncement は DELETE（/announcements/:id）すること', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });

    await deleteAnnouncement(7);

    expect(apiClient.delete).toHaveBeenCalledWith('/announcements/7');
  });

  it('reorderAnnouncements は items を PATCH（/reorder）すること', async () => {
    const items = [{ id: 1, sortOrder: 2 }];
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });

    await reorderAnnouncements(items);

    expect(apiClient.patch).toHaveBeenCalledWith('/announcements/reorder', { items });
  });

  it('fetchAttachmentConfig は /config を取得して設定を返すこと', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { maxSizeMB: 20, maxFiles: 4, allowedExtensions: ['pdf'] } },
    });

    const result = await fetchAttachmentConfig();

    expect(apiClient.get).toHaveBeenCalledWith('/announcements/config');
    expect(result.maxSizeMB).toBe(20);
  });

  it('uploadAttachment は FormData を POST（/announcements/:id/attachments）し、進捗コールバックへ割合を渡すこと', async () => {
    const file = new File(['abc'], 'a.pdf', { type: 'application/pdf' });
    const onProgress = vi.fn();
    vi.mocked(apiClient.post).mockImplementation(async (_url, _data, config) => {
      // axios は進捗イベントで onUploadProgress を呼ぶ。mock 側から発火して検証する
      config?.onUploadProgress?.({ loaded: 50, total: 100 } as never);
      return { data: { data: { id: 8 } } } as never;
    });

    const result = await uploadAttachment(1, file, onProgress);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/announcements/1/attachments',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: expect.any(Function),
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(result).toEqual({ id: 8 });
  });

  it('deleteAttachment は DELETE（/announcements/:id/attachments/:attachmentId）すること', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} });

    await deleteAttachment(1, 9);

    expect(apiClient.delete).toHaveBeenCalledWith('/announcements/1/attachments/9');
  });

  it('downloadAttachment は blob を取得して a.click でダウンロードを発火すること', async () => {
    const click = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      cb();
      return 0;
    });
    const nativeCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      const el = nativeCreateElement('a');
      el.click = click;
      return el as unknown as HTMLAnchorElement;
    });
    vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['x']) });

    await downloadAttachment(1, 9, 'file.pdf');

    expect(apiClient.get).toHaveBeenCalledWith('/announcements/1/attachments/9/download', {
      responseType: 'blob',
    });
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
