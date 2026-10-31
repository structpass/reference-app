import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { ReadStream } from 'node:fs';
import { ok, okMessage } from '../../common/dto';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { AnnouncementsRepository } from './repositories/announcements.repository';
import { AnnouncementStorageService } from './storage/announcement-storage.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { ReorderAnnouncementsDto } from './dto/reorder-announcements.dto';
import {
  AnnouncementAttachmentConfigDto,
  AnnouncementResponseDto,
  AnnouncementListItemDto,
} from './dto/announcement-response.dto';
import {
  toAnnouncementResponse,
  toAnnouncementListItem,
  toAnnouncementAttachmentResponse,
  AnnouncementWithRelationsPayload,
} from './announcements.mapper';

const ABSOLUTE_MAX_SIZE_MB = 500;
const DEFAULT_MAX_SIZE_MB = 20;
const DEFAULT_MAX_FILES = 4;
const DEFAULT_ALLOWED_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'xlsx',
  'docx',
  'pptx',
  'zip',
  'csv',
  'txt',
  'md',
];
const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'sh',
  'ps1',
  'js',
  'jse',
  'vbs',
  'vbe',
  'msi',
  'scr',
  'dll',
]);

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly repo: AnnouncementsRepository,
    private readonly storage: AnnouncementStorageService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  // 掲示一覧は全件返却（pagination 不要）の design choice。
  // 表示件数上限はデータ運用側で抑制し、API 側は okPaginated を使わず ok() で配列を返す。
  async findMine(userId: string) {
    const groupIds = await this.repo.findUserGroupIds(userId);
    const entities = await this.repo.findManyVisibleToGroups(groupIds);
    const items = entities.map(toAnnouncementListItem);
    return ok<AnnouncementListItemDto[]>(items);
  }

  // findMine と同じ design choice（全件返却・pagination 非適用）。管理画面用 admin scope 版。
  async findAllForManage() {
    const entities = await this.repo.findManyAll();
    const items = entities.map(toAnnouncementListItem);
    return ok<AnnouncementListItemDto[]>(items);
  }

  async findOne(id: number, userId: string) {
    // 所属グループは存在確認より先に引く。不在と非可視でクエリ数が変わると、応答本文が同じでも
    // 応答時間の差から「存在するが自分には見えない」を推測できてしまう（v2-412）。
    const userGroupIds = await this.repo.findUserGroupIds(userId);
    const entity = await this.repo.findByIdWithRelations(id);
    if (!entity) {
      throw new NotFoundException('Announcement not found');
    }
    this.assertVisibleToUser(entity, userGroupIds);
    return ok<AnnouncementResponseDto>(toAnnouncementResponse(entity));
  }

  async findOneForManage(id: number) {
    const entity = await this.repo.findByIdWithRelations(id);
    if (!entity) {
      throw new NotFoundException('Announcement not found');
    }
    return ok<AnnouncementResponseDto>(toAnnouncementResponse(entity));
  }

  async create(dto: CreateAnnouncementDto, userId: string) {
    await this.assertRoleGroupsExist(dto.roleGroupIds);

    const minSort = await this.repo.findMinSortOrder();
    const newSortOrder = (minSort ?? 0) - 1;

    const entity = await this.repo.create(
      {
        title: dto.title,
        bodyMarkdown: dto.bodyMarkdown,
        isNew: dto.isNew ?? false,
        isImportant: dto.isImportant ?? false,
        notifiedAt: dto.notifiedAt ? new Date(dto.notifiedAt) : new Date(),
        sortOrder: newSortOrder,
        createdById: userId,
      },
      dto.roleGroupIds,
    );
    return ok<AnnouncementResponseDto>(toAnnouncementResponse(entity));
  }

  async update(id: number, dto: UpdateAnnouncementDto, userId: string) {
    if (!(await this.repo.existsById(id))) {
      throw new NotFoundException('Announcement not found');
    }
    await this.assertRoleGroupsExist(dto.roleGroupIds);
    const entity = await this.repo.update(
      id,
      {
        title: dto.title,
        bodyMarkdown: dto.bodyMarkdown,
        isNew: dto.isNew,
        isImportant: dto.isImportant,
        notifiedAt: dto.notifiedAt ? new Date(dto.notifiedAt) : undefined,
        updatedById: userId,
      },
      dto.roleGroupIds,
    );
    return ok<AnnouncementResponseDto>(toAnnouncementResponse(entity));
  }

  async reorder(dto: ReorderAnnouncementsDto) {
    const ids = dto.items.map((i) => i.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      throw new BadRequestException('Duplicate announcement IDs in reorder payload');
    }
    await this.repo.reorder(dto.items);
    return okMessage('Announcements reordered');
  }

  async remove(id: number) {
    const existing = await this.repo.findByIdWithRelations(id);
    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }
    const storagePaths = existing.attachments.map((a) => a.storagePath);
    await this.repo.delete(id);
    await this.storage.removeMany(storagePaths);
    return okMessage('Announcement deleted successfully');
  }

  async getAttachmentConfig(): Promise<AnnouncementAttachmentConfigDto> {
    const maxSize = await this.systemSettings.getValue(
      'announcement.attachment.maxSizeMB',
      String(DEFAULT_MAX_SIZE_MB),
    );
    const maxFiles = await this.systemSettings.getValue(
      'announcement.attachment.maxFiles',
      String(DEFAULT_MAX_FILES),
    );
    const allowedStr = await this.systemSettings.getValue(
      'announcement.attachment.allowedExtensions',
      DEFAULT_ALLOWED_EXTENSIONS.join(','),
    );
    const maxSizeMB = this.clamp(Number(maxSize) || DEFAULT_MAX_SIZE_MB, 1, ABSOLUTE_MAX_SIZE_MB);
    const maxFilesNum = this.clamp(Number(maxFiles) || DEFAULT_MAX_FILES, 1, 20);
    const allowedExtensions = allowedStr
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^\./, ''))
      .filter((s) => s.length > 0 && !BLOCKED_EXTENSIONS.has(s));
    return { maxSizeMB, maxFiles: maxFilesNum, allowedExtensions };
  }

  async addAttachment(announcementId: number, file: Express.Multer.File, userId: string) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!(await this.repo.existsById(announcementId))) {
      throw new NotFoundException('Announcement not found');
    }

    const config = await this.getAttachmentConfig();
    const currentCount = await this.repo.countAttachmentsOf(announcementId);
    if (currentCount >= config.maxFiles) {
      throw new BadRequestException(`Attachment count exceeds max (${config.maxFiles})`);
    }

    const ext = this.extensionOf(file.originalname);
    if (!ext) {
      // 拡張子なし / 末尾ドット は BLOCKED_EXTENSIONS を bypass するため一律拒否
      throw new BadRequestException('File must have an extension');
    }
    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`File type .${ext} is not allowed`);
    }
    const blockedInside = this.findBlockedSegment(file.originalname);
    if (blockedInside) {
      throw new BadRequestException(`File name contains a blocked extension (.${blockedInside})`);
    }
    if (config.allowedExtensions.length > 0 && !config.allowedExtensions.includes(ext)) {
      throw new BadRequestException(`File extension .${ext} is not permitted`);
    }

    const maxBytes = config.maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(`File size exceeds max (${config.maxSizeMB} MB)`);
    }

    const { storagePath } = await this.storage.save(announcementId, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });

    const sortOrder = currentCount;
    const created = await this.repo.createAttachment({
      announcementId,
      fileName: file.originalname,
      storagePath,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      sortOrder,
      createdById: userId,
    });
    return ok(toAnnouncementAttachmentResponse(created));
  }

  async downloadAttachment(
    announcementId: number,
    attachmentId: number,
    userId: string,
    isAdmin: boolean,
  ): Promise<{ stream: ReadStream; fileName: string; mimeType: string; sizeBytes: number }> {
    // 非管理者は親の掲示（存在と可視性）を先に確定する。順序を添付へ委ねると、可視でない掲示の
    // 添付だけ「Attachment not found」、存在しない掲示は「Announcement not found」となり、
    // 応答の差から宛先グループの構成が推測できてしまう（v2-412）。所属グループは existence 判定より
    // 先に引く（不在と非可視でクエリ数を揃え、応答時間の差も残さない）。
    if (!isAdmin) {
      const userGroupIds = await this.repo.findUserGroupIds(userId);
      const announcement = await this.repo.findByIdWithRelations(announcementId);
      if (!announcement) {
        throw new NotFoundException('Announcement not found');
      }
      this.assertVisibleToUser(announcement, userGroupIds);
    }
    const attachment = await this.repo.findAttachmentById(attachmentId);
    if (!attachment || attachment.announcementId !== announcementId) {
      throw new NotFoundException('Attachment not found');
    }
    const stream = this.storage.createReadStream(attachment.storagePath);
    return {
      stream,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };
  }

  async removeAttachment(announcementId: number, attachmentId: number) {
    const attachment = await this.repo.findAttachmentById(attachmentId);
    if (!attachment || attachment.announcementId !== announcementId) {
      throw new NotFoundException('Attachment not found');
    }
    await this.repo.deleteAttachment(attachmentId);
    await this.storage.remove(attachment.storagePath);
    return okMessage('Attachment deleted');
  }

  /**
   * 宛先グループ id が実在することを、書き込む前に確かめる（v2-429）。
   *
   * 存在しない id をそのまま渡すと announcement_roles の外部キー違反（P2003）になり、
   * 例外フィルタの写像を通らず 500 INTERNAL_ERROR として現れる。宛先は公開範囲そのもので、
   * 指定ミスは操作者が原因を特定できる必要があるため、400 VALIDATION_ERROR と不足 id を返す
   * （本文が参照するマスタが無い入力の扱いは CSV 取込の行検証と同じ形＝imports.controller.ts）。
   * int4 の範囲外の値は repository がクエリへ渡さず「実在しない」として返すため、ここでも
   * 不足 id として 400 に載る（クエリ自体が変換エラーで落ちるのを避ける）。
   * 空配列は「宛先なし＝全員可視」の現在の仕様なのでそのまま通し、クエリも発行しない。
   */
  private async assertRoleGroupsExist(roleGroupIds: number[] | undefined): Promise<void> {
    if (!roleGroupIds || roleGroupIds.length === 0) return;
    const existing = new Set(await this.repo.findExistingGroupIds(roleGroupIds));
    const missing = roleGroupIds.filter((groupId) => !existing.has(groupId));
    if (missing.length === 0) return;
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: `Unknown role group ids: ${missing.join(', ')}`,
      details: { missingRoleGroupIds: missing },
    });
  }

  /**
   * 可視でない掲示を、存在しない掲示と同じ応答（404 Announcement not found）へ落とす（v2-412）。
   *
   * 403 と 404 を撃ち分けると「その id の掲示は存在するが自分には見えない」ことが分かり、
   * 宛先グループの構成を外から推測できてしまう。不在と非可視を区別しない扱いは ADR 0018 と
   * 同じ方針（`GET /object-types/:key/records/:id` も別台帳・不在を同じ 404 へ落とす）。
   * 呼び出し元は所属グループを先に引いて渡す（クエリ数も揃える）。
   */
  private assertVisibleToUser(
    entity: AnnouncementWithRelationsPayload,
    userGroupIds: number[],
  ): void {
    if (entity.roles.length === 0) return;
    const announcementGroupIds = entity.roles.map((r) => r.group.id);
    const hasOverlap = announcementGroupIds.some((gid) => userGroupIds.includes(gid));
    if (!hasOverlap) {
      throw new NotFoundException('Announcement not found');
    }
  }

  private extensionOf(fileName: string): string {
    const idx = fileName.lastIndexOf('.');
    if (idx < 0 || idx === fileName.length - 1) return '';
    return fileName.slice(idx + 1).toLowerCase();
  }

  // 二重拡張子対策: "malware.js.pdf" のような中間拡張子に blocked が混ざっていないかチェック
  private findBlockedSegment(fileName: string): string | null {
    const segments = fileName.toLowerCase().split('.');
    // 最後のセグメントは「名前部分 + 最終拡張子」なので除外して中間だけチェック
    for (let i = 1; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (BLOCKED_EXTENSIONS.has(seg)) return seg;
    }
    return null;
  }

  private clamp(n: number, min: number, max: number): number {
    return Math.min(Math.max(n, min), max);
  }
}
