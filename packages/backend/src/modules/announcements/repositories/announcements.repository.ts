import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  AnnouncementWithRelationsPayload,
  AnnouncementAttachmentPayload,
  AnnouncementListItemPayload,
} from '../announcements.mapper';

const RELATION_INCLUDE = {
  roles: {
    include: {
      group: { select: { id: true, code: true, name: true } },
    },
  },
  attachments: true,
  creator: { select: { id: true, name: true } },
  updater: { select: { id: true, name: true } },
} satisfies Prisma.AnnouncementInclude;

const LIST_SELECT = {
  id: true,
  title: true,
  bodyMarkdown: true,
  isNew: true,
  isImportant: true,
  notifiedAt: true,
  sortOrder: true,
} satisfies Prisma.AnnouncementSelect;

const LIST_ORDER_BY: Prisma.AnnouncementOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { notifiedAt: 'desc' },
  { id: 'desc' },
];

/**
 * PostgreSQL の `groups.id` / `announcement_roles.group_id` は int4。
 * 範囲外の値をそのまま `id: { in: [...] }` へ渡すと、存在確認のクエリ自体が Prisma の
 * 変換エラー（ConversionError）で落ちて 500 になる（実測: 2147483648 / 1e21）。
 * 引く前に落とし、落とした値は呼び出し側で「実在しない」として扱わせる。
 */
const GROUP_ID_MIN = -2147483648;
const GROUP_ID_MAX = 2147483647;

@Injectable()
export class AnnouncementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyVisibleToGroups(groupIds: number[]): Promise<AnnouncementListItemPayload[]> {
    const where: Prisma.AnnouncementWhereInput =
      groupIds.length === 0
        ? { roles: { none: {} } }
        : {
            OR: [{ roles: { none: {} } }, { roles: { some: { groupId: { in: groupIds } } } }],
          };
    return this.prisma.announcement.findMany({
      where,
      select: LIST_SELECT,
      orderBy: LIST_ORDER_BY,
    });
  }

  findManyAll(): Promise<AnnouncementListItemPayload[]> {
    return this.prisma.announcement.findMany({
      select: LIST_SELECT,
      orderBy: LIST_ORDER_BY,
    });
  }

  findByIdWithRelations(id: number): Promise<AnnouncementWithRelationsPayload | null> {
    return this.prisma.announcement.findUnique({
      where: { id },
      include: RELATION_INCLUDE,
    });
  }

  async findMinSortOrder(): Promise<number | null> {
    const result = await this.prisma.announcement.aggregate({
      _min: { sortOrder: true },
    });
    return result._min.sortOrder ?? null;
  }

  create(
    data: {
      title: string;
      bodyMarkdown: string;
      isNew: boolean;
      isImportant: boolean;
      notifiedAt: Date;
      sortOrder: number;
      createdById: string;
    },
    roleGroupIds: number[],
  ): Promise<AnnouncementWithRelationsPayload> {
    return this.prisma.announcement.create({
      data: {
        ...data,
        roles: {
          create: roleGroupIds.map((groupId) => ({ groupId })),
        },
      },
      include: RELATION_INCLUDE,
    });
  }

  async update(
    id: number,
    data: {
      title?: string;
      bodyMarkdown?: string;
      isNew?: boolean;
      isImportant?: boolean;
      notifiedAt?: Date;
      updatedById: string;
    },
    roleGroupIds?: number[],
  ): Promise<AnnouncementWithRelationsPayload> {
    if (!roleGroupIds) {
      return this.prisma.announcement.update({
        where: { id },
        data,
        include: RELATION_INCLUDE,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.announcementRole.deleteMany({ where: { announcementId: id } });
      return tx.announcement.update({
        where: { id },
        data: {
          ...data,
          roles:
            roleGroupIds.length > 0
              ? { create: roleGroupIds.map((groupId) => ({ groupId })) }
              : undefined,
        },
        include: RELATION_INCLUDE,
      });
    });
  }

  async reorder(items: { id: number; sortOrder: number }[]): Promise<void> {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.announcement.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  async delete(id: number): Promise<void> {
    await this.prisma.announcement.delete({ where: { id } });
  }

  existsById(id: number): Promise<boolean> {
    return this.prisma.announcement
      .findUnique({ where: { id }, select: { id: true } })
      .then((r) => r !== null);
  }

  findAttachmentById(attachmentId: number): Promise<AnnouncementAttachmentPayload | null> {
    return this.prisma.announcementAttachment.findUnique({ where: { id: attachmentId } });
  }

  countAttachmentsOf(announcementId: number): Promise<number> {
    return this.prisma.announcementAttachment.count({ where: { announcementId } });
  }

  createAttachment(data: {
    announcementId: number;
    fileName: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    sortOrder: number;
    createdById: string | null;
  }): Promise<AnnouncementAttachmentPayload> {
    return this.prisma.announcementAttachment.create({ data });
  }

  async deleteAttachment(attachmentId: number): Promise<void> {
    await this.prisma.announcementAttachment.delete({ where: { id: attachmentId } });
  }

  /**
   * 宛先グループ id のうち実在するものを返す（v2-429）。
   *
   * 掲示の宛先は公開範囲そのものなので、存在しない id をそのまま書くと
   * announcement_roles の外部キー違反（P2003）になり、書き込み前に呼び出し側が
   * 400 として拒否できるようにする。int4 の範囲外の値はクエリへ渡さず、
   * 「実在しない」として返す（渡すとクエリ自体が変換エラーで落ちる）。
   */
  async findExistingGroupIds(groupIds: number[]): Promise<number[]> {
    const queryable = groupIds.filter(
      (groupId) => Number.isInteger(groupId) && groupId >= GROUP_ID_MIN && groupId <= GROUP_ID_MAX,
    );
    if (queryable.length === 0) return [];
    const rows = await this.prisma.group.findMany({
      where: { id: { in: queryable } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async findUserGroupIds(userId: string): Promise<number[]> {
    const rows = await this.prisma.userGroup.findMany({
      where: { userId },
      select: { groupId: true },
    });
    return rows.map((r) => r.groupId);
  }

  async findAttachmentsOf(announcementId: number): Promise<AnnouncementAttachmentPayload[]> {
    return this.prisma.announcementAttachment.findMany({ where: { announcementId } });
  }
}
