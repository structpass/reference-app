export interface AnnouncementRoleRefDto {
  groupId: number;
  groupCode: string;
  groupName: string;
}

export interface AnnouncementAttachmentResponseDto {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** 添付登録者 (SYS_ADMIN 縮退後の監査トレース用)。レガシーレコードは null */
  createdById: string | null;
  createdAt: Date;
}

export interface AnnouncementListItemDto {
  id: number;
  title: string;
  bodyMarkdown: string;
  isNew: boolean;
  isImportant: boolean;
  notifiedAt: Date;
  sortOrder: number;
}

export interface AnnouncementResponseDto extends AnnouncementListItemDto {
  roles: AnnouncementRoleRefDto[];
  attachments: AnnouncementAttachmentResponseDto[];
  createdBy: string;
  updatedBy: string | null;
  creator?: { id: string; name: string };
  updater?: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnouncementAttachmentConfigDto {
  maxSizeMB: number;
  maxFiles: number;
  allowedExtensions: string[];
}
