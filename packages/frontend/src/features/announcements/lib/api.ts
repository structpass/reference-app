import apiClient from '@/lib/api-client';
import type {
  AnnouncementResponse,
  AnnouncementListItem,
  AnnouncementAttachmentConfig,
  AnnouncementAttachmentResponse,
} from '@struct-pass/shared';

export interface AnnouncementUpsertPayload {
  title: string;
  bodyMarkdown: string;
  isNew: boolean;
  isImportant: boolean;
  notifiedAt?: string;
  roleGroupIds: number[];
}

const BASE = '/announcements';

export async function fetchMyAnnouncements(): Promise<AnnouncementListItem[]> {
  const res = await apiClient.get<{ success: true; data: AnnouncementListItem[] }>(BASE);
  return res.data.data;
}

export async function fetchAllAnnouncements(): Promise<AnnouncementListItem[]> {
  const res = await apiClient.get<{ success: true; data: AnnouncementListItem[] }>(
    `${BASE}/manage`,
  );
  return res.data.data;
}

export async function fetchAnnouncement(id: number): Promise<AnnouncementResponse> {
  const res = await apiClient.get<{ success: true; data: AnnouncementResponse }>(`${BASE}/${id}`);
  return res.data.data;
}

export async function fetchAnnouncementForManage(id: number): Promise<AnnouncementResponse> {
  const res = await apiClient.get<{ success: true; data: AnnouncementResponse }>(
    `${BASE}/manage/${id}`,
  );
  return res.data.data;
}

export async function createAnnouncement(
  payload: AnnouncementUpsertPayload,
): Promise<AnnouncementResponse> {
  const res = await apiClient.post<{ success: true; data: AnnouncementResponse }>(BASE, payload);
  return res.data.data;
}

export async function updateAnnouncement(
  id: number,
  payload: Partial<AnnouncementUpsertPayload>,
): Promise<AnnouncementResponse> {
  const res = await apiClient.put<{ success: true; data: AnnouncementResponse }>(
    `${BASE}/${id}`,
    payload,
  );
  return res.data.data;
}

export async function deleteAnnouncement(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`);
}

export async function reorderAnnouncements(
  items: { id: number; sortOrder: number }[],
): Promise<void> {
  await apiClient.patch(`${BASE}/reorder`, { items });
}

export async function fetchAttachmentConfig(): Promise<AnnouncementAttachmentConfig> {
  const res = await apiClient.get<{ success: true; data: AnnouncementAttachmentConfig }>(
    `${BASE}/config`,
  );
  return res.data.data;
}

export async function uploadAttachment(
  announcementId: number,
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<AnnouncementAttachmentResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post<{ success: true; data: AnnouncementAttachmentResponse }>(
    `${BASE}/${announcementId}/attachments`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(evt.loaded / evt.total);
        }
      },
    },
  );
  return res.data.data;
}

export async function deleteAttachment(
  announcementId: number,
  attachmentId: number,
): Promise<void> {
  await apiClient.delete(`${BASE}/${announcementId}/attachments/${attachmentId}`);
}

/**
 * 添付ファイルを認証付き fetch (apiClient = axios) で取得し、
 * Blob 化したものをブラウザにダウンロードさせる。
 *
 * 背景: `<a href={...download}>` 直リンク方式は cross-site cookie が
 * `sameSite: 'strict'` 環境では送られず、Bearer ヘッダも付かないため認可失敗する。
 * apiClient 経由なら interceptor が Cookie / Bearer を付与してくれる。
 *
 * memory cleanup: createObjectURL → revokeObjectURL を `requestAnimationFrame` 後に確実に行う。
 */
export async function downloadAttachment(
  announcementId: number,
  attachmentId: number,
  fileName: string,
): Promise<void> {
  const res = await apiClient.get<Blob>(
    `${BASE}/${announcementId}/attachments/${attachmentId}/download`,
    { responseType: 'blob' },
  );
  const objectUrl = URL.createObjectURL(res.data);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // a.click() は同期だが、ブラウザの download 処理は次フレーム以降。
    // 即時 revoke するとダウンロードが失敗するため次フレームで解放する。
    // jsdom 等 rAF 非対応環境では setTimeout(0) で代替。
    const defer =
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame
        : (cb: () => void) => setTimeout(cb, 0);
    defer(() => URL.revokeObjectURL(objectUrl));
  }
}
