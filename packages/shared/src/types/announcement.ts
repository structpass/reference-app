export interface AnnouncementRoleRef {
  groupId: number;
  groupCode: string;
  groupName: string;
}

export interface AnnouncementAttachmentResponse {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** 添付登録者 (SYS_ADMIN 縮退後の監査トレース用)。レガシーレコードは null */
  createdById: string | null;
  createdAt: string;
}

export interface AnnouncementListItem {
  id: number;
  title: string;
  bodyMarkdown: string;
  isNew: boolean;
  isImportant: boolean;
  notifiedAt: string;
  sortOrder: number;
}

export interface AnnouncementResponse extends AnnouncementListItem {
  roles: AnnouncementRoleRef[];
  attachments: AnnouncementAttachmentResponse[];
  createdBy: string;
  updatedBy: string | null;
  creator?: { id: string; name: string };
  updater?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementAttachmentConfig {
  maxSizeMB: number;
  maxFiles: number;
  allowedExtensions: string[];
}
