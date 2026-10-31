import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TABLE_IDS } from '@struct-pass/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, SkipAudit } from '../../common/decorators';
import { UserTableColumnWidthsService } from './user-table-column-widths.service';
import { UpsertColumnWidthDto } from './dto';

const TABLE_ID_SET: ReadonlySet<string> = new Set(TABLE_IDS);
// columnKey に許す文字: 英数字 / `-` / `_` / `.` / `:` のみ。
// 制御文字 / 空白 / Unicode を排除する目的。
const COLUMN_KEY_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
// プロトタイプ汚染防止: フロントエンドの store がレスポンスを `widths[columnKey]` として直接展開するため、
// 予約名は DB 入口で弾く。
const RESERVED_COLUMN_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * 個人設定（列幅）の高頻度アクションは audit_logs に記録しない。
 * 業務監査対象外として AuditInterceptor からスキップ。
 */
@SkipAudit()
@ApiTags('user-table-column-widths')
@Controller('user-table-column-widths')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserTableColumnWidthsController {
  constructor(private readonly service: UserTableColumnWidthsService) {}

  @Get(':tableId')
  @ApiOperation({ summary: '指定テーブルの列幅一覧取得' })
  @ApiParam({ name: 'tableId', description: 'テーブル ID（TABLE_IDS のいずれか）' })
  async getMine(@CurrentUser('id') userId: string, @Param('tableId') tableId: string) {
    if (!TABLE_ID_SET.has(tableId)) {
      throw new BadRequestException('Invalid tableId');
    }
    return this.service.getMine(userId, tableId);
  }

  /**
   * drag end + 300ms debounce 前提のため、ユーザー単位で 60 req/60s に制限する。
   * 通常操作（10 列を順次リサイズ）では 10 req 程度。攻撃シナリオ（debounce バイパス）を抑制する。
   */
  @Put(':tableId/:columnKey')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: '列幅を upsert（追加 or 更新）' })
  @ApiParam({ name: 'tableId', description: 'テーブル ID（TABLE_IDS のいずれか）' })
  @ApiParam({ name: 'columnKey', description: '列キー（英数字 / -_.:、1-64 文字）' })
  async upsert(
    @CurrentUser('id') userId: string,
    @Param('tableId') tableId: string,
    @Param('columnKey') columnKey: string,
    @Body() dto: UpsertColumnWidthDto,
  ) {
    if (!TABLE_ID_SET.has(tableId)) {
      throw new BadRequestException('Invalid tableId');
    }
    if (!COLUMN_KEY_RE.test(columnKey) || RESERVED_COLUMN_KEYS.has(columnKey)) {
      throw new BadRequestException('Invalid columnKey');
    }
    return this.service.upsert(userId, tableId, columnKey, dto.width);
  }
}
