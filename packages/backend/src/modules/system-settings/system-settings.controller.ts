import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireRole } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemSettingsService } from './system-settings.service';
import { UpdateSystemSettingDto, BulkUpdateSystemSettingsDto } from './dto';

@ApiTags('system-settings')
@Controller('system-settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get('public/config')
  @ApiOperation({ summary: 'フロントエンド用公開設定取得（認証済みユーザー）' })
  async getPublicConfig() {
    return this.service.getPublicConfig();
  }

  @Get()
  @RequireRole(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'システム設定一覧取得' })
  async findAll() {
    return this.service.findAll();
  }

  @Get(':key')
  @RequireRole(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'システム設定取得（キー指定）' })
  @ApiParam({ name: 'key', description: '設定キー（例: system.app_name）' })
  async findByKey(@Param('key') key: string) {
    return this.service.findByKey(key);
  }

  @Put(':key')
  @RequireRole(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'システム設定更新（キー指定）' })
  @ApiParam({ name: 'key', description: '設定キー（例: system.app_name）' })
  async updateByKey(
    @Param('key') key: string,
    @Body() dto: UpdateSystemSettingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateByKey(key, dto, userId);
  }

  @Put()
  @RequireRole(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'システム設定一括更新' })
  async bulkUpdate(@Body() dto: BulkUpdateSystemSettingsDto, @CurrentUser('id') userId: string) {
    return this.service.bulkUpdate(dto.updates, userId);
  }
}
