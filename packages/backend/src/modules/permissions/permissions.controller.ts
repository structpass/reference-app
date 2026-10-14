import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireRole } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionsService } from './permissions.service';
import { BulkSetRolePermissionsDto } from './dto';

// permission matrix そのものを操作する controller。bootstrap 問題を避けるため、
// `@RequirePermission` ではなく `@RequireRole(SYS_ADMIN)` で固定。
// matrix を誤って空にしても SYS_ADMIN は復旧操作を実行できる。

@ApiTags('permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // ============================================================
  // ロール別権限API（新）
  // ============================================================

  @Get('roles')
  @RequireRole(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'ロール別権限マトリクス取得' })
  async getAllRolePermissions() {
    return this.permissionsService.getAllRolePermissions();
  }

  @Put('roles')
  @RequireRole(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'ロール別権限一括保存' })
  async bulkSetRolePermissions(@Body() dto: BulkSetRolePermissionsDto) {
    return this.permissionsService.bulkSetRolePermissions(dto);
  }

  // ============================================================
  // 自分の有効権限（全認証ユーザー）
  // ============================================================

  @Get('my-permissions')
  @ApiOperation({ summary: '自分の有効権限取得（メニュー表示制御用）' })
  async getMyPermissions(@CurrentUser('id') userId: string) {
    return this.permissionsService.getMyPermissions(userId);
  }
}
