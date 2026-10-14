import { IsString, IsNotEmpty, IsBoolean, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';

export class SetRolePermissionDto {
  @ApiProperty({ enum: UserRole, description: 'ロール' })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ description: '機能ID', example: 'A-1' })
  @IsString()
  @IsNotEmpty()
  featureId: string;

  @ApiProperty({ description: '参照可否' })
  @IsBoolean()
  canView: boolean;

  @ApiProperty({ description: '登録可否' })
  @IsBoolean()
  canCreate: boolean;

  @ApiProperty({ description: '修正可否' })
  @IsBoolean()
  canUpdate: boolean;

  @ApiProperty({ description: '削除可否' })
  @IsBoolean()
  canDelete: boolean;
}

export class BulkSetRolePermissionsDto {
  @ApiProperty({ type: [SetRolePermissionDto], description: '権限一括設定' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetRolePermissionDto)
  permissions: SetRolePermissionDto[];
}
