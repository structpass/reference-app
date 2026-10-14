import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
  StreamableFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireRole } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ok } from '../../common/dto';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { ReorderAnnouncementsDto } from './dto/reorder-announcements.dto';

// お知らせの書き込み権限は SYS_ADMIN のみ。
// 業務発信は Rete のチャット機能で代替する方針（2026-05-11 確定）。
// WH_ADMIN / OF_ADMIN は閲覧のみ可能。
const ADMIN_ROLES = [UserRole.SYS_ADMIN] as const;
// 1 ファイルの絶対上限 (systemSetting 最大値)。multer 側で hard limit を掛け、Service 層で動的な上限と二重チェック。
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
// MIME allowlist。Service 層の拡張子 allowlist と二重チェック（multer 側で早期拒否、ヘッダ偽装に対する第一線）
const ALLOWED_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

// ダウンロード応答で許可する MIME。許可外は application/octet-stream に正規化。
const DOWNLOAD_ALLOWED_MIME_TYPES = new Set<string>([
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

function sanitizeDownloadMimeType(mime: string | null | undefined): string {
  if (!mime) return 'application/octet-stream';
  const lower = mime.toLowerCase().split(';')[0].trim();
  return DOWNLOAD_ALLOWED_MIME_TYPES.has(lower) ? lower : 'application/octet-stream';
}

@ApiTags('announcements')
@Controller('announcements')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get('config')
  @ApiOperation({ summary: '掲示板の添付ファイル設定を取得' })
  async getConfig() {
    return ok(await this.service.getAttachmentConfig());
  }

  @Get()
  @ApiOperation({ summary: '自ユーザーのロールに公開されている掲示一覧' })
  async findMine(@CurrentUser('id') userId: string) {
    return this.service.findMine(userId);
  }

  @Get('manage')
  @ApiOperation({ summary: '全掲示一覧（管理）' })
  @RequireRole(...ADMIN_ROLES)
  async findAllForManage() {
    return this.service.findAllForManage();
  }

  @Get('manage/:id')
  @ApiOperation({ summary: '掲示詳細（管理）' })
  @ApiParam({ name: 'id' })
  @RequireRole(...ADMIN_ROLES)
  async findOneForManage(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOneForManage(id);
  }

  @Get(':id')
  @ApiOperation({ summary: '掲示詳細（閲覧）' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.service.findOne(id, userId);
  }

  @Post()
  @ApiOperation({ summary: '掲示を新規作成' })
  @RequireRole(...ADMIN_ROLES)
  async create(@Body() dto: CreateAnnouncementDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Patch('reorder')
  @ApiOperation({ summary: '掲示一覧の並び順を更新' })
  @RequireRole(...ADMIN_ROLES)
  async reorder(@Body() dto: ReorderAnnouncementsDto) {
    return this.service.reorder(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '掲示を更新' })
  @ApiParam({ name: 'id' })
  @RequireRole(...ADMIN_ROLES)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '掲示を削除' })
  @ApiParam({ name: 'id' })
  @RequireRole(...ADMIN_ROLES)
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/attachments')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: '添付ファイルを追加' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiParam({ name: 'id' })
  @RequireRole(...ADMIN_ROLES)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
          cb(null, true);
          return;
        }
        cb(new BadRequestException(`File type not allowed: ${file.mimetype}`), false);
      },
    }),
  )
  async addAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.addAttachment(id, file, userId);
  }

  @Get(':id/attachments/:attId/download')
  // global 30 req/60s より絞ってダウンロード帯域を保護（添付の連続取得抑制）。
  // upload (limit:10) より緩く、global より厳しい中間値。
  @Throttle({ default: { ttl: 60000, limit: 15 } })
  @ApiOperation({ summary: '添付ファイルをダウンロード' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'attId' })
  async downloadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attId', ParseIntPipe) attId: number,
    @CurrentUser() user: { id: string; role: UserRole },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const isAdmin = ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number]);
    const result = await this.service.downloadAttachment(id, attId, user.id, isAdmin);
    const encoded = encodeURIComponent(result.fileName).replace(
      /['()*]/g,
      (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
    );
    res.setHeader('Content-Type', sanitizeDownloadMimeType(result.mimeType));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="download"; filename*=UTF-8''${encoded}`,
    );
    res.setHeader('Content-Length', String(result.sizeBytes));
    return new StreamableFile(result.stream);
  }

  @Delete(':id/attachments/:attId')
  @ApiOperation({ summary: '添付ファイルを削除' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'attId' })
  @RequireRole(...ADMIN_ROLES)
  async removeAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attId', ParseIntPipe) attId: number,
  ) {
    return this.service.removeAttachment(id, attId);
  }
}
