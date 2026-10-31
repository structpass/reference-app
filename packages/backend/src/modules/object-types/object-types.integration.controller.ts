import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { ServiceTokenGuard } from '../../common/guards';
import { Public } from '../../common/decorators';
import { ObjectTypesService } from './object-types.service';

/**
 * 機械呼び出し専用の ObjectType 一覧受口（ref-0095・hom-0067 の消費先）。
 *
 * rete backend が共有 credential（`INTEGRATION_SERVICE_TOKEN`）で server-to-server 呼び出しする。
 * 既存の利用者向け `GET /api/v1/object-types`（JWT + SYS_ADMIN view 権限）とは別系統に置き、
 * 応答 shape は既存 `findAll()`（`{ success, data: ObjectTypeResponseDto[] }`）をそのまま再利用する
 * （ref-0076 受入基準【5】＝既存一覧の応答不変を維持）。
 *
 * - `@Public()` で global JwtAuthGuard を外し（ユーザー認証と混在させない）、
 *   ServiceTokenGuard で機械認証のみを適用する（PermissionGuard / RequireRoleGuard も
 *   `@Public()` で短絡＝ユーザー権限判断を混ぜない）。
 */
@ApiTags('integration')
@Public()
@UseGuards(ServiceTokenGuard)
@Controller('integration/object-types')
export class ObjectTypesIntegrationController {
  constructor(private readonly objectTypesService: ObjectTypesService) {}

  @Get()
  @ApiOperation({ summary: '種別定義一覧取得（機械認証・サービス間連携用）' })
  @ApiHeader({ name: 'x-service-token', description: '共有 credential（secret 扱い）' })
  async findAll() {
    return this.objectTypesService.findAll();
  }
}
