import {
  type AnnouncementListItem,
  type AnnouncementResponse,
  type AnnouncementAttachmentResponse,
} from '@struct-pass/shared';
import { makeBase, BASE_DATE_ISO } from './_base';

export const makeAnnouncementListItem = makeBase<AnnouncementListItem>({
  id: 1,
  title: 'お知らせタイトル',
  bodyMarkdown: '本文 markdown',
  isNew: true,
  isImportant: false,
  notifiedAt: BASE_DATE_ISO,
  sortOrder: 1,
});

export const makeAnnouncement = makeBase<AnnouncementResponse>({
  id: 1,
  title: 'お知らせタイトル',
  bodyMarkdown: '本文 markdown',
  isNew: true,
  isImportant: false,
  notifiedAt: BASE_DATE_ISO,
  sortOrder: 1,
  roles: [],
  attachments: [],
  createdBy: 'user-1',
  updatedBy: null,
  creator: { id: 'user-1', name: 'tanaka' },
  updater: null,
  createdAt: BASE_DATE_ISO,
  updatedAt: BASE_DATE_ISO,
});

export const makeAnnouncementAttachment = makeBase<AnnouncementAttachmentResponse>({
  id: 1,
  fileName: 'attachment.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdById: null,
  createdAt: BASE_DATE_ISO,
});
