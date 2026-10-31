import { Prisma } from '@prisma/client';
import {
  AnnouncementResponseDto,
  AnnouncementListItemDto,
  AnnouncementAttachmentResponseDto,
} from './dto/announcement-response.dto';

export type AnnouncementWithRelationsPayload = Prisma.AnnouncementGetPayload<{
  include: {
    roles: {
      include: {
        group: { select: { id: true; code: true; name: true } };
      };
    };
    attachments: true;
    creator: { select: { id: true; name: true } };
    updater: { select: { id: true; name: true } };
  };
}>;

export type AnnouncementAttachmentPayload = Prisma.AnnouncementAttachmentGetPayload<
  Record<string, never>
>;

export type AnnouncementListItemPayload = Prisma.AnnouncementGetPayload<{
  select: {
    id: true;
    title: true;
    bodyMarkdown: true;
    isNew: true;
    isImportant: true;
    notifiedAt: true;
    sortOrder: true;
  };
}>;

export function toAnnouncementListItem(
  entity: AnnouncementListItemPayload,
): AnnouncementListItemDto {
  return {
    id: entity.id,
    title: entity.title,
    bodyMarkdown: entity.bodyMarkdown,
    isNew: entity.isNew,
    isImportant: entity.isImportant,
    notifiedAt: entity.notifiedAt,
    sortOrder: entity.sortOrder,
  };
}

export function toAnnouncementAttachmentResponse(
  entity: AnnouncementAttachmentPayload,
): AnnouncementAttachmentResponseDto {
  return {
    id: entity.id,
    fileName: entity.fileName,
    mimeType: entity.mimeType,
    sizeBytes: entity.sizeBytes,
    createdById: entity.createdById,
    createdAt: entity.createdAt,
  };
}

export function toAnnouncementResponse(
  entity: AnnouncementWithRelationsPayload,
): AnnouncementResponseDto {
  return {
    id: entity.id,
    title: entity.title,
    bodyMarkdown: entity.bodyMarkdown,
    isNew: entity.isNew,
    isImportant: entity.isImportant,
    notifiedAt: entity.notifiedAt,
    sortOrder: entity.sortOrder,
    roles: entity.roles.map((r) => ({
      groupId: r.group.id,
      groupCode: r.group.code,
      groupName: r.group.name,
    })),
    attachments: entity.attachments
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map(toAnnouncementAttachmentResponse),
    createdBy: entity.createdById,
    updatedBy: entity.updatedById,
    creator: entity.creator ? { id: entity.creator.id, name: entity.creator.name } : undefined,
    updater: entity.updater ? { id: entity.updater.id, name: entity.updater.name } : null,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
