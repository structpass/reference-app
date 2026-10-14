import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TABLE_IDS } from '@struct-pass/shared';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireRole, CurrentUser } from '../../common/decorators';
import { ListPaginationSettingsService } from './list-pagination-settings.service';
import { UpdateTablePaginationSettingDto } from './dto/update-table-pagination-setting.dto';
import { BulkUpdateTablePaginationSettingsDto } from './dto/bulk-update-table-pagination-settings.dto';

const TABLE_ID_SET: ReadonlySet<string> = new Set(TABLE_IDS);

/**
 * 一覧ごとのページサイズ設定 API。
 * GET = 全認証ユーザー（dashboard 配下の Provider が起動時に取得）。
 * PUT = SYS_ADMIN のみ（system-settings と同じ admin scope）。
 */
@ApiTags('list-pagination-settings')
@Controller('list-pagination-settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ListPaginationSettingsController {
  constructor(private readonly service: ListPaginationSettingsService) {}

  @Get()
  @ApiOperation({ summary: '一覧ごとのページサイズ設定 全件取得' })
  async findAll() {
    return this.service.findAll();
  }

  @Get(':tableId')
  @ApiOperation({ summary: '一覧ごとのページサイズ設定 単件取得' })
  @ApiParam({ name: 'tableId', description: 'テーブル ID（TABLE_IDS のいずれか）' })
  async findByTableId(@Param('tableId') tableId: string) {
    if (!TABLE_ID_SET.has(tableId)) {
      throw new BadRequestException('Invalid tableId');
    }
    return this.service.findByTableId(tableId);
  }

  @Put(':tableId')
  @RequireRole(UserRole.SYS_ADMIN)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '一覧ごとのページサイズ設定 単件更新' })
  @ApiParam({ name: 'tableId', description: 'テーブル ID（TABLE_IDS のいずれか）' })
  async update(
    @Param('tableId') tableId: string,
    @Body() dto: UpdateTablePaginationSettingDto,
    @CurrentUser('id') userId: string,
  ) {
    if (!TABLE_ID_SET.has(tableId)) {
      throw new BadRequestException('Invalid tableId');
    }
    return this.service.update(tableId, dto, userId);
  }

  @Put()
  @RequireRole(UserRole.SYS_ADMIN)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '一覧ごとのページサイズ設定 一括更新' })
  async bulkUpdate(
    @Body() dto: BulkUpdateTablePaginationSettingsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.bulkUpdate(dto.updates, userId);
  }
}
