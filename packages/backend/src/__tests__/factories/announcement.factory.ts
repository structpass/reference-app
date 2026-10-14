import type {
  AnnouncementWithRelationsPayload,
  AnnouncementAttachmentPayload,
} from '../../modules/announcements/announcements.mapper';
import { makeBase, BASE_DATE } from './_base';

export const makeAnnouncementAttachmentEntity = makeBase<AnnouncementAttachmentPayload>({
  id: 1,
  announcementId: 1,
  fileName: 'test.pdf',
  storagePath: '1/uuid-abc.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  sortOrder: 0,
  createdById: null,
  createdAt: BASE_DATE,
} as AnnouncementAttachmentPayload);

export const makeAnnouncementEntity = makeBase<AnnouncementWithRelationsPayload>({
  id: 10,
  title: 'メンテナンスのお知らせ',
  bodyMarkdown: '# 本文',
  isNew: true,
  isImportant: false,
  notifiedAt: BASE_DATE,
  sortOrder: -5,
  createdById: 'user-1',
  updatedById: 'user-2',
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  roles: [
    {
      announcementId: 10,
      groupId: 100,
      group: { id: 100, code: 'G-100', name: '倉庫管理者' },
    },
  ],
  attachments: [
    makeAnnouncementAttachmentEntity({ id: 2, sortOrder: 1, fileName: 'b.pdf' }),
    makeAnnouncementAttachmentEntity({ id: 1, sortOrder: 0, fileName: 'a.pdf' }),
  ],
  creator: { id: 'user-1', name: 'alice' },
  updater: { id: 'user-2', name: 'bob' },
} as AnnouncementWithRelationsPayload);
